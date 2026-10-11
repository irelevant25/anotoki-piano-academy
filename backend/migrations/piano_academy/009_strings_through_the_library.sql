-----------------------------------------------------------
-- THE APP'S WORDS THROUGH THE ANOTOKI FAMILY'S LIBRARY
--
-- Finished (2026-10-11). The owner applies it with 005, 006, 007 and 008
-- at the hand-over (after a pg_dump of the database): on this computer by
-- Save on /setup.php (or php migration.php, or an ADMIN's "Apply pending"
-- on the admin panel's Migrations page); on the host, upload the build and
-- apply it at once on the Migrations page. The anotoki library's own two
-- files (its set anotoki_translations: 001_languages_and_strings.sql,
-- 002_library_words.sql) run right after it, in the same Apply. Until then
-- the site tells everybody it is being updated, and an ADMIN that a
-- database update is waiting. Once applied it never changes: the next
-- change is 010.
--
-- Every anotoki site keeps its words in the same three tables, and from
-- anotoki-lib 0.3.0 one implementation reads and writes them for every
-- site (the family's library: the bundle the pages read, the admin panel's
-- Translations and Languages pages, the command line). The tables stay as
-- they are, and so does every string in them. What moves is the words of
-- the family's kit - the top bar's menus, the language chooser, the theme
-- switch, "Loading…": the kit reads them from the library's own keys now,
-- anotoki.<the kit's word>, where it read this app's (the frontend's
-- core/i18n/kit-words.ts, gone). So each string of this app's that the kit
-- said goes under the library's key - every language, as it is now (the
-- owner's wording too, and a language left without a string stays so),
-- with who saved it and when:
--
--   common.loading      -> anotoki.ui.loading         (stays this app's too: the start's "Loading…")
--   signIn.button       -> anotoki.topbar.signIn      (stays this app's too: the sign-in card, the notes)
--   topbar.phoneMenu    -> anotoki.topbar.phoneMenu
--   topbar.menuButton   -> anotoki.topbar.menuButton
--   topbar.menu         -> anotoki.topbar.menu
--   topbar.roleAdmin    -> anotoki.topbar.roleAdmin
--   topbar.roleEditor   -> anotoki.topbar.roleEditor
--   topbar.account      -> anotoki.topbar.account
--   topbar.admin        -> anotoki.topbar.admin
--   account.signOut     -> anotoki.topbar.signOut
--   language.button     -> anotoki.language.button
--   language.notLoaded  -> anotoki.language.notLoaded
--   language.notSaved   -> anotoki.language.notSaved
--   theme.light         -> anotoki.theme.light        ("Theme: light": the switch's choices keep this app's names)
--   theme.dark          -> anotoki.theme.dark
--   theme.auto          -> anotoki.theme.auto
--   theme.notSaved      -> anotoki.theme.notSaved
--
-- The library's set runs after this file: its 001 finds the tables in the
-- shape it relies on, and its 002 adds the library's other keys - and
-- writes strings only for a library key that has none, so the strings
-- copied here stay as they are. The keys only the kit asked for go, their
-- strings with them; the two this app's own pages still ask for stay, and
-- what the translator reads about signIn.button no longer tells of the
-- bar. Words only: nothing else of the schema, and nothing of anybody's
-- progress, changes. Then the gate: every string is under the library's
-- key with its words, its writer and its time, and the two that stay keep
-- theirs.
--
-- The copy is made in tables of this file's own (TEMPORARY, gone when the
-- file's transaction ends), which the gate compares against. One string on
-- a line, an apostrophe written twice and nothing else escaped: that is
-- all the statement splitter knows of a string.
-----------------------------------------------------------

-- Which of this app's keys the kit said, under which library key - and whether the key goes (the kit alone asked for it).
CREATE TEMPORARY TABLE kit_keys ON COMMIT DROP AS
SELECT * FROM (VALUES
    ('common.loading', 'anotoki.ui.loading', FALSE),
    ('signIn.button', 'anotoki.topbar.signIn', FALSE),
    ('topbar.phoneMenu', 'anotoki.topbar.phoneMenu', TRUE),
    ('topbar.menuButton', 'anotoki.topbar.menuButton', TRUE),
    ('topbar.menu', 'anotoki.topbar.menu', TRUE),
    ('topbar.roleAdmin', 'anotoki.topbar.roleAdmin', TRUE),
    ('topbar.roleEditor', 'anotoki.topbar.roleEditor', TRUE),
    ('topbar.account', 'anotoki.topbar.account', TRUE),
    ('topbar.admin', 'anotoki.topbar.admin', TRUE),
    ('account.signOut', 'anotoki.topbar.signOut', TRUE),
    ('language.button', 'anotoki.language.button', TRUE),
    ('language.notLoaded', 'anotoki.language.notLoaded', TRUE),
    ('language.notSaved', 'anotoki.language.notSaved', TRUE),
    ('theme.light', 'anotoki.theme.light', TRUE),
    ('theme.dark', 'anotoki.theme.dark', TRUE),
    ('theme.auto', 'anotoki.theme.auto', TRUE),
    ('theme.notSaved', 'anotoki.theme.notSaved', TRUE)
) AS k(own_key, library_key, moves);

-- Every string of those keys as this database has it now, and whether the library's key had a string in that
-- language already (only when this file runs again: the library's own file runs after this one).
CREATE TEMPORARY TABLE kit_words ON COMMIT DROP AS
SELECT k.own_key, k.library_key, k.moves, t.language_code, t.value, t.updated_at, t.updated_by,
       EXISTS (SELECT 1 FROM translations l WHERE l.key_name = k.library_key AND l.language_code = t.language_code) AS there_before
  FROM kit_keys k
  JOIN translations t ON t.key_name = k.own_key;

-- The library's keys, ahead of the library's own file: its 002 writes their descriptions, as it does for every key of
-- the library's, and leaves their strings as they are.
INSERT INTO translation_keys (name, description)
SELECT library_key, 'The anotoki library''s words: the library''s own migration (anotoki_translations, its 002) describes this key.'
  FROM kit_keys
ON CONFLICT (name) DO NOTHING;

-- Every string under the library's key: every language, as it is, with who saved it and when.
INSERT INTO translations (key_name, language_code, value, updated_at, updated_by)
SELECT library_key, language_code, value, updated_at, updated_by
  FROM kit_words
ON CONFLICT (key_name, language_code) DO NOTHING;

-- The keys only the kit asked for go, and their strings with them (ON DELETE CASCADE): nothing asks for them any
-- more, and the key scan fails on a key nobody asks for.
DELETE FROM translation_keys WHERE name IN (SELECT own_key FROM kit_keys WHERE moves);

-- signIn.button stays this app's: its pages' own Sign in. The top bar's is the library's word now.
UPDATE translation_keys SET description = 'The button that starts signing in: on the sign-in card, in the signed-out banner under the top bar, beside the notes for somebody practising without signing in (visitor.notice, visitor.signInNow, visitor.full, visitor.busy), and on Stats in place of the progress file (ownProgress.visitor). The top bar''s own Sign in is the anotoki library''s word, anotoki.topbar.signIn. A verb. No placeholders. Also in kept-english.ts.'
 WHERE name = 'signIn.button';

-----------------------------------------------------------
-- PROVE IT: NOTHING WAS LOST
--
-- Every string is under the library's key as it was - its words, who saved
-- it and when - but where a run of this file again found the library's
-- string there already (then the string of this app's key it came from is
-- still there too: only those two keys stay). The two that stay keep every
-- string they had; the keys only the kit asked for are gone, with their
-- strings; every library key named here has its English; and signIn.button
-- is told of the library's word.
-----------------------------------------------------------

DO $$
DECLARE
    lost TEXT;
BEGIN
    SELECT string_agg(w.library_key || ' (' || w.language_code || ')', ', ' ORDER BY w.library_key, w.language_code) INTO lost
      FROM kit_words w
     WHERE (w.moves OR NOT w.there_before)
       AND NOT EXISTS (SELECT 1 FROM translations t
                        WHERE t.key_name = w.library_key AND t.language_code = w.language_code
                          AND t.value = w.value AND t.updated_at = w.updated_at
                          AND t.updated_by IS NOT DISTINCT FROM w.updated_by);
    IF lost IS NOT NULL THEN
        RAISE EXCEPTION 'strings that did not move under the library''s keys as they were: %', lost;
    END IF;

    SELECT string_agg(w.own_key || ' (' || w.language_code || ')', ', ' ORDER BY w.own_key, w.language_code) INTO lost
      FROM kit_words w
     WHERE NOT w.moves
       AND NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = w.own_key AND t.language_code = w.language_code AND t.value = w.value);
    IF lost IS NOT NULL THEN
        RAISE EXCEPTION 'strings of this app''s own keys that did not stay as they were: %', lost;
    END IF;

    IF EXISTS (SELECT 1 FROM translation_keys WHERE name IN (SELECT own_key FROM kit_keys WHERE moves))
       OR EXISTS (SELECT 1 FROM translations WHERE key_name IN (SELECT own_key FROM kit_keys WHERE moves)) THEN
        RAISE EXCEPTION 'a key or a string only the kit asked for is still there';
    END IF;

    SELECT string_agg(k.library_key, ', ' ORDER BY k.library_key) INTO lost
      FROM kit_keys k
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.library_key)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.library_key AND t.language_code = 'en');
    IF lost IS NOT NULL THEN
        RAISE EXCEPTION 'library keys without their key or their English string: %', lost;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM translation_keys WHERE name = 'signIn.button' AND description LIKE '%anotoki.topbar.signIn%') THEN
        RAISE EXCEPTION 'the description of signIn.button does not tell of the top bar''s own Sign in';
    END IF;
END $$;
