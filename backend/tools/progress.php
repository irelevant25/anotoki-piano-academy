<?php

declare(strict_types=1);

/**
 * Your progress as a file, and back - on a computer with a shell (the live
 * site's setup page takes an export instead).
 *
 *   php tools/progress.php --export=FILE [--user=ID]
 *                          one person's progress as a file (yours unless --user):
 *                          to keep a copy, or to take it to the hosted site
 *   php tools/progress.php --import=PATH [--user=ID]
 *                          progress into an account that has none yet (yours
 *                          unless --user): an export, or a folder with the old
 *                          progress.json / sessions.json / path.json
 *   php tools/progress.php --owner=ID
 *                          you are IAM user ID: your progress moves there, and
 *                          config/auth.local.php remembers it (local_user_id)
 *
 * "Yours" is local_user_id in config/auth.local.php. The files in server/data/
 * are only ever read: nothing here writes into that folder or deletes progress.
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

/** An IAM user id from an option, or the owner's. */
function userOption(array $options, string $name = 'user'): int
{
    if (!isset($options[$name])) {
        return authLocalUserId();
    }
    $id = (string) $options[$name];
    if (!ctype_digit($id) || (int) $id < 1 || strlen($id) > 18) {
        stop("--$name must be an IAM user id (a whole number from 1).");
    }

    return (int) $id;
}

$options = getopt('', ['export:', 'import:', 'owner:', 'user:']);

if (!isset($options['export']) && !isset($options['import']) && !isset($options['owner'])) {
    echo file_get_contents(__FILE__, false, null, 0, 1200);
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

    if (isset($options['owner'])) {
        $from = authLocalUserId();
        $to = userOption($options, 'owner');
        $moved = transferReassign($from, $to);
        say($moved['moved']
            ? "Moved your progress from IAM user $from to IAM user $to: {$moved['notes']} notes, {$moved['sessions']} sessions."
            : "Nothing to move: IAM user $from has no progress here.");
        if ($from !== $to) {
            writeLocalConfig('auth', ['local_user_id' => $to] + authSettings());
            say("Saved in config/auth.local.php: you are IAM user $to.");
        }
    }

    if (isset($options['import'])) {
        $userId = userOption($options);
        $data = transferRead((string) $options['import']);
        $counts = transferImport($userId, $data);
        say("Imported into IAM user $userId: {$counts['notes']} notes, {$counts['steps']} path steps, {$counts['sessions']} sessions.");
        foreach ($data['problems'] as $line) {
            say("  left out: $line");
        }
    }

    // After the rest, so an export holds what the database holds now.
    if (isset($options['export'])) {
        $file = (string) $options['export'];
        $real = realpath(dirname($file));
        $serverData = realpath(dirname(PIANO_BACKEND) . '/server/data');
        if ($real !== false && $serverData !== false && str_starts_with(str_replace('\\', '/', $real) . '/', str_replace('\\', '/', $serverData) . '/')) {
            stop('Not into server/data/: those files are the history from before the database.');
        }
        if (file_exists($file)) {
            stop("$file exists already. Choose another name.");
        }
        $userId = userOption($options);
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
