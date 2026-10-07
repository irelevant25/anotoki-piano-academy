# Piano Academy - knowledge base

How the app works and why it is built the way it is. `README.md` at the top
says what it is; `DEV.md` how to set it up, run, test and deploy it;
`backend/README.md` the backend's layout and commands; `frontend/README.md` the
frontend's. These pages are for changing it.

| Page | What it holds |
| --- | --- |
| [architecture.md](architecture.md) | the parts and how a request goes through them: the IAM token, the roles, the route groups, the site's gate (not set up, an update waiting - the anotoki family's library), a database update; the frontend's start, its sign-in guard, the admin panel, saving and the generation, the own progress file |
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
