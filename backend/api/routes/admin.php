<?php

declare(strict_types=1);

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
 * ADMIN alone - the migrations (the admin panel's Migrations page, the IAM's
 * shape), and these two work while the database is behind the code (every
 * other route then answers 503 not_set_up with update: true):
 *
 *   GET    /api/admin/migrations                  {database, applied: [{name, applied_at}], pending: [{name}]},
 *                                                 applied in the order they ran, pending in the order they will
 *   POST   /api/admin/migrations/apply            {applied: [file], failed: file | null, error: string | null} -
 *                                                 in order, each in its own transaction, stopping at the first that
 *                                                 fails (rolled back whole; error is what PostgreSQL said, as the
 *                                                 IAM's page shows it, and in the log too); 409 busy while another update runs
 *                                                 (setup.php, php migration.php, or this route - api/database_update.php)
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

// Middleware added last runs first (routes/progress.php): the schema is
// checked before anybody is looked up in a users table that might not be
// there yet, then who is asking and whether they have the role.
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
})->add(requireRole(...ROLES_STAFF))->add(requireCurrentSchema());

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
})->add(requireRole(ROLE_ADMIN))->add(requireCurrentSchema());

// No schema check here, on purpose: this is how an administrator brings a
// database that is behind up to date. (The users table, which the role check
// writes to, is there from 001_init.sql; a database without even that is not
// set up, and setup.php is the way.)
$app->group('/api/admin/migrations', function (RouteCollectorProxy $group): void {
    $group->get('', function (Request $request, Response $response): Response {
        return respondJson($response, databaseStatus(db()));
    });

    $group->post('/apply', function (Request $request, Response $response): Response {
        $result = databaseApplyUpdate(db());
        if ($result === null) {
            throw new ApiError(409, 'busy', 'Another database update is running. Wait a moment, then look again.');
        }

        return respondJson($response, $result);
    });
})->add(requireRole(ROLE_ADMIN));
