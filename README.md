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

Everybody signs in with their anotoki account (the anotoki IAM,
`../anotoki-iam`) - hosted at `https://piano.anotoki.eu`, and on your own
computer alike - and each person sees only their own progress. Every anotoki
account may use it; the IAM's roles decide who keeps the app's words
(EDITOR) and who administers it (ADMIN). The IAM's page for Piano Academy
also says whether signing in is required: while it is not, anybody may
practise without signing in, and their progress is kept for that browser
for 30 days after their last visit - signing in moves it into their account.

| Part | Folder | Stack |
| --- | --- | --- |
| Backend | `backend/` | PHP 8.2+, Slim 4, PostgreSQL - the API, the setup page, the migrations, the tests ([backend/README.md](backend/README.md)) |
| Frontend | `frontend/` | Angular 21 (standalone, zoneless, signals), VexFlow 5.0.0, Web MIDI ([frontend/README.md](frontend/README.md)) |
| Knowledge base | `docs/`, `.claude/` | how it works and why ([docs/README.md](docs/README.md)); the project skill and agent |

On a development machine the frontend runs at `http://localhost:4500`, the
backend at `:8300`, and sign-in goes through the IAM at `http://localhost:4300`.

## Using it on your own computer

You need **PHP 8.2 or newer** with the `pdo_pgsql` and `openssl` extensions,
**PostgreSQL**, **Node.js 22**, and the anotoki IAM running
(`../anotoki-iam`) - [DEV.md](DEV.md) says how to set each up. Then:

1. Plug the piano in (USB).
2. `composer start` in `backend/`, `npm start` in `frontend/`.
3. The first time, open `http://localhost:8300/setup.php`: your PostgreSQL
   connection (**Test the database**) and the IAM (`http://localhost:4300`,
   client id `piano-academy`), then **Save**.
4. Open `http://localhost:4500` in **Chrome or Edge** and sign in with your
   anotoki account. Press the piano button in the bar at the top, choose
   your piano and **Connect**.

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
  through (no network, the server or the IAM is away), the bar at the top
  says **Not saved yet** (on a phone, a dot on the menu button) and the app
  keeps trying; a finished round waits in the
  browser until the server has it, even across a reload.
- **Signing in**: open any page and the app sends you to the anotoki IAM
  first, and back to that page. The bar at the top then has your menu: your
  name, a link to your anotoki account and **Sign out**. Every anotoki account can use it. If your
  sign-in runs out while you practise, the app says so and keeps your finished
  rounds until you sign in again. **Sign out** lets what is waiting arrive
  first, and asks before it would lose progress that could not be saved.
- **Practising without signing in** (only while the IAM says Piano Academy
  does not require a sign-in): every page but the admin panel opens at once.
  A note under the bar on Learn and Stats says that your progress is kept
  for this browser for 30 days after your last visit, with **Sign in**
  beside it; Stats offers the sign-in where your progress file would be.
  When you sign in, what you practised moves into your account (where your
  account already had progress for a note, that stays) and the page says
  so. If the browser's progress has ended (30 days unused), if this browser
  cannot keep more, or if signing in becomes required meanwhile, a note
  under the bar says that too.
- **One bar at the top**, the same as on every anotoki site (and the same
  font, Manrope): the sections (Learn, Note Trainer, Sheet Practice, Songs,
  Stats), your piano, the language, the theme and your menu. On a phone or a
  window 1320 px wide or narrower they fold into one menu button. The
  version number at the bottom of the page shows what is new.
- **Light and dark**: the theme switch in the bar has three choices - light,
  dark, or as your computer is set. Signed in, the theme is your anotoki
  account's: choose it here or on any anotoki site, and every site - the
  admin panel too - follows it. Without signing in, this browser keeps its
  own.
- **Dates and times** are written the way your language writes them - or,
  signed in, in the order and on the clock your anotoki account chose
  (2026-10-06, 6.10.2026, 2:30 PM ...).
- **English and Slovak**: the language button in the bar chooses - and,
  signed in, saves it to your anotoki account as well, so every anotoki site
  speaks it. Signed in, the app speaks your account's language (changed on
  another site, it follows); without signing in it keeps what you chose in
  this browser, and until you choose, it follows your browser. Note names, song titles and your piano's name stay as they
  are in every language. The app's words live in the database, reworded in
  the browser in the admin panel (`/admin`, in English; **Admin panel** in
  your menu, and the bar there has its sections): an account with the role EDITOR of Piano Academy
  rewords them, an ADMIN also adds and deletes languages, sees everybody's
  progress counts (**People**), reads the **Error log**, the **Audit log**
  and the **Feedback**, keeps the **Backups** and applies database updates
  (**Migrations**).
- **Send feedback**, at the foot of every page - signed in or not: a
  problem or an idea, and which part of the app it is about. It is kept for
  the app's administrators (the bar counts the new ones) and mails nobody.
- **If signing in does not work**, a page of its own says why, with **Try
  again** and a way back to where you were.

### Data and privacy

Your progress lives in PostgreSQL: the progress per note, the learning-path
steps you have passed, and a log of your practice rounds - all under your IAM
user id. Your progress is sent nowhere but to the app's own server. The pages
you open are counted by the anotoki sites' own visitor counter (Umami, at
umami.anotoki.eu), which sets no cookie: it gets each page's address without
its query string or fragment, its title, the page you came from, the screen
size and the browser's language. Each person can
take their own progress out as a file and bring a file back into their own
account (**Your progress file**, at the end of Stats): the app first shows
what the file brings, and puts it in place of what is there only after a
question - never mixed with it. If your progress is replaced or deleted
somewhere else while a page is open, that page loads it again and says so; it
never saves the old progress back. An administrator of the app sees how much
progress everybody has and can delete a person's data. An operator can do the same from a shell
(`php tools/progress.php` in `backend/`). When somebody deletes their anotoki
account, the app forgets their name too (it asks the IAM at most hourly,
while the site is in use), and the address and browser their feedback gave;
their progress stays, nobody's.

Feedback keeps what you write, its kind and the part of the app you chose,
the page's address without its query, the language, your browser's name
and - only if there is one - an address to answer you at: the one you type,
or signed in with the box left empty your account's (none when you tick
**Send it without my name**). Spam goes after 30 days, a resolved message a
year after. The server keeps backups of the database on its own disk, for
the app's administrators: one a day (the last 14), one before every update
(the last 5) and any made by hand, which stays until the owner deletes it -
no backup goes for its age, so a deleted account's data stays in the
backups made before until they go. Its error log keeps what went wrong -
never a query, a header, a body or an address - for 30 days.

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
- English and Slovak (informal), 262 keys of the app's own words in the
  database (migrations 002 to 011) and the anotoki library's 94 (`anotoki.*`:
  the words of the bar, its menus, the language chooser, the theme switch,
  the dialogs, the status page, the sign-in's failure page and the feedback
  form), a language chooser, and the
  Translations and Languages pages. A word of the app's with no string shows
  its key, on purpose.
- **Signing in, People and the admin tools through the anotoki family's
  library (2026-10-11, later).** `anotoki-lib` 0.4.1, both halves. Signing
  in is the family's (the same tokens in the browser, so nobody is signed
  out by the move); a sign-in that does not work has a page of its own,
  saying why, with Try again and a way back. The People page is the
  family's, and forgets the name and address of anybody who deleted their
  anotoki account (migration 010 notes when). The admin panel has the
  family's Error log, Audit log, Feedback (from "Send feedback" at the foot
  of every page; it mails nobody, the bar counts the new ones) and Backups
  (one a day, one before every update, and by hand) - for the site's ADMIN
  alone. Migration 011 moves the sign-in's three failure sentences under the
  library's keys. 010 and 011 go with 005 to 009 at the hand-over, the
  library's own files around them in the same Apply. In What's new's 0.4.0:
  Send feedback, and the sign-in failure's page.
- **The words through the anotoki family's library (2026-10-11).** Every
  anotoki site now keeps its words the same way, through the family's
  library (`anotoki-lib` 0.3.0, both halves): the words' tables stay as they
  were, and the library reads and writes them - the strings the pages ask
  for, the admin panel's Translations and Languages pages (now the family's),
  `php tools/translations.php`. Who may change what stays this app's (EDITOR
  the strings, ADMIN the languages). The bar's words are the library's keys
  now: migration 009 copies the app's wording there - the owner's included -
  and goes with 005 to 008 at the hand-over, the library's own two files
  right after it in the same Apply. A learner sees nothing new; nothing in
  What's new.
- **The anotoki family's look (2026-10-08 to 11).** The bar, its menus, the
  language chooser, the theme switch - now three choices: light, dark, or as
  the device is set -, the questions ("Are you sure?") and the font
  (Manrope) are the anotoki family's, from its library's UI kit
  (`@anotoki/lib` 0.2.0, then 0.3.0 and 0.4.1 on 2026-10-11); Piano Academy keeps its
  own colours, its pages, the keyboard and the notation. The family's words
  say what the owner wrote in the database where the app has them.
  Migration 008 takes the old round theme button's words away; it goes with
  005, 006 and 007 at the hand-over. In What's new's 0.4.0 (not released
  yet).
- **One way while the site is not ready (2026-10-07).** Every anotoki site
  now behaves the same while it is being updated, through the family's
  library (`anotoki-lib` from GitHub: `vendor/anotoki/lib` 0.1.0 and
  `@anotoki/lib` 0.1.1): visitors and learners read "The site is being
  updated" in their language - no error, no page running behind it (also
  when the update comes in the middle of practising), and the page comes
  back by itself; the site's ADMIN reads "A database update is waiting" and
  applies it on the admin panel's Migrations page (now the family's page,
  with each file's SQL);
  signing in works meanwhile; the setup page is offered only while the site
  was never installed. The library's engine applies the migrations
  everywhere (setup, `php migration.php`, the Migrations page, the tests).
  Migration 007 takes the old "not set up yet" card's words away; it goes
  with 005 and 006 at the hand-over. Version 0.4.0 - versions have three
  numbers now, MAJOR.MINOR.PATCH (What's new's earlier entries are 0.1.0 to
  0.3.0).
- **The anotoki account's theme, dates and clock (2026-10-06).** The IAM
  keeps them beside the account's language (its migration 015), and Piano
  Academy follows them for somebody signed in: the theme everywhere (the
  admin panel too), dates and times in the order and on the clock chosen.
  The bar's theme button and language button save a signed-in person's
  choice to the account (then the IAM's browser SDK 1.2.0, the family's
  library since 0.4.1), and the account's
  language comes before what this browser remembered (the family's order);
  when the account would not take a choice, a note under the button says so
  (migration 006: two sentences, applied at the hand-over with 005). Without
  signing in - or with an IAM before its 015 - everything stays as it was.
  Version 0.3 (its line in What's new).
- **Under way (2026-10-05): sign-in per site.** The IAM now says, per site,
  whether signing in is required and which roles may sign in, and every
  account holds MEMBER. The backend reads Piano Academy's "Sign-in required"
  and tells the browser (`/api/auth/config`). While it is off, the backend
  keeps the progress of somebody practising without signing in (a visitor,
  kept 30 days after the last visit for that browser; migration 005, which
  the owner applies at the hand-over), and at sign-in moves it into the
  account (the account's own progress stays, a passed path step is never
  lost). The pages follow the switch too: while it is on (as it is for
  Piano Academy today) nothing changes - everybody signs in; while it is off
  a visitor practises without signing in, and signing in moves what they
  practised into the account (the admin panel always asks for a sign-in).
  The visitor's words are on the page (the notice on Learn and Stats, what
  came with a sign-in, a progress ended, a save this browser cannot keep,
  sign-in required meanwhile), People counts the visitors, and the browser
  check walks a visitor through all of it. Next: the review.
- **The anotoki family made one way (2026-10-04).** The backend
  signs everybody in through the IAM only (no "no sign-in" mode, no configured
  owner), checks the roles EDITOR and ADMIN on its admin routes
  (`/api/admin/...`), lets an administrator see and apply pending migrations
  on the admin panel's Migrations page (the IAM's), and its setup page asks for
  the database and the IAM only. The old
  `server/data/` files and the launchers `start.ps1` / `start.sh` are gone
  (git keeps them). Each person's own export and import, the People routes
  (an administrator's list and delete) and the progress generation (an old tab
  cannot save over an import or a delete) are in the backend, with migration
  004. The frontend is in step: every page signs in first, the admin panel is
  `/admin` ("Admin panel" in the person's menu; Translations for EDITOR and
  ADMIN; Languages, People and Migrations for ADMIN - Migrations also while
  the database is behind), Stats has your own progress file, saves name the
  generation, Sign out asks before it would lose progress, and the family's
  one top bar is at the top of every page. 004 is finished (the schema and
  every string of this work) and is applied in the owner's database;
  the version is 0.2 (its entry in What's new). A browser check is in the
  repository (`.claude/skills/check-in-browser`). The review (stage 5)
  is done and what it found is fixed.

## More

- Setting it up for development, testing, building and deploying:
  [DEV.md](DEV.md).
- How the code is organised, and the rules for changing it: [CLAUDE.md](CLAUDE.md)
  and the project skill, [.claude/skills/piano-learning-app/SKILL.md](.claude/skills/piano-learning-app/SKILL.md).
- Signing in through the anotoki IAM: the IAM repository (`../anotoki-iam`),
  its `docs/integrating-an-app.md`.
