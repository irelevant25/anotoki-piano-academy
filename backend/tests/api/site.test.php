<?php

// Where the site stands, and the one way it behaves while it is not ready -
// the anotoki family's (anotoki/lib's SiteGate, SiteState and
// MigrationsRoutes::status(), set up in api/index.php and api/migrations.php),
// through the real server, state by state:
//
// - not set up, never installed: every path but GET /api/site-status answers
//   503 not_set_up with the setup page's address;
// - not set up once installed (storage/installed.lock): the same 503 - never
//   the setup page again;
// - an update waiting: 503 update_pending with Retry-After everywhere but the
//   open paths - the sign-in settings, the words, the health check and the
//   Migrations page's routes, so somebody can sign in, the pages have their
//   words and an administrator reaches Apply - and nothing of anybody's is
//   read or written; Apply makes the site ready again;
// - the database out of reach: nothing held at the gate, the routes answer
//   as they always did (503 database_unavailable);
// - ready: everything as usual.
//
// In every one of them GET /api/site-status answers 200 {state, installed} -
// to anybody, however they ask (askers(): nobody while the IAM requires a
// sign-in, a visitor's key, a token that does not verify...), with the IAM's
// switch on or off or the IAM out of reach, and with a settings file PHP
// cannot run (not set up): the pages read it to know what to say, and a 401
// or a 500 there would have them say "not available right now" instead.
//
// And the error log (anotoki-lib 0.5.0's rule, no exclusion of this app's):
// an answer that says a state - not_set_up, update_pending - is not written,
// however often it comes; a 503 that is a failure - the database out of
// reach - is.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const PERSON = 4;
const ADMIN = 1;

const BEING_UPDATED = 'The site is being updated. Try again in a few minutes.';

/** The real server on the settings in $config (a folder of the test's own). */
function server_on(string $config, string $ready = '/api/site-status'): array
{
    return test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', ['PIANO_TEST_CONFIG' => $config, 'PIANO_FRONTEND_DIST' => test_frontend_build()], $ready);
}

/**
 * Every kind of route there is, as [method, path, body]: the progress (a person's or a visitor's), the own
 * file, the move, the admin panel's - and an address that is no route.
 */
function held_routes(): array
{
    return [
        ['GET', '/api/state', null],
        ['PUT', '/api/progress', new stdClass()],
        ['PUT', '/api/path', ['steps' => new stdClass()]],
        ['POST', '/api/sessions', ['mode' => 'trainer']],
        ['GET', '/api/me/export', null],
        ['POST', '/api/me/import', ['format' => 'piano-academy-export']],
        ['POST', '/api/visitor/move', null],
        ['GET', '/api/admin/languages', null],
        ['PUT', '/api/admin/translations', ['values' => new stdClass()]],
        ['GET', '/api/admin/people', null],
        ['DELETE', '/api/admin/people/1', null],
        ['GET', '/api/admin/audit', null],
        ['GET', '/api/admin/feedback', null],
        ['POST', '/api/feedback', ['kind' => 'idea', 'message' => 'x']],
        ['POST', '/api/client-errors', ['message' => 'x']],
        ['GET', '/api/nope', null],
    ];
}

/**
 * Whoever asks, however: nobody (while the IAM requires a sign-in - the tests'
 * IAM says it does), a visitor's key, a token that does not verify, one that
 * ran out, a password file's Basic header (a host behind one). The pages ask
 * where the site stands before anybody can be signed in - and a page that read
 * a 401 or a 503 here would say "not available right now" instead of the right
 * thing - so the status looks at none of it.
 */
function askers(): array
{
    return [
        'nobody' => [],
        'a visitor\'s key' => ['X-Visitor-Key: ' . str_repeat('A', 43)],
        'a token that does not verify' => bearer('not.a.token'),
        'a token that ran out' => bearer(test_token(PERSON, [], ['exp' => time() - 3600])),
        'a password file\'s Basic header' => ['Authorization: Basic ' . base64_encode('owner:secret')],
    ];
}

/** The error log's lines of a server on the settings in $config (its storage/logs), as [status, code] pairs. */
function logged(string $config): array
{
    $lines = [];
    foreach (glob("$config/storage/logs/errors-*.jsonl") ?: [] as $file) {
        foreach (preg_split('/\R/', (string) file_get_contents($file)) as $line) {
            $entry = json_decode($line, true);
            if (is_array($entry)) {
                $lines[] = [(int) ($entry['status'] ?? 0), $entry['code'] ?? null];
            }
        }
    }

    return $lines;
}

/** GET /api/site-status asked by each of askers(): 200 and {state, installed} to every one, never kept by a cache. */
function assert_status_to_everybody(string $base, array $expected): void
{
    foreach (askers() as $who => $headers) {
        $status = call($base, 'GET', '/api/site-status', null, $headers);
        assert_same([200, $expected], [$status['status'], $status['body']], "the status, asked by $who");
        assert_same('no-store', $status['headers']['cache-control'] ?? null, "the status, asked by $who: never cached");
    }
}

test('not set up and never installed: every path but the status is 503 not_set_up with the setup page - the status says so, and nothing more', function (): void {
    $config = test_temp_dir('not-set-up');
    $app = server_on($config);

    assert_status_to_everybody($app['base'], ['state' => 'not_set_up', 'installed' => false]);

    $expected = ['code' => 'not_set_up', 'installed' => false, 'message' => 'This site is not set up yet. Its setup page connects it to its database.', 'setup' => '/setup.php'];
    foreach (
        array_merge(held_routes(), [
            ['GET', '/api/auth/config', null],
            ['GET', '/api/health', null],
            ['GET', '/api/translations/en', null],
            ['GET', '/api/admin/migrations', null],
            ['POST', '/api/admin/migrations/apply', null],
        ])
        as [$method, $url, $body]
    ) {
        $answer = call($app['base'], $method, $url, $body, bearer(test_token(ADMIN, [ROLE_ADMIN])));
        assert_same([503, $expected], [$answer['status'], $answer['body']], "$method $url");
        assert_same('application/json; charset=utf-8', $answer['headers']['content-type'] ?? null, "$method $url");
        assert_same('nosniff', $answer['headers']['x-content-type-options'] ?? null, 'inside the security headers');
        assert_false(isset($answer['headers']['retry-after']), 'no time to wait for: somebody has to set it up');
    }
    assert_match('/Set up Piano Academy/', call($app['base'], 'GET', '/setup.php')['raw'], 'the page the answer names');
    assert_same(200, call($app['base'], 'GET', '/')['status'], 'the app itself loads, to say so');
    assert_same([], server_problems($app));
    assert_same([], array_values(array_filter(logged($config), static fn(array $line): bool => $line[1] === 'not_set_up')), 'a state, never a line of the error log');
});

test('not set up once installed (storage/installed.lock): the same 503, never the setup page again - only "not available right now"', function (): void {
    $config = test_temp_dir('installed');
    mkdir("$config/storage");
    file_put_contents("$config/storage/installed.lock", '{"installedAt":"2026-10-07T10:00:00.000Z"}' . "\n");
    $app = server_on($config);

    assert_status_to_everybody($app['base'], ['state' => 'not_set_up', 'installed' => true]);
    foreach ([['GET', '/api/auth/config', null], ['GET', '/api/state', null], ['GET', '/api/translations/sk', null], ['GET', '/api/admin/migrations', null]] as [$method, $url, $body]) {
        $answer = call($app['base'], $method, $url, $body);
        assert_same(
            [503, ['code' => 'not_set_up', 'installed' => true, 'message' => 'The site is not available right now. Try again in a few minutes.']],
            [$answer['status'], $answer['body']],
            "$method $url",
        );
    }
    assert_same([], server_problems($app));
});

test('a settings file PHP cannot run: not set up - the status still answers, never a 500, and nothing else runs', function (): void {
    $config = test_write_config(test_temp_dir('broken'), ['name' => dbName()] + machineDatabaseSettings(), test_auth_iam());
    file_put_contents("$config/database.local.php", "<?php\nreturn ['host' => \n");
    $app = server_on($config);

    assert_status_to_everybody($app['base'], ['state' => 'not_set_up', 'installed' => false]);
    foreach ([['GET', '/api/auth/config'], ['GET', '/api/state'], ['GET', '/api/translations/en']] as [$method, $url]) {
        $answer = call($app['base'], $method, $url);
        assert_same([503, 'not_set_up', '/setup.php'], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['setup'] ?? null], "$method $url");
    }
    assert_same([], server_problems($app), 'no PHP error on any path');
    $log = (string) file_get_contents($app['log']);
    assert_match(
        '~\[config\] config/database\.local\.php could not be read \(ParseError on line \d+\): the site is not set up until it is mended\.~',
        $log,
        'the log says which file, the kind and where',
    );
    assert_same(1, substr_count($log, '[config] config/database.local.php could not be read'), 'once, though every request reads it');
});

test(
    'a database.local.php saved with a byte-order mark and without its <?php line, its password in it, is never printed - nor one with a byte-order mark or a blank line before <?php declare(strict_types=1), which PHP cannot even compile: no answer carries the password or PHP\'s words - the status the pages read, the pages, the setup page -, none is a 500, and the site says it is not set up',
    function (): void {
        $config = test_write_config(test_temp_dir('printing'), ['name' => dbName()] + machineDatabaseSettings(), test_auth_iam());
        $password = 'sesame-' . bin2hex(random_bytes(12));
        $settings = "['host' => '127.0.0.1', 'port' => 5432, 'name' => '" . dbName() . "', 'user' => 'postgres', 'password' => '$password']";
        $app = server_on($config);

        foreach (
            [
                // Without its <?php line every byte of the file is text to PHP, printed as PHP reads it - ahead of the answer
                // and its headers, on every request, unless it is never required (settingsFileReadCleanly()).
                'a byte-order mark and no <?php line' => "\xEF\xBB\xBFreturn $settings;\n",
                // Required, either is a compile-time fatal error that nothing catches ("strict_types declaration must be the
                // very first statement"): every answer a 500, the status the pages read included - so neither is ever
                // compiled.
                'a byte-order mark before <?php declare(strict_types=1)' => "\xEF\xBB\xBF<?php declare(strict_types=1);\n\nreturn $settings;\n",
                'a blank line before <?php declare(strict_types=1)' => "\n<?php declare(strict_types=1);\n\nreturn $settings;\n",
            ]
            as $case => $file
        ) {
            file_put_contents("$config/database.local.php", $file);
            assert_status_to_everybody($app['base'], ['state' => 'not_set_up', 'installed' => false]);
            $paths = [
                ['GET', '/api/site-status'],
                ['GET', '/api/auth/config'],
                ['GET', '/api/state'],
                ['GET', '/api/translations/en'],
                ['GET', '/api/health'],
                ['PUT', '/api/progress'],
                ['GET', '/'],
                ['GET', '/stats'],
                ['GET', '/setup.php'],
            ];
            foreach ($paths as [$method, $url]) {
                $answer = call($app['base'], $method, $url);
                $seen = $answer['raw'] . "\n" . implode("\n", $answer['headers']);
                assert_false(str_contains($seen, $password) || str_contains($seen, 'sesame') || str_contains($answer['raw'], "\xEF\xBB\xBF"), "$case, $method $url: nothing of the file in the answer");
                assert_false(str_contains($seen, 'strict_types'), "$case, $method $url: nor PHP's words about it");
                if ($url === '/api/site-status') {
                    assert_same([200, ['state' => 'not_set_up', 'installed' => false]], [$answer['status'], $answer['body']], "$case: the status the pages read: not set up - never a 500");
                } elseif (str_starts_with($url, '/api/')) {
                    assert_same(
                        [503, 'not_set_up', '/setup.php'],
                        [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['setup'] ?? null],
                        "$case, $method $url: not set up, the setup page named - never a 500",
                    );
                } else {
                    assert_same(200, $answer['status'], "$case, $method $url");
                }
            }
            assert_match(
                '~config/database\.local\.php does not start with &lt;\?php~',
                call($app['base'], 'GET', '/setup.php')['raw'],
                "$case: the setup page on this computer says which file and its fault - never what it holds",
            );
        }
        assert_same([], server_problems($app), 'no PHP warning and no fatal error - nothing went out ahead of the headers, nothing of the files was compiled');
        $log = (string) file_get_contents($app['log']);
        assert_same(
            1,
            substr_count($log, '[config] config/database.local.php does not start with <?php'),
            'the log says which file and its fault, once, though every request of the three files reads it: ' . $log,
        );
        assert_false(str_contains($log, $password) || str_contains($log, 'sesame'), 'and never the password');
        assert_false(str_contains($log, 'strict_types'), 'never compiled: no fatal error in the log either');
    },
);

test('an update waiting: 503 update_pending everywhere but the open paths - which answer, so somebody can sign in and an administrator applies it', function (): void {
    $name = test_empty_db('waiting');
    $pdo = dbConnect(machineDatabaseSettings(), $name);
    // Everything but the newest migration: the words' tables are there, and so is an update to apply - the app's
    // newest, and the library's sets of the words and the people after it (its admin tools' set ran first).
    $newest = migrationFiles()[count(migrationFiles()) - 1];
    assert_same(null, test_migrate_before($pdo, $newest)['failed']);
    $waiting = array_values(array_filter(every_migration(), static fn(array $file): bool => $file['set'] === MIGRATIONS_SET ? $file['name'] === $newest : $file['set'] !== 'anotoki_admin'));
    $config = test_config_dir(test_auth_iam(), $name);
    $app = server_on($config);

    // Asked by anybody - the tests' IAM requires a sign-in, and nobody is signed in.
    assert_status_to_everybody($app['base'], ['state' => 'update_pending', 'installed' => false]);

    // Held: whoever asks - a person, an administrator, a visitor's key, nobody - and whatever the address.
    $who = ['a person' => bearer(test_token(PERSON)), 'an administrator' => bearer(test_token(ADMIN, [ROLE_ADMIN])), 'a visitor\'s key' => ['X-Visitor-Key: ' . str_repeat('A', 43)], 'nobody' => []];
    foreach (held_routes() as [$method, $url, $body]) {
        foreach ($who as $whom => $headers) {
            $answer = call($app['base'], $method, $url, $body, array_merge($headers, [GENERATION_HEADER . ': 1']));
            assert_same([503, ['code' => 'update_pending', 'message' => BEING_UPDATED], '60'], [$answer['status'], $answer['body'], $answer['headers']['retry-after'] ?? null], "$method $url, $whom");
            assert_same('no-store', $answer['headers']['cache-control'] ?? null);
        }
    }
    // Paths that only look like open ones are held too.
    foreach (
        [
            '/api/auth/config/x',
            '/api/health/x',
            '/api/translations/en/x',
            '/api/translations',
            '/api/admin/migrationsx',
            '/api/HEALTH',
            '/api/admin/migrations/../state',
            '/api/admin/migrations/%2e%2e/state',
            '/api/admin/migrations/x',
            '/api/admin/migrations/apply/x',
        ]
        as $url
    ) {
        assert_same([503, 'update_pending'], [($answer = call($app['base'], 'GET', $url))['status'], $answer['body']['code'] ?? null], $url);
    }
    assert_same(
        [0, 0, 0],
        [
            (int) $pdo->query('SELECT count(*) FROM users')->fetchColumn(),
            (int) $pdo->query('SELECT count(*) FROM progress')->fetchColumn(),
            (int) $pdo->query('SELECT count(*) FROM sessions')->fetchColumn(),
        ],
        'nobody looked up or recorded, nothing saved',
    );
    assert_same([], array_values(array_filter(logged($config), static fn(array $line): bool => $line[1] === 'update_pending')), 'some ninety answers that say a state: never a line of the error log');

    // Open: the sign-in settings (signing in works while an update waits), the words, the health check...
    $signIn = call($app['base'], 'GET', '/api/auth/config');
    assert_same([200, ['issuer', 'client_id', 'login_required', 'sign_in_available']], [$signIn['status'], array_keys((array) $signIn['body'])]);
    $words = call($app['base'], 'GET', '/api/translations/sk');
    assert_same([200, 'sk'], [$words['status'], $words['body']['language'] ?? null], 'the words the database has');
    assert_true(count((array) ($words['body']['values'] ?? [])) > 100, 'all of them');
    assert_same(304, call($app['base'], 'GET', '/api/translations/sk', null, ['If-None-Match: ' . ($words['headers']['etag'] ?? '')])['status'], 'and the browser\'s copy answered in a few bytes');
    assert_same(
        ['ok' => true, 'database' => $name, 'pending' => array_map('migrationLabel', $waiting)],
        call($app['base'], 'GET', '/api/health?from=test')['body'],
        'its query is no part of the path',
    );
    // ...and the Migrations page's routes - for an ADMIN, by the token's roles; anybody else as ever.
    $list = call($app['base'], 'GET', '/api/admin/migrations', null, bearer(test_token(ADMIN, [ROLE_ADMIN])));
    assert_same([200, $waiting], [$list['status'], array_map(static fn(array $file): array => ['set' => $file['set'], 'name' => $file['name']], $list['body']['pending'])]);
    assert_same([403, 'forbidden'], [($editor = call($app['base'], 'GET', '/api/admin/migrations', null, bearer(test_token(7, [ROLE_EDITOR]))))['status'], $editor['body']['code'] ?? null]);
    assert_same([401, 'sign_in_required'], [($nobody = call($app['base'], 'POST', '/api/admin/migrations/apply'))['status'], $nobody['body']['code'] ?? null]);
    assert_same($waiting, databaseMigrator($pdo)->applicable(), 'nothing applied by them');

    // Applied: the site is ready, and the routes answer as ever.
    $apply = call($app['base'], 'POST', '/api/admin/migrations/apply', null, bearer(test_token(ADMIN, [ROLE_ADMIN])));
    assert_same([200, $waiting, null], [$apply['status'], $apply['body']['applied'], $apply['body']['failed']]);
    assert_status_to_everybody($app['base'], ['state' => 'ready', 'installed' => false]);
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer(test_token(PERSON)))['status']);
    assert_same(['ok' => true, 'database' => $name, 'pending' => []], call($app['base'], 'GET', '/api/health')['body']);
    assert_same([], server_problems($app));
    $pdo = null;
});

test('the database out of reach: unavailable - nothing is held at the gate, and the routes answer as they always did', function (): void {
    // Settings that name a database nobody made: the server answers, the database does not.
    $config = test_write_config(test_temp_dir('unreachable'), ['name' => dbName() . '_never_made'] + machineDatabaseSettings(), test_auth_iam());
    $app = server_on($config, '/');

    assert_status_to_everybody($app['base'], ['state' => 'unavailable', 'installed' => false]);
    assert_same(['issuer', 'client_id', 'login_required', 'sign_in_available'], array_keys((array) call($app['base'], 'GET', '/api/auth/config')['body']), 'what needs no database answers');
    $state = call($app['base'], 'GET', '/api/state', null, bearer(test_token(PERSON)));
    assert_same([503, ['error' => 'The database is not reachable right now.', 'code' => 'database_unavailable']], [$state['status'], $state['body']], 'the app\'s own answer, as before');
    assert_true(in_array([503, 'database_unavailable'], logged($config), true), 'a 503 that is a failure is a line of the error log: ' . test_show(logged($config)));
});

test('ready: the status says so to anybody - sign-in required or not, the IAM in reach or not - and every route answers as usual', function (): void {
    $auth = test_auth_iam();
    $app = start_app($auth);
    // The IAM requires a sign-in (the tests' IAM says so) and nobody is signed in: a person's route refuses them, the status answers.
    $nobody = call($app['base'], 'GET', '/api/state');
    assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], 'the switch is on');
    assert_status_to_everybody($app['base'], ['state' => 'ready', 'installed' => false]);
    // Not required: the same.
    test_login_required($auth, false);
    assert_same(200, call($app['base'], 'GET', '/api/state')['status'], 'the switch is off: nobody is a visitor');
    assert_status_to_everybody($app['base'], ['state' => 'ready', 'installed' => false]);
    // The IAM out of reach - nothing answers at its address, so asked whether a sign-in is required the app fails
    // closed: the status asks it nothing.
    $offline = start_app(test_auth_iam(['issuer' => 'http://127.0.0.1:1', 'application_file' => null]));
    assert_same(true, call($offline['base'], 'GET', '/api/auth/config')['body']['login_required'] ?? null, 'the IAM out of reach: a sign-in is required');
    assert_status_to_everybody($offline['base'], ['state' => 'ready', 'installed' => false]);

    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer(test_token(PERSON)))['status']);
    assert_same(404, call($app['base'], 'GET', '/api/nope')['status']);
    assert_same(405, call($app['base'], 'POST', '/api/site-status')['status'], 'the status is only read');
    assert_same([], array_values(array_filter(server_problems($app), static fn(string $line): bool => !str_contains($line, '[anotoki auth] token refused'))));
});
