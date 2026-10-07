<?php

declare(strict_types=1);

/**
 * The API's front controller.
 *
 * On the live site api/.htaccess sends every /api/... request here (the web
 * root's own .htaccess, written by tools/build.php, lets /api/ through to it).
 * Under PHP's built-in server router.php does the same. Slim routes on the
 * original path, so every route starts with /api/.
 *
 *   routes/public.php         GET /api/health, GET /api/auth/config, GET /api/translations/{code},
 *                             GET /api/site-status
 *   routes/progress.php       GET /api/state, PUT /api/progress, PUT /api/path, POST /api/sessions
 *                             (a person's or - when the IAM says sign-in is not required - a
 *                             visitor's, api/visitors.php), GET /api/me/export, POST /api/me/import
 *   routes/visitor.php        POST /api/visitor/move: at sign-in, this browser's visitor's progress
 *                             into the person's account (the token and the key)
 *   routes/admin.php          the admin panel's, by role - EDITOR or ADMIN:
 *                             GET /api/admin/languages, GET, PUT /api/admin/translations,
 *                             GET /api/admin/translations/{code}/export,
 *                             PUT /api/admin/translations/{code}/import;
 *                             ADMIN: POST /api/admin/languages,
 *                             PUT, DELETE /api/admin/languages/{code},
 *                             GET /api/admin/people, DELETE /api/admin/people/{id},
 *                             GET /api/admin/migrations, GET /api/admin/migrations/file,
 *                             POST /api/admin/migrations/apply
 *
 * The middleware, outermost first: security headers -> the error handler ->
 * the site's gate (anotoki/lib's SiteGate: where the site stands, below) ->
 * routing -> on the progress routes, the person or visitor the request comes
 * from (meddleware/auth.php); on the move, the person; on the admin routes,
 * the person and their role, on each group.
 *
 * The gate answers before any route runs (siteState(), api/migrations.php):
 * not set up - config/*.local.php missing, incomplete or not PHP that runs - every path but
 * GET /api/site-status is 503 {code: "not_set_up", installed, message}, with
 * "setup": "/setup.php" only while the site was never installed; an update
 * pending - a migration waiting - every path but SITE_OPEN_PATHS and the
 * status is 503 {code: "update_pending", message} with Retry-After: 60, so
 * nothing runs on tables that are not there yet; unavailable (the database
 * out of reach) and ready: through, and a dead database is the error
 * handler's 503 database_unavailable as ever.
 *
 * After the answer is written, the work a request queued for then
 * (api/after_response.php: the sweep of visitors unseen for 30 days).
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/meddleware/security.php';
require_once __DIR__ . '/meddleware/auth.php';

use Anotoki\Lib\Migrations\Http\SiteGate;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;
use Slim\Factory\AppFactory;

/**
 * What still answers while an update waits: the sign-in settings, the app's
 * words, the health check and the Migrations page's routes - so people can
 * sign in, the pages have their words, and an administrator reaches Apply.
 * (GET /api/site-status always does.) A path is exact, or a pattern when it
 * starts with ~.
 */
const SITE_OPEN_PATHS = [
    '/api/auth/config',
    '/api/health',
    '~^/api/translations/[^/]+$~',
    // Exactly the Migrations page's three routes: a crafted path under them stays held.
    '~^/api/admin/migrations(/file|/apply)?$~D',
];

/**
 * The application: every route and middleware, not yet running. Built once -
 * the route files are required here, and a second build would register them
 * twice.
 */
function buildPianoApp(): \Slim\App
{
    static $built = null;

    if ($built !== null) {
        return $built;
    }

    $app = AppFactory::create();

    require __DIR__ . '/routes/public.php';
    require __DIR__ . '/routes/progress.php';
    require __DIR__ . '/routes/visitor.php';
    require __DIR__ . '/routes/admin.php';

    // Added in this order, so they run the other way round.
    $app->add(new SiteGate(siteState(), $app->getResponseFactory(), SITE_OPEN_PATHS));

    $errorMiddleware = $app->addErrorMiddleware(false, false, false);
    $errorMiddleware->setDefaultErrorHandler(function (Request $request, Throwable $exception) use ($app): Response {
        $response = $app->getResponseFactory()->createResponse();

        if ($exception instanceof ApiError) {
            return respondError($response, $exception->status, $exception->errorCode, $exception->getMessage(), $exception->headers, $exception->extra);
        }
        if ($exception instanceof HttpNotFoundException) {
            return respondError($response, 404, 'not_found', 'Not found');
        }
        if ($exception instanceof HttpMethodNotAllowedException) {
            return respondError($response, 405, 'method_not_allowed', 'Method not allowed', ['Allow' => implode(', ', $exception->getAllowedMethods())]);
        }
        // (No case for NotSetUp: without the settings the gate answers before any route could ask for them.)
        if ($exception instanceof PDOException) {
            error_log('[db] ' . $exception->getMessage());

            return respondError($response, 503, 'database_unavailable', 'The database is not reachable right now.');
        }

        error_log('[server] ' . get_class($exception) . ': ' . $exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine());

        return respondError($response, 500, 'server_error', 'Something went wrong on the server.');
    });

    $app->add(securityHeaders());

    return $built = $app;
}

// The tests build the app themselves; nothing is served while they load this file.
if (!defined('PIANO_NO_RUN')) {
    buildPianoApp()->run();
    afterResponseRun();
}
