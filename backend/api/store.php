<?php

declare(strict_types=1);

/**
 * One person's data in PostgreSQL: their note progress, their learning-path
 * progress and their session log. Every function takes the user id, and every
 * query is limited to it - one person can never read or change another's.
 *
 * The browser works out every SRS and path change itself (frontend,
 * core/music/) and saves the whole document; the server checks its shape and
 * keeps it. The documents go back out as the database's JSON text, never
 * through PHP arrays, so the empty object {} stays {}.
 *
 * A person's progress has a generation (users.progress_generation, migration
 * 004): GET /api/state hands it out, and a save of a whole document names it
 * (the Progress-Generation header). Only an import (api/transfer.php), an
 * administrator's delete (api/people.php) and a visitor's move at sign-in
 * that adds notes or steps (api/visitors.php) start a new one, so a tab that
 * loaded the progress before any of them is refused (409 progress_changed) instead
 * of writing the old documents back. Ordinary saves keep the generation: two
 * saves of one tab, or of two tabs learning side by side, never refuse each
 * other - the last one wins, as before.
 */

/** The request header a save of a whole document names its generation in. */
const GENERATION_HEADER = 'Progress-Generation';

/**
 * The tables that hold a person's (or a visitor's) data by user_id, children
 * of users with no ON DELETE: what a delete of somebody empties before their
 * users row (api/people.php peopleDelete(), the visitors' sweep in
 * api/visitors.php). A new table of a person's data goes here.
 */
const STORE_PERSON_TABLES = ['sessions', 'path_progress', 'progress', 'imports'];

/** A session row as the browser knows it: its fields, the server's id, and when it was recorded. */
const STORE_SESSION_JSON = "(data || jsonb_build_object('id', id, 'recordedAt', to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')))";

const SESSION_MODES = ['trainer', 'sheet', 'song', 'lesson'];

/**
 * The session fields kept, in the order they are stored, and their bounds.
 * Anything else a request sends is dropped; a known field of the wrong type
 * or out of bounds is refused. A new field or mode in the browser needs a
 * line here too.
 */
const SESSION_FIELDS = [
    'mode' => ['mode'],
    'label' => ['text', 200],        // lesson: "C, D, E · Drill"
    'unitId' => ['id'],              // lesson
    'stepId' => ['id'],              // lesson
    'songId' => ['id'],              // song, and a lesson's song step
    'songTitle' => ['text', 200],
    'startedAt' => ['time'],
    'endedAt' => ['time'],
    'attempts' => ['count'],
    'correct' => ['count'],
    'accuracy' => ['number', 0, 100, false],
    'bpm' => ['number', 1, 1000, true],               // null in 'wait' mode
    'avgTimingErrorMs' => ['number', 0, 3600000, true], // null without a clock
];

/* ------------------------------------------------------------- reading */

/**
 * Everything the browser starts with, as JSON text: {"progress":…,"sessions":[…],"path":…},
 * and with $withGeneration also "generation": the generation those documents
 * are of (null when the person has no users row). One statement, so one
 * snapshot: the documents and their generation never come from either side
 * of an import.
 */
function storeStateJson(int $userId, bool $withGeneration = false): string
{
    $row = dbOne(
        "SELECT
            coalesce((SELECT notes::text FROM progress WHERE user_id = ?), '{}') AS progress,
            coalesce((SELECT jsonb_agg(" . STORE_SESSION_JSON . " ORDER BY seq)::text FROM sessions WHERE user_id = ?), '[]') AS sessions,
            coalesce((SELECT data::text FROM path_progress WHERE user_id = ?), '{\"steps\": {}}') AS path"
            . ($withGeneration ? ', (SELECT progress_generation FROM users WHERE id = ?) AS generation' : ''),
        $withGeneration ? [$userId, $userId, $userId, $userId] : [$userId, $userId, $userId]
    );
    $generation = $withGeneration ? ',"generation":' . ($row['generation'] === null ? 'null' : (string) (int) $row['generation']) : '';

    return '{"progress":' . $row['progress'] . ',"sessions":' . $row['sessions'] . ',"path":' . $row['path'] . $generation . '}';
}

/**
 * How much progress this person has: notes with a state, path steps with a
 * result, sessions. An account whose documents are empty has none - the app
 * saves an empty document as readily as a full one. ($pdo: a connection
 * handed over - the People page's delete, api/people.php.)
 *
 * @return array{notes: int, steps: int, sessions: int}
 */
function storeProgressCounts(int $userId, ?PDO $pdo = null): array
{
    $row = dbOne(
        "SELECT
            (SELECT count(*) FROM progress p, jsonb_object_keys(p.notes) WHERE p.user_id = ?) AS notes,
            (SELECT count(*) FROM path_progress pp, jsonb_object_keys(pp.data -> 'steps') WHERE pp.user_id = ?) AS steps,
            (SELECT count(*) FROM sessions WHERE user_id = ?) AS sessions",
        [$userId, $userId, $userId],
        $pdo
    );

    return ['notes' => (int) $row['notes'], 'steps' => (int) $row['steps'], 'sessions' => (int) $row['sessions']];
}

/** Do these counts (storeProgressCounts()) hold any progress at all? */
function storeCountsHaveProgress(array $counts): bool
{
    return $counts['notes'] > 0 || $counts['steps'] > 0 || $counts['sessions'] > 0;
}

/** Does this person have any rows of progress, path results or sessions - empty documents too? */
function storeHasData(int $userId): bool
{
    return (bool) dbValue(
        'SELECT EXISTS (SELECT 1 FROM progress WHERE user_id = ?)
             OR EXISTS (SELECT 1 FROM path_progress WHERE user_id = ?)
             OR EXISTS (SELECT 1 FROM sessions WHERE user_id = ?)',
        [$userId, $userId, $userId]
    );
}

/* ------------------------------------------------------------- checking */

/**
 * A progress document, as PUT /api/progress takes it: an object keyed by MIDI
 * note number (0-127), each value a note's state object.
 */
function storeCheckProgress(mixed $body): stdClass
{
    $message = 'Body must be a JSON object keyed by MIDI note number.';
    if (!($body instanceof stdClass)) {
        throw new ApiError(400, 'invalid_progress', $message);
    }
    // get_object_vars() hands "60" back as the integer 60: keys are compared as strings.
    foreach (get_object_vars($body) as $key => $value) {
        if (!preg_match('/^(0|[1-9][0-9]?|1[01][0-9]|12[0-7])$/D', (string) $key) || !($value instanceof stdClass)) {
            throw new ApiError(400, 'invalid_progress', $message);
        }
    }

    return $body;
}

/** A learning-path document, as PUT /api/path takes it: an object whose "steps" is an object keyed by "unitId/stepId". */
function storeCheckPath(mixed $body): stdClass
{
    $message = 'Body must be an object with a "steps" object keyed by "unitId/stepId".';
    if (!($body instanceof stdClass) || !property_exists($body, 'steps') || !($body->steps instanceof stdClass)) {
        throw new ApiError(400, 'invalid_path', $message);
    }
    foreach (get_object_vars($body->steps) as $key => $value) {
        if (strlen((string) $key) > 100 || !($value instanceof stdClass)) {
            throw new ApiError(400, 'invalid_path', $message);
        }
    }

    return $body;
}

/**
 * The fields of a session the server keeps (SESSION_FIELDS), checked and
 * bounded. `id` and `recordedAt` are the server's to give, so a client's are
 * dropped with every other unknown field.
 */
function storeCleanSession(mixed $body): array
{
    if (!($body instanceof stdClass)) {
        throw new ApiError(400, 'invalid_session', 'Body must be a session object.');
    }
    $in = get_object_vars($body);
    if (!array_key_exists('mode', $in)) {
        throw new ApiError(400, 'invalid_session', 'A session needs a "mode" (' . implode(', ', SESSION_MODES) . ').');
    }

    $out = [];
    foreach (SESSION_FIELDS as $field => $rule) {
        if (!array_key_exists($field, $in)) {
            continue;
        }
        $value = $in[$field];
        $bad = static fn(string $what): ApiError => new ApiError(400, 'invalid_session', "Session field \"$field\" must be $what.");

        switch ($rule[0]) {
            case 'mode':
                if (!in_array($value, SESSION_MODES, true)) {
                    throw $bad('one of ' . implode(', ', SESSION_MODES));
                }
                break;
            case 'text':
                if (!is_string($value) || preg_match('/[\x00-\x1F\x7F]/', $value) || !preg_match('/^.{0,' . $rule[1] . '}$/usD', $value)) {
                    throw $bad("text of at most {$rule[1]} characters");
                }
                break;
            case 'id':
                if (!is_string($value) || !preg_match('/^[A-Za-z0-9._-]{1,64}$/D', $value)) {
                    throw $bad('a short id (letters, digits, . _ -)');
                }
                break;
            case 'time':
                if ($value !== null && !storeIsIsoTime($value)) {
                    throw $bad('an ISO 8601 time like 2026-09-27T10:15:00.000Z');
                }
                break;
            case 'count':
                if (is_float($value) && is_finite($value) && floor($value) === $value) {
                    $value = (int) $value;
                }
                if (!is_int($value) || $value < 0 || $value > 1000000) {
                    throw $bad('a whole number from 0 to 1000000');
                }
                break;
            case 'number':
                $nullable = $rule[3];
                $wrong = $value === null
                    ? !$nullable
                    : (!(is_int($value) || is_float($value)) || !is_finite((float) $value) || $value < $rule[1] || $value > $rule[2]);
                if ($wrong) {
                    throw $bad("a number from {$rule[1]} to {$rule[2]}" . ($nullable ? ', or null' : ''));
                }
                break;
        }
        $out[$field] = $value;
    }

    return $out;
}

/** An ISO 8601 date and time with a zone, as toISOString() writes them. */
function storeIsIsoTime(mixed $value): bool
{
    if (!is_string($value) || strlen($value) > 40
        || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/D', $value)) {
        return false;
    }
    try {
        new DateTimeImmutable($value);

        return true;
    } catch (Exception) {
        return false;
    }
}

/* ------------------------------------------------------- the generation */

/**
 * The generation a save names (GENERATION_HEADER's value): a whole number
 * from 1. Missing or anything else: 428 generation_required - a save that
 * does not say which progress it was made to could write over an import.
 * With $allowZero (a visitor's save, or one that would make a visitor -
 * api/visitors.php) also 0: "no progress anywhere yet", what GET /api/state
 * answers somebody who has not signed in and has no visitor yet.
 */
function storeGenerationFrom(string $header, bool $allowZero = false): int
{
    $value = trim($header);
    if (!preg_match('/^[1-9][0-9]{0,17}$/D', $value) && !($allowZero && $value === '0')) {
        throw new ApiError(428, 'generation_required', 'Say which progress this save was made to: the ' . GENERATION_HEADER . ' header, with the generation GET /api/state gave.');
    }

    return (int) $value;
}

/**
 * Inside a transaction: takes this person's users row for the rest of it -
 * FOR UPDATE, so an import, an administrator's delete and a save of this
 * person take turns - and answers their generation now, or null when they
 * have no users row (deleted a moment ago). $pdo: the transaction's
 * connection when it is not the app's own (the People page's delete).
 */
function storeLockGeneration(int $userId, ?PDO $pdo = null): ?int
{
    $generation = dbValue('SELECT progress_generation FROM users WHERE id = ? FOR UPDATE', [$userId], $pdo);

    return $generation === null ? null : (int) $generation;
}

/**
 * Inside a transaction: the save was made to this person's progress as it is
 * now - or 409 progress_changed (with the generation now, or null), and
 * nothing is saved. Holds the person's users row (storeLockGeneration()).
 */
function storeRequireGeneration(int $userId, int $generation): void
{
    $current = storeLockGeneration($userId);
    if ($current !== $generation) {
        throw storeProgressChanged($current);
    }
}

/** 409 progress_changed: the save was made to another generation than $current (null: no users row). */
function storeProgressChanged(?int $current): ApiError
{
    return new ApiError(409, 'progress_changed', 'Your progress was replaced or deleted after this page loaded it, so this was not saved. Load the page again.', [], ['generation' => $current]);
}

/**
 * Inside a transaction that holds the person's users row: a new generation
 * of their progress (an import, a delete). Every tab that loaded it before
 * is refused its next save. The numbers come from one sequence and are
 * never handed out twice.
 */
function storeNewGeneration(int $userId): int
{
    return (int) dbValue("UPDATE users SET progress_generation = nextval('progress_generation') WHERE id = ? RETURNING progress_generation", [$userId]);
}

/**
 * Inside a restore's transaction, before it commits (api/admin_tools.php's
 * backups(): the restore's beforeCommit, after the library's replay of the
 * deletes done since the backup), on the restore's connection: every
 * progress - a visitor's too - takes a new generation. A restore puts the
 * users rows back with the generations of the backup's day: a tab left open
 * since then holds a number the restored row has again, and its next save
 * would go over the restored progress (204). With a new number for every
 * row, every tab of before gets 409 progress_changed on its next save, and
 * loads what was restored.
 *
 * Inside the transaction, not after it: the restore holds every table it
 * loaded until it commits, so a save in flight waits and then meets the new
 * number - there is no moment in which the restored rows can be seen, and
 * saved over, with their old generations. The numbers are new: the library's
 * restore never moves a sequence back (anotoki-lib 0.5.0: it goes on from the
 * later of the backup's value and today's), so nextval() hands out none an
 * open tab holds. It begins, commits or rolls back no transaction of its own.
 */
function storeRenewGenerationsAfterRestore(PDO $pdo): void
{
    if (!$pdo->inTransaction()) {
        throw new LogicException('storeRenewGenerationsAfterRestore() belongs inside the restore\'s transaction.');
    }
    $pdo->exec("UPDATE users SET progress_generation = nextval('progress_generation')");
}

/* ------------------------------------------------------------- writing */

/**
 * Replaces this person's note progress with the document the browser sent.
 * (The routes check its generation first: storeRequireGeneration().)
 */
function storeSaveProgress(int $userId, stdClass $notes): void
{
    dbExec(
        'INSERT INTO progress (user_id, notes) VALUES (?, ?::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now()',
        [$userId, jsonText($notes)]
    );
}

/** Replaces this person's learning-path progress. */
function storeSavePath(int $userId, stdClass $path): void
{
    dbExec(
        'INSERT INTO path_progress (user_id, data) VALUES (?, ?::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
        [$userId, jsonText($path)]
    );
}

/**
 * Adds a finished session (storeCleanSession() shape) and returns
 * [true, the stored session as JSON text]. With a $requestKey that was
 * already used - the browser retrying a POST whose answer it never got - it
 * stores nothing and returns [false, the session stored the first time].
 * $beforeAdding runs in the same transaction, after that look and before the
 * insert: a visitor's row taken and its rounds counted (api/visitors.php) -
 * it throws to refuse.
 */
function storeAddSession(int $userId, array $session, ?string $requestKey = null, ?callable $beforeAdding = null): array
{
    return dbTx(static function () use ($userId, $session, $requestKey, $beforeAdding): array {
        if ($requestKey !== null) {
            $stored = storeSessionByKey($userId, $requestKey);
            if ($stored !== null) {
                return [false, $stored];
            }
        }
        if ($beforeAdding !== null) {
            $beforeAdding();
        }

        $json = dbValue(
            'INSERT INTO sessions (user_id, id, request_key, data) VALUES (?, ?, ?, ?::jsonb)
             ON CONFLICT (user_id, request_key) DO NOTHING
             RETURNING ' . STORE_SESSION_JSON . '::text',
            [$userId, storeNewSessionId(), $requestKey, jsonText($session)]
        );
        if ($json === null) {
            // the same key, stored by another request a moment ago
            return [false, (string) storeSessionByKey($userId, (string) $requestKey)];
        }

        return [true, (string) $json];
    });
}

function storeSessionByKey(int $userId, string $requestKey): ?string
{
    $json = dbValue('SELECT ' . STORE_SESSION_JSON . '::text FROM sessions WHERE user_id = ? AND request_key = ?', [$userId, $requestKey]);

    return $json === null ? null : (string) $json;
}

/** A session id as the first server made them: <ms since 1970>-<6 random base-36 characters>. */
function storeNewSessionId(): string
{
    $chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    $suffix = '';
    for ($i = 0; $i < 6; $i++) {
        $suffix .= $chars[random_int(0, 35)];
    }

    return (string) (int) floor(microtime(true) * 1000) . '-' . $suffix;
}
