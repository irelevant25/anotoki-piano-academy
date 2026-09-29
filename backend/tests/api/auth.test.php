<?php

// Signing in (auth mode "iam") through the real server: access tokens the
// tests sign with their own key (the IAM SDK's test helpers), checked against
// a JWKS file - and once against a key set the server downloads from a
// stand-in IAM. Two people's data never meet.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const ANNA = 101;
const BEN = 202;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app(test_auth_iam());
});

function as_user(int $userId, string $method, string $url, mixed $body = null, array $claims = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, bearer(test_token($userId, $claims)));
}

function anonymous(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

function user_row(int $id): ?array
{
    return dbOne('SELECT id, preferred_username, created_at, last_seen_at FROM users WHERE id = ?', [$id]);
}

test('the sign-in settings the browser reads, without a token', function (): void {
    $config = anonymous('GET', '/api/auth/config');
    assert_same(200, $config['status']);
    assert_same(['mode' => 'iam', 'issuer' => TEST_ISSUER, 'clientId' => 'piano-academy'], $config['body']);
    assert_same('iam', anonymous('GET', '/api/health')['body']['auth']);
});

test('without a token: 401, for reading and for every save', function (): void {
    foreach ([['GET', '/api/state', null], ['PUT', '/api/progress', new stdClass()], ['PUT', '/api/path', ['steps' => new stdClass()]], ['POST', '/api/sessions', ['mode' => 'trainer']]] as [$method, $url, $body]) {
        $answer = anonymous($method, $url, $body);
        assert_same(401, $answer['status'], "$method $url");
        assert_same('sign_in_required', $answer['body']['code'] ?? null);
        assert_match('/^Bearer realm="piano-academy"/', $answer['headers']['www-authenticate'] ?? '', 'says how to authenticate');
    }
    assert_same(401, anonymous('GET', '/api/state', null, ['Authorization: Basic YWRtaW46YWRtaW4='])['status'], 'another scheme');
    assert_same(401, anonymous('GET', '/api/state?access_token=' . test_token(ANNA))['status'], 'never from the address');
    assert_same(0, (int) dbValue('SELECT count(*) FROM users'), 'nobody was recorded');
    assert_same(0, (int) dbValue('SELECT count(*) FROM progress') + (int) dbValue('SELECT count(*) FROM sessions'), 'nothing was saved');
});

test('a good token: the person\'s own (empty) progress, and a users row from the token', function (): void {
    $state = as_user(ANNA, 'GET', '/api/state');
    assert_same(200, $state['status']);
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}}}', $state['raw']);
    assert_same('user' . ANNA, user_row(ANNA)['preferred_username'] ?? null);
    assert_same(200, call($GLOBALS['app']['base'], 'GET', '/api/state', null, ['Authorization: bearer ' . test_token(ANNA)])['status'], 'the scheme in any case');
});

test('tokens that are not good are refused, and say only that', function (): void {
    $other = anotoki_iam_test_keypair('piano-test-key'); // the same kid, another key: a forgery
    $bad = [
        'expired' => test_token(ANNA, ['exp' => time() - 120]),
        'for another application' => test_token(ANNA, ['aud' => 'genshin']),
        'from another issuer' => test_token(ANNA, ['iss' => 'https://evil.example']),
        'an ID token (typ JWT)' => test_token(ANNA, [], ['typ' => 'JWT']),
        'alg none' => test_token(ANNA, [], ['alg' => 'none']),
        'an unknown key' => test_token(ANNA, [], ['kid' => 'nope']),
        'signed with another key' => test_token(ANNA, [], ['keys' => $other]),
        'not valid yet' => test_token(ANNA, ['nbf' => time() + 600]),
        'no subject' => test_token(ANNA, ['sub' => '']),
        'a subject that is no user id' => test_token(ANNA, ['sub' => 'anna']),
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
    assert_same('{"progress":{},"sessions":[],"path":{"steps": {}}}', as_user(BEN, 'GET', '/api/state')['raw']);

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

test('the key set downloaded from the IAM and cached: verified without the IAM once cached', function (): void {
    // a stand-in IAM that serves the tests' key set over HTTP
    $dir = test_temp_dir('fake-iam');
    file_put_contents("$dir/key.json", json_encode(test_keys()));
    $port = test_free_port();
    $iam = test_start_server(TEST_BACKEND . '/tests/tools', TEST_BACKEND . '/tests/tools/fake-iam.php', ['FAKE_IAM_DIR' => $dir, 'FAKE_IAM_ISSUER' => "http://127.0.0.1:$port"], '/.well-known/jwks.json', $port);
    $cache = test_temp_dir('jwks-cache');
    $app = start_app(['mode' => 'iam', 'issuer' => $iam['base'], 'client_id' => 'piano-academy', 'local_user_id' => 1, 'cache_dir' => $cache]);
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

test('no PHP problem in the server log', function (): void {
    $problems = array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, '[auth] token refused')));
    assert_same([], $problems);
    assert_true((bool) preg_match('/\[auth\] token refused: expired/', (string) file_get_contents($GLOBALS['app']['log'])), 'why a token was refused is in the log');
});
