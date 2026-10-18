<?php

declare(strict_types=1);

/**
 * tools/translations.php - the app's own strings from the command line: the
 * anotoki family's command (anotoki/lib's Cli\TranslationsCommand) on this
 * app's database and frontend. For a computer with a shell and the whole
 * repository; it is never uploaded (the live site's strings are edited in the
 * browser, on the admin panel's Translations page).
 *
 *   php tools/translations.php --status            the keys the frontend uses against the database's, and how
 *                                                  much of each language there is; exit 1 when one is missing,
 *                                                  has no English string, or is asked for in a way the scan does
 *                                                  not let through (keys nobody uses and stored strings a save
 *                                                  would refuse are said, and do not fail it)
 *   php tools/translations.php --export sk [file]  a language's own strings as flat JSON (to the screen without a file)
 *   php tools/translations.php --import sk file    and back in: checked as a save in the browser is,
 *                                                  all of it or none of it; an empty string is passed over
 *
 * The strings live in the database so they can be reworded in the browser,
 * which means nothing stops a page asking for a key no migration wrote - it
 * would show the key itself. --status is the check for that, and the same
 * scan runs in the tests (tools/translation_keys.php says what of the
 * frontend it reads; tests/unit/translations.test.php holds the database to
 * it).
 *
 * It works on the database in config/database.local.php, which setup.php
 * writes, and refuses while the database is behind the code (a migration
 * waits: php migration.php). What it writes is written by nobody
 * (updated_by is null), as a migration's strings are.
 */

use Anotoki\Lib\Translations\Cli\TranslationsCommand;
use Anotoki\Lib\Translations\Translations;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

require_once __DIR__ . '/../api/bootstrap.php';
require_once __DIR__ . '/translation_keys.php';

// What it does is said without any settings; everything else needs them.
$help = in_array($argv[1] ?? '', ['--help', '-h'], true);
if (!$help) {
    $problem = settingsProblem();
    if ($problem !== null) {
        fwrite(STDERR, "Not set up yet: $problem\n  Open /setup.php in a browser (composer start in backend/, then http://localhost:8300/setup.php).\n");
        exit(1);
    }
}

$command = new TranslationsCommand(
    static fn(): Translations => translations(),
    translationKeyScanner(),
    pending: static fn(): array => array_map('migrationLabel', databaseMigrator()->applicable()),
    title: $help ? 'piano_academy' : 'piano_academy (' . dbName() . "): the app's own strings",
);

exit($command->run($argv));
