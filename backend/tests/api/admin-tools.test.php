<?php

// The admin tools of the anotoki family's library (anotoki/lib 0.5.0) as this
// app wires them (api/admin_tools.php), through the real server - who may
// reach each route (nobody 401, a learner and an editor 403, an administrator
// through) is tests/api/admin.test.php's:
//
// - backups: a daily one after the day's first good answer, once a day; one
//   made, downloaded (a single-use link), restored and deleted only after a
//   sign-in of the last ten minutes, each audited, its maker named; a restore
//   brings the database back as it was, a backup of what was there first, and
//   gives every progress a new generation (a tab open since before it is
//   refused its save, never written over what was restored); it does again,
//   inside its transaction, every delete made since the backup - a person's
//   on the People page (on the restore's own connection: it completes at
//   once) and a feedback message's - and none made before it; it runs the
//   scrub of the IAM's deleted accounts before it answers (one that cannot
//   finish is said, and the next request tries again); a backup that carries
//   no seal of this installation's is not restored here;
// - the error log: a 404 is a line - its route and its path, never its query,
//   an address or a token - and the log's own routes are never in it; an
//   error a page met (POST /api/client-errors) is a line too, redacted, by the
//   person who met it, twenty an hour from one sender;
// - feedback: the visitors' form, open to everybody - who from the token
//   alone, never a body; the reply address only as the form sends it;
//   nothing of where it came from kept; a robot's honeypot keeps nothing;
//   five an hour from one sender - a visitor by their address, a person by
//   their account - and the admin page's count of what is new, a message
//   opened made read, a status and a delete audited;
// - the audit log: who did what, by the name this app keeps of them, and the
//   filter by a name;
// - the people's scrub: an account the IAM deleted is blanked here (the
//   IAM's placeholder name, when), its progress kept, a feedback message's
//   contact address and browser forgotten (its words stay), and no later
//   request revives it; the People page's search and its pages of 50.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const ADMIN = 1;
const EDITOR = 2;
const LEARNER = 3;

$GLOBALS['auth'] = null;
$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['auth'] = test_auth_iam();
    $GLOBALS['app'] = start_app($GLOBALS['auth']);
});

/** A token as the IAM signs it for these people ($extra: claims to change - an old auth_time...). */
function token_for(int $user, array $extra = []): string
{
    return test_token(
        $user,
        match ($user) {
            ADMIN => [ROLE_ADMIN],
            EDITOR => [ROLE_EDITOR],
            default => [],
        },
        $extra,
    );
}

function ask(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

/** The administrator asks - signed in just now, unless $extra says otherwise. */
function as_admin(string $method, string $url, mixed $body = null, array $extra = []): array
{
    return ask($method, $url, $body, bearer(token_for(ADMIN, $extra)));
}

/** The server's storage folder (beside its settings). */
function storage(): string
{
    return $GLOBALS['app']['config'] . '/storage';
}

/** The audit log's entries of $action, oldest first: [actor, target type, target id, details]. */
function audited(string $action): array
{
    return array_map(
        static fn(array $row): array => [$row['actor_id'] === null ? null : (int) $row['actor_id'], $row['target_type'], $row['target_id'], json_decode((string) $row['details'], true)],
        dbAll('SELECT actor_id, target_type, target_id, details::text AS details FROM anotoki_audit_log WHERE action = ? ORDER BY id', [$action]),
    );
}

/** The backups' files in storage/backups, by kind. */
function backup_files(string $kind): array
{
    $files = glob(storage() . "/backups/*-$kind-*.anotoki-backup") ?: [];
    sort($files);

    return array_map('basename', $files);
}

test('a daily backup: after the day\'s first good answer (the server\'s start), once a UTC day - by nobody', function (): void {
    // start_app() asked /api/health: the day's first good answer. The backup runs after it, and the built-in
    // server answers one request at a time, so it is there by the time this one is answered.
    $list = as_admin('GET', '/api/admin/backups');
    assert_same(200, $list['status']);
    $daily = array_values(array_filter($list['body']['backups'], static fn(array $backup): bool => $backup['kind'] === 'daily'));
    assert_same(1, count($daily), test_show($list['body']['backups']));
    assert_same($daily[0]['created_at'], $list['body']['status']['last_daily']);
    assert_same(
        [true, true, true, false],
        [$list['body']['status']['copy_available'], $list['body']['status']['restore_enabled'], $list['body']['status']['restorable'], $list['body']['status']['encrypted']],
        'COPY works here, restoring is on, nothing is encrypted',
    );
    assert_same([$daily[0]['id'] . '.anotoki-backup'], backup_files('daily'));
    assert_same([[null, 'backup', $daily[0]['id']]], array_map(static fn(array $entry): array => array_slice($entry, 0, 3), audited('backup.created')), 'made by nobody, audited');

    // More answers the same day: no second one.
    foreach (['/api/health', '/api/site-status', '/api/auth/config'] as $url) {
        assert_same(200, ask('GET', $url)['status']);
    }
    assert_same(200, ask('GET', '/api/state', null, bearer(token_for(LEARNER)))['status']);
    assert_same(1, count(backup_files('daily')), 'once a day');
});

test('the error log: a 404 is a line - its route and its path, never its query, an address or a token - and the log\'s own routes are never in it', function (): void {
    $token = token_for(LEARNER);
    $missing = ask('GET', '/api/no-such-thing?token=abc123secret&email=someone@example.com', null, bearer($token));
    assert_same([404, 'not_found'], [$missing['status'], $missing['body']['code'] ?? null], test_show($missing['body']));

    $report = as_admin('GET', '/api/admin/errors?days=1');
    assert_same(200, $report['status']);
    $groups = array_values(array_filter($report['body']['groups'], static fn(array $group): bool => in_array('/api/no-such-thing', $group['paths'], true)));
    assert_same(1, count($groups), test_show($report['body']['groups']));
    assert_same([404, 1, 'GET', LEARNER], [$groups[0]['status'], $groups[0]['count'], $groups[0]['latest']['method'], (int) $groups[0]['latest']['user_id']], 'who asked: the token\'s person');
    assert_true(($report['body']['total'] ?? 0) >= 1);

    // Every occurrence of it, by its fingerprint.
    $one = as_admin('GET', '/api/admin/errors/' . $groups[0]['fingerprint'] . '?days=1');
    assert_same([200, 1], [$one['status'], count($one['body'])]);

    // The day's file: no query, no address, no token - and nothing of the log's own routes.
    $text = implode('', array_map('file_get_contents', glob(storage() . '/logs/errors-*.jsonl') ?: []));
    assert_true($text !== '', 'the line is written');
    assert_no_match('/abc123secret|someone@example\.com|127\.0\.0\.1|' . preg_quote(substr($token, 0, 40), '/') . '/', $text, 'never the query, an address or a token');
    assert_no_match('~/api/admin/errors~', $text, 'the log\'s own routes are never in it');
    assert_true(is_file(storage() . '/logs/.htaccess'), 'the folder is guarded');

    // Cleared: every file, audited by the administrator.
    $cleared = as_admin('DELETE', '/api/admin/errors');
    assert_same(200, $cleared['status']);
    assert_true($cleared['body']['deleted'] >= 1);
    assert_same([], glob(storage() . '/logs/errors-*.jsonl') ?: [], 'gone');
    assert_same([[ADMIN, 'error_log', null]], array_map(static fn(array $entry): array => array_slice($entry, 0, 3), audited('errors.cleared')));
});

/** Every line of the error log, oldest first (the server's failures and the pages' own errors alike). */
function error_lines(): array
{
    $lines = [];
    foreach (glob(storage() . '/logs/errors-*.jsonl') ?: [] as $file) {
        foreach (preg_split('/\R/', (string) file_get_contents($file)) as $line) {
            $entry = json_decode($line, true);
            if (is_array($entry)) {
                $lines[] = $entry;
            }
        }
    }

    return $lines;
}

/** The error log's lines of the pages' own errors (source client), oldest first. */
function client_lines(): array
{
    $lines = [];
    foreach (glob(storage() . '/logs/errors-*.jsonl') ?: [] as $file) {
        foreach (preg_split('/\R/', (string) file_get_contents($file)) as $line) {
            $entry = json_decode($line, true);
            if (is_array($entry) && ($entry['source'] ?? null) === 'client') {
                $lines[] = $entry;
            }
        }
    }

    return $lines;
}

test('the pages\' own errors: one a page met reaches the error log - redacted, by the person who met it - twenty an hour from one sender, JSON only', function (): void {
    $jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIzIiwiaXNzIjoieCJ9.c2lnbmF0dXJlLW9mLXRoZS10b2tlbg';
    $report = [
        'type' => 'TypeError',
        'message' => "Cannot read properties of undefined (reading 'notes'): token=$jwt for someone@example.com at 198.51.100.23, password=hunter2hunter2",
        'page' => '/stats?code=abc123secret#top',
        'stack' => ['TypeError: Cannot read properties of undefined', 'at ProgressStore.load (https://piano.example/main-ABC.js:1:2345)', "at x (https://piano.example/chunk.js?token=$jwt:3:4)"],
    ];
    // A learner's page: through the app's own HttpClient, so with their token - written under their id.
    $mine = ask('POST', '/api/client-errors', $report, bearer(token_for(LEARNER)));
    assert_same([204, ''], [$mine['status'], $mine['raw']], test_show($mine['body']));
    assert_same('no-store', $mine['headers']['cache-control'] ?? null);
    // Nobody's page (a visitor's - no token): written too, by nobody.
    assert_same(204, ask('POST', '/api/client-errors', ['message' => 'Nobody\'s page failed.', 'page' => '/'])['status']);

    $lines = client_lines();
    assert_same(2, count($lines), test_show($lines));
    assert_same(['TypeError', LEARNER, '/stats'], [$lines[0]['type'], (int) $lines[0]['user_id'], $lines[0]['path']], 'its type, who met it, the page without its query');
    assert_match('/^Cannot read properties of undefined \(reading \'notes\'\)/', (string) $lines[0]['message']);
    assert_same(null, $lines[1]['user_id'] ?? null, 'nobody\'s');
    $text = implode('', array_map('file_get_contents', glob(storage() . '/logs/errors-*.jsonl') ?: []));
    assert_no_match('/' . preg_quote($jwt, '/') . '|someone@example\.com|198\.51\.100\.23|hunter2|abc123secret|127\.0\.0\.1/', $text, 'never a token, an address, a password or the query');

    // On the admin page, by its type and page.
    $report = as_admin('GET', '/api/admin/errors?days=1')['body'];
    $groups = array_values(array_filter($report['groups'], static fn(array $group): bool => ($group['source'] ?? null) === 'client'));
    assert_same(2, count($groups), test_show($report['groups']));

    // What it refuses writes nothing and counts nothing: no JSON, too big, no message, a token that does not check out.
    $refused = [
        'not JSON' => [['message' => 'x'], ['Content-Type: text/plain'], 415, null],
        'over 8 KB' => [['message' => str_repeat('x', 9000)], [], 413, null],
        'no message' => [['page' => '/'], [], 422, 'message_required'],
        'a forged token' => [['message' => 'x'], bearer(test_token(LEARNER, [], [], ['iam' => test_other_iam('piano-test-key')])), 401, 'invalid_token'],
    ];
    foreach ($refused as $what => [$body, $headers, $status, $code]) {
        $answer = $what === 'not JSON' ? ask('POST', '/api/client-errors', jsonText($body), $headers) : ask('POST', '/api/client-errors', $body, $headers);
        assert_same($status, $answer['status'], $what);
        if ($code !== null) {
            assert_same($code, $answer['body']['code'] ?? null, $what);
        }
    }
    assert_same(2, count(client_lines()), 'nothing written');

    // Twenty an hour from one sender: nobody's (by their address) - one sent above, nineteen more, then refused.
    for ($i = 2; $i <= 20; $i++) {
        assert_same(204, ask('POST', '/api/client-errors', ['message' => "Nobody's error $i."])['status'], "nobody's error $i");
    }
    $over = ask('POST', '/api/client-errors', ['message' => 'One too many.']);
    assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null]);
    assert_true((int) ($over['body']['retry_after'] ?? 0) > 0 && (int) ($over['headers']['retry-after'] ?? 0) > 0, 'when to try again');
    // ... while a person signed in, from the same address, is counted by their account: their own budget.
    assert_same(204, ask('POST', '/api/client-errors', ['message' => 'The learner\'s second error.'], bearer(token_for(LEARNER)))['status']);
    assert_same(22, count(client_lines()));
    $counts = (string) @file_get_contents(storage() . '/logs/client-errors.json');
    assert_no_match('/127\.0\.0\.1|"' . LEARNER . '"/', $counts, 'the counts keep keyed hashes, never an address or an id');

    // Cleared for the tests after this one.
    assert_same(200, as_admin('DELETE', '/api/admin/errors')['status']);
});

test(
    'feedback: the form is everybody\'s - who from the token alone, nothing of where it came from, a robot\'s honeypot keeps nothing, five an hour - and the admin page counts what is new, its status and delete audited',
    function (): void {
        // The learner signed in once before (their name is the one the admin page shows).
        assert_same(200, ask('GET', '/api/state', null, bearer(token_for(LEARNER)))['status']);
        $browser = ['User-Agent: PianoTest/1.0 (feedback)'];
        $bug = ['kind' => 'bug', 'section' => 'Note Trainer', 'subject' => 'The C key', 'message' => 'The C key sticks after a chord.', 'page' => '/trainer?mode=chords#top', 'language' => 'sk'];

        // A token that does not check out is refused, as anywhere: nothing kept.
        $forged = ask('POST', '/api/feedback', $bug, array_merge($browser, bearer(test_token(LEARNER, [], [], ['iam' => test_other_iam('piano-test-key')]))));
        assert_same([401, 'invalid_token'], [$forged['status'], $forged['body']['code'] ?? null]);
        // What the form refuses, in the app's error shape - each kept nothing, and counts against no limit.
        $refused = [
            'no kind' => [['message' => 'x'], 'kind_unknown'],
            'a kind of its own' => [['kind' => 'praise', 'message' => 'x'], 'kind_unknown'],
            'no message' => [['kind' => 'bug', 'message' => '   '], 'message_required'],
            'a place this app does not list' => [['kind' => 'bug', 'section' => 'Characters', 'message' => 'x'], 'section_unknown'],
            'an address a mail link would read as more' => [['kind' => 'bug', 'message' => 'x', 'email' => 'a@example.com?bcc=b@example.com'], 'email_invalid'],
        ];
        foreach ($refused as $what => [$body, $code]) {
            $answer = ask('POST', '/api/feedback', $body, $browser);
            assert_same([422, $code], [$answer['status'], $answer['body']['code'] ?? null], $what);
            assert_true(isset($answer['body']['error']), "$what: {error, code}");
        }

        // Nobody signed in: kept, by nobody, answered at the address typed - the page without its query.
        $nobody = ask('POST', '/api/feedback', $bug + ['email' => 'reader@example.com'], $browser);
        assert_same([201, ['ok' => true]], [$nobody['status'], $nobody['body']], 'no id handed back');
        // The learner: their id from the token; the reply address the one the form sends - their account's, which the
        // form writes in (anotoki-lib 0.5.0: the server fills none in) ...
        $learner = array_merge($browser, bearer(token_for(LEARNER)));
        assert_same(201, ask('POST', '/api/feedback', ['kind' => 'idea', 'section' => 'Songs', 'message' => 'More songs, please.', 'email' => 'user3@example.test'], $learner)['status']);
        // ... or none, when they cleared it: the account's address is never filled in by the server.
        assert_same(201, ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'No address, please.'], $learner)['status']);
        // ... "send it without my name": no id, no address, whatever was typed.
        assert_same(201, ask('POST', '/api/feedback', ['kind' => 'other', 'message' => 'Thank you.', 'anonymous' => true, 'email' => 'me@example.com'], $learner)['status']);
        // A body's own say of who sent it counts for nothing.
        assert_same(201, ask('POST', '/api/feedback', ['kind' => 'bug', 'message' => 'From the administrator, honestly.', 'user_id' => ADMIN, 'id' => ADMIN], $browser)['status']);
        // A robot fills the field no person sees: the same answer, word for word, and nothing kept.
        $robot = ask('POST', '/api/feedback', ['kind' => 'bug', 'message' => 'Buy now', 'website' => 'https://spam.example'], $browser);
        assert_same([201, ['ok' => true]], [$robot['status'], $robot['body']]);

        assert_same(
            [
                [
                    'kind' => 'bug',
                    'section' => 'Note Trainer',
                    'subject' => 'The C key',
                    'message' => 'The C key sticks after a chord.',
                    'contact_email' => 'reader@example.com',
                    'user_id' => null,
                    'page' => '/trainer',
                    'language' => 'sk',
                    'user_agent' => 'PianoTest/1.0 (feedback)',
                    'status' => 'new',
                ],
                [
                    'kind' => 'idea',
                    'section' => 'Songs',
                    'subject' => null,
                    'message' => 'More songs, please.',
                    'contact_email' => 'user3@example.test',
                    'user_id' => LEARNER,
                    'page' => null,
                    'language' => null,
                    'user_agent' => 'PianoTest/1.0 (feedback)',
                    'status' => 'new',
                ],
                [
                    'kind' => 'idea',
                    'section' => null,
                    'subject' => null,
                    'message' => 'No address, please.',
                    'contact_email' => null,
                    'user_id' => LEARNER,
                    'page' => null,
                    'language' => null,
                    'user_agent' => 'PianoTest/1.0 (feedback)',
                    'status' => 'new',
                ],
                [
                    'kind' => 'other',
                    'section' => null,
                    'subject' => null,
                    'message' => 'Thank you.',
                    'contact_email' => null,
                    'user_id' => null,
                    'page' => null,
                    'language' => null,
                    'user_agent' => 'PianoTest/1.0 (feedback)',
                    'status' => 'new',
                ],
                [
                    'kind' => 'bug',
                    'section' => null,
                    'subject' => null,
                    'message' => 'From the administrator, honestly.',
                    'contact_email' => null,
                    'user_id' => null,
                    'page' => null,
                    'language' => null,
                    'user_agent' => 'PianoTest/1.0 (feedback)',
                    'status' => 'new',
                ],
            ],
            array_map(
                static fn(array $row): array => array_replace($row, ['user_id' => $row['user_id'] === null ? null : (int) $row['user_id']]),
                dbAll('SELECT kind, section, subject, message, contact_email, user_id, page, language, user_agent, status FROM anotoki_feedback ORDER BY id'),
            ),
        );
        // Nothing of where a message came from: no column for it at all.
        $columns = array_column(dbAll("SELECT column_name FROM information_schema.columns WHERE table_name = 'anotoki_feedback'"), 'column_name');
        assert_same([], array_values(array_filter($columns, static fn(string $column): bool => (bool) preg_match('/ip|address|client|hash/', $column))), 'no address, no hash of one');

        // Five an hour from one sender. Nobody's - a visitor's, by their address - the reader's, "without my name" (counted
        // as a visitor's) and the honest one so far: the fourth and the fifth kept, the sixth refused, with when to try again.
        foreach (['The fourth.', 'The fifth.'] as $words) {
            assert_same(201, ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => $words], $browser)['status'], $words);
        }
        $sixth = ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'The sixth.'], $browser);
        assert_same([429, 'too_many'], [$sixth['status'], $sixth['body']['code'] ?? null]);
        assert_true(($sixth['body']['retry_after'] ?? 0) > 0, 'when to try again');
        // The learner, from the same address, is counted by their account, apart: two so far, three more, then refused.
        foreach (['A third from me.', 'A fourth from me.', 'A fifth from me.'] as $words) {
            assert_same(201, ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => $words], $learner)['status'], $words);
        }
        $mine = ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'A sixth from me.'], $learner);
        assert_same([429, 'too_many'], [$mine['status'], $mine['body']['code'] ?? null], 'five an hour from one account');
        assert_same(10, (int) dbValue('SELECT count(*) FROM anotoki_feedback'));
        $limits = (string) file_get_contents(storage() . '/cache/anotoki-feedback-limits.json');
        assert_no_match('/127\.0\.0\.1|"' . LEARNER . '"|account:/', $limits, 'the limits keep keyed hashes of the senders, never an address or an id');

        // The admin side: how many are new (the navigation's badge), the list with the learner's name, a message opened.
        assert_same(['unread' => 10], as_admin('GET', '/api/admin/feedback/unread')['body']);
        $list = as_admin('GET', '/api/admin/feedback')['body'];
        assert_same([10, 25], [$list['total'], $list['pageSize']]);
        $theirs = array_values(array_filter($list['items'], static fn(array $item): bool => $item['user_id'] === LEARNER));
        assert_same(['user' . LEARNER], array_values(array_unique(array_column($theirs, 'user_name'))), 'named as this app knows them');
        assert_same(['Note Trainer', 'Songs'], array_values(array_intersect(FEEDBACK_SECTIONS, array_column($list['items'], 'section'))));
        $id = (int) dbValue("SELECT id FROM anotoki_feedback WHERE message = 'More songs, please.'");
        // Opening one only reads it (anotoki-lib 0.8.1); the page marks a new one read by a PUT of its own.
        assert_same('new', as_admin('GET', "/api/admin/feedback/$id")['body']['message']['status'], 'opened: still new');
        assert_same(['unread' => 10], as_admin('GET', '/api/admin/feedback/unread')['body'], 'a GET marks nothing read');
        assert_same('read', as_admin('PUT', "/api/admin/feedback/$id/read", new stdClass())['body']['message']['status'] ?? null, 'marked read by its own write');
        assert_same(['unread' => 9], as_admin('GET', '/api/admin/feedback/unread')['body']);

        // Resolved, then deleted: each audited, by the administrator - the delete with the time the message was sent (a
        // restore does it again by both), inside the delete's own transaction.
        $resolved = as_admin('PUT', "/api/admin/feedback/$id/status", ['status' => 'resolved']);
        assert_same(['resolved', ADMIN], [$resolved['body']['message']['status'] ?? null, $resolved['body']['message']['handled_by'] ?? null]);
        $unknown = as_admin('PUT', "/api/admin/feedback/$id/status", ['status' => 'gone']);
        assert_same([422, 'status_unknown'], [$unknown['status'], $unknown['body']['code'] ?? null]);
        assert_json_same([[ADMIN, 'feedback', (string) $id, ['from' => 'read', 'to' => 'resolved']]], audited('feedback.status_changed'));
        $spam = dbOne("SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS sent FROM anotoki_feedback WHERE message = 'From the administrator, honestly.'");
        $spamId = (int) $spam['id'];
        assert_same(['deleted' => true], as_admin('DELETE', "/api/admin/feedback/$spamId")['body']);
        $deleted = audited('feedback.deleted');
        assert_same([[ADMIN, 'feedback', (string) $spamId]], array_map(static fn(array $entry): array => array_slice($entry, 0, 3), $deleted));
        assert_same(['bug', 'new'], [$deleted[0][3]['kind'] ?? null, $deleted[0][3]['status'] ?? null]);
        assert_true(is_string($deleted[0][3]['created_at'] ?? null) && str_starts_with($spam['sent'], substr($deleted[0][3]['created_at'], 0, 19)), 'when it was sent: ' . test_show($deleted[0][3]));
        assert_match('/^\d+$/', (string) ($deleted[0][3]['_txid'] ?? ''), 'the delete\'s own transaction');
        assert_same([404, 'not_found'], [as_admin('DELETE', "/api/admin/feedback/$spamId")['status'], as_admin('GET', "/api/admin/feedback/$spamId")['body']['code'] ?? null], 'gone');
        assert_same(['unread' => 8], as_admin('GET', '/api/admin/feedback/unread')['body']);
    },
);

test('the audit log: who did what, by the name this app keeps of them - and the filter by a name or an id', function (): void {
    // The administrator signs in to the words' page once: their users row, and so their name.
    assert_same(200, as_admin('GET', '/api/admin/translations')['status']);
    $page = as_admin('GET', '/api/admin/audit');
    assert_same(200, $page['status']);
    assert_same(50, $page['body']['pageSize']);
    $actions = array_column($page['body']['items'], 'action');
    foreach (['backup.created', 'errors.cleared', 'feedback.status_changed', 'feedback.deleted'] as $action) {
        assert_true(in_array($action, $actions, true), "$action is in the list");
    }
    $byAdmin = array_values(array_filter($page['body']['items'], static fn(array $item): bool => $item['actor_id'] === ADMIN));
    assert_same(['user' . ADMIN], array_values(array_unique(array_column($byAdmin, 'actor_username'))), 'named as this app knows them');
    $byNobody = array_values(array_filter($page['body']['items'], static fn(array $item): bool => $item['actor_id'] === null));
    assert_same([null], array_values(array_unique(array_column($byNobody, 'actor_username'))), 'the daily backup: nobody');
    foreach ($page['body']['items'] as $item) {
        assert_same(null, $item['ip'] ?? null, 'never an address');
    }

    // The filter by a name (any case) or an id; and by an action's beginning.
    foreach (['USER' . ADMIN, (string) ADMIN] as $actor) {
        $mine = as_admin('GET', '/api/admin/audit?actor=' . rawurlencode($actor))['body'];
        assert_same([ADMIN], array_values(array_unique(array_column($mine['items'], 'actor_id'))), "actor=$actor");
    }
    assert_same(['feedback.deleted', 'feedback.status_changed'], array_values(array_unique(array_column(as_admin('GET', '/api/admin/audit?action=feedback.')['body']['items'], 'action'))));
    $facets = as_admin('GET', '/api/admin/audit/facets')['body'];
    assert_true(in_array(['id' => ADMIN, 'username' => 'user' . ADMIN], $facets['actors'] ?? [], true), test_show($facets['actors'] ?? null));
});

test(
    'backups: made, downloaded once, restored and deleted only after a sign-in of the last ten minutes - each audited; a restore brings the database back as it was, a backup of what was there first',
    function (): void {
        assert_same(['kind' => 'recent_sign_in'], as_admin('GET', '/api/admin/backups/proof')['body'], 'what the page asks for: Sign in again');

        // A sign-in an hour old proves nothing: refused, nothing made.
        $old = ['auth_time' => time() - 3600];
        $stale = as_admin('POST', '/api/admin/backups', ['description' => 'Stale'], $old);
        assert_same([403, 'reauth_required'], [$stale['status'], $stale['body']['code'] ?? null]);
        assert_same([], backup_files('manual'));

        // A tab of the learner's, open since before the backup: in the backup with the generation it has now. (A
        // visitor's row is the last test's: see there.)
        $tab = ask('GET', '/api/state', null, bearer(token_for(LEARNER)));
        assert_same(200, $tab['status']);
        $tabGeneration = (int) $tab['body']['generation'];

        // Signed in just now: made, audited by the administrator - sealed by this installation, its maker named.
        $made = as_admin('POST', '/api/admin/backups', ['description' => 'Before the test']);
        assert_same(201, $made['status'], test_show($made['body']));
        $backup = $made['body']['backup'];
        assert_match('/^\d{8}-\d{6}Z-manual-[0-9a-f]{32}$/D', $backup['id']);
        assert_same(['manual', 'Before the test', ADMIN], [$backup['kind'], $backup['description'], $backup['created_by']]);
        assert_same([$backup['id'] . '.anotoki-backup'], backup_files('manual'));
        assert_same([ADMIN, 'backup', $backup['id']], array_slice(audited('backup.created')[1] ?? [], 0, 3));
        $id = $backup['id'];
        $listed = array_values(array_filter(as_admin('GET', '/api/admin/backups')['body']['backups'], static fn(array $each): bool => $each['id'] === $id));
        assert_same([true, 'user' . ADMIN], [$listed[0]['sealed'] ?? null, $listed[0]['created_by_name'] ?? null], 'sealed here; "By" the administrator\'s name - ' . test_show($listed));

        // Downloaded: a single-use link, behind the same proof; the file itself needs no token - the ticket is the check.
        assert_same(
            [403, 'reauth_required'],
            [as_admin('POST', "/api/admin/backups/$id/ticket", new stdClass(), $old)['status'], as_admin('POST', "/api/admin/backups/$id/ticket", new stdClass(), $old)['body']['code'] ?? null],
        );
        $ticket = as_admin('POST', "/api/admin/backups/$id/ticket", new stdClass());
        assert_same(200, $ticket['status']);
        assert_same(60, $ticket['body']['expires_in']);
        assert_match('~^/api/admin/backups/' . $id . '/file\?ticket=[A-Za-z0-9_-]+$~D', $ticket['body']['url']);
        $file = ask('GET', $ticket['body']['url']);
        assert_same(200, $file['status']);
        assert_true(str_starts_with($file['raw'], "ANOTOKI-BACKUP 1\n"), 'the archive');
        assert_same(
            ['attachment; filename="piano-academy-' . $id . '.anotoki-backup"', 'no-store', 'nosniff'],
            [$file['headers']['content-disposition'] ?? null, $file['headers']['cache-control'] ?? null, $file['headers']['x-content-type-options'] ?? null],
        );
        $again = ask('GET', $ticket['body']['url']);
        assert_same([403, 'ticket_invalid'], [$again['status'], $again['body']['code'] ?? null], 'good once');
        assert_same(403, ask('GET', "/api/admin/backups/$id/file?ticket=" . str_repeat('A', 43))['status'], 'a made-up ticket');
        assert_same([[ADMIN, 'backup', $id]], array_map(static fn(array $entry): array => array_slice($entry, 0, 3), audited('backup.downloaded')));

        // Somebody's progress changes after the backup; a restore brings it back - all of it, as it was.
        $file = ['format' => 'piano-academy-export', 'version' => 1, 'progress' => ['60' => ['midi' => 60]], 'path' => ['steps' => new stdClass()], 'sessions' => []];
        $progressBefore = dbAll('SELECT user_id, notes::text AS notes FROM progress ORDER BY user_id');
        assert_same(200, ask('POST', '/api/me/import?replace=true', $file, bearer(token_for(EDITOR)))['status'], 'progress for the editor, after the backup');
        // The learner practises on in the tab of before: an ordinary save keeps the generation.
        $practice = ['60' => ['midi' => 60], '64' => ['midi' => 64]];
        $tabSave = static fn(): array => ask('PUT', '/api/progress', $practice, array_merge(bearer(token_for(LEARNER)), ['Progress-Generation: ' . $tabGeneration]));
        assert_same(204, $tabSave()['status'], 'the learner\'s save after the backup');
        $handedOut = (int) dbValue('SELECT last_value FROM progress_generation');
        $feedbackBefore = (int) dbValue('SELECT count(*) FROM anotoki_feedback');
        dbExec("DELETE FROM anotoki_feedback WHERE kind = 'other'");
        $preview = as_admin('GET', "/api/admin/backups/$id/preview");
        assert_same([200, true], [$preview['status'], $preview['body']['restorable']]);
        assert_true($preview['body']['lost'] >= 1, 'what the restore would take away: the editor\'s rows');

        assert_same(
            [422, 'confirm_mismatch'],
            [
                as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => 'abcdef'])['status'],
                as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => 'abcdef'])['body']['code'] ?? null,
            ],
        );
        $staleRestore = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)], $old);
        assert_same([403, 'reauth_required'], [$staleRestore['status'], $staleRestore['body']['code'] ?? null]);
        $auditBefore = (int) dbValue('SELECT count(*) FROM anotoki_audit_log');
        $restored = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
        assert_same(200, $restored['status'], test_show($restored['body']));
        assert_same([$id, null], [$restored['body']['restored'], $restored['body']['after_restore_error']]);
        assert_same($progressBefore, dbAll('SELECT user_id, notes::text AS notes FROM progress ORDER BY user_id'), 'the progress as it was at the backup - the editor\'s later one gone');
        assert_same($feedbackBefore, (int) dbValue('SELECT count(*) FROM anotoki_feedback'), 'the feedback as it was');
        // A backup of what was there first; the audit log is never restored - the restore is in it.
        assert_same([$restored['body']['before_restore'] . '.anotoki-backup'], backup_files('before-restore'));
        assert_true((int) dbValue('SELECT count(*) FROM anotoki_audit_log') > $auditBefore, 'the audit log kept what came after the backup');
        assert_same([[ADMIN, 'backup', $id]], array_map(static fn(array $entry): array => array_slice($entry, 0, 3), audited('backup.restored')));

        // Every progress took a new generation, past every number handed out - inside the restore, before anybody saw the
        // rows: the restore put the learner's row back to the backup's day, and the tab of before holds that number again.
        // Its next save is refused (409), never written over what was restored; the next import's number is one nobody holds
        // (the library's restore never moves a sequence back).
        $generations = array_map('intval', array_column(dbAll('SELECT progress_generation FROM users ORDER BY id'), 'progress_generation'));
        assert_true(count($generations) >= 2 && min($generations) > $handedOut, 'every users row a new generation, past ' . $handedOut . ': ' . implode(', ', $generations));
        assert_same(count($generations), count(array_unique($generations)), 'no two the same');
        $refused = $tabSave();
        assert_same([409, 'progress_changed'], [$refused['status'], $refused['body']['code'] ?? null], 'the tab of before the restore: refused');
        assert_same($progressBefore, dbAll('SELECT user_id, notes::text AS notes FROM progress ORDER BY user_id'), 'nothing of it saved over what was restored');
        $next = ask('POST', '/api/me/import?replace=true', $file, bearer(token_for(EDITOR)));
        assert_true($next['status'] === 200 && $next['body']['generation'] > max($generations), 'the next import: a number nobody held - ' . test_show($next['body']));
        assert_same(200, ask('GET', '/api/state', null, bearer(token_for(LEARNER)))['status'], 'the app works on it');

        // Deleted, behind the proof too: gone, audited.
        assert_same(
            [403, 'reauth_required'],
            [as_admin('DELETE', "/api/admin/backups/$id", new stdClass(), $old)['status'], as_admin('DELETE', "/api/admin/backups/$id", new stdClass(), $old)['body']['code'] ?? null],
        );
        assert_same(['deleted' => true], as_admin('DELETE', "/api/admin/backups/$id", new stdClass())['body']);
        assert_same([], backup_files('manual'));
        assert_same([[ADMIN, 'backup', $id]], array_map(static fn(array $entry): array => array_slice($entry, 0, 3), audited('backup.deleted')));
        assert_same([404, 'not_found'], [as_admin('GET', "/api/admin/backups/$id")['status'], as_admin('GET', "/api/admin/backups/$id")['body']['code'] ?? null]);
        assert_true(is_file(storage() . '/backups/.htaccess'), 'the folder is guarded');
    },
);

test(
    'the people\'s scrub: an account the IAM deleted is blanked here - its placeholder name, when - its progress kept, a feedback message\'s address and browser forgotten, and no later request revives it; the People page\'s search and pages',
    function (): void {
        // The learner has progress and a feedback message (the test before).
        $file = ['format' => 'piano-academy-export', 'version' => 1, 'progress' => ['60' => ['midi' => 60], '62' => ['midi' => 62]], 'path' => ['steps' => new stdClass()], 'sessions' => []];
        assert_same(200, ask('POST', '/api/me/import?replace=true', $file, bearer(token_for(LEARNER)))['status']);
        $progress = dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [LEARNER]);
        $messages = static fn(): array => dbAll('SELECT message, contact_email, user_agent FROM anotoki_feedback WHERE user_id = ? ORDER BY id', [LEARNER]);
        $theirs = $messages();
        assert_same(['More songs, please.', 'user3@example.test', 'PianoTest/1.0 (feedback)'], array_values($theirs[0]));

        // The IAM deleted the learner's account; an administrator asks for the scrub now.
        test_anonymized($GLOBALS['auth'], [LEARNER => '2026-10-10T09:30:00Z']);
        $sync = as_admin('POST', '/api/admin/people/sync');
        assert_same(200, $sync['status'], test_show($sync['body']));
        assert_same(['done', 1, 1], [$sync['body']['run']['state'], $sync['body']['run']['handled'], $sync['body']['run']['scrubbed']]);
        assert_same(1, $sync['body']['sync']['scrubbed']);

        $row = dbOne("SELECT preferred_username, to_char(anonymized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS anonymized_at FROM users WHERE id = ?", [LEARNER]);
        assert_same(['preferred_username' => 'deleted-' . LEARNER, 'anonymized_at' => '2026-10-10T09:30:00Z'], $row, 'the IAM\'s placeholder name, and when');
        assert_same($progress, dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [LEARNER]), 'the progress stays - nobody\'s now');
        assert_same(
            array_map(static fn(array $message): array => ['message' => $message['message'], 'contact_email' => null, 'user_agent' => null], $theirs),
            $messages(),
            'the address and the browser forgotten, the words stay - every message of theirs',
        );
        assert_json_same([[ADMIN, null, null, ['state' => 'done', 'handled' => 1, 'scrubbed' => 1]]], audited('people.synced'));

        // A later request with an old token of theirs revives nothing.
        assert_same(200, ask('GET', '/api/state', null, bearer(token_for(LEARNER)))['status']);
        assert_same('deleted-' . LEARNER, dbValue('SELECT preferred_username FROM users WHERE id = ?', [LEARNER]), 'never revived');

        // The People page: the account under its placeholder, when the IAM deleted it.
        $people = as_admin('GET', '/api/admin/people?q=' . LEARNER)['body'];
        assert_same(
            [(string) LEARNER, 'deleted-' . LEARNER, '2026-10-10T09:30:00Z', 2],
            [$people['people'][0]['sub'] ?? null, $people['people'][0]['name'] ?? null, $people['people'][0]['anonymized_at'] ?? null, $people['people'][0]['notes'] ?? null],
        );
        assert_same(1, $people['sync']['scrubbed']);

        // Pages of 50, the most recently seen first; a search by a name, any case.
        for ($id = 100; $id < 160; $id++) {
            dbExec('INSERT INTO users (id, preferred_username, last_seen_at) VALUES (?, ?, now() - make_interval(days => 30))', [$id, "pupil-$id"]);
        }
        $total = (int) dbValue('SELECT count(*) FROM users WHERE id > 0');
        $first = as_admin('GET', '/api/admin/people')['body'];
        $second = as_admin('GET', '/api/admin/people?page=2')['body'];
        assert_same([$total, 50, 50, $total - 50], [$first['total'], $first['page_size'], count($first['people']), count($second['people'])]);
        assert_same([], array_values(array_intersect(array_column($first['people'], 'sub'), array_column($second['people'], 'sub'))), 'no one on both');
        $found = as_admin('GET', '/api/admin/people?q=PUPIL-11')['body'];
        assert_same(
            [10, ['110', '111', '112', '113', '114', '115', '116', '117', '118', '119']],
            [$found['total'], in_order_strings(array_column($found['people'], 'sub'))],
            'any case, anywhere in the name',
        );
        $odd = as_admin('GET', '/api/admin/people?q=' . rawurlencode("a\0b"));
        assert_same([422, 'invalid_query'], [$odd['status'], $odd['body']['code'] ?? null]);
    },
);

/** A list of ids as text, in the order of their numbers. */
function in_order_strings(array $ids): array
{
    $ids = array_values(array_unique(array_map('strval', $ids)));
    sort($ids, SORT_NUMERIC);

    return $ids;
}

test('a restore runs the scrub of the IAM\'s deleted accounts before it answers - and one that cannot finish says so, the next request trying again', function (): void {
    // Somebody who signed in, in a backup made while the IAM still had their account.
    $who = 6;
    assert_same(200, ask('GET', '/api/state', null, bearer(test_token($who)))['status']);
    $made = as_admin('POST', '/api/admin/backups', ['description' => 'Before the IAM deleted 6']);
    assert_same(201, $made['status'], test_show($made['body']));
    $id = $made['body']['backup']['id'];
    $name = static fn(): ?string => dbValue('SELECT preferred_username FROM users WHERE id = ?', [$who]);
    assert_same('user6', $name());

    // The IAM deletes the account; the scrub blanks it here.
    test_anonymized($GLOBALS['auth'], [LEARNER => '2026-10-10T09:30:00Z', $who => '2026-10-11T08:00:00Z']);
    assert_same('done', as_admin('POST', '/api/admin/people/sync')['body']['run']['state'] ?? null);
    assert_same('deleted-6', $name());

    // The backup brings the name back - and the restore runs the scrub again before it answers.
    $restored = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
    assert_same([200, true, null], [$restored['status'], array_key_exists('after_restore_error', $restored['body']), $restored['body']['after_restore_error'] ?? null], test_show($restored['body']));
    assert_same('deleted-6', $name(), 'scrubbed again by the time the restore answered');

    // The IAM out of reach: the restore stands and says the scrub did not finish - and the hourly upkeep's stamp
    // goes after its answer, so the next request tries again instead of an hour later.
    $list = $GLOBALS['auth']['anonymized_file'];
    rename($list, "$list.away");
    touch($GLOBALS['auth']['cache_dir'] . '/' . \Anotoki\Lib\People\Http\PeopleUpkeep::STAMP);
    $logged = count(error_lines());
    $again = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
    $why = array_column(array_slice(error_lines(), $logged), 'message');
    // Back before anything can stop this test: the tests after it read the IAM's list too.
    rename("$list.away", $list);
    assert_same(200, $again['status'], test_show($again['body']));
    // The answer says it in the library's fixed sentence (anotoki-lib 0.6.0: no answer carries a failure's own words);
    // what did not go through, and why, is the error log's - where the site's ADMIN reads it.
    assert_same('What this site does after a restore did not all go through. The error log says what.', $again['body']['after_restore_error'] ?? null);
    assert_true((bool) preg_grep('/^The accounts the IAM deleted were not checked again \(the IAM could not be reached\)/', $why), 'why, in the error log: ' . test_show($why));
    assert_same('user6', $name(), 'named again until the scrub runs');
    assert_same(200, ask('GET', '/api/health')['status'], 'the next request: its upkeep finds no stamp, and scrubs after its answer');
    assert_same(200, ask('GET', '/api/health')['status'], 'one request at a time: the one before has finished');
    assert_same('deleted-6', $name(), 'the next request scrubbed it');
});

/** Everything the app keeps of one person, as counts of rows. */
function rows_kept(int $user): array
{
    $counts = [];
    foreach (['users' => 'id', 'progress' => 'user_id', 'path_progress' => 'user_id', 'sessions' => 'user_id', 'imports' => 'user_id'] as $table => $column) {
        $counts[$table] = (int) dbValue("SELECT count(*) FROM $table WHERE $column = ?", [$user]);
    }

    return $counts;
}

test(
    'a restore does again every delete made since its backup - a person\'s on the People page, on the restore\'s own connection, and a feedback message\'s - and none made before it',
    function (): void {
        $file = static fn(array $notes): array => [
            'format' => 'piano-academy-export',
            'version' => 1,
            'progress' => $notes,
            'path' => ['steps' => ['rh-1/meet' => ['attempts' => 1]]],
            'sessions' => [['mode' => 'trainer', 'attempts' => 2, 'correct' => 2, 'accuracy' => 100]],
        ];
        [$goes, $stays, $cameBack] = [8, 9, 10];
        foreach ([$goes, $stays, $cameBack] as $user) {
            assert_same(200, ask('POST', '/api/me/import?replace=true', $file(['60' => ['midi' => 60]]), bearer(test_token($user)))['status'], "progress for $user");
        }
        // The one who goes sent feedback, with the address the form wrote in; somebody else's message goes too. (Both
        // signed in: this address's visitors spent their hour's five in the feedback test.)
        assert_same(
            201,
            ask(
                'POST',
                '/api/feedback',
                ['kind' => 'idea', 'message' => 'Eight was here.', 'email' => 'user8@example.test'],
                array_merge(['User-Agent: PianoTest/1.0 (replay)'], bearer(test_token($goes))),
            )['status'],
        );
        assert_same(
            201,
            ask('POST', '/api/feedback', ['kind' => 'bug', 'message' => 'Delete me after the backup.'], array_merge(['User-Agent: PianoTest/1.0 (replay)'], bearer(test_token($stays))))['status'],
        );
        $goner = (int) dbValue("SELECT id FROM anotoki_feedback WHERE message = 'Delete me after the backup.'");

        // Deleted BEFORE the backup, then back - signed in again, a progress of their own: the backup holds the new one.
        assert_same(200, as_admin('DELETE', "/api/admin/people/$cameBack")['status']);
        assert_same(200, ask('POST', '/api/me/import?replace=true', $file(['62' => ['midi' => 62]]), bearer(test_token($cameBack)))['status']);
        $cameBackRows = rows_kept($cameBack);
        $cameBackNotes = dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [$cameBack]);

        $made = as_admin('POST', '/api/admin/backups', ['description' => 'Before the deletes']);
        assert_same(201, $made['status'], test_show($made['body']));
        $id = $made['body']['backup']['id'];
        $staysNotes = dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [$stays]);

        // After the backup: one person deleted on the People page, one message deleted on the Feedback page, and
        // somebody else practises on.
        assert_same(['users' => 1, 'progress' => 1, 'path_progress' => 1, 'sessions' => 1, 'imports' => 0], rows_kept($goes));
        $deleted = as_admin('DELETE', "/api/admin/people/$goes");
        assert_same([200, ['deleted' => ['Notes' => 1, 'Steps' => 1, 'Rounds' => 1]]], [$deleted['status'], $deleted['body']]);
        assert_same(['deleted' => true], as_admin('DELETE', "/api/admin/feedback/$goner")['body']);
        assert_same(200, ask('POST', '/api/me/import?replace=true', $file(['64' => ['midi' => 64]]), bearer(test_token($stays)))['status']);
        $entries = static fn(): int => (int) dbValue("SELECT count(*) FROM anotoki_audit_log WHERE action = 'person.data_deleted'");
        $entriesBefore = $entries();

        // The restore: the backup's rows back - and, before anybody sees them, the two deletes done again, inside its
        // transaction. The delete runs on the restore's own connection: on the app's own it would wait on the restore's
        // locks, and PostgreSQL would end the restore a minute later (500 restore_failed).
        $started = microtime(true);
        $restored = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
        $seconds = microtime(true) - $started;
        assert_same([200, null], [$restored['status'], $restored['body']['after_restore_error'] ?? null], test_show($restored['body']));
        assert_true($seconds < 20, 'it completed at once, never waiting on its own locks: ' . round($seconds, 1) . ' s');

        assert_same(['users' => 0, 'progress' => 0, 'path_progress' => 0, 'sessions' => 0, 'imports' => 0], rows_kept($goes), 'the person deleted since the backup: deleted again');
        assert_same(
            [['message' => 'Eight was here.', 'contact_email' => null, 'user_agent' => null]],
            dbAll('SELECT message, contact_email, user_agent FROM anotoki_feedback WHERE user_id = ?', [$goes]),
            'their feedback\'s address and browser forgotten again, the words kept',
        );
        assert_same(0, (int) dbValue('SELECT count(*) FROM anotoki_feedback WHERE id = ?', [$goner]), 'the message deleted since the backup: deleted again');
        assert_same($staysNotes, dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [$stays]), 'everybody else\'s progress as it was at the backup');
        assert_same(
            [$cameBackRows, $cameBackNotes],
            [rows_kept($cameBack), dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [$cameBack])],
            'a delete made before the backup is not done again: who came back keeps what they have',
        );
        assert_same($entriesBefore, $entries(), 'doing a delete again writes no entry of its own');
        assert_same(
            [[ADMIN, 'backup', $id]],
            array_map(static fn(array $entry): array => array_slice($entry, 0, 3), array_values(array_filter(audited('backup.restored'), static fn(array $entry): bool => $entry[2] === $id))),
        );

        // The app goes on: the person deleted twice signs in to an empty start.
        $fresh = ask('GET', '/api/state', null, bearer(test_token($goes)));
        assert_same([200, [], []], [$fresh['status'], $fresh['body']['progress'], $fresh['body']['sessions']]);
    },
);

test('a backup that carries no seal of this installation\'s - one made before anotoki-lib 0.5.0, or put into the folder - is listed so, and not restored here', function (): void {
    $made = as_admin('POST', '/api/admin/backups', ['description' => 'To be unsealed']);
    assert_same(201, $made['status'], test_show($made['body']));
    $id = $made['body']['backup']['id'];
    $sidecar = storage() . "/backups/$id.anotoki-backup.json";
    $info = json_decode((string) file_get_contents($sidecar), true);
    assert_true(is_string($info['seal'] ?? null), 'made here: sealed');
    unset($info['seal']);
    file_put_contents($sidecar, json_encode($info));

    $listed = array_values(array_filter(as_admin('GET', '/api/admin/backups')['body']['backups'], static fn(array $each): bool => $each['id'] === $id));
    assert_same(false, $listed[0]['sealed'] ?? null, test_show($listed));
    $users = dbAll('SELECT id, progress_generation FROM users ORDER BY id');
    $logged = count(error_lines());
    $refused = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
    assert_same([422, 'archive_invalid'], [$refused['status'], $refused['body']['code'] ?? null], test_show($refused['body']));
    // The answer is the library's fixed sentence (anotoki-lib 0.6.0); which it was - the seal - is the error log's.
    assert_match('/One not made here is restored offline/', (string) ($refused['body']['error'] ?? ''));
    $why = array_column(array_slice(error_lines(), $logged), 'message');
    assert_true((bool) preg_grep('/seal/', $why), 'why, in the error log: ' . test_show($why));
    assert_same($users, dbAll('SELECT id, progress_generation FROM users ORDER BY id'), 'nothing restored, nothing renewed');
    assert_same(['deleted' => true], as_admin('DELETE', "/api/admin/backups/$id", new stdClass())['body']);
});

test('the server said nothing it should not have', function (): void {
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[anotoki auth] token refused')));
    assert_same([], $problems);
});

// Last: once a visitor has been made, the sequence visitor_ids (counting down from -1) has been called, and every
// restore after it in this database meets it. anotoki-lib 0.5.0's restore moves each sequence on to the GREATER of
// the backup's next value and today's ("never backwards") - right for a sequence that counts up, wrong for one
// that counts down: it asks setval(visitor_ids, 0), which is out of that sequence's bounds, and the restore fails
// whole ("restore_failed ... setval: value 0 is out of bounds for sequence visitor_ids"). The library's to mend
// (a release after 0.5.0); this test holds what a restore must do here meanwhile.
test('a restore with visitors in the database: visitor_ids counts down - the visitors restored, each a new generation, the next visitor\'s id one never handed out', function (): void {
    $visitor = static fn(string $key): int => (int) dbValue("INSERT INTO users (id, visitor_key_hash) VALUES (nextval('visitor_ids'), ?) RETURNING id", [hash('sha256', $key)]);
    $first = $visitor('restore-test-1');
    $made = as_admin('POST', '/api/admin/backups', ['description' => 'With a visitor']);
    assert_same(201, $made['status'], test_show($made['body']));
    $id = $made['body']['backup']['id'];
    $later = $visitor('restore-test-2');
    $handedOut = (int) dbValue('SELECT last_value FROM progress_generation');

    $restored = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
    assert_same([200, null], [$restored['status'], $restored['body']['after_restore_error'] ?? null], test_show($restored['body']));
    assert_same(
        [1, 0],
        [(int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$first]), (int) dbValue('SELECT count(*) FROM users WHERE id = ?', [$later])],
        'the backup\'s visitor back, the later one gone',
    );
    assert_true((int) dbValue('SELECT progress_generation FROM users WHERE id = ?', [$first]) > $handedOut, 'the visitor\'s progress a new generation too');
    $next = $visitor('restore-test-3');
    assert_true($next < $later, "the next visitor's id ($next) one never handed out (below $later)");
});
