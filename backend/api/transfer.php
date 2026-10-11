<?php

declare(strict_types=1);

/**
 * One person's data as a file, and back:
 *
 *   an export    one person's note progress, path progress and sessions as one
 *                JSON document ('piano-academy-export', version 1) - to keep a
 *                copy, or to take it to another database. Each signed-in
 *                person downloads their own (GET /api/me/export) and brings
 *                one back into their own account (POST /api/me/import); an
 *                operator does it for anybody (php tools/progress.php).
 *   a move       all of one person's data to another IAM user id (php
 *                tools/progress.php --move), for an operator.
 *
 * An import goes into an account without progress, or replaces what is there
 * when that is asked for - never a mix of the two. It takes the person's users
 * row for its transaction (FOR UPDATE: two imports, or an import and a save,
 * take turns) and starts a new generation of their progress, so a tab that
 * loaded the old one cannot write it back (api/store.php).
 *
 * The files the first version of the app kept (server/data/) are gone from
 * the repository (git keeps them); nothing here reads a folder of them any
 * more. The imports table that recorded their one-time import stays in the
 * schema, written by nothing.
 */

const EXPORT_FORMAT = 'piano-academy-export';

/**
 * The largest export the app makes, and the largest it takes back - one
 * number, so a file the app gave somebody always fits through its import. An
 * export that would be larger is refused (409 export_too_large) rather than
 * handed out to fail later; the operator's tools/progress.php has no limit.
 * 5 MiB is some ten thousand rounds, and stays under PHP's usual
 * post_max_size (8M).
 */
const EXPORT_LIMIT = 5 * 1024 * 1024;

/** A file that is not a Piano Academy export at all. */
function transferNotAnExport(): ApiError
{
    return new ApiError(422, 'not_an_export', 'That is not a Piano Academy export (php tools/progress.php --export writes one, and so does the app\'s own export).');
}

/** An export with a part that is not what it should be: nothing of it is taken. */
function transferInvalidExport(string $why): ApiError
{
    return new ApiError(422, 'invalid_export', $why);
}

/** The refusal of an import into an account that has progress, without asking to replace it. */
function transferHasProgress(array $counts): ApiError
{
    return new ApiError(409, 'has_progress', 'This account already has progress, so nothing was imported. Ask for it to be replaced to put the file\'s in its place.', [], ['current' => $counts]);
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

/** An export file, read and checked: what transferReadExport() makes of it. */
function transferReadFile(string $file): array
{
    if (!is_file($file)) {
        throw new RuntimeException('There is no file ' . str_replace('\\', '/', $file));
    }

    return transferReadExport(transferJsonFile($file), str_replace('\\', '/', $file));
}

/**
 * An export document (decoded with its objects as objects), ready to import.
 * Something that is not an export at all is 422 not_an_export; a version
 * this app cannot read, or a progress or path document that is not one, is
 * 422 invalid_export and stops everything - better nothing than half. A
 * session that does not pass the checks of POST /api/sessions is left out,
 * counted in 'leftOut' and said in 'problems'. The userId inside is not read:
 * an export goes into whichever account it is imported into.
 *
 * @return array{progress: ?stdClass, path: ?stdClass, sessions: array, problems: string[], leftOut: int, from: string}
 */
function transferReadExport(mixed $export, string $from = 'the export'): array
{
    if (!($export instanceof stdClass) || ($export->format ?? null) !== EXPORT_FORMAT) {
        throw transferNotAnExport();
    }
    $version = $export->version ?? null;
    if ($version !== 1) {
        throw transferInvalidExport("$from was written by another version of Piano Academy (" . (is_int($version) ? "version $version" : 'no version') . '), which this one cannot read.');
    }
    [$progress, $sessions, $pathDocument] = [$export->progress ?? null, $export->sessions ?? null, $export->path ?? null];
    $data = ['progress' => null, 'path' => null, 'sessions' => [], 'problems' => [], 'leftOut' => 0, 'from' => $from];

    if ($progress !== null) {
        try {
            $data['progress'] = storeCheckProgress($progress);
        } catch (ApiError $e) {
            throw transferInvalidExport("$from: the note progress is not a progress document ({$e->getMessage()})");
        }
    }
    if ($pathDocument !== null) {
        try {
            $data['path'] = storeCheckPath($pathDocument);
        } catch (ApiError $e) {
            throw transferInvalidExport("$from: the learning-path progress is not a path document ({$e->getMessage()})");
        }
    }
    if ($sessions !== null && !is_array($sessions)) {
        throw transferInvalidExport("$from: the sessions are not a list");
    }

    $ids = [];
    foreach (array_values($sessions ?? []) as $i => $session) {
        $where = 'session ' . ($i + 1);
        try {
            $clean = storeCleanSession($session);
        } catch (ApiError $e) {
            $data['problems'][] = "$where: {$e->getMessage()}";
            $data['leftOut']++;
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
 * What data from transferReadExport() holds, counted as storeProgressCounts()
 * counts an account.
 *
 * @return array{notes: int, steps: int, sessions: int}
 */
function transferCounts(array $data): array
{
    return [
        'notes' => $data['progress'] === null ? 0 : count(get_object_vars($data['progress'])),
        'steps' => $data['path'] === null ? 0 : count(get_object_vars($data['path']->steps)),
        'sessions' => count($data['sessions']),
    ];
}

/**
 * What an import of $data would do to this person's account, without doing
 * it (POST /api/me/import?dryRun=true): what is there now, what the file
 * brings, how many of its sessions would be left out, and whether replacing
 * has to be asked for.
 *
 * @return array{dryRun: true, hasProgress: bool, current: array, incoming: array, leftOut: int}
 */
function transferPreview(int $userId, array $data): array
{
    $current = storeProgressCounts($userId);

    return [
        'dryRun' => true,
        'hasProgress' => storeCountsHaveProgress($current),
        'current' => $current,
        'incoming' => transferCounts($data),
        'leftOut' => $data['leftOut'] ?? 0,
    ];
}

/**
 * Puts data from transferReadExport() into one person's account, in one
 * transaction: into an account without progress - or, with $replace, in the
 * place of the progress it has (its notes, path and sessions go first). Never
 * a mix of the two, so nothing is counted twice. An account with progress and
 * no $replace: 409 has_progress, and nothing changes.
 *
 * The person's users row is taken first (FOR UPDATE) and held to the end:
 * two imports into one account, or an import and a save, take turns - the
 * second sees what the first left. The import ends with a new generation of
 * the person's progress (api/store.php), which it answers.
 *
 * @return array{notes: int, steps: int, sessions: int, replaced: bool, generation: int}
 */
function transferImport(int $userId, array $data, bool $replace = false): array
{
    return dbTx(static function () use ($userId, $data, $replace): array {
        // A request's person has their row already (the people module); the command line's may not yet.
        usersEnsure($userId);
        storeLockGeneration($userId);

        $current = storeProgressCounts($userId);
        $had = storeCountsHaveProgress($current);
        if ($had && !$replace) {
            throw transferHasProgress($current);
        }
        // Empty documents too: what comes in stands alone.
        dbExec('DELETE FROM sessions WHERE user_id = ?', [$userId]);
        dbExec('DELETE FROM progress WHERE user_id = ?', [$userId]);
        dbExec('DELETE FROM path_progress WHERE user_id = ?', [$userId]);

        if ($data['progress'] !== null) {
            storeSaveProgress($userId, $data['progress']);
        }
        if ($data['path'] !== null) {
            storeSavePath($userId, $data['path']);
        }
        // A few hundred rows to a statement: an export near EXPORT_LIMIT holds thousands.
        foreach (array_chunk($data['sessions'], 500) as $chunk) {
            $params = [];
            foreach ($chunk as $session) {
                array_push($params, $userId, $session['id'], $session['recordedAt'], jsonText($session['data']));
            }
            dbExec(
                'INSERT INTO sessions (user_id, id, recorded_at, data) VALUES '
                . implode(', ', array_fill(0, count($chunk), '(?, ?, ?::timestamptz, ?::jsonb)')),
                $params
            );
        }

        return transferCounts($data) + ['replaced' => $had, 'generation' => storeNewGeneration($userId)];
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
 * One person's own export as the app hands it out (GET /api/me/export): the
 * JSON text - or 409 export_too_large when it would not fit through the
 * import (EXPORT_LIMIT), rather than a file that could never come back.
 */
function transferExportJson(int $userId): string
{
    $json = jsonText(transferExport($userId));
    if (strlen($json) > EXPORT_LIMIT) {
        throw new ApiError(409, 'export_too_large', 'Your progress is too large for one file the app could bring back in. Ask the site\'s administrator to export it for you.', [], ['limit' => EXPORT_LIMIT]);
    }

    return $json;
}

/**
 * Moves all of one person's data - note progress, path progress, sessions,
 * the strings they reworded - to another IAM user id: the users row changes
 * its id and the foreign keys follow (ON UPDATE CASCADE). The new id must not
 * have data of its own; an empty users row it may have (somebody who signed in
 * once and did nothing) is replaced.
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
