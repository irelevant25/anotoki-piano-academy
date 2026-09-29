<?php

// The rules of api/auth.php that an HTTP test from this computer cannot
// reach: no login only under PHP's built-in server and only for this
// computer, and any mode that is not exactly "none" needs a login.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

/** $fn with these sign-in settings in force, then the file's own again. */
function with_auth(array $auth, callable $fn): mixed
{
    $file = $GLOBALS['TEST_CONFIG_DIR'] . '/auth.local.php';
    $before = (string) file_get_contents($file);
    file_put_contents($file, '<?php return ' . var_export($auth, true) . ";\n");
    localSettings(true);
    try {
        return $fn();
    } finally {
        file_put_contents($file, $before);
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

test('no login answers only the built-in server, only this computer, and only by a local name', function (): void {
    foreach (['127.0.0.1:8300', 'localhost:4500', 'LOCALHOST', '127.0.0.1', '[::1]:8300'] as $host) {
        assert_true(noLoginAllowed('cli-server', '127.0.0.1', $host), "Host: $host");
    }
    assert_true(noLoginAllowed('cli-server', '::1', 'localhost:8300'));
    assert_false(noLoginAllowed('cli-server', '192.168.1.20', '127.0.0.1:8300'), 'somebody on the network');
    foreach (['evil.example:8300', 'piano.anotoki.eu', '127.0.0.1.evil.example', '', 'localhost.evil.example:8300'] as $host) {
        assert_false(noLoginAllowed('cli-server', '127.0.0.1', $host), "Host: '$host' - a page elsewhere pointing its name at this computer");
    }
    assert_false(noLoginAllowed('cli-server', '127.0.0.1', 'localhost:8300', true), 'relayed by a proxy on this computer');
    assert_true(wasForwarded(['HTTP_X_FORWARDED_FOR' => '203.0.113.9']));
    assert_true(wasForwarded(['HTTP_FORWARDED' => 'for=203.0.113.9']));
    assert_false(wasForwarded(['HTTP_HOST' => 'localhost', 'HTTP_X_FORWARDED_FOR' => '']));
    foreach (['apache2handler', 'cgi-fcgi', 'fpm-fcgi', 'litespeed', 'cli'] as $sapi) {
        assert_false(noLoginAllowed($sapi, '127.0.0.1', '127.0.0.1'), "$sapi: a hosted site, where a proxy makes every request look local");
    }
});

test('any mode but exactly "none" needs a login', function (): void {
    foreach (['none' => 'none', 'iam' => 'iam', 'NONE' => 'iam', 'off' => 'iam', 'false' => 'iam', ' none' => 'iam'] as $setting => $mode) {
        assert_same($mode, with_auth(['mode' => $setting] + test_auth_iam(), 'authMode'), "mode = '$setting'");
    }
    assert_same(['mode' => 'none'], with_auth(test_auth_none(), 'authPublicConfig'));
    assert_same(
        ['mode' => 'iam', 'issuer' => 'https://iam.example.test', 'clientId' => 'piano-academy'],
        with_auth(test_auth_iam(['issuer' => 'https://iam.example.test/']), 'authPublicConfig'),
        'no trailing slash'
    );
    // A mode meant as "off" but spelled otherwise asks for the IAM - and
    // without one configured, the app is simply not set up.
    assert_match('/issuer/', (string) with_auth(['mode' => 'off', 'local_user_id' => 1], 'settingsProblem'));
});

test('the owner\'s id must be a real IAM user id', function (): void {
    assert_same(7, with_auth(test_auth_none(7), 'authLocalUserId'));
    foreach ([0, -3, '0', 'x'] as $bad) {
        assert_match('/local_user_id/', (string) with_auth(['local_user_id' => $bad] + test_auth_none(), 'settingsProblem'), "local_user_id = " . var_export($bad, true));
    }
    assert_throws(static function (): void {
        with_auth(['local_user_id' => -3] + test_auth_iam(), 'authLocalUserId');
    }, '/local_user_id/');
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
