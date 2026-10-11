# Piano Academy - the backend

The app's API: PHP 8.2+ with Slim 4 on PostgreSQL, signing people in through
the anotoki IAM (client `piano-academy`). It keeps each person's progress and
the app's own words; all the music logic is the frontend's. How it works and
why is in [`../docs/`](../docs/README.md) - [the API](../docs/api.md) route by
route, [the architecture](../docs/architecture.md); setting it up and running
it in [`../DEV.md`](../DEV.md).

## Layout

```
api/
  index.php            the front controller: buildPianoApp() - security headers, error handler,
                       the site's gate (anotoki/lib's SiteGate: 503 not_set_up, 503 update_pending but
                       for siteOpenPaths() - the bundle's TranslationsRoutes::openPath() among them), the routes
  bootstrap.php        what every entry point loads: PHP >= 8.2, settings, error handling, the app's functions
  routes/              public.php (health, sign-in settings, a language's strings - the library's
                       TranslationsRoutes::bundle(), no token read -, and GET /api/site-status),
                       progress.php (one's own progress - a person's, or a visitor's while sign-in is not
                       required (requireOwner) - and one's own file: /api/me/export, /api/me/import - signed in),
                       visitor.php (POST /api/visitor/move: at sign-in, a visitor's progress into the account),
                       admin.php (/api/admin/...: the strings - anotoki/lib's TranslationsRoutes::strings(), EDITOR /
                       ADMIN; the languages - TranslationsRoutes::languages(), ADMIN; the people, ADMIN;
                       the Migrations page's routes - anotoki/lib's MigrationsRoutes::admin(), ADMIN, open while
                       an update waits)
  meddleware/          security.php, auth.php
                       (requireUser, requireRole, signedInUser - never a visitor -, currentUser; requireOwner -
                       with the move, the only reader of the visitor key)
  migrations.php       the migrations through the anotoki family's engine (anotoki/lib's Migrator):
                       databaseMigrator() - the sets (migrationSets(): this app's, then the library's
                       anotoki_translations; migrationLabel() names a file with its set), the one lock every
                       update takes (DATABASE_UPDATE_LOCK), the first runner's migrations(name) adopted in its
                       prepare hook -, migrationFiles(), and siteState() - where the site stands, for the gate
                       and the status route
  auth.php             the IAM token -> SiteUser {id, name, roles, visitor} (Bearer only); ROLE_ADMIN, ROLE_EDITOR,
                       ROLES_STAFF; authLoginRequired() - the IAM's "Sign-in required" (the SDK's reader);
                       isThisComputer() for setup.php
  anotoki_iam.php      the IAM's PHP SDK 1.1.0 - the token verifier and the switch's reader - vendored
                       byte for byte (never edited here)
  store.php            one person's progress, path and sessions - every query scoped to their id; the
                       generation of their progress (Progress-Generation, 409 progress_changed)
  transfer.php         one person's data as an export file and back (EXPORT_LIMIT both ways, a dry run,
                       replacing only when asked); moving it to another id
  people.php           an administrator's: the people with their counts (the visitors counted apart), one person
                       deleted whole
  visitors.php         visitors (sign-in not required, migration 005): the key, finding, making (inside the save's
                       transaction, the limits), the move at sign-in (visitorMove: notes, path steps merged per
                       step, rounds), the sweep after the answer
  client_address.php   the address a request is counted by (trusted proxies, an IPv6 /64)
  after_response.php   work after the answer (the sweep): afterResponse(), afterResponseRun()
  translations.php     the app's words through anotoki/lib's Translations: translations() (the released
                       languages, en and sk), translationsRefused() (a refusal in this app's {error, code}),
                       translationsWriter() (who saves: the token's id)
  helpers.php, db.php  (db.php also ensureDatabase(): the database made when it may be)
config/
  config.php           reads database.local.php and auth.local.php - both written by setup.php,
                       gitignored, never committed - and the optional visitors.local.php (the visitors'
                       limits, the trusted proxies; never written by setup)
migrations/piano_academy/   the schema and the app's strings, NNN_name.sql (never edit an applied one)
storage/               cache/ (the IAM's keys), on a host the setup token and lock; gitignored
tests/                 run.php, lib.php; unit/, api/; tools/ (testdb.php, testenv.php, fake-iam.php)
tools/                 build.php (the upload -> ../dist/), progress.php, translations.php (the library's
                       TranslationsCommand), translation_keys.php (the library's KeyScanner set up for the
                       frontend: what it reads, dynamic-keys.ts, the kept English)
vendor/                Slim and its pieces, and anotoki/lib (the anotoki family's library, from GitHub:
                       composer.json's VCS repository) - committed: the hosting cannot run Composer
```

`anotoki/lib` is the PHP half of the family's library (the Angular half is the
frontend's `@anotoki/lib`; one version for both - 0.3.0, both halves: the
engine and the gate, and the words - `Anotoki\Lib\Translations` with its
migration set `anotoki_translations`, run after this app's own). To update it: `composer update
anotoki/lib --prefer-dist` (its CHANGELOG.md first; the constraint in
`composer.json` when the version needs it), commit what changed in
`vendor/`, and update the frontend's half to the same version (DEV.md).

## Entry points

| File | What |
| --- | --- |
| `router.php` | `php -S` behaving like the hosting's Apache: `/api/*` to `api/index.php`, `/setup.php`, and the built frontend when there is one |
| `setup.php` | the setup page: the database (host, port 5432, name `anotoki_piano`, user, password) and the IAM (address, client id); on this computer re-runnable, on a host with a token, locked after. Stays parseable by PHP 7.4 |
| `migration.php` | `php migration.php [--status \| --dry-run]`: the migrations for the configured database, with the family's engine, under the update lock |
| `tools/progress.php` | an operator's: `--export=FILE --user=ID`, `--import=FILE --user=ID [--replace]`, `--move=FROM --to=TO` (no size limit) |
| `tools/translations.php` | the library's command: `--status` (the frontend's keys against the database), `--export sk [FILE]`, `--import sk FILE` |
| `tools/build.php` | the upload for the FTP-only hosting -> `../dist/` (builds the frontend too) |

## Commands

```bash
composer start                                # php -S localhost:8300 router.php - the API and setup.php
php tests/run.php                             # every PHP test, on throwaway piano_test_* databases
php tests/tools/testdb.php template --fresh   # after editing a migration the tests' template has applied
php migration.php [--status|--dry-run]
php tools/translations.php --status
php tools/build.php
```

The Bash `php` on the owner's computer may be an older one: use a PHP 8.2+
binary for the tests (any PHP that runs `run.php` runs every file).

## Tests

`php tests/run.php`: each file in its own PHP process, four at a time, each on
its own throwaway database copied from `piano_test_template`, with settings of
its own (`PIANO_TEST_CONFIG`, honoured only for `piano_test_` databases). They
borrow only the PostgreSQL server and user of `config/database.local.php`.
Sign-in is always the IAM's: tokens the tests sign with their own key
(`test_token($id, $roles)` - no roles is a learner, and so is MEMBER), and the
stand-in IAM `tests/tools/fake-iam.php` for a whole sign-in, a downloaded key set,
the IAM's switch and the account's preferences (the claim while its state has
some; `POST /api/oidc/preferences`, as the browser SDK 1.2.0 saves them). No test asks a real IAM: the switch's answer is a file
(`test_application_file()`, `test_login_required()`) or the stand-in's;
`test_offline_auth()` refuses settings that would ask anything else.

| File | What it holds |
| --- | --- |
| `unit/auth` | this computer (setup.php's no-token mode), the browser's sign-in settings and the switch, only Bearer a sign-in, roles (MEMBER a learner), the key cache, no test asking an IAM off this computer |
| `unit/config` | not set up without the files; an old file with a mode and an owner's id still works; a file PHP cannot run is no setting (named with its line, never with what PHP said); the tests' folder only for `piano_test_` |
| `unit/migrations` | the engine as the app sets it up (every file once, in order, nothing written to find out, the one lock - busy; the folder as the engine lists it); `php migration.php` building a database from nothing (`--status`, `--dry-run` only read); the first runner's `migrations(name)` read and renamed; a failing file rolled back whole and named; 004's schema part (the progress generation, and nothing else of 001), its gate; its header says it is finished and frozen once applied; 005's visitors (no row changes, what the new check lets in), 004 and 005 run again over visitors, 005's gate; 006's header (words only, the next change is 007); 007 (the card's four words gone, nothing else, its gate); 008 (the round theme button's three spoken words gone, the theme's other descriptions told of the switch and their strings kept, nothing else, again and again, its gate); 009 (its header, words only; on a database as its owner left it - a rewording, a string of somebody's - every string the kit said under the library's key with its writer and time, the library's own 002 leaving them be; again, and over a later rewording; a string it could not move refused, rolled back whole) |
| `unit/visitors` | the counted address (trusted proxies, IPv6 /64), visitors.local.php and the limits, the key, the 30 days equal in the frontend, the work after the answer |
| `unit/transfer` | an export into an account, replacing (never a mix), a new generation each time, `not_an_export` / `invalid_export`, a move, `tools/progress.php` (`--replace`) |
| `unit/translations` | the seeded strings, the migrations' layout, the key scan as this app sets the library's up; the library's set after this app's own, its keys `anotoki.*`; the kept English (and the library's words it says its own way) equal to the database's; every stored string passing the library's checks |
| `api/api` | the progress routes through the router, signed in as a learner (a save names the generation it loaded); 401s; not set up; behind (503 `update_pending`) |
| `api/site` | the site's gate state by state on the real server: not set up and never installed (the setup page named), installed (never), a settings file PHP cannot run (not set up, no 500), an update waiting (503 `update_pending` with Retry-After everywhere but the open paths, which answer; nothing written; Apply makes it ready), the database out of reach, ready - and `GET /api/site-status` in each, 200 to anybody: nobody while the IAM requires a sign-in, a visitor's key, a bad or expired token, a Basic header; the IAM's switch off, the IAM out of reach |
| `api/me` | one's own file: the export, a round trip, the dry run, the replace rule, refusals with a code, the size limit both ways; a tab of before an import or a delete refused its save (409), 428 without a generation, two tabs side by side; an import holding the users row while a save and a second import wait (two servers) |
| `api/auth` | tokens good and bad (Basic is nobody), two people, a whole sign-in through the stand-in IAM, an old settings file, the key set downloaded and cached; the IAM's switch relayed, the stand-in's public route, the switch read from it (kept a minute, the last answer while it is down, 404 and nothing read = required, a signed-in request never asks); the stand-in's preferences (none at first, then the claim; the save: the preflight, a verified token, only what it names, 400 / 401 / 503) |
| `api/admin` | every admin route, role by role; People (counts, the most recently seen first, the visitors counted apart, one person deleted whole, nobody else touched, 404); the Migrations page's routes (the family's shapes: the list, a file's SQL - nothing that is not a file -, Apply) on a database behind, the lock (409 busy, `php migration.php` refused), a failed update named and logged |
| `api/visitors` | sign-in not required, through two servers: nobody's state, a first save that makes a visitor (or fails and makes nobody), the key and what it opens, a Bearer header never falling back to it, sign-in required again, the limits, the sweep after the answer, a database without 005 (every round held at the gate; `visitors_unavailable` under it), requireUser()/requireRole() refusing a visitor |
| `api/visitor_move` | the move at sign-in: the person's notes kept, a path step both have merged (a pass never lost), every round, the visitor gone and a new generation; again `found: false`; merged documents over BODY_LIMIT not made; no token / no key / a malformed key; the switch on; a row held too long (503 `visitor_move_retry`); the person's row gone |
| `api/setup` | the setup page on this computer: its fields and defaults, Test connection's sentences, Save under the lock, a re-save over an old file, a settings file PHP cannot run (named, and written anew) |
| `api/hosting` | `tools/build.php` (the family's library in the upload, the app's old engine not), the setup page on a host (token, lock, self-delete, nothing saved shown); once installed the setup page is never named again, not even with the settings gone |
| `api/translations` | the words through the library's routes: the bundle, the IAM's wire format both ways (snake_case answers, a camelCase body no language), the staff's and ADMIN's routes role by role, saves, export and import, a language deleted (200 `{strings}`), concurrency, the command line; before there is any string (`translations_unavailable`); a database with only 001 (the words not there yet, the admin routes behind the gate, nothing looked up) |

One test fails on a CRLF checkout of Windows (`unit/config`, the `.gitignore`
line match): environmental.

The browser check (`.claude/skills/check-in-browser`, DEV.md "The browser
check") uses the same tools: `tests/tools/testdb.php` and `testenv.php` for
its throwaway database and settings, `tests/tools/fake-iam.php` for the
sign-in, `router.php` for the built app.
