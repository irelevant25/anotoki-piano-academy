<?php

declare(strict_types=1);

/**
 * The migration engine, with no opinion on who is driving.
 *
 * Reads migrations/{alias}/, applies the files a database has not seen, and
 * records each in its `migrations` table. It prints nothing and reads no
 * request, so the CLI (migration.php), setup.php and the tests build a
 * database the same way - which is the point of there being one description
 * of the schema. The same engine as the IAM's and the genshin site's, so a
 * migration reads the same in every anotoki repository.
 *
 * Nothing here un-applies anything: a rollback that half works is worse than
 * none.
 */

/** The one database this app has, as its migrations folder is named. */
const MIGRATIONS_ALIAS = 'piano_academy';

function migrationsRoot(): string
{
    return dirname(__DIR__) . '/migrations';
}

/**
 * Splits a SQL file into statements. A semicolon only ends one outside a
 * quoted string, a dollar-quoted block - how every function and DO block is
 * written - and a comment.
 */
function splitSqlStatements(string $sql): array
{
    $statements = [];
    $current = '';
    $length = strlen($sql);
    $i = 0;

    while ($i < $length) {
        $character = $sql[$i];

        if ($character === '/' && ($sql[$i + 1] ?? '') === '*') {
            $end = strpos($sql, '*/', $i + 2);
            $i = $end === false ? $length : $end + 2;
            continue;
        }

        if ($character === '-' && ($sql[$i + 1] ?? '') === '-') {
            $end = strpos($sql, "\n", $i + 2);
            $i = $end === false ? $length : $end + 1;
            continue;
        }

        if ($character === '$') {
            $j = $i + 1;
            while ($j < $length && $sql[$j] !== '$' && (ctype_alnum($sql[$j]) || $sql[$j] === '_')) {
                $j++;
            }

            if (($sql[$j] ?? '') === '$') {
                $tag = substr($sql, $i, $j - $i + 1);
                $end = strpos($sql, $tag, $j + 1);

                if ($end !== false) {
                    $current .= substr($sql, $i, $end - $i + strlen($tag));
                    $i = $end + strlen($tag);
                    continue;
                }
            }
        }

        if ($character === "'") {
            $current .= $character;
            $i++;

            while ($i < $length) {
                $current .= $sql[$i];

                if ($sql[$i] === "'") {
                    if (($sql[$i + 1] ?? '') === "'") {
                        $current .= $sql[++$i];
                    } else {
                        $i++;
                        break;
                    }
                }

                $i++;
            }

            continue;
        }

        if ($character === ';') {
            if (trim($current) !== '') {
                $statements[] = trim($current);
            }
            $current = '';
            $i++;
            continue;
        }

        $current .= $character;
        $i++;
    }

    if (trim($current) !== '') {
        $statements[] = trim($current);
    }

    return $statements;
}

/** The files for one database, in apply order - natural order, so 100 does not sort before 11. */
function migrationFiles(string $alias = MIGRATIONS_ALIAS): array
{
    $directory = migrationsRoot() . '/' . $alias;

    if (!is_dir($directory)) {
        return [];
    }

    $files = array_map('basename', glob($directory . '/*.sql') ?: []);
    natsort($files);

    return array_values($files);
}

/**
 * Makes the database when it is not there, and answers whether it had to.
 *
 * On most shared hosting the application's database user cannot CREATE
 * DATABASE at all; there it is made in the control panel first and this finds
 * it already there.
 */
function ensureDatabase(array $settings, string $name): bool
{
    if (!preg_match('/^[A-Za-z0-9_]{1,63}$/D', $name)) {
        throw new RuntimeException("Database names here use letters, digits and _ only: $name");
    }

    if (dbExists($settings, $name)) {
        return false;
    }

    // The name is the installation's own setting, never anything a request
    // reaches, and CREATE DATABASE takes no parameters: it is checked above
    // and quoted as an identifier.
    dbServer($settings)->exec('CREATE DATABASE "' . $name . '" ENCODING \'UTF8\' TEMPLATE template0');

    return true;
}

function ensureMigrationsTable(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS migrations (
            id         SERIAL          PRIMARY KEY,
            filename   VARCHAR(255)    NOT NULL UNIQUE,
            applied_at TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
        )'
    );

    // Before it took the family's engine (2026-09-28) Piano Academy kept its own
    // record: migrations (name text PRIMARY KEY, applied_at timestamptz). The
    // rows are the same facts; only the column was named differently. Renamed
    // once, in place, so a database set up before then reads as what it is.
    if (legacyMigrationsTable($pdo)) {
        $pdo->exec('ALTER TABLE migrations RENAME COLUMN name TO filename');
    }
}

/** Does `migrations` still have the column the app's own runner called `name`? */
function legacyMigrationsTable(PDO $pdo): bool
{
    return (bool) $pdo->query(
        "SELECT count(*) FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'migrations' AND column_name = 'name'"
    )->fetchColumn();
}

function appliedMigrations(PDO $pdo): array
{
    return $pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN);
}

function pendingMigrations(PDO $pdo, string $alias = MIGRATIONS_ALIAS): array
{
    ensureMigrationsTable($pdo);

    return array_values(array_diff(migrationFiles($alias), appliedMigrations($pdo)));
}

/**
 * The same question without writing anything - for the API, which only wants
 * to know whether it may run on this database.
 */
function pendingMigrationsReadOnly(PDO $pdo, string $alias = MIGRATIONS_ALIAS): array
{
    $table = (bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn();
    if (!$table) {
        return migrationFiles($alias);
    }

    $column = legacyMigrationsTable($pdo) ? 'name' : 'filename';
    $applied = $pdo->query("SELECT $column FROM migrations")->fetchAll(PDO::FETCH_COLUMN);

    return array_values(array_diff(migrationFiles($alias), $applied));
}

/**
 * Applies one file, all of it or none of it. PostgreSQL takes DDL inside a
 * transaction, and the row saying the file ran is written in the same one.
 */
function applyMigration(PDO $pdo, string $alias, string $filename): void
{
    $statements = splitSqlStatements((string) file_get_contents(migrationsRoot() . '/' . $alias . '/' . $filename));

    $pdo->beginTransaction();

    try {
        foreach ($statements as $index => $statement) {
            try {
                $pdo->exec($statement);
            } catch (PDOException $e) {
                throw new RuntimeException(
                    'statement ' . ($index + 1) . ' of ' . count($statements) . ': ' . $e->getMessage()
                    . "\n\n  " . implode("\n  ", array_slice(explode("\n", $statement), 0, 6))
                );
            }
        }

        $pdo->prepare('INSERT INTO migrations (filename) VALUES (?) ON CONFLICT DO NOTHING')->execute([$filename]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Every pending file, stopping at the first failure - each migration is written
 * expecting the ones before it to have run.
 *
 * @return array{applied: string[], failed: ?string, error: ?string}
 */
function applyPendingMigrations(PDO $pdo, string $alias = MIGRATIONS_ALIAS): array
{
    $applied = [];

    foreach (pendingMigrations($pdo, $alias) as $filename) {
        try {
            applyMigration($pdo, $alias, $filename);
            $applied[] = $filename;
        } catch (Throwable $e) {
            return ['applied' => $applied, 'failed' => $filename, 'error' => $e->getMessage()];
        }
    }

    return ['applied' => $applied, 'failed' => null, 'error' => null];
}
