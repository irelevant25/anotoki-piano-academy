<?php

// The move at sign-in - POST /api/visitor/move, visitorMove() in
// api/visitors.php - through the real server: the person's notes stay where
// both have one, a path step both have is merged so that a pass is never
// lost, every round comes along, the visitor goes; again is {found: false};
// an empty account takes everything; rounds alone start no new generation; a
// colliding round stays behind; a merge over BODY_LIMIT is not made (notes
// and path each); no token, no key, a malformed key; the switch on; another
// person untouched; a lock held too long (503 visitor_move_retry, nothing
// moved); the person's row gone (401, nothing moved).

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const PERSON = 11;
const OTHER = 12;
const KEY_SHAPE = '/^[A-Za-z0-9_-]{43}$/D';
/** The move's wait for a row another request holds, short here so the test of it is quick. */
const LOCK_MS = 400;

$GLOBALS['auth'] = null;
$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['auth'] = test_auth_iam();
    test_login_required($GLOBALS['auth'], false);
    $GLOBALS['app'] = start_app($GLOBALS['auth'], [], ['visitors' => ['visitors' => ['move_lock_timeout_ms' => LOCK_MS]]]);
});

function visit(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

function with_key(string $key): array
{
    return [VISITOR_HEADER . ': ' . $key];
}

function generation(int $generation): string
{
    return GENERATION_HEADER . ': ' . $generation;
}

function as_person(int $id = PERSON): array
{
    return bearer(test_token($id, ['MEMBER']));
}

function note(int $midi, array $extra = []): array
{
    return $extra + [
        'midi' => $midi,
        'status' => 'learning',
        'repetitions' => 1,
        'easeFactor' => 2.5,
        'intervalHours' => 4,
        'dueAt' => '2026-09-28T12:00:00.000Z',
        'lastGrade' => 4,
        'totalAttempts' => 3,
        'correctAttempts' => 2,
        'avgTimingErrorMs' => null,
        'lastGrowthAt' => '2026-09-28T08:00:00.000Z',
        'updatedAt' => '2026-09-28T08:00:00.000Z',
    ];
}

/** A path step's record as path.service.ts writes it. */
function step(int $attempts, float|int $last, float|int $best, ?string $passedAt, string $updatedAt): array
{
    return ['attempts' => $attempts, 'lastAccuracy' => $last, 'bestAccuracy' => $best, 'passedAt' => $passedAt, 'updatedAt' => $updatedAt];
}

function round_of(string $mode = 'trainer'): array
{
    return ['mode' => $mode, 'attempts' => 4, 'correct' => 3, 'accuracy' => 75];
}

/** No visitors, and nothing of PERSON's or OTHER's; sign-in not required. */
function fresh(): void
{
    test_login_required($GLOBALS['auth'], false);
    foreach (STORE_PERSON_TABLES as $table) {
        dbExec("DELETE FROM $table WHERE user_id < 0 OR user_id IN (?, ?)", [PERSON, OTHER]);
    }
    dbExec('DELETE FROM users WHERE id < 0 OR id IN (?, ?)', [PERSON, OTHER]);
    dbExec('DELETE FROM visitor_starts');
}

/**
 * A visitor with these notes, path steps and rounds (each round's
 * Idempotency-Key: $roundKeys) - its key, id and generation.
 *
 * @return array{key: string, id: int, generation: int}
 */
function visitor_with(array $notes, array $steps = [], array $roundKeys = []): array
{
    $made = visit('PUT', '/api/progress', $notes === [] ? new stdClass() : $notes, [generation(0)]);
    assert_same(204, $made['status'], 'a first save makes a visitor: ' . $made['raw']);
    $key = (string) ($made['headers']['x-visitor-key'] ?? '');
    assert_match(KEY_SHAPE, $key);
    $generation = (int) $made['headers']['progress-generation'];
    if ($steps !== []) {
        assert_same(204, visit('PUT', '/api/path', ['steps' => $steps], array_merge(with_key($key), [generation($generation)]))['status']);
    }
    foreach ($roundKeys as $roundKey) {
        assert_same(201, visit('POST', '/api/sessions', round_of('lesson'), array_merge(with_key($key), ["Idempotency-Key: $roundKey"]))['status']);
    }

    return ['key' => $key, 'id' => (int) dbValue('SELECT id FROM users WHERE visitor_key_hash = ?', [hash('sha256', $key)]), 'generation' => $generation];
}

/** The person's progress through the API, as the app saves it: notes, a path document, rounds. Their generation. */
function person_with(int $id, array $notes, ?array $path = null, array $roundKeys = []): int
{
    $generation = (int) visit('GET', '/api/state', null, as_person($id))['body']['generation'];
    if ($notes !== []) {
        assert_same(204, visit('PUT', '/api/progress', $notes, array_merge(as_person($id), [generation($generation)]))['status']);
    }
    if ($path !== null) {
        assert_same(204, visit('PUT', '/api/path', $path, array_merge(as_person($id), [generation($generation)]))['status']);
    }
    foreach ($roundKeys as $roundKey) {
        assert_same(201, visit('POST', '/api/sessions', round_of(), array_merge(as_person($id), ["Idempotency-Key: $roundKey"]))['status']);
    }

    return $generation;
}

function move(string $key, int $id = PERSON): array
{
    return visit('POST', '/api/visitor/move', null, array_merge(as_person($id), with_key($key)));
}

/** Everything the database keeps of one user id, as text. */
function kept_of(int $id): array
{
    return [
        'users' => dbValue('SELECT to_jsonb(u)::text FROM users u WHERE id = ?', [$id]),
        'progress' => dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [$id]),
        'path' => dbValue('SELECT data::text FROM path_progress WHERE user_id = ?', [$id]),
        'sessions' => dbValue("SELECT jsonb_agg(to_jsonb(s) - 'seq' ORDER BY seq)::text FROM sessions s WHERE user_id = ?", [$id]),
    ];
}

const NOTHING_MOVED = ['found' => false, 'notes' => ['moved' => 0, 'kept' => 0], 'steps' => ['moved' => 0, 'merged' => 0, 'kept' => 0], 'sessions' => 0, 'generation' => null];

/* ------------------------------------------------------------- the merge */

test('the merge: the person\'s notes stay, the visitor\'s others come; a step both have is merged, a pass never lost; every round comes; the visitor goes', function (): void {
    fresh();
    $visitor = visitor_with(
        ['60' => note(60, ['status' => 'new']), '62' => note(62)],
        [
            'u1/s1' => step(3, 85, 90, '2026-09-25T10:00:00.000Z', '2026-09-25T10:00:00.000Z'),
            'u1/s2' => step(1, 50, 50, null, '2026-09-25T11:00:00.000Z'),
        ],
        ['v-1', 'v-2', 'v-3'],
    );
    $visitorRounds = dbAll('SELECT id, request_key, recorded_at::text AS at FROM sessions WHERE user_id = ? ORDER BY seq', [$visitor['id']]);
    $old = person_with(
        PERSON,
        ['60' => note(60, ['status' => 'mastered']), '64' => note(64)],
        [
            'steps' => ['u1/s1' => step(2, 60, 70, null, '2026-09-20T09:00:00.000Z')],
            'version' => 2,
        ],
        ['p-1'],
    );
    $note60 = dbValue("SELECT notes -> '60' FROM progress WHERE user_id = ?", [PERSON]);
    person_with(OTHER, ['60' => note(60)], null, ['o-1']);
    $other = kept_of(OTHER);

    $moved = move($visitor['key']);
    assert_same(200, $moved['status'], $moved['raw']);
    $generation = $moved['body']['generation'];
    assert_true(is_int($generation) && $generation !== $old, 'a new generation');
    assert_same(['found' => true, 'notes' => ['moved' => 1, 'kept' => 1], 'steps' => ['moved' => 1, 'merged' => 1, 'kept' => 0], 'sessions' => 3, 'generation' => $generation], $moved['body']);

    $notes = json_decode((string) dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [PERSON]), true);
    assert_same(['60', '62', '64'], array_map('strval', array_keys($notes)));
    assert_same($note60, dbValue("SELECT notes -> '60' FROM progress WHERE user_id = ?", [PERSON]), 'the person\'s note 60, byte for byte');
    assert_same('mastered', $notes['60']['status']);
    assert_json_same(note(62), $notes['62'], 'the visitor\'s 62');
    assert_json_same(note(64), $notes['64'], 'the person\'s 64');

    $path = json_decode((string) dbValue('SELECT data::text FROM path_progress WHERE user_id = ?', [PERSON]), true);
    assert_same(2, $path['version'] ?? null, 'the person\'s other path fields stay');
    assert_json_same(
        step(5, 85, 90, '2026-09-25T10:00:00.000Z', '2026-09-25T10:00:00.000Z'),
        $path['steps']['u1/s1'],
        'both had u1/s1: the attempts added, the best and the pass the visitor\'s, the last the newer',
    );
    assert_json_same(step(1, 50, 50, null, '2026-09-25T11:00:00.000Z'), $path['steps']['u1/s2'], 'the visitor\'s u1/s2');

    $rounds = dbAll('SELECT id, request_key, recorded_at::text AS at FROM sessions WHERE user_id = ? ORDER BY seq', [PERSON]);
    assert_same(4, count($rounds));
    foreach ($visitorRounds as $round) {
        assert_true(in_array($round, $rounds, true), 'a round keeps its id, key and time: ' . $round['request_key']);
    }
    $state = visit('GET', '/api/state', null, as_person())['body'];
    assert_same([4, $generation], [count($state['sessions']), $state['generation']]);

    assert_same(['users' => null, 'progress' => null, 'path' => null, 'sessions' => null], kept_of($visitor['id']), 'the visitor is gone, with all of its rows');
    $stale = visit('PUT', '/api/progress', ['66' => note(66)], array_merge(as_person(), [generation($old)]));
    assert_same([409, 'progress_changed', $generation], [$stale['status'], $stale['body']['code'] ?? null, $stale['body']['generation'] ?? null], 'a tab of the person\'s that loaded before the move');
    foreach (
        [['GET', '/api/state', null, []], ['PUT', '/api/progress', ['66' => note(66)], [generation($visitor['generation'])]], ['POST', '/api/sessions', round_of(), []]]
        as [$method, $url, $body, $headers]
    ) {
        $gone = visit($method, $url, $body, array_merge(with_key($visitor['key']), $headers));
        assert_same([401, 'visitor_unknown'], [$gone['status'], $gone['body']['code'] ?? null], "the old key: $method $url");
    }
    assert_same($other, kept_of(OTHER), 'another person: untouched');
});

test('a pass is never lost: the person\'s pass stays over a later failed try, and the earlier of two passes wins', function (): void {
    fresh();
    $visitor = visitor_with(
        [],
        [
            'u1/s1' => step(4, 40, 40, null, '2026-09-26T10:00:00.000Z'), // newer, failed
            'u1/s2' => step(1, 95, 95, '2026-09-10T10:00:00.000Z', '2026-09-10T10:00:00.000Z'), // older, passed earlier
            'u1/s3' => ['attempts' => 1, 'custom' => true], // fields the person lacks
        ],
    );
    person_with(
        PERSON,
        [],
        [
            'steps' => [
                'u1/s1' => step(1, 92, 92, '2026-09-21T10:00:00.000Z', '2026-09-21T10:00:00.000Z'),
                'u1/s2' => step(2, 99, 99, '2026-09-22T10:00:00.000Z', '2026-09-22T10:00:00.000Z'),
                'u1/s3' => ['bestAccuracy' => 80, 'attempts' => 'many'],
            ],
        ],
    );

    $moved = move($visitor['key']);
    assert_same([200, ['moved' => 0, 'merged' => 3, 'kept' => 0]], [$moved['status'], $moved['body']['steps']]);
    $steps = json_decode((string) dbValue("SELECT (data -> 'steps')::text FROM path_progress WHERE user_id = ?", [PERSON]), true);
    assert_json_same(
        step(5, 40, 92, '2026-09-21T10:00:00.000Z', '2026-09-26T10:00:00.000Z'),
        $steps['u1/s1'],
        'passed by the person, failed later by the visitor: still passed (best 92, passedAt kept), the last try the visitor\'s',
    );
    assert_json_same(step(3, 99, 99, '2026-09-10T10:00:00.000Z', '2026-09-22T10:00:00.000Z'), $steps['u1/s2'], 'both passed: the earlier pass, the larger best, the newer last');
    assert_json_same(
        ['bestAccuracy' => 80, 'attempts' => 1, 'custom' => true],
        $steps['u1/s3'],
        'the person\'s best (the visitor has none); attempts that are no number take the visitor\'s; a field only the visitor has comes',
    );
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'));
});

test('the same move again, or a key nobody has: {found: false} with zeros, nothing done', function (): void {
    fresh();
    $visitor = visitor_with(['62' => note(62)], [], ['v-1']);
    assert_same(true, move($visitor['key'])['body']['found']);
    $person = kept_of(PERSON);
    $again = move($visitor['key']);
    assert_same([200, NOTHING_MOVED], [$again['status'], $again['body']]);
    assert_same(NOTHING_MOVED, move(rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='))['body'], 'a key never handed out');
    assert_same($person, kept_of(PERSON), 'nothing written');
});

test('an empty account takes everything as it is', function (): void {
    fresh();
    $visitor = visitor_with(['60' => note(60), '62' => note(62)], ['u1/s1' => step(1, 90, 90, '2026-09-25T10:00:00.000Z', '2026-09-25T10:00:00.000Z')], ['v-1', 'v-2']);
    $before = kept_of($visitor['id']);
    $moved = move($visitor['key']);
    assert_same(['found' => true, 'notes' => ['moved' => 2, 'kept' => 0], 'steps' => ['moved' => 1, 'merged' => 0, 'kept' => 0], 'sessions' => 2], array_diff_key($moved['body'], ['generation' => 1]));
    $after = kept_of(PERSON);
    assert_same([$before['progress'], $before['path']], [$after['progress'], $after['path']], 'the documents, as the visitor had them');
    assert_same(2, count(json_decode((string) $after['sessions'], true)));
});

test('a visitor with rounds only: the rounds come, the generation stays', function (): void {
    fresh();
    $visitor = visitor_with([], [], ['v-1']);
    dbExec('DELETE FROM progress WHERE user_id = ?', [$visitor['id']]); // nothing but a round
    $generation = person_with(PERSON, ['60' => note(60)]);
    $moved = move($visitor['key']);
    assert_same(['found' => true, 'notes' => ['moved' => 0, 'kept' => 0], 'steps' => ['moved' => 0, 'merged' => 0, 'kept' => 0], 'sessions' => 1, 'generation' => $generation], $moved['body']);
    assert_same(204, visit('PUT', '/api/progress', ['60' => note(60)], array_merge(as_person(), [generation($generation)]))['status'], 'the person\'s open tabs go on saving');
});

test('a round the person has already (the same Idempotency-Key) stays behind; the rest come - and the person\'s retry of a moved round is the stored one', function (): void {
    fresh();
    $visitor = visitor_with([], [], ['same', 'v-2']);
    person_with(PERSON, [], null, ['same']);
    $moved = move($visitor['key']);
    assert_same([200, 1], [$moved['status'], $moved['body']['sessions']]);
    assert_same(['same', 'v-2'], array_column(dbAll('SELECT request_key FROM sessions WHERE user_id = ? ORDER BY request_key', [PERSON]), 'request_key'));
    assert_same(0, (int) dbValue('SELECT count(*) FROM sessions WHERE user_id < 0'), 'the one left behind went with the visitor');

    // The browser's outbox, adopted after the move, posts the visitor's round again as the person's.
    $stored = dbValue('SELECT id FROM sessions WHERE user_id = ? AND request_key = ?', [PERSON, 'v-2']);
    $again = visit('POST', '/api/sessions', round_of('lesson'), array_merge(as_person(), ['Idempotency-Key: v-2']));
    assert_same([200, $stored], [$again['status'], $again['body']['id'] ?? null], 'stored once');
    assert_same(2, (int) dbValue('SELECT count(*) FROM sessions WHERE user_id = ?', [PERSON]));
});

/* ------------------------------------------------- merges that are too large */

test('merged notes over BODY_LIMIT are not made: the person\'s notes stay, the visitor\'s count as kept - and the path still comes', function (): void {
    fresh();
    $visitor = visitor_with(['62' => note(62, ['pad' => str_repeat('v', 100000)]), '60' => note(60)], ['u1/s1' => step(1, 90, 90, null, '2026-09-25T10:00:00.000Z')]);
    $generation = person_with(PERSON, ['60' => note(60, ['pad' => str_repeat('p', 200000)])]);
    $notes = dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [PERSON]);

    $moved = move($visitor['key']);
    assert_same(200, $moved['status']);
    assert_same(['moved' => 0, 'kept' => 2], $moved['body']['notes'], 'every one of the visitor\'s notes kept out');
    assert_same(['moved' => 1, 'merged' => 0, 'kept' => 0], $moved['body']['steps']);
    assert_same($notes, dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [PERSON]), 'the person\'s notes as they were');
    assert_true($moved['body']['generation'] !== $generation, 'the path changed: a new generation');
    $save = visit('PUT', '/api/progress', json_decode((string) $notes), array_merge(as_person(), [generation($moved['body']['generation'])]));
    assert_same(204, $save['status'], 'the person\'s next save is not refused 413');
    assert_match('/a move kept the account\'s notes as they were/', (string) file_get_contents($GLOBALS['app']['log']));
});

test('a merged path over BODY_LIMIT is not made: the person\'s path stays, the visitor\'s steps count as kept - the notes still come', function (): void {
    fresh();
    $visitor = visitor_with(
        ['62' => note(62)],
        [
            'u1/s1' => step(1, 90, 90, null, '2026-09-25T10:00:00.000Z'),
            'u1/s2' => step(1, 90, 90, null, '2026-09-25T10:00:00.000Z'),
            'u1/s3' => step(1, 90, 90, null, '2026-09-25T10:00:00.000Z') + ['pad' => str_repeat('v', 100000)],
        ],
    );
    person_with(PERSON, [], ['steps' => ['u1/s1' => step(1, 50, 50, null, '2026-09-20T10:00:00.000Z') + ['note' => str_repeat('p', 200000)]]]);
    $path = dbValue('SELECT data::text FROM path_progress WHERE user_id = ?', [PERSON]);

    $moved = move($visitor['key']);
    assert_same(['moved' => 0, 'merged' => 0, 'kept' => 3], $moved['body']['steps'], 'every one of the visitor\'s steps kept out');
    assert_same(['moved' => 1, 'kept' => 0], $moved['body']['notes']);
    assert_same($path, dbValue('SELECT data::text FROM path_progress WHERE user_id = ?', [PERSON]), 'the person\'s path as it was');
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'), 'the visitor is gone all the same');
});

/* ---------------------------------------------------- who may ask, and when */

test('the token and the key: no token 401; no key, or one that is not a key, 422 invalid (visitor_key) - nothing moved', function (): void {
    fresh();
    $visitor = visitor_with(['62' => note(62)]);
    $before = kept_of($visitor['id']);

    foreach ([[], with_key($visitor['key']), array_merge(['Authorization: Basic YWRtaW46YWRtaW4='], with_key($visitor['key']))] as $headers) {
        $refused = visit('POST', '/api/visitor/move', null, $headers);
        assert_same([401, 'sign_in_required'], [$refused['status'], $refused['body']['code'] ?? null], 'no Bearer token: ' . implode(' ', $headers));
    }
    $bad = visit('POST', '/api/visitor/move', null, array_merge(['Authorization: Bearer x'], with_key($visitor['key'])));
    assert_same([401, 'invalid_token'], [$bad['status'], $bad['body']['code'] ?? null]);
    foreach (
        ['' => [], 'empty' => [VISITOR_HEADER . ': '], 'short' => with_key('short'), 'one too many' => with_key(str_repeat('a', 44)), 'not base64url' => with_key(str_repeat('*', 43))]
        as $what => $headers
    ) {
        $invalid = visit('POST', '/api/visitor/move', null, array_merge(as_person(), $headers));
        assert_same([422, 'invalid', 'visitor_key'], [$invalid['status'], $invalid['body']['code'] ?? null, $invalid['body']['field'] ?? null], "a key: $what");
    }
    assert_same($before, kept_of($visitor['id']), 'the visitor as it was');
    assert_same(405, visit('GET', '/api/visitor/move', null, array_merge(as_person(), with_key($visitor['key'])))['status']);
});

test('sign-in required does not stop the move: a key handed in with a token still brings the progress', function (): void {
    fresh();
    $visitor = visitor_with(['62' => note(62)]);
    test_login_required($GLOBALS['auth'], true);
    assert_same([401, 'sign_in_required'], [visit('GET', '/api/state', null, with_key($visitor['key']))['status'], 'sign_in_required'], 'the key alone opens nothing now');
    $moved = move($visitor['key']);
    assert_same([200, ['moved' => 1, 'kept' => 0]], [$moved['status'], $moved['body']['notes']]);
});

test(
    'a row another request holds longer than move_lock_timeout_ms (the visitor, or the person\'s progress): 503 visitor_move_retry with Retry-After, nothing moved - and asked again, it moves',
    function (): void {
        fresh();
        $visitor = visitor_with(['62' => note(62)], [], ['v-1']);
        person_with(PERSON, ['60' => note(60)]);
        $before = [kept_of($visitor['id']), kept_of(PERSON)];

        // (The person's users row itself is not held here: requireUser() would wait for it before the move begins.)
        foreach (['the visitor\'s row' => ['users', 'id', $visitor['id']], 'the person\'s progress' => ['progress', 'user_id', PERSON]] as $whose => [$table, $column, $id]) {
            $other = dbConnect(databaseSettings());
            $other->beginTransaction();
            $other->prepare("SELECT 1 FROM $table WHERE $column = ? FOR UPDATE")->execute([$id]);
            try {
                $started = microtime(true);
                $busy = move($visitor['key']);
                $waited = microtime(true) - $started;
            } finally {
                $other->rollBack();
                $other = null;
            }
            assert_same([503, 'visitor_move_retry', '2'], [$busy['status'], $busy['body']['code'] ?? null, $busy['headers']['retry-after'] ?? null], "$whose held");
            assert_true($waited >= LOCK_MS / 1000 && $waited < 5, "it waited move_lock_timeout_ms, not the default ($waited s)");
            assert_same($before, [kept_of($visitor['id']), kept_of(PERSON)], "$whose held: nothing moved");
        }
        assert_match('/a move did not finish, to be asked again: SQLSTATE 55P03/', (string) file_get_contents($GLOBALS['app']['log']));
        assert_same(true, move($visitor['key'])['body']['found'], 'asked again');
    },
);

test('the person\'s own row gone meanwhile (an administrator\'s delete): 401 sign_in_required, nothing moved', function (): void {
    fresh();
    $visitor = visitor_with(['62' => note(62)]);
    $before = kept_of($visitor['id']);
    // In this process, past requireUser() (which would make the row again): the move itself finds no row to lock.
    $refused = null;
    try {
        visitorMove(new SiteUser(PERSON, null, ['MEMBER']), $visitor['key']);
    } catch (ApiError $e) {
        $refused = $e->status . ' ' . $e->errorCode;
    }
    assert_same('401 sign_in_required', $refused);
    assert_same($before, kept_of($visitor['id']), 'the visitor as it was');
    assert_throws(static fn() => visitorMove(new SiteUser($visitor['id'], null, [], true), $visitor['key']), '/Only a signed-in person/');
});

test('the server said nothing it should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
});

exit(test_run());
