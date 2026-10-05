<?php

// The parts of visitors that need no server: the address a request is
// counted by (api/client_address.php - a trusted proxy's header, read from
// the right; an IPv6 /64 as one; X-Forwarded-For and an untrusted proxy
// never believed), the optional config/visitors.local.php and its limits,
// the key's shape, the days the frontend promises, and the work after the
// answer (api/after_response.php) that never fails the request.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

/** $fn with config/visitors.local.php holding $values (null: no file), then none again. */
function with_visitor_settings(?array $values, callable $fn): mixed
{
    $file = $GLOBALS['TEST_CONFIG_DIR'] . '/visitors.local.php';
    if ($values === null) {
        @unlink($file);
    } else {
        file_put_contents($file, '<?php return ' . var_export($values, true) . ";\n");
    }
    visitorSettings(true);
    try {
        return $fn();
    } finally {
        @unlink($file);
        visitorSettings(true);
    }
}

/** A request as it reaches the app: from $remote, with $headers. */
function request_from(string $remote, array $headers = []): \Psr\Http\Message\ServerRequestInterface
{
    $request = (new \Slim\Psr7\Factory\ServerRequestFactory())->createServerRequest('PUT', '/api/progress', ['REMOTE_ADDR' => $remote]);
    foreach ($headers as $name => $value) {
        $request = $request->withHeader($name, $value);
    }

    return $request;
}

test('the counted address: REMOTE_ADDR - a header only from a trusted proxy, read from the right', function (): void {
    with_visitor_settings(null, static function (): void {
        assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', ['CF-Connecting-IP' => '203.0.113.9', 'X-Forwarded-For' => '203.0.113.8'])), 'no proxy trusted: the headers are the caller\'s words');
        assert_same('?', clientAddress(request_from('')), 'no address at all');
    });
    $proxies = ['client_address' => ['trusted_proxies' => ['10.0.0.0/8', '2001:db8:ffff::/48'], 'client_ip_header' => 'X-Forwarded-For']];
    with_visitor_settings($proxies, static function (): void {
        assert_same('203.0.113.9', clientAddress(request_from('10.1.2.3', ['X-Forwarded-For' => '203.0.113.9'])));
        assert_same('203.0.113.9', clientAddress(request_from('10.1.2.3', ['X-Forwarded-For' => '1.2.3.4, 203.0.113.9, 10.9.9.9'])), 'from the right, past the proxies\' own');
        assert_same('10.1.2.3', clientAddress(request_from('10.1.2.3', ['X-Forwarded-For' => 'nonsense, 203.0.113.9 x'])), 'no address in it: the proxy\'s own');
        assert_same('10.1.2.3', clientAddress(request_from('10.1.2.3')), 'no header');
        assert_same('203.0.113.9', clientAddress(request_from('2001:db8:ffff:1::5', ['X-Forwarded-For' => '203.0.113.9'])), 'an IPv6 proxy');
        assert_same('192.0.2.1', clientAddress(request_from('192.0.2.1', ['X-Forwarded-For' => '203.0.113.9'])), 'from an untrusted address: not believed');
    });
    with_visitor_settings(['client_address' => ['trusted_proxies' => ['127.0.0.1']]], static function (): void {
        assert_same('203.0.113.9', clientAddress(request_from('127.0.0.1', ['CF-Connecting-IP' => '203.0.113.9', 'X-Forwarded-For' => '198.51.100.1'])), 'CF-Connecting-IP by default - never X-Forwarded-For');
        assert_same('127.0.0.1', clientAddress(request_from('127.0.0.1', ['X-Forwarded-For' => '198.51.100.1'])));
    });
});

test('one address, as the limits count it: IPv4 as it is, written as IPv6 too; IPv6 by its /64', function (): void {
    assert_same('198.51.100.7', clientAddressBucket('198.51.100.7'));
    assert_same('198.51.100.7', clientAddressBucket('::ffff:198.51.100.7'));
    assert_same('2001:db8:1:2::/64', clientAddressBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
    assert_same('2001:db8:1:2::/64', clientAddressBucket('2001:db8:1:2::1'));
    assert_same('?', clientAddressBucket('?'));
    assert_true(clientAddressInRanges('10.200.0.1', ['10.0.0.0/8']));
    assert_true(clientAddressInRanges('192.0.2.130', ['192.0.2.128/25']));
    assert_false(clientAddressInRanges('192.0.2.127', ['192.0.2.128/25']));
    assert_true(clientAddressInRanges('2001:db8::1', ['2001:db8::/32']));
    assert_false(clientAddressInRanges('2001:db9::1', ['2001:db8::/32']));
    assert_true(clientAddressInRanges('203.0.113.5', ['203.0.113.5']), 'a bare address is a range of one');
    assert_false(clientAddressInRanges('203.0.113.5', ['2001:db8::/32', 'nonsense', 42]), 'another family, or no range at all');
    assert_false(clientAddressInRanges('not an address', ['0.0.0.0/0']));
});

test('the limits: the defaults, or visitors.local.php\'s whole numbers - and a document never over the app\'s own limit', function (): void {
    with_visitor_settings(null, static function (): void {
        foreach (VISITOR_DEFAULTS as $name => $value) {
            assert_same($value, visitorLimit($name), $name);
        }
    });
    with_visitor_settings(['visitors' => ['max_visitors' => 0, 'new_per_hour' => '9', 'max_sessions' => 0, 'document_max_bytes' => 10 * BODY_LIMIT, 'new_per_hour_per_address' => 3, 'move_lock_timeout_ms' => 0]], static function (): void {
        assert_same(0, visitorLimit('max_visitors'), '0: no new visitors at all');
        assert_same(VISITOR_DEFAULTS['new_per_hour'], visitorLimit('new_per_hour'), 'a text is no number');
        assert_same(VISITOR_DEFAULTS['max_sessions'], visitorLimit('max_sessions'), 'a visitor keeps at least one round');
        assert_same(BODY_LIMIT, visitorLimit('document_max_bytes'));
        assert_same(3, visitorLimit('new_per_hour_per_address'));
        assert_same(VISITOR_DEFAULTS['move_lock_timeout_ms'], visitorLimit('move_lock_timeout_ms'), 'the move waits at least a moment');
    });
    $broken = $GLOBALS['TEST_CONFIG_DIR'] . '/visitors.local.php';
    file_put_contents($broken, '<?php return [');
    try {
        assert_same([], visitorSettings(true), 'a file that cannot be read: the defaults, never "not set up"');
        assert_same(null, settingsProblem());
    } finally {
        @unlink($broken);
        visitorSettings(true);
    }
    assert_throws(static fn() => visitorLimit('max_people'), '/No visitor limit/');
});

test('the key: 43 characters of base64url, a new one each time; only its SHA-256 is kept', function (): void {
    $keys = [visitorNewKey(), visitorNewKey()];
    foreach ($keys as $key) {
        assert_match(VISITOR_KEY_PATTERN, $key);
    }
    assert_true($keys[0] !== $keys[1]);
    assert_same(64, strlen(visitorHash($keys[0])));
    assert_same(hash('sha256', $keys[0]), visitorHash($keys[0]));
});

test('the days the notice promises are the days the sweep keeps a visitor - here and in the frontend', function (): void {
    $words = (string) file_get_contents(TEST_BACKEND . '/../frontend/src/app/core/i18n/visitor-words.ts');
    assert_match('/export const VISITOR_KEEP_DAYS = ' . VISITOR_KEEP_DAYS . ';/', $words);
});

test('a visitor\'s row is made only inside the transaction of a save - and never by usersSeen()', function (): void {
    test_db();
    assert_throws(static fn() => visitorMake(request_from('198.51.100.7')), '/inside the transaction/');
    assert_throws(static fn() => usersSeen(-3, null), '/is no IAM user id/');
    assert_throws(static fn() => usersSeen(0, 'x'), '/is no IAM user id/');
    assert_false((new SiteUser(5, 'p', []))->visitor, 'somebody a token says is no visitor');
    assert_false(peopleDelete(-1), 'a visitor is nobody on the People page');
});

test('the work after the answer: each piece on its own, a failure logged and never thrown', function (): void {
    $ran = [];
    afterResponse(static function () use (&$ran): void {
        $ran[] = 'first';
        throw new RuntimeException('the first fails');
    });
    afterResponse(static function () use (&$ran): void {
        $ran[] = 'second';
    });
    $log = tempnam(sys_get_temp_dir(), 'piano-after-');
    $was = ini_set('error_log', $log);
    try {
        afterResponseRun();
    } finally {
        ini_set('error_log', (string) $was);
    }
    assert_same(['first', 'second'], $ran);
    assert_match('/\[after\] RuntimeException: the first fails/', (string) file_get_contents($log));
    @unlink($log);
    $ran = [];
    afterResponseRun();
    assert_same([], $ran, 'run once');
});
