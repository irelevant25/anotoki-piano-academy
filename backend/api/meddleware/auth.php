<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\Http\RequireCaller;
use Anotoki\Lib\Auth\Http\RequirePerson;
use Anotoki\Lib\Auth\Http\RequireRole;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: who the request comes from - the anotoki family's library
 * (anotoki/lib's Anotoki\Lib\Auth\Http, since 0.4.1) - and the little that is
 * this app's own around it.
 *
 *   identify()              the library's Identify, once, in front of every route but
 *                           the public ones (api/index.php): a Bearer header is a
 *                           person or 401 invalid_token; while the IAM requires a
 *                           sign-in nobody; else an X-Visitor-Key is this app's
 *                           visitor (visitorFound(), api/visitors.php) or 401
 *                           visitor_unknown; else nobody
 *   requireUser()           a signed-in person, any role or none: 401 otherwise
 *   requireRole(...)        a signed-in person with one of the roles (from the token):
 *                           401, then 403 forbidden in the staff's or ADMIN's words
 *   requireOwner($nobody)   whose own progress a request reads or saves: the person,
 *                           else - when the IAM says sign-in is not required - this
 *                           browser's visitor, else nobody as $nobody says
 *   adminByToken()          the site's ADMIN from the token alone, recording nobody:
 *                           the Migrations page's routes and the admin tools'
 *                           (they work while users waits for an update)
 *
 * The first three record the person's users row (api/people.php's
 * recordPerson(): the library's PeopleRecorder) and put on the request, as
 * this app's routes read it, `user` - a SiteUser, the person or the visitor -
 * and `userId`, its id (siteOwner()).
 *
 * The person only ever comes from a verified token - never from a body, an
 * address or a header of the app's own. The one other identity is a
 * browser's visitor (api/visitors.php: a key the server made, sent back in
 * X-Visitor-Key): the library's Identify reads it, for a request with no
 * Bearer header while no sign-in is required, and only requireOwner() - the
 * four progress routes - takes a visitor for anybody; the move at sign-in
 * (api/routes/visitor.php) reads the key itself, beside a token. Every query
 * below on somebody's data is that one's own: the routes take the id from
 * here and from nowhere else.
 */

/**
 * The paths that read no token at all - the sign-in settings, the words, the
 * health check, where the site stands: the pages ask them before anybody can
 * be signed in, and a token that does not check out must not turn them into a
 * 401 (the family's status page reads a 401 there as "not available").
 */
function publicPaths(): array
{
    return ['/api/site-status', '/api/auth/config', '/api/health', TranslationsRoutes::openPath()];
}

/** Who the request is (the library's Identify), for every route but publicPaths(). */
function identify(ResponseFactoryInterface $responses): MiddlewareInterface
{
    $identify = new Identify(accessTokens(), signInRule(), $responses, visitor: static fn(string $key): ?SiteUser => visitorFound($key), responder: authRefused(...));

    return new class ($identify, publicPaths()) implements MiddlewareInterface {
        /** @param list<string> $public */
        public function __construct(private readonly Identify $identify, private readonly array $public) {}

        public function process(Request $request, RequestHandler $handler): Response
        {
            $path = $request->getUri()->getPath();
            foreach ($this->public as $public) {
                if ($public[0] === '~' ? preg_match($public, $path) === 1 : $path === $public) {
                    return $handler->handle($request);
                }
            }

            return $this->identify->process($request, $handler);
        }
    };
}

/**
 * Somebody signed in: 401 without a token, a visitor too. The own progress
 * file and the move at sign-in take it.
 */
function requireUser(): MiddlewareInterface
{
    return middlewares(new RequirePerson(), recordPerson(), new SiteOwner());
}

/**
 * Somebody signed in with one of $roles, from the token: 401 without a usable
 * token (a visitor too), 403 `forbidden` without the role - in the staff's or
 * ADMIN's words. It is added to a whole route group (api/routes/admin.php), so
 * a route added to the group later cannot forget it.
 */
function requireRole(string ...$roles): MiddlewareInterface
{
    return middlewares(roleCheck(...$roles), recordPerson(), new SiteOwner());
}

/**
 * The site's ADMIN, from the token alone - nobody recorded, no table read: the
 * Migrations page's routes and the admin tools' (each tool's group guards
 * itself too, through api/admin_tools.php's adminContext()). They must work on
 * a database whose users table waits for an update.
 */
function adminByToken(): MiddlewareInterface
{
    return roleCheck(ROLE_ADMIN);
}

/** The library's role check, refusing in this app's words. */
function roleCheck(string ...$roles): RequireRole
{
    return (new RequireRole(array_values($roles)))->refusing(
        'forbidden',
        in_array(ROLE_EDITOR, $roles, true)
            ? 'This is for the people who keep Piano Academy\'s words. Ask the site\'s administrator for the editor role.'
            : 'Only an administrator of Piano Academy may do this.',
    );
}

/**
 * The one whose own progress the request reads and saves - the person, else
 * the visitor the library's Identify found (only while the IAM requires no
 * sign-in), else nobody as $nobody says: 'refuse' - 401 sign_in_required;
 * 'empty' - the route answers what nobody has (the attribute `nobody`);
 * 'make' - the route is a save that makes a visitor in its own transaction
 * once its body checks out (the attribute `visitorToMake`; visitorWriter() in
 * api/visitors.php). While the IAM requires a sign-in, nobody is 401
 * sign_in_required whatever $nobody says - the key is never read then.
 *
 * A person's or a visitor's request also leaves the sweep of visitors unseen
 * for 30 days for after its answer (at most once an hour).
 */
function requireOwner(string $nobody = 'refuse'): MiddlewareInterface
{
    return middlewares(new RequireCaller($nobody), recordPerson(), new SiteOwner(sweep: true));
}

/**
 * What this app's routes read of who the request is: `user` - a SiteUser,
 * the person (from the token) or the visitor (from the key) - and `userId`;
 * for nobody, RequireCaller's word as `nobody` / `visitorToMake`.
 */
final class SiteOwner implements MiddlewareInterface
{
    public function __construct(private readonly bool $sweep = false) {}

    public function process(Request $request, RequestHandler $handler): Response
    {
        $person = Identify::person($request);
        $visitor = Identify::visitor($request);
        if ($person !== null) {
            $request = withSiteUser($request, new SiteUser($person->sub, $person->name, $person->roles));
        } elseif ($visitor instanceof SiteUser) {
            $request = withSiteUser($request, $visitor);
        } else {
            if ($request->getAttribute(RequireCaller::MAKE_VISITOR) === true) {
                $request = $request->withAttribute('visitorToMake', true);
            }
            if ($request->getAttribute(RequireCaller::NOBODY) === true) {
                $request = $request->withAttribute('nobody', true);
            }

            return $handler->handle($request);
        }
        if ($this->sweep) {
            visitorSweepAfterAnswer();
        }

        return $handler->handle($request);
    }
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

/** Several middlewares as one, the first outermost: a route takes them with one add(). */
function middlewares(MiddlewareInterface ...$layers): MiddlewareInterface
{
    return new class (array_values($layers)) implements MiddlewareInterface {
        /** @param list<MiddlewareInterface> $layers */
        public function __construct(private readonly array $layers) {}

        public function process(Request $request, RequestHandler $handler): Response
        {
            $next = $handler;
            foreach (array_reverse($this->layers) as $layer) {
                $next = new class ($layer, $next) implements RequestHandler {
                    public function __construct(private readonly MiddlewareInterface $layer, private readonly RequestHandler $next) {}

                    public function handle(Request $request): Response
                    {
                        return $this->layer->process($request, $this->next);
                    }
                };
            }

            return $next->handle($request);
        }
    };
}
