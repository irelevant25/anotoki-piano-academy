<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * One person's progress - the signed-in person's, whose IAM user id the
 * verified token gives; or, when the IAM says Piano Academy does not require
 * signing in, this browser's visitor's (requireOwner(), meddleware/auth.php;
 * api/visitors.php):
 *
 *   GET  /api/state      {progress, sessions, path, generation}: everything the app starts with.
 *                        Nobody (no token, no visitor key, sign-in not required): the empty
 *                        state with generation 0, and nothing read or written.
 *   PUT  /api/progress   the whole note-progress object, keyed by MIDI number -> 204
 *   PUT  /api/path       {steps: {"unitId/stepId": {...}}} -> 204
 *   POST /api/sessions   one finished round; the server gives it id and recordedAt
 *                        -> 201 with the stored session. With an Idempotency-Key the
 *                        browser used before: 200 with the session stored then,
 *                        and nothing added.
 *   GET  /api/me/export  their own progress as an export file (api/transfer.php),
 *                        to download; 409 export_too_large over EXPORT_LIMIT
 *   POST /api/me/import  an export into their own account (the file's userId is not
 *                        read). ?dryRun=true: what it would do, nothing written.
 *                        Into an account with progress only with ?replace=true
 *                        (409 has_progress otherwise). 422 not_an_export /
 *                        invalid_export, 413 too_large over EXPORT_LIMIT. An
 *                        import is written into the audit log (progress.imported:
 *                        the person, the counts, whether it replaced progress).
 *
 * The two PUTs name the generation of the progress they were made to (the
 * Progress-Generation header, from GET /api/state): 428 generation_required
 * without it, 409 progress_changed when an import or an administrator's
 * delete has started a new one since - and nothing is saved. A tab that gets
 * that loads the progress again; it never saves over it (api/store.php).
 *
 * Without signing in (sign-in not required): the three saves are a
 * visitor's (X-Visitor-Key) - or, from nobody, the first save makes one, in
 * the save's own transaction once its body checks out: a whole-document save
 * names generation 0 (what nobody's state said; 409 otherwise), and the
 * answer carries X-Visitor-Key, Progress-Generation (the new visitor's) and
 * Cache-Control: no-store. A visitor's document is at most
 * document_max_bytes (413 too_large), their rounds at most max_sessions
 * (422 visitor_limit); too many visitors is 429 too_many_visitors; a key
 * nobody has is 401 visitor_unknown. The own progress file (/api/me/...) is
 * for a signed-in person only (requireUser(): a visitor key never opens it).
 * With sign-in required, nobody and a visitor key are 401 sign_in_required
 * on all of them.
 *
 * While an update waits none of these runs - nothing is read from, or saved
 * into, tables that are not as the code expects yet: the site's gate answers
 * every one of them 503 update_pending first (api/index.php), POST
 * /api/sessions too. (Should a visitor's round ever reach a database without
 * 005 all the same, it answers 503 visitors_unavailable.)
 *
 * @var \Slim\App $app
 */

/** What nobody has: no progress anywhere yet - generation 0, which a first save names. */
const STATE_OF_NOBODY = '{"progress":{},"sessions":[],"path":{"steps":{}},"generation":0}';

$app->get('/api/state', function (Request $request, Response $response): Response {
    if ($request->getAttribute('nobody') === true) {
        return respondJsonText($response, STATE_OF_NOBODY);
    }

    $json = storeStateJson((int) $request->getAttribute('userId'), true);
    // A visitor whose row went since requireOwner() found it (swept, or moved at a sign-in in another tab).
    if (currentUser($request)?->visitor && str_ends_with($json, ',"generation":null}')) {
        throw visitorUnknown();
    }

    return respondJsonText($response, $json);
})->add(requireOwner('empty'));

$app->put('/api/progress', function (Request $request, Response $response): Response {
    $owner = visitorWriter($request);
    $generation = storeGenerationFrom($request->getHeaderLine(GENERATION_HEADER), $owner === null || $owner->visitor);
    $notes = storeCheckProgress(jsonBody($request, visitorBodyLimit($owner)));
    $made = dbTx(static function () use ($request, $owner, $generation, $notes): ?array {
        [$userId, $made] = visitorDocumentOwner($request, $owner, $generation);
        storeSaveProgress($userId, $notes);

        return $made;
    });

    return visitorAnswerMade($response->withStatus(204), $made);
})->add(requireOwner('make'));

$app->put('/api/path', function (Request $request, Response $response): Response {
    $owner = visitorWriter($request);
    $generation = storeGenerationFrom($request->getHeaderLine(GENERATION_HEADER), $owner === null || $owner->visitor);
    $path = storeCheckPath(jsonBody($request, visitorBodyLimit($owner)));
    $made = dbTx(static function () use ($request, $owner, $generation, $path): ?array {
        [$userId, $made] = visitorDocumentOwner($request, $owner, $generation);
        storeSavePath($userId, $path);

        return $made;
    });

    return visitorAnswerMade($response->withStatus(204), $made);
})->add(requireOwner('make'));

// A round is added, never written over anything: it needs no generation. One
// played in a tab still open after an import or a delete is a round played.
$app->post('/api/sessions', function (Request $request, Response $response): Response {
    $owner = visitorWriter($request);
    if ($owner === null) {
        // A round that would make a visitor needs 005 itself (the gate holds every route while it waits; this holds the rest).
        visitorsMustBeReady();
    }
    $session = storeCleanSession(jsonBody($request));

    $key = $request->hasHeader('Idempotency-Key') ? $request->getHeaderLine('Idempotency-Key') : null;
    if ($key !== null && !preg_match('/^[A-Za-z0-9_-]{1,100}$/D', $key)) {
        throw new ApiError(400, 'invalid_idempotency_key', 'Idempotency-Key must be up to 100 letters, digits, - and _.');
    }

    [$made, [$created, $json]] = dbTx(static function () use ($request, $owner, $session, $key): array {
        if ($owner === null) {
            $made = visitorMake($request);

            return [$made, storeAddSession($made['id'], $session, $key)];
        }

        return [null, storeAddSession($owner->id, $session, $key, visitorSessionCheck($owner))];
    });

    return visitorAnswerMade(respondJsonText($response, $json, $created ? 201 : 200), $made);
})->add(requireOwner('make'));

$app->get('/api/me/export', function (Request $request, Response $response): Response {
    $json = transferExportJson((int) $request->getAttribute('userId'));

    return respondJsonText($response, $json)->withHeader('Content-Disposition', 'attachment; filename="piano-academy-progress-' . gmdate('Y-m-d') . '.json"');
})->add(requireUser());

$app->post('/api/me/import', function (Request $request, Response $response): Response {
    $query = $request->getQueryParams();
    $flag = static fn(string $name): bool => in_array($query[$name] ?? null, ['true', '1'], true);

    try {
        $document = jsonBody($request, EXPORT_LIMIT);
    } catch (ApiError $e) {
        // A file that is not JSON is not an export: one answer for every file
        // that is not one. Too large (413) and not sent as JSON (415) stay.
        throw $e->errorCode === 'invalid_json' ? transferNotAnExport() : $e;
    }
    $data = transferReadExport($document, 'the file');
    $userId = (int) $request->getAttribute('userId');

    if ($flag('dryRun')) {
        return respondJson($response, transferPreview($userId, $data));
    }
    $replace = $flag('replace');
    // Asked first, outside the transaction: the usual refusal costs nothing.
    // transferImport() asks again under the lock, for an import that came
    // in between.
    if (!$replace) {
        $current = storeProgressCounts($userId);
        if (storeCountsHaveProgress($current)) {
            throw transferHasProgress($current);
        }
    }

    $imported = transferImport($userId, $data, $replace);
    // A person's progress replaced by a file is theirs to do - and worth being able to tell afterwards
    // (api/admin_tools.php's audit log): what came in, and whether it took the place of what was there.
    audit($request, 'progress.imported', 'user', $userId, [
        'notes' => $imported['notes'],
        'steps' => $imported['steps'],
        'sessions' => $imported['sessions'],
        'replaced' => $imported['replaced'],
    ]);

    return respondJson($response, $imported + ['leftOut' => $data['leftOut']]);
})->add(requireUser());
