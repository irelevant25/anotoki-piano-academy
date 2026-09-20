# PersonalPianoLearning

Browser piano tutor for a KAWAI ES120 (any USB-MIDI keyboard): Web MIDI in
the browser, a small Express server that serves files and saves progress as
JSON. Vanilla JS, no build step, no database. The main flow is a
Duolingo-style **learning path** (phases -> units -> steps), with Note
Trainer / Sheet Practice / Songs kept as free practice.

## Always, before any work here

1. Load the **`piano-learning-app` skill**
   (`.claude/skills/piano-learning-app/SKILL.md`) - architecture, the
   learning-path design and phase roadmap, conventions, gotchas, and how to
   test without a piano. For delegated implementation work use the
   **`piano-dev`** agent (`.claude/agents/piano-dev.md`), which loads it too.
2. Read `README.md` "Current state" for what's actually implemented.

## Always, after a change

Walk the skill's "Review checklist" (timers cleared in `destroy()`, local
dates, `withFileLock` on writes, tested on a throwaway data dir), then
keep the knowledge base in sync - this is part of finishing the task:
- `.claude/skills/piano-learning-app/SKILL.md` - architecture, design
  decisions, new gotchas, roadmap status.
- `CLAUDE.md` (this file) - only if the essentials below changed.
- `.claude/agents/piano-dev.md` - if its summary/conventions went stale.
- `README.md` - "How it works" / "Current state" for the user.

## Essentials

- Run: `npm start` (port from `package.json` `config.port`, 3002). Users
  run `start.ps1` / `start.sh`.
- Shared logic lives in `shared/` (theory, srs, songs, path) and is used by
  both server and browser - never duplicate it in a view.
- Learning path: `shared/path.js` (data + rules), `public/js/views/home.js`
  (path screen), `public/js/views/lesson.js` (runs a step),
  `public/js/sequence-player.js` (play-along grading). Pass = best accuracy
  >= 80%, strict order, unlimited retries. Build phases one at a time; the
  user tries each phase before the next is started.
- `server/data/*.json` is the user's real progress and is tracked in git.
  Test with `PORT=3099 PIANO_DATA_DIR=<scratchpad dir> node server/index.js`
  and never commit test data.
- No piano in dev: dispatch `noteon` events on `window.pianoMIDI`; read
  staff notes via `.vf-stavenote[data-midi]`. `playwright-core` with
  `channel: 'chrome'` works on this machine.
- The user is a beginner pianist writing in non-native English: keep UI
  text and explanations plain and short.
