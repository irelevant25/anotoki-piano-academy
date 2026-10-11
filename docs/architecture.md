# Architecture

Piano Academy is two parts and a database:

| Part | Folder | What it does |
| --- | --- | --- |
| Frontend | `frontend/` | Angular 21: the learning path, the practice pages, Web MIDI, notation (VexFlow). **All the music logic** (SRS, the path, grading) runs here; it saves whole documents. |
| Backend | `backend/` | PHP 8.2 + Slim 4: checks the shapes of what the browser saves and stores it, per person; the app's words; the admin panel's routes and tools; the setup page. |
| Database | PostgreSQL | `users`, `progress`, `path_progress`, `sessions`, `imports` (001); `languages`, `translation_keys`, `translations` (002, 003 - and the anotoki library's set `anotoki_translations`, which proves their shape and adds its own words, `anotoki.*`); `users.progress_generation` and its sequence (004); visitors - `users.visitor_key_hash`, the sequence `visitor_ids`, `visitor_starts` (005); `users.anonymized_at` (010). The library's own: `anotoki_audit_log`, `anotoki_feedback` (its set `anotoki_admin`), `anotoki_people_sync`, `anotoki_people_anonymized` (its set `anotoki_people`). The owner's is `anotoki_piano_academy`; a new setup defaults to `anotoki_piano`. |

Everybody signs in through the **anotoki IAM** (`../anotoki-iam`, client id
`piano-academy`). There is no login of the app's own and no configured
owner. Whether sign-in is required is the IAM's switch for `piano-academy`
("Sign-in required"): the backend reads it through the anotoki family's
library (`anotoki/lib`'s `SignInRule`, `authLoginRequired()`: kept a minute
in `cache_dir`, one request asks while the others use the last answer,
`true` whenever nothing better is known) and relays it to the browser in
`GET /api/auth/config` (`login_required`). Signing in is the library's on
both halves (`anotoki-lib` 0.4.1: the IAM's SDKs moved into it). While
it is on, every learner route requires a token. While it is off, somebody
who has not signed in is a **visitor** (below): the backend keeps their
progress under a key of their browser's, and the learner pages open for
them without the IAM (the admin panel never does).

## A request

```
browser ── Authorization: Bearer <IAM access token> ──> backend/api/index.php
   securityHeaders -> the error log -> error handler -> the site's gate (where the site stands)
   -> the day's backup -> the people's scrub -> who is asking (Identify) -> the route's middleware -> the route
```

1. **The site's gate** - the anotoki family's (`anotoki/lib`'s `SiteGate`,
   with `siteState()` of `api/migrations.php`), in front of every route; one
   behaviour on every anotoki site (the owner's request of 2026-10-07,
   [decisions.md](decisions.md)). Where the site stands is decided afresh for
   every request, and `GET /api/site-status` (which always passes, and looks
   at nobody: no token, no key - the pages ask it before anybody can be
   signed in) says it:
   - **not set up** - `config/database.local.php` or `config/auth.local.php`
     missing, saying too little or not PHP that runs (named with its line,
     never with what PHP said, which may quote the password): every request is `503 {code: "not_set_up",
     installed, message}`, with `setup: "/setup.php"` only while the site was
     never installed (`storage/installed.lock`, which setup.php writes on a
     real host - never on this computer);
   - **an update pending** - a migration file not applied: every request is
     `503 {code: "update_pending", message}` with `Retry-After: 60` - before
     any table is read - but the open paths (`siteOpenPaths()`, `api/index.php`):
     `/api/auth/config`, `/api/translations/{code}` (the library's
     `TranslationsRoutes::openPath()`), `/api/health` and the
     Migrations page's `/api/admin/migrations...`, so somebody can sign in,
     the pages have their words and an ADMIN reaches Apply;
   - **unavailable** - the database out of reach - and **ready**: through
     (a dead database is the error handler's `503 database_unavailable`).
2. **Who is asking** - the anotoki family's `Identify` (`identify()`,
   `api/meddleware/auth.php`), once, in front of every route but the public
   ones (the site's status, the sign-in settings, the words, the health
   check: no token read at all). The bearer token is verified by the
   library's `AccessTokens` (`api/auth.php`): RS256, `typ at+jwt`, the IAM's
   keys (cached in `cache_dir`), `iss`, `aud`, `exp`. Its `sub` is the
   person's id - the only id any query on a person's data is scoped to; its
   `roles` are this application's roles. A token that is there but does not
   check out: `401 invalid_token` on every route that reads one - never 403,
   never "somebody without a role" - and so is `Authorization: Bearer` with
   no token; another scheme (`Basic ...`, from a host behind a password file)
   counts as no header at all. No Bearer header: while sign-in is required,
   nobody (the key not read); else its `X-Visitor-Key` is that visitor's
   (`visitorFound()`, or `401 visitor_unknown`); else nobody. Each route then
   says whom it takes: a person (`requireUser()`: `401 sign_in_required` for
   anybody else, a visitor too), or on one's own progress the person or the
   visitor (`requireOwner()`; nobody as the route says, below). Those checks
   record the person's visit in `users` (`recordPerson()`, the library's
   `PeopleRecorder`: never a visitor's row, never an account the IAM deleted).
3. **The role** (`requireRole()`, the library's `RequireRole` in this app's
   words): added to a whole Slim route group, so a route added later cannot
   forget it. `403 forbidden` without the role, with a sentence for the
   staff group and another for ADMIN's. The Migrations page's and the admin
   tools' groups take `adminByToken()` - the same check, recording nobody,
   so they work while `users` waits for an update - and the library's People
   and admin tools' groups check the site's ADMIN once more themselves.

## Roles

| Who | What |
| --- | --- |
| anybody | sends feedback (`POST /api/feedback`, the form at the foot of every page; signed in, the token says who) |
| a visitor (sign-in not required) | learns: their own progress (`/api/state`, `/api/progress`, `/api/path`, `/api/sessions`) - nothing else: no file, no admin panel, no role |
| signed in, MEMBER (every account holds it) or no role | learns: their own progress (`/api/state`, `/api/progress`, `/api/path`, `/api/sessions`), and takes it out as a file and brings one back (`/api/me/export`, `/api/me/import`) |
| EDITOR | also rewords the app's words: the Translations grid, a language's strings as a file and back |
| ADMIN | all of that, and adds, changes and deletes languages, sees everybody's counts and deletes a person's data (`/api/admin/people`), keeps the admin tools - the error log, the audit log, feedback, backups (`/api/admin/errors`, `/audit`, `/feedback`, `/backups`; EDITORs see none of them) - and applies a database update |

The roles are granted in the IAM's admin panel (IAM migration 007 gives
every IAM administrator ADMIN here; every account holds MEMBER, which no
check here needs or refuses). The IAM also decides who may sign in at all
("Roles that may sign in"): taking a person's MEMBER away refuses their next
sign-in and refresh, while the access token they hold verifies until it runs
out (minutes). `ROLES_STAFF = [ADMIN, EDITOR]`. The
frontend only hides what the server refuses anyway.

## Route groups

`api/routes/public.php` (no token read - but the feedback form's, which
takes a signed-in sender from the token), `api/routes/progress.php`
(`requireOwner()` on one's own progress - a person or a visitor;
`requireUser()` on one's own file), `api/routes/admin.php`
with three groups:

| Group | Middleware | Routes |
| --- | --- | --- |
| staff, the strings (the family's: `anotoki/lib`'s `TranslationsRoutes::strings()`) | `requireRole(...ROLES_STAFF)` | `GET /api/admin/languages`, `GET`/`PUT /api/admin/translations`, `.../{code}/export`, `.../{code}/import` |
| ADMIN, the languages (the family's: `TranslationsRoutes::languages()`) | `requireRole(ROLE_ADMIN)` | `POST /api/admin/languages`, `PUT`/`DELETE /api/admin/languages/{code}` |
| ADMIN, the people (the family's: `PeopleRoutes::admin()`) | `requireRole(ROLE_ADMIN)`, and the group's own ADMIN check | `GET /api/admin/people`, `DELETE /api/admin/people/{sub}`, `POST /api/admin/people/sync` |
| ADMIN, the migrations (the family's: `anotoki/lib`'s `MigrationsRoutes::admin()`) | `adminByToken()` - open while an update waits | `GET /api/admin/migrations`, `GET /api/admin/migrations/file`, `POST /api/admin/migrations/apply` |
| ADMIN, the admin tools (the family's: `ErrorLogRoutes`, `AuditRoutes`, `FeedbackRoutes`, `BackupsRoutes`) | `adminByToken()`, and each group's own ADMIN check (`adminContext()`) - the error log and the backups (but a restore) open while an update waits | `/api/admin/errors...`, `/api/admin/audit...`, `/api/admin/feedback...`, `/api/admin/backups...` |
| a backup's download | its single-use ticket (60 s, one backup, issued to an ADMIN) - deliberately no other check: a browser's navigation sends no token | `GET /api/admin/backups/{id}/file?ticket=` |

Each of the library's route groups takes this app's check
(`api/routes/admin.php`) first, refusing in this app's words; the People and
admin tools' groups check the site's ADMIN once more themselves, so a group
mounted without a check opens nothing. Its bundle (`GET
/api/translations/{code}`, `api/routes/public.php`) reads no token at all.

Every route, with its answers: [api.md](api.md).

## A database update

The migrations are the schema (`backend/migrations/piano_academy/NNN_name.sql`),
applied by the anotoki family's engine - `anotoki/lib`'s `Migrator`, set up
in `api/migrations.php` (`databaseMigrator()`: four sets, `migrationSets()` -
the library's `anotoki_admin` (the audit log and feedback: it names no table
of this app's, so it runs first), this app's, then the library's
`anotoki_translations` (the words' tables' shape and the library's own
words) and `anotoki_people` (where the scrub stands) -, the app's lock
`DATABASE_UPDATE_LOCK`,
and as its `prepare` the rename of the first runner's `migrations(name)`
column to `filename`). The bookkeeping table is the one it always was:
`migrations (id, filename, applied_at)` - a library file recorded as
`<set>/<file>` (`migrationLabel()` names it so in the tools and in
`/api/health`). The words' and the people's sets run after this app's own,
which made the tables first; a migration of this app's never depends on a
library file.

Four things apply migrations: `setup.php`'s Save, `php migration.php`, an
administrator's Apply on the admin panel's Migrations page
(`POST /api/admin/migrations/apply`), and the tests' database builders. All
take the same PostgreSQL advisory lock first; the second one to come is told
another update is running and applies nothing (the route answers `409
busy`). The three that update a database in use make a backup of it first
(`databaseUpdater()`, `api/admin_tools.php`: the library's before-migration
backup in `storage/backups/`, once per list of pending files; one that
cannot be made stops the update before anything runs); the tests' builders
make none. Each file runs in a transaction of its own with its record, in
order, stopping at the first that fails: that one is applied not at all, and
the route names it and answers what PostgreSQL said (statement N of M, and
the statement's first lines - the page shows it in a box; it goes to the
server log too). The migrations routes are open while an update waits - they
are how an administrator brings a database that is behind up to date from
the app; the ADMIN check there reads the token alone and records nobody
(`adminByToken()`): the users table may be waiting for the very update.

In the browser (`@anotoki/lib/migrations`, wired in
`frontend/src/app/core/state/site-migrations.ts`): the app's initializer asks
`GET /api/site-status` first; `siteStatusInterceptor` hears any `503
update_pending`/`not_set_up` later; `<anotoki-site-gate>` draws the family's
status page in the view's place while the site is not ready, and takes the
shell's view as its marked template (`<ng-template anotokiSitePages>`, the
library's 0.2.0) that it makes only while it shows it - so no page runs
behind the status page, also when an update comes in the middle of
practising: the page is destroyed, and the status page loads the site
afresh once it is back (without reopening the gate first:
`SiteStatus.checkForReload()`). It says "The site is
being updated" for visitors and learners (their language, a quiet Sign in
for nobody, a reload once the site is back), "A database update is waiting"
with "Open Migrations" for the site's ADMIN, "This site is not set up yet"
with the setup page only while never installed, "not available right now"
otherwise. Inside the template the shell's `pageShown()` picks the page or
the start's card (loading, could not load; the sign-in's own pages -
`/auth/callback`, `/sign-in-failed` - are always the page). The start
(`BootService`) then reads the sign-in settings and the words, and waits
(`waiting`) - no move, no progress asked for; the sign-in guards send nobody
to the IAM; an ADMIN's Apply that leaves nothing to apply goes on with the
start in place (`resumeAfterUpdate()`), the Migrations page
(`<anotoki-migrations-page>` under `/admin/migrations`, lazy from
`@anotoki/lib/migrations/page`) staying on the screen.

## Settings

`backend/config/database.local.php` (host, port, name, user, password) and
`backend/config/auth.local.php` (`issuer`, `client_id`, `cache_dir`), written
by `backend/setup.php`, gitignored, required. Any other key in `auth.local.php`
is passed over: a file from before (with `mode` and `local_user_id`) still
works, and signs in through the IAM it names; the next Save writes the three
keys only. The issuer is https - http only on this computer (the library's
`IamClient` refuses anything else). `cache_dir` keeps the IAM's key set, its
answer about the switch and the scrub's stamp: a folder of this app's own
(`storage/cache`), never a shared temp folder - that answer is what would
open the app to visitors. The admin tools keep their files under `storage/`
too, which the upload closes to the web: `logs/` (the error log, the audit
log's waiting entries), `backups/`, and in `cache/` the feedback's counts.

`backend/config/visitors.local.php` is optional (never written by setup,
never a reason for "not set up"): the visitors' limits and the proxies whose
header names a client's address (`client_address.trusted_proxies`,
`client_ip_header`; Cloudflare's ranges when the site is behind its proxy).
See `backend/config/config.php`.

## Visitors (sign-in not required)

`api/visitors.php`, migration 005, the build analyzer's pattern:

- A visitor is a `users` row with a negative id (`visitor_ids`), no name and
  the SHA-256 of a key; `users_kind_check` keeps a negative id with a hash
  and a positive one without. The store functions are the same for both.
- Made by nobody's first save, inside that save's transaction, after the
  limits (`visitorMake()`: an advisory lock; `visitor_starts` counts new
  visitors per address and in all for an hour). The key goes out once, in
  the answer's `X-Visitor-Key`.
- Found by the library's `Identify` (`visitorFound()`), seen at most
  hourly - taken for anybody only by `requireOwner()` - and by the move at
  sign-in. `requireUser()` / `requireRole()` refuse a visitor.
- **After the answer** (`api/after_response.php`, run by `api/index.php`
  once Slim has written it): the sweep of visitors unseen for 30 days - at
  most hourly, at once after a visitor is made, in batches within 5 s, every
  table of a person's data first (`STORE_PERSON_TABLES`), a failure logged and
  never the request's.
- People (ADMIN) lists people only and counts visitors on a line of its own.

- **The move at sign-in** (`POST /api/visitor/move`, `api/routes/visitor.php`,
  `visitorMove()`): the token and the key, whatever the switch; one
  transaction with a `lock_timeout` - the visitor's users row, then the
  person's; the person's notes stay, the visitor's others come; a path step
  both have is merged in SQL (`VISITOR_STEP_MERGE`: best max, attempts added,
  the earlier pass), the others come; every round moves; each merged document
  is checked against `BODY_LIMIT` (over it, the person's stays); the
  visitor's rows go; a new generation when notes or path changed. A key
  nobody has: `{found: false}`; a lock not had in time: 503
  `visitor_move_retry`.

In the browser (below, "The frontend"): `ApiService` decides whether a
request is a person's or a visitor's as it issues it, and the family's
interceptor sends the token or the key accordingly - never the one for want
of the other.

## Each person's data

`progress.notes`, `path_progress.data` and `sessions` rows, keyed by the IAM
user id; `users` keeps the id, the username from the tokens, when first and
last seen, and the generation of the person's progress (004, below). The
site's words (`languages`, `translation_keys`, `translations`) are the one
thing not keyed by a person; `translations.updated_by` is who last reworded a
string. `imports` (001) recorded the one-time import of the old `server/data/`
files; nothing writes it any more.

The browser works everything out and **saves whole documents** (`PUT
/api/progress`, `PUT /api/path`); sessions are added one by one. Between two
tabs of one person the last save wins - but nothing may write over an import or
an administrator's delete:

```
GET /api/state ─────────── {..., generation: 41}          tab A, tab B
POST /api/me/import (tab B) ─ users row FOR UPDATE ─ replace ─ generation := nextval -> 57
PUT /api/progress (tab A, Progress-Generation: 41) ─ users row FOR UPDATE ─ 41 ≠ 57 -> 409 progress_changed, nothing saved
tab A loads again (57) and goes on
```

- `users.progress_generation` comes from one sequence (`progress_generation`),
  so a number is never handed out twice: a person an administrator deleted
  comes back with a users row whose number no tab of theirs holds.
- Only an import, a delete and a visitor's move at sign-in (when it adds
  notes or steps) take a new number; saves check it inside a
  transaction that holds the person's users row (`storeRequireGeneration()`),
  the same row the import and the delete take first - so they take turns.
- `POST /api/sessions` checks nothing: a round played in an old tab is a
  round played.

**Each person's own file**: `GET /api/me/export` is the export document
(`api/transfer.php`, `piano-academy-export` v1); `POST /api/me/import` brings
one into the caller's account - into one without progress, or in place of it
with `?replace=true` (never a mix), with a dry run first if the page wants to
ask. `EXPORT_LIMIT` (5 MiB) is both the import's body limit and the largest
export handed out, so a file the app gave always comes back in. An operator
moves data with `php tools/progress.php` (`--export`/`--import [--replace]`
with `--user`, `--move`/`--to`), with no limit. **An administrator** sees
everybody's counts and deletes a person whole (`api/people.php`, below).

## People and the admin tools

The anotoki family's (`anotoki-lib` 0.4.1), for the site's ADMIN alone (the
owner's decision: EDITORs see none of them), each a page of the library's
under `/admin`:

- **People** (`api/people.php`, `PeopleRoutes::admin()`; the page
  `@anotoki/lib/people/page`): the people who signed in, 50 a page, found by
  a name or an id, with this app's counts (Notes, Steps, Rounds) and the
  visitors' line. A delete is this app's (`peopleDelete()`: the person's users
  row held, then every table of `STORE_PERSON_TABLES` and the row, and
  their feedback's reply address and browser - a tab of theirs gets `409
  progress_changed`), after the page's question - this app's words, and
  nothing more asked - and audited. A backup made before keeps it: a
  restore brings it back (until the library's 0.4.2).
- **The scrub**: the IAM deletes an account thirty days after its owner asks.
  After an answer, at most hourly while the site is ready (`PeopleUpkeep`;
  "Check now" on the page), the library reads the IAM's deleted accounts and
  blanks each one's name here - `deleted-{sub}`, `users.anonymized_at` the
  IAM's time (migration 010) - and, through this app's hook, the address and
  browser their feedback gave. The progress stays, nobody's; such a row is
  never recorded again.
- **The error log** (`storage/logs/`, a file a day, 30 days): every 5xx, 404,
  405, 413, 415 and 429 and PHP's warnings, with the route and a redacted
  message - never a query, a header, a body, a token or an address. The
  pages' own errors are not in it yet (the library's 0.4.2 brings them).
- **The audit log** (`anotoki_audit_log`): who did what - the words saved and
  imported, a language changed, a progress file brought in, a person's data
  deleted, the scrub asked for, an update applied, the error log cleared, a
  backup made, downloaded, deleted or restored, feedback handled - written
  beside the change and never undoing it; while its table waits, entries wait
  in `storage/logs/audit-pending.jsonl`.
- **Feedback** (`anotoki_feedback`): the form at the foot of every page
  (`POST /api/feedback`, anybody; 5 an hour and 20 a day from one address, 300
  a day in all; nothing of where it came from kept), the admin page, and the
  new ones counted on the admin bar's Feedback link. It mails nobody. A
  signed-in sender's account address is the reply address unless they tick
  "Send it without my name" (the owner's decision: their choice).
- **Backups** (`storage/backups/*.anotoki-backup`: COPY through PDO, no
  pg_dump): one after the first good answer of each UTC day, one before every
  update, one before a restore, and by hand. No maximum age (the owner's
  decision): nothing deletes a backup for its age - one made by hand stays
  until the owner deletes it; the automatic ones are kept by count (the
  newest 14 daily, 5 before an update, 5 before a restore) - so a deleted
  person's data stays in the backups made before their scrub until those go.
  Made, downloaded (a single-use ticket), deleted or restored only after a
  sign-in of the last ten minutes (`403 reauth_required`); a restore only
  where the schema is the same, after a backup of its own. Before a restore
  answers, every progress - a visitor's too - takes a new generation far
  past any number handed out (`storeRenewGenerationsAfterRestore()`: the
  restore set the rows and the sequence back, and a page open since then
  would save over what was restored), and the scrub runs again
  (`peopleScrubAfterRestore()`); what could not be done is the restore's
  `after_restore_error`, and an unfinished scrub runs with the next request.
  Not encrypted (the owner's decision: only the IAM's are). Files of other
  names in the folder - the owner's own dumps - are never touched.

## The frontend

`frontend/README.md` has its folders and commands; the project skill has the
whole map. How it meets the backend:

**The start** (`core/state/boot.service.ts`, run by the app initializer before
the router's first navigation, once the initializer has asked where the site
stands - `GET /api/site-status`): the sign-in (the family's
`AnotokiAuth.init()`: `GET /api/auth/config` - the IAM's address, the client
id, `login_required` -, then it finishes a callback or restores the stored
session; it never rejects - settings it cannot read leave it `unavailable`,
and the start says what the site's status says, or could not load), the language and its
strings, then - unless the site is not ready, when the start waits there -
the state. Signed in: with a visitor key held, the move first
(`POST /api/visitor/move`; the key forgotten once it is answered, kept when
not), the visitor's outbox taken on, then the person's state. Nobody signed
in and no sign-in required: a visitor (`BootService.visiting`; the data
owner `VISITOR_OWNER`) - the state of the key this browser holds, or
nobody's (empty, generation 0); a key the server no longer knows is
forgotten and the start goes on as nobody. It ends in one status:

| Status | Drawn | Why |
| --- | --- | --- |
| `not-set-up` | the family's status page (`<anotoki-site-gate>`): "This site is not set up yet" with the setup page while never installed, else "not available right now" | no settings |
| `waiting` | the family's status page: "The site is being updated" (visitors, learners - a Sign in for nobody), "A database update is waiting" with "Open Migrations" (the site's ADMIN, who has the Migrations page itself - `BootService.onlyMigrations`; the shell draws that page in the same outlet, and after its Apply `resumeAfterUpdate()` goes on with the start and asks for the strings again, the page kept), "not available right now" (the database out of reach) | the site is not ready - SiteStatus asked at the start, or told by a 503 since |
| `load-error` | "Could not load your progress" | the API or the IAM out of reach - the app never runs on empty progress |
| `sign-in` | "Loading…" while the guard goes to the IAM - or, after a sign-in that came back without one or could not start, the family's screen on `/sign-in-failed` ("Signing in did not work", why, Try again, Back) | nobody signed in, and a sign-in required (also when the API said so to a visitor at the start) |
| `ready` | the page | the progress is in memory - a person's, or a visitor's |

**The sign-in guards** (the family's, `@anotoki/lib/auth`, wired in
`core/auth/site-auth.ts`): `personOrVisitorGuard`, `canActivateChild` on the
route that holds every learner page, and `staffGuard`, `canActivate` on
`/admin` (`adminGuard` on each ADMIN page: anybody else signed in goes to
the start page). Signed out, they send the browser to the IAM with the
address asked for as the way back (and the page's language for the IAM's
pages), and draw nothing - but `personOrVisitorGuard` lets a visitor through
(no sign-in is required); the admin panel always signs in. From a visitor's
page the saves on their way arrive first (`BootService.beforeSignIn()`, the
module's `beforeSignIn`). A sign-in that came back without one, could not
start or cannot be set up goes to the family's screen instead,
`/sign-in-failed` (`SignInFailureComponent`: why, from its code alone - this
app's sentences since migration 011 -, Try again, and Back to the address it
started from) - otherwise the browser would go round for ever. While the
site is not ready (SiteStatus) they send nobody to the IAM and let every
page through, the address kept: the family's status page stands in its
place, with its own quiet Sign in - how a signed-out ADMIN gets in and back
to the page. While the sign-in is starting they let nothing through. The
IAM's redirect route (`/auth/callback`, the family's
`AuthCallbackComponent`) and the failure screen have no guard. No sign-in by
the IAM's hint (`hint: false`; the owner's decision: genshin and the build
analyzer only).

**The family's kit** (`@anotoki/lib` 0.4.1, `core/family-kit.ts`): the top
bar, its menus and popovers, the language chooser, the theme switch and
`ThemeService`, the brand, the icons, the spinner and the questions
(`ConfirmService`, drawn by `<anotoki-confirm-host>` in `AppComponent`) are
the anotoki family's - and so are the pages' own building blocks (since
2026-10-11): every button (`anotokiButton`), card (`<anotoki-card>`), note
and message (`<anotoki-alert>`: the notes under the bar, the review's
reminder, the progress file's warning and refusals, the piano's state),
badge ("Coming soon", "Latest", "Not saved yet", What's new's lists), field
(`<anotoki-select>`: the tempo, the MIDI device), dialog (What's new),
spinner, error state ("Could not load your progress"), empty state (Stats
with no round yet) and table (the family's table styles: a small card a
round on a phone). Each is imported
from its own entry point (`@anotoki/lib/ui/config`, `/ui/button`,
`/ui/card`...: the first load carries only the pieces it draws; the fields,
`/ui/forms`, are lazy - the piano's select in the bar is a `@defer` block,
loaded once the page is idle). They draw with the family's tokens, which
`styles.scss` writes in Piano's palette (`anotoki.root()`, light and dark:
a site gives the colours only), with the family's corners, shadows, font
(Manrope) and base (`anotoki.base`: type, links, the focus ring), and its
utilities (`.stack`, `.cluster`, `.facts`...) and tables. Their words are
the library's own keys, `anotoki.*` (the translations module's
`forKit()`): the database's strings - this app's wording, which migration
009 copied there, or the owner's rewording - else the kit's own English and
informal Slovak (and, while no bundle is in memory, the theme switch's
"Theme: light" kept in code). What is Piano's own is what no other site
has, built from the family's tokens: the path (the call to go on, the
phases' heads, the units, the step chips), a lesson's steps and its result,
the practice screens (`pages/_practice.scss`), the figures in tiles
(`pages/_stat-tiles.scss`), the keyboard, the notation, the piano's button
in the bar and What's new's list of releases. Piano has no global rule for
buttons, selects or cards any more (`styles.scss` keeps the palette,
Piano's own colours and `body`'s word breaking): nothing of Piano's can
reach the kit's components.

**The words** (`@anotoki/lib/translations`, wired in
`core/i18n/site-translations.ts`; the PHP half in `api/translations.php`):
the anotoki family's one implementation. `TranslationService` decides the
language (below) and holds its bundle (`GET /api/translations/{code}`, cached
on the device under this app's old keys, `piano-academy:language` and
`:language-cache`); the `translate` / `translatePlural` pipes read it; a key
with no string shows as the key, a library key never. While no bundle is in
memory - nothing asked while the sign-in settings could not be read
(`canAsk`), or the bundle refused - the shell reads the English kept in code
(`kept-english.ts`). The admin panel's Translations and Languages pages are
the family's (`@anotoki/lib/translations/admin`, lazy), with this app's
checks (`allows`: the strings for the staff, the languages for ADMIN) and
its guard for unsaved changes (`anotokiUnsavedChangesGuard`).

**The top bar** (`layouts/top-bar/`, drawn once by `AppComponent` above every
page and boot card): the anotoki family's `<anotoki-top-bar>`, told what is
Piano's - the brand (the mark in `public/anotoki.png`, "anotoki Piano
Academy"), the five sections as links (`APP_LINKS`: a lesson is under Learn,
a song under Songs; drawn once the app runs), and two widgets of the app's
own before the language: "Not saved yet" while a save waits and the piano
(`ui/midi-panel`: a dot and the device's name; its box holds the state, the
devices, Connect and Rescan); then the language, the theme switch (light,
dark, as the device is set) and the person's menu (name, e-mail, role; their
anotoki account; "Admin panel" for the staff while the site is ready; Sign
out) - or Sign in once the sign-in ran out mid-session. Up to
`PHONE_BAR_MAX` (1320 px, measured with the real labels) it is a
phone's: "Piano" (`brand.short`), the piano's dot, the language, the theme
switch and one menu button holding the sections and the person's menu; "Not
saved yet" is a dot on that button (`phoneMark`, its words for a screen
reader) and the first line of both menus (`menuNote`). Its menus' keys are
the family's: arrows, Home and End; Escape, a click outside, Tab and
Shift+Tab close the menu - Tab with the focus on its button. Under `/admin`
it has the admin sections (`ADMIN_LINKS`, English), folding up to its own
`ADMIN_PHONE_BAR_MAX` (1280 px: eight sections need 1255), the family's
wordmark short at every width ("Piano" with "admin panel" under it;
"anotoki Piano Academy · admin panel" the link's name - the whole one beside
eight sections would not fit the family's row), "Back to Piano Academy" in
the menu, no chooser and no piano;
`TranslationService` reads every key in English there (`effectiveLanguage`,
the bundle's `english`), so the bar has no case of its own; its Feedback
link carries the number of new messages (the family's `FeedbackUnread`,
asked when an ADMIN opens the panel). The footer keeps "Send feedback" -
the family's form in the family's dialog (`ui/feedback-dialog`, drawn in a
`@defer`, so neither is in the first load), in the learner's language, for
anybody - and the version, which opens What's new.

**The admin panel** (`/admin`, English): its sections are the top bar's links
there - Translations (EDITOR, ADMIN); Languages, People, Feedback, Error
log, Audit log, Backups, Migrations (ADMIN, the family's `adminGuard`) - every
page the family's (`<anotoki-translations-page>`, `<anotoki-languages-page>`,
the People page, the admin tools' pages, `<anotoki-migrations-page>`, each
lazy from its own entry point; `/admin/database` redirects to Migrations);
the person's menu calls it "Admin panel", its brand "anotoki Piano Academy ·
admin panel" and its titles "Translations · Admin panel · Piano Academy", as on
every anotoki site; `layouts/admin-layout/` draws the page, or
says why there is nothing (signed out; signed in without a role). `/translations` and `/languages`
redirect there. The family's pages show the server's own English sentence
when a call fails; a learner's page never does.

**Saving** (`core/state/progress-store.service.ts`, `core/api/api.service.ts`):
`ApiService.fetchState()` keeps the generation; every `PUT /api/progress` and
`PUT /api/path` names it (`Progress-Generation`) - without one the save is not
sent at all, so `428` never comes from the app - one that comes all the same
(something on the way dropped the header) is a failed save like any other,
never a change elsewhere. A failed save is marked and
sent again (15 s, back online, a sign-in change); `409 progress_changed` is
never sent again: the store loads the progress again and `changedElsewhere`
puts a note under the top bar. After an import here the tab writes
`piano-academy:progress-replaced:<id>` to localStorage; the person's other
tabs hear it and load the progress at once. No page keeps a copy of the
progress: the Note Trainer, a drill step and the sequence player (Sheet, Songs,
the play steps) give each answer to `updateNote(midi, change)`, which applies
`change` to the note the store holds now; a save whose turn comes while the
progress is being loaded again waits for that load, and an answer given
meanwhile is made again on what it gives - so the old documents never go out
under the new generation, also in the middle of a round. Rounds go through the outbox
(localStorage, an Idempotency-Key), unchanged.

**Who a call is for** (`core/api/api.service.ts`, the family's
`anotokiAuthInterceptor`): decided as `ApiService` issues it, from the page's
data owner, and carried on the request (the library's `ISSUED_AS`). A
person's: the access token, or - with none
to send - not sent at all (401 `sign_in_required` locally, whatever the
switch says); never the visitor key, but on the move (`CARRIES_VISITOR_KEY`).
A visitor's (`VISITOR_OWNER`): the key this browser holds now
(`core/auth/visitor-key.ts`, localStorage `piano-academy:visitor`) - only to
the progress routes (`VISITOR_PREFIXES`) -, never a token; the answer that
made the visitor brings the key (the first key stays) and the generation; a
401 `visitor_unknown` forgets the key that was sent and tries once more
without it; a 401 `sign_in_required` makes the app require a sign-in from
then on (`AnotokiAuth.noteSignInRequired()`) and keeps the key. The own file, the
admin panel and the move are never a visitor's (refused before they are
sent). The first save without a key is the one "maker": the others wait for
it and go with its key. A visitor's 413 is sent again only with the next
change, and after a 429 no new visitor is asked for before its Retry-After
(`ApiService.visitorRefusal` holds the words' key).

**A visitor's words** (the shell, `app.component`; keys of migration 005 in
`core/i18n/visitor-words.ts`, English kept in `kept-english.ts`): under the
bar, on Learn and Stats only, the notice - kept for this browser 30 days
after the last visit, signing in keeps it - with Sign in; on any page, while
visiting: sign-in required meanwhile (`visitor.signInNow`, with Sign in), a
refused or unstartable sign-in in the failure screen's words (the library's
`failureText()`; a visitor stays on the page and gets no signed-out
banner), a save refused (`visitor.full` / `visitor.busy`, with
Sign in) and the progress ended (`visitor.lost` - the 409 that follows it
sets no "changed elsewhere"). After a sign-in: `visitor.moved` (+
`visitor.kept` when the account kept its own for some of it) or
`visitor.notMoved`. Stats shows the sign-in line (`ownProgress.visitor`) in
place of the progress file for anybody not signed in; People counts the
visitors in a line of its own.

**The own progress file** (`pages/stats/own-progress/`, the last card of
Stats, for somebody signed in): Download (`GET /api/me/export`, saved under the server's file name);
Bring back a file - the size checked here, refused while a save waits, the dry
run's counts (saved now, in the file, rounds left out), then a second press,
and over existing progress a question - then `POST /api/me/import`, the
progress loaded again and the other tabs told. Each code is a key of its own
(`ownProgressProblem()`).

**Signing out** (the top bar's menu):
`BootService.settleBeforeSignOut()` sends a failed save once more and waits for
what is on its way (the family's item says "Saving…" meanwhile); if progress
or the path still did not get through, the menu closes and the learner is
asked (`signOut.*`, their language, the family's `ConfirmService` - the safe
answer first) before `AnotokiAuth.signOut()`.

**The account's theme, dates, clock and language** (the IAM's migration 015;
`decisions.md`, 2026-10-06): `AnotokiAuth.preferences`
is the account's `{theme, date_format, time_format}` while somebody is signed
in - null for nobody, a visitor, or an IAM that sends none, and then the app
keeps its own settings as before and saves nothing to the account.
The family's `ThemeService` (`@anotoki/lib/shell`, given the account's theme
and the save in `core/family-kit.ts`) shows the account's theme (taken at
sign-in and whenever it changes - another tab, another site, a token refresh
- but not while a save of its own is out), and the bar's theme switch saves
a choice to the account through `AnotokiAuth.savePreferences()`: shown at
once, one save at a time, the latest last; refused, the account's theme
comes back and `anotoki.theme.notSaved` is said under the switch. The whole site,
the admin panel too, has that one theme; `piano-academy:theme` keeps the
theme on the screen for the family's `theme-boot.js` (`index.html`,
`data-storage-key`). The `localDate` pipe writes a signed-in person's
dates in the account's order and clock when it chose them (a moment: the
date and the time side by side, each half the language's own where left
automatic), the admin panel's People and Migrations included (`stamp`: their
`yyyy-MM-dd HH:mm`, the server's own numbers for Migrations).

**Which language** (the family's `TranslationService`, wired in
`core/i18n/site-translations.ts`; the family's order): for somebody signed in whose account sends
its preferences, this tab's `?lang=` and a choice made on the page this
visit come first, then the account's language (when the site has it), then
the choice this device remembered, the browser's languages, English. A
choice that won in the chooser (the family's, through `forShell()`'s
`choose` -> `setLanguage()`) is saved to the account as well (`account.save`:
`AnotokiAuth.savePreferences()` - also for the language already on the page),
so every anotoki site follows it: one save at
a time, the latest choice last, and the answer to an earlier save never
turns the page back. The page stays in the chosen language for the visit
whatever the account answers - silently when the IAM does not offer that
language (`invalid_request`: it is this site's own, then), with
`anotoki.language.notSaved` under the chooser when the save failed otherwise (the
IAM out of reach, the sign-in ended, `access_denied`). A change of the
account's language made elsewhere (its page, another site, another tab) is
followed when it comes (the account's `locale`, read as a signal), over the device's choice and an
earlier choice on the page - not over this tab's `?lang=`, and not while a
choice made here is on its way to the account. Signed out, or through an
IAM that sends no preferences, the order is as it always was: `?lang=`,
this device's choice, the token's `locale`, the browser's, English.
