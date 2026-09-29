<?php

// The migration engine (api/migration_runner.php, the family's): a database
// is built from migrations/piano_academy/ in order, each file once - and a
// database from before the engine (the app's own `migrations (name ...)`
// table) is read for what it is and brought along in place.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

test('an empty database gets every migration, recorded once', function (): void {
    $name = test_empty_db('fresh');
    $pdo = server_pdo($name);
    assert_same(migrationFiles(), pendingMigrationsReadOnly($pdo), 'all of them pending, and nothing written to find out');
    assert_false((bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn());

    $result = applyPendingMigrations($pdo);
    assert_same(['applied' => migrationFiles(), 'failed' => null, 'error' => null], $result);
    assert_same([], pendingMigrationsReadOnly($pdo));
    assert_same(['applied' => [], 'failed' => null, 'error' => null], applyPendingMigrations($pdo), 'a second run applies nothing');
    foreach (['users', 'progress', 'path_progress', 'sessions', 'imports'] as $table) {
        assert_true((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "the table $table");
    }
    $pdo = null;
});

test('a database from before the engine: its record is read as it is, then renamed in place', function (): void {
    $name = test_empty_db('legacy');
    $pdo = server_pdo($name);
    // What the app's own runner made (until 2026-09-28): the schema, and its record of it.
    $pdo->exec((string) file_get_contents(migrationsRoot() . '/piano_academy/001_init.sql'));
    $pdo->exec("CREATE TABLE migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    $pdo->exec("INSERT INTO migrations (name, applied_at) VALUES ('001_init.sql', '2026-09-28 07:20:22+00')");
    $pdo->exec("INSERT INTO users (id) VALUES (1)");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}')");

    assert_true(legacyMigrationsTable($pdo));
    assert_same([], pendingMigrationsReadOnly($pdo), 'read without changing anything');
    assert_true(legacyMigrationsTable($pdo), 'still as it was');

    assert_same(['applied' => [], 'failed' => null, 'error' => null], applyPendingMigrations($pdo), '001 is not run a second time');
    assert_false(legacyMigrationsTable($pdo), 'the column is filename now');
    assert_same(['001_init.sql'], $pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN));
    assert_same('2026-09-28 07:20:22+00', (string) $pdo->query('SELECT applied_at FROM migrations')->fetchColumn(), 'when it ran, kept');
    assert_same('{"60": {"midi": 60}}', (string) $pdo->query('SELECT notes::text FROM progress WHERE user_id = 1')->fetchColumn(), 'the progress untouched');
    $pdo = null;
});

test('a SQL file splits into statements, never inside a string, a comment or a $$ block', function (): void {
    $sql = "-- a comment; with a semicolon\nCREATE TABLE a (x text DEFAULT 'semi;colon');\n/* block; */ SELECT 1;\n"
        . "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$;\nSELECT 'it''s';";
    assert_same([
        "CREATE TABLE a (x text DEFAULT 'semi;colon')",
        'SELECT 1',
        "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$",
        "SELECT 'it''s'",
    ], splitSqlStatements($sql));
});
