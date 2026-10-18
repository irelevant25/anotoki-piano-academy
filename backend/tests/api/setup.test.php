<?php

// setup.php on your own computer (PHP's built-in server, asked by a local
// name): no token but a nonce, it stays and runs again, it never shows a
// password back - and it asks for the database and the IAM, nothing else
// (no sign-in mode, no owner's id, no old progress). Its Test connection
// answers in the family's words; its Save takes the database update's lock.
// Its settings folder is this test's own, so your config/*.local.php are
// never touched.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

$GLOBALS['site'] = null;
$GLOBALS['config'] = null;
$GLOBALS['database'] = null;
$GLOBALS['iam'] = null;
$GLOBALS['nonce'] = null;

before(function (): void {
    $config = test_temp_dir('setup-config');
    $GLOBALS['config'] = $config;
    $GLOBALS['database'] = test_empty_db('setup');
    $GLOBALS['site'] = test_start_server(
        TEST_BACKEND,
        TEST_BACKEND . '/router.php',
        [
            'PIANO_TEST_CONFIG' => $config,
            'PIANO_FRONTEND_DIST' => test_frontend_build(),
        ],
        '/setup.php',
    );

    // The family's stand-in IAM (anotoki/lib's php/testing/stand-in-iam.php), on a free port of this computer.
    $GLOBALS['iam'] = stand_in_iam();
});

function page(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['site']['base'], $method, $url, $body, $headers);
}

/** The form as filled in: this test's database and the stand-in IAM. */
function fields(array $extra = []): array
{
    $server = machineDatabaseSettings();

    return $extra + [
        'nonce' => (string) $GLOBALS['nonce'],
        'db_host' => (string) $server['host'],
        'db_port' => (string) $server['port'],
        'db_name' => (string) $GLOBALS['database'],
        'db_user' => (string) $server['user'],
        'db_password' => (string) $server['password'],
        'issuer' => $GLOBALS['iam']->issuer,
        'client_id' => 'piano-academy',
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

/** The names of a page's form fields, in order. */
function field_names(string $html): array
{
    preg_match_all('/<input [^>]*name="([a-z_]+)"/', $html, $m);

    return $m[1];
}

/** The value a page's text field shows. */
function shown(string $html, string $name): ?string
{
    return preg_match('/id="' . $name . '" name="' . $name . '" type="text" value="([^"]*)"/', $html, $m) ? html_entity_decode($m[1], ENT_QUOTES) : null;
}

test('on this computer: no token, a nonce - and only the database and the IAM, with the family\'s defaults', function (): void {
    $first = page('GET', '/setup.php');
    assert_same(200, $first['status']);
    assert_match('/<h1>Set up Piano Academy<\/h1>/', $first['raw']);
    assert_same('noindex, nofollow', $first['headers']['x-robots-tag'] ?? null);
    assert_true(preg_match('/name="nonce" value="([0-9a-f]{32})"/', $first['raw'], $m) === 1, 'a nonce in the form');
    assert_same($m[1], $first['cookies']['piano_setup_nonce'] ?? null, 'and the same one in a cookie');
    assert_match('/SameSite=Strict/i', $first['headers']['set-cookie'] ?? '');
    $GLOBALS['nonce'] = $m[1];

    assert_same(
        ['nonce', 'db_host', 'db_port', 'db_name', 'db_user', 'db_password', 'issuer', 'client_id'],
        field_names($first['raw']),
        'exactly these: no token here, no sign-in mode, no owner\'s id, no old progress, no file',
    );
    assert_no_match('/auth_mode|local_user_id|import_old|name="owner"|type="file"|enctype|server\/data|Your IAM user id/', $first['raw']);
    assert_same(
        ['127.0.0.1', '5432', 'anotoki_piano', 'postgres', 'http://localhost:4300', 'piano-academy'],
        array_map(static fn(string $name): ?string => shown($first['raw'], $name), ['db_host', 'db_port', 'db_name', 'db_user', 'issuer', 'client_id']),
        'the family\'s defaults',
    );
    assert_match('/sign-in through the anotoki IAM/', $first['raw']);
    assert_match('/Test the database/', $first['raw']);
    assert_match('/Test the IAM/', $first['raw']);
    assert_match('~<script src="setup\.php\?asset=js">~', $first['raw'], 'the buttons\' script is a file, not inline');
    $script = page('GET', '/setup.php?asset=js');
    assert_match('~javascript~', $script['headers']['content-type'] ?? '');
    assert_match('/data-test/', $script['raw']);
    assert_no_match('/auth_mode/', $script['raw']);
});

test('Test connection: the database and the IAM in the family\'s words, without saving anything', function (): void {
    $test = static fn(string $what, array $extra = [], bool $cookie = true): array => call_form($GLOBALS['site']['base'], "/setup.php?test=$what", fields($extra), [], $cookie ? with_cookie() : []);

    $good = $test('database');
    assert_same(200, $good['status']);
    assert_same([true, 'Connected to the database "' . $GLOBALS['database'] . '": it is empty - Save makes the tables.'], [$good['body']['ok'], $good['body']['message']]);
    $missing = $GLOBALS['database'] . '_not_there';
    assert_same([true, 'Connected to the server. The database "' . $missing . '" does not exist yet - Save creates it.'], array_values($test('database', ['db_name' => $missing])['body']));
    $wrong = $test('database', ['db_password' => 'not-the-password']);
    assert_same(false, $wrong['body']['ok']);
    assert_match('/^Cannot connect: /', $wrong['body']['message']);
    assert_no_match('/SQLSTATE/', $wrong['body']['message'], 'without the driver\'s noise');
    assert_same(false, $test('database', ['db_name' => 'anotoki_piano_academy'])['body']['ok'], 'with the tests\' settings, never a real database');

    // A database with the first migration only: the updates to apply, counted.
    $behind = test_empty_db('setup_behind');
    $pdo = dbConnect(machineDatabaseSettings(), $behind);
    assert_same([...admin_migrations(), ['set' => MIGRATIONS_SET, 'name' => '001_init.sql']], test_migrate($pdo, '001_init.sql')['applied']);
    $pdo = null;
    // Every file after those: the app's own, and the library's sets of the words and the people.
    $count = count(every_migration()) - count(admin_migrations()) - 1;
    assert_same([true, 'Connected to the database "' . $behind . '": ' . $count . ' update(s) to apply - Save applies them.'], array_values($test('database', ['db_name' => $behind])['body']));

    // The two sentences a test here cannot bring about without a login of its own: word for word in the page.
    $source = (string) file_get_contents(TEST_BACKEND . '/setup.php');
    assert_true(
        str_contains($source, "'Connected to the server, but there is no database \"' . \$db['name'] . '\" and this user may not create one. Make it in the hosting panel first.'"),
        'may not create one',
    );
    assert_true(str_contains($source, "'The server is there, but \"' . \$db['user'] . '\" cannot open the database \"' . \$db['name'] . '\": '"), 'cannot open it');

    $iam = $test('iam');
    assert_same(true, $iam['body']['ok'], (string) ($iam['body']['message'] ?? ''));
    assert_match('/^Found the IAM at http:\/\/127\.0\.0\.1:\d+ with 1 signing key\. Make sure it knows this app as "piano-academy"\.$/', $iam['body']['message']);
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

test('Save while another database update runs: it waits for nothing and writes nothing', function (): void {
    // Somebody else holds the update's lock on that database (php migration.php, an administrator in the app).
    $other = dbConnect(machineDatabaseSettings(), $GLOBALS['database']);
    $other->query('SELECT pg_advisory_lock(' . DATABASE_UPDATE_LOCK . ')');
    try {
        $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(), [], with_cookie());
        assert_match('/Another database update is running/', $answer['raw']);
        assert_same(null, saved('database'), 'no settings');
        assert_same(0, (int) $other->query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")->fetchColumn(), 'and no table');
    } finally {
        $other->query('SELECT pg_advisory_unlock(' . DATABASE_UPDATE_LOCK . ')');
        $other = null;
    }
});

test('Save: the settings - the IAM and nothing else - and the tables; the page stays', function (): void {
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(), [], with_cookie());
    assert_match('/<h1>Saved<\/h1>/', $answer['raw']);
    assert_no_match('/<script/', $answer['raw'], 'a finished page has nothing to script');
    assert_match('~Made the tables \(anotoki_admin/001_audit_log\.sql, anotoki_admin/002_feedback\.sql, 001_init\.sql, 002_~', $answer['raw'], 'the library\'s admin tools\' set first');
    assert_match(
        '/People sign in through the IAM at http:\/\/127\.0\.0\.1:\d+, where this app is &quot;piano-academy&quot;\. Who may reword its words \(EDITOR\) and administer it \(ADMIN\) is set there/',
        $answer['raw'],
    );
    assert_no_match('/Sign-in is off|old progress|server\/data/', $answer['raw']);
    assert_match('~<a href="http://localhost:4500/">~', $answer['raw'], 'where sign-in works: the address the IAM knows');

    assert_same((string) machineDatabaseSettings()['password'], saved('database')['password']);
    assert_same($GLOBALS['database'], saved('database')['name']);
    assert_same(['issuer' => $GLOBALS['iam']->issuer, 'client_id' => 'piano-academy', 'cache_dir' => 'storage/cache'], saved('auth'), 'exactly these three');
    assert_true(is_file(TEST_BACKEND . '/setup.php'), 'it did not delete itself');
    assert_false(is_file($GLOBALS['config'] . '/storage/installed.lock'), 'no lock on this computer');

    // the app runs on what was just saved - and asks everybody to sign in. The
    // IAM's answer whether it must is given as a file: asked for real, the
    // answer would be kept in the saved cache_dir, backend/storage/cache - the
    // developer's own (tests/api/auth.test.php asks the stand-in, in a folder of its own) - and so would the people's
    // scrub's hour: a cache folder of the test's own.
    file_put_contents(
        $GLOBALS['config'] . '/auth.local.php',
        '<?php return ' .
            var_export(test_offline_auth(['cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file(), 'anonymized_file' => test_anonymized_file()] + saved('auth')), true) .
            ";\n",
    );
    assert_same(['ok' => true, 'database' => $GLOBALS['database'], 'pending' => []], page('GET', '/api/health')['body']);
    assert_same(['issuer' => $GLOBALS['iam']->issuer, 'client_id' => 'piano-academy', 'login_required' => true, 'sign_in_available' => true], page('GET', '/api/auth/config')['body']);
    assert_same(401, page('GET', '/api/state')['status']);
    assert_same(
        [true, 'Connected to the database "' . $GLOBALS['database'] . '": it is up to date.'],
        array_values(call_form($GLOBALS['site']['base'], '/setup.php?test=database', fields(), [], with_cookie())['body']),
    );
});

test('Run again: what is saved is shown, never the password - and a save over an old file drops its mode and owner', function (): void {
    $again = page('GET', '/setup.php', null, with_cookie());
    assert_match('/This copy is set up/', $again['raw']);
    assert_same($GLOBALS['database'], shown($again['raw'], 'db_name'), 'the saved name, not the default');
    assert_same($GLOBALS['iam']->issuer, shown($again['raw'], 'issuer'));
    assert_match('/id="db_password" name="db_password" type="password"\s+placeholder="saved - leave empty to keep it"/', $again['raw']);
    assert_no_match('/name="db_password"[^>]*value=/', $again['raw'], 'the password is never shown back');

    // The owner's file from before: a sign-in mode and an owner's id beside the IAM.
    file_put_contents($GLOBALS['config'] . '/auth.local.php', '<?php return ' . var_export(test_offline_auth(['mode' => 'none', 'local_user_id' => 1] + saved('auth')), true) . ";\n");
    assert_match('/This copy is set up/', page('GET', '/setup.php', null, with_cookie())['raw'], 'still set up with it');
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(['db_password' => '']), [], with_cookie());
    assert_match('/<h1>Saved<\/h1>/', $answer['raw']);
    assert_match('/The tables were up to date/', $answer['raw']);
    assert_same((string) machineDatabaseSettings()['password'], saved('database')['password'], 'an empty password field keeps the saved one');
    assert_same(['issuer', 'client_id', 'cache_dir'], array_keys(saved('auth')), 'the mode and the owner\'s id are gone');
});

test('asked by another name, it is a real host: the token, not the nonce - and nothing saved is shown', function (): void {
    $port = parse_url($GLOBALS['site']['base'], PHP_URL_PORT);
    $host = ["Host: rebound.example:$port"];
    $page = page('GET', '/setup.php', null, $host);
    assert_match('/<h1>Install Piano Academy<\/h1>/', $page['raw']);
    assert_same(['token', 'db_host', 'db_port', 'db_name', 'db_user', 'db_password', 'issuer', 'client_id'], field_names($page['raw']));
    assert_same(
        ['localhost', '5432', 'anotoki_piano', '', '', 'piano-academy'],
        array_map(static fn(string $name): ?string => shown($page['raw'], $name), ['db_host', 'db_port', 'db_name', 'db_user', 'issuer', 'client_id']),
        'the defaults, never what is saved',
    );
    assert_false(str_contains($page['raw'], $GLOBALS['database']) || str_contains($page['raw'], $GLOBALS['iam']->issuer), 'the saved database and IAM are not shown to a visitor');
    assert_true(is_file($GLOBALS['config'] . '/storage/setup-token.php'), 'the token, in the test\'s own storage');
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(), [], array_merge($host, with_cookie()));
    assert_match('/That is not the token/', $answer['raw'], 'the nonce is no token');
    assert_same(403, call_form($GLOBALS['site']['base'], '/setup.php?test=database', fields(), [], array_merge($host, with_cookie()))['status']);
    assert_false(is_file(TEST_BACKEND . '/storage/setup-token.php'), 'nothing written into backend/storage/');
    $relayed = page('GET', '/setup.php', null, ['X-Forwarded-For: 203.0.113.9']);
    assert_match('/<h1>Install Piano Academy<\/h1>/', $relayed['raw'], 'relayed by a proxy: a real host');
});

test('a settings file PHP cannot run: the page opens and says which - never a PHP error - and Save writes it anew', function (): void {
    // Edited by hand and broken: the app is not set up (tests/api/site.test.php), and this page is the way back.
    file_put_contents($GLOBALS['config'] . '/database.local.php', "<?php\nreturn ['host' => '127.0.0.1', 'password' => 'it's',\n];\n");
    $page = page('GET', '/setup.php', null, with_cookie());
    assert_same(200, $page['status']);
    assert_match('/The saved settings are not complete: config\/database\.local\.php could not be read \(ParseError on line 2\)\./', $page['raw']);
    assert_no_match('/it\'s|unexpected/', $page['raw'], 'nothing of the file, nor what PHP said');
    $answer = call_form($GLOBALS['site']['base'], '/setup.php', fields(), [], with_cookie());
    assert_match('/<h1>Saved<\/h1>/', $answer['raw']);
    assert_same([$GLOBALS['database'], (string) machineDatabaseSettings()['password']], [saved('database')['name'], saved('database')['password']], 'written anew');
    assert_match('/This copy is set up/', page('GET', '/setup.php', null, with_cookie())['raw'], 'and set up again');
});

test('no PHP problem in the server log', function (): void {
    assert_same([], server_problems($GLOBALS['site']));
});
