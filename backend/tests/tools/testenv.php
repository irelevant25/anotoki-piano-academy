<?php

declare(strict_types=1);

/**
 * A throwaway copy of the app to try things on by hand or in a browser - its
 * own piano_test_ database and settings folder, never your data:
 *
 *   php tests/tools/testenv.php FOLDER [--db=piano_test_manual] [--auth=none|iam] [--issuer=URL] [--jwks=FILE] [--user=ID]
 *
 * makes the database (a copy of piano_test_template; php tests/run.php keeps
 * that up to date) unless it exists, and writes FOLDER/database.local.php and
 * FOLDER/auth.local.php. Then serve it:
 *
 *   PIANO_TEST_CONFIG=FOLDER php -S 127.0.0.1:8399 router.php
 *
 * and drop it afterwards: php tests/tools/testdb.php drop piano_test_manual.
 * --auth=iam signs in through --issuer (the stand-in IAM, tests/tools/fake-iam.php,
 * never the real one); --jwks gives it a key set on disk instead.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// By hand rather than getopt(), which stops at the folder and reads no option after it.
$folder = '';
$options = [];
foreach (array_slice($argv, 1) as $argument) {
    if (preg_match('/^--(db|auth|issuer|jwks|user)=(.*)$/', $argument, $m)) {
        $options[$m[1]] = $m[2];
    } elseif ($folder === '' && !str_starts_with($argument, '--')) {
        $folder = $argument;
    }
}
if ($folder === '') {
    fwrite(STDERR, "usage: php tests/tools/testenv.php FOLDER [--db=piano_test_manual] [--auth=none|iam] [--issuer=URL] [--jwks=FILE] [--user=ID]\n");
    exit(1);
}

$database = (string) ($options['db'] ?? 'piano_test_manual');
if (!preg_match('/^piano_test_[a-z0-9_]+$/D', $database) || $database === 'piano_test_template') {
    fwrite(STDERR, "testenv: only a piano_test_ database, never the template: $database\n");
    exit(1);
}

putenv('PIANO_TEST_CONFIG');
require __DIR__ . '/../../api/bootstrap.php';

$machine = PIANO_BACKEND . '/config/database.local.php';
if (!is_file($machine)) {
    fwrite(STDERR, "testenv: there is no config/database.local.php yet - open /setup.php first.\n");
    exit(1);
}
$server = require $machine;

if (!dbExists($server, $database)) {
    dbServer($server)->exec('CREATE DATABASE "' . $database . '" ENCODING \'UTF8\' TEMPLATE "piano_test_template"');
    dbServer($server)->exec('COMMENT ON DATABASE "' . $database . "\" IS 'piano test " . time() . "'");
    echo "made $database\n";
}

if (!is_dir($folder) && !mkdir($folder, 0777, true)) {
    fwrite(STDERR, "testenv: cannot make $folder\n");
    exit(1);
}
$auth = [
    'mode' => ($options['auth'] ?? 'none') === 'iam' ? 'iam' : 'none',
    'issuer' => rtrim((string) ($options['issuer'] ?? 'http://127.0.0.1:8397'), '/'),
    'client_id' => 'piano-academy',
    'local_user_id' => (int) ($options['user'] ?? 1),
    'cache_dir' => rtrim(str_replace('\\', '/', $folder), '/') . '/cache',
];
if (isset($options['jwks'])) {
    $auth['jwks_file'] = (string) $options['jwks'];
}
file_put_contents("$folder/database.local.php", '<?php return ' . var_export(['name' => $database] + $server, true) . ";\n");
file_put_contents("$folder/auth.local.php", '<?php return ' . var_export($auth, true) . ";\n");
echo "settings in $folder (auth mode {$auth['mode']}, database $database)\n";
