<?php

// Each person's own progress file, through the real server: their export to
// download (GET /api/me/export) and an export brought back into their own
// account (POST /api/me/import) - a round trip, a dry run that writes
// nothing, the replace rule, the refusals with a code and a sentence, the
// size limit both ways, and nobody else's data touched. And the generation of
// a person's progress: a tab that loaded it before an import or an
// administrator's delete is refused its next save (409 progress_changed),
// and an import holds the person's users row while a save or a second import
// waits its turn.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const ANNA = 1;   // learners, no role
const BEN = 2;
const CILA = 3;
const ADMIN = 9;  // an administrator

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app(test_auth_iam());
});

/** A request as $user (ADMIN with the role, everybody else a learner), on the file's server or another. */
function as_user(int $user, string $method, string $url, mixed $body = null, array $headers = [], ?array $app = null): array
{
    $token = test_token($user, $user === ADMIN ? [ROLE_ADMIN] : []);

    return call(($app ?? $GLOBALS['app'])['base'], $method, $url, $body, array_merge($headers, bearer($token)));
}

/** What a tab of $user loads: GET /api/state, decoded. */
function load(int $user): array
{
    $state = as_user($user, 'GET', '/api/state');
    assert_same(200, $state['status']);

    return $state['body'];
}

/** A save of a whole document, made to $generation. */
function save(int $user, string $url, mixed $document, int $generation): array
{
    return as_user($user, 'PUT', $url, $document, [GENERATION_HEADER . ": $generation"]);
}

/** Everything the database keeps of one person, as text: their documents, their sessions, their users row. */
function kept(int $user): string
{
    return storeStateJson($user) . ' ' . jsonText(dbAll('SELECT id, preferred_username, progress_generation FROM users WHERE id = ?', [$user]));
}

/** An export document, as the app writes one ($changes replace its parts). */
function file_with(array $changes = []): array
{
    return $changes + [
        'format' => 'piano-academy-export', 'version' => 1, 'exportedAt' => '2026-10-04T10:00:00.000Z', 'userId' => 777,
        'progress' => [
            '60' => ['midi' => 60, 'status' => 'mastered', 'repetitions' => 6, 'easeFactor' => 2.5, 'intervalHours' => 938, 'dueAt' => '2026-10-18T16:08:49.446Z', 'updatedAt' => '2026-09-09T14:08:49.446Z'],
            '64' => ['midi' => 64, 'status' => 'learning', 'repetitions' => 1, 'easeFactor' => 2.36, 'intervalHours' => 4, 'dueAt' => '2026-09-09T18:09:12.436Z', 'updatedAt' => '2026-09-09T14:09:12.436Z'],
            '65' => ['midi' => 65, 'status' => 'learning', 'repetitions' => 0, 'easeFactor' => 2.5, 'intervalHours' => 0, 'dueAt' => '2026-09-09T18:09:12.436Z', 'updatedAt' => '2026-09-09T14:09:12.436Z'],
        ],
        'path' => ['steps' => ['rh-1/meet' => ['attempts' => 1, 'bestAccuracy' => 100], 'rh-1/drill' => ['attempts' => 2, 'bestAccuracy' => 90]]],
        'sessions' => [
            ['mode' => 'trainer', 'attempts' => 12, 'correct' => 3, 'accuracy' => 25, 'id' => 'f-1', 'recordedAt' => '2026-09-09T14:06:09.050Z'],
            ['mode' => 'chess', 'id' => 'f-2'],
            ['mode' => 'song', 'songId' => 'ode-to-joy', 'songTitle' => 'Ode to Joy', 'attempts' => 15, 'correct' => 14, 'accuracy' => 93, 'id' => 'f-3', 'recordedAt' => '2026-09-09T14:06:37.312Z'],
        ],
    ];
}

/** $user's own progress, put there the way the app saves it. */
function learn(int $user): void
{
    $generation = load($user)['generation'];
    assert_same(204, save($user, '/api/progress', ['62' => ['midi' => 62, 'status' => 'learning']], $generation)['status']);
    assert_same(204, save($user, '/api/path', ['steps' => ['rh-1/meet' => ['attempts' => 3]]], $generation)['status']);
    assert_same(201, as_user($user, 'POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 12, 'correct' => 12, 'accuracy' => 100])['status']);
}

/* ------------------------------------------------ a request still under way */

/** A request sent, its answer not waited for: another tab, at the same moment. */
function send(array $app, int $user, string $method, string $url, string $body, array $headers = []): array
{
    $token = test_token($user, $user === ADMIN ? [ROLE_ADMIN] : []);
    $handle = curl_init($app['base'] . $url);
    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => array_merge($headers, bearer($token), ['Content-Type: application/json', 'Expect:']),
    ]);
    $multi = curl_multi_init();
    curl_multi_add_handle($multi, $handle);
    curl_multi_exec($multi, $running);

    return ['multi' => $multi, 'handle' => $handle];
}

/** Moves it along; is it still waiting for its answer? */
function waiting(array $sent): bool
{
    curl_multi_exec($sent['multi'], $running);

    return $running > 0;
}

/** Its answer: [status, body decoded]. */
function answer(array $sent): array
{
    $until = microtime(true) + 60;
    while (waiting($sent) && microtime(true) < $until) {
        curl_multi_select($sent['multi'], 0.05);
    }
    $raw = (string) curl_multi_getcontent($sent['handle']);

    return [(int) curl_getinfo($sent['handle'], CURLINFO_RESPONSE_CODE), json_decode($raw, true)];
}

/** Waits (moving the requests along) until $count backends of this database wait for a lock. */
function until_waiting(int $count, array $sent): void
{
    $until = microtime(true) + 15;
    while (microtime(true) < $until) {
        foreach ($sent as $one) {
            waiting($one);
        }
        $now = (int) dbValue("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'");
        if ($now >= $count) {
            return;
        }
        usleep(20000);
    }
    fail("$count requests should be waiting for a lock by now");
}

/* ------------------------------------------------------------------ export */

test('the export: one\'s own progress as a file to download - nobody else\'s', function (): void {
    learn(ANNA);
    $file = as_user(ANNA, 'GET', '/api/me/export');
    assert_same(200, $file['status']);
    assert_match('~^application/json~', $file['headers']['content-type'] ?? '');
    assert_match('/^attachment; filename="piano-academy-progress-\d{4}-\d{2}-\d{2}\.json"$/', $file['headers']['content-disposition'] ?? '');
    assert_same('no-store', $file['headers']['cache-control'] ?? null);
    $export = $file['body'];
    assert_same(['piano-academy-export', 1, ANNA], [$export['format'], $export['version'], $export['userId']]);
    $state = load(ANNA);
    assert_same([$state['progress'], $state['path'], $state['sessions']], [$export['progress'], $export['path'], $export['sessions']], 'what the app holds, as it holds it');
    assert_false(array_key_exists('generation', $export), 'a generation means nothing in another database');

    // Who it is, is the token's: an id in the address is nobody's.
    $ben = as_user(BEN, 'GET', '/api/me/export?userId=' . ANNA . '&user=' . ANNA);
    assert_same(200, $ben['status']);
    assert_same([BEN, [], []], [$ben['body']['userId'], $ben['body']['progress'], $ben['body']['sessions']], 'Ben\'s own, empty');
    assert_same('{}', json_encode(json_decode($ben['raw'])->progress), 'an empty progress is {} in the file too');
});

/* ------------------------------------------------------------------ import */

test('a round trip: one person\'s file into another\'s empty account is the same progress - the userId inside not read', function (): void {
    $before = kept(ANNA);
    $export = as_user(ANNA, 'GET', '/api/me/export');
    $generation = load(BEN)['generation'];

    $import = as_user(BEN, 'POST', '/api/me/import', $export['raw'], ['Content-Type: application/json']);
    assert_same(200, $import['status'], test_show($import['body']));
    assert_same(['notes' => 1, 'steps' => 1, 'sessions' => 1, 'replaced' => false, 'leftOut' => 0], array_diff_key($import['body'], ['generation' => 0]));
    assert_true($import['body']['generation'] !== $generation, 'a new generation');
    $ben = load(BEN);
    $anna = load(ANNA);
    assert_same([$anna['progress'], $anna['path'], $anna['sessions']], [$ben['progress'], $ben['path'], $ben['sessions']], 'everything, the sessions\' ids and times too');
    assert_same($import['body']['generation'], $ben['generation'], 'the generation it answered is the one a tab now loads');
    assert_same($before, kept(ANNA), 'and Anna\'s own is as it was');
});

test('a dry run says what an import would do, and writes nothing - whatever else it is asked', function (): void {
    $ben = kept(BEN);
    $preview = as_user(BEN, 'POST', '/api/me/import?dryRun=true&replace=true', file_with());
    assert_same(200, $preview['status']);
    assert_same([
        'dryRun' => true, 'hasProgress' => true,
        'current' => ['notes' => 1, 'steps' => 1, 'sessions' => 1],
        'incoming' => ['notes' => 3, 'steps' => 2, 'sessions' => 2],
        'leftOut' => 1,
    ], $preview['body']);
    assert_same($ben, kept(BEN), 'nothing written, the generation as it was');

    $fresh = as_user(CILA, 'POST', '/api/me/import?dryRun=1', file_with());
    assert_same([false, ['notes' => 0, 'steps' => 0, 'sessions' => 0]], [$fresh['body']['hasProgress'], $fresh['body']['current']], 'an account with nothing');
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}}}', storeStateJson(CILA));
    assert_same(422, as_user(CILA, 'POST', '/api/me/import?dryRun=true', ['format' => 'other'])['status'], 'a dry run checks the file as an import does');
});

test('the replace rule: never into progress unless replacing is asked for - and then the file\'s, nothing of the old', function (): void {
    $anna = kept(ANNA);
    $ben = kept(BEN);
    $refused = as_user(BEN, 'POST', '/api/me/import', file_with());
    assert_same([409, 'has_progress'], [$refused['status'], $refused['body']['code'] ?? null]);
    assert_same(['notes' => 1, 'steps' => 1, 'sessions' => 1], $refused['body']['current'], 'with what is there now');
    assert_true(is_string($refused['body']['error']) && $refused['body']['error'] !== '', 'and a sentence');
    assert_same($ben, kept(BEN), 'nothing changed');
    assert_same(409, as_user(BEN, 'POST', '/api/me/import?replace=no', file_with())['status'], 'only true (or 1) asks');

    $replaced = as_user(BEN, 'POST', '/api/me/import?replace=true', file_with());
    assert_same(200, $replaced['status'], test_show($replaced['body']));
    assert_same(['notes' => 3, 'steps' => 2, 'sessions' => 2, 'replaced' => true, 'leftOut' => 1], array_diff_key($replaced['body'], ['generation' => 0]));
    $state = load(BEN);
    assert_json_same(file_with()['progress'], $state['progress'], 'the file\'s progress, not a mix');
    assert_json_same(file_with()['path'], $state['path']);
    assert_same(['f-1', 'f-3'], array_column($state['sessions'], 'id'), 'the file\'s sessions alone - the old one is gone');
    assert_same($anna, kept(ANNA), 'nobody else\'s touched');

    // Empty documents are no progress: the app saves them as readily as full ones.
    $generation = load(CILA)['generation'];
    assert_same(204, save(CILA, '/api/progress', new stdClass(), $generation)['status']);
    assert_same(204, save(CILA, '/api/path', ['steps' => new stdClass()], $generation)['status']);
    $into = as_user(CILA, 'POST', '/api/me/import', file_with(['sessions' => []]));
    assert_same([200, false], [$into['status'], $into['body']['replaced'] ?? null], 'an account with empty documents takes a file without asking');
    assert_json_same(file_with()['progress'], load(CILA)['progress']);
});

test('what is not a progress file is refused with a code and a sentence - not JSON, another format, a broken one, too large - and nothing changes', function (): void {
    $before = [kept(ANNA), kept(BEN), kept(CILA)];
    $json = ['Content-Type: application/json'];
    $refused = [
        'not JSON' => ['{"format": "piano-academy-export", ', $json, 422, 'not_an_export'],
        'nothing' => ['', $json, 422, 'not_an_export'],
        'a list' => [[1, 2, 3], [], 422, 'not_an_export'],
        'text' => ['"hello"', $json, 422, 'not_an_export'],
        'another app\'s export' => [['format' => 'japanese-academy-export', 'version' => 1], [], 422, 'not_an_export'],
        'the translations\' file' => [['home.title' => 'Learn'], [], 422, 'not_an_export'],
        'a newer version' => [file_with(['version' => 2]), [], 422, 'invalid_export'],
        'no version' => [array_diff_key(file_with(), ['version' => 0]), [], 422, 'invalid_export'],
        'a progress that is none' => [file_with(['progress' => ['C4' => ['midi' => 60]]]), [], 422, 'invalid_export'],
        'a path that is none' => [file_with(['path' => ['steps' => 'x']]), [], 422, 'invalid_export'],
        'sessions that are no list' => [file_with(['sessions' => ['a' => ['mode' => 'trainer']]]), [], 422, 'invalid_export'],
        'a form' => ['format=piano-academy-export', ['Content-Type: application/x-www-form-urlencoded'], 415, 'unsupported_media_type'],
        'over the limit' => [str_repeat(' ', EXPORT_LIMIT) . jsonText(file_with()), $json, 413, 'too_large'],
    ];
    foreach ($refused as $what => [$body, $headers, $status, $code]) {
        foreach (['', '?replace=true', '?dryRun=true'] as $query) {
            $answer = as_user(CILA, 'POST', "/api/me/import$query", $body, $headers);
            assert_same([$status, $code], [$answer['status'], $answer['body']['code'] ?? null], "$what$query");
            assert_true(is_string($answer['body']['error'] ?? null) && $answer['body']['error'] !== '', "$what: a sentence");
        }
    }
    assert_same($before, [kept(ANNA), kept(BEN), kept(CILA)], 'nothing changed, no generation either');
    assert_same(405, as_user(CILA, 'GET', '/api/me/import')['status']);
    assert_same(405, as_user(CILA, 'POST', '/api/me/export')['status']);
});

/* ------------------------------------------------------- the generation */

test('a save names the generation of the progress it was made to: none, or not a number, is 428 - and nothing is saved', function (): void {
    $before = kept(ANNA);
    foreach (['none' => [], 'empty' => [GENERATION_HEADER . ': '], 'a word' => [GENERATION_HEADER . ': latest'], 'zero' => [GENERATION_HEADER . ': 0'],
        'negative' => [GENERATION_HEADER . ': -1'], 'a fraction' => [GENERATION_HEADER . ': 1.5'], 'two' => [GENERATION_HEADER . ': 1, 2']] as $what => $headers) {
        foreach ([['/api/progress', ['60' => ['midi' => 60]]], ['/api/path', ['steps' => new stdClass()]]] as [$url, $body]) {
            $answer = as_user(ANNA, 'PUT', $url, $body, $headers);
            assert_same([428, 'generation_required'], [$answer['status'], $answer['body']['code'] ?? null], "$url, $what");
        }
    }
    assert_same($before, kept(ANNA));
});

test('two tabs learning side by side: their saves keep the generation, and neither refuses the other - the last one wins, as ever', function (): void {
    $generation = load(ANNA)['generation'];
    $one = load(ANNA)['generation'];
    assert_same($generation, $one, 'two tabs, one generation');
    for ($i = 0; $i < 3; $i++) {
        assert_same(204, save(ANNA, '/api/progress', ['60' => ['midi' => 60, 'round' => $i]], $generation)['status'], "the first tab, save $i");
        assert_same(204, save(ANNA, '/api/path', ['steps' => ['rh-1/meet' => ['attempts' => $i]]], $generation)['status']);
        assert_same(204, save(ANNA, '/api/progress', ['62' => ['midi' => 62, 'round' => $i]], $generation)['status'], "the second tab, save $i");
    }
    assert_same($generation, load(ANNA)['generation'], 'a save starts no new generation');
    assert_json_same(['62' => ['midi' => 62, 'round' => 2]], load(ANNA)['progress']);
});

test('a tab that loaded the progress before an import is refused its next save - it never writes the old progress back', function (): void {
    $stale = load(ANNA);
    $import = as_user(ANNA, 'POST', '/api/me/import?replace=true', file_with()); // in another tab
    assert_same(200, $import['status']);
    $now = $import['body']['generation'];
    assert_true($now !== $stale['generation']);

    foreach ([['/api/progress', $stale['progress']], ['/api/path', $stale['path']]] as [$url, $document]) {
        $answer = save(ANNA, $url, $document, $stale['generation']);
        assert_same([409, 'progress_changed', $now], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['generation'] ?? null], $url);
        assert_true(is_string($answer['body']['error']) && $answer['body']['error'] !== '', 'a sentence');
    }
    assert_json_same(file_with()['progress'], load(ANNA)['progress'], 'the imported progress stands');

    // Loaded again, the tab saves as before.
    $fresh = load(ANNA);
    assert_same($now, $fresh['generation']);
    assert_same(204, save(ANNA, '/api/progress', $fresh['progress'], $fresh['generation'])['status']);
    // A generation from the future is no better than one from the past.
    assert_same(409, save(ANNA, '/api/progress', $fresh['progress'], $fresh['generation'] + 1000)['status']);
});

test('a tab still open on progress an administrator deleted is refused its next save - nothing comes back', function (): void {
    learn(BEN);
    $stale = load(BEN);
    assert_same(200, as_user(ADMIN, 'DELETE', '/api/admin/people/' . BEN)['status']);

    $answer = save(BEN, '/api/progress', $stale['progress'], $stale['generation']);
    assert_same([409, 'progress_changed'], [$answer['status'], $answer['body']['code'] ?? null]);
    assert_same(409, save(BEN, '/api/path', $stale['path'], $stale['generation'])['status']);
    assert_same(0, (int) dbValue('SELECT count(*) FROM progress WHERE user_id = ?', [BEN]) + (int) dbValue('SELECT count(*) FROM path_progress WHERE user_id = ?', [BEN]), 'nothing written back');

    // The person's next load is a fresh start, under a generation no tab of theirs held.
    $fresh = load(BEN);
    assert_same([[], ['steps' => []], []], [$fresh['progress'], $fresh['path'], $fresh['sessions']]);
    assert_true($fresh['generation'] !== $stale['generation']);
    assert_same($fresh['generation'], $answer['body']['generation'], 'the refusal named the generation there is now');
    assert_same(204, save(BEN, '/api/progress', ['60' => ['midi' => 60]], $fresh['generation'])['status']);
    // A round is added, never written over anything: one played in the old tab is a round played.
    assert_same(201, as_user(BEN, 'POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 1, 'correct' => 1, 'accuracy' => 100])['status']);
});

test('an import holds the person\'s users row: a save made meanwhile waits, then is refused; two imports at once - one goes in, the other is told', function (): void {
    $second = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', [
        'PIANO_TEST_CONFIG' => test_config_dir(test_auth_iam()),
        'PIANO_FRONTEND_DIST' => test_frontend_build(),
    ], '/api/health');
    $holder = dbConnect(machineDatabaseSettings(), dbName());
    $file = jsonText(file_with());

    // An import (replacing) and a save from a tab of before, each on a server of its own. The import
    // is held inside its transaction - after it has taken the users row - by a lock on sessions.
    learn(CILA);
    $stale = load(CILA);
    $holder->beginTransaction();
    $holder->exec('LOCK TABLE sessions IN ACCESS EXCLUSIVE MODE');
    $import = send($GLOBALS['app'], CILA, 'POST', '/api/me/import?replace=true', $file);
    until_waiting(1, [$import]);
    $save = send($second, CILA, 'PUT', '/api/progress', jsonText($stale['progress']), [GENERATION_HEADER . ': ' . $stale['generation']]);
    until_waiting(2, [$import, $save]);
    usleep(200000);
    assert_true(waiting($import) && waiting($save), 'both wait');
    assert_json_same($stale['progress'], json_decode((string) dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [CILA]), true), 'the save waits for the import, not the other way round');
    $holder->commit();

    [$importStatus, $imported] = answer($import);
    [$saveStatus, $saved] = answer($save);
    assert_same(200, $importStatus, test_show($imported));
    assert_same([409, 'progress_changed', $imported['generation']], [$saveStatus, $saved['code'] ?? null, $saved['generation'] ?? null], 'the save came second, to an old generation');
    assert_json_same(file_with()['progress'], load(CILA)['progress'], 'the import stands');

    // Two imports into one empty account, at once: one goes in, the other sees it there - never both, never a mix.
    $empty = 5;
    load($empty);
    $holder->beginTransaction();
    $holder->exec('LOCK TABLE sessions IN ACCESS EXCLUSIVE MODE');
    $one = send($GLOBALS['app'], $empty, 'POST', '/api/me/import', $file);
    $two = send($second, $empty, 'POST', '/api/me/import', $file);
    until_waiting(2, [$one, $two]);
    $holder->commit();
    $answers = [answer($one), answer($two)];
    usort($answers, static fn(array $a, array $b): int => $a[0] <=> $b[0]);
    assert_same([200, 409], array_column($answers, 0), test_show($answers));
    assert_same('has_progress', $answers[1][1]['code'] ?? null);
    assert_same(2, (int) dbValue('SELECT count(*) FROM sessions WHERE user_id = ?', [$empty]), 'the file\'s two sessions, once');

    assert_same([], server_problems($second), 'no database error on either side');
    ($second['stop'])();
    $holder = null;
});

/* ------------------------------------------------------- the size limit */

test('the size limit: an export just under it comes back in whole; one that would be over it is never handed out', function (): void {
    [$big, $into] = [11, 12];
    load($big);
    $length = static fn(): int => strlen(as_user($big, 'GET', '/api/me/export')['raw']);
    $add = static function (int $from, int $to) use ($big): void {
        dbExec(
            "INSERT INTO sessions (user_id, id, recorded_at, data)
             SELECT ?, 'big-' || lpad(g::text, 6, '0'), timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second',
                    jsonb_build_object('mode', 'lesson', 'label', repeat('x', 200), 'unitId', 'rh-1', 'stepId', 'drill',
                                       'attempts', 10, 'correct', 9, 'accuracy', 90, 'bpm', null)
               FROM generate_series(?::int, ?::int) g",
            [$big, $from, $to]
        );
    };
    $empty = $length();
    $add(1, 1000);
    $each = ($length() - $empty) / 1000; // the bytes of one round in the file
    $sessions = (int) floor((EXPORT_LIMIT - $empty - 2000) / $each);
    $add(1001, $sessions);
    $file = as_user($big, 'GET', '/api/me/export');
    assert_same(200, $file['status']);
    assert_true(strlen($file['raw']) <= EXPORT_LIMIT && strlen($file['raw']) > EXPORT_LIMIT - 2000 - 2 * $each, 'just under the limit: ' . strlen($file['raw']) . ' of ' . EXPORT_LIMIT);

    $import = as_user($into, 'POST', '/api/me/import', $file['raw'], ['Content-Type: application/json']);
    assert_same(200, $import['status'], test_show($import['body']));
    assert_same($sessions, $import['body']['sessions']);
    assert_same(storeStateJson($big), storeStateJson($into), 'every round, as it was');

    // A few more rounds and the export would no longer fit through the import: refused, not handed out.
    $add($sessions + 1, $sessions + 10);
    $over = as_user($big, 'GET', '/api/me/export');
    assert_same([409, 'export_too_large', EXPORT_LIMIT], [$over['status'], $over['body']['code'] ?? null, $over['body']['limit'] ?? null]);
    assert_false(isset($over['headers']['content-disposition']), 'no file');
    // The operator's export has no limit, and the file it writes is the same document.
    assert_true(strlen(jsonText(transferExport($big))) > EXPORT_LIMIT);
});

test('the server logged no PHP or database problem', function (): void {
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[anotoki auth] token refused')));
    assert_same([], $problems);
});
