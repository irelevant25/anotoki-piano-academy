<?php

declare(strict_types=1);

use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Translations\Translations;
use Anotoki\Lib\Translations\TranslationsConfig;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The app's own words, in the languages it speaks - through the anotoki
 * family's library (anotoki/lib's Anotoki\Lib\Translations, in vendor/): one
 * implementation of the family's three tables (languages, translation_keys,
 * translations) for every anotoki site - the bundle the pages read, the
 * admin panel's grid, the languages, the checks every string keeps, the
 * command line - in one wire format, the IAM's (snake_case). This file only
 * says what is Piano Academy's own: the languages its migrations write
 * strings for, its error body, who is saving. (Note names, song titles and
 * device names are not words here: they are not translated.)
 *
 * The routes are the library's (Anotoki\Lib\Translations\Http\TranslationsRoutes):
 * the bundle in routes/public.php - anybody's, no token looked at - and the
 * admin panel's in routes/admin.php, each group behind this app's own role
 * check: the strings for the staff (EDITOR or ADMIN), the languages for
 * ADMIN alone. Who may do what is this app's, never the library's.
 *
 * These tables are the site's, not one person's - the one thing in this
 * backend that is not keyed by a user id. A user id appears in one place:
 * who last reworded a string (translations.updated_by) - the request's
 * person, from the verified token, never anything a body says.
 *
 * A key is the code's: migrations write the keys and their first strings
 * (migrations/piano_academy/), the browser only ever changes a string. The
 * library's own keys, anotoki.* - the words of the family's kit and of its
 * status page - are written by the library's migration set
 * (anotoki_translations, after this app's own), and the owner rewords them
 * on the Translations page like any other.
 */

/**
 * The languages the migrations write strings for. They cannot be deleted: the
 * next migration with strings would fail on the missing language, and a failed
 * migration closes the whole site - on a host with no shell to mend it from.
 * tests/unit/translations.test.php keeps this list true.
 */
const TRANSLATION_RELEASED_LANGUAGES = ['en', 'sk'];

/** What is this app's own of the words: the library's defaults, and the languages it is released in. */
function translationsConfig(): TranslationsConfig
{
    static $config = null;

    return $config ??= new TranslationsConfig(releasedLanguages: TRANSLATION_RELEASED_LANGUAGES);
}

/** The words on $pdo - the app's own connection when none is given (the command line and the tests bring theirs). */
function translations(?PDO $pdo = null): Translations
{
    return new Translations($pdo ?? db(), translationsConfig());
}

/**
 * A refusal of the library's in the app's one error shape - {error, code,
 * ...what it is about} - as the error handler writes every other one
 * (api/index.php).
 */
function translationsRefused(Response $response, Refusal $refusal): Response
{
    return respondError($response, $refusal->status, $refusal->code, $refusal->message, [], $refusal->extra);
}

/**
 * Who is saving a string: the person of the verified token, whom the route
 * group's requireRole() put on the request - never what a body says.
 */
function translationsWriter(Request $request): ?int
{
    $id = $request->getAttribute('userId');

    return is_int($id) && $id > 0 ? $id : null;
}
