<?php

// One person's data outside the database and back: an export and its import
// (checked - not an export, a broken one - never into an account with
// progress unless it replaces it, the userId inside not read, a new
// generation each time), moving a person's data to another IAM user id, and
// tools/progress.php's --export / --import [--replace] / --move (--user
// always given) against this file's throwaway database.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

before(function (): void {
    test_db();
});

function wipe(): void
{
    foreach (['imports', 'sessions', 'progress', 'path_progress', 'users'] as $table) {
        dbExec("DELETE FROM $table");
    }
}

/** What transferImport() answers, but the generation (a number of the sequence's). */
function counts_of(array $result): array
{
    assert_true(is_int($result['generation'] ?? null) && $result['generation'] > 0, 'an import answers the generation it started');

    return array_diff_key($result, ['generation' => 0]);
}

/** An export document, as tools/progress.php --export writes one ($changes replace its parts). */
function export_document(array $changes = []): array
{
    return $changes + [
        'format' => 'piano-academy-export',
        'version' => 1,
        'exportedAt' => '2026-09-28T10:00:00.000Z',
        'userId' => 1,
        'progress' => [
            '60' => [
                'midi' => 60,
                'status' => 'mastered',
                'repetitions' => 6,
                'easeFactor' => 2.5,
                'intervalHours' => 938,
                'dueAt' => '2026-10-18T16:08:49.446Z',
                'lastGrade' => 4,
                'totalAttempts' => 22,
                'correctAttempts' => 17,
                'avgTimingErrorMs' => null,
                'updatedAt' => '2026-09-09T14:08:49.446Z',
            ],
            '62' => [
                'midi' => 62,
                'status' => 'learning',
                'repetitions' => 1,
                'easeFactor' => 2.36,
                'intervalHours' => 4,
                'dueAt' => '2026-09-09T18:09:12.436Z',
                'lastGrade' => 3,
                'totalAttempts' => 2,
                'correctAttempts' => 1,
                'avgTimingErrorMs' => 212.3,
                'updatedAt' => '2026-09-09T14:09:12.436Z',
            ],
        ],
        'path' => ['steps' => ['rh-1/meet' => ['attempts' => 1, 'lastAccuracy' => 100, 'bestAccuracy' => 100, 'passedAt' => '2026-09-10T09:00:00.000Z', 'updatedAt' => '2026-09-10T09:00:00.000Z']]],
        'sessions' => [
            [
                'mode' => 'trainer',
                'startedAt' => '2026-09-09T14:05:51.328Z',
                'endedAt' => '2026-09-09T14:06:09.048Z',
                'attempts' => 12,
                'correct' => 3,
                'accuracy' => 25,
                'id' => '1788962769050-k65d2n',
                'recordedAt' => '2026-09-09T14:06:09.050Z',
            ],
            [
                'mode' => 'song',
                'songId' => 'ode-to-joy',
                'songTitle' => 'Ode to Joy',
                'bpm' => 80,
                'avgTimingErrorMs' => 51,
                'attempts' => 15,
                'correct' => 14,
                'accuracy' => 93,
                'id' => '1788962797312-4xybh8',
                'recordedAt' => '2026-09-09T14:06:37.312Z',
            ],
            ['mode' => 'chess', 'id' => 'x1'],
            ['mode' => 'lesson', 'label' => 'C, D, E · Drill', 'unitId' => 'rh-1', 'stepId' => 'drill', 'attempts' => 10, 'correct' => 9, 'accuracy' => 90, 'endedAt' => '2026-09-10T10:00:00.000Z'],
            ['mode' => 'trainer', 'attempts' => 12, 'correct' => 12, 'accuracy' => 100, 'id' => '1788962769050-k65d2n', 'recordedAt' => '2026-09-10T11:00:00.000Z'],
        ],
    ];
}

/** An export document written to a temp file. */
function export_file(array $document, string $raw = ''): string
{
    $file = test_temp_dir('export') . '/progress.json';
    file_put_contents($file, $raw !== '' ? $raw : json_encode($document, JSON_PRETTY_PRINT));

    return $file;
}

function state(int $userId): array
{
    return json_decode(storeStateJson($userId), true);
}

/** php tools/progress.php with these arguments, with this file's settings: [exit code, output]. */
function progress_cli(array $args): array
{
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $process = proc_open(array_merge([PHP_BINARY, TEST_BACKEND . '/tools/progress.php'], $args), [0 => ['file', $null, 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]], $pipes, TEST_BACKEND, getenv());
    $out = (string) stream_get_contents($pipes[1]);
    fclose($pipes[1]);

    return [proc_close($process), trim($out)];
}

/** Checksums of this computer's own settings files: no test may change them. */
function machine_settings_hash(): string
{
    return implode(',', array_map(static fn(string $file): string => basename($file) . ':' . md5_file($file), glob(TEST_BACKEND . '/config/*.local.php') ?: []));
}

test('an export into an account: every note and step, the sessions with their ids and times - the bad ones left out and said', function (): void {
    wipe();
    $data = transferReadFile(export_file(export_document()));
    assert_same(['session 3: Session field "mode" must be one of trainer, sheet, song, lesson.', 'session 5: its id 1788962769050-k65d2n was used before, so it got a new one'], $data['problems']);
    assert_same(1, $data['leftOut'], 'the chess one; a session whose id was used before is kept, with a new one');
    $result = transferImport(7, $data);
    assert_same(['notes' => 2, 'steps' => 1, 'sessions' => 4, 'replaced' => false], counts_of($result));
    assert_same((int) dbValue('SELECT progress_generation FROM users WHERE id = 7'), $result['generation'], 'the generation it started');

    $state = state(7);
    assert_json_same(export_document()['progress'], $state['progress'], 'the progress as it was');
    assert_json_same(export_document()['path'], $state['path']);
    assert_same(['1788962769050-k65d2n', '1788962797312-4xybh8'], array_slice(array_column($state['sessions'], 'id'), 0, 2), 'the ids the browser knows');
    assert_same('2026-09-09T14:06:09.050Z', $state['sessions'][0]['recordedAt'], 'and when they were recorded');
    assert_same('2026-09-10T10:00:00.000Z', $state['sessions'][2]['recordedAt'], 'a session without recordedAt: its endedAt');
    assert_true($state['sessions'][3]['id'] !== '1788962769050-k65d2n', 'a repeated id gets a new one');
    assert_same(['lesson', 'C, D, E · Drill', 'rh-1', 'drill'], [$state['sessions'][2]['mode'], $state['sessions'][2]['label'], $state['sessions'][2]['unitId'], $state['sessions'][2]['stepId']]);
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id = 1'), 'the userId in the file is not read: nobody was made for it');
    assert_same(0, (int) dbValue('SELECT count(*) FROM imports'), 'the imports table is written by nothing any more');
});

/** Somebody who signed in (the library's people module recorded them from a token), with or without a name. */
function signed_in(int $id, ?string $name = null): void
{
    people()->recorder()->seen(db(), \Anotoki\Lib\Auth\Person::fromClaims(['sub' => (string) $id, 'preferred_username' => $name]));
}

test('never into an account with progress: nothing changes', function (): void {
    wipe();
    signed_in(3);
    storeSaveProgress(3, (object) ['64' => (object) ['midi' => 64]]);
    $before = storeStateJson(3);
    assert_throws(static function (): void {
        transferImport(3, transferReadFile(export_file(export_document())));
    }, '/already has progress/');
    assert_same($before, storeStateJson(3), 'nothing changed');
});

test('what is not an export stops everything, naming why', function (): void {
    wipe();
    $refused = [
        'not JSON' => ['/is not valid JSON/', '{"60": {'],
        'another format' => ['/not a Piano Academy export/', json_encode(['format' => 'something-else'])],
        'a list' => ['/not a Piano Academy export/', '[1, 2, 3]'],
        'a progress that is none' => ['/not a progress document/', json_encode(export_document(['progress' => [1, 2, 3]]))],
        'a path that is none' => ['/not a path document/', json_encode(export_document(['path' => ['steps' => 'x']]))],
        'sessions that are no list' => ['/sessions are not a list/', json_encode(export_document(['sessions' => ['not' => 'a list']]))],
    ];
    foreach ($refused as $what => [$pattern, $raw]) {
        assert_throws(static function () use ($raw): void {
            transferReadFile(export_file([], $raw));
        }, $pattern);
    }
    assert_throws(static fn() => transferReadFile(test_temp_dir('none') . '/missing.json'), '/There is no file/');
    assert_throws(static fn() => transferReadFile(test_temp_dir('a-folder')), '/There is no file/');
    assert_false(storeHasData(1), 'nothing was imported');
});

test('export and import: the same progress in another account', function (): void {
    wipe();
    transferImport(1, transferReadExport(json_decode((string) json_encode(export_document()))));
    $export = transferExport(1);
    assert_same('piano-academy-export', $export['format']);
    assert_same(1, $export['userId']);
    $counts = transferImport(9, transferReadFile(export_file($export)));
    assert_same(['notes' => 2, 'steps' => 1, 'sessions' => 4, 'replaced' => false], counts_of($counts));
    assert_json_same(state(1), state(9), 'everything, ids and times included');

    // an empty account exports {} and {"steps": {}}, and imports as empty
    $empty = transferExport(55);
    assert_same('{}', json_encode($empty['progress']));
    assert_same('{"steps":{}}', json_encode($empty['path']));
    assert_same(['notes' => 0, 'steps' => 0, 'sessions' => 0, 'replaced' => false], counts_of(transferImport(56, transferReadFile(export_file($empty)))));
});

test('an import that replaces: the file\'s progress alone, the old gone - and each import a new generation, never one handed out before', function (): void {
    wipe();
    signed_in(4, 'learner');
    storeSaveProgress(4, (object) ['64' => (object) ['midi' => 64]]);
    storeSavePath(4, (object) ['steps' => (object) ['rh-9/x' => (object) ['attempts' => 1]]]);
    storeAddSession(4, ['mode' => 'trainer', 'attempts' => 1, 'correct' => 1, 'accuracy' => 100]);
    signed_in(5, 'bystander');
    storeSaveProgress(5, (object) ['67' => (object) ['midi' => 67]]);
    $bystander = storeStateJson(5, true);
    $before = (int) dbValue('SELECT progress_generation FROM users WHERE id = 4');

    try {
        transferImport(4, transferReadFile(export_file(export_document())));
        fail('an account with progress takes nothing unless replacing is asked for');
    } catch (ApiError $e) {
        assert_same([409, 'has_progress', ['notes' => 1, 'steps' => 1, 'sessions' => 1]], [$e->status, $e->errorCode, $e->extra['current'] ?? null]);
    }
    assert_same($before, (int) dbValue('SELECT progress_generation FROM users WHERE id = 4'), 'a refused import starts nothing');

    $result = transferImport(4, transferReadFile(export_file(export_document())), true);
    assert_same(['notes' => 2, 'steps' => 1, 'sessions' => 4, 'replaced' => true], counts_of($result));
    $state = state(4);
    assert_json_same(export_document()['progress'], $state['progress'], 'not a mix: note 64 is gone');
    assert_json_same(export_document()['path'], $state['path']);
    assert_same(4, count($state['sessions']), 'the file\'s sessions alone');
    assert_same('learner', dbValue('SELECT preferred_username FROM users WHERE id = 4'), 'the person stays who they are');
    assert_true($result['generation'] > $before, 'a new generation');
    assert_same($bystander, storeStateJson(5, true), 'nobody else touched');

    // Replacing an account with nothing is a plain import; and every import starts a generation of its own.
    $again = transferImport(4, transferReadFile(export_file(export_document())), true);
    assert_true($again['generation'] > $result['generation']);
    $fresh = transferImport(6, transferReadFile(export_file(export_document())), true);
    assert_same(false, $fresh['replaced']);
    assert_same(3, count(array_unique(array_column(dbAll('SELECT progress_generation FROM users WHERE id IN (4, 5, 6)'), 'progress_generation'))), 'no two people share one');
});

test('an export the app cannot read is refused with a code: not an export at all, or one of another version or broken', function (): void {
    $code = static function (mixed $document): ?string {
        try {
            transferReadExport(json_decode((string) json_encode($document)));

            return null;
        } catch (ApiError $e) {
            assert_same(422, $e->status);
            assert_true($e->getMessage() !== '', 'and a sentence');

            return $e->errorCode;
        }
    };
    assert_same('not_an_export', $code(null));
    assert_same('not_an_export', $code([1, 2]));
    assert_same('not_an_export', $code(['format' => 'piano-academy']));
    assert_same('not_an_export', $code(['home.title' => 'Learn']));
    assert_same('invalid_export', $code(export_document(['version' => 2])));
    assert_same('invalid_export', $code(export_document(['version' => '1'])));
    assert_same('invalid_export', $code(array_diff_key(export_document(), ['version' => 0])));
    assert_same('invalid_export', $code(export_document(['progress' => ['C4' => []]])));
    assert_same('invalid_export', $code(export_document(['path' => []])));
    assert_same('invalid_export', $code(export_document(['sessions' => 'none'])));
    assert_same(null, $code(export_document()));
    assert_same(null, $code(export_document(['progress' => null, 'path' => null, 'sessions' => null])), 'parts left out are nothing to bring');
});

test('a move: every row goes to the new IAM user id', function (): void {
    wipe();
    transferImport(1, transferReadFile(export_file(export_document())));
    $before = state(1);
    signed_in(42, 'signed-in-once'); // signed in once, did nothing
    $result = transferReassign(1, 42);
    assert_same(['moved' => true, 'notes' => 2, 'sessions' => 4], $result);
    assert_json_same($before, state(42));
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}}}', storeStateJson(1), 'nothing left under the old id');
    assert_same(['moved' => false], transferReassign(1, 43), 'nobody to move');

    signed_in(50);
    storeSaveProgress(50, (object) ['60' => (object) ['midi' => 60]]);
    assert_throws(static function (): void {
        transferReassign(42, 50);
    }, '/already has progress/');
    assert_json_same($before, state(42), 'a refused move changes nothing');
});

test('tools/progress.php: --import and --export for a --user it is given, --move (throwaway database, your settings untouched)', function (): void {
    wipe();
    $settings = machine_settings_hash();
    $file = export_file(export_document());

    [$code, $out] = progress_cli(["--import=$file"]);
    assert_same(1, $code, 'no --user: there is no "yours" any more');
    assert_match('/--user is needed/', $out);
    [$code, $out] = progress_cli(["--import=$file", '--user=0']);
    assert_same(1, $code);
    assert_match('/--user must be an IAM user id/', $out);
    [$code, $out] = progress_cli(['--import=' . dirname($file), '--user=5']);
    assert_same(1, $code, 'a folder of old files is no export');
    assert_match('/There is no file/', $out);

    [$code, $out] = progress_cli(["--import=$file", '--user=5']);
    assert_same(0, $code, $out);
    assert_match('/Imported into IAM user 5: 2 notes, 1 path steps, 4 sessions\./', $out);
    assert_match('/left out: session 3/', $out);
    [$code, $out] = progress_cli(["--import=$file", '--user=5']);
    assert_same(1, $code, 'a second import into the same account is refused');
    assert_match('/already has progress/', $out);
    [$code, $out] = progress_cli(["--import=$file", '--user=5', '--replace']);
    assert_same(0, $code, 'unless replacing is asked for by name: ' . $out);
    assert_match('/Replaced the progress of IAM user 5 with the file\'s: 2 notes, 1 path steps, 4 sessions\./', $out);
    assert_same(4, (int) dbValue('SELECT count(*) FROM sessions WHERE user_id = 5'), 'the file\'s, not twice');

    $export = test_temp_dir('cli-export') . '/progress.json';
    [$code, $out] = progress_cli(["--export=$export"]);
    assert_same(1, $code, 'an export needs its --user too');
    assert_false(is_file($export));
    [$code, $out] = progress_cli(["--export=$export", '--user=5']);
    assert_same(0, $code, $out);
    assert_match('/Exported IAM user 5 to .*: 2 notes, 1 path steps, 4 sessions\./', $out);
    assert_same('piano-academy-export', json_decode((string) file_get_contents($export), true)['format']);
    [$code] = progress_cli(["--export=$export", '--user=5']);
    assert_same(1, $code, 'never over an existing file');

    $before = state(5);
    [$code, $out] = progress_cli(['--move=5']);
    assert_same(1, $code, 'a move needs --to');
    assert_match('/--to is needed/', $out);
    [$code, $out] = progress_cli(['--move=5', '--to=77']);
    assert_same(0, $code, $out);
    assert_match('/Moved the progress of IAM user 5 to IAM user 77: 2 notes, 4 sessions\./', $out);
    assert_json_same($before, state(77));
    assert_false(storeHasData(5));
    [$code, $out] = progress_cli(['--owner=77']);
    assert_same(1, $code, '--owner is gone: nothing is anybody\'s by a setting');

    assert_same($settings, machine_settings_hash(), 'this computer\'s config/*.local.php are as they were');
    assert_false(array_key_exists('local_user_id', require $GLOBALS['TEST_CONFIG_DIR'] . '/auth.local.php'), 'and nothing wrote an owner into the test\'s own');
});
