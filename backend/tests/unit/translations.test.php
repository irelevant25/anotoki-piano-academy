<?php

// The app's own strings: what the migrations leave in the database against
// what the frontend asks for - so a page never shows a key instead of a
// sentence, and no string is kept that nothing reads - and the rules a string
// must keep (api/translations.php), with the scan that finds the frontend's
// keys (tools/translation_keys.php) tested on sources of its own. And what
// the migrations themselves may touch: their own three tables, nobody's
// progress.
//
// Nothing here writes to this file's database: it is what the migrations made.
// (The tests that apply migrations do it in databases of their own.)
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

/** The five tables of 001: each person's progress. No translation migration may touch them. */
const PROGRESS_TABLES = ['users', 'progress', 'path_progress', 'sessions', 'imports'];

/** The three tables the translation migrations make and fill. */
const TRANSLATION_TABLES = ['languages', 'translation_keys', 'translations'];

/** A migration's text, with the line endings of a checkout on any computer. */
function migration_sql(string $file): string
{
    return str_replace("\r\n", "\n", (string) file_get_contents(migrationsRoot() . '/' . MIGRATIONS_ALIAS . '/' . $file));
}

/**
 * The migrations that write strings. Until the first of them is there the
 * database has no keys, and the checks against the frontend have nothing to
 * hold it to; from then on every one of them bites.
 *
 * @return string[]
 */
function string_migrations(): array
{
    return array_values(array_filter(
        migrationFiles(),
        static fn(string $file): bool => (bool) preg_match('/INSERT\s+INTO\s+translation_keys\b/i', migration_sql($file))
    ));
}

/** Has a migration written the strings yet? What is marked WAITS FOR 003 is held from then on. */
function catalogue_seeded(): bool
{
    return string_migrations() !== [];
}

/**
 * The migrations of the translation work: the one that makes the tables, and
 * every one that writes strings - 003 joins by itself when the file appears.
 *
 * @return string[]
 */
function translation_migrations(): array
{
    return array_values(array_unique(array_merge(
        array_values(array_filter(migrationFiles(), static fn(string $file): bool => str_starts_with($file, '002_'))),
        string_migrations()
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

/** What translationsCheck() refuses $values with: [code, extra] - or the changes it would make. */
function check(mixed $values, array $english = ['test.hello' => 'Hello, {name}!', 'test.bye' => 'Goodbye', 'test.count' => '{count} notes', 'test.step' => 'Step {n} of {m}']): array
{
    try {
        return translationsCheck($values, ['test.hello', 'test.bye', 'test.count', 'test.step', 'test.new'], ['en' => 'English', 'sk' => 'Slovak'], $english);
    } catch (ApiError $e) {
        assert_same(422, $e->status);

        return [$e->errorCode, $e->extra];
    }
}

/** A body as jsonBody() hands it to a route: objects as stdClass, lists as arrays. */
function body(string $json): mixed
{
    return json_decode($json, false, 64, JSON_THROW_ON_ERROR);
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

/** Everything of the five progress tables in a database: their rows, columns, constraints and indexes. */
function progress_tables_as_they_are(PDO $pdo): array
{
    $list = "'" . implode("', '", PROGRESS_TABLES) . "'";
    $all = static fn(string $sql): array => $pdo->query($sql)->fetchAll();
    $state = [
        'columns' => $all("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
                            WHERE table_schema = current_schema() AND table_name IN ($list) ORDER BY table_name, ordinal_position"),
        'constraints' => $all("SELECT conrelid::regclass::text AS on_table, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
                                WHERE conrelid::regclass::text IN ($list) ORDER BY 1, 2"),
        'indexes' => $all("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ($list) ORDER BY 1, 2"),
    ];
    foreach (PROGRESS_TABLES as $table) {
        $state["rows of $table"] = $all("SELECT to_jsonb(t)::text AS row FROM \"$table\" t ORDER BY 1");
    }

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
    $english = translationsOf(TRANSLATION_FALLBACK);
    $wrong = [];
    foreach (dbAll('SELECT key_name, language_code, value FROM translations WHERE language_code <> ? ORDER BY key_name COLLATE "C", language_code', [TRANSLATION_FALLBACK]) as $row) {
        $extra = array_diff(translationPlaceholders($row['value']), translationPlaceholders($english[$row['key_name']] ?? ''));
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
        if (preg_match('/^(.+)\.(' . implode('|', TRANSLATION_PLURAL_FORMS) . ')$/D', $key, $m)) {
            $families[$m[1]] = true;
        }
    }
    $incomplete = [];
    foreach (array_keys($families) as $family) {
        foreach (TRANSLATION_PLURAL_FORMS as $form) {
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
        assert_true(translationKeyShapeOk($key), "$key is not the shape of a key, so the scan cannot find it");
    }
});

test('every language a migration writes strings for is one that cannot be deleted', function (): void {
    test_db();
    $written = array_column(dbAll('SELECT DISTINCT language_code FROM translations ORDER BY language_code'), 'language_code');
    assert_same([], array_values(array_diff($written, TRANSLATION_SEEDED_LANGUAGES)), 'add them to TRANSLATION_SEEDED_LANGUAGES: deleting one would make the next string migration fail');

    $languages = array_column(dbAll('SELECT code FROM languages'), 'code');
    assert_same([], array_values(array_diff(TRANSLATION_SEEDED_LANGUAGES, $languages)), 'and each of them is a language here');
    assert_true(in_array(TRANSLATION_FALLBACK, TRANSLATION_SEEDED_LANGUAGES, true));
    if (catalogue_seeded()) {
        // WAITS FOR 003
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order($written), 'the list names exactly the languages the migrations write');
    }
});

test('every key the frontend uses is in the database, and every key in the database is used', function (): void {
    $scan = translationKeysScan(translationKeysFrontendRoot(), database_keys());
    assert_same([], $scan['problems'], 'what the scan does not let through');

    if (!catalogue_seeded()) {
        // Nothing is written yet, so nothing the frontend already asks for can
        // be found: from the first migration with strings on, all of it is held.
        return;
    }
    // WAITS FOR 003
    assert_same([], $scan['missing'], 'used by the frontend, not in the database - the page would show the key (php tools/translations.php --status)');
    assert_same([], $scan['unused'], 'in the database, used nowhere - delete them with a migration');
    assert_true(is_file(translationKeysFrontendRoot() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE), 'the keys put together at run time are declared in ' . TRANSLATION_DYNAMIC_KEYS_FILE);
});

test('the English the shell keeps for when it has no strings is the database\'s English, key for key', function (): void {
    $file = translationKeysFrontendRoot() . '/' . TRANSLATION_KEPT_ENGLISH_FILE;
    if (!is_file($file)) {
        // WAITS FOR 003: from then on the table must be there.
        assert_false(catalogue_seeded(), 'the shell\'s English for when there are no strings is kept in ' . TRANSLATION_KEPT_ENGLISH_FILE);

        return;
    }

    // Whenever the file is there, it is one this test can read - or the table could say anything.
    $kept = translationKeysKeptEnglish((string) file_get_contents($file));
    assert_same([], $kept['problems'], TRANSLATION_KEPT_ENGLISH_FILE . ' is written as \'key\': \'English\', one a line');

    if (!catalogue_seeded()) {
        return;
    }
    // WAITS FOR 003: every key of the table exists, is used by the app's own
    // sources (the table itself is not a use), and says what the seed says.
    assert_true($kept['values'] !== [], 'the table holds the shell\'s strings');
    $keys = database_keys();
    $english = translationsOf(TRANSLATION_FALLBACK);
    $used = translationKeysScan(translationKeysFrontendRoot(), $keys)['used'];

    assert_same([], array_values(array_diff(array_keys($kept['values']), $keys)), 'kept in English, and not a key of the database');
    assert_same([], array_values(array_filter(array_keys($kept['values']), static fn(string $key): bool => !isset($used[$key]))), 'kept in English, and asked for by no page');
    $different = [];
    foreach ($kept['values'] as $key => $text) {
        if (isset($english[$key]) && $english[$key] !== $text) {
            $different[$key] = ['kept' => $text, 'seeded' => $english[$key]];
        }
    }
    assert_same([], $different, 'the kept English is the seeded English, letter for letter');
});

/* ------------------------------------ what the migrations touch, and do not */

test('the migrations of this work make and fill only their own three tables - by what they say', function (): void {
    $files = translation_migrations();
    assert_true(in_array('002_languages_and_translations.sql', $files, true), 'the migration that makes the tables');
    if (catalogue_seeded()) {
        // WAITS FOR 003: it is among the files from the moment it writes a key.
        assert_true(count($files) >= 2, 'and the one that writes the strings');
    }

    foreach ($files as $file) {
        $code = sql_code(migration_sql($file));

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
    $statements = splitSqlStatements(migration_sql('002_languages_and_translations.sql'));
    assert_match('/^DO \$\$.*server_encoding.*UTF8/s', $statements[0], 'the first thing it does is look at the database\'s encoding');
    assert_match('/^DO \$\$.*RAISE EXCEPTION/s', $statements[count($statements) - 1], 'and the last is its gate');
});

test('the migrations of this work leave everybody\'s progress exactly as it was - by what they do', function (): void {
    $name = test_empty_db('own_tables');
    $pdo = dbConnect(machineDatabaseSettings(), $name);
    assert_same('001_init.sql', pendingMigrations($pdo)[0] ?? null);
    applyMigration($pdo, MIGRATIONS_ALIAS, '001_init.sql');

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
    foreach (pendingMigrationsReadOnly($pdo) as $file) {
        $was = progress_tables_as_they_are($pdo);
        applyMigration($pdo, MIGRATIONS_ALIAS, $file);
        $applied[] = $file;
        if (in_array($file, $held, true)) {
            assert_same($was, progress_tables_as_they_are($pdo), "$file changed a table of 001, or a row in one");
        }
    }
    assert_same([], array_values(array_diff($held, $applied)), 'each of them was applied');
    if ($held === array_values(array_diff(migrationFiles(), ['001_init.sql']))) {
        assert_same($before, progress_tables_as_they_are($pdo), 'and after all of them the progress is what it was');
    }
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
    $result = applyPendingMigrations($pdo);
    assert_same(['001_init.sql'], $result['applied'], 'the tables of 001 hold no text of the app\'s own');
    assert_same('002_languages_and_translations.sql', $result['failed']);
    assert_match('/This database keeps its text as LATIN1, and the app\'s words need UTF8\./', (string) $result['error'], 'it says what is wrong, in words');
    assert_match('/statement 1 of /', (string) $result['error'], 'the very first statement');
    foreach (TRANSLATION_TABLES as $table) {
        assert_false((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "nothing was made: $table");
    }
    assert_same(['001_init.sql'], appliedMigrations($pdo), 'and 002 is still to do, once the database is made again');
    $pdo = null;
});

/* -------------------------------------------------- the rules a string keeps */

test('a language code: two small letters, or two and two - and nothing else reaches a query', function (): void {
    foreach (['en', 'sk', 'pt-br', 'zh-tw'] as $code) {
        assert_true(languageCodeOk($code), $code);
    }
    foreach (['', 'e', 'eng', 'EN', 'En', 'en-', 'en-GB', 'en_gb', 'en-gbr', 'e1', ' en', "en\n", "sk\0", "\xFF\xFE", 'en-gb-x', 5, null, ['en'], true] as $code) {
        assert_false(languageCodeOk($code), test_show($code));
    }
    assert_same(null, languageRow("\xFF"), 'no query for what is not a code: bytes that are not text would be a database error');
});

test('placeholders: {name}, the same expression as the frontend fills in', function (): void {
    assert_same(['name', 'count'], translationPlaceholders('Hello, {name}! {count} of {count} - {name}'));
    assert_same(['a_b', 'A1'], translationPlaceholders('{a_b} {A1}'));
    assert_same([], translationPlaceholders('{} {1a} { name } {na-me} {_x} plain'));
});

test('a save is checked whole: the shape, the key, the language, the text, its length, its placeholders', function (): void {
    assert_same([], check([]), 'nothing to change');
    assert_same(
        [['key' => 'test.bye', 'language' => 'en', 'value' => 'Bye'], ['key' => 'test.hello', 'language' => 'sk', 'value' => 'Dobrý deň, {name}!']],
        check(['test.hello' => ['sk' => "  Dobrý\x07 deň, {name}! \u{00A0}"], 'test.bye' => ['en' => 'Bye']]),
        'control characters dropped, the spaces around it gone'
    );
    assert_same([['key' => 'test.hello', 'language' => 'sk', 'value' => null]], check(['test.hello' => ['sk' => " \t "]]), 'an empty string in another language: that string goes');
    assert_same([], check(['test.hello' => []]), 'a key with nothing to change');

    // Whatever order the cells were typed in, they are written by key and then by language: two
    // saves of the same strings take their rows in one order, and neither waits for the other for ever.
    $ordered = static fn(array $values): array => array_map(static fn(array $change): string => $change['key'] . ' ' . $change['language'], check($values));
    assert_same(['test.bye sk', 'test.hello en', 'test.hello sk'], $ordered(['test.hello' => ['sk' => 'A {name}', 'en' => 'B {name}'], 'test.bye' => ['sk' => 'C']]));
    assert_same(['test.bye sk', 'test.hello en', 'test.hello sk'], $ordered(['test.bye' => ['sk' => ''], 'test.hello' => ['en' => 'B {name}', 'sk' => '']]), 'the ones that go among the ones that are written');
    assert_same($ordered(['test.step' => ['sk' => 'x'], 'test.count' => ['sk' => 'y'], 'test.bye' => ['sk' => 'z']]), $ordered(['test.bye' => ['sk' => 'z'], 'test.count' => ['sk' => 'y'], 'test.step' => ['sk' => 'x']]));

    $invalid = [
        'nothing' => null, 'a text' => 'text', 'a number' => 5, 'a list' => ['a', 'b'],
        'a key with a text' => ['test.hello' => 'Hello'], 'a key with what a list becomes' => ['test.hello' => false],
        'a number for a string' => ['test.hello' => ['sk' => 5]], 'a list for a string' => ['test.hello' => ['sk' => ['x']]], 'null for a string' => ['test.hello' => ['sk' => null]],
        'an object for a string' => ['test.hello' => ['sk' => new stdClass()]],
        '2001 characters' => ['test.bye' => ['sk' => str_repeat('á', 2001)]],
    ];
    foreach ($invalid as $what => $values) {
        assert_same('invalid_value', check($values)[0], $what);
    }
    assert_same(2000, textLength(check(['test.bye' => ['sk' => str_repeat('á', 2000)]])[0]['value']), '2000 characters, not bytes');

    assert_same(['unknown_key', ['key' => 'no.such', 'keys' => ['no.such', '12']]], check(['test.bye' => ['en' => 'Bye'], 'no.such' => ['en' => 'x'], '12' => ['sk' => 'y']]), 'every unknown key is named');
    assert_same(['unknown_language', ['key' => 'test.bye', 'language' => 'de']], check(['test.bye' => ['de' => 'Tschüss']]));
    assert_same(['fallback_required', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => "\x07 "]]), 'English is what the others fall back to');

    // the order of the checks: the key before the language, the language before the text
    assert_same('unknown_key', check(['no.such' => ['xx' => 5]])[0]);
    assert_same('unknown_language', check(['test.bye' => ['xx' => 5]])[0]);
    assert_same('invalid_value', check(['no.such' => 'text'])[0], 'the shape first');
});

test('a body\'s objects become the arrays the checks take - and nothing else does', function (): void {
    // Bodies are decoded to objects here (jsonBody()): an object is a stdClass, a list an array.
    assert_same(['a' => 'x', 'b' => 'y'], translationMapFrom(body('{"a": "x", "b": "y"}')));
    assert_same([], translationMapFrom(body('{}')), 'an empty object is a map with nothing in it');
    foreach (['a list' => '["a", "b"]', 'the empty list' => '[]', 'a text' => '"a"', 'a number' => '5', 'true' => 'true', 'null' => 'null'] as $what => $json) {
        assert_same(null, translationMapFrom(body($json)), $what);
    }
    assert_same(null, translationMapFrom(['a' => 'x']), 'a PHP array is not a body\'s object: only what came in as one');
    // Only the map itself is turned: what it holds stays as it came.
    $inner = translationMapFrom(body('{"a": {"b": "c"}, "d": ["e"]}'));
    assert_true($inner['a'] instanceof stdClass && $inner['d'] === ['e']);
    // PHP makes whole numbers of keys like "12": whoever reads them reads (string) $key.
    assert_same(['12', 'a.b'], array_map('strval', array_keys(translationMapFrom(body('{"12": "x", "a.b": "y"}')))));

    // A grid save's body: {values: {key: {language: text}}}.
    assert_same(['test.bye' => ['sk' => 'Dovidenia', 'en' => 'Bye']], translationValuesFrom(body('{"values": {"test.bye": {"sk": "Dovidenia", "en": "Bye"}}}')));
    assert_same([], translationValuesFrom(body('{"values": {}}')), 'nothing to save');
    assert_same([], check(translationValuesFrom(body('{"values": {}}'))), 'and that is no refusal');
    $none = ['no body' => 'null', 'a list' => '[{"values": {}}]', 'a text' => '"values"', 'a number' => '7', 'no values' => '{"strings": {}}',
        'values as the empty list' => '{"values": []}', 'values as a list' => '{"values": [{"test.bye": {"en": "x"}}]}', 'values as a text' => '{"values": "test.bye"}', 'values as null' => '{"values": null}'];
    foreach ($none as $what => $json) {
        assert_same(null, translationValuesFrom(body($json)), $what);
        assert_same('invalid_value', check(translationValuesFrom(body($json)))[0], "$what is refused as the wrong shape");
    }

    // A key whose strings are not an object is left as it came, and refused with its key.
    assert_same(['invalid_value', ['key' => 'test.bye']], check(translationValuesFrom(body('{"values": {"test.bye": "Bye"}}'))));
    assert_same(['invalid_value', ['key' => 'test.bye']], check(translationValuesFrom(body('{"values": {"test.hello": {"sk": "Ahoj, {name}!"}, "test.bye": ["Bye"]}}'))));
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'sk']], check(translationValuesFrom(body('{"values": {"test.bye": {"sk": {"one": "x"}}}}'))), 'a string that is an object is not text');
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'sk']], check(translationValuesFrom(body('{"values": {"test.bye": {"sk": null}}}'))));

    // A key that looks like a number is an unknown key, named as it was sent.
    assert_same(['unknown_key', ['key' => '12', 'keys' => ['12']]], check(translationValuesFrom(body('{"values": {"12": {"en": "x"}}}'))));
    assert_same(['unknown_language', ['key' => 'test.bye', 'language' => '12']], check(translationValuesFrom(body('{"values": {"test.bye": {"12": "x"}}}'))));
    // An object with the keys "0", "1"... is still an object - PHP makes a list-shaped array of it - and its keys are named.
    assert_same(['unknown_language', ['key' => 'test.bye', 'language' => '0']], check(translationValuesFrom(body('{"values": {"test.bye": {"0": "x"}}}'))));
    assert_same(['unknown_language', ['key' => 'test.bye', 'language' => '0']], check(translationValuesFrom(body('{"values": {"test.bye": {"0": "x", "1": "y"}}}'))));
    assert_same(['unknown_key', ['key' => '0', 'keys' => ['0', '1']]], check(translationValuesFrom(body('{"values": {"0": {"en": "x"}, "1": {"en": "y"}}}'))));
    // And a list is still no map of languages, said about its key.
    assert_same(['invalid_value', ['key' => 'test.bye']], check(translationValuesFrom(body('{"values": {"test.bye": ["x"]}}'))));
    assert_same(['invalid_value', ['key' => 'test.bye']], check(translationValuesFrom(body('{"values": {"test.bye": []}}'))), 'the empty list too');

    // And what is right comes through as it would from arrays.
    assert_same(
        [['key' => 'test.bye', 'language' => 'sk', 'value' => 'Dovidenia'], ['key' => 'test.hello', 'language' => 'en', 'value' => 'Hi, {name}!']],
        check(translationValuesFrom(body('{"values": {"test.hello": {"en": " Hi, {name}! "}, "test.bye": {"sk": "Dovidenia"}}}')))
    );
});

test('a string with nothing in it to see is an empty one - and one too long to trim is too long, never empty', function (): void {
    // A zero-width space, a word joiner, a soft hyphen: trim() leaves each, and the page would draw an empty place.
    $unseen = ['a zero-width space' => "\u{200B}", 'a word joiner' => "\u{2060}", 'a soft hyphen' => "\u{00AD}", 'several, with spaces' => " \u{200B}\u{00A0}\u{200D}\t\u{FEFF} ", 'nothing' => '', 'spaces' => " \n "];
    foreach ($unseen as $what => $text) {
        assert_true(textBlank($text), $what);
        assert_same([['key' => 'test.bye', 'language' => 'sk', 'value' => null]], check(['test.bye' => ['sk' => $text]]), "$what in another language: that string goes");
        assert_same(['fallback_required', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => $text]]), "$what in English");
        try {
            languageName($text, 'The name in English');
            fail("$what was taken for a language's name");
        } catch (ApiError $e) {
            assert_same('invalid_language', $e->errorCode, $what);
        }
    }
    assert_true(textBlank("\xFF\xFE"), 'bytes that are not text are nothing to read');

    // A character of that kind inside a word is part of the word: Persian and Indic spelling needs it.
    foreach (["Ah\u{200C}oj", "\u{200B}Ahoj", 'a', '.', "\u{0301}"] as $text) {
        assert_false(textBlank($text), test_show($text));
    }
    assert_same("Ah\u{200C}oj", check(['test.bye' => ['sk' => " Ah\u{200C}oj "]])[0]['value'], 'kept as it was written');
    assert_same("می\u{200C}خواهم", languageName("می\u{200C}خواهم", 'The name as its speakers write it'));
    // textTrim() itself is the browser's trim(), and takes none of them away.
    assert_same("\u{200B}", textTrim(" \u{200B} "));

    // More spaces inside it than the expression can get through: the text comes back as it is,
    // and is refused for its length - not taken for an empty one, which would delete the stored string.
    $long = 'a' . str_repeat(' ', 1100000) . 'b';
    assert_same($long, textTrim($long));
    assert_false(textBlank($long));
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'sk']], check(['test.bye' => ['sk' => $long]]));
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => $long]]), 'not fallback_required either');
    try {
        languageName($long, 'The name in English');
        fail('taken for a name');
    } catch (ApiError $e) {
        assert_match('/1 to 50 characters/', $e->getMessage());
    }
    assert_same('b', textTrim(str_repeat(' ', 1100000) . 'b'), 'a run at either end is still trimmed');
    assert_same('a', textTrim('a' . str_repeat("\u{00A0}", 600000)));

    // The helpers these rules stand on, as they are in the family's other sites.
    assert_same(3, textLength('ž€🎉'), 'characters, not bytes');
    assert_same("a\tb\nc", textClean("a\tb\x00\nc\x7F"), 'controls dropped, tabs and line breaks kept');
    assert_same(null, textClean("\xC3\x28"), 'bytes that are not UTF-8 are not text');
    assert_same(null, textClean(12));
    assert_same('ab', textWithoutControls("a\x0B\x1Fb"));
});

test('placeholders are the code\'s: English keeps exactly its own, a translation may leave one out but never add one', function (): void {
    assert_same('Hi, {name}!', check(['test.hello' => ['en' => 'Hi, {name}!']])[0]['value'], 'reworded, the placeholder kept');
    assert_same(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'name']], check(['test.hello' => ['en' => 'Hi!']]));
    assert_same(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'who']], check(['test.hello' => ['en' => 'Hi, {name} and {who}!']]));
    assert_same(['placeholder_changed', ['key' => 'test.bye', 'language' => 'en', 'placeholder' => 'name']], check(['test.bye' => ['en' => 'Bye, {name}']]));

    assert_same('Vitaj!', check(['test.hello' => ['sk' => 'Vitaj!']])[0]['value'], 'a translation may say it without the placeholder');
    assert_same(['unknown_placeholder', ['key' => 'test.hello', 'language' => 'sk', 'placeholder' => 'meno']], check(['test.hello' => ['sk' => 'Ahoj, {name} {meno}!']]));
    // English sent with it does not change what the key has: the stored English string does
    assert_same('unknown_placeholder', check(['test.hello' => ['sk' => 'Ahoj {who}', 'en' => 'Hi {who}']])[0]);
    assert_same('placeholder_changed', check(['test.hello' => ['en' => 'Hi {who}', 'sk' => 'Ahoj {who}']])[0]);

    // a key with no English string yet: the English sent with it is what counts
    assert_same(2, count(check(['test.new' => ['sk' => 'Nové {a}', 'en' => 'New {a}']])));
    assert_same('unknown_placeholder', check(['test.new' => ['sk' => 'Nové {a}']])[0], 'with no English at all there is no placeholder to use');
    assert_same(1, count(check(['test.new' => ['sk' => 'Nové']])));
});

test('a brace is only ever part of a placeholder: one written any other way is refused, not shown to everybody', function (): void {
    // What the page would leave exactly as it is written: the name translated, a space inside, a brace too few or too many.
    $wrong = [
        'the name translated' => ['test.count', 'sk', '{počet} nôt'],
        'spaces inside' => ['test.count', 'sk', '{ count } nôt'],
        'never closed' => ['test.count', 'sk', '{count nôt'],
        'a space before it closes' => ['test.count', 'sk', '{count } nôt'],
        'two braces' => ['test.count', 'sk', '{{count}} nôt'],
        'one of two never closed' => ['test.step', 'sk', 'Krok {n / {m}'],
        'two braces in English' => ['test.step', 'en', 'Step {{n}} of {m}'],
        'a brace that only closes' => ['test.bye', 'sk', 'Dovidenia }'],
        'a brace in a string with no placeholder' => ['test.bye', 'en', 'Good {bye'],
        'an empty pair' => ['test.count', 'sk', '{count} {} nôt'],
    ];
    foreach ($wrong as $what => [$key, $code, $text]) {
        assert_same(['invalid_placeholder', ['key' => $key, 'language' => $code]], check([$key => [$code => $text]]), $what);
    }
    try {
        translationsCheck(['test.step' => ['sk' => 'Krok { n }']], ['test.step'], ['sk' => 'Slovak'], ['test.step' => 'Step {n} of {m}']);
        fail('taken');
    } catch (ApiError $e) {
        assert_same('The Slovak string of "test.step" has a { or } that is not part of a placeholder. A placeholder is written exactly as the English string has it, like {n}: no spaces, and its name is not translated.', $e->getMessage(), 'it says how one is written, with one of the key\'s own');
    }
    // A key with no placeholder is told so - never shown one it does not have, which the next save would refuse.
    foreach (['sk' => 'Vitaj {', 'en' => 'Good {bye'] as $code => $text) {
        try {
            translationsCheck(['test.bye' => [$code => $text]], ['test.bye'], ['en' => 'English', 'sk' => 'Slovak'], ['test.bye' => 'Goodbye']);
            fail('taken');
        } catch (ApiError $e) {
            assert_same('invalid_placeholder', $e->errorCode);
            $language = $code === 'sk' ? 'Slovak' : 'English';
            assert_same("The $language string of \"test.bye\" has a { or } that is not part of a placeholder. This key has no placeholder, so its strings can hold no { or }.", $e->getMessage(), "$code: no placeholder to name");
        }
    }

    // Before the placeholders are compared: a well-made one the key does not have is still the other refusal.
    assert_same('unknown_placeholder', check(['test.count' => ['sk' => '{meno} nôt']])[0]);
    assert_same('unknown_placeholder', check(['test.count' => ['sk' => '{Count} nôt']])[0], 'a placeholder\'s name is as it is written, capitals too');
    assert_same('placeholder_changed', check(['test.step' => ['en' => 'Step {n}']])[0]);
    // And what was fine is fine.
    assert_same('{count} nôt', check(['test.count' => ['sk' => '{count} nôt']])[0]['value']);
    assert_same('Krok {n} / {m}', check(['test.step' => ['sk' => 'Krok {n} / {m}']])[0]['value']);
    assert_same('Ahoj, {name}!', check(['test.hello' => ['sk' => 'Ahoj, {name}!']])[0]['value']);
    assert_same('Vitaj!', check(['test.hello' => ['sk' => 'Vitaj!']])[0]['value']);
});

test('every string the migrations wrote passes the checks a save makes, as it is', function (): void {
    // Otherwise a string nobody could save again would be released: the grid sends a cell back
    // whole, and a rule the seed does not keep (a brace, a length, a space at its end) would refuse it.
    test_db();
    $languages = array_column(dbAll('SELECT code, name FROM languages'), 'name', 'code');
    $stored = [];
    foreach (dbAll('SELECT key_name, language_code, value FROM translations ORDER BY key_name COLLATE "C", language_code') as $row) {
        $stored[$row['key_name']][$row['language_code']] = $row['value'];
    }
    if (catalogue_seeded()) {
        // WAITS FOR 003
        assert_true(count($stored) > 100, 'the strings are there to check');
    }

    $changes = translationsCheck($stored, database_keys(), $languages, translationsOf(TRANSLATION_FALLBACK));
    $checked = [];
    foreach ($changes as $change) {
        $checked[$change['key']][$change['language']] = $change['value'];
    }
    assert_same($stored, $checked, 'every string comes back as it is kept');
});

test('a string migration\'s gate checks exactly the keys the migration writes, and writes each in every language', function (): void {
    // WAITS FOR 003: there is no string migration to read until then.
    foreach (string_migrations() as $file) {
        $found = migration_keys($file);
        assert_true($found['keys'] !== [], "$file: the keys it inserts could not be read");
        assert_same($found['keys'], array_values(array_unique($found['keys'])), "$file: a key is inserted twice");
        assert_same(in_order($found['keys']), in_order($found['gate']), "$file: the keys its gate checks are not the keys it inserts - a key left out of the gate could lack a string and nothing would say so");
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order(array_keys($found['strings'])), "$file: one block of strings a language");
        foreach ($found['strings'] as $code => $keys) {
            assert_same(in_order($found['keys']), in_order($keys), "$file: the keys with a string in \"$code\" are not the keys it inserts");
        }
    }
});

test('If-None-Match is compared the weak way: any tag of the list, with or without W/, or * - and as a server that compresses sends it back', function (): void {
    $etag = '"abc"';
    foreach (['"abc"', 'W/"abc"', '"x", "abc"', '"x" ,W/"abc" , "y"', '*', ' "abc" '] as $header) {
        assert_true(translationsNotModified($header, $etag), $header);
    }
    // Apache's mod_deflate and mod_brotli mark the tag of an answer they compressed, inside the quotes.
    foreach (['"abc-gzip"', 'W/"abc-gzip"', '"abc-br"', 'W/"abc-br"', '"abc-zstd"', '"x", "abc-gzip"', '"x-gzip" , W/"abc-gzip"'] as $header) {
        assert_true(translationsNotModified($header, $etag), $header);
    }
    foreach (['', 'abc', '"abd"', 'W/"x"', '"abc', 'w/"abc"', '"abd-gzip"', '"abc-gzipx"', '"abc-deflate"', 'abc-gzip"', '"abc-gzip', '"x-gzip"', '"abc-gzip-gzip"', '"abc"-gzip'] as $header) {
        assert_false(translationsNotModified($header, $etag), $header);
    }
});

/* ------------------------------------------------------------------ the scan */

test('the scan: a quoted literal with a key\'s shape in a namespace the database has - never an attribute\'s value, a comment, a spec, the kept English', function (): void {
    $root = sources([
        'pages/home/home.component.html' => <<<'HTML'
            <!-- {{ 'home.inAComment' | translate }} -->
            <h1>{{ 'home.title' | translate }}</h1>
            <p [text]="error.message" title="home.anAttribute" [class.on]="home.expression"></p>
            <button [attr.aria-label]="'common.close' | translate" (click)="close()">x</button>
            <span>{{ 'home.due' | translatePlural: n }}</span>
            <span>{{ "home.doubleQuoted" | translate }}</span>
            <p>Don't stop: {{ 'home.afterAnApostrophe' | translate: { day: d } }} - it's fine</p>
            <!--
              'home.inALongComment'
            -->
            <em>{{ 'home.missing' | translate }}</em>
            HTML,
        'pages/home/home.component.ts' => <<<'TS'
            import { Home } from './home.model';
            import { NoteState } from '../../core/music/music.types';
            // 'home.inALineComment' is what a comment explains
            /* 'home.inABlockComment'
               'home.stillInIt' */
            const address = 'http://example.test/'; const afterIt = 'home.afterAnAddress';
            const accept = 'image/*'; const afterAGlob = 'home.afterAGlob'; /* and 'home.afterTheGlob' is a comment */
            const quote = 'it\'s'; const afterAQuote = 'home.afterAnEscape';
            this.feedback.set({ key: 'home.saved', kind: 'good' }); const both = `${this.i18n.t("home.inATemplate")}`;
            const notOurs = ['music.types', 'theme-boot.js', 'home', '.home.title', 'Home.title', 'home..title', 'home.ti tle', 'music.', `music.${kind}`];
            const inBackticks = `home.inBackticks`; const sentence = `home.title is ${what}, they say`;
            const label = word('path.step.' + step.type + '.short') + word(`path.hint.${midi}`);
            TS,
        'pages/home/home.component.spec.ts' => "expect(text).toBe('home.onlyInASpec');\n",
        'core/testing/example.ts' => "export const example = 'home.onlyInTesting';\n",
        'core/auth/anotoki-auth.d.ts' => "export const sdk = 'home.inTheSdk';\n",
        'core/auth/auth.service.ts' => "const key = 'home.inTheAuthService';\n",
        'pages/home/home.component.scss' => "/* 'home.inAStyle' */\n",
        'core/i18n/kept-english.ts' => "export const KEPT_ENGLISH: Readonly<Record<string, string>> = {\n  'home.title': 'Learn',\n  'home.onlyKept': 'Kept, and asked for by no page',\n};\n",
        'core/i18n/dynamic-keys.ts' => <<<'TS'
            /** The keys put together at run time: 'comment.': ['ignored']. */
            export const DYNAMIC_KEYS: Record<string, readonly string[]> = {
              // a comment: 'also.': ['ignored']
              'path.step.': ['meet.short', 'drill.short'],
              'path.hint.': [
                '60',
                "62",
              ],
              'lesson.result.': ['met', 'needed'],
              'error.': [],
            };
            TS,
    ]);
    $database = [
        'home.title', 'home.due.one', 'home.due.few', 'home.due.other', 'home.doubleQuoted', 'home.afterAnApostrophe',
        'home.afterAnAddress', 'home.afterAGlob', 'home.afterAnEscape', 'home.saved', 'home.inATemplate', 'home.inTheAuthService', 'home.inBackticks',
        'home.inAComment', 'home.inALineComment', 'home.inABlockComment', 'home.onlyInASpec', 'home.onlyInTesting', 'home.inTheSdk', 'home.anAttribute', 'home.expression', 'home.onlyKept',
        'common.close', 'common.unused', 'error.message', 'error.unknown',
        'path.step.meet.short', 'path.step.drill.short', 'path.step.read.short', 'path.hint.60', 'path.hint.62',
        'lesson.result.met', 'lesson.result.needed.one', 'lesson.result.needed.few', 'lesson.result.needed.other',
    ];
    $scan = translationKeysScan($root, $database);

    assert_same([], $scan['problems']);
    assert_same(['home.missing' => ['pages/home/home.component.html:11']], $scan['missing'], 'asked for, and not there');
    assert_same([
        'common.unused', 'error.message', 'error.unknown',
        'home.anAttribute', 'home.expression', 'home.inABlockComment', 'home.inAComment', 'home.inALineComment', 'home.inTheSdk', 'home.onlyInASpec', 'home.onlyInTesting', 'home.onlyKept',
        'path.step.read.short',
    ], $scan['unused'], 'an attribute\'s value is an expression; comments, specs, the example data, the vendored SDK and the kept English do not count; nor does a key under a declared prefix that is not listed');
    assert_same(['pages/home/home.component.html:2'], $scan['used']['home.title'], 'with the file and the line - and the kept English is not a place it is used');
    assert_same(['pages/home/home.component.ts:7'], $scan['used']['home.afterAGlob'], 'the lines are the file\'s, comments or not');
    assert_same(['pages/home/home.component.html:5'], $scan['used']['home.due.few'], 'a plural is asked for by its family\'s name');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['lesson.result.needed.other'], 'a declared key may be a family too');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['path.hint.62']);
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['path.step.meet.short'], 'a tail may have dots of its own');
    assert_same(count($database) - count($scan['unused']), count($scan['used']));

    // A namespace the database does not have is nobody's key - 'music.types' is a file.
    assert_same([], translationKeysScan($root, [])['used']);
    assert_same(['lesson.result.met', 'lesson.result.needed', 'path.hint.60', 'path.hint.62', 'path.step.drill.short', 'path.step.meet.short'], array_keys(translationKeysScan($root, [])['missing']), 'but what is declared must exist, whatever the database has');
    assert_same(['pages/home/home.component.ts:11'], $scan['used']['home.inBackticks'], 'a template literal with nothing put into it is a literal');
    assert_same(['home.afterAGlob', 'home.afterAnAddress', 'home.afterAnApostrophe', 'home.afterAnEscape', 'home.doubleQuoted', 'home.due', 'home.inATemplate', 'home.inBackticks', 'home.inTheAuthService', 'home.missing', 'home.saved', 'home.title'],
        array_values(array_filter(array_keys(translationKeysScan($root, ['home.x'])['missing']), static fn(string $key): bool => str_starts_with($key, 'home.'))), 'every literal of a namespace the database has');
});

test('the scan: a plural family with a form missing names the form', function (): void {
    $root = sources(['a.component.html' => "{{ 'lesson.notes' | translatePlural: n }}\n{{ 'lesson.note' | translate }}\n"]);
    $scan = translationKeysScan($root, ['lesson.notes.one', 'lesson.notes.other', 'lesson.note']);
    assert_same(['lesson.notes.few' => ['a.component.html:1']], $scan['missing']);
    assert_same(['lesson.note', 'lesson.notes.one', 'lesson.notes.other'], array_keys($scan['used']));
    assert_same([], $scan['unused']);
    assert_same([], $scan['problems'], 'a family with a form missing is a family: the form is what is missing');
});

test('the scan: a key asked for the wrong way - a family as one string, one string as a family - shows the key, and fails', function (): void {
    // Both "exist", so by the keys alone all is well - and t('home.due') finds no such key, plural('home.continue') no home.continue.other.
    $root = sources([
        'a.component.html' => <<<'HTML'
            <p>{{ 'home.due' | translate: { count: n } }}</p>
            <p>{{ "home.continue" | translatePlural: n }}</p>
            <p [title]="'home.due' | translatePlural: n">{{ "home.continue" | translate }}</p>
            <!-- {{ 'home.due' | translate }} -->
            <p>{{ 'other.due' | translate }} {{ (wide ? 'home.due' : 'home.continue') | translate }}</p>
            HTML,
        'a.component.ts' => <<<'TS'
            const a = this.i18n.t('home.continue') + this._i18n.plural("home.due", count);
            const b = this.i18n.t( "home.due", { count }) + i18n.plural(`home.continue`, 2);
            const c = i18n.around('home.due', 'count') + (i18n.has('home.due') ? 1 : 0) + i18n.has('home.continue');
            // i18n.t('home.due') in a comment
            const d = set.has('title') && map.t('music.due') && i18n.plural(key, count) && i18n.t(TABLE[kind] ?? 'home.continue');
            const e = i18n.aroundPlural('home.due', n, 'count') + i18n.aroundPlural( 'home.continue', n, 'count');
            TS,
    ]);
    $database = ['home.due.one', 'home.due.few', 'home.due.other', 'home.continue'];
    $scan = translationKeysScan($root, $database);
    assert_same([
        "a.component.html:1: 'home.due' is a plural family and is asked for as one string - the page would show the key",
        "a.component.html:2: 'home.continue' is asked for as a plural, and there is no home.continue.one, .few or .other - the page would show the key",
        "a.component.ts:2: 'home.due' is a plural family and is asked for as one string - the page would show the key",
        "a.component.ts:2: 'home.continue' is asked for as a plural, and there is no home.continue.one, .few or .other - the page would show the key",
        "a.component.ts:3: 'home.due' is a plural family and is asked for as one string - the page would show the key",
        "a.component.ts:3: 'home.due' is a plural family and is asked for as one string - the page would show the key",
        "a.component.ts:6: 'home.continue' is asked for as a plural, and there is no home.continue.one, .few or .other - the page would show the key",
    ], $scan['problems'], 'each place it is asked for wrongly, in either quote; the right way round (aroundPlural cuts a family), a comment, another namespace and a key that comes through a variable are let be');
    assert_same([], $scan['missing'], 'by the keys alone nothing is missing - which is why it has to be said');
    assert_same([], $scan['unused']);

    // Asked for as a plural with no key of that name at all: both are said.
    $none = translationKeysScan(sources(['a.component.html' => "{{ 'home.hours' | translatePlural: n }}\n"]), ['home.continue']);
    assert_same(['home.hours'], array_keys($none['missing']));
    assert_match("/^a\\.component\\.html:1: 'home\\.hours' is asked for as a plural/", $none['problems'][0] ?? '');
});

test('the scan: a key put together at run time is put together from a declared prefix, or the scan fails', function (): void {
    $files = [
        'a.service.ts' => <<<'TS'
            const result = this.i18n.t('lesson.result.' + kind);
            const again = this.i18n.t(`lesson.result.${kind}`) + this.i18n.t(`lesson.result${suffix}`) + this.i18n.t("lesson." + part + '.title');
            const declared = word('path.hint.' + midi) + word(`path.hint.${midi}`);
            const whole = i18n.t(`lesson.inBackticks`) + i18n.t(`lesson.notThere`);
            const notOurs = ['music.' + kind, `music.${kind}`, `lesson.result is ${kind}`, 'lesson', 'lesson. ', `${kind}.lesson.`];
            // 'lesson.commented.' + kind
            TS,
        'a.component.html' => "<p>{{ ('lesson.shown.' + kind) | translate }}</p>\n<p class=\"lesson.\" [title]=\"'lesson.title.' + kind\"></p>\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = {\n  'path.hint.': ['60'],\n};\n",
    ];
    $database = ['lesson.start', 'lesson.inBackticks', 'path.hint.60'];
    $scan = translationKeysScan(sources($files), $database);
    assert_same([
        "a.component.html:1: a key is put together from 'lesson.shown.', which core/i18n/dynamic-keys.ts does not declare",
        "a.component.html:2: a key is put together from 'lesson.title.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:1: a key is put together from 'lesson.result.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'lesson.result.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'lesson.result', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'lesson.', which core/i18n/dynamic-keys.ts does not declare",
    ], $scan['problems'], 'a literal ending in a dot, a template literal going on with ${...}; a declared prefix, another namespace, a sentence and a comment are let be');
    assert_same(['lesson.notThere' => ['a.service.ts:4']], $scan['missing'], 'a key in backticks is asked for like any other');
    assert_same(['a.service.ts:4'], $scan['used']['lesson.inBackticks']);
    assert_same(['lesson.start'], $scan['unused']);

    // Declared, the same sources pass - and the keys under the prefix are then held like any others.
    $files['core/i18n/dynamic-keys.ts'] = "export const DYNAMIC_KEYS = {\n  'path.hint.': ['60'],\n  'lesson.result.': ['met'],\n  'lesson.shown.': [],\n  'lesson.title.': [],\n  'lesson.': [],\n};\n";
    $declared = translationKeysScan(sources($files), $database);
    assert_same(["a.service.ts:2: a key is put together from 'lesson.result', which core/i18n/dynamic-keys.ts does not declare"], $declared['problems'], 'what is left is the one that is no prefix at all');
    assert_same(['lesson.notThere', 'lesson.result.met'], array_keys($declared['missing']), 'and a declared key that is not in the database is missing');

    // With no such file at all nothing is declared: every key put together is a problem, and the scan still reads.
    unset($files['core/i18n/dynamic-keys.ts']);
    $without = translationKeysScan(sources($files), $database);
    assert_same(8, count($without['problems']), test_show($without['problems']));
    assert_match("/^a\\.service\\.ts:3: a key is put together from 'path\\.hint\\.'/", $without['problems'][6]);
    assert_same(['path.hint.60'], array_values(array_filter($without['unused'], static fn(string $key): bool => str_starts_with($key, 'path.'))), 'and what nobody declares, nobody uses');
});

test('the scan: a tail in dynamic-keys.ts is not a key of its own, whatever namespace it looks like', function (): void {
    // The step types are meet, drill, read ... and so are some of the namespaces: 'meet.title' under
    // 'path.step.' is path.step.meet.title - not a key "meet.title" that the database then lacks.
    $root = sources([
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS: Record<string, readonly string[]> = {\n  'path.step.': ['meet.title', 'meet.short', 'drill.title'],\n  'path.unit.': ['rh-5.title'],\n};\n",
        'core/i18n/path-words.ts' => "export const stepTitle = (i18n: TranslationService, type: StepType) => i18n.t('path.step.' + type + '.title');\n",
        'pages/lesson/steps/meet-step.component.html' => "<p>{{ 'meet.press' | translate }}</p>\n",
    ]);
    $scan = translationKeysScan($root, ['path.step.meet.title', 'path.step.meet.short', 'path.step.drill.title', 'path.unit.rh-5.title', 'meet.press', 'drill.title']);
    assert_same([], $scan['missing'], 'nothing of the meet or drill namespace is asked for by the table');
    assert_same(['drill.title'], $scan['unused'], 'and a key written like a tail is not used by it');
    assert_same([], $scan['problems']);
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['path.step.meet.title']);
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['path.unit.rh-5.title'], 'an id with a dash is a tail like any other');
});

test('the scan works on a frontend that has no dynamic-keys.ts and no kept-english.ts yet, or empty ones', function (): void {
    $page = ['app.component.html' => "<h1>{{ 'nav.learn' | translate }}</h1>\n", 'app.component.ts' => "const nav = [{ path: '', labelKey: 'nav.learn' }];\n"];
    $database = ['nav.learn', 'nav.stats'];
    $expected = ['used' => ['nav.learn' => ['app.component.html:1', 'app.component.ts:1']], 'missing' => [], 'unused' => ['nav.stats'], 'problems' => []];

    assert_same($expected, translationKeysScan(sources($page), $database), 'neither file');
    $empties = [
        'nothing in them' => ['', ''],
        'a comment only' => ["// The keys put together at run time: none yet.\n", "/** The English the shell keeps: none yet. */\n"],
        'an empty object' => ["export const DYNAMIC_KEYS: Record<string, readonly string[]> = {};\n", "export const KEPT_ENGLISH: Readonly<Record<string, string>> = {};\n"],
        'an empty object over lines' => ["export const DYNAMIC_KEYS: Record<string, readonly string[]> = {\n  // none yet\n};\n", "export const KEPT_ENGLISH = {\n};\n"],
    ];
    foreach ($empties as $what => [$dynamic, $kept]) {
        $root = sources($page + ['core/i18n/dynamic-keys.ts' => $dynamic, 'core/i18n/kept-english.ts' => $kept]);
        assert_same($expected, translationKeysScan($root, $database), $what);
        assert_same(['prefixes' => [], 'keys' => [], 'problems' => []], translationKeysDynamic($dynamic), $what);
        assert_same(['values' => [], 'problems' => []], translationKeysKeptEnglish($kept), $what);
    }
    assert_same([], translationKeysScan(sources($page), [])['missing'], 'and with no key in the database, nothing is asked for');

    // Only kept-english.ts is passed over: another file beside it is read like any other.
    $beside = translationKeysScan(sources($page + ['core/i18n/kept-english.ts' => "export const KEPT_ENGLISH = {\n  'nav.stats': 'Stats',\n};\n", 'core/i18n/path-words.ts' => "const key = 'nav.songs';\n"]), $database);
    assert_same(['nav.stats'], $beside['unused']);
    assert_same(['nav.songs' => ['core/i18n/path-words.ts:1']], $beside['missing']);
});

test('the kept English is read as text: \'key\': \'English\', single-quoted, an apostrophe as \\\' - anything else is a problem', function (): void {
    $kept = translationKeysKeptEnglish(str_replace("\n", "\r\n", <<<'TS'
        /** The English the shell is drawn in while there is no bundle: 'comment.key': 'ignored'. */
        export const KEPT_ENGLISH: Readonly<Record<string, string>> = {
          'boot.notSetUp.title': 'Piano Academy is not set up yet',
          'footer.whatsNew': 'What\'s new',
          // 'a.comment': 'ignored too',
          'midi.connected': 'Connected: {name}',
          'common.loading': 'Loading…',
          'boot.loadError.text':
            'The app could not load your progress, so it has not started: "practising" now would overwrite it.',
          'title.learn': 'Learn', 'title.stats': 'Stats',
        };
        TS));
    assert_same([], $kept['problems']);
    assert_same([
        'boot.notSetUp.title' => 'Piano Academy is not set up yet',
        'footer.whatsNew' => 'What\'s new',
        'midi.connected' => 'Connected: {name}',
        'common.loading' => 'Loading…',
        'boot.loadError.text' => 'The app could not load your progress, so it has not started: "practising" now would overwrite it.',
        'title.learn' => 'Learn',
        'title.stats' => 'Stats',
    ], $kept['values']);

    $wrong = translationKeysKeptEnglish(<<<'TS'
        export const KEPT_ENGLISH = {
          'nav.learn': 'Learn',
          "nav.stats": 'Stats',
          'nav.songs': "Songs",
          'nav.sheet': `Sheet Practice`,
          'nav.trainer': 'Note\nTrainer',
          'nav.dash': 'Learn \u2013 now',
          'nav.learn': 'Learn again',
          'nav.made': word('Made'),
        };
        TS);
    assert_same(['nav.learn' => 'Learn'], $wrong['values'], 'only what could be read');
    assert_same(7, count($wrong['problems']), test_show($wrong['problems']));
    assert_match("/^'nav\\.stats' is not written as 'key': 'English' in single quotes/", $wrong['problems'][0]);
    assert_match("/^'nav\\.songs' is not written/", $wrong['problems'][1]);
    assert_match("/^'nav\\.sheet' is not written/", $wrong['problems'][2]);
    assert_match("/^the English of 'nav\\.trainer' has an escape other than/", $wrong['problems'][3]);
    assert_match("/^the English of 'nav\\.dash' has an escape other than/", $wrong['problems'][4]);
    assert_match("/^'nav\\.learn' is there twice/", $wrong['problems'][5]);
    assert_match("/^'nav\\.made' is not written/", $wrong['problems'][6], 'a text made by code cannot be read');
});

test('the scan fails a template that gives innerHTML a translated string, on one line or several - and a list of tails it cannot read', function (): void {
    $root = sources([
        'a.component.html' => "<p [innerHTML]=\"text()\"></p>\n<p>{{ 'home.title' | translate }}</p>\n<p [innerHTML]=\"'home.title' | translate\"></p>\n<!-- <p [innerHTML]=\"'home.title' | translatePlural: 2\"></p> -->\n"
            // Broken over lines, as a formatter breaks a long binding.
            . "<div\n  class=\"rich\"\n  [innerHTML]=\"\n    'home.title'\n      | translate: { name: name() }\n  \"\n></div>\n"
            // A translated string beside the binding, not in it: drawn as text like any other.
            . "<p [innerHTML]=\"entry().html\" [attr.aria-label]=\"'home.title' | translate\">{{ 'home.title' | translate }}</p>\n"
            . "<p [innerHtml]='i18n.t(\"home.title\")'></p>\n"
            . "<p [innerHTML]=\"i18n.aroundPlural('home.title', 2, 'count')[0]\"></p>\n",
        'a.component.ts' => "el.innerHTML = this.i18n.translate('home.title');\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = {\n  'path.step.': STEP_TYPES.map((type) => type + '.short'),\n  'path.hint.': [...HINTS],\n  'error.': ['offline', 'not a key', ''],\n  'time.': ['justNow'],\n};\n",
    ]);
    $scan = translationKeysScan($root, ['home.title', 'time.justNow', 'error.offline']);
    assert_same(8, count($scan['problems']), test_show($scan['problems']));
    assert_match('/^a\.component\.html:3: innerHTML is given a translated string - a string is text/', $scan['problems'][0]);
    assert_match('/^a\.component\.html:7: innerHTML is given a translated string/', $scan['problems'][1], 'on the line the binding begins');
    assert_match('/^a\.component\.html:13: innerHTML is given a translated string/', $scan['problems'][2], 'asked for with t() in the template, and however the attribute is written - line 12, with a translated string beside the binding, is let be');
    assert_match('/^a\.component\.html:14: innerHTML is given a translated string/', $scan['problems'][3], 'and a half of a plural sentence is a translated string too');
    assert_match("/dynamic-keys\\.ts: the tails of 'path\\.step\\.' are not written out/", $scan['problems'][4]);
    assert_match("/the tails of 'path\\.hint\\.' are not written out/", $scan['problems'][5]);
    assert_match("/'error\\.' \\+ 'not a key' is not a key/", $scan['problems'][6]);
    assert_match("/'error\\.' \\+ '' is not a key/", $scan['problems'][7]);
    assert_same([], $scan['missing'], 'what could be read was read');
    assert_same([], $scan['unused']);

    $empty = translationKeysScan(sources(['core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = makeKeys();\n"]), []);
    assert_match('/could be read from it/', $empty['problems'][0] ?? '', 'a table made by code declares nothing anybody can read - which is not the same as an empty one');
});

test('the scan reads the real frontend: only the files it should, and their comments are not keys', function (): void {
    $root = translationKeysFrontendRoot();
    $files = translationKeySourceFiles($root);
    assert_true(in_array('app.routes.ts', $files, true) && in_array('app.component.html', $files, true), 'the sources are where the scan looks');
    foreach ($files as $file) {
        assert_match('/\.(ts|html)$/', $file);
        assert_no_match('~\.spec\.ts$|^core/testing/|^core/auth/anotoki-auth\.|^core/i18n/kept-english\.ts$~', $file);
    }
    assert_same("a\n\n\nb 'c/*' \"d//\" `e\n//` f \ng", translationKeySourceText("a\r\n/* x\r\n 'y' */\r\nb 'c/*' \"d//\" `e\n//` f // 'z'\r\ng", false), 'comments out, strings as they are, line for line');
    assert_same("a\n\nb", translationKeySourceText("a<!-- 'x'\n -->\nb", true));
});

/* --------------------------------------------------- a language as a file */

test('a language\'s strings as a file: flat JSON, the letters as they are, {} for none', function (): void {
    $dir = test_temp_dir('strings');
    assert_same("{}\n", translationFileText([]));
    assert_same("{}\n", translationFileText(new stdClass()));
    assert_same("{\n    \"home.title\": \"Učenie – „moja cesta“ 🎉\",\n    \"a/b\": \"1\"\n}\n", translationFileText(['home.title' => 'Učenie – „moja cesta“ 🎉', 'a/b' => '1']));

    $values = ['home.title' => 'Učenie', 'home.intro' => "prvý\nriadok", '12' => 'a key that looks like a number'];
    translationFileWrite("$dir/sk.json", $values);
    assert_same($values, translationFileRead("$dir/sk.json"));
    file_put_contents("$dir/windows.json", "\xEF\xBB\xBF" . str_replace("\n", "\r\n", translationFileText($values)));
    assert_same($values, translationFileRead("$dir/windows.json"), 'as an editor on Windows saves it');
    file_put_contents("$dir/empty.json", "{}\n");
    assert_same([], translationFileRead("$dir/empty.json"));

    file_put_contents("$dir/numbers.json", '{"0": "Ahoj", "1": "Svet"}');
    assert_same(['0' => 'Ahoj', '1' => 'Svet'], translationFileRead("$dir/numbers.json"), 'an object whose keys look like numbers is an object - the keys are refused where the strings are kept');
    file_put_contents("$dir/empty-list.json", '[]');
    assert_throws(static fn() => translationFileRead("$dir/empty-list.json"), '/one flat object/');

    file_put_contents("$dir/list.json", '["a", "b"]');
    file_put_contents("$dir/broken.json", '{"a": ');
    file_put_contents("$dir/text.json", '"a"');
    assert_throws(static fn() => translationFileRead("$dir/list.json"), '/one flat object/');
    assert_throws(static fn() => translationFileRead("$dir/text.json"), '/one flat object/');
    assert_throws(static fn() => translationFileRead("$dir/broken.json"), '/is not JSON/');
    assert_throws(static fn() => translationFileRead("$dir/nothing.json"), '/There is no file/');
});
