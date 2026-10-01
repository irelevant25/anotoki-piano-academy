---
name: piano-learning-app
description: Use for any development work on this repo (Piano Academy) - new features, bug fixes, learning-path/curriculum/song changes, or anything touching MIDI, notation, SRS scheduling, the learning path, the practice views, the app's words and languages (English and Slovak, the owner's Translations and Languages pages), the Slim backend, the database, the setup page, signing in or hosting. Load this before making changes so conventions and known gotchas aren't rediscovered from scratch.
---

# Piano Academy - project skill

A piano tutor for a KAWAI ES120 (or any class-compliant USB-MIDI keyboard).
The browser talks to the piano directly (Web MIDI); an Angular 21 frontend
(`frontend/`) does all the music logic; a PHP 8.2 + Slim 4 backend (`backend/`)
keeps each person's progress in PostgreSQL. Two auth modes: `iam` (sign-in
through the anotoki IAM - the hosted site piano.anotoki.eu) and `none` (the
owner's own computer, no login). It speaks English and Slovak: its words are
rows in the database, asked for by key and edited by the owner in the
browser. Read [README.md](../../../README.md) for the
user's picture and [DEV.md](../../../DEV.md) for the commands -
this file is the implementer's supplement: architecture, design, conventions,
and the gotchas that cost time to rediscover.

**Keep this file current.** After any change, update this skill, the root
`CLAUDE.md`, `.claude/agents/piano-dev.md`, README "Current state", DEV.md and
the in-app changelog where they are affected - the owner wants the knowledge
base maintained with every change.

## Architecture

```
backend/                        PHP 8.2+, Slim 4 (vendor/ committed: the host has no composer)
  api/index.php                  front controller: buildPianoApp() (routes + middleware), run unless PIANO_NO_RUN.
                                 Middleware, outermost first: securityHeaders -> the error handler
                                 (ApiError / 404 / 405+Allow / NotSetUp / PDOException=503 [db] / else 500 [server])
                                 -> setupGate (503 not_set_up without the settings) -> routing. Its header
                                 lists every route.
  api/.htaccess                  Apache: everything under /api/ to index.php; no other file runs.
  api/bootstrap.php              what every entry point loads: PHP >= 8.2, UTC, display_errors off for the web,
                                 warnings -> ErrorException (deprecations only logged), then every api/*.php.
  api/routes/public.php          GET /api/health ({ok, auth} + database and pending migrations for loopback),
                                 GET /api/auth/config ({mode:'none'} | {mode:'iam', issuer, clientId}),
                                 GET /api/translations/{code} (the bundle: {language, languages, values, english?};
                                 no token looked at; ETag + no-cache, 304; unknown or hidden code -> English;
                                 requireCurrentSchema()).
  api/routes/progress.php        GET /api/state, PUT /api/progress (204), PUT /api/path (204),
                                 POST /api/sessions (201; 200 on an Idempotency-Key replay). All ->add(requireUser());
                                 /api/state also requireCurrentSchema() (503 not_set_up when migrations are pending).
  api/routes/translations.php    the owner's, group /api/owner, requireCurrentSchema -> requireUser -> requireOwner:
                                 GET, POST /languages; PUT, DELETE /languages/{code}; GET, PUT /translations (the grid;
                                 a save is {values: {key: {code: text}}}); GET /translations/{code}/export,
                                 PUT /translations/{code}/import (flat {key: text}). 1 MiB bodies on the two writes.
  api/meddleware/                security.php (nosniff, DENY, CSP none, no-store; NO CORS on purpose),
                                 setup.php (setupGate, requireCurrentSchema), auth.php (requireUser -> 'userId' and
                                 'owner'; requireOwner -> 403 owner_only).
  api/helpers.php                ApiError(status, errorCode, message, headers, extra); respondJson/respondJsonText/
                                 respondError ({error, code} + extra fields); jsonBody(request, limit) (JSON only: 415
                                 otherwise, 413 over the limit - 256 kB by default - null when empty, decoded to
                                 stdClass so {} stays {}); isoNow(), textClip() and the text* helpers.
  api/auth.php                   authMode() ('none' only if exactly 'none'), authLocalUserId(), authIamConfig(),
                                 authPublicConfig(), isLoopback(), isLocalHostName(), wasForwarded(),
                                 noLoginAllowed(sapi, remote, host, forwarded), requestUser() -> {id, owner}
                                 (none: local_user_id and owner, only cli-server + loopback + local Host + not
                                 relayed -> else 403 local_only; iam: Bearer -> vendored verifier -> sub, owner when
                                 the token's roles hold OWNER_ROLE 'ADMIN'; 401 sign_in_required / invalid_token with
                                 the reason only in the log "[auth] token refused: ..."), requestUserId(), usersSeen().
  api/translations.php           the app's words: languages* (all, offered, create/update/delete; en and sk cannot be
                                 deleted, en not switched off), translationBundle(), translationGrid(),
                                 translationsCheck() (key, language, text, length, placeholders as English's),
                                 translationsSave/Import/Export. The one module not keyed by a user id
                                 (translations.updated_by is the request's person, or null from a migration or the CLI).
  api/store.php                  one person's data: storeStateJson() (the database's jsonb text, never through
                                 PHP arrays), storeCheckProgress/Path, storeCleanSession (SESSION_FIELDS whitelist +
                                 bounds, SESSION_MODES), storeAddSession (Idempotency-Key -> stored once).
  api/transfer.php               the one-time server/data import (imports row 'server-data'), exports
                                 ('piano-academy-export'), transferReassign (UPDATE users SET id; FKs cascade),
                                 serverDataDir() (repo's server/data, or <test config>/server-data under tests).
  api/db.php                     dbConnect(settings, name, persistent), db() (persistent under cli-server),
                                 dbQuery/All/One/Value/Exec, dbTx, dbExists, dbServer.
  api/migration_runner.php       the family's engine (same as the IAM's and genshin's): migrations/{alias}/,
                                 table migrations(filename); renames the app's older migrations(name) column in
                                 place; pendingMigrationsReadOnly() for the API.
  api/anotoki_iam.php            the IAM's PHP token verifier, v1.0.1, copied unchanged from ../anotoki-iam/sdk/php/.
  config/config.php              the loader. Reads config/database.local.php + config/auth.local.php (required,
                                 gitignored, no fallback) -> settingsProblem(), databaseSettings(), authSettings(),
                                 writeLocalConfig() (owner-only), storageDir(). PIANO_TEST_CONFIG = another folder,
                                 honoured only while its database is piano_test_*.
  migrations/piano_academy/      001_init.sql: users, progress (notes jsonb), path_progress (data jsonb),
                                 sessions (seq, id, request_key, recorded_at, data jsonb), imports.
                                 002_languages_and_translations.sql: languages (code, name, native_name, enabled,
                                 sort_order; en and sk), translation_keys (name, description), translations (key_name,
                                 language_code, value, updated_at, updated_by); refuses a database that is not UTF8.
                                 003_site_strings.sql: every key with its English and Slovak (ON CONFLICT DO NOTHING)
                                 and a DO $$ gate; a test reads its layout as text.
  setup.php                      the web setup (see "Setup and settings"). Parseable by PHP 7.4.
  router.php                     PHP's built-in server: /api -> api/index.php, /setup.php, else the built
                                 frontend (PIANO_FRONTEND_DIST or ../frontend/dist/piano-academy/browser) with the SPA
                                 fallback; never a .php file or a dot-file; files with an extension 404 when missing.
  migration.php                  CLI migrations (--status, --dry-run).
  tools/progress.php             CLI --export / --import / --owner.
  tools/translations.php         CLI --status (the key scan against the database; exit 1 on a gap) / --export CODE
                                 [FILE] / --import CODE FILE. Refuses while a migration is pending.
  tools/translation_keys.php     the key scan (which keys frontend/src/app asks for, dynamic-keys.ts, the kept
                                 English) - used by the CLI and tests/unit/translations.test.php.
  tools/build.php                the upload: runs the frontend build, then dist/ = app + .htaccess + setup.php + api/
                                 + config/config.php + migrations/ + vendor/ + storage/ (deny .htaccess everywhere
                                 PHP-only) + 3rdpartylicenses.txt. Refuses a non-build or in-repo --out.
  tests/                         run.php, lib.php, unit/*, api/*; tools/testdb.php (template [--fresh], create, drop,
                                 sweep), testenv.php, fake-iam.php.
  storage/                       gitignored: cache/, backups/ (a pg_dump of the owner's database, 2026-09-28).

frontend/                        Angular 21, standalone + zoneless + signals, OnPush, three files per component
  src/app/app.config.ts          zoneless, router (component input binding, scroll to top), HttpClient (fetch +
                                 authInterceptor), PianoTitleStrategy, provideAppInitializer: ThemeService,
                                 changelog load, BootService.start() (sign-in settings, then the language and its
                                 strings, then the person's state).
  src/app/app.routes.ts          '' home, lesson/:unitId/:stepId, trainer, sheet, songs, songs/:songId, stats,
                                 translations + languages (the owner's: lazy, ownerGuard, unsavedChangesGuard),
                                 auth/callback. Pages with notation are lazy and wait for VexFlow's fonts (withNotation).
                                 Titles are keys (title.*); the owner pages' are English ('Translations', 'Languages').
  src/app/app.component.*        the frame: header (MIDI panel, account panel), nav (inert until ready), signed-out
                                 banner, the boot card or <router-outlet>, footer (version -> changelog, the owner
                                 link #owner-link when isOwner, the language chooser, theme).
  core/title.strategy.ts         a route title matching title.<word> goes through t(); "<title> · Piano Academy".
  core/auth/                     anotoki-auth.mjs + .d.ts (the IAM's browser SDK v1.1.1, copied unchanged from
                                 ../anotoki-iam/sdk/js/), auth.service.ts (init: /api/auth/config then createAuth +
                                 init(); signals mode/user/signedIn; userKey(); displayName (the person's name or
                                 null - the panel words the rest); isOwner (mode none, or this app's ADMIN);
                                 signIn(uiLocales) - always through BootService.signIn(), which passes the language),
                                 auth.interceptor.ts (bearer on /api/*, one retry with a fresh token after a 401;
                                 /api/translations/ goes untouched, /api/owner/ carries the token).
  core/i18n/                     translation.service.ts (TranslationService: the language - ?lang= of this tab, the
                                 chooser's choice, the token's locale, the browser's tags, English; the bundle from
                                 GET /api/translations/{code}, cached in localStorage; t(), plural(), has(),
                                 around() / aroundPlural() (a sentence cut around one placeholder); a key
                                 with no string is shown as itself and warns once "[i18n] ..."), translate.pipe.ts,
                                 translate-plural.pipe.ts, local-date.pipe.ts (dates in the page's language),
                                 kept-english.ts (KEPT_ENGLISH: the shell's English for when there is no bundle at
                                 all), dynamic-keys.ts (prefix -> every tail, for keys put together at run time:
                                 path.phase., path.step., path.hint., path.unit.), path-words.ts (phaseTitle,
                                 phaseDescription, stepTitle, stepShort, unitTitle, hintKey), error-text.ts
                                 (signInFailureKey/Params: the
                                 sign-in card words a failure from its code), translation.model.ts.
  core/owner/                    localization-drafts.service.ts: the owner pages' unsaved cells and language rows,
                                 kept for the tab (piano-academy:localization-drafts), count(), clear(); the
                                 browser's "Leave site?" while any is unsaved - not signed out on the way to the
                                 sign-in, which the drafts survive (unless the tab's storage refused them).
  core/testing/                  provideTestTranslations(values, bundle) and provideTestDialog() (jsdom has no
                                 showModal()) for specs.
  core/api/api.service.ts        every call; setDataOwner() (calls refuse any other user than the page loaded);
                                 the session outbox (localStorage piano-learning:unsaved-sessions:<user>,
                                 Idempotency-Key, kept on any failure but 400/413/415/422, unsavedSessions signal).
  core/state/progress-store.service.ts  the state signal; saveProgress/savePathProgress (chained, latest state sent,
                                 a copy kept), failed flags, RETRY_MS 15 s, 'online', settle() before sign-out.
  core/state/boot.service.ts     status loading | not-set-up | sign-in | load-error | ready; never runs on empty
                                 state; reloads when another user signs in in another tab; beforeunload (iam only).
  core/music/                    theory, srs, songs, path services (+ music.types.ts): ALL the domain logic.
  core/midi/midi.service.ts      PianoMidi (EventTarget: noteon/noteoff/connected/disconnected/devicechange;
                                 window.pianoMIDI) + MidiService (status {connected, name} - the device's own name;
                                 problem {kind: unsupported | refused | failed, detail} - the panel words the kind and
                                 shows the browser's detail as it is, lang="en"; devices, remembered device, reconnect).
  core/notation/notation.ts      VexFlow wrapper (renderSingleNote, renderSequence); notationFontsReady().
  core/player/sequence-player.ts the one play-along/grading loop (wait / tempo); window.pianoPlayer. Its
                                 feedback(key, params?, kind?) callback hands over a key, never a sentence.
  core/audio/metronome.ts        click track + performance.now() timing reference.
  core/theme/, core/changelog/   light/dark/auto (public/theme-boot.js before paint); public/changelog.json.
  ui/                            piano-keyboard (+ KeyboardModel), notation, midi-panel, account-panel,
                                 theme-toggle, changelog-dialog, language-switcher (the chooser in the footer:
                                 role="menuitemradio" items, the languages the owner offers).
  boot/                          sign-in-card (words a refused sign-in from its code), not-set-up, load-error.
  pages/                         home (the path), lesson (+ steps/meet, drill, sequence; step-outcome.ts: Feedback
                                 {key, params, kind}), trainer, sheet, songs (+ song-player), stats, auth-callback.
  pages/owner/                   the owner's two pages, English literals: translations (the grid: search, missing
                                 only, a cell per key and language, plural samples, export/import a language's file),
                                 languages (add, rename, order, offer, delete), translation-cell, confirm-dialog
                                 (native <dialog>), translation-grid.ts, owner.guard.ts, unsaved-changes.guard.ts
                                 (asks before leaving with drafts; beforeunload too), owner-error.ts (the server's
                                 sentence - shown only here), save-file.ts, _owner.scss. ApiService has their eight
                                 calls (languages, createLanguage, updateLanguage, deleteLanguage, translationGrid,
                                 saveTranslations, exportTranslations, importTranslations); ApiError carries details.

server/data/                     progress.json, sessions.json: the progress from before the database. History,
                                 tracked in git, read once by setup.php's import (serverDataDir()).
start.ps1, start.sh              find PHP 8.2+, build the frontend when missing or older than its sources (needs
                                 npm), php migration.php when set up, php -S 127.0.0.1:8300 router.php, open the app
                                 (or setup.php on 503), stop the process tree on Ctrl+C.
```

### Where each person's data lives

`progress.notes` (keyed by MIDI number), `path_progress.data` (`{steps: {...}}`)
and `sessions` (one row per finished round) - all keyed by `user_id`, the IAM
user id. `users` keeps the id, a copy of `preferred_username` from the tokens,
`created_at`, `last_seen_at`. Every store function takes the user id and every
query filters on it; the id only ever comes from the verified token or, in auth
mode "none", from `local_user_id`. The browser computes all SRS/path changes
and PUTs the whole document; last write wins.

The site's strings (`languages`, `translation_keys`, `translations`) are the
one exception: they belong to the site, not to a person, so no query on them
is scoped to a user id. Anybody reads them (the bundle); only the owner writes
them; the one user id there is `translations.updated_by`, the request's own.

## Setup and settings

- `backend/config/database.local.php` + `auth.local.php` are required and
  gitignored; `config/config.php` validates them (`settingsProblem()`); no
  committed template, no fallback. Without them: 503 `not_set_up` on every API
  route (detail only to loopback), the frontend's "not set up yet" page, the
  launchers open `/setup.php`.
- `setup.php` is local when `noLoginAllowed(PHP_SAPI, REMOTE_ADDR, HTTP_HOST,
  wasForwarded($_SERVER))`: no token, a double-submit nonce (cookie
  `piano_setup_nonce`, SameSite=Strict, + hidden field; a foreign `Origin` is
  refused, `Origin: null` - what the browser sends under the page's
  no-referrer policy - is fine), never deletes itself, shows saved values but
  never a password (empty field = keep), offers auth `none`/`iam` and the
  server/data import. Anything else is a real host: token in
  `storage/setup-token.php`, auth `iam` only, optional export upload into an IAM
  user id, then `storage/installed.lock` and self-delete (never the
  repository's own copy - it has tests/ beside it).
- **Test connection**: `setup.php?test=database|iam` (POST, the same proof as
  Save). Database: the named database first, then the server's `postgres`
  (can it create one?). IAM: `{issuer}/.well-known/openid-configuration`, the
  issuer must match, then its JWKS.
- Only the form page loads `setup.php?asset=js` (the live CSP allows no inline
  script); finished pages load nothing - on a host the file is gone by then.

## Learning path (the main flow)

Duolingo-style: words -> sentences -> story. Learn (home) shows a Continue
button, every phase with its units and step chips, a "notes due for review"
banner (links to the Note Trainer), and free-practice buttons.

- **Structure** (`core/music/path.service.ts`): `phases` -> `units` -> `steps`.
  Every unit uses the same ladder, built by `unit()`:
  `meet` (only with new notes) -> `drill` -> `read` -> `tempo` -> `song`.
  - meet: each new note on the staff + blue key + its hint (`hintKey(midi)` -> `path.hint.<midi>`; `NOTE_HINTS` is the list of MIDI numbers that have one); play it 3x. Not graded (100), no SRS, no session.
  - drill: 10 flashcards, staff only, ~40% new notes, the rest older notes of the phase by due date, never the same note twice in a row. Updates SRS.
  - read: 8-note melody (`generateMelody`: stepwise, home note at both ends, every new note), SequencePlayer 'wait'.
  - tempo: a fresh melody, SequencePlayer 'tempo', 50-80 BPM (default 60).
  - song: the unit's song at 60/80/100% (default 80%). A no-clock practice run is allowed and does NOT count.
- **Pass rule:** best accuracy >= `PASS_ACCURACY` (80); strictly in order; unlimited retries; a pass stays.
- **Note pool** of a unit = the new notes of its phase's units up to it (`notePoolForUnit`). Songs use only pool notes and every new note of their unit - `path.service.spec.ts` asserts it.
- **Persistence:** `{steps: {"rh-2/drill": {attempts, lastAccuracy, bestAccuracy, passedAt, updatedAt}}}`. Step keys `unitId/stepId` are saved - never rename a unit or step id.
- **Sessions** from lessons: `mode: 'lesson'`, `label` ("C, D, E · Drill" - English whatever the page's language, from `STEP_TYPES[type].short`, as every label stored before), `unitId`, `stepId`. Stats words a lesson's or a song's row from its ids in the page's language (`stats.lessonLabel`); only a row whose ids the app no longer knows shows the stored English, marked `lang="en"`.
- **The path's words are keys**: phase titles and descriptions, step names and short forms, the hints and the one worded unit title (`rh-5`, "B and high C") are `path.phase.*`, `path.step.*`, `path.hint.*`, `path.unit.*`, named through `core/i18n/path-words.ts`. `STEP_TYPES` holds only the English `short` for stored labels; `Phase` has no title or description of its own. A unit title of note letters only ("C, D, E") has no key and stands as it is.
- **CURRICULUM order must match the path's new-note order** (right hand, then left); the free Note Trainer introduces notes in that order.
- Later phases are `comingSoon` with no units (dashed "Coming soon" rows).

### Roadmap (agreed with the owner: one phase at a time; the owner tries each before the next)

| # | Phase (id) | Units | App capability needed first |
|---|---|---|---|
| 1 | Right hand (`right-hand`) - **done** | C D E -> G -> F -> A -> B C5; Hot Cross Buns, Mary, Ode to Joy, Twinkle, Joy to the World | - |
| 2 | Left hand (`left-hand`) | C3 D3 E3 -> F3 G3 -> A3 B3, simple tunes an octave lower | Bass clef in `Notation.renderSequence` (`clefForMidi` / a clef option), a lower `phase.keyboard`, NOTE_HINTS for the left hand, bass-clef songs |
| 3 | Both hands (`hands-together`) | alternating hands, then a held LH note + RH melody | Grand staff (treble + bass, StaveConnector), simultaneous notes, grading two voices |
| 4 | Left-hand chords (`left-hand-chords`) | C, F, G triads | Chord detection (note-ons within ~150 ms as one event), chord SRS items, half/whole notes in Notation |
| 5 | Right-hand chords (`right-hand-chords`) | the same chords RH | reuses 4 |
| 6 | Melody and chords (`melody-and-chords`) | RH melody over LH chords | reuses 3 + 4 |

The pass rule and step ladder stay the same in every phase. A new step type
gets a `StepType`, a `STEP_TYPES` entry and a case in `lesson-page.component.html`.
A new phase, step type, hint or worded unit title also needs its tails in
`core/i18n/dynamic-keys.ts` and its strings (English and Slovak) in a migration.

## Signing in, auth modes, hosting

- **Auth mode is the installation's setting** (`config/auth.local.php`), never a
  request parameter. Anything but exactly `none` is `iam`. The local setup
  defaults to `none`; a real host's setup writes `iam`.
- **none**: every request acts as `local_user_id`, but only under PHP's built-in
  server, from a loopback REMOTE_ADDR, with a Host of 127.x / localhost / [::1]
  (the Host rule stops DNS rebinding), and with no proxy forwarding header;
  else 403 `local_only`. Cross-site writes cannot happen either: bodies must be
  `application/json` (a preflight nobody answers - no CORS anywhere). The
  frontend draws no sign-in UI at all.
- **iam**: the SDK does code flow + PKCE; tokens in localStorage
  (`anotoki-auth:piano-academy`), shared by all tabs, refresh serialised across
  tabs. Redirect URI `<origin>/auth/callback` (a route), post-logout `<origin>/`;
  the IAM registers `http://localhost:4500` for development; the live site's
  client in the IAM needs `https://piano.anotoki.eu` the same way. `AuthService.init()` runs in the app
  initializer, before the router's first navigation, so the SDK's
  `history.replaceState(returnTo)` is what the router reads. The backend
  verifies every access token (RS256, typ at+jwt, kid in the JWKS cached in
  cache_dir for an hour, iss, aud piano-academy, exp/nbf/iat 60 s leeway, sub =
  user id). Access policy is the IAM's (`members`). The backend checks one
  role: `ADMIN` of this application, for the owner's translation routes
  (`requestUser()` -> `owner`, `requireOwner()`; in mode `none` the person on
  this computer is the owner). The frontend's `isOwner` only hides the owner
  link and pages; the server refuses anyway (403 `owner_only`).
- **Language at sign-in**: the authorize request carries `uiLocales` (the
  page's language), and a token's `locale` claim is a choice the learner did
  not make here - it counts after `?lang=` and the chooser, before the browser.
- **Header** (iam only): username, "My account" (new tab), "Sign out"; signed
  out mid-session: "Signed out" + "Sign in", the banner "You are signed out, so
  your progress is not saved.", "Not saved yet" while anything waits (all of
  them keys). The sign-in card words a failure from its code
  (`core/i18n/error-text.ts`): `access_denied` is `signIn.notCompleted`,
  anything else `signIn.failed` with the code; the IAM's and the SDK's own
  English sentences are never shown.
- **Hosting** (Apache + PHP + PostgreSQL, FTP only): `php tools/build.php` ->
  upload `dist/` into the web root -> `/setup.php` with the token. Web MIDI and
  the SDK's Web Crypto need HTTPS there. A later migration: delete
  `storage/installed.lock`, run `/setup.php` again (idempotent) at once - until
  then every visitor sees "not set up yet". Before a release with strings, the
  owner exports both languages in the browser (DEV.md, "Releasing the app's
  words").

## The app's words (English and Slovak)

The owner's decisions: the app's own words live in the database and are
edited in the browser; English and Slovak, English the fallback; **Slovak is
informal ("ty")**; **a missing string shows its key on the page** (on purpose:
the owner sees which one is missing); learning material and fixed terms are
not translated; the owner's two pages are English.

- **Model**: a key (`translation_keys`, with a description for the
  translator) and one string per language (`translations`). Keys are the
  code's: only a migration writes a key and its first strings; the browser
  only rewords a string. Every insert is `ON CONFLICT DO NOTHING`, so what the
  owner reworded survives every later migration. A string is text, never HTML
  (the scan fails a template that gives `innerHTML` a translated string); a
  value goes in as a `{placeholder}`, and a translation may use only the
  placeholders its English has. Plurals are a family `key.one` / `.few` /
  `.other` (English `.few` = `.other`), asked for with `translatePlural` /
  `plural()`.
- **Asking for a word**: `'key' | translate`, `'key' | translatePlural: count`,
  `i18n.t()` inside a `computed()` / `effect()` so a language switch re-words
  it. A key put together at run time comes from a prefix declared in
  `core/i18n/dynamic-keys.ts` with every tail written out; never from the
  address, a stored session or anything typed.
- **State holds keys, never sentences**: a step's `Feedback` is
  `{key, params, kind}`, the player's callback is `feedback(key, params?, kind?)`,
  `MidiService` keeps a problem kind, `AuthService.displayName` a name or null.
  The page words them, and words them again when the language changes in the
  middle of a step. Nothing worded is awaited in a MIDI handler.
- **Not translated**: note names (the English letters C D E F G A B - B in
  Slovak too, never H; a name the code makes comes from
  `TheoryService.midiToName()`), chord letters, "BPM", "4/4", the five song
  titles whole (bracketed parts included), MIDI device names, the browser's
  own error text (shown as a detail, `lang="en"`), product names, the
  changelog's entries, the setup page, the launchers, persisted ids and the
  English `label` / `songTitle` stored with a session.
- **The shell without a bundle**: while there is no bundle at all (not set up,
  backend down, a migration pending) the shell and its cards read their
  English from `core/i18n/kept-english.ts`. A new shell string goes there too,
  letter for letter its English in the migration (a test holds them equal).
- **A new string** is a new migration in 003's layout, with English and
  Slovak (`tests/unit/translations.test.php` reads every migration that
  inserts into `translation_keys` as text: one `INSERT INTO translation_keys`
  block, one `INSERT INTO translations` block per seeded language, a closing
  `DO $$` gate naming exactly its keys; it names only the three tables and
  nothing of 001). Because every insert is `ON CONFLICT DO NOTHING`, an insert
  never rewords a string a database already has: a string reworded after
  release needs an `UPDATE` in the migration (only where the row still holds
  the old text, so the owner's own wording stands), and a key the code stops
  using a `DELETE` (the scan fails on an unused key). 002 and 003 themselves
  only create and insert, and a test holds them to it. Collect a release's
  strings into **one** migration: on the host every migration means a setup
  re-run (DEV.md, "Releasing the app's words"). 003 was generated in one step
  from a reviewed catalogue kept outside the repository; before it is
  released, edit it in place and run `php tests/tools/testdb.php template --fresh`.
- **The scan** (`tools/translation_keys.php`, run by the tests and by
  `php tools/translations.php --status`): every key the frontend asks for is in
  the database and every key in the database is asked for; a family asked for
  as one string (or the other way round) fails; the checkout is CRLF, so the
  scan normalises `\r\n`.

### Slovak glossary - one word each, everywhere

| English | Slovak |
| --- | --- |
| note | nota |
| key (of the piano) | kláves - masculine (modrý kláves, čierne klávesy); never "klávesa" |
| staff | notová osnova |
| melody / song / sheet (music) | melódia / skladba / noty |
| New sheet (Sheet Practice's button and its sentence) | Nová melódia ("nové noty" already means new notes to learn) |
| metronome / click / count-in / tempo | metronóm / klik / odpočítanie / tempo ("along with the click": "spolu s metronómom") |
| octave / chord / bass clef | oktáva / akord / basový kľúč |
| right / left hand | pravá / ľavá ruka |
| Middle C | stredné C |
| path / phase / unit / step | cesta / časť / lekcia / krok |
| the learning path, named outside the path (Sheet Practice, Songs) | cesta v Učení |
| lesson (the page, and the mode in Stats) | lekcia |
| drill | precvičovanie |
| review; due for review | opakovanie; na zopakovanie |
| learning / mastered (note status) | učím sa / zvládnuté |
| round, session | kolo |
| practice run | skúšobné kolo |
| streak | séria dní |
| locked | zamknuté |
| Learn / Note Trainer / Sheet Practice / Songs / Stats | Učenie / Tréning nôt / Hra z nôt / Skladby / Štatistiky |
| Sign in (heading / button) | Prihlásenie / Prihlásiť sa |
| Sign out, My account | Odhlásiť sa, Môj účet |

Slovak rules: a note name, a song title and a device name are never declined -
a `{placeholder}`, after a colon, or alone, never after a preposition; the mode
names are declined ("v Tréningu nôt"). A label under a number is a noun phrase
or "label: {count}". `%` and `ms` with a space ("{accuracy} %"); "{times}-krát".
Nothing gendered about the learner ("prihlásený", "dokončil si" are out). The
en dash and „ “ quotes, never a hyphen as a dash or a straight quote.

## Conventions

- **Frontend**: Angular 21, standalone, zoneless, signals (`signal`, `computed`,
  `input`, `output`, `viewChild`), OnPush, `inject()`. **Every component is three
  files** - `.ts`, `.html`, `.scss` - never an inline template or styles. HttpClient
  for the API (the interceptor adds the token). Colours only from the CSS
  tokens in `styles.scss`, defined for light and dark; everything works at 390 px.
- **Domain logic only in `core/music/`** (theory, srs, songs, path services),
  pure and unit-tested. Views compute grades/updated state with them and save the
  result; the backend just checks the shape. Never copy that logic into a
  component or into PHP.
- **Imperative islands**: VexFlow (`Notation`, via `<app-notation>`'s
  `notation()`), the keyboard (`KeyboardModel`, drawn by `<app-piano-keyboard>`),
  Web MIDI (`PianoMidi`), Web Audio (`Metronome`). The `SequencePlayer` gets its
  collaborators passed in.
- **Teardown**: every component removes its `noteon` listener and clears its
  timers in `DestroyRef.onDestroy`; a player is `destroy()`ed. Lesson steps stop
  listening once they report.
- **Lesson steps report at once, the screen waits.** A step emits
  `done({accuracy, session, delayMs})` the moment the attempt ends; the lesson
  saves immediately and only delays the result screen. Never wrap the report in
  a timeout.
- **Backend**: PHP 8.2, `declare(strict_types=1)`, camelCase functions by area,
  `?` parameters in every query, errors as `ApiError` -> `{error, code}`.
  `setup.php` stays PHP 7.4-parseable. A new session field or mode goes into
  `SESSION_FIELDS` / `SESSION_MODES` (api/store.php) and `SessionInput`.
- **Persistence**: whole documents per person plus one row per session; new
  persisted state is a new field or a new migration, never a file.
- UI text is plain, short and encouraging - the owner is a beginner and a
  non-native English speaker. Every learner-facing word is a key with English
  and informal Slovak (see "The app's words"); the owner pages are English
  literals. A change a learner would notice gets a line in
  `frontend/public/changelog.json`.

## Gotchas already hit (don't rediscover these)

- **`Renderer.Backends.SVG`, not `Renderer.Backend.SVG`** (VexFlow 5; the singular is undefined).
- **Clear a VexFlow surface with `context.clear()`, never by emptying the container**: the Renderer inserts its `<svg>` once; removing it leaves later draws on a detached node.
- **VexFlow 5 options are camelCase**: `new Voice({ numBeats, beatValue })` - the old `num_beats` was silently ignored.
- **Lay each measure out with `formatToStave`**: a fixed justify width ran the first measure's notes (clef + time signature take room) over its barline.
- **VexFlow draws noteheads as `<text>` in its music font**: colour `text` as well as `path` to mark a note, and draw only once the font has loaded - `notationFontsReady()` (awaited by the lazy routes; VexFlow adds its FontFaces to `document.fonts` on import).
- **Cap SM-2's ease factor and interval** (`MIN/MAX_EASE_FACTOR`, `MAX_INTERVAL_HOURS`) - uncapped, a drilled note overflowed Date.
- **One key press is not one review**: 2 learning steps (4 h, 24 h), then only the first pass of a *local* day grows the schedule (`lastGrowthAt`); a miss always lapses. `repairInflatedProgress()` fixes older data at load, in memory (saved with the next save).
- **New-note pacing counts only `learning`**, not `review`, against `maxActiveNew`.
- **Don't `await` saves in a MIDI handler** before advancing: two fast presses were graded against one note. The store chains PUTs.
- **Metronome clicks outlive the view** unless stopped: the player stops it on start/stop/destroy.
- **Drill "no repeats" needs the constructive `spreadOut`**; plain reshuffling failed half the time.
- **Never run on empty state after a failed load**: the whole map is PUT, so one key press would overwrite the real progress. Boot stops with a card instead; the backend refuses empty/non-JSON bodies.
- **Days are local, timestamps UTC**: `localDayKey()` for streaks; never `.slice(0, 10)`.
- **Mastered notes still come back when due** (`isDue()` covers every started status).
- **Tempo tests must hit the clicks**: stamp note i with `window.pianoPlayer.expectedTimes[i]`; a press stamped at Start is count-in noise. The trainer ignores presses in its 700 ms feedback pause.
- **A song must not lock itself mid-play**: a miss can send a note back to `learning`; the song page decides "unlocked" once, on open.
- **PHP's JSON trap: `{}` decodes to `[]`** - bodies are decoded to objects, documents go out as the database's jsonb text; jsonb reorders keys (tests compare with `assert_json_same`). `get_object_vars()` returns int keys for "60".
- **Slim's body parser would decode to arrays** - there is none; `jsonBody()` reads the raw body.
- **`Referrer-Policy: no-referrer` makes a form POST's `Origin` "null"** - setup.php's own form; treat it as "no origin", the nonce decides.
- **The Angular dev proxy adds no forwarding headers**, so auth `none` and the local setup work through `ng serve`; a proxy that does is "not this computer" by design.
- **An SDK change in `localStorage` from the same tab is invisible to its in-memory session** (the `storage` event fires in other tabs only) - reload to make a test's token edit count.
- **Web Crypto (and Web MIDI) need a secure context**: plain http on a non-localhost name has no `crypto.subtle`, so PKCE fails; the live site is HTTPS (browser tests use `--unsafely-treat-insecure-origin-as-secure`).
- **npm 10.9 + vitest peers: "Cannot read properties of null (reading 'edgesOut')"** - `frontend/.npmrc` sets `legacy-peer-deps`.
- **`npm` is a batch file on Windows**: `cmd /c "npm" ...` (as PHP's array proc_open quotes it) loses its folder; `tools/build.php` passes a plain command line there.
- **PHP's built-in server differs by version** for a missing `.php` (8.2: 404, 8.5: the docroot's index.html) - tests assert only what matters.
- **PHP 8.5 deprecates `$http_response_header`** (compile-time): the tests use curl; the SDK and `start.sh`'s PHP fallback read the stream's meta data.
- **`getopt()` stops at the first non-option argument** - `tests/tools/testenv.php` parses its arguments by hand.
- **Stop the whole process tree** of any server (`taskkill /T`), or the next start finds the port taken.
- **Apache under CGI/FastCGI drops `Authorization`**: both `CGIPassAuth On` and `SetEnvIf Authorization` in the upload's `.htaccess`; when the PSR-7 header is empty, `requestUserId()` falls back to the SDK's `anotoki_iam_authorization_header()` (which also reads `REDIRECT_HTTP_AUTHORIZATION`).
- **Another person signing in in another tab** would have let this tab save as them: `ApiService` refuses calls whose `userKey()` differs from the page's owner, and `BootService` reloads the page.
- **Zoneless change detection is scheduled**: after a click, wait for the DOM (`waitForFunction`), don't read it synchronously.
- **A zoneless OnPush `<dialog>` opens before its words are drawn**: the confirm dialog set its question and called `showModal()` at once, and opened empty (or with the last question). `ask()` calls `ChangeDetectorRef.detectChanges()` before `showModal()`.
- **jsdom has no `showModal()`**: a spec of a page that opens the confirm dialog calls `provideTestDialog()` (`core/testing/test-dialog.ts`) in `beforeAll`.
- **Headless Chromium asks `beforeunload` only after a real press** (`Input.dispatchMouseEvent`); values set by script alone give no question.
- **A component's styles have a budget** (`angular.json`: a warning over 6 kB, an error over 12 kB); the owner pages `@use` the shared `pages/owner/_owner.scss` and keep only their own rules in their files.
- **The server's sentence is shown only on the owner pages** (`owner-error.ts`); a learner's page words what happened from its own keys.
- **The MIDI notice** words the problem's kind in the page's language and adds the browser's own reason after a colon, as it is, `lang="en"` - in Slovak too.
- **A spec's stand-in for `<app-notation>`** must provide `NotationComponent` by `useExisting`, or the page's `viewChild(NotationComponent)` finds nothing (`steps.spec.ts`, `trainer-page.component.spec.ts`).

## Known issues (not fixed yet)

- **Tempo mode assumes one note per click**: windows come from the beat index, not `note.beat` / `durationBeats`. Rhythm (phase 4) needs per-note times and a click per beat.
- **Unsaved progress/path changes live only while the page is open** (sessions survive in the outbox; a failed progress PUT is retried while the tab lives, `beforeunload` warns in iam mode).
- **The owner's computer and the hosted site keep separate databases**; move data with an export. The same holds for the app's words: each database has its own strings, and the Translations page's export and import (or `tools/translations.php`) are the bridge.

## Tests

- **Backend** (`cd backend && php tests/run.php`; also under PHP 8.2): each file
  its own process and throwaway database; `tests/lib.php` first (it writes a
  `PIANO_TEST_CONFIG` folder with the machine's DB server + a `piano_test_`
  name before the app loads, and refuses anything else).
  - `unit/auth` - loopback, local names, relayed requests, `none` only exactly, `local_user_id`, the cache path, textClip.
  - `unit/config` - not set up without/with bad files, no committed stand-in, the test folder only for piano_test_, owner-only writes.
  - `unit/migrations` - an empty database gets every migration; the older `migrations(name)` table is read and renamed in place; the SQL splitter.
  - `unit/transfer` - the one-time import (fixture and a copy of the real server/data), export/import, reassign, `tools/progress.php`.
  - `api/api` - auth `none` through the router: foreign Host / relayed refused, the answers, `{}` round trips, shape checks (400/413/415), session whitelist and bounds, Idempotency-Key, order, 404/405, no CORS, the built app's files and SPA fallback, not set up, a database behind the code.
  - `api/auth` - auth `iam` with tests-signed tokens: 401s, every bad token, users row, two people isolated, the JWKS downloaded and cached (stand-in IAM).
  - `api/setup` - the local setup: nonce, Origin, Test connection (DB and IAM), Save, re-run, no secrets shown, a relayed or foreign-named request is a real host.
  - `api/hosting` - `tools/build.php` (exact contents, refusals), the host setup (token, tests, install, lock, self-delete, re-upload refused), the export upload, the front controller.
  - `unit/translations` - the seeded languages and keys, English and Slovak for every key, placeholders, plural families, the migrations of this work touching only their three tables and nobody's progress, 002 refusing a non-UTF8 database, every seeded string passing a save's checks, a string migration's gate, the key scan (used and unused keys, families, dynamic keys, the kept English, `innerHTML`).
  - `api/translations` - the bundle in both modes (ETag/304, unknown codes), the owner's routes for ADMIN only (hosted) and for this computer only (`none`), languages, saves checked whole, export/import, the CLI, concurrent deletes and saves, `updated_by` following a person, "not set up" with only 001 applied.
- **Frontend** (`cd frontend && npm test`, Vitest + jsdom): theory, srs, path (incl. songs vs pools), songs, the API outbox (HttpTestingController), the store's save chain and retries, boot states, the sign-in card (failure worded from its code), stats, the sequence player (wait and tempo, keys handed to `feedback`); and with the words: `TranslationService`, the pipes, `path-words`, the title strategy, the interceptor, the language chooser, the shell with no bundle (no text of a key's shape), `MidiService`, the home, lesson, steps and trainer pages (a language switch mid-step re-words the feedback), the owner pages, guards, grid, drafts and confirm dialog. A spec gives its strings with `provideTestTranslations()` (`core/testing/`).
- **Browser**: no committed check; scratch scripts with `playwright-core` + Edge, outside the repository (never installed into `frontend/`), on throwaway servers (8390-8399) and `piano_test_` databases.
  - At the rebuild: every view in `none` mode (a lesson's meet/drill/read/in time, a trainer round, sheet practice, songs, stats, changelog, light/dark/390 px, no overflow, no console errors) and against the stand-in IAM (sign-in, saves, IAM outage -> "Not saved yet" + outbox, beforeunload, signed out mid-session, another user in another tab, sign-out, access denied/cancelled); the setup page locally and as a host (via `--host-resolver-rules`).
  - With the translation work (a flow of about 540 checks, kept in that work's scratchpad, not committed): English, then Slovak through the chooser and `?lang=`, `<html lang>`, no text of a key's shape and nothing left in English, a lesson's steps with their feedback in Slovak and re-worded on a language switch mid-step, practice pages, Stats with a stored English label; the owner pages (a string changed and seen after a reload, a plural family, export and import, a language added, hidden and deleted, leaving with unsaved cells asks); the stand-in IAM (the sign-in card in Slovak before signing in, `ui_locales` in the authorize request, a token's `locale` with nothing stored, ADMIN sees the owner link, a MEMBER does not and gets 403 `owner_only`, a refused sign-in worded from its code); every boot state (not set up, a pending migration, load error, sign in, ready) with and without a bundle; 390 px and 1100 px, light and dark: no sideways scroll, the chooser's menu inside the screen, the nav in at most three rows.

## Testing without real MIDI hardware

```js
window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', {
  detail: { midi: 60, velocity: 100, timestamp: performance.now() },
}));
```

`window.pianoMIDI` is the live `PianoMidi`; every practice view listens to it.
Read the staff with `.vf-stavenote[data-midi]` in DOM order, e.g.
`#dr-notation .vf-stavenote[data-midi]` (drill), `#tr-notation` (trainer),
`#sh-notation` (sheet), `#sg-notation` (song), `app-sequence-step` (read,
in time, song steps), `#mt-notation` (meet).

A throwaway app (never `piano_academy`):

```bash
cd backend
php tests/tools/testdb.php template
php tests/tools/testenv.php storage/manual --db=piano_test_manual --auth=none
PIANO_TEST_CONFIG=storage/manual php -S 127.0.0.1:8399 router.php
# afterwards: php tests/tools/testdb.php drop piano_test_manual
```

With sign-in, the stand-in IAM: make a key
(`php -r "require 'api/anotoki_iam.php'; echo json_encode(anotoki_iam_test_keypair('k'));" > <dir>/key.json`),
run `FAKE_IAM_DIR=<dir> FAKE_IAM_ISSUER=http://127.0.0.1:8397 php -S 127.0.0.1:8397 tests/tools/fake-iam.php`,
and `testenv.php ... --auth=iam --issuer=http://127.0.0.1:8397`. `POST /_test/state`
sets who signs in (`user`: `{id, username, roles, locale?}` - `roles` with
`ADMIN` makes the owner, `locale` is the token's claim, `en` by default), the
token lifetime (`ttl`) and failures (`down`, `refuse`, `deny` +
`deny_description` - which the app never shows: it words `access_denied` itself).

`navigator.requestMIDIAccess()` is refused in headless browsers - the app shows
"The browser did not allow MIDI: <the browser's reason>" (the problem kind
`refused`, worded in the page's language; the reason in English) in the status
pill instead of crashing, which is what to check.

### Review checklist (every change)

- Every listener and timer a component adds is removed in `DestroyRef.onDestroy`; players destroyed.
- MIDI handlers advance state synchronously; saves are fire-and-forget.
- No logic copied out of `core/music/`; no persisted unit/step id renamed.
- Components are three files; colours from tokens; works at 390 px, light and dark.
- Every new query on a person's data is scoped to the request's user id; nothing takes a user id from a body or URL. The site's strings are the exception: public to read, owner-only to write (`requireOwner()`).
- A new session field or mode is in `SESSION_FIELDS` / `SESSION_MODES` and `SessionInput`.
- A schema change is a new migration; `setup.php` still parses under PHP 7.4.
- Anything "per day" uses local dates.
- UI text short and plain; auth mode `none` shows no sign-in UI; a learner-visible change has a changelog line.
- A learner-facing word is a key with English and informal Slovak ("ty") in a migration; state holds keys, never sentences.
- Nothing worded is awaited in a MIDI handler.
- Note names, song titles and device names are never translated.
- A new shell string is also in `kept-english.ts`; a key put together at run time has its prefix and tails in `dynamic-keys.ts`.
- `php tests/run.php` (8.5 and 8.2), `npm test`, `npm run build` pass; interactive changes checked in a browser on a throwaway database; `git status` shows no change under `server/data/`.

## Extending the curriculum

Currently 15 white keys, C3-C5 (`TheoryService.curriculum`); the path uses the
8 right-hand ones. Sequences are treble clef only (`Notation.renderSequence`) -
the blocker for phase 2.

1. **Bass clef in sheets/songs**: `clefForMidi` exists (used by single notes);
   `renderSequence` needs a clef option, and Sheet Practice stops filtering to `midi >= 60`.
2. **Sharps/flats**: add them to the curriculum; `midiToVexKey` / `midiToName`
   spell sharps and `buildNote` adds the `Accidental`. Flats are not
   distinguished yet (a key-signature-aware speller later).
3. **A wider range**: the curriculum and each phase's `keyboard` range.
4. **More songs**: `SongsService.songs`, named from a unit; quarter notes
   (`seq()`) until rhythm arrives in the notation (phase 4).
