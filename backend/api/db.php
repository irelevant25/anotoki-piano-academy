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
    $dsn = sprintf(
        'pgsql:host=%s;port=%d;dbname=%s;connect_timeout=5;application_name=piano-academy',
        $settings['host'],
        (int) $settings['port'],
        $name ?? $settings['name']
    );

    $pdo = new PDO($dsn, (string) $settings['user'], (string) $settings['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_PERSISTENT => $persistent,
    ]);
    // A pooled connection may still hold a transaction its last request died
    // in; ROLLBACK ends it (and is only a notice when there is none).
    $pdo->exec(($persistent ? 'ROLLBACK; ' : '') . "SET TIME ZONE 'UTC'");

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

function dbQuery(string $sql, array $params = []): PDOStatement
{
    $statement = db()->prepare($sql);
    $statement->execute(dbParams($params));

    return $statement;
}

function dbAll(string $sql, array $params = []): array
{
    return dbQuery($sql, $params)->fetchAll();
}

function dbOne(string $sql, array $params = []): ?array
{
    $row = dbQuery($sql, $params)->fetch();

    return $row === false ? null : $row;
}

function dbValue(string $sql, array $params = []): mixed
{
    $value = dbQuery($sql, $params)->fetchColumn();

    return $value === false ? null : $value;
}

function dbExec(string $sql, array $params = []): int
{
    return dbQuery($sql, $params)->rowCount();
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
