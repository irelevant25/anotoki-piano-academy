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
 *   routes/public.php         GET /api/health, GET /api/auth/config (anotoki/lib's
 *                             AuthRoutes::config()), GET /api/translations/{code} (its
 *                             TranslationsRoutes::bundle()), GET /api/site-status,
 *                             POST /api/feedback (the form at the foot of every page:
 *                             its FeedbackRoutes::public()), POST /api/client-errors (an
 *                             error a page met, into the error log: its
 *                             ErrorLogRoutes::client())
 *   routes/progress.php       GET /api/state, PUT /api/progress, PUT /api/path, POST /api/sessions
 *                             (a person's or - when the IAM says sign-in is not required - a
 *                             visitor's, api/visitors.php), GET /api/me/export, POST /api/me/import
 *   routes/visitor.php        POST /api/visitor/move: at sign-in, this browser's visitor's progress
 *                             into the person's account (the token and the key)
 *   routes/admin.php          the admin panel's, by role - EDITOR or ADMIN (anotoki/lib's
 *                             TranslationsRoutes::strings()):
 *                             GET /api/admin/languages, GET, PUT /api/admin/translations,
 *                             GET /api/admin/translations/{code}/export,
 *                             PUT /api/admin/translations/{code}/import;
 *                             ADMIN: POST /api/admin/languages,
 *                             PUT, DELETE /api/admin/languages/{code} (TranslationsRoutes::languages()),
 *                             GET /api/admin/people, DELETE /api/admin/people/{sub},
 *                             POST /api/admin/people/sync (PeopleRoutes::admin()),
 *                             GET /api/admin/migrations, GET /api/admin/migrations/file,
 *                             POST /api/admin/migrations/apply (MigrationsRoutes::admin()),
 *                             the admin tools (api/admin_tools.php): /api/admin/errors...,
 *                             /api/admin/audit..., /api/admin/feedback..., /api/admin/backups...
 *                             - and GET /api/admin/backups/{id}/file?ticket=, a backup's
 *                             download, whose single-use ticket is its only check
 *
 * The middleware, outermost first: security headers -> the error log's (anotoki/lib's
 * ErrorLogMiddleware::outer(): an answer worth seeing, written down) -> the error
 * handler (wrapped by the error log: every exception it answers written down) -> the
 * site's gate (anotoki/lib's SiteGate: where the site stands, below) -> the daily
 * backup, after an answer that went well -> the people's scrub (anotoki/lib's
 * PeopleUpkeep: the IAM's deleted accounts, at most hourly, after the answer) ->
 * who the request is (anotoki/lib's Identify, for every route but the public ones:
 * meddleware/auth.php) -> routing -> on the progress routes, whose own progress it
 * is (the person or the visitor); on the move and the own file, the person; on the
 * admin routes, the person and their role, on each group.
 *
 * The gate answers before any route runs (siteState(), api/migrations.php):
 * not set up - config/*.local.php missing, incomplete or not PHP that runs - every path but
 * GET /api/site-status is 503 {code: "not_set_up", installed, message}, with
 * "setup": "/setup.php" only while the site was never installed; an update
 * pending - a migration waiting - every path but siteOpenPaths() and the
 * status is 503 {code: "update_pending", message} with Retry-After: 60, so
 * nothing runs on tables that are not there yet; unavailable (the database
 * out of reach) and ready: through, and a dead database is the error
 * handler's 503 database_unavailable as ever.
 *
 * After the answer is written, the work a request queued for then
 * (api/after_response.php: the sweep of visitors unseen for 30 days, the
 * people's scrub, the daily backup, feedback's prune).
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/meddleware/security.php';
require_once __DIR__ . '/meddleware/auth.php';

use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Backups\Http\BackupsRoutes;
use Anotoki\Lib\ErrorLog\ErrorLogMiddleware;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\People\Http\PeopleUpkeep;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;
use Slim\Factory\AppFactory;

/**
 * What still answers while an update waits: the sign-in settings, the app's
 * words (exactly GET /api/translations/{code}: the library's own pattern,
 * TranslationsRoutes::openPath()), the health check, the Migrations page's
 * routes - so people can sign in, the pages have their words, and an
 * administrator reaches Apply - and the two admin tools that need no table:
 * the error log (what went wrong with the update) and the backups (one made
 * just before Apply is the point; never a restore). (GET /api/site-status
 * always does.) A path is exact, or a pattern when it starts with ~.
 *
 * @return list<string>
 */
function siteOpenPaths(): array
{
    return [
        AuthRoutes::openPath(),
        '/api/health',
        TranslationsRoutes::openPath(),
        // Exactly the Migrations page's three routes: a crafted path under them stays held.
        '~^/api/admin/migrations(/file|/apply)?$~D',
        ...ErrorLogRoutes::openPaths(),
        ...BackupsRoutes::openPaths(),
    ];
}

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
    $errorLog = errorLog($app);

    require __DIR__ . '/routes/public.php';
    require __DIR__ . '/routes/progress.php';
    require __DIR__ . '/routes/visitor.php';
    require __DIR__ . '/routes/admin.php';

    // Added in this order, so they run the other way round.
    $app->add(identify($app->getResponseFactory()));
    $app->add(new PeopleUpkeep(people(), static fn(): bool => siteState()->state() === SiteState::READY, afterResponse(...)));
    // The day's backup (anotoki/lib's Backups: the first answer of a UTC day that went well, after it).
    $app->add(static function (Request $request, RequestHandler $handler): Response {
        $response = $handler->handle($request);
        if ($response->getStatusCode() < 500) {
            backups()->dailyIfDue();
        }

        return $response;
    });
    $app->add(new SiteGate(siteState(), $app->getResponseFactory(), siteOpenPaths()));

    $errorMiddleware = $app->addErrorMiddleware(false, false, false);
    $errorMiddleware->setDefaultErrorHandler(
        $errorLog->wrapHandler(function (Request $request, Throwable $exception) use ($app): Response {
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
        }),
    );

    $app->add(ErrorLogMiddleware::outer($errorLog));
    $app->add(securityHeaders());

    return $built = $app;
}

// The tests build the app themselves; nothing is served while they load this file.
if (!defined('PIANO_NO_RUN')) {
    $pianoApp = buildPianoApp();
    // PHP's own fatal errors and warnings, written into the error log too (a warning is an exception here:
    // api/bootstrap.php's handler runs first, and the exception is written where it is answered).
    errorLog()->installPhpHandlers();
    $pianoApp->run();
    afterResponseRun();
}
