# Piano Learning

An interactive piano tutor for learning to read and play notes on a real
piano — built around a **KAWAI ES120** (or any class-compliant USB-MIDI
keyboard) plugged straight into your PC. The browser talks to the piano
directly; there's a small Node server for the app itself and for saving
your progress. No cloud, no database — everything is stored locally as
JSON files on your machine.

## How to run

1. Download the project (ZIP via GitHub's "Code → Download ZIP", or
   `git clone` if you're developing) and extract/open it.
2. Plug your piano into the PC via USB.
3. Run the launcher:
   - Windows: double-click `start.ps1` (or run `.\start.ps1` in PowerShell)
   - macOS/Linux: `./start.sh`

   It installs everything it needs on first run and then opens the app in
   your browser automatically. Press `Ctrl+C` in that terminal to stop it.
4. Use **Chrome or Edge** (required — see [Browser support](#browser-support)).
5. In the header, pick your piano from the device dropdown and click
   **Connect**.

## How it works

- **MIDI connection is direct and local.** The frontend uses the
  browser's [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
  to read note-on/note-off events straight from the piano — no backend,
  no driver installation beyond your OS's standard USB-MIDI support.
  This is also why the project doesn't need .NET or any native MIDI
  library: the browser already exposes everything required.
- **Learn (the learning path)** is the main way to use the app — like
  Duolingo, but for piano. The path is split into units, and every unit
  goes through the same steps:
  1. **Meet** — the new notes are shown on the staff and on the keyboard;
     play each one a few times.
  2. **Drill** — flashcards: read a note on the staff and play it. New
     notes are mixed with the ones you already know.
  3. **Read** — play a short melody made from your notes. No metronome;
     the app waits for each note.
  4. **In time** — play a new melody along with a metronome. The music
     moves by itself, one note on every click: play each note on its click.
     A note you miss is marked wrong and the music keeps going.
  5. **Song** — play a real song that uses exactly those notes.

  You need **80%** on a step to unlock the next one, and you can retry as
  often as you like. Press **Continue** on the Learn page to pick up where
  you left off.
- **The path is planned in phases:** right hand → left hand → both hands →
  left-hand chords → right-hand chords → melody with chords. Phase 1
  (right hand) is playable now; the others are shown as "coming soon".
- **Free practice** is still there for practicing outside the path:
  - **Note Trainer** teaches individual notes with an adaptive schedule —
    the same idea as spaced-repetition language apps (Anki, etc.): notes
    you nail repeatedly get spaced further apart; notes you miss come back
    sooner. The Learn page tells you when notes are due for review.
  - **Sheet Practice** generates a short sight-reading exercise from the
    notes you know and grades pitch and timing against a metronome.
  - **Songs** lists all songs; each unlocks once you know every note it uses.
- Every mode feeds the same per-note progress, so practicing anywhere
  helps everywhere.
- **Stats** shows a keyboard heatmap of your mastery per note, overall
  accuracy, day streak, minutes practiced, and your session history.

### Data & privacy

All practice history lives in `server/data/` — `progress.json` (progress
per note), `sessions.json` (session log) and `path.json` (learning-path
steps you've passed) — and is never sent anywhere except your own local
server. To reset your progress entirely, stop the server and delete those
three files.

## Current state

Implemented and working end-to-end (verified with a scripted browser run
simulating MIDI input — see the project skill for how, since there's no
real piano attached in a dev sandbox):

- MIDI connect/disconnect UI, remembers your last device, shows "not
  connected" again when the piano is unplugged and reconnects when it's back.
- **Learning path, phase 1 (right hand):** 5 units — C D E (Hot Cross
  Buns), G (Mary Had a Little Lamb), F (Ode to Joy), A (Twinkle Twinkle),
  B and high C (Joy to the World). Meet / Drill / Read / In time / Song
  steps, 80% pass rule, progress saved per step with best score.
- Phases 2–6 (left hand, both hands, chords) are listed on the path as
  "coming soon".
- Note Trainer: adaptive note introduction + SM-2-style spaced repetition,
  round-based practice with live accuracy, session logging.
- Sheet Practice: generated sight-reading from known notes, metronome
  count-in, per-note pitch + timing grading. Tempo play works like a rhythm
  game (same in lessons and Songs): each key press is checked against the
  note of the nearest click, missed notes are marked wrong, and the music
  never waits. Keys pressed during the count-in are ignored.
- Songs: 5 songs, auto-unlock, adjustable tempo, same grading as Sheet
  Practice.
- Review: a note's review time grows at most once per day, however often
  you play it that day, so "mastered" takes several days of practice.
  Mastered notes also come back for review when their time is up.
- If your saved progress can't be loaded, the app stops with a message
  instead of starting empty, so it can never overwrite your progress.
- Stats: keyboard mastery heatmap, accuracy, streak, minutes practiced,
  session history table (including lesson steps).

Curriculum currently covers **15 white keys, C3–C5**; the learning path
uses the 8 right-hand notes so far. Sheet music is treble-clef only,
which is why the left-hand phase comes next — see the roadmap in the
project skill (`.claude/skills/piano-learning-app/SKILL.md`).

## Browser support

Requires **Chrome or Edge** (or another Chromium-based browser) —
Firefox and Safari don't implement the Web MIDI API. The app detects this
and shows a clear message rather than failing silently.

## Project structure

```
shared/         Note-name/MIDI conversions, SRS scheduler, song library,
                learning path. Used identically by the server and the browser.
server/         Express app: static file serving, JSON-file persistence
                under server/data/ (no database).
public/         Frontend: vanilla JS/CSS, no build step, no framework.
  js/midi.js             Web MIDI wrapper
  js/keyboard.js         On-screen piano keyboard (SVG)
  js/notation.js         Staff notation rendering (VexFlow)
  js/metronome.js        Click track + timing reference
  js/sequence-player.js  Play-along grading used by lessons, sheets, songs
  js/views/              One module per screen (home = learning path,
                         lesson, trainer, sheet, songs, stats)
```

For architecture details, conventions, and known gotchas when making
changes here, see `CLAUDE.md` and the project skill
`.claude/skills/piano-learning-app/SKILL.md` — it's written to be loaded
before any development work on this repo (there's also a matching
`piano-dev` subagent preconfigured to load it automatically).
