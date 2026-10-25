<?php

declare(strict_types=1);

/**
 * config/config.php - where this installation's settings come from.
 *
 * Two files in the site's config/ - beside this one in a checkout, beside the
 * release's backend/ on the host (stateRoot()). setup.php writes both; git
 * ignores both; and both are required:
 *
 *   database.local.php   the PostgreSQL connection
 *
 *       return ['host' => '127.0.0.1', 'port' => 5432, 'name' => 'anotoki_piano',
 *               'user' => 'postgres', 'password' => '...'];
 *
 *   auth.local.php       the anotoki IAM everybody signs in through
 *
 *       return [
 *           'issuer' => 'http://localhost:4300', // the anotoki IAM (https://iam.anotoki.eu on the live site)
 *           'client_id' => 'piano-academy',      // this app's name in the IAM
 *           'cache_dir' => 'storage/cache',      // the IAM's signing keys, and its answer whether this app
 *                                                // requires sign-in, are kept here (relative to stateRoot()) -
 *                                                // a folder of this app's own: that answer opens it to visitors
 *       ];
 *
 *   The issuer is https - http only on this computer (localhost,
 *   127.0.0.1), as in development: the keys tokens are checked with come
 *   from there (the anotoki family's library refuses anything else). Any
 *   other key is passed over: a file from before sign-in became the IAM only
 *   (with 'mode' and 'local_user_id') still works, and signs in through the
 *   IAM it names - whatever its 'mode' said. Setup never writes more; the
 *   tests and the browser check may add the library's 'jwks_file',
 *   'application_file' and 'anonymized_file' (the IAM's key set, its answer
 *   about this app and its list of deleted accounts, as files),
 *   'application_ttl' and 'application_timeout' (anotoki/lib's
 *   IamClient::fromArray(), api/auth.php's iamClient()).
 *
 * There is nothing to fall back on. Without both files, or with one that does
 * not say what it must - or that cannot be read cleanly (a slip in an editor:
 * it does not start with <?php - a byte-order mark or a line before it, no
 * <?php line at all - and is never compiled; it prints anything as PHP reads
 * it - text after a closing tag - and what it prints, the password with it, is
 * caught and never sent; or PHP cannot parse, run or open it:
 * settingsFileReadCleanly()) - the
 * API answers every request but GET /api/site-status 503 {code: "not_set_up"}
 * (pointing at /setup.php while the site was never installed: the anotoki
 * family's gate, api/index.php), and the frontend shows the family's status
 * page. A default in a committed file would be a way for the app to run
 * somewhere with settings nobody chose there - which is exactly what this is
 * here to stop.
 *
 * A third file is optional, and never written by setup.php (git ignores it
 * too): visitors.local.php - the limits on practising without signing in,
 * and the proxies whose word on a client's address is believed
 * (api/visitors.php, api/client_address.php). Without it, or with one that
 * cannot be read cleanly (read the same careful way), the defaults hold; it is
 * never a reason for "not set up":
 *
 *       return [
 *           'client_address' => [
 *               'trusted_proxies' => [],   // none here: not behind Cloudflare (the default is its ranges, below)
 *           ],
 *           'visitors' => [
 *               'max_visitors' => 500,             // visitors at once; a full site refuses new ones only
 *               'new_per_hour_per_address' => 10,  // new visitors an hour from one address (an IPv6 /64)
 *               'new_per_hour' => 60,              // new visitors an hour in all
 *               'max_sessions' => 1000,            // rounds one visitor keeps
 *               'document_max_bytes' => 131072,    // the largest progress or path a visitor saves
 *               'move_lock_timeout_ms' => 5000,    // how long the move at sign-in waits for a row another request holds
 *           ],
 *       ];
 *
 * Where a request comes from has a committed default
 * (CLIENT_ADDRESS_TRUSTED_PROXIES below): the site is behind Cloudflare (the
 * owner's decision of 2026-10-11), so its published ranges are the trusted
 * proxies, and CF-Connecting-IP is believed only on a connection from one of
 * them - from anywhere else the connection's own address counts. The header is
 * pinned in code (CF-Connecting-IP alone - no setting names another: an older
 * file's client_ip_header is passed over). A computer or a host that is not
 * behind Cloudflare says so in visitors.local.php ('trusted_proxies' => []);
 * a range there wider than /8 (IPv4) or /16 (IPv6) - 0.0.0.0/0, ::/0 - is
 * refused, never believed (api/client_address.php).
 *
 * A fourth file is optional too, never written or read by setup.php, and the
 * same in every anotoki site: cloudflare.local.php - the secret the owner's
 * Cloudflare zone adds to every request through it, in X-Anotoki-Origin (a
 * Transform Rule; the owner's decision of 2026-10-13):
 *
 *       return ['origin_secret' => '<a long random value, 32 characters or more>'];
 *
 * With it, CF-Connecting-IP is believed only on a request that carries that
 * secret (originSecret()); without the file, from the trusted proxies alone,
 * as before. A file that is there but yields no usable secret fails closed -
 * one that cannot be read cleanly, and one read cleanly that names none
 * (blank, no array, a misspelt or another key, a value that is not a string):
 * a secret no request carries, every request from Cloudflare's ranges its
 * edge (originSecretFile(); the family's rule of 2026-10-18). Only deleting
 * the file switches the secret off. The secret is never printed or logged.
 *
 * A fifth file is optional, never written or read by setup.php: site.local.php
 * - the site's public address, which robots.txt names the sitemap by and the
 * sitemap writes every page's address with (anotoki-lib 0.11.0's Robots,
 * api/site_settings.php):
 *
 *       return ['public_url' => 'https://piano.anotoki.eu'];
 *
 * Never an address read off a request: a Host header is anybody's to write.
 * Without it (or with one that cannot be read cleanly, or names none) the site
 * runs as ever - robots.txt names no sitemap, and /sitemap.xml answers 404
 * not_configured (siteAddress()).
 *
 * The tests run against throwaway databases with settings of their own:
 * PIANO_TEST_CONFIG names a folder holding the same two files, and it is only
 * honoured while the database named there is a piano_test_ one.
 */

/** What is wrong with the settings: a missing or unusable file. */
final class NotSetUp extends RuntimeException {}

/**
 * The folder this installation's state is in - its config/ and storage/. On the
 * host a release's backend/ carries release.json (anotoki-deploy) and the state
 * is beside it, in the site's folder, never part of an upload; in a checkout it
 * is backend/ itself.
 */
function stateRoot(): string
{
    $backend = dirname(__DIR__);

    return is_file($backend . '/release.json') ? dirname($backend) : $backend;
}

/** The folder the *.local.php files are read from (and setup.php writes to). */
function configDir(): string
{
    $test = getenv('PIANO_TEST_CONFIG');

    return is_string($test) && $test !== '' ? rtrim(str_replace('\\', '/', $test), '/') : stateRoot() . '/config';
}

/** True while the tests' own settings are in use. */
function usingTestConfig(): bool
{
    return configDir() !== stateRoot() . '/config';
}

function localConfigFile(string $name): string
{
    return configDir() . '/' . $name . '.local.php';
}

/**
 * Where PHP writes at run time: the setup token and lock, the IAM's key cache
 * (unless auth.local.php names another). storage/ beside config/ - or, with
 * the tests' settings, a folder inside theirs.
 */
function storageDir(): string
{
    return usingTestConfig() ? configDir() . '/storage' : stateRoot() . '/storage';
}

/**
 * The settings, read once per request - and again with $reload, after
 * setup.php has written them.
 *
 * @return array{database: ?array, auth: ?array, problem: ?string}
 */
function localSettings(bool $reload = false): array
{
    static $settings = null;

    if ($settings !== null && !$reload) {
        return $settings;
    }

    // A file that cannot be read cleanly is no setting - said, rather than a
    // 500 on every path (the site's status too, which the pages read to know
    // what to say). It is read through settingsFileReadCleanly(): one that
    // does not start with <?php - required, a file without that line would
    // print all of it, the password too - is never compiled, and whatever one
    // that does prints as PHP reads it is caught and never sent; what PHP said
    // is not repeated (it may quote the file, password and all), only its kind
    // and line, that it does not start with <?php, or how many bytes the file
    // printed.
    $unreadable = null;
    $read = static function (string $name) use (&$unreadable): ?array {
        $file = localConfigFile($name);
        if (!is_file($file)) {
            return null;
        }
        $read = settingsFileReadCleanly($file);
        if ($read['problem'] !== null) {
            $unreadable ??= "config/$name.local.php {$read['problem']}.";
            settingsSaid("config/$name.local.php {$read['problem']}: the site is not set up until it is mended.");

            return [];
        }

        return is_array($read['value']) ? $read['value'] : [];
    };

    $database = $read('database');
    $auth = $read('auth');
    $problem = null;

    if ($database === null) {
        $problem = 'config/database.local.php is missing.';
    } elseif ($auth === null) {
        $problem = 'config/auth.local.php is missing.';
    } else {
        $problem = $unreadable ?? (databaseSettingsProblem($database) ?? authSettingsProblem($auth));
    }

    if ($problem === null && usingTestConfig() && !str_starts_with((string) $database['name'], 'piano_test_')) {
        $problem = 'PIANO_TEST_CONFIG is only for the tests\' piano_test_ databases.';
    }

    return $settings = ['database' => $database, 'auth' => $auth, 'problem' => $problem];
}

/** Null when the app is set up; otherwise a sentence saying what is missing. */
function settingsProblem(): ?string
{
    return localSettings()['problem'];
}

/** What a database.local.php must hold, or null when it holds it. */
function databaseSettingsProblem(array $values): ?string
{
    $host = $values['host'] ?? null;
    $port = $values['port'] ?? null;

    if (!is_string($host) || !preg_match('/^[A-Za-z0-9._:\[\]-]{1,100}$/D', $host)) {
        return 'config/database.local.php needs the database server (host).';
    }
    if (!(is_int($port) || (is_string($port) && ctype_digit($port))) || (int) $port < 1 || (int) $port > 65535) {
        return 'config/database.local.php needs the database port (usually 5432).';
    }
    if (!is_string($values['name'] ?? null) || !preg_match('/^[A-Za-z0-9_]{1,63}$/D', $values['name'])) {
        return 'config/database.local.php needs the database name (letters, digits and _).';
    }
    if (!is_string($values['user'] ?? null) || $values['user'] === '') {
        return 'config/database.local.php needs the database user.';
    }
    if (!array_key_exists('password', $values) || !is_string($values['password'])) {
        return 'config/database.local.php needs the database password (it may be empty, but it must be there).';
    }

    return null;
}

/**
 * What an auth.local.php must hold, or null when it holds it: the IAM's
 * address, this app's client id there, and where its keys are cached. Nothing
 * else is read (see the top of this file).
 */
function authSettingsProblem(array $values): ?string
{
    $issuer = $values['issuer'] ?? null;
    if (!is_string($issuer) || !preg_match('~^https?://[^/\s]+~i', $issuer)) {
        return 'config/auth.local.php needs the IAM\'s address (issuer).';
    }
    // What the anotoki family's library takes (its IamClient): the keys tokens are checked with come from there,
    // so never over plain http across a network.
    if (!\Anotoki\Lib\Auth\IamClient::secureAddress(rtrim(trim($issuer), '/'))) {
        return 'config/auth.local.php needs the IAM\'s address over https (http only on this computer: localhost, 127.0.0.1).';
    }
    if (!is_string($values['client_id'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{1,100}$/D', $values['client_id'])) {
        return 'config/auth.local.php needs this app\'s client id in the IAM.';
    }
    if (!is_string($values['cache_dir'] ?? null) || $values['cache_dir'] === '') {
        return 'config/auth.local.php needs cache_dir, where the IAM\'s keys are cached.';
    }

    return null;
}

/** The database settings; NotSetUp when there are none to use. */
function databaseSettings(): array
{
    $settings = localSettings();
    if ($settings['problem'] !== null) {
        throw new NotSetUp($settings['problem']);
    }

    return $settings['database'];
}

/** The sign-in settings; NotSetUp when there are none to use. */
function authSettings(): array
{
    $settings = localSettings();
    if ($settings['problem'] !== null) {
        throw new NotSetUp($settings['problem']);
    }

    return $settings['auth'];
}

/**
 * The trusted proxies, unless visitors.local.php's client_address says
 * otherwise (api/client_address.php reads them; the anotoki family's library
 * reads the address by the same rule - AdminContext's trustedProxies,
 * api/admin_tools.php): Cloudflare's published ranges,
 * https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6 as
 * of 2026-10-11 (15 IPv4, 7 IPv6 - the library's ClientAddress::CLOUDFLARE,
 * which tests/unit/config.test.php holds them equal to). They change rarely:
 * refresh them from those two addresses when Cloudflare announces a change.
 * The header they are believed for is CF-Connecting-IP, pinned in code.
 */
const CLIENT_ADDRESS_TRUSTED_PROXIES = [
    // IPv4 (https://www.cloudflare.com/ips-v4, 2026-10-11)
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
    // IPv6 (https://www.cloudflare.com/ips-v6, 2026-10-11)
    '2400:cb00::/32',
    '2606:4700::/32',
    '2803:f800::/32',
    '2405:b500::/32',
    '2405:8100::/32',
    '2a06:98c0::/29',
    '2c0f:f248::/32',
];

/**
 * The optional visitors.local.php (see the top of this file): the array it
 * returns, or [] when there is none or it cannot be read cleanly - then every
 * default holds (settingsFileReadCleanly(): one that does not start with
 * <?php is never compiled, nothing it prints is sent, and its fault is said
 * once a day by its kind and line, its start or its bytes, never what PHP
 * said, which may quote it). Read once per request, again with $reload.
 * What each value may be is checked where it is used (visitorLimit(),
 * clientAddressTrustedProxies()).
 */
function visitorSettings(bool $reload = false): array
{
    static $settings = null;

    if ($settings !== null && !$reload) {
        return $settings;
    }
    $file = localConfigFile('visitors');
    if (!is_file($file)) {
        return $settings = [];
    }
    $read = settingsFileReadCleanly($file);
    if ($read['problem'] !== null) {
        settingsSaid("config/visitors.local.php {$read['problem']}, so the defaults hold.");

        return $settings = [];
    }

    return $settings = is_array($read['value']) ? $read['value'] : [];
}

/**
 * The secret the owner's Cloudflare zone adds to every request through it
 * (X-Anotoki-Origin, the library's ClientAddress::ORIGIN_HEADER: a Transform
 * Rule - the owner's decision of 2026-10-13), from the optional
 * config/cloudflare.local.php; null without one, and one no request carries
 * for a file that yields no usable secret (originSecretFile()). Cloudflare's
 * published ranges are every Cloudflare customer's, not the owner's zone
 * alone: anybody's Worker can reach the host from them and write the
 * CF-Connecting-IP it likes, a new one for every request. With the secret
 * that header is believed only on a request that carries it, and any other
 * request from Cloudflare counts as the edge it came from - coarser, never
 * looser (api/client_address.php, and the library's own reading,
 * adminContext()). Read once per request, again with $reload.
 */
function originSecret(bool $reload = false): ?string
{
    static $read = false;
    static $secret = null;

    if ($read && !$reload) {
        return $secret;
    }
    $read = true;

    return $secret = originSecretFile();
}

/**
 * What config/cloudflare.local.php says - the anotoki family's rule, case for
 * case (the owner's decision of 2026-10-13 and its security review; tightened
 * on 2026-10-18, the owner's "do as you think is the best", as the build
 * analyzer and the survey read it - docs/decisions.md):
 *
 *   - no file: null, no secret - CF-Connecting-IP from the trusted proxies
 *     alone, which is how the app worked before the file. Deleting the file
 *     is the one way to switch the secret off;
 *   - a file read cleanly whose origin_secret is a string with something in it:
 *     that string, trimmed (a header's value never starts or ends with a space);
 *   - anything else there - anything in the file's place, a folder too - fails
 *     closed: a secret no request carries (originSecretNobodyCarries()), so
 *     every request from Cloudflare's ranges counts as the edge it came from
 *     until the file is mended. That is a file that cannot be read cleanly -
 *     it does not start with <?php (a byte-order mark or a line before it, no
 *     <?php line: never compiled), it prints anything (text after a closing
 *     tag), PHP cannot parse or run it, or may not open it - and a file read
 *     cleanly that names no secret: blank, only spaces, no array returned, a
 *     misspelt or another key, a value that is not a string. Its owner meant a
 *     secret, and believing CF-Connecting-IP from Cloudflare's ranges alone -
 *     from anybody's Worker there - would be the looser reading: a slip in the
 *     file never switches the check off. The app keeps running all the same:
 *     the file is optional, never a reason for "not set up".
 *
 * Each fault is said in PHP's error log at most once a day (settingsSaid()),
 * by the kind of error and its line, that it does not start with <?php, the
 * bytes the file printed, or that it holds no origin_secret - never its text:
 * a parse error's message can quote the file, and the secret is never printed
 * or logged.
 */
function originSecretFile(): ?string
{
    $file = localConfigFile('cloudflare');
    if (!file_exists($file)) {
        return null;
    }

    $read = settingsFileReadCleanly($file);
    if ($read['problem'] !== null) {
        settingsSaid(
            "config/cloudflare.local.php {$read['problem']}: no request carries its secret, so every request from Cloudflare's ranges counts as the edge it came from until the file is mended.",
        );

        return originSecretNobodyCarries();
    }

    $values = $read['value'];
    $secret = is_array($values) ? $values['origin_secret'] ?? null : null;
    if (!is_string($secret) || trim($secret) === '') {
        settingsSaid(
            'config/cloudflare.local.php holds no origin_secret (a string with something in it): no request carries its secret, so every request from Cloudflare\'s ranges counts as the edge it came from until the file names one - deleting the file switches the secret off.',
        );

        return originSecretNobodyCarries();
    }

    return trim($secret);
}

/**
 * The site's public address - 'https://piano.anotoki.eu' - from the optional
 * config/site.local.php (['public_url' => ...]; see the top of this file), or
 * null: no file, one that cannot be read cleanly (settingsFileReadCleanly()),
 * or one that names no public_url (a text with something in it) - each fault
 * said once a day, never the file's text. What robots.txt and sitemap.xml are
 * written with (api/site_settings.php's siteRobots(); the library's
 * Robots::address() takes an http(s) origin alone, anything else is none) -
 * never the request's Host, which anybody may write. Read once per request,
 * again with $reload.
 */
function siteAddress(bool $reload = false): ?string
{
    static $read = false;
    static $address = null;

    if ($read && !$reload) {
        return $address;
    }
    $read = true;
    $file = localConfigFile('site');
    if (!file_exists($file)) {
        return $address = null;
    }

    $values = settingsFileReadCleanly($file);
    if ($values['problem'] !== null) {
        settingsSaid("config/site.local.php {$values['problem']}, so the site has no public address: robots.txt names no sitemap, and /sitemap.xml answers 404.");

        return $address = null;
    }
    $url = is_array($values['value']) ? $values['value']['public_url'] ?? null : null;
    if (!is_string($url) || trim($url) === '') {
        settingsSaid("config/site.local.php holds no public_url (the site's address, https://...): robots.txt names no sitemap, and /sitemap.xml answers 404.");

        return $address = null;
    }

    return $address = trim($url);
}

/**
 * A secret no request can carry: 256 random bits, made once a process and
 * never printed, logged or stored, so no X-Anotoki-Origin matches it - what a
 * cloudflare.local.php that is there but yields no usable secret stands for.
 */
function originSecretNobodyCarries(): string
{
    static $secret = null;

    return $secret ??= bin2hex(random_bytes(32));
}

/**
 * Requires a *.local.php - every one is read this way: database, auth,
 * visitors, cloudflare, site - read cleanly, or not at all.
 *
 * A file that does not start with <?php - saved with a byte-order mark, a
 * blank line or a space before it, or without that line at all - is passed
 * over before PHP ever compiles it: required, it would print what comes before
 * (all of it, the password or the secret too, where the line is missing), and
 * one with declare(strict_types=1) after such a start is a compile-time fatal
 * error ("strict_types declaration must be the very first statement") that no
 * try, no handler and no output buffer catches - every request, the site's
 * status too, would be a 500 instead of "not set up", and a
 * cloudflare.local.php would never fail closed (Japanese Academy's review of
 * 2026-10-18, the family's rule since). Its first five bytes are read alone,
 * never the rest, and its problem is that it does not start with <?php.
 *
 * A file that does start with it is required in a closure of its own, so it
 * sees none of the caller's variables, with whatever it prints all the same -
 * text after a closing tag, an echo, a buffer of its own left open - caught:
 * it goes nowhere, and the file is read as no file, its problem the number of
 * bytes it printed. One PHP cannot parse or run (a ParseError, an Error, a
 * warning api/bootstrap.php's handler throws), or may not open, is no file
 * either, said by the kind of error and its line alone. What each caller makes
 * of no file is its own: the database's or the auth's leaves the site not set
 * up (localSettings()), the visitors' the defaults, the cloudflare's a secret
 * no request carries, the site's no public address.
 *
 * @return array{value: mixed, problem: ?string}
 */
function settingsFileReadCleanly(string $file): array
{
    if (!is_readable($file)) {
        return ['value' => null, 'problem' => 'could not be read (PHP may not open it)'];
    }
    $head = @file_get_contents($file, false, null, 0, 5);
    if ($head === false) {
        return ['value' => null, 'problem' => 'could not be read (PHP may not open it)'];
    }
    if (strtolower($head) !== '<?php') {
        return ['value' => null, 'problem' => 'does not start with <?php (a byte-order mark, a blank line or a space before it, or no <?php line at all)'];
    }

    $level = ob_get_level();
    $value = null;
    $failure = null;
    $printed = 0;
    ob_start();
    try {
        $value = (static fn(string $path): mixed => require $path)($file);
    } catch (Throwable $e) {
        $failure = 'could not be read (' . get_class($e) . ' on line ' . $e->getLine() . ')';
    } finally {
        // Every buffer down to the caller's - one the file opened and left open included.
        while (ob_get_level() > $level) {
            $buffer = ob_get_clean();
            if ($buffer === false) {
                break;
            }
            $printed += strlen($buffer);
        }
    }

    if ($failure !== null) {
        return ['value' => null, 'problem' => $failure];
    }
    if ($printed > 0) {
        return ['value' => null, 'problem' => "prints {$printed} bytes of its own (text after its closing tag, or something it echoes)"];
    }

    return ['value' => $value, 'problem' => null];
}

/**
 * A line in PHP's error log about a settings file written by hand: at most once
 * a day for each thing said - a stamp in storage/cache named by a hash of the
 * line - since the file is read on every request, and a fault left in it is the
 * same fault tomorrow. Where no stamp can be written, once a process.
 */
function settingsSaid(string $what): void
{
    static $saidWithoutStamp = [];

    $stamp = storageDir() . '/cache/said-' . substr(hash('sha256', $what), 0, 16) . '.logged';
    clearstatcache(true, $stamp);
    $last = @filemtime($stamp);
    if ($last !== false && time() - $last < 86400) {
        return;
    }
    if (!((is_dir(dirname($stamp)) || @mkdir(dirname($stamp), 0777, true)) && @touch($stamp))) {
        if (isset($saidWithoutStamp[$what])) {
            return;
        }
        $saidWithoutStamp[$what] = true;
    }

    error_log("[config] {$what}");
}

/**
 * Writes one of the *.local.php files and reads the settings again.
 *
 * The database one holds a password, so the file is readable by its owner
 * only: on a shared host the other customers are the ones not to trust.
 */
function writeLocalConfig(string $name, array $values): void
{
    ensureStateFolder(configDir());
    writePrivateFile(
        localConfigFile($name),
        "<?php\n\n// Piano Academy: this installation's {$name} settings, written by setup.php.\n" .
            "// Never commit it (git ignores it) - see config/config.php.\n\nreturn " .
            var_export($values, true) .
            ";\n",
    );
    localSettings(true);
}

/**
 * A folder of the state (config/, storage/), made if it is missing - the first
 * setup of a site, whose release never brings them. On the host it gets a
 * deny-all .htaccess of its own, though the site's switch never sends a
 * request into it (in a checkout nothing is served from backend/).
 */
function ensureStateFolder(string $dir): void
{
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot make ' . basename($dir) . '/.');
    }
    if (!is_file(dirname(__DIR__) . '/release.json') || is_file($dir . '/.htaccess')) {
        return;
    }
    @file_put_contents(
        $dir . '/.htaccess',
        "# Not for the web: only PHP reads these files.\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n",
    );
}

/**
 * A file only its owner can read: umask sets the mode as the file is made,
 * chmod covers one that was there already. (Both do nothing on Windows, where
 * the folder's permissions apply.)
 */
function writePrivateFile(string $file, string $contents): void
{
    $umask = umask(0077);
    try {
        $written = @file_put_contents($file, $contents);
    } finally {
        umask($umask);
    }

    if ($written !== strlen($contents)) {
        throw new RuntimeException('Cannot write ' . basename(dirname($file)) . '/' . basename($file) . '.');
    }

    @chmod($file, 0600);

    // A PHP that caches compiled files would otherwise keep reading the old settings.
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($file, true);
    }
}
