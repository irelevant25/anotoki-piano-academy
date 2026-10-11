<?php

declare(strict_types=1);

use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Translations;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The routes anybody may call:
 *
 *   GET /api/health               is the API up: {ok} - and, asked from this computer,
 *                                 which database it uses and the migrations it still
 *                                 needs: {ok, database, pending} (the tests read that;
 *                                 the library's files named with their set,
 *                                 "anotoki_translations/001_....sql")
 *   GET /api/auth/config          how the browser signs in through the anotoki IAM, and
 *                                 whether the IAM says this app requires sign-in:
 *                                 {issuer, clientId, loginRequired} (authLoginRequired():
 *                                 the IAM's switch, kept a minute, true when unknown)
 *   GET /api/translations/{code}  the app's words in a language, with the languages on
 *                                 offer (anotoki/lib's TranslationsRoutes::bundle(), the
 *                                 IAM's wire format): {language, languages: [{code, name,
 *                                 native_name}], values, english?}; "sk-sk" is answered by
 *                                 "sk" when only that is offered; 503
 *                                 translations_unavailable (Retry-After 60) while the
 *                                 database has no words yet
 *   GET /api/site-status          where the site stands: {state: "ready" | "not_set_up" |
 *                                 "update_pending" | "unavailable", installed} - and
 *                                 nothing else (anotoki/lib's MigrationsRoutes::status());
 *                                 answered in every state, not set up too
 *
 * The first three answer while an update waits too (siteOpenPaths() in
 * api/index.php): somebody can sign in then, and the pages have their words.
 *
 * @var \Slim\App $app
 */

$app->get('/api/health', function (Request $request, Response $response): Response {
    $health = ['ok' => true];

    if (isLoopback(requestRemoteAddr($request))) {
        $health['database'] = dbName();
        $health['pending'] = array_map('migrationLabel', databaseMigrator()->applicable());
    }

    return respondJson($response, $health);
});

$app->get('/api/auth/config', function (Request $request, Response $response): Response {
    return respondJson($response, authPublicConfig());
});

// No middleware for who is asking, on purpose: the words are the same for
// everybody, and the sign-in card and the boot pages need them before anybody
// has signed in. So a token - even one that would not check out - is not
// looked at: public words, nothing of anybody's. The only route under
// /api/translations/: a code that is none is a 404 before any query; the
// strings change when the owner saves one, or with a release, so the browser
// asks every time (Cache-Control: no-cache) and is told "the same as you have"
// (304, the ETag compared the weak way - also as a server that compresses
// sends it back).
//
// It answers while an update waits, from the words the database has then. A
// database that has not got the words' tables yet (002 among what waits) - or
// no English string at all - has none to give: 503 translations_unavailable,
// and the app draws its shell from the English it keeps meanwhile.
TranslationsRoutes::bundle($app, static fn (): Translations => translations(), translationsRefused(...));

// Where the site stands, for the pages (the frontend's SiteStatus): asked as
// the app starts, and again by the page that waits for an update. The gate
// lets it through whatever the state.
MigrationsRoutes::status($app, siteState());
