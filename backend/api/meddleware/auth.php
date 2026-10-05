<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: who the request comes from (requestUser() in api/auth.php), put
 * on the request as `user` - a SiteUser - and as `userId`, its id.
 *
 *   requireUser()           a signed-in person, any role or none: 401 otherwise
 *   requireRole(...)        a signed-in person with one of the roles: 401, then 403
 *   requireOwner($nobody)   whose own progress a request reads or saves: the
 *                           signed-in person, else - when the IAM says sign-in
 *                           is not required - this browser's visitor, else
 *                           nobody as $nobody says (api/auth.php has the order)
 *
 * The person only ever comes from a verified token - never from a body, an
 * address or a header of the app's own. The one other identity is a
 * browser's visitor (api/visitors.php: a key the server made, sent back in
 * X-Visitor-Key), and only requireOwner() reads it - with the move at
 * sign-in (api/routes/visitor.php), which takes a token as well. Either way
 * every query below it on somebody's data is that one's own: the routes take
 * the id from here and from nowhere else.
 */

/**
 * Somebody signed in: 401 without a token. Every route but the public ones
 * (api/routes/public.php) and the progress routes (requireOwner()) takes it
 * or requireRole().
 */
function requireUser(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        return $handler->handle(withSiteUser($request, signedInUser($request)));
    };
}

/**
 * Somebody signed in with one of $roles: 401 without a usable token, 403
 * `forbidden` without the role. It is added to a whole route group
 * (api/routes/admin.php), so a route added to the group later cannot forget
 * it. It checks the token itself; after an outer requireUser() it asks the
 * person that one found.
 */
function requireRole(string ...$roles): callable
{
    return function (Request $request, RequestHandler $handler) use ($roles): Response {
        $user = signedInUser($request);
        if (!$user->has(...$roles)) {
            throw new ApiError(403, 'forbidden', in_array(ROLE_EDITOR, $roles, true)
                ? 'This is for the people who keep Piano Academy\'s words. Ask the site\'s administrator for the editor role.'
                : 'Only an administrator of Piano Academy may do this.');
        }

        return $handler->handle(withSiteUser($request, $user));
    };
}

/**
 * The one whose own progress the request reads and saves - the only
 * middleware that reads a visitor key, and so the only way a visitor reaches
 * anything:
 *
 *   1. a Bearer header: that person, or 401 (requestUser()) - a bad or expired
 *      token never falls back to the key, which is not even read;
 *   2. else, when the IAM says sign-in is required (authLoginRequired()): 401
 *      sign_in_required at once - the key is not read, so no visitor is
 *      looked up, seen, counted, swept early or made;
 *   3. else an X-Visitor-Key: that visitor (visitorFind(); unknown or
 *      malformed: 401 visitor_unknown; 005 pending: 503 visitors_unavailable);
 *   4. else nobody, as $nobody says: 'refuse' - 401 sign_in_required; 'empty'
 *      - the route answers what nobody has (the attribute `nobody`); 'make' -
 *      the route is a save that makes a visitor in its own transaction once
 *      its body checks out (the attribute `visitorToMake`; visitorWriter()
 *      in api/visitors.php).
 *
 * A person's or a visitor's request also leaves the sweep of visitors unseen
 * for 30 days for after its answer (at most once an hour).
 */
function requireOwner(string $nobody = 'refuse'): callable
{
    if (!in_array($nobody, ['refuse', 'empty', 'make'], true)) {
        throw new LogicException("requireOwner('$nobody'): refuse, empty or make.");
    }

    return function (Request $request, RequestHandler $handler) use ($nobody): Response {
        $owner = requestUser($request);
        if ($owner === null) {
            if (authLoginRequired()) {
                throw signInRequired();
            }
            $key = visitorKeyOf($request);
            if ($key !== null) {
                $owner = visitorFind($key);
            } elseif ($nobody === 'make') {
                return $handler->handle($request->withAttribute('visitorToMake', true));
            } elseif ($nobody === 'empty') {
                return $handler->handle($request->withAttribute('nobody', true));
            } else {
                throw signInRequired();
            }
        }
        visitorSweepAfterAnswer();

        return $handler->handle(withSiteUser($request, $owner));
    };
}

/**
 * The person an outer middleware found, or the token's - 401 when there is
 * nobody, and when there is only a visitor: requireUser() and requireRole()
 * mean a verified token however they are stacked.
 */
function signedInUser(Request $request): SiteUser
{
    $user = currentUser($request);
    if ($user !== null && $user->visitor) {
        throw signInRequired();
    }
    $user ??= requestUser($request);
    if ($user === null) {
        throw signInRequired();
    }

    return $user;
}

/** 401 sign_in_required: nobody signed in where somebody must be. */
function signInRequired(): ApiError
{
    return new ApiError(401, 'sign_in_required', 'Please sign in.', ['WWW-Authenticate' => 'Bearer realm="piano-academy"']);
}

/**
 * The request's person - or visitor, after requireOwner() - once a
 * middleware above found them; null on a route with none, and for nobody.
 */
function currentUser(Request $request): ?SiteUser
{
    $user = $request->getAttribute('user');

    return $user instanceof SiteUser ? $user : null;
}

function withSiteUser(Request $request, SiteUser $user): Request
{
    return $request->withAttribute('user', $user)->withAttribute('userId', $user->id);
}
