<?php

// The hosted site, as far as this computer can play it: anotoki-deploy (the
// anotoki library's deploy tool) builds the release into a temp folder that
// plays the site's folder on the host - frontend/ and backend/, with config/
// and storage/ to come beside them (with a stand-in for the Angular build) -
// and PHP's built-in server serves frontend/ as Apache would, through a router
// that plays frontend/.htaccess: a file of the app as it is, every other
// address to index.php, the front controller, which hands /api/... to the API
// and /setup.php to the setup page. Asked by a name that is not this
// computer's, setup.php is the real host's: the token, the lock, and then it is
// gone.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const SITE_HOST = 'piano.example.test';

/** anotoki-deploy: the site's dev dependency, or the library's checkout beside this repository. */
function deploy_tool(): string
{
    foreach ([dirname(TEST_BACKEND) . '/frontend/node_modules/@anotoki/deploy/cli.mjs', dirname(TEST_BACKEND, 2) . '/anotoki-lib/deploy/cli.mjs'] as $cli) {
        if (is_file($cli)) {
            return $cli;
        }
    }
    throw new RuntimeException('No anotoki-deploy: neither frontend/node_modules/@anotoki/deploy nor ../anotoki-lib/deploy.');
}

/** anotoki-deploy build into a new temp folder - the site's folder on the host: [exit code, output, the folder]. */
function build(?string $out = null): array
{
    $out ??= test_temp_dir('site') . '/site';
    exec('node ' . escapeshellarg(deploy_tool()) . ' build --root ' . escapeshellarg(dirname(TEST_BACKEND)) . ' --out ' . escapeshellarg($out)
        . ' --frontend ' . escapeshellarg(test_frontend_build()) . ' 2>&1', $lines, $code);

    return [$code, implode("\n", $lines), $out];
}

/** frontend/.htaccess as PHP's built-in server can play it (tests/release_router.php). */
function release_router(): string
{
    return dirname(__DIR__) . '/release_router.php';
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

/** The release's frontend/ on PHP's built-in server, with only the site's own settings (config/ beside the release). */
function serve(string $dist): array
{
    return test_start_server("$dist/frontend", release_router(), ['PIANO_TEST_CONFIG' => null], '/index.html');
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

test('the build: the release - the app in frontend/, the code in backend/, nothing of the host', function (): void {
    [$code, $out, $dist] = build();
    assert_same(0, $code, $out);
    $files = tree($dist);
    $top = array_values(array_unique(array_map(static fn(string $file): string => explode('/', $file)[0], $files)));
    sort($top);
    assert_same(['.anotoki-deploy', 'backend', 'frontend'], $top, 'a release: frontend/ and backend/ - config/ and storage/ are the host\'s, never in it');
    foreach (['frontend/index.html', 'frontend/index.php', 'frontend/.htaccess', 'frontend/main-TEST.js', 'frontend/styles-TEST.css', 'frontend/theme-boot.js',
        'frontend/changelog.json', 'frontend/media/font-TEST.woff2'] as $file) {
        assert_true(in_array($file, $files, true), "$file is in the release");
    }
    foreach (['api/index.php', 'api/bootstrap.php', 'api/admin_tools.php', 'api/routes/progress.php', 'api/routes/visitor.php', 'api/routes/public.php',
        'api/translations.php', 'api/routes/admin.php', 'api/migrations.php', 'api/meddleware/auth.php', 'api/meddleware/security.php',
        'api/store.php', 'api/transfer.php', 'api/people.php', 'api/visitors.php', 'api/client_address.php', 'api/after_response.php',
        'setup.php', '.htaccess', 'release.json',
        'config/config.php', 'migrations/piano_academy/001_init.sql', 'migrations/piano_academy/002_languages_and_translations.sql',
        'migrations/piano_academy/003_site_strings.sql', 'migrations/piano_academy/004_family_shell.sql', 'migrations/piano_academy/005_visitors.sql',
        'migrations/piano_academy/006_account_preferences.sql', 'migrations/piano_academy/007_site_status_words.sql',
        'migrations/piano_academy/010_people.sql', 'migrations/piano_academy/011_sign_in_failure_words.sql', 'migrations/piano_academy/012_legal_pages.sql',
        'migrations/piano_academy/013_family_footer_words.sql',
        'vendor/autoload.php', 'vendor/anotoki/lib/backend/migrations/translations/010_backups_where_words.sql',
        'vendor/anotoki/lib/backend/migrations/translations/011_privacy_words_made_true.sql', 'vendor/anotoki/lib/backend/migrations/translations/012_footer_words.sql',
        'vendor/anotoki/lib/backend/migrations/translations/013_about_and_support_words.sql',
        'vendor/slim/slim/Slim/App.php', 'vendor/anotoki/lib/backend/src/Migrations/Migrator.php', 'vendor/anotoki/lib/backend/src/Migrations/Http/SiteGate.php',
        'vendor/anotoki/lib/backend/src/Auth/Http/Identify.php', 'vendor/anotoki/lib/backend/src/People/Http/PeopleRoutes.php',
        'vendor/anotoki/lib/backend/src/Backups/Backups.php', 'vendor/anotoki/lib/backend/migrations/admin/001_audit_log.sql',
        'vendor/anotoki/lib/backend/migrations/people/001_people.sql'] as $file) {
        assert_true(in_array("backend/$file", $files, true), "backend/$file is in the release");
    }
    // The family's engine took the place of the app's own; the gates it replaced are gone with it.
    foreach (['api/migration_runner.php', 'api/database_update.php', 'api/meddleware/setup.php', 'api/anotoki_iam.php'] as $file) {
        assert_false(in_array("backend/$file", $files, true), "backend/$file is no longer in the release");
    }
    foreach ($files as $file) {
        assert_false((bool) preg_match('~\.local\.php$|^backend/(tests|tools|storage)/|^server|router\.php|migration\.php|secret\.php|^backend/api/\.htaccess|^backend/composer\.(json|lock)$|package\.json~', $file), "$file should not be in the release");
    }
    assert_match('/Require all denied/', (string) file_get_contents("$dist/backend/.htaccess"), 'backend/ is closed to the web');
    assert_same('piano-academy', json_decode((string) file_get_contents("$dist/backend/release.json"), true)['site'], 'release.json says whose release it is');

    $htaccess = (string) file_get_contents("$dist/frontend/.htaccess");
    assert_true(str_contains($htaccess, 'RewriteRule ^(api)(/|$) index.php [L]'), '/api/ goes to the front controller');
    assert_true(str_contains($htaccess, 'RewriteRule ^setup\.php$ index.php [L]'), 'and the setup page');
    assert_true(str_contains($htaccess, "RewriteCond %{REQUEST_URI} !\\.[^/]*$\n    RewriteRule ^ index.html [L]"), 'the app\'s routes get the app; an old bundle stays a 404');
    assert_true(str_contains($htaccess, 'CGIPassAuth On'));
    assert_true(str_contains($htaccess, 'SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1'), 'the token reaches PHP under CGI too');
    assert_true(str_contains($htaccess, "Content-Security-Policy \"default-src 'self'; script-src 'self' https://umami.anotoki.eu;"), 'scripts from this origin and the family\'s visitor counter, nothing else');
    assert_true(str_contains($htaccess, '<FilesMatch "^(index\.html|theme-boot\.js|changelog\.json)$">'), 'the shell and the list of versions are asked for again each time');
    assert_no_match('/^\s*(Options|DirectoryIndex|RewriteBase)/m', $htaccess, 'nothing the host has refused with a 500');

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
    assert_false(file_exists(TEST_BACKEND . '/zz-build-test'), 'and nothing made there');
    [$code] = build(dirname(TEST_BACKEND));
    assert_same(1, $code, 'never over the repository itself');
});

test('the release\'s .htaccess lets a visitor run the front controller, the setup page and the host check alone - and refuses every other PHP file; the host check is never part of a build', function (): void {
    [$code, $out, $dist] = build();
    assert_same(0, $code, $out);
    $htaccess = (string) file_get_contents("$dist/frontend/.htaccess");

    // Apache reads a <FilesMatch> as a regular expression against the file's name, a later section over an earlier one:
    // every PHP file is refused, then the ones a visitor may run are granted. Read here as Apache reads them.
    preg_match_all('~<FilesMatch "([^"]+)">\R\s*Require all (granted|denied)\R</FilesMatch>~', $htaccess, $sections, PREG_SET_ORDER);
    $rules = array_map(static fn (array $section): array => [$section[1], $section[2]], $sections);
    assert_same([['\.(php|phtml|phar)$', 'denied'], ['^(index|setup|host-check)\.php$', 'granted'], ['^\.', 'denied']], $rules, 'every PHP file refused, then three granted, dot-files refused - in that order');
    $runs = static function (string $name) use ($rules): bool {
        $allowed = true;
        foreach ($rules as [$pattern, $verdict]) {
            if (preg_match('~' . $pattern . '~', $name) === 1) {
                $allowed = $verdict === 'granted';
            }
        }

        return $allowed && preg_match('~\.(php|phtml|phar)$~', $name) === 1;
    };
    assert_true($runs('index.php'), 'the front controller: /api/... and /setup.php end there');
    assert_true($runs('setup.php'), 'the setup page\'s address - which the front controller answers while backend/setup.php is there');
    assert_true($runs('host-check.php'), 'the host check: uploaded by hand, opened with the token written into it, and deleted again');
    foreach (['bootstrap.php', 'config.php', 'migration.php', 'build.php', 'router.php', 'phpinfo.php', 'xsetup.php', 'setup.php.php',
        'host-checks.php', 'my-host-check.php', 'host-check.phtml', 'host-check.phar', '.host-check.php', 'HOST-CHECK.php'] as $other) {
        assert_false($runs($other), "$other: never run for a visitor");
    }

    // Inert while it is not there: no file of that name in the release.
    assert_false(file_exists("$dist/frontend/host-check.php"), 'the host check is never part of a build: it lives in tools/, which no build copies');
    assert_true(is_file(dirname(TEST_BACKEND) . '/tools/host-check.php'), 'it is the repository\'s tools/host-check.php');
    assert_match('~define\(\'HOST_CHECK_TOKEN\', \'\'\);~', (string) file_get_contents(dirname(TEST_BACKEND) . '/tools/host-check.php'), 'and its token is empty in the repository: without one written into it, it answers 404 to everybody');
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
    assert_match('~Made the tables \(anotoki_admin/001_audit_log\.sql, anotoki_admin/002_feedback\.sql, 001_init\.sql, 002_~', $done['raw'], 'the library\'s admin tools\' set first');
    assert_match('/The setup page has deleted itself/', $done['raw']);
    assert_no_match('/<script/', $done['raw'], 'no script to ask the deleted file for');

    assert_match('/Every anotoki account holds the MEMBER role here and can use it; the IAM\'s page for this application says whether signing in is required and which roles may sign in\. The IAM\'s administrators are its administrators \(ADMIN\), and the IAM gives the EDITOR role to whoever may reword its words\./', $done['raw']);
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'piano-academy', 'cache_dir' => 'storage/cache'], require "$dist/config/auth.local.php", 'the IAM, and nothing else');
    assert_false(is_file("$dist/config/visitors.local.php"), 'setup never writes the optional visitors settings');
    // The site would now ask the live IAM whether it requires sign-in, and
    // which accounts it deleted: no test does. Its answers are given as files
    // instead (the settings are otherwise the ones just written).
    file_put_contents("$dist/config/auth.local.php", '<?php return ' . var_export(test_offline_auth((require "$dist/config/auth.local.php") + ['application_file' => test_application_file(), 'anonymized_file' => test_anonymized_file()]), true) . ";\n");
    assert_same($database, (require "$dist/config/database.local.php")['name']);
    assert_true(is_file("$dist/storage/installed.lock"), 'the lock');
    assert_false(is_file("$dist/backend/setup.php"), 'the setup page deleted itself');
    assert_false(is_file("$dist/storage/setup-token.php"), 'and the token');
    assert_same(1, (int) dbConnect(machineDatabaseSettings(), $database)->query("SELECT count(*) FROM migrations WHERE filename = '001_init.sql'")->fetchColumn());
    // Whatever answers now (Apache's rewrite gives the app; PHP's built-in
    // server a 404 or the app, by version), it is never the setup page.
    $gone = site($site, 'GET', '/setup.php');
    assert_no_match('/Install Piano Academy|name="token"/', $gone['raw'], 'no setup page any more');

    // the site itself, through api/index.php
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'piano-academy', 'login_required' => true, 'sign_in_available' => true], site($site, 'GET', '/api/auth/config')['body']);
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
    copy(TEST_BACKEND . '/setup.php', "$dist/backend/setup.php");
    $again = site($site, 'GET', '/setup.php');
    assert_match('/Already set up/', $again['raw']);
    assert_false(is_file("$dist/backend/setup.php"));
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
    copy(TEST_BACKEND . '/setup.php', "$dist/backend/setup.php");
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
    assert_false(is_file("$dist/backend/setup.php"), 'gone again');
    assert_same([], server_problems($site));
});
