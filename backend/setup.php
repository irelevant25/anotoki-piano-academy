<?php

declare(strict_types=1);

/**
 * setup.php - sets Piano Academy up: the database connection, the anotoki IAM
 * everybody signs in through, and the tables. It is the one way
 * config/database.local.php and config/auth.local.php are written, on your
 * own computer as on the live site. Open it in a browser: /setup.php.
 *
 * TWO WAYS IT RUNS
 *
 *   On your own computer   PHP's built-in server (composer start, or php -S),
 *                          asked from this computer by a local name
 *                          (localhost, 127.0.0.1). No token - but the form
 *                          carries a nonce from a cookie, so another page open
 *                          in the browser cannot submit it for you. It stays
 *                          where it is and can be run again any time: it shows
 *                          what is saved (never a password), and saving again
 *                          applies what is new.
 *
 *   On a real host         Anybody can reach this page, so before it does
 *                          anything it asks for a token it writes into
 *                          storage/setup-token.php - only somebody with FTP
 *                          access can read that file. It shows nothing of what
 *                          is saved. When it is done it writes
 *                          storage/installed.lock, which stops it running
 *                          again - and from then on the site never offers
 *                          this page to anybody (api/migrations.php) - and
 *                          deletes the token and itself. A later version with
 *                          a new migration: an administrator applies it in
 *                          the app (the admin panel's Migrations page; the
 *                          site tells everybody else it is being updated
 *                          meanwhile) - or delete the lock, upload setup.php
 *                          again, and run it once more.
 *
 * It asks for the database and the IAM, and nothing else: who may administer
 * the app is the IAM's roles (ADMIN, EDITOR), and each person brings their own
 * progress in the app.
 *
 * "Test connection" tries the database, and the IAM's discovery document
 * ({issuer}/.well-known/openid-configuration), with what is typed in - without
 * saving anything. Save applies the migrations with the anotoki family's
 * engine, under the same lock as php migration.php and the app's own update
 * (api/migrations.php).
 *
 * This one file stays readable by PHP 7.4, so a host with an old PHP gets a
 * sentence saying so rather than a blank page.
 */

const SETUP_NONCE_COOKIE = 'piano_setup_nonce';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');

function h(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}

/**
 * The page, and the end of this request. Only the form has buttons to script;
 * a finished page has none - and on a host, this file is gone by the time
 * the browser would ask it for its script.
 */
function setupPage(string $heading, string $body, string $tone = 'plain', bool $withScript = false): void
{
    $accents = ['plain' => '#1f6fd1', 'good' => '#1d8a55', 'bad' => '#c9403a'];
    $accent = isset($accents[$tone]) ? $accents[$tone] : $accents['plain'];

    echo '<!doctype html><html lang="en"><head><meta charset="utf-8">' .
        '<meta name="viewport" content="width=device-width, initial-scale=1">' .
        '<meta name="robots" content="noindex, nofollow"><title>Setup · Piano Academy</title><style>' .
        ':root{color-scheme:light dark;--bg:#f4f5f8;--card:#fff;--ink:#1b1d24;--muted:#5d6475;--line:#d9dde6;--accent:' .
        $accent .
        ';--good:#1d8a55;--bad:#c9403a}' .
        '@media (prefers-color-scheme:dark){:root{--bg:#14161c;--card:#1d2029;--ink:#eef0f5;--muted:#9aa1b4;--line:#343948;--good:#4cc38a;--bad:#e5615a}}' .
        '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' .
        'display:flex;min-height:100vh;align-items:flex-start;justify-content:center;padding:24px 16px}' .
        '.card{background:var(--card);border:1px solid var(--line);border-radius:12px;max-width:600px;width:100%;padding:24px 26px}' .
        'h1{font-size:1.3rem;margin:0 0 6px;display:flex;align-items:center;gap:9px}' .
        'h1::before{content:"";flex:none;width:10px;height:10px;border-radius:50%;background:var(--accent)}' .
        'h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:24px 0 2px}' .
        'p,li{color:var(--muted)}label{display:block;margin:12px 0 5px;font-weight:600;font-size:.9rem}' .
        '.row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:140px}' .
        'input[type=text],input[type=password]{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font:inherit}' .
        'input:focus{outline:2px solid var(--accent);outline-offset:1px}' .
        'button{font:600 .95rem system-ui,sans-serif;border-radius:8px;cursor:pointer;padding:9px 14px}' .
        'button.primary{margin-top:24px;width:100%;padding:11px;border:0;background:var(--accent);color:#fff;font-size:1rem}' .
        'button.test{margin-top:12px;background:transparent;color:var(--ink);border:1px solid var(--line)}' .
        '.test-result{display:block;margin-top:6px;font-size:.9rem;min-height:1.2em}.test-result.ok{color:var(--good)}.test-result.bad{color:var(--bad)}' .
        'code{background:rgba(127,127,127,.15);padding:1px 6px;border-radius:5px;font-size:.85em;word-break:break-all}' .
        '.err{border:1px solid var(--bad);color:var(--bad);border-radius:8px;padding:9px 12px;margin:12px 0}' .
        '.note{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:12px 0;color:var(--ink)}' .
        '.ok{color:var(--good)}.small{font-size:.85rem;margin:4px 0 0}a{color:var(--accent)}' .
        '.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.actions a{font-weight:600}' .
        '[hidden]{display:none!important}' .
        '</style></head><body><main class="card"><h1>' .
        $heading .
        '</h1>' .
        $body .
        '</main>' .
        ($withScript ? '<script src="setup.php?asset=js"></script>' : '') .
        '</body></html>';
    exit();
}

/** A Test connection answer, and the end of this request. */
function setupJson(bool $ok, string $message, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

// ── The page's own script, as a file: the live site allows no inline script ──

if (($_GET['asset'] ?? '') === 'js') {
    header('Content-Type: text/javascript; charset=utf-8');
    header('Cache-Control: no-cache');
    echo <<<'JS'
    // setup.php's Test connection buttons: the fields so far, to setup.php?test=...,
    // and the answer beside the button. Nothing is saved.
    document.querySelectorAll('button[data-test]').forEach((button) => {
      button.addEventListener('click', async () => {
        const out = document.getElementById(button.dataset.result);
        out.textContent = 'Testing…';
        out.className = 'test-result';
        button.disabled = true;
        try {
          const response = await fetch('setup.php?test=' + encodeURIComponent(button.dataset.test), {
            method: 'POST', body: new FormData(button.form), credentials: 'same-origin',
          });
          const answer = await response.json();
          out.textContent = answer.message;
          out.className = 'test-result ' + (answer.ok ? 'ok' : 'bad');
        } catch (error) {
          out.textContent = 'The test got no answer from this server.';
          out.className = 'test-result bad';
        } finally {
          button.disabled = false;
        }
      });
    });
    JS;
    exit();
}

// ── What PHP needs ──────────────────────────────────────────────────────────

if (PHP_VERSION_ID < 80200) {
    setupPage(
        'PHP is too old',
        '<p>Piano Academy needs PHP 8.2 or newer. This server runs PHP ' . h(PHP_VERSION) . '. Choose a newer PHP (in the hosting panel, on a host), then reload this page.</p>',
        'bad',
    );
}
$missing = array_values(
    array_filter(['pdo_pgsql', 'openssl'], static function (string $extension): bool {
        return !extension_loaded($extension);
    }),
);
if ($missing) {
    setupPage(
        'PHP is missing something',
        '<p>This PHP has no <code>' . h(implode('</code>, <code>', $missing)) . '</code> extension. Turn it on (the PHP settings of the hosting panel, or php.ini), then reload this page.</p>',
        'bad',
    );
}
if (!is_file(__DIR__ . '/api/bootstrap.php') || !is_file(__DIR__ . '/vendor/autoload.php') || !is_file(__DIR__ . '/config/config.php')) {
    setupPage(
        'The upload is not complete',
        '<p>Beside <code>setup.php</code> there must be <code>api/</code>, <code>config/</code>, ' .
            '<code>migrations/</code>, <code>storage/</code> and <code>vendor/</code>. Upload the whole build (<code>php tools/build.php</code> makes it), then reload.</p>',
        'bad',
    );
}

require_once __DIR__ . '/api/bootstrap.php';

$storage = storageDir();
$lockFile = $storage . '/installed.lock';
$tokenFile = $storage . '/setup-token.php';
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');

// On this computer (see the top of this file) there is no token to ask for.
$local = isThisComputer(PHP_SAPI, (string) ($_SERVER['REMOTE_ADDR'] ?? ''), (string) ($_SERVER['HTTP_HOST'] ?? ''), wasForwarded($_SERVER));
$test = (string) ($_GET['test'] ?? '');

// ── A real host that is set up: the lock is the guard, whatever became of this file ──

if (!$local && is_file($lockFile)) {
    $gone = setupCleanUp($tokenFile);
    if ($test !== '') {
        setupJson(false, 'This site is set up already.', 403);
    }
    setupPage(
        'Already set up',
        '<p>This site is set up. <code>storage/installed.lock</code> stops the setup from running again.</p>' .
            ($gone
                ? '<p class="ok">The setup page has deleted itself.</p>'
                : '<p class="err">Delete <code>setup.php</code> and <code>storage/setup-token.php</code> by hand: the host did not let the setup page do it.</p>') .
            '<p class="small">A new version with a database update: sign in as an administrator and apply it in the app (the admin panel\'s Migrations page). ' .
            'Or, to run the setup again on purpose: delete the lock, upload setup.php again, and open it.</p>',
        'good',
    );
}

/**
 * Deletes the token and this file. False when the host would not let it - or
 * when this is the repository's own copy (it has tests/ beside it), which is
 * never deleted: only an uploaded one is.
 */
function setupCleanUp(string $tokenFile): bool
{
    @unlink($tokenFile);

    return !is_dir(__DIR__ . '/tests') && @unlink(__FILE__);
}

function setupToken(string $tokenFile): ?string
{
    if (!is_file($tokenFile)) {
        return null;
    }
    $values = require $tokenFile;
    $token = is_array($values) ? $values['token'] ?? null : null;

    return is_string($token) && strlen($token) >= 32 ? $token : null;
}

// ── Proof it is you: the token on a real host, the nonce on this computer ────

$token = null;
$nonce = null;

if ($local) {
    // Double submit: the nonce is in a cookie only this origin can read, and
    // the form must carry the same value. SameSite=Strict keeps the cookie off
    // requests another site starts.
    $nonce = is_string($_COOKIE[SETUP_NONCE_COOKIE] ?? null) && preg_match('/^[0-9a-f]{32}$/D', $_COOKIE[SETUP_NONCE_COOKIE]) ? $_COOKIE[SETUP_NONCE_COOKIE] : bin2hex(random_bytes(16));
    setcookie(SETUP_NONCE_COOKIE, $nonce, ['path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
} elseif (setupToken($tokenFile) === null) {
    try {
        ensureStateFolder($storage);
        writePrivateFile(
            $tokenFile,
            "<?php\n// Piano Academy's setup token: type it into /setup.php. It is deleted when the setup is done.\n\nreturn " . var_export(['token' => bin2hex(random_bytes(24))], true) . ";\n",
        );
    } catch (Throwable $e) {
        if ($test !== '') {
            setupJson(false, 'The setup could not write its token into storage/.', 500);
        }
        setupPage(
            'Cannot write to storage/',
            '<p>The setup could not write <code>storage/setup-token.php</code>: the web server may not write into ' .
                '<code>storage/</code>.</p><p class="small">Give that folder write permission in your FTP program, then reload this page.</p>',
            'bad',
        );
    }
}
if (!$local) {
    // Null when the file is gone - deleted by the install that just finished,
    // say - and then no token at all is the right one.
    $token = setupToken($tokenFile);
}

/** Is this POST from you: the right token (a host) or nonce (this computer)? */
function setupProofOk(bool $local, ?string $token, ?string $nonce): bool
{
    if ($local) {
        // A page elsewhere is refused by the name it gives. "null" is what the
        // browser sends for this page's own form under its no-referrer policy -
        // no origin to judge; the nonce below decides.
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin !== '' && $origin !== 'null' && !isLocalHostName((string) parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : ''))) {
            return false;
        }
        $sent = (string) ($_POST['nonce'] ?? '');

        return $nonce !== null && isset($_COOKIE[SETUP_NONCE_COOKIE]) && hash_equals((string) $_COOKIE[SETUP_NONCE_COOKIE], $sent);
    }

    return $token !== null && $token !== '' && hash_equals($token, trim((string) ($_POST['token'] ?? '')));
}

// ── What is saved already, and what the form says ─────────────────────────────

$saved = localSettings(true);
$savedDb = is_array($saved['database']) ? $saved['database'] : [];
$savedAuth = is_array($saved['auth']) ? $saved['auth'] : [];

// A development computer starts from what is saved, or the development values.
// A real host is asked for its own - and shows nothing of what is saved to a
// visitor who has not given the token (the setup is run again there for an
// update): a blank password keeps the saved one all the same.
$shown = $local ? ['db' => $savedDb, 'auth' => $savedAuth] : ['db' => [], 'auth' => []];
$form = [
    'db_host' => (string) ($shown['db']['host'] ?? ($local ? '127.0.0.1' : 'localhost')),
    'db_port' => (string) ($shown['db']['port'] ?? '5432'),
    'db_name' => (string) ($shown['db']['name'] ?? 'anotoki_piano'),
    'db_user' => (string) ($shown['db']['user'] ?? ($local ? 'postgres' : '')),
    'issuer' => (string) ($shown['auth']['issuer'] ?? ($local ? 'http://localhost:4300' : '')),
    'client_id' => (string) ($shown['auth']['client_id'] ?? 'piano-academy'),
];

if ($method === 'POST') {
    foreach (array_keys($form) as $key) {
        if (isset($_POST[$key]) && is_string($_POST[$key])) {
            $form[$key] = trim($_POST[$key]);
        }
    }
    $form['issuer'] = rtrim($form['issuer'], '/');
}

/** The database fields as settings - the saved password when none is typed. */
function setupDatabaseFromForm(array $form, array $savedDb): array
{
    $password = (string) ($_POST['db_password'] ?? '');
    if ($password === '' && isset($savedDb['password']) && is_string($savedDb['password'])) {
        $password = $savedDb['password'];
    }

    return [
        'host' => $form['db_host'],
        'port' => ctype_digit($form['db_port']) ? (int) $form['db_port'] : 0,
        'name' => $form['db_name'],
        'user' => $form['db_user'],
        'password' => $password,
    ];
}

/** Why these database fields cannot be used, or null. */
function setupDatabaseProblem(array $db): ?string
{
    $problem = databaseSettingsProblem($db);
    if ($problem !== null) {
        return str_replace('config/database.local.php needs', 'Enter', $problem);
    }
    // With the tests' settings (PIANO_TEST_CONFIG), only ever a throwaway database.
    if (usingTestConfig() && !str_starts_with((string) $db['name'], 'piano_test_')) {
        return 'The tests\' settings are for piano_test_ databases only.';
    }

    return null;
}

/** Why this IAM address or client id cannot be used, or null. */
function setupIamProblem(string $issuer, string $clientId): ?string
{
    $scheme = strtolower((string) parse_url($issuer, PHP_URL_SCHEME));
    $host = strtolower((string) parse_url($issuer, PHP_URL_HOST));
    if (!filter_var($issuer, FILTER_VALIDATE_URL) || !($scheme === 'https' || ($scheme === 'http' && in_array($host, ['localhost', '127.0.0.1'], true)))) {
        return 'The IAM address is an https:// address, like https://iam.anotoki.eu (or http://localhost:4300 on a development machine).';
    }
    if (!preg_match('/^[A-Za-z0-9._-]{1,100}$/D', $clientId)) {
        return 'The client id is this app\'s name in the IAM: piano-academy.';
    }

    return null;
}

// ── Test connection ───────────────────────────────────────────────────────────

if ($test !== '') {
    if ($method !== 'POST') {
        setupJson(false, 'The tests are asked with the form\'s buttons.', 405);
    }
    if (!setupProofOk($local, $token, $nonce)) {
        setupJson(false, $local ? 'This page is out of date: reload it and try again.' : 'Enter the setup token first (from storage/setup-token.php).', 403);
    }

    if ($test === 'database') {
        $db = setupDatabaseFromForm($form, $savedDb);
        $problem = setupDatabaseProblem($db);
        if ($problem !== null) {
            setupJson(false, $problem);
        }
        $result = setupTestDatabase($db);
        setupJson($result[0], $result[1]);
    }

    if ($test === 'iam') {
        $problem = setupIamProblem($form['issuer'], $form['client_id']);
        if ($problem !== null) {
            setupJson(false, $problem);
        }
        $result = setupTestIam($form['issuer'], $form['client_id']);
        setupJson($result[0], $result[1]);
    }

    setupJson(false, 'There is no such test.', 404);
}

/**
 * Connects the way the app will, and says what it found - in the anotoki
 * family's words, the same on every site's setup page. Shared hosting often
 * lets the user into its own database only, so that is tried first; the
 * server's maintenance database second, to say whether Save can create it.
 *
 * @return array{0: bool, 1: string}
 */
function setupTestDatabase(array $db): array
{
    try {
        $pdo = dbConnect($db);
        $tables = (int) $pdo->query("SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'")->fetchColumn();
        $pending = count(databaseMigrator($pdo)->applicable());

        return [
            true,
            'Connected to the database "' .
            $db['name'] .
            '": ' .
            ($tables === 0 ? 'it is empty - Save makes the tables.' : ($pending > 0 ? "$pending update(s) to apply - Save applies them." : 'it is up to date.')),
        ];
    } catch (PDOException $e) {
        $first = $e->getMessage();
    }

    try {
        $server = dbConnect($db, 'postgres');
        $exists = $server->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
        $exists->execute([$db['name']]);
        if ($exists->fetchColumn()) {
            return [false, 'The server is there, but "' . $db['user'] . '" cannot open the database "' . $db['name'] . '": ' . setupShortError($first)];
        }
        $create = (bool) $server->query('SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user')->fetchColumn();

        return $create
            ? [true, 'Connected to the server. The database "' . $db['name'] . '" does not exist yet - Save creates it.']
            : [false, 'Connected to the server, but there is no database "' . $db['name'] . '" and this user may not create one. Make it in the hosting panel first.'];
    } catch (PDOException $e) {
        return [false, 'Cannot connect: ' . setupShortError($first)];
    }
}

/** A PDO message without its SQLSTATE noise. */
function setupShortError(string $message): string
{
    $message = (string) preg_replace('/^SQLSTATE\[\w+\]\s*(\[\d+\]\s*)?/', '', trim($message));

    return textClip((string) preg_replace('/\s+/', ' ', $message), 300);
}

/**
 * A GET from this server, as the anotoki family's library asks the IAM
 * (anotoki/lib's HttpGet: http or https alone, no redirects): the body of a
 * 200, or null.
 */
function setupHttpGet(string $url): ?string
{
    $answer = \Anotoki\Lib\Support\HttpGet::fetch($url, 5.0);

    return $answer['status'] === 200 && is_string($answer['body']) ? $answer['body'] : null;
}

/**
 * Asks the IAM for its discovery document and its keys - from this server,
 * because this server is what checks every sign-in against them.
 *
 * @return array{0: bool, 1: string}
 */
function setupTestIam(string $issuer, string $clientId): array
{
    $body = setupHttpGet($issuer . '/.well-known/openid-configuration');
    if ($body === null) {
        return [false, 'No answer from ' . $issuer . '/.well-known/openid-configuration. Is the IAM running, and is the address right?'];
    }
    $discovery = json_decode($body, true);
    if (!is_array($discovery) || !isset($discovery['issuer'], $discovery['jwks_uri']) || !is_string($discovery['jwks_uri'])) {
        return [false, 'That address answers, but not like an IAM (no OpenID Connect discovery document).'];
    }
    if (rtrim((string) $discovery['issuer'], '/') !== $issuer) {
        return [false, 'The IAM there calls itself ' . $discovery['issuer'] . ' - use exactly that address.'];
    }

    $keys = setupHttpGet($discovery['jwks_uri']);
    $set = $keys === null ? null : json_decode($keys, true);
    $count = is_array($set) && isset($set['keys']) && is_array($set['keys']) ? count($set['keys']) : 0;
    if ($count === 0) {
        return [false, 'The IAM answers, but its signing keys (' . $discovery['jwks_uri'] . ') do not.'];
    }

    return [true, 'Found the IAM at ' . $issuer . ' with ' . $count . ' signing key' . ($count === 1 ? '' : 's') . '. Make sure it knows this app as "' . $clientId . '".'];
}

// ── Save ──────────────────────────────────────────────────────────────────────

$errors = [];

if ($method === 'POST') {
    $db = setupDatabaseFromForm($form, $savedDb);

    if (!setupProofOk($local, $token, $nonce)) {
        $errors[] = $local ? 'This page was out of date. It is fresh now: check the fields and press Save again.' : 'That is not the token from storage/setup-token.php.';
    }
    $problem = setupDatabaseProblem($db);
    if ($problem !== null) {
        $errors[] = $problem;
    }
    $problem = setupIamProblem($form['issuer'], $form['client_id']);
    if ($problem !== null) {
        $errors[] = $problem;
    }

    // A real host: one install at a time, and none once the lock is there - a
    // second request that started before the first one locked must not write
    // its settings after it. The flock is let go when the request ends.
    if (!$errors && !$local) {
        $guard = @fopen($storage . '/setup.flock', 'c');
        if ($guard === false || !flock($guard, LOCK_EX | LOCK_NB) || is_file($lockFile)) {
            $errors[] = 'Another setup is running, or this site has just been set up. Reload the page.';
        }
    }

    // The database, as the app will use it: made if it may be, then its tables -
    // under the lock every database update takes (api/migrations.php).
    if (!$errors) {
        try {
            try {
                ensureDatabase($db, $db['name']);
            } catch (Throwable $e) {
                // Most hosting will not let the site's user create databases;
                // the one made in the hosting panel is what the connection finds.
            }
            $pdo = dbConnect($db);
            // A database with something applied already is backed up first (storage/backups: the anotoki
            // family's backups); a new one has nothing to keep.
            $migrated = databaseUpdater($pdo, $db)->apply();
            if ($migrated['busy']) {
                throw new RuntimeException('Another database update is running (php migration.php, or an administrator in the app). Wait a moment and press Save again.');
            }
            if ($migrated['failed'] !== null) {
                throw new RuntimeException('The database update ' . migrationLabel($migrated['failed']) . ' failed: ' . $migrated['error']);
            }
            $pdo = null;
        } catch (PDOException $e) {
            $errors[] = 'Cannot connect to the database "' . $db['name'] . '" with these details: ' . setupShortError($e->getMessage());
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }

    if (!$errors) {
        try {
            writeLocalConfig('database', $db);
            // Exactly these three: a file from before (with a sign-in mode and
            // an owner's id) loses them on this save.
            writeLocalConfig('auth', ['issuer' => $form['issuer'], 'client_id' => $form['client_id'], 'cache_dir' => 'storage/cache']);
            if (!is_dir(storageDir() . '/cache')) {
                @mkdir(storageDir() . '/cache', 0775, true);
            }
            $log = [
                'Saved the database connection and the IAM in config/database.local.php and config/auth.local.php.',
                $migrated['applied'] ? 'Made the tables (' . implode(', ', array_map('migrationLabel', $migrated['applied'])) . ').' : 'The tables were up to date.',
                'People sign in through the IAM at ' .
                $form['issuer'] .
                ', where this app is "' .
                $form['client_id'] .
                '". ' .
                'Who may reword its words (EDITOR) and administer it (ADMIN) is set there, in the admin panel.',
            ];
            $steps =
                '<ul>' .
                implode(
                    '',
                    array_map(static function (string $line): string {
                        return '<li>' . h($line) . '</li>';
                    }, $log),
                ) .
                '</ul>';

            if ($local) {
                setupPage(
                    'Saved',
                    $steps .
                        '<div class="actions"><a href="http://localhost:4500/">Open Piano Academy (http://localhost:4500)</a><a href="/">Open it here</a><a href="setup.php">Back to the setup</a></div>' .
                        '<p class="small">Sign in at http://localhost:4500 (npm start in frontend/): that is the address the IAM knows for this app. ' .
                        'This page stays: open it again any time to change the settings or apply a database update.</p>',
                    'good',
                );
            }

            // A real host: the lock first, so the setup refuses to run again even if deleting it fails.
            $locked = @file_put_contents($lockFile, jsonText(['installedAt' => isoNow()]) . "\n") !== false;
            $gone = setupCleanUp($tokenFile);
            $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';

            setupPage(
                'Installed',
                $steps .
                    ($locked && $gone
                        ? '<p class="ok">The setup page has deleted itself.</p>'
                        : '<p class="err">Delete <code>setup.php</code> and <code>storage/setup-token.php</code> by hand now' .
                            ($locked ? '' : ' - and <code>storage/installed.lock</code> could not be written, so the setup would run again') .
                            '.</p>') .
                    '<p>Open the site and sign in with your anotoki account. Every anotoki account holds the MEMBER role here and can use it; ' .
                    'the IAM\'s page for this application says whether signing in is required and which roles may sign in. The IAM\'s ' .
                    'administrators are its administrators (ADMIN), and the IAM gives the EDITOR role to whoever may reword its words.</p>' .
                    ($https ? '' : '<p class="err">Put the site on HTTPS: the browser only lets a page use the piano (Web MIDI) over HTTPS.</p>'),
                'good',
            );
        } catch (Throwable $e) {
            $errors[] = 'The setup stopped: ' . $e->getMessage();
        }
    }
}

// ── The form ────────────────────────────────────────────────────────────────

$field = static function (string $name, string $label, string $type = 'text', string $extra = '') use ($form): string {
    return '<label for="' .
        $name .
        '">' .
        $label .
        '</label><input id="' .
        $name .
        '" name="' .
        $name .
        '" type="' .
        $type .
        '"' .
        ($type === 'text' ? ' value="' . h($form[$name] ?? '') . '"' : '') .
        ' ' .
        $extra .
        '>';
};
$testButton = static function (string $test, string $label): string {
    return '<button class="test" type="button" data-test="' .
        $test .
        '" data-result="test-' .
        $test .
        '">' .
        $label .
        '</button>' .
        '<span class="test-result" id="test-' .
        $test .
        '" role="status"></span>';
};

$passwordSaved = isset($savedDb['password']) && is_string($savedDb['password']) && $savedDb['password'] !== '';
$status =
    $saved['problem'] === null
        ? '<div class="note">This copy is set up' . ($local ? '' : ' already') . '. Saving again keeps everybody\'s progress and applies any database update.</div>'
        : ($saved['database'] !== null || $saved['auth'] !== null
            ? '<div class="err">The saved settings are not complete' . ($local ? ': ' . h((string) $saved['problem']) : '.') . '</div>'
            : '');

$intro = $local
    ? '<p>This sets Piano Academy up on this computer: the database and sign-in through the anotoki IAM. You can come back to it any time.</p>'
    : '<p>This sets the site up: the database connection, sign-in through the anotoki IAM, and the tables. Do it once.</p>' .
        '<div class="note">A token was written to <code>storage/setup-token.php</code> on the server. Open that file with your FTP program, ' .
        'copy the token, and paste it below. That is how the setup knows it is you.</div>';

setupPage(
    $local ? 'Set up Piano Academy' : 'Install Piano Academy',
    $intro .
        $status .
        implode(
            '',
            array_map(static function (string $error): string {
                return '<div class="err">' . h($error) . '</div>';
            }, $errors),
        ) .
        '<form method="post" action="setup.php" autocomplete="off">' .
        ($local ? '<input type="hidden" name="nonce" value="' . h((string) $nonce) . '">' : $field('token', 'Setup token', 'password', 'required')) .
        '<h2>Database (PostgreSQL)</h2>' .
        '<div class="row"><div>' .
        $field('db_host', 'Server', 'text', 'required') .
        '</div><div>' .
        $field('db_port', 'Port', 'text', 'required inputmode="numeric"') .
        '</div></div>' .
        $field('db_name', 'Database name', 'text', 'required') .
        '<div class="row"><div>' .
        $field('db_user', 'User', 'text', 'required') .
        '</div><div>' .
        $field('db_password', 'Password', 'password', $passwordSaved ? 'placeholder="saved - leave empty to keep it"' : '') .
        '</div></div>' .
        $testButton('database', 'Test the database') .
        '<h2>Sign-in: the anotoki IAM</h2>' .
        $field('issuer', 'IAM address', 'text', 'required') .
        '<p class="small">http://localhost:4300 on a development machine; https://iam.anotoki.eu for the live site.</p>' .
        $field('client_id', 'Client id of this app in the IAM', 'text', 'required') .
        $testButton('iam', 'Test the IAM') .
        '<button class="primary" type="submit">' .
        ($local ? 'Save' : 'Install') .
        '</button>' .
        '</form>',
    'plain',
    true,
);
