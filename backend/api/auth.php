<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Who a request acts as.
 *
 *   auth mode "iam"   the access token from the anotoki IAM, checked here with
 *                     the vendored verifier (api/anotoki_iam.php, v1.0.1): RS256,
 *                     typ at+jwt, the IAM's published keys, iss, aud, exp. Its
 *                     `sub` is the user id. Who may have a token at all is the
 *                     IAM's decision: the application is "members" only. One
 *                     role is read here: ADMIN is the site's owner.
 *   auth mode "none"  no login: every request acts as local_user_id. Only for
 *                     the owner's own computer, so it is only honoured under
 *                     PHP's built-in web server and for requests from this
 *                     computer; a hosted site (Apache) never runs without the IAM.
 *
 * The mode is the installation's setting (config/auth.local.php) - never
 * anything a request says.
 */

/** 'none' only when the settings say exactly that; anything else is 'iam', which needs a login. */
function authMode(): string
{
    return (authSettings()['mode'] ?? null) === 'none' ? 'none' : 'iam';
}

/** The owner's IAM user id, which auth mode "none" acts as. */
function authLocalUserId(): int
{
    $id = authSettings()['local_user_id'] ?? null;
    if (!(is_int($id) || (is_string($id) && ctype_digit($id))) || (int) $id < 1) {
        throw new RuntimeException('local_user_id in config/auth.local.php must be an IAM user id (a whole number, 1 or more).');
    }

    return (int) $id;
}

/** A path from the settings: relative ones are relative to backend/. */
function settingsPath(string $path): string
{
    return preg_match('~^([A-Za-z]:)?[\\\\/]~', $path) ? $path : PIANO_BACKEND . '/' . $path;
}

/** The verifier's settings, from ours. */
function authIamConfig(): array
{
    $auth = authSettings();
    $config = [
        'issuer' => rtrim((string) $auth['issuer'], '/'),
        'client_id' => (string) $auth['client_id'],
        'cache_dir' => settingsPath((string) $auth['cache_dir']),
    ];
    // The tests' own key set, instead of downloading the IAM's.
    if (is_string($auth['jwks_file'] ?? null) && $auth['jwks_file'] !== '') {
        $config['jwks_file'] = $auth['jwks_file'];
    }

    return $config;
}

/** What the browser needs to sign in: GET /api/auth/config. */
function authPublicConfig(): array
{
    if (authMode() === 'none') {
        return ['mode' => 'none'];
    }
    $auth = authSettings();

    return ['mode' => 'iam', 'issuer' => rtrim((string) $auth['issuer'], '/'), 'clientId' => (string) $auth['client_id']];
}

/** 127.0.0.1 and the like, ::1, and the IPv4-mapped form of 127.x. */
function isLoopback(string $ip): bool
{
    if ($ip === '::1') {
        return true;
    }
    if (strncasecmp($ip, '::ffff:', 7) === 0) {
        $ip = substr($ip, 7);
    }

    return (bool) preg_match('/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/D', $ip);
}

/** A Host header naming this computer: localhost, [::1] or 127.x, with any port. */
function isLocalHostName(string $host): bool
{
    $name = strtolower((string) preg_replace('/:\d+$/', '', trim($host)));

    return $name === 'localhost' || $name === '[::1]' || isLoopback($name);
}

/**
 * Headers whose presence means a proxy relayed the request: then it did not
 * come from this computer, whatever REMOTE_ADDR says. (The same list as the
 * IAM's setup.)
 */
const FORWARDING_HEADERS = [
    'HTTP_FORWARDED', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED_HOST', 'HTTP_X_FORWARDED_PROTO',
    'HTTP_X_REAL_IP', 'HTTP_CLIENT_IP', 'HTTP_TRUE_CLIENT_IP', 'HTTP_CF_CONNECTING_IP', 'HTTP_X_CLUSTER_CLIENT_IP',
];

/** Did a proxy relay this request? $server is $_SERVER (or a PSR-7 request's server params). */
function wasForwarded(array $server): bool
{
    foreach (FORWARDING_HEADERS as $header) {
        if (isset($server[$header]) && $server[$header] !== '') {
            return true;
        }
    }

    return false;
}

/**
 * May a request go without a login - auth mode "none", or setup.php without
 * its token? Only under PHP's built-in web server (php -S, which the
 * launchers bind to 127.0.0.1), only for a request from this computer that no
 * proxy relayed, and only when the browser asked for this computer by name: a
 * page elsewhere that points its own host name at 127.0.0.1 (DNS rebinding)
 * would otherwise read and change the owner's progress. Under Apache - a
 * hosted site - never: behind a proxy every request looks local.
 */
function noLoginAllowed(string $sapi, string $remoteAddr, string $host, bool $forwarded = false): bool
{
    return !$forwarded && $sapi === 'cli-server' && isLoopback($remoteAddr) && isLocalHostName($host);
}

/** The IAM role, of this application, that makes somebody the site's owner. */
const OWNER_ROLE = 'ADMIN';

/**
 * Who a request acts as, after recording the visit in users: the IAM user id,
 * and whether that person is the site's owner - the one who may change the
 * app's own words (api/translations.php).
 *
 *   auth mode "none"  the owner's own computer: whoever gets past
 *                     noLoginAllowed() is the owner, as local_user_id.
 *   auth mode "iam"   the owner is whoever the IAM gives the role ADMIN of
 *                     this application - read from the verified token's
 *                     `roles`, and from nothing else a request carries.
 *
 * ApiError 401 (no usable token) or 403 (auth mode "none" asked from
 * elsewhere). Why a token was refused goes to the server log, never to the
 * client: to somebody holding a token that did not work, the answer is the same.
 *
 * @return array{id: int, owner: bool}
 */
function requestUser(Request $request): array
{
    if (authMode() === 'none') {
        if (!noLoginAllowed(PHP_SAPI, requestRemoteAddr($request), $request->getHeaderLine('Host'), wasForwarded($request->getServerParams()))) {
            throw new ApiError(403, 'local_only', 'Sign-in is switched off in this copy of the app, so it only answers the computer it runs on.');
        }
        $id = authLocalUserId();
        usersSeen($id, null);

        return ['id' => $id, 'owner' => true];
    }

    if (!function_exists('openssl_verify')) {
        throw new RuntimeException('Signing in needs PHP\'s openssl extension, and this PHP has none.');
    }

    $header = $request->getHeaderLine('Authorization');
    $token = anotoki_iam_bearer_token($header !== '' ? $header : anotoki_iam_authorization_header());
    if ($token === null) {
        throw new ApiError(401, 'sign_in_required', 'Please sign in.', ['WWW-Authenticate' => 'Bearer realm="piano-academy"']);
    }

    $claims = anotoki_iam_verify_access_token($token, authIamConfig(), $reason);
    if ($claims === null) {
        error_log('[auth] token refused: ' . $reason);
        throw new ApiError(401, 'invalid_token', 'Your sign-in has run out. Please sign in again.', [
            'WWW-Authenticate' => 'Bearer realm="piano-academy", error="invalid_token"',
        ]);
    }

    $id = (int) anotoki_iam_user_id($claims);
    $name = $claims['preferred_username'] ?? null;
    usersSeen($id, is_string($name) && trim($name) !== '' ? textClip(trim($name), 200) : null);

    return ['id' => $id, 'owner' => in_array(OWNER_ROLE, anotoki_iam_roles($claims), true)];
}

/** The IAM user id a request acts as (see requestUser()). */
function requestUserId(Request $request): int
{
    return requestUser($request)['id'];
}

/**
 * Keeps the users row of a request's user: made on the first visit, the
 * username refreshed from the token when it changes, last_seen_at at most
 * every five minutes (not on every key press's save). A null username (auth
 * mode "none") leaves the stored one alone.
 */
function usersSeen(int $id, ?string $username): void
{
    if ($username === null) {
        dbExec(
            "INSERT INTO users (id) VALUES (?)
             ON CONFLICT (id) DO UPDATE SET last_seen_at = now()
             WHERE users.last_seen_at < now() - interval '5 minutes'",
            [$id]
        );

        return;
    }

    dbExec(
        "INSERT INTO users (id, preferred_username) VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET preferred_username = EXCLUDED.preferred_username, last_seen_at = now()
         WHERE users.preferred_username IS DISTINCT FROM EXCLUDED.preferred_username
            OR users.last_seen_at < now() - interval '5 minutes'",
        [$id, $username]
    );
}
