-----------------------------------------------------------
-- THE PEOPLE: WHEN THE IAM DELETED AN ACCOUNT
--
-- Finished (2026-10-11). The owner applies it with 005 to 009 and 011 at
-- the hand-over (after a pg_dump of the database): on this computer by
-- Save on /setup.php (or php migration.php, or an ADMIN's "Apply pending"
-- on the admin panel's Migrations page); on the host, upload the build and
-- apply it at once on the Migrations page. The anotoki library's own files
-- run in the same Apply: its admin tools' set first (anotoki_admin: the
-- audit log's and feedback's tables), then this app's files, then its sets
-- of the words (anotoki_translations) and of the people (anotoki_people),
-- which needs this column. Until then the site tells everybody it is being
-- updated, and an ADMIN that a database update is waiting. Once applied it
-- never changes: the next change is 011.
--
-- From anotoki-lib 0.4.1 every anotoki site keeps its people the same way
-- (the library's people module, the owner's decisions of 2026-10-07): its
-- own users table, keyed by the IAM's user id, and - when the IAM deletes
-- an account, thirty days after its owner asked - the copy of who they
-- were blanked here too: the name becomes the IAM's placeholder
-- (deleted-<id>) and this column says when the IAM deleted the account.
-- Their progress stays, nobody's now; the row stays (every table of a
-- person's data points at it). The library does that - the scrub, after an
-- answer, at most once an hour - and never makes or changes a table of
-- this app's: this column is the one thing it needs of users, and this
-- app's own migration adds it, before the library's set anotoki_people
-- runs. Nothing else of the schema changes, and no row: the column starts
-- empty for everybody. A visitor (a negative id) is never anonymized - the
-- IAM knows no visitor.
--
-- Then the gate, which holds when it runs again: the column there, a
-- timestamptz that may be empty, and no visitor's row with a time in it.
-----------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

DO $$
DECLARE
    found_type TEXT;
    found_nullable TEXT;
BEGIN
    SELECT data_type, is_nullable INTO found_type, found_nullable
      FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'anonymized_at';
    IF found_type IS NULL THEN
        RAISE EXCEPTION 'users.anonymized_at is not there';
    END IF;
    IF found_type <> 'timestamp with time zone' OR found_nullable <> 'YES' THEN
        RAISE EXCEPTION 'users.anonymized_at is % (nullable: %), where it must be a timestamptz that may be empty', found_type, found_nullable;
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE id < 0 AND anonymized_at IS NOT NULL) THEN
        RAISE EXCEPTION 'a visitor''s row says the IAM deleted it: the IAM knows no visitor';
    END IF;
END $$;
