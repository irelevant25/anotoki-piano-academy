-----------------------------------------------------------
-- THE "NOT SET UP YET" CARD'S WORDS, GONE WITH THE CARD
--
-- Finished (2026-10-07). The owner applies it with 005 and 006 at the
-- hand-over (after a pg_dump of the database): on this computer by Save on
-- /setup.php (or php migration.php, or an ADMIN's "Apply pending" on the
-- admin panel's Migrations page); on the host, upload the build and apply
-- it at once on the Migrations page. Until then the site tells everybody it
-- is being updated, and an ADMIN that a database update is waiting. Once
-- applied it never changes: the next change is 008.
--
-- Every anotoki site behaves one way while it is not ready (the owner's
-- request of 2026-10-07, the family's library anotoki/lib): visitors and
-- learners read that the site is being updated, in their language, and
-- the page comes back by itself; its ADMIN reads that a database update is
-- waiting and opens the Migrations page; the setup page is offered only
-- while the site was never installed. That page is the family's, with its
-- own words in English and Slovak - so the card this app drew in its place
-- ("Piano Academy is not set up yet", "Open the setup page") is gone, and
-- its four keys with it:
--
--   boot.notSetUp.title, boot.notSetUp.text, boot.notSetUp.open,
--   boot.notSetUp.after
--
-- Their strings go with them (ON DELETE CASCADE); nothing asks for them any
-- more, and the key scan fails on a key nobody asks for. Words only: nothing
-- else of the schema, and nothing of anybody's progress, changes. Then the
-- gate, which holds when it runs again.
-----------------------------------------------------------

DELETE FROM translation_keys WHERE name IN ('boot.notSetUp.title', 'boot.notSetUp.text', 'boot.notSetUp.open', 'boot.notSetUp.after');

-----------------------------------------------------------
-- PROVE IT: THE CARD'S WORDS ARE GONE
-----------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM translation_keys WHERE name LIKE 'boot.notSetUp.%')
       OR EXISTS (SELECT 1 FROM translations WHERE key_name LIKE 'boot.notSetUp.%') THEN
        RAISE EXCEPTION 'a key or a string of the "not set up yet" card is still there';
    END IF;
END $$;
