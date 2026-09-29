<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Baseline headers on every answer of the API. A route that set one knows its
 * own needs better, so each is only filled in where it is missing.
 *
 * There is no CORS here on purpose. The app is served from the same origin as
 * its API everywhere (the dev server proxies /api), so a preflight - which
 * every cross-site write with a JSON body needs - is answered 405 and the
 * browser stops there. That, and the JSON-only bodies, is what keeps another
 * site's page from changing somebody's progress.
 */
function securityHeaders(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        $response = $handler->handle($request);

        $ensure = static fn(Response $response, string $name, string $value): Response =>
            $response->hasHeader($name) ? $response : $response->withHeader($name, $value);

        $response = $ensure($response, 'X-Content-Type-Options', 'nosniff');
        $response = $ensure($response, 'X-Frame-Options', 'DENY');
        $response = $ensure($response, 'Referrer-Policy', 'same-origin');
        // A JSON API loads nothing, so it can afford the strictest policy.
        $response = $ensure($response, 'Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        // Somebody's progress has no business in a shared cache.
        $response = $ensure($response, 'Cache-Control', 'no-store');

        return $response;
    };
}
