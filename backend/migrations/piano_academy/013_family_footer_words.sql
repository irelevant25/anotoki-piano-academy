-----------------------------------------------------------
-- THE OLD FOOTER'S OWN WORD, GONE WITH THE FOOTER
--
-- Finished (2026-10-18). The owner applies it with 005 to 012 at the
-- hand-over (after a pg_dump of the database): on this computer by Save on
-- /setup.php (or php migration.php, or an ADMIN's "Apply pending" on the
-- admin panel's Migrations page); on the host, upload the build and apply
-- it at once on the Migrations page. The anotoki library's sets of the
-- words (anotoki_translations: its 012 is the family's footer's four words)
-- and of the people run right after it, in the same Apply. Until then the
-- site tells everybody it is being updated, and an ADMIN that a database
-- update is waiting. Once applied it never changes: the next change is 014.
--
-- From anotoki-lib 0.6.3 every anotoki site has the family's footer
-- (<anotoki-site-footer>, the build analyzer's - the owner's choice of
-- 2026-10-18): "Version X · What's new · Feedback", then Terms · Privacy ·
-- Contact, its words the library's own (anotoki.footer.*, written by the
-- library's 012). Piano Academy's own footer is gone, and with it the one
-- word only it said - the tooltip of its version button ("Piano Academy
-- v0.4.0"), which opened the list of changes:
--
--   footer.whatsNew
--
-- Its strings go with it (ON DELETE CASCADE); nothing asks for it any more,
-- and the key scan fails on a key nobody asks for. The list of changes
-- stays Piano Academy's own dialog, opened from the footer's "What's new"
-- now, so its words (whatsNew.*) stay - and the description of its heading
-- (what the Translations page tells the translator; the code's, never the
-- browser's) is written over to say where it opens from. Words only:
-- nothing else of the schema, and nothing of anybody's progress, changes.
-- Then the gate, which holds when it runs again.
-----------------------------------------------------------

DELETE FROM translation_keys WHERE name IN ('footer.whatsNew');

UPDATE translation_keys SET description = 'The heading of the dialog that lists the changes release by release, opened from "What''s new" in the footer at the foot of every page (the anotoki family''s footer: the version, What''s new, Feedback). The entries under it are not translated. No placeholders. Also in kept-english.ts.'
 WHERE name = 'whatsNew.title';

-----------------------------------------------------------
-- PROVE IT: THE OLD FOOTER'S WORD IS GONE, AND WHAT'S NEW'S HEADING IS TOLD OF THE FAMILY'S FOOTER
-----------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM translation_keys WHERE name LIKE 'footer.%')
       OR EXISTS (SELECT 1 FROM translations WHERE key_name LIKE 'footer.%') THEN
        RAISE EXCEPTION 'a key or a string of Piano Academy''s own footer is still there';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM translation_keys WHERE name = 'whatsNew.title' AND description LIKE '%"What''s new" in the footer%') THEN
        RAISE EXCEPTION 'the description of What''s new''s heading does not tell of the family''s footer';
    END IF;
END $$;
