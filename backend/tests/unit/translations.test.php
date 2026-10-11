<?php

// The app's own strings: what the migrations leave in the database against
// what the frontend asks for - so a page never shows a key instead of a
// sentence, and no string is kept that nothing reads - with the family's scan
// as this app sets it up (tools/translation_keys.php: anotoki/lib's
// KeyScanner and EnglishDictionary), every stored string held to the checks a
// save makes (anotoki/lib's Translations), and what the migrations themselves
// may touch: their own three tables, nobody's progress. The rules every string
// keeps - its shape, its placeholders, its braces, what is blank - and how the
// scan reads a source are the library's, and tested there; here is what is
// this app's.
//
// Nothing here writes to this file's database: it is what the migrations made
// - this app's and the library's set of the words after them. (The tests that
// apply migrations do it in databases of their own.)
//
// THE CATALOGUE. Until a migration writes strings (003_site_strings.sql) the
// database has no key, and some of what is held here has nothing to hold yet.
// Those assertions are written, and wait behind catalogue_seeded(): they are
// marked "WAITS FOR 003", and each bites by itself from the moment a migration
// with INSERT INTO translation_keys is in migrations/piano_academy/ - nothing
// here has to be switched on by hand.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings
require TEST_BACKEND . '/tools/translation_keys.php';

use Anotoki\Lib\Migrations\Splitter;
use Anotoki\Lib\Translations\Cli\KeyScanner;
use Anotoki\Lib\Translations\Placeholders;
use Anotoki\Lib\Translations\Translations;

/** The five tables of 001: each person's progress. No translation migration may touch them. */
const PROGRESS_TABLES = ['users', 'progress', 'path_progress', 'sessions', 'imports'];

/**
 * The one exception, by name: 004 (the family's, which also writes strings)
 * gives users a column - the generation of each person's progress
 * (api/store.php) - in one statement. The checks here pass over exactly that
 * statement and that column; tests/unit/migrations.test.php holds 004 to
 * adding it and nothing else.
 */
const PROGRESS_GENERATION_COLUMN = 'progress_generation';
const PROGRESS_GENERATION_STATEMENT = '/\bALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+progress_generation\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+nextval\(\'\'\)\s*;/i';

/**
 * The other exception, by name: 005 (visitors, which also writes their
 * strings) - its schema part, statement by statement as sql_code() leaves
 * them (each must be there once): a sequence, users.visitor_key_hash, the
 * check on users.id rewritten (001's users_id_check makes way for
 * users_kind_check), two indexes on users, and the table visitor_starts with
 * its two. The checks here pass over exactly these, and without_visitors()
 * over exactly what they make; tests/unit/migrations.test.php holds 005 to
 * making that and nothing else.
 */
const VISITORS_STATEMENTS = [
    '/\bCREATE\s+SEQUENCE\s+IF\s+NOT\s+EXISTS\s+visitor_ids\s+AS\s+BIGINT\s+INCREMENT\s+BY\s+-1\s+MAXVALUE\s+-1\s+START\s+WITH\s+-1\s*;/i',
    '/\bALTER\s+TABLE\s+users\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+visitor_key_hash\s+CHAR\(64\)\s*;/i',
    '/\bALTER\s+TABLE\s+users\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+users_id_check\s*;/i',
    '/\bALTER\s+TABLE\s+users\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+users_kind_check\s*;/i',
    '/\bALTER\s+TABLE\s+users\s+ADD\s+CONSTRAINT\s+users_kind_check\s+CHECK\s*\([^;]*\)\s*;/i',
    '/\bCREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+users_visitor_key_hash\s+ON\s+users\s*\(visitor_key_hash\)\s*;/i',
    '/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+users_visitors_by_last_seen\s+ON\s+users\s*\(last_seen_at\)\s+WHERE\s+id\s*<\s*0\s*;/i',
    '/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+visitor_starts\s*\([^;]*\)\s*;/i',
    '/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+visitor_starts_by_address\s+ON\s+visitor_starts\s*\(address,\s*started_at\)\s*;/i',
    '/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+visitor_starts_by_time\s+ON\s+visitor_starts\s*\(started_at\)\s*;/i',
];

/** The three tables the translation migrations make and fill. */
const TRANSLATION_TABLES = ['languages', 'translation_keys', 'translations'];

/**
 * The migration that took the kit's words under the library's keys (the
 * family's library, anotoki-lib 0.3.0): it copies what the database has, so it
 * is not in 003's form - no strings of its own to write - and is held to what
 * it does in tests/unit/migrations.test.php. Its two tables of its own are
 * TEMPORARY, gone when its transaction ends.
 */
const LIBRARY_WORDS_MIGRATION = '009_strings_through_the_library.sql';
const LIBRARY_WORDS_TEMPORARY_TABLES = ['kit_keys', 'kit_words'];

/** The forms of a plural family, as Intl.PluralRules names the ones English and Slovak have (the library's scan has the same). */
const PLURAL_FORMS = ['one', 'few', 'other'];

/** A migration's text, with the line endings of a checkout on any computer. */
function migration_sql(string $file): string
{
    return str_replace("\r\n", "\n", (string) file_get_contents(migrationsDir() . '/' . $file));
}

/**
 * The migrations that write strings in 003's form: a key, its English and its
 * Slovak. Until the first of them is there the database has no keys, and the
 * checks against the frontend have nothing to hold it to; from then on every
 * one of them bites. (009 inserts keys too - the library's, copied from what
 * the database has: not in 003's form.)
 *
 * @return string[]
 */
function string_migrations(): array
{
    return array_values(array_filter(
        migrationFiles(),
        static fn(string $file): bool => $file !== LIBRARY_WORDS_MIGRATION && (bool) preg_match('/INSERT\s+INTO\s+translation_keys\b/i', migration_sql($file))
    ));
}

/** Has a migration written the strings yet? What is marked WAITS FOR 003 is held from then on. */
function catalogue_seeded(): bool
{
    return string_migrations() !== [];
}

/**
 * The migrations of the translation work: the one that makes the tables,
 * every one that writes strings - 003 joins by itself when the file appears -
 * and the one that took the kit's words under the library's keys.
 *
 * @return string[]
 */
function translation_migrations(): array
{
    return array_values(array_unique(array_merge(
        array_values(array_filter(migrationFiles(), static fn(string $file): bool => str_starts_with($file, '002_'))),
        string_migrations(),
        array_values(array_filter(migrationFiles(), static fn(string $file): bool => $file === LIBRARY_WORDS_MIGRATION))
    )));
}

/** @return string[] every key the database has, by name */
function database_keys(): array
{
    test_db();

    return array_column(dbAll('SELECT name FROM translation_keys ORDER BY name COLLATE "C"'), 'name');
}

/** The keys that have no string in a language. */
function keys_without(string $code): array
{
    test_db();

    return array_column(dbAll(
        'SELECT k.name FROM translation_keys k
          WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = ?)
          ORDER BY k.name COLLATE "C"',
        [$code]
    ), 'name');
}

/** A language's own strings, by key. */
function strings_in(string $code): array
{
    test_db();

    return array_column(dbAll('SELECT key_name, value FROM translations WHERE language_code = ? ORDER BY key_name COLLATE "C"', [$code]), 'value', 'key_name');
}

/** A list in the order of its values: for two lists that must hold the same, whatever order each was written in. */
function in_order(array $list): array
{
    sort($list, SORT_STRING);

    return $list;
}

/** A small frontend to scan: $files as relative path => contents, written with Windows line endings. */
function sources(array $files): string
{
    $root = test_temp_dir('sources');
    foreach ($files as $relative => $contents) {
        if (!is_dir(dirname("$root/$relative"))) {
            mkdir(dirname("$root/$relative"), 0777, true);
        }
        // Whatever line endings this file itself was checked out with.
        file_put_contents("$root/$relative", str_replace(["\r\n", "\n"], ["\n", "\r\n"], $contents));
    }

    return $root;
}

/**
 * The keys a string migration names, place by place: the rows it inserts into
 * translation_keys, the strings it inserts for each language, and the list its
 * closing gate checks. Read from the file's text - the way the file is
 * written is the pattern every later one follows (003_site_strings.sql).
 *
 * @return array{keys: string[], strings: array<string, string[]>, gate: string[]}
 */
function migration_keys(string $file): array
{
    $sql = migration_sql($file);
    // The first thing of a row: its key, at the start of a line.
    $rows = static function (string $block): array {
        preg_match_all("/^\\s*\\('([^']+)',/m", $block, $m);

        return $m[1];
    };

    $found = ['keys' => [], 'strings' => [], 'gate' => []];
    if (preg_match('/INSERT\s+INTO\s+translation_keys\b[^;]*?\bVALUES\b(.*?)\nON CONFLICT/s', $sql, $m)) {
        $found['keys'] = $rows($m[1]);
    }
    preg_match_all("/INSERT\\s+INTO\\s+translations\\b[^;]*?SELECT\\s+v\\.key_name,\\s*'([a-z-]+)',[^;]*?\\bVALUES\\b(.*?)\nON CONFLICT/s", $sql, $blocks, PREG_SET_ORDER);
    foreach ($blocks as $block) {
        $found['strings'][$block[1]] = $rows($block[2]);
    }
    if (preg_match('/\nDO \$\$.*?\bVALUES\b(.*?)\)\s*AS\s+k\s*\(name\)/s', $sql, $m)) {
        preg_match_all("/\\('([^']+)'\\)/", $m[1], $gate);
        $found['gate'] = $gate[1];
    }

    return $found;
}

/**
 * A migration's statements without what is only said in them: comments are
 * gone, and every quoted text is an empty one - so a string that says "Delete"
 * or a comment that says "update" is not taken for one.
 */
function sql_code(string $sql): string
{
    return (string) preg_replace_callback(
        "~--[^\n]*|/\\*.*?\\*/|'(?:[^']|'')*'~s",
        static fn(array $m): string => $m[0][0] === "'" ? "''" : ' ',
        $sql
    );
}

/**
 * Everything of the five progress tables in a database: their rows, columns,
 * constraints and indexes - but users.progress_generation, the one column
 * 004 adds (PROGRESS_GENERATION_COLUMN).
 */
function progress_tables_as_they_are(PDO $pdo): array
{
    $list = "'" . implode("', '", PROGRESS_TABLES) . "'";
    $all = static fn(string $sql): array => $pdo->query($sql)->fetchAll();
    $state = [
        'columns' => $all("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
                            WHERE table_schema = current_schema() AND table_name IN ($list)
                              AND NOT (table_name = 'users' AND column_name = '" . PROGRESS_GENERATION_COLUMN . "')
                            ORDER BY table_name, ordinal_position"),
        // (PostgreSQL 18 lists a NOT NULL as a constraint: the column's own is passed over with it.)
        'constraints' => $all("SELECT conrelid::regclass::text AS on_table, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
                                WHERE conrelid::regclass::text IN ($list)
                                  AND pg_get_constraintdef(oid) <> 'NOT NULL " . PROGRESS_GENERATION_COLUMN . "' ORDER BY 1, 2"),
        'indexes' => $all("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ($list) ORDER BY 1, 2"),
    ];
    foreach (PROGRESS_TABLES as $table) {
        $state["rows of $table"] = $all("SELECT (to_jsonb(t) - '" . PROGRESS_GENERATION_COLUMN . "')::text AS row FROM \"$table\" t ORDER BY 1");
    }

    return $state;
}

/**
 * A state of progress_tables_as_they_are() without what 005 makes for
 * visitors (VISITORS_STATEMENTS): the column, the check on users.id (001's
 * and 005's), the two indexes on users. The rows keep everything else.
 */
function without_visitors(array $state): array
{
    $state['columns'] = array_values(array_filter($state['columns'], static fn(array $column): bool => !($column['table_name'] === 'users' && $column['column_name'] === 'visitor_key_hash')));
    $state['constraints'] = array_values(array_filter($state['constraints'], static fn(array $constraint): bool => !in_array($constraint['conname'], ['users_id_check', 'users_kind_check'], true)));
    $state['indexes'] = array_values(array_filter($state['indexes'], static fn(array $index): bool => !in_array($index['indexname'], ['users_visitor_key_hash', 'users_visitors_by_last_seen'], true)));
    $state['rows of users'] = array_map(static function (array $row): array {
        $values = json_decode($row['row'], true);
        unset($values['visitor_key_hash']);
        ksort($values);

        return ['row' => json_encode($values)];
    }, $state['rows of users']);

    return $state;
}

/* ------------------------------------------------ what the migrations leave */

test('the two languages the app is released in, English first - and the keys, once a migration writes them', function (): void {
    test_db();
    assert_same([
        ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'enabled' => true, 'sort_order' => 1],
        ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina', 'enabled' => true, 'sort_order' => 2],
    ], dbAll('SELECT code, name, native_name, enabled, sort_order FROM languages ORDER BY sort_order'));

    if (!catalogue_seeded()) {
        assert_same([], database_keys(), 'no migration writes strings yet, so there are none');
    } else {
        // WAITS FOR 003
        assert_true(database_keys() !== [], implode(', ', string_migrations()) . ' left no keys');
    }

    // the database keeps its own rules
    assert_throws(static fn() => dbExec("INSERT INTO languages (code, name, native_name) VALUES ('EN', 'x', 'x')"), '/check/i');
    assert_throws(static fn() => dbExec("INSERT INTO translations (key_name, language_code, value) VALUES ('no.such', 'en', 'x')"), '/foreign key/i');
    assert_same('bigint', dbValue("SELECT data_type FROM information_schema.columns WHERE table_name = 'translations' AND column_name = 'updated_by'"), 'who reworded a string is an IAM user id, as users.id is');
});

test('the library\'s set of the words comes after this app\'s own, and the library\'s keys are its own: anotoki.*, in English and Slovak', function (): void {
    test_db();
    // Recorded after this app's files, under its set's name - the bookkeeping table as it always was.
    assert_same(array_map('migrationLabel', every_migration()), array_column(dbAll('SELECT filename FROM migrations ORDER BY id'), 'filename'));
    assert_same([], translations()->keysWithout('en'), 'every key reads in English, the library\'s too');
    $library = array_values(array_filter(database_keys(), static fn(string $key): bool => str_starts_with($key, 'anotoki.')));
    assert_same(in_order(\Anotoki\Lib\Translations\LibraryWords::keys()), $library, 'the library\'s keys, and no other key of the namespace');
    // Only 009 - the kit's words, copied from what this database had - writes a key of the library's namespace.
    foreach (array_diff(migrationFiles(), [LIBRARY_WORDS_MIGRATION]) as $file) {
        assert_no_match('/\banotoki\.[a-z]/', sql_code(migration_sql($file)) . implode(' ', migration_keys($file)['keys']), "$file writes into the library's namespace");
    }
});

test('every key has an English string, and a Slovak one', function (): void {
    // Holds at once, and WAITS FOR 003 to have anything to hold: no key, no key without a string.
    assert_same([], keys_without('en'), 'keys with no English string: nothing to fall back to');
    assert_same([], keys_without('sk'), 'keys with no Slovak string');
    if (catalogue_seeded()) {
        assert_true(count(database_keys()) > 100, 'the strings of the whole app are there');
    }
});

test('a translation uses no placeholder its English string does not have', function (): void {
    // Holds at once; WAITS FOR 003 to have strings to look at.
    test_db();
    $english = strings_in(Translations::FALLBACK);
    $wrong = [];
    foreach (dbAll('SELECT key_name, language_code, value FROM translations WHERE language_code <> ? ORDER BY key_name COLLATE "C", language_code', [Translations::FALLBACK]) as $row) {
        $extra = array_diff(Placeholders::names($row['value']), Placeholders::names($english[$row['key_name']] ?? ''));
        if ($extra !== []) {
            $wrong[] = "{$row['key_name']} ({$row['language_code']}): {" . implode('}, {', $extra) . '}';
        }
    }
    assert_same([], $wrong, 'the app fills in only the placeholders the English string has');
});

test('a plural family has .one, .few and .other in both languages, and nothing else ends in them', function (): void {
    // Holds at once; WAITS FOR 003 to have families to look at.
    $keys = database_keys();
    $families = [];
    foreach ($keys as $key) {
        if (preg_match('/^(.+)\.(' . implode('|', PLURAL_FORMS) . ')$/D', $key, $m)) {
            $families[$m[1]] = true;
        }
    }
    $incomplete = [];
    foreach (array_keys($families) as $family) {
        foreach (PLURAL_FORMS as $form) {
            if (!in_array("$family.$form", $keys, true)) {
                $incomplete[] = "$family.$form";
            }
        }
    }
    assert_same([], $incomplete, 'a key ending in .one, .few or .other is a form of a plural, and a plural has all three');
    // "in both languages" is the test above: every key has both.
});

test('every key has the shape the scan can find', function (): void {
    // Holds at once; WAITS FOR 003 to have keys to look at.
    foreach (database_keys() as $key) {
        assert_true(KeyScanner::shapeOk($key), "$key is not the shape of a key, so the scan cannot find it");
    }
});

test('every language a migration writes strings for is one that cannot be deleted', function (): void {
    test_db();
    $written = array_column(dbAll('SELECT DISTINCT language_code FROM translations ORDER BY language_code'), 'language_code');
    $released = translationsConfig()->releasedLanguages;
    assert_same(TRANSLATION_RELEASED_LANGUAGES, $released, 'the configuration is the list');
    assert_same([], array_values(array_diff($written, $released)), 'add them to TRANSLATION_RELEASED_LANGUAGES: deleting one would make the next string migration fail');

    $languages = array_column(dbAll('SELECT code FROM languages'), 'code');
    assert_same([], array_values(array_diff($released, $languages)), 'and each of them is a language here');
    assert_true(in_array(Translations::FALLBACK, $released, true));
    if (catalogue_seeded()) {
        // WAITS FOR 003
        assert_same(in_order($released), in_order($written), 'the list names exactly the languages the migrations write');
    }
    // What the admin pages read: released, not to be deleted.
    foreach (translations()->languages() as $language) {
        assert_same(in_array($language['code'], $released, true), $language['seeded'], $language['code']);
    }
});

test('every key the frontend uses is in the database, and every key in the database is used', function (): void {
    $scan = translationKeyScanner()->scan(database_keys());
    assert_same([], $scan['problems'], 'what the scan does not let through');

    if (!catalogue_seeded()) {
        // Nothing is written yet, so nothing the frontend already asks for can
        // be found: from the first migration with strings on, all of it is held.
        return;
    }
    // WAITS FOR 003
    assert_same([], $scan['missing'], 'used by the frontend, not in the database - the page would show the key (php tools/translations.php --status)');
    assert_same([], $scan['unused'], 'in the database, used nowhere - delete them with a migration (the library\'s anotoki.* are its own)');
    assert_true(is_file(translationKeysFrontendRoot() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE), 'the keys put together at run time are declared in ' . TRANSLATION_DYNAMIC_KEYS_FILE);
});

test('the English the shell keeps for when it has no strings is the database\'s English, key for key - this app\'s, and the library\'s words it says its own way', function (): void {
    $file = translationKeysFrontendRoot() . '/' . TRANSLATION_KEPT_ENGLISH_FILE;
    if (!is_file($file)) {
        // WAITS FOR 003: from then on the table must be there.
        assert_false(catalogue_seeded(), 'the shell\'s English for when there are no strings is kept in ' . TRANSLATION_KEPT_ENGLISH_FILE);

        return;
    }
    if (!catalogue_seeded()) {
        return;
    }

    // WAITS FOR 003: every key of the table exists, is used by the app's own
    // sources (the table itself is not a use), and says what the seed says. The
    // reader refuses whatever it cannot read whole: a key it skipped would pass.
    $kept = translationKeptEnglish();
    assert_true($kept !== [], 'the table holds the shell\'s strings');
    $keys = database_keys();
    $english = strings_in(Translations::FALLBACK);
    $used = translationKeyScanner()->scan($keys)['used'];

    assert_same([], array_values(array_diff(array_keys($kept), $keys)), 'kept in English, and not a key of the database');
    assert_same([], array_values(array_filter(array_keys($kept), static fn(string $key): bool => str_starts_with($key, 'anotoki.'))), 'this app\'s keys only: the library\'s are its own (below)');
    assert_same([], array_values(array_filter(array_keys($kept), static fn(string $key): bool => !isset($used[$key]))), 'kept in English, and asked for by no page');
    $different = [];
    foreach ($kept as $key => $text) {
        if (isset($english[$key]) && $english[$key] !== $text) {
            $different[$key] = ['kept' => $text, 'seeded' => $english[$key]];
        }
    }
    assert_same([], $different, 'the kept English is the seeded English, letter for letter');

    // The library's words this app says its own way (009 copied this app's strings under them): the kit has its own
    // English for them while there is no bundle, so this app gives its own (the translations module's libraryWords).
    $library = translationKeptEnglish('KEPT_LIBRARY_ENGLISH');
    assert_same(['anotoki.theme.auto', 'anotoki.theme.dark', 'anotoki.theme.light'], in_order(array_keys($library)), 'the theme switch\'s three choices - "Theme: light"');
    foreach ($library as $key => $text) {
        assert_same($english[$key] ?? null, $text, "$key: the database's English as 009 left it");
        assert_true($text !== \Anotoki\Lib\Translations\LibraryWords::english($key), "$key: worded otherwise than the library's own - else nothing to keep");
    }
});

/* ------------------------------------ what the migrations touch, and do not */

test('the migrations of this work make and fill only their own three tables - by what they say', function (): void {
    $files = translation_migrations();
    assert_true(in_array('002_languages_and_translations.sql', $files, true), 'the migration that makes the tables');
    assert_true(in_array(LIBRARY_WORDS_MIGRATION, $files, true), 'and the one that took the kit\'s words under the library\'s keys');
    if (catalogue_seeded()) {
        // WAITS FOR 003: it is among the files from the moment it writes a key.
        assert_true(count($files) >= 3, 'and the one that writes the strings');
    }

    foreach ($files as $file) {
        $code = sql_code(migration_sql($file));
        // 004's column on users, and that statement alone (PROGRESS_GENERATION_STATEMENT).
        if (str_starts_with($file, '004_')) {
            $code = (string) preg_replace(PROGRESS_GENERATION_STATEMENT, ' ', $code, -1, $passed);
            assert_same(1, $passed, "$file adds users.progress_generation in the one statement this test passes over");
        }
        // 005's visitors, and those statements alone (VISITORS_STATEMENTS).
        if (str_starts_with($file, '005_')) {
            foreach (VISITORS_STATEMENTS as $statement) {
                $code = (string) preg_replace($statement, ' ', $code, -1, $passed);
                assert_same(1, $passed, "$file: one statement of its visitors this test passes over, $statement");
            }
        }
        // 009's tables of its own: TEMPORARY, gone with its transaction - and nothing else of its is a table of
        // its own. Every other table it names is one of the three.
        preg_match_all('/\bCREATE\s+(TEMP(?:ORARY)?\s+)?TABLE\s+("?\w+"?)/i', $code, $made, PREG_SET_ORDER);
        $temporary = [];
        foreach ($made as $table) {
            if (trim($table[1]) !== '') {
                assert_same(LIBRARY_WORDS_MIGRATION, $file, "$file makes a temporary table");
                assert_match('/\bCREATE\s+TEMPORARY\s+TABLE\s+' . preg_quote(trim($table[2], '"'), '/') . '\s+ON\s+COMMIT\s+DROP\b/i', $code, "$file: {$table[2]} goes with the transaction");
                $temporary[] = strtolower(trim($table[2], '"'));
            }
        }
        if ($file === LIBRARY_WORDS_MIGRATION) {
            assert_same(LIBRARY_WORDS_TEMPORARY_TABLES, $temporary, 'its two tables of its own');
        }

        // Every table a statement names is one of the three - but for the one reference to users (id).
        preg_match_all('/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON)\s+("?\w+"?)/i', (string) preg_replace('/\bON\s+(?:UPDATE|DELETE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)\b/i', ' ', $code), $written);
        $tables = array_values(array_unique(array_map(static fn(string $name): string => strtolower(trim($name, '"')), $written[1])));
        assert_same([], array_values(array_diff($tables, TRANSLATION_TABLES)), "$file writes to a table that is not one of the three");
        assert_same([], array_values(array_intersect($tables, PROGRESS_TABLES)), "$file writes to a table of 001");

        preg_match_all('/\bREFERENCES\s+("?\w+"?)\s*\(\s*(\w+)\s*\)/i', $code, $references, PREG_SET_ORDER);
        foreach ($references as $reference) {
            $to = strtolower(trim($reference[1], '"')) . ' (' . strtolower($reference[2]) . ')';
            assert_true(in_array($to, ['translation_keys (name)', 'languages (code)', 'users (id)'], true), "$file refers to $to");
        }
        foreach (PROGRESS_TABLES as $table) {
            if ($file === LIBRARY_WORDS_MIGRATION) {
                assert_no_match('/\b' . $table . '\b/i', $code, "$file names $table");
            }
        }
    }

    // 002 and 003 by name: they change and remove nothing at all, anywhere - they only make and add.
    // (A later migration may delete a key the code has stopped using; these two never do.)
    foreach (array_filter(migrationFiles(), static fn(string $file): bool => (bool) preg_match('/^00[23]_/', $file)) as $file) {
        $code = sql_code(migration_sql($file));
        // What a foreign key does when its row changes is not a statement.
        $code = (string) preg_replace('/\bON\s+(?:UPDATE|DELETE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)\b/i', ' ', $code);
        preg_match_all('/\b(UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i', $code, $words);
        assert_same([], array_values(array_unique(array_map('strtoupper', $words[1]))), "$file changes or removes something: it may only CREATE its tables and INSERT into them");
        foreach (PROGRESS_TABLES as $table) {
            assert_no_match('/\bINSERT\s+INTO\s+"?' . $table . '"?\b/i', $code, "$file inserts into $table");
        }
    }

    $made = sql_code(migration_sql('002_languages_and_translations.sql'));
    assert_match('/\bupdated_by\s+BIGINT\s+REFERENCES\s+users\s*\(id\)\s+ON\s+UPDATE\s+CASCADE\s+ON\s+DELETE\s+SET\s+NULL\b/i', $made, 'who reworded a string follows a person to another IAM id, and is forgotten with their users row');
    $statements = Splitter::split(migration_sql('002_languages_and_translations.sql'));
    assert_match('/^DO \$\$.*server_encoding.*UTF8/s', $statements[0], 'the first thing it does is look at the database\'s encoding');
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[count($statements) - 1], 'and the last is its gate');
});

test('the migrations of this work leave everybody\'s progress exactly as it was - by what they do', function (): void {
    $name = test_empty_db('own_tables');
    $pdo = dbConnect(machineDatabaseSettings(), $name);
    assert_same('001_init.sql', names_of(databaseMigrator($pdo)->applicable())[0] ?? null);
    assert_same(['001_init.sql'], names_of(test_migrate($pdo, '001_init.sql')['applied']));

    // Two people's progress, as the app keeps it.
    $pdo->exec("INSERT INTO users (id, preferred_username) VALUES (1, 'owner'), (7, NULL)");
    $pdo->exec("INSERT INTO progress (user_id, notes) VALUES (1, '{\"60\": {\"midi\": 60, \"status\": \"review\"}}'), (7, '{}')");
    $pdo->exec("INSERT INTO path_progress (user_id, data) VALUES (1, '{\"steps\": {\"rh-1/meet\": {\"attempts\": 1}}}')");
    $pdo->exec("INSERT INTO sessions (user_id, id, request_key, data) VALUES (1, '1788962769050-k65d2n', 'key-1', '{\"mode\": \"lesson\", \"label\": \"C, D, E · Drill\"}'), (7, 'a', NULL, '{\"mode\": \"trainer\"}')");
    $pdo->exec("INSERT INTO imports (source, user_id, summary) VALUES ('server-data', 1, '{\"notes\": 1}')");
    $before = progress_tables_as_they_are($pdo);
    assert_same(2, count($before['rows of users']));

    $held = translation_migrations();
    $applied = [];
    // One file at a time, each looked at before and after - the library's set of the words, after them, too.
    foreach (databaseMigrator($pdo)->applicable() as $file) {
        $was = progress_tables_as_they_are($pdo);
        $result = $file['set'] === MIGRATIONS_SET ? test_migrate($pdo, $file['name']) : databaseMigrator($pdo, ['ready' => static fn (\Anotoki\Lib\Migrations\MigrationSet $set, string $name): bool => $set->name !== $file['set'] || strnatcmp($name, $file['name']) <= 0])->apply();
        assert_same([[$file], null], [$result['applied'], $result['failed']], migrationLabel($file) . ' applied');
        $applied[] = $file['name'];
        if (in_array($file['name'], $held, true) || $file['set'] !== MIGRATIONS_SET) {
            // 005 makes visitors (VISITORS_STATEMENTS): everything else of 001 as it was.
            $now = progress_tables_as_they_are($pdo);
            assert_same(str_starts_with($file['name'], '005_') ? without_visitors($was) : $was, str_starts_with($file['name'], '005_') ? without_visitors($now) : $now, migrationLabel($file) . ' changed a table of 001, or a row in one');
        }
    }
    assert_same([], array_values(array_diff($held, $applied)), 'each of them was applied');
    assert_same(names_of(every_migration()), ['001_init.sql', ...$applied], 'every one, the library\'s last');
    foreach (TRANSLATION_TABLES as $table) {
        assert_true((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "the table $table");
    }

    // Who reworded a string is the one thing that points at a person: it
    // follows them to another IAM id, and their going takes no string along.
    $pdo->exec("INSERT INTO users (id) VALUES (20), (21)");
    $pdo->exec("INSERT INTO translation_keys (name) VALUES ('test.by')");
    $pdo->exec("INSERT INTO translations (key_name, language_code, value, updated_by) VALUES ('test.by', 'en', 'By 20', 20), ('test.by', 'sk', 'Od 21', 21)");
    $pdo->exec('UPDATE users SET id = 30 WHERE id = 20');
    $pdo->exec('DELETE FROM users WHERE id = 21');
    assert_same(
        [['language_code' => 'en', 'value' => 'By 20', 'updated_by' => 30], ['language_code' => 'sk', 'value' => 'Od 21', 'updated_by' => null]],
        $pdo->query("SELECT language_code, value, updated_by FROM translations WHERE key_name = 'test.by' ORDER BY 1")->fetchAll()
    );
    $pdo = null;
});

test('a database that is not UTF8 is refused by 002 with a sentence, before anything is made', function (): void {
    $name = dbName() . '_latin1';
    assert_true(test_db_name_ok($name));
    $server = machineDatabaseSettings();
    // The C locale goes with every encoding. (Where the server's own default
    // is ICU, which has no LATIN1, the libc provider has to be asked for.)
    try {
        dbServer($server)->exec('CREATE DATABASE "' . $name . "\" ENCODING 'LATIN1' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0");
    } catch (PDOException) {
        dbServer($server)->exec('CREATE DATABASE "' . $name . "\" ENCODING 'LATIN1' LOCALE_PROVIDER libc LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0");
    }
    $GLOBALS['TEST_DBS'][] = $name;
    dbServer($server)->exec('COMMENT ON DATABASE "' . $name . "\" IS 'piano test " . time() . "'");

    $pdo = dbConnect($server, $name);
    assert_same('LATIN1', (string) $pdo->query('SHOW server_encoding')->fetchColumn());
    $result = databaseMigrator($pdo)->apply();
    assert_same(['001_init.sql'], names_of($result['applied']), 'the tables of 001 hold no text of the app\'s own');
    assert_same('002_languages_and_translations.sql', $result['failed']['name'] ?? null);
    assert_match('/This database keeps its text as LATIN1, and the app\'s words need UTF8\./', (string) $result['error'], 'it says what is wrong, in words');
    assert_match('/statement 1 of /', (string) $result['error'], 'the very first statement');
    foreach (TRANSLATION_TABLES as $table) {
        assert_false((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "nothing was made: $table");
    }
    assert_same(['001_init.sql'], names_of(databaseMigrator($pdo)->status()['applied']), 'and 002 is still to do, once the database is made again');
    $pdo = null;
});

/* ------------------------------------------------- the strings the seed keeps */

test('every string the migrations wrote passes the checks a save makes, as it is - this app\'s and the library\'s', function (): void {
    // Otherwise a string nobody could save again would be released: the grid sends a cell back
    // whole, and a rule the seed does not keep (a brace, a length, a space at its end) would refuse it.
    test_db();
    if (catalogue_seeded()) {
        // WAITS FOR 003
        assert_true((int) dbValue('SELECT count(*) FROM translations') > 200, 'the strings are there to check');
    }
    assert_same([], translations()->storedRefusals(), 'every string as a save would take it');
});

test('a string migration\'s gate checks exactly the keys the migration writes, and writes each in every language', function (): void {
    // WAITS FOR 003: there is no string migration to read until then.
    foreach (string_migrations() as $file) {
        $found = migration_keys($file);
        assert_true($found['keys'] !== [], "$file: the keys it inserts could not be read");
        assert_same($found['keys'], array_values(array_unique($found['keys'])), "$file: a key is inserted twice");
        assert_same(in_order($found['keys']), in_order($found['gate']), "$file: the keys its gate checks are not the keys it inserts - a key left out of the gate could lack a string and nothing would say so");
        assert_same(in_order(TRANSLATION_RELEASED_LANGUAGES), in_order(array_keys($found['strings'])), "$file: one block of strings a language");
        foreach ($found['strings'] as $code => $keys) {
            assert_same(in_order($found['keys']), in_order($keys), "$file: the keys with a string in \"$code\" are not the keys it inserts");
        }
    }
    assert_false(in_array(LIBRARY_WORDS_MIGRATION, string_migrations(), true), '009 copies what the database has: tests/unit/migrations.test.php holds it');
});

/* ------------------------------------------------- the scan, as this app has it */

test('the scan as this app sets it up: this app\'s sources and dynamic keys - never a spec, the specs\' helpers, the vendored SDK, the kept English, or the library\'s own keys', function (): void {
    $root = sources([
        'pages/home/home.component.html' => "<h1>{{ 'home.title' | translate }}</h1>\n<span>{{ 'home.due' | translatePlural: n }}</span>\n<em>{{ 'home.missing' | translate }}</em>\n",
        'pages/home/home.component.ts' => "const label = word('path.hint.' + midi);\nconst kit = 'anotoki.topbar.signIn';\n",
        'pages/home/home.component.spec.ts' => "expect(text).toBe('home.onlyInASpec');\n",
        'core/testing/example.ts' => "export const example = 'home.onlyInTesting';\n",
        'core/auth/anotoki-auth.d.ts' => "export const sdk = 'home.inTheSdk';\n",
        'core/i18n/kept-english.ts' => "export const KEPT_ENGLISH: Readonly<Record<string, string>> = {\n  'home.title': 'Learn',\n  'home.onlyKept': 'Kept, and asked for by no page',\n};\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS: Record<string, readonly string[]> = {\n  'path.hint.': ['60'],\n};\n",
    ]);
    $database = ['home.title', 'home.due.one', 'home.due.few', 'home.due.other', 'home.onlyInASpec', 'home.onlyInTesting', 'home.inTheSdk', 'home.onlyKept', 'path.hint.60', 'anotoki.topbar.signIn', 'anotoki.ui.close'];
    $scan = translationKeyScanner($root)->scan($database);
    assert_same([], $scan['problems']);
    assert_same(['home.missing' => ['pages/home/home.component.html:3']], $scan['missing'], 'asked for, and not there');
    assert_same(['home.inTheSdk', 'home.onlyInASpec', 'home.onlyInTesting', 'home.onlyKept'], $scan['unused'], 'the specs, their helpers, the vendored SDK and the kept English do not count - and the library\'s keys are never unused');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['path.hint.60']);
    assert_false(isset($scan['used']['anotoki.topbar.signIn']), 'the library\'s namespace is never looked for');

    // And what it reads of the real frontend: only what it should.
    $files = translationKeyScanner()->sourceFiles();
    assert_true(in_array('app.routes.ts', $files, true) && in_array('app.component.html', $files, true), 'the sources are where the scan looks');
    foreach ($files as $file) {
        assert_match('/\.(ts|html)$/', $file);
        assert_no_match('~\.spec\.ts$|^core/testing/|^core/auth/anotoki-auth\.|^core/i18n/kept-english\.ts$~', $file);
    }
    assert_true(in_array(TRANSLATION_DYNAMIC_KEYS_FILE, $files, true), 'the dynamic keys are read - for what they declare');
});
