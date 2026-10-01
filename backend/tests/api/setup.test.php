<?php

// setup.php on your own computer (PHP's built-in server, asked by a local
// name): no token but a nonce, it stays and runs again, it never shows a
// password back, it offers no sign-in and the old progress - and its Test
// connection buttons. Its settings folder is this test's own, so your
// config/*.local.php are never touched.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

$GLOBALS['site'] = null;
$GLOBALS['config'] = null;
$GLOBALS['database'] = null;
$GLOBALS['iam'] = null;
$GLOBALS['nonce'] = null;

before(function (): void {
    // An empty settings folder, with a copy of the old progress files where
    // setup.php looks for them when the tests' settings are in use.
    $config = test_temp_dir('setup-config');
    mkdir("$config/server-data");
    foreach (glob(dirname(TEST_BACKEND) . '/server/data/*.json') ?: [] as $file) {
        copy($file, "$config/server-data/" . basename($file));
    }
    $GLOBALS['config'] = $config;
    $GLOBALS['database'] = test_empty_db('setup');
    $GLOBALS['site'] = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', [
        'PIANO_TEST_CONFIG' => $config,
        'PIANO_FRONTEND_DIST' => test_frontend_build(),
    ], '/setup.php');

    $keys = test_temp_dir('fake-iam');
    file_put_contents("$keys/key.json", json_encode(test_keys()));
    $port = test_free_port();
    $GLOBALS['iam'] = test_start_server(TEST_BACKEND . '/tests/tools', TEST_BACKEND . '/tests/tools/fake-iam.php', [
        'FAKE_IAM_DIR' => $keys, 'FAKE_IAM_ISSUER' => "http://127.0.0.1:$port",
    ], '/.well-known/openid-configuration', $port);
});

function page(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['site']['base'], $method, $url, $body, $headers);
}

/** The form as filled in: this test's database, sign-in off, the old progress in. */
function fields(array $extra = []): array
{
    $server = machineDatabaseSettings();

    return $extra + [
        'nonce' => (string) $GLOBALS['nonce'],
        'db_host' => (string) $server['host'], 'db_port' => (string) $server['port'], 'db_name' => (string) $GLOBALS['database'],
        'db_user' => (string) $server['user'], 'db_password' => (string) $server['password'],
        'auth_mode' => 'none', 'local_user_id' => '1', 'issuer' => $GLOBALS['iam']['base'], 'client_id' => 'piano-academy',
        'import_old' => 'on',
    ];
}

function with_cookie(): array
{
    return ['Cookie: piano_setup_nonce=' . $GLOBALS['nonce']];
}

function saved(string $name): ?array
{
    $file = $GLOBALS['config'] . "/$name.local.php";

    return is_file($file) ? require $file : null;
}

test('on this computer: no token, a nonce, sign-in off by default, and the old progress offered', function (): void {
    $first = page('GET', '/setup.php');
    assert_same(200, $first['status']);
    assert_match('/<h1>Set up Piano Academy<\/h1>/', $first['raw']);
    assert_same('noindex, nofollow', $first['headers']['x-robots-tag'] ?? null);
    assert_no_match('/name="token"/', $first['raw'], 'no token to ask for');
    assert_true(preg_match('/name="nonce" value="([0-9a-f]{32})"/', $first['raw'], $m) === 1, 'a nonce in the form');
    assert_same($m[1], $first['cookies']['piano_setup_nonce'] ?? null, 'and the same one in a cookie');
    assert_match('/SameSite=Strict/i', $first['headers']['set-cookie'] ?? '');
    $GLOBALS['nonce'] = $m[1];
    assert_match('/name="auth_mode" value="none" checked/', $first['raw'], 'no sign-in is the choice here');
    assert_match('/name="import_old" checked/', $first['raw'], 'the old progress is offered');
    assert_match('/Test the database/', $first['raw']);
    assert_match('/Test the IAM/', $first['raw']);
    assert_match('~<script src="setup\.php\?asset=js">~', $first['raw'], 'the buttons\' script is a file, not inline');
    $script = page('GET', '/setup.php?asset=js');
    assert_match('~javascript~', $script['headers']['content-type'] ?? '');
    assert_match('/data-test/', $script['raw']);
});

test('Test connection: the database and the IAM, without saving anything', function (): void {
    $test = static fn(string $what, array $extra = [], bool $cookie = true): array => call_form(
        $GLOBALS['site']['base'], "/setup.php?test=$what", fields($extra), [], $cookie ? with_cookie() : []
    );

    $good = $test('database');
    assert_same(200, $good['status']);
    assert_same(true, $good['body']['ok'], (string) ($good['body']['message'] ?? ''));
    assert_match('/it is empty - Save makes the tables/', $good['body']['message']);
    $wrong = $test('database', ['db_password' => 'not-the-password']);
    assert_same(false, $wrong['body']['ok']);
    assert_match('/Cannot connect/', $wrong['body']['message']);
    assert_same(false, $test('database', ['db_name' => 'piano_academy'])['body']['ok'], 'with the tests\' settings, never the real database');

    $iam = $test('iam');
    assert_same(true, $iam['body']['ok'], (string) ($iam['body']['message'] ?? ''));
    assert_match('/Found the IAM at http:\/\/127\.0\.0\.1:\d+ with 1 signing key\./', $iam['body']['message']);
    $gone = $test('iam', ['issuer' => 'http://127.0.0.1:' . test_free_port()]);
    assert_same(false, $gone['body']['ok']);
    assert_match('/No answer from/', $gone['body']['message']);
    $notIam = $test('iam', ['issuer' => $GLOBALS['site']['base']]);
    assert_same(false, $notIam['body']['ok'], 'this app is not an IAM');
    assert_match('/https:\/\//', $test('iam', ['issuer' => 'http://iam.example.test'])['body']['message'], 'plain http only for localhost');

    // What a browser sends: its own form under the page's no-referrer policy says Origin: null -
    // fine with the nonce; a page elsewhere names itself, and is refused even with it.
    $null = call_form($GLOBALS['site']['base'], '/setup.php?test=database', fields(), [], array_merge(with_cookie(), ['Origin: null']));
    assert_same(true, $null['body']['ok'] ?? null, 'Origin: null with the nonce');
    $foreign = call_form($GLOBALS['site']['base'], '/setup.php?test=database', fields(), [], array_merge(with_cookie(), ['Origin: https://evil.example']));
    assert_same(403, $foreign['status'], 'another site, nonce or not');

    $refused = $test('database', [], false);
    assert_same(403, $refused['status'], 'without the nonce cookie');
    assert_same(403, call_form($GLOBALS['site']['base'], '/setup.php?test=database', fields(['nonce' => str_repeat('0', 32)]), [], with_cookie())['status'], 'with a nonce that is not the cookie\'s');
    assert_same(null, saved('database'), 'nothing was saved');
});

test('Save without the nonce changes nothing', function (): void {
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields());
    assert_match('/This page was out of date/', $answer['raw']);
    assert_same(null, saved('database'));
    assert_same(null, saved('auth'));
});

test('Save: the settings, the tables, the old progress - and the page stays', function (): void {
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(), [], with_cookie());
    assert_match('/<h1>Saved<\/h1>/', $answer['raw']);
    assert_no_match('/<script/', $answer['raw'], 'a finished page has nothing to script');
    assert_match('/Made the tables \(001_init\.sql, 002_/', $answer['raw']);
    assert_match('/Sign-in is off: the app answers this computer only, as IAM user 1\./', $answer['raw']);
    $notes = count(json_decode((string) file_get_contents($GLOBALS['config'] . '/server-data/progress.json'), true));
    $sessions = count(json_decode((string) file_get_contents($GLOBALS['config'] . '/server-data/sessions.json'), true));
    assert_match("/Brought in your old progress from server\/data\/: $notes notes, \d+ path steps, $sessions sessions\./", $answer['raw']);

    assert_same((string) machineDatabaseSettings()['password'], saved('database')['password']);
    assert_same($GLOBALS['database'], saved('database')['name']);
    assert_same(['mode' => 'none', 'local_user_id' => 1], array_intersect_key(saved('auth'), ['mode' => 1, 'local_user_id' => 1]));
    assert_true(is_file(TEST_BACKEND . '/setup.php'), 'it did not delete itself');
    assert_false(is_file($GLOBALS['config'] . '/storage/installed.lock'), 'no lock on this computer');

    // the app runs on what was just saved
    $state = page('GET', '/api/state');
    assert_same(200, $state['status']);
    assert_same($notes, count($state['body']['progress']));
    assert_same($sessions, count($state['body']['sessions']));
});

test('Run again: what is saved is shown, never the password - and saving keeps it and imports nothing twice', function (): void {
    $again = page('GET', '/setup.php', null, with_cookie());
    assert_match('/This copy is set up/', $again['raw']);
    assert_match('/id="db_name" name="db_name" type="text" value="' . $GLOBALS['database'] . '"/', $again['raw']);
    assert_match('/id="db_password" name="db_password" type="password"\s+placeholder="saved - leave empty to keep it"/', $again['raw']);
    assert_no_match('/name="db_password"[^>]*value=/', $again['raw'], 'the password is never shown back');

    $saved = page('GET', '/api/state')['raw'];
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(['db_password' => '']), [], with_cookie());
    assert_match('/<h1>Saved<\/h1>/', $answer['raw']);
    assert_match('/The tables were up to date/', $answer['raw']);
    assert_match('/was brought in before; it is not brought in twice/', $answer['raw']);
    assert_same((string) machineDatabaseSettings()['password'], saved('database')['password'], 'an empty password field keeps the saved one');
    assert_same($saved, page('GET', '/api/state')['raw'], 'the progress as it was');
});

test('asked by another name, it is a real host: the token, not the nonce', function (): void {
    $port = parse_url($GLOBALS['site']['base'], PHP_URL_PORT);
    $host = ["Host: rebound.example:$port"];
    $page = page('GET', '/setup.php', null, $host);
    assert_match('/<h1>Install Piano Academy<\/h1>/', $page['raw']);
    assert_match('/name="token"/', $page['raw']);
    assert_true(is_file($GLOBALS['config'] . '/storage/setup-token.php'), 'the token, in the test\'s own storage');
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(), [], array_merge($host, with_cookie()));
    assert_match('/That is not the token/', $answer['raw'], 'the nonce is no token');
    assert_same(403, call_form($GLOBALS['site']['base'], '/setup.php?test=database', fields(), [], array_merge($host, with_cookie()))['status']);
    assert_false(is_file(TEST_BACKEND . '/storage/setup-token.php'), 'nothing written into backend/storage/');
    $relayed = page('GET', '/setup.php', null, ['X-Forwarded-For: 203.0.113.9']);
    assert_match('/<h1>Install Piano Academy<\/h1>/', $relayed['raw'], 'relayed by a proxy: a real host');
});

test('no PHP problem in the server log', function (): void {
    assert_same([], server_problems($GLOBALS['site']));
});
