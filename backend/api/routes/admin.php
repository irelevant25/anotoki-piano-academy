<?php

declare(strict_types=1);

use Anotoki\Lib\Audit\Http\AuditRoutes;
use Anotoki\Lib\Backups\Http\BackupsRoutes;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Feedback\Http\FeedbackRoutes;
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\People\Http\PeopleRoutes;
use Anotoki\Lib\SiteSettings\Http\SiteSettingsRoutes;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Translations;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The admin panel's routes, under /api/admin - every one of them the anotoki
 * family's library's (anotoki/lib), each group behind this app's own check of
 * who may: the IAM's roles of this application, from the token
 * (meddleware/auth.php), checked on each GROUP - so a route added to a group
 * later cannot forget it: 401 without a usable token, 403 `forbidden`
 * without the role. (The library's People and admin tools' groups guard
 * themselves too - the site's ADMIN - behind this app's check.)
 *
 * EDITOR or ADMIN (the staff) - rewording the app's words: anotoki/lib's
 * TranslationsRoutes::strings() (api/translations.php), in the IAM's wire
 * format:
 *
 *   GET    /api/admin/languages                   {languages: [{code, name, native_name, enabled, sort_order, seeded, strings}]}, hidden ones too
 *   GET    /api/admin/translations                {languages, keys: [{name, description, values: {code: text}}]}
 *   PUT    /api/admin/translations                {values: {key: {code: text}}}, the changed ones -> the grid as it is now
 *   GET    /api/admin/translations/{code}/export  that language's own strings, {key: text}, as a file (translations-{code}.json)
 *   PUT    /api/admin/translations/{code}/import  {key: text} -> the grid as it is now
 *
 * ADMIN alone - the languages themselves (TranslationsRoutes::languages()):
 *
 *   POST   /api/admin/languages                   {code, name, native_name, enabled?} -> 201 {language}, offered unless enabled is false;
 *                                                 409 language_exists, 422 invalid_language, too_many_languages
 *   PUT    /api/admin/languages/{code}            {name?, native_name?, enabled?, sort_order?} -> {language}; 409 fallback_language
 *   DELETE /api/admin/languages/{code}            {strings}: its strings went with it; 409 fallback_language, seeded_language
 *
 * A save, an import and a language's change are written into the audit log
 * (translations.saved, translations.imported, language.created, .updated,
 * .deleted), by the request's person.
 *
 * ADMIN alone - the people (anotoki/lib's PeopleRoutes::admin(), api/people.php):
 *
 *   GET    /api/admin/people?q=&page=             {people: [{sub, name, first_seen_at, last_seen_at, anonymized_at, iam_url,
 *                                                 notes, steps, sessions}], columns, total, page, page_size: 50,
 *                                                 visitors: {count, sessions}, sync, ready, problems} - the people who
 *                                                 signed in, the most recently seen first; q a name (any case) or an
 *                                                 IAM id; the visitors (practising without signing in) only counted -
 *                                                 they go 30 days after their last visit
 *   DELETE /api/admin/people/{sub}                {deleted: {Notes, Steps, Rounds}}: everything the app keeps of that
 *                                                 person goes (their progress, path, sessions, users row; their
 *                                                 feedback's reply address and browser); a tab of theirs still open
 *                                                 gets 409 progress_changed on its next save. 404 not_found for
 *                                                 nobody - a visitor's negative id too. Audited (person.data_deleted,
 *                                                 inside the delete's transaction: 503 feature_unavailable while the
 *                                                 audit log's table waits - nothing deleted); a restore of an older
 *                                                 backup does it again. The page's question is all it asks
 *   POST   /api/admin/people/sync                 {run, sync}: the scrub of the IAM's deleted accounts, now (audited
 *                                                 people.synced)
 *
 * ADMIN alone - the migrations: the admin panel's Migrations page, the
 * anotoki family's (anotoki/lib's MigrationsRoutes::admin(), in its shapes
 * and words). These work while an update waits, when the site's gate answers
 * every other route 503 update_pending (siteOpenPaths(), api/index.php):
 *
 *   GET    /api/admin/migrations                  {sets: ["anotoki_admin", "piano_academy", "anotoki_translations",
 *                                                 "anotoki_people"], applied: [{set, name, applied_at}], pending: [{set,
 *                                                 name, ready, blocked}], missing: [{set, name, applied_at}]} - applied
 *                                                 in the order they ran (applied_at ISO 8601 UTC,
 *                                                 "2026-10-06T10:01:02Z"), pending in the order they will
 *   GET    /api/admin/migrations/file?set=&name=  {set, name, sql}: a file of a set, as it is; 404 not_found
 *                                                 {code, message} for anything else
 *   POST   /api/admin/migrations/apply            {applied: [{set, name}], failed: {set, name} | null, error, note} -
 *                                                 a backup of the database as it is first (the note names it; a
 *                                                 backup that cannot be made stops the update before anything
 *                                                 runs), then in order, each in its own transaction, stopping at the
 *                                                 first that fails (rolled back whole; error is what PostgreSQL
 *                                                 said, as the IAM's page shows it, and in the log too); 409 busy
 *                                                 {code, message} while another update runs (setup.php, php
 *                                                 migration.php, or this route: the one lock of api/migrations.php).
 *                                                 Audited (migrations.applied)
 *
 * The role check there needs nothing a pending migration makes: it reads the
 * token's roles, and records nobody (adminByToken()) - the users table may be
 * waiting for the very update. (A database without even 001 - an empty one -
 * is built by setup.php's Save or php migration.php.)
 *
 * ADMIN alone - the admin tools (api/admin_tools.php; the library's pages on
 * the admin panel, for the site's ADMIN: EDITORs see none of them):
 *
 *   /api/admin/errors     GET ?days=&level=&status=&search= (the report), GET /{fingerprint}, DELETE ?before=
 *   /api/admin/audit      GET ?actor=&action=&target_type=&target_id=&from=&to=&page=, GET /facets
 *   /api/admin/feedback   GET ?kind=&status=&section=&search=&page=, GET /facets, GET /unread, GET /{id},
 *                         PUT /{id}/status, DELETE /{id}
 *   /api/admin/backups    GET, GET /proof, POST, GET /{id}, DELETE /{id}, POST /{id}/ticket, GET /{id}/preview,
 *                         POST /{id}/restore - a backup made, downloaded, deleted or restored only after a
 *                         sign-in of the last ten minutes (403 reauth_required: the page offers "Sign in again")
 *   GET /api/admin/backups/{id}/file?ticket=   the download itself: DELIBERATELY outside every admin check - a
 *                         browser's navigation sends no token, and the single-use ticket (60 seconds, one
 *                         backup, its hash kept) is the check
 *
 * ADMIN alone - the site settings (anotoki/lib's SiteSettingsRoutes::admin(),
 * api/site_settings.php: Getting in, the announcement, Page access):
 *
 *   GET    /api/admin/site-settings             {parts, settings: {name: {value, updated_at, updated_by,
 *                                               updated_by_name}}, pages, levels, visibilities, reserved, limits}
 *   PUT    /api/admin/site-settings             {settings: {name: value}}, the switches that changed -> the same;
 *                                               audited site_settings.changed (each switch before and after)
 *   POST   /api/admin/site-settings/pages       {path, visibility?, blocked?, api_paths?} -> 201 the same; audited
 *                                               page_access.added; 409 page_exists; 422 invalid_page (a reserved
 *                                               page, or one under it), invalid_api_path (a reserved API path, or
 *                                               one that covers or sits inside one)
 *   PUT    /api/admin/site-settings/pages       {pages: [{id, visibility?, blocked?, api_paths?}]} -> the same;
 *                                               audited page_access.changed, an entry a row
 *   DELETE /api/admin/site-settings/pages/{id}  -> the same; audited page_access.removed; 404 not_found
 *
 * 503 feature_unavailable while the library's anotoki_admin/003 waits. A
 * reserved path: it answers while the site is closed for maintenance.
 *
 * The error log and the backups (but restore) answer while an update waits:
 * they need no table. The words' routes answer in the library's order, after
 * the group's role check (401, 403): a {code} that is not a language's is
 * 404 not_found before any query; a body that is not JSON 415, over 1 MiB
 * 413, empty 422 empty_body, broken 400 invalid_json; the words' tables not
 * there yet 503 translations_unavailable with Retry-After: 60; then the work.
 * What a save or an import refuses is a 422 with its code, and the key,
 * language and placeholder it is about - in the app's error shape, {error,
 * code, ...} (translationsRefused()). With no CORS anywhere
 * (meddleware/security.php), every write here is a PUT, a DELETE, or a POST
 * whose body must be JSON: another site's page cannot send one.
 *
 * The words are the site's: these are the only queries in the app that are
 * not scoped to a user id (with the People page's and the admin tools'). The
 * one user id written there is who saved a string - the request's person,
 * never anything a body says (translationsWriter()).
 *
 * @var \Slim\App $app
 */

// Who is asking, and whether they have the role - on each group. (While an
// update waits none of these runs but the Migrations page's and the error
// log's and the backups': the site's gate answers first, before anybody is
// looked up in a users table that might not be as the code expects yet.)
$words = static fn(): Translations => translations();
$auditWords = static function (Request $request, string $action, ?string $type, ?string $id, array $details): void {
    audit($request, $action, $type, $id, $details);
};
TranslationsRoutes::strings($app, '/api/admin', $words, translationsWriter(...), translationsRefused(...), $auditWords)->add(requireRole(...ROLES_STAFF));
TranslationsRoutes::languages($app, '/api/admin', $words, translationsRefused(...), $auditWords)->add(requireRole(ROLE_ADMIN));

// The delete runs inside the library's transaction, on its connection (peopleDeleteHook(), api/people.php) - the
// person's feedback forgotten and its audit entry written in the same transaction, which a restore does the delete
// again by.
PeopleRoutes::admin(
    $app,
    '/api/admin/people',
    people(),
    columns: peopleColumns(),
    visitors: static fn(PDO $pdo): array => peopleVisitors(),
    delete: peopleDeleteHook(),
    error: authRefused(...),
    audit: auditLog(),
    context: adminContext(),
)->add(requireRole(ROLE_ADMIN));

// The Migrations page's routes: how an administrator brings a database that
// is behind up to date, so they answer while an update waits (the gate's open
// paths). A file that fails is named with what PostgreSQL said on the page -
// on a host with only FTP that is where it can be read (the owner,
// 2026-10-04) - and in the server's log as well. The entries the audit log
// kept in a file while its table waited go in, then the update's own.
MigrationsRoutes::admin($app, '/api/admin/migrations', static fn(): Migrator => databaseUpdater(), static function (Request $request, array $result): void {
    if ($result['failed'] !== null) {
        error_log('[db] the migration ' . $result['failed']['name'] . ' failed: ' . $result['error']);
    }
    auditLog()->flushPending();
    if ($result['applied'] !== [] || $result['failed'] !== null || $result['error'] !== null) {
        audit(
            $request,
            'migrations.applied',
            null,
            null,
            array_filter(
                [
                    'files' => array_map('migrationLabel', $result['applied']),
                    'failed' => $result['failed'] === null ? null : migrationLabel($result['failed']),
                    'note' => $result['note'],
                ],
                static fn(mixed $value): bool => $value !== null,
            ),
        );
    }
})->add(adminByToken());

// The admin tools - the site's ADMIN, from the token (each group asks adminContext() too, and names the people in
// it by adminContext()'s names: the audit log's, feedback's, a backup's maker).
ErrorLogRoutes::admin($app, '/api/admin/errors', errorLog(), adminContext(), auditLog())->add(adminByToken());
AuditRoutes::admin($app, '/api/admin/audit', auditLog(), adminContext())->add(adminByToken());
FeedbackRoutes::admin($app, '/api/admin/feedback', feedback(), adminContext(), auditLog())->add(adminByToken());
BackupsRoutes::admin($app, '/api/admin/backups', backups(), adminContext())->add(adminByToken());
// The download: its single-use ticket is its check (a browser's navigation sends no token) - never an admin check.
BackupsRoutes::file($app, '/api/admin/backups', backups(), adminContext());

// The site settings (api/site_settings.php) - the site's ADMIN, from the token (the library's group asks
// adminContext() too); every change audited by the library through auditLog(). A reserved path: it answers while the
// site is closed for maintenance, so whoever closed it can open it again.
SiteSettingsRoutes::admin($app, siteSettings(), adminContext(), auditLog())->add(adminByToken());
