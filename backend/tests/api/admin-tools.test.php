<?php

// The admin tools of the anotoki family's library (anotoki/lib 0.4.1) as this
// app wires them (api/admin_tools.php), through the real server - who may
// reach each route (nobody 401, a learner and an editor 403, an administrator
// through) is tests/api/admin.test.php's:
//
// - backups: a daily one after the day's first good answer, once a day; one
//   made, downloaded (a single-use link), restored and deleted only after a
//   sign-in of the last ten minutes, each audited; a restore brings the
//   database back as it was, a backup of what was there first, and gives
//   every progress a new generation (a tab open since before it is refused
//   its save, never written over what was restored) and runs the scrub of
//   the IAM's deleted accounts before it answers (one that cannot finish is
//   said, and the next request tries again);
// - the error log: a 404 is a line - its route and its path, never its query,
//   an address or a token - and the log's own routes are never in it;
// - feedback: the visitors' form, open to everybody - who from the token
//   alone, never a body; nothing of where it came from kept; a robot's
//   honeypot keeps nothing; five an hour from one address - and the admin
//   page's count of what is new, a message opened made read, a status and a
//   delete audited;
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
    return test_token($user, match ($user) {
        ADMIN => [ROLE_ADMIN],
        EDITOR => [ROLE_EDITOR],
        default => [],
    }, $extra);
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
        static fn (array $row): array => [$row['actor_id'] === null ? null : (int) $row['actor_id'], $row['target_type'], $row['target_id'], json_decode((string) $row['details'], true)],
        dbAll('SELECT actor_id, target_type, target_id, details::text AS details FROM anotoki_audit_log WHERE action = ? ORDER BY id', [$action])
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
    $daily = array_values(array_filter($list['body']['backups'], static fn (array $backup): bool => $backup['kind'] === 'daily'));
    assert_same(1, count($daily), test_show($list['body']['backups']));
    assert_same($daily[0]['created_at'], $list['body']['status']['last_daily']);
    assert_same([true, true, true, false], [$list['body']['status']['copy_available'], $list['body']['status']['restore_enabled'], $list['body']['status']['restorable'], $list['body']['status']['encrypted']], 'COPY works here, restoring is on, nothing is encrypted');
    assert_same([$daily[0]['id'] . '.anotoki-backup'], backup_files('daily'));
    assert_same([[null, 'backup', $daily[0]['id']]], array_map(static fn (array $entry): array => array_slice($entry, 0, 3), audited('backup.created')), 'made by nobody, audited');

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
    $groups = array_values(array_filter($report['body']['groups'], static fn (array $group): bool => in_array('/api/no-such-thing', $group['paths'], true)));
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
    assert_same([[ADMIN, 'error_log', null]], array_map(static fn (array $entry): array => array_slice($entry, 0, 3), audited('errors.cleared')));
});

test('feedback: the form is everybody\'s - who from the token alone, nothing of where it came from, a robot\'s honeypot keeps nothing, five an hour - and the admin page counts what is new, its status and delete audited', function (): void {
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
    // The learner: their id from the token; no address typed - answered at the account's (the library's rule).
    assert_same(201, ask('POST', '/api/feedback', ['kind' => 'idea', 'section' => 'Songs', 'message' => 'More songs, please.'], array_merge($browser, bearer(token_for(LEARNER))))['status']);
    // ... "send it without my name": no id, no address, whatever was typed.
    assert_same(201, ask('POST', '/api/feedback', ['kind' => 'other', 'message' => 'Thank you.', 'anonymous' => true, 'email' => 'me@example.com'], array_merge($browser, bearer(token_for(LEARNER))))['status']);
    // A body's own say of who sent it counts for nothing.
    assert_same(201, ask('POST', '/api/feedback', ['kind' => 'bug', 'message' => 'From the administrator, honestly.', 'user_id' => ADMIN, 'id' => ADMIN], $browser)['status']);
    // A robot fills the field no person sees: the same answer, word for word, and nothing kept.
    $robot = ask('POST', '/api/feedback', ['kind' => 'bug', 'message' => 'Buy now', 'website' => 'https://spam.example'], $browser);
    assert_same([201, ['ok' => true]], [$robot['status'], $robot['body']]);

    assert_same([
        ['kind' => 'bug', 'section' => 'Note Trainer', 'subject' => 'The C key', 'message' => 'The C key sticks after a chord.', 'contact_email' => 'reader@example.com', 'user_id' => null, 'page' => '/trainer', 'language' => 'sk', 'user_agent' => 'PianoTest/1.0 (feedback)', 'status' => 'new'],
        ['kind' => 'idea', 'section' => 'Songs', 'subject' => null, 'message' => 'More songs, please.', 'contact_email' => 'user3@example.test', 'user_id' => LEARNER, 'page' => null, 'language' => null, 'user_agent' => 'PianoTest/1.0 (feedback)', 'status' => 'new'],
        ['kind' => 'other', 'section' => null, 'subject' => null, 'message' => 'Thank you.', 'contact_email' => null, 'user_id' => null, 'page' => null, 'language' => null, 'user_agent' => 'PianoTest/1.0 (feedback)', 'status' => 'new'],
        ['kind' => 'bug', 'section' => null, 'subject' => null, 'message' => 'From the administrator, honestly.', 'contact_email' => null, 'user_id' => null, 'page' => null, 'language' => null, 'user_agent' => 'PianoTest/1.0 (feedback)', 'status' => 'new'],
    ], array_map(static fn (array $row): array => array_replace($row, ['user_id' => $row['user_id'] === null ? null : (int) $row['user_id']]), dbAll('SELECT kind, section, subject, message, contact_email, user_id, page, language, user_agent, status FROM anotoki_feedback ORDER BY id')));
    // Nothing of where a message came from: no column for it at all.
    $columns = array_column(dbAll("SELECT column_name FROM information_schema.columns WHERE table_name = 'anotoki_feedback'"), 'column_name');
    assert_same([], array_values(array_filter($columns, static fn (string $column): bool => (bool) preg_match('/ip|address|client|hash/', $column))), 'no address, no hash of one');

    // Five an hour from one address: the fifth kept, the sixth refused - with when to try again.
    assert_same(201, ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'The fifth.'], $browser)['status']);
    $sixth = ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'The sixth.'], $browser);
    assert_same([429, 'too_many'], [$sixth['status'], $sixth['body']['code'] ?? null]);
    assert_true(($sixth['body']['retry_after'] ?? 0) > 0, 'when to try again');
    assert_same(5, (int) dbValue('SELECT count(*) FROM anotoki_feedback'));
    $limits = (string) file_get_contents(storage() . '/cache/anotoki-feedback-limits.json');
    assert_no_match('/127\.0\.0\.1/', $limits, 'the limits keep a keyed hash of the address, never the address');

    // The admin side: how many are new (the navigation's badge), the list with the learner's name, a message opened.
    assert_same(['unread' => 5], as_admin('GET', '/api/admin/feedback/unread')['body']);
    $list = as_admin('GET', '/api/admin/feedback')['body'];
    assert_same([5, 25], [$list['total'], $list['pageSize']]);
    $theirs = array_values(array_filter($list['items'], static fn (array $item): bool => $item['user_id'] === LEARNER));
    assert_same('user' . LEARNER, $theirs[0]['user_name'] ?? null, 'named as this app knows them');
    assert_same(['Note Trainer', 'Songs'], array_values(array_intersect(FEEDBACK_SECTIONS, array_column($list['items'], 'section'))));
    $id = (int) $theirs[0]['id'];
    assert_same('read', as_admin('GET', "/api/admin/feedback/$id")['body']['message']['status'], 'opened: read');
    assert_same(['unread' => 4], as_admin('GET', '/api/admin/feedback/unread')['body']);

    // Resolved, then deleted: each audited, by the administrator.
    $resolved = as_admin('PUT', "/api/admin/feedback/$id/status", ['status' => 'resolved']);
    assert_same(['resolved', ADMIN], [$resolved['body']['message']['status'] ?? null, $resolved['body']['message']['handled_by'] ?? null]);
    $unknown = as_admin('PUT', "/api/admin/feedback/$id/status", ['status' => 'gone']);
    assert_same([422, 'status_unknown'], [$unknown['status'], $unknown['body']['code'] ?? null]);
    assert_json_same([[ADMIN, 'feedback', (string) $id, ['from' => 'read', 'to' => 'resolved']]], audited('feedback.status_changed'));
    $spam = (int) dbValue("SELECT id FROM anotoki_feedback WHERE message = 'From the administrator, honestly.'");
    assert_same(['deleted' => true], as_admin('DELETE', "/api/admin/feedback/$spam")['body']);
    assert_json_same([[ADMIN, 'feedback', (string) $spam, ['kind' => 'bug', 'status' => 'new']]], audited('feedback.deleted'));
    assert_same([404, 'not_found'], [as_admin('DELETE', "/api/admin/feedback/$spam")['status'], as_admin('GET', "/api/admin/feedback/$spam")['body']['code'] ?? null], 'gone');
    assert_same(['unread' => 3], as_admin('GET', '/api/admin/feedback/unread')['body']);
});

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
    $byAdmin = array_values(array_filter($page['body']['items'], static fn (array $item): bool => $item['actor_id'] === ADMIN));
    assert_same(['user' . ADMIN], array_values(array_unique(array_column($byAdmin, 'actor_username'))), 'named as this app knows them');
    $byNobody = array_values(array_filter($page['body']['items'], static fn (array $item): bool => $item['actor_id'] === null));
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

test('backups: made, downloaded once, restored and deleted only after a sign-in of the last ten minutes - each audited; a restore brings the database back as it was, a backup of what was there first', function (): void {
    assert_same(['kind' => 'recent_sign_in'], as_admin('GET', '/api/admin/backups/proof')['body'], 'what the page asks for: Sign in again');

    // A sign-in an hour old proves nothing: refused, nothing made.
    $old = ['auth_time' => time() - 3600];
    $stale = as_admin('POST', '/api/admin/backups', ['description' => 'Stale'], $old);
    assert_same([403, 'reauth_required'], [$stale['status'], $stale['body']['code'] ?? null]);
    assert_same([], backup_files('manual'));

    // A tab of the learner's, open since before the backup, and a visitor's row (practising without signing in):
    // both in the backup with the generations they have now.
    $tab = ask('GET', '/api/state', null, bearer(token_for(LEARNER)));
    assert_same(200, $tab['status']);
    $tabGeneration = (int) $tab['body']['generation'];
    $visitor = (int) dbValue("INSERT INTO users (id, visitor_key_hash) VALUES (nextval('visitor_ids'), ?) RETURNING id", [hash('sha256', 'restore-test')]);

    // Signed in just now: made, audited by the administrator.
    $made = as_admin('POST', '/api/admin/backups', ['description' => 'Before the test']);
    assert_same(201, $made['status'], test_show($made['body']));
    $backup = $made['body']['backup'];
    assert_match('/^\d{8}-\d{6}Z-manual-[0-9a-f]{32}$/D', $backup['id']);
    assert_same(['manual', 'Before the test', ADMIN], [$backup['kind'], $backup['description'], $backup['created_by']]);
    assert_same([$backup['id'] . '.anotoki-backup'], backup_files('manual'));
    assert_same([ADMIN, 'backup', $backup['id']], array_slice(audited('backup.created')[1] ?? [], 0, 3));
    $id = $backup['id'];

    // Downloaded: a single-use link, behind the same proof; the file itself needs no token - the ticket is the check.
    assert_same([403, 'reauth_required'], [as_admin('POST', "/api/admin/backups/$id/ticket", new stdClass(), $old)['status'], as_admin('POST', "/api/admin/backups/$id/ticket", new stdClass(), $old)['body']['code'] ?? null]);
    $ticket = as_admin('POST', "/api/admin/backups/$id/ticket", new stdClass());
    assert_same(200, $ticket['status']);
    assert_same(60, $ticket['body']['expires_in']);
    assert_match('~^/api/admin/backups/' . $id . '/file\?ticket=[A-Za-z0-9_-]+$~D', $ticket['body']['url']);
    $file = ask('GET', $ticket['body']['url']);
    assert_same(200, $file['status']);
    assert_true(str_starts_with($file['raw'], "ANOTOKI-BACKUP 1\n"), 'the archive');
    assert_same(['attachment; filename="piano-academy-' . $id . '.anotoki-backup"', 'no-store', 'nosniff'], [$file['headers']['content-disposition'] ?? null, $file['headers']['cache-control'] ?? null, $file['headers']['x-content-type-options'] ?? null]);
    $again = ask('GET', $ticket['body']['url']);
    assert_same([403, 'ticket_invalid'], [$again['status'], $again['body']['code'] ?? null], 'good once');
    assert_same(403, ask('GET', "/api/admin/backups/$id/file?ticket=" . str_repeat('A', 43))['status'], 'a made-up ticket');
    assert_same([[ADMIN, 'backup', $id]], array_map(static fn (array $entry): array => array_slice($entry, 0, 3), audited('backup.downloaded')));

    // Somebody's progress changes after the backup; a restore brings it back - all of it, as it was.
    $file = ['format' => 'piano-academy-export', 'version' => 1, 'progress' => ['60' => ['midi' => 60]], 'path' => ['steps' => new stdClass()], 'sessions' => []];
    $progressBefore = dbAll('SELECT user_id, notes::text AS notes FROM progress ORDER BY user_id');
    assert_same(200, ask('POST', '/api/me/import?replace=true', $file, bearer(token_for(EDITOR)))['status'], 'progress for the editor, after the backup');
    // The learner practises on in the tab of before: an ordinary save keeps the generation.
    $practice = ['60' => ['midi' => 60], '64' => ['midi' => 64]];
    $tabSave = static fn (): array => ask('PUT', '/api/progress', $practice, array_merge(bearer(token_for(LEARNER)), ['Progress-Generation: ' . $tabGeneration]));
    assert_same(204, $tabSave()['status'], 'the learner\'s save after the backup');
    $handedOut = (int) dbValue('SELECT last_value FROM progress_generation');
    $feedbackBefore = (int) dbValue('SELECT count(*) FROM anotoki_feedback');
    dbExec("DELETE FROM anotoki_feedback WHERE kind = 'other'");
    $preview = as_admin('GET', "/api/admin/backups/$id/preview");
    assert_same([200, true], [$preview['status'], $preview['body']['restorable']]);
    assert_true($preview['body']['lost'] >= 1, 'what the restore would take away: the editor\'s rows');

    assert_same([422, 'confirm_mismatch'], [as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => 'abcdef'])['status'], as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => 'abcdef'])['body']['code'] ?? null]);
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
    assert_same([[ADMIN, 'backup', $id]], array_map(static fn (array $entry): array => array_slice($entry, 0, 3), audited('backup.restored')));

    // Every progress - the visitor's too - took a new generation, past every number handed out: the restore put the
    // learner's row and the sequence back to the backup's day, and the tab of before holds that number again. Its next
    // save is refused (409), never written over what was restored; the next import's number is one nobody holds.
    $generations = array_map('intval', array_column(dbAll('SELECT progress_generation FROM users ORDER BY id'), 'progress_generation'));
    assert_true(count($generations) > 2 && min($generations) > $handedOut, 'every users row a new generation, past ' . $handedOut . ': ' . implode(', ', $generations));
    assert_true((int) dbValue('SELECT progress_generation FROM users WHERE id = ?', [$visitor]) > $handedOut, 'the visitor\'s too');
    assert_same(count($generations), count(array_unique($generations)), 'no two the same');
    $refused = $tabSave();
    assert_same([409, 'progress_changed'], [$refused['status'], $refused['body']['code'] ?? null], 'the tab of before the restore: refused');
    assert_same($progressBefore, dbAll('SELECT user_id, notes::text AS notes FROM progress ORDER BY user_id'), 'nothing of it saved over what was restored');
    $next = ask('POST', '/api/me/import?replace=true', $file, bearer(token_for(EDITOR)));
    assert_true($next['status'] === 200 && $next['body']['generation'] > max($generations), 'the next import: a number nobody held - ' . test_show($next['body']));
    assert_same(200, ask('GET', '/api/state', null, bearer(token_for(LEARNER)))['status'], 'the app works on it');

    // Deleted, behind the proof too: gone, audited.
    assert_same([403, 'reauth_required'], [as_admin('DELETE', "/api/admin/backups/$id", new stdClass(), $old)['status'], as_admin('DELETE', "/api/admin/backups/$id", new stdClass(), $old)['body']['code'] ?? null]);
    assert_same(['deleted' => true], as_admin('DELETE', "/api/admin/backups/$id", new stdClass())['body']);
    assert_same([], backup_files('manual'));
    assert_same([[ADMIN, 'backup', $id]], array_map(static fn (array $entry): array => array_slice($entry, 0, 3), audited('backup.deleted')));
    assert_same([404, 'not_found'], [as_admin('GET', "/api/admin/backups/$id")['status'], as_admin('GET', "/api/admin/backups/$id")['body']['code'] ?? null]);
    assert_true(is_file(storage() . '/backups/.htaccess'), 'the folder is guarded');
});

test('the people\'s scrub: an account the IAM deleted is blanked here - its placeholder name, when - its progress kept, a feedback message\'s address and browser forgotten, and no later request revives it; the People page\'s search and pages', function (): void {
    // The learner has progress and a feedback message (the test before).
    $file = ['format' => 'piano-academy-export', 'version' => 1, 'progress' => ['60' => ['midi' => 60], '62' => ['midi' => 62]], 'path' => ['steps' => new stdClass()], 'sessions' => []];
    assert_same(200, ask('POST', '/api/me/import?replace=true', $file, bearer(token_for(LEARNER)))['status']);
    $progress = dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [LEARNER]);
    $message = dbOne('SELECT message, contact_email, user_agent FROM anotoki_feedback WHERE user_id = ?', [LEARNER]);
    assert_same(['More songs, please.', 'user3@example.test', 'PianoTest/1.0 (feedback)'], [$message['message'], $message['contact_email'], $message['user_agent']]);

    // The IAM deleted the learner's account; an administrator asks for the scrub now.
    test_anonymized($GLOBALS['auth'], [LEARNER => '2026-10-10T09:30:00Z']);
    $sync = as_admin('POST', '/api/admin/people/sync');
    assert_same(200, $sync['status'], test_show($sync['body']));
    assert_same(['done', 1, 1], [$sync['body']['run']['state'], $sync['body']['run']['handled'], $sync['body']['run']['scrubbed']]);
    assert_same(1, $sync['body']['sync']['scrubbed']);

    $row = dbOne("SELECT preferred_username, to_char(anonymized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS anonymized_at FROM users WHERE id = ?", [LEARNER]);
    assert_same(['preferred_username' => 'deleted-' . LEARNER, 'anonymized_at' => '2026-10-10T09:30:00Z'], $row, 'the IAM\'s placeholder name, and when');
    assert_same($progress, dbValue('SELECT notes::text FROM progress WHERE user_id = ?', [LEARNER]), 'the progress stays - nobody\'s now');
    assert_same(['More songs, please.', null, null], array_values(dbOne('SELECT message, contact_email, user_agent FROM anotoki_feedback WHERE user_id = ?', [LEARNER])), 'the address and the browser forgotten, the words stay');
    assert_json_same([[ADMIN, null, null, ['state' => 'done', 'handled' => 1, 'scrubbed' => 1]]], audited('people.synced'));

    // A later request with an old token of theirs revives nothing.
    assert_same(200, ask('GET', '/api/state', null, bearer(token_for(LEARNER)))['status']);
    assert_same('deleted-' . LEARNER, dbValue('SELECT preferred_username FROM users WHERE id = ?', [LEARNER]), 'never revived');

    // The People page: the account under its placeholder, when the IAM deleted it.
    $people = as_admin('GET', '/api/admin/people?q=' . LEARNER)['body'];
    assert_same([(string) LEARNER, 'deleted-' . LEARNER, '2026-10-10T09:30:00Z', 2], [$people['people'][0]['sub'] ?? null, $people['people'][0]['name'] ?? null, $people['people'][0]['anonymized_at'] ?? null, $people['people'][0]['notes'] ?? null]);
    assert_same(1, $people['sync']['scrubbed']);

    // Pages of 50, the most recently seen first; a search by a name, any case.
    for ($id = 100; $id < 160; $id++) {
        dbExec("INSERT INTO users (id, preferred_username, last_seen_at) VALUES (?, ?, now() - make_interval(days => 30))", [$id, "pupil-$id"]);
    }
    $total = (int) dbValue('SELECT count(*) FROM users WHERE id > 0');
    $first = as_admin('GET', '/api/admin/people')['body'];
    $second = as_admin('GET', '/api/admin/people?page=2')['body'];
    assert_same([$total, 50, 50, $total - 50], [$first['total'], $first['page_size'], count($first['people']), count($second['people'])]);
    assert_same([], array_values(array_intersect(array_column($first['people'], 'sub'), array_column($second['people'], 'sub'))), 'no one on both');
    $found = as_admin('GET', '/api/admin/people?q=PUPIL-11')['body'];
    assert_same([10, ['110', '111', '112', '113', '114', '115', '116', '117', '118', '119']], [$found['total'], in_order_strings(array_column($found['people'], 'sub'))], 'any case, anywhere in the name');
    $odd = as_admin('GET', '/api/admin/people?q=' . rawurlencode("a\0b"));
    assert_same([422, 'invalid_query'], [$odd['status'], $odd['body']['code'] ?? null]);
});

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
    $name = static fn (): ?string => dbValue('SELECT preferred_username FROM users WHERE id = ?', [$who]);
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
    $again = as_admin('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
    assert_same(200, $again['status'], test_show($again['body']));
    assert_match('/^The accounts the IAM deleted were not checked again \(the IAM could not be reached\)/', (string) ($again['body']['after_restore_error'] ?? ''));
    assert_same('user6', $name(), 'named again until the scrub runs');
    rename("$list.away", $list);
    assert_same(200, ask('GET', '/api/health')['status'], 'the next request: its upkeep finds no stamp, and scrubs after its answer');
    assert_same(200, ask('GET', '/api/health')['status'], 'one request at a time: the one before has finished');
    assert_same('deleted-6', $name(), 'the next request scrubbed it');
});

test('the server said nothing it should not have', function (): void {
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[anotoki auth] token refused')));
    assert_same([], $problems);
});
