<?php

// config/config.php: the settings come from the two *.local.php files and
// nowhere else - without them the app is not set up, a committed file can
// never stand in for them, and the tests' own folder is only ever for a
// throwaway database. The one committed default: where a request comes from
// (Cloudflare's published ranges, the family's list), which the optional
// visitors.local.php may override.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

/** $fn with PIANO_TEST_CONFIG pointing at $dir, then the file's own folder again. */
function with_config_dir(string $dir, callable $fn): mixed
{
    putenv("PIANO_TEST_CONFIG=$dir");
    localSettings(true);
    try {
        return $fn();
    } finally {
        putenv('PIANO_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
}

function good_database(): array
{
    return ['host' => '127.0.0.1', 'port' => 5432, 'name' => 'piano_test_config', 'user' => 'postgres', 'password' => ''];
}

/** What PHP's error log received while $fn ran (settingsSaid()'s lines). */
function config_log_of(callable $fn): string
{
    $log = (string) tempnam(sys_get_temp_dir(), 'piano-config-');
    $was = ini_set('error_log', $log);
    try {
        $fn();
    } finally {
        ini_set('error_log', (string) $was);
    }
    $text = (string) file_get_contents($log);
    @unlink($log);

    return $text;
}

test('without the *.local.php files the app is not set up, and says which one is missing', function (): void {
    $dir = test_temp_dir('empty-config');
    assert_same('config/database.local.php is missing.', with_config_dir($dir, 'settingsProblem'));
    assert_throws(static fn() => with_config_dir($dir, 'databaseSettings'), '/database\.local\.php is missing/');
    assert_throws(static fn() => with_config_dir($dir, 'authSettings'), '/missing/');

    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(good_database(), true) . ';');
    assert_same('config/auth.local.php is missing.', with_config_dir($dir, 'settingsProblem'));

    file_put_contents("$dir/auth.local.php", '<?php return ' . var_export(test_auth_settings(), true) . ';');
    assert_same(null, with_config_dir($dir, 'settingsProblem'));
    assert_same(TEST_ISSUER, with_config_dir($dir, 'authSettings')['issuer']);
});

test('a settings file from before sign-in was the IAM only - a mode, an owner\'s id - is still a setting, and only its IAM is read', function (): void {
    foreach (['none', 'iam', 'off'] as $mode) {
        $dir = test_temp_dir('old-config');
        file_put_contents("$dir/database.local.php", '<?php return ' . var_export(good_database(), true) . ';');
        file_put_contents("$dir/auth.local.php", '<?php return ' . var_export(['mode' => $mode, 'local_user_id' => 1] + test_auth_settings(), true) . ';');
        assert_same(null, with_config_dir($dir, 'settingsProblem'), "mode '$mode': the owner's installation keeps working");
        assert_same(
            ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'login_required' => true, 'sign_in_available' => true],
            with_config_dir($dir, static fn (): array => \Anotoki\Lib\Auth\Http\AuthRoutes::configBody(signInRule(), iamClient())),
            "mode '$mode' signs in through the IAM"
        );
    }
    // ... but a mode "none" without the IAM is no setting at all - nothing would let anybody in.
    $dir = test_temp_dir('none-only');
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(good_database(), true) . ';');
    file_put_contents("$dir/auth.local.php", '<?php return ' . var_export(['mode' => 'none', 'local_user_id' => 1], true) . ';');
    assert_match('/issuer/', (string) with_config_dir($dir, 'settingsProblem'));

    // An IAM over plain http across a network is no setting either: the keys tokens are checked with come from there
    // (the family's library refuses one) - http only on this computer, as in development.
    $dir = test_temp_dir('plain-http');
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(good_database(), true) . ';');
    foreach (['http://iam.example.test' => true, 'http://192.168.1.20:4300' => true, 'http://localhost:4300' => false, 'http://127.0.0.1:8597' => false, 'https://iam.anotoki.eu' => false] as $issuer => $refused) {
        file_put_contents("$dir/auth.local.php", '<?php return ' . var_export(['issuer' => $issuer] + test_auth_settings(), true) . ';');
        $problem = with_config_dir($dir, 'settingsProblem');
        assert_same($refused, $problem !== null && str_contains($problem, 'over https'), "$issuer: " . ($problem ?? 'a setting'));
    }
});

test('a settings file that does not say what it must is no setting', function (): void {
    $bad = [
        'no host' => [['host' => ''] + good_database(), test_auth_settings(), '/database server/'],
        'a port that is no number' => [['port' => 'five'] + good_database(), test_auth_settings(), '/port/'],
        'a port out of range' => [['port' => 70000] + good_database(), test_auth_settings(), '/port/'],
        'an odd database name' => [['name' => 'piano academy'] + good_database(), test_auth_settings(), '/database name/'],
        'no user' => [['user' => ''] + good_database(), test_auth_settings(), '/user/'],
        'no password key at all' => [array_diff_key(good_database(), ['password' => 1]), test_auth_settings(), '/password/'],
        'no issuer' => [good_database(), ['client_id' => 'piano-academy', 'cache_dir' => 'storage/cache'], '/issuer/'],
        'an issuer that is no address' => [good_database(), ['issuer' => 'iam.anotoki.eu'] + test_auth_settings(), '/issuer/'],
        'no client id' => [good_database(), ['client_id' => ''] + test_auth_iam(), '/client id/'],
        'no cache folder' => [good_database(), ['cache_dir' => ''] + test_auth_iam(), '/cache_dir/'],
        'a file that returns nothing' => [good_database(), null, '/issuer/'],
    ];
    foreach ($bad as $what => [$database, $auth, $pattern]) {
        $dir = test_temp_dir('bad-config');
        file_put_contents("$dir/database.local.php", '<?php return ' . var_export($database, true) . ';');
        file_put_contents("$dir/auth.local.php", $auth === null ? '<?php // nothing' : '<?php return ' . var_export($auth, true) . ';');
        assert_match($pattern, (string) with_config_dir($dir, 'settingsProblem'), $what);
    }
});

test('a settings file PHP cannot run is no setting: the problem names the file, the kind of error and the line - never what PHP said, which may quote the password', function (): void {
    $dir = test_temp_dir('broken-config');
    // A quote too many in the password: PHP's own message would quote what follows it.
    file_put_contents("$dir/database.local.php", "<?php return [\n    'host' => '127.0.0.1', 'port' => 5432, 'name' => 'piano_test_config', 'user' => 'postgres',\n    'password' => 'open'sesame-and-more',\n];\n");
    file_put_contents("$dir/auth.local.php", '<?php return ' . var_export(test_auth_settings(), true) . ';');
    $log = config_log_of(static function () use ($dir): void {
        assert_same('config/database.local.php could not be read (ParseError on line 3).', with_config_dir($dir, 'settingsProblem'));
        assert_throws(static fn() => with_config_dir($dir, 'databaseSettings'), '/^config\/database\.local\.php could not be read/');
    });
    assert_true(str_contains($log, '[config] config/database.local.php could not be read (ParseError on line 3): the site is not set up until it is mended.'), 'said in the log by its kind and line: ' . $log);
    assert_false(str_contains($log, 'sesame') || str_contains($log, 'unexpected'), 'never what PHP said');

    // The other file, cut short; and one that throws as it runs.
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(good_database(), true) . ';');
    file_put_contents("$dir/auth.local.php", "<?php\nreturn ['issuer' => 'http://localhost:4300', 'client_id' => 'piano-academy',\n");
    assert_match('/^config\/auth\.local\.php could not be read \(ParseError on line \d+\)\.$/', (string) with_config_dir($dir, 'settingsProblem'));
    file_put_contents("$dir/auth.local.php", "<?php\nthrow new RuntimeException('sesame');\n");
    assert_same('config/auth.local.php could not be read (RuntimeException on line 2).', with_config_dir($dir, 'settingsProblem'));
    assert_false(str_contains((string) with_config_dir($dir, 'settingsProblem'), 'sesame'), 'nothing of the file in the sentence');
});

test('a settings file that prints as PHP reads it - no <?php line, a byte-order mark or a line before it, text after a closing tag - is no setting: nothing of it is printed, the password least of all, and the problem says how many bytes, never what', function (): void {
    $password = 'sesame-' . bin2hex(random_bytes(8));
    $database = var_export(['password' => $password] + good_database(), true);
    foreach ([
        'no <?php line' => "return {$database};\n",
        'a byte-order mark' => "\xEF\xBB\xBF<?php return {$database};\n",
        'a byte-order mark and no <?php line' => "\xEF\xBB\xBFreturn {$database};\n",
        'a line before its <?php' => "\n<?php return {$database};\n",
        'text after a closing tag' => "<?php \$kept = 1; ?>\n{$password}\n<?php return {$database};\n",
    ] as $case => $contents) {
        $dir = test_temp_dir('printing-config');
        file_put_contents("$dir/database.local.php", $contents);
        file_put_contents("$dir/auth.local.php", '<?php return ' . var_export(test_auth_settings(), true) . ';');
        $level = ob_get_level();
        ob_start();
        try {
            $log = config_log_of(static function () use ($dir, $case): void {
                assert_match('/^config\/database\.local\.php prints \d+ bytes of its own \(/', (string) with_config_dir($dir, 'settingsProblem'), $case);
                assert_throws(static fn() => with_config_dir($dir, 'databaseSettings'), '/^config\/database\.local\.php prints \d+ bytes/');
            });
        } finally {
            $printed = (string) ob_get_clean();
        }
        assert_same('', $printed, "$case: nothing of the file printed");
        assert_same($level, ob_get_level(), "$case: no buffer left open");
        assert_false(str_contains((string) with_config_dir($dir, 'settingsProblem'), $password), "$case: nothing of the file in the sentence");
        assert_true(str_contains($log, '[config] config/database.local.php prints '), "$case: said in the log by its bytes - " . $log);
        assert_false(str_contains($log, $password), "$case: never the password in the log");
    }

    // The sign-in's file the same: not set up, nothing printed.
    $dir = test_temp_dir('printing-auth');
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(good_database(), true) . ';');
    file_put_contents("$dir/auth.local.php", "\xEF\xBB\xBF<?php return " . var_export(test_auth_settings(), true) . ';');
    ob_start();
    try {
        $problem = (string) with_config_dir($dir, 'settingsProblem');
    } finally {
        $printed = (string) ob_get_clean();
    }
    assert_same(['config/auth.local.php prints 3 bytes of its own (no <?php line, a byte-order mark or a line before it, or text after its closing tag).', ''], [$problem, $printed]);
});

test('nothing committed stands in for the settings: config/ holds the loader and nothing else', function (): void {
    $committed = array_values(array_filter(
        array_map('basename', glob(TEST_BACKEND . '/config/*') ?: []),
        static fn(string $name): bool => !str_ends_with($name, '.local.php')
    ));
    assert_same(['config.php'], $committed, 'no template with working values beside the loader');
    $ignored = (string) file_get_contents(dirname(TEST_BACKEND) . '/.gitignore');
    // (A checkout on Windows may have the file with CRLF line endings.)
    assert_match('~^backend/config/\*\.local\.php\r?$~m', $ignored, 'git ignores the settings files');
});

test('the tests\' settings folder is honoured only for a piano_test_ database', function (): void {
    $dir = test_temp_dir('not-a-test-db');
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(['name' => 'piano_academy'] + good_database(), true) . ';');
    file_put_contents("$dir/auth.local.php", '<?php return ' . var_export(test_auth_settings(), true) . ';');
    assert_match('/only for the tests/', (string) with_config_dir($dir, 'settingsProblem'));
    assert_throws(static fn() => with_config_dir($dir, 'databaseSettings'), '/only for the tests/');
});

test('the settings files: written for their owner only, and read again at once', function (): void {
    $dir = test_temp_dir('write-config');
    with_config_dir($dir, static function (): void {
        writeLocalConfig('database', ['password' => "it's \$ecret"] + good_database());
        assert_same('config/auth.local.php is missing.', settingsProblem(), 'read again after writing');
        writeLocalConfig('auth', test_auth_settings());
        assert_same(null, settingsProblem());
        assert_same(TEST_CLIENT, authSettings()['client_id']);
        assert_same("it's \$ecret", databaseSettings()['password']);
    });
    $values = require "$dir/database.local.php";
    assert_same("it's \$ecret", $values['password']);
    if (PHP_OS_FAMILY !== 'Windows') {
        assert_same('0600', substr(sprintf('%o', fileperms("$dir/database.local.php")), -4), 'readable by its owner only');
    }
    assert_same("$dir/storage", with_config_dir($dir, 'storageDir'), 'the tests write at run time inside their own folder');
});

test('the committed default of where a request comes from: Cloudflare\'s published ranges - the anotoki family\'s list - each one a range taken', function (): void {
    // The site is behind Cloudflare (the owner's decision of 2026-10-11): config/config.php holds its ranges, which a
    // computer or host that is not behind it overrides in visitors.local.php. They are the library's list, range for range.
    assert_same(\Anotoki\Lib\Support\ClientAddress::CLOUDFLARE, CLIENT_ADDRESS_TRUSTED_PROXIES);
    assert_same([15, 7], [
        count(array_filter(CLIENT_ADDRESS_TRUSTED_PROXIES, static fn (string $range): bool => !str_contains($range, ':'))),
        count(array_filter(CLIENT_ADDRESS_TRUSTED_PROXIES, static fn (string $range): bool => str_contains($range, ':'))),
    ], '15 IPv4 ranges, 7 IPv6');
    assert_same(CLIENT_ADDRESS_TRUSTED_PROXIES, array_values(array_filter(CLIENT_ADDRESS_TRUSTED_PROXIES, 'clientAddressRangeTaken')), 'none of them a catch-all');
    // The header is no setting: CF-Connecting-IP, pinned in code (api/client_address.php).
    assert_false(defined('CLIENT_ADDRESS_DEFAULTS'), 'no committed setting of a header');
});
