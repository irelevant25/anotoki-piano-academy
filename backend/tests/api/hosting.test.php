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
        'issuer' => 'https://iam.anotoki.eu', 'client_id' => 'piano-academy',
    ];
}

/** The names of a page's form fields, in order. */
function field_names(string $html): array
{
    preg_match_all('/<input [^>]*name="([a-z_]+)"/', $html, $m);

    return $m[1];
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
    foreach (['api/index.php', 'api/.htaccess', 'api/bootstrap.php', 'api/anotoki_iam.php', 'api/routes/progress.php', 'api/routes/visitor.php', 'api/routes/public.php',
        'api/translations.php', 'api/routes/admin.php', 'api/migrations.php', 'api/meddleware/auth.php', 'api/meddleware/security.php',
        'api/store.php', 'api/transfer.php', 'api/people.php', 'api/visitors.php', 'api/client_address.php', 'api/after_response.php',
        'config/config.php', 'config/.htaccess', 'migrations/piano_academy/001_init.sql', 'migrations/piano_academy/002_languages_and_translations.sql',
        'migrations/piano_academy/003_site_strings.sql', 'migrations/piano_academy/004_family_shell.sql', 'migrations/piano_academy/005_visitors.sql',
        'migrations/piano_academy/006_account_preferences.sql', 'migrations/piano_academy/007_site_status_words.sql', 'migrations/.htaccess', 'vendor/autoload.php',
        'vendor/slim/slim/Slim/App.php', 'vendor/anotoki/lib/php/src/Migrations/Migrator.php', 'vendor/anotoki/lib/php/src/Migrations/Http/SiteGate.php',
        'vendor/.htaccess', 'storage/.htaccess', 'media/font-TEST.woff2'] as $file) {
        assert_true(in_array($file, $files, true), "$file is in the upload");
    }
    // The family's engine took the place of the app's own; the gates it replaced are gone with it.
    foreach (['api/migration_runner.php', 'api/database_update.php', 'api/meddleware/setup.php'] as $file) {
        assert_false(in_array($file, $files, true), "$file is no longer in the upload");
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
    assert_match("~Content-Security-Policy \"default-src 'self'; script-src 'self' https://umami\\.anotoki\\.eu;~", $htaccess, 'scripts from this origin and the family\'s visitor counter, nothing else');
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
    assert_same(['token', 'db_host', 'db_port', 'db_name', 'db_user', 'db_password', 'issuer', 'client_id'], field_names($first['raw']), 'the token, the database and the IAM - nothing else');
    assert_no_match('/auth_mode|import_old|name="owner"|type="file"|Your progress|IAM user id/', $first['raw']);

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
    assert_match('/Made the tables \(001_init\.sql, 002_/', $done['raw']);
    assert_match('/The setup page has deleted itself/', $done['raw']);
    assert_no_match('/<script/', $done['raw'], 'no script to ask the deleted file for');

    assert_match('/Every anotoki account holds the MEMBER role here and can use it; the IAM\'s page for this application says whether signing in is required and which roles may sign in\. The IAM\'s administrators are its administrators \(ADMIN\), and the IAM gives the EDITOR role to whoever may reword its words\./', $done['raw']);
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'piano-academy', 'cache_dir' => 'storage/cache'], require "$dist/config/auth.local.php", 'the IAM, and nothing else');
    assert_false(is_file("$dist/config/visitors.local.php"), 'setup never writes the optional visitors settings');
    // The site would now ask the live IAM whether it requires sign-in: no test
    // does. Its answer is given as a file instead (the settings are otherwise
    // the ones just written).
    file_put_contents("$dist/config/auth.local.php", '<?php return ' . var_export(test_offline_auth((require "$dist/config/auth.local.php") + ['application_file' => test_application_file()]), true) . ";\n");
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
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'clientId' => 'piano-academy', 'loginRequired' => true], site($site, 'GET', '/api/auth/config')['body']);
    assert_same([], glob("$dist/storage/cache/anotoki-iam-application-*") ?: [], 'the live IAM was not asked: nothing of its answer kept');
    assert_same(401, site($site, 'GET', '/api/state')['status'], 'nobody gets in without a token');
    assert_same(401, site($site, 'GET', '/api/admin/migrations')['status'], 'nor into the admin panel');
    assert_same(['ok' => true, 'database' => $database, 'pending' => []], site($site, 'GET', '/api/health')['body']);
    assert_match('/<title>Piano Academy<\/title>/', site($site, 'GET', '/')['raw'], 'the app');

    // Where the site stands: ready, and installed - so the setup page is never offered again, not even when
    // its settings go missing later (a half-finished upload): then the site is only "not available right now".
    assert_same(['state' => 'ready', 'installed' => true], site($site, 'GET', '/api/site-status')['body']);
    rename("$dist/config/auth.local.php", "$dist/config/auth.local.php.away");
    try {
        assert_same(['state' => 'not_set_up', 'installed' => true], site($site, 'GET', '/api/site-status')['body']);
        foreach (['/api/state', '/api/auth/config', '/api/health', '/api/admin/migrations'] as $url) {
            $answer = site($site, 'GET', $url);
            assert_same(
                [503, ['code' => 'not_set_up', 'installed' => true, 'message' => 'The site is not available right now. Try again in a few minutes.']],
                [$answer['status'], $answer['body']],
                "$url: never the setup page"
            );
        }
    } finally {
        rename("$dist/config/auth.local.php.away", "$dist/config/auth.local.php");
    }
    assert_same(['state' => 'ready', 'installed' => true], site($site, 'GET', '/api/site-status')['body'], 'and ready again with them');

    // uploaded again by mistake: refuses, and deletes itself again
    copy(TEST_BACKEND . '/setup.php', "$dist/setup.php");
    $again = site($site, 'GET', '/setup.php');
    assert_match('/Already set up/', $again['raw']);
    assert_false(is_file("$dist/setup.php"));
    assert_same([], server_problems($site));
});

test('run again on the host for an update: nothing saved is shown, a blank password keeps the saved one, and an owner or a file sent along is nobody\'s business', function (): void {
    [, , $dist] = build();
    $database = test_empty_db('again');
    $site = serve($dist);
    site($site, 'GET', '/setup.php');
    $done = site_form($site, '/setup.php', form(setup_token($dist), $database));
    assert_match('/<h1>Installed<\/h1>/', $done['raw']);

    // A later version with a new migration: the lock goes, setup.php is uploaded again.
    unlink("$dist/storage/installed.lock");
    copy(TEST_BACKEND . '/setup.php', "$dist/setup.php");
    $page = site($site, 'GET', '/setup.php');
    assert_match('/<h1>Install Piano Academy<\/h1>/', $page['raw']);
    assert_match('/This copy is set up already/', $page['raw']);
    assert_false(str_contains($page['raw'], $database), 'the saved database is not shown to whoever opens the page');
    assert_false(str_contains($page['raw'], 'iam.anotoki.eu"'), 'nor the saved IAM');
    assert_match('/id="db_name" name="db_name" type="text" value="anotoki_piano"/', $page['raw'], 'the default instead');
    assert_match('/id="db_host" name="db_host" type="text" value="localhost"/', $page['raw']);

    // An owner's id and a progress file, as the old page took them: let through to nothing.
    $export = json_encode(['format' => 'piano-academy-export', 'version' => 1, 'userId' => 7, 'progress' => ['60' => ['midi' => 60]], 'path' => ['steps' => new stdClass()], 'sessions' => []]);
    $again = site_form($site, '/setup.php', form(setup_token($dist), $database, ['db_password' => '', 'owner' => '7', 'auth_mode' => 'none', 'local_user_id' => '7']), ['export' => ['my-progress.json', $export]]);
    assert_match('/<h1>Installed<\/h1>/', $again['raw'], 'a blank password keeps the saved one');
    assert_match('/The tables were up to date/', $again['raw']);
    assert_no_match('/Brought|progress into|IAM user 7/', $again['raw']);
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'piano-academy', 'cache_dir' => 'storage/cache'], require "$dist/config/auth.local.php", 'no mode, no owner');
    $pdo = dbConnect(machineDatabaseSettings(), $database);
    assert_same([0, 0], [(int) $pdo->query('SELECT count(*) FROM progress')->fetchColumn(), (int) $pdo->query('SELECT count(*) FROM users')->fetchColumn()], 'nobody\'s progress, nobody made');
    $pdo = null;
    assert_false(is_file("$dist/setup.php"), 'gone again');
    assert_same([], server_problems($site));
});
