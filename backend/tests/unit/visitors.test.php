<?php

// The parts of visitors that need no server: the address a request is
// counted by (api/client_address.php, the anotoki family's rule: Cloudflare's
// ranges committed as the trusted proxies, their CF-Connecting-IP believed -
// one address, never a list; the header pinned - X-Real-IP, True-Client-IP,
// X-Forwarded-For never believed, whatever a setting says; a catch-all range
// refused; an IPv6 /64 as one; an untrusted proxy never believed; a keyed
// hash of it kept, never the address), the optional config/visitors.local.php
// and its limits, the key's shape, the days the frontend promises, and the
// work after the answer (api/after_response.php) that never fails the request.

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

/** PHP's error log while $fn runs, as text. */
function error_log_of(callable $fn): string
{
    $log = (string) tempnam(sys_get_temp_dir(), 'piano-address-');
    $was = ini_set('error_log', $log);
    try {
        $fn();
    } finally {
        ini_set('error_log', (string) $was);
    }
    $text = (string) file_get_contents($log);
    @unlink($log);

    return $text;
}

test('behind Cloudflare, as committed: a connection from one of its ranges is the address CF-Connecting-IP names - any other connection is its own address', function (): void {
    with_visitor_settings(null, static function (): void {
        assert_same(CLIENT_ADDRESS_TRUSTED_PROXIES, clientAddressTrustedProxies(), 'Cloudflare\'s published ranges, committed');
        assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => '198.51.100.70'])), 'an IPv4 edge');
        assert_same('2001:db8:5::7', clientAddress(request_from('2400:cb00::1', ['CF-Connecting-IP' => '2001:db8:5::7'])), 'an IPv6 edge');
        assert_same('198.51.100.71', clientAddress(request_from('::ffff:104.16.0.1', ['CF-Connecting-IP' => '198.51.100.71'])), 'an edge\'s IPv4 address written as IPv6');
        assert_same('203.0.113.9', clientAddress(request_from('203.0.113.9', ['CF-Connecting-IP' => '198.51.100.80'])), 'not Cloudflare\'s: the header is the caller\'s word');
        assert_same('127.0.0.1', clientAddress(request_from('127.0.0.1', ['CF-Connecting-IP' => '198.51.100.80'])), 'this computer is no edge either');
        assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => '198.51.100.82, 198.51.100.83'])), 'a list is no address: the edge\'s own');
        assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => 'nonsense'])));
        assert_same('?', clientAddress(request_from('')), 'no address at all');
    });
});

test('the header is pinned: from a Cloudflare address X-Real-IP, True-Client-IP and X-Forwarded-For are never believed - nor when a setting names one', function (): void {
    // What a visitor writes into these, Cloudflare passes on untouched: believed, anybody would pick their own address.
    $said = '';
    foreach (['X-Real-IP', 'True-Client-IP', 'X-Forwarded-For', 'X-Client-IP', 'Forwarded'] as $header) {
        with_visitor_settings(null, static function () use ($header): void {
            assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', [$header => '198.51.100.90'])), "$header from an edge: the edge's own address");
            assert_same('198.51.100.91', clientAddress(request_from('173.245.48.10', [$header => '198.51.100.90', 'CF-Connecting-IP' => '198.51.100.91'])), "$header beside CF-Connecting-IP: CF-Connecting-IP's");
        });
        // An older visitors.local.php that names another header changes nothing.
        $said .= error_log_of(static function () use ($header): void {
            with_visitor_settings(['client_address' => ['client_ip_header' => $header]], static function () use ($header): void {
                assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', [$header => '198.51.100.90'])), "client_ip_header $header: never read");
                assert_same('198.51.100.91', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => '198.51.100.91'])), 'CF-Connecting-IP still');
            });
        });
    }
    // ... and the log says it is passed over (once a request).
    assert_match('/client_address\.client_ip_header is passed over: only CF-Connecting-IP is read/', $said);
});

test('the counted address elsewhere: config/visitors.local.php names the proxies - none at all, or ranges of its own, never a catch-all', function (): void {
    with_visitor_settings(['client_address' => ['trusted_proxies' => []]], static function (): void {
        assert_same([], clientAddressTrustedProxies(), 'not behind Cloudflare: none');
        assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => '198.51.100.70'])), 'no proxy trusted: the headers are the caller\'s words');
    });
    with_visitor_settings(['client_address' => ['trusted_proxies' => ['10.0.0.0/8', '2001:db8:ffff::/48', '127.0.0.1']]], static function (): void {
        assert_same(['10.0.0.0/8', '2001:db8:ffff::/48', '127.0.0.1'], clientAddressTrustedProxies());
        assert_same('203.0.113.9', clientAddress(request_from('10.1.2.3', ['CF-Connecting-IP' => '203.0.113.9'])));
        assert_same('10.1.2.3', clientAddress(request_from('10.1.2.3', ['CF-Connecting-IP' => 'nonsense'])), 'no address in it: the proxy\'s own');
        assert_same('203.0.113.9', clientAddress(request_from('2001:db8:ffff:1::5', ['CF-Connecting-IP' => '203.0.113.9'])), 'an IPv6 proxy');
        assert_same('203.0.113.9', clientAddress(request_from('127.0.0.1', ['CF-Connecting-IP' => '203.0.113.9'])), 'a bare address: a range of one');
        assert_same('192.0.2.1', clientAddress(request_from('192.0.2.1', ['CF-Connecting-IP' => '203.0.113.9'])), 'from an untrusted address: not believed');
    });

    // A catch-all - or anything near it, or anything that is no range - is refused: never believed, and said.
    $refused = ['0.0.0.0/0', '::/0', '10.0.0.0/7', '128.0.0.0/1', '2001:db8::/15', '::/8', '10.0.0.0/33', '2001:db8::/129', '10.0.0.0/', '10.0.0.0/x', 'nonsense', '', 42, null];
    $said = error_log_of(static function () use ($refused): void {
        with_visitor_settings(['client_address' => ['trusted_proxies' => [...$refused, '10.0.0.0/8', '2001:db8::/16']]], static function (): void {
            assert_same(['10.0.0.0/8', '2001:db8::/16'], clientAddressTrustedProxies(), 'only the ranges of /8 (IPv4) and /16 (IPv6) or narrower');
            assert_same('198.51.100.5', clientAddress(request_from('198.51.100.5', ['CF-Connecting-IP' => '203.0.113.9'])), 'a catch-all believes nobody');
            assert_same('2a00:1450::1', clientAddress(request_from('2a00:1450::1', ['CF-Connecting-IP' => '203.0.113.9'])), 'nor an IPv6 catch-all');
            assert_same('203.0.113.9', clientAddress(request_from('2001:db9::1', ['CF-Connecting-IP' => '203.0.113.9'])), 'inside 2001:db8::/16 - a /16 is the widest taken');
            assert_same('203.0.113.9', clientAddress(request_from('10.200.0.1', ['CF-Connecting-IP' => '203.0.113.9'])), 'the narrow ones beside them still are');
        });
        with_visitor_settings(['client_address' => ['trusted_proxies' => ['0.0.0.0/0', '::/0']]], static function (): void {
            assert_same([], clientAddressTrustedProxies(), 'nothing but catch-alls: no proxy at all');
            assert_same('203.0.113.50', clientAddress(request_from('203.0.113.50', ['CF-Connecting-IP' => '198.51.100.99'])), 'the connection\'s own address');
        });
    });
    foreach (['0.0.0.0/0', '::/0', '10.0.0.0/7', '2001:db8::/15', 'nonsense'] as $range) {
        assert_true(str_contains($said, "\"$range\" is not believed"), "$range: said in the log - " . $said);
    }
    foreach (['10.0.0.0/8', '2001:db8::/16', '203.0.113.5', '2001:db8::1'] as $range) {
        assert_true(clientAddressRangeTaken($range), "$range is a range taken");
    }
});

test('one address, as the limits count it: IPv4 as it is, written as IPv6 too; IPv6 by its /64 - and only a keyed hash of it kept', function (): void {
    with_visitor_settings(['client_address' => ['trusted_proxies' => ['127.0.0.1']]], static function (): void {
        $counted = static fn (string $address): string => clientAddressCounted(request_from('127.0.0.1', ['CF-Connecting-IP' => $address]));
        assert_same('198.51.100.7', $counted('198.51.100.7'));
        assert_same('198.51.100.7', $counted('::ffff:198.51.100.7'));
        assert_same('2001:db8:1:2::/64', $counted('2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
        assert_same('2001:db8:1:2::/64', $counted('2001:db8:1:2::1'));
        assert_same('?', clientAddressCounted(request_from('')));

        $key = static fn (string $address): string => clientAddressKey(request_from('127.0.0.1', ['CF-Connecting-IP' => $address]));
        assert_match('/^[0-9a-f]{64}$/D', $key('198.51.100.7'), 'a keyed hash, 64 hex digits - no address in it');
        assert_same($key('198.51.100.7'), $key('::ffff:198.51.100.7'), 'one bucket, one hash');
        assert_same($key('2001:db8:1:2::1'), $key('2001:db8:1:2:ffff::9'));
        assert_true($key('198.51.100.7') !== $key('198.51.100.8') && $key('2001:db8:1:2::1') !== $key('2001:db8:1:3::1'), 'another bucket, another hash');
        assert_true($key('198.51.100.7') !== hash('sha256', '198.51.100.7') && $key('198.51.100.7') !== hash_hmac('sha256', '198.51.100.7', ''), 'keyed - a stable pseudonym under this installation\'s key, never a plain hash anybody could make of a guess');
        $elsewhere = test_temp_dir('another-installation');
        assert_true(clientAddressHash('198.51.100.7', $elsewhere) !== $key('198.51.100.7'), 'another installation, another key');
        assert_same(clientAddressHash('198.51.100.7'), $key('198.51.100.7'), 'this installation\'s storage by default');
    });
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

test('a visitor\'s row is made only inside the transaction of a save - never by the people module, or the command line\'s import', function (): void {
    test_db();
    assert_throws(static fn() => visitorMake(request_from('198.51.100.7')), '/inside the transaction/');
    assert_throws(static fn() => usersEnsure(-3), '/is no IAM user id/');
    assert_throws(static fn() => usersEnsure(0), '/is no IAM user id/');
    // The library records a person from a token alone, and a token's subject is an IAM id: 1 or more.
    foreach (['-3', '0', '', 'x'] as $sub) {
        assert_same(null, \Anotoki\Lib\Auth\Person::fromClaims(['sub' => $sub]), "sub '$sub' is nobody the people module would record");
    }
    assert_false((new SiteUser(5, 'p', []))->visitor, 'somebody a token says is no visitor');
    assert_same(null, peopleDelete(db(), -1), 'a visitor is nobody on the People page');
    // The People page's delete runs inside the library's transaction, on the connection it is handed - never one of its own.
    assert_throws(static fn() => peopleDelete(db(), 5), '/inside the library\'s transaction/');
    assert_same(null, people()->delete(db(), 5, peopleDeleteHook()), 'nobody with that id: nothing deleted, and the library\'s transaction is one the hook leaves open');
    assert_false(db()->inTransaction());
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
