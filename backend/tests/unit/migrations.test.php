<?php

// The migration engine (api/migration_runner.php, the family's): a database
// is built from migrations/piano_academy/ in order, each file once - and a
// database from before the engine (the app's own `migrations (name ...)`
// table) is read for what it is and brought along in place. And 004's schema
// part: the generation of each person's progress, added and nothing else,
// its gate refusing a column that is there in another shape. And 005's:
// visitors (a negative id with a key's hash), added without changing a row
// of anybody's - and 004 and 005 both run again over a database that has
// visitors already, their gates holding.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const FAMILY_MIGRATION = '004_family_shell.sql';
const VISITORS_MIGRATION = '005_visitors.sql';

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

/** The five tables of 001 in a database: their columns, constraints, indexes and rows. */
function tables_of_001(PDO $pdo): array
{
    $list = "'users', 'progress', 'path_progress', 'sessions', 'imports'";
    $all = static fn(string $sql): array => $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    $state = [
        'columns' => $all("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
                            WHERE table_schema = current_schema() AND table_name IN ($list) ORDER BY table_name, ordinal_position"),
        'constraints' => $all("SELECT conrelid::regclass::text AS on_table, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
                                WHERE conrelid::regclass::text IN ($list) ORDER BY 1, 2"),
        'indexes' => $all("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ($list) ORDER BY 1, 2"),
    ];
    foreach (['users', 'progress', 'path_progress', 'sessions', 'imports'] as $table) {
        $state["rows of $table"] = $all("SELECT to_jsonb(t)::text AS row FROM \"$table\" t ORDER BY 1");
    }

    return $state;
}

/** A database with every migration before 004, and two people's progress in it. */
function database_before_004(string $suffix): PDO
{
    return database_before(FAMILY_MIGRATION, $suffix);
}

/** A database with every migration before $migration, and two people's progress in it. */
function database_before(string $migration, string $suffix): PDO
{
    $pdo = server_pdo(test_empty_db($suffix));
    ensureMigrationsTable($pdo);
    foreach (migrationFiles() as $file) {
        if (strcmp($file, $migration) >= 0) {
            break;
        }
        applyMigration($pdo, MIGRATIONS_ALIAS, $file);
    }
    $pdo->exec("INSERT INTO users (id, preferred_username) VALUES (1, 'owner'), (7, NULL)");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}'), (7, '{}')");
    $pdo->exec("INSERT INTO path_progress (user_id, data) VALUES (1, '{\"steps\": {\"rh-1/meet\": {\"attempts\": 1}}}')");
    $pdo->exec("INSERT INTO sessions (user_id, id, request_key, data) VALUES (1, 'a', 'key-1', '{\"mode\": \"lesson\"}'), (7, 'b', NULL, '{\"mode\": \"trainer\"}')");
    $pdo->exec("INSERT INTO imports (source, user_id, summary) VALUES ('server-data', 1, '{}')");

    return $pdo;
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
    foreach (['users', 'progress', 'path_progress', 'sessions', 'imports', 'languages', 'translation_keys', 'translations'] as $table) {
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

    // Such a database has 001 and nothing after it: what came later is still to do, 001 is not.
    $later = array_values(array_diff(migrationFiles(), ['001_init.sql']));
    assert_true(legacyMigrationsTable($pdo));
    assert_same($later, pendingMigrationsReadOnly($pdo), 'read without changing anything: 001 is known as applied');
    assert_true(legacyMigrationsTable($pdo), 'still as it was');

    assert_same(['applied' => $later, 'failed' => null, 'error' => null], applyPendingMigrations($pdo), '001 is not run a second time');
    assert_false(legacyMigrationsTable($pdo), 'the column is filename now');
    assert_same(migrationFiles(), $pdo->query('SELECT filename FROM migrations ORDER BY applied_at, filename')->fetchAll(PDO::FETCH_COLUMN));
    assert_same('2026-09-28 07:20:22+00', (string) $pdo->query("SELECT applied_at FROM migrations WHERE filename = '001_init.sql'")->fetchColumn(), 'when it ran, kept');
    assert_same([], pendingMigrationsReadOnly($pdo));
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

test('004 adds the generation of each person\'s progress - a sequence and one column on users - and changes nothing else of 001', function (): void {
    $pdo = database_before_004('before_004');
    $before = tables_of_001($pdo);
    applyMigration($pdo, MIGRATIONS_ALIAS, FAMILY_MIGRATION);
    $after = tables_of_001($pdo);

    $added = array_values(array_filter($after['columns'], static fn(array $column): bool => !in_array($column, $before['columns'], true)));
    assert_same([['table_name' => 'users', 'column_name' => 'progress_generation', 'data_type' => 'bigint', 'is_nullable' => 'NO', 'column_default' => "nextval('progress_generation'::regclass)"]], $added, 'one column');
    assert_same($before['columns'], array_values(array_filter($after['columns'], static fn(array $column): bool => $column['column_name'] !== 'progress_generation')), 'every other column as it was');
    // PostgreSQL 18 lists a NOT NULL as a constraint of its own (older ones do not): the new column's, and no other.
    $notNull = static fn(array $constraint): bool => $constraint['definition'] === 'NOT NULL progress_generation';
    assert_same($before['constraints'], array_values(array_filter($after['constraints'], static fn(array $constraint): bool => !$notNull($constraint))), 'constraints');
    assert_true(count($after['constraints']) - count($before['constraints']) <= 1, 'at most the column\'s NOT NULL added');
    foreach (['indexes', 'rows of progress', 'rows of path_progress', 'rows of sessions', 'rows of imports'] as $part) {
        assert_same($before[$part], $after[$part], $part);
    }
    $users = $pdo->query('SELECT id, preferred_username, created_at, last_seen_at, progress_generation FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    assert_same(
        array_map(static fn(array $row): array => array_diff_key(json_decode($row['row'], true), ['x' => 0]), $before['rows of users']),
        array_map(static fn(array $row): array => array_diff_key(json_decode($row['row'], true), ['progress_generation' => 0]), $after['rows of users']),
        'the users rows as they were, but for their number'
    );
    $numbers = array_map('intval', array_column($users, 'progress_generation'));
    assert_same(2, count(array_unique($numbers)), 'each person a number of their own');
    assert_true(min($numbers) > 0);
    $pdo->exec('INSERT INTO users (id) VALUES (8)');
    assert_true((int) $pdo->query('SELECT progress_generation FROM users WHERE id = 8')->fetchColumn() > max($numbers), 'a person who comes later gets the next one');
    assert_same('progress_generation', $pdo->query("SELECT relname FROM pg_class WHERE relkind = 'S' AND relname = 'progress_generation'")->fetchColumn());
    $pdo = null;
});

test('004 says it is finished and how the owner applies it, and its gate fails loudly on a column that is there in another shape - nothing of it stays', function (): void {
    $sql = (string) file_get_contents(migrationsRoot() . '/' . MIGRATIONS_ALIAS . '/' . FAMILY_MIGRATION);
    assert_no_match('/UNFINISHED/', $sql, 'no longer marked as being written');
    assert_match('/-- Finished \(2026-10-04\)\. The owner applies it at the hand-over, after a\s+-- pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once applied it never changes: the next change is\s+-- 005\./', $sql, 'and that it is then frozen');
    $statements = splitSqlStatements($sql);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[count($statements) - 1], 'it ends with its gate');

    $pdo = database_before_004('broken_004');
    $pdo->exec('ALTER TABLE users ADD COLUMN progress_generation TEXT');
    try {
        applyMigration($pdo, MIGRATIONS_ALIAS, FAMILY_MIGRATION);
        fail('the gate let a text column through');
    } catch (Throwable $e) {
        assert_match('/progress_generation is not a bigint/', $e->getMessage());
    }
    assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . FAMILY_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
    assert_false((bool) $pdo->query("SELECT to_regclass('progress_generation') IS NOT NULL")->fetchColumn(), 'and its sequence went with it');
    $pdo = null;
});

/** A visitor in a database as visitorMake() makes one: a negative id from visitor_ids, a key's hash. */
function insert_visitor(PDO $pdo): int
{
    $statement = $pdo->prepare("INSERT INTO users (id, visitor_key_hash) VALUES (nextval('visitor_ids'), ?) RETURNING id");
    $statement->execute([hash('sha256', random_bytes(16))]);

    return (int) $statement->fetchColumn();
}

/** Whether $sql is refused by the database. */
function refused(PDO $pdo, string $sql): bool
{
    try {
        $pdo->exec($sql);

        return false;
    } catch (PDOException) {
        return true;
    }
}

test('005 adds visitors - a sequence counting down, one column, the check on users.id rewritten, two indexes, a table - and changes no row of anybody\'s', function (): void {
    $pdo = database_before(VISITORS_MIGRATION, 'before_005');
    $before = tables_of_001($pdo);
    applyMigration($pdo, MIGRATIONS_ALIAS, VISITORS_MIGRATION);
    $after = tables_of_001($pdo);

    $added = array_values(array_filter($after['columns'], static fn(array $column): bool => !in_array($column, $before['columns'], true)));
    assert_same([['table_name' => 'users', 'column_name' => 'visitor_key_hash', 'data_type' => 'character', 'is_nullable' => 'YES', 'column_default' => null]], $added, 'one column, null for everybody');
    $constraints = static fn(array $state): array => array_column($state['constraints'], 'definition', 'conname');
    assert_same('CHECK ((id > 0))', $constraints($before)['users_id_check'] ?? null, '001\'s check, before');
    assert_same(['users_kind_check'], array_values(array_diff(array_keys($constraints($after)), array_keys($constraints($before)))), 'one check added');
    assert_same(['users_id_check'], array_values(array_diff(array_keys($constraints($before)), array_keys($constraints($after)))), 'and 001\'s gone');
    assert_same(['users_visitor_key_hash', 'users_visitors_by_last_seen'], array_values(array_diff(array_column($after['indexes'], 'indexname'), array_column($before['indexes'], 'indexname'))));
    foreach (['rows of progress', 'rows of path_progress', 'rows of sessions', 'rows of imports'] as $part) {
        assert_same($before[$part], $after[$part], $part);
    }
    assert_json_same(
        array_map(static fn(array $row): array => json_decode($row['row'], true) + ['visitor_key_hash' => null], $before['rows of users']),
        array_map(static fn(array $row): array => json_decode($row['row'], true), $after['rows of users']),
        'the users rows as they were, with no key'
    );
    assert_true((bool) $pdo->query("SELECT to_regclass('visitor_starts') IS NOT NULL")->fetchColumn(), 'visitor_starts');

    // What the check lets in: a visitor with a key's hash; a person without one; nothing else.
    $visitor = insert_visitor($pdo);
    assert_same(-1, $visitor, 'the first visitor is -1');
    assert_same(-2, insert_visitor($pdo), 'and they count down');
    $hash = str_repeat('a', 64);
    assert_true(refused($pdo, 'INSERT INTO users (id) VALUES (-50)'), 'a negative id without a key');
    assert_true(refused($pdo, "INSERT INTO users (id, visitor_key_hash) VALUES (50, '$hash')"), 'a person with a key');
    assert_true(refused($pdo, 'INSERT INTO users (id) VALUES (0)'), 'id 0');
    assert_true(refused($pdo, "INSERT INTO users (id, visitor_key_hash) VALUES (-51, 'NOT-A-HASH" . str_repeat('x', 54) . "')"), 'a key\'s hash of another shape');
    assert_true(refused($pdo, "INSERT INTO users (id, visitor_key_hash) VALUES (-52, (SELECT visitor_key_hash FROM users WHERE id = $visitor))"), 'a key two visitors share');
    assert_false(refused($pdo, "INSERT INTO users (id, visitor_key_hash) VALUES (-53, '$hash')"), 'a visitor');
    assert_false(refused($pdo, 'INSERT INTO users (id) VALUES (54)'), 'a person');
    $pdo = null;
});

test('004 and 005 run again over a database that has visitors already: both gates hold, nothing of anybody\'s changes', function (): void {
    $pdo = server_pdo(test_empty_db('again'));
    applyPendingMigrations($pdo);
    $pdo->exec("INSERT INTO users (id, preferred_username) VALUES (1, 'owner')");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}')");
    $visitor = insert_visitor($pdo);
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES ($visitor, '{\"62\": {\"midi\": 62}}')");
    $pdo->exec("INSERT INTO sessions (user_id, id, data) VALUES ($visitor, 'v', '{\"mode\": \"trainer\"}')");
    $pdo->exec("INSERT INTO visitor_starts (address) VALUES ('198.51.100.7')");
    $before = tables_of_001($pdo);
    $starts = $pdo->query('SELECT address FROM visitor_starts')->fetchAll(PDO::FETCH_COLUMN);

    // As the browser check's "database behind" tour does: taken off the record, then applied again.
    $pdo->exec("DELETE FROM migrations WHERE filename IN ('" . FAMILY_MIGRATION . "', '" . VISITORS_MIGRATION . "')");
    assert_same([FAMILY_MIGRATION, VISITORS_MIGRATION], pendingMigrationsReadOnly($pdo));
    assert_same(['applied' => [FAMILY_MIGRATION, VISITORS_MIGRATION], 'failed' => null, 'error' => null], applyPendingMigrations($pdo));
    assert_same($before, tables_of_001($pdo), 'every table of 001 as it was, the visitor\'s rows too');
    assert_same($starts, $pdo->query('SELECT address FROM visitor_starts')->fetchAll(PDO::FETCH_COLUMN));
    assert_same(-2, insert_visitor($pdo), 'the sequence goes on where it was');

    // 005 alone again, as the tour takes it off the record.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . VISITORS_MIGRATION . "'");
    assert_same(['applied' => [VISITORS_MIGRATION], 'failed' => null, 'error' => null], applyPendingMigrations($pdo));
    $pdo = null;
});

test('005 says it is finished and how the owner applies it, and its gate fails loudly on 001\'s check under another name - nothing of it stays', function (): void {
    $sql = (string) file_get_contents(migrationsRoot() . '/' . MIGRATIONS_ALIAS . '/' . VISITORS_MIGRATION);
    assert_match('/-- Finished \(2026-10-05\)\. The owner applies it at the hand-over, after a\s+-- pg_dump/', $sql);
    assert_match('/Once\s+--\s+applied it never changes: the next change is 006\./', $sql);
    $statements = splitSqlStatements($sql);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[count($statements) - 1], 'it ends with its gate');

    $pdo = database_before(VISITORS_MIGRATION, 'broken_005');
    $pdo->exec('ALTER TABLE users RENAME CONSTRAINT users_id_check TO users_positive_id');
    try {
        applyMigration($pdo, MIGRATIONS_ALIAS, VISITORS_MIGRATION);
        fail('the gate let CHECK (id > 0) stay');
    } catch (Throwable $e) {
        assert_match('/the check CHECK \(id > 0\) of 001 is still on users/', $e->getMessage());
    }
    assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . VISITORS_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
    assert_false((bool) $pdo->query("SELECT to_regclass('visitor_ids') IS NOT NULL")->fetchColumn(), 'and its sequence went with it');
    assert_false((bool) $pdo->query("SELECT to_regclass('visitor_starts') IS NOT NULL")->fetchColumn(), 'and its table');
    $pdo = null;
});
