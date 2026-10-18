<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * At sign-in, the progress this browser made without signing in becomes the
 * signed-in person's - the one place the two meet, so it takes both: the
 * person's token (requireUser()) and the visitor's key, which this route
 * reads itself (the library's Identify never reads a key beside a Bearer
 * header: meddleware/auth.php).
 *
 *   POST /api/visitor/move   X-Visitor-Key: <key>
 *        -> {found, notes: {moved, kept}, steps: {moved, merged, kept}, sessions, generation}
 *
 * In one transaction (visitorMove() in api/visitors.php): the notes the
 * person has stay as they are, the visitor's others are added; a path step
 * both have is merged so a pass is never lost, the visitor's others are
 * added; every round of the visitor's becomes the person's; then the visitor
 * is gone, and its key opens nothing from then on. A key nobody has - moved
 * already by another tab, swept, never there - is {found: false} with zeros,
 * so the move can be asked again safely. No key, or one that is not a key:
 * 422 invalid (field visitor_key). Another request holding the visitor or
 * the person a moment too long: 503 visitor_move_retry with Retry-After
 * (ask again). The person's own row deleted meanwhile (the People page): 401
 * sign_in_required, nothing moved.
 *
 * It works whether or not the IAM says Piano Academy requires sign-in:
 * switching that on stops a key from being somebody, not from being handed
 * in with a token - so what a visitor practised still comes into their
 * account when they sign in.
 *
 * @var \Slim\App $app
 */

$app->post('/api/visitor/move', function (Request $request, Response $response): Response {
    $key = visitorKeyOf($request);
    if ($key === null || preg_match(VISITOR_KEY_PATTERN, $key) !== 1) {
        throw new ApiError(
            422,
            'invalid',
            $key === null ? 'Send the key of the progress made without signing in: the X-Visitor-Key header.' : 'The X-Visitor-Key header is not a key this server hands out.',
            [],
            ['field' => 'visitor_key'],
        );
    }

    return respondJson($response, visitorMove(currentUser($request), $key));
})->add(requireUser());
