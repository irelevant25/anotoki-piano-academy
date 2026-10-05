<?php

declare(strict_types=1);

/**
 * Work that belongs to a request but not to its answer - the sweep of
 * visitors unseen for 30 days (api/visitors.php) - done after the answer.
 * A port of the build analyzer's App\Web\AfterResponse.
 *
 * api/index.php runs it once Slim has written the answer
 * (afterResponseRun()): PHP-FPM and LiteSpeed close the connection first
 * (fastcgi_finish_request(), litespeed_finish_request()); where PHP cannot
 * (mod_php, PHP's built-in server - the tests), the answer is flushed and
 * the work runs before the script ends, so the person waits a moment longer
 * - which is why the work keeps a time budget of its own. A browser that
 * goes away meanwhile does not stop it halfway (ignore_user_abort()). Each
 * piece runs on its own: a failure is logged ("[after] ...") and never
 * reaches the answer, nor stops the next piece.
 */

/** Queues $work for after this request's answer. */
function afterResponse(callable $work): void
{
    // From here on a browser that leaves does not stop the script: the
    // work runs whether or not anybody is still reading.
    ignore_user_abort(true);
    afterResponseQueue($work);
}

/**
 * The queue: with $add, adds to it; without, hands the whole of it over and
 * empties it.
 *
 * @return callable[]
 */
function afterResponseQueue(?callable $add = null): array
{
    static $work = [];

    if ($add !== null) {
        $work[] = $add;

        return [];
    }
    $all = $work;
    $work = [];

    return $all;
}

/** api/index.php, after the answer is written: the queued work, each piece on its own. */
function afterResponseRun(): void
{
    $work = afterResponseQueue();
    if ($work === []) {
        return;
    }
    ignore_user_abort(true);
    if (PHP_SAPI !== 'cli') {
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            litespeed_finish_request();
        } else {
            while (ob_get_level() > 0) {
                @ob_end_flush();
            }
            flush();
        }
    }
    foreach ($work as $piece) {
        try {
            $piece();
        } catch (Throwable $e) {
            error_log('[after] ' . get_class($e) . ': ' . $e->getMessage());
        }
    }
}
