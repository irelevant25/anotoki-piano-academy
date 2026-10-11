<?php

// The admin panel's routes, role by role, through the real server: every route
// of the staff group (EDITOR or ADMIN) and of the ADMIN group answers nobody
// 401, a token that does not check out 401 - whatever role it names - a
// learner 403, an editor 403 on ADMIN's, and lets the right ones through. The
// People routes: everybody with their counts, and one person deleted whole -
// nobody else touched, a string they reworded kept by nobody. And the
// Migrations page's routes (the anotoki family's, anotoki/lib's
// MigrationsRoutes): what the database has (and when) and lacks, a file's
// SQL, and Apply - working while every other route says the site is being
// updated, under the one lock setup.php and php migration.php take too, a
// failure named and logged; the Database page's old addresses are gone.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const ADMIN = 1;
const EDITOR = 2;
const LEARNER = 3;

const STAFF_SENTENCE = 'This is for the people who keep Piano Academy\'s words. Ask the site\'s administrator for the editor role.';
const ADMIN_SENTENCE = 'Only an administrator of Piano Academy may do this.';

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app(test_auth_iam());
});

/** A token as the IAM signs it for these people. */
function token_for(int $user): string
{
    return test_token($user, match ($user) {
        ADMIN => [ROLE_ADMIN],
        EDITOR => [ROLE_EDITOR],
        default => [],
    });
}

/**
 * The staff's routes: EDITOR or ADMIN. Each with a body that changes nothing
 * when let through, so every role can be tried on every route.
 *
 * @return array<array{0: string, 1: string, 2: mixed}>
 */
function staff_routes(): array
{
    return [
        ['GET', '/api/admin/languages', null],
        ['GET', '/api/admin/translations', null],
        ['PUT', '/api/admin/translations', ['values' => new stdClass()]],
        ['GET', '/api/admin/translations/sk/export', null],
        ['PUT', '/api/admin/translations/sk/import', new stdClass()],
    ];
}

/** ADMIN's routes: the languages themselves, the people, and the database. Let through, these change nothing either. */
function admin_routes(): array
{
    return [
        ['POST', '/api/admin/languages', new stdClass()],            // 422: no language in it
        ['PUT', '/api/admin/languages/zz', ['name' => 'Nobody']],    // 404: no such language
        ['DELETE', '/api/admin/languages/zz', null],                 // 404
        ['GET', '/api/admin/people', null],
        ['DELETE', '/api/admin/people/999999', null],                // 404: nobody with that id
        ['GET', '/api/admin/migrations', null],
        ['GET', '/api/admin/migrations/file?set=piano_academy&name=001_init.sql', null],
        ['POST', '/api/admin/migrations/apply', null],               // nothing pending: nothing applied
    ];
}

function ask(array $app, string $method, string $url, mixed $body, array $headers): array
{
    return call($app['base'], $method, $url, $body, $headers);
}

/** Everything a route here could change. */
function everything(): array
{
    return [
        dbAll('SELECT * FROM languages ORDER BY code'),
        dbAll('SELECT key_name, language_code, value, updated_by FROM translations ORDER BY 1, 2'),
        dbAll('SELECT filename FROM migrations ORDER BY 1'),
        dbAll('SELECT user_id, notes::text FROM progress ORDER BY 1'),
        dbAll('SELECT user_id, count(*) FROM sessions GROUP BY 1 ORDER BY 1'),
    ];
}

/** One person's rows in each of their tables, and their users row. */
function rows_of(int $user): array
{
    $rows = [];
    foreach (['users' => 'id', 'progress' => 'user_id', 'path_progress' => 'user_id', 'sessions' => 'user_id', 'imports' => 'user_id'] as $table => $column) {
        $rows[$table] = (int) dbValue("SELECT count(*) FROM $table WHERE $column = ?", [$user]);
    }

    return $rows;
}

test('nobody: 401 on every admin route; a token that does not check out: 401 too, whatever role it names - never 403', function (): void {
    $before = everything();
    $other = anotoki_iam_test_keypair('piano-test-key');
    $bad = [
        'an administrator\'s that ran out' => bearer(test_token(ADMIN, [ROLE_ADMIN], ['exp' => time() - 120])),
        'an administrator\'s signed with another key' => bearer(test_token(ADMIN, [ROLE_ADMIN], [], ['keys' => $other])),
        'an editor\'s for another application' => bearer(test_token(EDITOR, [ROLE_EDITOR], ['aud' => 'survey'])),
        'garbage' => bearer('not.a.token'),
        'another scheme' => ['Authorization: Basic YWRtaW46YWRtaW4='],
    ];
    foreach (array_merge(staff_routes(), admin_routes()) as [$method, $url, $body]) {
        $nobody = ask($GLOBALS['app'], $method, $url, $body, []);
        assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], "$method $url, nobody");
        assert_match('/^Bearer realm="piano-academy"/', $nobody['headers']['www-authenticate'] ?? '');
        foreach ($bad as $what => $headers) {
            assert_same(401, ask($GLOBALS['app'], $method, $url, $body, $headers)['status'], "$method $url, $what");
        }
    }
    assert_same($before, everything(), 'nothing was done');
    assert_same(0, (int) dbValue('SELECT count(*) FROM users'), 'and nobody was recorded');
});

test('a learner - MEMBER alone, as every account holds it, and a token with no roles claim - is refused every admin route: 403 forbidden, in that group\'s words', function (): void {
    $before = everything();
    $roleless = anotoki_iam_test_claims(['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT], 4);
    unset($roleless['roles']);
    $who = [
        'a learner' => bearer(token_for(LEARNER)),
        'MEMBER alone' => bearer(test_token(5, ['MEMBER'])),
        'no roles claim' => bearer(anotoki_iam_test_sign($roleless, test_keys()['private_pem'], test_keys()['kid'])),
    ];
    foreach ([[staff_routes(), STAFF_SENTENCE], [admin_routes(), ADMIN_SENTENCE]] as [$routes, $sentence]) {
        foreach ($routes as [$method, $url, $body]) {
            foreach ($who as $what => $headers) {
                $answer = ask($GLOBALS['app'], $method, $url, $body, $headers);
                assert_same([403, 'forbidden', $sentence], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['error'] ?? null], "$method $url, $what");
            }
        }
    }
    // A role in the address or a header is nobody's role.
    assert_same(403, ask($GLOBALS['app'], 'GET', '/api/admin/migrations?role=ADMIN', null, array_merge(bearer(token_for(LEARNER)), ['X-Roles: ADMIN']))['status']);
    assert_same($before, everything(), 'nothing was done');
    assert_same(200, ask($GLOBALS['app'], 'GET', '/api/state', null, bearer(token_for(LEARNER)))['status'], 'a learner learns, with their own progress');
});

test('an editor: through every staff route, refused every one of ADMIN\'s in the administrator\'s words', function (): void {
    $before = everything();
    foreach (staff_routes() as [$method, $url, $body]) {
        $answer = ask($GLOBALS['app'], $method, $url, $body, bearer(token_for(EDITOR)));
        assert_same(200, $answer['status'], "$method $url: " . test_show($answer['body']));
    }
    foreach (admin_routes() as [$method, $url, $body]) {
        $answer = ask($GLOBALS['app'], $method, $url, $body, bearer(token_for(EDITOR)));
        assert_same([403, 'forbidden', ADMIN_SENTENCE], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['error'] ?? null], "$method $url");
    }
    assert_same($before, everything());
});

test('an administrator: through every route - staff and ADMIN alike', function (): void {
    $before = everything();
    foreach (staff_routes() as [$method, $url, $body]) {
        assert_same(200, ask($GLOBALS['app'], $method, $url, $body, bearer(token_for(ADMIN)))['status'], "$method $url");
    }
    $expected = [
        'POST /api/admin/languages' => [422, 'invalid_language'],
        'PUT /api/admin/languages/zz' => [404, 'not_found'],
        'DELETE /api/admin/languages/zz' => [404, 'not_found'],
        'GET /api/admin/people' => [200, null],
        'DELETE /api/admin/people/999999' => [404, 'not_found'],
        'GET /api/admin/migrations' => [200, null],
        'GET /api/admin/migrations/file?set=piano_academy&name=001_init.sql' => [200, null],
        'POST /api/admin/migrations/apply' => [200, null],
    ];
    foreach (admin_routes() as [$method, $url, $body]) {
        $answer = ask($GLOBALS['app'], $method, $url, $body, bearer(token_for(ADMIN)));
        assert_same($expected["$method $url"], [$answer['status'], is_array($answer['body']) ? ($answer['body']['code'] ?? null) : null], "$method $url");
    }

    // The Migrations page's list: the app's set, then the library's of the words - every file applied in the order they
    // ran, when in ISO 8601 UTC.
    $list = ask($GLOBALS['app'], 'GET', '/api/admin/migrations', null, bearer(token_for(ADMIN)));
    $status = $list['body'];
    assert_same(['sets', 'applied', 'pending', 'missing'], array_keys($status));
    assert_same([[MIGRATIONS_SET, 'anotoki_translations'], every_migration(), [], []], [$status['sets'], array_map(static fn (array $file): array => ['set' => $file['set'], 'name' => $file['name']], $status['applied']), $status['pending'], $status['missing']], 'every file applied, in the order they ran');
    foreach ($status['applied'] as $file) {
        assert_same(['set', 'name', 'applied_at'], array_keys($file));
        assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', (string) $file['applied_at'], 'when ' . $file['name'] . ' was applied');
    }
    assert_same('no-store', $list['headers']['cache-control'] ?? null);

    // A file's SQL as it is - and nothing that is not a file of the set.
    $file = ask($GLOBALS['app'], 'GET', '/api/admin/migrations/file?set=piano_academy&name=001_init.sql', null, bearer(token_for(ADMIN)));
    assert_same(['set' => MIGRATIONS_SET, 'name' => '001_init.sql', 'sql' => (string) file_get_contents(migrationsDir() . '/001_init.sql')], $file['body']);
    foreach (['set=piano_academy&name=../../config/database.local.php', 'set=piano_academy&name=001_init', 'set=survey&name=001_init.sql', 'set=piano_academy', ''] as $query) {
        $none = ask($GLOBALS['app'], 'GET', "/api/admin/migrations/file?$query", null, bearer(token_for(ADMIN)));
        assert_same([404, ['code' => 'not_found', 'message' => 'No such migration file.']], [$none['status'], $none['body']], "?$query");
    }

    assert_same(['applied' => [], 'failed' => null, 'error' => null, 'note' => null], ask($GLOBALS['app'], 'POST', '/api/admin/migrations/apply', null, bearer(token_for(ADMIN)))['body'], 'nothing to apply');
    // The Database page's old addresses answer nothing any more.
    assert_same(404, ask($GLOBALS['app'], 'GET', '/api/admin/database', null, bearer(token_for(ADMIN)))['status']);
    assert_same(404, ask($GLOBALS['app'], 'POST', '/api/admin/database/update', null, bearer(token_for(ADMIN)))['status']);
    assert_same($before, everything());

    // The languages' routes really are an administrator's: one added and gone again (the IAM's wire format, snake_case).
    $made = ask($GLOBALS['app'], 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'], bearer(token_for(ADMIN)));
    assert_same(201, $made['status'], test_show($made['body']));
    assert_same([200, ['strings' => 0]], array_values(array_intersect_key(ask($GLOBALS['app'], 'DELETE', '/api/admin/languages/de', null, bearer(token_for(ADMIN))), ['status' => 0, 'body' => 0])));
});

test('People: everybody with what they have, the most recently seen first - and one person deleted whole, nobody else touched', function (): void {
    $file = [
        'format' => 'piano-academy-export', 'version' => 1,
        'progress' => ['60' => ['midi' => 60], '62' => ['midi' => 62]],
        'path' => ['steps' => ['rh-1/meet' => ['attempts' => 1]]],
        'sessions' => [['mode' => 'trainer', 'attempts' => 1, 'correct' => 1, 'accuracy' => 100], ['mode' => 'sheet', 'attempts' => 2, 'correct' => 1, 'accuracy' => 50]],
    ];
    foreach ([LEARNER => bearer(token_for(LEARNER)), EDITOR => bearer(token_for(EDITOR)), 6 => bearer(test_token(6))] as $user => $headers) {
        assert_same(200, ask($GLOBALS['app'], 'POST', '/api/me/import?replace=true', $file, $headers)['status'], "progress for $user");
    }
    assert_same(200, ask($GLOBALS['app'], 'GET', '/api/state', null, bearer(test_token(7)))['status'], 'somebody who signed in once');
    // The editor rewords a string (and an imports row of the first app's names them).
    $key = (string) dbValue("SELECT key_name FROM translations WHERE language_code = 'en' AND value NOT LIKE '%{%' AND key_name NOT LIKE '%.one' AND key_name NOT LIKE '%.few' AND key_name NOT LIKE '%.other' ORDER BY key_name LIMIT 1");
    assert_same(200, ask($GLOBALS['app'], 'PUT', '/api/admin/translations', ['values' => [$key => ['sk' => 'Iné slovo']]], bearer(token_for(EDITOR)))['status']);
    dbExec("INSERT INTO imports (source, user_id, summary) VALUES ('server-data', ?, '{}')", [EDITOR]);
    dbExec("UPDATE users SET last_seen_at = now() - interval '10 days'"); // the people the tests before made: 4, 5
    foreach ([ADMIN => 0, LEARNER => 1, EDITOR => 2, 6 => 3, 7 => 4] as $user => $daysAgo) {
        dbExec('UPDATE users SET last_seen_at = now() - make_interval(days => ?::int) WHERE id = ?', [$daysAgo, $user]);
    }

    // A visitor (practising without signing in, api/visitors.php) with two rounds: counted, never listed.
    $visitor = (int) dbValue("INSERT INTO users (id, visitor_key_hash) VALUES (nextval('visitor_ids'), ?) RETURNING id", [hash('sha256', 'people-test')]);
    dbExec("INSERT INTO sessions (user_id, id, data) VALUES (?, 'v1', '{\"mode\": \"trainer\"}'), (?, 'v2', '{\"mode\": \"trainer\"}')", [$visitor, $visitor]);

    $people = ask($GLOBALS['app'], 'GET', '/api/admin/people', null, bearer(token_for(ADMIN)));
    assert_same(200, $people['status']);
    assert_same(['count' => 1, 'sessions' => 2], $people['body']['visitors'], 'the visitors, on a line of their own');
    $list = $people['body']['people'];
    assert_same([ADMIN, LEARNER, EDITOR, 6, 7, 4, 5], array_column($list, 'id'), 'the most recently seen first');
    assert_same(['id', 'username', 'firstSeen', 'lastSeen', 'notes', 'steps', 'sessions'], array_keys($list[1]));
    assert_same(['user' . LEARNER, 2, 1, 2], [$list[1]['username'], $list[1]['notes'], $list[1]['steps'], $list[1]['sessions']]);
    assert_same([0, 0, 0], [$list[4]['notes'], $list[4]['steps'], $list[4]['sessions']], 'signed in once: nothing');
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $list[1]['firstSeen']);
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $list[1]['lastSeen']);

    // The editor goes, whole: progress, path, sessions, the imports row, the users row.
    $others = [LEARNER => rows_of(LEARNER), 6 => rows_of(6), 7 => rows_of(7)];
    assert_same(['users' => 1, 'progress' => 1, 'path_progress' => 1, 'sessions' => 2, 'imports' => 1], rows_of(EDITOR));
    $gone = ask($GLOBALS['app'], 'DELETE', '/api/admin/people/' . EDITOR, null, bearer(token_for(ADMIN)));
    assert_same([204, ''], [$gone['status'], $gone['raw']]);
    assert_same(['users' => 0, 'progress' => 0, 'path_progress' => 0, 'sessions' => 0, 'imports' => 0], rows_of(EDITOR));
    assert_same($others, [LEARNER => rows_of(LEARNER), 6 => rows_of(6), 7 => rows_of(7)], 'nobody else touched');
    assert_same(['Iné slovo', null], [dbValue("SELECT value FROM translations WHERE key_name = ? AND language_code = 'sk'", [$key]), dbValue("SELECT updated_by FROM translations WHERE key_name = ? AND language_code = 'sk'", [$key])], 'the string they reworded stays, by nobody');
    assert_same([ADMIN, LEARNER, 6, 7, 4, 5], array_column(ask($GLOBALS['app'], 'GET', '/api/admin/people', null, bearer(token_for(ADMIN)))['body']['people'], 'id'));

    $again = ask($GLOBALS['app'], 'DELETE', '/api/admin/people/' . EDITOR, null, bearer(token_for(ADMIN)));
    assert_same([404, 'not_found'], [$again['status'], $again['body']['code'] ?? null], 'nobody with that id now');
    foreach (['abc', '-1', '1.5', str_repeat('9', 19)] as $odd) {
        assert_same(404, ask($GLOBALS['app'], 'DELETE', "/api/admin/people/$odd", null, bearer(token_for(ADMIN)))['status'], "not an id: $odd");
    }
    assert_same(404, ask($GLOBALS['app'], 'DELETE', "/api/admin/people/$visitor", null, bearer(token_for(ADMIN)))['status'], 'a visitor is nobody here');
    assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$visitor]), 'and stays');
    assert_same($others, [LEARNER => rows_of(LEARNER), 6 => rows_of(6), 7 => rows_of(7)]);

    // An administrator may delete themselves: their next request is a fresh start.
    assert_same(204, ask($GLOBALS['app'], 'DELETE', '/api/admin/people/' . ADMIN, null, bearer(token_for(ADMIN)))['status']);
    $after = ask($GLOBALS['app'], 'GET', '/api/admin/people', null, bearer(token_for(ADMIN)));
    assert_same([200, ADMIN, 0], [$after['status'], $after['body']['people'][0]['id'], $after['body']['people'][0]['notes']]);
});

test('a database behind the code: every other route says the site is being updated, and an administrator brings it up to date - one update at a time', function (): void {
    $behind = test_empty_db('behind');
    $pdo = dbConnect(machineDatabaseSettings(), $behind);
    assert_same(['001_init.sql'], names_of(test_migrate($pdo, '001_init.sql')['applied']));
    // Every file after 001: the app's own, then the library's set of the words.
    $waiting = array_slice(every_migration(), 1);
    $pending = names_of($waiting);
    $config = test_config_dir(test_auth_iam(), $behind);
    $app = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', ['PIANO_TEST_CONFIG' => $config, 'PIANO_FRONTEND_DIST' => test_frontend_build()], '/api/health');

    // The gate answers first: an administrator too is told the site is being updated, everywhere but the Migrations page's routes.
    foreach ([['GET', '/api/state'], ['GET', '/api/admin/translations'], ['DELETE', '/api/admin/languages/sk'], ['GET', '/api/admin/people']] as [$method, $url]) {
        $answer = ask($app, $method, $url, null, bearer(token_for(ADMIN)));
        assert_same([503, 'update_pending', '60'], [$answer['status'], $answer['body']['code'] ?? null, $answer['headers']['retry-after'] ?? null], "$method $url");
    }

    // The Migrations page's routes: ADMIN only, and they work on it - the pending files in the order they will run.
    $status = ask($app, 'GET', '/api/admin/migrations', null, bearer(token_for(ADMIN)))['body'];
    assert_same([['001_init.sql'], $pending, []], [names_of($status['applied']), names_of($status['pending']), $status['missing']]);
    assert_same([true], array_values(array_unique(array_column($status['pending'], 'ready'))), 'every one ready (no drafts here)');
    assert_same([false], array_values(array_unique(array_column($status['pending'], 'blocked'))));
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', (string) $status['applied'][0]['applied_at']);
    assert_same(['sql' => (string) file_get_contents(migrationsDir() . '/' . $pending[0])], array_intersect_key(ask($app, 'GET', '/api/admin/migrations/file?set=piano_academy&name=' . $pending[0], null, bearer(token_for(ADMIN)))['body'], ['sql' => 0]), 'a pending file\'s SQL');
    foreach (['GET /api/admin/migrations', 'GET /api/admin/migrations/file?set=piano_academy&name=001_init.sql', 'POST /api/admin/migrations/apply'] as $route) {
        [$method, $url] = explode(' ', $route);
        $editor = ask($app, $method, $url, null, bearer(token_for(EDITOR)));
        assert_same([403, 'forbidden', ADMIN_SENTENCE], [$editor['status'], $editor['body']['code'] ?? null, $editor['body']['error'] ?? null], "$route: an editor, in the site's own words");
        $nobody = ask($app, $method, $url, null, []);
        assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], "$route: nobody");
    }
    assert_same(['001_init.sql'], $pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN), 'an editor applied nothing');

    // Somebody else is updating (setup.php's Save, php migration.php): busy, and nothing applied.
    $other = dbConnect(machineDatabaseSettings(), $behind);
    $other->query('SELECT pg_advisory_lock(' . DATABASE_UPDATE_LOCK . ')');
    try {
        $busy = ask($app, 'POST', '/api/admin/migrations/apply', null, bearer(token_for(ADMIN)));
        assert_same([409, ['code' => 'busy', 'message' => 'Another database update is running. Nothing was applied. Wait a moment, then look again.']], [$busy['status'], $busy['body']]);
        $env = ['PIANO_TEST_CONFIG' => $config] + getenv();
        $process = proc_open([PHP_BINARY, TEST_BACKEND . '/migration.php'], [0 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]], $pipes, TEST_BACKEND, $env);
        $out = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        assert_same(1, proc_close($process), 'php migration.php waits for nobody either: ' . $out);
        assert_match('/Another update is running/', $out);
        // It names who else may hold the lock by today's names: the admin panel's Migrations page.
        assert_match("/the admin panel's Migrations page/", $out);
        assert_same(['001_init.sql'], $pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN), 'nothing was applied');
    } finally {
        $other->query('SELECT pg_advisory_unlock(' . DATABASE_UPDATE_LOCK . ')');
        $other = null;
    }

    $update = ask($app, 'POST', '/api/admin/migrations/apply', null, bearer(token_for(ADMIN)));
    assert_same([200, ['applied' => $waiting, 'failed' => null, 'error' => null, 'note' => null]], [$update['status'], $update['body']]);
    $after = ask($app, 'GET', '/api/admin/migrations', null, bearer(token_for(ADMIN)))['body'];
    assert_same([names_of(every_migration()), []], [names_of($after['applied']), $after['pending']], 'applied in order, nothing pending');
    assert_same(array_map('migrationLabel', every_migration()), $pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), 'recorded as they ran: the library\'s with its set');
    assert_same(['state' => 'ready', 'installed' => false], ask($app, 'GET', '/api/site-status', null, [])['body'], 'the site is ready again');
    assert_same(200, ask($app, 'GET', '/api/state', null, bearer(token_for(LEARNER)))['status'], 'and the app starts on it');
    assert_same(0, (int) $pdo->query("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())")->fetchColumn(), 'the lock was let go');
    assert_same([], server_problems($app));
    ($app['stop'])();
    $pdo = null;
});

test('a migration that fails: the file is named with what PostgreSQL said (as the IAM\'s page), nothing of it stays, and why is in the log too', function (): void {
    $broken = test_empty_db('broken');
    $pdo = dbConnect(machineDatabaseSettings(), $broken);
    assert_same(['001_init.sql'], names_of(test_migrate($pdo, '001_init.sql')['applied']));
    // A table 002 makes, there already in another shape: 002 stops at its first insert.
    $pdo->exec('CREATE TABLE languages (code TEXT PRIMARY KEY)');
    $app = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', ['PIANO_TEST_CONFIG' => test_config_dir(test_auth_iam(), $broken), 'PIANO_FRONTEND_DIST' => test_frontend_build()], '/api/health');

    $update = ask($app, 'POST', '/api/admin/migrations/apply', null, bearer(token_for(ADMIN)));
    assert_same(200, $update['status'], 'answered, so the page can say it');
    assert_same([], $update['body']['applied'] ?? null, 'nothing applied');
    assert_same(['set' => MIGRATIONS_SET, 'name' => '002_languages_and_translations.sql'], $update['body']['failed'] ?? null, 'the file it stopped at');
    // PostgreSQL's own words, with the statement it refused - as the IAM's Migrations page shows them.
    assert_match('/^statement \d+ of \d+: SQLSTATE\[42703\]: .*column "name" of relation "languages" does not exist/', (string) ($update['body']['error'] ?? ''), 'what PostgreSQL said');
    assert_true(str_contains((string) ($update['body']['error'] ?? ''), 'INSERT INTO languages (code, name, native_name, sort_order) VALUES'), 'and the statement\'s first lines');
    assert_same(['001_init.sql'], $pdo->query('SELECT filename FROM migrations')->fetchAll(PDO::FETCH_COLUMN));
    assert_same(0, (int) $pdo->query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'translation_keys'")->fetchColumn(), 'nothing of 002 stayed');
    assert_same('002_languages_and_translations.sql', ask($app, 'GET', '/api/admin/migrations', null, bearer(token_for(ADMIN)))['body']['pending'][0]['name'] ?? null, 'still pending');
    assert_match('/\[db\] the migration 002_languages_and_translations\.sql failed: statement \d+ of \d+:/', (string) file_get_contents($app['log']), 'why, in the log');
    ($app['stop'])();
    $pdo = null;
});

test('the server said nothing it should not have', function (): void {
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[auth] token refused')));
    assert_same([], $problems);
});
