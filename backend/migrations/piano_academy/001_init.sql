-- Piano Academy - the database (PostgreSQL 13 or newer; the tests drop their
-- databases WITH (FORCE)).
--
-- Everything here belongs to one person, keyed by their IAM user id: the `sub`
-- of a verified access token, or, in auth mode "none" (the owner's own
-- computer, no login), the configured local_user_id. No request can name a
-- user; the id always comes from the token or the configuration.
--
-- The progress documents are stored as the browser sends them: the browser
-- works out every SRS and learning-path change itself (public/shared/) and
-- saves the whole document, as it did with the old JSON files.
--   users           who has been here: the IAM id, a copy of the username
--   progress        per-note SRS state, keyed by MIDI number (the old progress.json)
--   path_progress   learning-path step results (the old path.json)
--   sessions        the practice log, one row per finished round (the old sessions.json)
--   imports         what setup.php has imported, so it happens once

CREATE TABLE users (
    id                 bigint      PRIMARY KEY CHECK (id > 0), -- the IAM user id
    preferred_username text,                                   -- from the latest token; null in auth mode "none"
    created_at         timestamptz NOT NULL DEFAULT now(),
    last_seen_at       timestamptz NOT NULL DEFAULT now()
);

-- The foreign keys follow a change of users.id (ON UPDATE CASCADE): that is how
-- a person's data is moved to another IAM id (setup.php --owner=ID). They do
-- not follow a delete: a user who has data cannot be deleted by accident.

CREATE TABLE progress (
    user_id    bigint      PRIMARY KEY REFERENCES users (id) ON UPDATE CASCADE,
    notes      jsonb       NOT NULL CHECK (jsonb_typeof(notes) = 'object'), -- { "60": { midi, status, ... }, ... }
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE path_progress (
    user_id    bigint      PRIMARY KEY REFERENCES users (id) ON UPDATE CASCADE,
    data       jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'steps') = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- A finished round: the browser's fields (whitelisted and bounded by
-- src/store.php) in `data`; the server's id and time beside them.
CREATE TABLE sessions (
    seq         bigserial   PRIMARY KEY,  -- the order they were recorded in
    user_id     bigint      NOT NULL REFERENCES users (id) ON UPDATE CASCADE,
    id          text        NOT NULL,     -- <ms since 1970>-<6 random chars>, as the browser knows it
    request_key text,                     -- the browser's Idempotency-Key: a retried POST is stored once
    recorded_at timestamptz NOT NULL DEFAULT now(),
    data        jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
    UNIQUE (user_id, id),
    UNIQUE (user_id, request_key)
);
CREATE INDEX sessions_by_user ON sessions (user_id, seq);

CREATE TABLE imports (
    source      text        PRIMARY KEY,  -- 'server-data': the JSON files in server/data/
    user_id     bigint      NOT NULL REFERENCES users (id) ON UPDATE CASCADE,
    imported_at timestamptz NOT NULL DEFAULT now(),
    summary     jsonb       NOT NULL
);
