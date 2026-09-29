<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: nothing runs before the app is set up.
 *
 * Without config/database.local.php and config/auth.local.php (see
 * config/config.php) every request is answered 503 {code: "not_set_up"}, with
 * the address of the setup page. The frontend shows its "not set up yet" page
 * on that code; the launchers open the setup page on it.
 */
function setupGate(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        $problem = settingsProblem();

        if ($problem === null) {
            return $handler->handle($request);
        }

        // What is missing, for whoever sits at this computer; a visitor of a
        // half-installed site only learns that it is not ready.
        $extra = ['setup' => '/setup.php'];
        if (isLoopback(requestRemoteAddr($request))) {
            $extra['detail'] = $problem;
        }

        return respondError(new \Slim\Psr7\Response(), 503, 'not_set_up', notSetUpMessage(), [], $extra);
    };
}

function notSetUpMessage(): string
{
    return 'Piano Academy is not set up yet. Open /setup.php to set it up.';
}

/**
 * Middleware: the database has every migration this code expects. The app
 * starts with GET /api/state, so that is where a database behind the code is
 * noticed - before anything is read from, or saved into, tables that are not
 * there yet. setup.php (or php migration.php) applies what is pending.
 */
function requireCurrentSchema(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        if (pendingMigrationsReadOnly(db()) !== []) {
            return respondError(new \Slim\Psr7\Response(), 503, 'not_set_up', 'The database needs an update. Open /setup.php to apply it.', [], ['setup' => '/setup.php']);
        }

        return $handler->handle($request);
    };
}
