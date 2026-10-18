<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Visitors: somebody practising without signing in - when the IAM says Piano
 * Academy does not require it (authLoginRequired()) - keeps their progress
 * on the server like a person does, under a users row of their own with a
 * negative id (from the sequence visitor_ids; an IAM user id is always 1 or
 * more), no name and no role (migration 005). The build analyzer's visitor
 * accounts are the pattern. Nothing else makes, finds, moves or sweeps a
 * visitor.
 *
 * The key: 32 random bytes the server makes, base64url without padding (43
 * characters). It leaves the server once, in the X-Visitor-Key header of the
 * answer to the save that made the visitor (never in a body, a URL or a
 * log); the browser keeps it and sends it back in the X-Visitor-Key request
 * header. The row keeps only its SHA-256, and a request is that visitor when
 * the hash of the key it sends is a row's - the key has 256 bits, so a plain
 * lookup is safe. The anotoki family's library reads it (its Identify, with
 * visitorFound() - only for a request with no Bearer header while no sign-in
 * is required, meddleware/auth.php), and only the progress routes take a
 * visitor for anybody (requireOwner()); the move at sign-in
 * (routes/visitor.php, with a token) reads it itself.
 *
 *   visitorFound()    the visitor of a key, seen now (written at most once an
 *                     hour); unknown or malformed: null - the library answers
 *                     401 visitor_unknown
 *   visitorMake()     a new visitor, inside the transaction of the save that
 *                     makes it, after the limits: a refused or failed save
 *                     makes nobody and counts nothing
 *   visitorMove()     at sign-in, the visitor's progress into the person's
 *                     account (the person's stays where both have the same
 *                     note; a path step both have merged, a pass never lost),
 *                     then the visitor gone
 *   visitorSweep()    visitors unseen for 30 days deleted with everything of
 *                     theirs, a few at a time, after somebody's answer
 *
 * The first save names generation 0: GET /api/state answers nobody
 * `generation: 0` ("no progress anywhere yet"), a save that makes a visitor
 * must name exactly that (409 progress_changed otherwise), and its answer
 * carries the new row's generation (Progress-Generation) beside the key. A
 * second tab that sends the key with 0 later is refused 409 and loads the
 * visitor's progress, as a person's old tab is.
 *
 * The limits (config/visitors.local.php may change each, config/config.php):
 * visitors at once (max_visitors, a full site refuses NEW visitors only:
 * 429 too_many_visitors), new ones an hour per address (an IPv6 /64, behind
 * Cloudflare the address it names - api/client_address.php; visitor_starts
 * keeps a keyed hash of it, never the address) and in all (429
 * too_many_visitors), the rounds one
 * visitor keeps (422 visitor_limit) and the size of a visitor's progress or
 * path (413 too_large); and how long the move waits for a row another
 * request holds (move_lock_timeout_ms). There is no early sweep of visitors
 * with little progress: the notice promises 30 days after the last visit.
 *
 * Between an upload and the update, migration 005 has not added the column:
 * every visitor path then answers 503 visitors_unavailable (never a 500), and
 * the sweep does nothing.
 */

const VISITOR_HEADER = 'X-Visitor-Key';

const VISITOR_KEY_PATTERN = '/^[A-Za-z0-9_-]{43}$/D';

/** A visitor unseen this many days is deleted (the notice says so: the frontend's VISITOR_KEEP_DAYS). */
const VISITOR_KEEP_DAYS = 30;

/** The advisory lock new visitors are made under, so the limits are counted exactly (beside DATABASE_UPDATE_LOCK). */
const VISITOR_MAKE_LOCK = 3_300_004_501;

/** The limits, unless config/visitors.local.php says otherwise ('visitors' => [...]). */
const VISITOR_DEFAULTS = [
    'max_visitors' => 500,
    'new_per_hour_per_address' => 10,
    'new_per_hour' => 60,
    'max_sessions' => 1000,
    'document_max_bytes' => 131072,
    // How long the move at sign-in waits for the visitor's or the person's row (another request writing it), in ms.
    'move_lock_timeout_ms' => 5000,
];

/** The sweep: visitors a batch, each statement's time, and the whole sweep's time. */
const VISITOR_SWEEP_BATCH = 20;
const VISITOR_SWEEP_STATEMENT_MS = 2000;
const VISITOR_SWEEP_BUDGET_MS = 5000;

/** The sweep runs at most once in this many seconds across the site (but after a visitor is made). */
const VISITOR_SWEEP_EVERY = 3600;

/**
 * One limit: config/visitors.local.php's whole number when it gives one (0
 * allowed for the limits on new visitors: none at all), else the default.
 * A visitor's document is never allowed more than anybody's (BODY_LIMIT).
 */
function visitorLimit(string $name): int
{
    if (!array_key_exists($name, VISITOR_DEFAULTS)) {
        throw new LogicException("No visitor limit $name.");
    }
    $value = visitorSettings()['visitors'][$name] ?? null;
    $least = in_array($name, ['max_sessions', 'document_max_bytes', 'move_lock_timeout_ms'], true) ? 1 : 0;
    $limit = is_int($value) && $value >= $least ? $value : VISITOR_DEFAULTS[$name];

    return $name === 'document_max_bytes' ? min($limit, BODY_LIMIT) : $limit;
}

/** The key a request sends, or null when it sends none (an empty header is none). */
function visitorKeyOf(Request $request): ?string
{
    $key = trim($request->getHeaderLine(VISITOR_HEADER));

    return $key === '' ? null : $key;
}

function visitorHash(string $key): string
{
    return hash('sha256', $key);
}

/** A new key: 32 random bytes, base64url without padding. */
function visitorNewKey(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

/** Whether migration 005 is applied: the column of the visitors' keys is there. Asked once a request ($reset: the tests). */
function visitorsReady(bool $reset = false): bool
{
    static $ready = null;

    if ($reset) {
        $ready = null;
    }
    if ($ready === null) {
        try {
            $ready = (bool) dbValue(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns
                                 WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'visitor_key_hash')",
            );
        } catch (PDOException) {
            $ready = false;
        }
    }

    return $ready;
}

/** 503 visitors_unavailable while migration 005 waits - like every other route then, a 503 with a code, never a 500. */
function visitorsMustBeReady(): void
{
    if (!visitorsReady()) {
        throw new ApiError(
            503,
            'visitors_unavailable',
            'Practising without signing in is not ready yet: an administrator applies the waiting database update on the admin panel\'s Migrations page. Sign in to continue.',
            ['Retry-After' => '60'],
        );
    }
}

/** 401 visitor_unknown: no visitor has this key (any more). */
function visitorUnknown(): ApiError
{
    return new ApiError(
        401,
        'visitor_unknown',
        'This browser\'s progress without signing in has ended: it was not used for ' . VISITOR_KEEP_DAYS . ' days, or it was moved into an account at a sign-in.',
    );
}

/**
 * The visitor of this key, seen now (last_seen_at written at most once an
 * hour) - or null for a key nobody has, or one that is no key: the library's
 * Identify then answers 401 visitor_unknown. 005 pending: 503
 * visitors_unavailable.
 */
function visitorFound(string $key): ?SiteUser
{
    if (preg_match(VISITOR_KEY_PATTERN, $key) !== 1) {
        return null;
    }
    visitorsMustBeReady();

    $row = dbOne("SELECT id, last_seen_at < now() - interval '1 hour' AS stale FROM users WHERE visitor_key_hash = ? AND id < 0", [visitorHash($key)]);
    if ($row === null) {
        return null;
    }
    if ($row['stale'] === true || $row['stale'] === 't') {
        dbExec("UPDATE users SET last_seen_at = now() WHERE id = ? AND id < 0 AND last_seen_at < now() - interval '1 hour'", [(int) $row['id']]);
    }

    return new SiteUser((int) $row['id'], null, [], true);
}

/**
 * A new visitor for the save that is being made, inside that save's
 * transaction (so a save that fails or is refused afterwards makes nobody,
 * and its count goes with it) - or 429 too_many_visitors when there are too
 * many visitors already, or too many new ones this hour from its address or
 * from everywhere. Under an advisory lock, so two at once count exactly.
 *
 * @return array{id: int, key: string, generation: int}
 */
function visitorMake(Request $request): array
{
    if (!db()->inTransaction()) {
        throw new LogicException('visitorMake() belongs inside the transaction of the save that makes the visitor.');
    }
    visitorsMustBeReady();

    dbValue('SELECT pg_advisory_xact_lock(?::bigint)', [VISITOR_MAKE_LOCK]);
    // The starts of an hour ago and more are kept no longer than needed.
    dbExec("DELETE FROM visitor_starts WHERE started_at < now() - interval '1 hour'");

    // Never the address itself: a keyed hash of what the limits count (api/client_address.php) - every backup
    // carries this table.
    $address = clientAddressKey($request);
    $counts = dbOne(
        'SELECT (SELECT count(*) FROM users WHERE id < 0) AS visitors,
                (SELECT count(*) FROM visitor_starts WHERE address = ?) AS here,
                (SELECT count(*) FROM visitor_starts) AS everywhere',
        [$address],
    );
    if ((int) $counts['visitors'] >= visitorLimit('max_visitors')) {
        throw visitorTooMany('Too many people are practising without signing in just now. Sign in to continue, or try again later.');
    }
    if ((int) $counts['here'] >= visitorLimit('new_per_hour_per_address')) {
        throw visitorTooMany('Too many people started practising without signing in from this address this hour. Sign in to continue, or try again later.');
    }
    if ((int) $counts['everywhere'] >= visitorLimit('new_per_hour')) {
        throw visitorTooMany('Too many people started practising without signing in this hour. Sign in to continue, or try again later.');
    }

    dbExec('INSERT INTO visitor_starts (address) VALUES (?)', [$address]);
    $key = visitorNewKey();
    $row = dbOne("INSERT INTO users (id, visitor_key_hash) VALUES (nextval('visitor_ids'), ?) RETURNING id, progress_generation", [visitorHash($key)]);

    return ['id' => (int) $row['id'], 'key' => $key, 'generation' => (int) $row['progress_generation']];
}

function visitorTooMany(string $message): ApiError
{
    return new ApiError(429, 'too_many_visitors', $message, ['Retry-After' => '3600']);
}

/**
 * Who a save under requireOwner('make') writes for: the person or the
 * visitor - or null for nobody, whose save makes a visitor
 * (visitorDocumentOwner(), visitorSessionOwner()).
 */
function visitorWriter(Request $request): ?SiteUser
{
    $owner = currentUser($request);
    if ($owner === null && $request->getAttribute('visitorToMake') !== true) {
        throw new LogicException('A save needs requireOwner(\'make\') in front of it.');
    }

    return $owner;
}

/** The largest body a save of $owner's takes: a person's BODY_LIMIT, a visitor's (or a new one's) document_max_bytes. */
function visitorBodyLimit(?SiteUser $owner): int
{
    return $owner !== null && !$owner->visitor ? BODY_LIMIT : visitorLimit('document_max_bytes');
}

/**
 * Inside the transaction of a whole-document save (PUT /api/progress,
 * PUT /api/path): the id it writes to, and the visitor it made (null when it
 * made none). Nobody's save must name generation 0 and makes a visitor; a
 * person's or a visitor's must name the generation as it is now (their users
 * row taken FOR UPDATE, 409 progress_changed otherwise) - and a visitor
 * whose row went meanwhile (swept, or moved at a sign-in) is 401
 * visitor_unknown.
 *
 * @return array{0: int, 1: ?array{id: int, key: string, generation: int}}
 */
function visitorDocumentOwner(Request $request, ?SiteUser $owner, int $generation): array
{
    if ($owner === null) {
        if ($generation !== 0) {
            throw storeProgressChanged(null);
        }
        $made = visitorMake($request);

        return [$made['id'], $made];
    }

    $current = storeLockGeneration($owner->id);
    if ($current === null && $owner->visitor) {
        throw visitorUnknown();
    }
    if ($current !== $generation) {
        throw storeProgressChanged($current);
    }

    return [$owner->id, null];
}

/**
 * What a visitor's new round must pass, inside its transaction
 * (storeAddSession()'s $beforeAdding): the visitor's row taken (gone: 401
 * visitor_unknown) and their rounds counted (422 visitor_limit at
 * max_sessions). Null for a person: no limit.
 */
function visitorSessionCheck(SiteUser $owner): ?callable
{
    if (!$owner->visitor) {
        return null;
    }

    return static function () use ($owner): void {
        if (storeLockGeneration($owner->id) === null) {
            throw visitorUnknown();
        }
        $max = visitorLimit('max_sessions');
        if ((int) dbValue('SELECT count(*) FROM sessions WHERE user_id = ?', [$owner->id]) >= $max) {
            throw new ApiError(
                422,
                'visitor_limit',
                "Without signing in, this browser keeps at most $max rounds. Sign in to keep practising with your progress saved.",
                [],
                [
                    'params' => ['limit' => 'sessions', 'max' => $max],
                ],
            );
        }
    };
}

/**
 * The answer of a save that made a visitor: the key - its one way out of the
 * server - and the new row's generation, never kept by a cache; and the
 * sweep after it. Any other answer as it is.
 *
 * @param ?array{id: int, key: string, generation: int} $made
 */
function visitorAnswerMade(Response $response, ?array $made): Response
{
    if ($made === null) {
        return $response;
    }
    visitorSweepAfterAnswer(true);

    return $response
        ->withHeader(VISITOR_HEADER, $made['key'])
        ->withHeader(GENERATION_HEADER, (string) $made['generation'])
        ->withHeader('Cache-Control', 'no-store');
}

/**
 * A path step both the person and the visitor have, merged so that a pass
 * is never lost - in SQL, over the step records `p` (the person's) and `v`
 * (the visitor's), both objects, and `newer` (the visitor's updatedAt is the
 * later): the person's record, with
 *
 *   bestAccuracy  the larger (a step is passed by its best: path.service.ts)
 *   attempts      the two added
 *   passedAt      the earlier of two times; the visitor's when the person has none
 *   lastAccuracy, updatedAt   the visitor's when `newer`
 *
 * Any other field both records have stays the person's, one only the
 * visitor's record has comes along (the notes' rule, field by field), and
 * of the five above a field the person lacks or holds as something else than
 * a number / a time takes the visitor's.
 * The times are toISOString()'s, compared as text in the "C" collation. No
 * SRS judgement: a path step is a tally, not a schedule.
 */
const VISITOR_STEP_MERGE = <<<'SQL'
v || p || jsonb_strip_nulls(jsonb_build_object(
    'bestAccuracy', CASE
        WHEN jsonb_typeof(p -> 'bestAccuracy') = 'number' AND jsonb_typeof(v -> 'bestAccuracy') = 'number'
            THEN to_jsonb(greatest((p ->> 'bestAccuracy')::numeric, (v ->> 'bestAccuracy')::numeric))
        WHEN jsonb_typeof(p -> 'bestAccuracy') IS DISTINCT FROM 'number' THEN v -> 'bestAccuracy' END,
    'attempts', CASE
        WHEN jsonb_typeof(p -> 'attempts') = 'number' AND jsonb_typeof(v -> 'attempts') = 'number'
            THEN to_jsonb((p ->> 'attempts')::numeric + (v ->> 'attempts')::numeric)
        WHEN jsonb_typeof(p -> 'attempts') IS DISTINCT FROM 'number' THEN v -> 'attempts' END,
    'passedAt', CASE
        WHEN jsonb_typeof(p -> 'passedAt') = 'string' AND jsonb_typeof(v -> 'passedAt') = 'string'
            THEN to_jsonb(least((p ->> 'passedAt') COLLATE "C", (v ->> 'passedAt') COLLATE "C"))
        WHEN jsonb_typeof(p -> 'passedAt') IS DISTINCT FROM 'string' THEN v -> 'passedAt' END,
    'lastAccuracy', CASE WHEN newer THEN v -> 'lastAccuracy' END,
    'updatedAt', CASE WHEN newer THEN v -> 'updatedAt' END
))
SQL;

/**
 * At sign-in (POST /api/visitor/move, routes/visitor.php): the progress of
 * the visitor whose key this is becomes $person's, in one transaction -
 * the visitor's users row taken first, then the person's (FOR UPDATE, each
 * waited for at most move_lock_timeout_ms), so a save of either side waits
 * or is refused, never written half-way:
 *
 *   notes     a note the person has stays as it is (byte for byte); the
 *             visitor's others are added
 *   steps     a path step both have is merged (VISITOR_STEP_MERGE: the best
 *             accuracy, the attempts added, the earlier pass - a pass is
 *             never lost); the visitor's others are added
 *   rounds    every one of the visitor's becomes the person's, with its id,
 *             Idempotency-Key and time (one whose id or key the person has
 *             already - all but never - is dropped)
 *
 * The merged notes and the merged path are each checked against BODY_LIMIT
 * (what a save of the person's may send back): a merge that would be larger
 * is not made - the person's document stays as it is and every one of the
 * visitor's notes (or steps) counts as kept - so the person's later saves
 * are never refused 413. Then the visitor's rows and its users row go. When
 * the person's notes or path changed, their progress gets a new generation:
 * their other tabs and devices load it again instead of saving the old
 * documents over the merge. (Rounds alone need none: a round is added,
 * never saved over anything.)
 *
 * A key nobody has (moved already by another tab, swept, never there):
 * {found: false} with zeros, nothing done - the move can be asked again. A
 * lock not had in time, a deadlock, a serialization failure or a round that
 * collided with one the person was adding at that moment: 503
 * visitor_move_retry with Retry-After: 2, nothing moved. The person's own
 * row gone meanwhile (an administrator's delete on the People page): 401
 * sign_in_required, nothing moved. A save of the visitor's that waited for
 * the move finds its row gone: 401 visitor_unknown (visitorDocumentOwner(),
 * visitorSessionCheck()).
 *
 * @return array{found: bool, notes: array{moved: int, kept: int}, steps: array{moved: int, merged: int, kept: int}, sessions: int, generation: ?int}
 */
function visitorMove(SiteUser $person, string $key): array
{
    if ($person->visitor || $person->id < 1) {
        throw new LogicException('Only a signed-in person takes a visitor\'s progress in.');
    }
    visitorsMustBeReady();

    try {
        $moved = dbTx(static function () use ($person, $key): ?array {
            dbValue("SELECT set_config('lock_timeout', ?, true)", [visitorLimit('move_lock_timeout_ms') . 'ms']);
            $visitorId = dbValue('SELECT id FROM users WHERE visitor_key_hash = ? AND id < 0 FOR UPDATE', [visitorHash($key)]);
            if ($visitorId === null) {
                return null;
            }
            $visitorId = (int) $visitorId;
            $personId = $person->id;
            $generation = storeLockGeneration($personId);
            if ($generation === null) {
                throw new ApiError(401, 'sign_in_required', 'Your progress here was deleted a moment ago, so nothing was moved. Sign in again to continue.', [
                    'WWW-Authenticate' => 'Bearer realm="piano-academy"',
                ]);
            }

            $notes = visitorMoveNotes($visitorId, $personId);
            $steps = visitorMovePath($visitorId, $personId);

            // Rounds: one whose id or Idempotency-Key the person has already stays behind (and goes with the visitor).
            dbExec(
                'DELETE FROM sessions v WHERE v.user_id = ?
                    AND EXISTS (SELECT 1 FROM sessions m WHERE m.user_id = ? AND (m.id = v.id OR m.request_key = v.request_key))',
                [$visitorId, $personId],
            );
            $sessions = dbExec('UPDATE sessions SET user_id = ? WHERE user_id = ?', [$personId, $visitorId]);

            foreach (STORE_PERSON_TABLES as $table) {
                dbExec("DELETE FROM $table WHERE user_id = ?", [$visitorId]);
            }
            dbExec('DELETE FROM users WHERE id = ? AND id < 0', [$visitorId]);

            if ($notes['written'] || $steps['written']) {
                $generation = storeNewGeneration($personId);
            }
            unset($notes['written'], $steps['written']);

            return ['found' => true, 'notes' => $notes, 'steps' => $steps, 'sessions' => $sessions, 'generation' => $generation];
        });
    } catch (PDOException $e) {
        if (in_array((string) $e->getCode(), ['23505', '40001', '40P01', '55P03'], true)) {
            error_log('[visitors] a move did not finish, to be asked again: SQLSTATE ' . $e->getCode());

            throw new ApiError(503, 'visitor_move_retry', 'Moving the progress made without signing in did not finish this time. Try again in a moment.', ['Retry-After' => '2']);
        }
        throw $e;
    }

    return $moved ?? [
        'found' => false,
        'notes' => ['moved' => 0, 'kept' => 0],
        'steps' => ['moved' => 0, 'merged' => 0, 'kept' => 0],
        'sessions' => 0,
        'generation' => null,
    ];
}

/**
 * The move's notes (visitorMove(), inside its transaction): the visitor's
 * notes the person lacks added to the person's, theirs as they are - unless
 * the merged document would be over BODY_LIMIT, when nothing is written and
 * every one of the visitor's notes counts as kept.
 *
 * @return array{moved: int, kept: int, written: bool}
 */
function visitorMoveNotes(int $visitorId, int $personId): array
{
    $row = dbOne(
        "SELECT (SELECT count(*) FROM jsonb_object_keys(v.notes) AS k WHERE NOT jsonb_exists(p.notes, k)) AS moved,
                (SELECT count(*) FROM jsonb_object_keys(v.notes) AS k WHERE jsonb_exists(p.notes, k)) AS kept,
                octet_length((v.notes || p.notes)::text) AS bytes
           FROM (SELECT coalesce((SELECT notes FROM progress WHERE user_id = ?), '{}'::jsonb) AS notes) AS v,
                (SELECT coalesce((SELECT notes FROM progress WHERE user_id = ?), '{}'::jsonb) AS notes) AS p",
        [$visitorId, $personId],
    );
    $moved = (int) $row['moved'];
    $kept = (int) $row['kept'];
    if ($moved === 0) {
        return ['moved' => 0, 'kept' => $kept, 'written' => false];
    }
    if ((int) $row['bytes'] > BODY_LIMIT) {
        error_log("[visitors] a move kept the account's notes as they were: with the visitor's they would be over " . BODY_LIMIT . ' bytes');

        return ['moved' => 0, 'kept' => $moved + $kept, 'written' => false];
    }

    // jsonb ||: the right side wins a key both have - the person's.
    dbExec(
        'INSERT INTO progress (user_id, notes) SELECT ?, notes FROM progress WHERE user_id = ?
         ON CONFLICT (user_id) DO UPDATE SET notes = EXCLUDED.notes || progress.notes, updated_at = now()',
        [$personId, $visitorId],
    );

    return ['moved' => $moved, 'kept' => $kept, 'written' => true];
}

/**
 * The move's path (visitorMove(), inside its transaction): the visitor's
 * steps the person lacks added, a step both have merged (VISITOR_STEP_MERGE),
 * the rest of the person's path document as it is - unless the merged
 * document would be over BODY_LIMIT, when nothing is written and every one
 * of the visitor's steps counts as kept.
 *
 * A step passed out of order (the visitor passed a later step the person has
 * not reached) unlocks nothing: the path opens up to the first step not
 * passed (path.service.ts firstOpenIndex(); its spec pins that).
 *
 * @return array{moved: int, merged: int, kept: int, written: bool}
 */
function visitorMovePath(int $visitorId, int $personId): array
{
    $row = dbOne(
        'WITH person AS (
              SELECT coalesce((SELECT data FROM path_progress WHERE user_id = ?), \'{"steps": {}}\'::jsonb) AS data
         ), each_step AS (
              SELECT s.key, s.value AS v, person.data -> \'steps\' -> s.key AS p
                FROM person, path_progress AS vp, jsonb_each(vp.data -> \'steps\') AS s
               WHERE vp.user_id = ?
         ), both_records AS (
              SELECT key, v, p,
                     jsonb_typeof(v -> \'updatedAt\') = \'string\'
                       AND (jsonb_typeof(p -> \'updatedAt\') IS DISTINCT FROM \'string\'
                            OR (v ->> \'updatedAt\') COLLATE "C" > (p ->> \'updatedAt\') COLLATE "C") AS newer
                FROM each_step
         ), merged AS (
              SELECT count(*) FILTER (WHERE p IS NULL) AS moved,
                     count(*) FILTER (WHERE p IS NOT NULL) AS merged,
                     coalesce(jsonb_object_agg(key, CASE
                         WHEN p IS NULL THEN v
                         WHEN jsonb_typeof(p) <> \'object\' OR jsonb_typeof(v) <> \'object\' THEN p
                         ELSE ' .
            VISITOR_STEP_MERGE .
            '
                     END), \'{}\'::jsonb) AS steps
                FROM both_records
         ), result AS (
              SELECT merged.moved, merged.merged,
                     jsonb_set(person.data, \'{steps}\', (person.data -> \'steps\') || merged.steps) AS data
                FROM merged, person
         )
         SELECT moved, merged, data::text AS data, octet_length(data::text) AS bytes FROM result',
        [$personId, $visitorId],
    );
    $moved = (int) $row['moved'];
    $merged = (int) $row['merged'];
    if ($moved === 0 && $merged === 0) {
        return ['moved' => 0, 'merged' => 0, 'kept' => 0, 'written' => false];
    }
    if ((int) $row['bytes'] > BODY_LIMIT) {
        error_log("[visitors] a move kept the account's path as it was: with the visitor's steps it would be over " . BODY_LIMIT . ' bytes');

        return ['moved' => 0, 'merged' => 0, 'kept' => $moved + $merged, 'written' => false];
    }

    dbExec(
        'INSERT INTO path_progress (user_id, data) VALUES (?, ?::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
        [$personId, $row['data']],
    );

    return ['moved' => $moved, 'merged' => $merged, 'kept' => 0, 'written' => true];
}

/**
 * Deletes the visitors unseen for VISITOR_KEEP_DAYS with everything of
 * theirs (STORE_PERSON_TABLES first: their foreign keys do not cascade),
 * oldest first, VISITOR_SWEEP_BATCH at a time - each batch its own
 * transaction, each statement allowed VISITOR_SWEEP_STATEMENT_MS, and no new
 * batch once VISITOR_SWEEP_BUDGET_MS have gone. A visitor another request
 * holds (a save that is writing) is skipped, never waited for: the next
 * sweep takes it. Then the counted addresses older than an hour go. Nothing
 * while migration 005 waits. Returns how many visitors went.
 */
function visitorSweep(): int
{
    if (!visitorsReady()) {
        return 0;
    }

    $started = hrtime(true);
    $left = static fn(): int => VISITOR_SWEEP_BUDGET_MS - intdiv(hrtime(true) - $started, 1_000_000);
    $gone = 0;
    while ($left() >= 100) {
        $timeout = min(VISITOR_SWEEP_STATEMENT_MS, $left());
        $swept = dbTx(static function () use ($timeout): int {
            dbValue("SELECT set_config('statement_timeout', ?, true)", [$timeout . 'ms']);
            $ids = array_map(
                'intval',
                array_column(
                    dbAll(
                        'SELECT id FROM users WHERE id < 0 AND last_seen_at < now() - make_interval(days => ?::int)
                  ORDER BY last_seen_at LIMIT ? FOR UPDATE SKIP LOCKED',
                        [VISITOR_KEEP_DAYS, VISITOR_SWEEP_BATCH],
                    ),
                    'id',
                ),
            );
            if ($ids === []) {
                return 0;
            }
            $list = '{' . implode(',', $ids) . '}';
            foreach (STORE_PERSON_TABLES as $table) {
                dbExec("DELETE FROM $table WHERE user_id = ANY(?::bigint[])", [$list]);
            }

            return dbExec('DELETE FROM users WHERE id = ANY(?::bigint[]) AND id < 0', [$list]);
        });
        $gone += $swept;
        if ($swept < VISITOR_SWEEP_BATCH) {
            break;
        }
    }
    dbExec("DELETE FROM visitor_starts WHERE started_at < now() - interval '1 hour'");
    if ($gone > 0) {
        error_log('[visitors] unseen for ' . VISITOR_KEEP_DAYS . " days, deleted: $gone");
    }

    return $gone;
}

/**
 * The sweep, after this request's answer (api/after_response.php): always
 * when $now (a visitor was just made), else at most once every
 * VISITOR_SWEEP_EVERY seconds across the site (the time of the file
 * storage/visitors-swept). Queued once a request. It never fails the
 * request: a failure is logged.
 */
function visitorSweepAfterAnswer(bool $now = false): void
{
    static $queued = false;

    if ($queued) {
        return;
    }
    $queued = true;
    afterResponse(static function () use ($now): void {
        if ($now || visitorSweepDue()) {
            visitorSweep();
        }
    });
}

/**
 * Is a sweep due - the marker missing or older than VISITOR_SWEEP_EVERY? If
 * so it is touched first, so the requests right after this one do not sweep
 * too. (A storage that cannot be written sweeps every time, which costs one
 * indexed look.)
 */
function visitorSweepDue(): bool
{
    $marker = storageDir() . '/visitors-swept';
    clearstatcache(true, $marker);
    $at = @filemtime($marker);
    if ($at !== false && $at > time() - VISITOR_SWEEP_EVERY) {
        return false;
    }
    if (!is_dir(dirname($marker))) {
        @mkdir(dirname($marker), 0775, true);
    }
    @touch($marker);

    return true;
}
