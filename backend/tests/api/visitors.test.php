<?php

// Visitors - practising without signing in, when the IAM says Piano Academy
// does not require it (api/visitors.php, requireOwner() in
// meddleware/auth.php) - through the real server: nobody's empty state, the
// first save that makes a visitor (and a failed one that makes nobody and
// counts nothing), the key and what it opens - its own progress, nothing
// else -, a Bearer header that never falls back to the key, sign-in required
// again, the limits per address (an IPv6 /64, a trusted proxy's header,
// X-Forwarded-For never believed - and only a keyed hash of an address ever
// kept; with the origin secret, a request without it counted as the proxy)
// and in all, a visitor's caps, the sweep of
// visitors unseen for 30 days after the answer (and one that fails, which
// never fails the request), a database without 005, and the checks that
// mean "a verified token" refusing a visitor however they are stacked.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

// requireOwner(), requireUser(), requireRole() and identify() - the library's, as this app stacks them - for the
// in-process checks at the end.
require_once TEST_BACKEND . '/api/meddleware/auth.php';

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

const MEMBER = 5;
const KEY_SHAPE = '/^[A-Za-z0-9_-]{43}$/D';

/** Believe 127.0.0.1's CF-Connecting-IP (the one header ever read): the tests come from there, and name the address they stand for. */
const BEHIND_A_PROXY = ['client_address' => ['trusted_proxies' => ['127.0.0.1', '::1']]];

$GLOBALS['auth'] = null;
$GLOBALS['app'] = null;
$GLOBALS['tight'] = null;
before(function (): void {
    // Both servers read the same answer of the IAM: sign-in not required (test_login_required() flips it).
    $GLOBALS['auth'] = test_auth_iam();
    test_login_required($GLOBALS['auth'], false);
    $GLOBALS['app'] = start_app($GLOBALS['auth'], [], ['visitors' => BEHIND_A_PROXY]);
    // Small limits, to reach them.
    $GLOBALS['tight'] = start_app($GLOBALS['auth'], [], ['visitors' => BEHIND_A_PROXY + ['visitors' => [
        'max_visitors' => 3, 'new_per_hour_per_address' => 2, 'new_per_hour' => 4, 'max_sessions' => 2, 'document_max_bytes' => 4096,
    ]]]);
});

/** A request to the app (or $app), as sent: no token unless $headers bring one. */
function visit(string $method, string $url, mixed $body = null, array $headers = [], ?array $app = null): array
{
    return call(($app ?? $GLOBALS['app'])['base'], $method, $url, $body, $headers);
}

function with_key(string $key): array
{
    return [VISITOR_HEADER . ': ' . $key];
}

function generation(int|string $generation): string
{
    return GENERATION_HEADER . ': ' . $generation;
}

function from(string $address): string
{
    return 'CF-Connecting-IP: ' . $address;
}

/**
 * What visitor_starts keeps for a visitor from $address, as the server $app
 * counts it: a keyed hash of its bucket (an IPv6 address its /64) under that
 * server's own installation key - never the address.
 */
function counted_as(string $address, ?array $app = null): string
{
    return clientAddressHash(\Anotoki\Lib\Support\ClientAddress::bucket($address), ($app ?? $GLOBALS['app'])['config'] . '/storage');
}

/** visitor_starts as it is, oldest first. */
function starts(): array
{
    return array_column(dbAll('SELECT address FROM visitor_starts ORDER BY id'), 'address');
}

/** A note state as the frontend's SRS service makes it. */
function note(int $midi, array $extra = []): array
{
    return $extra + [
        'midi' => $midi, 'status' => 'learning', 'repetitions' => 1, 'easeFactor' => 2.5, 'intervalHours' => 4,
        'dueAt' => '2026-09-28T12:00:00.000Z', 'lastGrade' => 4, 'totalAttempts' => 3, 'correctAttempts' => 2,
        'avgTimingErrorMs' => null, 'lastGrowthAt' => '2026-09-28T08:00:00.000Z', 'updatedAt' => '2026-09-28T08:00:00.000Z',
    ];
}

function round_of(string $mode = 'trainer'): array
{
    return ['mode' => $mode, 'attempts' => 4, 'correct' => 3, 'accuracy' => 75];
}

/**
 * A new visitor, made by a first save of its progress (one note) - its key,
 * id and generation.
 *
 * @return array{key: string, id: int, generation: int}
 */
function new_visitor(array $headers = [], ?array $app = null, int $midi = 60): array
{
    $made = visit('PUT', '/api/progress', [(string) $midi => note($midi)], array_merge([generation(0)], $headers), $app);
    assert_same(204, $made['status'], 'a first save makes a visitor: ' . $made['raw']);
    $key = (string) ($made['headers']['x-visitor-key'] ?? '');
    assert_match(KEY_SHAPE, $key, 'its key');

    return [
        'key' => $key,
        'id' => (int) dbValue('SELECT id FROM users WHERE visitor_key_hash = ?', [hash('sha256', $key)]),
        'generation' => (int) ($made['headers']['progress-generation'] ?? 0),
    ];
}

/** No visitor and no counted address left; sign-in not required. */
function fresh(): void
{
    test_login_required($GLOBALS['auth'], false);
    foreach (STORE_PERSON_TABLES as $table) {
        dbExec("DELETE FROM $table WHERE user_id < 0");
    }
    dbExec('DELETE FROM users WHERE id < 0');
    dbExec('DELETE FROM visitor_starts');
}

/** How many visitors there are, and how many addresses are counted. */
function visitors_and_starts(): array
{
    return [(int) dbValue('SELECT count(*) FROM users WHERE id < 0'), (int) dbValue('SELECT count(*) FROM visitor_starts')];
}

/** A visitor's row as it is: when it was seen, and everything it keeps. */
function visitor_as_it_is(int $id): array
{
    return [
        'users' => dbValue('SELECT to_jsonb(u)::text FROM users u WHERE id = ?', [$id]),
        'progress' => dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [$id]),
        'path' => dbValue('SELECT data::text FROM path_progress WHERE user_id = ?', [$id]),
        'sessions' => (int) dbValue('SELECT count(*) FROM sessions WHERE user_id = ?', [$id]),
    ];
}

/** The settings' marker of the last sweep, for a server of this file's. */
function sweep_marker(array $app): string
{
    if (!is_dir($app['config'] . '/storage')) {
        mkdir($app['config'] . '/storage', 0777, true);
    }

    return $app['config'] . '/storage/visitors-swept';
}

/** Whether $check comes true within a few seconds (work after an answer the client has had in full). */
function eventually(callable $check, float $seconds = 5.0): bool
{
    $until = microtime(true) + $seconds;
    while (!$check()) {
        if (microtime(true) > $until) {
            return false;
        }
        usleep(50000);
    }

    return true;
}

/** A visitor gone, with what it keeps (the foreign keys do not cascade). */
function drop_visitor(int $id): void
{
    foreach (STORE_PERSON_TABLES as $table) {
        dbExec("DELETE FROM $table WHERE user_id = ?", [$id]);
    }
    dbExec('DELETE FROM users WHERE id = ? AND id < 0', [$id]);
}

/* --------------------------------------------------------------- nobody */

test('nobody, sign-in not required: the empty state with generation 0 - nothing read, written or handed out', function (): void {
    fresh();
    $state = visit('GET', '/api/state');
    assert_same(200, $state['status']);
    assert_same('{"progress":{},"sessions":[],"path":{"steps":{}},"generation":0}', $state['raw'], 'no progress anywhere yet');
    assert_false(isset($state['headers']['x-visitor-key']), 'a page view never makes a visitor');
    assert_same([0, 0], visitors_and_starts());

    test_login_required($GLOBALS['auth'], true);
    $refused = visit('GET', '/api/state');
    assert_same([401, 'sign_in_required'], [$refused['status'], $refused['body']['code'] ?? null], 'sign-in required: nobody is refused, as before');
    foreach ([['PUT', '/api/progress', ['60' => note(60)], [generation(0)]], ['PUT', '/api/path', ['steps' => new stdClass()], [generation(0)]], ['POST', '/api/sessions', round_of(), []]] as [$method, $url, $body, $headers]) {
        $answer = visit($method, $url, $body, $headers);
        assert_same([401, 'sign_in_required'], [$answer['status'], $answer['body']['code'] ?? null], "$method $url");
        assert_false(isset($answer['headers']['x-visitor-key']));
    }
    assert_same([0, 0], visitors_and_starts(), 'and nobody is made');
});

/* ----------------------------------------------------- making a visitor */

test('the first save makes a visitor: the key once, in X-Visitor-Key, never kept by a cache - only its hash stored', function (): void {
    fresh();
    $made = visit('PUT', '/api/progress', ['60' => note(60)], [generation(0)]);
    assert_same([204, ''], [$made['status'], $made['raw']]);
    $key = $made['headers']['x-visitor-key'] ?? '';
    assert_match(KEY_SHAPE, $key, '43 characters of base64url');
    assert_same('no-store', $made['headers']['cache-control'] ?? null);
    assert_match('/^[1-9][0-9]*$/D', $made['headers']['progress-generation'] ?? '', 'the new visitor\'s generation');

    $row = dbOne('SELECT id, preferred_username, visitor_key_hash, progress_generation FROM users WHERE id < 0');
    assert_true((int) $row['id'] < 0, 'a negative id, never an IAM user id');
    assert_same(null, $row['preferred_username']);
    assert_same(hash('sha256', $key), $row['visitor_key_hash']);
    assert_same((int) $made['headers']['progress-generation'], (int) $row['progress_generation']);
    assert_same([1, 1], visitors_and_starts());
    assert_same([counted_as('127.0.0.1')], starts(), 'the address counted - a keyed hash of it, never the address');
    assert_match('/^[0-9a-f]{64}$/D', starts()[0]);

    // The key itself is nowhere but in that answer.
    foreach (['users', 'visitor_starts', 'progress', 'sessions', 'path_progress'] as $table) {
        assert_same(0, (int) dbValue("SELECT count(*) FROM $table t WHERE to_jsonb(t)::text LIKE ?", ['%' . $key . '%']), "the key is not in $table");
    }
    assert_false(str_contains((string) file_get_contents($GLOBALS['app']['log']), $key), 'nor in the server\'s log');

    $state = visit('GET', '/api/state', null, with_key($key));
    assert_same(200, $state['status']);
    assert_json_same(['60' => note(60)], $state['body']['progress']);
    assert_same((int) $made['headers']['progress-generation'], $state['body']['generation'], 'its state names the generation the save handed out');
    assert_false(isset($state['headers']['x-visitor-key']), 'the key is handed out once');
});

test('a path or a round makes one too - and each answer carries the key with the generation', function (): void {
    fresh();
    $path = visit('PUT', '/api/path', ['steps' => ['rh-1/meet' => ['attempts' => 1]]], [generation(0)]);
    assert_same(204, $path['status']);
    assert_match(KEY_SHAPE, $path['headers']['x-visitor-key'] ?? '');
    assert_match('/^[1-9][0-9]*$/D', $path['headers']['progress-generation'] ?? '');

    $round = visit('POST', '/api/sessions', round_of(), ['Idempotency-Key: first-round']);
    assert_same(201, $round['status']);
    assert_same('trainer', $round['body']['mode']);
    assert_match(KEY_SHAPE, $key = $round['headers']['x-visitor-key'] ?? '');
    assert_same('no-store', $round['headers']['cache-control'] ?? null);
    assert_match('/^[1-9][0-9]*$/D', $round['headers']['progress-generation'] ?? '');
    assert_same([2, 2], visitors_and_starts(), 'two visitors: each browser that saved without a key');

    $state = visit('GET', '/api/state', null, with_key($key));
    assert_same([1, 'trainer'], [count($state['body']['sessions']), $state['body']['sessions'][0]['mode']]);
    assert_same([], $state['body']['progress']);
});

test('a first save that fails makes nobody and counts nothing - ten of them from one address still leave room for one that works', function (): void {
    fresh();
    $failed = [
        'a body that is no progress' => ['PUT', '/api/progress', ['x' => 1], [generation(0)], 400],
        'not JSON' => ['PUT', '/api/progress', '{', [generation(0), 'Content-Type: application/json'], 400],
        'no generation' => ['PUT', '/api/progress', ['60' => note(60)], [], 428],
        'another generation than 0' => ['PUT', '/api/progress', ['60' => note(60)], [generation(5)], 409],
        'too large' => ['PUT', '/api/progress', ['60' => note(60, ['pad' => str_repeat('x', 140000)])], [generation(0)], 413],
        'a path that is no path' => ['PUT', '/api/path', ['steps' => [1, 2]], [generation(0)], 400],
        'a round that is no round' => ['POST', '/api/sessions', ['mode' => 'piano'], [], 400],
        'a bad Idempotency-Key' => ['POST', '/api/sessions', round_of(), ['Idempotency-Key: not a key'], 400],
        'a path too large' => ['PUT', '/api/path', ['steps' => ['a/b' => ['pad' => str_repeat('x', 140000)]]], [generation(0)], 413],
        'a round of a mode nobody knows' => ['POST', '/api/sessions', ['mode' => 'trainer', 'accuracy' => 101], [], 400],
    ];
    foreach ($failed as $what => [$method, $url, $body, $headers, $status]) {
        $answer = visit($method, $url, $body, $headers);
        assert_same($status, $answer['status'], "$what: $method $url");
        assert_false(isset($answer['headers']['x-visitor-key']), "$what: no key");
        assert_same([0, 0], visitors_and_starts(), "$what: nobody made, nothing counted");
    }
    $changed = visit('PUT', '/api/progress', ['60' => note(60)], [generation(5)]);
    assert_same(['progress_changed', null], [$changed['body']['code'] ?? null, array_key_exists('generation', $changed['body']) ? $changed['body']['generation'] : 'missing'], 'a save made to progress that is not nobody\'s: 409, no generation to load');
    new_visitor();
    assert_same([1, 1], visitors_and_starts());
});

/* ---------------------------------------------------------- the visitor */

test('the visitor: its own documents and generation; a save to them passes, one to generation 0 is a second tab\'s - 409', function (): void {
    fresh();
    $visitor = new_visitor();
    $key = with_key($visitor['key']);
    assert_same(204, visit('PUT', '/api/progress', ['60' => note(60), '62' => note(62)], array_merge($key, [generation($visitor['generation'])]))['status']);
    assert_same(204, visit('PUT', '/api/path', ['steps' => ['rh-1/drill' => ['attempts' => 2]]], array_merge($key, [generation($visitor['generation'])]))['status']);
    $round = visit('POST', '/api/sessions', round_of('lesson'), array_merge($key, ['Idempotency-Key: v-1']));
    assert_same(201, $round['status']);
    assert_false(isset($round['headers']['x-visitor-key']), 'a visitor\'s saves hand out no key');
    $again = visit('POST', '/api/sessions', round_of('lesson'), array_merge($key, ['Idempotency-Key: v-1']));
    assert_same([200, $round['body']['id']], [$again['status'], $again['body']['id']], 'a retried round is stored once');

    $state = visit('GET', '/api/state', null, $key)['body'];
    assert_same(['60', '62'], array_map('strval', array_keys($state['progress'])));
    assert_same(['rh-1/drill'], array_keys($state['path']['steps']));
    assert_same([1, $visitor['generation']], [count($state['sessions']), $state['generation']], 'ordinary saves keep the generation');

    $stale = visit('PUT', '/api/progress', ['64' => note(64)], array_merge($key, [generation(0)]));
    assert_same([409, 'progress_changed', $visitor['generation']], [$stale['status'], $stale['body']['code'] ?? null, $stale['body']['generation'] ?? null], 'a tab that made no visitor yet, sending the key the first one got');
    assert_same(428, visit('PUT', '/api/progress', ['64' => note(64)], $key)['status'], 'no generation');
    assert_same([1, 1], visitors_and_starts(), 'one visitor all along');
});

test('a key nobody has, or one of the wrong shape: 401 visitor_unknown on every route - nothing made, nothing written', function (): void {
    fresh();
    $unknown = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    foreach ([$unknown, 'short', str_repeat('a', 44), str_repeat('*', 43)] as $key) {
        foreach ([['GET', '/api/state', null, []], ['PUT', '/api/progress', ['60' => note(60)], [generation(0)]], ['PUT', '/api/path', ['steps' => new stdClass()], [generation(0)]], ['POST', '/api/sessions', round_of(), []]] as [$method, $url, $body, $headers]) {
            $answer = visit($method, $url, $body, array_merge($headers, with_key($key)));
            assert_same([401, 'visitor_unknown'], [$answer['status'], $answer['body']['code'] ?? null], "$method $url with $key");
            assert_false(isset($answer['headers']['x-visitor-key']), 'never a new key in its place');
        }
    }
    assert_same([0, 0], visitors_and_starts());
    assert_same(200, visit('GET', '/api/state', null, [VISITOR_HEADER . ':  '])['status'], 'an empty header is no key: nobody');
});

test('a Bearer header is that person or a 401 - never the visitor, whose key is not even read', function (): void {
    fresh();
    $visitor = new_visitor();
    dbExec("UPDATE users SET last_seen_at = now() - interval '2 hours' WHERE id = ?", [$visitor['id']]);
    $before = visitor_as_it_is($visitor['id']);
    $bad = [
        'expired' => [bearer(test_token(MEMBER, [], ['exp' => time() - 3600])), 'invalid_token'],
        'signed by somebody else' => [bearer(test_token(MEMBER, [], [], ['iam' => test_other_iam('other')])), 'invalid_token'],
        'garbage' => [['Authorization: Bearer x'], 'invalid_token'],
        // The library's rule: a Bearer header claims a sign-in, and one with no token is refused as a token is.
        'Bearer with nothing after it' => [['Authorization: Bearer '], 'invalid_token'],
    ];
    foreach ($bad as $what => [$headers, $code]) {
        foreach ([['GET', '/api/state', null], ['PUT', '/api/progress', ['61' => note(61)]], ['POST', '/api/sessions', round_of()]] as [$method, $url, $body]) {
            $answer = visit($method, $url, $body, array_merge($headers, with_key($visitor['key']), [generation($visitor['generation'])]));
            assert_same([401, $code], [$answer['status'], $answer['body']['code'] ?? null], "$what: $method $url");
        }
    }
    assert_same($before, visitor_as_it_is($visitor['id']), 'the visitor was not looked up, seen or written');

    // A member's good token with the visitor's key: the member's own data, and nothing of the visitor's.
    $member = visit('GET', '/api/state', null, array_merge(bearer(test_token(MEMBER, ['MEMBER'])), with_key($visitor['key'])));
    assert_same([200, []], [$member['status'], $member['body']['progress']]);
    assert_same(204, visit('PUT', '/api/progress', ['70' => note(70)], array_merge(bearer(test_token(MEMBER, ['MEMBER'])), with_key($visitor['key']), [generation($member['body']['generation'])]))['status']);
    assert_same(['70'], array_map('strval', array_keys(json_decode((string) dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [MEMBER]), true))));
    assert_same($before, visitor_as_it_is($visitor['id']), 'still untouched');

    // Basic (a host behind a password file) is no sign-in: the key decides.
    $basic = visit('GET', '/api/state', null, array_merge(['Authorization: Basic YWRtaW46YWRtaW4='], with_key($visitor['key'])));
    assert_same(200, $basic['status']);
    assert_json_same(['60' => note(60)], $basic['body']['progress']);
});

test('visitors and people never see each other\'s progress: each keeps their own note 60', function (): void {
    fresh();
    $a = new_visitor([], null, 60);
    $b = new_visitor([], null, 60);
    assert_true($a['id'] !== $b['id'] && $a['key'] !== $b['key']);
    assert_same(204, visit('PUT', '/api/progress', ['60' => note(60, ['status' => 'review'])], array_merge(with_key($a['key']), [generation($a['generation'])]))['status']);
    assert_same(201, visit('POST', '/api/sessions', round_of(), with_key($b['key']))['status']);
    $member = visit('GET', '/api/state', null, bearer(test_token(MEMBER)))['body'];

    $stateA = visit('GET', '/api/state', null, with_key($a['key']))['body'];
    $stateB = visit('GET', '/api/state', null, with_key($b['key']))['body'];
    assert_same(['review', 'learning'], [$stateA['progress']['60']['status'], $stateB['progress']['60']['status']]);
    assert_same([0, 1], [count($stateA['sessions']), count($stateB['sessions'])]);
    assert_false(isset($member['progress']['60']), 'the member has none of theirs');
    assert_same($member, visit('GET', '/api/state', null, bearer(test_token(MEMBER)))['body']);
});

test('a visitor key never opens the own progress file, the admin panel or a role - and never with a token\'s role around it', function (): void {
    fresh();
    $visitor = new_visitor();
    foreach ([['GET', '/api/me/export', null], ['POST', '/api/me/import', ['format' => 'piano-academy-export', 'version' => 1]],
        ['GET', '/api/admin/people', null], ['GET', '/api/admin/translations', null], ['GET', '/api/admin/migrations', null],
        ['POST', '/api/admin/migrations/apply', null], ['DELETE', '/api/admin/people/' . MEMBER, null]] as [$method, $url, $body]) {
        $answer = visit($method, $url, $body, with_key($visitor['key']));
        assert_same([401, 'sign_in_required'], [$answer['status'], $answer['body']['code'] ?? null], "$method $url");
    }
    assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [MEMBER]), 'nobody deleted');
});

test('sign-in required again: a valid key is 401 sign_in_required - not looked up, not seen, nothing made - and works when it is off again', function (): void {
    fresh();
    $visitor = new_visitor();
    dbExec("UPDATE users SET last_seen_at = now() - interval '2 hours' WHERE id = ?", [$visitor['id']]);
    $before = visitor_as_it_is($visitor['id']);

    test_login_required($GLOBALS['auth'], true);
    foreach ([['GET', '/api/state', null, []], ['PUT', '/api/progress', ['61' => note(61)], [generation($visitor['generation'])]], ['POST', '/api/sessions', round_of(), []]] as [$method, $url, $body, $headers]) {
        $answer = visit($method, $url, $body, array_merge($headers, with_key($visitor['key'])));
        assert_same([401, 'sign_in_required'], [$answer['status'], $answer['body']['code'] ?? null], "$method $url");
    }
    $unknown = visit('GET', '/api/state', null, with_key(str_repeat('A', 43)));
    assert_same('sign_in_required', $unknown['body']['code'] ?? null, 'a key nobody has is not even reported unknown');
    assert_same($before, visitor_as_it_is($visitor['id']), 'the visitor as it was');
    assert_same([1, 1], visitors_and_starts());

    test_login_required($GLOBALS['auth'], false);
    assert_json_same(['60' => note(60)], visit('GET', '/api/state', null, with_key($visitor['key']))['body']['progress'], 'switched off again: the progress is there');
});

test('seen: a visitor\'s last visit is written at most once an hour', function (): void {
    fresh();
    $visitor = new_visitor();
    $seen = static fn(): string => (string) dbValue('SELECT last_seen_at::text FROM users WHERE id = ?', [$visitor['id']]);
    dbExec("UPDATE users SET last_seen_at = now() - interval '50 minutes' WHERE id = ?", [$visitor['id']]);
    $was = $seen();
    visit('GET', '/api/state', null, with_key($visitor['key']));
    assert_same($was, $seen(), 'fifty minutes ago: not written again');
    dbExec("UPDATE users SET last_seen_at = now() - interval '70 minutes' WHERE id = ?", [$visitor['id']]);
    $was = $seen();
    visit('GET', '/api/state', null, with_key($visitor['key']));
    assert_true($seen() > $was, 'seventy minutes ago: now');
});

/* ------------------------------------------------------------ the limits */

test('new visitors an hour per address: a trusted proxy\'s CF-Connecting-IP, an IPv6 /64 as one, X-Forwarded-For, X-Real-IP and True-Client-IP never believed - 429 with Retry-After', function (): void {
    fresh();
    $tight = $GLOBALS['tight'];
    new_visitor([from('198.51.100.7')], $tight);
    new_visitor([from('::ffff:198.51.100.7')], $tight);
    $third = visit('PUT', '/api/progress', ['60' => note(60)], [generation(0), from('198.51.100.7')], $tight);
    assert_same([429, 'too_many_visitors', '3600'], [$third['status'], $third['body']['code'] ?? null, $third['headers']['retry-after'] ?? null], 'the third from one address within the hour');
    assert_match('/Sign in/', $third['body']['error'] ?? '');
    assert_false(isset($third['headers']['x-visitor-key']));
    new_visitor([from('198.51.100.8')], $tight);
    assert_same([counted_as('198.51.100.7', $tight), counted_as('198.51.100.7', $tight), counted_as('198.51.100.8', $tight)], starts(), 'an IPv4 address written as IPv6 is that address');

    fresh();
    new_visitor([from('2001:db8:1:2::1')], $tight);
    new_visitor([from('2001:db8:1:2:ffff:ffff:ffff:fffe')], $tight);
    assert_same(429, visit('PUT', '/api/progress', ['60' => note(60)], [generation(0), from('2001:db8:1:2::abcd')], $tight)['status'], 'one /64 is one address');
    new_visitor([from('2001:db8:1:3::1')], $tight);
    assert_same([counted_as('2001:db8:1:2::abcd', $tight), counted_as('2001:db8:1:3::5', $tight)], array_values(array_unique(starts())), 'each /64 one hash');

    // The header is pinned: from the trusted proxy too, any other is the caller's word - X-Forwarded-For, X-Real-IP,
    // True-Client-IP (Cloudflare passes them on untouched): the connection counts.
    foreach (['X-Forwarded-For', 'X-Real-IP', 'True-Client-IP'] as $header) {
        fresh();
        new_visitor(["$header: 203.0.113.1"], $tight);
        new_visitor(["$header: 203.0.113.2"], $tight);
        assert_same(429, visit('PUT', '/api/progress', ['60' => note(60)], [generation(0), "$header: 203.0.113.3"], $tight)['status'], "$header: a header the caller writes picks no new address");
        assert_same([counted_as('127.0.0.1', $tight)], array_values(array_unique(starts())), $header);
    }
    // A list in the trusted proxy's header is no address: the connection's own counts (CF-Connecting-IP names one).
    fresh();
    new_visitor([from('203.0.113.4, 198.51.100.9')], $tight);
    assert_same([counted_as('127.0.0.1', $tight)], starts(), 'a list is no address - the connection counts');
});

test('only a keyed hash of an address is ever kept: no address in visitor_starts (which every backup carries) - each server its own key', function (): void {
    fresh();
    foreach (['198.51.100.21', '2001:db8:9:9::1', '::ffff:198.51.100.22'] as $address) {
        new_visitor([from($address)], $GLOBALS['tight']);
    }
    new_visitor([from('198.51.100.21')], $GLOBALS['app']);
    $kept = implode("\n", starts());
    foreach (['198.51.100.21', '198.51.100.22', '2001:db8', '127.0.0.1'] as $address) {
        assert_false(str_contains($kept, $address), "no $address in visitor_starts");
    }
    assert_same(4, count(array_filter(starts(), static fn (string $row): bool => preg_match('/^[0-9a-f]{64}$/D', $row) === 1)), 'four keyed hashes');
    assert_true(counted_as('198.51.100.21', $GLOBALS['tight']) !== counted_as('198.51.100.21', $GLOBALS['app']), 'one address, two installations: two hashes - a key of each installation\'s own');
    assert_same(counted_as('198.51.100.21', $GLOBALS['app']), starts()[3]);
    assert_false(str_contains((string) file_get_contents($GLOBALS['tight']['log']), '198.51.100.21'), 'nor in the server\'s log');
});

test('with the origin secret, a Worker writing a new CF-Connecting-IP every time is one sender - the proxy it came through - for the visitors\' limit and the library\'s alike; through the zone, each visitor their own', function (): void {
    fresh();
    // A server of its own with config/cloudflare.local.php: the proxy this file trusts (127.0.0.1, the tests)
    // stands for an edge of Cloudflare's, which carries anybody's requests - the owner's zone's alone with the secret.
    $secret = 'origin-' . bin2hex(random_bytes(20));
    $guarded = start_app($GLOBALS['auth'], [], [
        'visitors' => BEHIND_A_PROXY + ['visitors' => ['new_per_hour_per_address' => 2]],
        'cloudflare' => ['origin_secret' => $secret],
    ]);
    touch(sweep_marker($guarded)); // no sweep in this test
    try {
        new_visitor([from('198.51.100.31')], $guarded);
        new_visitor([from('198.51.100.32')], $guarded);
        $third = visit('PUT', '/api/progress', ['60' => note(60)], [generation(0), from('198.51.100.33')], $guarded);
        assert_same([429, 'too_many_visitors'], [$third['status'], $third['body']['code'] ?? null], 'the third, from an address never seen: the proxy\'s limit is spent');
        $wrong = visit('PUT', '/api/progress', ['60' => note(60)], [generation(0), from('198.51.100.34'), 'X-Anotoki-Origin: not the secret'], $guarded);
        assert_same([429, 'too_many_visitors'], [$wrong['status'], $wrong['body']['code'] ?? null], 'a wrong secret: the proxy too');
        assert_same([counted_as('127.0.0.1', $guarded), counted_as('127.0.0.1', $guarded)], starts(), 'counted as the proxy, never as the addresses claimed');
        new_visitor([from('198.51.100.35'), "X-Anotoki-Origin: $secret"], $guarded);
        assert_same(counted_as('198.51.100.35', $guarded), starts()[2], 'through the owner\'s zone: the visitor it names');

        // The pages' own errors: the library's limit (20 an hour from one sender), by adminContext()'s reading.
        $report = static fn (string $address, array $headers = []): array => visit('POST', '/api/client-errors', ['message' => "A page's error from $address", 'page' => '/'], array_merge([from($address)], $headers), $guarded);
        for ($i = 1; $i <= 20; $i++) {
            assert_same(204, $report("203.0.113.$i")['status'], "report $i, from a made-up visitor");
        }
        $over = $report('203.0.113.21');
        assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], 'the 21st, from an address never seen: the proxy\'s budget is spent');
        assert_same(204, $report('203.0.113.22', ["X-Anotoki-Origin: $secret"])['status'], 'through the zone: a visitor with a budget of their own');
        assert_same([], server_problems($guarded), 'its server said nothing it should not have');
    } finally {
        $guarded['stop']();
    }
});

test('new visitors an hour in all, and visitors at once: a full site refuses new visitors only', function (): void {
    fresh();
    $tight = $GLOBALS['tight'];
    $first = new_visitor([from('198.51.100.1')], $tight);
    new_visitor([from('198.51.100.2')], $tight);
    new_visitor([from('198.51.100.3')], $tight);
    $full = visit('PUT', '/api/progress', ['60' => note(60)], [generation(0), from('198.51.100.4')], $tight);
    assert_same([429, 'too_many_visitors'], [$full['status'], $full['body']['code'] ?? null], 'three visitors at once is the most');
    assert_same(204, visit('PUT', '/api/progress', ['61' => note(61)], array_merge(with_key($first['key']), [generation($first['generation'])]), $tight)['status'], 'a visitor there already goes on');
    assert_same(201, visit('POST', '/api/sessions', round_of(), with_key($first['key']), $tight)['status']);

    // Room again at once (one went), but four new ones this hour is the most.
    drop_visitor((int) dbValue('SELECT min(id) FROM users WHERE id < 0'));
    new_visitor([from('198.51.100.5')], $tight);
    drop_visitor((int) dbValue('SELECT min(id) FROM users WHERE id < 0'));
    $hour = visit('PUT', '/api/progress', ['60' => note(60)], [generation(0), from('198.51.100.6')], $tight);
    assert_same([429, 'too_many_visitors'], [$hour['status'], $hour['body']['code'] ?? null], 'the fifth new one this hour');
    // An hour later the addresses count no more (the sweep or the next new visitor prunes them).
    dbExec("UPDATE visitor_starts SET started_at = now() - interval '61 minutes'");
    new_visitor([from('198.51.100.6')], $tight);
    assert_same(1, (int) dbValue('SELECT count(*) FROM visitor_starts'), 'the old ones pruned');
});

test('a visitor\'s caps: its rounds (422 visitor_limit) and the size of its documents (413) - a person has neither', function (): void {
    fresh();
    $tight = $GLOBALS['tight'];
    $round = visit('POST', '/api/sessions', round_of(), ['Idempotency-Key: cap-1'], $tight);
    assert_same(201, $round['status']);
    $key = with_key($round['headers']['x-visitor-key']);
    assert_same(201, visit('POST', '/api/sessions', round_of(), array_merge($key, ['Idempotency-Key: cap-2']), $tight)['status']);
    $over = visit('POST', '/api/sessions', round_of(), array_merge($key, ['Idempotency-Key: cap-3']), $tight);
    assert_same([422, 'visitor_limit', ['limit' => 'sessions', 'max' => 2]], [$over['status'], $over['body']['code'] ?? null, $over['body']['params'] ?? null]);
    assert_same([200, $round['body']['id']], [visit('POST', '/api/sessions', round_of(), array_merge($key, ['Idempotency-Key: cap-1']), $tight)['status'], $round['body']['id']], 'a round stored already is answered as before');
    assert_same(2, (int) dbValue('SELECT count(*) FROM sessions WHERE user_id < 0'));

    $big = ['60' => note(60, ['pad' => str_repeat('x', 5000)])];
    $state = visit('GET', '/api/state', null, $key, $tight)['body'];
    assert_same(413, visit('PUT', '/api/progress', $big, array_merge($key, [generation($state['generation'])]), $tight)['status'], 'a visitor\'s document over document_max_bytes');
    assert_same(413, visit('PUT', '/api/path', ['steps' => ['a/b' => ['pad' => str_repeat('x', 5000)]]], array_merge($key, [generation($state['generation'])]), $tight)['status']);
    assert_same(413, visit('PUT', '/api/progress', $big, [generation(0), from('198.51.100.30')], $tight)['status'], 'one that would make a visitor too');
    assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'));
    $person = visit('GET', '/api/state', null, bearer(test_token(MEMBER)), $tight)['body'];
    assert_same(204, visit('PUT', '/api/progress', $big, array_merge(bearer(test_token(MEMBER)), [generation($person['generation'])]), $tight)['status'], 'a person\'s limit is the app\'s');
});

test('a whole progress and a whole path fit a visitor\'s documents with room to spare', function (): void {
    fresh();
    $notes = [];
    for ($midi = 0; $midi <= 127; $midi++) {
        $notes[(string) $midi] = note($midi, ['status' => 'review', 'avgTimingErrorMs' => 123.456789, 'repetitions' => 999, 'intervalHours' => 8760]);
    }
    $steps = [];
    for ($i = 0; $i < 300; $i++) {
        $steps["left-hand-chords-$i/play-in-time"] = ['attempts' => 999, 'lastAccuracy' => 87.5, 'bestAccuracy' => 100, 'passedAt' => '2026-09-28T08:00:00.000Z', 'updatedAt' => '2026-09-28T08:00:00.000Z'];
    }
    // As objects: keys 0 ... 127 would otherwise go out as a JSON list.
    $notes = (object) $notes;
    $limit = VISITOR_DEFAULTS['document_max_bytes'];
    assert_true(strlen(jsonText($notes)) * 2 < $limit, 'every note of the piano, at twice its size: ' . strlen(jsonText($notes)) . ' bytes');
    assert_true(strlen(jsonText(['steps' => $steps])) * 2 < $limit, 'three hundred path steps (the right hand has 25), at twice: ' . strlen(jsonText(['steps' => $steps])) . ' bytes');
    $visitor = new_visitor();
    assert_same(204, visit('PUT', '/api/progress', $notes, array_merge(with_key($visitor['key']), [generation($visitor['generation'])]))['status']);
    assert_same(204, visit('PUT', '/api/path', ['steps' => $steps], array_merge(with_key($visitor['key']), [generation($visitor['generation'])]))['status']);
});

/* ------------------------------------------------------------- the sweep */

/** A visitor made in the database, last seen $days ago, with a little of everything. */
function old_visitor(int $days): int
{
    $id = (int) dbValue("INSERT INTO users (id, visitor_key_hash, last_seen_at) VALUES (nextval('visitor_ids'), ?, now() - make_interval(days => ?::int)) RETURNING id", [hash('sha256', random_bytes(16)), $days]);
    dbExec("INSERT INTO progress (user_id, notes) VALUES (?, '{\"60\": {}}')", [$id]);
    dbExec("INSERT INTO path_progress (user_id, data) VALUES (?, '{\"steps\": {}}')", [$id]);
    dbExec("INSERT INTO sessions (user_id, id, data) VALUES (?, ?, '{\"mode\": \"trainer\"}')", [$id, 'old-' . $id]);

    return $id;
}

test('the sweep: a visitor unseen for 30 days goes with everything of theirs - not one seen 29 days ago, never a person', function (): void {
    fresh();
    $old = old_visitor(31);
    $recent = old_visitor(29);
    // An imports row too: every table of a person's data is emptied first (STORE_PERSON_TABLES), or the batch could never go.
    dbExec("INSERT INTO imports (source, user_id, summary) VALUES ('visitor-test', ?, '{}')", [$old]);
    dbExec("INSERT INTO users (id, preferred_username, last_seen_at) VALUES (9001, 'long gone', now() - interval '400 days') ON CONFLICT (id) DO NOTHING");
    dbExec("INSERT INTO visitor_starts (address, started_at) VALUES (?, now() - interval '2 hours'), (?, now())", [counted_as('203.0.113.1'), counted_as('203.0.113.2')]);

    assert_same(1, visitorSweep());
    assert_same(['users' => null, 'progress' => null, 'path' => null, 'sessions' => 0], visitor_as_it_is($old));
    assert_same(0, (int) dbValue('SELECT count(*) FROM imports WHERE user_id = ?', [$old]));
    assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$recent]), '29 days: stays');
    assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id = 9001'), 'a person is never swept');
    assert_same([counted_as('203.0.113.2')], starts(), 'and the starts of an hour ago go');
    assert_same(0, visitorSweep(), 'nothing more to do');
});

test('the sweep: batch after batch within its time; a visitor another request holds is skipped, never waited for', function (): void {
    fresh();
    for ($i = 0; $i < 45; $i++) {
        old_visitor(40);
    }
    $held = old_visitor(50);
    $other = dbConnect(machineDatabaseSettings(), dbName());
    $other->beginTransaction();
    $other->prepare('SELECT 1 FROM users WHERE id = ? FOR UPDATE')->execute([$held]);
    try {
        $started = microtime(true);
        assert_same(45, visitorSweep(), 'three batches of at most ' . VISITOR_SWEEP_BATCH);
        assert_true(microtime(true) - $started < VISITOR_SWEEP_BUDGET_MS / 1000, 'within its time');
        assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$held]), 'the held one stays');
    } finally {
        $other->rollBack();
        $other = null;
    }
    assert_same(1, visitorSweep(), 'and goes the next time');
});

test('the sweep after the answer: at most once an hour on a visit, always after a new visitor - and one that fails never fails the request', function (): void {
    fresh();
    $app = $GLOBALS['app'];
    $visitor = new_visitor();
    $old = old_visitor(31);
    touch(sweep_marker($app));
    assert_same(200, visit('GET', '/api/state', null, with_key($visitor['key']))['status']);
    assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$old]), 'swept a moment ago: not again');

    touch(sweep_marker($app), time() - 2 * 3600);
    assert_same(200, visit('GET', '/api/state', null, bearer(test_token(MEMBER)))['status'], 'a person\'s visit sweeps too');
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$old]), 'an hour on: swept after the answer');
    clearstatcache();
    assert_true(filemtime(sweep_marker($app)) > time() - 60, 'and the time of it kept');

    // (A 204 has no body: the answer is complete before the work after it is - so this waits for it.)
    $old = old_visitor(31);
    new_visitor();
    assert_true(eventually(static fn(): bool => (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$old]) === 0), 'a new visitor: swept at once');

    // A table the sweep does not know holds an old visitor: its batch cannot go. The request is answered all the same.
    $old = old_visitor(31);
    dbExec('CREATE TABLE sweep_blocker (user_id BIGINT REFERENCES users (id))');
    try {
        dbExec('INSERT INTO sweep_blocker (user_id) VALUES (?)', [$old]);
        touch(sweep_marker($app), time() - 2 * 3600);
        $answer = visit('GET', '/api/state', null, with_key($visitor['key']));
        assert_same(200, $answer['status'], 'the request, as ever');
        assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$old]), 'nothing of the batch went');
        assert_match('/\[after\] PDOException: .*sweep_blocker/', (string) file_get_contents($app['log']), 'why is in the log');
        assert_same(200, visit('GET', '/api/state', null, with_key($visitor['key']))['status'], 'and the next request too');
    } finally {
        dbExec('DROP TABLE sweep_blocker');
    }
});

/* ------------------------------------------------ a database without 005 */

test('a database without 005: every round waits at the site\'s gate - a visitor\'s, one that would make a visitor, a person\'s - and nothing is made', function (): void {
    $name = test_empty_db('before_005');
    $pdo = dbConnect(machineDatabaseSettings(), $name);
    assert_same(null, test_migrate_before($pdo, '005_visitors.sql')['failed']);
    $config = test_config_dir($GLOBALS['auth'], $name);
    $behind = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', [
        'PIANO_TEST_CONFIG' => $config,
        'PIANO_FRONTEND_DIST' => test_frontend_build(),
    ], '/api/health');
    test_login_required($GLOBALS['auth'], false);

    // POST /api/sessions had no schema check of its own: the gate in front of every route holds it now too.
    foreach (['nobody' => [], 'a visitor key' => with_key(str_repeat('A', 43)), 'a person' => bearer(test_token(MEMBER))] as $who => $headers) {
        $round = visit('POST', '/api/sessions', round_of(), $headers, $behind);
        assert_same([503, 'update_pending', '60'], [$round['status'], $round['body']['code'] ?? null, $round['headers']['retry-after'] ?? null], $who);
    }
    $state = visit('GET', '/api/state', null, [], $behind);
    assert_same([503, 'update_pending'], [$state['status'], $state['body']['code'] ?? null], 'the rest says the site is being updated, as ever');
    assert_same([0, 0], [(int) $pdo->query('SELECT count(*) FROM users')->fetchColumn(), (int) $pdo->query('SELECT count(*) FROM sessions')->fetchColumn()], 'nobody made, no round kept');
    assert_same([], server_problems($behind));

    // Should a visitor's save ever reach such a database all the same (the gate makes it unreachable through the
    // API), the check under it holds on its own: 503 visitors_unavailable, never a 500 - asked by a process of its own.
    $script = test_temp_dir('visitors-ready') . '/check.php';
    file_put_contents($script, "<?php\nrequire " . var_export(TEST_BACKEND . '/api/bootstrap.php', true) . ";\n"
        . "try {\n    visitorsMustBeReady();\n    echo 'ready';\n} catch (ApiError \$e) {\n    echo json_encode([\$e->status, \$e->errorCode, \$e->headers]);\n}\n");
    $process = proc_open([PHP_BINARY, $script], [0 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]], $pipes, TEST_BACKEND, ['PIANO_TEST_CONFIG' => $config] + getenv());
    $out = (string) stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    proc_close($process);
    assert_same([503, 'visitors_unavailable', ['Retry-After' => '60']], json_decode($out, true), $out);
    $pdo = null;
});

/* ---------------------------------- "a verified token", however it is stacked */

/** A handler that answers 200 and says who it got. */
function who_handler(): RequestHandlerInterface
{
    return new class implements RequestHandlerInterface {
        public function handle(ServerRequestInterface $request): ResponseInterface
        {
            $user = currentUser($request);

            return respondJson(new \Slim\Psr7\Response(), ['id' => $user?->id, 'visitor' => $user?->visitor]);
        }
    };
}

/** A middleware as a handler: $middleware in front of $next. */
function in_front(\Psr\Http\Server\MiddlewareInterface $middleware, RequestHandlerInterface $next): RequestHandlerInterface
{
    return new class ($middleware, $next) implements RequestHandlerInterface {
        public function __construct(private \Psr\Http\Server\MiddlewareInterface $middleware, private RequestHandlerInterface $next)
        {
        }

        public function handle(ServerRequestInterface $request): ResponseInterface
        {
            return $this->middleware->process($request, $this->next);
        }
    };
}

/** What a stack answered: "status code" for a refusal, null when it let the request through (200). */
function refused_code(RequestHandlerInterface $stack, ServerRequestInterface $request): ?string
{
    $response = $stack->handle($request);
    if ($response->getStatusCode() === 200) {
        return null;
    }

    return $response->getStatusCode() . ' ' . (json_decode((string) $response->getBody(), true)['code'] ?? '?');
}

test('requireUser() and requireRole() refuse a visitor that requireOwner() let through: they mean a verified token, however stacked', function (): void {
    fresh();
    $visitor = new_visitor();
    // This process's own settings: sign-in not required, as the servers' - with the tests' key set.
    $file = $GLOBALS['TEST_CONFIG_DIR'] . '/auth.local.php';
    $own = require $file;
    $settings = test_auth_iam(['application_file' => $own['application_file']]);
    file_put_contents($file, '<?php return ' . var_export(test_offline_auth($settings), true) . ";\n");
    localSettings(true);
    test_login_required($settings, false);
    try {
        $identify = identify(new \Slim\Psr7\Factory\ResponseFactory());
        $request = (new \Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('GET', '/api/me/export')
            ->withHeader(VISITOR_HEADER, $visitor['key']);

        $owned = json_decode((string) in_front($identify, in_front(requireOwner('refuse'), who_handler()))->handle($request)->getBody(), true);
        assert_same(['id' => $visitor['id'], 'visitor' => true], $owned, 'requireOwner(): the visitor');

        foreach (['requireUser()' => requireUser(), 'requireRole(ADMIN)' => requireRole(ROLE_ADMIN), 'requireRole(staff)' => requireRole(...ROLES_STAFF), 'adminByToken()' => adminByToken()] as $what => $check) {
            assert_same('401 sign_in_required', refused_code(in_front($identify, in_front(requireOwner('refuse'), in_front($check, who_handler()))), $request), "requireOwner() outside $what");
            assert_same('401 sign_in_required', refused_code(in_front($identify, in_front($check, who_handler())), $request), "$what alone");
        }
        // A person passes - their own id, never the visitor's whose key came along.
        $person = $request->withHeader('Authorization', 'Bearer ' . test_token(MEMBER));
        assert_same(['id' => MEMBER, 'visitor' => false], json_decode((string) in_front($identify, in_front(requireUser(), who_handler()))->handle($person)->getBody(), true), 'a person passes');
        test_login_required($settings, true);
        assert_same('401 sign_in_required', refused_code(in_front($identify, in_front(requireOwner('refuse'), who_handler())), $request), 'sign-in required: the key is not read');
    } finally {
        file_put_contents($file, '<?php return ' . var_export(test_offline_auth($own), true) . ";\n");
        localSettings(true);
    }
});

test('the servers said nothing they should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
    assert_same([], server_problems($GLOBALS['tight']));
});

