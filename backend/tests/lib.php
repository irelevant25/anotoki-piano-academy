<?php

declare(strict_types=1);

/**
 * What every PHP test file loads first: the isolation of your data, a small
 * test runner (test(), before(), after(), assertions), the real server
 * started for the API tests, and access tokens signed with the tests' own key.
 *
 * Isolation: before the app is loaded, this file writes a settings folder of
 * its own - config/database.local.php's server and user, but a throwaway
 * database (piano_test_<…>, copied from piano_test_template) - and points the
 * app at it with PIANO_TEST_CONFIG, which the app honours only for piano_test_
 * databases. It refuses to go on if the app was loaded first. No test can
 * reach your database (piano_academy) or change your settings, and none reads
 * server/data/ itself - the import tests work on copies in temp folders. The
 * databases and folders go when the file's tests end; PIANO_KEEP_TEMP=1 keeps
 * them for a look.
 *
 * tests/run.php runs every test file (php tests/run.php [file…]).
 */

const TEST_DB_PREFIX = 'piano_test_';
const TEST_TEMPLATE = 'piano_test_template';
const TEST_ISSUER = 'https://iam.piano-test.invalid';
const TEST_CLIENT = 'piano-academy';

if (defined('PIANO_BACKEND')) {
    throw new RuntimeException('tests/lib.php came too late: the app was loaded before it, with its real settings.');
}

define('TEST_BACKEND', dirname(__DIR__));

/** A throwaway database's name: a test database, never the template or the real one. */
function test_db_name_ok(string $name): bool
{
    return (bool) preg_match('/^' . TEST_DB_PREFIX . '[a-z0-9_]+$/D', $name) && $name !== TEST_TEMPLATE;
}

/**
 * This computer's database server and user, from config/database.local.php
 * (setup.php writes it). The tests make their own databases on that server.
 */
function machineDatabaseSettings(): array
{
    $file = TEST_BACKEND . '/config/database.local.php';
    if (!is_file($file)) {
        fwrite(STDERR, "The tests need this computer's database connection, and there is none yet: open /setup.php first (it writes config/database.local.php).\n");
        exit(1);
    }
    $values = require $file;

    return is_array($values) ? $values : [];
}

/** A settings folder, as setup.php would write one: the database settings and the sign-in settings. */
function test_write_config(string $dir, array $database, array $auth): string
{
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export($database, true) . ";\n");
    file_put_contents("$dir/auth.local.php", '<?php return ' . var_export($auth, true) . ";\n");

    return $dir;
}

/** Sign-in off, as on the owner's computer. */
function test_auth_none(int $owner = 1): array
{
    return ['mode' => 'none', 'issuer' => 'http://localhost:4300', 'client_id' => TEST_CLIENT, 'local_user_id' => $owner, 'cache_dir' => 'storage/cache'];
}

(static function (): void {
    $name = (string) getenv('PIANO_TEST_DB');
    if (!test_db_name_ok($name)) {
        $name = TEST_DB_PREFIX . getmypid() . '_' . bin2hex(random_bytes(3));
    }
    $dir = test_temp_dir('config');
    test_write_config($dir, ['name' => $name] + machineDatabaseSettings(), test_auth_none());
    putenv("PIANO_TEST_CONFIG=$dir");
    $GLOBALS['TEST_CONFIG_DIR'] = $dir;
})();

require TEST_BACKEND . '/api/bootstrap.php';

if (!test_db_name_ok(dbName())) {
    throw new RuntimeException('The tests would use the database ' . dbName() . ': refusing.');
}

/* ------------------------------------------------------------ the runner */

$GLOBALS['TESTS'] = ['tests' => [], 'before' => [], 'after' => []];

function test(string $name, callable $fn): void
{
    $GLOBALS['TESTS']['tests'][] = [$name, $fn];
}

function before(callable $fn): void
{
    $GLOBALS['TESTS']['before'][] = $fn;
}

function after(callable $fn): void
{
    $GLOBALS['TESTS']['after'][] = $fn;
}

final class AssertionFailed extends RuntimeException
{
}

function test_show(mixed $value): string
{
    return (string) json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
}

function fail(string $message): never
{
    throw new AssertionFailed($message);
}

/**
 * $value with the keys of every object sorted: the database keeps JSON
 * documents as jsonb, which does not keep their key order (nor does the
 * browser care about it).
 */
function sorted(mixed $value): mixed
{
    if (!is_array($value)) {
        return $value;
    }
    $value = array_map('sorted', $value);
    if (!array_is_list($value)) {
        ksort($value, SORT_STRING);
    }

    return $value;
}

/** Equal as JSON documents: the same values, whatever the key order. */
function assert_json_same(mixed $expected, mixed $actual, string $message = ''): void
{
    assert_same(sorted($expected), sorted($actual), $message);
}

/** Strict equality (===): for arrays the same keys, values and types, in the same order. */
function assert_same(mixed $expected, mixed $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        fail(($message !== '' ? "$message\n" : '') . '  expected: ' . test_show($expected) . "\n  actual:   " . test_show($actual));
    }
}

function assert_true(mixed $value, string $message = 'expected a true value'): void
{
    if (!$value) {
        fail($message);
    }
}

function assert_false(mixed $value, string $message = 'expected a false value'): void
{
    if ($value) {
        fail($message);
    }
}

function assert_match(string $pattern, string $text, string $message = ''): void
{
    if (!preg_match($pattern, $text)) {
        fail(($message !== '' ? "$message\n" : '') . "  $pattern does not match " . test_show(textClip($text, 400)));
    }
}

function assert_no_match(string $pattern, string $text, string $message = ''): void
{
    if (preg_match($pattern, $text)) {
        fail(($message !== '' ? "$message\n" : '') . "  $pattern matches " . test_show(textClip($text, 400)));
    }
}

function assert_throws(callable $fn, string $pattern = '/./'): void
{
    try {
        $fn();
    } catch (AssertionFailed $e) {
        throw $e;
    } catch (Throwable $e) {
        assert_match($pattern, $e->getMessage(), 'the wrong error');

        return;
    }
    fail('expected an error');
}

/** Runs the file's tests; the last line tells tests/run.php the counts. */
function test_run(): int
{
    $pass = $fail = 0;
    $file = basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''));
    try {
        foreach ($GLOBALS['TESTS']['before'] as $fn) {
            $fn();
        }
        foreach ($GLOBALS['TESTS']['tests'] as [$name, $fn]) {
            $started = microtime(true);
            try {
                $fn();
                $pass++;
                printf("  ok  %s (%d ms)\n", $name, (int) round((microtime(true) - $started) * 1000));
            } catch (Throwable $e) {
                $fail++;
                printf("  FAIL %s (%d ms)\n", $name, (int) round((microtime(true) - $started) * 1000));
                $where = $e instanceof AssertionFailed ? test_where($e) : get_class($e) . ' at ' . str_replace(TEST_BACKEND, '', $e->getFile()) . ':' . $e->getLine();
                echo '    ' . str_replace("\n", "\n    ", rtrim($e->getMessage())) . "\n    ($where)\n";
            }
        }
    } finally {
        foreach ($GLOBALS['TESTS']['after'] as $fn) {
            try {
                $fn();
            } catch (Throwable $e) {
                echo '  after: ' . $e->getMessage() . "\n";
            }
        }
    }
    echo '##piano ' . json_encode(['file' => $file, 'pass' => $pass, 'fail' => $fail]) . "\n";

    return $fail ? 1 : 0;
}

/** The test file's line an assertion failed on. */
function test_where(Throwable $e): string
{
    foreach ($e->getTrace() as $frame) {
        if (isset($frame['file']) && str_ends_with($frame['file'], '.test.php')) {
            return basename($frame['file']) . ':' . $frame['line'];
        }
    }

    return basename($e->getFile()) . ':' . $e->getLine();
}

// the tests run when the test file itself is done registering them
register_shutdown_function(static function (): void {
    if (!isset($GLOBALS['TEST_RAN']) && $GLOBALS['TESTS']['tests']) {
        $GLOBALS['TEST_RAN'] = true;
        $code = test_run();
        test_cleanup();
        exit($code);
    }
    test_cleanup();
});

/* ------------------------------------------------ the database and the app */

/** This file's throwaway database, copied from the template on first use. */
function test_db(): void
{
    static $made = false;
    if ($made) {
        return;
    }
    $server = machineDatabaseSettings();
    if (!dbExists($server, TEST_TEMPLATE)) {
        throw new RuntimeException('No ' . TEST_TEMPLATE . ' database: run the tests with php tests/run.php, which makes it.');
    }
    test_copy_template(dbName());
    $made = true;
}

/** A new database copied from the template, marked with the time, dropped at the end. */
function test_copy_template(string $name): void
{
    $server = machineDatabaseSettings();
    for ($i = 0; ; $i++) {
        try {
            dbServer($server)->exec('CREATE DATABASE "' . $name . '" ENCODING \'UTF8\' TEMPLATE "' . TEST_TEMPLATE . '"');
            break;
        } catch (PDOException $e) {
            // A template is copied only while nobody is connected to it; another
            // test file may be making its copy at the same moment (SQLSTATE 55006).
            if ($e->getCode() !== '55006' || $i >= 50) {
                throw $e;
            }
            usleep(100000);
        }
    }
    dbServer($server)->exec('COMMENT ON DATABASE "' . $name . "\" IS 'piano test " . time() . "'");
    $GLOBALS['TEST_DBS'][] = $name;
}

/** Another throwaway database, empty (no tables), dropped at the end like the file's own. */
function test_empty_db(string $suffix): string
{
    $name = dbName() . '_' . $suffix;
    if (!test_db_name_ok($name)) {
        throw new RuntimeException("Not a test database name: $name");
    }
    $server = machineDatabaseSettings();
    ensureDatabase($server, $name);
    dbServer($server)->exec('COMMENT ON DATABASE "' . $name . "\" IS 'piano test " . time() . "'");
    $GLOBALS['TEST_DBS'][] = $name;

    return $name;
}

/** A new temp folder, removed at the end. */
function test_temp_dir(string $label = 'tmp'): string
{
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . "/piano-test-$label-" . getmypid() . '-' . bin2hex(random_bytes(3));
    mkdir($dir, 0777, true);
    $GLOBALS['TEST_DIRS'][] = $dir;

    return $dir;
}

function test_remove_tree(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $entry) {
        $entry->isDir() ? @rmdir($entry->getPathname()) : @unlink($entry->getPathname());
    }
    @rmdir($dir);
}

/** Stops the servers, drops this file's databases and removes its temp folders, unless PIANO_KEEP_TEMP is set. */
function test_cleanup(): void
{
    foreach ($GLOBALS['TEST_SERVERS'] ?? [] as $stop) {
        $stop();
    }
    $GLOBALS['TEST_SERVERS'] = [];
    if (getenv('PIANO_KEEP_TEMP')) {
        return;
    }
    foreach ($GLOBALS['TEST_DBS'] ?? [] as $name) {
        if (test_db_name_ok($name)) {
            try {
                dbServer(machineDatabaseSettings())->exec('DROP DATABASE IF EXISTS "' . $name . '" WITH (FORCE)');
            } catch (Throwable $e) {
                echo "  (could not drop $name: " . $e->getMessage() . ")\n";
            }
        }
    }
    $GLOBALS['TEST_DBS'] = [];
    foreach ($GLOBALS['TEST_DIRS'] ?? [] as $dir) {
        if (str_contains($dir, '/piano-test-')) {
            test_remove_tree($dir);
        }
    }
    $GLOBALS['TEST_DIRS'] = [];
}

/** A free port on this computer. */
function test_free_port(): int
{
    $socket = stream_socket_server('tcp://127.0.0.1:0');
    $port = (int) substr((string) strrchr((string) stream_socket_get_name($socket, false), ':'), 1);
    fclose($socket);

    return $port;
}

/**
 * PHP's built-in web server on a free port: $docroot with $router (null for
 * none - the upload's layout, where Apache would run api/index.php and
 * setup.php as files). $env is added to this process's environment (a null
 * value leaves that variable out). Waits until $ready answers. 'stop' stops it
 * before the end.
 *
 * @return array{base: string, log: string, stop: callable}
 */
function test_start_server(string $docroot, ?string $router, array $env, string $ready, ?int $port = null): array
{
    $port ??= test_free_port();
    // the built-in server logs every request: to a file, as a pipe nobody reads would fill up and stall it
    $log = (string) tempnam(sys_get_temp_dir(), 'piano-server-');
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $command = [PHP_BINARY, '-d', 'display_errors=stderr', '-S', "127.0.0.1:$port", '-t', $docroot];
    if ($router !== null) {
        $command[] = $router;
    }
    $environment = array_filter($env + getenv(), static fn($value): bool => $value !== null);
    $process = proc_open($command, [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $log, 'a']], $pipes, $docroot, $environment);
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the server.');
    }

    $base = "http://127.0.0.1:$port";
    $stopped = false;
    $stop = static function () use ($process, $log, &$stopped): void {
        if (!$stopped) {
            $stopped = true;
            proc_terminate($process);
            @proc_close($process);
            @unlink($log);
        }
    };
    $GLOBALS['TEST_SERVERS'][] = $stop;

    for ($i = 0; $i < 100; $i++) {
        $status = test_status($base . $ready);
        if ($status > 0) {
            return ['base' => $base, 'log' => $log, 'stop' => $stop];
        }
        usleep(50000);
    }
    throw new RuntimeException('The server did not start: ' . file_get_contents($log));
}

/** The status of a GET, 0 when nothing answers. */
function test_status(string $url): int
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 2, CURLOPT_CONNECTTIMEOUT => 1]);
    curl_exec($curl);

    return (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
}

/**
 * A settings folder for a server of this file's: this file's database (or
 * $database), and the sign-in settings given.
 */
function test_config_dir(array $auth, ?string $database = null): string
{
    return test_write_config(test_temp_dir('server-config'), ['name' => $database ?? dbName()] + machineDatabaseSettings(), $auth);
}

/**
 * A small stand-in for the built frontend (frontend/dist/piano-academy/browser):
 * what the router serves beside the API.
 */
function test_frontend_build(): string
{
    static $dir = null;
    if ($dir === null) {
        $dir = test_temp_dir('frontend');
        file_put_contents("$dir/index.html", "<!doctype html><html><head><title>Piano Academy</title></head><body><app-root></app-root><script src=\"main-TEST.js\" type=\"module\"></script></body></html>\n");
        file_put_contents("$dir/main-TEST.js", "console.log('piano');\n");
        file_put_contents("$dir/styles-TEST.css", "body { margin: 0; }\n");
        file_put_contents("$dir/changelog.json", '[{"version":"2.0","date":"2026-09-28","changes":{"added":["x"]}}]' . "\n");
        file_put_contents("$dir/theme-boot.js", "// theme\n");
        file_put_contents("$dir/secret.php", "<?php echo 'ran';\n");
        file_put_contents("$dir/.htaccess", "Deny from all\n");
        mkdir("$dir/media");
        file_put_contents("$dir/media/font-TEST.woff2", 'wOF2');
    }

    return $dir;
}

/**
 * The real server (router.php) with the given sign-in settings, against this
 * file's database. Checks it says it uses that database before any test talks
 * to it.
 */
function start_app(array $auth, array $env = []): array
{
    test_db();
    $app = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', $env + [
        'PIANO_TEST_CONFIG' => test_config_dir($auth),
        'PIANO_FRONTEND_DIST' => test_frontend_build(),
    ], '/api/health');
    $health = call($app['base'], 'GET', '/api/health')['body'];
    if (($health['database'] ?? null) !== dbName()) {
        throw new RuntimeException('The server uses ' . ($health['database'] ?? '?') . ', not this test\'s database.');
    }

    return $app;
}

/** What the server wrote to its error output that is not its request log: PHP warnings, [server] errors. */
function server_problems(array $app): array
{
    $lines = preg_split('/\R/', (string) @file_get_contents($app['log']));

    return array_values(array_filter($lines, static fn(string $line): bool => (bool) preg_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[server\]|\[db\]|Uncaught/i', $line)));
}

/**
 * An HTTP request. $body: an array/object is sent as JSON, a string as it is
 * (give its Content-Type in $headers). The answer: status, the JSON body
 * decoded to arrays (or the raw text), the raw text, the headers (lower-case
 * names; the last of a repeated one) and every Set-Cookie as name => value.
 *
 * @return array{status: int, body: mixed, raw: string, headers: array<string, string>, cookies: array<string, string>}
 */
function call(string $base, string $method, string $url, mixed $body = null, array $headers = []): array
{
    $content = null;
    if (is_string($body)) {
        $content = $body;
    } elseif ($body !== null) {
        $content = jsonText($body);
        $headers[] = 'Content-Type: application/json';
    }

    $responseHeaders = [];
    $cookies = [];
    $curl = curl_init($base . $url);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array_merge($headers, ['Expect:']),
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$responseHeaders, &$cookies): int {
            if (preg_match('~^HTTP/\S+\s+\d{3}~', $line)) {
                $responseHeaders = [];
            } elseif (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                $name = strtolower(trim($name));
                $responseHeaders[$name] = trim($value);
                if ($name === 'set-cookie' && preg_match('/^([^=;]+)=([^;]*)/', trim($value), $m)) {
                    $cookies[$m[1]] = $m[2];
                }
            }

            return strlen($line);
        },
    ]);
    if ($method === 'HEAD') {
        curl_setopt($curl, CURLOPT_NOBODY, true);
    }
    if ($content !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, $content);
    }
    $raw = curl_exec($curl);
    if ($raw === false) {
        throw new RuntimeException("$method $url: no answer (" . curl_error($curl) . ')');
    }
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $decoded = json_decode((string) $raw, true);

    return [
        'status' => $status,
        'body' => json_last_error() === JSON_ERROR_NONE ? $decoded : $raw,
        'raw' => (string) $raw,
        'headers' => $responseHeaders,
        'cookies' => $cookies,
    ];
}

/**
 * A form POST as a browser sends it (multipart/form-data): $fields by name,
 * $files as name => [file name, contents]. Returns what call() returns.
 */
function call_form(string $base, string $url, array $fields, array $files = [], array $headers = []): array
{
    $boundary = '----piano' . bin2hex(random_bytes(8));
    $body = '';
    foreach ($fields as $name => $value) {
        $body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n";
    }
    foreach ($files as $name => [$fileName, $contents]) {
        $body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"; filename=\"$fileName\"\r\n"
            . "Content-Type: application/json\r\n\r\n$contents\r\n";
    }
    $body .= "--$boundary--\r\n";

    return call($base, 'POST', $url, $body, array_merge(["Content-Type: multipart/form-data; boundary=$boundary"], $headers));
}

/* ------------------------------------------------ tokens signed by the tests */

/**
 * The tests' own signing key, with its public half written as a JWKS file:
 * ['kid', 'private_pem', 'jwks', 'jwks_file']. One per test file.
 */
function test_keys(): array
{
    static $keys = null;
    if ($keys === null) {
        $keys = anotoki_iam_test_keypair('piano-test-key');
        $keys['jwks_file'] = test_temp_dir('jwks') . '/jwks.json';
        file_put_contents($keys['jwks_file'], json_encode($keys['jwks']));
    }

    return $keys;
}

/** Sign-in settings for auth mode "iam" with the tests' key set. */
function test_auth_iam(array $extra = []): array
{
    return $extra + [
        'mode' => 'iam', 'issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'local_user_id' => 1,
        'cache_dir' => test_temp_dir('cache'), 'jwks_file' => test_keys()['jwks_file'],
    ];
}

/**
 * An access token for $userId as the IAM would sign it; $extra overrides
 * claims (an expired one, another audience…). The header's typ / kid / alg,
 * and the key, can be changed through $sign.
 */
function test_token(int $userId, array $extra = [], array $sign = []): string
{
    $keys = $sign['keys'] ?? test_keys();
    $claims = anotoki_iam_test_claims(['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT], $userId, ['MEMBER'], $extra);

    return anotoki_iam_test_sign($claims, $keys['private_pem'], $sign['kid'] ?? $keys['kid'], $sign['typ'] ?? 'at+jwt', $sign['alg'] ?? 'RS256');
}

/** The Authorization header for a token. */
function bearer(string $token): array
{
    return ['Authorization: Bearer ' . $token];
}
