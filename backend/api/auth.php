<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Who a request comes from: the access token of the anotoki IAM, checked here
 * with the vendored SDK (api/anotoki_iam.php, v1.1.0) - RS256, typ at+jwt,
 * the IAM's published keys, iss, aud, exp. Its `sub` is the user id, its
 * `roles` this application's roles for them:
 *
 *   MEMBER   every anotoki account holds it, in every application: an
 *            ordinary learner - no check here needs it or refuses it
 *   EDITOR   rewords the app's words (the Translations page, a language's
 *            strings as a file and back)
 *   ADMIN    all of that, and adds, changes and deletes languages, applies a
 *            database update, and sees and deletes people's data
 *
 * Anybody else signed in learns, with their own progress. The IAM decides who
 * may sign in here (the roles of this application that may sign in - MEMBER
 * among them; taking a person's MEMBER away refuses their next sign-in and
 * refresh, while the access token they hold verifies until it runs out, a few
 * minutes). Roles are granted in the IAM's admin panel, and taking one away
 * reaches this app within one token's lifetime. There is no login of the
 * app's own and no configured owner - a person is only ever who a verified
 * token says.
 *
 * Only the Bearer scheme is a sign-in: a request whose Authorization header
 * is `Bearer ...` (with or without a token after it) is that person or a 401,
 * never anything else. Any other scheme - `Basic ...`, which a host behind a
 * password file sends with every request - says nothing about who is using
 * the app, and counts as no header at all.
 *
 * Whether the app requires sign-in is the IAM's switch for this application
 * (authLoginRequired(): the SDK's reader, kept for a minute in cache_dir,
 * true - required - whenever nothing better is known), relayed to the browser
 * by GET /api/auth/config.
 *
 * Who a request is, in this order - for every route that reads a person's
 * progress or saves it (requireOwner() in meddleware/auth.php - with the
 * move at sign-in, POST /api/visitor/move, the only reader of a visitor key):
 *
 *   1. An Authorization header of the Bearer scheme (with or without a token
 *      after it): that person, or 401 - a token that does not verify never
 *      falls back to anything, and the visitor key is not even read.
 *   2. Else, when the IAM says sign-in is required: 401 sign_in_required. A
 *      visitor key sent along is never looked up, counted or swept early.
 *   3. Else an X-Visitor-Key: that visitor (api/visitors.php) - a users row
 *      of this app's own with a negative id, no name and no role; a key
 *      nobody has, or one whose row went while the request was on its way
 *      (swept, or moved into an account at sign-in): 401 visitor_unknown.
 *   4. Else nobody: GET /api/state answers the empty state, and a first save
 *      makes a visitor (in the save's own transaction, within the limits).
 *
 * A visitor never passes requireUser() or requireRole() (signedInUser()
 * refuses one): never the admin panel, the own progress file, or anybody
 * else's data.
 */

const ROLE_ADMIN = 'ADMIN';
const ROLE_EDITOR = 'EDITOR';

/** The roles that may use the admin panel: reword the app's words. */
const ROLES_STAFF = [ROLE_ADMIN, ROLE_EDITOR];

/** Who a request comes from, once the token is checked. */
final class SiteUser
{
    /**
     * @param string[] $roles
     * @param bool     $visitor somebody practising without signing in (api/visitors.php): a negative id,
     *                          no name, no role - never somebody a token says
     */
    public function __construct(
        public readonly int $id,
        public readonly ?string $name,
        public readonly array $roles,
        public readonly bool $visitor = false,
    ) {
    }

    /** Has any one of $roles. */
    public function has(string ...$roles): bool
    {
        return array_intersect($roles, $this->roles) !== [];
    }
}

/** A path from the settings: relative ones are relative to backend/. */
function settingsPath(string $path): string
{
    return preg_match('~^([A-Za-z]:)?[\\\\/]~', $path) ? $path : PIANO_BACKEND . '/' . $path;
}

/** The SDK's settings, from ours. */
function authIamConfig(): array
{
    $auth = authSettings();
    $config = [
        'issuer' => rtrim((string) $auth['issuer'], '/'),
        'client_id' => (string) $auth['client_id'],
        'cache_dir' => settingsPath((string) $auth['cache_dir']),
    ];
    // The tests' own key set, instead of downloading the IAM's; and the IAM's
    // answer about this application as a file, instead of asking it.
    foreach (['jwks_file', 'application_file'] as $key) {
        if (is_string($auth[$key] ?? null) && $auth[$key] !== '') {
            $config[$key] = $auth[$key];
        }
    }
    // How long that answer is kept (60 s) and waited for (2 s): the SDK's
    // defaults unless a setting says otherwise (a browser check that switches
    // sign-in mid-run keeps it for a second).
    foreach (['application_ttl', 'application_timeout'] as $key) {
        if (is_int($auth[$key] ?? null) && $auth[$key] > 0) {
            $config[$key] = $auth[$key];
        }
    }

    return $config;
}

/**
 * Whether this app requires sign-in: the IAM's switch for it, read by the
 * SDK (anotoki_iam_login_required()) - asked at most once a minute (single
 * flight: while one request asks, the others use the last answer), kept in
 * cache_dir, and true whenever nothing better is known: an IAM out of reach
 * with no answer ever read, an unknown or switched-off application (404), an
 * answer that is not about this application. Only a request without a token
 * asks; a signed-in one never waits on it.
 */
function authLoginRequired(): bool
{
    $required = anotoki_iam_login_required(authIamConfig(), $reason);
    // Once per failed ask: the SDK then waits a minute before the next one.
    if ($reason === 'stale' || $reason === 'never_read') {
        error_log('[auth] the IAM did not say whether sign-in is required (' . $reason . '): '
            . ($required ? 'required' : 'not required, as last read'));
    }

    return $required;
}

/**
 * What the browser needs to sign in: GET /api/auth/config - the IAM, this
 * app's client id there, and whether the app requires sign-in (relayed, so
 * the browser never asks the IAM for it).
 */
function authPublicConfig(): array
{
    $auth = authSettings();

    return [
        'issuer' => rtrim((string) $auth['issuer'], '/'),
        'clientId' => (string) $auth['client_id'],
        'loginRequired' => authLoginRequired(),
    ];
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
 * Is this the developer's own computer asking - setup.php without its token?
 * Only under PHP's built-in web server (php -S), only for a request from this
 * computer that no proxy relayed, and only when the browser asked for this
 * computer by name: a page elsewhere that points its own host name at
 * 127.0.0.1 (DNS rebinding) would otherwise drive the setup. Under Apache - a
 * hosted site - never: behind a proxy every request looks local.
 */
function isThisComputer(string $sapi, string $remoteAddr, string $host, bool $forwarded = false): bool
{
    return !$forwarded && $sapi === 'cli-server' && isLoopback($remoteAddr) && isLocalHostName($host);
}

/**
 * The person a request comes from, after recording the visit in users - or
 * null when it sends no Bearer header at all. A Bearer header that is there
 * must hold a token that checks out: ApiError 401 otherwise, whatever the
 * route - it never counts as nobody, and never as somebody without a role.
 * Another scheme (`Basic ...`, from a host behind a password file) is no
 * sign-in and counts as no header. Why a token was refused goes to the
 * server log, never to the client: to somebody holding a token that did not
 * work, the answer is the same.
 */
function requestUser(Request $request): ?SiteUser
{
    $header = $request->getHeaderLine('Authorization');
    // Apache under CGI/FastCGI may hand the header over only as
    // REDIRECT_HTTP_AUTHORIZATION: the SDK reads that too.
    $header = $header !== '' ? $header : (string) anotoki_iam_authorization_header();
    if (!anotoki_iam_sent_bearer($header)) {
        return null;
    }

    $token = anotoki_iam_bearer_token($header);
    if ($token === null) {
        // "Bearer" with nothing after it: somebody meant to sign in, and did not.
        throw new ApiError(401, 'sign_in_required', 'Please sign in.', ['WWW-Authenticate' => 'Bearer realm="piano-academy"']);
    }

    if (!function_exists('openssl_verify')) {
        throw new RuntimeException('Signing in needs PHP\'s openssl extension, and this PHP has none.');
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
    $name = is_string($name) && trim($name) !== '' ? textClip(trim($name), 200) : null;
    usersSeen($id, $name);

    return new SiteUser($id, $name, anotoki_iam_roles($claims));
}

/**
 * Keeps the users row of a request's person: made on the first visit, the
 * username refreshed from the token when it changes, last_seen_at at most
 * every five minutes (not on every key press's save). A null username - a
 * token without one, or the command line bringing in an export - leaves the
 * stored one alone.
 */
function usersSeen(int $id, ?string $username): void
{
    if ($id < 1) {
        // An IAM user id is 1 or more; a negative id is a visitor's, written only by api/visitors.php.
        throw new LogicException("usersSeen() is for a person, and $id is no IAM user id.");
    }
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
