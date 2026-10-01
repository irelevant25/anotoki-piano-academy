# anotoki · Piano Academy

Browser piano tutor for a KAWAI ES120 (any USB-MIDI keyboard): Web MIDI in the
browser, a Duolingo-style **learning path** (phases -> units -> steps: meet,
drill, read, play in time, song; 80% to pass), with Note Trainer, Sheet
Practice, Songs and Stats as free practice. Every person's progress is kept in
PostgreSQL under their anotoki IAM user id.

| Part | Folder | Stack |
| --- | --- | --- |
| Backend | `backend/` | PHP 8.2+, Slim 4, PostgreSQL |
| Frontend | `frontend/` | Angular 21, standalone + zoneless, signals; VexFlow 5.0.0 (npm) |
| Old progress | `server/data/` | `progress.json`, `sessions.json` - history from before the database |
| Launchers | `start.ps1`, `start.sh` | the owner's one-command start |

Dev addresses: frontend `http://localhost:4500` (`ng serve`, proxying `/api` and
`/setup.php`), backend `:8300` (`composer start` in `backend/`), the IAM
`http://localhost:4300` (repo `../anotoki-iam`: `backend/` on 8100, `frontend/`
on 4300). The launchers serve the built app from the backend at
`http://127.0.0.1:8300`.

## Always, before any work here

1. Load the **`piano-learning-app` skill** (`.claude/skills/piano-learning-app/SKILL.md`):
   the architecture, the learning-path design and roadmap, conventions, gotchas,
   and how to test without a piano. For delegated work use the **`piano-dev`**
   agent (`.claude/agents/piano-dev.md`), which loads it too.
2. `README.md` is what the app is; `DEV.md` how to set it up, run, test,
   build and deploy it.

## Always, after a change

Walk the skill's review checklist, run the tests (below), then keep the
knowledge base in step - part of finishing the task: the skill, this file (if
the essentials changed), `.claude/agents/piano-dev.md`, `README.md` ("Current
state"), `DEV.md` (commands), and `frontend/public/changelog.json` (a
line in plain words for anything a learner would notice).

## Essentials

- **Two auth modes, chosen by the installation, never a request**
  (`backend/config/auth.local.php`): `iam` - sign-in through the anotoki IAM
  (OIDC code + PKCE in the browser, RS256 access tokens verified by the backend
  with the vendored `api/anotoki_iam.php` v1.0.1); `none` - the owner's own
  computer, no login, every request acts as `local_user_id`, answered only
  under PHP's built-in server, from a loopback address, by a local Host name,
  never through a proxy. `none` shows no sign-in UI at all.
- **Settings are required and never committed**: `backend/config/database.local.php`
  and `auth.local.php` (gitignored). Without them the API answers
  `503 {code: "not_set_up"}` and the app shows its "not set up yet" page. The
  web **`backend/setup.php`** writes them - on this computer (no token, a
  CSRF nonce, re-runnable, auth `none`, the `server/data/` import) and on a real
  host (token + lock + self-delete, auth `iam`, an export upload). Never print
  the database password; never copy it anywhere git would publish.
- **The owner's real progress is the database `piano_academy`** (IAM user 1).
  Never run a test, an experiment or a manual server against it: use a
  throwaway `piano_test_*` database (`tests/tools/testenv.php`, `PIANO_TEST_CONFIG`,
  honoured only for `piano_test_` names). Back it up with `pg_dump` before any
  migration (a copy from 2026-09-28 is in `backend/storage/backups/`).
- **`server/data/*.json` are history**: read once by the setup's import, never
  modified, moved or deleted; tests use copies.
- **The domain logic lives in the frontend's services** (`frontend/src/app/core/music/`:
  theory, srs, songs, path). The browser computes every SRS and path change and
  saves whole documents; the backend checks shapes and stores. Never copy that
  logic into a component or into PHP.
- **Angular components are three files** (`.ts`, `.html`, `.scss`) - never an
  inline template or styles. Standalone, OnPush, signals, zoneless.
- **PHP**: `declare(strict_types=1)`, camelCase functions by area (`store*`,
  `transfer*`, `auth*`, `translation*`, `language*`...), `?` parameters in every
  query, every query **on a person's data** scoped to the request's user id
  (which only ever comes from the verified token or `local_user_id`). The
  site's strings are the exception: public to read (`GET /api/translations/{code}`),
  owner-only to write (`/api/owner/...`, `requireOwner()`). `setup.php` stays
  parseable by PHP 7.4 (it must be able to say "PHP is too old"); the rest
  needs 8.2.
- **The owner** is the one role the backend checks: the IAM role `ADMIN` of
  this application in mode `iam`, whoever mode `none` lets in on this computer
  (`requestUser()` in `api/auth.php`). Only the owner changes the app's words;
  the frontend's `isOwner` only hides what the server refuses anyway.
- **The app's words live in the database** (`languages`, `translation_keys`,
  `translations`; migrations 002 and 003) and are edited in the browser, on the
  owner's Translations and Languages pages (English, not translated). English
  and Slovak, English the fallback key by key; **Slovak is informal ("ty")**. A
  page asks by key (`translate` / `translatePlural` pipes, `TranslationService`
  in `core/i18n/`), and a key with no string **shows the key on purpose**. A
  new or reworded string is a new migration with the key, its English and its
  Slovak (003's layout - a test reads the file); state and stored sessions hold
  keys and ids, never sentences. The shell's English is also kept in code
  (`core/i18n/kept-english.ts`) for when there is no bundle at all. Note
  names (C D E F G A B, B in Slovak too), song titles, MIDI device names and
  the changelog's entries are never translated.
- **Migrations are the schema**: `backend/migrations/piano_academy/NNN_name.sql`,
  the family's engine (`api/migration_runner.php`). Never edit an applied one.
- No piano in dev: dispatch `noteon` on `window.pianoMIDI`; read the staff via
  `.vf-stavenote[data-midi]`; `window.pianoPlayer.expectedTimes` for runs in
  time. `playwright-core` with Edge (`channel: 'msedge'`) works on this
  machine; the stand-in IAM is `backend/tests/tools/fake-iam.php`.
- The user is a beginner pianist writing in non-native English: keep UI text
  and explanations plain and short.

## Commands

```
# Backend (from backend/)
composer start                            # dev API (php -S localhost:8300 router.php) + setup page (+ the built app, if built)
php tests/run.php                         # every PHP test, throwaway databases
php migration.php [--status|--dry-run]    # migrations for the configured database
php tools/progress.php --export=FILE      # also --import=PATH, --owner=ID
php tools/translations.php --status       # the keys the frontend asks for against the database's (exit 1 on a gap)
php tools/translations.php --export sk [FILE]   # also --import sk FILE: one language's strings as flat JSON
php tests/tools/testdb.php template --fresh     # rebuild the tests' template after editing an unreleased migration
php tools/build.php                       # the upload -> ../dist/ (builds the frontend too)

# Frontend (from frontend/)
npm ci && npm start                       # ng serve on :4500
npm test                                  # Vitest unit tests
npm run build                             # production -> dist/piano-academy/browser/
```

## Working conventions

- **Stage nothing, commit nothing** unless asked; the owner edits alongside.
  Stage exact paths, never `git add -A`.
- **Stop every server you start** (and its process tree); check the ports after.
  Don't start anything on 4200/4300/8000/8100 (other projects) or the owner's
  8300/4500 copy while they might use it - throwaway servers go on 8390-8399.
- Other anotoki repositories are read, not changed.
