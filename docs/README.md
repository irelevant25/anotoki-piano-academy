# Piano Academy - knowledge base

How the app works and why it is built the way it is. `README.md` at the top
says what it is; `DEV.md` how to set it up, run, test and deploy it;
`backend/README.md` the backend's layout and commands; `frontend/README.md` the
frontend's. These pages are for changing it.

| Page | What it holds |
| --- | --- |
| [architecture.md](architecture.md) | the parts and how a request goes through them: the IAM token (the anotoki family's library), the roles, the route groups, the site's gate (not set up, an update waiting), a database update (this app's migrations and the library's, a backup first); the people and the admin tools; the frontend's start, its sign-in guards and failure screen, the legal pages, the family's kit and the words, the admin panel, feedback, saving and the generation, the own progress file |
| [api.md](api.md) | every route of the API: who may call it, what it answers, how it refuses |
| [decisions.md](decisions.md) | the choices made, with their reasons - read before undoing one |

The learning path, the music logic, the gotchas and the review checklist are in
the project skill, [`.claude/skills/piano-learning-app/SKILL.md`](../.claude/skills/piano-learning-app/SKILL.md);
the agent [`.claude/agents/piano-dev.md`](../.claude/agents/piano-dev.md)
loads it for delegated work.

Keep them current: a change that makes a page here wrong changes the page too.

**Under way (2026-10-04):** the anotoki family is being made one way (the IAM
only, roles, one top bar, each person's own export and import). The backend is
done: sign-in, roles, setup and the layout (stage 1); each person's own export
and import, the generation that stops an old tab writing over them, the People
routes and migration 004's schema part (stage 2). The frontend is in step
(stage 3): sign-in on every page, the admin panel under `/admin`, the own
progress file on Stats, saves that name the generation, the sign-out question,
and 004's strings for them. The family's one top bar is in (stage 4), 004 is
finished with every string of the work, and the version is 0.2; stage 5
reviewed it all and fixed what it found; then the admin panel (so named
wherever it is named) got the family's Migrations page in place of the Database
page. 004 is applied in the owner's database (2026-10-05) and frozen.
Then (2026-10-05, under way) sign-in per site: the app reads the IAM's
switch ("Sign-in required" for `piano-academy`) and relays it to the browser;
while it is off the backend keeps visitors' progress (migration 005,
written whole and final - the owner applies it at the hand-over, after a
`pg_dump`), and moves it into the account at sign-in
(`POST /api/visitor/move`). The frontend serves visitors while the switch is
off (stage D: who a request is is decided as it is issued, the key, the
move before the state - `architecture.md`, "The frontend"); and the
visitor's words are on the page (stage E: the notice, what came with a
sign-in, a progress ended, a save refused, sign-in required meanwhile;
Stats' sign-in line; People's visitors line). Next: the review.
Then (2026-10-06) the anotoki account's theme, dates and clock (the IAM's
015, its browser SDK 1.2.0): followed for somebody signed in, the bar's
theme button and language chooser save to the account, the account's
language comes before this device's choice (the family's order), and
migration 006 (two sentences, written whole and final, applied at the
hand-over with 005) says when the account would not take a choice -
`architecture.md`, "The frontend" ("Which language"); `decisions.md`. It goes
out as version 0.3.
Then (2026-10-07) the anotoki family's library, `anotoki-lib` 0.1.0 (the
owner's request: one behaviour on every site while it is not ready): its
engine applies the migrations, its gate stands in front of every route (an
update waiting: the sign-in, the words and the Migrations page answer,
nothing else), its pages say "The site is being updated" to visitors and
learners and "A database update is waiting" to the site's ADMIN, the setup
page only while never installed - `architecture.md`, "A request" and "A
database update"; `decisions.md`. Migration 007 (words only: the old "not set
up yet" card's four keys go) goes with 005 and 006 at the hand-over.
Then the library's Angular half 0.1.1 (the PHP half stays 0.1.0): the gate
makes the shell's view, its template, only while it shows it - no page runs
behind the status page. And the versions have three numbers,
MAJOR.MINOR.PATCH: What's new's entries are 0.1.0 to 0.4.0 - `decisions.md`.
Then (2026-10-08 to 11) the library's Angular half 0.2.0, the family's UI
kit (the PHP half stays 0.1.0): the top bar, its menus, the language
chooser, the theme switch (light / dark / as the device is set, in the
round button's place), the questions, `ThemeService` and Manrope are the
family's, in Piano's own palette; Piano's pages, keyboard, notation and
What's new stay its own - `architecture.md`, "The frontend" ("The family's
kit", "The top bar"); `decisions.md`. Migration 008 (words only: the round
button's three spoken keys go) goes with 005, 006 and 007 at the hand-over.
Then (2026-10-11) the library's 0.3.0, both halves: the words through the
family's one implementation - the bundle, the admin panel's routes (this
app's role checks on them) and its Translations and Languages pages, the
command line, the IAM's wire format (snake_case) - with the library's own
migration set after this app's; the kit's words are the library's keys
(`anotoki.*`), and migration 009 (words only) copies this app's wording there
and goes with 005 to 008 at the hand-over - `architecture.md` ("The words",
"A database update"), `api.md`; `decisions.md`.
Then (2026-10-11, later) the library's 0.4.1, both halves: signing in is
the family's (the IAM's SDKs, this app's auth service, interceptor, guards
and sign-in card gone; a sign-in that did not work goes to the family's
screen; no sign-in by the IAM's hint), the People page is the family's with
the scrub of the accounts the IAM deleted (migration 010:
`users.anonymized_at`), and the admin tools - the error log, the audit log,
feedback (the visitors' form from the footer, the bar's count, no mail),
backups - are the family's, for the site's ADMIN alone; migration 011
(words only) moves the sign-in card's three failure sentences under the
library's keys. 010 and 011 go with 005 to 009 at the hand-over -
`architecture.md` ("A request", "People and the admin tools", "The
frontend"), `api.md`; `decisions.md`.
Then (2026-10-11, later still) Piano's own pages on the family's kit, the
library unchanged (0.4.1): every button, card, note, badge, select, What's
new's dialog, the spinner, the error state and Stats' table are the kit's,
in Piano's colours (its light green a shade darker, for AA); the path, the
practice screens, the tiles, the keyboard, the staff and the piano's button
stay Piano's own, from the same tokens; `styles.scss` takes the family's
base, utilities and tables, and no rule of Piano's for buttons, selects or
cards is left - `architecture.md` ("The family's kit"); `decisions.md`. No
words, no migration.
Then (2026-10-12) the library's 0.5.0, both halves: a restore does again
every People delete and feedback delete made since its backup, inside its
transaction, and renews the generations there too; the People delete works
on the connection the library hands it; the pages' own errors go to the
error log (`POST /api/client-errors`); where a request comes from is the
library's rule with Cloudflare's ranges committed and CF-Connecting-IP
pinned (a catch-all range refused), and a keyed hash of an address is kept,
never the address; feedback keeps the reply address the form sends;
backups name their maker and are sealed (one of before 0.5.0 restores
offline only) - `architecture.md` ("Visitors", "People and the admin
tools"), `api.md`; `decisions.md`. No words, no migration. Known: the
library's 0.5.0 cannot restore a database where a visitor was ever made
(`decisions.md`).
Then (2026-10-13) the library's PHP 0.5.2 (Angular stays 0.5.0): the origin
secret - given `config/cloudflare.local.php`, CF-Connecting-IP is believed
only on a request that carries the secret the owner's Cloudflare zone adds
(`X-Anotoki-Origin`); any other request from Cloudflare counts as its edge -
`architecture.md` ("Where a request comes from"), `api.md`; `decisions.md`.
No words, no migration.
Then (2026-10-18) the library's 0.6.2, both halves: the family's Terms,
Privacy and Contact on routes of their own, open to anybody, filled in with
Piano's facts - true of the code as it is, every address the code's -, the
footer's links to them, the kit's chips, stat tiles, step dots and
highlighted card in place of Piano's own, What's new loaded when it opens,
a `config/cloudflare.local.php` that cannot be read cleanly failing
closed, and a settings file that does not start with `<?php` never
compiled (one with a byte-order mark before `declare(strict_types=1)` made
every request a 500) - `architecture.md` ("The legal pages", "The family's kit", "Where a
request comes from"); `decisions.md` (with the facts for the owner to
confirm). Migration 012 (words only: the pages' 43 keys, a word no page
can show any more gone) goes with 005 to 011 at the hand-over, the library's
words 005 to 011 after it in the same Apply.
