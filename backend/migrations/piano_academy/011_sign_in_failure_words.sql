-----------------------------------------------------------
-- A SIGN-IN THAT DID NOT WORK: THE FAMILY'S SCREEN, IN THIS APP'S WORDS
--
-- Finished (2026-10-11). The owner applies it with 005 to 010 at the
-- hand-over (after a pg_dump of the database): on this computer by Save on
-- /setup.php (or php migration.php, or an ADMIN's "Apply pending" on the
-- admin panel's Migrations page); on the host, upload the build and apply
-- it at once on the Migrations page. The anotoki library's sets of the
-- words (anotoki_translations: its 003 is the sign-in screen's words) and
-- of the people run right after it, in the same Apply. Until then the site
-- tells everybody it is being updated, and an ADMIN that a database update
-- is waiting. Once applied it never changes: the next change is 012.
--
-- From anotoki-lib 0.4.1 signing in is the anotoki family's (the library's
-- auth module): a sign-in that came back without one, or could not start,
-- is said on the family's own screen - "Signing in did not work", why, Try
-- again and Back - in place of this app's sign-in card, and the notes under
-- the top bar that say why a sign-in did not work word it the same way. The
-- screen reads the library's own keys, anotoki.signIn.<word>. So the three
-- sentences this app said for a failure go under the library's keys -
-- every language, as it is now (the owner's wording too), with who saved
-- it and when:
--
--   signIn.notCompleted        -> anotoki.signIn.notCompleted
--   signIn.storageUnavailable  -> anotoki.signIn.storageUnavailable
--   signIn.failed              -> anotoki.signIn.failed        ({code}: the failure's code, in both)
--
-- The card's own heading and sentence go with the card (signIn.title,
-- signIn.text): the screen has a heading of its own. All five keys go,
-- their strings with them (ON DELETE CASCADE): nothing asks for them any
-- more, and the key scan fails on a key nobody asks for. signIn.button
-- stays (the notes' and Stats' Sign in), and what the translator reads
-- about it no longer tells of the card.
--
-- The library's set of the words runs after this file: its 003 writes the
-- descriptions of its keys, and a string only for a key that has none - so
-- the strings copied here stay. Where it ran first (a database that took
-- the library's file before this one), its strings were written by a
-- migration, by nobody: this app's take their place; a string a person
-- saved under the library's key stays theirs. Words only: nothing else of
-- the schema, and nothing of anybody's progress, changes. Then the gate.
--
-- The copy is made in tables of this file's own (TEMPORARY, gone when the
-- file's transaction ends), which the gate compares against. One string on
-- a line, an apostrophe written twice and nothing else escaped: that is
-- all the statement splitter knows of a string.
-----------------------------------------------------------

-- Which of this app's keys said a failure, under which library key.
CREATE TEMPORARY TABLE sign_in_keys ON COMMIT DROP AS
SELECT * FROM (VALUES
    ('signIn.notCompleted', 'anotoki.signIn.notCompleted'),
    ('signIn.storageUnavailable', 'anotoki.signIn.storageUnavailable'),
    ('signIn.failed', 'anotoki.signIn.failed')
) AS k(own_key, library_key);

-- Every string of those keys as this database has it now, and whether a person saved a string under the library's
-- key in that language already (only where the library's own file ran first): that one stays.
CREATE TEMPORARY TABLE sign_in_words ON COMMIT DROP AS
SELECT k.own_key, k.library_key, t.language_code, t.value, t.updated_at, t.updated_by,
       EXISTS (SELECT 1 FROM translations l WHERE l.key_name = k.library_key AND l.language_code = t.language_code AND l.updated_by IS NOT NULL) AS saved_by_somebody
  FROM sign_in_keys k
  JOIN translations t ON t.key_name = k.own_key;

-- The library's keys, ahead of the library's own file: its 003 writes their descriptions, as it does for every key of
-- the library's, and leaves their strings as they are.
INSERT INTO translation_keys (name, description)
SELECT library_key, 'The anotoki library''s words: the library''s own migration (anotoki_translations, its 003) describes this key.'
  FROM sign_in_keys
ON CONFLICT (name) DO NOTHING;

-- Every string under the library's key: every language, as it is, with who saved it and when - over a string of the
-- library's a migration wrote, never over one a person saved.
INSERT INTO translations (key_name, language_code, value, updated_at, updated_by)
SELECT library_key, language_code, value, updated_at, updated_by
  FROM sign_in_words
ON CONFLICT (key_name, language_code) DO UPDATE
   SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
 WHERE translations.updated_by IS NULL;

-- The card's words and the three that moved go, their strings with them (ON DELETE CASCADE).
DELETE FROM translation_keys WHERE name IN ('signIn.notCompleted', 'signIn.storageUnavailable', 'signIn.failed', 'signIn.title', 'signIn.text');

-- signIn.button stays this app's: its pages' own Sign in. The top bar's is the library's word.
UPDATE translation_keys SET description = 'The button that starts signing in: in the signed-out banner under the top bar, beside the notes for somebody practising without signing in (visitor.notice, visitor.signInNow, visitor.full, visitor.busy), and on Stats in place of the progress file (ownProgress.visitor). The top bar''s own Sign in is the anotoki library''s word, anotoki.topbar.signIn; a sign-in that did not work is said on the library''s own screen (anotoki.signIn.*). A verb. No placeholders. Also in kept-english.ts.'
 WHERE name = 'signIn.button';

-----------------------------------------------------------
-- PROVE IT: NOTHING WAS LOST
--
-- Every string is under the library's key as it was - its words, who saved
-- it and when - but where a person had saved one there already, which
-- stays theirs; the five keys are gone, with their strings; every library
-- key named here has its English; and signIn.button no longer tells of the
-- card.
-----------------------------------------------------------

DO $$
DECLARE
    lost TEXT;
BEGIN
    SELECT string_agg(w.library_key || ' (' || w.language_code || ')', ', ' ORDER BY w.library_key, w.language_code) INTO lost
      FROM sign_in_words w
     WHERE NOT w.saved_by_somebody
       AND NOT EXISTS (SELECT 1 FROM translations t
                        WHERE t.key_name = w.library_key AND t.language_code = w.language_code
                          AND t.value = w.value AND t.updated_at = w.updated_at
                          AND t.updated_by IS NOT DISTINCT FROM w.updated_by);
    IF lost IS NOT NULL THEN
        RAISE EXCEPTION 'strings that did not move under the library''s keys as they were: %', lost;
    END IF;

    IF EXISTS (SELECT 1 FROM translation_keys WHERE name IN ('signIn.notCompleted', 'signIn.storageUnavailable', 'signIn.failed', 'signIn.title', 'signIn.text'))
       OR EXISTS (SELECT 1 FROM translations WHERE key_name IN ('signIn.notCompleted', 'signIn.storageUnavailable', 'signIn.failed', 'signIn.title', 'signIn.text')) THEN
        RAISE EXCEPTION 'a key or a string of the sign-in card is still there';
    END IF;

    SELECT string_agg(k.library_key, ', ' ORDER BY k.library_key) INTO lost
      FROM sign_in_keys k
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.library_key)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.library_key AND t.language_code = 'en');
    IF lost IS NOT NULL THEN
        RAISE EXCEPTION 'library keys without their key or their English string: %', lost;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM translation_keys WHERE name = 'signIn.button' AND description LIKE '%anotoki.topbar.signIn%' AND description NOT LIKE '%sign-in card%') THEN
        RAISE EXCEPTION 'the description of signIn.button still tells of the sign-in card';
    END IF;
END $$;
