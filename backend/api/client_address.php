<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Which address a request comes from, for the limits on new visitors that
 * count per address (api/visitors.php) - and what one address is. A port of
 * the build analyzer's App\Web\ClientAddress; the anotoki IAM decides the
 * same way.
 *
 * REMOTE_ADDR, unless the connection comes from a proxy the optional
 * config/visitors.local.php trusts (client_address.trusted_proxies, CIDR
 * ranges): then the address in that proxy's header
 * (client_address.client_ip_header, CF-Connecting-IP by default), when it is
 * an address at all. A forwarding header is one the caller writes, so
 * believed from anybody it would let them pick a new address for every
 * request and walk past every limit; X-Forwarded-For is never read on its
 * own.
 *
 * The header should be one the proxy writes whole, overwriting whatever the
 * visitor sent (Cloudflare's CF-Connecting-IP: one address). A list such as
 * X-Forwarded-For, which a proxy appends to, starts with whatever the
 * visitor wrote: it is read from the right - the proxies' own addresses
 * skipped - and the first address no trusted proxy has is the one counted.
 *
 * One address, for counting: an IPv4 address as it is, an IPv6 address by
 * its /64 - one household or one server is handed a whole /64 and picks
 * from it at will, so counting single IPv6 addresses would count nothing.
 * An IPv4 address written as IPv6 (::ffff:198.51.100.7) is that IPv4
 * address.
 */

/** The address this request comes from (see above); '?' when the server gave none. */
function clientAddress(Request $request): string
{
    $ip = requestRemoteAddr($request);
    $settings = visitorSettings()['client_address'] ?? [];
    $proxies = is_array($settings['trusted_proxies'] ?? null) ? array_values($settings['trusted_proxies']) : [];

    if ($ip !== '' && $proxies !== [] && clientAddressInRanges($ip, $proxies)) {
        $header = $settings['client_ip_header'] ?? null;
        $header = is_string($header) && $header !== '' ? $header : 'CF-Connecting-IP';
        $forwarded = clientAddressRightmostUntrusted($request->getHeaderLine($header), $proxies);
        if ($forwarded !== null) {
            $ip = $forwarded;
        }
    }

    return $ip === '' ? '?' : substr($ip, 0, 45);
}

/** What the limits count for this request: its address, or for IPv6 its /64 ("2001:db8:1:2::/64"). */
function clientAddressCounted(Request $request): string
{
    return clientAddressBucket(clientAddress($request));
}

/** One address as the limits count it: IPv4 as it is (also when written as IPv6), IPv6 by its /64. */
function clientAddressBucket(string $ip): string
{
    $packed = @inet_pton($ip);
    if ($packed === false) {
        return $ip;
    }
    if (strlen($packed) === 4) {
        return (string) inet_ntop($packed);
    }
    // ::ffff:a.b.c.d
    if (str_starts_with($packed, str_repeat("\0", 10) . "\xff\xff")) {
        return (string) inet_ntop(substr($packed, 12));
    }

    return inet_ntop(substr($packed, 0, 8) . str_repeat("\0", 8)) . '/64';
}

/**
 * The address a proxy's header names: read from the right, past the trusted
 * proxies' own addresses; null when the first other entry is no address at
 * all, or there is none.
 */
function clientAddressRightmostUntrusted(string $header, array $proxies): ?string
{
    foreach (array_reverse(explode(',', $header)) as $entry) {
        $entry = trim($entry);
        if (filter_var($entry, FILTER_VALIDATE_IP) === false) {
            return null;
        }
        if (!clientAddressInRanges($entry, $proxies)) {
            return $entry;
        }
    }

    return null;
}

/** Whether an address (v4 or v6) is inside one of the CIDR ranges; a bare address is a range of one. */
function clientAddressInRanges(string $ip, array $ranges): bool
{
    $address = @inet_pton($ip);
    if ($address === false) {
        return false;
    }

    foreach ($ranges as $range) {
        if (!is_string($range)) {
            continue;
        }
        [$subnet, $bits] = array_pad(explode('/', $range, 2), 2, null);
        $network = @inet_pton(trim((string) $subnet));
        if ($network === false || strlen($network) !== strlen($address)) {
            continue;
        }

        $bits = $bits === null ? strlen($address) * 8 : max(0, min(strlen($address) * 8, (int) $bits));
        $whole = intdiv($bits, 8);
        $rest = $bits % 8;
        if (substr($address, 0, $whole) !== substr($network, 0, $whole)) {
            continue;
        }
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;
        if ((ord($address[$whole]) & $mask) === (ord($network[$whole]) & $mask)) {
            return true;
        }
    }

    return false;
}
