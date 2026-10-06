-----------------------------------------------------------
-- THE ACCOUNT'S THEME AND LANGUAGE: WHEN THE ACCOUNT WOULD NOT TAKE ONE
--
-- Finished (2026-10-06). The owner applies it at the hand-over, with 005
-- (after a pg_dump of the database): on this computer by Save on
-- /setup.php (or php migration.php, or an ADMIN's "Apply pending" on the
-- admin panel's Migrations page); on the host, upload the build and apply
-- it at once (the Migrations page, linked from the "not set up yet" card;
-- or /setup.php again). Until then the app answers "not set up yet" (the
-- database is behind the code). Once applied it never changes: the next
-- change is 007.
--
-- The anotoki IAM keeps the account's theme, date order and clock beside
-- its language (the IAM's migration 015, the owner's decision of
-- 2026-10-06), and a site's own controls save a signed-in person's choice
-- to the account (the IAM's browser SDK 1.2.0, savePreferences()). Two
-- sentences say when the account would not take a choice made here:
--
--   theme.notSaved     under the theme button; the account's theme is on
--                      the screen again. Also in the frontend's
--                      core/i18n/kept-english.ts, letter for letter.
--   language.notSaved  under the language button; the page stays in the
--                      language chosen, for this visit.
--
-- Neither promises that trying again helps: the account may no longer be
-- let into Piano Academy (the SDK's access_denied), and then it would not.
--
-- In 003's form: a key, its English and its Slovak string (informal, ty -
-- and nothing gendered about the learner), every insert stepping aside for
-- a row that is already there; then the strings' gate. Nothing else of the
-- schema, and nothing of anybody's progress, changes.
--
-- One string on a line, an apostrophe written twice and nothing else
-- escaped: that is all the statement splitter knows of a string.
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- theme: the theme button in the top bar, for somebody signed in
    ('theme.notSaved', 'A small note under the top bar''s round theme button, for somebody signed in, when the theme chosen there could not be saved to their anotoki account (which every anotoki site follows) - the IAM out of reach, the sign-in ended, or the account no longer let into Piano Academy: the button shows the account''s theme again. It must not promise that trying again helps. The note goes at the next press, or a click anywhere else. No placeholders. Also in kept-english.ts.'),
    -- language: the language button in the top bar, for somebody signed in
    ('language.notSaved', 'A small note under the top bar''s round language button, for somebody signed in, when the language chosen there could not be saved to their anotoki account (the IAM out of reach, the sign-in ended, or the account no longer let into Piano Academy): the page stays in the chosen language until it is loaded again, and the next visit reads the account''s language. A language the anotoki account does not offer is not said. The note goes at the next press, or a click anywhere else. No placeholders.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    ('theme.notSaved', 'The theme could not be saved to your anotoki account.'),
    ('language.notSaved', 'The language could not be saved to your anotoki account - it holds for this visit only.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    ('theme.notSaved', 'Vzhľad sa nepodarilo uložiť do tvojho účtu anotoki.'),
    ('language.notSaved', 'Jazyk sa nepodarilo uložiť do tvojho účtu anotoki – platí len počas tejto návštevy.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-----------------------------------------------------------
-- PROVE IT: THE STRINGS
--
-- Every key this file writes is here and reads in both languages: a page
-- never shows a key, and Slovak never falls back to English by accident.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('theme.notSaved'), ('language.notSaved')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
END $$;
