<?php

declare(strict_types=1);

/**
 * tools/translations.php - the app's own strings from the command line. For a
 * computer with a shell and the whole repository; it is never uploaded (the
 * live site's strings are edited in the browser, on the owner's pages).
 *
 *   php tools/translations.php --status            the keys the frontend uses against the database's;
 *                                                  exit 1 when one is missing, has no English string, or is
 *                                                  asked for in a way the scan does not let through
 *   php tools/translations.php --export sk [file]  a language's own strings as flat JSON (to the screen without a file)
 *   php tools/translations.php --import sk file    and back in: checked as a save in the browser is,
 *                                                  all of it or none of it; an empty string is passed over
 *
 * The strings live in the database so they can be reworded in the browser,
 * which means nothing stops a page asking for a key no migration wrote - it
 * would show the key itself. --status is the check for that, and the same
 * scan runs in the tests (tools/translation_keys.php says how a key is
 * recognised; tests/unit/translations.test.php holds the database to it).
 *
 * It works on the database in config/database.local.php, which setup.php
 * writes, and what it writes is written by nobody (updated_by is null), as a
 * migration's strings are.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/bootstrap.php';
require_once __DIR__ . '/translation_keys.php';

function colour(string $colour, string $text): string
{
    $codes = ['red' => 31, 'green' => 32, 'yellow' => 33, 'cyan' => 36];

    return "\033[" . ($codes[$colour] ?? 0) . 'm' . $text . "\033[0m";
}

function say(string $colour, string $text): void
{
    echo colour($colour, $text) . "\n";
}

/** Says why not, on the error output, and ends with 1. */
function refuse(string $text): never
{
    fwrite(STDERR, colour('red', $text) . "\n");
    exit(1);
}

/** The frontend's keys against the database's, and how much of each language there is. */
function commandStatus(): int
{
    $root = translationKeysFrontendRoot();
    if (!is_dir($root)) {
        refuse('There is no frontend here to read the keys from (frontend/src/app).');
    }

    $keys = array_column(dbAll('SELECT name FROM translation_keys ORDER BY name COLLATE "C"'), 'name');
    $scan = translationKeysScan($root, $keys);
    $noEnglish = array_column(dbAll(
        'SELECT k.name FROM translation_keys k
          WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = ?)
          ORDER BY k.name COLLATE "C"',
        [TRANSLATION_FALLBACK]
    ), 'name');

    printf("  the database has     %d key%s\n", count($keys), count($keys) === 1 ? '' : 's');
    printf("  the frontend uses    %d of them\n", count($scan['used']));

    if ($scan['missing']) {
        say('red', "\n  Used by the frontend, not in the database - the page shows the key itself:");
        foreach ($scan['missing'] as $key => $where) {
            echo "    $key\n";
            foreach (array_unique($where) as $place) {
                echo "        $place\n";
            }
        }
    }
    if ($noEnglish) {
        say('red', "\n  No English string, so nothing to fall back to:");
        foreach ($noEnglish as $key) {
            echo "    $key\n";
        }
    }
    if ($scan['problems']) {
        say('red', "\n  What the scan does not let through:");
        foreach ($scan['problems'] as $problem) {
            echo "    $problem\n";
        }
    }
    if ($scan['unused']) {
        say('yellow', "\n  In the database, used nowhere - a migration deletes a key the code has stopped using:");
        foreach ($scan['unused'] as $key) {
            echo "    $key\n";
        }
    }

    echo "\n";
    foreach (dbAll(
        'SELECT l.code, l.name, l.enabled, (SELECT count(*) FROM translations t WHERE t.language_code = l.code) AS strings
           FROM languages l ORDER BY l.sort_order, l.name, l.code'
    ) as $language) {
        printf("  %-6s %-20s %4d / %d%s\n", $language['code'], $language['name'], $language['strings'], count($keys), $language['enabled'] ? '' : '   (not offered)');
    }
    echo "\n";

    if ($scan['missing'] || $noEnglish || $scan['problems']) {
        say('red', '  Not clean.');

        return 1;
    }
    say('green', '  Clean.');

    return 0;
}

/** A language's own strings - not merged with English - to a file, or to the screen. */
function commandExport(string $code, ?string $file): int
{
    $values = (array) translationsExport($code);
    if ($file === null) {
        echo translationFileText($values);

        return 0;
    }
    translationFileWrite($file, $values);
    say('green', '  ' . count($values) . ' string' . (count($values) === 1 ? '' : 's') . " of \"$code\" written to $file");

    return 0;
}

/** A file of strings into a language: checked like a save in the browser, written by nobody (updated_by NULL). */
function commandImport(string $code, string $file): int
{
    $values = translationFileRead($file);
    $before = languageRow($code) === null ? [] : translationsOf($code);
    translationsImport($code, $values, null);
    $after = translationsOf($code);

    $changed = count(array_diff_assoc($after, $before));
    say('green', '  ' . count($values) . ' string' . (count($values) === 1 ? '' : 's') . " in $file: $changed changed in \"$code\", the rest as they were (or empty, and passed over).");

    return 0;
}

$command = $argv[1] ?? '--status';
if (in_array($command, ['--help', '-h'], true)) {
    echo "php tools/translations.php --status | --export CODE [FILE] | --import CODE FILE\n\n"
        . "  --status            the keys the frontend uses against the database's; exit 1 when one is missing, has no English\n"
        . "                      string, or is asked for in a way the scan does not let through\n"
        . "  --export CODE       a language's own strings as flat JSON, to FILE or to the screen\n"
        . "  --import CODE FILE  and back in: checked as a save in the browser is, all of it or none of it\n";
    exit(0);
}

$problem = settingsProblem();
if ($problem !== null) {
    say('red', 'Not set up yet: ' . $problem);
    echo "  Open /setup.php in a browser (start.ps1 / start.sh open it for you).\n";
    exit(1);
}

try {
    $pending = pendingMigrationsReadOnly(db());
} catch (Throwable $e) {
    refuse('Cannot reach the database ' . dbName() . ': ' . $e->getMessage());
}
if ($pending !== []) {
    refuse('The database ' . dbName() . ' needs an update first (' . implode(', ', $pending) . '): php migration.php');
}

try {
    switch ($command) {
        case '--status':
            say('cyan', "\n== piano_academy (" . dbName() . "): the app's own strings\n");
            exit(commandStatus());

        case '--export':
            if (!isset($argv[2])) {
                refuse('usage: php tools/translations.php --export CODE [FILE]');
            }
            exit(commandExport((string) $argv[2], $argv[3] ?? null));

        case '--import':
            if (!isset($argv[2], $argv[3])) {
                refuse('usage: php tools/translations.php --import CODE FILE');
            }
            exit(commandImport((string) $argv[2], (string) $argv[3]));

        default:
            refuse("Unknown command $command. php tools/translations.php --status | --export CODE [FILE] | --import CODE FILE");
    }
} catch (ApiError $e) {
    // What the API would have answered: the sentence, and the keys it is about.
    fwrite(STDERR, colour('red', '  Refused (' . $e->errorCode . '): ' . $e->getMessage()) . "\n");
    foreach ($e->extra['keys'] ?? [] as $key) {
        fwrite(STDERR, "    $key\n");
    }
    exit(1);
} catch (RuntimeException $e) {
    refuse('  ' . $e->getMessage());
}
