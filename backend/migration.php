<?php

declare(strict_types=1);

/**
 * migration.php - brings the database up to date from the migrations, and
 * nothing else. For a computer with a shell; the live site has none: there
 * an administrator applies an update on the admin panel's Migrations page.
 *
 *   php migration.php              create the database if missing, apply what is pending
 *   php migration.php --status     say what has run and what has not
 *   php migration.php --dry-run    say what would be applied, and apply nothing
 *
 * The migrations are the schema (migrations/piano_academy/NNN_name.sql, then
 * the family's library's set of the words, anotoki_translations - named so
 * here): a database is what you get by applying 001 and everything after it
 * in order. A file recorded as applied is never run again, so editing one
 * that has been applied changes nothing where it ran - write another instead.
 *
 * The connection is config/database.local.php, which setup.php writes. The
 * engine is the anotoki family's (anotoki/lib, api/migrations.php): it takes
 * the same lock as setup.php's Save and an administrator's Apply in the app -
 * while one of those runs, this says so and applies nothing.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/api/bootstrap.php';

function colour(string $colour, string $text): string
{
    $codes = ['red' => 31, 'green' => 32, 'yellow' => 33, 'cyan' => 36];

    return "\033[" . ($codes[$colour] ?? 0) . 'm' . $text . "\033[0m";
}

function say(string $colour, string $text): void
{
    echo colour($colour, $text) . "\n";
}

$options = getopt('', ['status', 'dry-run', 'help']);

if (isset($options['help'])) {
    // What this file's comment says, to its end.
    $text = (string) file_get_contents(__FILE__);
    echo substr($text, 0, (int) strpos($text, ' */') + 3) . PHP_EOL;
    exit(0);
}

$problem = settingsProblem();
if ($problem !== null) {
    say('red', 'Not set up yet: ' . $problem);
    echo "  Open /setup.php in a browser (composer start in backend/, then http://localhost:8300/setup.php).\n";
    exit(1);
}

$statusOnly = isset($options['status']);
$dryRun = isset($options['dry-run']);
$settings = databaseSettings();
$name = (string) $settings['name'];

say('cyan', "\n== piano_academy ({$name})");

try {
    if (!$statusOnly && !$dryRun && ensureDatabase($settings, $name)) {
        say('green', '  Database created.');
    }
    $migrator = databaseMigrator(dbConnect($settings));
    // Read only: nothing is created to find out.
    $status = $migrator->status();
} catch (Throwable $e) {
    say('red', '  Cannot reach it: ' . $e->getMessage());
    exit(1);
}

// Every set's files, in the order they run: the app's own, then the library's (named with their set).
$files = [];
foreach (migrationSets() as $set) {
    foreach ($migrator->files($set) as $file) {
        $files[] = migrationLabel(['set' => $set->name, 'name' => $file]);
    }
}
$pending = array_map('migrationLabel', $status['pending']);

if ($statusOnly) {
    foreach ($files as $file) {
        $done = !in_array($file, $pending, true);
        echo '  ' . ($done ? colour('green', 'v') : colour('yellow', '.')) . ' ' . $file . ($done ? '' : colour('yellow', '   pending')) . "\n";
    }
    foreach ($status['missing'] as $file) {
        echo '  ' . colour('red', '?') . ' ' . migrationLabel($file) . colour('red', '   recorded as applied, but the file is not here') . "\n";
    }
    printf("  %d applied, %d pending\n", count($status['applied']), count($pending));
    exit(0);
}

if ($dryRun) {
    if (!$pending) {
        say('green', '  Up to date - ' . count($files) . ' migration' . (count($files) === 1 ? '' : 's') . '.');
    }
    foreach ($pending as $file) {
        say('yellow', '  would apply ' . $file);
    }
    exit(0);
}

// What is pending is asked again under the lock: another update may have applied some since.
try {
    $result = $migrator->apply();
} catch (Throwable $e) {
    say('red', '  Cannot reach it: ' . $e->getMessage());
    exit(1);
}

if ($result['busy']) {
    say('red', '  Another update is running (the setup page, the admin panel\'s Migrations page, or another php migration.php). Nothing was applied; try again in a moment.');
    exit(1);
}

foreach ($result['applied'] as $file) {
    echo '  ' . migrationLabel($file) . ' ... ' . colour('green', 'done') . "\n";
}

if ($result['failed'] !== null) {
    echo '  ' . migrationLabel($result['failed']) . ' ... ' . colour('red', 'FAILED') . "\n";
    say('red', '    ' . str_replace("\n", "\n    ", (string) $result['error']));
    say('yellow', '    Nothing from this file was applied. The migrations before it stand.');
    exit(1);
}

if (!$result['applied']) {
    say('green', '  Up to date - ' . count($files) . ' migration' . (count($files) === 1 ? '' : 's') . '.');
}

exit(0);
