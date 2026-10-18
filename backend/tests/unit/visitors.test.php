<?php

// The parts of visitors that need no server: the address a request is
// counted by (api/client_address.php, the anotoki family's rule: Cloudflare's
// ranges committed as the trusted proxies, their CF-Connecting-IP believed -
// one address, never a list; the header pinned - X-Real-IP, True-Client-IP,
// X-Forwarded-For never believed, whatever a setting says; a catch-all range
// refused; an IPv6 /64 as one; an untrusted proxy never believed; a keyed
// hash of it kept, never the address; with the origin secret,
// config/cloudflare.local.php, only on a request carrying it in
// X-Anotoki-Origin - and a file there that yields no usable secret, one that
// cannot be read cleanly or names none, failing closed: the family's rule
// case for case), the optional config/visitors.local.php and its limits,
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

/** The secret the owner's zone would add - made up for this run, never a real one. */
define('ORIGIN_SECRET', 'origin-' . bin2hex(random_bytes(20)));

/** $fn with config/cloudflare.local.php holding $contents (null: no file), then none again. */
function with_cloudflare_file(?string $contents, callable $fn): mixed
{
    $file = $GLOBALS['TEST_CONFIG_DIR'] . '/cloudflare.local.php';
    if ($contents === null) {
        @unlink($file);
    } else {
        file_put_contents($file, $contents);
    }
    originSecret(true);
    try {
        return $fn();
    } finally {
        @unlink($file);
        originSecret(true);
    }
}

/** $fn with $secret in config/cloudflare.local.php. */
function with_origin_secret(string $secret, callable $fn): mixed
{
    return with_cloudflare_file('<?php return ' . var_export(['origin_secret' => $secret], true) . ";\n", $fn);
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

test('the origin secret: from a Cloudflare address, CF-Connecting-IP only on a request carrying it in X-Anotoki-Origin - without it, or with a wrong one, the edge; from anywhere else, the connection; with no secret, as before', function (): void {
    with_visitor_settings(null, static function (): void {
        $visitor = ['CF-Connecting-IP' => '198.51.100.70'];

        // (a) No secret configured: the visitor, as before.
        with_cloudflare_file(null, static function () use ($visitor): void {
            assert_same(null, originSecret());
            assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', $visitor)), 'no secret: the visitor Cloudflare names');
            assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', $visitor + ['X-Anotoki-Origin' => 'anything'])), 'and the header changes nothing then');
        });

        with_origin_secret(ORIGIN_SECRET, static function () use ($visitor): void {
            assert_same(ORIGIN_SECRET, originSecret());
            // (b) A secret, no X-Anotoki-Origin: a Worker of anybody's, writing the CF-Connecting-IP it likes - the edge.
            assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', $visitor)), 'no X-Anotoki-Origin: the edge it came from');
            assert_same('2400:cb00::1', clientAddress(request_from('2400:cb00::1', ['CF-Connecting-IP' => '2001:db8:5::7'])), 'an IPv6 edge too');
            // (c) A wrong one: the edge.
            foreach ([
                'another value' => 'not the secret',
                'one character short' => substr(ORIGIN_SECRET, 0, -1),
                'one too many' => ORIGIN_SECRET . 'x',
                'in capitals' => strtoupper(ORIGIN_SECRET),
                'empty' => '',
            ] as $case => $sent) {
                assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', $visitor + ['X-Anotoki-Origin' => $sent])), "a wrong secret ($case): the edge");
            }
            // (d) The right one: the visitor.
            assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET])), 'the zone\'s secret: the visitor Cloudflare names');
            assert_same('2001:db8:5::7', clientAddress(request_from('2400:cb00::1', ['CF-Connecting-IP' => '2001:db8:5::7', 'X-Anotoki-Origin' => ORIGIN_SECRET])), 'over IPv6 too');
            // (e) The right one from outside Cloudflare's ranges: that connection's - the secret alone opens nothing.
            assert_same('203.0.113.9', clientAddress(request_from('203.0.113.9', $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET])), 'the secret from outside the ranges: the connection');

            // What the limits count without the secret: the edge, however many visitors a Worker makes up.
            $keys = array_unique(array_map(static fn (int $i): string => clientAddressKey(request_from('173.245.48.10', ['CF-Connecting-IP' => "198.51.100.$i"])), range(1, 20)));
            assert_same([clientAddressKey(request_from('173.245.48.10'))], array_values($keys), 'twenty made-up visitors from one edge: one bucket, the edge\'s');
        });

        // The file gone: as before.
        assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', $visitor)));
    });
});

/** Forgets what the settings files' faults have said today (settingsSaid()'s stamps): each case is said afresh. */
function forget_said(): void
{
    array_map('unlink', glob(storageDir() . '/cache/said-*.logged') ?: []);
}

/** How many lines of $log say $what. */
function lines_saying(string $log, string $what): int
{
    return count(array_filter(preg_split('/\R/', $log) ?: [], static fn (string $line): bool => str_contains($line, $what)));
}

/**
 * A cloudflare.local.php that is there but yields no usable secret - one that
 * cannot be read cleanly, or one read cleanly that names none - fails closed
 * (the family's rule): its secret is one no request carries - not the file's
 * (it was never read, or named none), never none - so a request from
 * Cloudflare's ranges is the edge it came from, without X-Anotoki-Origin and
 * with the very value the file holds; from anywhere else, the connection, as
 * ever.
 */
function fails_closed(string $case): void
{
    $secret = originSecret(true);
    assert_true(is_string($secret) && preg_match('/^[0-9a-f]{64}$/D', $secret) === 1 && $secret !== ORIGIN_SECRET, "$case: a secret no request carries, not the file's");
    assert_same($secret, originSecret(true), "$case: the same one all through the process");
    assert_same(null, settingsProblem(), "$case: never \"not set up\" - the file is optional");

    $forged = ['CF-Connecting-IP' => '198.51.100.70'];
    assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', $forged)), "$case: a forged CF-Connecting-IP from Cloudflare's ranges is not believed - the edge");
    assert_same('2400:cb00::1', clientAddress(request_from('2400:cb00::1', ['CF-Connecting-IP' => '2001:db8:5::7'])), "$case: over IPv6 too");
    assert_same('173.245.48.10', clientAddress(request_from('173.245.48.10', $forged + ['X-Anotoki-Origin' => ORIGIN_SECRET])), "$case: the edge with the file's own value too");
    assert_same('203.0.113.9', clientAddress(request_from('203.0.113.9', $forged)), "$case: from elsewhere, the connection");
    // The library's own reading (feedback's and the pages' reports' limits, the error log) takes the same secret: adminContext() passes originSecret().
    assert_same('173.245.48.10', \Anotoki\Lib\Support\ClientAddress::of(request_from('173.245.48.10', $forged), clientAddressTrustedProxies(), \Anotoki\Lib\Support\ClientAddress::CLOUDFLARE_HEADER, originSecret()), "$case: the library's reading - the edge");
    $keys = array_unique(array_map(static fn (int $i): string => clientAddressKey(request_from('173.245.48.10', ['CF-Connecting-IP' => "198.51.100.$i"])), range(1, 20)));
    assert_same([clientAddressKey(request_from('173.245.48.10'))], array_values($keys), "$case: twenty made-up visitors from one edge - one bucket, the edge's");
}

test('a config/cloudflare.local.php that cannot be read cleanly - it does not start with <?php (no <?php line, a byte-order mark or a line before it - before declare(strict_types=1) too, which PHP cannot even compile), it prints (text after a closing tag, a buffer of its own), PHP cannot parse or run it - fails closed: never printed, a secret no request carries, every request from Cloudflare\'s ranges its edge; its fault said once by its kind, its start or its bytes, never its text', function (): void {
    $secret = var_export(['origin_secret' => ORIGIN_SECRET], true);
    // A secret written bare is a constant PHP does not know, whose error quotes it; two strings side by side are a
    // parse error quoting the second.
    $bare = 'secret_' . bin2hex(random_bytes(16));
    foreach ([
        // Written by hand without its first line, or saved with a BOM or a line before it: PHP would print what comes
        // before its <?php ahead of every answer - and with declare(strict_types=1) after it could not even compile
        // it, a fatal error no handler catches (this process would end here; every request a 500, the file never
        // failing closed). None is compiled: a file that does not start with <?php is passed over unread.
        'no <?php line' => ["return {$secret};\n", 'does not start with <?php'],
        'a byte-order mark' => ["\xEF\xBB\xBF<?php\n\nreturn {$secret};\n", 'does not start with <?php'],
        'a line before its <?php' => ["\n<?php\n\nreturn {$secret};\n", 'does not start with <?php'],
        'a byte-order mark before <?php declare(strict_types=1)' => ["\xEF\xBB\xBF<?php declare(strict_types=1);\n\nreturn {$secret};\n", 'does not start with <?php'],
        'a blank line before <?php declare(strict_types=1)' => ["\n<?php declare(strict_types=1);\n\nreturn {$secret};\n", 'does not start with <?php'],
        // Text after a closing tag, or echoed: printed all the same, and caught.
        'text after a closing tag' => ["<?php \$kept = 1; ?>\n" . ORIGIN_SECRET . "\n<?php return {$secret};\n", 'prints ' . (strlen(ORIGIN_SECRET) + 1) . ' bytes of its own'],
        'a buffer of its own left open' => ["<?php ob_start(); echo '" . ORIGIN_SECRET . "'; return {$secret};\n", 'prints ' . strlen(ORIGIN_SECRET) . ' bytes of its own'],
        'a parse error' => ["<?php return ['origin_secret' => 'x' '" . ORIGIN_SECRET . "'];\n", 'could not be read (ParseError on line 1)'],
        'a bare word' => ["<?php return ['origin_secret' => $bare];\n", 'could not be read (Error on line 1)'],
    ] as $case => [$contents, $fault]) {
        forget_said();
        $log = error_log_of(static function () use ($contents, $case): void {
            with_cloudflare_file($contents, static function () use ($case): void {
                $level = ob_get_level();
                ob_start();
                try {
                    fails_closed($case);
                } finally {
                    $printed = (string) ob_get_clean();
                }
                assert_same('', $printed, "$case: nothing of the file printed");
                assert_same($level, ob_get_level(), "$case: no buffer of the file's left open");
            });
        });
        assert_same(1, lines_saying($log, "[config] config/cloudflare.local.php $fault"), "$case: its fault said once, though read again and again - " . $log);
        assert_true(str_contains($log, 'no request carries its secret, so every request from Cloudflare\'s ranges counts as the edge it came from'), "$case: and that it fails closed - " . $log);
        assert_false(str_contains($log, ORIGIN_SECRET) || str_contains($log, $bare), "$case: the log never holds the value");
        assert_false(str_contains($log, 'strict_types'), "$case: nor what PHP said of it");
    }

    // Mended - the file gone, or read cleanly - and the next reading is as the file says.
    assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => '198.51.100.70'])), 'the file gone: the trusted proxies alone again');
    with_origin_secret(ORIGIN_SECRET, static function (): void {
        assert_same(ORIGIN_SECRET, originSecret(), 'read cleanly again: its own secret');
    });
});

test('a config/cloudflare.local.php read cleanly: its value, trimmed - and one that names no usable secret (empty, only spaces, no array, a misspelt or another key, a value that is not a string) fails closed too, as does anything in the file\'s place, a folder too: a secret no request carries, said once a day by the file\'s name, never a value, never "not set up"; only deleting the file switches the secret off', function (): void {
    with_cloudflare_file(null, static function (): void {
        assert_same(null, originSecret(), 'no file: no secret');
    });
    with_origin_secret(" \t" . ORIGIN_SECRET . "\n", static function (): void {
        assert_same(ORIGIN_SECRET, originSecret(), 'spaces around it are no part of it: a header\'s value never has them');
        assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => '198.51.100.70', 'X-Anotoki-Origin' => ORIGIN_SECRET])), 'and so it matches the header');
    });

    // Read cleanly, and still no secret a request could be held to (the family's rule since 2026-10-18, the owner's "do
    // as you think is the best"): each one a slip in the file, never a way to switch the secret off - "no secret" would
    // believe CF-Connecting-IP from anybody's Worker in Cloudflare's ranges.
    foreach ([
        'an empty value' => "<?php return ['origin_secret' => ''];\n",
        'only spaces' => "<?php return ['origin_secret' => '   '];\n",
        'a number' => "<?php return ['origin_secret' => 123456789012345678];\n",
        'a list' => "<?php return ['origin_secret' => ['" . ORIGIN_SECRET . "']];\n",
        'null' => "<?php return ['origin_secret' => null];\n",
        'true' => "<?php return ['origin_secret' => true];\n",
        'a misspelt key' => "<?php return ['origin_secrets' => '" . ORIGIN_SECRET . "'];\n",
        'the key in capitals' => "<?php return ['ORIGIN_SECRET' => '" . ORIGIN_SECRET . "'];\n",
        'another key' => "<?php return ['secret' => '" . ORIGIN_SECRET . "'];\n",
        'no array returned' => "<?php return '" . ORIGIN_SECRET . "';\n",
        'nothing returned (PHP reads 1)' => "<?php ['origin_secret' => '" . ORIGIN_SECRET . "'];\n",
        'its first line alone' => "<?php\n",
        'null returned' => "<?php return null;\n",
    ] as $case => $contents) {
        forget_said();
        $log = error_log_of(static function () use ($contents, $case): void {
            with_cloudflare_file($contents, static function () use ($case): void {
                ob_start();
                try {
                    fails_closed($case);
                } finally {
                    $printed = (string) ob_get_clean();
                }
                assert_same('', $printed, "$case: nothing of the file printed");
            });
        });
        assert_same(1, lines_saying($log, '[config] config/cloudflare.local.php holds no origin_secret (a string with something in it): no request carries its secret'), "$case: said once that it fails closed, though read again and again - " . $log);
        assert_true(str_contains($log, 'deleting the file switches the secret off'), "$case: and the one way to switch it off - " . $log);
        assert_false(str_contains($log, ORIGIN_SECRET), "$case: the log never holds the value");
    }

    // Anything in the file's place counts as the file: a folder fails closed too (PHP may not open it, or reads nothing).
    $file = $GLOBALS['TEST_CONFIG_DIR'] . '/cloudflare.local.php';
    @unlink($file);
    mkdir($file);
    forget_said();
    try {
        $log = error_log_of(static function (): void {
            fails_closed('a folder in its place');
        });
        assert_true(str_contains($log, '[config] config/cloudflare.local.php ') && str_contains($log, 'no request carries its secret'), 'a folder in its place: said - ' . $log);
    } finally {
        rmdir($file);
        originSecret(true);
    }

    // Switched off the one way there is: the file deleted - CF-Connecting-IP from Cloudflare's ranges alone, as before
    // the secret.
    with_cloudflare_file(null, static function (): void {
        assert_same(null, originSecret(true), 'the file deleted: no secret');
        assert_same('198.51.100.70', clientAddress(request_from('173.245.48.10', ['CF-Connecting-IP' => '198.51.100.70'])), 'the file deleted: the visitor Cloudflare names, as before the secret');
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
    // A file that cannot be read cleanly: the defaults, never "not set up" - nothing of it printed, its fault said once
    // by its kind and line, its start or its bytes, never what PHP said (a parse error's message may quote the file).
    $broken = $GLOBALS['TEST_CONFIG_DIR'] . '/visitors.local.php';
    $mine = "['visitors' => ['max_visitors' => 0], 'client_address' => ['trusted_proxies' => ['192.0.2.0/24']]]";
    foreach ([
        'a parse error' => ["<?php return ['visitors' => ['max_visitors' => 0 'unexpected-words'];\n", 'could not be read (ParseError on line 1)'],
        'no <?php line' => ["return {$mine};\n", 'does not start with <?php'],
        'a byte-order mark' => ["\xEF\xBB\xBF<?php return {$mine};\n", 'does not start with <?php'],
        // Compiled, a fatal error no handler catches: never compiled.
        'a blank line before <?php declare(strict_types=1)' => ["\n<?php declare(strict_types=1);\nreturn {$mine};\n", 'does not start with <?php'],
        'text after a closing tag' => ["<?php \$kept = 1; ?>\n192.0.2.0/24\n<?php return {$mine};\n", 'prints 13 bytes of its own'],
    ] as $case => [$contents, $fault]) {
        forget_said();
        file_put_contents($broken, $contents);
        try {
            $log = error_log_of(static function () use ($case): void {
                ob_start();
                try {
                    assert_same([], visitorSettings(true), "$case: the defaults");
                    assert_same(VISITOR_DEFAULTS['max_visitors'], visitorLimit('max_visitors'), "$case: none of the file's limits");
                    assert_same(CLIENT_ADDRESS_TRUSTED_PROXIES, clientAddressTrustedProxies(), "$case: nor its proxies - Cloudflare's ranges, the committed default");
                    assert_same(null, settingsProblem(), "$case: never \"not set up\"");
                    assert_same([], visitorSettings(true), "$case: read again, the same");
                } finally {
                    $printed = (string) ob_get_clean();
                }
                assert_same('', $printed, "$case: nothing of the file printed");
            });
        } finally {
            @unlink($broken);
            visitorSettings(true);
        }
        assert_same(1, lines_saying($log, "[config] config/visitors.local.php $fault"), "$case: its fault said once - " . $log);
        assert_true(str_contains($log, 'so the defaults hold.'), "$case: and that the defaults hold - " . $log);
        assert_false(str_contains($log, 'unexpected') || str_contains($log, '192.0.2.0') || str_contains($log, 'strict_types'), "$case: never what PHP said, nor the file's text - " . $log);
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
