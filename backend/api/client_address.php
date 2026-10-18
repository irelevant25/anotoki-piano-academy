<?php

declare(strict_types=1);

use Anotoki\Lib\Support\ClientAddress;
use Anotoki\Lib\Support\Keys;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Which address a request comes from, for the limits on new visitors that
 * count per address (api/visitors.php) - by the anotoki family's one rule
 * (anotoki/lib's Support\ClientAddress, the owner's of 2026-10-11), which the
 * library's own limits read too (feedback's, the error log's: AdminContext's
 * trustedProxies, api/admin_tools.php).
 *
 * REMOTE_ADDR, unless the connection comes from one of the trusted proxies -
 * Cloudflare's published ranges, committed (config/config.php's
 * CLIENT_ADDRESS_TRUSTED_PROXIES) - and then the one address CF-Connecting-IP
 * names, when it is an address at all (a list is none: the connection's own
 * counts). The header is pinned, the owner's rule: CF-Connecting-IP only, and
 * only from Cloudflare's ranges. No setting names another: X-Real-IP,
 * True-Client-IP and X-Forwarded-For are whatever the visitor wrote -
 * Cloudflare passes them on untouched - and believed they would let anybody
 * pick a new address for every request and walk past every limit.
 *
 * config/visitors.local.php may name other ranges
 * (client_address.trusted_proxies) - or none, on a computer that is not behind
 * Cloudflare - but never a catch-all: a range wider than /8 for IPv4 or /16
 * for IPv6 (0.0.0.0/0, ::/0) would believe the header from nearly anybody, so
 * it is refused - left out, never believed, and said in PHP's error log - as
 * is anything that is no range at all.
 *
 * Nor, with the origin secret (config/cloudflare.local.php, originSecret();
 * anotoki/lib 0.5.2, the owner's decision of 2026-10-13), is the header
 * believed from a Cloudflare address on a request that does not carry the
 * secret in X-Anotoki-Origin: Cloudflare's ranges are every Cloudflare
 * customer's, and anybody's Worker can open a connection from them and write
 * the CF-Connecting-IP it likes. The owner's zone adds the secret to every
 * request through it (a Transform Rule); a request without it counts as the
 * edge it came from - coarser, never looser. Without the file the trusted
 * proxies alone decide, as before.
 *
 * One address, for counting (a bucket): an IPv4 address as it is, an IPv6
 * address by its /64 - one household or one server is handed a whole /64 and
 * picks from it at will, so counting single IPv6 addresses would count
 * nothing. An IPv4 address written as IPv6 (::ffff:198.51.100.7) is that IPv4
 * address.
 *
 * What is kept of it is a keyed hash of the bucket, never the address itself
 * (clientAddressKey(): an HMAC under a key derived for this one purpose from
 * this installation's storage/anotoki-lib.key). It is a stable pseudonym, not
 * an anonymous value: the same address gives the same hash for as long as
 * that key lasts, and whoever holds the key can test a guessed address
 * against it. visitor_starts keeps it an hour; a backup made meanwhile has it.
 */

/** The shortest prefix a trusted range may have: anything wider believes the header from nearly anybody. */
const CLIENT_ADDRESS_NARROWEST_PREFIX = ['ipv4' => 8, 'ipv6' => 16];

/**
 * The proxies whose CF-Connecting-IP is believed: config/visitors.local.php's
 * client_address.trusted_proxies when it gives a list (an empty one too:
 * none), else Cloudflare's published ranges - either way without a range
 * that is a catch-all or no range at all (clientAddressRangeTaken()).
 *
 * @return list<string>
 */
function clientAddressTrustedProxies(): array
{
    $settings = visitorSettings()['client_address'] ?? [];
    $given = is_array($settings) ? $settings['trusted_proxies'] ?? null : null;
    $proxies = is_array($given) ? array_values($given) : CLIENT_ADDRESS_TRUSTED_PROXIES;
    if (is_array($settings) && array_key_exists('client_ip_header', $settings)) {
        clientAddressSays('client_address.client_ip_header is passed over: only CF-Connecting-IP is read, from the trusted proxies alone.');
    }

    $taken = [];
    foreach ($proxies as $range) {
        if (clientAddressRangeTaken($range)) {
            $taken[] = trim($range);
        } else {
            clientAddressSays(
                'client_address.trusted_proxies: ' .
                    (is_string($range) ? '"' . substr($range, 0, 60) . '"' : 'a value that is no text') .
                    ' is not believed - a range is an IPv4 address or range of /8 or narrower, or an IPv6 one of /16 or narrower.',
            );
        }
    }

    return $taken;
}

/**
 * Whether $range may be a trusted proxy's: one address (v4 or v6), or a CIDR
 * range no wider than /8 (IPv4) or /16 (IPv6) - never 0.0.0.0/0, ::/0 or
 * anything near them, never something that is no range.
 */
function clientAddressRangeTaken(mixed $range): bool
{
    if (!is_string($range)) {
        return false;
    }
    [$network, $bits] = array_pad(explode('/', trim($range), 2), 2, null);
    $packed = @inet_pton((string) $network);
    if ($packed === false) {
        return false;
    }
    $length = strlen($packed) * 8;
    if ($bits === null) {
        return true;
    }
    if (!ctype_digit($bits) || (int) $bits > $length) {
        return false;
    }

    return (int) $bits >= CLIENT_ADDRESS_NARROWEST_PREFIX[$length === 32 ? 'ipv4' : 'ipv6'];
}

/** A sentence about the settings, in PHP's error log - once a request each. */
function clientAddressSays(string $sentence): void
{
    static $said = [];

    if (!isset($said[$sentence])) {
        $said[$sentence] = true;
        error_log('[config] config/visitors.local.php: ' . $sentence);
    }
}

/** The address this request comes from (see above - the origin secret too); '?' when the server gave none. */
function clientAddress(Request $request): string
{
    return ClientAddress::of($request, clientAddressTrustedProxies(), ClientAddress::CLOUDFLARE_HEADER, originSecret()) ?? '?';
}

/** What the limits count for this request: its address, or for IPv6 its /64 ("2001:db8:1:2::/64"). */
function clientAddressCounted(Request $request): string
{
    $address = clientAddress($request);

    return $address === '?' ? $address : ClientAddress::bucket($address);
}

/**
 * What is kept of where this request comes from (api/visitors.php's
 * visitor_starts): a keyed hash of its bucket - 64 hex digits, the same for
 * every request from one bucket while this installation's key lasts (a
 * pseudonym: whoever holds the key can test a guessed address against it),
 * never the address itself.
 */
function clientAddressKey(Request $request): string
{
    return clientAddressHash(clientAddressCounted($request));
}

/** A bucket's keyed hash (clientAddressKey()), under the key in $storage (default: this installation's storage). */
function clientAddressHash(string $bucket, ?string $storage = null): string
{
    static $keys = [];

    $storage ??= storageDir();
    $keys[$storage] ??= Keys::derive(Keys::installation($storage), 'visitor-addresses');

    return hash_hmac('sha256', $bucket, $keys[$storage]);
}
