# Developing Piano Academy

From a fresh clone to playing, then the day to day, the tests, and the build
for the hosting.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| PHP | 8.2+ | with `pdo_pgsql` and `openssl`; the tests also need `curl`. `php` on the PATH |
| PostgreSQL | 13+ | a local server, and a login that may create databases (the setup and the tests make theirs) |
| Node.js | 22.12+ | with npm, for the Angular app (`frontend/.nvmrc` pins 22.15.0) |
| A browser | Chrome or Edge | Web MIDI; a USB-MIDI keyboard is optional (see *Testing without a piano*) |
| The anotoki IAM | - | everybody signs in through it, here too: `../anotoki-iam`, its own DEV.md |

`backend/vendor/` is committed (the hosting cannot run Composer), so Composer
is only needed to change PHP dependencies. `frontend/.npmrc` sets
`legacy-peer-deps`: npm 10.9's installer trips over the test runner's optional
peers otherwise.

**The anotoki family's library** (`anotoki-lib`, on GitHub:
`irelevant25/anotoki-lib`) has two halves with one version, and both come
from GitHub, never from a folder next door: the PHP package `anotoki/lib`
(`backend/composer.json`: its VCS repository and `"anotoki/lib": "^0.8.0"`;
in `vendor/anotoki/lib`, committed with the rest of `vendor/`) and the
Angular package `@anotoki/lib` (`frontend/package.json`: the release's
tarball, `https://github.com/irelevant25/anotoki-lib/releases/download/v0.8.0/anotoki-lib-0.8.0.tgz`;
in both `bun.lock` and `package-lock.json`). Its migrations module: the
engine, the gate in front of the API, and the pages of a site that is not
ready (below, *While the site is not ready*); its translations: the words'
tables, the bundle the pages read, the admin panel's routes and its
Translations and Languages pages, the command line (below, *The app's
words*); and the family's UI kit, its styles and its frame (the top bar,
the theme switch, the language chooser, the menus, the questions, Manrope,
and every page's buttons, cards, alerts, badges, selects, dialogs and table
- `frontend/README.md`); signing in (the IAM's SDKs moved into it), the people
and the admin tools (below, *Signing in, people and the admin tools*); the
legal pages (below, *Terms, Privacy and Contact*) and About and Support; the
footer (below, *The family's footer*). Both halves are at 0.8.0 (0.6.0 added the legal pages -
Terms, Privacy, Contact and the footer's links - and the kit's chips, stat
tiles and step dots, the highlighted card and the select's own entry point;
0.6.1 made the Privacy page's sentences on the backups true, and 0.6.2 three
more of its sentences - its translations 011, which keeps a site's own
words; 0.6.3 added the family's footer, `<anotoki-site-footer>`, and draws the
status page in a `<main>` of its own, with no header and no footer; 0.7.0
changed nothing the app does - it renamed the library's own folders, its PHP
half's files now in `vendor/anotoki/lib/backend/`; 0.7.1 writes the footer's
version short, "v0.4.0"; 0.7.2 has the feedback form say itself whom its
message is for - Piano's own interceptor gone - and the library's words in
the reader's language while no bundle is in memory; 0.8.0 adds the About and
Support pages - About · Support first among the footer's links, its
translations 013 - and the feedback form's kept draft and Clear; 0.5.1 and
0.5.2 changed only the PHP half: 0.5.1 a restore's sequences that count down, 0.5.2 the origin
secret - below, *The library's PHP 0.5.2*; 0.1.1 and 0.2.0 changed
only the Angular half: 0.1.1 made the pages a template, made only while the
site is open; 0.2.0 marked that template - `anotokiSitePages` - gave the
Migrations page an entry point of its own and added the kit; 0.3.0 added
the translations to both halves, gave each kit piece an entry point of its
own and the kit its own class names; 0.4.0 added signing in, the people and
the admin tools to both halves, and 0.4.1 mended two of its queries on PHP
8.2 - never 0.4.0; 0.5.0 makes a restore do again what was deleted since
its backup, seals the plain backups, sends the pages' own errors to the
error log and reads real visitors' addresses through Cloudflare - below,
*The library's 0.5.0*). **To update
it**, both halves together: read its `CHANGELOG.md` (while 0.x a minor
version may break; a release that leaves a half unchanged may leave it
where it is), then in `backend/` `composer update anotoki/lib
--prefer-dist` (change the constraint first when the new version needs
it) and commit what changed in `vendor/`; in `frontend/` the
new release's URL in `package.json`, then `bun install` - never `npm
install` - and give `package-lock.json`'s `node_modules/@anotoki/lib` entry
the same `version`, `resolved` (the URL) and `integrity` as `bun.lock`'s, by
hand: both lock files agree, and `npm ci` installs from the second.

## First setup

Everything that belongs to one installation - the database connection, the
IAM's address and this app's client id there, the key cache - lives in
`backend/config/database.local.php` and `backend/config/auth.local.php`. They are gitignored and **required**: without
them the API answers every request `503 {code: "not_set_up", installed, message}`
- with `setup: "/setup.php"` while the site was never installed - and the app
shows the family's page "This site is not set up yet" with "Open the setup
page". Nothing falls back to a committed default. The setup page writes them.

### 1. The setup page

```bash
cd backend
composer start          # php -S localhost:8300 router.php
```

Open **http://localhost:8300/setup.php**. Asked from this computer by a local
name (localhost, 127.0.0.1) under PHP's built-in server, it is the development
setup: no token (a nonce in a cookie keeps other pages from submitting it), and
it stays - open it again whenever a setting changes. It shows what is saved,
never a password; a password left empty keeps the saved one.

- **Database**: the server, port (5432), database name (`anotoki_piano` for a
  new setup; the owner's own is `anotoki_piano_academy`), user and password.
  **Test the database** tries them without saving, and says what Save would do
  in the family's words ("it is empty - Save makes the tables", "N update(s) to
  apply", "does not exist yet - Save creates it", "Cannot connect: ...").
- **Sign-in: the anotoki IAM**: its address, `http://localhost:4300` on a
  development machine, and the client id `piano-academy`. **Test the IAM**
  fetches `{address}/.well-known/openid-configuration` and its keys.

That is all it asks: who administers the app is the IAM's roles, not a
setting. **Save** creates the database if it is missing, applies the
migrations (under the same lock as `php migration.php` and an administrator's
update in the app) and writes the two files - `auth.local.php` as exactly
`issuer`, `client_id`, `cache_dir` (an older file's `mode` and
`local_user_id` go; until then they are passed over).

### 2. The frontend

```bash
cd frontend
npm ci
npm start          # http://localhost:4500 - proxying /api and /setup.php to :8300
```

The app is at **http://localhost:4500**, the setup page at
`http://localhost:4500/setup.php` too.

### 3. Signing in, while developing

Run the IAM (`../anotoki-iam`: its backend on `:8100`, its pages on
`http://localhost:4300` - see its DEV.md). It registers Piano Academy
for `http://localhost:4500`: the redirect URI `/auth/callback` (a route of this
app), and `/` after signing out - so sign in at `http://localhost:4500`, not
on the backend's own address. Every anotoki account gets in and learns; the
IAM's admin panel gives the roles: **EDITOR** rewords the app's words,
**ADMIN** also keeps the languages and applies database updates (IAM
migration 007 makes every IAM administrator ADMIN here).

## Day to day

| | Command | Address |
| --- | --- | --- |
| API and setup page | `cd backend && composer start` | `http://localhost:8300` |
| The app | `cd frontend && npm start` | `http://localhost:4500` |
| The IAM | `../anotoki-iam` (its DEV.md) | `http://localhost:4300` |

Command-line tools in `backend/`, all reading the same settings:

```bash
php migration.php [--status|--dry-run]          # apply pending migrations (setup.php does too; one at a time)
php tools/progress.php --export=FILE --user=ID   # one person's progress as a file
php tools/progress.php --import=FILE --user=ID   # an export into an account that has none (--replace: in place of what it has)
php tools/progress.php --move=FROM --to=TO       # all of one IAM user's progress to another id
php tools/translations.php --status              # the keys the frontend asks for against the database's (the library's command)
php tools/translations.php --export sk [FILE]    # one language's strings as flat JSON (to the screen without FILE)
php tools/translations.php --import sk FILE      # and back in, checked as a save on the Translations page is
php tools/build.php [--out=DIR]                  # the upload (see Building and deploying)
```

The database is `migrations/piano_academy/NNN_name.sql`, applied in order by the
anotoki family's engine - `anotoki/lib`'s `Migrator`, which every anotoki site
uses (`api/migrations.php` sets it up: the folder, the app's one lock, and
the rename of the first runner's `migrations(name)` column) - and after them
the library's own set `anotoki_translations` (the words' tables as the
library relies on them, and its 54 words; `vendor/anotoki/lib/backend/migrations/translations/`,
recorded in the same table as `anotoki_translations/<file>`). Each file runs
whole or not at all, and the run stops at the first that fails. Never edit
an applied migration; add the next number.

### While the site is not ready

The backend decides for every request where the site stands (`siteState()`,
the family's `SiteGate` in front of every route, `api/index.php`) and
`GET /api/site-status` says it to the pages:

- **not set up** (a `config/*.local.php` missing): every path answers 503
  `not_set_up`; the page says "This site is not set up yet" with "Open the
  setup page" - but only while the site was never installed (no
  `storage/installed.lock`, which the setup writes on a real host, never on
  this computer); once installed it only says "The site is not available
  right now" and asks again by itself;
- **an update waiting** (a migration file not applied): every path answers 503
  `update_pending` (`Retry-After: 60`) but the sign-in settings, the words,
  `/api/health` and the Migrations page's routes. Visitors and learners read
  "The site is being updated" in their language (a quiet Sign in while
  nobody is signed in), and the page comes back by itself; the site's ADMIN
  reads "A database update is waiting" and opens the admin panel's
  **Migrations** page, the one page that works then. Sign in works
  throughout;
- **the database out of reach**: the routes answer as ever (503
  `database_unavailable`); the page says "The site is not available right
  now".

On this computer that means: after writing a migration your own dev site
says it is being updated until you apply it - `php migration.php`, Save on
the setup page, or "Apply pending" as an ADMIN.

### The app's words

What the app says is in the database, in English and Slovak (informal, "ty"),
English the fallback: the tables `languages`, `translation_keys` and
`translations` (migration 002), the keys and their first strings (003). The
staff reword them in the browser, in the admin panel (`/admin`, English) -
**Translations** (EDITOR or ADMIN of Piano Academy in the IAM) and
**Languages** (adding, changing and deleting a language: ADMIN). A key with
no string shows as the key itself, on purpose.

The anotoki family's library reads and writes them, as on every anotoki
site (`anotoki-lib` 0.3.0): `api/translations.php` wires its PHP half - the
bundle `GET /api/translations/{code}`, the admin panel's
`/api/admin/translations...` and `/api/admin/languages...` (snake_case, the
IAM's format; the role checks are this app's, on the route groups) - and
`frontend/src/app/core/i18n/site-translations.ts` its Angular half (the
`TranslationService`, the pipes, the admin pages). The library's own words
are keys of its own, `anotoki.*` (94: the bar's, the menus', the language
chooser's and theme switch's, the dialogs', the status page's, the sign-in
failure page's, the feedback form's), in the same
tables - its migration set `anotoki_translations` writes them, and an owner
rewords them on the Translations page like any other.

- `tools/translations.php --status` (the library's command) scans
  `frontend/src/app` for the keys it asks for (`tools/translation_keys.php`
  sets the library's `KeyScanner` up: quoted literals of a key's shape,
  `core/i18n/dynamic-keys.ts` for keys put together at run time; `anotoki.*`
  passed by) and compares them with the database: exit 1 when a key is
  missing, has no English string, or is asked for in a way the scan does not
  let through; it lists keys nothing asks for. `php tests/run.php` runs the
  same scan against the migrations. The tool refuses while a migration is
  pending, and what it imports is written by nobody (`updated_by` null).
- Before the words' tables have their English (a fresh database before its
  first Apply), the bundle answers 503 `translations_unavailable` and the
  pages read the English kept in code; the admin pages say to apply the
  pending update first.
- **A new string** is a new migration in 003's layout (a test reads it as
  text): the key with a description, its English, its Slovak, and a closing
  gate. A string the shell shows while there are no strings at all (the
  top bar, the cards) also goes into
  `frontend/src/app/core/i18n/kept-english.ts`, letter for letter.
- While a migration is not released it may still change: after editing it,
  `php tests/tools/testdb.php template --fresh` builds the tests' template
  again from every migration (the template otherwise never reapplies a
  migration it has seen).

## Tests

```bash
cd backend
php tests/run.php                  # every tests/unit and tests/api file, four at a time

cd frontend
npm test                           # the unit tests (Vitest)
npm run build                      # the production build
cd .. && bun run format:check      # Prettier on every file of both halves, at the root (bun install there first)
```

The frontend's specs need no server: `HttpTestingController` answers the API,
`TestAuth` (`core/testing/test-auth.ts`) stands for the family's `AnotokiAuth`,
`provideTestTranslations()` gives a page its
strings. `frontend/README.md` lists what they cover.

The backend tests start the real router under PHP's built-in server (and the
upload, without a router, as a host would run it), each file against a
throwaway `piano_test_*` database copied from `piano_test_template`, with
settings of its own in a temp folder (`PIANO_TEST_CONFIG`, honoured only for
`piano_test_` databases). They borrow only the PostgreSQL server and user from
this machine's `config/database.local.php`, so run the setup once first. They
never touch the owner's database. Sign-in is always the IAM's: tokens the
tests sign with their own key (the library's `TestIam`: `test_token($id,
$roles)`; no roles is a learner, and so is MEMBER), and the family's
stand-in IAM (`vendor/anotoki/lib/backend/testing/stand-in-iam.php`,
`stand_in_iam()`) for a whole sign-in, the IAM's "Sign-in required" switch
and its deleted accounts. No test asks a real IAM: the switch's answer and
the deleted accounts are files (`application_file`, `anonymized_file`), or
the stand-in answers them; `tests/lib.php` refuses anything else.
To run them under a second PHP - the hosting's version - call that binary
instead of `php`: `run.php` starts each file with the PHP it runs under.
`php tests/tools/testdb.php template --fresh` drops and rebuilds the template
they are copied from - needed after editing a migration that is not released
yet; not while tests are running.

A throwaway copy of the app, for trying things in a browser:

```bash
cd backend
php tests/tools/testdb.php template       # the empty database it is copied from (run.php keeps it current)
php tests/tools/testenv.php storage/manual --db=piano_test_manual   # its IAM: the stand-in on :8597
PIANO_TEST_CONFIG=storage/manual php -S 127.0.0.1:8590 router.php
# afterwards: php tests/tools/testdb.php drop piano_test_manual
```

(`storage/` is gitignored - the folder holds a copy of the database password.)

Sign in through the family's stand-in IAM (never the real one),
`vendor/anotoki/lib/backend/testing/stand-in-iam.php`: its header says how to
run it on `:8597`, with a key the library's `TestIam::create()` writes (the
browser check's `scripts/run.mjs` does both; `--issuer=` points the
throwaway copy at another address); `POST /_test/state` with
`{"user": {"id": 1, "username": "ada", "roles": ["MEMBER", "ADMIN"]}}` sets who signs in
and with which roles (`["MEMBER"]`: a learner - every account holds MEMBER), and
`{"login_required": false}` what the IAM says about the app's "Sign-in required"
(`{"application_missing": true}`: a 404). The app keeps that answer a minute in
the folder's `cache/`; `testenv.php ... --application-ttl=1` keeps it a second.
`"preferences": {"theme": "dark", "date_format": "dmy_dot", "time_format": "12"}`
in the `user` gives the account a theme, a date order and a clock (the
tokens' `preferences` claim, as an IAM with its migration 015; none, the
default, is an IAM before it), and the app's theme button and language
chooser save into it; `{"answers": {"/api/oidc/preferences": {"status":
403, "body": "{\"error\":\"access_denied\"}"}}}` makes those saves
fail (`{"answers": {}}` ends it). A sign-in takes the claim, so sign in again
after changing it. `{"anonymized": [{"sub": "1", "anonymized_at":
"2026-10-10T09:30:00Z"}]}` says the IAM deleted that account: the People
page's "Check now" scrubs it.
Throwaway servers go on 8590-8599.

With `login_required` false the throwaway copy keeps visitors' progress
(`api/visitors.php`): a save without a token makes a visitor and answers its
key in `X-Visitor-Key` - e.g. `curl -i -X PUT -H 'Content-Type: application/json'
-H 'Progress-Generation: 0' -d '{"60":{}}' http://127.0.0.1:8590/api/progress`,
then `-H 'X-Visitor-Key: <key>'` on `GET /api/state`; with a token too,
`POST /api/visitor/move` moves it into that person's account. The built app
on that copy does the same in the browser: with the switch off it opens
without the IAM, keeps the key in localStorage (`piano-academy:visitor`) and
moves it at the next sign-in; the notice under the bar on Learn and Stats
says how long the progress is kept, and the shell says what came with a
sign-in. To try the switch mid-session there, give the copy a short memory
of the IAM's answer (`testenv.php ... --application-ttl=1`, as the browser
check does). The limits and the trusted proxies: an optional
`<folder>/visitors.local.php` (`config/config.php` shows its shape; without
it Cloudflare's ranges are the trusted proxies - a request from this
computer is counted by its own address, whatever header it sends); visitors
unseen 30 days are swept after an answer (the marker is the folder's
`storage/visitors-swept`). The origin secret's `config/cloudflare.local.php`
is for the host behind Cloudflare (*The library's PHP 0.5.2*): a computer of
yours needs none.

### The browser check

The app in a real browser, signed in through the family's stand-in IAM, on a
throwaway database - committed, and run after anything a page shows changes
(the skill `.claude/skills/check-in-browser/` says what it covers):

```bash
# from the repository's root; PHP: the 8.2+ binary (Git Bash's `php` may be older)
PHP=/path/to/php node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep] [--measure]
```

It builds the frontend, makes `piano_test_browser_<port>` from the tests'
template, starts the stand-in IAM on 8597 (its key from the library's
`TestIam`) and the built app on 8590
(`SITE_PORT` / `IAM_PORT` when another check holds them), drives headless
Edge (`BROWSER=chrome` for Chrome) through `playwright-core` - installed once
into `<temp>/pw`, never into `frontend/` - and stops and drops everything at
the end, also when a check fails. `--keep` keeps the screenshots (the path
is printed): look at them. `--measure` prints what the top bar's row needs
in English and Slovak - how `PHONE_BAR_MAX` and the admin panel's
`ADMIN_PHONE_BAR_MAX` were chosen.

### Testing without a piano

Every practice view listens to `window.pianoMIDI`, so a synthetic key press
does what the piano would:

```js
window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', {
  detail: { midi: 60, velocity: 90, timestamp: performance.now() },
}));
```

Read the staff with `.vf-stavenote[data-midi]` (in play order), and the clicks
of a run in time from `window.pianoPlayer.expectedTimes`. The project skill has
the details.

## Building and deploying

The hosting is FTP only: PHP and PostgreSQL, Apache with `.htaccess`, no shell.

```bash
cd backend
php tools/build.php                # -> dist/ at the top of the repository
```

It builds the frontend (`npm ci` if needed, then `npm run build`) and puts
together one folder whose contents go into the site's web root: the app, its
`.htaccess` (routing, closed folders, security headers), `setup.php`, `api/`,
`config/` (the loader only), `migrations/`, `vendor/` and an empty `storage/`.
No settings file, no progress, no tests or tools.

1. In the hosting panel: a PostgreSQL database and its user, and **HTTPS** for
   the site - the browser lets a page use the piano (Web MIDI) only over HTTPS.
2. Upload everything in `dist/` into the web root (the folder `piano.anotoki.eu`
   points at). PHP must be able to write into `config/` and `storage/`.
3. Open `https://piano.anotoki.eu/setup.php`. On a real host it asks for a
   token it wrote into `storage/setup-token.php` - read it with your FTP
   program. Enter the database and the IAM (`https://iam.anotoki.eu`, client id
   `piano-academy`). **Install** writes the settings, makes the tables, writes
   `storage/installed.lock`, and deletes the token and itself.
4. Sign in on the site.

**Later versions**: build and upload again (the settings and the lock stay). A
version with a new migration: sign in as an administrator and apply it in the
app (the admin panel's **Migrations** page, `/admin/migrations`: what is
pending and applied, each file's SQL, and "Apply pending" - while an update
waits it is the one page that runs for an administrator; the page everybody
else sees then, "The site is being updated", says to an ADMIN that a
database update is waiting and links to it) - or run the setup page once
more: delete `storage/installed.lock`, and open `/setup.php` (the upload
carries it) with the same details. Either applies what is missing and keeps
everybody's progress; on a host the setup page shows nothing that is saved (a
blank password keeps the saved one). Once installed the site never offers
the setup page again - the lock is how it knows.

### Releasing the app's words

The translation migrations (002 the tables, 003 the strings; later ones the
same way) touch nobody's progress - a test holds them to it. They reach a
database only with a released version, by the owner's own hand.

1. **The dump comes first**, before anything applies the migration (the
   Apply itself makes one more since 0.4.1 - the library's before-migration
   backup in `storage/backups/`, also from `/setup.php` and `php
   migration.php`; your own dumps there stay as they are). In
   `backend/`, with the server, port and user of
   `config/database.local.php` (`pg_dump` asks for the password; on Windows it
   is in `C:\Program Files\PostgreSQL\<version>\bin\`; make
   `storage/backups/` first if it is missing - `storage/` is gitignored):

   ```bash
   pg_dump --host=localhost --port=5432 --username=postgres --format=custom --file=storage/backups/anotoki_piano_academy-before-update.dump anotoki_piano_academy
   ```

   To go back: `pg_restore --host=localhost --port=5432 --username=postgres --clean --if-exists --dbname=anotoki_piano_academy storage/backups/anotoki_piano_academy-before-update.dump`.
2. **The encoding**: `SHOW server_encoding;` must answer `UTF8` on your
   database and on the host's (psql, or the hosting panel's database tool).
   002 refuses anything else with a sentence saying so; such a database has to
   be made again with the encoding UTF8.
3. **Your own computer**: `/setup.php` with your database entered (Save), or
   `php migration.php`, or an administrator's update in the app. If one
   fails, it names the file and the error (the app's update: the server log
   has the error). A file is applied all or nothing, and the earlier version
   starts again on the same database (an applied migration the code does not
   know stops nothing).
4. **The host**: in the browser, export both languages first (Translations,
   each language's export) - your rewordings, kept. Then upload and apply the
   migration **at once** - as an ADMIN, "Apply pending" on the admin panel's
   Migrations page (the page that says the site is being updated links an
   ADMIN to it), or delete `storage/installed.lock` and run `/setup.php`:
   until then every visitor reads "The site is being updated". So the strings
   of a release are collected into **one** migration.

**Version 0.2 (the anotoki family's work, migration 004)**: 004 is applied
in the owner's database on this computer (2026-10-05). On the host in this
order: upload the build, apply 004 at once (as above), then the IAM's
migrations (007 ... 010: EDITOR; MEMBER for every account again, and the
per-site "Sign-in required" switch and "Roles that may sign in").

**Visitors (migration 005, 2026-10-05, not applied anywhere yet)**: the owner
applies it at the hand-over, after a `pg_dump` - on this computer by Save on
`/setup.php`, `php migration.php` or "Apply pending" on the Migrations page;
on the host: upload the build, apply 005 at once (until then the site says
it is being updated), then the IAM's migrations. It changes no row of anybody's
(it rewrites the check on `users.id` so a negative id is a visitor's; every
row there passes). Then, only if wanted, switch Piano Academy's "Sign-in
required" off in the IAM's admin panel. On the host check once that the
`X-Visitor-Key` header reaches PHP (Apache passes `X-*` headers; a save
without a token answers one). The site is behind Cloudflare's proxy, and
since the library's 0.5.0 its published ranges are the committed trusted
proxies (`CLIENT_ADDRESS_TRUSTED_PROXIES` in `config/config.php`): a visitor
is counted by the address Cloudflare names in CF-Connecting-IP - the one
header ever read, pinned in code (X-Real-IP, True-Client-IP and
X-Forwarded-For are the visitor's own words) - never by Cloudflare's own;
with the origin secret (`config/cloudflare.local.php`, *The library's PHP
0.5.2*, below), only on a request that carries it. A
host that is not behind Cloudflare says so in `config/visitors.local.php`,
put there by FTP (never written by setup): `'client_address' =>
['trusted_proxies' => []]` - or another proxy's ranges (one that writes
CF-Connecting-IP); a range wider than /8 (IPv4) or /16 (IPv6) is refused and
said in PHP's error log. Watch the
People page's visitors line; the same file lowers the limits
(`max_visitors`, `new_per_hour`, ...).

**The account's theme, dates and clock (migration 006, 2026-10-06, not
applied anywhere yet)**: two sentences (`theme.notSaved`,
`language.notSaved`), words only - applied with 005 at the hand-over, the
same way (one Apply takes both). The frontend vendors the IAM's browser SDK
1.2.0 and follows the account's preferences once the IAM has its migration
015 - in either order: with an IAM before 015 the app keeps its own theme,
dates and language order (this browser's choice first) and saves nothing to
the account; from then on a signed-in person reads the account's language
before this browser's choice. On the host the browser reaches
`{issuer}/api/oidc/preferences` cross-origin (the upload's `connect-src`
allows `https:`).

**The family's library and its pages (migration 007, 2026-10-07, not
applied anywhere yet)**: the build carries `anotoki-lib` (the PHP half
0.1.0, the Angular half 0.1.1: the engine, the gate, the pages of a site
that is not ready - see *While the site is not ready*) in place of the
app's own "not set up yet" card, whose four words 007 deletes
(`boot.notSetUp.*`; nothing else). It goes with 005 and 006 at the
hand-over - one Apply takes all three. Nothing to do on the host beyond the
upload and that Apply; the bookkeeping table stays as it is.

**The family's kit (migration 008, 2026-10-08, not applied anywhere yet)**:
the build carries `@anotoki/lib` 0.2.0 (the PHP half stays 0.1.0, nothing
to do in `vendor/`): the family's top bar, theme switch, language chooser,
menus and questions, and Manrope. Its theme switch (light / dark / as the
device is set) takes the place of the round theme button, whose three
spoken words 008 deletes (`theme.autoSpoken`, `theme.lightSpoken`,
`theme.darkSpoken`); it also tells the descriptions of `theme.light`,
`theme.dark`, `theme.auto` and `theme.notSaved` of the switch - the strings
themselves, as the owner worded them, stay. It goes with 005, 006 and 007
at the hand-over - one Apply takes all four. The family's words the app has
no string of are the kit's own (English and informal Slovak), not in the
database.

**The words through the family's library (migration 009, 2026-10-11, not
applied anywhere yet)**: the build carries `anotoki-lib` 0.3.0 - both halves
(`vendor/anotoki/lib` and `@anotoki/lib`): the bundle, the admin panel's
routes and pages and the command line are the library's, in the IAM's wire
format (snake_case). 009 copies the app's strings of the 17 keys the family's
kit said (`topbar.account`, `theme.light`, `language.button`...) under the
library's keys (`anotoki.topbar.account`...) - every language, as the owner
worded it, with who saved it and when - and deletes the 15 only the kit asked
for (`common.loading` and `signIn.button` stay the app's too); its gate fails
loudly if one string did not arrive as it was. The library's own two files
(`anotoki_translations/001_languages_and_strings.sql`, which proves the
tables' shape and makes nothing here, and `002_library_words.sql`, its 54
words - written only where a key has no string, so 009's copies stay) run
right after it, in the same Apply. It all goes with 005 to 008 at the
hand-over - one Apply takes the five and the library's two. An export of
the words made before 009 still names the keys it deleted, and an import
takes a file whole or not at all: import such a file before 009, or take
those keys out of it (their strings are under `anotoki.*` since).

**Signing in, people and the admin tools through the family's library
(migrations 010 and 011, 2026-10-11, not applied anywhere yet)**: the
build carries `anotoki-lib` 0.4.1 - both halves: signing in (the vendored
SDKs are gone), the People page with the scrub of the accounts the IAM
deleted, and the admin tools (the error log, the audit log, feedback,
backups - the site's ADMIN alone). 010 adds `users.anonymized_at` and
nothing else (its gate: the column, nullable, and no visitor's row with a
time in it). 011 copies the sign-in card's three failure sentences
(`signIn.notCompleted`, `signIn.failed`, `signIn.storageUnavailable`) under
the library's keys - every language, as the owner worded them, with who
saved them and when - and deletes the card's five keys (`signIn.button`
stays); its gate fails loudly if one string did not arrive as it was. The
library's own files run around them in the same Apply:
`anotoki_admin/001_audit_log.sql` and `002_feedback.sql` first, then after
011 `anotoki_translations/003_sign_in_words.sql`,
`004_feedback_words.sql` and `anotoki_people/001_people.sql`. It all goes
with 005 to 009 at the hand-over - one Apply. On the host, `storage/logs/`
and `storage/backups/` are made by PHP inside `storage/` (closed to the web
by the upload's `.htaccess`): PHP must be able to write there. The first
answer of each UTC day makes the daily backup, after it is sent.

**The library's 0.5.0 (2026-10-12; no migration of this app's, none of the
library's)**: the build carries `anotoki-lib` 0.5.0 - both halves. Upload it
and nothing waits to be applied; the host needs PHP's `mbstring` (and
`zlib` for the backups). What changes:

- **A restore does again what was deleted since its backup**: every person
  deleted on the People page and every feedback message deleted is deleted
  again inside the restore, before anybody sees the rows, and every progress
  takes a new generation there too (a tab open since before is refused its
  next save); once it committed the scrub of the IAM's deleted accounts
  runs. A restore that cannot do a delete again is rolled back whole.
- **Backups are sealed**: each plain backup carries an HMAC under this
  installation's key (`storage/anotoki-lib.key` - never delete it: without it
  no backup made here restores here), and only a sealed one is restored on
  the Backups page. **A backup made before 0.5.0 has no seal** and is
  restored offline only: download it (Backups, Download), unpack it
  (`tail -n +3 <file>.anotoki-backup | tar -xz` - the manifest, the schema
  files of each applied migration, and each table's rows in COPY's text
  format), load the schema files into an empty database in the manifest's
  order and then each table, in the order of the data files' numbers, with
  `psql`'s `\copy <table> FROM '<file>'` (the library's README, "Backups").
  Nothing is public yet, so simply make a new backup right after the update.
  The backups' files are PHP's own user's alone (`0600`): where PHP runs as
  another user than the FTP account, the FTP program cannot read
  `storage/backups/` - take a backup off the server with the Backups page's
  Download.
- **The pages' own errors reach the Error log** (`source: client`), scrubbed
  in the page and again on the server, a few a page load; `POST
  /api/client-errors` answers 204.
- **Feedback's reply address** is what the form sends: the account's is
  written into the form for somebody signed in, who may keep, change or
  clear it.

**Mended in the library's 0.5.1**: under 0.5.0 a restore failed (`500
restore_failed`, "setval: value 0 is out of bounds for sequence visitor_ids",
nothing restored) on a database where a visitor was ever made - it moved the
visitors' sequence, which counts down, the wrong way. Since 0.5.1 a restore
moves every sequence one of its own steps past the later value, in its own
direction (`admin-tools.test.php`'s restore with visitors).

**The library's PHP 0.5.2 (2026-10-13; no migration; the frontend stays on
0.5.0)**: the origin secret (the owner's decision of 2026-10-13,
`docs/decisions.md`). Cloudflare's ranges are every Cloudflare customer's:
anybody's Worker can connect to the host from them and write the
CF-Connecting-IP it likes, a new address every time. So, in this order:

1. In Cloudflare: Rules -> Transform Rules -> Modify Request Header ->
   "Set static" `X-Anotoki-Origin` to the secret (a long random value, 32+
   characters), for every request of the zone - one rule for every anotoki
   site; an app without the secret pays it no heed.
2. On the host, by FTP (never written or read by setup, never in the build):
   `config/cloudflare.local.php` -
   `<?php return ['origin_secret' => '<the same value>'];` - the same file in
   every anotoki site. Keep a copy off the server.

From then on CF-Connecting-IP is believed only on a request that carries the
secret; any other request from Cloudflare counts as its edge (coarser, never
looser). Without the file the app believes CF-Connecting-IP from the trusted
proxies alone, as before - **deleting the file is the one way to switch the
secret off. A file that is there but yields no usable secret fails closed**
(since 2026-10-18, the family's rule): one that does not start with `<?php`
(no `<?php` line, a byte-order mark or a line before it - never compiled, so
not even a `declare(strict_types=1)` after such a start stops the site),
one that prints anything when PHP reads it (text after a closing tag) or
that PHP cannot parse, run or open - and one read cleanly that names no
secret: an empty value, only spaces, a misspelt or another key, a value
that is not text, no array (anything in the file's place counts as the
file, a folder too). It stands for a secret no request carries, so every
request from Cloudflare counts as its edge until the file is mended - its
owner meant a secret, and a slip in the file never switches the check off.
The site runs on, and PHP's error log says so at most once a day (a stamp
in `storage/cache`), by the fault alone - `[config]
config/cloudflare.local.php does not start with <?php (...)`, `... could not
be read (ParseError on line 2)` or `... holds no origin_secret (a string with
something in it): no request carries its secret ...` - never the file's
text. To change the secret, change the rule first, then the file (between
the two, visitors count as their edge). The secret is never printed or
logged.

**Terms, Privacy and Contact (migration 012, 2026-10-18, not applied
anywhere yet; the library's 0.6.2)**: the build carries `anotoki-lib` 0.6.2 -
both halves: the family's legal pages on `/terms`, `/privacy` and `/contact`
(anybody's, signed in or not), Terms · Privacy · Contact under every page,
and the kit's chips, stat tiles, step dots and highlighted card in place of
Piano's own. 012 adds the pages' words of this app's - what Piano Academy is,
each part it keeps, why and for how long, its stored items' purposes, the
tabs' titles, a lesson's steps' name for a screen reader: 43 keys, English
and informal Slovak, none of them an address -, rewords `brand.area`'s
description and deletes `whatsNew.notLoaded` (no page can show it any
more); its gate fails loudly if a key lacks its English or its Slovak, the
deleted key is still there, or `brand.area`'s description does not tell of
the legal pages. The library's `anotoki_translations/005_legal_words.sql`
to `011_privacy_words_made_true.sql` run right after it in the same Apply
(the legal pages' own words and the kit pieces' - 257 `anotoki.*` keys in
all; 011 rewords three Privacy sentences, each only while it is still the
library's first wording - Piano words two of them itself, the backups and
the sign-in's storage).
It all goes with 005 to 011 at the hand-over - one Apply. The hosting company
is named (WebSupport s.r.o., the owner's word of 2026-10-18: `{ preset:
'hosting' }` in `frontend/src/app/core/legal/legal-facts.ts`); before the site
is public the owner confirms the facts `docs/decisions.md` (2026-10-18) lists.

**The family's footer (migration 013, 2026-10-18, after the deploy; the
library's 0.6.3)**: the build carries `anotoki-lib` 0.8.0 - both halves. The
foot of every page, the admin panel's too, is the family's footer
(`<anotoki-site-footer>`, the build analyzer's): "v0.4.0 · What's new ·
Feedback" (a screen reader hears "Version 0.4.0") - the version and What's new
once `changelog.json` came, What's
new opening the app's own dialog, Feedback the family's form - then Terms ·
Privacy · Contact. The app's frame - the bar, the notes under it, the page,
the footer - is the gate's marked template, so while the site is not ready
the family's status page stands alone in a `<main>` of its own, with no bar
and no footer (an ADMIN's Migrations page keeps them). 013 deletes the old
footer's one word, `footer.whatsNew` (its version button's tooltip), and
tells `whatsNew.title`'s description where the dialog opens from now; its
gate fails loudly if a `footer.*` key or string is left, or the description
does not tell of the family's footer. The library's
`anotoki_translations/012_footer_words.sql` (the footer's four words, 261
`anotoki.*` keys in all) runs right after it in the same Apply; until then
the footer says the library's built-in words. It all goes with 005 to 012 at
the hand-over - one Apply. The web root's `.htaccess` lets the host check
run too (`host-check.php`, by its exact name, while it is there - README,
*Hosting checklist*).

**About and Support (2026-10-19; the library's 0.8.0)**: the family's About
and Support pages on `/about` and `/support` - anybody's, in the legal pages'
frame, drawn whatever the start says - and About · Support first among the
footer's links. No migration of the app's: the library's
`anotoki_translations/013_about_and_support_words.sql` (the two pages' words,
the footer's two links and the feedback form's Clear) runs in the same Apply,
after the app's own; until then the pages and the links say the library's
built-in words.

Strings the owner reworded in the browser survive every later migration
(each insert is `ON CONFLICT DO NOTHING`); a string reworded in the code
after release needs an `UPDATE` in its migration. The two databases (your
computer, the host) each hold their own strings: export and import - on the
Translations page or with `tools/translations.php` - are the bridge. After a
release, a new or reworded string is a new migration, and a new string of the
shell also goes into `core/i18n/kept-english.ts`.

If a whole site answers "500 Internal Server Error" after an upload, the host
may not allow a line of `.htaccess` (`Options -Indexes` or `CGIPassAuth`):
remove that line. To move a person's progress to another IAM user id, on a
computer with a shell: `php tools/progress.php --move=FROM --to=TO`; on the
host, in the hosting panel's database tool, `UPDATE users SET id = <to> WHERE
id = <from>;` - all of that person's data moves with it (delete an empty row
of the new id first, if there is one).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "This site is not set up yet" (or, once installed, "The site is not available right now"); the API answers 503 `not_set_up` | The setup page has not run, or a `config/*.local.php` is missing - or it cannot be read cleanly (edited by hand? the PHP error log says once a day `[config] config/....local.php could not be read (ParseError on line N)`, or `... does not start with <?php (...)` for a byte-order mark, a blank line or a missing `<?php` line - never compiled, so never a 500 -, or `... prints N bytes of its own` for text after a closing tag - what it printed is never sent; save it again as UTF-8 without a BOM, or Save on the setup page). On a host the setup page is offered only while `storage/installed.lock` is not there. |
| "The site is being updated"; the API answers 503 `update_pending` | A migration waits: an ADMIN applies it on the admin panel's Migrations page (sign in from that page), or `php migration.php`, or the setup page. The sign-in, the words and `/api/health` answer meanwhile. |
| "The site is not available right now", and it does not come back | The database cannot be reached (`GET /api/site-status` says `unavailable`): is PostgreSQL running, do the settings name it? |
| The visitors' limits trip early, every visitor counted as one; PHP's error log says `[config] config/cloudflare.local.php ...: no request carries its secret` | The origin secret's file yields no usable secret - it cannot be read cleanly (a byte-order mark, a line before `<?php`, a typo PHP cannot parse), or it names none (an empty value, a misspelt key, a value that is not text): it fails closed, so every request from Cloudflare counts as its edge. Mend the file, or delete it to switch the secret off (*The library's PHP 0.5.2*). |
| The host check answers 403 | The upload is from before 2026-10-18, whose `.htaccess` let `setup.php` alone run: upload this version first (README, *Hosting checklist*). |
| The setup page asks for a token on this computer | It was not asked as `localhost` / `127.0.0.1` straight from PHP's built-in server: a LAN address, another name, or a proxy that adds forwarding headers makes it a real host's install. |
| 403 `forbidden` on `/api/admin/...` | The account has no role of Piano Academy in the IAM (EDITOR for the words, ADMIN for languages, the people, the admin tools and the database) - or the token was issued before the role was given: sign in again. |
| 403 `reauth_required` on a backup | A backup is made, downloaded, deleted or restored only after a sign-in of the last ten minutes: the Backups page offers "Sign in again". |
| A backup's Restore is off; 422 `archive_invalid` "It carries no seal of this site's" | It was made before the library's 0.5.0, made elsewhere, or changed since: it is restored offline only (*The library's 0.5.0*, above). |
| 500 `restore_failed` "setval: value 0 is out of bounds for sequence visitor_ids" | The library's 0.5.0 cannot restore a database where a visitor was ever made (its restore moves that sequence the wrong way): nothing was restored. A later release of the library mends it. |
| 409 `busy` / "Another database update is running" | The setup page, `php migration.php` and the app's update take one lock: wait for the other to finish. |
| 428 `generation_required` on `PUT /api/progress` or `/api/path` | Something saves without `Progress-Generation` - never this frontend (it sends no save without one): an old build in the browser's cache, or a script of your own. Load the page again. The app shows it as "Not saved yet": when every save gets it, something between the browser and PHP drops the header - let `Progress-Generation` through. |
| 409 `progress_changed` on a save, and the note "Your progress was replaced or deleted somewhere else" | Right: the progress was imported in another tab (or on another computer) or deleted by an administrator since this page loaded it. The page has loaded it again; nothing old was saved over it. |
| Opening the app goes straight to the IAM | Right: every page signs in first. After a refused or cancelled sign-in the app shows the family's page "Signing in did not work" (`/sign-in-failed`) instead, with the reason, Try again and a way back. |
| `/admin/languages`, `/people`, `/migrations` or an admin tool opens the start page | The account is an EDITOR, not an ADMIN, of Piano Academy (or the token is from before the role: sign in again). |
| 409 `export_too_large` | The person's progress is over `EXPORT_LIMIT` (5 MiB): export it with `php tools/progress.php --export`, which has no limit. |
| The app loads but every call fails | The backend on :8300 is not running, or was started without `router.php`. |
| Signing in bounces back with an error | The IAM does not know this address: use `http://localhost:4500`, which it registers for Piano Academy. |
| "Your sign-in has run out" on every request | The issuer in `config/auth.local.php` is not exactly the IAM's address, or the backend cannot reach `{issuer}/.well-known/jwks.json`. |
| The piano is not offered | Not Chrome or Edge, or not a secure page (`https://`, or `http://localhost` / `127.0.0.1`), or the browser was not allowed to use MIDI devices. |
| `tests/run.php` stops before any test | No `config/database.local.php` to borrow the PostgreSQL server from: run the setup first. |
| "The database update ... failed" | A migration failed (`php migration.php` and the setup page name the file and the error; the Migrations page names the file and shows the error, word for word). Restore the dump or start the earlier version, which runs on the same database. A database that is not UTF8 is refused by 002 with a sentence saying so. |
| A word on the page looks like `home.title` | That key has no string in the database: a migration is missing, or the key is new. `php tools/translations.php --status` names it. |
| The Translations page says "Apply the pending database update first"; `/api/translations/en` answers 503 `translations_unavailable` | The words' tables, or their English, are not there yet - a fresh database before its first Apply: apply what is pending (the pages read the English kept in code meanwhile). |
