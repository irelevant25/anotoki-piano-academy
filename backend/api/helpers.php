<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Small things every handler needs: answering in JSON, reading a JSON body
 * without losing its shape, where a request came from, time, and text
 * measured the way people see it.
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
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $headers = [],
        public readonly array $extra = [],
    ) {
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

/** The first $max characters of a UTF-8 string (no mbstring needed). */
function textClip(string $text, int $max): string
{
    return preg_match('/^.{0,' . $max . '}/us', $text, $m) ? $m[0] : '';
}

/** How many characters: code points, which is at most what the browser counts (UTF-16 units). */
function textLength(string $text): int
{
    return (int) preg_match_all('/./us', $text);
}

/**
 * What the browser counts as a space - the characters String.prototype.trim()
 * takes away and \s matches, character for character: tab, the line breaks,
 * the space, the no-break space, the Unicode spaces, the line and paragraph
 * separators and the byte-order mark. Written out rather than as \s and
 * \p{Z}: those also take U+0085 and U+180E, which the browser does not, and
 * then the two sides would disagree on whether a text is blank.
 */
const TEXT_SPACE = '[\t\n\x0B\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';

/**
 * The text without the spaces around it - exactly the ones the browser's
 * trim() takes away (TEXT_SPACE), not only the ASCII ones PHP's trim() knows.
 *
 * A text the expression cannot get through - a run of more than a million
 * spaces inside it - comes back as it is, never as an empty one: whoever
 * measures it next refuses it as too long, instead of taking it for nothing.
 */
function textTrim(string $text): string
{
    return preg_replace('/^' . TEXT_SPACE . '+|' . TEXT_SPACE . '+$/u', '', $text) ?? $text;
}

/**
 * Is there nothing in the text to see? True when it has no character but
 * white space, separators and format characters: a zero-width space, a word
 * joiner or a soft hyphen alone shows as nothing at all, though trim() leaves
 * each of them. Bytes that are not UTF-8 are nothing to read either.
 *
 * For the app's own strings and the names of its languages, where a text
 * nobody can see would be kept as a string and drawn as an empty place.
 */
function textBlank(string $text): bool
{
    return preg_match('/[^\s\p{Z}\p{Cf}]/u', $text) !== 1;
}

/**
 * A text field's value as it is kept: valid UTF-8 without control characters
 * but tabs and line breaks - or null for what is not text at all. The controls
 * are dropped rather than refused: a soft line break pasted from a word
 * processor, or a form feed from a PDF, would otherwise make a string that
 * can never be saved, however often it is tried.
 */
function textClean(mixed $value): ?string
{
    if (!is_string($value) || preg_match('//u', $value) !== 1) {
        return null;
    }

    return textWithoutControls($value);
}

/** The text without control characters, tabs and line breaks aside. */
function textWithoutControls(string $text): string
{
    return (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text);
}
