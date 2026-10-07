<?php

declare(strict_types=1);

use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Migrator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

/**
 * The admin panel's routes, under /api/admin. Who may call them is the IAM's
 * roles of this application (api/auth.php), checked on each GROUP - so a
 * route added to a group later cannot forget it: 401 without a usable token,
 * 403 `forbidden` without the role.
 *
 * EDITOR or ADMIN (the staff) - rewording the app's words (api/translations.php):
 *
 *   GET    /api/admin/languages                   {languages: [{code, name, nativeName, enabled, sortOrder, seeded}]}, hidden ones too
 *   GET    /api/admin/translations                {languages, keys: [{name, description, values: {code: text}}]}
 *   PUT    /api/admin/translations                {values: {key: {code: text}}}, the changed ones -> the grid as it is now
 *   GET    /api/admin/translations/{code}/export  that language's own strings: {key: text}
 *   PUT    /api/admin/translations/{code}/import  {key: text} -> the grid as it is now
 *
 * ADMIN alone - the languages themselves, and the people (api/people.php):
 *
 *   POST   /api/admin/languages                   {code, name, nativeName, enabled?} -> 201 {language}, offered unless enabled is false;
 *                                                 409 language_exists, 422 invalid_language, too_many_languages
 *   PUT    /api/admin/languages/{code}            {name?, nativeName?, enabled?, sortOrder?} -> {language}; 409 fallback_language
 *   DELETE /api/admin/languages/{code}            204, its strings go with it; 409 fallback_language, seeded_language
 *   GET    /api/admin/people                      {people: [{id, username, firstSeen, lastSeen, notes, steps, sessions}],
 *                                                 visitors: {count, sessions}}: the people who signed in, the most
 *                                                 recently seen first; the visitors (practising without signing in)
 *                                                 only counted - they go 30 days after their last visit
 *   DELETE /api/admin/people/{id}                 204: everything the app keeps of that person goes (their progress, path,
 *                                                 sessions, users row); a tab of theirs still open gets 409
 *                                                 progress_changed on its next save. 404 not_found for nobody.
 *
 * ADMIN alone - the migrations: the admin panel's Migrations page, the
 * anotoki family's (anotoki/lib's MigrationsRoutes::admin(), in its shapes
 * and words). These work while an update waits, when the site's gate answers
 * every other route 503 update_pending (SITE_OPEN_PATHS, api/index.php):
 *
 *   GET    /api/admin/migrations                  {sets: ["piano_academy"], applied: [{set, name, applied_at}],
 *                                                 pending: [{set, name, ready, blocked}], missing: [{set, name,
 *                                                 applied_at}]} - applied in the order they ran (applied_at ISO
 *                                                 8601 UTC, "2026-10-06T10:01:02Z"), pending in the order they will
 *   GET    /api/admin/migrations/file?set=&name=  {set, name, sql}: a file of the set, as it is; 404 not_found
 *                                                 {code, message} for anything else
 *   POST   /api/admin/migrations/apply            {applied: [{set, name}], failed: {set, name} | null, error, note} -
 *                                                 in order, each in its own transaction, stopping at the first that
 *                                                 fails (rolled back whole; error is what PostgreSQL said, as the
 *                                                 IAM's page shows it, and in the log too); 409 busy {code, message}
 *                                                 while another update runs (setup.php, php migration.php, or this
 *                                                 route: the one lock of api/migrations.php)
 *
 * The role check there needs nothing a pending migration makes: it reads the
 * token's roles, and keeps the caller's users row - the table 001 makes, and
 * which no migration may change in what usersSeen() writes. (A database
 * without even 001 - an empty one - has no users table for it: setup.php's
 * Save or php migration.php builds that one.)
 *
 * A {code} that is not a language's is 404 not_found. What a save or an import
 * refuses is a 422 with its code, and the key, language and placeholder it is
 * about (translationsCheck()). A body over 1 MiB is 413, one that is not JSON
 * 415 - and with no CORS anywhere (meddleware/security.php), every write here
 * is a PUT, a DELETE, or a POST whose body must be JSON: another site's page
 * cannot send one.
 *
 * The words are the site's: these are the only queries in the app that are
 * not scoped to a user id. The one user id written is who saved a string -
 * the request's person, never anything a body says.
 *
 * @var \Slim\App $app
 */

// Who is asking, and whether they have the role. (While an update waits none
// of these runs: the site's gate answers first, before anybody is looked up
// in a users table that might not be as the code expects yet.)
$app->group('/api/admin', function (RouteCollectorProxy $group): void {
    $group->get('/languages', function (Request $request, Response $response): Response {
        return respondJson($response, ['languages' => languagesAll()]);
    });

    $group->get('/translations', function (Request $request, Response $response): Response {
        return respondJson($response, translationGrid());
    });

    // Bodies are objects here (jsonBody()): turned into the arrays the checks
    // take. Anything that is not {values: {...}} comes out null, and is refused
    // as invalid_value like any other wrong shape.
    $group->put('/translations', function (Request $request, Response $response): Response {
        translationsSave(translationValuesFrom(jsonBody($request, TRANSLATIONS_BODY_LIMIT)), (int) $request->getAttribute('userId'));

        return respondJson($response, translationGrid());
    });

    $group->get('/translations/{code}/export', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, translationsExport((string) $args['code']));
    });

    $group->put('/translations/{code}/import', function (Request $request, Response $response, array $args): Response {
        translationsImport((string) $args['code'], translationMapFrom(jsonBody($request, TRANSLATIONS_BODY_LIMIT)), (int) $request->getAttribute('userId'));

        return respondJson($response, translationGrid());
    });
})->add(requireRole(...ROLES_STAFF));

$app->group('/api/admin', function (RouteCollectorProxy $group): void {
    $group->post('/languages', function (Request $request, Response $response): Response {
        return respondJson($response, ['language' => languageCreate(jsonBody($request))], 201);
    });

    $group->put('/languages/{code}', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, ['language' => languageUpdate((string) $args['code'], jsonBody($request))]);
    });

    $group->delete('/languages/{code}', function (Request $request, Response $response, array $args): Response {
        languageDelete((string) $args['code']);

        return $response->withStatus(204);
    });

    $group->get('/people', function (Request $request, Response $response): Response {
        return respondJson($response, ['people' => peopleList(), 'visitors' => peopleVisitors()]);
    });

    // An IAM user id is a whole number; anything else is no route (404).
    $group->delete('/people/{id:[0-9]{1,18}}', function (Request $request, Response $response, array $args): Response {
        if (!peopleDelete((int) $args['id'])) {
            throw new ApiError(404, 'not_found', 'There is nobody with that id here.');
        }

        return $response->withStatus(204);
    });
})->add(requireRole(ROLE_ADMIN));

// The Migrations page's routes: how an administrator brings a database that
// is behind up to date, so they answer while an update waits (the gate's open
// paths). A file that fails is named with what PostgreSQL said on the page -
// on a host with only FTP that is where it can be read (the owner,
// 2026-10-04) - and in the server's log as well.
MigrationsRoutes::admin($app, '/api/admin/migrations', static fn (): Migrator => databaseMigrator(), static function (Request $request, array $result): void {
    if ($result['failed'] !== null) {
        error_log('[db] the migration ' . $result['failed']['name'] . ' failed: ' . $result['error']);
    }
})->add(requireRole(ROLE_ADMIN));
