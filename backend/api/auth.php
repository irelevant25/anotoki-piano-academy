<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\SignInRule;
use Anotoki\Lib\Support\Refusal;
use Psr\Http\Message\ResponseInterface as Response;

/**
 * Who a request comes from: the access token of the anotoki IAM, checked by
 * the anotoki family's library (anotoki/lib's Anotoki\Lib\Auth, since
 * 0.4.1: the IAM's PHP SDK moved into the library, one implementation for
 * every anotoki site) - RS256 and typ at+jwt pinned, the IAM's published
 * keys (kept an hour in cache_dir), iss, aud, the times with a minute's
 * leeway. Its `sub` is the user id, its `roles` this application's roles
 * for them:
 *
 *   MEMBER   every anotoki account holds it, in every application: an
 *            ordinary learner - no check here needs it or refuses it
 *   EDITOR   rewords the app's words (the Translations page, a language's
 *            strings as a file and back)
 *   ADMIN    all of that, and adds, changes and deletes languages, applies a
 *            database update, sees and deletes people's data, and reads the
 *            admin tools (the error log, the audit log, feedback, backups)
 *
 * Anybody else signed in learns, with their own progress. The IAM decides who
 * may sign in here (the roles of this application that may sign in - MEMBER
 * among them; taking a person's MEMBER away refuses their next sign-in and
 * refresh, while the access token they hold verifies until it runs out, a few
 * minutes). There is no login of the app's own and no configured owner - a
 * person is only ever who a verified token says.
 *
 * Who a request is, in this order - once, for every route but the public
 * ones (the library's Identify, meddleware/auth.php):
 *
 *   1. An Authorization header of the Bearer scheme (with or without a token
 *      after it): that person, or 401 invalid_token - a token that does not
 *      verify never falls back to anything, and the visitor key is not even
 *      read. Only Bearer is a sign-in: `Basic ...` (a host behind a password
 *      file) is nobody.
 *   2. Else, when the IAM says sign-in is required (signInRule()): nobody, and
 *      a visitor key sent along is never looked up, counted or swept early.
 *   3. Else an X-Visitor-Key: that visitor (api/visitors.php) - a users row
 *      of this app's own with a negative id, no name and no role; a key
 *      nobody has: 401 visitor_unknown.
 *   4. Else nobody: GET /api/state answers the empty state, and a first save
 *      makes a visitor (in the save's own transaction, within the limits).
 *
 * A visitor never passes a person's check (RequirePerson, RequireRole): never
 * the admin panel, the own progress file, or anybody else's data.
 *
 * Whether the app requires sign-in is the IAM's switch for this application
 * (signInRule(): the library's SignInRule - kept for a minute in cache_dir,
 * one request asking at a time, true - required - whenever nothing better is
 * known), relayed to the browser by GET /api/auth/config.
 */

const ROLE_ADMIN = 'ADMIN';
const ROLE_EDITOR = 'EDITOR';

/** The roles that may use the admin panel: reword the app's words. */
const ROLES_STAFF = [ROLE_ADMIN, ROLE_EDITOR];

/**
 * Whose data a request reads or saves, once the library has said who it is
 * (meddleware/auth.php's siteOwner()): a person - the token's user id, name
 * and roles - or a visitor of this app's own (api/visitors.php).
 */
final class SiteUser
{
    /**
     * @param string[] $roles
     * @param bool     $visitor somebody practising without signing in (api/visitors.php): a negative id,
     *                          no name, no role - never somebody a token says
     */
    public function __construct(public readonly int $id, public readonly ?string $name, public readonly array $roles, public readonly bool $visitor = false) {}

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

/**
 * The IAM's settings as the library takes them: auth.local.php's keys (the
 * IAM SDK's, which the library reads as they are), cache_dir under backend/.
 * The tests' and the browser check's own seams too: the IAM's key set, its
 * answer about this app and its deleted accounts as files (jwks_file,
 * application_file, anonymized_file), and how long the answer about the app
 * is kept and waited for (application_ttl, application_timeout).
 */
function authIamSettings(): array
{
    $auth = authSettings();
    $config = [
        'issuer' => rtrim((string) $auth['issuer'], '/'),
        'client_id' => (string) $auth['client_id'],
        'cache_dir' => settingsPath((string) $auth['cache_dir']),
    ];
    foreach (['jwks_file', 'application_file', 'anonymized_file'] as $key) {
        if (is_string($auth[$key] ?? null) && $auth[$key] !== '') {
            $config[$key] = $auth[$key];
        }
    }
    foreach (['application_ttl', 'application_timeout'] as $key) {
        if (is_int($auth[$key] ?? null) && $auth[$key] > 0) {
            $config[$key] = $auth[$key];
        }
    }

    return $config;
}

/**
 * This app at the IAM: the library's IamClient. A site that is not set up has
 * none to name (the gate answers every request before anything asks it):
 * then an empty one, which refuses every token and requires a sign-in.
 */
function iamClient(): IamClient
{
    static $iam = null,
        $for = null;

    // Made again when the settings change (setup.php writes them; the tests switch them).
    $settings = settingsProblem() === null ? authIamSettings() : [];
    if ($iam === null || $for !== $settings) {
        [$iam, $for] = [IamClient::fromArray($settings), $settings];
    }

    return $iam;
}

/** Whether the app requires a sign-in now: the IAM's switch (the library's SignInRule, failing closed). */
function signInRule(): SignInRule
{
    static $rule = null,
        $for = null;

    if ($rule === null || $for !== iamClient()) {
        [$rule, $for] = [new SignInRule(iamClient()), iamClient()];
    }

    return $rule;
}

/** The checks of the IAM's access tokens (the library's AccessTokens). */
function accessTokens(): AccessTokens
{
    static $tokens = null,
        $for = null;

    if ($tokens === null || $for !== iamClient()) {
        [$tokens, $for] = [new AccessTokens(iamClient()), iamClient()];
    }

    return $tokens;
}

/** Whether this app requires sign-in (signInRule()). */
function authLoginRequired(): bool
{
    return signInRule()->required();
}

/**
 * A refusal of the library's (who a request is, the admin tools, People) in
 * the app's one error shape - {error, code, ...what it is about} - as the
 * error handler writes every other one (api/index.php).
 */
function authRefused(Response $response, Refusal $refusal): Response
{
    return respondError($response, $refusal->status, $refusal->code, $refusal->message, [], $refusal->extra);
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
    'HTTP_FORWARDED',
    'HTTP_X_FORWARDED_FOR',
    'HTTP_X_FORWARDED_HOST',
    'HTTP_X_FORWARDED_PROTO',
    'HTTP_X_REAL_IP',
    'HTTP_CLIENT_IP',
    'HTTP_TRUE_CLIENT_IP',
    'HTTP_CF_CONNECTING_IP',
    'HTTP_X_CLUSTER_CLIENT_IP',
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
 * Makes the users row of a person no token of theirs brought here yet - the
 * command line bringing an export into an account (tools/progress.php): an
 * empty row; one there already is left as it is. (A request's person is
 * recorded by the library's people module before the route runs:
 * api/people.php's recordPerson().)
 */
function usersEnsure(int $id): void
{
    if ($id < 1) {
        // An IAM user id is 1 or more; a negative id is a visitor's, written only by api/visitors.php.
        throw new LogicException("usersEnsure() is for a person, and $id is no IAM user id.");
    }
    dbExec('INSERT INTO users (id) VALUES (?) ON CONFLICT (id) DO NOTHING', [$id]);
}
