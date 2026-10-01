# Piano Academy

An interactive piano tutor for learning to read and play notes on a real
piano - built around a **KAWAI ES120**, and fine with any class-compliant
USB-MIDI keyboard plugged into the computer. The browser talks to the piano
directly (Web MIDI); the app shows the music as staff notation, listens to
what you play, and keeps your progress in a PostgreSQL database.

- **Learn** - a Duolingo-style learning path: phases, units, steps. Every
  unit meets its new notes, drills them as flashcards, reads a short melody,
  plays one in time with a metronome, then plays a real song. 80% on a step
  opens the next one.
- **Free practice** - the **Note Trainer** (an adaptive spaced-repetition
  schedule, like Anki), **Sheet Practice** (sight-reading generated from the
  notes you know) and **Songs**.
- **Stats** - a keyboard heatmap of how well you know each note, your
  accuracy, day streak, minutes practised and recent sessions.

It runs two ways:

- **On your own computer**, started by `start.ps1` (Windows) or `start.sh`
  (macOS, Linux): no sign-in, only this computer can open it, and it keeps
  *your* progress.
- **Hosted** at `https://piano.anotoki.eu`: everybody signs in with their
  anotoki account (the anotoki IAM, `../anotoki-iam`), and each person sees
  only their own progress.

| Part | Folder | Stack |
| --- | --- | --- |
| Backend | `backend/` | PHP 8.2+, Slim 4, PostgreSQL - the API, the setup page, the migrations, the tests |
| Frontend | `frontend/` | Angular 21 (standalone, zoneless, signals), VexFlow 5.0.0, Web MIDI |
| Old progress | `server/data/` | the progress files from before the database - history, read once by the setup |
| Launchers | `start.ps1`, `start.sh` | one command to build the app once and start it on this computer |

On a development machine the frontend runs at `http://localhost:4500`, the
backend at `:8300`, and sign-in goes through the IAM at `http://localhost:4300`.

## Using it on your own computer

You need, once: **PHP 8.2 or newer** with the `pdo_pgsql` and `openssl`
extensions, **PostgreSQL**, and **Node.js 22** (only to build the app the
first time, and again after an update). The launcher looks for PHP in the
usual places and says what to install if something is missing.

1. Plug the piano in (USB).
2. Run `start.ps1` (Windows: right-click, *Run with PowerShell*) or
   `./start.sh`.
3. The first time, the **setup page** opens in your browser: enter your
   PostgreSQL connection, press **Test the database**, leave **No sign-in**
   chosen, and **Save**. It makes the database and brings in your old
   progress from `server/data/`. Then **Open Piano Academy**.
4. Use **Chrome or Edge**. In the header, choose your piano and **Connect**.

From then on the launcher just starts the app at `http://127.0.0.1:8300`.
`Ctrl+C` in its window stops it.

## How it works

- **The piano connects straight to the browser** through the
  [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) -
  no driver beyond the system's own USB-MIDI support, no server in between.
  The app remembers your piano and connects to it again when it comes back.
- **The learning path** is planned in phases: right hand -> left hand -> both
  hands -> left-hand chords -> right-hand chords -> melody with chords. The
  right hand is playable now; the others show as "coming soon".
- **Every mode feeds the same per-note progress**, so practising anywhere
  helps everywhere. A note's review time grows at most once a day, however
  often you play it that day - "mastered" takes a few days of practice.
- **Saving** happens in the background while you play. If a save does not get
  through (no network, the server or the IAM is away), the header says
  **Not saved yet** and the app keeps trying; a finished round waits in the
  browser until the server has it, even across a reload.
- **Signing in** (hosted site only): the app sends you to the anotoki IAM and
  back. The header then shows your name, a link to your IAM account and
  **Sign out**. Only accounts with a role in Piano Academy (given in the IAM
  admin console) can use it. If your sign-in runs out while you practise, the
  app says so and keeps your finished rounds until you sign in again.
- **Light and dark**: the theme button at the bottom follows your computer, or
  keeps the one you choose. The version number beside it shows what is new.
- **English and Slovak**: the language button at the bottom of the page
  chooses; until you choose, the app follows your browser (or, signed in, your
  anotoki account). Note names, song titles and your piano's name stay as they
  are in every language. The app's words live in the database: the owner
  rewords them in the browser, on the **Translations** and **Languages** pages
  (in English; linked at the bottom of the page for the owner only - on your
  own computer that is you, on the hosted site an account with the role ADMIN).

### Data and privacy

Your progress lives in PostgreSQL: the progress per note, the learning-path
steps you have passed, and a log of your practice rounds - all under your IAM
user id (on your own computer, `local_user_id` in the settings: 1 unless you
set another). Nothing is sent anywhere but to the app's own server.

`server/data/` holds the progress from before the app had a database. It stays
in git as history; the setup page brings it into your account once, and never
changes the files. `php tools/progress.php` (in `backend/`) exports your
progress as one file - to keep a copy, or to take it to the hosted site.

## Browser support

**Chrome or Edge** (or another Chromium browser): Firefox and Safari do not
offer Web MIDI, and the app says so instead of failing quietly. Browsers offer
Web MIDI only on secure pages - `https://`, or `http://127.0.0.1` and
`http://localhost` on your own computer - so the hosted site must be on HTTPS.

## Current state

- The learning path's phase 1 (right hand): five units - C D E (Hot Cross
  Buns), G (Mary Had a Little Lamb), F (Ode to Joy), A (Twinkle Twinkle),
  B and high C (Joy to the World) - with every step type. Phases 2-6 are
  listed as coming soon.
- Note Trainer, Sheet Practice, Songs (five, each unlocking once you know its
  notes) and Stats; one metronome-graded play-along shared by all of them.
- The curriculum covers 15 white keys, C3-C5; the path uses the 8 right-hand
  ones so far. Sheet music is treble clef only, which is why the left hand
  comes next.
- Since 2026-09-29: rebuilt as `backend/` (Slim 4) + `frontend/` (Angular),
  with a setup page for every installation and a changelog in the app.
- Translated, not released yet: English and Slovak (informal), 218 keys of
  the app's own words in the database (migrations 002 and 003), a language
  chooser, and the owner's Translations and Languages pages. A word with no
  string shows its key, on purpose. The two migrations reach the owner's
  database only by the owner's own hand, after a backup (DEV.md, "Releasing
  the app's words").

## More

- Setting it up for development, testing, building and deploying:
  [DEV.md](DEV.md).
- How the code is organised, and the rules for changing it: [CLAUDE.md](CLAUDE.md)
  and the project skill, [.claude/skills/piano-learning-app/SKILL.md](.claude/skills/piano-learning-app/SKILL.md).
- Signing in through the anotoki IAM: the IAM repository (`../anotoki-iam`),
  its `docs/integrating-an-app.md`.
