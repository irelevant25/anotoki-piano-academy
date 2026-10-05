<?php

declare(strict_types=1);

/**
 * The people who have used the app, for an administrator (ADMIN alone:
 * GET /api/admin/people, DELETE /api/admin/people/{id} - api/routes/admin.php).
 * The only reads across people in the app; every other query on a person's
 * data is scoped to the request's own id (api/store.php).
 *
 * Deleting a person deletes everything the app keeps of them: their note
 * progress, path progress and sessions, an imports row that names them, and
 * their users row (a string they reworded stays, by nobody:
 * translations.updated_by is ON DELETE SET NULL). It takes their users row
 * first (FOR UPDATE), as an import and a save do, so a save of theirs in
 * flight waits and is then refused. Their next request makes an empty users
 * row again - with a generation no tab of theirs holds (api/store.php), so a
 * tab still open on the old progress cannot write it back.
 *
 * Visitors - somebody practising without signing in, a users row with a
 * negative id (api/visitors.php) - are not people here: the list leaves them
 * out and counts them on a line of their own (peopleVisitors()), and they
 * go by the sweep 30 days after their last visit, never from this page.
 */

/** When, as toISOString() writes it. */
const PEOPLE_TIME = "to_char(%s AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')";

/**
 * Everybody with a users row - the people who signed in, never a visitor -
 * the most recently seen first, with how much progress each has.
 *
 * @return array<array{id: int, username: ?string, firstSeen: string, lastSeen: string, notes: int, steps: int, sessions: int}>
 */
function peopleList(): array
{
    $rows = dbAll(
        'SELECT u.id, u.preferred_username, '
        . sprintf(PEOPLE_TIME, 'u.created_at') . ' AS first_seen, '
        . sprintf(PEOPLE_TIME, 'u.last_seen_at') . " AS last_seen,
            (SELECT count(*) FROM progress p, jsonb_object_keys(p.notes) WHERE p.user_id = u.id) AS notes,
            (SELECT count(*) FROM path_progress pp, jsonb_object_keys(pp.data -> 'steps') WHERE pp.user_id = u.id) AS steps,
            (SELECT count(*) FROM sessions s WHERE s.user_id = u.id) AS sessions
           FROM users u
          WHERE u.id > 0
          ORDER BY u.last_seen_at DESC, u.id"
    );

    return array_map(static fn(array $row): array => [
        'id' => (int) $row['id'],
        'username' => $row['preferred_username'],
        'firstSeen' => $row['first_seen'],
        'lastSeen' => $row['last_seen'],
        'notes' => (int) $row['notes'],
        'steps' => (int) $row['steps'],
        'sessions' => (int) $row['sessions'],
    ], $rows);
}

/**
 * Deletes everything the app keeps of one person, in one transaction. False
 * when there is nobody with that id.
 */
function peopleDelete(int $id): bool
{
    // A visitor's id (negative) is nobody's here: the route takes digits only, and this says so again.
    if ($id < 1) {
        return false;
    }

    return dbTx(static function () use ($id): bool {
        if (storeLockGeneration($id) === null) {
            return false;
        }
        foreach (STORE_PERSON_TABLES as $table) {
            dbExec("DELETE FROM $table WHERE user_id = ?", [$id]);
        }
        dbExec('DELETE FROM users WHERE id = ?', [$id]);

        return true;
    });
}

/**
 * The visitors, for the People page's line about them: how many there are now
 * and how many rounds they keep between them.
 *
 * @return array{count: int, sessions: int}
 */
function peopleVisitors(): array
{
    $row = dbOne(
        'SELECT (SELECT count(*) FROM users WHERE id < 0) AS count,
                (SELECT count(*) FROM sessions WHERE user_id < 0) AS sessions'
    );

    return ['count' => (int) $row['count'], 'sessions' => (int) $row['sessions']];
}
