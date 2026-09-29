<?php

declare(strict_types=1);

/**
 * PHP's built-in web server, made to behave like the Apache the live site
 * runs on.
 *
 *   php -S localhost:8300 router.php      development: the API (and setup.php)
 *                                         behind `ng serve` on :4500, which
 *                                         proxies /api and /setup.php here
 *   start.ps1 / start.sh                  your own computer: the same, plus the
 *                                         built app, on one address
 *
 *   /api/...     the API (api/index.php)
 *   /setup.php   the setup page
 *   anything     the built app from ../frontend/dist/piano-academy/browser/,
 *   else         when it has been built: a file as it is, and any other path
 *                index.html - the app has routes of its own (/trainer,
 *                /lesson/rh-1/drill...). Never a .php file or a dot-file.
 *
 * PIANO_FRONTEND_DIST points at another build (the tests use a small one).
 */

$path = rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));

if ($path === '/api' || str_starts_with($path, '/api/')) {
    require __DIR__ . '/api/index.php';
    return true;
}

if ($path === '/setup.php') {
    require __DIR__ . '/setup.php';
    return true;
}

/** Where the built frontend is, or null when there is none yet. */
function routerFrontendDist(): ?string
{
    $dist = getenv('PIANO_FRONTEND_DIST');
    $dir = is_string($dist) && $dist !== '' ? $dist : dirname(__DIR__) . '/frontend/dist/piano-academy/browser';
    $real = realpath($dir);

    return $real !== false && is_file($real . '/index.html') ? $real : null;
}

/** The type a file goes out with. Anything unknown is a download, never a page. */
function routerContentType(string $file): string
{
    $types = [
        'html' => 'text/html; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'mjs' => 'text/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'map' => 'application/json; charset=utf-8',
        'txt' => 'text/plain; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'ico' => 'image/x-icon',
        'webmanifest' => 'application/manifest+json',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf' => 'font/ttf',
    ];

    return $types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream';
}

function routerSend(int $status, string $type, string $body, array $headers = []): bool
{
    http_response_code($status);
    header('Content-Type: ' . $type);
    header('Content-Length: ' . strlen($body));
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $header) {
        header($header);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo $body;
    }

    return true;
}

$dist = routerFrontendDist();

if ($dist === null) {
    return routerSend(404, 'text/plain; charset=utf-8', "The app is not built here.\n\n"
        . "Developing? Run the frontend with `npm start` in frontend/ and open http://localhost:4500.\n"
        . "Or build it once (`npm run build` in frontend/) - start.ps1 and start.sh do that for you.\n");
}

// A file of the build is sent as it is - but never a PHP file or a dot-file,
// and nothing outside the build (realpath resolves any ../).
$file = str_contains($path, "\0") ? false : realpath($dist . $path);
$inside = $file !== false && str_starts_with($file, $dist . DIRECTORY_SEPARATOR);
$hidden = $inside && (preg_match('~\.(php|phtml|phar)$~i', $file) || preg_match('~[\\\\/]\.~', substr($file, strlen($dist))));

if ($inside && !$hidden && is_file($file)) {
    // The app's shell and its changelog change with every build; the hashed
    // bundles never do.
    $fresh = in_array(basename($file), ['index.html', 'changelog.json', 'theme-boot.js'], true);

    return routerSend(200, routerContentType($file), (string) file_get_contents($file), $fresh ? ['Cache-Control: no-cache'] : []);
}

// Something that looks like a file but is not one is a plain 404; any other
// path is one of the app's own routes.
if ($hidden || preg_match('~\.[A-Za-z0-9]{1,8}$~', $path)) {
    return routerSend(404, 'text/plain; charset=utf-8', "Not found\n");
}

return routerSend(200, 'text/html; charset=utf-8', (string) file_get_contents($dist . '/index.html'), ['Cache-Control: no-cache']);
