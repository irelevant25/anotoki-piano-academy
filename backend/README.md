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
  index.php            the front controller: buildPianoApp() - security headers, the error log, error
                       handler, the site's gate (anotoki/lib's SiteGate: 503 not_set_up, 503 update_pending but
                       for siteOpenPaths() - the bundle's TranslationsRoutes::openPath(), the error log's and the
                       backups' among them), the day's backup, the people's scrub (PeopleUpkeep), who is asking
                       (identify()), the routes
  bootstrap.php        what every entry point loads: PHP >= 8.2, settings, error handling, the app's functions
  routes/              public.php (health, sign-in settings - the library's AuthRoutes::config() -, a
                       language's strings - its TranslationsRoutes::bundle() -, GET /api/site-status: no token
                       read; POST /api/feedback, the form - its FeedbackRoutes::public(); POST
                       /api/client-errors, a page's own error into the error log - its
                       ErrorLogRoutes::client()),
                       progress.php (one's own progress - a person's, or a visitor's while sign-in is not
                       required (requireOwner) - and one's own file: /api/me/export, /api/me/import - signed in),
                       visitor.php (POST /api/visitor/move: at sign-in, a visitor's progress into the account),
                       admin.php (/api/admin/...: the strings - anotoki/lib's TranslationsRoutes::strings(), EDITOR /
                       ADMIN; the languages - TranslationsRoutes::languages(), ADMIN; the people - its
                       PeopleRoutes::admin(), ADMIN; the Migrations page's routes - its MigrationsRoutes::admin(),
                       ADMIN, open while an update waits; the admin tools - ErrorLogRoutes, AuditRoutes,
                       FeedbackRoutes, BackupsRoutes, ADMIN - and a backup's download, its ticket the check)
  meddleware/          security.php, auth.php (the library's Identify as this app stacks it - identify(),
                       publicPaths() -, requireUser, requireRole, adminByToken - the token alone, nobody
                       recorded -, requireOwner - the person, else the visitor, else nobody as the route says -,
                       currentUser)
  migrations.php       the migrations through the anotoki family's engine (anotoki/lib's Migrator):
                       databaseMigrator() - the sets (migrationSets(): the library's anotoki_admin, this
                       app's, then the library's anotoki_translations and anotoki_people; migrationLabel()
                       names a file with its set), the one lock every
                       update takes (DATABASE_UPDATE_LOCK), the first runner's migrations(name) adopted in its
                       prepare hook -, migrationFiles(), and siteState() - where the site stands, for the gate
                       and the status route
  auth.php             the IAM through the anotoki family's library (anotoki/lib's Anotoki\Lib\Auth): iamClient(),
                       signInRule() - the IAM's "Sign-in required" -, accessTokens() (Bearer only, RS256, at+jwt),
                       authRefused() (a refusal in this app's {error, code}); SiteUser {id, name, roles, visitor};
                       ROLE_ADMIN, ROLE_EDITOR, ROLES_STAFF; isThisComputer() for setup.php
  admin_tools.php      the library's admin tools, the site's ADMIN alone: adminContext() (who, ADMIN, the proof,
                       the names, the trusted proxies), errorLog() (the pages' own errors too), auditLog() /
                       audit(), feedback() (FEEDBACK_SECTIONS; no mail), backups() (daily, before an update, by
                       hand; sealed) and backupsRestoreHooks() (a restore: the deletes since its backup done
                       again, new generations, then the scrub), databaseUpdater() (the migrations with a
                       backup first)
  store.php            one person's progress, path and sessions - every query scoped to their id; the
                       generation of their progress (Progress-Generation, 409 progress_changed)
  transfer.php         one person's data as an export file and back (EXPORT_LIMIT both ways, a dry run,
                       replacing only when asked); moving it to another id
  people.php           the people through the library (Anotoki\Lib\People): people(), recordPerson() (a person's
                       users row, never a visitor's nor one the IAM deleted), the People page's counts and
                       visitors' line, one person deleted whole (peopleDelete($pdo, $id): on the connection
                       the library hands it, inside its transaction - also when a restore does it again;
                       peopleDeleteHook()), the scrub's hook (their feedback's address and browser forgotten)
  visitors.php         visitors (sign-in not required, migration 005): the key, finding, making (inside the save's
                       transaction, the limits), the move at sign-in (visitorMove: notes, path steps merged per
                       step, rounds), the sweep after the answer
  client_address.php   the address a request is counted by - the library's rule (ClientAddress): CF-Connecting-IP
                       alone (pinned) from Cloudflare's ranges - with the origin secret only on a request
                       carrying it (X-Anotoki-Origin) -, a catch-all range refused, an IPv6 /64 - and its
                       keyed hash (a pseudonym), what visitor_starts keeps
  after_response.php   work after the answer (the sweep, the scrub, the day's backup, feedback's prune):
                       afterResponse(), afterResponseRun()
  translations.php     the app's words through anotoki/lib's Translations: translations() (the released
                       languages, en and sk), translationsRefused() (a refusal in this app's {error, code}),
                       translationsWriter() (who saves: the token's id)
  helpers.php, db.php  (db.php also ensureDatabase(): the database made when it may be; its helpers take a
                       connection last, for the People delete in a restore)
config/
  config.php           reads database.local.php and auth.local.php - both written by setup.php,
                       gitignored, never committed - every *.local.php through settingsFileReadCleanly()
                       (one that does not start with <?php passed over uncompiled, what one prints caught
                       and never sent) - and the optional visitors.local.php (the visitors'
                       limits, the trusted proxies; never written by setup); CLIENT_ADDRESS_TRUSTED_PROXIES,
                       the one committed default: Cloudflare's published ranges; and the optional
                       cloudflare.local.php (the origin secret, originSecret(); never written or read by setup)
migrations/piano_academy/   the schema and the app's strings, NNN_name.sql (never edit an applied one)
storage/               cache/ (the IAM's keys and answers, the limits' counts), logs/ (the error log), backups/
                       (the library's backups; files of other names left alone), on a host the setup token and
                       lock; gitignored
tests/                 run.php, lib.php; unit/, api/; tools/ (testdb.php, testenv.php) - the stand-in IAM is the
                       library's (vendor/anotoki/lib/backend/testing/stand-in-iam.php)
tools/                 progress.php, translations.php (the library's
                       TranslationsCommand), translation_keys.php (the library's KeyScanner set up for the
                       frontend: what it reads, dynamic-keys.ts, the kept English)
vendor/                Slim and its pieces, and anotoki/lib (the anotoki family's library, from GitHub:
                       composer.json's VCS repository) - committed: the hosting cannot run Composer
```

`anotoki/lib` is the PHP half of the family's library (the Angular half is the
frontend's `@anotoki/lib`; one version for both - 0.8.1, `^0.8.0` in
`composer.json`): the
engine and the gate; the words - `Anotoki\Lib\Translations` with its
migration set `anotoki_translations`, run after this app's own (its 005 to
011 the legal pages' words and the kit's newer pieces', 012 the footer's,
013 About and Support's); signing in -
`Anotoki\Lib\Auth`; the people - `Anotoki\Lib\People`, its set
`anotoki_people`; the admin tools - the error log, the audit log, feedback
and backups, their set `anotoki_admin` run first). To update it: `composer update
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
| (the release) | anotoki-deploy (anotoki-lib's deploy tool), set up in `composer.json`'s `extra["anotoki-deploy"]`: `frontend/` and `backend/` -> `../dist/`, replaced whole on the host (`../DEV.md`) |

## Commands

```bash
composer start                                # php -S localhost:8300 router.php - the API and setup.php
php tests/run.php                             # every PHP test, on throwaway piano_test_* databases
php tests/tools/testdb.php template --fresh   # after editing a migration the tests' template has applied
php migration.php [--status|--dry-run]
php tools/translations.php --status
# the release: anotoki-deploy, from ../frontend/ (../DEV.md, Building and deploying)
```

The Bash `php` on the owner's computer may be an older one: use a PHP 8.2+
binary for the tests (any PHP that runs `run.php` runs every file).

## Tests

`php tests/run.php`: each file in its own PHP process, four at a time, each on
its own throwaway database copied from `piano_test_template`, with settings of
its own (`PIANO_TEST_CONFIG`, honoured only for `piano_test_` databases). They
borrow only the PostgreSQL server and user of `config/database.local.php`.
Sign-in is always the IAM's: tokens the tests sign with their own key (the
library's `TestIam`: `test_token($id, $roles)` - no roles is a learner, and
so is MEMBER), and the family's stand-in IAM
(`vendor/anotoki/lib/backend/testing/stand-in-iam.php`, `stand_in_iam()`) for a
whole sign-in, a downloaded key set, the IAM's switch and the account's
preferences (the claim while its state has some; `POST
/api/oidc/preferences`, as the browser saves them). No test asks a real IAM:
the switch's answer and the IAM's deleted accounts are files
(`test_application_file()`, `test_login_required()`, `test_anonymized_file()`)
or the stand-in's; `test_offline_auth()` refuses settings that would ask
anything else. `test_migrate_as_installed()` builds a database as an
installed one stood (the app's files to one, then the library's words).

| File | What it holds |
| --- | --- |
| `unit/auth` | this computer (setup.php's no-token mode), the browser's sign-in settings and the switch, only Bearer a sign-in, roles (MEMBER a learner), the key cache, no test asking an IAM off this computer |
| `unit/config` | not set up without the files; an old file with a mode and an owner's id still works; a file PHP cannot run is no setting (named with its kind and line, never with what PHP said); a file that does not start with `<?php` - no `<?php` line, a byte-order mark or a line before it, before `declare(strict_types=1)` too - is no setting either, never compiled (the password least of all printed), named by its start; one that prints as PHP reads it (text after a closing tag) none, nothing of it printed, named by its bytes; the tests' folder only for `piano_test_` |
| `unit/migrations` | the engine as the app sets it up (every file once, in order, nothing written to find out, the one lock - busy; the folder as the engine lists it); `php migration.php` building a database from nothing (`--status`, `--dry-run` only read); the first runner's `migrations(name)` read and renamed; a failing file rolled back whole and named; 004's schema part (the progress generation, and nothing else of 001), its gate; its header says it is finished and frozen once applied; 005's visitors (no row changes, what the new check lets in), 004 and 005 run again over visitors, 005's gate; 006's header (words only, the next change is 007); 007 (the card's four words gone, nothing else, its gate); 008 (the round theme button's three spoken words gone, the theme's other descriptions told of the switch and their strings kept, nothing else, again and again, its gate); 009 (its header, words only; on a database as its owner left it - a rewording, a string of somebody's - every string the kit said under the library's key with its writer and time, the library's own 002 leaving them be; again, and over a later rewording; a string it could not move refused, rolled back whole); 010 (its header; on a database as the owner's is: `users.anonymized_at` and nothing else, no row changed, the library's sets after it; again; a visitor's row with a time refused by its gate); 011 (its header, words only; on a database as the owner's is - a rewording, another language - the card's three sentences under the library's keys with their writer and time, the card's five keys gone, the library's 003 leaving them be; on today's database, 004 its last, and after the library's 003, never over a person's string; a word of the card that would stay refused, rolled back whole); 012 (its header, words only: the legal pages' 43 keys in English and Slovak, `brand.area`'s description, What's new's unreachable sentence gone, nothing else; again; its gate refusing a key without its Slovak); 013 (its header, words only: the old footer's one word gone with its strings - an owner's rewording too -, `whatsNew.title`'s description told of the family's footer, its strings kept, nothing else; again; its gate refusing a `footer.*` key that stays, or the description left as it was - rolled back whole); the library's files - its translations to 012 (anotoki-lib 0.6.3) - each once, every set in its own order |
| `unit/visitors` | the counted address as committed (Cloudflare's ranges, CF-Connecting-IP one address) and as visitors.local.php names it; the header pinned (X-Real-IP, True-Client-IP, X-Forwarded-For never believed); a catch-all range refused; the origin secret: a cloudflare.local.php read cleanly (a secret, trimmed) - and every one that yields no usable secret failing closed (a secret no request carries, a forged CF-Connecting-IP from Cloudflare's ranges the edge for this app's limits and the library's, nothing printed, said once by its kind, its start or that it names none, never its text): one that cannot be read cleanly - no `<?php` line, a byte-order mark, a line before it, a byte-order mark or a blank line before `declare(strict_types=1)` (never compiled), text after a closing tag, a buffer left open, a parse error, an error -, one read cleanly that names no secret - an empty value, only spaces, a number, a list, null, true, a misspelt key, the key in capitals, another key, no array, nothing returned -, a folder in the file's place; mended, read again; deleting the file the one way off; an IPv6 /64, a keyed hash kept, visitors.local.php and the limits (one that cannot be read cleanly - a parse error, no `<?php` line, a byte-order mark, a blank line before `declare(strict_types=1)`, text after a closing tag: the defaults, nothing printed, said once by its fault), the key, the 30 days equal in the frontend, the People delete only inside the library's transaction, the work after the answer |
| `unit/transfer` | an export into an account, replacing (never a mix), a new generation each time, `not_an_export` / `invalid_export`, a move, `tools/progress.php` (`--replace`) |
| `unit/translations` | the seeded strings, the migrations' layout, the key scan as this app sets the library's up; the library's sets around this app's own, its keys `anotoki.*`; the kept English (and the library's words it says its own way - the theme switch's, the sign-in failure's) equal to the database's; every stored string passing the library's checks |
| `api/api` | the progress routes through the router, signed in as a learner (a save names the generation it loaded); 401s; not set up; behind (503 `update_pending`) |
| `api/site` | the site's gate state by state on the real server: not set up and never installed (the setup page named), installed (never), a settings file PHP cannot run (not set up, no 500, said once), a `database.local.php` with a byte-order mark and no `<?php` line, and with a byte-order mark or a blank line before `<?php declare(strict_types=1);` (no answer carries its password or PHP's words - the status, the pages, the setup page; not set up, never a 500; nothing went out ahead of the headers, nothing compiled), an update waiting (503 `update_pending` with Retry-After everywhere but the open paths, which answer; nothing written; Apply makes it ready), the database out of reach, ready - and `GET /api/site-status` in each, 200 to anybody: nobody while the IAM requires a sign-in, a visitor's key, a bad or expired token, a Basic header; the IAM's switch off, the IAM out of reach; the error log by the library's rule - a state (`not_set_up`, `update_pending`) never a line, a 503 that is a failure (`database_unavailable`) a line |
| `api/me` | one's own file: the export, a round trip, the dry run, the replace rule, refusals with a code, the size limit both ways; a tab of before an import or a delete refused its save (409), 428 without a generation, two tabs side by side; an import holding the users row while a save and a second import wait (two servers) |
| `api/auth` | tokens good and bad (Basic is nobody, a bare Bearer `invalid_token`), two people, the users row the library's people module keeps, a whole sign-in through the family's stand-in IAM, an old settings file, the key set downloaded and cached; the IAM's switch relayed (`/api/auth/config`, snake_case), the switch read from the IAM (kept a minute, the last answer while it is down, 404 and nothing read = required, a signed-in request never asks); the stand-in's preferences (none at first, then the claim, a save, a refusal) |
| `api/admin` | every admin route, role by role - the admin tools' reads and writes too (an EDITOR refused them in ADMIN's words); People (the family's shapes: counts, the most recently seen first, the visitors counted apart, one person deleted whole - their feedback's reply address and browser too -, nobody else touched, the delete audited, 404); the Migrations page's routes (the family's shapes: the list, a file's SQL - nothing that is not a file -, Apply with a backup first) on a database behind, the lock (409 busy, `php migration.php` refused), a failed update named and logged |
| `api/admin-tools` | the day's backup (after the first good answer, once a UTC day); the error log (a 404's line - its route and path, never its query, an address or a token; the log's own routes never in it) and the pages' own errors (`POST /api/client-errors`: redacted, by who met it; 415 / 413 / 422 / a forged token writing nothing; twenty an hour from one sender, a person by their account apart); feedback (the form for everybody, who from the token alone, the reply address only as the form sends it, the honeypot, five an hour from one sender - a visitor by address, a person by account -, the admin page's count, status and delete - its entry with the message's time and its transaction); the audit log (names, the filter by a name or an id); backups (made, downloaded once, restored, deleted - each after a recent sign-in, `reauth_required` otherwise, each audited; sealed, "By" a name; a restore gives every progress a new generation - a tab of before refused its save, 409 -, does again every People delete and feedback delete since the backup, on its own connection, at once - none of before it; an unsealed backup refused; the scrub run before the answer, an unfinished one said and run by the next request); the people's scrub (the placeholder name and when, the progress kept, the feedback's address and browser forgotten, never recorded again); last, a restore with visitors in the database - failing on anotoki-lib 0.5.0, whose restore moves the visitors' sequence (counting down) the wrong way |
| `api/visitors` | sign-in not required, through two servers: nobody's state, a first save that makes a visitor (or fails and makes nobody), the key and what it opens, a Bearer header never falling back to it, sign-in required again, the limits, the sweep after the answer, a database without 005 (every round held at the gate; `visitors_unavailable` under it), requireUser()/requireRole() refusing a visitor; the attack an origin-secret file without a usable secret would let through - with a `cloudflare.local.php` whose byte-order mark comes before `<?php declare(strict_types=1);` (a 500 on every request with the five-byte check taken out), and with one read cleanly that holds the secret under a misspelt key: made-up CF-Connecting-IP addresses from Cloudflare's ranges, the file's own value carried or not, all count as the edge (the visitors' limit and the error reports' trip), the log says it once and never the secret, the site ready |
| `api/visitor_move` | the move at sign-in: the person's notes kept, a path step both have merged (a pass never lost), every round, the visitor gone and a new generation; again `found: false`; merged documents over BODY_LIMIT not made; no token / no key / a malformed key; the switch on; a row held too long (503 `visitor_move_retry`); the person's row gone |
| `api/setup` | the setup page on this computer: its fields and defaults, Test connection's sentences, Save under the lock, a re-save over an old file, a settings file PHP cannot run (named, and written anew) |
| `api/hosting` | the release anotoki-deploy builds (the family's library in it, the app's old engine not), served from `frontend/` through `tests/release_router.php`; `frontend/.htaccess` read as Apache reads it - every PHP file refused but `index.php`, `setup.php` and the host check (`host-check.php`, by its exact name; never in a build, its token empty in the repository, a path that is no file the app's route); the setup page on a host (token, lock, self-delete, nothing saved shown); once installed the setup page is never named again, not even with the settings gone |
| `api/translations` | the words through the library's routes: the bundle, the IAM's wire format both ways (snake_case answers, a camelCase body no language), the staff's and ADMIN's routes role by role, saves, export and import, a language deleted (200 `{strings}`), concurrency, the command line; before there is any string (`translations_unavailable`); a database with only 001 (the words not there yet, the admin routes behind the gate, nothing looked up) |

The browser check (`.claude/skills/check-in-browser`, DEV.md "The browser
check") uses the same tools: `tests/tools/testdb.php` and `testenv.php` for
its throwaway database and settings, the library's stand-in IAM (its key
from `TestIam::create()`) for the sign-in, `router.php` for the built app.
