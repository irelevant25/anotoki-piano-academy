<?php

declare(strict_types=1);

/**
 * Your data outside the database, and back in:
 *
 *   the old files   server/data/progress.json, sessions.json (and path.json),
 *                   which the first version of the app kept before it had a
 *                   database. setup.php imports them once, into the owner's
 *                   account (local_user_id). They are only ever read: they
 *                   stay in git as the history from before the database.
 *   an export       one person's data as one JSON file (php tools/progress.php
 *                   --export), to move it to another database - the hosted
 *                   site's setup page takes one.
 *   a new owner     all of one person's data moved to another IAM user id
 *                   (php tools/progress.php --owner=ID).
 */

const EXPORT_FORMAT = 'piano-academy-export';

/** The imports row of the one-time import of server/data/. */
const IMPORT_SERVER_DATA = 'server-data';

/**
 * Where the old progress files are: server/data/ at the top of the repository,
 * beside backend/. (With the tests' settings, the copy in their folder.)
 */
function serverDataDir(): string
{
    return usingTestConfig() ? configDir() . '/server-data' : dirname(PIANO_BACKEND) . '/server/data';
}

/** A JSON file with its objects kept as objects; throws, naming the file, on anything that is not JSON. */
function transferJsonFile(string $file): mixed
{
    $text = @file_get_contents($file);
    if ($text === false) {
        throw new RuntimeException("Cannot read $file");
    }
    try {
        return json_decode($text, false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new RuntimeException(basename($file) . " is not valid JSON ({$e->getMessage()})", 0, $e);
    }
}

/**
 * What $path holds, ready to import: a folder with the old files (each one
 * optional), or an export file. A progress or path document that is not one
 * stops everything - better nothing than half. A session that does not pass
 * the checks of POST /api/sessions is left out and listed in 'problems'.
 *
 * @return array{progress: ?stdClass, path: ?stdClass, sessions: array, problems: string[], from: string}
 */
function transferRead(string $path): array
{
    $from = str_replace('\\', '/', $path);
    $data = ['progress' => null, 'path' => null, 'sessions' => [], 'problems' => [], 'from' => $from];
    $item = 'sessions.json item';

    if (is_dir($path)) {
        $files = [];
        foreach (['progress', 'sessions', 'path'] as $name) {
            $file = "$path/$name.json";
            $files[$name] = is_file($file) ? transferJsonFile($file) : null;
        }
        [$progress, $sessions, $pathDocument] = [$files['progress'], $files['sessions'], $files['path']];
    } elseif (is_file($path)) {
        $export = transferJsonFile($path);
        if (!($export instanceof stdClass) || ($export->format ?? null) !== EXPORT_FORMAT) {
            throw new RuntimeException('That file is not a Piano Academy export (php tools/progress.php --export writes one).');
        }
        [$progress, $sessions, $pathDocument] = [$export->progress ?? null, $export->sessions ?? null, $export->path ?? null];
        $item = 'session';
    } else {
        throw new RuntimeException("There is no file or folder $from");
    }

    if ($progress !== null) {
        try {
            $data['progress'] = storeCheckProgress($progress);
        } catch (ApiError $e) {
            throw new RuntimeException("$from: the note progress is not a progress document ({$e->getMessage()})");
        }
    }
    if ($pathDocument !== null) {
        try {
            $data['path'] = storeCheckPath($pathDocument);
        } catch (ApiError $e) {
            throw new RuntimeException("$from: the learning-path progress is not a path document ({$e->getMessage()})");
        }
    }
    if ($sessions !== null && !is_array($sessions)) {
        throw new RuntimeException("$from: the sessions are not a list");
    }

    $ids = [];
    foreach (array_values($sessions ?? []) as $i => $session) {
        $where = "$item " . ($i + 1);
        try {
            $clean = storeCleanSession($session);
        } catch (ApiError $e) {
            $data['problems'][] = "$where: {$e->getMessage()}";
            continue;
        }
        // The id and time it was stored with: the browser shows and sorts by them.
        $id = is_string($session->id ?? null) && preg_match('/^[A-Za-z0-9._-]{1,64}$/D', $session->id) ? $session->id : null;
        if ($id === null || isset($ids[$id])) {
            if ($id !== null) {
                $data['problems'][] = "$where: its id $id was used before, so it got a new one";
            }
            $id = storeNewSessionId() . 'i' . $i;
        }
        $ids[$id] = true;

        $recordedAt = null;
        foreach (['recordedAt', 'endedAt', 'startedAt'] as $field) {
            if (storeIsIsoTime($session->$field ?? null)) {
                $recordedAt = $session->$field;
                break;
            }
        }
        $data['sessions'][] = ['id' => $id, 'recordedAt' => $recordedAt ?? isoNow(), 'data' => $clean];
    }

    return $data;
}

/**
 * Puts data from transferRead() into one person's account, in one
 * transaction - and only into an account without any data yet, so nothing is
 * ever overwritten or counted twice.
 *
 * @return array{notes: int, steps: int, sessions: int}
 */
function transferImport(int $userId, array $data): array
{
    return dbTx(static function () use ($userId, $data): array {
        if (storeHasData($userId)) {
            throw new RuntimeException("User $userId already has progress; nothing was imported.");
        }
        usersSeen($userId, null);

        $counts = ['notes' => 0, 'steps' => 0, 'sessions' => 0];
        if ($data['progress'] !== null) {
            storeSaveProgress($userId, $data['progress']);
            $counts['notes'] = count(get_object_vars($data['progress']));
        }
        if ($data['path'] !== null) {
            storeSavePath($userId, $data['path']);
            $counts['steps'] = count(get_object_vars($data['path']->steps));
        }
        foreach ($data['sessions'] as $session) {
            dbExec(
                'INSERT INTO sessions (user_id, id, recorded_at, data) VALUES (?, ?, ?::timestamptz, ?::jsonb)',
                [$userId, $session['id'], $session['recordedAt'], jsonText($session['data'])]
            );
            $counts['sessions']++;
        }

        return $counts;
    });
}

/** Has the one-time import of server/data/ happened in this database? */
function serverDataImported(): bool
{
    return (bool) dbValue('SELECT EXISTS (SELECT 1 FROM imports WHERE source = ?)', [IMPORT_SERVER_DATA]);
}

/** The record of that import, or null: when, into whom, how much. */
function serverDataImport(): ?array
{
    $row = dbOne('SELECT user_id, imported_at, summary::text AS summary FROM imports WHERE source = ?', [IMPORT_SERVER_DATA]);

    return $row === null ? null : ['user' => (int) $row['user_id'], 'at' => (string) $row['imported_at']] + (json_decode((string) $row['summary'], true) ?: []);
}

/**
 * The one-time import of the old files in $dir (server/data/) into the
 * owner's account: once, and only while that account has no data.
 * Returns what was imported, or ['skipped' => why not].
 */
function transferImportServerData(string $dir, int $userId): array
{
    if (serverDataImported()) {
        return ['skipped' => 'already imported'];
    }
    // before reading any file: an account with data needs none of them
    if (storeHasData($userId)) {
        return ['skipped' => "user $userId already has progress"];
    }

    $data = transferRead($dir);
    if ($data['progress'] === null && $data['path'] === null && !$data['sessions'] && !$data['problems']) {
        return ['skipped' => 'no progress files in ' . str_replace('\\', '/', $dir)];
    }

    return dbTx(static function () use ($data, $userId): array {
        $summary = transferImport($userId, $data) + ['user' => $userId, 'from' => 'server/data', 'problems' => $data['problems']];
        dbExec('INSERT INTO imports (source, user_id, summary) VALUES (?, ?, ?::jsonb)', [IMPORT_SERVER_DATA, $userId, jsonText($summary)]);

        return $summary;
    });
}

/** One person's data as an export document (what php tools/progress.php --export writes). */
function transferExport(int $userId): array
{
    $state = json_decode(storeStateJson($userId), false, 512, JSON_THROW_ON_ERROR);

    return [
        'format' => EXPORT_FORMAT,
        'version' => 1,
        'exportedAt' => isoNow(),
        'userId' => $userId,
        'progress' => $state->progress,
        'path' => $state->path,
        'sessions' => $state->sessions,
    ];
}

/**
 * Moves all of one person's data - note progress, path progress, sessions,
 * the record of the one-time import - to another IAM user id: the users row
 * changes its id and the foreign keys follow (ON UPDATE CASCADE). The new id
 * must not have data of its own; an empty users row it may have (somebody who
 * signed in once and did nothing) is replaced.
 *
 * @return array{moved: bool, notes?: int, sessions?: int}
 */
function transferReassign(int $from, int $to): array
{
    if ($from < 1 || $to < 1) {
        throw new RuntimeException('IAM user ids are whole numbers from 1 up.');
    }
    if ($from === $to) {
        return ['moved' => false];
    }

    return dbTx(static function () use ($from, $to): array {
        if (!dbValue('SELECT EXISTS (SELECT 1 FROM users WHERE id = ?)', [$from])) {
            return ['moved' => false];
        }
        if (storeHasData($to)) {
            throw new RuntimeException("User $to already has progress of their own; nothing was moved.");
        }
        dbExec('DELETE FROM users WHERE id = ?', [$to]);
        dbExec('UPDATE users SET id = ? WHERE id = ?', [$to, $from]);
        $notes = dbValue('SELECT count(*) FROM progress, jsonb_object_keys(notes) WHERE user_id = ?', [$to]);
        $sessions = dbValue('SELECT count(*) FROM sessions WHERE user_id = ?', [$to]);

        return ['moved' => true, 'notes' => (int) $notes, 'sessions' => (int) $sessions];
    });
}
