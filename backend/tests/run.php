<?php

declare(strict_types=1);

/**
 * Runs the PHP tests: tests/unit/*.test.php and tests/api/*.test.php. Each file
 * runs in its own PHP process with its own throwaway database, copied from
 * piano_test_template (made or brought up to date here first) - see
 * tests/lib.php. Four files run at a time.
 *
 *   php tests/run.php                              every file
 *   php tests/run.php tests/api/auth.test.php …    some files
 *
 * With another PHP - the hosting's version, say - call that binary instead of
 * `php` (any PHP 8.2 or newer with pdo_pgsql, openssl and curl): every file
 * runs under the PHP that runs this. The databases are made on the server in
 * config/database.local.php, so set the app up first (setup.php).
 */

$root = dirname(__DIR__);
$files = array_slice($argv, 1);
if (!$files) {
    $files = array_merge(glob("$root/tests/unit/*.test.php") ?: [], glob("$root/tests/api/*.test.php") ?: []);
}
foreach (['pdo_pgsql', 'openssl', 'curl'] as $extension) {
    if (!extension_loaded($extension)) {
        fwrite(STDERR, "The tests need PHP's $extension extension; this PHP (" . PHP_VERSION . ") has none.\n");
        exit(1);
    }
}

$started = microtime(true);
$tmp = str_replace('\\', '/', sys_get_temp_dir());
$null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
echo 'PHP ' . PHP_VERSION . "\n";

// the template database: every file's database is a copy of it
foreach (['sweep', 'template'] as $step) {
    passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg("$root/tests/tools/testdb.php") . " $step", $code);
    if ($code) {
        fwrite(STDERR, "Could not prepare the test database (is PostgreSQL running? is the app set up - config/database.local.php?).\n");
        exit(1);
    }
}

$env = getenv();
unset($env['PIANO_TEST_CONFIG']);
$queue = array_values($files);
$running = [];
$done = [];
$next = 0;
$run = static function (int $i) use (&$running, $queue, $env, $root, $tmp, $null): void {
    $out = (string) tempnam($tmp, 'piano-test-out-');
    $process = proc_open(
        [PHP_BINARY, $queue[$i]],
        [0 => ['file', $null, 'r'], 1 => ['file', $out, 'w'], 2 => ['redirect', 1]],
        $pipes,
        $root,
        ['PIANO_TEST_DB' => 'piano_test_' . getmypid() . "_$i"] + $env
    );
    $running[$i] = [$process, $out];
};

while ($next < count($queue) || $running) {
    while ($next < count($queue) && count($running) < 4) {
        $run($next++);
    }
    foreach ($running as $i => [$process, $out]) {
        $status = proc_get_status($process);
        if (!$status['running']) {
            proc_close($process);
            $done[$i] = (string) file_get_contents($out);
            @unlink($out);
            unset($running[$i]);
        }
    }
    usleep(20000);
}

$pass = $fail = 0;
foreach ($queue as $i => $file) {
    $relative = str_replace('\\', '/', substr((string) (realpath($file) ?: $file), strlen((string) realpath($root)) + 1));
    echo "> $relative\n";
    $output = $done[$i];
    if (preg_match('/^##piano (.+)$/m', $output, $m)) {
        $counts = json_decode($m[1], true);
        $pass += $counts['pass'];
        $fail += $counts['fail'];
        $output = str_replace($m[0] . "\n", '', $output);
    } else {
        $fail++;
        $output .= "  FAIL the file did not finish\n";
    }
    echo $output;
}
printf("tests %d, pass %d, fail %d, %d ms\n", $pass + $fail, $pass, $fail, round((microtime(true) - $started) * 1000));
exit($fail ? 1 : 0);
