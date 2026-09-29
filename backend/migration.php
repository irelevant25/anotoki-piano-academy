<?php

declare(strict_types=1);

/**
 * migration.php - brings the database up to date from the migrations, and
 * nothing else. For a computer with a shell; the live site has none, and
 * setup.php does the same there.
 *
 *   php migration.php              create the database if missing, apply what is pending
 *   php migration.php --status     say what has run and what has not
 *   php migration.php --dry-run    say what would be applied, and apply nothing
 *
 * The migrations are the schema (migrations/piano_academy/NNN_name.sql): a
 * database is what you get by applying 001 and everything after it in order.
 * A file recorded as applied is never run again, so editing one that has been
 * applied changes nothing where it ran - write another instead.
 *
 * The connection is config/database.local.php, which setup.php writes.
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
    echo file_get_contents(__FILE__, false, null, 0, 1100);
    exit(0);
}

$problem = settingsProblem();
if ($problem !== null) {
    say('red', 'Not set up yet: ' . $problem);
    echo "  Open /setup.php in a browser (start.ps1 / start.sh open it for you).\n";
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
    $pdo = dbConnect($settings);
    $pending = ($statusOnly || $dryRun) ? pendingMigrationsReadOnly($pdo) : pendingMigrations($pdo);
} catch (Throwable $e) {
    say('red', '  Cannot reach it: ' . $e->getMessage());
    exit(1);
}

$files = migrationFiles();

if ($statusOnly) {
    foreach ($files as $file) {
        $done = !in_array($file, $pending, true);
        echo '  ' . ($done ? colour('green', 'v') : colour('yellow', '.')) . ' ' . $file . ($done ? '' : colour('yellow', '   pending')) . "\n";
    }
    printf("  %d applied, %d pending\n", count($files) - count($pending), count($pending));
    exit(0);
}

if (!$pending) {
    say('green', '  Up to date - ' . count($files) . ' migration' . (count($files) === 1 ? '' : 's') . '.');
}

foreach ($pending as $file) {
    if ($dryRun) {
        say('yellow', '  would apply ' . $file);
        continue;
    }

    echo '  ' . $file . ' ... ';

    try {
        applyMigration($pdo, MIGRATIONS_ALIAS, $file);
        say('green', 'done');
    } catch (Throwable $e) {
        say('red', 'FAILED');
        say('red', '    ' . $e->getMessage());
        say('yellow', '    Nothing from this file was applied. The migrations before it stand.');
        exit(1);
    }
}

exit(0);
