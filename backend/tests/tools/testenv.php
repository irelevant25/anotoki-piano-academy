<?php

declare(strict_types=1);

/**
 * A throwaway copy of the app to try things on by hand or in a browser - its
 * own piano_test_ database and settings folder, never your data:
 *
 *   php tests/tools/testenv.php FOLDER [--db=piano_test_manual] [--issuer=URL] [--jwks=FILE] [--application-ttl=SECONDS]
 *
 * makes the database (a copy of piano_test_template; php tests/run.php keeps
 * that up to date) unless it exists, and writes FOLDER/database.local.php and
 * FOLDER/auth.local.php. Then serve it:
 *
 *   PIANO_TEST_CONFIG=FOLDER php -S 127.0.0.1:8590 router.php
 *
 * and drop it afterwards: php tests/tools/testdb.php drop piano_test_manual.
 * The IAM is --issuer: the anotoki family's stand-in,
 * vendor/anotoki/lib/backend/testing/stand-in-iam.php (its header says how to run
 * it; its key from the library's TestIam), never the real one; --jwks gives it a key set on disk
 * instead of the one it would download. The app asks that IAM whether it
 * requires sign-in (the stand-in's `login_required`) and keeps the answer a
 * minute in FOLDER/cache; --application-ttl keeps it shorter (a check that
 * switches sign-in mid-run).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

// By hand rather than getopt(), which stops at the folder and reads no option after it.
$folder = '';
$options = [];
foreach (array_slice($argv, 1) as $argument) {
    if (preg_match('/^--(db|issuer|jwks|application-ttl)=(.*)$/', $argument, $m)) {
        $options[$m[1]] = $m[2];
    } elseif ($folder === '' && !str_starts_with($argument, '--')) {
        $folder = $argument;
    } else {
        fwrite(STDERR, "testenv: what is $argument? (There is no --auth or --user any more: everybody signs in through the IAM.)\n");
        exit(1);
    }
}
if ($folder === '') {
    fwrite(STDERR, "usage: php tests/tools/testenv.php FOLDER [--db=piano_test_manual] [--issuer=URL] [--jwks=FILE] [--application-ttl=SECONDS]\n");
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
    'issuer' => rtrim((string) ($options['issuer'] ?? 'http://127.0.0.1:8597'), '/'),
    'client_id' => 'piano-academy',
    'cache_dir' => rtrim(str_replace('\\', '/', $folder), '/') . '/cache',
];
if (isset($options['jwks'])) {
    $auth['jwks_file'] = (string) $options['jwks'];
}
if (isset($options['application-ttl'])) {
    if (!preg_match('/^[1-9][0-9]{0,4}$/D', $options['application-ttl'])) {
        fwrite(STDERR, "testenv: --application-ttl is a number of seconds\n");
        exit(1);
    }
    $auth['application_ttl'] = (int) $options['application-ttl'];
}
file_put_contents("$folder/database.local.php", '<?php return ' . var_export(['name' => $database] + $server, true) . ";\n");
file_put_contents("$folder/auth.local.php", '<?php return ' . var_export($auth, true) . ";\n");
echo "settings in $folder (IAM {$auth['issuer']}, database $database)\n";
