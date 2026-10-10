-----------------------------------------------------------
-- THE ROUND THEME BUTTON'S WORDS, GONE WITH THE BUTTON
--
-- Finished (2026-10-08). The owner applies it with 005, 006 and 007 at the
-- hand-over (after a pg_dump of the database): on this computer by Save on
-- /setup.php (or php migration.php, or an ADMIN's "Apply pending" on the
-- admin panel's Migrations page); on the host, upload the build and apply
-- it at once on the Migrations page. Until then the site tells everybody it
-- is being updated, and an ADMIN that a database update is waiting. Once
-- applied it never changes: the next change is 009.
--
-- The top bar is the anotoki family's now (one kit for every anotoki site,
-- the owner's request of 2026-10-07: anotoki-lib 0.2.0), and its theme
-- control is the family's switch - light, dark, as the device is set: three
-- choices side by side - in place of Piano Academy's round button that went
-- round the three (the owner's decision of 2026-10-08). What the round
-- button said to a screen reader - its theme, and that pressing it changes
-- the theme - is said of nothing any more, so those three keys go:
--
--   theme.autoSpoken, theme.lightSpoken, theme.darkSpoken
--
-- Their strings go with them (ON DELETE CASCADE); nothing asks for them any
-- more, and the key scan fails on a key nobody asks for. The button's other
-- words stay where they still belong: theme.light, theme.dark and theme.auto
-- name the switch's three choices ("Theme: light" - a choice's tooltip, and
-- what a screen reader says of it), and theme.notSaved is the note under the
-- switch. Their descriptions - what the Translations page tells the
-- translator; the code's, never the browser's - are written over to say so.
-- Words only: nothing else of the schema, and nothing of anybody's progress,
-- changes. Then the gate, which holds when it runs again.
-----------------------------------------------------------

DELETE FROM translation_keys WHERE name IN ('theme.autoSpoken', 'theme.lightSpoken', 'theme.darkSpoken');

UPDATE translation_keys k SET description = v.description FROM (VALUES
    ('theme.light', 'The top bar''s theme switch (three icons side by side: light, dark, as the device is set): what its first choice, the light theme, is called - its tooltip, and what a screen reader says of it. No placeholders. Also in kept-english.ts.'),
    ('theme.dark', 'The top bar''s theme switch (three icons side by side: light, dark, as the device is set): what its second choice, the dark theme, is called - its tooltip, and what a screen reader says of it. No placeholders. Also in kept-english.ts.'),
    ('theme.auto', 'The top bar''s theme switch (three icons side by side: light, dark, as the device is set): what a screen reader says of its third choice, the theme that follows the device''s own setting. Its tooltip is the anotoki family''s own words ("As your device is set"). No placeholders. Also in kept-english.ts.'),
    ('theme.notSaved', 'A small note under the top bar''s theme switch, for somebody signed in, when the theme chosen there could not be saved to their anotoki account (which every anotoki site follows) - the IAM out of reach, the sign-in ended, or the account no longer let into Piano Academy: the switch shows the account''s theme again. It must not promise that trying again helps. The note goes at the next choice, a click anywhere else, or Escape. No placeholders. Also in kept-english.ts.')
) AS v(name, description)
 WHERE k.name = v.name;

-----------------------------------------------------------
-- PROVE IT: THE BUTTON'S WORDS ARE GONE, AND THE SWITCH'S ARE TOLD OF
-----------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM translation_keys WHERE name IN ('theme.autoSpoken', 'theme.lightSpoken', 'theme.darkSpoken'))
       OR EXISTS (SELECT 1 FROM translations WHERE key_name IN ('theme.autoSpoken', 'theme.lightSpoken', 'theme.darkSpoken')) THEN
        RAISE EXCEPTION 'a key or a string of the round theme button is still there';
    END IF;
    IF (SELECT count(*) FROM translation_keys WHERE name IN ('theme.light', 'theme.dark', 'theme.auto', 'theme.notSaved') AND description LIKE '%theme switch%') <> 4 THEN
        RAISE EXCEPTION 'a description of the theme''s words does not tell of the theme switch';
    END IF;
END $$;
