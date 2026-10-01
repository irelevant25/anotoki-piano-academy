<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: the person a request acts as (see requestUser() in
 * api/auth.php), put on the request as `userId` - and, as `owner`, whether
 * that person is the site's owner. A request without one never reaches the
 * route: 401 without a usable token, 403 for auth mode "none" asked from
 * anywhere but this computer.
 *
 * The id only ever comes from here - a verified token or local_user_id -
 * never from a body or an address, so every query below it is one person's.
 */
function requireUser(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        $user = requestUser($request);

        return $handler->handle($request->withAttribute('userId', $user['id'])->withAttribute('owner', $user['owner']));
    };
}

/**
 * Middleware: only the site's owner goes on - for what belongs to the site
 * and not to one person: the app's own words. It runs after requireUser(), so
 * it is added before it (the last added runs first). Who the owner is, is
 * requestUser()'s answer: the IAM role ADMIN of this application, or whoever
 * auth mode "none" lets in on the owner's own computer. Nothing a body, an
 * address or a header of the request says makes anybody the owner.
 */
function requireOwner(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        if ($request->getAttribute('owner') !== true) {
            throw new ApiError(403, 'owner_only', 'Only the owner of this site can change its words.');
        }

        return $handler->handle($request);
    };
}
