<?php

declare(strict_types=1);

/**
 * Builds exactly what to upload to the live site: one folder whose contents
 * go into the site's web root.
 *
 *   php tools/build.php [--out=DIR] [--frontend=DIR]
 *
 *     --out        where (default: dist/ at the top of the repository)
 *     --frontend   an Angular build to use as it is, instead of building one
 *                  (the tests use a small stand-in)
 *
 * It first builds the frontend - `npm ci` when frontend/node_modules is
 * missing, then `npm run build` (ng build, production) - and then puts
 * together:
 *
 *   index.html, *.js, *.css, media/, changelog.json ...   the app (the Angular build)
 *   .htaccess        /api/ to the API; every other path that is not a file to
 *                    index.html (the app's own routes); the backend's folders
 *                    closed; the security headers
 *   setup.php        the setup page - the first install, and later updates
 *   api/             the API: index.php (the front controller) and its code
 *   config/          config.php only - setup.php writes the *.local.php files here
 *   migrations/      the database's migrations
 *   vendor/          Slim and its dependencies (the host cannot run composer)
 *   storage/         empty; PHP writes the IAM key cache, the setup token and lock
 *
 * Left out: every *.local.php (your settings), your progress (server/data/),
 * router.php, migration.php and tools/ (for computers with a shell), the tests.
 * DEVELOPING.md ("Deploying") has the rest.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const BUILD_MARKER = '.piano-academy-build';

$backend = dirname(__DIR__);
$repository = dirname($backend);
$options = getopt('', ['out:', 'frontend:']);
$out = rtrim(str_replace('\\', '/', (string) ($options['out'] ?? "$repository/dist")), '/');

function fail(string $message): never
{
    fwrite(STDERR, "build: $message\n");
    exit(1);
}

/** Every file under $dir, as paths relative to it (forward slashes), sorted. */
function filesUnder(string $dir): array
{
    $files = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if ($file->isFile()) {
            $files[] = str_replace('\\', '/', substr($file->getPathname(), strlen($dir) + 1));
        }
    }
    sort($files);

    return $files;
}

function removeTree(string $dir): void
{
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $entry) {
        $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
    }
}

/** Runs one of the fixed npm commands below in $cwd, its output shown; false when it failed. */
function runCommand(array $command, string $cwd): bool
{
    // npm is npm.cmd on Windows: a batch file, which needs cmd.exe - and cmd.exe
    // loses the batch file's own folder when its name arrives in quotes, as an
    // argument list would put it. So there it goes as one plain command line
    // (PHP hands a string to cmd.exe); these commands are fixed words only.
    $process = proc_open(PHP_OS_FAMILY === 'Windows' ? implode(' ', $command) : $command, [STDIN, STDOUT, STDERR], $pipes, $cwd);

    return is_resource($process) && proc_close($process) === 0;
}

/**
 * $path made absolute, with the parts that do not exist yet resolved against
 * the nearest folder that does - so a new --out is judged by where it would be.
 */
function resolvedPath(string $path): string
{
    $tail = [];
    while (realpath($path) === false && dirname($path) !== $path) {
        array_unshift($tail, basename($path));
        $path = dirname($path);
    }
    $base = str_replace('\\', '/', (string) realpath($path));

    return rtrim($base . ($tail ? '/' . implode('/', $tail) : ''), '/');
}

// ── The output folder: new, empty, or an earlier build - never anything else ─

$realRepository = str_replace('\\', '/', (string) realpath($repository));
$realOut = resolvedPath($out);
if (strcasecmp($realOut, $realRepository) === 0 || stripos($realRepository . '/', $realOut . '/') === 0) {
    fail("--out=$out would hold the repository itself.");
}
foreach (['backend', 'frontend', 'server', '.git', '.claude'] as $inside) {
    if (stripos($realOut . '/', "$realRepository/$inside/") === 0) {
        fail("--out=$out is inside the repository's $inside/.");
    }
}
if (is_dir($out)) {
    $entries = array_diff(scandir($out) ?: [], ['.', '..']);
    if ($entries && !is_file("$out/" . BUILD_MARKER)) {
        fail("$out is not empty and is not an earlier build. Choose another --out.");
    }
} elseif (!mkdir($out, 0775, true)) {
    fail("cannot make $out");
}

// ── The frontend ────────────────────────────────────────────────────────────

if (isset($options['frontend'])) {
    $browser = rtrim(str_replace('\\', '/', (string) $options['frontend']), '/');
} else {
    $frontend = "$repository/frontend";
    if (!is_dir("$frontend/node_modules") && !runCommand(['npm', 'ci'], $frontend)) {
        fail('npm ci failed in frontend/ (is Node.js 22 installed?).');
    }
    if (!runCommand(['npm', 'run', 'build'], $frontend)) {
        fail('the frontend did not build (npm run build in frontend/).');
    }
    $browser = "$frontend/dist/piano-academy/browser";
}
if (!is_file("$browser/index.html")) {
    fail("there is no Angular build at $browser (no index.html).");
}

// ── Assemble ────────────────────────────────────────────────────────────────

if (is_dir($out)) {
    removeTree($out);
}

$count = 0;
$bytes = 0;
$add = static function (string $from, string $to) use (&$count, &$bytes): void {
    if (!is_dir(dirname($to)) && !mkdir(dirname($to), 0775, true) && !is_dir(dirname($to))) {
        fail('cannot make ' . dirname($to));
    }
    if (!copy($from, $to)) {
        fail("cannot copy $from");
    }
    $count++;
    $bytes += (int) filesize($from);
};

// The app: every file of the build - but no PHP file or dot-file, whatever
// a build might hold; the .htaccess below is this script's.
foreach (filesUnder($browser) as $relative) {
    if (!preg_match('~(^|/)\.|\.(php|phtml|phar)$~i', $relative)) {
        $add("$browser/$relative", "$out/$relative");
    }
}
// The notices of the libraries in the bundles (VexFlow's MIT licence among
// them), which the Angular build writes beside browser/.
if (is_file(dirname($browser) . '/3rdpartylicenses.txt')) {
    $add(dirname($browser) . '/3rdpartylicenses.txt', "$out/3rdpartylicenses.txt");
}

// The backend: the code, the migrations, Slim - never a settings file.
foreach (['api', 'migrations', 'vendor'] as $folder) {
    foreach (filesUnder("$backend/$folder") as $relative) {
        if (!preg_match('~\.local\.php$|(^|/)\.(?!htaccess$)~', $relative)) {
            $add("$backend/$folder/$relative", "$out/$folder/$relative");
        }
    }
}
$add("$backend/config/config.php", "$out/config/config.php");
$add("$backend/setup.php", "$out/setup.php");
$add("$backend/composer.json", "$out/composer.json");
$add("$backend/composer.lock", "$out/composer.lock");

// Folders only PHP reads: closed to the web, wherever PHP would run a file.
$deny = "# Not for the web: only PHP reads these files.\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
    . "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n";
foreach (['config', 'migrations', 'vendor', 'storage'] as $folder) {
    if (!is_dir("$out/$folder")) {
        mkdir("$out/$folder", 0775, true);
    }
    file_put_contents("$out/$folder/.htaccess", $deny);
}
mkdir("$out/storage/cache", 0775, true);

// The site's own rules. The Content-Security-Policy allows this origin only,
// plus https: for fetch - the IAM's token endpoint is on its own origin, and
// the build cannot know which one the setup will name.
$csp = implode('; ', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
]);
file_put_contents("$out/.htaccess", <<<HTACCESS
# Piano Academy - the web root: the app, with its API in api/. Written by
# backend/tools/build.php; change that, not this.

DirectoryIndex index.html
Options -Indexes

# ES modules need a JavaScript type; older mime.types files do not know .mjs.
AddType text/javascript .js .mjs

# The access token must reach PHP. Apache running PHP as CGI/FastCGI drops the
# Authorization header unless told otherwise (Apache 2.4.13 or newer) ...
<IfModule mod_version.c>
    <IfVersion >= 2.4.13>
        CGIPassAuth On
    </IfVersion>
</IfModule>
# ... and where that is not possible, it is copied into the environment, where
# PHP finds it as HTTP_AUTHORIZATION or REDIRECT_HTTP_AUTHORIZATION.
<IfModule mod_setenvif.c>
    SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1
</IfModule>

<IfModule mod_rewrite.c>
    RewriteEngine On

    # The API is its own handler: api/.htaccess sends it all to api/index.php.
    RewriteRule ^api(/|$) - [L]

    # What only PHP reads is never served, even where a folder's own
    # .htaccess would not be read.
    RewriteRule ^(config|migrations|vendor|storage)(/|$) - [F,L]

    # Real files (the bundles, changelog.json, setup.php) as they are; every
    # other path is one of the app's own routes and gets the app.
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [L]
</IfModule>

# The only PHP a visitor may run here: the setup page, while it is still here
# (it deletes itself when it is done). api/.htaccess lets api/index.php run.
<FilesMatch "\.(php|phtml|phar)$">
    Require all denied
</FilesMatch>
<FilesMatch "^setup\.php$">
    Require all granted
</FilesMatch>

<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set Referrer-Policy "same-origin"
    Header always set Content-Security-Policy "$csp"
</IfModule>

HTACCESS);

file_put_contents("$out/" . BUILD_MARKER, 'Built by backend/tools/build.php on ' . gmdate('Y-m-d H:i:s') . " UTC. Upload everything in this folder into the site's web root.\n");

printf("Built %s: %d files, %.1f MB.\n\n", $out, $count + 6, $bytes / 1048576);
echo <<<TXT
Upload (FTP) everything in $out/ into the site's web root, keeping the folders
as they are - e.g. the folder the domain piano.anotoki.eu points at. PHP must be
able to write into config/ (setup.php writes the settings there) and storage/.

Then open https://<the site>/setup.php and follow it. It needs the setup token
from storage/setup-token.php, which it writes on the first visit. The site needs
HTTPS: the browser only lets a page use the piano (Web MIDI) over HTTPS.

TXT;
