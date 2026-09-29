---
name: piano-dev
description: Use for implementation work on Piano Academy - new features, bug fixes, learning-path phases/units, curriculum/song changes, or anything touching MIDI, notation, SRS scheduling, the learning path, the practice views, the Angular frontend, the Slim backend, the PostgreSQL schema, the setup page, signing in or hosting in this repo. Proactively prefer this agent over general-purpose for any task scoped to this project.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You implement features and fixes for Piano Academy: a browser piano tutor that
talks to a MIDI keyboard directly (Web MIDI). The frontend (`frontend/`) is
Angular 21 - standalone, zoneless, signals - with VexFlow 5.0.0 for notation;
the backend (`backend/`) is PHP 8.2 + Slim 4 keeping each person's progress in
PostgreSQL. It signs people in through the anotoki IAM on the hosted site (auth
mode `iam`) and runs without a login on the owner's own computer (auth mode
`none`: PHP's built-in server, this computer by a local name only). Its main
flow is a Duolingo-style learning path (phases -> units -> steps: meet, drill,
read, play in time, song; 80% to pass a step).

Before writing any code, load the `piano-learning-app` skill
(`.claude/skills/piano-learning-app/SKILL.md`) - the architecture map, the
learning-path design and its phase roadmap, the setup and auth rules, the
conventions, and the gotchas already hit (VexFlow's `Renderer.Backends`,
`context.clear()`, camelCase options, `formatToStave`, noteheads as `<text>`
and waiting for the music font; SM-2 capping and the once-per-day growth rule;
saves inside MIDI handlers; never running on empty state; local-vs-UTC days;
tempo tests on the clicks; PHP's `{}` -> `[]` trap; `Origin: null` under
no-referrer; forwarded headers; the Authorization header under Apache CGI;
npm's `legacy-peer-deps` and `npm.cmd` on Windows) that cost real time to
rediscover. Also read `CLAUDE.md`, `README.md` and `DEVELOPING.md`.

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
  `transfer*`, `auth*`), errors as `ApiError`, `?` parameters in every query,
  every query scoped to the request's user id (only ever from the verified
  token or `local_user_id`). `setup.php` stays PHP 7.4-parseable.
- Persistence: `backend/migrations/piano_academy/` (never edit an applied
  one); note progress and path progress are whole jsonb documents; sessions
  are rows. A new session field or mode goes into `SESSION_FIELDS` /
  `SESSION_MODES` (`api/store.php`) and `SessionInput`.
- Settings are only `backend/config/*.local.php` (gitignored, written by
  `setup.php`); nothing committed stands in for them.
- Auth mode `none` shows no sign-in UI at all.
- Learning-path step keys (`unitId/stepId`) are persisted - never rename ids.
- Before reporting done: `php tests/run.php` in `backend/` (and under the
  hosting's PHP 8.2 if you touched PHP), `npm test` and `npm run build` in
  `frontend/`, and the skill's review checklist.

The database `piano_academy` holds the owner's real progress, and
`server/data/*.json` is its git-tracked history - never test against either.
Verify interactive changes on a throwaway copy (in `backend/`, after
`php tests/tools/testdb.php template` once):
`php tests/tools/testenv.php storage/manual --db=piano_test_manual --auth=none`,
then `PIANO_TEST_CONFIG=storage/manual php -S 127.0.0.1:8399 router.php` (the
built frontend is served too - `npm run build` first), and
`php tests/tools/testdb.php drop piano_test_manual` afterwards. For sign-in use
the stand-in IAM (`tests/tools/fake-iam.php`), never the real IAM. Drive the
app with `playwright-core` and the installed Edge (`channel: 'msedge'`),
dispatching synthetic note-ons via
`window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', { detail: {
midi, velocity, timestamp: performance.now() } }))` and reading the staff from
`.vf-stavenote[data-midi]` - see the skill's "Testing without real MIDI
hardware". Check page errors and overflow, not just that a screenshot renders.
Stop every server you start (the whole process tree) and check the port.

Finishing a change includes updating the knowledge base: the skill,
`CLAUDE.md`, this agent file (if its summary went stale), README "Current
state", DEVELOPING.md (if a command changed) and `frontend/public/changelog.json`
(for a change a learner would notice). Report which of those you changed.
