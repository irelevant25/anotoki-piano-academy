<?php

declare(strict_types=1);

/**
 * One person's progress as a file, and back - for an operator on a computer
 * with a shell (each person exports and imports their own in the app).
 *
 *   php tools/progress.php --export=FILE --user=ID
 *                          IAM user ID's progress as a file: to keep a copy,
 *                          or to take it to another database
 *   php tools/progress.php --import=FILE --user=ID [--replace]
 *                          an export into IAM user ID's account, which must
 *                          have no progress yet - or, with --replace, in the
 *                          place of the progress it has (the userId in the
 *                          file is not read)
 *   php tools/progress.php --move=FROM --to=TO
 *                          all of IAM user FROM's progress moves to IAM user
 *                          TO, who must have none (somebody who signed in
 *                          once under another id, say)
 *
 * --user is always given: there is no "yours" here - who a person is, is
 * their IAM user id (the IAM's admin panel shows it under Users). Nothing
 * here deletes anybody's progress but --replace, which is asked for by name.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/bootstrap.php';

function stop(string $message): never
{
    fwrite(STDERR, PHP_EOL . 'progress: ' . $message . PHP_EOL . PHP_EOL);
    exit(1);
}

function say(string $line): void
{
    fwrite(STDOUT, $line . PHP_EOL);
}

/** An IAM user id from an option, which must be there. */
function userOption(array $options, string $name): int
{
    if (!isset($options[$name])) {
        stop("--$name is needed: an IAM user id (the IAM admin panel shows it under Users).");
    }
    $id = (string) $options[$name];
    if (!ctype_digit($id) || (int) $id < 1 || strlen($id) > 18) {
        stop("--$name must be an IAM user id (a whole number from 1).");
    }

    return (int) $id;
}

$options = getopt('', ['export:', 'import:', 'move:', 'to:', 'user:', 'replace']);

if (!isset($options['export']) && !isset($options['import']) && !isset($options['move'])) {
    // What this file's comment says, to its end.
    $text = (string) file_get_contents(__FILE__);
    echo substr($text, 0, (int) strpos($text, ' */') + 3) . PHP_EOL;
    exit(1);
}

$problem = settingsProblem();
if ($problem !== null) {
    stop('Not set up yet: ' . $problem . ' Open /setup.php in a browser first.');
}

try {
    if (pendingMigrationsReadOnly(db()) !== []) {
        stop('The database needs an update first: php migration.php');
    }

    if (isset($options['move'])) {
        $from = userOption($options, 'move');
        $to = userOption($options, 'to');
        $moved = transferReassign($from, $to);
        say($moved['moved']
            ? "Moved the progress of IAM user $from to IAM user $to: {$moved['notes']} notes, {$moved['sessions']} sessions."
            : "Nothing to move: IAM user $from has no progress here.");
    }

    if (isset($options['import'])) {
        $userId = userOption($options, 'user');
        $data = transferReadFile((string) $options['import']);
        $counts = transferImport($userId, $data, isset($options['replace']));
        say(($counts['replaced'] ? "Replaced the progress of IAM user $userId with the file's" : "Imported into IAM user $userId")
            . ": {$counts['notes']} notes, {$counts['steps']} path steps, {$counts['sessions']} sessions.");
        foreach ($data['problems'] as $line) {
            say("  left out: $line");
        }
    }

    // After the rest, so an export holds what the database holds now.
    if (isset($options['export'])) {
        $file = (string) $options['export'];
        if (file_exists($file)) {
            stop("$file exists already. Choose another name.");
        }
        $userId = userOption($options, 'user');
        $export = transferExport($userId);
        if (@file_put_contents($file, json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n") === false) {
            stop("Cannot write $file");
        }
        say("Exported IAM user $userId to $file: " . count(get_object_vars($export['progress'])) . ' notes, '
            . count(get_object_vars($export['path']->steps)) . ' path steps, ' . count($export['sessions']) . ' sessions.');
    }
} catch (PDOException $e) {
    stop('Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    stop($e->getMessage());
}
