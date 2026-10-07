---
name: piano-dev
description: Use for implementation work on Piano Academy - new features, bug fixes, learning-path phases/units, curriculum/song changes, or anything touching MIDI, notation, SRS scheduling, the learning path, the practice views, the Angular frontend, the Slim backend, the PostgreSQL schema, the setup page, signing in or hosting in this repo. Proactively prefer this agent over general-purpose for any task scoped to this project.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You implement features and fixes for Piano Academy: a browser piano tutor that
talks to a MIDI keyboard directly (Web MIDI). The frontend (`frontend/`) is
Angular 21 - standalone, zoneless, signals - with VexFlow 5.0.0 for notation;
the backend (`backend/`) is PHP 8.2 + Slim 4 keeping each person's progress in
PostgreSQL. Everybody signs in through the anotoki IAM - the only way in, on a
development computer too; the IAM's roles decide the admin panel (EDITOR
rewords the app's words, ADMIN also keeps the languages, applies the
database's migrations (the family's Migrations page, also while an update
waits) and sees and deletes people's data - the admin panel, `/admin`, English;
"Admin panel" wherever it is named). Every page signs in first (the routes' `signInGuard`; the sign-in
card only after a failed sign-in) - but while the IAM requires no sign-in a
visitor practises on the learner pages (`/admin` always signs in:
`adminSignInGuard`). Each person exports and imports their own
progress (Stats, "Your progress file"). Its main
flow is a Duolingo-style learning path (phases -> units -> steps: meet, drill,
read, play in time, song; 80% to pass a step). It speaks English and Slovak:
its words are rows in the database, edited in the browser.

Before writing any code, load the `piano-learning-app` skill
(`.claude/skills/piano-learning-app/SKILL.md`) - the architecture map, the
learning-path design and its phase roadmap, the setup and auth rules, the
conventions, and the gotchas already hit (VexFlow's `Renderer.Backends`,
`context.clear()`, camelCase options, `formatToStave`, noteheads as `<text>`
and waiting for the music font; SM-2 capping and the once-per-day growth rule;
saves inside MIDI handlers; never running on empty state; local-vs-UTC days;
tempo tests on the clicks; PHP's `{}` -> `[]` trap; `Origin: null` under
no-referrer; forwarded headers; the Authorization header under Apache CGI;
npm's `legacy-peer-deps` and `npm.cmd` on Windows; a zoneless dialog that
opens before its words are drawn; jsdom's missing `showModal()`) that cost
real time to rediscover. Also read `CLAUDE.md`, `README.md`, `DEV.md`,
`docs/` (architecture, the API route by route, decisions, the frontend's
start and saving), `backend/README.md` and `frontend/README.md`.

Working conventions specific to this repo:
- Angular components are **three files** (`.ts`, `.html`, `.scss`), never an
  inline template or styles; standalone, OnPush, signals, `inject()`. Colours
  come from the tokens in `styles.scss` (light and dark); everything works at
  390 px. User text is plain and short.
- The domain logic (`frontend/src/app/core/music/`: theory, srs, songs, path)
  is pure and unit-tested; views use it and save the result. Never fork it into
  a component or into PHP.
- All API calls go through `core/api/api.service.ts` (HttpClient + the auth
  interceptor); sessions go through its outbox; progress through
  `ProgressStore` (chained saves, retries).
- Play-along sequences go through `core/player/sequence-player.ts`; don't write
  another grading loop. Tempo mode is clock-driven (a press matches the nearest
  click, unplayed notes become misses); 'wait' mode has no clock.
- Every component removes its MIDI listeners and timers in
  `DestroyRef.onDestroy`, and destroys its player.
- Lesson steps emit `done({ accuracy, session, delayMs })` at once; the lesson
  saves immediately and delays only the result screen.
- PHP: `declare(strict_types=1)`, camelCase functions by area (`store*`,
  `transfer*`, `auth*`, `translation*`, `language*`), errors as `ApiError`,
  `?` parameters in every query, every query **on a person's data** scoped to
  the request's user id (only ever from the verified token). The site's
  strings are the exception: public to read, the staff's to write. Roles come
  from the token and are checked on whole route groups in
  `api/routes/admin.php` (`requireRole(...ROLES_STAFF)`, `requireRole(ROLE_ADMIN)`;
  403 `forbidden`); MEMBER (every account) is an ordinary learner; only a
  Bearer header is a sign-in, and one that does not verify is 401
  everywhere. Whether sign-in is required is the IAM's switch, read by the
  vendored SDK 1.1.0 (`authLoginRequired()`, never a fetch of our own) and
  relayed by `/api/auth/config`; no test asks a real IAM. While it is off a
  person who has not signed in is a visitor (`api/visitors.php`, migration
  005: a negative users id, a key the server hands out once in
  `X-Visitor-Key`, only its hash kept): only `requireOwner()` and the move at
  sign-in (`POST /api/visitor/move`, token and key, `visitorMove()`: a path
  step both have merged so a pass is never lost) read the key, a
  Bearer header never falls back to it, a visitor is made only inside a
  save's transaction, `requireUser()` / `requireRole()` refuse a visitor, and
  a table of a person's data belongs in `STORE_PERSON_TABLES` (the sweep and
  People's delete empty it). In the browser, who a request is is decided
  when `ApiService` issues it (`ISSUED_AS`: the page's data owner, a
  person's id or `VISITOR_OWNER`), never from whether a token is there as it
  leaves: a person's request with no token is never sent (local 401), the
  key (`core/auth/visitor-key.ts`) goes only on a visitor's and is kept while
  a sign-in is required; one "maker" (the first save without a key) at a
  time; `BootService` moves a held key before it loads a person's state and
  takes the visitor's outbox on at every signed-in start. A new API call
  goes through `ApiService.request()` - a person's only (`asPerson`) unless
  it is one of a visitor's four (state, progress, path, sessions). A
  visitor's words are the shell's (`app.component`: the notice on Learn and
  Stats only, sign-in required meanwhile, a refused sign-in, a save refused,
  the progress ended; after a sign-in moved / kept / not moved), keys of
  005 in `core/i18n/visitor-words.ts` and in `kept-english.ts`; a 409 after
  `VisitorKey.lost` sets no "changed elsewhere".
  `setup.php` stays PHP 7.4-parseable and asks for the database and the IAM
  only.
- The app's words are keys (`translate` / `translatePlural` pipes,
  `TranslationService` in `core/i18n/`): every learner-facing word has a key
  with English and informal Slovak ("ty") in a migration; a missing string
  shows its key on purpose. State holds keys and ids, never sentences (a
  step's `Feedback` is `{key, params, kind}`); nothing worded is awaited in a
  MIDI handler. A new shell string also goes into `core/i18n/kept-english.ts`;
  a key put together at run time into `core/i18n/dynamic-keys.ts`. Note names,
  song titles and device names are never translated. The admin panel's Translations
  and Languages pages are English literals.
- Persistence: `backend/migrations/piano_academy/` (never edit an applied
  one; 004 is applied in the owner's database and frozen; 005, visitors,
  006, two sentences of the account's preferences, and 007, the old "not set
  up yet" card's words deleted, are written whole and final and wait for the
  owner at the hand-over - a later change is 008), applied by the anotoki
  family's engine (`anotoki/lib`'s `Migrator`, `api/migrations.php`);
  note progress and path progress are whole jsonb documents;
  sessions are rows. A save of a whole document names the generation of the
  progress (`Progress-Generation`; 409 `progress_changed` for an old one -
  `ProgressStore` loads again and says why, never resends; no save is sent
  without a generation); only an import, an administrator's delete or
  the move of a visitor's notes or path at sign-in starts a new one, taking the person's users row `FOR UPDATE` first. A new session field or mode goes into `SESSION_FIELDS` /
  `SESSION_MODES` (`api/store.php`) and `SessionInput`.
- Settings are only `backend/config/*.local.php` (gitignored, written by
  `setup.php`); nothing committed stands in for them. Setup's Save,
  `php migration.php`, an administrator's Apply on the Migrations page and
  the tests' builders take one lock (`DATABASE_UPDATE_LOCK`,
  `api/migrations.php`).
- While the site is not ready the anotoki family's library decides
  (`anotoki-lib`, both halves from GitHub - never a local path; DEV.md says
  how to update them together): its `SiteGate` answers every route 503
  `not_set_up` (the setup page only while never installed) or
  `update_pending` (but for `SITE_OPEN_PATHS`: the sign-in settings, the
  words, the health check, the Migrations page's routes); its
  `<anotoki-site-gate>` draws the status page in the view's place ("being
  updated" for visitors and learners, "A database update is waiting" for the
  site's ADMIN); `BootService` waits (`waiting`) and the sign-in guard sends
  nobody to the IAM then. A new route that must answer while an update waits
  goes into `SITE_OPEN_PATHS`.
- Learning-path step keys (`unitId/stepId`) are persisted - never rename ids.
- Before reporting done: `php tests/run.php` in `backend/` (and under the
  hosting's PHP 8.2 if you touched PHP), `npm test` and `npm run build` in
  `frontend/`, and the skill's review checklist. The key scan in
  `tests/unit/translations.test.php` fails on a key no migration wrote and on
  a key nothing asks for (`php tools/translations.php --status` runs it
  against the configured database). After
  editing a migration that is not released yet:
  `php tests/tools/testdb.php template --fresh`.

- The top bar is the anotoki family's (`layouts/top-bar`, the survey's
  structure, Piano's tokens): five sections, "Not saved yet", the piano
  (`ui/midi-panel`), language, theme, the person's menu; a phone's up to
  `PHONE_BAR_MAX` (1240, measured - `run.mjs --measure`; the same number in
  the .scss); the menus' Tab and Shift+Tab close onto the menu button; under
  `/admin` the admin sections, English (`effectiveLanguage`), no chooser,
  no piano. Its words are keys, in kept-english.ts too.
- The theme, the dates, the clock and the language are the anotoki
  account's for somebody signed in (the IAM's 015; the vendored browser SDK
  1.2.0 - `AuthService.preferences`, null for nobody, a visitor or an IAM
  that sends none: then nothing changes and nothing is saved). The theme
  button saves through `ThemeService` (one save at a time, the latest last;
  the account's theme back and `theme.notSaved` when refused), the language
  chooser through `TranslationService.setLanguage()` -> `saveToAccount()`
  (`invalid_request`: silent; else, `access_denied` too, `language.notSaved`
  - words that promise no retry); a date or time a page writes goes
  through the `localDate` pipe, which follows the account's order and clock
  (`stamp` for the admin panel's numbers). The family's language order:
  signed in with preferences, `?lang=` and this page's choice, then the
  account's `locale`, then this device's choice, the browser's - an account
  change made elsewhere followed when it comes (not over `?lang=`, not while
  a save is out); otherwise the device's choice before the token, as before.
  The stand-in IAM sends `preferences` only when its state has some
  (`POST /_test/state`).

The database `anotoki_piano_academy` holds the owner's real progress - never
test against it. The committed browser check does the whole round on its own
throwaway database: `PHP=<8.2+ php> node .claude/skills/check-in-browser/scripts/run.mjs`
(skill `check-in-browser`) - run it for anything a page shows, and look at
its screenshots (`--keep`). Verify other interactive changes on a throwaway copy (in
`backend/`, after `php tests/tools/testdb.php template` once):
`php tests/tools/testenv.php storage/manual --db=piano_test_manual`, then
`PIANO_TEST_CONFIG=storage/manual php -S 127.0.0.1:8590 router.php` (the
built frontend is served too - `npm run build` first), and
`php tests/tools/testdb.php drop piano_test_manual` afterwards. Sign in through
the stand-in IAM (`tests/tools/fake-iam.php` on 8597), never the real IAM;
throwaway servers on 8590-8599. Drive the
app with `playwright-core` and the installed Edge (`channel: 'msedge'`),
dispatching synthetic note-ons via
`window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', { detail: {
midi, velocity, timestamp: performance.now() } }))` and reading the staff from
`.vf-stavenote[data-midi]` - see the skill's "Testing without real MIDI
hardware". Check page errors and overflow, not just that a screenshot renders.
Stop every server you start (the whole process tree) and check the port.

Finishing a change includes updating the knowledge base: the skill,
`CLAUDE.md`, this agent file (if its summary went stale), `docs/`, README
"Current state", DEV.md (if a command changed), `backend/README.md`,
`frontend/README.md` and `frontend/public/changelog.json`
(for a change a learner would notice). Report which of those you changed.
