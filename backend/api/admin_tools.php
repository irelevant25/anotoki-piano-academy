<?php

declare(strict_types=1);

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Support\ClientAddress;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

/**
 * The admin panel's tools, the anotoki family's (anotoki/lib's admin tools -
 * 0.4.1, 0.5.0 since 2026-10-12 - one implementation for every anotoki site):
 * the error log, the audit log, feedback and backups - each an admin page of
 * the library's, for the site's ADMIN alone (the owner's decision of
 * 2026-10-07: EDITORs see none of them). This file says what is Piano
 * Academy's own of them: who acts and who is the ADMIN (from the token), the
 * proof a backup asks for, the proxies whose word on an address is believed
 * (api/client_address.php: Cloudflare's), the people's names, the folders,
 * what a restore must do again, and the places of the app a message can be
 * about. (Piano Academy takes no file explorer: it keeps no files of its own.)
 *
 *   error log   storage/logs/errors-YYYY-MM-DD.jsonl: one line per failure - a
 *               5xx, a 404, 405, 413, 415, 429, a PHP warning or fatal, and
 *               an error a page met in the browser (POST /api/client-errors:
 *               the library's ErrorLogRoutes::client(), its Angular reporter;
 *               20 an hour from one sender - a person by their account, a
 *               visitor by their address bucket - and 500 a day from the
 *               visitors, as many from the people signed in) - with its
 *               route, its redacted message and its trace (never a query, a
 *               header, a body, a token or an address: an HMAC of the address
 *               bucket instead); 30 days, 64 MB at most. An answer that says
 *               a state (update_pending, not_set_up) is no failure, and not
 *               written. No table: it works while the database is down or an
 *               update waits
 *   audit log   the table anotoki_audit_log (the library's anotoki_admin/001):
 *               who did what - a person's data deleted (written inside the
 *               delete's own transaction: a restore does the delete again by
 *               it), a scrub asked for, the words saved and imported, a
 *               language added, changed or deleted, a progress file brought
 *               in, a database update applied, the admin tools' own (backup.*,
 *               feedback.*, errors.cleared). Never an address. Kept for ever
 *   feedback    the table anotoki_feedback (anotoki_admin/002): what people
 *               send with the form at the foot of every page (POST
 *               /api/feedback, open to everybody - identity from the token
 *               only, nothing of where it came from kept; 5 an hour and 20 a
 *               day from one sender - a person by their account, a visitor by
 *               their address bucket - and 300 a day from the visitors, as
 *               many from the people signed in); no mail - the admin panel
 *               shows how many are new. The reply address is the one the form
 *               sends, never one the server fills in: the form writes the
 *               account's in for somebody signed in, who may keep it, change
 *               it or clear it, or tick "Send it without my name" (the
 *               owner's decision of 2026-10-11: their choice)
 *   backups     storage/backups/*.anotoki-backup: the whole database by COPY
 *               (no pg_dump), daily (14 kept), before every update (5), before
 *               a restore (5), and by hand; each made, downloaded, deleted and
 *               restored only after a sign-in of the last ten minutes, its
 *               maker shown by name. No maximum age (the owner's decision of
 *               2026-10-11): one made by hand stays until the owner deletes
 *               it, so a deleted person's data stays in the backups made
 *               before until they go. Not encrypted (the owner's decision:
 *               only the IAM's are) - sealed instead (an HMAC under this
 *               installation's key, storage/anotoki-lib.key): only a backup
 *               made here is restored here; one made before 0.5.0 has no seal
 *               and is restored offline only (docs/decisions.md). A restore
 *               does again, inside its transaction, every person's delete and
 *               every feedback delete made since the backup, and gives every
 *               progress a new generation; once it committed, the scrub of
 *               the IAM's deleted accounts runs at once (backupsRestoreHooks())
 *
 * The routes are the library's, in api/routes/admin.php (and the form's and
 * the pages' errors' in routes/public.php); every one of its admin groups asks
 * adminContext()'s isAdmin before anything else, and this app adds its own
 * check on each (adminByToken()) - neither reads a table, so the error log
 * and the backups answer while an update waits (the gate's open paths,
 * api/index.php).
 */

/** The places of the app a feedback message can be about (the form's sections; English, as kept). */
const FEEDBACK_SECTIONS = ['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats'];

/**
 * What the library's admin tools know of this app: who acts (the token's user
 * id), whether that is the site's ADMIN (the token's roles), the proof a
 * backup asks for (a sign-in at the IAM in the last ten minutes - the token's
 * auth_time; the page offers "Sign in again"), whose word on an address is
 * believed (api/client_address.php: CF-Connecting-IP alone, from Cloudflare's
 * published ranges - or the ranges config/visitors.local.php names, never a
 * catch-all - and with the origin secret, config/cloudflare.local.php, only on
 * a request that carries it; the library reads the address by that rule for
 * feedback's limits and the error log, as this app does for its visitors),
 * people's names by id (the Backups page's maker, the audit log's and
 * feedback's people) and the app's error shape.
 */
function adminContext(): AdminContext
{
    static $context = null;

    return $context ??= new AdminContext(
        actorId: static fn(Request $request): ?int => Identify::person($request)?->sub,
        proof: AdminContext::recentSignIn(static fn(Request $request): ?int => Identify::person($request)?->authTime),
        error: authRefused(...),
        isAdmin: static fn(Request $request): bool => Identify::person($request)?->isAdmin() ?? false,
        names: static fn(array $ids): array => peopleNames($ids),
        trustedProxies: clientAddressTrustedProxies(),
        clientHeader: ClientAddress::CLOUDFLARE_HEADER,
        originSecret: originSecret(),
    );
}

/**
 * The error log (storage/logs). The first call - api/index.php's, as the app
 * is built - gives it the app, so each line names its route's pattern. This
 * app's own refusals (ApiError: a 409 progress_changed, a 401...) are decided
 * answers: their answer's line is written where its status is one the log
 * keeps, never as a failure with a trace.
 */
function errorLog(?App $app = null): ErrorLog
{
    static $log = null;

    return $log ??= new ErrorLog(
        storageDir() . '/logs',
        array_filter(
            [
                'root' => PIANO_BACKEND,
                'context' => adminContext(),
                'ignoreExceptions' => [ApiError::class],
                'app' => $app,
            ],
            static fn(mixed $value): bool => $value !== null,
        ),
    );
}

/**
 * The audit log (the library's table; while it waits for its migration, the
 * entries wait in storage/logs/audit-pending.jsonl and go in after the next
 * Apply - flushPending()).
 */
function auditLog(): AuditLog
{
    static $audit = null;

    return $audit ??= new AuditLog(static fn(): PDO => db(), [
        'pendingFile' => storageDir() . '/logs/audit-pending.jsonl',
        'actorIds' => static fn(string $name): array => peopleIdsNamed($name),
    ]);
}

/** One entry of the audit log by the request's person (never throws). */
function audit(Request $request, string $action, ?string $targetType = null, int|string|null $targetId = null, array $details = []): void
{
    auditLog()->record($request, peopleActor($request), $action, $targetType, $targetId, $details);
}

/** Feedback: the form's messages, and the admin page's list (the library's table). */
function feedback(): Feedback
{
    static $feedback = null;

    return $feedback ??= new Feedback(static fn(): PDO => db(), [
        'storage' => storageDir(),
        'sections' => FEEDBACK_SECTIONS,
        'defer' => afterResponse(...),
    ]);
}

/**
 * The signed-in sender of a feedback message, from the token alone (null:
 * nobody - a visitor too): who, never an address - the reply address is the
 * one the form sends.
 */
function feedbackSender(Request $request): ?array
{
    $person = Identify::person($request);

    return $person === null ? null : ['id' => $person->sub];
}

/**
 * The backups: storage/backups, made by COPY on a connection of their own
 * (backupsConnection()), with this app's migrations (its Migrator, the
 * library's sets with it) and its update lock - so a backup and an Apply never
 * run together. $settings: another database than the app's (setup.php's Save
 * backs up the database it is about to update, before its settings are
 * written).
 */
function backups(?array $settings = null): Backups
{
    static $backups = null;

    $make = static fn(?array $settings): Backups => new Backups(static fn(): PDO => backupsConnection($settings ?? databaseSettings()), storageDir() . '/backups', [
        'site' => 'piano-academy',
        'migrator' => static fn(PDO $pdo): Migrator => databaseMigrator($pdo),
        'lock' => DATABASE_UPDATE_LOCK,
        'audit' => auditLog(),
        'defer' => afterResponse(...),
        'onError' => static function (Throwable $e): void {
            errorLog()->record($e);
        },
        ...backupsRestoreHooks(),
    ]);

    return $settings !== null ? $make($settings) : ($backups ??= $make(null));
}

/**
 * What a restore does besides putting the rows back - the library's two hooks
 * (People::replay() and People::afterRestore(), what People::restoreHooks()
 * gives; anotoki-lib 0.5.0) and this app's own:
 *
 * - beforeCommit, inside the restore's transaction, on its connection, every
 *   table it loaded still held - so nobody sees the rows before it ran, and a
 *   request that dies after the commit leaves nothing of it undone: the
 *   library's People::replay() does again every delete the audit log holds
 *   from the backup's time on - a person's on the People page
 *   (peopleDeleteHook(), its request null) and a feedback message's - and
 *   then every progress takes a new generation (storeRenewGenerationsAfterRestore():
 *   a tab left open since before the restore is refused its next save, never
 *   saving over what was restored). What fails rolls the restore back whole.
 *   The new generations are this app's work "after a restore" (the library's
 *   then:), done here rather than once the restore committed: there, a save
 *   from a tab of before would get through in the moments between the commit
 *   and the scrub's end, over what was restored.
 * - afterRestore, once it committed: the library's People::afterRestore() -
 *   the scrub of the IAM's deleted accounts at once (the restore brought back
 *   its place of the backup's day); one that does not finish is the
 *   restore's after_restore_error (the Backups page, the error log), and the
 *   hourly upkeep's stamp goes after this answer (this app's runner,
 *   api/after_response.php), so the next request scrubs again.
 *
 * The people are asked for when a restore runs, not before: setup.php's Save
 * makes its backup before the IAM's settings are written, and people() needs
 * them.
 *
 * @return array{beforeCommit: Closure(array<string, mixed>, PDO): void, afterRestore: Closure(array<string, mixed>, PDO): void}
 */
function backupsRestoreHooks(): array
{
    return [
        'beforeCommit' => static function (array $manifest, PDO $pdo): void {
            people()->replay(peopleDeleteHook())($manifest, $pdo);
            storeRenewGenerationsAfterRestore($pdo);
        },
        'afterRestore' => static function (array $manifest, PDO $pdo): void {
            people()->afterRestore(defer: afterResponse(...))($manifest, $pdo);
        },
    ];
}

/**
 * A connection the backups can COPY on: the library's Copy::connect() (a
 * Pdo\Pgsql where PHP has one - 8.4 and later), to the app's database, in
 * UTC like every connection of the app's (api/db.php).
 */
function backupsConnection(array $settings): PDO
{
    $pdo = Copy::connect(
        sprintf('pgsql:host=%s;port=%d;dbname=%s;connect_timeout=5;application_name=piano-academy-backups', $settings['host'], (int) $settings['port'], $settings['name']),
        (string) $settings['user'],
        (string) $settings['password'],
        [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
    );
    $pdo->exec("SET TIME ZONE 'UTC'");

    return $pdo;
}

/**
 * The engine for an update - setup.php's Save, php migration.php, an ADMIN's
 * Apply: databaseMigrator() with a backup of the database as it is made first
 * (the library's before-migration backup, once for each list of pending
 * files; a backup that cannot be made stops the update before anything runs;
 * a database with nothing applied yet has nothing to keep). $settings: the
 * database's, where they are not the app's yet (setup.php).
 */
function databaseUpdater(?PDO $pdo = null, ?array $settings = null): Migrator
{
    return databaseMigrator($pdo, ['beforeApply' => backups($settings)->beforeApplyHook()]);
}
