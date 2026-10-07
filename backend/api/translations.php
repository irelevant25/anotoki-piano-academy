<?php

declare(strict_types=1);

/**
 * The app's own words, in the languages it speaks: the languages, the strings
 * a page asks for by key, and the grid the staff edit them in. (Note names,
 * song titles and device names are not here: they are not translated.)
 *
 * These tables are the site's, not one person's - the one thing in this
 * backend that is not keyed by a user id. Anybody reads the words (the
 * bundle); only the staff write them - EDITOR or ADMIN, and adding or deleting
 * a language is ADMIN's (requireRole() on the groups of routes/admin.php). A user
 * id appears in one place: who last reworded a string (translations.updated_by),
 * which is the request's person and nothing a body says. Nothing here reads
 * or writes any other table.
 *
 * A key is the code's: migrations write the keys and their first strings
 * (migrations/piano_academy/), the browser only ever changes a string. English
 * is what every other language falls back to, key by key, so it cannot be
 * switched off, deleted, or left without a string.
 *
 * A string is text and is drawn as text - never HTML. What stands in for a
 * value is a {placeholder}, and which ones a key has is fixed by its English
 * string: the code fills them in, and a translation that invented one would
 * show it to the reader as it is written.
 */

/** The language every other one falls back to. */
const TRANSLATION_FALLBACK = 'en';

/**
 * The languages the migrations write strings for. They cannot be deleted: the
 * next migration with strings would fail on the missing language, and a failed
 * migration closes the whole site - on a host with no shell to mend it from.
 * tests/unit/translations.test.php keeps this list true.
 */
const TRANSLATION_SEEDED_LANGUAGES = ['en', 'sk'];

/** The largest body a save or an import of strings may have: every string of a language is a few dozen kB. */
const TRANSLATIONS_BODY_LIMIT = 1024 * 1024;

/** How long one string may be - the longest the app has is a few sentences. */
const TRANSLATION_VALUE_MAX = 2000;

/** A placeholder in a string: {name}. The same expression as the frontend's (core/i18n). */
const TRANSLATION_PLACEHOLDER = '/\{([A-Za-z][A-Za-z0-9_]*)\}/';

const LANGUAGES_MAX = 20;
const LANGUAGE_NAME_MAX = 50;
const LANGUAGE_SORT_MAX = 1000;

// ── Languages ───────────────────────────────────────────────────────────────

/**
 * A language code as this site writes them: "sk", "pt-br". Asked before any
 * query that takes a code from an address - anything else is no language, and
 * bytes that are not UTF-8 never reach the database (which would refuse them:
 * a 503 for what is only a wrong address).
 */
function languageCodeOk(mixed $code): bool
{
    return is_string($code) && preg_match('/^[a-z]{2}(-[a-z]{2})?$/D', $code) === 1;
}

function languageNotFound(): ApiError
{
    return new ApiError(404, 'not_found', 'There is no such language.');
}

function languageInvalid(string $message): ApiError
{
    return new ApiError(422, 'invalid_language', $message);
}

/** A language as the admin panel's pages read it. */
function languageJson(array $row): array
{
    return [
        'code' => $row['code'],
        'name' => $row['name'],
        'nativeName' => $row['native_name'],
        'enabled' => (bool) $row['enabled'],
        'sortOrder' => (int) $row['sort_order'],
        'seeded' => in_array($row['code'], TRANSLATION_SEEDED_LANGUAGES, true),
    ];
}

/** Every language, the ones switched off too, in the order a chooser shows them. */
function languagesAll(): array
{
    return array_map('languageJson', dbAll('SELECT code, name, native_name, enabled, sort_order FROM languages ORDER BY sort_order, name, code'));
}

/**
 * The languages people are offered, as a chooser shows them: code and names,
 * in order. One switched off is not among them.
 *
 * @return array<array{code: string, name: string, nativeName: string}>
 */
function languagesOffered(): array
{
    return array_map(
        static fn(array $row): array => ['code' => $row['code'], 'name' => $row['name'], 'nativeName' => $row['native_name']],
        dbAll('SELECT code, name, native_name FROM languages WHERE enabled ORDER BY sort_order, name, code')
    );
}

/** The language with this code, or null - without a query when it is not a code at all. */
function languageRow(string $code): ?array
{
    return languageCodeOk($code) ? dbOne('SELECT code, name, native_name, enabled, sort_order FROM languages WHERE code = ?', [$code]) : null;
}

/**
 * One of a language's two names: text of 1 to 50 characters, with something
 * in it to see - a name of nothing but a zero-width space would be an empty
 * line in the chooser.
 */
function languageName(mixed $value, string $what): string
{
    $text = textClean($value);
    if ($text === null) {
        throw languageInvalid("$what is not text.");
    }
    $text = textTrim($text);
    if (textBlank($text) || textLength($text) > LANGUAGE_NAME_MAX) {
        throw languageInvalid("$what must be 1 to " . LANGUAGE_NAME_MAX . ' characters long.');
    }

    return $text;
}

/**
 * A new language, {code, name, nativeName, enabled?}: after the ones there
 * are, and offered at once unless `enabled` says false - then it is there for
 * its strings to be written, and people are offered it when an administrator
 * switches it on. It has no strings yet, so until then it would read in
 * English.
 *
 * $body is the request's body as jsonBody() decodes it here - an object; a
 * list, a text, a number or nothing is no language.
 */
function languageCreate(mixed $body): array
{
    $body = translationMapFrom($body);
    if ($body === null) {
        throw languageInvalid('Send the language as {code, name, nativeName}.');
    }
    $code = $body['code'] ?? null;
    if (!languageCodeOk($code)) {
        throw languageInvalid('A language\'s code is two small letters, or two and two with a dash between: "sk", "pt-br".');
    }
    $name = languageName($body['name'] ?? null, 'The name in English');
    $nativeName = languageName($body['nativeName'] ?? null, 'The name as its speakers write it');
    $enabled = true;
    if (array_key_exists('enabled', $body)) {
        if (!is_bool($body['enabled'])) {
            throw languageInvalid('"enabled" is true or false.');
        }
        $enabled = $body['enabled'];
    }

    return dbTx(static function () use ($code, $name, $nativeName, $enabled): array {
        // Whoever adds a language waits here for anybody else who is adding
        // one: the count below is then of rows that are really there, and the
        // most the site keeps holds. (Two transactions that only counted
        // would each miss the other's row and both go past it.) Taken first,
        // so nothing is held while waiting; it lets the rows be read and
        // locked (a save of strings), and stops only what writes the table.
        dbExec('LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE');

        $exists = static fn(): ApiError => new ApiError(409, 'language_exists', "There is a language \"$code\" already.");
        if (dbValue('SELECT 1 FROM languages WHERE code = ?', [$code])) {
            throw $exists();
        }
        if ((int) dbValue('SELECT count(*) FROM languages') >= LANGUAGES_MAX) {
            throw new ApiError(422, 'too_many_languages', 'The site keeps at most ' . LANGUAGES_MAX . ' languages. Delete one that is not used first.');
        }
        $sortOrder = min((int) dbValue('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM languages'), LANGUAGE_SORT_MAX);
        // A row written past this function in this very moment: no row comes
        // back, and no error that would end the transaction.
        $row = dbOne(
            'INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (code) DO NOTHING
             RETURNING code, name, native_name, enabled, sort_order',
            [$code, $name, $nativeName, $enabled, $sortOrder]
        );
        if ($row === null) {
            throw $exists();
        }

        return languageJson($row);
    });
}

/**
 * Changes a language: {name?, nativeName?, enabled?, sortOrder?} - what is
 * not sent stays. English cannot be switched off; any other language can, at
 * any time: it keeps its strings, and is only no longer offered.
 */
function languageUpdate(string $code, mixed $body): array
{
    $row = languageRow($code);
    if ($row === null) {
        throw languageNotFound();
    }
    $body = translationMapFrom($body);
    if ($body === null) {
        throw languageInvalid('Send what changes as {name, nativeName, enabled, sortOrder}.');
    }

    $set = [];
    $params = [];
    if (array_key_exists('name', $body)) {
        $set[] = 'name = ?';
        $params[] = languageName($body['name'], 'The name in English');
    }
    if (array_key_exists('nativeName', $body)) {
        $set[] = 'native_name = ?';
        $params[] = languageName($body['nativeName'], 'The name as its speakers write it');
    }
    if (array_key_exists('enabled', $body)) {
        if (!is_bool($body['enabled'])) {
            throw languageInvalid('"enabled" is true or false.');
        }
        if ($code === TRANSLATION_FALLBACK && !$body['enabled']) {
            throw new ApiError(409, 'fallback_language', 'English cannot be switched off: every other language falls back to it.');
        }
        $set[] = 'enabled = ?';
        $params[] = $body['enabled'];
    }
    if (array_key_exists('sortOrder', $body)) {
        if (!is_int($body['sortOrder']) || $body['sortOrder'] < 0 || $body['sortOrder'] > LANGUAGE_SORT_MAX) {
            throw languageInvalid('The order is a whole number from 0 to ' . LANGUAGE_SORT_MAX . '.');
        }
        $set[] = 'sort_order = ?';
        $params[] = $body['sortOrder'];
    }
    if ($set === []) {
        return languageJson($row);
    }

    $params[] = $code;
    $row = dbOne('UPDATE languages SET ' . implode(', ', $set) . ' WHERE code = ? RETURNING code, name, native_name, enabled, sort_order', $params);
    if ($row === null) {
        throw languageNotFound();
    }

    return languageJson($row);
}

/**
 * Deletes a language and its strings (they go with it: ON DELETE CASCADE).
 * Never English, and never a language the migrations write strings for.
 */
function languageDelete(string $code): void
{
    if (languageRow($code) === null) {
        throw languageNotFound();
    }
    if ($code === TRANSLATION_FALLBACK) {
        throw new ApiError(409, 'fallback_language', 'English cannot be deleted: every other language falls back to it.');
    }
    if (in_array($code, TRANSLATION_SEEDED_LANGUAGES, true)) {
        throw new ApiError(409, 'seeded_language', 'This language is one the app is released in: every update brings strings for it, and would fail without it. Switch it off instead.');
    }

    dbTx(static function () use ($code): void {
        // The language's row first, locked: a save of strings holds every
        // language's row until it is kept (translationsSave()), so this waits
        // for it - and of two people deleting the same language at once, the
        // second finds it gone and is told so.
        if (dbValue('SELECT 1 FROM languages WHERE code = ? FOR UPDATE', [$code]) === null) {
            throw languageNotFound();
        }
        dbExec('DELETE FROM languages WHERE code = ?', [$code]);
    });
}

// ── The strings a page asks for ─────────────────────────────────────────────

/** A map that goes out as a JSON object, empty or not: PHP would write an empty one as []. */
function translationMap(array $map): object
{
    return (object) $map;
}

/**
 * A map that came in as a JSON object, as a PHP array - or null for anything
 * else. Bodies are decoded to objects in this app (jsonBody(): the progress
 * documents must keep {} apart from []), so an object is a stdClass here and a
 * list is an array: a list - the empty one too -, a text, a number, true and
 * nothing at all are no map. Only the map itself is turned; what it holds
 * stays as it came.
 *
 * PHP makes whole numbers of keys like "12": whoever walks the map reads each
 * key as (string) $key.
 */
function translationMapFrom(mixed $value): ?array
{
    return $value instanceof stdClass ? (array) $value : null;
}

/**
 * The strings of a grid save's body, {values: {key: {language: text}}}, as
 * the arrays translationsCheck() takes - or null when the body has no such
 * map. A key whose strings are not given as an object - a list, a text,
 * nothing - gets false in their place: translationsCheck() refuses it, and
 * says which key. (Not the list itself: once an object is an array, one with
 * the keys "0", "1"... could no longer be told from a list.)
 */
function translationValuesFrom(mixed $body): ?array
{
    $values = translationMapFrom($body instanceof stdClass ? ($body->values ?? null) : null);
    if ($values === null) {
        return null;
    }
    foreach ($values as $key => $cells) {
        $values[$key] = translationMapFrom($cells) ?? false;
    }

    return $values;
}

/** A language's own strings, by key: [key => text], in the keys' order. */
function translationsOf(string $code): array
{
    $values = [];
    foreach (dbAll('SELECT key_name, value FROM translations WHERE language_code = ? ORDER BY key_name COLLATE "C"', [$code]) as $row) {
        $values[$row['key_name']] = $row['value'];
    }

    return $values;
}

/**
 * What the app reads its words from: GET /api/translations/{code}, for a
 * code that is one (languageCodeOk). `values` is the language's strings with
 * English under them, so a key with no string in it reads in English;
 * `languages` the ones offered; `english` the fallback's own strings - left
 * out when that is what `values` is.
 *
 * `language` says which language it really is. A code with a region that is
 * not offered itself is answered by its language when that one is: "sk-sk" -
 * a Slovak browser's first wish - by "sk", in this one request rather than
 * with English and a second request before the first page. An offered
 * "pt-br" is itself. Anything else the site does not have, or has switched
 * off, is answered in English.
 *
 * @return array{language: string, languages: array, values: object, english?: object}
 */
function translationBundle(string $code): array
{
    $offered = languagesOffered();
    $codes = array_column($offered, 'code');
    $base = substr($code, 0, 2); // of a code that is one (languageCodeOk): its language, without the region
    $language = match (true) {
        in_array($code, $codes, true) => $code,
        in_array($base, $codes, true) => $base,
        default => TRANSLATION_FALLBACK,
    };

    $english = translationsOf(TRANSLATION_FALLBACK);
    $bundle = ['language' => $language, 'languages' => $offered];
    if ($language === TRANSLATION_FALLBACK) {
        $bundle['values'] = translationMap($english);

        return $bundle;
    }

    $values = translationsOf($language) + $english;
    ksort($values, SORT_STRING);
    $bundle['values'] = translationMap($values);
    $bundle['english'] = translationMap($english);

    return $bundle;
}

/**
 * Are the words' tables there (migration 002)? The bundle is asked for while
 * an update waits too (the site's gate lets it through), and a database from
 * before 002 has no words to give yet - asked without touching a table that
 * is not there.
 */
function translationsReady(): bool
{
    return (bool) dbValue(
        "SELECT to_regclass('languages') IS NOT NULL AND to_regclass('translation_keys') IS NOT NULL AND to_regclass('translations') IS NOT NULL"
    );
}

/**
 * Does the browser hold this very answer already? If-None-Match compared the
 * weak way, which is what a conditional GET asks for: any of the tags it
 * lists, or *. A tag comes back as whatever stood between the site and the
 * browser made of it, so both marks of a compressed answer are taken off
 * first: W/ in front (a proxy or a CDN that compressed it weakens the tag),
 * and -gzip, -br or -zstd inside the quotes (Apache's mod_deflate and
 * mod_brotli add it, and cannot be told not to from an .htaccess). Without
 * the second the 304 would never be answered behind such a server. The tag
 * itself is 32 hex digits, so it never ends that way on its own.
 */
function translationsNotModified(string $ifNoneMatch, string $etag): bool
{
    foreach (explode(',', $ifNoneMatch) as $candidate) {
        $candidate = trim($candidate);
        if (str_starts_with($candidate, 'W/')) {
            $candidate = substr($candidate, 2);
        }
        $candidate = (string) preg_replace('/-(gzip|br|zstd)"$/D', '"', $candidate);
        if ($candidate === '*' || $candidate === $etag) {
            return true;
        }
    }

    return false;
}

// ── The admin panel's grid ───────────────────────────────────────────────────

/**
 * Every key with its strings in every language, and the languages:
 * {languages: [all], keys: [{name, description, values: {en: "...", sk: "..."}}]},
 * the keys by name - so the forms of a plural (.few, .one, .other) are together.
 */
function translationGrid(): array
{
    $keys = [];
    foreach (dbAll('SELECT name, description FROM translation_keys ORDER BY name COLLATE "C"') as $row) {
        $keys[$row['name']] = ['name' => $row['name'], 'description' => (string) ($row['description'] ?? ''), 'values' => []];
    }
    foreach (dbAll('SELECT key_name, language_code, value FROM translations ORDER BY language_code') as $row) {
        $keys[$row['key_name']]['values'][$row['language_code']] = $row['value'];
    }

    return [
        'languages' => languagesAll(),
        'keys' => array_map(
            static fn(array $key): array => ['name' => $key['name'], 'description' => $key['description'], 'values' => translationMap($key['values'])],
            array_values($keys)
        ),
    ];
}

function translationInvalid(string $code, string $message, array $extra = []): ApiError
{
    return new ApiError(422, $code, $message, [], $extra);
}

/**
 * The placeholders a string uses, each once, in the order they first appear.
 *
 * @return string[]
 */
function translationPlaceholders(string $text): array
{
    preg_match_all(TRANSLATION_PLACEHOLDER, $text, $matches);

    return array_values(array_unique($matches[1]));
}

/**
 * Checks strings somebody wants kept - a save of the grid, an import, the
 * command line - and says what to write. Everything is checked before
 * anything is written; the first thing wrong is refused (422), with the key
 * and the language it is about:
 *
 *   invalid_value         not {key: {language: text}}; a value that is not text, or longer than 2000 characters
 *   unknown_key           a key the site does not have (with `keys`: every such key sent)
 *   unknown_language      a language the site does not have
 *   fallback_required     an empty English string - every other language falls back to it
 *   invalid_placeholder   a { or } that is not part of a {placeholder}: "{ count }", "{počet}", "{count", "{{count}}"
 *   placeholder_changed   an English string whose {placeholders} are not exactly the stored English string's
 *   unknown_placeholder   another language's string with a {placeholder} the English one does not have
 *
 * An empty string in another language means "no string of its own": the row
 * goes, and the language reads that key in English. Empty is a string with
 * nothing in it to see (textBlank): spaces, or a zero-width space alone,
 * which would otherwise be kept and drawn as an empty place.
 *
 * A translation may leave a placeholder out (Slovak often says it another
 * way), but never add one: the code fills in only the ones the English string
 * has. For a key with no English string yet, the English sent with it is what
 * counts. And a brace is only ever part of a placeholder: the page fills in
 * what is written exactly as {name} and leaves anything else as it stands, so
 * a placeholder with a space in it, or with its name translated, would be
 * read by everybody as braces and a word.
 *
 * What is to be written comes back by key and then by language, whatever
 * order it was sent in: every save takes its rows in that one order, so two
 * saves of the same strings wait for each other instead of each holding a
 * row the other needs (which the database ends by failing one of them).
 *
 * It takes PHP arrays - the routes turn a body's objects into them
 * (translationValuesFrom(), translationMapFrom()) - and reads nothing itself,
 * so it can be tested without a database. Every array is a map here: a list
 * is told apart while it is still JSON, and never reaches this as an array.
 *
 * @param mixed                 $values    {key: {language code: text}}
 * @param string[]              $keys      every key there is
 * @param array<string, string> $languages every language there is: code => its name in English
 * @param array<string, string> $english   the stored English string of every key that has one
 *
 * @return array<array{key: string, language: string, value: ?string}> value null: delete that string
 */
function translationsCheck(mixed $values, array $keys, array $languages, array $english): array
{
    if (!is_array($values)) {
        throw translationInvalid('invalid_value', 'Send the strings by key and language: {key: {language: text}}.');
    }

    $known = array_fill_keys($keys, true);
    // What is quoted back in a refusal is never longer than a key can be.
    $quote = static fn(string $text): string => '"' . textClip($text, 200) . '"';
    $changes = [];

    foreach ($values as $key => $cells) {
        $key = (string) $key; // PHP made a number of a key like "12"
        if (!is_array($cells)) {
            throw translationInvalid('invalid_value', 'The strings of ' . $quote($key) . ' are not given by language: {language: text}.', ['key' => textClip($key, 200)]);
        }
        if (!isset($known[$key])) {
            $unknown = array_values(array_filter(array_map('strval', array_keys($values)), static fn(string $name): bool => !isset($known[$name])));
            throw translationInvalid(
                'unknown_key',
                count($unknown) === 1
                    ? 'The site has no key ' . $quote($key) . '. Keys are made by the code, never here.'
                    : 'The site has no such keys: ' . implode(', ', array_map($quote, array_slice($unknown, 0, 20))) . (count($unknown) > 20 ? ' and ' . (count($unknown) - 20) . ' more' : '') . '. Keys are made by the code, never here.',
                ['key' => textClip($key, 200), 'keys' => array_map(static fn(string $name): string => textClip($name, 200), $unknown)]
            );
        }

        // The placeholders the key has: its stored English string's - or, for a
        // key that has none yet, those of the English string sent with it.
        $stored = $english[$key] ?? null;
        $sentEnglish = textClean($cells[TRANSLATION_FALLBACK] ?? null);
        $placeholders = translationPlaceholders($stored ?? $sentEnglish ?? '');

        foreach ($cells as $code => $value) {
            $code = (string) $code;
            $about = ['key' => $key, 'language' => textClip($code, 20)];
            if (!isset($languages[$code])) {
                throw translationInvalid('unknown_language', 'The site has no language ' . $quote($code) . '.', $about);
            }
            $name = $languages[$code];

            $text = textClean($value);
            if ($text === null) {
                throw translationInvalid('invalid_value', "The $name string of \"$key\" is not text.", $about);
            }
            $text = textTrim($text);
            if (textBlank($text)) {
                if ($code === TRANSLATION_FALLBACK) {
                    throw translationInvalid('fallback_required', "\"$key\" needs its English string: every other language falls back to it.", $about);
                }
                $changes[] = ['key' => $key, 'language' => $code, 'value' => null];
                continue;
            }
            if (textLength($text) > TRANSLATION_VALUE_MAX) {
                throw translationInvalid('invalid_value', "The $name string of \"$key\" is longer than " . TRANSLATION_VALUE_MAX . ' characters.', $about);
            }
            // With every placeholder taken out, no brace is left - in any
            // language: what is left would be shown as it is written. The
            // sentence ends with what can be done about it, and the example
            // is one of the key's own placeholders - a key that has none is
            // told so, for any placeholder written there is refused next.
            if (preg_match('/[{}]/', (string) preg_replace(TRANSLATION_PLACEHOLDER, '', $text)) === 1) {
                $how = $placeholders === []
                    ? 'This key has no placeholder, so its strings can hold no { or }.'
                    : 'A placeholder is written exactly as the English string has it, like {' . $placeholders[0] . '}: no spaces, and its name is not translated.';
                throw translationInvalid('invalid_placeholder', "The $name string of \"$key\" has a { or } that is not part of a placeholder. $how", $about);
            }

            $used = translationPlaceholders($text);
            if ($code === TRANSLATION_FALLBACK) {
                $changed = array_merge(array_diff($placeholders, $used), array_diff($used, $placeholders));
                if ($changed !== []) {
                    $placeholder = $changed[0];
                    throw translationInvalid(
                        'placeholder_changed',
                        in_array($placeholder, $placeholders, true)
                            ? "The English string of \"$key\" must keep {{$placeholder}}: the app puts a value there."
                            : "The English string of \"$key\" cannot use {{$placeholder}}: the app has no value for it.",
                        $about + ['placeholder' => $placeholder]
                    );
                }
            } else {
                $unknown = array_values(array_diff($used, $placeholders));
                if ($unknown !== []) {
                    throw translationInvalid(
                        'unknown_placeholder',
                        "The $name string of \"$key\" uses {{$unknown[0]}}, which its English string does not have.",
                        $about + ['placeholder' => $unknown[0]]
                    );
                }
            }

            $changes[] = ['key' => $key, 'language' => $code, 'value' => $text];
        }
    }

    // One order for every save (strcmp: <=> would compare "10" and "9" as numbers).
    usort($changes, static fn(array $a, array $b): int => strcmp($a['key'], $b['key']) ?: strcmp($a['language'], $b['language']));

    return $changes;
}

/**
 * Keeps strings: {key: {language: text}}, only the ones that changed. All of
 * it is checked first (translationsCheck) and written in one transaction, or
 * none of it. A string sent as it already is stays as it was - with who wrote
 * it and when. Two people changing the same string: the last save is kept.
 *
 * $userId is who is saving - the request's person, the verified token's - or
 * null for the command line.
 */
function translationsSave(mixed $values, ?int $userId): void
{
    dbTx(static function () use ($values, $userId): void {
        // FOR SHARE: no language is deleted between the check and the writing.
        $languages = array_column(dbAll('SELECT code, name FROM languages FOR SHARE'), 'name', 'code');
        $keys = array_column(dbAll('SELECT name FROM translation_keys'), 'name');

        foreach (translationsCheck($values, $keys, $languages, translationsOf(TRANSLATION_FALLBACK)) as $change) {
            if ($change['value'] === null) {
                dbExec('DELETE FROM translations WHERE key_name = ? AND language_code = ?', [$change['key'], $change['language']]);
                continue;
            }
            dbExec(
                'INSERT INTO translations (key_name, language_code, value, updated_by) VALUES (?, ?, ?, ?)
                 ON CONFLICT (key_name, language_code) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP, updated_by = EXCLUDED.updated_by
                  WHERE translations.value IS DISTINCT FROM EXCLUDED.value',
                [$change['key'], $change['language'], $change['value'], $userId]
            );
        }
    });
}

/** A language's own strings as a flat {key: text} - not merged with English, and {} when it has none. */
function translationsExport(string $code): object
{
    if (languageRow($code) === null) {
        throw languageNotFound();
    }

    return translationMap(translationsOf($code));
}

/**
 * A language's strings back in, from a flat {key: text} (a PHP array: the
 * route turns the body's object into one with translationMapFrom(), the
 * command line reads a file into one): the same checks as a save. An empty
 * string - one with nothing in it to see (textBlank) - is a key nobody has
 * translated yet, as an export filled in by hand leaves it, and is passed
 * over: an import deletes nothing. A key the site does not have is refused,
 * empty or not.
 */
function translationsImport(string $code, mixed $body, ?int $userId): void
{
    if (languageRow($code) === null) {
        throw languageNotFound();
    }
    // A list never comes as an array: the route's translationMapFrom() and
    // translationFileRead() take only an object, so {"0": ...} is a map here.
    if (!is_array($body)) {
        throw translationInvalid('invalid_value', 'Send the strings as one flat object: {key: text}.');
    }

    $values = [];
    foreach ($body as $key => $text) {
        $clean = textClean($text);
        $values[$key] = $clean !== null && textBlank($clean) ? [] : [$code => $text];
    }
    translationsSave($values, $userId);
}
