<?php

// Signing in through the real server - the IAM is the only way in, read by
// the anotoki family's library (anotoki/lib's Anotoki\Lib\Auth): access
// tokens the tests sign with their own key (the library's TestIam), checked
// against a key set file - and against the family's stand-in IAM
// (vendor/anotoki/lib/php/testing/stand-in-iam.php): a whole sign-in through
// it, its key set downloaded and cached, and its switch - whether the app
// requires sign-in - read, kept and relayed to the browser. Only the Bearer
// scheme is a sign-in. A settings file from before (a sign-in mode, an
// owner's id) opens nothing. Two people's data never meet.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Auth\Base64Url;
use Anotoki\Lib\Auth\Testing\StandInIam;

const ANNA = 101;
const BEN = 202;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['auth'] = test_auth_iam();
    $GLOBALS['app'] = start_app($GLOBALS['auth']);
});

/** A request as $userId; a save of a whole document names the generation, as a tab that has just loaded the progress does. */
function as_user(int $userId, string $method, string $url, mixed $body = null, array $claims = []): array
{
    $headers = bearer(test_token($userId, [], $claims));
    if ($method === 'PUT' && in_array($url, ['/api/progress', '/api/path'], true)) {
        $headers[] = GENERATION_HEADER . ': ' . (call($GLOBALS['app']['base'], 'GET', '/api/state', null, $headers)['body']['generation'] ?? '');
    }

    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

/** GET /api/state's answer as text, without the generation at its end (tests/api/me.test.php holds that). */
function state_text(array $answer): string
{
    return (string) preg_replace('/,"generation":\d+\}$/', '}', $answer['raw']);
}

function anonymous(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

function user_row(int $id): ?array
{
    return dbOne('SELECT id, preferred_username, created_at, last_seen_at FROM users WHERE id = ?', [$id]);
}

/** The claims of a JWT, read (not checked): what the stand-in put in an ID token. */
function jwt_claims(string $token): array
{
    $payload = json_decode((string) Base64Url::decode(explode('.', $token)[1] ?? ''), true);

    return is_array($payload) ? $payload : [];
}

test('the sign-in settings the browser reads, without a token - and the IAM\'s switch, relayed', function (): void {
    $config = anonymous('GET', '/api/auth/config');
    assert_same(200, $config['status']);
    assert_same(['issuer' => TEST_ISSUER, 'client_id' => 'piano-academy', 'login_required' => true, 'sign_in_available' => true], $config['body']);
    assert_same('no-store', $config['headers']['cache-control'] ?? null, 'never kept by a cache');
    assert_false(array_key_exists('auth', (array) anonymous('GET', '/api/health')['body']), 'no mode to tell');

    // The IAM switches sign-in off for this app: the browser is told so, and
    // nobody gets the empty state (visitors: tests/api/visitors.test.php).
    test_login_required($GLOBALS['auth'], false);
    try {
        assert_same(false, anonymous('GET', '/api/auth/config')['body']['login_required'] ?? null, 'switched off');
        $state = anonymous('GET', '/api/state');
        assert_same([200, 0], [$state['status'], $state['body']['generation'] ?? null], 'without a token: nobody\'s empty state');
        // An answer that is not about this app, or not a yes or no, is no answer: required.
        foreach (
            [
                'another app' => ['client_id' => 'genshin', 'login_required' => false],
                'a text' => ['client_id' => TEST_CLIENT, 'login_required' => 'false'],
                'nothing' => [],
                'not JSON' => '<html>proxy error</html>',
            ]
            as $what => $answer
        ) {
            file_put_contents($GLOBALS['auth']['application_file'], is_string($answer) ? $answer : json_encode($answer));
            assert_same(true, anonymous('GET', '/api/auth/config')['body']['login_required'] ?? null, $what);
        }
        unlink($GLOBALS['auth']['application_file']);
        assert_same(true, anonymous('GET', '/api/auth/config')['body']['login_required'] ?? null, 'the IAM out of reach, nothing ever read: required');
    } finally {
        test_login_required($GLOBALS['auth'], true);
    }
});

test('without a token: 401, for reading and for every save', function (): void {
    foreach (
        [['GET', '/api/state', null], ['PUT', '/api/progress', new stdClass()], ['PUT', '/api/path', ['steps' => new stdClass()]], ['POST', '/api/sessions', ['mode' => 'trainer']]]
        as [$method, $url, $body]
    ) {
        $answer = anonymous($method, $url, $body);
        assert_same(401, $answer['status'], "$method $url");
        assert_same('sign_in_required', $answer['body']['code'] ?? null);
        assert_match('/^Bearer realm="piano-academy"/', $answer['headers']['www-authenticate'] ?? '', 'says how to authenticate');
        assert_true(is_string($answer['body']['error'] ?? null), 'in the app\'s one error shape: {error, code}');
    }
    // Only Bearer is a sign-in: another scheme (a host behind a password file
    // sends Basic with every request) is no header at all - nobody.
    $basic = anonymous('GET', '/api/state', null, ['Authorization: Basic YWRtaW46YWRtaW4=']);
    assert_same([401, 'sign_in_required'], [$basic['status'], $basic['body']['code'] ?? null], 'another scheme: nobody');
    assert_same(true, anonymous('GET', '/api/auth/config', null, ['Authorization: Basic YWRtaW46YWRtaW4='])['body']['login_required'] ?? null, 'and the public routes answer as to nobody');
    // "Bearer" with no token claims a sign-in that is not there: the library's invalid_token, never nobody.
    foreach (['Authorization: Bearer ', 'Authorization: Bearer'] as $header) {
        $answer = anonymous('GET', '/api/state', null, [$header]);
        assert_same([401, 'invalid_token'], [$answer['status'], $answer['body']['code'] ?? null], "\"$header\"");
    }
    assert_same(401, anonymous('GET', '/api/state?access_token=' . test_token(ANNA))['status'], 'never from the address');
    assert_same(0, (int) dbValue('SELECT count(*) FROM users'), 'nobody was recorded');
    assert_same(0, (int) dbValue('SELECT count(*) FROM progress') + (int) dbValue('SELECT count(*) FROM sessions'), 'nothing was saved');
});

test('a good token: the person\'s own (empty) progress, and a users row from the token', function (): void {
    $state = as_user(ANNA, 'GET', '/api/state');
    assert_same(200, $state['status']);
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}}}', state_text($state));
    assert_same('user' . ANNA, user_row(ANNA)['preferred_username'] ?? null);
    assert_same(200, call($GLOBALS['app']['base'], 'GET', '/api/state', null, ['Authorization: bearer ' . test_token(ANNA)])['status'], 'the scheme in any case');
});

test('tokens that are not good are refused, and say only that', function (): void {
    $other = test_other_iam('piano-test-key'); // the same kid, another key: a forgery
    $bad = [
        'expired' => test_token(ANNA, [], ['exp' => time() - 120]),
        'expired, an administrator\'s' => test_token(ANNA, [ROLE_ADMIN], ['exp' => time() - 120]),
        'for another application' => test_token(ANNA, [], ['aud' => 'genshin', 'client_id' => 'genshin']),
        'from another issuer' => test_token(ANNA, [], ['iss' => 'https://evil.example']),
        'an ID token (typ JWT)' => test_token(ANNA, [], [], ['typ' => 'JWT']),
        'alg none' => test_token(ANNA, [], [], ['alg' => 'none']),
        'an unknown key' => test_token(ANNA, [], [], ['kid' => 'nope']),
        'signed with another key' => test_token(ANNA, [ROLE_ADMIN], [], ['iam' => $other]),
        'not valid yet' => test_token(ANNA, [], ['nbf' => time() + 600]),
        'no subject' => test_token(ANNA, [], ['sub' => '']),
        'a subject that is no user id' => test_token(ANNA, [], ['sub' => 'anna']),
        'garbage' => 'not.a.token',
    ];
    [$header, $payload, $signature] = explode('.', test_token(ANNA));
    $bad['a changed payload'] = $header . '.' . Base64Url::encode((string) json_encode(['sub' => (string) BEN] + json_decode((string) Base64Url::decode($payload), true))) . '.' . $signature;
    foreach ($bad as $what => $token) {
        $answer = call($GLOBALS['app']['base'], 'GET', '/api/state', null, bearer($token));
        assert_same(401, $answer['status'], $what);
        assert_same(['error' => 'Your sign-in has run out. Please sign in again.', 'code' => 'invalid_token'], $answer['body'], "$what: the same answer for every reason");
        assert_match('/error="invalid_token"/', $answer['headers']['www-authenticate'] ?? '', $what);
    }
    assert_same(null, user_row(BEN), 'a forged token recorded nobody');
    assert_same(200, as_user(ANNA, 'GET', '/api/state', null, ['exp' => time() - 30])['status'], 'expired within the minute of leeway');
    assert_same(200, as_user(ANNA, 'GET', '/api/state', null, ['aud' => ['other-app', 'piano-academy']])['status'], 'an audience list naming this app');
});

test('two people: each sees and changes only their own data', function (): void {
    $annaNotes = ['60' => ['midi' => 60, 'status' => 'review', 'totalAttempts' => 9, 'correctAttempts' => 8]];
    $annaPath = ['steps' => ['rh-1/meet' => ['attempts' => 1, 'bestAccuracy' => 100]]];
    assert_same(204, as_user(ANNA, 'PUT', '/api/progress', $annaNotes)['status']);
    assert_same(204, as_user(ANNA, 'PUT', '/api/path', $annaPath)['status']);
    $annaSession = as_user(ANNA, 'POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 12, 'correct' => 12, 'accuracy' => 100])['body'];

    // Ben starts empty, whatever Anna has
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}}}', state_text(as_user(BEN, 'GET', '/api/state')));

    // Ben's saves are Ben's: a body naming another user changes nothing about whose it is
    $benNotes = ['64' => ['midi' => 64, 'status' => 'learning']];
    assert_same(204, as_user(BEN, 'PUT', '/api/progress', $benNotes)['status']);
    as_user(BEN, 'POST', '/api/sessions', ['mode' => 'sheet', 'attempts' => 6, 'correct' => 3, 'accuracy' => 50, 'user_id' => ANNA, 'userId' => ANNA]);
    // the same Idempotency-Key as another person's session is another person's business
    $key = ['Idempotency-Key: shared-key-1'];
    $a = call($GLOBALS['app']['base'], 'POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 1, 'correct' => 1, 'accuracy' => 100], array_merge(bearer(test_token(ANNA)), $key));
    $b = call($GLOBALS['app']['base'], 'POST', '/api/sessions', ['mode' => 'trainer', 'attempts' => 1, 'correct' => 0, 'accuracy' => 0], array_merge(bearer(test_token(BEN)), $key));
    assert_same([201, 201], [$a['status'], $b['status']], 'two sessions, one per person');
    assert_same(0, $b['body']['correct']);

    $anna = as_user(ANNA, 'GET', '/api/state')['body'];
    $ben = as_user(BEN, 'GET', '/api/state')['body'];
    assert_json_same($annaNotes, $anna['progress'], 'Anna\'s progress, untouched by Ben');
    assert_json_same($annaPath, $anna['path']);
    assert_same([$annaSession['id'], $a['body']['id']], array_column($anna['sessions'], 'id'));
    assert_json_same($benNotes, $ben['progress']);
    assert_same(['sheet', 'trainer'], array_column($ben['sessions'], 'mode'));
    assert_same(['steps' => []], $ben['path'], 'Ben has no path progress');
    assert_same(2, (int) dbValue('SELECT count(*) FROM sessions WHERE user_id = ?', [BEN]), 'two sessions for Ben');
});

test('the users table follows the tokens: the username, and when last seen (the library\'s people module)', function (): void {
    assert_same(200, as_user(ANNA, 'GET', '/api/state', null, ['preferred_username' => 'anna.k'])['status']);
    assert_same('anna.k', user_row(ANNA)['preferred_username'], 'a new username is taken at once');
    $seen = user_row(ANNA)['last_seen_at'];
    as_user(ANNA, 'PUT', '/api/path', ['steps' => new stdClass()], ['preferred_username' => 'anna.k']);
    assert_same($seen, user_row(ANNA)['last_seen_at'], 'not rewritten on every save');
    dbExec("UPDATE users SET last_seen_at = now() - interval '1 hour' WHERE id = ?", [ANNA]);
    as_user(ANNA, 'GET', '/api/state', null, ['preferred_username' => 'anna.k']);
    assert_true(strtotime(user_row(ANNA)['last_seen_at']) > time() - 60, 'but kept up to date');
    as_user(ANNA, 'GET', '/api/state', null, ['preferred_username' => null]);
    assert_same('anna.k', user_row(ANNA)['preferred_username'], 'a token without a username keeps the stored one');
    assert_same([ANNA, BEN], array_map('intval', array_column(dbAll('SELECT id FROM users ORDER BY id'), 'id')));
});

/** A redirect's Location, parsed: [address, query]. */
function redirect_to(array $answer): array
{
    $location = (string) ($answer['headers']['location'] ?? '');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    return [strtok($location, '?'), $query];
}

/** The browser's sign-in through the stand-in (code + PKCE, as the library's client does it): its tokens, or ['error' => code]. */
function sign_in_through(StandInIam $iam, array $user, bool $deny = false): array
{
    $iam->state(['user' => $user, 'deny' => $deny]);
    $verifier = Base64Url::encode(random_bytes(32));
    $redirect = 'http://localhost:4500/auth/callback';
    $authorize = call(
        $iam->issuer,
        'GET',
        '/api/oidc/authorize?' .
            http_build_query([
                'client_id' => TEST_CLIENT,
                'redirect_uri' => $redirect,
                'response_type' => 'code',
                'scope' => 'openid profile email',
                'state' => 'st',
                'nonce' => 'n',
                'code_challenge' => Base64Url::encode(hash('sha256', $verifier, true)),
                'code_challenge_method' => 'S256',
            ]),
    );
    assert_same(302, $authorize['status']);
    [$to, $query] = redirect_to($authorize);
    assert_same($redirect, $to, 'back to the app');
    if (isset($query['error'])) {
        return ['error' => $query['error']];
    }
    $tokens = call(
        $iam->issuer,
        'POST',
        '/api/oidc/token',
        http_build_query([
            'grant_type' => 'authorization_code',
            'code' => $query['code'],
            'redirect_uri' => $redirect,
            'client_id' => TEST_CLIENT,
            'code_verifier' => $verifier,
        ]),
        ['Content-Type: application/x-www-form-urlencoded'],
    )['body'];
    assert_true(is_string($tokens['access_token'] ?? null), test_show($tokens));

    return $tokens;
}

test('a whole sign-in through the stand-in IAM (code + PKCE, as the browser does it): the app takes its tokens, and its roles', function (): void {
    $iam = stand_in_iam();
    $app = start_app(['issuer' => $iam->issuer, 'client_id' => 'piano-academy', 'cache_dir' => test_temp_dir('jwks-cache')]);
    $config = call($app['base'], 'GET', '/api/auth/config')['body'];
    assert_same(['issuer' => $iam->issuer, 'client_id' => 'piano-academy', 'login_required' => true, 'sign_in_available' => true], $config, 'what the browser starts from');

    // A learner - MEMBER, as every account holds it: signed in, their own
    // progress, nothing of the admin panel.
    $learner = sign_in_through($iam, ['id' => 31, 'username' => 'lea', 'roles' => ['MEMBER']]);
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($learner['access_token']))['status']);
    assert_same('lea', user_row(31)['preferred_username'] ?? null, 'recorded from the IAM\'s token');
    $refused = call($app['base'], 'GET', '/api/admin/translations', null, bearer($learner['access_token']));
    assert_same([403, 'forbidden'], [$refused['status'], $refused['body']['code'] ?? null]);
    // An editor and an administrator, as the IAM grants them.
    $editor = sign_in_through($iam, ['id' => 32, 'username' => 'ed', 'roles' => ['MEMBER', 'EDITOR']]);
    assert_same(200, call($app['base'], 'GET', '/api/admin/translations', null, bearer($editor['access_token']))['status']);
    assert_same(403, call($app['base'], 'GET', '/api/admin/migrations', null, bearer($editor['access_token']))['status']);
    $admin = sign_in_through($iam, ['id' => 1, 'username' => 'owner', 'roles' => ['MEMBER', 'ADMIN']]);
    assert_same(200, call($app['base'], 'GET', '/api/admin/migrations', null, bearer($admin['access_token']))['status']);

    // A refreshed token is as good; one the IAM refused never was.
    $refreshed = call($iam->issuer, 'POST', '/api/oidc/token', http_build_query(['grant_type' => 'refresh_token', 'refresh_token' => $learner['refresh_token'], 'client_id' => 'piano-academy']), [
        'Content-Type: application/x-www-form-urlencoded',
    ])['body'];
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer((string) ($refreshed['access_token'] ?? '')))['status'], 'after a refresh');
    assert_same(['error' => 'access_denied'], sign_in_through($iam, ['id' => 33, 'username' => 'no', 'roles' => []], true), 'the IAM said no: no token, no way in');
    assert_same(null, user_row(33));
    // The ID token is for the browser, never a way into the API.
    assert_same(401, call($app['base'], 'GET', '/api/state', null, bearer($learner['id_token']))['status']);
    $app['stop']();
    $iam->stop();
});

test('a settings file from before (a sign-in mode, an owner\'s id) opens nothing: everybody signs in through the IAM it names', function (): void {
    $old = start_app(test_auth_iam(['mode' => 'none', 'local_user_id' => 1]));
    $port = parse_url($old['base'], PHP_URL_PORT);
    foreach ([[], ["Host: localhost:$port"]] as $headers) {
        $answer = call($old['base'], 'GET', '/api/state', null, $headers);
        assert_same([401, 'sign_in_required'], [$answer['status'], $answer['body']['code'] ?? null], 'no token, even from this computer');
        assert_same(401, call($old['base'], 'GET', '/api/admin/languages', null, $headers)['status'], 'and no owner either');
    }
    assert_same(['issuer' => TEST_ISSUER, 'client_id' => 'piano-academy', 'login_required' => true, 'sign_in_available' => true], call($old['base'], 'GET', '/api/auth/config')['body']);
    assert_same(200, call($old['base'], 'GET', '/api/state', null, bearer(test_token(ANNA)))['status'], 'a token is the way in');
    $owner = call($old['base'], 'GET', '/api/admin/languages', null, bearer(test_token(1)));
    assert_same([403, 'forbidden'], [$owner['status'], $owner['body']['code'] ?? null], 'the old owner\'s id is nobody\'s role');
    $old['stop']();
});

test('the key set downloaded from the IAM and cached: verified without the IAM once cached', function (): void {
    $iam = stand_in_iam();
    $cache = test_temp_dir('jwks-cache');
    $app = start_app(['issuer' => $iam->issuer, 'client_id' => 'piano-academy', 'cache_dir' => $cache]);
    $token = test_stand_in_token($iam, ANNA);

    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($token))['status'], 'verified with the downloaded keys');
    assert_same(1, count(glob("$cache/anotoki-iam-jwks-*.json") ?: []), 'the key set is cached on disk');

    // the IAM goes away: the cached keys still do, and a key it never published is no key
    $issuer = $iam->issuer;
    $iam->stop();
    assert_same(0, test_status($issuer . '/.well-known/jwks.json'), 'the IAM is gone');
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($token))['status'], 'from the cache');
    $rotated = test_other_iam('rotated-key', $issuer);
    $unknown = $rotated->sign(test_claims(ANNA, [], [], $issuer));
    assert_same(401, call($app['base'], 'GET', '/api/state', null, bearer($unknown))['status'], 'an unknown key');
    $app['stop']();
});

/** How often the stand-in was asked whether this app requires sign-in. */
function switch_asked(StandInIam $iam): int
{
    return count(array_filter($iam->log(), static fn(string $line): bool => $line === 'GET /api/public/applications/piano-academy'));
}

/** The app's kept answer about the switch (the library's file in cache_dir - the SDK's name), with its times moved $seconds into the past. */
function switch_age(string $cache, int $seconds): void
{
    $files = glob("$cache/anotoki-iam-application-*.json") ?: [];
    assert_same(1, count($files), 'one kept answer');
    $record = json_decode((string) file_get_contents($files[0]), true);
    foreach (['fetched_at', 'failed_at', 'tried_at'] as $time) {
        if (($record[$time] ?? 0) > 0) {
            $record[$time] -= $seconds;
        }
    }
    file_put_contents($files[0], json_encode($record));
}

test('the account\'s preferences as the stand-in IAM keeps them (the browser check relies on it): none at first, then the claim, a save, a refusal', function (): void {
    $iam = stand_in_iam();
    $site = 'http://localhost:4500';
    $save = static fn(mixed $changes, string $bearer): array => call($iam->issuer, 'POST', '/api/oidc/preferences', $changes, array_merge(["Origin: $site"], bearer($bearer)));
    $lea = ['id' => 31, 'username' => 'lea', 'roles' => ['MEMBER']];

    // As an IAM before its 015: no claim, and nothing to save into.
    $tokens = sign_in_through($iam, $lea);
    assert_false(array_key_exists('preferences', jwt_claims($tokens['id_token'])), 'no preferences claim');
    assert_same(503, $save(['theme' => 'dark'], $tokens['access_token'])['status'], 'temporarily_unavailable');

    // Keeping some: the claim, and saves that change only what they name - cross-origin, as the browser sends them.
    $tokens = sign_in_through($iam, $lea + ['preferences' => ['theme' => 'auto', 'date_format' => null, 'time_format' => null]]);
    assert_same(['theme' => 'auto', 'date_format' => null, 'time_format' => null], jwt_claims($tokens['id_token'])['preferences'] ?? null, 'the claim, in the ID token');
    $saved = $save(['theme' => 'dark', 'date_format' => 'ymd_dash'], $tokens['access_token']);
    assert_same([200, $site], [$saved['status'], $saved['headers']['access-control-allow-origin'] ?? null], 'answered cross-origin');
    assert_same(['locale' => 'en', 'preferences' => ['theme' => 'dark', 'date_format' => 'ymd_dash', 'time_format' => null]], $saved['body']);
    assert_same('sk', $save(['language' => 'sk'], $tokens['access_token'])['body']['locale'] ?? null);
    $refreshed = call($iam->issuer, 'POST', '/api/oidc/token', http_build_query(['grant_type' => 'refresh_token', 'refresh_token' => $tokens['refresh_token'], 'client_id' => TEST_CLIENT]), [
        'Content-Type: application/x-www-form-urlencoded',
    ])['body'];
    $claims = jwt_claims((string) ($refreshed['id_token'] ?? ''));
    assert_same(['sk', 'dark'], [$claims['locale'] ?? null, $claims['preferences']['theme'] ?? null], 'the next tokens carry them');
    assert_same(400, $save(['theme' => 'pink'], $tokens['access_token'])['status'], 'what the account does not take');

    // A save that does not get through (the browser check's refusal): any answer, for that path.
    $iam->state(['answers' => ['/api/oidc/preferences' => ['status' => 503, 'body' => '{"error":"temporarily_unavailable"}']]]);
    assert_same(503, $save(['theme' => 'light'], $tokens['access_token'])['status'], 'refused on purpose');
    $iam->stop();
});

test('the IAM\'s switch: read from the IAM, kept a minute, the last answer while it is out of reach, required when unknown - and a signed-in request never asks', function (): void {
    $iam = stand_in_iam();
    $cache = test_temp_dir('iam-cache');
    $app = start_app(['issuer' => $iam->issuer, 'client_id' => 'piano-academy', 'cache_dir' => $cache]);
    $required = static fn(): mixed => call($app['base'], 'GET', '/api/auth/config')['body']['login_required'] ?? null;

    assert_same(true, $required(), 'the stand-in\'s default');
    assert_same(1, switch_asked($iam), 'asked once');
    $iam->state(['login_required' => false]);
    assert_same(true, $required(), 'kept for a minute: the switch is not seen yet');
    assert_same(1, switch_asked($iam), 'not asked again within the minute');

    switch_age($cache, 61);
    assert_same(false, $required(), 'a minute later: asked again, switched off');
    assert_same(2, switch_asked($iam));

    // A person with a token never waits on the IAM's switch.
    $token = test_stand_in_token($iam, ANNA);
    switch_age($cache, 61);
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($token))['status'], 'a MEMBER is an ordinary learner');
    assert_same(2, switch_asked($iam), 'a signed-in request did not ask');

    // The IAM out of reach: the last answer, and no asking again for a minute.
    $iam->state(['down' => true]);
    assert_same(false, $required(), 'the last answer read');
    assert_same(3, switch_asked($iam), 'asked, and it did not answer');
    assert_same(false, $required(), 'still the last answer');
    assert_same(3, switch_asked($iam), 'a failed ask is not repeated within the minute');
    assert_match('/\[anotoki auth\] the IAM did not say whether signing in is required here \(stale\): not required, as it said last/', (string) file_get_contents($app['log']), 'said in the log');

    // An unknown or switched-off application (404): required, and kept - and no sign-in on offer.
    $iam->state(['down' => false, 'application_missing' => true]);
    switch_age($cache, 61);
    $config = call($app['base'], 'GET', '/api/auth/config')['body'];
    assert_same([true, false], [$config['login_required'] ?? null, $config['sign_in_available'] ?? null], 'a 404: sign-in required, and the IAM does not know this app');
    assert_same(4, switch_asked($iam));
    $iam->state(['application_missing' => false]);
    assert_same(true, $required(), 'kept like any answer');
    assert_same(4, switch_asked($iam));
    $app['stop']();

    // Nothing ever read, and the IAM out of reach: required.
    $iam->state(['down' => true]);
    $fresh = start_app(['issuer' => $iam->issuer, 'client_id' => 'piano-academy', 'cache_dir' => test_temp_dir('iam-cache')]);
    assert_same(true, call($fresh['base'], 'GET', '/api/auth/config')['body']['login_required'] ?? null, 'fails closed');
    assert_match('/\(never_read\): required/', (string) file_get_contents($fresh['log']));
    $fresh['stop']();
    $iam->stop();
});

test('no PHP problem in the server log - and why a token was refused is there, never the token', function (): void {
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[anotoki auth] token refused')));
    assert_same([], $problems);
    $log = (string) file_get_contents($GLOBALS['app']['log']);
    assert_match('/\[anotoki auth\] token refused: /', $log, 'why a token was refused is in the log');
    assert_no_match('/eyJ[A-Za-z0-9_-]{10,}/', $log, 'never a token');
});
