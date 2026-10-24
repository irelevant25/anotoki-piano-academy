<?php

declare(strict_types=1);

use Anotoki\Lib\Translations\Cli\EnglishDictionary;
use Anotoki\Lib\Translations\Cli\KeyScanner;

/**
 * Which keys the frontend asks for, and the English the shell keeps for when
 * it has no strings - the anotoki family's scan and reader (anotoki/lib's
 * Cli\KeyScanner and Cli\EnglishDictionary), told where Piano Academy's
 * frontend is and what of it they pass over. For tools/translations.php (the
 * command line) and the tests. Functions only; tools/ is for computers with
 * a shell and is never uploaded.
 *
 * The strings live in the database so they can be edited in the browser,
 * which means nothing stops a template asking for a key no migration ever
 * wrote: the page shows the key itself, and the mistake is released. The scan
 * is what catches it - and the other way round, a key left in the database
 * that no page asks for any more. How it recognises a key is the library's
 * (KeyScanner's own comment): a quoted literal of a key's shape whose
 * namespace the database has, the plural families, a key asked for the wrong
 * way, keys put together at run time from a declared prefix, innerHTML given
 * a translated string.
 *
 * What is Piano Academy's own:
 *
 *   - the sources, frontend/src/app: every .ts and .html but the specs,
 *     shared/testing/ (the specs' helpers) and shared/i18n/kept-english.ts - the
 *     English the shell falls back to while it has no strings at all, a
 *     second copy of some of them: a key named only there is used by nothing;
 *   - the keys put together at run time, declared in shared/i18n/dynamic-keys.ts
 *     (prefix -> every tail; the file is read only for what it declares);
 *   - the pipes and calls are the library's (translate, translatePlural; t,
 *     around, has, plural, aroundPlural), and so is the namespace never looked
 *     for: anotoki, the library's own words.
 */

/** Where the keys put together at run time are declared, under the frontend's src/app. */
const TRANSLATION_DYNAMIC_KEYS_FILE = 'shared/i18n/dynamic-keys.ts';

/** The English the shell keeps for when it has no strings, under the frontend's src/app: not read for keys. */
const TRANSLATION_KEPT_ENGLISH_FILE = 'shared/i18n/kept-english.ts';

/** The frontend's sources, seen from backend/tools/. */
function translationKeysFrontendRoot(): string
{
    return str_replace('\\', '/', dirname(__DIR__, 2)) . '/frontend/src/app';
}

/** The family's scan of this app's frontend ($root: the tests' own small frontends). */
function translationKeyScanner(?string $root = null): KeyScanner
{
    return new KeyScanner($root ?? translationKeysFrontendRoot(), exclude: ['shared/testing/**', TRANSLATION_KEPT_ENGLISH_FILE], dynamicKeys: TRANSLATION_DYNAMIC_KEYS_FILE);
}

/**
 * An object of English kept-english.ts holds, read as text - KEPT_ENGLISH,
 * this app's own keys, or KEPT_LIBRARY_ENGLISH, the library's words this app
 * says its own way: [key => English]. Anything the reader cannot read whole
 * throws (RuntimeException): a key it skipped would pass any test.
 *
 * @return array<string, string>
 */
function translationKeptEnglish(string $const = 'KEPT_ENGLISH', ?string $root = null): array
{
    return EnglishDictionary::read(($root ?? translationKeysFrontendRoot()) . '/' . TRANSLATION_KEPT_ENGLISH_FILE, $const);
}
