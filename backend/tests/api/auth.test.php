<?php

// Signing in through the real server - the IAM is the only way in: access
// tokens the tests sign with their own key (the IAM SDK's test helpers),
// checked against a JWKS file - and against the stand-in IAM
// (tests/tools/fake-iam.php): a whole sign-in through it, its key set
// downloaded and cached, and its switch - whether the app requires sign-in -
// read, kept and relayed to the browser. Only the Bearer scheme is a sign-in.
// A settings file from before (a sign-in mode, an owner's id) opens nothing.
// Two people's data never meet.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

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

test('the sign-in settings the browser reads, without a token - and the IAM\'s switch, relayed', function (): void {
    $config = anonymous('GET', '/api/auth/config');
    assert_same(200, $config['status']);
    assert_same(['issuer' => TEST_ISSUER, 'clientId' => 'piano-academy', 'loginRequired' => true], $config['body']);
    assert_false(array_key_exists('auth', (array) anonymous('GET', '/api/health')['body']), 'no mode to tell');

    // The IAM switches sign-in off for this app: the browser is told so, and
    // nobody gets the empty state (visitors: tests/api/visitors.test.php).
    test_login_required($GLOBALS['auth'], false);
    try {
        assert_same(false, anonymous('GET', '/api/auth/config')['body']['loginRequired'] ?? null, 'switched off');
        $state = anonymous('GET', '/api/state');
        assert_same([200, 0], [$state['status'], $state['body']['generation'] ?? null], 'without a token: nobody\'s empty state');
        // An answer that is not about this app, or not a yes or no, is no answer: required.
        foreach (['another app' => ['client_id' => 'genshin', 'login_required' => false], 'a text' => ['client_id' => TEST_CLIENT, 'login_required' => 'false'],
            'nothing' => [], 'not JSON' => '<html>proxy error</html>'] as $what => $answer) {
            file_put_contents($GLOBALS['auth']['application_file'], is_string($answer) ? $answer : json_encode($answer));
            assert_same(true, anonymous('GET', '/api/auth/config')['body']['loginRequired'] ?? null, $what);
        }
        unlink($GLOBALS['auth']['application_file']);
        assert_same(true, anonymous('GET', '/api/auth/config')['body']['loginRequired'] ?? null, 'the IAM out of reach, nothing ever read: required');
    } finally {
        test_login_required($GLOBALS['auth'], true);
    }
});

test('without a token: 401, for reading and for every save', function (): void {
    foreach ([['GET', '/api/state', null], ['PUT', '/api/progress', new stdClass()], ['PUT', '/api/path', ['steps' => new stdClass()]], ['POST', '/api/sessions', ['mode' => 'trainer']]] as [$method, $url, $body]) {
        $answer = anonymous($method, $url, $body);
        assert_same(401, $answer['status'], "$method $url");
        assert_same('sign_in_required', $answer['body']['code'] ?? null);
        assert_match('/^Bearer realm="piano-academy"/', $answer['headers']['www-authenticate'] ?? '', 'says how to authenticate');
    }
    // Only Bearer is a sign-in: another scheme (a host behind a password file
    // sends Basic with every request) is no header at all - nobody.
    $basic = anonymous('GET', '/api/state', null, ['Authorization: Basic YWRtaW46YWRtaW4=']);
    assert_same([401, 'sign_in_required'], [$basic['status'], $basic['body']['code'] ?? null], 'another scheme: nobody');
    assert_same(true, anonymous('GET', '/api/auth/config', null, ['Authorization: Basic YWRtaW46YWRtaW4='])['body']['loginRequired'] ?? null, 'and the public routes answer as to nobody');
    assert_same(401, anonymous('GET', '/api/state', null, ['Authorization: Bearer '])['status'], '"Bearer" and nothing');
    assert_same(401, anonymous('GET', '/api/state', null, ['Authorization: Bearer'])['status'], '"Bearer" alone');
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
    $other = anotoki_iam_test_keypair('piano-test-key'); // the same kid, another key: a forgery
    $bad = [
        'expired' => test_token(ANNA, [], ['exp' => time() - 120]),
        'expired, an administrator\'s' => test_token(ANNA, [ROLE_ADMIN], ['exp' => time() - 120]),
        'for another application' => test_token(ANNA, [], ['aud' => 'genshin']),
        'from another issuer' => test_token(ANNA, [], ['iss' => 'https://evil.example']),
        'an ID token (typ JWT)' => test_token(ANNA, [], [], ['typ' => 'JWT']),
        'alg none' => test_token(ANNA, [], [], ['alg' => 'none']),
        'an unknown key' => test_token(ANNA, [], [], ['kid' => 'nope']),
        'signed with another key' => test_token(ANNA, [ROLE_ADMIN], [], ['keys' => $other]),
        'not valid yet' => test_token(ANNA, [], ['nbf' => time() + 600]),
        'no subject' => test_token(ANNA, [], ['sub' => '']),
        'a subject that is no user id' => test_token(ANNA, [], ['sub' => 'anna']),
        'garbage' => 'not.a.token',
    ];
    [$header, $payload, $signature] = explode('.', test_token(ANNA));
    $bad['a changed payload'] = $header . '.' . anotoki_iam_base64url_encode(json_encode(['sub' => (string) BEN] + json_decode(anotoki_iam_base64url_decode($payload), true))) . '.' . $signature;
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

test('the users table follows the tokens: the username, and when last seen', function (): void {
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

/** The stand-in IAM (tests/tools/fake-iam.php) on a free port, serving the tests' key set: [server, its folder]. */
function stand_in_iam(): array
{
    $dir = test_temp_dir('fake-iam');
    file_put_contents("$dir/key.json", json_encode(test_keys()));
    $port = test_free_port();

    return [test_start_server(TEST_BACKEND . '/tests/tools', TEST_BACKEND . '/tests/tools/fake-iam.php', ['FAKE_IAM_DIR' => $dir, 'FAKE_IAM_ISSUER' => "http://127.0.0.1:$port"], '/.well-known/jwks.json', $port), $dir];
}

/** A redirect's Location, parsed: [address, query]. */
function redirect_to(array $answer): array
{
    $location = (string) ($answer['headers']['location'] ?? '');
    parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

    return [strtok($location, '?'), $query];
}

test('a whole sign-in through the stand-in IAM (code + PKCE, as the browser does it): the app takes its tokens, and its roles', function (): void {
    [$iam] = stand_in_iam();
    $app = start_app(['issuer' => $iam['base'], 'client_id' => 'piano-academy', 'cache_dir' => test_temp_dir('jwks-cache')]);
    $config = call($app['base'], 'GET', '/api/auth/config')['body'];
    assert_same(['issuer' => $iam['base'], 'clientId' => 'piano-academy', 'loginRequired' => true], $config, 'what the browser starts from');

    $signIn = static function (array $user, bool $deny = false) use ($iam, $config): array {
        call($iam['base'], 'POST', '/_test/state', ['user' => $user, 'deny' => $deny]);
        $verifier = anotoki_iam_base64url_encode(random_bytes(32));
        $challenge = anotoki_iam_base64url_encode(hash('sha256', $verifier, true));
        $redirect = 'http://localhost:4500/auth/callback';
        $authorize = call($iam['base'], 'GET', '/api/oidc/authorize?' . http_build_query([
            'client_id' => $config['clientId'], 'redirect_uri' => $redirect, 'response_type' => 'code', 'scope' => 'openid profile email',
            'state' => 'st', 'nonce' => 'n', 'code_challenge' => $challenge, 'code_challenge_method' => 'S256',
        ]));
        assert_same(302, $authorize['status']);
        [$to, $query] = redirect_to($authorize);
        assert_same($redirect, $to, 'back to the app');
        if (isset($query['error'])) {
            return ['error' => $query['error']];
        }
        $tokens = call($iam['base'], 'POST', '/api/oidc/token', http_build_query([
            'grant_type' => 'authorization_code', 'code' => $query['code'], 'redirect_uri' => $redirect, 'client_id' => $config['clientId'], 'code_verifier' => $verifier,
        ]), ['Content-Type: application/x-www-form-urlencoded'])['body'];
        assert_true(is_string($tokens['access_token'] ?? null), test_show($tokens));

        return $tokens;
    };

    // A learner - MEMBER, as every account holds it: signed in, their own
    // progress, nothing of the admin panel.
    $learner = $signIn(['id' => 31, 'username' => 'lea', 'roles' => ['MEMBER']]);
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($learner['access_token']))['status']);
    assert_same('lea', user_row(31)['preferred_username'] ?? null, 'recorded from the IAM\'s token');
    assert_same([403, 'forbidden'], [call($app['base'], 'GET', '/api/admin/translations', null, bearer($learner['access_token']))['status'], call($app['base'], 'GET', '/api/admin/translations', null, bearer($learner['access_token']))['body']['code'] ?? null]);
    // An editor and an administrator, as the IAM grants them.
    $editor = $signIn(['id' => 32, 'username' => 'ed', 'roles' => ['MEMBER', 'EDITOR']]);
    assert_same(200, call($app['base'], 'GET', '/api/admin/translations', null, bearer($editor['access_token']))['status']);
    assert_same(403, call($app['base'], 'GET', '/api/admin/migrations', null, bearer($editor['access_token']))['status']);
    $admin = $signIn(['id' => 1, 'username' => 'owner', 'roles' => ['MEMBER', 'ADMIN']]);
    assert_same(200, call($app['base'], 'GET', '/api/admin/migrations', null, bearer($admin['access_token']))['status']);

    // A refreshed token is as good; one the IAM refused never was.
    $refreshed = call($iam['base'], 'POST', '/api/oidc/token', http_build_query(['grant_type' => 'refresh_token', 'refresh_token' => $learner['refresh_token'], 'client_id' => 'piano-academy']), ['Content-Type: application/x-www-form-urlencoded'])['body'];
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer((string) ($refreshed['access_token'] ?? '')))['status'], 'after a refresh');
    assert_same(['error' => 'access_denied'], $signIn(['id' => 33, 'username' => 'no', 'roles' => []], true), 'the IAM said no: no token, no way in');
    assert_same(null, user_row(33));
    // The ID token is for the browser, never a way into the API.
    assert_same(401, call($app['base'], 'GET', '/api/state', null, bearer($learner['id_token']))['status']);
    ($app['stop'])();
    ($iam['stop'])();
});

test('a settings file from before (a sign-in mode, an owner\'s id) opens nothing: everybody signs in through the IAM it names', function (): void {
    $old = start_app(test_auth_iam(['mode' => 'none', 'local_user_id' => 1]));
    $port = parse_url($old['base'], PHP_URL_PORT);
    foreach ([[], ["Host: localhost:$port"]] as $headers) {
        $answer = call($old['base'], 'GET', '/api/state', null, $headers);
        assert_same([401, 'sign_in_required'], [$answer['status'], $answer['body']['code'] ?? null], 'no token, even from this computer');
        assert_same(401, call($old['base'], 'GET', '/api/admin/languages', null, $headers)['status'], 'and no owner either');
    }
    assert_same(['issuer' => TEST_ISSUER, 'clientId' => 'piano-academy', 'loginRequired' => true], call($old['base'], 'GET', '/api/auth/config')['body']);
    assert_same(200, call($old['base'], 'GET', '/api/state', null, bearer(test_token(ANNA)))['status'], 'a token is the way in');
    assert_same([403, 'forbidden'], [call($old['base'], 'GET', '/api/admin/languages', null, bearer(test_token(1)))['status'], call($old['base'], 'GET', '/api/admin/languages', null, bearer(test_token(1)))['body']['code'] ?? null], 'the old owner\'s id is nobody\'s role');
    ($old['stop'])();
});

test('the key set downloaded from the IAM and cached: verified without the IAM once cached', function (): void {
    [$iam] = stand_in_iam();
    $cache = test_temp_dir('jwks-cache');
    $app = start_app(['issuer' => $iam['base'], 'client_id' => 'piano-academy', 'cache_dir' => $cache]);
    $token = anotoki_iam_test_sign(anotoki_iam_test_claims(['issuer' => $iam['base'], 'client_id' => 'piano-academy'], ANNA), test_keys()['private_pem'], test_keys()['kid']);

    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($token))['status'], 'verified with the downloaded keys');
    assert_same(1, count(glob("$cache/anotoki-iam-jwks-*.json") ?: []), 'the key set is cached on disk');

    // the IAM goes away: the cached keys still do, and a key it never published is no key
    ($iam['stop'])();
    assert_same(0, test_status($iam['base'] . '/.well-known/jwks.json'), 'the IAM is gone');
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($token))['status'], 'from the cache');
    $rotated = anotoki_iam_test_keypair('rotated-key');
    $unknown = anotoki_iam_test_sign(anotoki_iam_test_claims(['issuer' => $iam['base'], 'client_id' => 'piano-academy'], ANNA), $rotated['private_pem'], $rotated['kid']);
    assert_same(401, call($app['base'], 'GET', '/api/state', null, bearer($unknown))['status'], 'an unknown key');
    ($app['stop'])();
});

/** How often the stand-in was asked whether this app requires sign-in. */
function switch_asked(array $iam): int
{
    $log = call($iam['base'], 'GET', '/_test/state')['body']['log'] ?? [];

    return count(array_filter($log, static fn(string $line): bool => $line === 'GET /api/public/applications/piano-academy'));
}

/** The app's kept answer about the switch (the SDK's file in cache_dir), with its times moved $seconds into the past. */
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

test('the stand-in IAM answers the public application route: the switch, missing, down, its cache header', function (): void {
    [$iam] = stand_in_iam();
    $url = '/api/public/applications/' . TEST_CLIENT;
    $answer = call($iam['base'], 'GET', $url);
    assert_same(200, $answer['status'], 'answered');
    assert_same(['client_id' => TEST_CLIENT, 'name' => 'Test site', 'login_required' => true], $answer['body'], 'the default: sign-in required');
    assert_same('public, max-age=60', $answer['headers']['cache-control'] ?? null, 'cacheable for a minute');
    assert_same(['MEMBER', 'ADMIN'], call($iam['base'], 'GET', '/_test/state')['body']['user']['roles'], 'its default person holds MEMBER, as every account does');
    call($iam['base'], 'POST', '/_test/state', ['login_required' => false]);
    assert_same(false, call($iam['base'], 'GET', $url)['body']['login_required'], 'switched off');
    call($iam['base'], 'POST', '/_test/state', ['application_missing' => true]);
    assert_same(404, call($iam['base'], 'GET', $url)['status'], 'an unknown application');
    call($iam['base'], 'POST', '/_test/state', ['application_missing' => false, 'down' => true]);
    assert_same(503, call($iam['base'], 'GET', $url)['status'], 'the IAM out of reach');
    ($iam['stop'])();
});

test('the IAM\'s switch: read from the IAM, kept a minute, the last answer while it is out of reach, required when unknown - and a signed-in request never asks', function (): void {
    [$iam] = stand_in_iam();
    $cache = test_temp_dir('iam-cache');
    $app = start_app(['issuer' => $iam['base'], 'client_id' => 'piano-academy', 'cache_dir' => $cache]);
    $required = static fn(): mixed => call($app['base'], 'GET', '/api/auth/config')['body']['loginRequired'] ?? null;

    assert_same(true, $required(), 'the stand-in\'s default');
    assert_same(1, switch_asked($iam), 'asked once');
    call($iam['base'], 'POST', '/_test/state', ['login_required' => false]);
    assert_same(true, $required(), 'kept for a minute: the switch is not seen yet');
    assert_same(1, switch_asked($iam), 'not asked again within the minute');

    switch_age($cache, 61);
    assert_same(false, $required(), 'a minute later: asked again, switched off');
    assert_same(2, switch_asked($iam));

    // A person with a token never waits on the IAM's switch.
    $token = anotoki_iam_test_sign(anotoki_iam_test_claims(['issuer' => $iam['base'], 'client_id' => 'piano-academy'], ANNA, ['MEMBER']), test_keys()['private_pem'], test_keys()['kid']);
    switch_age($cache, 61);
    assert_same(200, call($app['base'], 'GET', '/api/state', null, bearer($token))['status'], 'a MEMBER is an ordinary learner');
    assert_same(2, switch_asked($iam), 'a signed-in request did not ask');

    // The IAM out of reach: the last answer, and no asking again for a minute.
    call($iam['base'], 'POST', '/_test/state', ['down' => true]);
    assert_same(false, $required(), 'the last answer read');
    assert_same(3, switch_asked($iam), 'asked, and it did not answer');
    assert_same(false, $required(), 'still the last answer');
    assert_same(3, switch_asked($iam), 'a failed ask is not repeated within the minute');
    assert_match('/\[auth\] the IAM did not say whether sign-in is required \(stale\): not required, as last read/', (string) file_get_contents($app['log']), 'said once in the log');

    // An unknown or switched-off application (404): required, and kept.
    call($iam['base'], 'POST', '/_test/state', ['down' => false, 'application_missing' => true]);
    switch_age($cache, 61);
    assert_same(true, $required(), 'a 404: sign-in required');
    assert_same(4, switch_asked($iam));
    call($iam['base'], 'POST', '/_test/state', ['application_missing' => false]);
    assert_same(true, $required(), 'kept like any answer');
    assert_same(4, switch_asked($iam));
    ($app['stop'])();

    // Nothing ever read, and the IAM out of reach: required.
    call($iam['base'], 'POST', '/_test/state', ['down' => true]);
    $fresh = start_app(['issuer' => $iam['base'], 'client_id' => 'piano-academy', 'cache_dir' => test_temp_dir('iam-cache')]);
    assert_same(true, call($fresh['base'], 'GET', '/api/auth/config')['body']['loginRequired'] ?? null, 'fails closed');
    assert_match('/\(never_read\): required/', (string) file_get_contents($fresh['log']));
    ($fresh['stop'])();
    ($iam['stop'])();
});

test('no PHP problem in the server log', function (): void {
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[auth] token refused')));
    assert_same([], $problems);
    assert_true((bool) preg_match('/\[auth\] token refused: expired/', (string) file_get_contents($GLOBALS['app']['log'])), 'why a token was refused is in the log');
});
