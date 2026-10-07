<?php

declare(strict_types=1);

use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The routes anybody may call:
 *
 *   GET /api/health               is the API up: {ok} - and, asked from this computer,
 *                                 which database it uses and the migrations it still
 *                                 needs: {ok, database, pending} (the tests read that)
 *   GET /api/auth/config          how the browser signs in through the anotoki IAM, and
 *                                 whether the IAM says this app requires sign-in:
 *                                 {issuer, clientId, loginRequired} (authLoginRequired():
 *                                 the IAM's switch, kept a minute, true when unknown)
 *   GET /api/translations/{code}  the app's own words in a language, with the
 *                                 languages on offer (see api/translations.php):
 *                                 {language, languages, values, english?}; "sk-sk" is
 *                                 answered by "sk" when only that is offered
 *   GET /api/site-status          where the site stands: {state: "ready" | "not_set_up" |
 *                                 "update_pending" | "unavailable", installed} - and
 *                                 nothing else (anotoki/lib's MigrationsRoutes::status());
 *                                 answered in every state, not set up too
 *
 * The first three answer while an update waits too (SITE_OPEN_PATHS in
 * api/index.php): somebody can sign in then, and the pages have their words.
 *
 * @var \Slim\App $app
 */

$app->get('/api/health', function (Request $request, Response $response): Response {
    $health = ['ok' => true];

    if (isLoopback(requestRemoteAddr($request))) {
        $health['database'] = dbName();
        $health['pending'] = array_column(databaseMigrator()->applicable(), 'name');
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
// /api/translations/.
//
// It answers while an update waits, from the words the database has then.
// A database that has not got the words' tables yet (002 among what waits)
// has none to give: that is said the way the gate says it to every other
// route then (503 update_pending), never as a database error. The app draws
// its shell from the English it keeps meanwhile.
$app->get('/api/translations/{code}', function (Request $request, Response $response, array $args): Response {
    // Before any query: only a code is looked up (a wrong address is a 404, not
    // a database refusing bytes that are not text).
    $code = (string) $args['code'];
    if (!languageCodeOk($code)) {
        throw languageNotFound();
    }
    if (!translationsReady()) {
        throw new ApiError(503, 'update_pending', 'The site is being updated. Try again in a few minutes.', ['Retry-After' => '60']);
    }

    // The strings change when the owner saves one, or with a release: the
    // browser asks every time (no-cache) and is told "the same as you have" in
    // a few bytes. Both headers are set before that answer, so it carries them
    // too - without them it would go out as no-store (meddleware/security.php
    // leaves a Cache-Control that is already there alone). The tag is compared
    // as it may come back from behind a server that compresses
    // (translationsNotModified).
    $body = jsonText(translationBundle($code));
    $etag = '"' . md5($body) . '"';
    $response = $response->withHeader('ETag', $etag)->withHeader('Cache-Control', 'no-cache');
    if (translationsNotModified($request->getHeaderLine('If-None-Match'), $etag)) {
        return $response->withStatus(304);
    }

    return respondJsonText($response, $body);
});

// Where the site stands, for the pages (the frontend's SiteStatus): asked as
// the app starts, and again by the page that waits for an update. The gate
// lets it through whatever the state.
MigrationsRoutes::status($app, siteState());
