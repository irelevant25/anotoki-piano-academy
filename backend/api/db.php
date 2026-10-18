<?php

declare(strict_types=1);

/**
 * PostgreSQL through PDO: the app's own connection, opened with the first
 * query, and plain helpers around it. Values always travel as ? parameters.
 *
 * Every connection runs in UTC. The timestamp columns are timestamptz, so the
 * instant is right either way - but what comes back out as text follows the
 * session's zone.
 */

/** The app's database: its name in config/database.local.php. */
function dbName(): string
{
    return (string) databaseSettings()['name'];
}

/**
 * A connection to one database of the configured server ($name, or the app's
 * own). Separate from db() because setup.php and the tests connect with
 * settings that are not the app's (yet).
 */
function dbConnect(array $settings, ?string $name = null, bool $persistent = false): PDO
{
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;connect_timeout=5;application_name=piano-academy', $settings['host'], (int) $settings['port'], $name ?? $settings['name']);

    $pdo = new PDO($dsn, (string) $settings['user'], (string) $settings['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_PERSISTENT => $persistent,
    ]);
    // A pooled connection may still hold a transaction its last request died
    // in, or a database update's lock (api/migrations.php): ROLLBACK ends
    // the one (and is only a notice when there is none), the unlock the other.
    $pdo->exec(($persistent ? 'ROLLBACK; SELECT pg_advisory_unlock_all(); ' : '') . "SET TIME ZONE 'UTC'");

    return $pdo;
}

/**
 * The app's connection. PHP's built-in web server keeps it open from one
 * request to the next (connecting costs more than answering a key press's
 * save); under Apache every request connects anew.
 */
function db(): PDO
{
    static $pdo = null;

    return $pdo ??= dbConnect(databaseSettings(), null, PHP_SAPI === 'cli-server');
}

/** The server's maintenance database, for creating and dropping databases. */
function dbServer(array $settings): PDO
{
    return dbConnect($settings, 'postgres');
}

/** PDO sends every value as text: spell booleans the way PostgreSQL reads them. */
function dbParams(array $params): array
{
    return array_map(static fn($value) => is_bool($value) ? ($value ? 't' : 'f') : $value, $params);
}

/**
 * A statement on the app's connection - or on $pdo, a connection somebody
 * handed over: the People page's delete runs on the connection the library
 * gives it, which in a restore is the restore's own (api/people.php). Its
 * rows come back as arrays by column name, whichever connection it is.
 */
function dbQuery(string $sql, array $params = [], ?PDO $pdo = null): PDOStatement
{
    $statement = ($pdo ?? db())->prepare($sql);
    $statement->setFetchMode(PDO::FETCH_ASSOC);
    $statement->execute(dbParams($params));

    return $statement;
}

function dbAll(string $sql, array $params = [], ?PDO $pdo = null): array
{
    return dbQuery($sql, $params, $pdo)->fetchAll();
}

function dbOne(string $sql, array $params = [], ?PDO $pdo = null): ?array
{
    $row = dbQuery($sql, $params, $pdo)->fetch();

    return $row === false ? null : $row;
}

function dbValue(string $sql, array $params = [], ?PDO $pdo = null): mixed
{
    $value = dbQuery($sql, $params, $pdo)->fetchColumn();

    return $value === false ? null : $value;
}

function dbExec(string $sql, array $params = [], ?PDO $pdo = null): int
{
    return dbQuery($sql, $params, $pdo)->rowCount();
}

/** Runs $fn in a transaction (or in the one already open) and returns its result. */
function dbTx(callable $fn): mixed
{
    $pdo = db();
    if ($pdo->inTransaction()) {
        return $fn();
    }

    $pdo->beginTransaction();
    try {
        $result = $fn();
        $pdo->commit();

        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Does the database exist? Asked of the server, so it works before the first connection to it. */
function dbExists(array $settings, string $name): bool
{
    $statement = dbServer($settings)->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
    $statement->execute([$name]);

    return (bool) $statement->fetchColumn();
}

/**
 * Makes the database when it is not there, and answers whether it had to
 * (setup.php's Save, php migration.php, the tests' databases).
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
