<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Small things every handler needs: answering in JSON, reading a JSON body
 * without losing its shape, where a request came from, time, and a text cut
 * to a length.
 *
 * Bodies are decoded to objects, not arrays. PHP would turn the empty progress
 * object {} into the list [], and the browser would get back something that is
 * no longer keyed by MIDI number.
 */

/** The largest request body taken unless a route says otherwise. A whole progress document is a few kB. */
const BODY_LIMIT = 256 * 1024;

/**
 * A refusal with the status, code and sentence to answer it with. Thrown from
 * deep inside a check; the error handler in api/index.php turns it into the
 * one error shape the frontend reads: {"error": "...", "code": "...", ...extra}.
 */
final class ApiError extends RuntimeException
{
    /**
     * @param array<string, string> $headers
     * @param array<string, mixed>  $extra   more fields for the answer (which key, which language)
     */
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message, public readonly array $headers = [], public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}

/** JSON as JavaScript writes it: UTF-8 and slashes as they are. */
function jsonText(mixed $value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function respondJson(Response $response, mixed $data, int $status = 200): Response
{
    return respondJsonText($response, jsonText($data), $status);
}

/** A body that is JSON text already - the documents the database hands back as they are. */
function respondJsonText(Response $response, string $json, int $status = 200): Response
{
    $response->getBody()->write($json);

    return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * A refusal in the one shape the frontend reads: a sentence and a code.
 *
 * @param array<string, string> $headers
 */
function respondError(Response $response, int $status, string $code, string $message, array $headers = [], array $extra = []): Response
{
    $response = respondJson($response, ['error' => $message, 'code' => $code] + $extra, $status);
    foreach ($headers as $name => $value) {
        $response = $response->withHeader($name, $value);
    }

    return $response;
}

/**
 * The request's JSON body - objects as stdClass, lists as arrays - or null
 * when there is none. Anything that is not JSON is refused, so an empty or
 * mistyped request can never be read as an empty progress object. At most
 * $limit bytes are taken: 413 for more.
 */
function jsonBody(Request $request, int $limit = BODY_LIMIT): mixed
{
    $length = $request->getHeaderLine('Content-Length');
    if (ctype_digit($length) && (int) $length > $limit) {
        throw new ApiError(413, 'too_large', 'The request body is too large.');
    }

    // Read at most one byte past the limit: enough to know it is too large
    // without holding all of it.
    $stream = $request->getBody();
    $raw = '';
    while (!$stream->eof() && strlen($raw) <= $limit) {
        $chunk = $stream->read($limit + 1 - strlen($raw));
        if ($chunk === '') {
            break;
        }
        $raw .= $chunk;
    }
    if (strlen($raw) > $limit) {
        throw new ApiError(413, 'too_large', 'The request body is too large.');
    }
    if (trim($raw) === '') {
        return null;
    }

    $type = strtolower($request->getHeaderLine('Content-Type'));
    if (!preg_match('~^application/([a-z0-9.+-]*\+)?json\b~', $type)) {
        throw new ApiError(415, 'unsupported_media_type', 'Send the body as JSON (Content-Type: application/json).');
    }

    try {
        return json_decode($raw, false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON.');
    }
}

/** REMOTE_ADDR as the server saw it. */
function requestRemoteAddr(Request $request): string
{
    return (string) ($request->getServerParams()['REMOTE_ADDR'] ?? '');
}

/** 2026-09-27T10:15:00.123Z, the way toISOString() writes it. */
function isoNow(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

/**
 * The first $max characters of a UTF-8 string (no mbstring needed). (The
 * rules of the app's words - what a string is, when it is blank, how long it
 * is - are the family's library's: Anotoki\Lib\Translations\Text.)
 */
function textClip(string $text, int $max): string
{
    return preg_match('/^.{0,' . $max . '}/us', $text, $m) ? $m[0] : '';
}
