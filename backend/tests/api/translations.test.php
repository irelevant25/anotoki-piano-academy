<?php

// The app's own strings through the real server, signed in through the IAM
// with the tests' own tokens - the anotoki family's routes of the words
// (anotoki/lib's TranslationsRoutes) as this app wires them: in the IAM's
// wire format (snake_case), in this app's error shape ({error, code, ...}),
// behind this app's own role checks. Anybody reads a language's strings with
// English underneath - no token looked at; the staff (EDITOR or ADMIN in the
// IAM) reword the strings - checked whole, the changed ones only, never a
// placeholder the code does not fill - and only ADMIN adds, changes and
// deletes languages. Who has which role is the verified token's `roles`, and
// nothing else a request says. Who saved a string is the token's person.
// (Every admin route, role by role, is also in tests/api/admin.test.php; how
// each rule works inside is the library's, and tested there.)
//
// The keys here are the test's own: the migrations write the real ones, and
// what they leave is held to the frontend in tests/unit/translations.test.php.
// The tests run in order and build on each other's strings.
//
// One thing here WAITS FOR 003 (the migration that writes the strings): the
// command line's --status being clean on a database as the migrations leave
// it. It is written, and bites from the moment a migration with INSERT INTO
// translation_keys is in migrations/piano_academy/ (catalogue_seeded()).

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings
require TEST_BACKEND . '/tools/translation_keys.php';

use Anotoki\Lib\Translations\TranslationFile;

const ADMIN_A = 1; // the IAM role ADMIN of this application
const ADMIN_B = 2; // ADMIN too: a second person who may do all of it
const LEARNER = 101; // signed in with no role of this application: learns, and nothing here
const ROLELESS = 102; // a token with no `roles` claim at all
const EDITOR_A = 7; // the IAM role EDITOR: rewords the strings, and no more

const ENGLISH = ['code' => 'en', 'name' => 'English', 'native_name' => 'English'];
const SLOVAK = ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina'];

/** What the words say while the database has none to give (anotoki/lib's Translations::unavailable()). */
const NO_WORDS_YET = 'The words are not in the database yet. An administrator applies the waiting database update on the Migrations page.';

$GLOBALS['hosted'] = null;
before(function (): void {
    $GLOBALS['hosted'] = start_app(test_auth_iam());
    // This file's copy of the database starts with no string at all: the
    // app's own keys (003 and after) and the library's (anotoki.*) are taken
    // out of it, and their strings go with them. What the routes do is then
    // said in a handful of keys that are the test's, and does not change with
    // every string the app gains.
    dbExec('DELETE FROM translation_keys');
});

/** Has a migration written the strings yet? What WAITS FOR 003 is held from then on. */
function catalogue_seeded(): bool
{
    foreach (migrationFiles() as $file) {
        if (preg_match('/INSERT\s+INTO\s+translation_keys\b/i', (string) file_get_contents(migrationsDir() . '/' . $file))) {
            return true;
        }
    }

    return false;
}

/** An access token as the IAM would sign it for that person. */
function token_of(int $user): string
{
    if ($user === ROLELESS) {
        return test_token($user, [], ['roles' => null]);
    }

    return test_token(
        $user,
        match ($user) {
            ADMIN_A, ADMIN_B => [ROLE_ADMIN],
            EDITOR_A => [ROLE_EDITOR],
            default => [],
        },
    );
}

/** The hosted site, signed in as $user. */
function as_user(int $user, string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['hosted']['base'], $method, $url, $body, array_merge($headers, bearer(token_of($user))));
}

/** The hosted site, with no token. */
function anonymous(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['hosted']['base'], $method, $url, $body, $headers);
}

/** A save of the grid's changed strings, as the Translations page sends it. */
function save(int $user, array $values): array
{
    return as_user($user, 'PUT', '/api/admin/translations', ['values' => $values === [] ? new stdClass() : $values]);
}

/** One string as the database has it: [value, updated_by, updated_at] - or null. */
function stored(string $key, string $code): ?array
{
    $row = dbOne('SELECT value, updated_by, updated_at FROM translations WHERE key_name = ? AND language_code = ?', [$key, $code]);

    return $row === null ? null : array_values($row);
}

/** Every string the database has, as "key code" => value: to see that a refused save wrote nothing. */
function every_string(): array
{
    return array_column(dbAll("SELECT key_name || ' ' || language_code AS cell, value || ' by ' || COALESCE(updated_by::text, 'nobody') AS value FROM translations ORDER BY 1"), 'value', 'cell');
}

/** Everything a request to an admin route could change: the strings and the languages. */
function everything(): array
{
    return [every_string(), dbAll('SELECT * FROM languages ORDER BY code')];
}

/** The keys a migration would have written, with their first strings. */
function seed_strings(): void
{
    dbExec("INSERT INTO translation_keys (name, description) VALUES
        ('test.hello', 'A greeting; {name} is who is greeted'), ('test.bye', NULL), ('test.count', 'How far; {count} of {total}'), ('test.new', 'A key with no string yet')");
    dbExec("INSERT INTO translations (key_name, language_code, value) VALUES
        ('test.hello', 'en', 'Hello, {name}!'), ('test.hello', 'sk', 'Dobrý deň, {name}!'), ('test.bye', 'en', 'Goodbye'), ('test.count', 'en', '{count} of {total}')");
}

/**
 * The staff's routes (EDITOR or ADMIN), each with a body that would change
 * something if it were let through.
 *
 * @return array<array{0: string, 1: string, 2: mixed}>
 */
function staff_routes(): array
{
    return [
        ['GET', '/api/admin/languages', null],
        ['GET', '/api/admin/translations', null],
        ['PUT', '/api/admin/translations', ['values' => ['test.bye' => ['en' => 'Changed']]]],
        ['GET', '/api/admin/translations/sk/export', null],
        ['PUT', '/api/admin/translations/sk/import', ['test.bye' => 'Changed']],
    ];
}

/** The languages' own routes: ADMIN alone. */
function language_routes(): array
{
    return [
        ['POST', '/api/admin/languages', ['code' => 'xx', 'name' => 'Nobody\'s', 'native_name' => 'Nobody\'s']],
        ['PUT', '/api/admin/languages/sk', ['enabled' => false, 'name' => 'Changed']],
        ['DELETE', '/api/admin/languages/sk', null],
    ];
}

/** Every route of the words in the admin panel. */
function admin_routes(): array
{
    return array_merge(staff_routes(), language_routes());
}

/** A JSON body of exactly $bytes bytes: $before, a run of x, $after. */
function body_of(int $bytes, string $before, string $after): string
{
    return $before . str_repeat('x', $bytes - strlen($before) - strlen($after)) . $after;
}

/** tools/translations.php on this file's database: [exit code, what it printed]. */
function cli(string ...$arguments): array
{
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(TEST_BACKEND . '/tools/translations.php') . ' ' . implode(' ', array_map('escapeshellarg', $arguments)) . ' 2>&1', $lines, $code);

    return [$code, implode("\n", $lines)];
}

/** What a server logged that it should not have: why a token was refused is meant to be there. */
function problems_of(array $app): array
{
    return array_values(array_filter(server_problems($app), static fn(string $line): bool => !str_contains($line, '[anotoki auth] token refused')));
}

/** Somebody else at the same moment: a second connection to this file's database, for a transaction left open. */
function somebody_else(): PDO
{
    return dbConnect(databaseSettings());
}

/**
 * A request to the hosted site that is sent and not waited for - for what has
 * to wait for somebody else. (The server answers one request at a time, and
 * this one keeps it busy until it is answered: ask for 'answer' before the
 * next call.)
 *
 *   'waits'   is it held up by a lock somebody else has? True as soon as the
 *             database shows a connection waiting for one while the request
 *             is unanswered; false when the answer comes first - it did not
 *             wait - or nothing of either is seen in ten seconds
 *   'answer'  waits for the answer: ['status' => int, 'body' => mixed]
 *
 * @return array{waits: callable(): bool, answer: callable(): array}
 */
function begin_as(int $user, string $method, string $url, mixed $body = null): array
{
    $curl = curl_init($GLOBALS['hosted']['base'] . $url);
    $headers = array_merge(bearer(token_of($user)), ['Expect:'], $body === null ? [] : ['Content-Type: application/json']);
    curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 30]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, jsonText($body));
    }
    $multi = curl_multi_init();
    curl_multi_add_handle($multi, $curl);

    // Lets the request go on for a moment; true once it is answered.
    $answered = static function () use ($multi): bool {
        curl_multi_exec($multi, $running);
        if ($running > 0 && curl_multi_select($multi, 0.05) === -1) {
            usleep(20000); // nothing to wait on yet
        }

        return $running === 0;
    };
    $answer = null;

    return [
        'waits' => static function () use ($answered): bool {
            for ($until = microtime(true) + 10; microtime(true) < $until; ) {
                if ($answered()) {
                    return false;
                }
                if ((int) dbValue("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'") > 0) {
                    return true;
                }
            }

            return false;
        },
        'answer' => static function () use ($answered, $multi, $curl, &$answer): array {
            if ($answer === null) {
                for ($until = microtime(true) + 35; !$answered() && microtime(true) < $until; ) {
                    // until it is answered (or its own 30 seconds are over)
                }
                $answer = ['status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), 'body' => json_decode((string) curl_multi_getcontent($curl), true)];
                curl_multi_remove_handle($multi, $curl);
            }

            return $answer;
        },
    ];
}

test('before there is any string: the words are not there yet - said as such, never as an error - and empty maps that are still objects', function (): void {
    // No English string at all: nothing the pages could read, so the pages keep the English compiled into them.
    foreach (['en', 'sk'] as $code) {
        $none = anonymous('GET', "/api/translations/$code");
        assert_same([503, ['error' => NO_WORDS_YET, 'code' => 'translations_unavailable'], '60'], [$none['status'], $none['body'], $none['headers']['retry-after'] ?? null], $code);
    }

    $export = as_user(ADMIN_A, 'GET', '/api/admin/translations/sk/export');
    assert_same([200, "{}\n"], [$export['status'], $export['raw']], 'the export of a language with no strings: a file of nothing');
    assert_same('attachment; filename="translations-sk.json"', $export['headers']['content-disposition'] ?? null, 'a file to keep, by its language\'s name');
    assert_same([], as_user(ADMIN_A, 'GET', '/api/admin/translations')['body']['keys']);
    assert_same([], problems_of($GLOBALS['hosted']), 'nothing logged for it');
});

test('the bundle: a language\'s strings with English underneath, the same for everybody - token or none, good or bad', function (): void {
    seed_strings();
    $english = ['test.hello' => 'Hello, {name}!', 'test.bye' => 'Goodbye', 'test.count' => '{count} of {total}'];

    $slovak = anonymous('GET', '/api/translations/sk');
    assert_same(['language', 'languages', 'values', 'english'], array_keys($slovak['body']));
    assert_same('sk', $slovak['body']['language']);
    assert_same([ENGLISH, SLOVAK], $slovak['body']['languages'], 'the IAM\'s wire format: native_name');
    assert_json_same(['test.hello' => 'Dobrý deň, {name}!'] + $english, $slovak['body']['values'], 'a key with no Slovak string comes in English');
    assert_json_same($english, $slovak['body']['english'], 'English itself');
    assert_false(array_key_exists('test.new', $slovak['body']['values']), 'a key with no string at all is not there: the page shows the key');
    assert_same('application/json; charset=utf-8', $slovak['headers']['content-type'] ?? null);

    $own = anonymous('GET', '/api/translations/en');
    assert_same(['language', 'languages', 'values'], array_keys($own['body']), 'no second copy of English');
    assert_json_same($english, $own['body']['values']);

    // A language the site does not have: answered in English, and told so.
    $unknown = anonymous('GET', '/api/translations/de');
    assert_same([200, 'en'], [$unknown['status'], $unknown['body']['language']]);
    assert_same($own['raw'], $unknown['raw']);
    assert_same($own['raw'], anonymous('GET', '/api/translations/pt-br')['raw']);

    // A code with a region that is not offered itself is answered by its language, when that one is: a
    // Slovak browser's first wish is "sk-sk", and it gets Slovak at once - not English and a second request.
    $regional = anonymous('GET', '/api/translations/sk-sk');
    assert_same([200, 'sk'], [$regional['status'], $regional['body']['language']], '"language" says which one it is');
    assert_same($slovak['raw'], $regional['raw'], 'the Slovak bundle itself');
    assert_same($slovak['headers']['etag'], $regional['headers']['etag'], 'under the same tag');
    assert_same($own['raw'], anonymous('GET', '/api/translations/en-gb')['raw'], 'and English by English');
    assert_same(
        [200, 'en'],
        [anonymous('GET', '/api/translations/de-at')['status'], anonymous('GET', '/api/translations/de-at')['body']['language']],
        'a language the site does not have, with a region or without: English, as before',
    );
    assert_same(404, anonymous('GET', '/api/translations/sk-SK')['status'], 'a code is small letters: what is not one is still no language');

    // Nobody is asked who they are: a token is not looked at - not a good one, not a bad one, not one that ran out.
    $withToken = call($GLOBALS['hosted']['base'], 'GET', '/api/translations/sk', null, bearer(test_token(555)));
    assert_same([200, $slovak['raw']], [$withToken['status'], $withToken['raw']]);
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id = 555'), 'nobody was recorded as having been here');
    $badToken = call($GLOBALS['hosted']['base'], 'GET', '/api/translations/sk', null, bearer('not.a.token'));
    assert_same([200, $slovak['raw']], [$badToken['status'], $badToken['raw']], 'the words read in their language whatever token the browser still holds');
    $oldToken = call($GLOBALS['hosted']['base'], 'GET', '/api/translations/sk', null, bearer(test_token(ADMIN_A, [ROLE_ADMIN], ['exp' => time() - 3600])));
    assert_same([200, $slovak['raw']], [$oldToken['status'], $oldToken['raw']], 'a sign-in that ran out still reads in its language');

    // Public: asked by any name, through any proxy - nothing of anybody's is in them.
    $port = parse_url($GLOBALS['hosted']['base'], PHP_URL_PORT);
    foreach (['by another name' => ["Host: rebound.example:$port"], 'through a proxy' => ['X-Forwarded-For: 203.0.113.9']] as $what => $headers) {
        $elsewhere = anonymous('GET', '/api/translations/sk', null, $headers);
        assert_same([200, $slovak['raw']], [$elsewhere['status'], $elsewhere['raw']], $what);
    }
});

test('the IAM\'s wire format, both ways: snake_case in every answer, and a body in camelCase is no language', function (): void {
    // What the bundle names of a language: what a chooser shows, nothing more.
    assert_same(['code', 'name', 'native_name'], array_keys(anonymous('GET', '/api/translations/en')['body']['languages'][0]));
    // What the admin pages read of one: the fields of the IAM's AdminLanguage, the count of its own strings with them.
    $languages = as_user(ADMIN_A, 'GET', '/api/admin/languages')['body']['languages'];
    assert_same(['code', 'name', 'native_name', 'enabled', 'sort_order', 'seeded', 'strings'], array_keys($languages[0]));
    assert_same([['en', 3], ['sk', 1]], array_map(static fn(array $language): array => [$language['code'], $language['strings']], $languages), 'its own strings, counted');
    assert_same(array_keys($languages[0]), array_keys(as_user(ADMIN_A, 'GET', '/api/admin/translations')['body']['languages'][0]), 'the grid\'s languages alike');

    // The camelCase this app spoke before: a language without its native_name is none, an order called sortOrder changes nothing.
    $before = everything();
    $camel = as_user(ADMIN_A, 'POST', '/api/admin/languages', ['code' => 'cs', 'name' => 'Czech', 'nativeName' => 'Čeština']);
    assert_same([422, 'invalid_language'], [$camel['status'], $camel['body']['code'] ?? null], 'nativeName is not native_name');
    $unchanged = as_user(ADMIN_A, 'PUT', '/api/admin/languages/sk', ['nativeName' => 'Slovensky', 'sortOrder' => 9]);
    assert_same([200, 'Slovenčina', 2], [$unchanged['status'], $unchanged['body']['language']['native_name'], $unchanged['body']['language']['sort_order']], 'what it does not know of is passed over');
    assert_same($before, everything());
});

test('a code that is not one is 404, and the database never hears of it', function (): void {
    foreach (['EN', 'Sk', 'e', 'eng', 'en-', 'en-GB', 'en_gb', 'en-gbr', 'sk%0A', '%20sk', 'sk%27', '%FF', '%C3%28', 'en.json'] as $code) {
        $answer = anonymous('GET', "/api/translations/$code");
        assert_same([404, 'not_found'], [$answer['status'], $answer['body']['code'] ?? null], $code);
    }
    assert_same(404, anonymous('GET', '/api/translations/en/more')['status'], 'the bundle is the only thing under /api/translations/');
    assert_same(404, anonymous('GET', '/api/translations')['status'], 'there is no list of its own: the bundle carries it');
    assert_same(404, anonymous('GET', '/api/languages')['status']);
    assert_same(405, anonymous('PUT', '/api/translations/sk', ['values' => ['test.bye' => 'x']])['status'], 'nothing is written here');
    assert_same(405, as_user(ADMIN_A, 'PUT', '/api/translations/sk', ['values' => ['test.bye' => 'x']])['status'], 'not by an administrator either');

    // The admin routes: a code that is not one is no language - before the body is read.
    foreach (['%FF', 'SK', 'eng'] as $code) {
        assert_same(404, as_user(ADMIN_A, 'PUT', "/api/admin/languages/$code", ['name' => 'X'])['status'], $code);
        assert_same(404, as_user(ADMIN_A, 'DELETE', "/api/admin/languages/$code")['status'], $code);
        assert_same(404, as_user(ADMIN_A, 'GET', "/api/admin/translations/$code/export")['status'], $code);
        assert_same(404, as_user(ADMIN_A, 'PUT', "/api/admin/translations/$code/import", ['test.bye' => 'x'])['status'], $code);
        assert_same(404, as_user(ADMIN_A, 'PUT', "/api/admin/translations/$code/import", 'not even JSON', ['Content-Type: text/plain'])['status'], "$code, whatever the body");
    }
    assert_same(
        ['error' => 'There is no such language.', 'code' => 'not_found'],
        as_user(ADMIN_A, 'GET', '/api/admin/translations/xx/export')['body'],
        'nor a code the site has no language for - in this app\'s error shape',
    );
    assert_same([], problems_of($GLOBALS['hosted']), 'bytes that are not text reached no query (that would be a [db] error and a 503)');
});

test('asked again: 304 for the tag the browser holds - compared weakly - with the headers a cache needs', function (): void {
    $first = anonymous('GET', '/api/translations/sk');
    $etag = $first['headers']['etag'] ?? '';
    assert_same('"' . md5($first['raw']) . '"', $etag);
    assert_same('no-cache', $first['headers']['cache-control'] ?? null, 'kept, and asked about every time - never the no-store of the other routes');

    // As the tag comes back from behind a server that compressed the answer: weakened (a proxy), or marked
    // inside the quotes (Apache's mod_deflate, mod_brotli) - without the second the 304 would never be answered there.
    $marked = static fn(string $suffix): string => substr($etag, 0, -1) . $suffix . '"';
    foreach ([$etag, "W/$etag", "\"other\", W/$etag", "\"a\" , $etag , \"b\"", '*', $marked('-gzip'), 'W/' . $marked('-gzip'), $marked('-br'), '"other-gzip", ' . $marked('-zstd')] as $held) {
        $again = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $held"]);
        assert_same([304, ''], [$again['status'], $again['raw']], $held);
        assert_same([$etag, 'no-cache'], [$again['headers']['etag'] ?? null, $again['headers']['cache-control'] ?? null], "the 304's own headers ($held): never no-store");
    }
    foreach (['"other"', 'W/"other"', trim($etag, '"'), '"' . md5('x') . '"', '"' . md5('x') . '-gzip"', $marked('-gzipped'), $marked('-gzip-gzip')] as $held) {
        $again = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $held"]);
        assert_same([200, $first['raw']], [$again['status'], $again['raw']], $held);
    }
    assert_true($etag !== anonymous('GET', '/api/translations/en')['headers']['etag'], 'another language, another tag');
    assert_same($etag, as_user(LEARNER, 'GET', '/api/translations/sk')['headers']['etag'] ?? null, 'the same strings, the same tag - whoever asks');

    // A string changes: the tag the browser holds is no longer the answer's.
    dbExec("UPDATE translations SET value = 'Bye' WHERE key_name = 'test.bye' AND language_code = 'en'");
    $changed = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $etag"]);
    assert_same([200, 'Bye'], [$changed['status'], $changed['body']['values']['test.bye']]);
    assert_true($changed['headers']['etag'] !== $etag);
    dbExec("UPDATE translations SET value = 'Goodbye' WHERE key_name = 'test.bye' AND language_code = 'en'");
    assert_same($etag, anonymous('GET', '/api/translations/sk')['headers']['etag'], 'the same strings, the same tag');
});

test('the words\' admin routes are for the staff the IAM makes - not a learner, not a token with no roles, not nobody', function (): void {
    $before = everything();
    foreach (admin_routes() as [$method, $url, $body]) {
        $sentence = in_array([$method, $url, $body], language_routes(), true)
            ? 'Only an administrator of Piano Academy may do this.'
            : 'This is for the people who keep Piano Academy\'s words. Ask the site\'s administrator for the editor role.';
        $signedOut = anonymous($method, $url, $body);
        assert_same([401, 'sign_in_required'], [$signedOut['status'], $signedOut['body']['code'] ?? null], "$method $url, signed out");
        assert_match('/^Bearer realm="piano-academy"/', $signedOut['headers']['www-authenticate'] ?? '', "$method $url says how to authenticate");

        $member = as_user(LEARNER, $method, $url, $body);
        assert_same([403, 'forbidden'], [$member['status'], $member['body']['code'] ?? null], "$method $url, a learner");
        assert_same($sentence, $member['body']['error'] ?? null, "$method $url");
        $roleless = as_user(ROLELESS, $method, $url, $body);
        assert_same([403, 'forbidden'], [$roleless['status'], $roleless['body']['code'] ?? null], "$method $url, a token with no roles claim");

        $ranOut = call($GLOBALS['hosted']['base'], $method, $url, $body, bearer(test_token(ADMIN_A, [ROLE_ADMIN], ['exp' => time() - 120])));
        assert_same([401, 'invalid_token'], [$ranOut['status'], $ranOut['body']['code'] ?? null], "$method $url, an administrator's token that ran out: 401, never 403");

        // Who may is decided before anything of the body is looked at: one that is no JSON is still 401 / 403.
        if ($body !== null) {
            assert_same(401, anonymous($method, $url, 'text', ['Content-Type: text/plain'])['status'], "$method $url, signed out, a body that is no JSON");
            assert_same(403, as_user(LEARNER, $method, $url, 'text', ['Content-Type: text/plain'])['status'], "$method $url, a learner, a body that is no JSON");
        }
    }
    assert_same($before, everything(), 'and nothing of it was done');

    // The old LEARNER role, roles that are none of these, and a `roles` claim that is no list of them.
    foreach (
        [
            'MEMBER alone - a learner' => ['MEMBER'],
            'another role' => ['OWNER'],
            'no role' => [],
            'a text' => 'ADMIN',
            'null' => null,
            'a list inside a list' => [['ADMIN']],
            'a map' => ['ADMIN' => true],
        ]
        as $what => $roles
    ) {
        $answer = call($GLOBALS['hosted']['base'], 'GET', '/api/admin/languages', null, bearer(test_token(LEARNER, [], ['roles' => $roles])));
        assert_same([403, 'forbidden'], [$answer['status'], $answer['body']['code'] ?? null], "roles: $what");
    }
    // A role in the address, a header or the body of the request is nobody's role.
    assert_same(403, as_user(LEARNER, 'GET', '/api/admin/languages?role=ADMIN&owner=true', null, ['X-Roles: ADMIN', 'X-Owner: true'])['status']);
    assert_same(403, as_user(LEARNER, 'PUT', '/api/admin/translations', ['owner' => true, 'roles' => ['ADMIN'], 'userId' => ADMIN_A, 'values' => ['test.bye' => ['en' => 'Changed']]])['status']);
    assert_same($before, everything());

    // An administrator is let in - and so is a second one, and one who has the role among others.
    foreach ([ADMIN_A, ADMIN_B] as $admin) {
        assert_same(200, as_user($admin, 'GET', '/api/admin/languages')['status']);
        assert_same(200, as_user($admin, 'GET', '/api/admin/translations')['status']);
        assert_same(200, as_user($admin, 'GET', '/api/admin/translations/sk/export')['status']);
    }
    assert_same(200, call($GLOBALS['hosted']['base'], 'GET', '/api/admin/languages', null, bearer(test_token(LEARNER, ['MEMBER', 'ADMIN'])))['status']);
    assert_same(200, call($GLOBALS['hosted']['base'], 'GET', '/api/admin/languages', null, bearer(test_token(LEARNER, ['admin'])))['status'], 'a role is its name, in any case');
    // An administrator is a learner like anybody else on the rest of the API, and a learner is one there.
    assert_same(200, as_user(ADMIN_A, 'GET', '/api/state')['status']);
    assert_same(200, as_user(LEARNER, 'GET', '/api/state')['status']);

    // A cross-site write would need a preflight first, and there is none to be had.
    foreach (['/api/admin/translations', '/api/admin/languages', '/api/admin/languages/sk'] as $url) {
        $preflight = anonymous('OPTIONS', $url, null, ['Origin: https://evil.example', 'Access-Control-Request-Method: PUT', 'Access-Control-Request-Headers: content-type']);
        assert_same(405, $preflight['status'], $url);
        assert_same([], array_values(array_filter(array_keys($preflight['headers']), static fn(string $name): bool => str_starts_with($name, 'access-control-'))), "$url: no CORS for anybody");
    }

    assert_same(201, as_user(ADMIN_A, 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])['status'], 'an administrator adds a language');
    assert_same(1, (int) dbValue("SELECT count(*) FROM languages WHERE code = 'de'"));
});

test('an editor rewords the strings and takes a language out and back in - and does nothing to the languages themselves', function (): void {
    $before = everything();

    // The words: read, saved, out as a file and back in - by the editor.
    $languages = as_user(EDITOR_A, 'GET', '/api/admin/languages');
    assert_same([200, ['en', 'sk', 'de']], [$languages['status'], array_column($languages['body']['languages'], 'code')], 'the grid\'s languages, hidden ones too');
    assert_same(200, as_user(EDITOR_A, 'GET', '/api/admin/translations')['status']);
    assert_same(200, as_user(EDITOR_A, 'GET', '/api/admin/translations/sk/export')['status']);
    $saved = save(EDITOR_A, ['test.count' => ['sk' => '{count} / {total}']]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(['{count} / {total}', EDITOR_A], array_slice(stored('test.count', 'sk'), 0, 2), 'updated_by is the editor');
    $imported = as_user(EDITOR_A, 'PUT', '/api/admin/translations/sk/import', ['test.count' => '{count} z {total}']);
    assert_same(200, $imported['status'], test_show($imported['body']));
    assert_same('{count} z {total}', anonymous('GET', '/api/translations/sk')['body']['values']['test.count'], 'and everybody reads it');

    // The languages: an administrator's - refused before anything is looked at, in the administrator's words.
    $words = everything();
    foreach (language_routes() as [$method, $url, $body]) {
        $refused = as_user(EDITOR_A, $method, $url, $body);
        assert_same(
            [403, 'forbidden', 'Only an administrator of Piano Academy may do this.'],
            [$refused['status'], $refused['body']['code'] ?? null, $refused['body']['error'] ?? null],
            "$method $url",
        );
    }
    assert_same($words, everything(), 'and nothing of it was done');

    // The string goes again, so the tests below find what the tests above left.
    assert_same(200, save(EDITOR_A, ['test.count' => ['sk' => '']])['status']);
    assert_same($before, everything());
});

test('languages: added after the others, offered at once or hidden as the body says; renamed, reordered, switched off - English never', function (): void {
    $list = as_user(ADMIN_A, 'GET', '/api/admin/languages');
    assert_same(
        [
            ENGLISH + ['enabled' => true, 'sort_order' => 1, 'seeded' => true, 'strings' => 3],
            SLOVAK + ['enabled' => true, 'sort_order' => 2, 'seeded' => true, 'strings' => 1],
            ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch', 'enabled' => true, 'sort_order' => 3, 'seeded' => false, 'strings' => 0],
        ],
        $list['body']['languages'],
    );

    // What a new language is: last, and offered unless the body says otherwise - whatever else the body says.
    $made = as_user(ADMIN_A, 'POST', '/api/admin/languages', [
        'code' => 'pt-br',
        'name' => "  Portuguese\x07 (Brazil) ",
        'native_name' => str_repeat('ç', 50),
        'sort_order' => 0,
        'seeded' => true,
        'strings' => 9,
    ]);
    assert_same(201, $made['status'], test_show($made['body']));
    assert_same(
        ['language' => ['code' => 'pt-br', 'name' => 'Portuguese (Brazil)', 'native_name' => str_repeat('ç', 50), 'enabled' => true, 'sort_order' => 4, 'seeded' => false, 'strings' => 0]],
        $made['body'],
    );
    assert_same('pt-br', anonymous('GET', '/api/translations/pt-br')['body']['language'], 'offered, a code with a region answers itself');

    // Hidden from the start when the body says so (the Languages page does): there for its strings
    // to be written, offered to nobody until an administrator switches it on.
    $hidden = as_user(ADMIN_A, 'POST', '/api/admin/languages', ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => false]);
    assert_same(201, $hidden['status'], test_show($hidden['body']));
    assert_same(['language' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => false, 'sort_order' => 5, 'seeded' => false, 'strings' => 0]], $hidden['body']);
    $french = anonymous('GET', '/api/translations/fr');
    assert_same(['en', ['en', 'sk', 'de', 'pt-br']], [$french['body']['language'], array_column($french['body']['languages'], 'code')], 'nobody is offered it');
    assert_true(in_array('fr', array_column(as_user(ADMIN_A, 'GET', '/api/admin/languages')['body']['languages'], 'code'), true), 'the admin page has it');
    assert_same(true, as_user(ADMIN_A, 'PUT', '/api/admin/languages/fr', ['enabled' => true])['body']['language']['enabled']);
    assert_same('fr', anonymous('GET', '/api/translations/fr-ca')['body']['language'], 'switched on, it is offered - and answers for its regions');
    $shown = as_user(ADMIN_A, 'POST', '/api/admin/languages', ['code' => 'it', 'name' => 'Italian', 'native_name' => 'Italiano', 'enabled' => true]);
    assert_same([201, true], [$shown['status'], $shown['body']['language']['enabled'] ?? null], 'and true is what it is without saying');
    dbExec("DELETE FROM languages WHERE code IN ('fr', 'it')");

    $twice = as_user(ADMIN_B, 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'Deutsch', 'native_name' => 'Deutsch']);
    assert_same([409, 'language_exists'], [$twice['status'], $twice['body']['code']]);
    $invalid = [
        'enabled as text' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => 'false'],
        'enabled as a number' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => 0],
        'enabled as nothing' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => null],
        'a name nobody can see' => ['code' => 'fr', 'name' => "\u{200B}\u{2060}", 'native_name' => 'Français'],
        'a native name that is a soft hyphen' => ['code' => 'fr', 'name' => 'French', 'native_name' => " \u{00AD} "],
        'a list' => ['de'],
        'the empty list' => [],
        'a list of one language' => [['code' => 'fr', 'name' => 'French', 'native_name' => 'Français']],
        'no code' => ['name' => 'French', 'native_name' => 'Français'],
        'a code in capitals' => ['code' => 'FR', 'name' => 'French', 'native_name' => 'Français'],
        'three letters' => ['code' => 'fra', 'name' => 'French', 'native_name' => 'Français'],
        'a code that is a number' => ['code' => 12, 'name' => 'French', 'native_name' => 'Français'],
        'a code that is an object' => ['code' => ['fr' => true], 'name' => 'French', 'native_name' => 'Français'],
        'no name' => ['code' => 'fr', 'native_name' => 'Français'],
        'an empty name' => ['code' => 'fr', 'name' => " \x07 ", 'native_name' => 'Français'],
        'a name of 51 characters' => ['code' => 'fr', 'name' => str_repeat('é', 51), 'native_name' => 'Français'],
        'a name on two lines' => ['code' => 'fr', 'name' => "French\nFrench", 'native_name' => 'Français'],
        'a name that is a list' => ['code' => 'fr', 'name' => ['French'], 'native_name' => 'Français'],
        'a name that is an object' => ['code' => 'fr', 'name' => ['en' => 'French'], 'native_name' => 'Français'],
        'no native name' => ['code' => 'fr', 'name' => 'French'],
        'a native name that is a number' => ['code' => 'fr', 'name' => 'French', 'native_name' => 5],
    ];
    foreach ($invalid as $what => $body) {
        $refused = as_user(ADMIN_A, 'POST', '/api/admin/languages', $body);
        assert_same([422, 'invalid_language'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    // The body is JSON or it is nothing: a page on another site can make a browser send text, never this.
    $plain = as_user(ADMIN_A, 'POST', '/api/admin/languages', '{"code": "fr", "name": "French", "native_name": "Français"}', ['Content-Type: text/plain']);
    assert_same([415, 'unsupported_media_type'], [$plain['status'], $plain['body']['code'] ?? null], 'a text/plain body, JSON inside or not');
    assert_same(415, as_user(ADMIN_A, 'POST', '/api/admin/languages', 'code=fr&name=French&native_name=French', ['Content-Type: application/x-www-form-urlencoded'])['status'], 'a form');
    assert_same([415, 'unsupported_media_type'], [($none = as_user(ADMIN_A, 'POST', '/api/admin/languages'))['status'], $none['body']['code'] ?? null], 'no body, and nothing that says what it is');
    $nothing = as_user(ADMIN_A, 'POST', '/api/admin/languages', '', ['Content-Type: application/json']);
    assert_same([422, 'empty_body'], [$nothing['status'], $nothing['body']['code'] ?? null], 'an empty body that says it is JSON: nothing arrived');
    assert_same(400, as_user(ADMIN_A, 'POST', '/api/admin/languages', '{"code": ', ['Content-Type: application/json'])['status']);
    assert_same(4, (int) dbValue('SELECT count(*) FROM languages'), 'nothing was added');

    // Offered at once: it has no strings, so it reads in English - but it is that language.
    $german = anonymous('GET', '/api/translations/de');
    assert_same('de', $german['body']['language']);
    assert_same(['en', 'sk', 'de', 'pt-br'], array_column($german['body']['languages'], 'code'));
    assert_same(['code', 'name', 'native_name'], array_keys($german['body']['languages'][2]), 'only what a chooser shows');
    assert_json_same($german['body']['english'], $german['body']['values']);

    // Changed: only what is sent.
    $renamed = as_user(ADMIN_A, 'PUT', '/api/admin/languages/de', ['name' => ' German (Germany) ', 'sort_order' => 0, 'code' => 'xx', 'seeded' => true]);
    assert_same(['language' => ['code' => 'de', 'name' => 'German (Germany)', 'native_name' => 'Deutsch', 'enabled' => true, 'sort_order' => 0, 'seeded' => false, 'strings' => 0]], $renamed['body']);
    assert_same(['de', 'en', 'sk', 'pt-br'], array_column(anonymous('GET', '/api/translations/en')['body']['languages'], 'code'), 'in its new place');
    assert_same('German (Germany)', as_user(ADMIN_A, 'PUT', '/api/admin/languages/de', new stdClass())['body']['language']['name'], 'nothing sent, nothing changed');
    assert_same('Deutsch (DE)', as_user(ADMIN_A, 'PUT', '/api/admin/languages/de', ['native_name' => 'Deutsch (DE)'])['body']['language']['native_name']);
    $changes = [
        'enabled as text' => ['enabled' => 'false'],
        'enabled as a number' => ['enabled' => 0],
        'half an order' => ['sort_order' => 1.5],
        'an order as text' => ['sort_order' => '3'],
        'an order below 0' => ['sort_order' => -1],
        'an order above 1000' => ['sort_order' => 1001],
        'an empty name' => ['name' => ''],
        'a long native name' => ['native_name' => str_repeat('x', 51)],
        'a name that is an object' => ['name' => ['en' => 'German']],
        'a list' => ['name'],
        'the empty list' => [],
    ];
    foreach ($changes as $what => $body) {
        $refused = as_user(ADMIN_A, 'PUT', '/api/admin/languages/de', $body);
        assert_same([422, 'invalid_language'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same(415, as_user(ADMIN_A, 'PUT', '/api/admin/languages/de')['status'], 'no body');
    assert_same(1000, as_user(ADMIN_A, 'PUT', '/api/admin/languages/de', ['sort_order' => 1000])['body']['language']['sort_order']);
    assert_same(404, as_user(ADMIN_A, 'PUT', '/api/admin/languages/fr', ['name' => 'French'])['status'], 'a language there is not');

    // Switched off: no longer offered, and asked for by name it reads in English. Never refused - but for English.
    $hidden = as_user(ADMIN_A, 'PUT', '/api/admin/languages/sk', ['enabled' => false]);
    assert_same([200, false], [$hidden['status'], $hidden['body']['language']['enabled']], 'Slovak too: it keeps its strings');
    $slovak = anonymous('GET', '/api/translations/sk');
    assert_same('en', $slovak['body']['language']);
    assert_same(['en', 'pt-br', 'de'], array_column($slovak['body']['languages'], 'code'));
    assert_false(array_key_exists('english', $slovak['body']));
    assert_same('en', anonymous('GET', '/api/translations/sk-sk')['body']['language'], 'nor does it answer for its regions');
    assert_same(['en', 'sk', 'pt-br', 'de'], array_column(as_user(ADMIN_A, 'GET', '/api/admin/languages')['body']['languages'], 'code'), 'an administrator sees the hidden ones');
    assert_same(true, as_user(ADMIN_A, 'PUT', '/api/admin/languages/sk', ['enabled' => true])['body']['language']['enabled']);

    $english = as_user(ADMIN_A, 'PUT', '/api/admin/languages/en', ['enabled' => false, 'name' => 'Changed']);
    assert_same([409, 'fallback_language'], [$english['status'], $english['body']['code']]);
    assert_same(
        ENGLISH + ['enabled' => true, 'sort_order' => 5, 'seeded' => true, 'strings' => 3],
        as_user(ADMIN_A, 'PUT', '/api/admin/languages/en', ['enabled' => true, 'sort_order' => 5])['body']['language'],
        'on is what it is; its place is anybody\'s to choose',
    );
    as_user(ADMIN_A, 'PUT', '/api/admin/languages/en', ['sort_order' => 1]);

    // At most 20.
    for ($i = 0; $i < 16; $i++) {
        dbExec('INSERT INTO languages (code, name, native_name, sort_order) VALUES (?, ?, ?, 500)', ['x' . chr(97 + $i), "Filler $i", "Filler $i"]);
    }
    $full = as_user(ADMIN_A, 'POST', '/api/admin/languages', ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français']);
    assert_same([422, 'too_many_languages'], [$full['status'], $full['body']['code']]);
    assert_same(
        'language_exists',
        as_user(ADMIN_A, 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])['body']['code'],
        'one that is there is said to be there, full or not',
    );
    dbExec("DELETE FROM languages WHERE name LIKE 'Filler %'");
    $french = as_user(ADMIN_A, 'POST', '/api/admin/languages', ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français']);
    assert_same([201, 1000], [$french['status'], $french['body']['language']['sort_order']], 'last - and never past what an order may be');
    dbExec("DELETE FROM languages WHERE code = 'fr'");
});

test('two people adding the last language the site keeps, at the same moment: one waits for the other, and the most holds', function (): void {
    $most = translationsConfig()->languagesMax;
    $fillers = $most - 1 - (int) dbValue('SELECT count(*) FROM languages');
    for ($i = 0; $i < $fillers; $i++) {
        dbExec('INSERT INTO languages (code, name, native_name, sort_order) VALUES (?, ?, ?, 500)', ['q' . chr(97 + $i), "Filler $i", "Filler $i"]);
    }
    assert_same($most - 1, (int) dbValue('SELECT count(*) FROM languages'), 'room for one more');

    // Somebody adds the twentieth and is not finished. Counting alone, a second request would not see that
    // row, would find room and add a twenty-first.
    $other = somebody_else();
    $other->beginTransaction();
    $other->exec("INSERT INTO languages (code, name, native_name, sort_order) VALUES ('qz', 'Filler of somebody else', 'Filler', 500)");
    $second = begin_as(ADMIN_B, 'POST', '/api/admin/languages', ['code' => 'qy', 'name' => 'One too many', 'native_name' => 'One too many']);
    try {
        if (!$second['waits']()) {
            fail('it did not wait for whoever is adding one, and answered ' . test_show($second['answer']()));
        }
        $other->commit();
        $answer = $second['answer']();
        assert_same([422, 'too_many_languages'], [$answer['status'], $answer['body']['code'] ?? null], test_show($answer['body']));
        assert_same([$most, 0], [(int) dbValue('SELECT count(*) FROM languages'), (int) dbValue("SELECT count(*) FROM languages WHERE code = 'qy'")]);

        // Reading goes on while somebody adds one: only what writes the table waits.
        $other->beginTransaction();
        $other->exec('LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE');
        assert_same(200, anonymous('GET', '/api/translations/sk')['status'], 'the page\'s strings');
        assert_same(200, save(ADMIN_A, ['test.hello' => ['sk' => 'Dobrý deň, {name}!']])['status'], 'and a save of strings, which holds the languages\' rows');
        $other->rollBack();
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $second['answer']();
        dbExec("DELETE FROM languages WHERE name LIKE 'Filler %' OR code = 'qy'");
    }
    assert_same(['en', 'sk', 'pt-br', 'de'], array_column(as_user(ADMIN_A, 'GET', '/api/admin/languages')['body']['languages'], 'code'), 'and the languages are what they were');
});

test('saving strings: the changed ones, by whoever saved them; a string sent as it is stays as it was; the last save is kept', function (): void {
    $grid = as_user(ADMIN_B, 'GET', '/api/admin/translations');
    assert_same(['languages', 'keys'], array_keys($grid['body']));
    assert_same(as_user(ADMIN_B, 'GET', '/api/admin/languages')['body']['languages'], $grid['body']['languages'], 'every language, hidden or not');
    assert_same(
        [
            ['name' => 'test.bye', 'description' => '', 'values' => ['en' => 'Goodbye']],
            ['name' => 'test.count', 'description' => 'How far; {count} of {total}', 'values' => ['en' => '{count} of {total}']],
            ['name' => 'test.hello', 'description' => 'A greeting; {name} is who is greeted', 'values' => ['en' => 'Hello, {name}!', 'sk' => 'Dobrý deň, {name}!']],
            ['name' => 'test.new', 'description' => 'A key with no string yet', 'values' => []],
        ],
        $grid['body']['keys'],
        'by name',
    );
    assert_true(str_contains($grid['raw'], '{"name":"test.new","description":"A key with no string yet","values":{}}'), 'no strings is {} and not []');
    assert_same('no-store', $grid['headers']['cache-control'] ?? null);

    $untouched = stored('test.bye', 'en');
    $saved = save(ADMIN_B, ['test.hello' => ['sk' => "  Ahoj,\x07 {name}! "]]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(['en' => 'Hello, {name}!', 'sk' => 'Ahoj, {name}!'], $saved['body']['keys'][2]['values'], 'answered with the grid as it is now; the text cleaned');
    assert_same(['Ahoj, {name}!', ADMIN_B], array_slice(stored('test.hello', 'sk'), 0, 2), 'who saved it is the token\'s person: updated_by is its sub');
    assert_same($untouched, stored('test.bye', 'en'), 'what was not sent was not touched');
    assert_same(['Hello, {name}!', null], array_slice(stored('test.hello', 'en'), 0, 2), 'nor its English, written by a migration: nobody');

    // Who saved it is never what a body says.
    assert_same(
        200,
        as_user(ADMIN_B, 'PUT', '/api/admin/translations', ['userId' => ADMIN_A, 'updatedBy' => ADMIN_A, 'updated_by' => ADMIN_A, 'values' => ['test.hello' => ['sk' => 'Ahoj,  {name}!']]])['status'],
    );
    assert_same(['Ahoj,  {name}!', ADMIN_B], array_slice(stored('test.hello', 'sk'), 0, 2));
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => 'Ahoj, {name}!']])['status']);

    // Somebody else's page still shows the old grid and sends strings as they are: nothing is rewritten.
    $theirs = stored('test.hello', 'sk');
    assert_same(200, save(ADMIN_A, ['test.hello' => ['sk' => 'Ahoj, {name}!', 'en' => 'Hello, {name}!'], 'test.bye' => ['en' => ' Goodbye ']])['status']);
    assert_same($theirs, stored('test.hello', 'sk'), 'still the other person\'s, from when they saved it');
    assert_same($untouched, stored('test.bye', 'en'));

    // Two people, one string: the last save is kept, and says whose it is. Other people's changes come back with every save.
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => 'Vitaj, {name}!']])['status']);
    $owner = save(ADMIN_A, ['test.hello' => ['sk' => 'Vitaj!'], 'test.bye' => ['sk' => 'Dovidenia']]);
    assert_same(['en' => 'Hello, {name}!', 'sk' => 'Vitaj!'], $owner['body']['keys'][2]['values'], 'a translation may leave a placeholder out');
    assert_same(['Vitaj!', ADMIN_A], array_slice(stored('test.hello', 'sk'), 0, 2));
    assert_true(stored('test.hello', 'sk')[2] > $theirs[2], 'and when');
    $none = save(ADMIN_B, []);
    assert_same([200, ['en' => 'Goodbye', 'sk' => 'Dovidenia']], [$none['status'], $none['body']['keys'][0]['values']], '{values: {}} saves nothing, and answers the fresh grid');

    // English reworded: its placeholders stay. A string for a key that had none: English first.
    assert_same(200, save(ADMIN_B, ['test.hello' => ['en' => 'Hi, {name}!'], 'test.new' => ['en' => 'New: {what}', 'sk' => 'Nové: {what}']])['status']);
    assert_same(['Hi, {name}!', ADMIN_B], array_slice(stored('test.hello', 'en'), 0, 2));
    assert_same('Nové: {what}', anonymous('GET', '/api/translations/sk')['body']['values']['test.new']);

    // An empty string: that language has none of its own again, and reads in English.
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => "  \t"]])['status']);
    assert_same(null, stored('test.hello', 'sk'));
    assert_same('Hi, {name}!', anonymous('GET', '/api/translations/sk')['body']['values']['test.hello']);
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => ' ']])['status'], 'and once more, when there is none');
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => 'Vitaj, {name}!']])['status']);

    // Empty is what nobody can see: a zero-width space alone is not kept as a string that draws an empty place.
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => "\u{200B}"]])['status']);
    assert_same(null, stored('test.hello', 'sk'), 'that string goes, like any empty one');
    $unseen = save(ADMIN_B, ['test.hello' => ['en' => " \u{2060}\u{00AD} "]]);
    assert_same([422, 'fallback_required'], [$unseen['status'], $unseen['body']['code']], 'and English is not left with one');
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => "Vitaj,\u{200C} {name}!"]])['status'], 'inside a text such a character is part of it');
    assert_same("Vitaj,\u{200C} {name}!", stored('test.hello', 'sk')[0]);
    assert_same(200, save(ADMIN_B, ['test.hello' => ['sk' => 'Vitaj, {name}!']])['status']);
});

test('saving strings: all of it is checked before any of it is written, and each refusal names its key', function (): void {
    $before = every_string();
    $refusals = [
        'unknown_key' => [['test.bye' => ['en' => 'Bye'], 'no.such' => ['en' => 'x'], 'nor.this' => ['sk' => 'y']], ['key' => 'no.such', 'keys' => ['no.such', 'nor.this']]],
        'unknown_language' => [['test.bye' => ['sk' => 'Zbohom', 'hu' => 'Viszlát']], ['key' => 'test.bye', 'language' => 'hu']],
        'fallback_required' => [['test.count' => ['sk' => '{count} / {total}'], 'test.bye' => ['en' => '  ']], ['key' => 'test.bye', 'language' => 'en']],
        'placeholder_changed' => [['test.bye' => ['sk' => 'Zbohom'], 'test.hello' => ['en' => 'Hi!']], ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'name']],
        'unknown_placeholder' => [['test.bye' => ['sk' => 'Zbohom'], 'test.hello' => ['sk' => 'Ahoj, {meno}!']], ['key' => 'test.hello', 'language' => 'sk', 'placeholder' => 'meno']],
        // What the page would show as braces and a word: the name translated into something that is no name, a space inside.
        'invalid_placeholder' => [['test.bye' => ['sk' => 'Zbohom'], 'test.count' => ['sk' => '{počet} / { total }']], ['key' => 'test.count', 'language' => 'sk']],
    ];
    foreach ($refusals as $code => [$values, $about]) {
        $refused = save(ADMIN_A, $values);
        assert_same([422, $code], [$refused['status'], $refused['body']['code'] ?? null], test_show($refused['body']));
        assert_same($about, array_diff_key($refused['body'], ['error' => 0, 'code' => 0]), "$code says what it is about, beside the sentence and the code");
        assert_same($before, every_string(), "$code: nothing of that save was written - not the good strings before the bad one either");
    }
    $added = save(ADMIN_A, ['test.hello' => ['en' => 'Hi, {name} - {title}!']]);
    assert_same(['placeholder_changed', 'title'], [$added['body']['code'], $added['body']['placeholder']], 'a placeholder the code does not fill');
    assert_match('/test\.hello.*\{title\}/', $added['body']['error'], 'the sentence names the key and the placeholder');
    assert_match('/Slovak.*test\.hello.*\{meno\}/', save(ADMIN_A, ['test.hello' => ['sk' => '{meno}']])['body']['error']);
    $braces = save(ADMIN_A, ['test.hello' => ['en' => 'Hi, {{name}}!']]);
    assert_same([422, 'invalid_placeholder'], [$braces['status'], $braces['body']['code']], 'in English too');
    assert_match('/English.*test\.hello.*not part of a placeholder.*like \{name\}/', $braces['body']['error'], 'it says how a placeholder is written, with the key\'s own');

    // The body's shape: {values: {key: {language: text}}} - objects, and nothing that only looks like one.
    $invalid = [
        'no values' => ['strings' => new stdClass()],
        'values as text' => ['values' => 'test.bye'],
        'values as null' => ['values' => null],
        'values as the empty list' => ['values' => []],
        'values as a list' => ['values' => [['test.bye' => ['en' => 'x']]]],
        'a list' => [['values' => ['test.bye' => ['en' => 'x']]]],
        'the empty list' => [],
        'a key with a text' => ['values' => ['test.bye' => 'Bye']],
        'a key with a list' => ['values' => ['test.bye' => ['Bye']]],
        'a string that is a number' => ['values' => ['test.bye' => ['sk' => 5]]],
        'a string that is an object' => ['values' => ['test.bye' => ['sk' => ['one' => 'x']]]],
        'a string that is null' => ['values' => ['test.bye' => ['sk' => null]]],
        '2001 characters' => ['values' => ['test.bye' => ['sk' => str_repeat('ž', 2001)]]],
    ];
    foreach ($invalid as $what => $body) {
        $refused = as_user(ADMIN_A, 'PUT', '/api/admin/translations', $body);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    foreach (['a text' => '"values"', 'a number' => '7', 'true' => 'true', 'null' => 'null'] as $what => $json) {
        $refused = as_user(ADMIN_A, 'PUT', '/api/admin/translations', $json, ['Content-Type: application/json']);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], "a body that is $what");
    }
    assert_same(
        'test.bye',
        as_user(ADMIN_A, 'PUT', '/api/admin/translations', ['values' => ['test.bye' => 'Bye']])['body']['key'] ?? null,
        'a key whose strings are not an object is refused with its key',
    );

    // A key that looks like a number is a key the site does not have, named as it was sent - PHP made a number of it on the way.
    $numeric = as_user(ADMIN_A, 'PUT', '/api/admin/translations', '{"values": {"12": {"en": "x"}}}', ['Content-Type: application/json']);
    assert_same(
        [422, 'unknown_key', '12', ['12']],
        [$numeric['status'], $numeric['body']['code'] ?? null, $numeric['body']['key'] ?? null, $numeric['body']['keys'] ?? null],
        test_show($numeric['body']),
    );
    assert_match('/The site has no key "12"\./', $numeric['body']['error']);
    $numeric = as_user(ADMIN_A, 'PUT', '/api/admin/translations', '{"values": {"test.bye": {"en": "Bye"}, "12": {"en": "x"}, "3.5": {"sk": "y"}}}', ['Content-Type: application/json']);
    assert_same(['unknown_key', ['12', '3.5']], [$numeric['body']['code'] ?? null, $numeric['body']['keys'] ?? null], 'among others');
    assert_same($before, every_string());

    assert_same(200, save(ADMIN_A, ['test.count' => ['sk' => str_repeat('ž', 2000)]])['status'], '2000 characters, counted as people count them');
    assert_same(200, save(ADMIN_A, ['test.count' => ['sk' => '']])['status']);

    // A text with more spaces inside it than can be trimmed (and still under the body's limit) is too long -
    // never an empty one: that would delete the stored string with a 200, or pass it over in an import.
    $spaces = 'Ahoj' . str_repeat(' ', 1040000) . '{name}';
    foreach (['sk', 'en'] as $code) {
        $refused = save(ADMIN_A, ['test.hello' => [$code => $spaces]]);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], "a million spaces inside the \"$code\" string");
    }
    $refused = as_user(ADMIN_A, 'PUT', '/api/admin/translations/sk/import', ['test.hello' => $spaces]);
    assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], 'nor is it passed over as an empty one');
    assert_same($before, every_string());

    // The body: JSON, and no more than the limit - 1 MiB, and not a byte more. Nothing, or nothing that says it is JSON, is no save.
    assert_same([415, 'unsupported_media_type'], [($none = as_user(ADMIN_A, 'PUT', '/api/admin/translations'))['status'], $none['body']['code'] ?? null], 'no body');
    assert_same(
        [422, 'empty_body'],
        [($empty = as_user(ADMIN_A, 'PUT', '/api/admin/translations', ' ', ['Content-Type: application/json']))['status'], $empty['body']['code'] ?? null],
        'an empty one',
    );
    assert_same(415, as_user(ADMIN_A, 'PUT', '/api/admin/translations', 'values=x', ['Content-Type: application/x-www-form-urlencoded'])['status']);
    assert_same(415, as_user(ADMIN_A, 'PUT', '/api/admin/translations', '{"values": {"test.bye": {"sk": "Zbohom"}}}', ['Content-Type: text/plain'])['status']);
    assert_same(415, as_user(ADMIN_A, 'PUT', '/api/admin/translations/sk/import', '{"test.bye": "Zbohom"}', ['Content-Type: text/plain'])['status']);
    assert_same([400, 'invalid_json'], [($broken = as_user(ADMIN_A, 'PUT', '/api/admin/translations', '{"values": ', ['Content-Type: application/json']))['status'], $broken['body']['code'] ?? null]);
    $limit = translationsConfig()->bodyLimit;
    assert_same(1024 * 1024, $limit);
    $json = ['Content-Type: application/json'];
    $over = body_of($limit + 1, '{"values":{"test.bye":{"sk":"', '"}}}');
    $large = as_user(ADMIN_A, 'PUT', '/api/admin/translations', $over, $json);
    assert_same([$limit + 1, 413, 'too_large'], [strlen($over), $large['status'], $large['body']['code'] ?? null], '1 MiB and one byte');
    $atLimit = as_user(ADMIN_A, 'PUT', '/api/admin/translations', body_of($limit, '{"values":{"test.bye":{"sk":"', '"}}}'), $json);
    assert_same([422, 'invalid_value'], [$atLimit['status'], $atLimit['body']['code'] ?? null], '1 MiB exactly is read - and then is one string too long');
    $large = as_user(ADMIN_A, 'PUT', '/api/admin/translations/sk/import', body_of($limit + 1, '{"test.bye":"', '"}'), $json);
    assert_same([413, 'too_large'], [$large['status'], $large['body']['code'] ?? null], 'an import of 1 MiB and one byte');
    assert_same(422, as_user(ADMIN_A, 'PUT', '/api/admin/translations/sk/import', body_of($limit, '{"test.bye":"', '"}'), $json)['status']);
    assert_same(413, as_user(EDITOR_A, 'PUT', '/api/admin/translations', $over, $json)['status'], 'the same for an editor');
    // The languages' bodies have the same limit: the library's one for every write of the words.
    assert_same(413, as_user(ADMIN_A, 'POST', '/api/admin/languages', body_of($limit + 1, '{"code":"fr","name":"French","native_name":"', '"}'), $json)['status']);
    assert_same(
        422,
        as_user(ADMIN_A, 'POST', '/api/admin/languages', body_of(BODY_LIMIT + 1, '{"code":"fr","name":"French","native_name":"', '"}'), $json)['status'],
        'more than the progress routes take is read - and is no name',
    );
    assert_same(
        413,
        as_user(ADMIN_A, 'PUT', '/api/progress', body_of(BODY_LIMIT + 1, '{"60":{"midi":60,"note":"', '"}}'), array_merge($json, [GENERATION_HEADER . ': 1']))['status'],
        'a progress document is still at most 256 kB',
    );
    // More than any other route takes, and still a save here.
    $room = save(ADMIN_A, ['test.bye' => ['sk' => 'Dovidenia'], 'test.hello' => ['en' => 'Hi, {name}!' . str_repeat(' ', BODY_LIMIT)]]);
    assert_same(200, $room['status'], test_show($room['body']['code'] ?? ''));
    assert_same($before, every_string(), 'and after all of it, the strings are what they were');
});

test('a language out as a file and back in: its own strings only; unknown keys refused, empty ones passed over', function (): void {
    $export = as_user(EDITOR_A, 'GET', '/api/admin/translations/sk/export');
    assert_same(200, $export['status']);
    assert_same(['test.bye' => 'Dovidenia', 'test.hello' => 'Vitaj, {name}!', 'test.new' => 'Nové: {what}'], $export['body'], 'not merged with English: test.count is not there');
    assert_same(TranslationFile::text($export['body']), $export['raw'], 'the command line\'s format: a key a line');
    assert_same(['attachment; filename="translations-sk.json"', 'no-store'], [$export['headers']['content-disposition'] ?? null, $export['headers']['cache-control'] ?? null]);
    assert_same(404, as_user(EDITOR_A, 'GET', '/api/admin/translations/fr/export')['status']);
    assert_same("{}\n", as_user(EDITOR_A, 'GET', '/api/admin/translations/pt-br/export')['raw']);

    // Into German: the empty ones are keys nobody translated yet.
    $in = as_user(ADMIN_A, 'PUT', '/api/admin/translations/de/import', ['test.hello' => " Hallo, {name}!\x07", 'test.bye' => '', 'test.count' => "  \t ", 'test.new' => 'Neu']);
    assert_same(200, $in['status'], test_show($in['body']));
    assert_same(['languages', 'keys'], array_keys($in['body']), 'answered with the grid as it is now');
    assert_same(['test.hello' => 'Hallo, {name}!', 'test.new' => 'Neu'], as_user(EDITOR_A, 'GET', '/api/admin/translations/de/export')['body']);
    assert_same(['Hallo, {name}!', ADMIN_A], array_slice(stored('test.hello', 'de'), 0, 2), 'by who imported it');

    // An empty string deletes nothing - not in English either, where a save would refuse it.
    $before = every_string();
    assert_same(200, as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', ['test.hello' => '', 'test.new' => 'Neu'])['status']);
    assert_same(200, as_user(EDITOR_A, 'PUT', '/api/admin/translations/en/import', ['test.bye' => ' ', 'test.hello' => 'Hi, {name}!'])['status']);
    assert_same(200, as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', ['test.hello' => "\u{200B}", 'test.new' => " \u{2060}\u{00AD}"])['status'], 'nor one that only looks empty');
    assert_same(200, as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', new stdClass())['status'], 'an empty file');
    assert_same($before, every_string(), 'what was there stays, as it was and by whom');

    $unknown = as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', ['test.bye' => 'Tschüss', 'no.such' => 'x', 'nor.this' => '', 'test.count' => '{count} von {total}']);
    assert_same([422, 'unknown_key'], [$unknown['status'], $unknown['body']['code']]);
    assert_same(['no.such', 'nor.this'], $unknown['body']['keys'], 'every key the site does not have, empty or not');
    assert_match('/no\.such.*nor\.this/', $unknown['body']['error']);
    $numeric = as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', '{"test.bye": "Tschüss", "12": "x"}', ['Content-Type: application/json']);
    assert_same([422, 'unknown_key', ['12']], [$numeric['status'], $numeric['body']['code'] ?? null, $numeric['body']['keys'] ?? null], 'a key that looks like a number, named as it was sent');
    // An object of the keys "0", "1"... is refused too, as any key the site does not have (anotoki-lib 0.4.0: it was
    // invalid_value) - named.
    $listLike = as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', '{"0": "Ahoj", "1": "Svet"}', ['Content-Type: application/json']);
    assert_same([422, 'unknown_key', ['0', '1']], [$listLike['status'], $listLike['body']['code'] ?? null, $listLike['body']['keys'] ?? null], '{"0": ...}');

    $refusals = [
        'unknown_placeholder' => ['de', ['test.bye' => 'Tschüss', 'test.hello' => 'Hallo, {dich}!']],
        'placeholder_changed' => ['en', ['test.hello' => 'Hi!']],
        'invalid_placeholder' => ['de', ['test.hello' => 'Hallo, { name }!']],
        'invalid_value' => ['de', ['test.hello' => ['de' => 'Hallo']]],
    ];
    foreach ($refusals as $code => [$language, $body]) {
        $refused = as_user(EDITOR_A, 'PUT', "/api/admin/translations/$language/import", $body);
        assert_same([422, $code], [$refused['status'], $refused['body']['code'] ?? null], test_show($refused['body']));
    }
    // A list's items are numbered - keys no site has (anotoki-lib 0.4.0), named as such; the empty list, a text and a
    // number are no flat object at all.
    $list = as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', ['Hallo', 'Tschüss']);
    assert_same([422, 'unknown_key', ['0', '1']], [$list['status'], $list['body']['code'] ?? null, $list['body']['keys'] ?? null], 'a list');
    foreach (['the empty list' => [], 'a text' => '"Hallo"', 'a number' => '5'] as $what => $body) {
        $refused = as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', $body, is_string($body) ? ['Content-Type: application/json'] : []);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same(415, as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import')['status'], 'no body');
    assert_same(404, as_user(EDITOR_A, 'PUT', '/api/admin/translations/fr/import', ['test.bye' => 'Au revoir'])['status'], 'a language there is not');
    assert_same($before, every_string(), 'nothing refused was kept');

    // What came out goes back in, and nothing changes.
    $german = as_user(EDITOR_A, 'GET', '/api/admin/translations/de/export')['body'];
    assert_same(200, as_user(EDITOR_A, 'PUT', '/api/admin/translations/de/import', $german)['status']);
    assert_same($before, every_string());
});

test('the command line: --export and --import on the same strings, by nobody; --status reads the frontend', function (): void {
    $dir = test_temp_dir('cli');

    [$code, $out] = cli('--export', 'de', "$dir/de.json");
    assert_same(0, $code, $out);
    assert_same(TranslationFile::text(['test.hello' => 'Hallo, {name}!', 'test.new' => 'Neu']), file_get_contents("$dir/de.json"));
    [$code, $out] = cli('--export', 'sk');
    assert_same([0, ['test.bye' => 'Dovidenia', 'test.hello' => 'Vitaj, {name}!', 'test.new' => 'Nové: {what}']], [$code, json_decode($out, true)], 'to the screen without a file');
    [$code, $out] = cli('--export=sk');
    assert_same([0, ['test.bye' => 'Dovidenia', 'test.hello' => 'Vitaj, {name}!', 'test.new' => 'Nové: {what}']], [$code, json_decode($out, true)], '--export=CODE too');
    [$code, $out] = cli('--export', 'pt-br');
    assert_same([0, '{}'], [$code, trim($out)]);
    assert_same(1, cli('--export', 'fr')[0], 'a language there is not');
    assert_same(1, cli('--export', 'EN')[0], 'a code that is not one');

    $before = every_string();
    TranslationFile::write("$dir/de.json", ['test.hello' => 'Guten Tag, {name}!', 'test.bye' => 'Tschüss', 'test.count' => '', 'test.new' => 'Neu']);
    [$code, $out] = cli('--import', 'de', "$dir/de.json");
    assert_same(0, $code, $out);
    assert_match('/4 strings in .*: 2 changed/', $out);
    assert_same(['Guten Tag, {name}!', null], array_slice(stored('test.hello', 'de'), 0, 2), 'written by nobody, as a migration\'s are');
    assert_same(['Tschüss', null], array_slice(stored('test.bye', 'de'), 0, 2));
    assert_same($before['test.new de'], every_string()['test.new de'], 'a string as it was is still whose it was');

    // Checked as a save is, and all of it or none of it.
    $before = every_string();
    TranslationFile::write("$dir/bad.json", ['test.bye' => 'Auf Wiedersehen', 'test.hello' => 'Hallo, {dich}!']);
    [$code, $out] = cli('--import', 'de', "$dir/bad.json");
    assert_same(1, $code);
    assert_match('/unknown_placeholder.*\{dich\}/', $out);
    TranslationFile::write("$dir/unknown.json", ['test.bye' => 'Auf Wiedersehen', 'no.such' => 'x', 'nor.this' => 'y']);
    [$code, $out] = cli('--import', 'de', "$dir/unknown.json");
    assert_same(1, $code);
    assert_match('/unknown_key/', $out);
    assert_match('/^\s+no\.such$/m', $out, 'the keys, one a line');
    assert_match('/^\s+nor\.this$/m', $out);
    file_put_contents("$dir/list.json", '["a"]');
    assert_same(1, cli('--import', 'de', "$dir/list.json")[0]);
    assert_same(1, cli('--import', 'de', "$dir/nothing.json")[0]);
    assert_same(1, cli('--import', 'fr', "$dir/de.json")[0]);
    assert_same(1, cli('--import', 'de')[0], 'no file named');
    assert_same(1, cli('--nonsense')[0]);
    assert_same($before, every_string(), 'nothing refused was kept');
    assert_same(0, cli('--help')[0]);
    assert_match('/--status.*--export.*--import/s', cli('--help')[1]);

    // --status: the test's keys are the database's, and no page asks for them.
    [$code, $out] = cli('--status');
    assert_match('/== piano_academy \(' . preg_quote(dbName(), '/') . '\)/', $out, 'it says which database it read');
    assert_match('/the database has\s+4 keys/', $out, $out);
    assert_match('/In the database, used nowhere.*\n\s+test\.bye\n\s+test\.count\n\s+test\.hello\n\s+test\.new\n/', $out);
    assert_match('/\n\s+de\s+German \(Germany\)\s+3 \/ 4\n/', $out, 'how much of each language there is');
    // Exit 1 exactly when it says "Not clean." - a key the frontend puts together at run time
    // (shared/i18n/dynamic-keys.ts) must be there whatever else the database has, so with the test's
    // four keys it is one or the other by what the frontend declares today.
    assert_same(str_contains($out, 'Not clean.') ? 1 : 0, $code, $out);
    assert_same(str_contains($out, 'Clean.') ? 0 : 1, $code, $out);
    $wasClean = $code === 0;

    // A key with no English string: nothing to fall back to - exit 1 whatever the rest says.
    dbExec("INSERT INTO translation_keys (name) VALUES ('test.noEnglish')");
    [$code, $out] = cli('--status');
    assert_same(1, $code, $out);
    assert_match('/No English string.*\n\s+test\.noEnglish\n/', $out);
    assert_match('/Not clean\./', $out);
    dbExec("DELETE FROM translation_keys WHERE name = 'test.noEnglish'");
    assert_same($wasClean ? 0 : 1, cli('--status')[0], 'and as before without it');

    // On a database as the migrations leave it - this app's and the library's - which is what a release is.
    $released = dbName() . '_released';
    test_copy_template($released);
    $config = (string) getenv('PIANO_TEST_CONFIG');
    putenv('PIANO_TEST_CONFIG=' . test_config_dir(test_auth_iam(), $released));
    try {
        [$code, $out] = cli('--status');
    } finally {
        putenv("PIANO_TEST_CONFIG=$config");
    }
    assert_match('/== piano_academy \(' . preg_quote($released, '/') . '\)/', $out, 'it read the database it was pointed at');
    assert_same(str_contains($out, 'Not clean.') ? 1 : 0, $code, $out);
    if (catalogue_seeded()) {
        // WAITS FOR 003: nothing missing, nothing unused, nothing the scan does not let through, nothing stored that a
        // save would refuse - exit 0, and "Clean."
        assert_same(0, $code, $out);
        assert_match('/Clean\./', $out);
        assert_no_match('/Not clean\.|Used by the frontend, not in the database|No English string|does not let through|used nowhere|Stored as a save would not take them/', $out, $out);
    } else {
        assert_match('/the database has\s+0 keys/', $out, 'no migration writes strings yet');
    }

    // A database the migrations have not reached is not read at all: without the words' tables, or with an update waiting.
    $behind = test_empty_db('cli_behind');
    putenv('PIANO_TEST_CONFIG=' . test_config_dir(test_auth_iam(), $behind));
    try {
        [$code, $out] = cli('--status');
        assert_same(1, $code, $out);
        assert_match('/This database has no strings yet: apply the migrations first \(php migration\.php\)/', $out);
        $pdo = dbConnect(machineDatabaseSettings(), $behind);
        assert_same(null, test_migrate($pdo, '002_languages_and_translations.sql')['failed']);
        $pdo = null;
        [$code, $out] = cli('--status');
        assert_same(1, $code, $out);
        assert_match('~needs an update first \(003_site_strings\.sql, .*, anotoki_translations/001_languages_and_strings\.sql, .*, anotoki_people/001_people\.sql\): php migration\.php~', $out);
    } finally {
        putenv("PIANO_TEST_CONFIG=$config");
    }
});

test('deleting a language: never English, never one the app is released in - and its strings go with it, counted', function (): void {
    $english = as_user(ADMIN_A, 'DELETE', '/api/admin/languages/en');
    assert_same([409, 'fallback_language'], [$english['status'], $english['body']['code']]);
    $slovak = as_user(ADMIN_A, 'DELETE', '/api/admin/languages/sk');
    assert_same([409, 'seeded_language'], [$slovak['status'], $slovak['body']['code']], 'the next migration with strings would fail without it');
    assert_same(404, as_user(ADMIN_A, 'DELETE', '/api/admin/languages/fr')['status']);
    assert_true(stored('test.hello', 'sk') !== null && stored('test.hello', 'en') !== null, 'refused: their strings are still there');

    // A language with no strings goes; the others stay.
    $empty = as_user(ADMIN_A, 'DELETE', '/api/admin/languages/pt-br');
    assert_same([200, ['strings' => 0]], [$empty['status'], $empty['body']]);
    assert_same(['en', 'sk', 'de'], array_column(as_user(ADMIN_A, 'GET', '/api/admin/languages')['body']['languages'], 'code'));

    // One with strings goes with them - and says how many.
    assert_same(3, (int) dbValue("SELECT count(*) FROM translations WHERE language_code = 'de'"));
    $gone = as_user(ADMIN_B, 'DELETE', '/api/admin/languages/de');
    assert_same([200, ['strings' => 3]], [$gone['status'], $gone['body']]);
    assert_same(0, (int) dbValue("SELECT count(*) FROM translations WHERE language_code = 'de'"), 'and its strings');
    assert_same(4, (int) dbValue('SELECT count(*) FROM translation_keys'), 'the keys are the code\'s, and stay');
    assert_same(404, as_user(ADMIN_A, 'DELETE', '/api/admin/languages/de')['status']);
    assert_same('en', anonymous('GET', '/api/translations/de')['body']['language']);
    assert_same(['en', 'sk'], array_column(as_user(ADMIN_A, 'GET', '/api/admin/translations')['body']['languages'], 'code'));

    // Another administrator: the same rules, and the same right.
    assert_same([409, 'seeded_language'], [as_user(ADMIN_B, 'DELETE', '/api/admin/languages/sk')['status'], as_user(ADMIN_B, 'DELETE', '/api/admin/languages/sk')['body']['code']]);
    assert_same(201, as_user(ADMIN_B, 'POST', '/api/admin/languages', ['code' => 'hu', 'name' => 'Hungarian', 'native_name' => 'Magyar', 'enabled' => false])['status']);
    assert_same(200, as_user(ADMIN_B, 'DELETE', '/api/admin/languages/hu')['status']);
});

test('a language deleted while strings are being saved: each waits for the other, and no string is left in a language that is gone', function (): void {
    $italian = static function (): void {
        dbExec("INSERT INTO languages (code, name, native_name, sort_order) VALUES ('it', 'Italian', 'Italiano', 9) ON CONFLICT DO NOTHING");
    };
    $there = static fn(): int => (int) dbValue("SELECT count(*) FROM languages WHERE code = 'it'");
    $strings = static fn(): int => (int) dbValue("SELECT count(*) FROM translations WHERE language_code = 'it'");
    $other = somebody_else();
    $pending = null;

    try {
        // The save first. It holds every language's row (FOR SHARE), has written a string in the language and is
        // not finished: the delete waits on the row, and takes the string along when it goes - counted.
        $italian();
        $other->beginTransaction();
        $other->query('SELECT code, name FROM languages FOR SHARE')->fetchAll();
        $other->exec("INSERT INTO translations (key_name, language_code, value) VALUES ('test.bye', 'it', 'Ciao')");
        $pending = begin_as(ADMIN_A, 'DELETE', '/api/admin/languages/it');
        if (!$pending['waits']()) {
            fail('the delete did not wait for the save, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([200, ['strings' => 1]], [$answer['status'], $answer['body']], test_show($answer['body']));
        assert_same([0, 0], [$there(), $strings()], 'the language is gone, and the string that was being saved with it');

        // The delete first, not finished. A save of a string in that language waits on the languages' rows,
        // and is refused when the row is gone: the check is made on what is there after the wait.
        $italian();
        $other->beginTransaction();
        $other->exec("DELETE FROM languages WHERE code = 'it'");
        $pending = begin_as(ADMIN_B, 'PUT', '/api/admin/translations', ['values' => ['test.bye' => ['it' => 'Ciao']]]);
        if (!$pending['waits']()) {
            fail('the save did not wait for the delete, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([422, 'unknown_language', 'it'], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['language'] ?? null], test_show($answer['body']));
        assert_same([0, 0], [$there(), $strings()], 'nothing of the save was kept');

        // A delete that is taken back: the save that waited for it goes through.
        $italian();
        $other->beginTransaction();
        $other->exec("DELETE FROM languages WHERE code = 'it'");
        $pending = begin_as(ADMIN_B, 'PUT', '/api/admin/translations', ['values' => ['test.bye' => ['it' => 'Ciao']]]);
        if (!$pending['waits']()) {
            fail('the save did not wait for the delete, and answered ' . test_show($pending['answer']()));
        }
        $other->rollBack();
        $answer = $pending['answer']();
        assert_same(200, $answer['status'], test_show($answer['body']));
        assert_same(['Ciao', ADMIN_B], array_slice(stored('test.bye', 'it'), 0, 2));

        // While strings are being saved, another save goes on: the rows are shared.
        $other->beginTransaction();
        $other->query('SELECT code, name FROM languages FOR SHARE')->fetchAll();
        assert_same(200, save(ADMIN_A, ['test.bye' => ['it' => 'Arrivederci']])['status']);
        assert_same(200, anonymous('GET', '/api/translations/it')['status']);
        $other->rollBack();
        assert_same([200, ['strings' => 1]], array_values(array_intersect_key(as_user(ADMIN_A, 'DELETE', '/api/admin/languages/it'), ['status' => 0, 'body' => 0])));
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        if ($pending !== null) {
            $pending['answer']();
        }
        dbExec("DELETE FROM languages WHERE code = 'it'");
    }
    assert_same(['en', 'sk'], array_column(as_user(ADMIN_A, 'GET', '/api/admin/languages')['body']['languages'], 'code'));
});

test('who reworded a string follows that person to another IAM id, and their going takes no string along', function (): void {
    // An operator moves the editor's data to another IAM id (php tools/progress.php --move).
    $before = every_string();
    assert_same(200, save(EDITOR_A, ['test.count' => ['sk' => '{count} / {total}']])['status']);
    assert_same(EDITOR_A, stored('test.count', 'sk')[1]);
    assert_same(['moved' => true, 'notes' => 0, 'sessions' => 0], transferReassign(EDITOR_A, 70));
    assert_same(['{count} / {total}', 70], array_slice(stored('test.count', 'sk'), 0, 2), 'the foreign key follows the users row');

    // An empty users row that is replaced by a move (somebody who signed in once and did nothing - but reworded a string).
    dbExec('INSERT INTO users (id) VALUES (80)');
    dbExec("UPDATE translations SET updated_by = 80 WHERE key_name = 'test.bye' AND language_code = 'sk'");
    assert_same(['moved' => true, 'notes' => 0, 'sessions' => 0], transferReassign(70, 80), 'the move is not stopped by a string the other row reworded');
    assert_same(['Dovidenia', null], array_slice(stored('test.bye', 'sk'), 0, 2), 'the string stays, by nobody');
    assert_same(['{count} / {total}', 80], array_slice(stored('test.count', 'sk'), 0, 2));

    dbExec("DELETE FROM translations WHERE key_name = 'test.count' AND language_code = 'sk'");
    assert_same(array_keys($before), array_keys(every_string()), 'and no string came or went');
});

test('a database with only 001 applied: the words say they are not there yet, every admin route of them that the site is being updated, and nothing is looked up', function (): void {
    $behind = test_empty_db('only_001');
    $pdo = dbConnect(machineDatabaseSettings(), $behind);
    assert_same(every_migration(), databaseMigrator($pdo)->applicable());
    $first = test_migrate($pdo, '001_init.sql')['applied'];
    assert_same([...admin_migrations(), ['set' => MIGRATIONS_SET, 'name' => '001_init.sql']], $first, 'the library\'s admin tools\' set, then 001');
    $pending = array_map('migrationLabel', array_values(array_filter(every_migration(), static fn(array $file): bool => !in_array($file, $first, true))));
    assert_true(in_array('002_languages_and_translations.sql', $pending, true));

    $app = test_start_server(
        TEST_BACKEND,
        TEST_BACKEND . '/router.php',
        [
            'PIANO_TEST_CONFIG' => test_config_dir(test_auth_iam(), $behind),
            'PIANO_FRONTEND_DIST' => test_frontend_build(),
        ],
        '/api/health',
    );
    assert_same($pending, call($app['base'], 'GET', '/api/health')['body']['pending']);
    // With an administrator's token, an editor's, and none. The words answer while an update waits (the gate's open
    // paths) - but a database without their tables has none to give, and says so: the pages read the English they
    // keep; the admin routes of the words are the gate's own answer, before the person is looked at.
    $being = 'The site is being updated. Try again in a few minutes.';
    foreach (['an administrator' => bearer(token_of(ADMIN_A)), 'an editor' => bearer(token_of(EDITOR_A)), 'nobody' => []] as $who => $headers) {
        foreach (['en', 'sk'] as $code) {
            $words = call($app['base'], 'GET', "/api/translations/$code", null, $headers);
            assert_same(
                [503, ['error' => NO_WORDS_YET, 'code' => 'translations_unavailable'], '60'],
                [$words['status'], $words['body'], $words['headers']['retry-after'] ?? null],
                "$who: the words in $code",
            );
        }
        foreach (admin_routes() as [$method, $url, $body]) {
            $answer = call($app['base'], $method, $url, $body, $headers);
            assert_same([503, ['code' => 'update_pending', 'message' => $being], '60'], [$answer['status'], $answer['body'], $answer['headers']['retry-after'] ?? null], "$who: $method $url");
        }
    }
    assert_same(404, call($app['base'], 'GET', '/api/translations/x@')['status'], 'a code that is no code is still only that');
    assert_same(503, call($app['base'], 'GET', '/api/translations')['status'], 'an address that is no route waits like every other while an update does');
    assert_same([], problems_of($app), 'no table that is not there was asked for');
    $app['stop']();
    assert_same(0, (int) $pdo->query('SELECT count(*) FROM users')->fetchColumn(), 'nobody was looked up, or recorded');
    $pdo = null;
});

test('the servers said nothing they should not have', function (): void {
    assert_same([], problems_of($GLOBALS['hosted']));
    // An expired token is an everyday thing: the family's library writes no line for it - and never the token.
    assert_false((bool) preg_match('/token refused: expired|eyJ[A-Za-z0-9_-]{10,}/', (string) file_get_contents($GLOBALS['hosted']['log'])), 'no line for an expired token, never a token');
});
