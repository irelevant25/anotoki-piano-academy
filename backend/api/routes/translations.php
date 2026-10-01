<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

/**
 * The owner's routes: the app's own words and the languages it speaks (see
 * api/translations.php). Reading the words is public - GET
 * /api/translations/{code} in routes/public.php; everything here is for the
 * site's owner alone: 403 owner_only for anybody else who is signed in, 401
 * for nobody, 403 local_only for auth mode "none" asked from elsewhere.
 *
 *   GET    /api/owner/languages                   {languages: [{code, name, nativeName, enabled, sortOrder, seeded}]}, hidden ones too
 *   POST   /api/owner/languages                   {code, name, nativeName, enabled?} -> 201 {language}, offered unless enabled is false;
 *                                                 409 language_exists, 422 invalid_language, too_many_languages
 *   PUT    /api/owner/languages/{code}            {name?, nativeName?, enabled?, sortOrder?} -> {language}; 409 fallback_language
 *   DELETE /api/owner/languages/{code}            204, its strings go with it; 409 fallback_language, seeded_language
 *   GET    /api/owner/translations                {languages, keys: [{name, description, values: {code: text}}]}
 *   PUT    /api/owner/translations                {values: {key: {code: text}}}, the changed ones -> the grid as it is now
 *   GET    /api/owner/translations/{code}/export  that language's own strings: {key: text}
 *   PUT    /api/owner/translations/{code}/import  {key: text} -> the grid as it is now
 *
 * A {code} that is not a language's is 404 not_found. What a save or an import
 * refuses is a 422 with its code, and the key, language and placeholder it is
 * about (translationsCheck()). A body over 1 MiB is 413, one that is not JSON
 * 415 - and that, with no CORS anywhere (meddleware/security.php), is what
 * keeps another site's page from changing a string in auth mode "none": every
 * write here is a PUT, a DELETE, or a POST whose body must be JSON.
 *
 * These are the only queries in the app that are not scoped to a user id: the
 * words are the site's. The one user id written is who saved a string - the
 * request's `userId`, never anything a body says.
 *
 * @var \Slim\App $app
 */

// Middleware added last runs first (routes/progress.php): the schema is
// checked before anybody is looked up in a users table that might not be
// there yet, then who is asking, then whether they are the owner.
$app->group('/api/owner', function (RouteCollectorProxy $group): void {
    $group->get('/languages', function (Request $request, Response $response): Response {
        return respondJson($response, ['languages' => languagesAll()]);
    });

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
})->add(requireOwner())->add(requireUser())->add(requireCurrentSchema());
