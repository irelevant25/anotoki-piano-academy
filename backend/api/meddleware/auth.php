<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: the person a request acts as (see requestUserId() in
 * api/auth.php), put on the request as `userId`. A request without one never
 * reaches the route: 401 without a usable token, 403 for auth mode "none"
 * asked from anywhere but this computer.
 *
 * The id only ever comes from here - a verified token or local_user_id -
 * never from a body or an address, so every query below it is one person's.
 */
function requireUser(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        return $handler->handle($request->withAttribute('userId', requestUserId($request)));
    };
}
