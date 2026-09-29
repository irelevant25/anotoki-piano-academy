<?php

// The owner's data outside the database and back: the one-time import of the
// old JSON files (from copies in temp folders - never from server/data
// itself), an export and its import, moving a person's data to another IAM
// user id, and tools/progress.php's --import / --owner / --export against
// this file's throwaway database.

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

/** A folder like the old server/data/, written the way the first server wrote it. */
function fixture(array $files = []): string
{
    $dir = test_temp_dir('data');
    $files += [
        'progress.json' => json_encode([
            '60' => ['midi' => 60, 'status' => 'mastered', 'repetitions' => 6, 'easeFactor' => 2.5, 'intervalHours' => 938, 'dueAt' => '2026-10-18T16:08:49.446Z', 'lastGrade' => 4, 'totalAttempts' => 22, 'correctAttempts' => 17, 'avgTimingErrorMs' => null, 'updatedAt' => '2026-09-09T14:08:49.446Z'],
            '62' => ['midi' => 62, 'status' => 'learning', 'repetitions' => 1, 'easeFactor' => 2.36, 'intervalHours' => 4, 'dueAt' => '2026-09-09T18:09:12.436Z', 'lastGrade' => 3, 'totalAttempts' => 2, 'correctAttempts' => 1, 'avgTimingErrorMs' => 212.3, 'updatedAt' => '2026-09-09T14:09:12.436Z'],
        ], JSON_PRETTY_PRINT),
        'sessions.json' => json_encode([
            ['mode' => 'trainer', 'startedAt' => '2026-09-09T14:05:51.328Z', 'endedAt' => '2026-09-09T14:06:09.048Z', 'attempts' => 12, 'correct' => 3, 'accuracy' => 25, 'id' => '1788962769050-k65d2n', 'recordedAt' => '2026-09-09T14:06:09.050Z'],
            ['mode' => 'song', 'songId' => 'ode-to-joy', 'songTitle' => 'Ode to Joy', 'bpm' => 80, 'avgTimingErrorMs' => 51, 'attempts' => 15, 'correct' => 14, 'accuracy' => 93, 'id' => '1788962797312-4xybh8', 'recordedAt' => '2026-09-09T14:06:37.312Z'],
            ['mode' => 'chess', 'id' => 'x1'],
            ['mode' => 'lesson', 'label' => 'C, D, E · Drill', 'unitId' => 'rh-1', 'stepId' => 'drill', 'attempts' => 10, 'correct' => 9, 'accuracy' => 90, 'endedAt' => '2026-09-10T10:00:00.000Z'],
            ['mode' => 'trainer', 'attempts' => 12, 'correct' => 12, 'accuracy' => 100, 'id' => '1788962769050-k65d2n', 'recordedAt' => '2026-09-10T11:00:00.000Z'],
        ], JSON_PRETTY_PRINT),
        'path.json' => json_encode(['steps' => ['rh-1/meet' => ['attempts' => 1, 'lastAccuracy' => 100, 'bestAccuracy' => 100, 'passedAt' => '2026-09-10T09:00:00.000Z', 'updatedAt' => '2026-09-10T09:00:00.000Z']]], JSON_PRETTY_PRINT),
    ];
    foreach ($files as $name => $content) {
        if ($content !== null) {
            file_put_contents("$dir/$name", $content);
        }
    }

    return $dir;
}

/** Names, contents and times of every file in a folder: to see nothing changed them. */
function tree_hash(string $dir): string
{
    $hashes = [];
    foreach (glob("$dir/*") ?: [] as $file) {
        $hashes[] = basename($file) . ':' . md5_file($file) . ':' . filemtime($file);
    }

    return implode(',', $hashes);
}

function state(int $userId): array
{
    return json_decode(storeStateJson($userId), true);
}

/** The real server/data/ of the repository - read here only to copy it. */
function real_server_data(): string
{
    return dirname(TEST_BACKEND) . '/server/data';
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

test('the one-time import: once, into the owner\'s account, the files only read', function (): void {
    wipe();
    $dir = fixture();
    $hash = tree_hash($dir);
    $result = transferImportServerData($dir, 7);
    assert_same(2, $result['notes']);
    assert_same(1, $result['steps']);
    assert_same(4, $result['sessions']);
    assert_same(7, $result['user']);
    assert_same(['sessions.json item 3: Session field "mode" must be one of trainer, sheet, song, lesson.', 'sessions.json item 5: its id 1788962769050-k65d2n was used before, so it got a new one'], $result['problems']);
    assert_same($hash, tree_hash($dir), 'the files are unchanged');

    $state = state(7);
    assert_json_same(json_decode((string) file_get_contents("$dir/progress.json"), true), $state['progress'], 'the progress as it was');
    assert_json_same(json_decode((string) file_get_contents("$dir/path.json"), true), $state['path']);
    assert_same(['1788962769050-k65d2n', '1788962797312-4xybh8'], array_slice(array_column($state['sessions'], 'id'), 0, 2), 'the ids the browser knows');
    assert_same('2026-09-09T14:06:09.050Z', $state['sessions'][0]['recordedAt'], 'and when they were recorded');
    assert_same('2026-09-10T10:00:00.000Z', $state['sessions'][2]['recordedAt'], 'a session without recordedAt: its endedAt');
    assert_true($state['sessions'][3]['id'] !== '1788962769050-k65d2n', 'a repeated id gets a new one');
    assert_same(['lesson', 'C, D, E · Drill', 'rh-1', 'drill'], [$state['sessions'][2]['mode'], $state['sessions'][2]['label'], $state['sessions'][2]['unitId'], $state['sessions'][2]['stepId']]);

    assert_same(['skipped' => 'already imported'], transferImportServerData($dir, 7));
    assert_true(serverDataImported());
    assert_same(7, (int) dbValue('SELECT user_id FROM imports'));
    assert_same(7, serverDataImport()['user']);
    assert_same(4, serverDataImport()['sessions']);
});

test('the import of a copy of the real server/data/ files: every note and session', function (): void {
    wipe();
    $real = real_server_data();
    $before = tree_hash($real);
    // What setup.php reads, with the tests' settings: the copy in their folder.
    $dir = serverDataDir();
    assert_same($GLOBALS['TEST_CONFIG_DIR'] . '/server-data', $dir, 'never the real folder');
    mkdir($dir);
    foreach (glob("$real/*.json") ?: [] as $file) {
        copy($file, "$dir/" . basename($file));
    }
    $notes = count(json_decode((string) file_get_contents("$real/progress.json"), true));
    $sessions = count(json_decode((string) file_get_contents("$real/sessions.json"), true));
    $result = transferImportServerData($dir, 1);
    assert_same([], $result['problems'], 'every old session passes today\'s checks');
    assert_same([$notes, $sessions], [$result['notes'], $result['sessions']]);
    $state = state(1);
    assert_json_same(json_decode((string) file_get_contents("$real/progress.json"), true), $state['progress']);
    assert_json_same(json_decode((string) file_get_contents("$real/sessions.json"), true), $state['sessions'], 'each session exactly as the first server stored it');
    assert_same(is_file("$real/path.json") ? count(json_decode((string) file_get_contents("$real/path.json"), true)['steps']) : 0, count($state['path']['steps']));
    assert_same($before, tree_hash($real), 'server/data/ untouched');
});

test('the import: never into an account with data - the old files are not even read then', function (): void {
    wipe();
    usersSeen(3, null);
    storeSaveProgress(3, (object) ['64' => (object) ['midi' => 64]]);
    $before = storeStateJson(3);
    assert_throws(static function (): void {
        transferImport(3, transferRead(fixture()));
    }, '/already has progress/');
    assert_same($before, storeStateJson(3), 'nothing changed');
    $unreadable = fixture(['progress.json' => '{"60": {']);
    assert_same(['skipped' => 'user 3 already has progress'], transferImportServerData($unreadable, 3));
});

test('the import stops, naming the file, at a progress file that is not one', function (): void {
    wipe();
    $dir = fixture(['progress.json' => '{"60": {']);
    assert_throws(static function () use ($dir): void {
        transferImportServerData($dir, 1);
    }, '/progress\.json is not valid JSON/');
    $dir = fixture(['progress.json' => '[1, 2, 3]']);
    assert_throws(static function () use ($dir): void {
        transferImportServerData($dir, 1);
    }, '/not a progress document/');
    $dir = fixture(['sessions.json' => '{"not": "a list"}']);
    assert_throws(static function () use ($dir): void {
        transferImportServerData($dir, 1);
    }, '/sessions are not a list/');
    assert_false(storeHasData(1), 'nothing was imported');
    assert_false(serverDataImported());
    $empty = test_temp_dir('empty');
    assert_same(['skipped' => "no progress files in $empty"], transferImportServerData($empty, 1));
});

test('export and import: the same progress in another account', function (): void {
    wipe();
    transferImportServerData(fixture(), 1);
    $export = transferExport(1);
    assert_same('piano-academy-export', $export['format']);
    assert_same(1, $export['userId']);
    $file = test_temp_dir('export') . '/export.json';
    file_put_contents($file, json_encode($export));
    $counts = transferImport(9, transferRead($file));
    assert_same(['notes' => 2, 'steps' => 1, 'sessions' => 4], $counts);
    assert_json_same(state(1), state(9), 'everything, ids and times included');

    // an empty account exports {} and {"steps": {}}, and imports as empty
    $empty = transferExport(55);
    assert_same('{}', json_encode($empty['progress']));
    assert_same('{"steps":{}}', json_encode($empty['path']));
    file_put_contents($file, json_encode(['format' => 'something-else']));
    assert_throws(static function () use ($file): void {
        transferRead($file);
    }, '/not a Piano Academy export/');
});

test('a new owner: every row moves to the new IAM user id', function (): void {
    wipe();
    transferImportServerData(fixture(), 1);
    $before = state(1);
    usersSeen(42, 'owner-at-the-iam'); // signed in once, did nothing
    $result = transferReassign(1, 42);
    assert_same(['moved' => true, 'notes' => 2, 'sessions' => 4], $result);
    assert_json_same($before, state(42));
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}}}', storeStateJson(1), 'nothing left under the old id');
    assert_same(42, (int) dbValue('SELECT user_id FROM imports'), 'the import record moved too');
    assert_same(['moved' => false], transferReassign(1, 43), 'nobody to move');

    usersSeen(50, null);
    storeSaveProgress(50, (object) ['60' => (object) ['midi' => 60]]);
    assert_throws(static function (): void {
        transferReassign(42, 50);
    }, '/already has progress/');
    assert_json_same($before, state(42), 'a refused move changes nothing');
});

test('tools/progress.php: --import into an account, --export, --owner (throwaway database, your settings untouched)', function (): void {
    wipe();
    $settings = machine_settings_hash();
    $dir = fixture();
    [$code, $out] = progress_cli(["--import=$dir", '--user=5']);
    assert_same(0, $code, $out);
    assert_match('/Imported into IAM user 5: 2 notes, 1 path steps, 4 sessions\./', $out);
    assert_match('/left out: sessions\.json item 3/', $out);
    [$code, $out] = progress_cli(["--import=$dir", '--user=5']);
    assert_same(1, $code, 'a second import into the same account is refused');
    assert_match('/already has progress/', $out);

    $export = test_temp_dir('cli-export') . '/progress.json';
    [$code, $out] = progress_cli(["--export=$export", '--user=5']);
    assert_same(0, $code, $out);
    assert_match('/Exported IAM user 5 to .*: 2 notes, 1 path steps, 4 sessions\./', $out);
    assert_same('piano-academy-export', json_decode((string) file_get_contents($export), true)['format']);
    [$code, $out] = progress_cli(["--export=$export", '--user=5']);
    assert_same(1, $code, 'never over an existing file');
    [$code, $out] = progress_cli(['--export=' . real_server_data() . '/export.json']);
    assert_same(1, $code, 'never into server/data/');
    assert_false(is_file(real_server_data() . '/export.json'));

    // you are IAM user 77 now: the owner's (5's) progress moves there, and the
    // settings - this file's own - remember it
    $auth = $GLOBALS['TEST_CONFIG_DIR'] . '/auth.local.php';
    file_put_contents($auth, '<?php return ' . var_export(test_auth_none(5), true) . ";\n");
    $before = state(5);
    [$code, $out] = progress_cli(['--owner=77']);
    assert_same(0, $code, $out);
    assert_match('/Moved your progress from IAM user 5 to IAM user 77: 2 notes, 4 sessions\./', $out);
    assert_json_same($before, state(77));
    assert_false(storeHasData(5));
    assert_same(77, (require $auth)['local_user_id']);
    file_put_contents($auth, '<?php return ' . var_export(test_auth_none(), true) . ";\n");

    assert_same($settings, machine_settings_hash(), 'this computer\'s config/*.local.php are as they were');
});
