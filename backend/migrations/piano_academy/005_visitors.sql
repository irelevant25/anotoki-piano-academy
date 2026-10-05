-----------------------------------------------------------
-- VISITORS: PRACTISING WITHOUT SIGNING IN
--
-- Finished (2026-10-05). The owner applies it at the hand-over, after a
-- pg_dump of the database: on this computer by Save on /setup.php (or
-- php migration.php, or an ADMIN's "Apply pending" on the admin panel's
-- Migrations page); on the host in this order - upload the build, apply
-- this at once (the Migrations page, linked from the "not set up yet"
-- card; or /setup.php again), then the IAM's migrations. Until then the
-- app answers "not set up yet" (the database is behind the code). Once
-- applied it never changes: the next change is 006.
--
-- In this order: the visitors (the schema); the words a visitor and a
-- person who signs in after visiting read, in 003's form; the schema's
-- gate; the strings' gate. Every statement steps aside for what is there,
-- and both gates hold on a database that already has visitors: running it
-- again changes nothing.
--
-- WHO A VISITOR IS
--
-- The IAM says, per application, whether signing in is required ("Sign-in
-- required"). When it is not, somebody who has not signed in practises as
-- a visitor: a users row of this app's own, made on their first save (an
-- answer, a path step, a round) - never on a page view. Its id is
-- negative, from the sequence visitor_ids, so it can never be an IAM user
-- id (always 1 or more). It holds no name, only the SHA-256 of a long
-- random key the server made and handed to that browser once; the browser
-- sends the key back with every request, and it opens that visitor's own
-- progress and nothing else. A visitor unseen for 30 days is deleted with
-- everything of theirs (a sweep after somebody's answer); signing in moves
-- a visitor's progress into the person's account.
--
-- visitor_starts counts the visitors made in the last hour by address (an
-- IPv6 address by its /64), for the limits on new visitors - each row is
-- kept for one hour only.
--
-- Additive: one sequence, one column (null for everybody there now), the
-- users table's check on its id rewritten so that a negative id is a
-- visitor's and nothing else's (every row there passes it), two indexes
-- and one table. No row of anybody's progress changes.
-----------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS visitor_ids AS BIGINT INCREMENT BY -1 MAXVALUE -1 START WITH -1;

ALTER TABLE users ADD COLUMN IF NOT EXISTS visitor_key_hash CHAR(64);

-- 001's CHECK (id > 0) (named so by PostgreSQL) makes way for one that
-- tells a visitor from a person: a negative id has a key's hash, a positive
-- one never does, and 0 is nobody's. The gate below fails loudly if 001's
-- check is still there under another name.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_check;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kind_check;

ALTER TABLE users ADD CONSTRAINT users_kind_check CHECK (
    id <> 0
    AND (id < 0) = (visitor_key_hash IS NOT NULL)
    AND (visitor_key_hash IS NULL OR visitor_key_hash ~ '^[0-9a-f]{64}$')
);

-- A key is found by its hash; two visitors never share one (NULLs, the
-- people's, never clash).
CREATE UNIQUE INDEX IF NOT EXISTS users_visitor_key_hash ON users (visitor_key_hash);

-- The sweep takes the visitors unseen the longest first.
CREATE INDEX IF NOT EXISTS users_visitors_by_last_seen ON users (last_seen_at) WHERE id < 0;

CREATE TABLE IF NOT EXISTS visitor_starts (
    id         BIGSERIAL   PRIMARY KEY,
    address    TEXT        NOT NULL,              -- the counted address: IPv4, or an IPv6 /64
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitor_starts_by_address ON visitor_starts (address, started_at);

CREATE INDEX IF NOT EXISTS visitor_starts_by_time ON visitor_starts (started_at);

-----------------------------------------------------------
-- WHAT THE APP SAYS TO A VISITOR
--
-- The words of practising without signing in, in 003's form: a key, its
-- English and its Slovak string (informal, ty - and nothing gendered about
-- the learner), every insert stepping aside for a row that is already
-- there.
--
--   visitor.*            the shell: the notice on Learn and Stats, the
--                        notes after signing in, a visitor's progress
--                        that ended, sign-in now required, saves refused
--   ownProgress.visitor  Stats, in place of the progress file's card
--
-- The shell's (visitor.*) are also in the frontend's
-- core/i18n/kept-english.ts, letter for letter.
--
-- One string on a line, an apostrophe written twice and nothing else
-- escaped: that is all the statement splitter knows of a string.
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- visitor: practising without signing in (when the IAM says Piano Academy does not require it)
    ('visitor.notice', 'A note under the top bar on Learn and Stats for somebody practising without signing in (Piano Academy does not require it); the Sign in button (signIn.button) stands beside it. Says how long their progress is kept and that signing in keeps it. {days}: a whole number of days (30). Nothing gendered about the learner. Also in kept-english.ts.'),
    ('visitor.moved', 'A note under the top bar right after signing in, when the progress made in this browser without signing in has been moved into the account. No placeholders. Also in kept-english.ts.'),
    ('visitor.kept', 'Said after visitor.moved, when the account already had progress of its own for some of the same notes or path steps: the account''s progress was kept there (nothing of it was written over). No placeholders. Also in kept-english.ts.'),
    ('visitor.notMoved', 'A note under the top bar right after signing in, when the progress made in this browser without signing in could not be moved into the account this time (the server was busy or out of reach); nothing is lost, and the app tries again on the next visit. No placeholders. Also in kept-english.ts.'),
    ('visitor.lost', 'A note under the top bar when the progress this browser kept without signing in is gone from the server: it was not used for {days} days and was deleted, or somebody signed in and it was moved into their account. {days}: a whole number of days (30). Also in kept-english.ts.'),
    ('visitor.signInNow', 'A note under the top bar for somebody practising without signing in, when Piano Academy has just started to require signing in; the Sign in button stands beside it. Signing in moves this browser''s progress into the account. No placeholders. Also in kept-english.ts.'),
    ('visitor.full', 'A note under the top bar when a save without signing in was refused because this browser already keeps as much as a visitor may (rounds, or the size of the progress). Signing in lifts the limit. No placeholders. Also in kept-english.ts.'),
    ('visitor.busy', 'A note under the top bar when a first save without signing in was refused because too many people started practising without signing in in the last hour; signing in, or trying later, helps. No placeholders. Also in kept-english.ts.'),
    ('visitor.close', 'The button that closes the notes visitor.moved, visitor.notMoved and visitor.lost. No placeholders. Also in kept-english.ts.'),
    -- ownProgress: Stats, for somebody practising without signing in
    ('ownProgress.visitor', 'Stats, for somebody practising without signing in: stands where the card "Your progress file" (ownProgress.title) is for people who signed in - a file of one''s progress is for an account only. The Sign in button stands beside it. No placeholders.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    ('visitor.notice', 'You are practising without signing in. Your progress is kept for this browser for {days} days after your last visit. Sign in to keep it in your account.'),
    ('visitor.moved', 'Your progress from practising without signing in is now in your account.'),
    ('visitor.kept', 'Where your account already had progress, it was kept.'),
    ('visitor.notMoved', 'Your progress from practising without signing in could not be moved into your account yet. Nothing is lost: it is tried again on your next visit.'),
    ('visitor.lost', 'The progress this browser kept without signing in has ended: it was not used for {days} days, or it was moved into an account at a sign-in.'),
    ('visitor.signInNow', 'Piano Academy now asks everybody to sign in. Sign in to go on - your progress from this browser comes with you.'),
    ('visitor.full', 'Without signing in, this browser cannot keep any more. Sign in to keep practising with your progress saved.'),
    ('visitor.busy', 'Too many people are practising without signing in just now, so this is not saved yet. Sign in, or try again later.'),
    ('visitor.close', 'Close'),
    ('ownProgress.visitor', 'Sign in to save your progress to a file, or to bring it back from one.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    ('visitor.notice', 'Cvičíš bez prihlásenia. Tvoj postup sa pre tento prehliadač uchová {days} dní od tvojej poslednej návštevy. Prihlás sa a zostane v tvojom účte.'),
    ('visitor.moved', 'Tvoj postup z cvičenia bez prihlásenia je teraz v tvojom účte.'),
    ('visitor.kept', 'Kde už mal tvoj účet postup, ten zostal.'),
    ('visitor.notMoved', 'Tvoj postup z cvičenia bez prihlásenia sa zatiaľ nepodarilo presunúť do tvojho účtu. Nič sa nestratilo: skúsi sa to znova pri tvojej ďalšej návšteve.'),
    ('visitor.lost', 'Postup, ktorý tento prehliadač uchovával bez prihlásenia, skončil: {days} dní sa nepoužíval, alebo sa pri prihlásení presunul do účtu.'),
    ('visitor.signInNow', 'Piano Academy teraz vyžaduje prihlásenie od všetkých. Prihlás sa a pokračuj – tvoj postup z tohto prehliadača pôjde s tebou.'),
    ('visitor.full', 'Bez prihlásenia už tento prehliadač nemôže uložiť viac. Prihlás sa a tvoj postup sa bude ďalej ukladať.'),
    ('visitor.busy', 'Práve teraz cvičí bez prihlásenia priveľa ľudí, preto sa to ešte neuložilo. Prihlás sa, alebo to skús neskôr.'),
    ('visitor.close', 'Zavrieť'),
    ('ownProgress.visitor', 'Prihlás sa a môžeš si postup uložiť do súboru alebo ho zo súboru obnoviť.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- The Sign in button now also stands beside the visitor's notes. What the
-- translator reads about a key is the code's (the browser never edits it),
-- so it is written over by name.
UPDATE translation_keys SET description = 'The button that starts signing in: on the sign-in card, in the top bar (and its menu on a phone) when the sign-in ended or for somebody practising without signing in, in the signed-out banner, and beside the notes for somebody practising without signing in (visitor.notice, visitor.signInNow, ownProgress.visitor). A verb. No placeholders. Also in kept-english.ts.'
 WHERE name = 'signIn.button';

-----------------------------------------------------------
-- PROVE IT
--
-- What the schema part adds, in the shape the code reads it - and nothing
-- here asks for an empty table, so it holds just the same when 005 runs
-- again over a database that already has visitors: the sequence counting
-- down from -1, the column, the check that tells a visitor from a person
-- (validated: every row passes it) with 001's CHECK (id > 0) gone, the
-- indexes, and the table of new visitors' addresses.
-----------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences
                    WHERE schemaname = current_schema() AND sequencename = 'visitor_ids'
                      AND increment_by = -1 AND max_value = -1) THEN
        RAISE EXCEPTION 'the sequence visitor_ids does not count down from -1';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'visitor_key_hash'
                      AND data_type = 'character' AND character_maximum_length = 64 AND is_nullable = 'YES') THEN
        RAISE EXCEPTION 'users.visitor_key_hash is not a char(64) that may be null';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'users'::regclass AND conname = 'users_kind_check' AND contype = 'c' AND convalidated) THEN
        RAISE EXCEPTION 'users has no validated users_kind_check';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) = 'CHECK ((id > 0))') THEN
        RAISE EXCEPTION 'the check CHECK (id > 0) of 001 is still on users: a visitor''s negative id would be refused';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                    WHERE i.indrelid = 'users'::regclass AND c.relname = 'users_visitor_key_hash' AND i.indisunique) THEN
        RAISE EXCEPTION 'users has no unique index users_visitor_key_hash';
    END IF;
    IF to_regclass('users_visitors_by_last_seen') IS NULL THEN
        RAISE EXCEPTION 'users has no index users_visitors_by_last_seen';
    END IF;
    IF (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'visitor_starts'
           AND column_name IN ('id', 'address', 'started_at')) <> 3 THEN
        RAISE EXCEPTION 'the table visitor_starts (id, address, started_at) is not there';
    END IF;
    IF to_regclass('visitor_starts_by_address') IS NULL OR to_regclass('visitor_starts_by_time') IS NULL THEN
        RAISE EXCEPTION 'visitor_starts is missing an index';
    END IF;
END $$;

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
          ('visitor.notice'), ('visitor.moved'), ('visitor.kept'), ('visitor.notMoved'), ('visitor.lost'),
          ('visitor.signInNow'), ('visitor.full'), ('visitor.busy'), ('visitor.close'), ('ownProgress.visitor')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
END $$;
