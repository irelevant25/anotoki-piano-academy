<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The two routes anybody may call:
 *
 *   GET /api/health        is the API up - and, asked from this computer, which
 *                          database it uses and whether it needs an update (the
 *                          launchers and the tests read that)
 *   GET /api/auth/config   how the browser signs in: {mode: "none"} or
 *                          {mode: "iam", issuer, clientId}
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
