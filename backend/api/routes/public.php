<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Feedback\Http\FeedbackRoutes;
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Translations;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The routes anybody may call:
 *
 *   GET  /api/health              is the API up: {ok} - and, asked from this computer,
 *                                 which database it uses and the migrations it still
 *                                 needs: {ok, database, pending} (the tests read that;
 *                                 the library's files named with their set,
 *                                 "anotoki_translations/001_....sql")
 *   GET  /api/auth/config         how the browser signs in through the anotoki IAM, and
 *                                 whether the IAM says this app requires sign-in - in the
 *                                 library's words (anotoki/lib's AuthRoutes::config()):
 *                                 {issuer, client_id, login_required, sign_in_available}
 *                                 (login_required: the IAM's switch, kept a minute, true
 *                                 when unknown; sign_in_available: false once the IAM
 *                                 said it does not know this app - a 404)
 *   GET  /api/translations/{code} the app's words in a language, with the languages on
 *                                 offer (anotoki/lib's TranslationsRoutes::bundle(), the
 *                                 IAM's wire format): {language, languages: [{code, name,
 *                                 native_name}], values, english?}; "sk-sk" is answered by
 *                                 "sk" when only that is offered; 503
 *                                 translations_unavailable (Retry-After 60) while the
 *                                 database has no words yet
 *   GET  /api/site-status         where the site stands: {state: "ready" | "not_set_up" |
 *                                 "update_pending" | "unavailable", installed} - and
 *                                 nothing else (anotoki/lib's MigrationsRoutes::status());
 *                                 answered in every state, not set up too
 *   POST /api/feedback            a message from the form at the foot of every page
 *                                 (anotoki/lib's FeedbackRoutes::public()): {kind, section?,
 *                                 subject?, message, email?, page?, language?, anonymous?}
 *                                 -> 201 {ok: true}. Who sent it comes from the token alone
 *                                 (nobody for a visitor), the reply address from the form
 *                                 alone (the server fills none in); nothing of where it came
 *                                 from is kept; 5 an hour and 20 a day from one sender - a
 *                                 person by their account, a visitor by their address bucket
 *                                 - and 300 a day from the visitors, as many from the people
 *                                 signed in (429 too_many); 422 for what the form checks too;
 *                                 503 feature_unavailable while its table waits
 *   POST /api/client-errors       an error a page met in the browser (anotoki/lib's
 *                                 ErrorLogRoutes::client(); its Angular reporter,
 *                                 provideAnotokiErrorReport()): {type?, message, page?,
 *                                 stack?, status?} -> 204, into the error log as `source:
 *                                 client`, redacted again; JSON only (415), 8 KB at most
 *                                 (413), a message (422); 20 an hour from one sender - a
 *                                 person by their account, a visitor by their address bucket
 *                                 - and 500 a day from the visitors, as many from the people
 *                                 signed in (429 too_many)
 *
 * The first three answer while an update waits too (siteOpenPaths() in
 * api/index.php): somebody can sign in then, and the pages have their words.
 * The first four read no token at all (meddleware/auth.php's publicPaths());
 * the last two read who is asking as every route does (identify()) - a token
 * that does not check out is 401 there too.
 *
 * @var \Slim\App $app
 */

$app->get('/api/health', function (Request $request, Response $response): Response {
    $health = ['ok' => true];

    if (isLoopback(requestRemoteAddr($request))) {
        $health['database'] = dbName();
        $health['pending'] = array_map('migrationLabel', databaseMigrator()->applicable());
    }

    return respondJson($response, $health);
});

// The IAM, this app's client id there, and whether the IAM requires a sign-in here: relayed, so the browser never
// asks the IAM about this app.
AuthRoutes::config($app, signInRule(), iamClient());

// No middleware for who is asking, on purpose: the words are the same for
// everybody, and the sign-in screen and the boot pages need them before anybody
// has signed in. So a token - even one that would not check out - is not
// looked at: public words, nothing of anybody's. The only route under
// /api/translations/: a code that is none is a 404 before any query; the
// strings change when the owner saves one, or with a release, so the browser
// asks every time (Cache-Control: no-cache) and is told "the same as you have"
// (304, the ETag compared the weak way - also as a server that compresses
// sends it back).
//
// It answers while an update waits, from the words the database has then. A
// database that has not got the words' tables yet (002 among what waits) - or
// no English string at all - has none to give: 503 translations_unavailable,
// and the app draws its shell from the English it keeps meanwhile.
TranslationsRoutes::bundle($app, static fn (): Translations => translations(), translationsRefused(...));

// Where the site stands, for the pages (the frontend's SiteStatus): asked as
// the app starts, and again by the page that waits for an update. The gate
// lets it through whatever the state.
MigrationsRoutes::status($app, siteState());

// The feedback form's messages (api/admin_tools.php's feedback()): anybody's - a visitor's and nobody's too -
// the sender from the token alone.
FeedbackRoutes::public($app, '/api/feedback', feedback(), adminContext(), feedbackSender(...));

// The pages' own errors (the owner's decision of 2026-10-11: every site's error log holds them), from the
// library's reporter in the browser: anybody's, behind the site's gate and its identify() like any route, counted
// by the library's limits - a person by their account (adminContext()'s actorId), a visitor by their address
// bucket (its trusted proxies: Cloudflare's).
ErrorLogRoutes::client($app, '/api/client-errors', errorLog(), adminContext());
