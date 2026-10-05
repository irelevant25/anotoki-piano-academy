<?php

declare(strict_types=1);

/**
 * Bringing the database up to date - one update at a time, whoever starts it.
 *
 * Three things apply migrations: setup.php's Save, php migration.php, and an
 * administrator's Apply on the admin panel's Migrations page
 * (POST /api/admin/migrations/apply). Each takes the same
 * PostgreSQL advisory lock first (databaseUpdateLocked()), so two of them never
 * apply the same file at once - the second is told another update is running,
 * and applies nothing. The lock is the database's own: it is let go when the
 * update ends, or when its connection does.
 */

/** The advisory lock's key - the same number in every way of updating (any number would do). */
const DATABASE_UPDATE_LOCK = 3_300_004_500;

/**
 * Runs $update holding the lock on $pdo's database and returns what it
 * returned - or null at once, running nothing, when another update holds it.
 */
function databaseUpdateLocked(PDO $pdo, callable $update): mixed
{
    $statement = $pdo->prepare('SELECT CASE WHEN pg_try_advisory_lock(?::bigint) THEN 1 ELSE 0 END');
    $statement->execute([DATABASE_UPDATE_LOCK]);
    if ((int) $statement->fetchColumn() !== 1) {
        return null;
    }

    try {
        return $update();
    } finally {
        $pdo->prepare('SELECT pg_advisory_unlock(?::bigint)')->execute([DATABASE_UPDATE_LOCK]);
    }
}

/**
 * What GET /api/admin/migrations answers (the IAM's shape, and the
 * database's name): the migrations the database has, with when each was
 * applied ("YYYY-MM-DD HH:MM", the server's clock), in the order they ran;
 * and the files it still needs, in the order they will run. Nothing is
 * written - this works on a database behind the code, even one with no
 * migrations table yet.
 *
 * @return array{database: string, applied: list<array{name: string, applied_at: ?string}>, pending: list<array{name: string}>}
 */
function databaseStatus(PDO $pdo): array
{
    $applied = [];
    if ((bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn()) {
        // The column is one of two literals (a record kept before the family's engine named it `name`).
        $column = legacyMigrationsTable($pdo) ? 'name' : 'filename';
        $rows = $pdo->query(
            "SELECT $column AS name, to_char(applied_at, 'YYYY-MM-DD HH24:MI') AS applied_at FROM migrations ORDER BY applied_at, $column"
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $applied[] = ['name' => (string) $row['name'], 'applied_at' => $row['applied_at'] === null ? null : (string) $row['applied_at']];
        }
    }

    return [
        'database' => dbName(),
        'applied' => $applied,
        'pending' => array_map(static fn (string $name): array => ['name' => $name], pendingMigrationsReadOnly($pdo)),
    ];
}

/**
 * POST /api/admin/migrations/apply: every pending migration in order, each in
 * its own transaction, under the lock - stopping at the first that fails,
 * which is rolled back whole (every migration assumes the ones before it ran).
 * Null when another update is running. The file that failed is named, with
 * what PostgreSQL said (and the statement's number and first lines), as the
 * IAM's page shows it: the route is an ADMIN's alone, and on a host with only
 * FTP the page is where the error can be read (the owner, 2026-10-04). It
 * goes to the server log as well.
 *
 * @return ?array{applied: string[], failed: ?string, error: ?string}
 */
function databaseApplyUpdate(PDO $pdo): ?array
{
    return databaseUpdateLocked($pdo, static function () use ($pdo): array {
        $result = applyPendingMigrations($pdo);
        if ($result['failed'] !== null) {
            error_log('[db] the migration ' . $result['failed'] . ' failed: ' . $result['error']);
        }

        return $result;
    });
}
