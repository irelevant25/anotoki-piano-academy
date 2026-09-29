---
name: piano-learning-app
description: Use for any development work on this repo (Piano Academy) - new features, bug fixes, learning-path/curriculum/song changes, or anything touching MIDI, notation, SRS scheduling, the learning path, the practice views, the Slim backend, the database, the setup page, signing in or hosting. Load this before making changes so conventions and known gotchas aren't rediscovered from scratch.
---

# Piano Academy - project skill

A piano tutor for a KAWAI ES120 (or any class-compliant USB-MIDI keyboard).
The browser talks to the piano directly (Web MIDI); an Angular 21 frontend
(`frontend/`) does all the music logic; a PHP 8.2 + Slim 4 backend (`backend/`)
keeps each person's progress in PostgreSQL. Two auth modes: `iam` (sign-in
through the anotoki IAM - the hosted site piano.anotoki.eu) and `none` (the
owner's own computer, no login). Read [README.md](../../../README.md) for the
user's picture and [DEV.md](../../../DEV.md) for the commands -
this file is the implementer's supplement: architecture, design, conventions,
and the gotchas that cost time to rediscover.

**Keep this file current.** After any change, update this skill, the root
`CLAUDE.md`, `.claude/agents/piano-dev.md`, README "Current state" and the
in-app changelog where they are affected - the owner wants the knowledge base
maintained with every change.

## Architecture

```
backend/                        PHP 8.2+, Slim 4 (vendor/ committed: the host has no composer)
  api/index.php                  front controller: buildPianoApp() (routes + middleware), run unless PIANO_NO_RUN.
                                 Middleware, outermost first: securityHeaders -> the error handler
                                 (ApiError / 404 / 405+Allow / NotSetUp / PDOException=503 [db] / else 500 [server])
                                 -> setupGate (503 not_set_up without the settings) -> routing.
  api/.htaccess                  Apache: everything under /api/ to index.php; no other file runs.
  api/bootstrap.php              what every entry point loads: PHP >= 8.2, UTC, display_errors off for the web,
                                 warnings -> ErrorException (deprecations only logged), then every api/*.php.
  api/routes/public.php          GET /api/health ({ok, auth} + database and pending migrations for loopback),
                                 GET /api/auth/config ({mode:'none'} | {mode:'iam', issuer, clientId}).
  api/routes/progress.php        GET /api/state, PUT /api/progress (204), PUT /api/path (204),
                                 POST /api/sessions (201; 200 on an Idempotency-Key replay). All ->add(requireUser());
                                 /api/state also requireCurrentSchema() (503 not_set_up when migrations are pending).
  api/meddleware/                security.php (nosniff, DENY, CSP none, no-store; NO CORS on purpose),
                                 setup.php (setupGate, requireCurrentSchema), auth.php (requireUser -> 'userId').
  api/helpers.php                ApiError(status, errorCode, message, headers); respondJson/respondJsonText/respondError
                                 ({error, code}); jsonBody() (JSON only: 415 otherwise, 413 over 256 kB, null when
                                 empty, decoded to stdClass so {} stays {}); isoNow(), textClip().
  api/auth.php                   authMode() ('none' only if exactly 'none'), authLocalUserId(), authIamConfig(),
                                 authPublicConfig(), isLoopback(), isLocalHostName(), wasForwarded(),
                                 noLoginAllowed(sapi, remote, host, forwarded), requestUserId() (none: local_user_id,
                                 only cli-server + loopback + local Host + not relayed -> else 403 local_only;
                                 iam: Bearer -> vendored verifier -> sub, 401 sign_in_required / invalid_token with the
                                 reason only in the log "[auth] token refused: ..."), usersSeen().
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
  setup.php                      the web setup (see "Setup and settings"). Parseable by PHP 7.4.
  router.php                     PHP's built-in server: /api -> api/index.php, /setup.php, else the built
                                 frontend (PIANO_FRONTEND_DIST or ../frontend/dist/piano-academy/browser) with the SPA
                                 fallback; never a .php file or a dot-file; files with an extension 404 when missing.
  migration.php                  CLI migrations (--status, --dry-run).
  tools/progress.php             CLI --export / --import / --owner.
  tools/build.php                the upload: runs the frontend build, then dist/ = app + .htaccess + setup.php + api/
                                 + config/config.php + migrations/ + vendor/ + storage/ (deny .htaccess everywhere
                                 PHP-only) + 3rdpartylicenses.txt. Refuses a non-build or in-repo --out.
  tests/                         run.php, lib.php, unit/*, api/*; tools/testdb.php, testenv.php, fake-iam.php.
  storage/                       gitignored: cache/, backups/ (a pg_dump of the owner's database, 2026-09-28).

frontend/                        Angular 21, standalone + zoneless + signals, OnPush, three files per component
  src/app/app.config.ts          zoneless, router (component input binding, scroll to top), HttpClient (fetch +
                                 authInterceptor), provideAppInitializer: ThemeService, changelog load, BootService.start().
  src/app/app.routes.ts          '' home, lesson/:unitId/:stepId, trainer, sheet, songs, songs/:songId, stats,
                                 auth/callback. Pages with notation are lazy and wait for VexFlow's fonts (withNotation).
  src/app/app.component.*        the frame: header (MIDI panel, account panel), nav (inert until ready), signed-out
                                 banner, the boot card or <router-outlet>, footer (version -> changelog, theme).
  core/auth/                     anotoki-auth.mjs + .d.ts (the IAM's browser SDK v1.1.1, copied unchanged from
                                 ../anotoki-iam/sdk/js/), auth.service.ts (init: /api/auth/config then createAuth +
                                 init(); signals mode/user/signedIn; userKey(); describeSignInFailure()),
                                 auth.interceptor.ts (bearer on /api/*, one retry with a fresh token after a 401).
  core/api/api.service.ts        every call; setDataOwner() (calls refuse any other user than the page loaded);
                                 the session outbox (localStorage piano-learning:unsaved-sessions:<user>,
                                 Idempotency-Key, kept on any failure but 400/413/415/422, unsavedSessions signal).
  core/state/progress-store.service.ts  the state signal; saveProgress/savePathProgress (chained, latest state sent,
                                 a copy kept), failed flags, RETRY_MS 15 s, 'online', settle() before sign-out.
  core/state/boot.service.ts     status loading | not-set-up | sign-in | load-error | ready; never runs on empty
                                 state; reloads when another user signs in in another tab; beforeunload (iam only).
  core/music/                    theory, srs, songs, path services (+ music.types.ts): ALL the domain logic.
  core/midi/midi.service.ts      PianoMidi (EventTarget: noteon/noteoff/connected/disconnected/devicechange;
                                 window.pianoMIDI) + MidiService (status, devices, remembered device, reconnect).
  core/notation/notation.ts      VexFlow wrapper (renderSingleNote, renderSequence); notationFontsReady().
  core/player/sequence-player.ts the one play-along/grading loop (wait / tempo); window.pianoPlayer.
  core/audio/metronome.ts        click track + performance.now() timing reference.
  core/theme/, core/changelog/   light/dark/auto (public/theme-boot.js before paint); public/changelog.json.
  ui/                            piano-keyboard (+ KeyboardModel), notation, midi-panel, account-panel,
                                 theme-toggle, changelog-dialog.
  boot/                          sign-in-card, not-set-up, load-error.
  pages/                         home (the path), lesson (+ steps/meet, drill, sequence), trainer, sheet,
                                 songs (+ song-player), stats, auth-callback.

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
  - meet: each new note on the staff + blue key + NOTE_HINTS; play it 3x. Not graded (100), no SRS, no session.
  - drill: 10 flashcards, staff only, ~40% new notes, the rest older notes of the phase by due date, never the same note twice in a row. Updates SRS.
  - read: 8-note melody (`generateMelody`: stepwise, home note at both ends, every new note), SequencePlayer 'wait'.
  - tempo: a fresh melody, SequencePlayer 'tempo', 50-80 BPM (default 60).
  - song: the unit's song at 60/80/100% (default 80%). A no-clock practice run is allowed and does NOT count.
- **Pass rule:** best accuracy >= `PASS_ACCURACY` (80); strictly in order; unlimited retries; a pass stays.
- **Note pool** of a unit = the new notes of its phase's units up to it (`notePoolForUnit`). Songs use only pool notes and every new note of their unit - `path.service.spec.ts` asserts it.
- **Persistence:** `{steps: {"rh-2/drill": {attempts, lastAccuracy, bestAccuracy, passedAt, updatedAt}}}`. Step keys `unitId/stepId` are saved - never rename a unit or step id.
- **Sessions** from lessons: `mode: 'lesson'`, `label` ("C, D, E · Drill"), `unitId`, `stepId`.
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
  user id). Access policy is the IAM's (`members`); the backend checks no roles.
- **Header** (iam only): username, "My account" (new tab), "Sign out"; signed
  out mid-session: "Signed out" + "Sign in", the banner "You are signed out, so
  your progress is not saved.", "Not saved yet" while anything waits. A refused
  sign-in shows the IAM's own `error_description` (access_denied) on the card.
- **Hosting** (Apache + PHP + PostgreSQL, FTP only): `php tools/build.php` ->
  upload `dist/` into the web root -> `/setup.php` with the token. Web MIDI and
  the SDK's Web Crypto need HTTPS there. A later migration: delete
  `storage/installed.lock`, run `/setup.php` again (idempotent).

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
  non-native English speaker. A change a learner would notice gets a line in
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

## Known issues (not fixed yet)

- **Tempo mode assumes one note per click**: windows come from the beat index, not `note.beat` / `durationBeats`. Rhythm (phase 4) needs per-note times and a click per beat.
- **Unsaved progress/path changes live only while the page is open** (sessions survive in the outbox; a failed progress PUT is retried while the tab lives, `beforeunload` warns in iam mode).
- **The owner's computer and the hosted site keep separate databases**; move data with an export.

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
- **Frontend** (`cd frontend && npm test`, Vitest + jsdom): theory, srs, path (incl. songs vs pools), songs, the API outbox (HttpTestingController), the store's save chain and retries, boot states, sign-in failure text, stats, the sequence player (wait and tempo).
- **Browser** (scratch scripts, `playwright-core` + Edge): every view in `none` mode (a lesson's meet/drill/read/in time, a trainer round, sheet practice, songs, stats, changelog, light/dark/390 px, no overflow, no console errors) and against the stand-in IAM (sign-in, saves, IAM outage -> "Not saved yet" + outbox, beforeunload, signed out mid-session, another user in another tab, sign-out, access denied/cancelled); the setup page locally and as a host (via `--host-resolver-rules`).

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
sets who signs in (`user`), the token lifetime (`ttl`) and failures (`down`,
`refuse`, `deny` + `deny_description`).

`navigator.requestMIDIAccess()` is refused in headless browsers - the app shows
the reason in the status pill instead of crashing, which is what to check.

### Review checklist (every change)

- Every listener and timer a component adds is removed in `DestroyRef.onDestroy`; players destroyed.
- MIDI handlers advance state synchronously; saves are fire-and-forget.
- No logic copied out of `core/music/`; no persisted unit/step id renamed.
- Components are three files; colours from tokens; works at 390 px, light and dark.
- Every new query is scoped to the request's user id; nothing takes a user id from a body or URL.
- A new session field or mode is in `SESSION_FIELDS` / `SESSION_MODES` and `SessionInput`.
- A schema change is a new migration; `setup.php` still parses under PHP 7.4.
- Anything "per day" uses local dates.
- UI text short and plain; auth mode `none` shows no sign-in UI; a learner-visible change has a changelog line.
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
