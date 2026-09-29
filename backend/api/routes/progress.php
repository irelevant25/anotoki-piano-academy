<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * One person's progress - the signed-in person's (auth mode "iam"), or the
 * owner's on their own computer (auth mode "none"):
 *
 *   GET  /api/state      {progress, sessions, path}: everything the app starts with
 *   PUT  /api/progress   the whole note-progress object, keyed by MIDI number -> 204
 *   PUT  /api/path       {steps: {"unitId/stepId": {...}}} -> 204
 *   POST /api/sessions   one finished round; the server gives it id and recordedAt
 *                        -> 201 with the stored session. With an Idempotency-Key the
 *                        browser used before: 200 with the session stored then,
 *                        and nothing added.
 *
 * @var \Slim\App $app
 */

// Middleware added last runs first: the schema is checked before anybody is
// looked up in a users table that might not be there yet.
$app->get('/api/state', function (Request $request, Response $response): Response {
    return respondJsonText($response, storeStateJson((int) $request->getAttribute('userId')));
})->add(requireUser())->add(requireCurrentSchema());

$app->put('/api/progress', function (Request $request, Response $response): Response {
    storeSaveProgress((int) $request->getAttribute('userId'), storeCheckProgress(jsonBody($request)));

    return $response->withStatus(204);
})->add(requireUser());

$app->put('/api/path', function (Request $request, Response $response): Response {
    storeSavePath((int) $request->getAttribute('userId'), storeCheckPath(jsonBody($request)));

    return $response->withStatus(204);
})->add(requireUser());

$app->post('/api/sessions', function (Request $request, Response $response): Response {
    $session = storeCleanSession(jsonBody($request));

    $key = $request->hasHeader('Idempotency-Key') ? $request->getHeaderLine('Idempotency-Key') : null;
    if ($key !== null && !preg_match('/^[A-Za-z0-9_-]{1,100}$/D', $key)) {
        throw new ApiError(400, 'invalid_idempotency_key', 'Idempotency-Key must be up to 100 letters, digits, - and _.');
    }

    [$created, $json] = storeAddSession((int) $request->getAttribute('userId'), $session, $key);

    return respondJsonText($response, $json, $created ? 201 : 200);
})->add(requireUser());
