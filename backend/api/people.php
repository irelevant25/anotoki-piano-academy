<?php

declare(strict_types=1);

use Anotoki\Lib\Admin\Schema as AdminSchema;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\People\Http\RecordPerson;
use Anotoki\Lib\People\People;
use Anotoki\Lib\People\PeopleColumn;
use Anotoki\Lib\People\PeopleTable;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The people who use the app - through the anotoki family's library
 * (anotoki/lib's Anotoki\Lib\People, since 0.4.1: one way for every anotoki
 * site to keep its people; 0.5.0 since 2026-10-12). This file says what is
 * Piano Academy's own: its table and columns, what the People page counts,
 * what a delete takes, and the copies of a person a scrub blanks besides
 * their name.
 *
 * - Recording: the users row of the request's person - made on their first
 *   request, the name kept to the token's preferred_username (a token without
 *   one keeps the stored name), last_seen_at at most every five minutes -
 *   before the routes that read or save their data (recordPerson(), in
 *   meddleware/auth.php's requireUser(), requireRole(), requireOwner()); never
 *   on the Migrations routes or the admin tools', which work while users
 *   waits for an update. Never a visitor's row (api/visitors.php writes
 *   those), never a row the IAM deleted, never one for an id it listed.
 * - The scrub: when the IAM deletes an account (thirty days after its owner
 *   asked), the name here becomes the IAM's placeholder (deleted-<id>) and
 *   users.anonymized_at (migration 010) its time; the progress stays,
 *   nobody's now. The library asks the IAM's list after an answer, at most
 *   once an hour (PeopleUpkeep, api/index.php), and runs this app's hook in
 *   the same transaction: a feedback message's contact address and browser
 *   go too (they are a copy of the person), its words stay.
 * - The People page (ADMIN alone - the library's PeopleRoutes guard themselves
 *   too): everybody with a users row - never a visitor - the most recently
 *   seen first, 50 a page, a search by name or IAM id, with how much progress
 *   each has (peopleColumns()); the visitors on a line of their own
 *   (peopleVisitors()); a delete of everything the app keeps of one person
 *   (peopleDelete()), audited (person.data_deleted, written inside the
 *   delete's own transaction - no delete without it) - the page's question
 *   is all it asks (the owner's decision of 2026-10-11).
 *
 * The only reads across people in the app; every other query on a person's
 * data is scoped to the request's own id (api/store.php).
 *
 * Deleting a person deletes everything the app keeps of them: their note
 * progress, path progress and sessions, an imports row that names them, and
 * their users row (a string they reworded stays, by nobody:
 * translations.updated_by is ON DELETE SET NULL - and so does a site setting
 * or a page's row they changed last, anotoki_site_settings.updated_by and
 * anotoki_page_access.updated_by, set to nobody here); their feedback messages
 * lose the reply address and the browser, the words stay (the library does
 * that part, in the same transaction). It takes their users row first (FOR
 * UPDATE), as an import and a save do, so a save of theirs in flight waits
 * and is then refused. Their next request makes an empty users row again -
 * with a generation no tab of theirs holds (api/store.php), so a tab still
 * open on the old progress cannot write it back.
 *
 * A backup made before keeps it all - and a restore of one does the delete
 * again (anotoki-lib 0.5.0, People::replay()): inside the restore's
 * transaction, before anybody sees its rows, every person.data_deleted the
 * audit log holds from the backup's time on is done once more with this same
 * delete, on the restore's connection (api/admin_tools.php's backups()).
 *
 * Visitors - somebody practising without signing in, a users row with a
 * negative id (api/visitors.php) - are not people here: the list leaves them
 * out (the library reads ids above 0 alone) and counts them on a line of
 * their own, and they go by the sweep 30 days after their last visit, never
 * from this page.
 */

/** The People page's site columns, by key: their labels, which a delete's answer names its counts with. */
const PEOPLE_COLUMNS = ['notes' => 'Notes', 'steps' => 'Steps', 'sessions' => 'Rounds'];

/** Piano Academy's people: its users table (name, first and last seen), its connection, its IAM, its scrub hook. */
function people(): People
{
    static $people = null;

    return $people ??= new People(
        new PeopleTable(table: 'users', name: 'preferred_username', firstSeen: 'created_at', lastSeen: 'last_seen_at'),
        static fn(): PDO => db(),
        iamClient(),
        hooks: [peopleForgetCopies(...)],
    );
}

/** Keeps the users row of the request's person (the library's RecordPerson; nothing for a visitor or nobody). */
function recordPerson(): RecordPerson
{
    return new RecordPerson(people());
}

/**
 * The scrub's hook, inside the account's transaction and on its connection:
 * what else of the person this app keeps that is a copy of them - a feedback
 * message's reply address and browser (anotoki_feedback, the library's
 * table); the message's words stay. Idempotent; nothing before the table is
 * there. (The People page's delete forgets the same itself: the library's
 * People::delete().)
 */
function peopleForgetCopies(PDO $pdo, int $sub, ?array $former): void
{
    if (AdminSchema::has($pdo, AdminSchema::FEEDBACK_TABLE)) {
        Feedback::forgetPeopleOn($pdo, [$sub]);
    }
}

/**
 * What each person on the page has: their notes with a state, the steps of
 * the path they have a record of, and the rounds they played - for one page
 * of people at a time.
 *
 * @return list<PeopleColumn>
 */
function peopleColumns(): array
{
    // Every person asked for has a count: nothing kept is 0, not "none".
    $counts = static fn(string $sql): Closure => static function (PDO $pdo, array $subs) use ($sql): array {
        $statement = $pdo->prepare($sql);
        $statement->execute(['{' . implode(',', array_map('intval', $subs)) . '}']);

        return array_map('intval', $statement->fetchAll(PDO::FETCH_KEY_PAIR)) + array_fill_keys(array_map('intval', $subs), 0);
    };

    return [
        new PeopleColumn(
            'notes',
            PEOPLE_COLUMNS['notes'],
            'count',
            $counts('SELECT p.user_id, count(*) FROM progress p, jsonb_object_keys(p.notes) WHERE p.user_id = ANY (CAST(? AS bigint[])) GROUP BY p.user_id'),
        ),
        new PeopleColumn(
            'steps',
            PEOPLE_COLUMNS['steps'],
            'count',
            $counts("SELECT pp.user_id, count(*) FROM path_progress pp, jsonb_object_keys(pp.data -> 'steps') WHERE pp.user_id = ANY (CAST(? AS bigint[])) GROUP BY pp.user_id"),
        ),
        new PeopleColumn('sessions', PEOPLE_COLUMNS['sessions'], 'count', $counts('SELECT s.user_id, count(*) FROM sessions s WHERE s.user_id = ANY (CAST(? AS bigint[])) GROUP BY s.user_id')),
    ];
}

/**
 * Deletes everything the app keeps of one person - the People page's delete,
 * and a restore's doing it again (peopleDeleteHook()). What went, by the
 * page's labels; null when there is nobody with that id.
 *
 * Inside a transaction of the library's, on the connection it hands over
 * ($pdo) - ALL of it there, and none of its own begun, committed or rolled
 * back: People::delete() holds the transaction (the person's feedback
 * forgotten and the audit entry written in it too). In a restore $pdo is the
 * restore's own connection, which holds every table it loaded until it
 * commits: a statement on the app's own connection (db()) would wait on
 * those locks while the restore waits on this, until PostgreSQL ended the
 * restore a minute later.
 *
 * @return ?array<string, int>
 */
function peopleDelete(PDO $pdo, int $id): ?array
{
    // A visitor's id (negative) is nobody's here: the route takes an IAM id only, and this says so again.
    if ($id < 1) {
        return null;
    }
    if (!$pdo->inTransaction()) {
        throw new LogicException('peopleDelete() runs inside the library\'s transaction (People::delete()).');
    }

    if (storeLockGeneration($id, $pdo) === null) {
        return null;
    }
    $counts = storeProgressCounts($id, $pdo);
    foreach (STORE_PERSON_TABLES as $table) {
        dbExec("DELETE FROM $table WHERE user_id = ?", [$id], $pdo);
    }
    dbExec('DELETE FROM users WHERE id = ?', [$id], $pdo);
    // Who last changed a site setting or a page's row (the library's tables keep the IAM id, with no foreign key):
    // nobody now, as a word the person saved is (translations.updated_by is ON DELETE SET NULL) - the Privacy page
    // says so. Nothing while the library's anotoki_admin/003 waits.
    foreach ([AdminSchema::SITE_SETTINGS_TABLE, AdminSchema::PAGE_ACCESS_TABLE] as $table) {
        if (AdminSchema::has($pdo, $table)) {
            dbExec("UPDATE $table SET updated_by = NULL WHERE updated_by = ?", [$id], $pdo);
        }
    }

    return [
        PEOPLE_COLUMNS['notes'] => $counts['notes'],
        PEOPLE_COLUMNS['steps'] => $counts['steps'],
        PEOPLE_COLUMNS['sessions'] => $counts['sessions'],
    ];
}

/**
 * The delete as the library calls it - the People page's DELETE (its request
 * the page's) and a restore's replay of the deletes done since its backup
 * (its request null): the same work either way, there is no copy to keep
 * first.
 *
 * @return Closure(PDO, int, ?Request): ?array<string, int>
 */
function peopleDeleteHook(): Closure
{
    return static fn(PDO $pdo, int $sub, ?Request $request): ?array => peopleDelete($pdo, $sub);
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
                (SELECT count(*) FROM sessions WHERE user_id < 0) AS sessions',
    );

    return ['count' => (int) $row['count'], 'sessions' => (int) $row['sessions']];
}

/**
 * People's names by their ids, as the admin tools' pages show who did what
 * (the audit log, feedback): the copy of the IAM's name this app keeps - the
 * placeholder once the IAM deleted the account. An id without a row has none.
 *
 * @param list<int> $ids
 * @return array<int, string>
 */
function peopleNames(array $ids): array
{
    $ids = array_values(array_filter(array_map('intval', $ids), static fn(int $id): bool => $id > 0));
    if ($ids === []) {
        return [];
    }
    $rows = dbAll('SELECT id, preferred_username FROM users WHERE id = ANY (CAST(? AS bigint[])) AND preferred_username IS NOT NULL', ['{' . implode(',', $ids) . '}']);

    return array_column(array_map(static fn(array $row): array => ['id' => (int) $row['id'], 'name' => (string) $row['preferred_username']], $rows), 'name', 'id');
}

/**
 * The ids a name typed into the audit log's actor filter may mean: every
 * person whose name holds it (any case).
 *
 * @return list<int>
 */
function peopleIdsNamed(string $name): array
{
    $name = trim($name);
    if ($name === '') {
        return [];
    }

    return array_map('intval', array_column(dbAll('SELECT id FROM users WHERE id > 0 AND strpos(lower(preferred_username), lower(CAST(? AS text))) > 0 ORDER BY id LIMIT 100', [$name]), 'id'));
}

/** The person a request comes from, as the admin tools record who acted: the token's user id. */
function peopleActor(\Psr\Http\Message\ServerRequestInterface $request): ?int
{
    return Identify::person($request)?->sub;
}
