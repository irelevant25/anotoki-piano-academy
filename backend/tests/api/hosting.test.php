<?php

// The hosted site, as far as this computer can play it: tools/build.php
// makes the upload in a temp folder (with a stand-in for the Angular build),
// and PHP's built-in server serves that folder with no router - so setup.php
// runs as Apache would run it, and /api/... ends at api/index.php, the front
// controller. Asked by a name that is not this computer's, setup.php is the
// real host's: the token, the lock, and then it is gone.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const SITE_HOST = 'piano.example.test';

/** tools/build.php into a new temp folder: [exit code, output, the folder]. */
function build(?string $out = null): array
{
    $out ??= test_temp_dir('dist') . '/dist';
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(TEST_BACKEND . '/tools/build.php') . ' --out=' . escapeshellarg($out)
        . ' --frontend=' . escapeshellarg(test_frontend_build()) . ' 2>&1', $lines, $code);

    return [$code, implode("\n", $lines), $out];
}

/** Every file under $dir, relative, forward slashes. */
function tree(string $dir): array
{
    $files = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        $files[] = str_replace('\\', '/', substr($file->getPathname(), strlen($dir) + 1));
    }
    sort($files);

    return $files;
}

/** The upload on PHP's built-in server, with only its own settings. */
function serve(string $dist): array
{
    return test_start_server($dist, null, ['PIANO_TEST_CONFIG' => null], '/index.html');
}

/** A request to the site by its own name - not this computer's. */
function site(array $site, string $method, string $url, mixed $body = null): array
{
    return call($site['base'], $method, $url, $body, ['Host: ' . SITE_HOST]);
}

function site_form(array $site, string $url, array $fields, array $files = []): array
{
    return call_form($site['base'], $url, $fields, $files, ['Host: ' . SITE_HOST]);
}

/** The setup form as filled in for the database $name. */
function form(string $token, string $name, array $extra = []): array
{
    $server = machineDatabaseSettings();

    return $extra + [
        'token' => $token,
        'db_host' => (string) $server['host'], 'db_port' => (string) $server['port'], 'db_name' => $name,
        'db_user' => (string) $server['user'], 'db_password' => (string) $server['password'],
        'issuer' => 'https://iam.anotoki.eu', 'client_id' => 'piano-academy', 'owner' => '',
    ];
}

function setup_token(string $dist): string
{
    $values = require "$dist/storage/setup-token.php";

    return $values['token'];
}

test('the build: exactly what to upload - no settings, no progress, no tools', function (): void {
    [$code, $out, $dist] = build();
    assert_same(0, $code, $out);
    $files = tree($dist);
    $top = array_values(array_unique(array_map(static fn(string $file): string => explode('/', $file)[0], $files)));
    sort($top);
    assert_same(['.htaccess', '.piano-academy-build', 'api', 'changelog.json', 'config', 'index.html',
        'main-TEST.js', 'media', 'migrations', 'setup.php', 'storage', 'styles-TEST.css', 'theme-boot.js', 'vendor'], $top);
    foreach (['api/index.php', 'api/.htaccess', 'api/bootstrap.php', 'api/anotoki_iam.php', 'api/routes/progress.php', 'api/meddleware/setup.php',
        'config/config.php', 'config/.htaccess', 'migrations/piano_academy/001_init.sql', 'migrations/.htaccess', 'vendor/autoload.php',
        'vendor/slim/slim/Slim/App.php', 'vendor/.htaccess', 'storage/.htaccess', 'media/font-TEST.woff2'] as $file) {
        assert_true(in_array($file, $files, true), "$file is in the upload");
    }
    assert_true(is_dir("$dist/storage/cache"), 'storage/cache/');
    foreach ($files as $file) {
        assert_false((bool) preg_match('~\.local\.php$|^server|^tests/|^tools/|router\.php|migration\.php|^secret\.php|^\.htaccess.+|package\.json~', $file), "$file should not be uploaded");
    }
    assert_same(md5_file(TEST_BACKEND . '/api/anotoki_iam.php'), md5_file("$dist/api/anotoki_iam.php"), 'the IAM\'s verifier as it is');
    foreach (['config', 'migrations', 'vendor', 'storage'] as $folder) {
        assert_match('/Require all denied/', (string) file_get_contents("$dist/$folder/.htaccess"), "$folder/ is closed to the web");
    }

    $htaccess = (string) file_get_contents("$dist/.htaccess");
    assert_match('~RewriteRule \^api\(/\|\$\) - \[L\]~', $htaccess, '/api/ goes through to api/.htaccess');
    assert_match('~RewriteRule \^\(config\|migrations\|vendor\|storage\)\(/\|\$\) - \[F,L\]~', $htaccess, 'the backend\'s folders are refused');
    assert_match('~RewriteRule \^ index\.html \[L\]~', $htaccess, 'the app\'s routes get the app');
    assert_match('~CGIPassAuth On~', $htaccess);
    assert_match('~SetEnvIf Authorization "\(\.\+\)" HTTP_AUTHORIZATION=\$1~', $htaccess, 'the token reaches PHP under CGI too');
    assert_match("~Content-Security-Policy \"default-src 'self'; script-src 'self'~", $htaccess);
    assert_match('~<FilesMatch "\^setup\\\\\.php\$">~', $htaccess, 'setup.php may run');
    assert_match('~RewriteRule \^ index\.php \[QSA,L\]~', (string) file_get_contents("$dist/api/.htaccess"));

    // again over it: fine; over a folder that is not a build, or inside the repository: refused
    [$code, $out] = build($dist);
    assert_same(0, $code, $out);
    $other = test_temp_dir('not-a-build');
    file_put_contents("$other/precious.txt", 'keep me');
    [$code] = build($other);
    assert_same(1, $code, 'a folder that is not an earlier build');
    assert_same('keep me', file_get_contents("$other/precious.txt"));
    [$code, $out] = build(TEST_BACKEND . '/zz-build-test');
    assert_same(1, $code, 'never inside the repository\'s own folders');
    assert_match('/inside the repository/', $out);
    assert_false(file_exists(TEST_BACKEND . '/zz-build-test'), 'and nothing made there');
    [$code] = build(dirname(TEST_BACKEND));
    assert_same(1, $code, 'never over the repository itself');
});

test('the setup page on a real host: the token, the tests, the database - and then it is gone', function (): void {
    [, , $dist] = build();
    $database = test_empty_db('site');
    $site = serve($dist);

    $first = site($site, 'GET', '/setup.php');
    assert_same(200, $first['status']);
    assert_match('/<h1>Install Piano Academy<\/h1>/', $first['raw']);
    assert_same('noindex, nofollow', $first['headers']['x-robots-tag'] ?? null);
    $token = setup_token($dist);
    assert_match('/^[0-9a-f]{48}$/', $token);
    assert_false(str_contains($first['raw'], $token), 'the token is never shown');
    assert_no_match('/name="auth_mode"/', $first['raw'], 'no choice of sign-in: a host always signs in through the IAM');
    assert_no_match('/import_old/', $first['raw'], 'no old progress files on a host');

    // Test connection, only with the token
    assert_same(403, site_form($site, '/setup.php?test=database', form('wrong', $database))['status']);
    $test = site_form($site, '/setup.php?test=database', form($token, $database));
    assert_same(true, $test['body']['ok'], (string) ($test['body']['message'] ?? ''));
    assert_same(false, site_form($site, '/setup.php?test=database', form($token, $database, ['db_password' => 'not-the-password']))['body']['ok']);

    $wrong = site_form($site, '/setup.php', form('wrong', $database));
    assert_match('/That is not the token/', $wrong['raw']);
    assert_match('/id="db_name" name="db_name" type="text" value="' . $database . '"/', $wrong['raw'], 'the form is filled in again');
    assert_no_match('/id="(db_password|token)"[^>]*value=/', $wrong['raw'], 'but never with the password or the token');
    $badPassword = site_form($site, '/setup.php', form($token, $database, ['db_password' => 'not-the-password']));
    assert_match('/Cannot connect to the database/', $badPassword['raw']);
    assert_false(is_file("$dist/config/database.local.php"), 'nothing written yet');
    assert_same(setup_token($dist), $token, 'the same token until the setup is done');

    $done = site_form($site, '/setup.php', form($token, $database));
    assert_match('/<h1>Installed<\/h1>/', $done['raw']);
    assert_match('/Made the tables \(001_init\.sql\)/', $done['raw']);
    assert_match('/The setup page has deleted itself/', $done['raw']);
    assert_no_match('/<script/', $done['raw'], 'no script to ask the deleted file for');

    $auth = require "$dist/config/auth.local.php";
    assert_same('iam', $auth['mode'], 'a hosted site signs in through the IAM');
    assert_same('https://iam.anotoki.eu', $auth['issuer']);
    assert_same('storage/cache', $auth['cache_dir']);
    assert_same($database, (require "$dist/config/database.local.php")['name']);
    assert_true(is_file("$dist/storage/installed.lock"), 'the lock');
    assert_false(is_file("$dist/setup.php"), 'the setup page deleted itself');
    assert_false(is_file("$dist/storage/setup-token.php"), 'and the token');
    assert_same(1, (int) dbConnect(machineDatabaseSettings(), $database)->query("SELECT count(*) FROM migrations WHERE filename = '001_init.sql'")->fetchColumn());
    // Whatever answers now (Apache's rewrite gives the app; PHP's built-in
    // server a 404 or the app, by version), it is never the setup page.
    $gone = site($site, 'GET', '/setup.php');
    assert_no_match('/Install Piano Academy|name="token"/', $gone['raw'], 'no setup page any more');

    // the site itself, through api/index.php
    assert_same(['mode' => 'iam', 'issuer' => 'https://iam.anotoki.eu', 'clientId' => 'piano-academy'], site($site, 'GET', '/api/auth/config')['body']);
    assert_same(401, site($site, 'GET', '/api/state')['status'], 'nobody gets in without a token');
    assert_same(['ok' => true, 'auth' => 'iam', 'database' => $database, 'pending' => []], site($site, 'GET', '/api/health')['body']);
    assert_match('/<title>Piano Academy<\/title>/', site($site, 'GET', '/')['raw'], 'the app');

    // uploaded again by mistake: refuses, and deletes itself again
    copy(TEST_BACKEND . '/setup.php', "$dist/setup.php");
    $again = site($site, 'GET', '/setup.php');
    assert_match('/Already set up/', $again['raw']);
    assert_false(is_file("$dist/setup.php"));
    assert_same([], server_problems($site));
});

test('the setup page with a progress file: your progress arrives in your account', function (): void {
    [, , $dist] = build();
    $database = test_empty_db('moved');
    $site = serve($dist);
    site($site, 'GET', '/setup.php');
    $token = setup_token($dist);
    $export = json_encode([
        'format' => 'piano-academy-export', 'version' => 1, 'exportedAt' => '2026-09-28T10:00:00.000Z', 'userId' => 1,
        'progress' => ['60' => ['midi' => 60, 'status' => 'review'], '62' => ['midi' => 62, 'status' => 'learning']],
        'path' => ['steps' => ['rh-1/meet' => ['attempts' => 1, 'bestAccuracy' => 100]]],
        'sessions' => [['mode' => 'trainer', 'attempts' => 12, 'correct' => 10, 'accuracy' => 83, 'id' => '1788962769050-k65d2n', 'recordedAt' => '2026-09-09T14:06:09.050Z']],
    ]);

    $noOwner = site_form($site, '/setup.php', form($token, $database), ['export' => ['my-progress.json', $export]]);
    assert_match('/enter your IAM user id too/', $noOwner['raw'], 'a file needs the id it goes to');
    $junk = site_form($site, '/setup.php', form($token, $database, ['owner' => '7']), ['export' => ['junk.json', '{"hello": 1}']]);
    assert_match('/not a progress export/', $junk['raw']);
    assert_false(is_file("$dist/config/database.local.php"), 'nothing written for a bad file');

    $done = site_form($site, '/setup.php', form($token, $database, ['owner' => '7']), ['export' => ['my-progress.json', $export]]);
    assert_match('/Brought your progress into IAM user 7: 2 notes, 1 path steps, 1 sessions\./', $done['raw']);
    $pdo = dbConnect(machineDatabaseSettings(), $database);
    assert_same('7', (string) $pdo->query('SELECT user_id FROM progress')->fetchColumn());
    assert_same('1788962769050-k65d2n', (string) $pdo->query('SELECT id FROM sessions')->fetchColumn());
    assert_same(7, (require "$dist/config/auth.local.php")['local_user_id']);
    $pdo = null;
});
