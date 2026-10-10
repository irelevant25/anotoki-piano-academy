<?php

// The migrations, through the anotoki family's engine (anotoki/lib's
// Migrator, as api/migrations.php sets it up): a database is built from
// migrations/piano_academy/ in order, each file once and whole, under the
// app's one lock, nothing written to find out what it lacks - and a database
// from before the family's engine (the app's own `migrations (name ...)`
// table) is read for what it is and brought along in place (the `prepare`
// hook). And 004's schema part: the generation of each person's progress,
// added and nothing else, its gate refusing a column that is there in
// another shape. And 005's: visitors (a negative id with a key's hash), added
// without changing a row of anybody's - and 004 and 005 both run again over
// a database that has visitors already, their gates holding. And 006's
// header: words only (the account's theme and language not taken), frozen
// once applied. And 007: the "not set up yet" card's words, gone with the
// card (the family's page took its place) - and nothing else. And 008: the
// round theme button's three spoken words, gone with the button (the family's
// switch took its place), and the theme's other words told of the switch -
// and nothing else.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Migrations\Splitter;

const FAMILY_MIGRATION = '004_family_shell.sql';
const VISITORS_MIGRATION = '005_visitors.sql';
const PREFERENCES_MIGRATION = '006_account_preferences.sql';
const CARD_WORDS_MIGRATION = '007_site_status_words.sql';
const THEME_SWITCH_MIGRATION = '008_family_theme_switch_words.sql';

/** The words of the card 007 takes away. */
const CARD_KEYS = ['boot.notSetUp.after', 'boot.notSetUp.open', 'boot.notSetUp.text', 'boot.notSetUp.title'];

/** The round theme button's words 008 takes away, and the theme's words whose descriptions it writes over. */
const ROUND_BUTTON_KEYS = ['theme.autoSpoken', 'theme.darkSpoken', 'theme.lightSpoken'];
const THEME_SWITCH_KEYS = ['theme.auto', 'theme.dark', 'theme.light', 'theme.notSaved'];

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
    $made = test_migrate_before($pdo, $migration);
    $expected = array_values(array_filter(migrationFiles(), static fn(string $file): bool => strnatcmp($file, $migration) < 0));
    assert_same([$expected, null], [names_of($made['applied']), $made['failed']], "every migration before $migration");
    $pdo->exec("INSERT INTO users (id, preferred_username) VALUES (1, 'owner'), (7, NULL)");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}'), (7, '{}')");
    $pdo->exec("INSERT INTO path_progress (user_id, data) VALUES (1, '{\"steps\": {\"rh-1/meet\": {\"attempts\": 1}}}')");
    $pdo->exec("INSERT INTO sessions (user_id, id, request_key, data) VALUES (1, 'a', 'key-1', '{\"mode\": \"lesson\"}'), (7, 'b', NULL, '{\"mode\": \"trainer\"}')");
    $pdo->exec("INSERT INTO imports (source, user_id, summary) VALUES ('server-data', 1, '{}')");

    return $pdo;
}

/** A migration's text, as the checkout has it. */
function migration_text(string $file): string
{
    return (string) file_get_contents(migrationsDir() . '/' . $file);
}

/** Advisory locks held on the database $pdo is connected to. */
function advisory_locks(PDO $pdo): int
{
    return (int) $pdo->query("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())")->fetchColumn();
}

test('an empty database gets every migration, recorded once, under the app\'s one lock', function (): void {
    $name = test_empty_db('fresh');
    $pdo = server_pdo($name);
    $migrator = databaseMigrator($pdo);
    assert_same(migrationFiles(), $migrator->files(migrationSet()), 'the folder as the engine lists it');
    assert_same(['001_init.sql', '002_languages_and_translations.sql'], array_slice(migrationFiles(), 0, 2), 'in their order');
    assert_same(migrationFiles(), names_of($migrator->applicable()), 'all of them waiting...');
    assert_false((bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn(), '...and nothing written to find out');

    $result = $migrator->apply();
    assert_same(
        ['applied' => migrationFiles(), 'failed' => null, 'error' => null, 'busy' => false, 'note' => null],
        ['applied' => names_of($result['applied'])] + $result
    );
    assert_same([MIGRATIONS_SET], array_values(array_unique(array_column($result['applied'], 'set'))), 'one set');
    assert_same([], $migrator->applicable());
    assert_same([], databaseMigrator($pdo)->apply()['applied'], 'a second run applies nothing');
    foreach (['users', 'progress', 'path_progress', 'sessions', 'imports', 'languages', 'translation_keys', 'translations'] as $table) {
        assert_true((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "the table $table");
    }
    // The record in the shape it always had: one row a file, in the order they ran.
    assert_same(['id', 'filename', 'applied_at'], $pdo->query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'migrations' ORDER BY ordinal_position")->fetchAll(PDO::FETCH_COLUMN));
    assert_same(migrationFiles(), $pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
    assert_same(0, advisory_locks($pdo), 'the lock was let go');

    // Somebody else updating (setup.php's Save, php migration.php, an Apply): busy, and nothing done.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . PREFERENCES_MIGRATION . "'");
    $other = server_pdo($name);
    $other->query('SELECT pg_advisory_lock(' . DATABASE_UPDATE_LOCK . ')');
    try {
        assert_same(['applied' => [], 'failed' => null, 'error' => null, 'busy' => true, 'note' => null], databaseMigrator($pdo)->apply());
        assert_same([PREFERENCES_MIGRATION], names_of(databaseMigrator($pdo)->applicable()), 'still waiting');
    } finally {
        $other->query('SELECT pg_advisory_unlock(' . DATABASE_UPDATE_LOCK . ')');
        $other = null;
    }
    assert_same([PREFERENCES_MIGRATION], names_of(databaseMigrator($pdo)->apply()['applied']), 'applied once the lock is free (006 runs again cleanly)');
    $pdo = null;
});

test('php migration.php builds a database from nothing; --status and --dry-run only read', function (): void {
    $name = dbName() . '_cli';
    $config = test_write_config(test_temp_dir('cli'), ['name' => $name] + machineDatabaseSettings(), test_auth_iam());
    $GLOBALS['TEST_DBS'][] = $name; // dropped at the end, whatever happens
    $cli = static function (string ...$arguments) use ($config): array {
        $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
        $process = proc_open(array_merge([PHP_BINARY, TEST_BACKEND . '/migration.php'], $arguments), [0 => ['file', $null, 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]], $pipes, TEST_BACKEND, ['PIANO_TEST_CONFIG' => $config] + getenv());
        $out = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);

        // Without its colours.
        return [proc_close($process), (string) preg_replace('/\e\[[0-9;]*m/', '', $out)];
    };

    [$code, $out] = $cli('--status');
    assert_same(1, $code, $out);
    assert_match('/Cannot reach it/', $out);
    assert_false(dbExists(machineDatabaseSettings(), $name), 'reading makes no database');

    [$code, $out] = $cli();
    assert_same(0, $code, $out);
    dbServer(machineDatabaseSettings())->exec('COMMENT ON DATABASE "' . $name . "\" IS 'piano test " . time() . "'");
    assert_match('/Database created\./', $out);
    foreach (migrationFiles() as $file) {
        assert_match('/  ' . preg_quote($file, '/') . ' \.\.\. done/', $out, $file);
    }
    $pdo = server_pdo($name);
    assert_same(migrationFiles(), $pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), 'every file, in order');

    [$code, $out] = $cli('--status');
    assert_same(0, $code, $out);
    assert_match('/  ' . count(migrationFiles()) . ' applied, 0 pending/', $out);

    // One taken off the record: --dry-run names it and applies nothing; the next run applies it, the one after nothing.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . PREFERENCES_MIGRATION . "'");
    [$code, $out] = $cli('--status');
    assert_match('/\. ' . preg_quote(PREFERENCES_MIGRATION, '/') . '   pending/', $out);
    [$code, $out] = $cli('--dry-run');
    assert_same(0, $code, $out);
    assert_match('/would apply ' . preg_quote(PREFERENCES_MIGRATION, '/') . '/', $out);
    assert_same(count(migrationFiles()) - 1, (int) $pdo->query('SELECT count(*) FROM migrations')->fetchColumn(), 'nothing applied by it');
    [$code, $out] = $cli();
    assert_same(0, $code, $out);
    assert_match('/  ' . preg_quote(PREFERENCES_MIGRATION, '/') . ' \.\.\. done/', $out);
    [$code, $out] = $cli();
    assert_same(0, $code, $out);
    assert_match('/Up to date - ' . count(migrationFiles()) . ' migrations\./', $out);
    $pdo = null;
});

test('a database from before the family\'s engine: its record is read as it is, then renamed in place', function (): void {
    $name = test_empty_db('legacy');
    $pdo = server_pdo($name);
    // What the app's own runner made (until 2026-09-28): the schema, and its record of it.
    $pdo->exec(migration_text('001_init.sql'));
    $pdo->exec("CREATE TABLE migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    $pdo->exec("INSERT INTO migrations (name, applied_at) VALUES ('001_init.sql', '2026-09-28 07:20:22+00')");
    $pdo->exec("INSERT INTO users (id) VALUES (1)");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}')");

    // Such a database has 001 and nothing after it: what came later is still to do, 001 is not.
    $later = array_values(array_diff(migrationFiles(), ['001_init.sql']));
    assert_true(legacyMigrationsTable($pdo));
    $status = databaseMigrator($pdo)->status();
    assert_same([['set' => MIGRATIONS_SET, 'name' => '001_init.sql', 'applied_at' => '2026-09-28T07:20:22Z']], $status['applied'], 'read without changing anything: 001 is known as applied, and when');
    assert_same($later, names_of($status['pending']));
    assert_true(legacyMigrationsTable($pdo), 'still as it was');

    $result = databaseMigrator($pdo)->apply();
    assert_same([$later, null], [names_of($result['applied']), $result['failed']], '001 is not run a second time');
    assert_false(legacyMigrationsTable($pdo), 'the column is filename now');
    assert_same(migrationFiles(), $pdo->query('SELECT filename FROM migrations ORDER BY applied_at, filename')->fetchAll(PDO::FETCH_COLUMN));
    assert_same('2026-09-28 07:20:22+00', (string) $pdo->query("SELECT applied_at FROM migrations WHERE filename = '001_init.sql'")->fetchColumn(), 'when it ran, kept');
    assert_same([], databaseMigrator($pdo)->applicable());
    assert_same('{"60": {"midi": 60}}', (string) $pdo->query('SELECT notes::text FROM progress WHERE user_id = 1')->fetchColumn(), 'the progress untouched');
    $pdo = null;
});

test('a SQL file splits into statements, never inside a string, a comment or a $$ block (the family\'s splitter, as these files need it)', function (): void {
    $sql = "-- a comment; with a semicolon\nCREATE TABLE a (x text DEFAULT 'semi;colon');\n/* block; */ SELECT 1;\n"
        . "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$;\nSELECT 'it''s';";
    assert_same([
        "CREATE TABLE a (x text DEFAULT 'semi;colon')",
        'SELECT 1',
        "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$",
        "SELECT 'it''s'",
    ], Splitter::split($sql));
});

test('a migration that fails is rolled back whole and named with what PostgreSQL said - and it and every file after it wait', function (): void {
    $pdo = server_pdo(test_empty_db('fails'));
    assert_same(['001_init.sql'], names_of(test_migrate($pdo, '001_init.sql')['applied']));
    // A table 002 makes, there already in another shape: 002 stops at its first insert.
    $pdo->exec('CREATE TABLE languages (code TEXT PRIMARY KEY)');
    $result = databaseMigrator($pdo)->apply();
    assert_same([[], ['set' => MIGRATIONS_SET, 'name' => '002_languages_and_translations.sql']], [$result['applied'], $result['failed']]);
    assert_match('/^statement \d+ of \d+: SQLSTATE\[42703\]: .*column "name" of relation "languages" does not exist/', (string) $result['error'], 'what PostgreSQL said');
    assert_true(str_contains((string) $result['error'], "\n\n  INSERT INTO languages (code, name, native_name, sort_order) VALUES"), 'and the statement\'s first lines');
    assert_same(['001_init.sql'], $pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN), 'nothing of it recorded');
    assert_false((bool) $pdo->query("SELECT to_regclass('translation_keys') IS NOT NULL")->fetchColumn(), 'nor made');
    assert_same(array_values(array_diff(migrationFiles(), ['001_init.sql'])), names_of(databaseMigrator($pdo)->applicable()), 'still to do');
    assert_same(0, advisory_locks($pdo), 'the lock was let go');
    $pdo = null;
});

test('004 adds the generation of each person\'s progress - a sequence and one column on users - and changes nothing else of 001', function (): void {
    $pdo = database_before_004('before_004');
    $before = tables_of_001($pdo);
    assert_same([FAMILY_MIGRATION], names_of(test_migrate($pdo, FAMILY_MIGRATION)['applied']));
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
    $sql = migration_text(FAMILY_MIGRATION);
    assert_no_match('/UNFINISHED/', $sql, 'no longer marked as being written');
    assert_match('/-- Finished \(2026-10-04\)\. The owner applies it at the hand-over, after a\s+-- pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once applied it never changes: the next change is\s+-- 005\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[count($statements) - 1], 'it ends with its gate');

    $pdo = database_before_004('broken_004');
    $pdo->exec('ALTER TABLE users ADD COLUMN progress_generation TEXT');
    $result = test_migrate($pdo, FAMILY_MIGRATION);
    assert_same(FAMILY_MIGRATION, $result['failed']['name'] ?? null, 'the gate let a text column through');
    assert_match('/progress_generation is not a bigint/', (string) $result['error']);
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
    assert_same([VISITORS_MIGRATION], names_of(test_migrate($pdo, VISITORS_MIGRATION)['applied']));
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
    assert_same(null, test_migrate($pdo)['failed']);
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
    assert_same([FAMILY_MIGRATION, VISITORS_MIGRATION], names_of(databaseMigrator($pdo)->applicable()));
    $again = databaseMigrator($pdo)->apply();
    assert_same([[FAMILY_MIGRATION, VISITORS_MIGRATION], null, null], [names_of($again['applied']), $again['failed'], $again['error']]);
    assert_same($before, tables_of_001($pdo), 'every table of 001 as it was, the visitor\'s rows too');
    assert_same($starts, $pdo->query('SELECT address FROM visitor_starts')->fetchAll(PDO::FETCH_COLUMN));
    assert_same(-2, insert_visitor($pdo), 'the sequence goes on where it was');

    // 005 alone again, as the tour takes it off the record.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . VISITORS_MIGRATION . "'");
    assert_same([VISITORS_MIGRATION], names_of(databaseMigrator($pdo)->apply()['applied']));
    $pdo = null;
});

test('005 says it is finished and how the owner applies it, and its gate fails loudly on 001\'s check under another name - nothing of it stays', function (): void {
    $sql = migration_text(VISITORS_MIGRATION);
    assert_match('/-- Finished \(2026-10-05\)\. The owner applies it at the hand-over, after a\s+-- pg_dump/', $sql);
    assert_match('/Once\s+--\s+applied it never changes: the next change is 006\./', $sql);
    $statements = Splitter::split($sql);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[count($statements) - 1], 'it ends with its gate');

    $pdo = database_before(VISITORS_MIGRATION, 'broken_005');
    $pdo->exec('ALTER TABLE users RENAME CONSTRAINT users_id_check TO users_positive_id');
    $result = test_migrate($pdo, VISITORS_MIGRATION);
    assert_same(VISITORS_MIGRATION, $result['failed']['name'] ?? null, 'the gate let CHECK (id > 0) stay');
    assert_match('/the check CHECK \(id > 0\) of 001 is still on users/', (string) $result['error']);
    assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . VISITORS_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
    assert_false((bool) $pdo->query("SELECT to_regclass('visitor_ids') IS NOT NULL")->fetchColumn(), 'and its sequence went with it');
    assert_false((bool) $pdo->query("SELECT to_regclass('visitor_starts') IS NOT NULL")->fetchColumn(), 'and its table');
    $pdo = null;
});

test('006 says it is finished and how the owner applies it, and is words only: its keys, their English and Slovak, its gate', function (): void {
    // What it may write is held by tests/unit/translations.test.php (only the three tables of the words, nobody's progress).
    $sql = migration_text(PREFERENCES_MIGRATION);
    assert_match('/-- Finished \(2026-10-06\)\. The owner applies it at the hand-over, with 005\s+-- \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once applied it never changes: the next\s+-- change is 007\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_same(4, count($statements), 'the keys, the English, the Slovak and the gate - nothing else');
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[3], 'it ends with its gate');
});

test('007 says it is finished and how the owner applies it, and takes the card\'s four words away - nothing else, again and again', function (): void {
    $sql = migration_text(CARD_WORDS_MIGRATION);
    assert_match('/-- Finished \(2026-10-07\)\. The owner applies it with 005 and 006 at the\s+-- hand-over \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once\s+--\s+applied it never changes: the next change is 008\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_same(2, count($statements), 'the one delete and the gate - nothing else');
    assert_same("DELETE FROM translation_keys WHERE name IN ('boot.notSetUp.title', 'boot.notSetUp.text', 'boot.notSetUp.open', 'boot.notSetUp.after')", $statements[0]);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[1], 'it ends with its gate');

    // What it does: the four keys and their strings go - every other key and string, and every table of 001, as they were.
    $pdo = database_before(CARD_WORDS_MIGRATION, 'before_007');
    $keys = static fn(): array => $pdo->query('SELECT name FROM translation_keys ORDER BY name')->fetchAll(PDO::FETCH_COLUMN);
    $strings = static fn(): array => $pdo->query('SELECT key_name, language_code, value FROM translations ORDER BY 1, 2')->fetchAll(PDO::FETCH_ASSOC);
    $keysBefore = $keys();
    $stringsBefore = $strings();
    $tablesBefore = tables_of_001($pdo);
    assert_same(CARD_KEYS, array_values(array_intersect($keysBefore, CARD_KEYS)), 'the card\'s words, there before');
    assert_same([CARD_WORDS_MIGRATION], names_of(test_migrate($pdo, CARD_WORDS_MIGRATION)['applied']));
    assert_same(array_values(array_diff($keysBefore, CARD_KEYS)), $keys(), 'the four keys gone, no other');
    assert_same(array_values(array_filter($stringsBefore, static fn(array $row): bool => !in_array($row['key_name'], CARD_KEYS, true))), $strings(), 'their strings with them, no other');
    assert_same($tablesBefore, tables_of_001($pdo), 'nobody\'s progress touched');

    // Taken off the record and applied again: its gate holds over a database without the card's words.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . CARD_WORDS_MIGRATION . "'");
    assert_same([CARD_WORDS_MIGRATION], names_of(test_migrate($pdo, CARD_WORDS_MIGRATION)['applied']));

    // A key of the card that comes back somehow (a translator's import cannot make keys - only a migration
    // could): the gate refuses, and nothing of 007 stays.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . CARD_WORDS_MIGRATION . "'");
    $pdo->exec("CREATE FUNCTION keep_card() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$");
    $pdo->exec("INSERT INTO translation_keys (name) VALUES ('boot.notSetUp.title')");
    $pdo->exec('CREATE TRIGGER keep_card BEFORE DELETE ON translation_keys FOR EACH ROW EXECUTE FUNCTION keep_card()');
    $refused = test_migrate($pdo, CARD_WORDS_MIGRATION);
    assert_same(CARD_WORDS_MIGRATION, $refused['failed']['name'] ?? null);
    assert_match('/a key or a string of the "not set up yet" card is still there/', (string) $refused['error']);
    assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . CARD_WORDS_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
    $pdo = null;
});

test('008 says it is finished and how the owner applies it, takes the round theme button\'s three words away and tells of the switch - nothing else, again and again', function (): void {
    $sql = migration_text(THEME_SWITCH_MIGRATION);
    assert_match('/-- Finished \(2026-10-08\)\. The owner applies it with 005, 006 and 007 at the\s+-- hand-over \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once\s+--\s+applied it never changes: the next change is 009\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_same(3, count($statements), 'the one delete, the descriptions and the gate - nothing else');
    assert_same("DELETE FROM translation_keys WHERE name IN ('theme.autoSpoken', 'theme.lightSpoken', 'theme.darkSpoken')", $statements[0]);
    assert_match('/^UPDATE translation_keys k SET description = v\.description FROM \(VALUES/', $statements[1], 'then the descriptions, by name');
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[2], 'it ends with its gate');

    // What it does: the three keys and their strings go; the theme's four other words keep every string (the owner's
    // wording too) and are told of the switch; every other key, string and description, and every table of 001, as they were.
    $pdo = database_before(THEME_SWITCH_MIGRATION, 'before_008');
    $keys = static fn(): array => $pdo->query('SELECT name FROM translation_keys ORDER BY name')->fetchAll(PDO::FETCH_COLUMN);
    $strings = static fn(): array => $pdo->query('SELECT key_name, language_code, value FROM translations ORDER BY 1, 2')->fetchAll(PDO::FETCH_ASSOC);
    $descriptions = static fn(): array => $pdo->query('SELECT name, description FROM translation_keys ORDER BY name')->fetchAll(PDO::FETCH_KEY_PAIR);
    $pdo->exec("UPDATE translations SET value = 'Light it is' WHERE key_name = 'theme.light' AND language_code = 'en'");
    $keysBefore = $keys();
    $stringsBefore = $strings();
    $descriptionsBefore = $descriptions();
    $tablesBefore = tables_of_001($pdo);
    assert_same(ROUND_BUTTON_KEYS, array_values(array_intersect($keysBefore, ROUND_BUTTON_KEYS)), 'the round button\'s words, there before');
    assert_same([THEME_SWITCH_MIGRATION], names_of(test_migrate($pdo, THEME_SWITCH_MIGRATION)['applied']));
    assert_same(array_values(array_diff($keysBefore, ROUND_BUTTON_KEYS)), $keys(), 'the three keys gone, no other');
    assert_same(array_values(array_filter($stringsBefore, static fn(array $row): bool => !in_array($row['key_name'], ROUND_BUTTON_KEYS, true))), $strings(), 'their strings with them - every other string as it was, the owner\'s wording too');
    $after = $descriptions();
    foreach (THEME_SWITCH_KEYS as $key) {
        assert_true($after[$key] !== $descriptionsBefore[$key] && str_contains($after[$key], 'theme switch') && !str_contains($after[$key], 'round theme button'), "$key: its description tells of the switch");
    }
    $others = static fn(array $all): array => array_diff_key($all, array_flip([...THEME_SWITCH_KEYS, ...ROUND_BUTTON_KEYS]));
    assert_same($others($descriptionsBefore), $others($after), 'every other description as it was');
    assert_same($tablesBefore, tables_of_001($pdo), 'nobody\'s progress touched');

    // Taken off the record and applied again: its gate holds over a database without the button's words.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . THEME_SWITCH_MIGRATION . "'");
    assert_same([THEME_SWITCH_MIGRATION], names_of(test_migrate($pdo, THEME_SWITCH_MIGRATION)['applied']));

    // A key of the button that comes back somehow (only a migration could make one): the gate refuses, and nothing of 008 stays.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . THEME_SWITCH_MIGRATION . "'");
    $pdo->exec("CREATE FUNCTION keep_button() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$");
    $pdo->exec("INSERT INTO translation_keys (name) VALUES ('theme.autoSpoken')");
    $pdo->exec('CREATE TRIGGER keep_button BEFORE DELETE ON translation_keys FOR EACH ROW EXECUTE FUNCTION keep_button()');
    $pdo->exec("UPDATE translation_keys SET description = 'the round theme button' WHERE name = 'theme.dark'");
    $refused = test_migrate($pdo, THEME_SWITCH_MIGRATION);
    assert_same(THEME_SWITCH_MIGRATION, $refused['failed']['name'] ?? null);
    assert_match('/a key or a string of the round theme button is still there/', (string) $refused['error']);
    assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . THEME_SWITCH_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
    assert_same('the round theme button', $pdo->query("SELECT description FROM translation_keys WHERE name = 'theme.dark'")->fetchColumn(), 'its descriptions rolled back with it');
    $pdo = null;
});
