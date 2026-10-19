<?php

// frontend/.htaccess (anotoki-deploy writes it) as PHP's built-in server can play it, for the tests that serve a
// release: the backend's addresses to index.php, a file of the app as it is, a missing one with an extension a 404
// (an old bundle after a release), every other address the app (index.html).

declare(strict_types=1);

$path = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = (string) $_SERVER['DOCUMENT_ROOT'];
if (preg_match('~^/(api(/|$)|setup\.php$)~', $path) === 1) {
    require $root . '/index.php';

    return true;
}
if ($path !== '/' && is_file($root . $path)) {
    return false;
}
if (preg_match('~\.[^/]*$~', $path) === 1) {
    http_response_code(404);

    return true;
}
header('Content-Type: text/html; charset=utf-8');
readfile($root . '/index.html');

return true;
