<?php

// The rules of api/auth.php that an HTTP test from this computer cannot
// reach: what counts as this computer (setup.php's no-token mode, and nothing
// else), the sign-in settings the browser reads, a person's roles, which
// Authorization header is a sign-in, where the IAM's keys are cached - and
// that no test asks an IAM that is not on this computer.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

/** $fn with these sign-in settings in force, then the file's own again. */
function with_auth(array $auth, callable $fn): mixed
{
    $file = $GLOBALS['TEST_CONFIG_DIR'] . '/auth.local.php';
    $before = require $file;
    file_put_contents($file, '<?php return ' . var_export(test_offline_auth($auth), true) . ";\n");
    localSettings(true);
    try {
        return $fn();
    } finally {
        file_put_contents($file, '<?php return ' . var_export(test_offline_auth($before), true) . ";\n");
        localSettings(true);
    }
}

test('this computer: 127.x.x.x, ::1 and the IPv4-mapped 127 - nothing else', function (): void {
    foreach (['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1', '::FFFF:127.0.0.1'] as $ip) {
        assert_true(isLoopback($ip), $ip);
    }
    foreach (['', '10.0.0.1', '192.168.1.20', '::ffff:10.0.0.1', 'localhost', '127.0.0.1.example.com', '1127.0.0.1', '::2', 'fe80::1'] as $ip) {
        assert_false(isLoopback($ip), $ip);
    }
});

test('this computer asking (the setup without its token): only the built-in server, only from here, and only by a local name', function (): void {
    foreach (['127.0.0.1:8300', 'localhost:4500', 'LOCALHOST', '127.0.0.1', '[::1]:8300'] as $host) {
        assert_true(isThisComputer('cli-server', '127.0.0.1', $host), "Host: $host");
    }
    assert_true(isThisComputer('cli-server', '::1', 'localhost:8300'));
    assert_false(isThisComputer('cli-server', '192.168.1.20', '127.0.0.1:8300'), 'somebody on the network');
    foreach (['evil.example:8300', 'piano.anotoki.eu', '127.0.0.1.evil.example', '', 'localhost.evil.example:8300'] as $host) {
        assert_false(isThisComputer('cli-server', '127.0.0.1', $host), "Host: '$host' - a page elsewhere pointing its name at this computer");
    }
    assert_false(isThisComputer('cli-server', '127.0.0.1', 'localhost:8300', true), 'relayed by a proxy on this computer');
    assert_true(wasForwarded(['HTTP_X_FORWARDED_FOR' => '203.0.113.9']));
    assert_true(wasForwarded(['HTTP_FORWARDED' => 'for=203.0.113.9']));
    assert_false(wasForwarded(['HTTP_HOST' => 'localhost', 'HTTP_X_FORWARDED_FOR' => '']));
    foreach (['apache2handler', 'cgi-fcgi', 'fpm-fcgi', 'litespeed', 'cli'] as $sapi) {
        assert_false(isThisComputer($sapi, '127.0.0.1', '127.0.0.1'), "$sapi: a hosted site, where a proxy makes every request look local");
    }
    // Nothing of the old "no sign-in" is left to call. (Today's requireOwner(),
    // in meddleware/auth.php, is another one: a person, else a visitor.)
    foreach (['authMode', 'authLocalUserId', 'noLoginAllowed', 'requestUserId'] as $gone) {
        assert_false(function_exists($gone), "$gone() is gone");
    }
    assert_false(defined('OWNER_ROLE'), 'and so is OWNER_ROLE');
});

test('the browser\'s sign-in settings: the IAM, whatever an old file says about a mode - and the IAM\'s switch', function (): void {
    assert_same(
        ['issuer' => 'https://iam.example.test', 'clientId' => 'piano-academy', 'loginRequired' => true],
        with_auth(test_auth_iam(['issuer' => 'https://iam.example.test/']), 'authPublicConfig'),
        'no trailing slash'
    );
    foreach (['none', 'iam', 'off', ''] as $mode) {
        assert_same(
            ['issuer' => TEST_ISSUER, 'clientId' => 'piano-academy', 'loginRequired' => true],
            with_auth(['mode' => $mode, 'local_user_id' => 1] + test_auth_iam(), 'authPublicConfig'),
            "mode = '$mode' is passed over"
        );
    }
    $off = test_auth_iam();
    test_login_required($off, false);
    assert_same(false, with_auth($off, 'authLoginRequired'), 'the IAM switched sign-in off');
    // What reaches the SDK: the tests' seams and the two times, nothing else of the file's.
    $keys = static function (array $config): array {
        $keys = array_keys($config);
        sort($keys);

        return $keys;
    };
    $config = with_auth(test_auth_iam(['application_ttl' => 1, 'application_timeout' => 3, 'mode' => 'none']), 'authIamConfig');
    assert_same(['application_file', 'application_timeout', 'application_ttl', 'cache_dir', 'client_id', 'issuer', 'jwks_file'], $keys($config));
    assert_same([1, 3], [$config['application_ttl'], $config['application_timeout']]);
    $plain = with_auth(['issuer' => 'http://127.0.0.1:9', 'client_id' => 'piano-academy', 'cache_dir' => 'storage/cache', 'application_ttl' => '1', 'jwks_file' => ''], 'authIamConfig');
    assert_same(['cache_dir', 'client_id', 'issuer'], $keys($plain), 'a time that is no number, an empty file name: left to the SDK\'s defaults');
});

test('only the Bearer scheme is a sign-in: another scheme is nobody, "Bearer" without a token a 401', function (): void {
    $request = static fn(string $header) => (new \Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('GET', '/api/state')->withHeader('Authorization', $header);
    foreach (['Basic YWRtaW46YWRtaW4=', 'Digest username="a"', 'Bearerx', 'Token abc'] as $header) {
        assert_same(null, requestUser($request($header)), "$header: no sign-in, nobody - never a 401 of its own");
    }
    assert_same(null, requestUser((new \Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('GET', '/api/state')), 'no header');
    foreach (['Bearer', 'Bearer ', 'bearer   ', ' Bearer'] as $header) {
        try {
            requestUser($request($header));
            fail("'$header' should be refused");
        } catch (ApiError $e) {
            assert_same([401, 'sign_in_required'], [$e->status, $e->errorCode], "'$header'");
        }
    }
    try {
        requestUser($request('Bearer not.a.token'));
        fail('a token that does not check out should be refused');
    } catch (ApiError $e) {
        assert_same([401, 'invalid_token'], [$e->status, $e->errorCode], 'never nobody');
    }
});

test('no test asks an IAM that is not on this computer whether sign-in is required', function (): void {
    // Settings a test hands to the app: the IAM's answer as a file, or an IAM on this computer.
    foreach (['https://iam.anotoki.eu', TEST_ISSUER, 'http://localhost.evil.example:4300', 'http://10.0.0.1:4300', ''] as $issuer) {
        assert_throws(static fn() => test_offline_auth(['issuer' => $issuer, 'client_id' => TEST_CLIENT, 'cache_dir' => 'storage/cache']), '/would ask the IAM/');
        assert_throws(static fn() => test_write_config(test_temp_dir('refused'), [], ['issuer' => $issuer, 'client_id' => TEST_CLIENT]), '/would ask the IAM/');
    }
    foreach (['http://127.0.0.1:8597', 'http://localhost:4300', 'http://[::1]:8100'] as $issuer) {
        assert_same($issuer, test_offline_auth(['issuer' => $issuer])['issuer'], "$issuer: the stand-in, on this computer");
    }
    assert_true(is_string(test_offline_auth(['issuer' => 'https://iam.anotoki.eu', 'application_file' => test_application_file()])['application_file']), 'the answer as a file');
    foreach ([test_auth_settings(), test_auth_iam(), test_auth_iam(['issuer' => 'https://iam.example.test'])] as $auth) {
        assert_true(is_file($auth['application_file']), 'the tests\' own settings name the answer as a file');
    }
    assert_true(is_file((require $GLOBALS['TEST_CONFIG_DIR'] . '/auth.local.php')['application_file'] ?? ''), 'and so does the settings file this process loaded');

    // Every write of an auth.local.php under tests/ - straight into one, or
    // into a variable naming one - puts its settings through
    // test_offline_auth(), or writes test_auth_settings() (the answer as a
    // file, above) - but in two files: config.test.php also writes settings
    // with no IAM at all (no setting: never served, never asked anything), and
    // testenv.php is the browser check's tool, not a test (its IAM is the
    // stand-in on this computer unless told otherwise).
    $unchecked = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(TEST_BACKEND . '/tests', FilesystemIterator::SKIP_DOTS)) as $file) {
        $text = str_ends_with($file->getFilename(), '.php') ? (string) file_get_contents($file->getPathname()) : '';
        preg_match_all('/(\$\w+) = [^;]*auth\.local\.php[\'"];/', $text, $named);
        $targets = array_merge(['[^;]*auth\.local\.php'], array_map(static fn(string $name): string => preg_quote($name, '/') . '\b', $named[1]));
        preg_match_all('/file_put_contents\((?:' . implode('|', $targets) . ')[^;]*;/', $text, $writes);
        foreach ($writes[0] as $write) {
            if (!str_contains($write, 'test_offline_auth(') && !str_contains($write, 'test_auth_settings()')) {
                $unchecked[] = str_replace('\\', '/', substr($file->getPathname(), strlen(TEST_BACKEND) + 1));
            }
        }
    }
    $unchecked = array_values(array_unique($unchecked));
    sort($unchecked);
    assert_same(['tests/tools/testenv.php', 'tests/unit/config.test.php'], $unchecked, 'no other test writes sign-in settings around the check');
});

test('roles: the token\'s, this application\'s; the staff are EDITOR and ADMIN; MEMBER is a learner', function (): void {
    assert_same(['ADMIN', 'EDITOR'], ROLES_STAFF);
    $admin = new SiteUser(1, 'ada', [ROLE_ADMIN]);
    $editor = new SiteUser(2, null, [ROLE_EDITOR]);
    $learner = new SiteUser(3, 'lea', []);
    $member = new SiteUser(4, 'mia', ['MEMBER']);
    assert_true($admin->has(...ROLES_STAFF) && $admin->has(ROLE_ADMIN));
    assert_true($editor->has(...ROLES_STAFF));
    assert_false($editor->has(ROLE_ADMIN), 'an editor is no administrator');
    assert_false($learner->has(...ROLES_STAFF), 'a learner has neither');
    assert_false($member->has(...ROLES_STAFF), 'MEMBER - every account holds it - is a learner: none of them');
    assert_false($admin->has(), 'no role asked for: none had');
    // The SDK reads the claim: a list of names, in any case; anything else is no role.
    assert_same(['ADMIN', 'EDITOR'], anotoki_iam_roles(['roles' => ['admin', 'EDITOR', 'Admin', '', 5]]));
    foreach (['a text' => 'ADMIN', 'null' => null, 'a map' => ['ADMIN' => true]] as $what => $claim) {
        assert_false((new SiteUser(5, null, anotoki_iam_roles(['roles' => $claim])))->has(ROLE_ADMIN), $what);
    }
});

test('the IAM\'s key cache: a relative cache_dir is relative to backend/', function (): void {
    assert_same(PIANO_BACKEND . '/storage/cache', with_auth(test_auth_iam(['cache_dir' => 'storage/cache']), static fn(): string => authIamConfig()['cache_dir']));
    $absolute = test_temp_dir('cache');
    assert_same($absolute, with_auth(test_auth_iam(['cache_dir' => $absolute]), static fn(): string => authIamConfig()['cache_dir']));
});

test('textClip keeps whole characters', function (): void {
    assert_same('Žlu', textClip('Žluťoučký', 3));
    assert_same('abc', textClip('abc', 10));
});
