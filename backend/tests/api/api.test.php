<?php

// The HTTP API through the real server (router.php under PHP's built-in
// server) on this file's throwaway database, every call signed in as one
// learner (a token with no role): the answers the browser expects, the shapes
// checked, the session fields whitelisted and bounded, the files of the built
// app, and the answer of an app that is not set up or is behind.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const LEARNER = 1;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app(test_auth_iam());
});

/**
 * A request signed in as the learner (unless $headers bring an Authorization
 * of their own). A save of a whole document names the generation of the
 * progress, as a tab that has just loaded it does - unless $headers name one
 * of their own (tests/api/me.test.php holds the generation's rules).
 */
function api(string $method, string $url, mixed $body = null, array $headers = []): array
{
    $has = static fn(string $name): bool => (bool) array_filter($headers, static fn(string $header): bool => stripos($header, "$name:") === 0);
    $own = $has('Authorization');
    if ($method === 'PUT' && in_array($url, ['/api/progress', '/api/path'], true) && !$has(GENERATION_HEADER)) {
        $state = call($GLOBALS['app']['base'], 'GET', '/api/state', null, $own ? $headers : bearer(test_token(LEARNER)));
        $headers[] = GENERATION_HEADER . ': ' . ($state['body']['generation'] ?? '');
    }

    return call($GLOBALS['app']['base'], $method, $url, $body, $own ? $headers : array_merge($headers, bearer(test_token(LEARNER))));
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

test('health and the sign-in settings: the IAM, and nothing about a mode', function (): void {
    $health = call($GLOBALS['app']['base'], 'GET', '/api/health');
    assert_same(200, $health['status']);
    assert_same(['ok' => true, 'database' => dbName(), 'pending' => []], $health['body']);
    assert_same('no-store', $health['headers']['cache-control'] ?? null);
    assert_same('nosniff', $health['headers']['x-content-type-options'] ?? null);
    assert_match("/default-src 'none'/", $health['headers']['content-security-policy'] ?? '');
    assert_same(['issuer' => TEST_ISSUER, 'clientId' => TEST_CLIENT, 'loginRequired' => true], call($GLOBALS['app']['base'], 'GET', '/api/auth/config')['body']);
});

test('nobody gets in without a token that checks out - by any name, through any proxy - and a refused one writes nothing', function (): void {
    $port = parse_url($GLOBALS['app']['base'], PHP_URL_PORT);
    $routes = [['GET', '/api/state', null], ['PUT', '/api/progress', ['60' => note(60)]], ['PUT', '/api/path', ['steps' => new stdClass()]], ['POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 1, 'correct' => 1, 'accuracy' => 100]],
        ['GET', '/api/me/export', null], ['POST', '/api/me/import?replace=true', ['format' => 'piano-academy-export', 'version' => 1, 'progress' => ['60' => note(60)]]]];
    $bad = [
        'no token' => [],
        'no token, from this computer by name' => ["Host: localhost:$port"],
        'expired' => bearer(test_token(LEARNER, [], ['exp' => time() - 3600])),
        'from another issuer' => bearer(test_token(LEARNER, [], ['iss' => 'https://iam.elsewhere.example'])),
        'Bearer with nothing after it' => ['Authorization: Bearer '],
        'another scheme' => ['Authorization: Basic YWRtaW46YWRtaW4='],
    ];
    foreach ($routes as [$method, $url, $body]) {
        foreach ($bad as $what => $headers) {
            $answer = call($GLOBALS['app']['base'], $method, $url, $body, $headers);
            assert_same(401, $answer['status'], "$method $url, $what");
        }
    }
    assert_same(0, (int) dbValue('SELECT count(*) FROM users'), 'nobody was recorded');
    assert_same(0, (int) dbValue('SELECT count(*) FROM progress') + (int) dbValue('SELECT count(*) FROM path_progress') + (int) dbValue('SELECT count(*) FROM sessions'), 'nothing was written');
    // A good token is the same answer whatever name or proxy it came through: sign-in is the IAM's, not the address's.
    assert_same(200, api('GET', '/api/state', null, ["Host: rebound.example:$port"])['status'], 'by any name');
    assert_same(200, api('GET', '/api/state', null, ['X-Forwarded-For: 203.0.113.9'])['status'], 'through a proxy');
    dbExec('DELETE FROM users');
});

test('a fresh start: an empty progress object stays an object', function (): void {
    $state = api('GET', '/api/state');
    assert_same(200, $state['status']);
    $generation = (int) dbValue('SELECT progress_generation FROM users WHERE id = ?', [LEARNER]);
    assert_true($generation > 0, 'the learner\'s progress has a generation');
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}},"generation":' . $generation . '}', $state['raw'], 'exactly what the browser expects');
    assert_same('1', (string) dbValue('SELECT count(*) FROM users WHERE id = ?', [LEARNER]), 'the learner has a users row now');
});

test('PUT /api/progress: the whole object, stored as sent', function (): void {
    $progress = ['60' => note(60), '62' => note(62, ['status' => 'review', 'avgTimingErrorMs' => 123.456789])];
    $saved = api('PUT', '/api/progress', $progress);
    assert_same(204, $saved['status']);
    assert_same('', $saved['raw']);
    assert_json_same($progress, api('GET', '/api/state')['body']['progress']);

    // back to empty: {} again, never []
    assert_same(204, api('PUT', '/api/progress', new stdClass())['status']);
    assert_match('/^\{"progress":\{\},/', api('GET', '/api/state')['raw']);
    assert_same(204, api('PUT', '/api/progress', $progress)['status']);
});

test('PUT /api/progress: anything but an object keyed by MIDI number is refused, and nothing changes', function (): void {
    $before = api('GET', '/api/state')['body']['progress'];
    $bad = [
        'a list' => [[note(60)], []],
        'a string' => ['"hello"', ['Content-Type: application/json']],
        'a key that is no MIDI number' => [['C4' => note(60)], []],
        'a key above 127' => [['128' => note(60)], []],
        'a leading zero' => [['060' => note(60)], []],
        'a note that is not an object' => [['60' => 5], []],
        'no body' => ['', ['Content-Type: application/json']],
        'malformed JSON' => ['{"60": {', ['Content-Type: application/json']],
    ];
    foreach ($bad as $what => [$body, $headers]) {
        $answer = api('PUT', '/api/progress', $body, $headers);
        assert_same(400, $answer['status'], $what);
        assert_true(is_string($answer['body']['error'] ?? null) && is_string($answer['body']['code'] ?? null), "$what: an error message and a code");
    }
    // not JSON at all: a server that read it as {} would wipe the progress
    $form = api('PUT', '/api/progress', '60=1', ['Content-Type: application/x-www-form-urlencoded']);
    assert_same(415, $form['status'], 'a form post');
    assert_same('unsupported_media_type', $form['body']['code']);
    $large = api('PUT', '/api/progress', str_repeat(' ', 300 * 1024) . '{}', ['Content-Type: application/json']);
    assert_same(413, $large['status'], 'too large');
    assert_same('too_large', $large['body']['code']);
    assert_same($before, api('GET', '/api/state')['body']['progress'], 'the stored progress is untouched');
});

test('PUT /api/path: an object with a "steps" object', function (): void {
    $path = ['steps' => ['rh-1/meet' => ['attempts' => 1, 'lastAccuracy' => 100, 'bestAccuracy' => 100, 'passedAt' => '2026-09-28T08:00:00.000Z', 'updatedAt' => '2026-09-28T08:00:00.000Z']]];
    assert_same(204, api('PUT', '/api/path', $path)['status']);
    assert_json_same($path, api('GET', '/api/state')['body']['path']);
    foreach ([['steps' => []], ['steps' => 'x'], ['nope' => new stdClass()], [], ['steps' => ['rh-1/meet' => 80]]] as $i => $bad) {
        assert_same(400, api('PUT', '/api/path', $bad)['status'], "bad path #$i");
    }
    assert_same(204, api('PUT', '/api/path', ['steps' => new stdClass()])['status']);
    assert_match('/"path":\{"steps": \{\}\},"generation":\d+\}$/', api('GET', '/api/state')['raw'], 'empty steps stay an object');
    assert_same(204, api('PUT', '/api/path', $path)['status']);
});

test('POST /api/sessions: stamped with id and recordedAt, 201 with the stored session', function (): void {
    $session = ['mode' => 'trainer', 'startedAt' => '2026-09-28T08:00:00.000Z', 'endedAt' => '2026-09-28T08:01:00.000Z', 'attempts' => 12, 'correct' => 11, 'accuracy' => 92];
    $answer = api('POST', '/api/sessions', $session);
    assert_same(201, $answer['status']);
    $saved = $answer['body'];
    assert_match('/^\d{13}-[0-9a-z]{6}$/', $saved['id'], 'an id like the first server made');
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $saved['recordedAt'], 'toISOString() form');
    assert_true(abs(strtotime($saved['recordedAt']) - time()) < 60, 'recorded just now');
    $expected = $session + ['id' => $saved['id'], 'recordedAt' => $saved['recordedAt']];
    ksort($expected);
    ksort($saved);
    assert_same($expected, $saved);
    $sessions = api('GET', '/api/state')['body']['sessions'];
    assert_same(1, count($sessions));
    assert_same($saved['id'], $sessions[0]['id']);
});

test('POST /api/sessions: only the known fields are kept; the id and time are the server\'s', function (): void {
    $answer = api('POST', '/api/sessions', [
        'mode' => 'lesson', 'label' => 'C, D, E · Drill', 'unitId' => 'rh-1', 'stepId' => 'drill',
        'startedAt' => '2026-09-28T08:02:00.000Z', 'endedAt' => '2026-09-28T08:03:00.000Z',
        'attempts' => 10, 'correct' => 8, 'accuracy' => 80, 'bpm' => null, 'avgTimingErrorMs' => null,
        'id' => 'mine', 'recordedAt' => '1999-01-01T00:00:00.000Z', 'user_id' => 2, 'isAdmin' => true, '<script>' => 1,
    ]);
    assert_same(201, $answer['status']);
    $session = $answer['body'];
    assert_false(isset($session['user_id']) || isset($session['isAdmin']) || isset($session['<script>']), 'unknown fields are dropped');
    assert_true($session['id'] !== 'mine' && $session['recordedAt'] !== '1999-01-01T00:00:00.000Z', 'not the client\'s id and time');
    assert_same('C, D, E · Drill', $session['label']);
    assert_true(array_key_exists('bpm', $session) && $session['bpm'] === null, 'null kept where the browser sends null');

    $song = api('POST', '/api/sessions', ['mode' => 'song', 'songId' => 'ode-to-joy', 'songTitle' => 'Ode to Joy', 'attempts' => 15, 'correct' => 15, 'accuracy' => 100, 'bpm' => 80, 'avgTimingErrorMs' => 41.5]);
    assert_same(201, $song['status']);
    assert_same(41.5, $song['body']['avgTimingErrorMs']);
});

test('POST /api/sessions: wrong types and values out of bounds are refused', function (): void {
    $count = count(api('GET', '/api/state')['body']['sessions']);
    $ok = ['mode' => 'sheet', 'attempts' => 6, 'correct' => 5, 'accuracy' => 83];
    $bad = [
        'no mode' => ['attempts' => 1],
        'unknown mode' => ['mode' => 'chess'] + $ok,
        'label too long' => ['mode' => 'lesson', 'label' => str_repeat('x', 201)],
        'label with a control character' => ['mode' => 'lesson', 'label' => "a\nb"],
        'label not text' => ['mode' => 'lesson', 'label' => ['x']],
        'unitId with odd characters' => ['mode' => 'lesson', 'unitId' => 'rh 1'],
        'songId too long' => ['mode' => 'song', 'songId' => str_repeat('a', 65)],
        'startedAt not a time' => ['startedAt' => 'yesterday'] + $ok,
        'startedAt without a zone' => ['startedAt' => '2026-09-28T08:00:00'] + $ok,
        'attempts negative' => ['attempts' => -1] + $ok,
        'attempts a fraction' => ['attempts' => 1.5] + $ok,
        'attempts a string' => ['attempts' => '6'] + $ok,
        'accuracy over 100' => ['accuracy' => 101] + $ok,
        'accuracy null' => ['accuracy' => null] + $ok,
        'bpm zero' => ['bpm' => 0] + $ok,
        'bpm a string' => ['bpm' => 'fast'] + $ok,
        'timing negative' => ['avgTimingErrorMs' => -5] + $ok,
        'a list' => [$ok],
    ];
    foreach ($bad as $what => $body) {
        $answer = api('POST', '/api/sessions', $body);
        assert_same(400, $answer['status'], $what);
        assert_same('invalid_session', $answer['body']['code'] ?? null, $what);
    }
    assert_same(201, api('POST', '/api/sessions', $ok + ['attempts' => 6.0])['status'], 'a whole number written 6.0 is fine');
    assert_same($count + 1, count(api('GET', '/api/state')['body']['sessions']), 'only the good one was stored');
});

test('POST /api/sessions: a retry with the same Idempotency-Key is stored once', function (): void {
    $before = count(api('GET', '/api/state')['body']['sessions']);
    $key = ['Idempotency-Key: 2f1c7a3e-9d7b-4c51-8f3a-0a6b1f2e3d4c'];
    $first = api('POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 12, 'correct' => 12, 'accuracy' => 100], $key);
    $again = api('POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 12, 'correct' => 12, 'accuracy' => 100], $key);
    assert_same(201, $first['status']);
    assert_same(200, $again['status'], 'the answer to a repeat');
    assert_same($first['body'], $again['body'], 'the session stored the first time');
    assert_same($before + 1, count(api('GET', '/api/state')['body']['sessions']));
    $odd = api('POST', '/api/sessions', ['mode' => 'trainer'], ['Idempotency-Key: not ok!']);
    assert_same(400, $odd['status']);
    assert_same('invalid_idempotency_key', $odd['body']['code']);
});

test('sessions come back in the order they were recorded', function (): void {
    $ids = [];
    for ($i = 0; $i < 5; $i++) {
        $ids[] = api('POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 12, 'correct' => $i, 'accuracy' => 8 * $i])['body']['id'];
    }
    $all = array_column(api('GET', '/api/state')['body']['sessions'], 'id');
    assert_same($ids, array_slice($all, -5));
});

test('unknown addresses and methods', function (): void {
    assert_same(404, api('GET', '/api/nope')['status']);
    assert_same(['error' => 'Not found', 'code' => 'not_found'], api('GET', '/api/nope')['body']);
    $wrong = api('DELETE', '/api/progress');
    assert_same(405, $wrong['status']);
    assert_same('PUT', $wrong['headers']['allow'] ?? null);
    assert_same(405, api('GET', '/api/sessions')['status']);
    // A cross-site write would need a preflight first, and there is none to be had.
    $preflight = api('OPTIONS', '/api/progress', null, ['Origin: https://evil.example', 'Access-Control-Request-Method: PUT']);
    assert_same(405, $preflight['status']);
    assert_false(isset($preflight['headers']['access-control-allow-origin']), 'no CORS for anybody');
});

test('the built app beside the API: its files as they are, its own routes as index.html', function (): void {
    $home = api('GET', '/');
    assert_same(200, $home['status']);
    assert_match('/<title>Piano Academy<\/title>/', $home['raw']);
    assert_same('no-cache', $home['headers']['cache-control'] ?? null);
    foreach (['/main-TEST.js' => '~javascript~', '/styles-TEST.css' => '~text/css~', '/changelog.json' => '~application/json~', '/media/font-TEST.woff2' => '~font/woff2~'] as $url => $type) {
        $file = api('GET', $url);
        assert_same(200, $file['status'], $url);
        assert_match($type, $file['headers']['content-type'] ?? '', "$url has its type");
        assert_same('nosniff', $file['headers']['x-content-type-options'] ?? null);
    }
    foreach (['/trainer', '/lesson/rh-1/drill', '/songs/ode-to-joy', '/auth/callback'] as $route) {
        $page = api('GET', $route);
        assert_same(200, $page['status'], $route);
        assert_match('/<app-root>/', $page['raw'], "$route is the app");
    }
    // never a PHP file (run or shown), a dot-file, or anything outside the build
    $php = api('GET', '/secret.php');
    assert_same(404, $php['status']);
    assert_no_match('/ran/', $php['raw']);
    assert_same(404, api('GET', '/.htaccess')['status']);
    assert_same(404, api('GET', '/missing.js')['status'], 'a file that is not there is no route');
    assert_same(404, api('GET', '/../config/config.php')['status']);
    assert_same(404, api('GET', '/%2e%2e/config/database.local.php')['status']);
    assert_same(404, api('GET', '/index.php')['status']);
    assert_same(200, api('GET', '/setup.php')['status'], 'the setup page');
});

test('an app that is not set up says so - to the API and the app alike', function (): void {
    $bare = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', [
        'PIANO_TEST_CONFIG' => test_temp_dir('no-config'),
        'PIANO_FRONTEND_DIST' => test_frontend_build(),
    ], '/api/health');
    foreach (['/api/health', '/api/auth/config', '/api/state', '/api/nope'] as $url) {
        $answer = call($bare['base'], 'GET', $url);
        assert_same(503, $answer['status'], $url);
        assert_same('not_set_up', $answer['body']['code'] ?? null, $url);
        assert_same('/setup.php', $answer['body']['setup'] ?? null, "$url points at the setup page");
    }
    assert_match('/database\.local\.php is missing/', (string) call($bare['base'], 'GET', '/api/health')['body']['detail'], 'this computer is told what is missing');
    assert_same(503, call($bare['base'], 'PUT', '/api/progress', new stdClass())['status'], 'nothing is saved');
    assert_same(200, call($bare['base'], 'GET', '/')['status'], 'the app itself loads, to show its "not set up yet" page');
    assert_match('/Set up Piano Academy/', call($bare['base'], 'GET', '/setup.php')['raw']);
    ($bare['stop'])();
});

test('a database behind the code: the app does not start on it, and says it needs an update', function (): void {
    $empty = test_empty_db('behind');
    $behind = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', [
        'PIANO_TEST_CONFIG' => test_config_dir(test_auth_iam(), $empty),
        'PIANO_FRONTEND_DIST' => test_frontend_build(),
    ], '/api/health');
    assert_same(migrationFiles(), call($behind['base'], 'GET', '/api/health')['body']['pending']);
    foreach (['signed in' => bearer(test_token(LEARNER)), 'nobody' => []] as $who => $headers) {
        $state = call($behind['base'], 'GET', '/api/state', null, $headers);
        assert_same([503, 'not_set_up', true], [$state['status'], $state['body']['code'] ?? null, $state['body']['update'] ?? null], $who);
        assert_match('/needs an update/', $state['body']['error'], $who);
    }
    // A tab left open while the code moved on: its saves and its own file are told the same, and nothing is written.
    foreach ([['PUT', '/api/progress', new stdClass()], ['PUT', '/api/path', ['steps' => new stdClass()]], ['GET', '/api/me/export', null], ['POST', '/api/me/import', ['format' => 'piano-academy-export']]] as [$method, $url, $body]) {
        $answer = call($behind['base'], $method, $url, $body, array_merge(bearer(test_token(LEARNER)), [GENERATION_HEADER . ': 1']));
        assert_same([503, 'not_set_up', true], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['update'] ?? null], "$method $url");
    }
    ($behind['stop'])();
});

test('the learner\'s data sits under the learner\'s id, and the server logged no PHP problem', function (): void {
    assert_same((int) dbValue('SELECT count(*) FROM sessions'), (int) dbValue('SELECT count(*) FROM sessions WHERE user_id = ?', [LEARNER]));
    assert_same(['60', '62'], array_column(dbAll('SELECT jsonb_object_keys(notes) AS k FROM progress WHERE user_id = ? ORDER BY 1', [LEARNER]), 'k'));
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[auth] token refused')));
    assert_same([], $problems);
});
