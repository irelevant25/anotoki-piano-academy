<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The routes anybody may call:
 *
 *   GET /api/health               is the API up - and, asked from this computer, which
 *                                 database it uses and whether it needs an update (the
 *                                 launchers and the tests read that)
 *   GET /api/auth/config          how the browser signs in: {mode: "none"} or
 *                                 {mode: "iam", issuer, clientId}
 *   GET /api/translations/{code}  the app's own words in a language, with the
 *                                 languages on offer (see api/translations.php):
 *                                 {language, languages, values, english?}; "sk-sk" is
 *                                 answered by "sk" when only that is offered
 *
 * @var \Slim\App $app
 */

$app->get('/api/health', function (Request $request, Response $response): Response {
    $health = ['ok' => true, 'auth' => authMode()];

    if (isLoopback(requestRemoteAddr($request))) {
        $health['database'] = dbName();
        $health['pending'] = pendingMigrationsReadOnly(db());
    }

    return respondJson($response, $health);
});

$app->get('/api/auth/config', function (Request $request, Response $response): Response {
    return respondJson($response, authPublicConfig());
});

// No middleware for who is asking, on purpose: the words are the same for
// everybody, and the sign-in card needs them before anybody has signed in. So
// a token - even one that would not check out - is not looked at, and in auth
// mode "none" this one route also answers a request from elsewhere: public
// words, nothing of anybody's. The only route under /api/translations/.
//
// The schema is checked, though: on a database the code is ahead of, the
// tables may not be there yet, and that is "not set up" (503 not_set_up), not
// a database error. The app then draws its shell from the English it keeps.
$app->get('/api/translations/{code}', function (Request $request, Response $response, array $args): Response {
    // Before any query: only a code is looked up (a wrong address is a 404, not
    // a database refusing bytes that are not text).
    $code = (string) $args['code'];
    if (!languageCodeOk($code)) {
        throw languageNotFound();
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
})->add(requireCurrentSchema());
