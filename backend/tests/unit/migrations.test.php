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
// and nothing else. And the library's set of the words after the app's own
// (anotoki_translations), and 009: on a database as its owner left it, every
// string the kit said goes under the library's key - every language, the
// owner's wording, who and when - and nothing is lost, again and again. And
// anotoki-lib 0.4.1's sets in their order (its admin tools' first, its words'
// and people's after the app's), 010 (users.anonymized_at, for the people's
// scrub: one column, nothing else, no row changed) and 011 (the sign-in
// card's failure words under the library's keys, the card's own gone) - on
// databases shaped as the owner's are, before this update and after the
// last, again and again, a refusal rolled back whole. And 012 (the legal
// pages' words) and 013 (the old footer's own word, gone with it - the
// family's footer took its place - and What's new's heading told of the
// new one).

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Migrations\Splitter;
use Anotoki\Lib\Translations\LibraryWords;

const FAMILY_MIGRATION = '004_family_shell.sql';
const VISITORS_MIGRATION = '005_visitors.sql';
const PREFERENCES_MIGRATION = '006_account_preferences.sql';
const CARD_WORDS_MIGRATION = '007_site_status_words.sql';
const THEME_SWITCH_MIGRATION = '008_family_theme_switch_words.sql';
const LIBRARY_WORDS_MIGRATION = '009_strings_through_the_library.sql';
const PEOPLE_MIGRATION = '010_people.sql';
const SIGN_IN_WORDS_MIGRATION = '011_sign_in_failure_words.sql';
const LEGAL_PAGES_MIGRATION = '012_legal_pages.sql';
const FOOTER_WORDS_MIGRATION = '013_family_footer_words.sql';

/** The sign-in card's failure words 011 takes under the library's keys: this app's key => the library's. */
const SIGN_IN_WORDS = [
    'signIn.notCompleted' => 'anotoki.signIn.notCompleted',
    'signIn.storageUnavailable' => 'anotoki.signIn.storageUnavailable',
    'signIn.failed' => 'anotoki.signIn.failed',
];

/** The card's own words, which 011 takes away with it. */
const SIGN_IN_CARD_KEYS = ['signIn.title', 'signIn.text'];

/**
 * Whether a key is 012's work - one it writes (the legal pages' facts, their tabs' titles, the step dots' name) or
 * the one it takes away (What's new's unreachable sentence): an earlier file's test that applies everything after it
 * leaves these out of "every other string as it was" - 012's own test holds them.
 */
function written_by_012(string $key): bool
{
    return str_starts_with($key, 'legal.') || in_array($key, ['title.terms', 'title.privacy', 'title.contact', 'lesson.steps', 'whatsNew.notLoaded'], true);
}

/** The old footer's own word, which 013 takes away with the footer (the family's took its place). */
const FOOTER_KEYS = ['footer.whatsNew'];

/** Whether a key is 013's work - the old footer's word it takes away: left out of earlier files' "every other string as it was", as 012's. */
function written_by_013(string $key): bool
{
    return in_array($key, FOOTER_KEYS, true);
}

/**
 * The files a full update applies from $migration on (an app's file): it and the app's after it, then the library's
 * sets of the words and the people - as a Migrator lists them (the library's admin tools' set ran first).
 */
function files_from(string $migration): array
{
    return array_values(
        array_filter(every_migration(), static fn(array $file): bool => $file['set'] === MIGRATIONS_SET ? strnatcmp($file['name'], $migration) >= 0 : $file['set'] !== \Anotoki\Lib\Admin\Schema::SET),
    );
}

/** The words of the card 007 takes away. */
const CARD_KEYS = ['boot.notSetUp.after', 'boot.notSetUp.open', 'boot.notSetUp.text', 'boot.notSetUp.title'];

/** The round theme button's words 008 takes away, and the theme's words whose descriptions it writes over. */
const ROUND_BUTTON_KEYS = ['theme.autoSpoken', 'theme.darkSpoken', 'theme.lightSpoken'];
const THEME_SWITCH_KEYS = ['theme.auto', 'theme.dark', 'theme.light', 'theme.notSaved'];

/**
 * The words of the family's kit 009 takes under the library's keys: this app's key => the library's. The first two
 * stay this app's too (its own pages ask for them); the rest go.
 */
const KIT_WORDS = [
    'common.loading' => 'anotoki.ui.loading',
    'signIn.button' => 'anotoki.topbar.signIn',
    'topbar.phoneMenu' => 'anotoki.topbar.phoneMenu',
    'topbar.menuButton' => 'anotoki.topbar.menuButton',
    'topbar.menu' => 'anotoki.topbar.menu',
    'topbar.roleAdmin' => 'anotoki.topbar.roleAdmin',
    'topbar.roleEditor' => 'anotoki.topbar.roleEditor',
    'topbar.account' => 'anotoki.topbar.account',
    'topbar.admin' => 'anotoki.topbar.admin',
    'account.signOut' => 'anotoki.topbar.signOut',
    'language.button' => 'anotoki.language.button',
    'language.notLoaded' => 'anotoki.language.notLoaded',
    'language.notSaved' => 'anotoki.language.notSaved',
    'theme.light' => 'anotoki.theme.light',
    'theme.dark' => 'anotoki.theme.dark',
    'theme.auto' => 'anotoki.theme.auto',
    'theme.notSaved' => 'anotoki.theme.notSaved',
];
const KIT_WORDS_KEPT = ['common.loading', 'signIn.button'];

/** Every string of a database, by key and language: [value, updated_at, updated_by] - who wrote it, and when. */
function strings_of(PDO $pdo): array
{
    $strings = [];
    foreach (
        $pdo->query('SELECT key_name, language_code, value, updated_at::text AS updated_at, updated_by FROM translations ORDER BY key_name COLLATE "C", language_code')->fetchAll(PDO::FETCH_ASSOC)
        as $row
    ) {
        $strings[$row['key_name']][$row['language_code']] = [$row['value'], $row['updated_at'], $row['updated_by'] === null ? null : (int) $row['updated_by']];
    }

    return $strings;
}

/** A database as its owner left it before 009: everything before it, two people, and the owner's own wording of some of the kit's words. */
function database_before_009(string $suffix): PDO
{
    $pdo = database_before(LIBRARY_WORDS_MIGRATION, $suffix);
    // Reworded on the Translations page, by the two people, days ago.
    $reword = $pdo->prepare("UPDATE translations SET value = ?, updated_by = ?, updated_at = TIMESTAMPTZ '2026-10-09 08:30:00+00' WHERE key_name = ? AND language_code = ?");
    $reword->execute(['Light it is', 1, 'theme.light', 'en']);
    $reword->execute(['Tvoj účet v anotoki', 7, 'topbar.account', 'sk']);
    $reword->execute(['Prihlásiť', 1, 'signIn.button', 'sk']);
    $reword->execute(['Moje cvičenie', 1, 'nav.learn', 'sk']);
    // A language left without a string of its own on purpose (it reads the English).
    $pdo->exec("DELETE FROM translations WHERE key_name = 'topbar.menu' AND language_code = 'sk'");
    // A language of the owner's, with a string of a kit word.
    $pdo->exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', TRUE, 3)");
    $pdo->exec(
        "INSERT INTO translations (key_name, language_code, value, updated_by, updated_at) VALUES ('language.notLoaded', 'de', 'Die Sprache konnte nicht geladen werden.', 7, TIMESTAMPTZ '2026-10-10 18:00:00+00')",
    );

    return $pdo;
}

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

/**
 * tables_of_001() without what 010 added to them - users.anonymized_at, empty for everybody here - to hold what the
 * files before it made across an update that ran 010 too (010's own test holds the column).
 */
function without_anonymized_at(array $tables): array
{
    $tables['columns'] = array_values(array_filter($tables['columns'], static fn(array $column): bool => [$column['table_name'], $column['column_name']] !== ['users', 'anonymized_at']));
    $tables['rows of users'] = array_map(static function (array $row): array {
        $values = json_decode($row['row'], true);
        assert_same(null, $values['anonymized_at'] ?? null, "nobody anonymized: {$values['id']}");
        unset($values['anonymized_at']);

        return ['row' => json_encode($values, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
    }, $tables['rows of users']);

    return $tables;
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
    $own = array_values(array_filter($made['applied'], static fn(array $file): bool => $file['set'] === MIGRATIONS_SET));
    assert_same([$expected, null], [names_of($own), $made['failed']], "every migration before $migration");
    assert_same(admin_migrations(), array_slice($made['applied'], 0, count(admin_migrations())), 'the library\'s admin tools\' set first');
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
    assert_same(
        ['anotoki_admin', MIGRATIONS_SET, 'anotoki_translations', 'anotoki_people'],
        array_map(static fn(\Anotoki\Lib\Migrations\MigrationSet $set): string => $set->name, migrationSets()),
        'the library\'s admin tools\' set first, the app\'s own, then the library\'s words\' and people\'s',
    );
    assert_same(
        [
            '001_languages_and_strings.sql',
            '002_library_words.sql',
            '003_sign_in_words.sql',
            '004_feedback_words.sql',
            '005_legal_words.sql',
            '006_top_bar_words.sql',
            '007_kit_piece_words.sql',
            '008_tab_words.sql',
            '009_input_words.sql',
            '010_backups_where_words.sql',
            '011_privacy_words_made_true.sql',
            '012_footer_words.sql',
            '013_about_and_support_words.sql',
        ],
        library_migration_files(),
        'the library\'s words, as vendor/ has them (anotoki-lib 0.9.1)',
    );
    assert_same(['001_audit_log.sql', '002_feedback.sql'], library_migration_files(\Anotoki\Lib\Admin\Schema::migrationSet()), 'its admin tools\'');
    assert_same(['001_people.sql'], library_migration_files(\Anotoki\Lib\People\Schema::migrationSet()), 'its people\'s');
    assert_same(every_migration(), $migrator->applicable(), 'all of them waiting, in the order of the sets...');
    assert_false((bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn(), '...and nothing written to find out');

    $result = $migrator->apply();
    assert_same(['applied' => every_migration(), 'failed' => null, 'error' => null, 'busy' => false, 'note' => null], $result);
    assert_same(['anotoki_admin', MIGRATIONS_SET, 'anotoki_translations', 'anotoki_people'], array_values(array_unique(array_column($result['applied'], 'set'))), 'set by set, in their order');
    assert_same([], $migrator->applicable());
    assert_same([], databaseMigrator($pdo)->apply()['applied'], 'a second run applies nothing');
    foreach (
        [
            'users',
            'progress',
            'path_progress',
            'sessions',
            'imports',
            'languages',
            'translation_keys',
            'translations',
            'anotoki_audit_log',
            'anotoki_feedback',
            'anotoki_people_sync',
            'anotoki_people_anonymized',
        ]
        as $table
    ) {
        assert_true((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "the table $table");
    }
    // The record in the shape it always had: one row a file, in the order they ran - the library's named with its set.
    assert_same(
        ['id', 'filename', 'applied_at'],
        $pdo->query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'migrations' ORDER BY ordinal_position")->fetchAll(PDO::FETCH_COLUMN),
    );
    assert_same(array_map('migrationLabel', every_migration()), $pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
    assert_same(['anotoki_admin/001_audit_log.sql', 'anotoki_admin/002_feedback.sql'], array_slice($pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), 0, 2));
    assert_same(
        ['anotoki_translations/013_about_and_support_words.sql', 'anotoki_people/001_people.sql'],
        array_slice($pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), -2),
    );
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
        $process = proc_open(
            array_merge([PHP_BINARY, TEST_BACKEND . '/migration.php'], $arguments),
            [0 => ['file', $null, 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]],
            $pipes,
            TEST_BACKEND,
            ['PIANO_TEST_CONFIG' => $config] + getenv(),
        );
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
    $labels = array_map('migrationLabel', every_migration());
    foreach ($labels as $file) {
        assert_match('/  ' . preg_quote($file, '/') . ' \.\.\. done/', $out, $file);
    }
    assert_match('~  anotoki_translations/002_library_words\.sql \.\.\. done~', $out, 'the library\'s, named with their set');
    $pdo = server_pdo($name);
    assert_same($labels, $pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), 'every file, in order');

    [$code, $out] = $cli('--status');
    assert_same(0, $code, $out);
    assert_match('/  ' . count($labels) . ' applied, 0 pending/', $out);
    assert_match('~v anotoki_translations/001_languages_and_strings\.sql~', $out);

    // One taken off the record: --dry-run names it and applies nothing; the next run applies it, the one after nothing.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . PREFERENCES_MIGRATION . "'");
    [$code, $out] = $cli('--status');
    assert_match('/\. ' . preg_quote(PREFERENCES_MIGRATION, '/') . '   pending/', $out);
    [$code, $out] = $cli('--dry-run');
    assert_same(0, $code, $out);
    assert_match('/would apply ' . preg_quote(PREFERENCES_MIGRATION, '/') . '/', $out);
    assert_same(count($labels) - 1, (int) $pdo->query('SELECT count(*) FROM migrations')->fetchColumn(), 'nothing applied by it');
    [$code, $out] = $cli();
    assert_same(0, $code, $out);
    assert_match('/  ' . preg_quote(PREFERENCES_MIGRATION, '/') . ' \.\.\. done/', $out);
    [$code, $out] = $cli();
    assert_same(0, $code, $out);
    assert_match('/Up to date - ' . count($labels) . ' migrations\./', $out);
    $pdo = null;
});

test('a database from before the family\'s engine: its record is read as it is, then renamed in place', function (): void {
    $name = test_empty_db('legacy');
    $pdo = server_pdo($name);
    // What the app's own runner made (until 2026-09-28): the schema, and its record of it.
    $pdo->exec(migration_text('001_init.sql'));
    $pdo->exec('CREATE TABLE migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    $pdo->exec("INSERT INTO migrations (name, applied_at) VALUES ('001_init.sql', '2026-09-28 07:20:22+00')");
    $pdo->exec('INSERT INTO users (id) VALUES (1)');
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}')");

    // Such a database has 001 and nothing after it: what came later is still to do (the library's sets too - its admin
    // tools' first), 001 is not.
    $first = ['set' => MIGRATIONS_SET, 'name' => '001_init.sql'];
    $later = names_of(array_values(array_filter(every_migration(), static fn(array $file): bool => $file !== $first)));
    assert_true(legacyMigrationsTable($pdo));
    $status = databaseMigrator($pdo)->status();
    assert_same([['set' => MIGRATIONS_SET, 'name' => '001_init.sql', 'applied_at' => '2026-09-28T07:20:22Z']], $status['applied'], 'read without changing anything: 001 is known as applied, and when');
    assert_same($later, names_of($status['pending']));
    assert_true(legacyMigrationsTable($pdo), 'still as it was');

    $result = databaseMigrator($pdo)->apply();
    assert_same([$later, null], [names_of($result['applied']), $result['failed']], '001 is not run a second time');
    assert_false(legacyMigrationsTable($pdo), 'the column is filename now');
    assert_same(
        array_map('migrationLabel', [$first, ...array_values(array_filter(every_migration(), static fn(array $file): bool => $file !== $first))]),
        $pdo->query('SELECT filename FROM migrations ORDER BY applied_at, filename')->fetchAll(PDO::FETCH_COLUMN),
        'the library\'s in the same table, named with their set',
    );
    assert_same('2026-09-28 07:20:22+00', (string) $pdo->query("SELECT applied_at FROM migrations WHERE filename = '001_init.sql'")->fetchColumn(), 'when it ran, kept');
    assert_same([], databaseMigrator($pdo)->applicable());
    assert_same('{"60": {"midi": 60}}', (string) $pdo->query('SELECT notes::text FROM progress WHERE user_id = 1')->fetchColumn(), 'the progress untouched');
    $pdo = null;
});

test('a SQL file splits into statements, never inside a string, a comment or a $$ block (the family\'s splitter, as these files need it)', function (): void {
    $sql =
        "-- a comment; with a semicolon\nCREATE TABLE a (x text DEFAULT 'semi;colon');\n/* block; */ SELECT 1;\n" .
        "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$;\nSELECT 'it''s';";
    assert_same(["CREATE TABLE a (x text DEFAULT 'semi;colon')", 'SELECT 1', "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$", "SELECT 'it''s'"], Splitter::split($sql));
});

test('a migration that fails is rolled back whole and named with what PostgreSQL said - and it and every file after it wait', function (): void {
    $pdo = server_pdo(test_empty_db('fails'));
    $first = [...admin_migrations(), ['set' => MIGRATIONS_SET, 'name' => '001_init.sql']];
    assert_same($first, test_migrate($pdo, '001_init.sql')['applied']);
    // A table 002 makes, there already in another shape: 002 stops at its first insert.
    $pdo->exec('CREATE TABLE languages (code TEXT PRIMARY KEY)');
    $result = databaseMigrator($pdo)->apply();
    assert_same([[], ['set' => MIGRATIONS_SET, 'name' => '002_languages_and_translations.sql']], [$result['applied'], $result['failed']]);
    assert_match('/^statement \d+ of \d+: SQLSTATE\[42703\]: .*column "name" of relation "languages" does not exist/', (string) $result['error'], 'what PostgreSQL said');
    assert_true(str_contains((string) $result['error'], "\n\n  INSERT INTO languages (code, name, native_name, sort_order) VALUES"), 'and the statement\'s first lines');
    assert_same(array_map('migrationLabel', $first), $pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), 'nothing of it recorded');
    assert_false((bool) $pdo->query("SELECT to_regclass('translation_keys') IS NOT NULL")->fetchColumn(), 'nor made');
    assert_same(
        array_values(array_filter(every_migration(), static fn(array $file): bool => !in_array($file, $first, true))),
        databaseMigrator($pdo)->applicable(),
        'still to do - the library\'s sets after it too',
    );
    assert_same(0, advisory_locks($pdo), 'the lock was let go');
    $pdo = null;
});

test('004 adds the generation of each person\'s progress - a sequence and one column on users - and changes nothing else of 001', function (): void {
    $pdo = database_before_004('before_004');
    $before = tables_of_001($pdo);
    assert_same([FAMILY_MIGRATION], names_of(test_migrate($pdo, FAMILY_MIGRATION)['applied']));
    $after = tables_of_001($pdo);

    $added = array_values(array_filter($after['columns'], static fn(array $column): bool => !in_array($column, $before['columns'], true)));
    assert_same(
        [['table_name' => 'users', 'column_name' => 'progress_generation', 'data_type' => 'bigint', 'is_nullable' => 'NO', 'column_default' => "nextval('progress_generation'::regclass)"]],
        $added,
        'one column',
    );
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
        'the users rows as they were, but for their number',
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
    assert_same(
        [['table_name' => 'users', 'column_name' => 'visitor_key_hash', 'data_type' => 'character', 'is_nullable' => 'YES', 'column_default' => null]],
        $added,
        'one column, null for everybody',
    );
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
        'the users rows as they were, with no key',
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
    // Up to 008: 004's gate asks for language.button's description, and from 009 on that word is the library's
    // (anotoki.language.button) - 004 never runs again over 009. 005, which the browser check's tour takes off the
    // record, does: below, over everything.
    $pdo = server_pdo(test_empty_db('again'));
    assert_same(null, test_migrate($pdo, THEME_SWITCH_MIGRATION)['failed']);
    $pdo->exec("INSERT INTO users (id, preferred_username) VALUES (1, 'owner')");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}')");
    $visitor = insert_visitor($pdo);
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES ($visitor, '{\"62\": {\"midi\": 62}}')");
    $pdo->exec("INSERT INTO sessions (user_id, id, data) VALUES ($visitor, 'v', '{\"mode\": \"trainer\"}')");
    $pdo->exec("INSERT INTO visitor_starts (address) VALUES ('198.51.100.7')");
    $before = tables_of_001($pdo);
    $starts = $pdo->query('SELECT address FROM visitor_starts')->fetchAll(PDO::FETCH_COLUMN);

    // As the browser check's "database behind" tour does: taken off the record, then applied again (009 and after held back).
    $pdo->exec("DELETE FROM migrations WHERE filename IN ('" . FAMILY_MIGRATION . "', '" . VISITORS_MIGRATION . "')");
    assert_same([FAMILY_MIGRATION, VISITORS_MIGRATION], array_slice(names_of(databaseMigrator($pdo)->applicable()), 0, 2));
    $again = test_migrate($pdo, THEME_SWITCH_MIGRATION);
    assert_same([[FAMILY_MIGRATION, VISITORS_MIGRATION], null, null], [names_of($again['applied']), $again['failed'], $again['error']]);
    assert_same($before, tables_of_001($pdo), 'every table of 001 as it was, the visitor\'s rows too');
    assert_same($starts, $pdo->query('SELECT address FROM visitor_starts')->fetchAll(PDO::FETCH_COLUMN));
    assert_same(-2, insert_visitor($pdo), 'the sequence goes on where it was');

    // 005 alone again, as the tour takes it off the record - over a database with every migration, the library's too.
    assert_same(files_from(LIBRARY_WORDS_MIGRATION), databaseMigrator($pdo)->apply()['applied'], 'the rest, 009 and after, and the library\'s sets');
    $before = tables_of_001($pdo);
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . VISITORS_MIGRATION . "'");
    assert_same([VISITORS_MIGRATION], names_of(databaseMigrator($pdo)->apply()['applied']));
    assert_same($before, tables_of_001($pdo), 'nothing of anybody\'s changes');
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
    assert_same(
        array_values(array_filter($stringsBefore, static fn(array $row): bool => !in_array($row['key_name'], ROUND_BUTTON_KEYS, true))),
        $strings(),
        'their strings with them - every other string as it was, the owner\'s wording too',
    );
    $after = $descriptions();
    foreach (THEME_SWITCH_KEYS as $key) {
        assert_true(
            $after[$key] !== $descriptionsBefore[$key] && str_contains($after[$key], 'theme switch') && !str_contains($after[$key], 'round theme button'),
            "$key: its description tells of the switch",
        );
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

test('009 says it is finished and how the owner applies it, and is words only: two tables of its own, the copies, the delete, a description, its gate', function (): void {
    // What it may write is held by tests/unit/translations.test.php too (only the three tables of the words, nobody's progress).
    $sql = migration_text(LIBRARY_WORDS_MIGRATION);
    assert_match('/-- Finished \(2026-10-11\)\. The owner applies it with 005, 006, 007 and 008\s+-- at the hand-over \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/anotoki_translations: 001_languages_and_strings\.sql,\s+-- 002_library_words\.sql\) run right after it, in the same Apply/', $sql, 'and that the library\'s two files come with it');
    assert_match('/Once applied it never changes: the next\s+-- change is 010\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_same(7, count($statements), 'the two tables of its own, the keys, the strings, the delete, the description and the gate - nothing else');
    assert_match('/^CREATE TEMPORARY TABLE kit_keys ON COMMIT DROP AS/', $statements[0]);
    assert_match('/^CREATE TEMPORARY TABLE kit_words ON COMMIT DROP AS/', $statements[1]);
    assert_match('/^INSERT INTO translation_keys \(name, description\)\s+SELECT library_key/', $statements[2]);
    assert_match(
        '/^INSERT INTO translations \(key_name, language_code, value, updated_at, updated_by\)\s+SELECT library_key, language_code, value, updated_at, updated_by\s+FROM kit_words\s+ON CONFLICT \(key_name, language_code\) DO NOTHING$/',
        $statements[3],
        'every string as it is, never over one that is there',
    );
    assert_same('DELETE FROM translation_keys WHERE name IN (SELECT own_key FROM kit_keys WHERE moves)', $statements[4]);
    assert_match("/^UPDATE translation_keys SET description = '[^\\n]*'\\s+WHERE name = 'signIn\\.button'$/", $statements[5]);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[6], 'it ends with its gate');

    // The keys it names are the ones the frontend's kit words were (KIT_WORDS), each under its library key - and every
    // library key is one the library has.
    preg_match_all("/^\\s*\\('([^']+)', '(anotoki\\.[^']+)', (TRUE|FALSE)\\)/m", $statements[0], $rows, PREG_SET_ORDER);
    assert_same(KIT_WORDS, array_combine(array_column($rows, 1), array_column($rows, 2)));
    assert_same(KIT_WORDS_KEPT, array_column(array_filter($rows, static fn(array $row): bool => $row[3] === 'FALSE'), 1), 'two stay this app\'s');
    assert_same([], array_values(array_diff(KIT_WORDS, LibraryWords::keys())), 'every one a key of the library\'s');
});

test(
    '009 on a database as its owner left it: every string the kit said goes under the library\'s key - every language, the owner\'s wording, who and when - and the library\'s own file leaves them be',
    function (): void {
        $pdo = database_before_009('before_009');
        $before = strings_of($pdo);
        $tablesBefore = tables_of_001($pdo);
        $languagesBefore = $pdo->query('SELECT * FROM languages ORDER BY code')->fetchAll(PDO::FETCH_ASSOC);
        assert_same(['Light it is', '2026-10-09 08:30:00+00', 1], $before['theme.light']['en'], 'the owner\'s wording, there before');
        assert_false(isset($before['topbar.menu']['sk']), 'and a language left without a string');
        assert_same([], array_values(array_filter(array_keys($before), static fn(string $key): bool => str_starts_with($key, 'anotoki.'))), 'no library key yet');

        $result = test_migrate($pdo);
        assert_same([files_from(LIBRARY_WORDS_MIGRATION), null], [$result['applied'], $result['failed']], '009 and after, then the library\'s files' . (string) $result['error']);
        $after = strings_of($pdo);

        // Under the library's key: every string of this app's key as it was - the owner's wording, the language left
        // blank (no string: it reads the English, as before), the owner's own language too - with who saved it and when.
        foreach (KIT_WORDS as $own => $library) {
            assert_same($before[$own], $after[$library] ?? null, "$own -> $library");
        }
        assert_same(['Light it is', '2026-10-09 08:30:00+00', 1], $after['anotoki.theme.light']['en']);
        assert_same(['Tvoj účet v anotoki', '2026-10-09 08:30:00+00', 7], $after['anotoki.topbar.account']['sk']);
        assert_same(['Die Sprache konnte nicht geladen werden.', '2026-10-10 18:00:00+00', 7], $after['anotoki.language.notLoaded']['de']);
        assert_same(['en'], array_keys($after['anotoki.topbar.menu']), 'no Slovak written for it: the library writes only for a key that has none');

        // The kit's keys that go are gone; the two this app's pages ask for keep what they had.
        $moved = array_values(array_diff(array_keys(KIT_WORDS), KIT_WORDS_KEPT));
        $keys = $pdo->query('SELECT name FROM translation_keys')->fetchAll(PDO::FETCH_COLUMN);
        assert_same([], array_values(array_intersect($moved, $keys)), 'the keys only the kit asked for, gone');
        foreach (KIT_WORDS_KEPT as $own) {
            assert_same($before[$own], $after[$own], "$own stays as it was");
        }
        assert_same(['Prihlásiť', '2026-10-09 08:30:00+00', 1], $after['signIn.button']['sk']);
        assert_match('/anotoki\.topbar\.signIn/', (string) $pdo->query("SELECT description FROM translation_keys WHERE name = 'signIn.button'")->fetchColumn(), 'and told of the bar\'s own Sign in');

        // Every other string of this app's as it was - the owner's own wording of one too. (011, 012 and 013, which ran after
        // it, took the sign-in card's words, wrote the legal pages' and took the old footer's: their own tests below.)
        $others = static fn(array $strings): array => array_diff_key(
            $strings,
            array_flip($moved),
            array_flip([...array_keys(SIGN_IN_WORDS), ...SIGN_IN_CARD_KEYS]),
            array_flip(array_filter(array_keys($strings), static fn(string $key): bool => str_starts_with($key, 'anotoki.') || written_by_012($key) || written_by_013($key))),
        );
        assert_same($others($before), $others($after), 'no other string of this app\'s changed');
        assert_same(['Moje cvičenie', '2026-10-09 08:30:00+00', 1], $after['nav.learn']['sk']);

        // The library's other keys, with its own words in English and Slovak - by nobody - and the library's descriptions on all of them.
        $library = LibraryWords::all();
        assert_same(array_keys($library), array_values(array_filter(array_keys($library), static fn(string $key): bool => isset($after[$key]['en']))), 'every library key, with its English');
        foreach (array_diff(array_keys($library), KIT_WORDS, SIGN_IN_WORDS) as $key) {
            assert_same($library[$key]['en'], $after[$key]['en'][0] ?? null, "$key: the library's English");
            assert_same($library[$key]['sk'], $after[$key]['sk'][0] ?? null, "$key: the library's Slovak");
            assert_same([null, null], [$after[$key]['en'][2], $after[$key]['sk'][2]], "$key: by nobody");
            assert_false(isset($after[$key]['de']), "$key: nothing in the owner's own language");
        }
        $descriptions = $pdo->query("SELECT name, description FROM translation_keys WHERE name LIKE 'anotoki.%'")->fetchAll(PDO::FETCH_KEY_PAIR);
        foreach ($library as $key => $entry) {
            assert_same($entry['description'], $descriptions[$key] ?? null, "$key: the library's description");
        }

        // Nothing else: the languages, and nobody's progress.
        assert_same($languagesBefore, $pdo->query('SELECT * FROM languages ORDER BY code')->fetchAll(PDO::FETCH_ASSOC), 'the languages as they were');
        assert_same(without_anonymized_at($tablesBefore), without_anonymized_at(tables_of_001($pdo)), 'nobody\'s progress touched (010 ran after it)');
        $pdo = null;
    },
);

test('009 runs again and holds, leaving the owner\'s later wording be - and refuses, rolling back whole, a string it could not move as it was', function (): void {
    $pdo = database_before_009('again_009');
    assert_same(null, test_migrate($pdo)['failed']);

    // Afterwards the owner rewords the library's "Loading…" apart from this app's own - and 009 runs again.
    $pdo->exec("UPDATE translations SET value = 'Loading, one moment…', updated_by = 1 WHERE key_name = 'anotoki.ui.loading' AND language_code = 'en'");
    $before = strings_of($pdo);
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . LIBRARY_WORDS_MIGRATION . "'");
    assert_same([LIBRARY_WORDS_MIGRATION], names_of(test_migrate($pdo)['applied']), 'its gate holds over its own work');
    assert_same($before, strings_of($pdo), 'nothing changed - the owner\'s later wording neither');
    assert_same('Loading, one moment…', $before['anotoki.ui.loading']['en'][0]);

    // A library key with other words than this app's before 009 runs (the library's own file applied first - which
    // the order of the sets never does): the string of this app's would be lost, so the gate refuses, and nothing
    // of 009 stays - not the copies, not the delete, not the description.
    $pdo = database_before_009('refused_009');
    $pdo->exec("INSERT INTO translation_keys (name) VALUES ('anotoki.theme.light')");
    $pdo->exec("INSERT INTO translations (key_name, language_code, value) VALUES ('anotoki.theme.light', 'en', 'Light')");
    $before = strings_of($pdo);
    $description = $pdo->query("SELECT description FROM translation_keys WHERE name = 'signIn.button'")->fetchColumn();
    $refused = test_migrate($pdo);
    assert_same(LIBRARY_WORDS_MIGRATION, $refused['failed']['name'] ?? null);
    assert_same([], $refused['applied']);
    assert_match('/strings that did not move under the library\'s keys as they were: anotoki\.theme\.light \(en\)/', (string) $refused['error']);
    assert_same(
        [],
        $pdo->query("SELECT filename FROM migrations WHERE filename LIKE '009%' OR filename LIKE 'anotoki_translations/%'")->fetchAll(),
        'not recorded as applied - and the library\'s files wait behind it',
    );
    assert_same($before, strings_of($pdo), 'every string as it was, the kit\'s keys too');
    assert_same($description, $pdo->query("SELECT description FROM translation_keys WHERE name = 'signIn.button'")->fetchColumn(), 'the description rolled back with it');
    assert_same(
        [false, false],
        [(bool) $pdo->query("SELECT to_regclass('pg_temp.kit_keys') IS NOT NULL")->fetchColumn(), (bool) $pdo->query("SELECT to_regclass('pg_temp.kit_words') IS NOT NULL")->fetchColumn()],
        'its own tables gone with it',
    );
    $pdo = null;
});

/* ------------------------------------------------------- anotoki-lib 0.4.1: 010 and 011 */

/**
 * A database as an installed one stood before this update - the sets anotoki-lib 0.3 had (the app's own and the
 * library's words; no admin tools', no people's), the app's files up to and with $through and the library's words up
 * to and with $wordsThrough - with two people, their progress and (from 005 on) a visitor.
 */
function database_as_installed(string $suffix, string $through, ?string $wordsThrough): PDO
{
    $pdo = server_pdo(test_empty_db($suffix));
    $made = test_migrate_as_installed($pdo, $through, $wordsThrough);
    assert_same(null, $made['failed'], (string) $made['error']);
    assert_false((bool) $pdo->query("SELECT to_regclass('anotoki_audit_log') IS NOT NULL")->fetchColumn(), 'none of the library\'s admin tools\' tables yet');
    $pdo->exec("INSERT INTO users (id, preferred_username) VALUES (1, 'owner'), (7, NULL)");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60}}'), (7, '{}')");
    $pdo->exec("INSERT INTO path_progress (user_id, data) VALUES (1, '{\"steps\": {\"rh-1/meet\": {\"attempts\": 1}}}')");
    $pdo->exec("INSERT INTO sessions (user_id, id, request_key, data) VALUES (1, 'a', 'key-1', '{\"mode\": \"lesson\"}'), (7, 'b', NULL, '{\"mode\": \"trainer\"}')");
    if ((bool) $pdo->query("SELECT to_regclass('visitor_ids') IS NOT NULL")->fetchColumn()) {
        $visitor = insert_visitor($pdo);
        $pdo->exec("INSERT INTO sessions (user_id, id, data) VALUES ($visitor, 'v', '{\"mode\": \"trainer\"}')");
    }

    return $pdo;
}

/** The library's files of these sets, in the order they run. */
function library_files_of(string ...$sets): array
{
    return array_values(array_filter(every_migration(), static fn(array $file): bool => in_array($file['set'], $sets, true)));
}

test('010 says it is finished and how the owner applies it, and adds users.anonymized_at - one column, nothing else, no row changed - on a database as the owner\'s is', function (): void {
    $sql = migration_text(PEOPLE_MIGRATION);
    assert_match('/-- Finished \(2026-10-11\)\. The owner applies it with 005 to 009 and 011 at\s+-- the hand-over \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once applied it\s+-- never changes: the next change is 011\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_same(2, count($statements), 'the column and the gate - nothing else');
    assert_same('ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at timestamptz', $statements[0]);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[1], 'it ends with its gate');

    // As the owner's database is after the last hand-over: the app's files up to 009, the library's words up to 002.
    $pdo = database_as_installed('installed_010', LIBRARY_WORDS_MIGRATION, '002_library_words.sql');
    $before = tables_of_001($pdo);
    $result = databaseMigrator($pdo)->apply();
    $newerWords = array_values(
        array_filter(library_files_of('anotoki_translations'), static fn(array $file): bool => !in_array($file['name'], ['001_languages_and_strings.sql', '002_library_words.sql'], true)),
    );
    assert_same(
        [
            [
                ...library_files_of('anotoki_admin'),
                ['set' => MIGRATIONS_SET, 'name' => PEOPLE_MIGRATION],
                ['set' => MIGRATIONS_SET, 'name' => SIGN_IN_WORDS_MIGRATION],
                ['set' => MIGRATIONS_SET, 'name' => LEGAL_PAGES_MIGRATION],
                ['set' => MIGRATIONS_SET, 'name' => FOOTER_WORDS_MIGRATION],
                ...$newerWords,
                ...library_files_of('anotoki_people'),
            ],
            null,
        ],
        [$result['applied'], $result['failed']],
        'the library\'s admin tools\' set, 010 to 013, the library\'s newer words and its people - in that order' . (string) $result['error'],
    );
    assert_same('003_sign_in_words.sql', $newerWords[0]['name'] ?? null, 'the library\'s words from its 003 on');
    $after = tables_of_001($pdo);
    $added = array_values(array_filter($after['columns'], static fn(array $column): bool => !in_array($column, $before['columns'], true)));
    assert_same(
        [['table_name' => 'users', 'column_name' => 'anonymized_at', 'data_type' => 'timestamp with time zone', 'is_nullable' => 'YES', 'column_default' => null]],
        $added,
        'one column, that may be empty',
    );
    assert_same($before['columns'], array_values(array_filter($after['columns'], static fn(array $column): bool => $column['column_name'] !== 'anonymized_at')), 'every other column as it was');
    foreach (['constraints', 'indexes', 'rows of progress', 'rows of path_progress', 'rows of sessions', 'rows of imports'] as $part) {
        assert_same($before[$part], $after[$part], $part);
    }
    assert_same(
        array_map(static fn(array $row): array => json_decode($row['row'], true), $before['rows of users']),
        array_map(static fn(array $row): array => array_diff_key(json_decode($row['row'], true), ['anonymized_at' => 0]), $after['rows of users']),
        'every users row as it was - visitors too',
    );
    assert_same(0, (int) $pdo->query('SELECT count(*) FROM users WHERE anonymized_at IS NOT NULL')->fetchColumn(), 'nobody anonymized by it');
    // The library's own tables, made by its sets: where the scrub stands (one row), the ids it scrubbed, the audit log, feedback.
    assert_same(
        [1, 0, 0, 0],
        [
            (int) $pdo->query('SELECT count(*) FROM anotoki_people_sync')->fetchColumn(),
            (int) $pdo->query('SELECT count(*) FROM anotoki_people_anonymized')->fetchColumn(),
            (int) $pdo->query('SELECT count(*) FROM anotoki_audit_log')->fetchColumn(),
            (int) $pdo->query('SELECT count(*) FROM anotoki_feedback')->fetchColumn(),
        ],
    );

    // Taken off the record and applied again over somebody the IAM deleted: the gate holds, nothing changes.
    $pdo->exec("UPDATE users SET preferred_username = 'deleted-7', anonymized_at = '2026-11-06 10:00:00+00' WHERE id = 7");
    $state = tables_of_001($pdo);
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . PEOPLE_MIGRATION . "'");
    assert_same([PEOPLE_MIGRATION], names_of(databaseMigrator($pdo)->apply()['applied']));
    assert_same($state, tables_of_001($pdo), 'again: nothing changed');

    // A visitor's row that says the IAM deleted it - the IAM knows no visitor: the gate refuses, and it is not recorded.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . PEOPLE_MIGRATION . "'");
    $pdo->exec('UPDATE users SET anonymized_at = now() WHERE id < 0');
    $refused = databaseMigrator($pdo)->apply();
    assert_same(PEOPLE_MIGRATION, $refused['failed']['name'] ?? null);
    assert_match('/a visitor\'s row says the IAM deleted it/', (string) $refused['error']);
    assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . PEOPLE_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
    $pdo = null;
});

test('011 says it is finished and how the owner applies it, and is words only: two tables of its own, the keys, the strings, the delete, a description, its gate', function (): void {
    // What it may write is held by tests/unit/translations.test.php too (only the three tables of the words, nobody's progress).
    $sql = migration_text(SIGN_IN_WORDS_MIGRATION);
    assert_match('/-- Finished \(2026-10-11\)\. The owner applies it with 005 to 010 at the\s+-- hand-over \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once applied it never changes: the next change is 012\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_same(7, count($statements), 'the two tables of its own, the keys, the strings, the delete, the description and the gate - nothing else');
    assert_match('/^CREATE TEMPORARY TABLE sign_in_keys ON COMMIT DROP AS/', $statements[0]);
    assert_match('/^CREATE TEMPORARY TABLE sign_in_words ON COMMIT DROP AS/', $statements[1]);
    assert_match('/^INSERT INTO translation_keys \(name, description\)\s+SELECT library_key/', $statements[2]);
    assert_match(
        '/^INSERT INTO translations \(key_name, language_code, value, updated_at, updated_by\)\s+SELECT library_key, language_code, value, updated_at, updated_by\s+FROM sign_in_words\s+ON CONFLICT \(key_name, language_code\) DO UPDATE\s+SET value = EXCLUDED\.value, updated_at = EXCLUDED\.updated_at, updated_by = EXCLUDED\.updated_by\s+WHERE translations\.updated_by IS NULL$/',
        $statements[3],
        'every string as it is - over a migration\'s, never over a person\'s',
    );
    assert_same("DELETE FROM translation_keys WHERE name IN ('signIn.notCompleted', 'signIn.storageUnavailable', 'signIn.failed', 'signIn.title', 'signIn.text')", $statements[4]);
    assert_match("/^UPDATE translation_keys SET description = '[^\\n]*'\\s+WHERE name = 'signIn\\.button'$/", $statements[5]);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[6], 'it ends with its gate');

    preg_match_all("/^\\s*\\('([^']+)', '(anotoki\\.[^']+)'\\)/m", $statements[0], $rows, PREG_SET_ORDER);
    assert_same(SIGN_IN_WORDS, array_combine(array_column($rows, 1), array_column($rows, 2)), 'the card\'s three failure words, each under its library key');
    assert_same([], array_values(array_diff(SIGN_IN_WORDS, LibraryWords::keys())), 'every one a key of the library\'s');
});

test(
    '011 on a database as the owner\'s is: the failure words under the library\'s keys - every language, the owner\'s wording, who and when - the card\'s own gone, and the library\'s 003 leaves them be',
    function (): void {
        $pdo = database_as_installed('installed_011', LIBRARY_WORDS_MIGRATION, '002_library_words.sql');
        // Reworded on the Translations page, by the two people, days ago - and a language of the owner's own.
        $reword = $pdo->prepare("UPDATE translations SET value = ?, updated_by = ?, updated_at = TIMESTAMPTZ '2026-10-09 08:30:00+00' WHERE key_name = ? AND language_code = ?");
        $reword->execute(['Not signed in: maybe this account has no Piano Academy.', 1, 'signIn.notCompleted', 'en']);
        $reword->execute(['Prihlásenie zlyhalo ({code}).', 7, 'signIn.failed', 'sk']);
        $reword->execute(['Prihlásiť', 1, 'signIn.button', 'sk']);
        $pdo->exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', TRUE, 3)");
        $pdo->exec(
            "INSERT INTO translations (key_name, language_code, value, updated_by, updated_at) VALUES ('signIn.storageUnavailable', 'de', 'Dieser Browser speichert nichts.', 7, TIMESTAMPTZ '2026-10-10 18:00:00+00')",
        );
        $before = strings_of($pdo);
        $tablesBefore = tables_of_001($pdo);
        $description = static fn(string $key): mixed => $pdo->query('SELECT description FROM translation_keys WHERE name = ' . $pdo->quote($key))->fetchColumn();
        assert_same(['Not signed in: maybe this account has no Piano Academy.', '2026-10-09 08:30:00+00', 1], $before['signIn.notCompleted']['en'], 'the owner\'s wording, there before');
        assert_false(isset($before['anotoki.signIn.notCompleted']), 'no library key of the sign-in page\'s yet');

        $result = databaseMigrator($pdo)->apply();
        assert_same(null, $result['failed'], (string) $result['error']);
        $after = strings_of($pdo);

        // Under the library's key: every string of this app's as it was - the owner's wording, their own language too - with
        // who saved it and when; and the library's own file after it left them be (a string only for a key that has none).
        foreach (SIGN_IN_WORDS as $own => $library) {
            assert_same($before[$own], $after[$library] ?? null, "$own -> $library");
        }
        assert_same(['Dieser Browser speichert nichts.', '2026-10-10 18:00:00+00', 7], $after['anotoki.signIn.storageUnavailable']['de']);
        // The card's words and the three that moved are gone, every string of them; Sign in stays with its own.
        $keys = $pdo->query('SELECT name FROM translation_keys')->fetchAll(PDO::FETCH_COLUMN);
        assert_same([], array_values(array_intersect([...array_keys(SIGN_IN_WORDS), ...SIGN_IN_CARD_KEYS], $keys)), 'the five keys gone');
        assert_same($before['signIn.button'], $after['signIn.button'], 'signIn.button keeps its strings, the owner\'s wording too');
        assert_true(
            str_contains((string) $description('signIn.button'), 'anotoki.signIn.*') && !str_contains((string) $description('signIn.button'), 'sign-in card'),
            'and is told of the library\'s screen',
        );
        // The library's descriptions on its keys, and its own words where this app had none to give (the screen's others).
        foreach ([...array_values(SIGN_IN_WORDS), 'anotoki.signIn.failedTitle', 'anotoki.signIn.retry'] as $library) {
            assert_same(LibraryWords::all()[$library]['description'], $description($library), "$library: the library's description");
        }
        assert_true(isset($after['anotoki.signIn.retry']['en']), 'the screen\'s other words: there');
        assert_same(
            [LibraryWords::all()['anotoki.signIn.retry']['en'], null],
            [$after['anotoki.signIn.retry']['en'][0], $after['anotoki.signIn.retry']['en'][2]],
            'the screen\'s other words: the library\'s, by nobody',
        );

        // Every other string of this app's as it was (but 012's and 013's, which ran after it: their own tests); nobody's
        // progress touched.
        $others = static fn(array $strings): array => array_diff_key(
            $strings,
            array_flip([...array_keys(SIGN_IN_WORDS), ...SIGN_IN_CARD_KEYS]),
            array_flip(array_filter(array_keys($strings), static fn(string $key): bool => str_starts_with($key, 'anotoki.') || written_by_012($key) || written_by_013($key))),
        );
        assert_same($others($before), $others($after), 'no other string of this app\'s changed');
        assert_same(without_anonymized_at($tablesBefore), without_anonymized_at(tables_of_001($pdo)), 'nobody\'s progress touched (010 ran with it)');

        // Taken off the record and applied again: its gate holds over its own work, and nothing changes.
        $strings = strings_of($pdo);
        $pdo->exec("DELETE FROM migrations WHERE filename = '" . SIGN_IN_WORDS_MIGRATION . "'");
        assert_same([SIGN_IN_WORDS_MIGRATION], names_of(databaseMigrator($pdo)->apply()['applied']));
        assert_same($strings, strings_of($pdo), 'again: nothing changed');
        $pdo = null;
    },
);

test('011 on the owner\'s database of today (004 its last) and after the library\'s 003: this app\'s wording either way - never over a person\'s', function (): void {
    // Today's: 005 to 009 and every library file wait, and run in the sets' order - 011 before the library's 003.
    $pdo = database_as_installed('today_011', FAMILY_MIGRATION, null);
    $pdo->exec(
        "UPDATE translations SET value = 'Signing in stopped: the account was turned away, or you went back.', updated_by = 1, updated_at = TIMESTAMPTZ '2026-10-09 08:30:00+00' WHERE key_name = 'signIn.notCompleted' AND language_code = 'en'",
    );
    $before = strings_of($pdo);
    $result = databaseMigrator($pdo)->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    assert_same(
        array_values(array_filter(every_migration(), static fn(array $file): bool => $file['set'] !== MIGRATIONS_SET || strnatcmp($file['name'], FAMILY_MIGRATION) > 0)),
        $result['applied'],
        'everything that waited, set by set',
    );
    $after = strings_of($pdo);
    foreach (SIGN_IN_WORDS as $own => $library) {
        assert_same($before[$own], $after[$library] ?? null, "$own -> $library");
    }
    $pdo = null;

    // A database that took the library's 003 before 011 (its strings of the sign-in page written by nobody), and a
    // person's own rewording of one of them since: this app's strings take the place of the migration's, never of the person's.
    $pdo = database_as_installed('after_003_011', PEOPLE_MIGRATION, '003_sign_in_words.sql');
    $pdo->exec(
        "UPDATE translations SET value = 'Signing in failed, code {code}.', updated_by = 7, updated_at = TIMESTAMPTZ '2026-10-10 12:00:00+00' WHERE key_name = 'anotoki.signIn.failed' AND language_code = 'en'",
    );
    $before = strings_of($pdo);
    assert_same(
        [LibraryWords::all()['anotoki.signIn.notCompleted']['en'], null],
        [$before['anotoki.signIn.notCompleted']['en'][0], $before['anotoki.signIn.notCompleted']['en'][2]],
        'the library\'s, by nobody',
    );
    $result = databaseMigrator($pdo)->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    $after = strings_of($pdo);
    assert_same($before['signIn.notCompleted']['en'], $after['anotoki.signIn.notCompleted']['en'], 'this app\'s wording in the migration\'s place');
    assert_same($before['signIn.storageUnavailable']['sk'], $after['anotoki.signIn.storageUnavailable']['sk']);
    assert_same(['Signing in failed, code {code}.', '2026-10-10 12:00:00+00', 7], $after['anotoki.signIn.failed']['en'], 'the person\'s own wording stays');
    assert_same($before['signIn.failed']['sk'], $after['anotoki.signIn.failed']['sk'], 'and this app\'s where the person wrote nothing');
    $pdo = null;
});

test('011 refuses, rolling back whole, when a word of the card would stay - nothing of it is left', function (): void {
    $pdo = database_as_installed('refused_011', LIBRARY_WORDS_MIGRATION, '002_library_words.sql');
    // A key of the card that will not go (only something outside the migrations could hold it): the gate refuses.
    $pdo->exec("CREATE FUNCTION keep_card() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN IF OLD.name = 'signIn.title' THEN RETURN NULL; END IF; RETURN OLD; END \$\$");
    $pdo->exec('CREATE TRIGGER keep_card BEFORE DELETE ON translation_keys FOR EACH ROW EXECUTE FUNCTION keep_card()');
    $before = strings_of($pdo);
    $description = $pdo->query("SELECT description FROM translation_keys WHERE name = 'signIn.button'")->fetchColumn();
    $refused = databaseMigrator($pdo)->apply();
    assert_same(SIGN_IN_WORDS_MIGRATION, $refused['failed']['name'] ?? null);
    assert_match('/a key or a string of the sign-in card is still there/', (string) $refused['error']);
    assert_same(
        [],
        $pdo->query("SELECT filename FROM migrations WHERE filename = '" . SIGN_IN_WORDS_MIGRATION . "' OR filename LIKE 'anotoki_people/%'")->fetchAll(),
        'not recorded as applied - and the library\'s files wait behind it',
    );
    assert_same($before, strings_of($pdo), 'every string as it was: no copy, no delete');
    assert_same($description, $pdo->query("SELECT description FROM translation_keys WHERE name = 'signIn.button'")->fetchColumn(), 'the description rolled back with it');
    assert_same(0, (int) $pdo->query("SELECT count(*) FROM translation_keys WHERE name LIKE 'anotoki.signIn.%'")->fetchColumn(), 'no library key left made');
    assert_same(
        [false, false],
        [(bool) $pdo->query("SELECT to_regclass('pg_temp.sign_in_keys') IS NOT NULL")->fetchColumn(), (bool) $pdo->query("SELECT to_regclass('pg_temp.sign_in_words') IS NOT NULL")->fetchColumn()],
        'its own tables gone with it',
    );
    $pdo = null;
});

test('012 says it is finished and how the owner applies it, and is words only: the keys, their English and Slovak, a description, the old What\'s new sentence deleted, its gate', function (): void {
    // What it may write is held by tests/unit/translations.test.php (only the three tables of the words, nobody's progress).
    $sql = migration_text(LEGAL_PAGES_MIGRATION);
    assert_match('/-- Finished \(2026-10-18\)\. The owner applies it with 005 to 011 at the\s+-- hand-over \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
    assert_match('/Once applied it never\s+-- changes: the next change is 013\./', $sql, 'and that it is then frozen');
    $statements = Splitter::split($sql);
    assert_same(6, count($statements), 'the keys, the English, the Slovak, a description, the delete and the gate - nothing else');
    assert_match('/^INSERT INTO translation_keys \(name, description\) VALUES/', $statements[0]);
    assert_match("/^INSERT INTO translations \(key_name, language_code, value\)\s+SELECT v\.key_name, 'en'/", $statements[1]);
    assert_match("/^INSERT INTO translations \(key_name, language_code, value\)\s+SELECT v\.key_name, 'sk'/", $statements[2]);
    assert_match("/^UPDATE translation_keys SET description = '[^\n]*'\s+WHERE name = 'brand\.area'$/", $statements[3]);
    assert_same("DELETE FROM translation_keys WHERE name IN ('whatsNew.notLoaded')", $statements[4]);
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[5], 'it ends with its gate');

    // What it does on a database built through 011: its keys in, the old sentence out with its strings - an owner's
    // rewording of it too -, every table of 001 as it was; again, and its gate holds.
    $pdo = database_before(LEGAL_PAGES_MIGRATION, 'before_012');
    $pdo->exec("UPDATE translations SET value = 'The list could not be fetched.', updated_by = 7 WHERE key_name = 'whatsNew.notLoaded' AND language_code = 'en'");
    $tablesBefore = tables_of_001($pdo);
    assert_same(1, (int) $pdo->query("SELECT count(*) FROM translation_keys WHERE name = 'whatsNew.notLoaded'")->fetchColumn(), 'the old sentence, there before');
    assert_same([LEGAL_PAGES_MIGRATION], names_of(array_values(array_filter(test_migrate($pdo, LEGAL_PAGES_MIGRATION)['applied'], static fn(array $file): bool => $file['set'] === MIGRATIONS_SET))));
    assert_same(
        [0, 0],
        [
            (int) $pdo->query("SELECT count(*) FROM translation_keys WHERE name = 'whatsNew.notLoaded'")->fetchColumn(),
            (int) $pdo->query("SELECT count(*) FROM translations WHERE key_name = 'whatsNew.notLoaded'")->fetchColumn(),
        ],
        'gone, its strings with it',
    );
    assert_same(['Terms of use', 'Podmienky používania'], $pdo->query("SELECT value FROM translations WHERE key_name = 'title.terms' ORDER BY language_code")->fetchAll(PDO::FETCH_COLUMN));
    assert_match('/legal pages/', (string) $pdo->query("SELECT description FROM translation_keys WHERE name = 'brand.area'")->fetchColumn(), 'the app\'s name is the legal pages\' site name too');
    assert_same($tablesBefore, tables_of_001($pdo), 'nobody\'s progress touched');

    // Taken off the record and applied again: every insert steps aside, a reworded string of its stays, the gate holds.
    $pdo->exec("UPDATE translations SET value = 'Our terms', updated_by = 7 WHERE key_name = 'title.terms' AND language_code = 'en'");
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . LEGAL_PAGES_MIGRATION . "'");
    assert_same([LEGAL_PAGES_MIGRATION], names_of(test_migrate($pdo, LEGAL_PAGES_MIGRATION)['applied']));
    assert_same('Our terms', $pdo->query("SELECT value FROM translations WHERE key_name = 'title.terms' AND language_code = 'en'")->fetchColumn(), 'an owner\'s rewording survives it');

    // A key of its own without its Slovak (an owner who deleted the language's string would need a migration of their
    // own to do that - the browser cannot): the gate refuses, and nothing of 012 stays.
    $pdo->exec("DELETE FROM migrations WHERE filename = '" . LEGAL_PAGES_MIGRATION . "'");
    $pdo->exec("DELETE FROM translations WHERE key_name = 'legal.about' AND language_code = 'sk'");
    $pdo->exec("CREATE FUNCTION keep_out() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN IF NEW.key_name = 'legal.about' AND NEW.language_code = 'sk' THEN RETURN NULL; END IF; RETURN NEW; END \$\$");
    $pdo->exec('CREATE TRIGGER keep_out BEFORE INSERT ON translations FOR EACH ROW EXECUTE FUNCTION keep_out()');
    $refused = test_migrate($pdo, LEGAL_PAGES_MIGRATION);
    assert_same(LEGAL_PAGES_MIGRATION, $refused['failed']['name'] ?? null);
    assert_match('/keys without an English and a Slovak string: legal\.about/', (string) $refused['error']);
    assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . LEGAL_PAGES_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
    $pdo = null;
});

test(
    '013 says it is finished and how the owner applies it, takes the old footer\'s own word away and tells What\'s new\'s heading of the family\'s footer - nothing else, again and again',
    function (): void {
        // What it may write is held by tests/unit/translations.test.php too (only the three tables of the words, nobody's progress).
        $sql = migration_text(FOOTER_WORDS_MIGRATION);
        assert_match('/-- Finished \(2026-10-18\)\. The owner applies it with 005 to 012 at the\s+-- hand-over \(after a pg_dump/', $sql, 'the header says it is finished, and to dump first');
        assert_match('/\(anotoki_translations: its 012 is the family\'s footer\'s four words\)/', $sql, 'and that the library\'s footer words come right after it');
        assert_match('/Once applied it never changes: the next change is 014\./', $sql, 'and that it is then frozen');
        $statements = Splitter::split($sql);
        assert_same(3, count($statements), 'the one delete, the description and the gate - nothing else');
        assert_same("DELETE FROM translation_keys WHERE name IN ('footer.whatsNew')", $statements[0]);
        assert_match("/^UPDATE translation_keys SET description = '[^\n]*'\s+WHERE name = 'whatsNew\.title'$/", $statements[1], 'then the description of What\'s new\'s heading');
        assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[2], 'it ends with its gate');

        // What it does on a database built through 012: the old footer's word goes with its strings - an owner's rewording of
        // it too -; What's new's heading keeps every string (the owner's wording too) and is told of the family's footer; every
        // other key, string and description, and every table of 001, as they were.
        $pdo = database_before(FOOTER_WORDS_MIGRATION, 'before_013');
        $pdo->exec("UPDATE translations SET value = 'News', updated_by = 7 WHERE key_name = 'footer.whatsNew' AND language_code = 'en'");
        $pdo->exec("UPDATE translations SET value = 'What changed', updated_by = 1 WHERE key_name = 'whatsNew.title' AND language_code = 'en'");
        $keys = static fn(): array => $pdo->query('SELECT name FROM translation_keys ORDER BY name COLLATE "C"')->fetchAll(PDO::FETCH_COLUMN);
        $descriptions = static fn(): array => $pdo->query('SELECT name, description FROM translation_keys ORDER BY name COLLATE "C"')->fetchAll(PDO::FETCH_KEY_PAIR);
        $keysBefore = $keys();
        $stringsBefore = strings_of($pdo);
        $descriptionsBefore = $descriptions();
        $tablesBefore = tables_of_001($pdo);
        assert_same(FOOTER_KEYS, array_values(array_intersect($keysBefore, FOOTER_KEYS)), 'the old footer\'s word, there before');
        assert_true(str_contains($descriptionsBefore['whatsNew.title'], 'opened from the version in the footer'), 'What\'s new\'s heading told of the old footer before');
        assert_same(
            [FOOTER_WORDS_MIGRATION],
            names_of(array_values(array_filter(test_migrate($pdo, FOOTER_WORDS_MIGRATION)['applied'], static fn(array $file): bool => $file['set'] === MIGRATIONS_SET))),
        );
        assert_same(array_values(array_diff($keysBefore, FOOTER_KEYS)), $keys(), 'the one key gone, no other');
        assert_same(array_diff_key($stringsBefore, array_flip(FOOTER_KEYS)), strings_of($pdo), 'its strings with it - every other string as it was, who wrote it and when, the owner\'s wording too');
        assert_same(['What changed', 1], [strings_of($pdo)['whatsNew.title']['en'][0], strings_of($pdo)['whatsNew.title']['en'][2]], 'What\'s new\'s heading: the owner\'s words, by the owner');
        $after = $descriptions();
        assert_true(
            str_contains($after['whatsNew.title'], 'opened from "What\'s new" in the footer') && !str_contains($after['whatsNew.title'], 'the version in the footer'),
            'What\'s new\'s heading: told of the family\'s footer - ' . $after['whatsNew.title'],
        );
        $others = static fn(array $all): array => array_diff_key($all, array_flip(['whatsNew.title', ...FOOTER_KEYS]));
        assert_same($others($descriptionsBefore), $others($after), 'every other description as it was');
        assert_same($tablesBefore, tables_of_001($pdo), 'nobody\'s progress touched');

        // Taken off the record and applied again: its gate holds over a database without the old footer's word.
        $pdo->exec("DELETE FROM migrations WHERE filename = '" . FOOTER_WORDS_MIGRATION . "'");
        assert_same([FOOTER_WORDS_MIGRATION], names_of(test_migrate($pdo, FOOTER_WORDS_MIGRATION)['applied']));
        assert_same($after, $descriptions(), 'and changes nothing more');

        // The old footer's word that comes back somehow (only a migration could make one): the gate refuses, and nothing of 013 stays.
        $pdo->exec("DELETE FROM migrations WHERE filename = '" . FOOTER_WORDS_MIGRATION . "'");
        $pdo->exec("CREATE FUNCTION keep_footer() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$");
        $pdo->exec("INSERT INTO translation_keys (name) VALUES ('footer.whatsNew')");
        $pdo->exec('CREATE TRIGGER keep_footer BEFORE DELETE ON translation_keys FOR EACH ROW EXECUTE FUNCTION keep_footer()');
        $pdo->exec("UPDATE translation_keys SET description = 'opened from the version in the footer' WHERE name = 'whatsNew.title'");
        $refused = test_migrate($pdo, FOOTER_WORDS_MIGRATION);
        assert_same(FOOTER_WORDS_MIGRATION, $refused['failed']['name'] ?? null);
        assert_match('/a key or a string of Piano Academy\'s own footer is still there/', (string) $refused['error']);
        assert_same([], $pdo->query("SELECT filename FROM migrations WHERE filename = '" . FOOTER_WORDS_MIGRATION . "'")->fetchAll(), 'not recorded as applied');
        assert_same(
            'opened from the version in the footer',
            $pdo->query("SELECT description FROM translation_keys WHERE name = 'whatsNew.title'")->fetchColumn(),
            'its description rolled back with it',
        );

        // And a description that does not tell of the family's footer (the update taken out): refused too.
        $pdo->exec('DROP TRIGGER keep_footer ON translation_keys');
        $pdo->exec('CREATE TRIGGER keep_footer BEFORE UPDATE ON translation_keys FOR EACH ROW EXECUTE FUNCTION keep_footer()');
        $refused = test_migrate($pdo, FOOTER_WORDS_MIGRATION);
        assert_same(FOOTER_WORDS_MIGRATION, $refused['failed']['name'] ?? null);
        assert_match('/the description of What\'s new\'s heading does not tell of the family\'s footer/', (string) $refused['error']);
        assert_same(1, (int) $pdo->query("SELECT count(*) FROM translation_keys WHERE name = 'footer.whatsNew'")->fetchColumn(), 'the delete rolled back with it');
        $pdo = null;
    },
);
