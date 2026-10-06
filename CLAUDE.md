# anotoki · Piano Academy

Browser piano tutor for a KAWAI ES120 (any USB-MIDI keyboard): Web MIDI in the
browser, a Duolingo-style **learning path** (phases -> units -> steps: meet,
drill, read, play in time, song; 80% to pass), with Note Trainer, Sheet
Practice, Songs and Stats as free practice. Every person's progress is kept in
PostgreSQL under their anotoki IAM user id.

| Part | Folder | Stack |
| --- | --- | --- |
| Backend | `backend/` | PHP 8.2+, Slim 4, PostgreSQL |
| Frontend | `frontend/` | Angular 21, standalone + zoneless, signals; VexFlow 5.0.0 (npm) ([frontend/README.md](frontend/README.md)) |
| Knowledge base | `docs/`, `.claude/` | architecture, API, decisions; the skill and the agent |

Dev addresses: frontend `http://localhost:4500` (`ng serve`, proxying `/api` and
`/setup.php`), backend `:8300` (`composer start` in `backend/`), the IAM
`http://localhost:4300` (repo `../anotoki-iam`: `backend/` on 8100, `frontend/`
on 4300). Sign in at `http://localhost:4500`: that is the address the IAM
knows for `piano-academy` (`127.0.0.1` does not sign in).

**Under way (2026-10-04): the anotoki family made one way** - the IAM only,
roles ADMIN / EDITOR, each person's own export and import, one top bar. The
backend is done: sign-in, roles, setup and layout (stage 1); each person's
export and import, the progress generation, the People routes and migration
004's schema part (stage 2). The frontend is in step (stage 3): sign-in on
every page, the admin panel under `/admin`, the own progress file on Stats,
saves that name the generation, the sign-out question, and 004's strings for
them. The family's one top bar is in (stage 4: `layouts/top-bar`), 004 is
finished with its strings, and the version is 0.2. Stage 5 reviewed it all
and fixed what it found (a round no longer keeps its own copy of the
progress; the bar's names hold the words they show; a 428 is a failed save). Then, at the owner's request, the
family's Migrations page (the IAM's) took the Database page's place, also
while the database is behind, and the area is "Admin panel" wherever it is
named. **004 is applied in the owner's database** (2026-10-05) and frozen:
a later change is a new migration (on the host: upload, apply at once, then
the IAM's migrations). `docs/README.md` says the same.

**Under way (2026-10-05): sign-in per site, MEMBER for everyone, visitors.**
Stage A (the switch) is in: the vendored IAM SDK 1.1.0, `authLoginRequired()`
relayed as `loginRequired` by `/api/auth/config`, only Bearer counting as a
sign-in, MEMBER an ordinary learner, the stand-in IAM's public route. Stage B
(the visitors' backend) is in: migration **005** (written whole and final,
2026-10-05 - the owner applies it at the hand-over, after a `pg_dump`, never
before: until then the owner's dev site says "needs an update"), visitors as
`users` rows with a negative id and a key's hash (`api/visitors.php`),
`requireOwner()` on the progress routes, the limits and the sweep, People's
visitors line. Stage C (the move at sign-in) is in: `POST /api/visitor/move`
(`api/routes/visitor.php`, `visitorMove()`) with the token and the key.
Stage D (the frontend's core) is in: `AuthService.loginRequired`,
`core/auth/visitor-key.ts`, who a request is decided as `ApiService` issues
it (`ISSUED_AS`), one "maker", the move before the state, the visitor's
outbox taken on at every signed-in start, the guards (a visitor on the
learner pages, never on `/admin`). Stage E (the visitor's words) is in: the
shell's notes for a visitor (the notice on Learn and Stats, sign-in required
meanwhile, a progress ended, a save refused, a refused sign-in) and after a
sign-in (moved / kept / not moved), Stats' sign-in line in place of the
progress file, People's visitors line, the browser check's visitor tours
and a line in 0.2's What's new. Next: the review (F).

**2026-10-06: the theme, the dates and the clock are the anotoki account's**
(the IAM's migration 015, its browser SDK 1.2.0 - vendored; the owner's
decision, `docs/decisions.md`). Followed for somebody signed in - the whole
site, the admin panel too; the bar's theme button and language chooser save
a signed-in person's choice to the account, and the account's language
comes before this device's choice (the family's order). Migration **006** (two
sentences: a choice the account would not take) is written whole and final
and goes with 005 at the hand-over. It goes out as version 0.3 (its line in
What's new).

## Always, before any work here

1. Load the **`piano-learning-app` skill** (`.claude/skills/piano-learning-app/SKILL.md`):
   the architecture, the learning-path design and roadmap, conventions, gotchas,
   and how to test without a piano. For delegated work use the **`piano-dev`**
   agent (`.claude/agents/piano-dev.md`), which loads it too.
2. `README.md` is what the app is; `DEV.md` how to set it up, run, test,
   build and deploy it; `docs/` how it works and why (`docs/README.md`);
   `backend/README.md` and `frontend/README.md` each part's layout, commands
   and tests.

## Always, after a change

Walk the skill's review checklist, run the tests (below) - and the browser
check (skill `check-in-browser`) for anything a page shows - then keep the
knowledge base in step - part of finishing the task: the skill, this file (if
the essentials changed), `.claude/agents/piano-dev.md`, `docs/` (the pages
the change makes wrong), `README.md` ("Current state"), `DEV.md` (commands),
`backend/README.md`, `frontend/README.md`, and `frontend/public/changelog.json` (a line in plain
words for anything a learner would notice).

## Essentials

- **Sign-in is the anotoki IAM, and nothing else**: OIDC code + PKCE in the
  browser, RS256 access tokens verified by the backend with the vendored
  `api/anotoki_iam.php` (the IAM's PHP SDK, v1.1.0, byte for byte). Who a
  request is comes only from a verified token (`requestUser()` in
  `api/auth.php`) - never a body, an address, a header of the app's own or a
  setting. Only the Bearer scheme is a sign-in (`Basic ...`, from a host
  behind a password file, counts as no header). No token: 401
  `sign_in_required`; a token that does not check out: 401 `invalid_token` on
  every route that reads one, never anything else. No configured owner.
  **Whether sign-in is required is the IAM's switch** for `piano-academy`:
  `authLoginRequired()` (the SDK's `anotoki_iam_login_required()`, kept a
  minute in `cache_dir`, single flight, true - required - whenever nothing
  better is known), relayed as `loginRequired` by `GET /api/auth/config`; no
  test ever asks a real IAM (`application_file`, or the stand-in -
  `tests/lib.php` `test_offline_auth()`). While it is on, every learner route
  requires a token. While it is off, somebody who has not signed in is a
  **visitor** (`api/visitors.php`, migration 005): a `users` row with a
  negative id (never an IAM id), no name and no role, made by their first
  save (never a page view) in that save's own transaction, and found again by
  a random key the server hands out once (`X-Visitor-Key`; only its SHA-256
  is kept). Only `requireOwner()` (`api/meddleware/auth.php`) reads the key,
  on the progress routes - and the move at sign-in (`POST /api/visitor/move`,
  behind `requireUser()`, whatever the switch: the person's notes stay where
  both have one, a path step both have is merged so a pass is never lost,
  the visitor's other notes, steps and rounds come, then the visitor goes):
  a Bearer header is that person or 401 (the
  key not even read), sign-in required is 401 `sign_in_required` (the key not
  looked up), and `requireUser()` / `requireRole()` refuse a visitor however
  they are stacked - no own progress file, no admin panel. Limits per address
  (trusted proxies only, IPv6 /64), in all and per visitor
  (`config/visitors.local.php`, optional, never written by setup); visitors
  unseen 30 days are swept after somebody's answer. **In the browser, who a
  request is is decided when it is issued** (`ApiService`, from the page's
  data owner - a person's id or `VISITOR_OWNER` - carried in the `ISSUED_AS`
  HttpContext token), never from whether a token is there when it leaves: a
  person's request with no token is never sent (401 `sign_in_required`
  locally - never a visitor's, never a maker); the key
  (`core/auth/visitor-key.ts`, localStorage) goes only on a visitor's
  request, and only while no sign-in is required; it is KEPT while one is
  (only 401 `visitor_unknown` forgets it, compare-and-delete); the move is
  the one request with both. **Every page signs in first** - but for a
  visitor while the IAM requires no sign-in: the routes'
  `signInGuard` (`frontend/src/app/core/auth/sign-in.guard.ts`, the survey's)
  lets a visitor through to the learner pages (`BootService.visiting`), and
  `adminSignInGuard` keeps `/admin` sign-in only; anybody else signed out
  is sent to the IAM and back to the page; the sign-in card
  is drawn only after a sign-in that came back refused or cancelled, or could
  not start (`AuthService.signInFailure` - otherwise the browser would loop).
  One that cannot start in the middle of practising is worded in the
  signed-out banner under the top bar, in the card's words - for a visitor
  (who gets no signed-out banner) in a note of its own, the same words. A
  visitor's notes are the shell's (`app.component`; the keys in
  `core/i18n/visitor-words.ts`, migration 005's, in `kept-english.ts` too).
  The boot cards (not set up, could not load) draw without a sign-in.
- **The theme, the dates, the clock and the language are the anotoki
  account's** for somebody signed in (`AuthService.preferences`: the
  vendored browser SDK 1.2.0's `user().preferences`; null for nobody, a
  visitor, or an IAM before its 015 - then the app keeps its own settings and
  saves nothing). `ThemeService` shows the account's theme everywhere (taken
  at sign-in and whenever it changes, never while its own save is out) and
  the bar's button saves a choice (`savePreferences()`: one at a time, the
  latest last; refused, the account's theme back and `theme.notSaved`); the
  `localDate` pipe follows the account's date order and clock (`stamp` for
  the admin panel's People and Migrations - the server's own numbers there);
  the language chooser saves a signed-in person's choice
  (`TranslationService.setLanguage()` -> `saveToAccount()`: a language the
  IAM does not offer stays the site's own for the visit, silently; another
  refusal, `access_denied` too, is `language.notSaved`). **Which language**
  (the family's order, the survey's the reference): signed in with
  preferences, this tab's `?lang=` and a choice made on the page this visit,
  then the account's `locale` (when the site has it), then this device's
  remembered choice, the browser's, English; a change of the account's
  language made elsewhere is followed when it comes - not over `?lang=`, not
  while a choice made here is on its way to the account. Signed out, or no
  preferences: `?lang=`, this device's choice, the token's `locale`, the
  browser's, as before. `piano-academy:theme` still keeps the theme on the
  screen for `public/theme-boot.js`. Visitors: each device's own, as before.
- **Roles, from the token, checked on route groups**: a signed-in person with
  no role but **MEMBER** (every account holds it, in every application; no
  check needs it or refuses it) learns with their own progress - taking
  someone's MEMBER away in the IAM refuses their next sign-in and refresh,
  while the access token they hold verifies until it runs out (minutes);
  **EDITOR** also rewords the app's
  words; **ADMIN** also adds / changes / deletes languages, applies database
  updates and sees and deletes people's data (`/api/admin/people`). `ROLE_ADMIN`, `ROLE_EDITOR`,
  `ROLES_STAFF`; `requireRole(...ROLES_STAFF)` / `requireRole(ROLE_ADMIN)` on a
  whole Slim group in `api/routes/admin.php` (`/api/admin/...`), so a route
  added later cannot forget it; 403 `forbidden`. The frontend only hides what
  the server refuses anyway: the admin panel is `/admin` (English;
  Translations for `isStaff`, Languages / People / Migrations for `isAdmin` via
  `adminGuard`; "Admin panel" in the person's menu, as on every anotoki site).
- **Settings are required and never committed**: `backend/config/database.local.php`
  and `auth.local.php` (`issuer`, `client_id`, `cache_dir`; gitignored). Any
  other key is passed over, so an old file with `mode` / `local_user_id`
  still works (and signs in through the IAM). Without them the API answers
  `503 {code: "not_set_up"}` and the app shows its "not set up yet" page; a
  database behind the code answers the same with `update: true` - and then an
  ADMIN gets the admin panel's **Migrations** page (`/admin/migrations`, the
  IAM's page: Pending, Applied, "Apply pending"), the one page that runs
  while the database is behind (the card links to it). The web
  **`backend/setup.php`** writes them, asking for the database and the IAM
  only - on this computer (no token, a CSRF nonce, re-runnable, saved values
  shown) and on a real host (token + lock + self-delete, nothing saved shown).
  Setup's Save, `php migration.php` and an administrator's Apply
  (`POST /api/admin/migrations/apply`) take one advisory lock
  (`api/database_update.php`). Never print the database password; never copy
  it anywhere git would publish.
- **The owner's database is `anotoki_piano_academy`** (their IAM user id is 1;
  new setups default to `anotoki_piano`, port 5432). Never run a test, an
  experiment or a manual server against it: use a throwaway `piano_test_*`
  database (`tests/tools/testenv.php`, `PIANO_TEST_CONFIG`, honoured only for
  `piano_test_` names). Back it up with `pg_dump` before any migration. A
  new migration is written whole and final in one go (the owner's dev site
  reads the folder) and the owner applies it at the hand-over, never before.
- **The domain logic lives in the frontend's services** (`frontend/src/app/core/music/`:
  theory, srs, songs, path). The browser computes every SRS and path change and
  saves whole documents; the backend checks shapes and stores. Never copy that
  logic into a component or into PHP.
- **A save of a whole document names the generation of the progress**
  (`Progress-Generation`, from `GET /api/state`): only an import, an
  administrator's delete or a visitor's move at sign-in (notes or steps
  added) starts a new one, and a save to an old one is
  `409 progress_changed` - nothing saved; the page loads the progress again,
  never sends the old documents again (`ProgressStore`; it says why, and a
  tab that imported tells the person's other tabs through localStorage). The
  frontend never sends a save without a generation (no 428 from it; a 428 is
  kept as a failed save, "Not saved yet"). Nobody's state (a visitor without
  a key) is generation 0, which only the save that makes the visitor names -
  one such "maker" at a time (`ApiService`), the others wait for its key and
  generation. **No page keeps a copy of the
  progress**: an answer goes in through `ProgressStore.updateNote(midi,
  change)`, which applies `change` to the note as the store holds it now -
  a round's own copy, saved whole after a reload, would write the old
  progress back under the new generation. Anything new that replaces or deletes a
  person's progress takes their users row (`storeLockGeneration()`) and starts a
  new generation (`storeNewGeneration()`). Each person exports and imports their
  own progress (`/api/me/export`, `/api/me/import`: replacing only when asked,
  never merging; `EXPORT_LIMIT` both ways).
- **Angular components are three files** (`.ts`, `.html`, `.scss`) - never an
  inline template or styles. Standalone, OnPush, signals, zoneless.
- **One top bar, the anotoki family's** (`layouts/top-bar`, the survey's
  structure): the brand, the five sections (Learn, Note Trainer, Sheet
  Practice, Songs, Stats), "Not saved yet", the piano (`ui/midi-panel`), the
  language, the theme, the person's menu. Up to `PHONE_BAR_MAX` (1240 px,
  measured with the real labels - the browser check's `--measure`; the same
  number in the .scss) it is a phone's: "Piano" (`brand.short`) and one
  menu button. Its menus' keys are the survey's (Tab and Shift+Tab close the
  menu onto its button). Every control's accessible name holds the words it
  shows (WCAG 2.5.3, label in name: "Language: {name} ({code})", the
  piano's "{label}: {status}", "anotoki Piano Academy: Learn"). Under `/admin` it has the admin sections, in
  English (`TranslationService.effectiveLanguage`), with no chooser and no
  piano. The footer keeps the version (What's new) only.
- **PHP**: `declare(strict_types=1)`, camelCase functions by area (`store*`,
  `transfer*`, `auth*`, `translation*`, `language*`, `database*`...), `?`
  parameters in every query, every query **on a person's data** scoped to the
  request's user id (which only ever comes from the verified token - or, for
  a visitor, from the key `requireOwner()` looked up: a negative id, the same
  isolation; People lists and deletes people only). The
  site's strings are the exception: public to read (`GET /api/translations/{code}`),
  the staff's to write (`/api/admin/...`). `setup.php` stays parseable by
  PHP 7.4 (it must be able to say "PHP is too old"); the rest needs 8.2.
- **The app's words live in the database** (`languages`, `translation_keys`,
  `translations`; migrations 002 to 006) and are edited in the browser,
  on the admin panel's Translations and Languages pages (English, not
  translated; EDITOR rewords, ADMIN also keeps the languages). English
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
  machine; the stand-in IAM is `backend/tests/tools/fake-iam.php` (on 8597 by
  default; `POST /_test/state` sets who signs in and their roles, and
  `login_required` / `application_missing` - what it says about this app -,
  `preferences` - the account's theme, dates and clock; null, the default:
  none, as an IAM before 015 - and `preferences_refuse`).
- The user is a beginner pianist writing in non-native English: keep UI text
  and explanations plain and short.

## Commands

```
# Backend (from backend/)
composer start                            # dev API (php -S localhost:8300 router.php) + setup page (+ the built app, if built)
php tests/run.php                         # every PHP test, throwaway databases
php migration.php [--status|--dry-run]    # migrations for the configured database
php tools/progress.php --export=FILE --user=ID   # also --import=FILE --user=ID [--replace], --move=FROM --to=TO
php tools/translations.php --status       # the keys the frontend asks for against the database's (exit 1 on a gap)
php tools/translations.php --export sk [FILE]   # also --import sk FILE: one language's strings as flat JSON
php tests/tools/testdb.php template --fresh     # rebuild the tests' template after editing an unreleased migration
php tools/build.php                       # the upload -> ../dist/ (builds the frontend too)

# Frontend (from frontend/)
npm ci && npm start                       # ng serve on :4500
npm test                                  # Vitest unit tests
npm run build                             # production -> dist/piano-academy/browser/

# The app in a browser, signed in through the stand-in IAM (from the root; PHP=<8.2+ binary>)
node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep] [--measure]
```

## Working conventions

- **Stage nothing, commit nothing** unless asked; the owner edits alongside.
  Stage exact paths, never `git add -A`.
- **Stop every server you start** (and its process tree); check the ports after.
  The owner's dev servers may run on 4200-4700 and 8000-8500 (the other
  anotoki sites, and this one's 4500 / 8300) - never stop them, never use those
  ports. Throwaway servers go on 8590-8599 (the PHP tests pick free ports of
  their own).
- Other anotoki repositories are read, not changed.
