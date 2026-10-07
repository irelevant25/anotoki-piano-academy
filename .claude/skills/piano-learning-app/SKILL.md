---
name: piano-learning-app
description: Use for any development work on this repo (Piano Academy) - new features, bug fixes, learning-path/curriculum/song changes, or anything touching MIDI, notation, SRS scheduling, the learning path, the practice views, the app's words and languages (English and Slovak, the admin panel's Translations and Languages pages), the Slim backend, the database, the setup page, signing in, roles or hosting. Load this before making changes so conventions and known gotchas aren't rediscovered from scratch.
---

# Piano Academy - project skill

A piano tutor for a KAWAI ES120 (or any class-compliant USB-MIDI keyboard).
The browser talks to the piano directly (Web MIDI); an Angular 21 frontend
(`frontend/`) does all the music logic; a PHP 8.2 + Slim 4 backend (`backend/`)
keeps each person's progress in PostgreSQL. Everybody signs in through the
anotoki IAM (client `piano-academy`) - on the hosted site piano.anotoki.eu and
on a development computer alike; there is no other way to sign in (while
the IAM says sign-in is not required, the backend also keeps a visitor's
progress under a key of the browser's, and the learner pages open for that
visitor - the admin panel never does). The IAM's roles
decide the admin panel: EDITOR rewords the app's words, ADMIN also keeps the
languages and applies database updates. It speaks English and Slovak: its
words are rows in the database, asked for by key and edited in the browser.
Read [README.md](../../../README.md) for the user's picture,
[DEV.md](../../../DEV.md) for the commands, [docs/](../../../docs/README.md)
for the architecture, the API route by route and the decisions, and
[backend/README.md](../../../backend/README.md) for the backend's layout -
this file is the implementer's supplement: architecture, design, conventions,
and the gotchas that cost time to rediscover.

**Under way (2026-10-04): the anotoki family made one way.** The backend is
done (below): sign-in, roles, setup and layout (stage 1); each person's own
export and import, the progress generation, the People routes and migration
004's schema part (stage 2). The frontend is in step (stage 3): every page
signs in first (`signInGuard`), the admin panel under `/admin`, the own
progress file on Stats, saves that name the generation and settle a 409, the
sign-out question - and 004's strings for them. Stage 4: the family's one
top bar (`layouts/top-bar`), 004 finished with its strings, version 0.2 and
its changelog entry, and the committed browser check (skill
`check-in-browser`). Stage 5 reviewed it all and fixed what it found. Then
(the owner's request): the admin panel's Migrations page, the IAM's, in place
of the Database page - an ADMIN applies a pending migration there, also while
the database is behind - and "Admin panel" wherever the area is named
(`topbar.admin`, the brand, the titles). **004 is applied in the owner's
database** (2026-10-05) and frozen: a later change is a new migration (after
writing an unreleased one, `php tests/tools/testdb.php template --fresh`).

**Under way (2026-10-05): sign-in per site, MEMBER for everyone, visitors**
(the family's design). Stage A, the switch, is in: the SDK 1.1.0, the IAM's
"Sign-in required" read (`authLoginRequired()`) and relayed
(`loginRequired`), only Bearer is a sign-in, MEMBER is an ordinary learner,
the stand-in's public route. Stage B, the visitors' backend, is in: 005
(written whole and final - the owner applies it at the hand-over, never
before), `api/visitors.php`, `requireOwner()`, the limits, the sweep after
the answer, People's visitors line. Stage C, the move at sign-in, is in:
`POST /api/visitor/move` (`routes/visitor.php`, `visitorMove()`). Stage D,
the frontend's core, is in: `AuthService.loginRequired`, `VisitorKey`, who a
request is decided as `ApiService` issues it (`ISSUED_AS`), one "maker", the
move before the state, the visitor's outbox at every signed-in start, a
visitor's 413 / 429 not sent for ever, the guards. Stage E, the visitor's
words, is in: the shell's notes (`app.component`: the notice on Learn and
Stats, sign-in required meanwhile, a progress ended, a save refused, a
refused sign-in; after a sign-in moved / kept / not moved), Stats' sign-in
line, People's visitors line, the browser check's visitor tours, 0.2's
What's new line. Next: the review (F).

**2026-10-06: the theme, the dates and the clock are the anotoki account's**
(the IAM's 015, its browser SDK 1.2.0; `docs/decisions.md`): followed for
somebody signed in, the whole site and the admin panel; the bar's theme
button and language chooser save a signed-in person's choice to the
account; the account's language comes before this device's choice (the
family's order); migration 006 (two sentences, written whole and final,
with 005 at the hand-over) says when the account would not take one.

**2026-10-07: one way while the site is not ready - the anotoki family's
library** (`anotoki-lib` 0.1.0 from GitHub: `anotoki/lib` in `vendor/`,
`@anotoki/lib` from the release's tarball; the owner's request,
`docs/decisions.md`). Its `Migrator` applies the migrations everywhere
(`api/migrations.php`), its `SiteGate` stands in front of every route (not
set up -> 503 `not_set_up`, the setup page named only while never installed;
an update waiting -> 503 `update_pending` but for `SITE_OPEN_PATHS`), its
pages replace the app's "not set up yet" card and its own Migrations page
(`<anotoki-site-gate>` around the shell's outlet, `<anotoki-migrations-page>`
at `/admin/migrations`); signing in works while an update waits. Migration
007 (written whole and final; words only - the card's four `boot.notSetUp.*`
keys deleted) goes with 005 and 006 at the hand-over.

**Keep this file current.** After any change, update this skill, the root
`CLAUDE.md`, `.claude/agents/piano-dev.md`, README "Current state", DEV.md and
the in-app changelog where they are affected - the owner wants the knowledge
base maintained with every change.

## Architecture

```
backend/                        PHP 8.2+, Slim 4, anotoki/lib (vendor/ committed: the host has no composer)
  api/index.php                  front controller: buildPianoApp() (routes + middleware), run unless PIANO_NO_RUN.
                                 Middleware, outermost first: securityHeaders -> the error handler
                                 (ApiError / 404 / 405+Allow / PDOException=503 [db] / else 500 [server])
                                 -> the site's gate (anotoki/lib's SiteGate on siteState(): not set up -> 503
                                 {code: not_set_up, installed, message, setup only while never installed};
                                 an update waiting -> 503 {code: update_pending, message} + Retry-After 60 but
                                 for SITE_OPEN_PATHS - /api/auth/config, /api/translations/{code}, /api/health,
                                 /api/admin/migrations...; /api/site-status always passes) -> routing. Its
                                 header lists every route.
  api/.htaccess                  Apache: everything under /api/ to index.php; no other file runs.
  api/bootstrap.php              what every entry point loads: PHP >= 8.2, UTC, display_errors off for the web,
                                 warnings -> ErrorException (deprecations only logged), then every api/*.php.
  api/routes/public.php          GET /api/health ({ok} + database and pending migrations for loopback),
                                 GET /api/auth/config ({issuer, clientId, loginRequired} - the IAM's switch,
                                 authLoginRequired()),
                                 GET /api/translations/{code} (the bundle: {language, languages, values, english?};
                                 no token looked at; ETag + no-cache, 304; unknown or hidden code -> English;
                                 open while an update waits - a database without the words' tables (002 waiting):
                                 503 {error, code: update_pending}, translationsReady()),
                                 GET /api/site-status ({state, installed}: anotoki/lib's MigrationsRoutes::status()).
  api/routes/progress.php        GET /api/state ({progress, sessions, path, generation}; nobody, sign-in not
                                 required: STATE_OF_NOBODY, generation 0), PUT /api/progress (204),
                                 PUT /api/path (204) - both with the Progress-Generation header (428
                                 generation_required without, 409 progress_changed {generation} for an old one),
                                 POST /api/sessions (201; 200 on an Idempotency-Key replay; no generation),
                                 GET /api/me/export (the person's own file; 409 export_too_large over EXPORT_LIMIT),
                                 POST /api/me/import [?dryRun=true] [?replace=true] (409 has_progress; 422
                                 not_an_export / invalid_export; 413). The state and the three saves
                                 ->add(requireOwner('empty' | 'make')): a person, or - sign-in not required - a
                                 visitor; nobody's first save makes one (generation 0; the answer's X-Visitor-Key,
                                 Progress-Generation, no-store). The own file ->add(requireUser()). While an update
                                 waits the gate answers them all (POST /api/sessions too) 503 update_pending.
  api/routes/visitor.php         POST /api/visitor/move (requireUser; whatever the switch):
                                 reads X-Visitor-Key itself (none / malformed: 422 invalid, field visitor_key) ->
                                 visitorMove() -> {found, notes: {moved, kept}, steps: {moved, merged, kept},
                                 sessions, generation}; a key nobody has: found false, zeros, generation null.
  api/routes/admin.php           /api/admin, three Slim groups, the role check ON THE GROUP (a route added later
                                 cannot forget it): staff (requireRole(...ROLES_STAFF)):
                                 GET /languages; GET, PUT /translations (the grid; a save is {values: {key: {code:
                                 text}}}); GET /translations/{code}/export, PUT /translations/{code}/import (flat
                                 {key: text}; 1 MiB bodies on the two writes). ADMIN (requireRole(ROLE_ADMIN)):
                                 POST /languages; PUT, DELETE /languages/{code};
                                 GET /people ({people, visitors: {count, sessions}}), DELETE
                                 /people/{id:[0-9]{1,18}} (204; 404 not_found - a visitor's negative id too). The
                                 migrations - anotoki/lib's MigrationsRoutes::admin(), ->add(requireRole(ROLE_ADMIN)),
                                 open while an update waits (how a database behind is brought up to date):
                                 GET /migrations (Migrator::status(): {sets, applied: [{set, name, applied_at ISO
                                 UTC}], pending: [{set, name, ready, blocked}], missing}), GET /migrations/file?set=&name=
                                 ({set, name, sql}; 404 {code, message}), POST /migrations/apply ({applied, failed,
                                 error, note}; a failure 200 and logged "[db] the migration ... failed"; 409 {code:
                                 busy, message}).
  api/meddleware/                security.php (nosniff, DENY, CSP none, no-store; NO CORS on purpose),
                                 auth.php (requireUser, requireRole -> 403 forbidden in the staff's or ADMIN's words;
                                 both put 'user' (SiteUser) and 'userId' on the request; signedInUser - refuses a
                                 visitor SiteUser, so they mean "a verified token" however stacked - currentUser;
                                 requireOwner($nobody = refuse | empty | make): Bearer -> the person or 401, else
                                 sign-in required -> 401 sign_in_required (the key not read), else X-Visitor-Key ->
                                 the visitor, else nobody as $nobody says; with the move (routes/visitor.php) the
                                 only reader of the key; queues the sweep).
  api/helpers.php                ApiError(status, errorCode, message, headers, extra); respondJson/respondJsonText/
                                 respondError ({error, code} + extra fields); jsonBody(request, limit) (JSON only: 415
                                 otherwise, 413 over the limit - 256 kB by default - null when empty, decoded to
                                 stdClass so {} stays {}); isoNow(), textClip() and the text* helpers.
  api/auth.php                   ROLE_ADMIN, ROLE_EDITOR, ROLES_STAFF; final class SiteUser {id, name, roles, visitor
                                 (false but for api/visitors.php's); has(...)}; its header: the four kinds of request;
                                 authIamConfig() (+ the tests' jwks_file / application_file, application_ttl /
                                 _timeout), authLoginRequired() (the SDK's anotoki_iam_login_required(): the IAM's
                                 "Sign-in required", kept a minute in cache_dir, single flight, true when unknown;
                                 a failed ask logged "[auth] the IAM did not say ..."), authPublicConfig()
                                 ({issuer, clientId, loginRequired}), isLoopback(),
                                 isLocalHostName(), wasForwarded(), isThisComputer(sapi, remote, host, forwarded)
                                 (setup.php's no-token mode only); requestUser() -> ?SiteUser (no Bearer header -
                                 none, or another scheme such as Basic: null; "Bearer" with no token: 401
                                 sign_in_required; one that does not verify: 401 invalid_token, the reason
                                 only in the log "[auth] token refused: ..."; roles = anotoki_iam_roles(claims),
                                 this client's), usersSeen() (a person's id only: LogicException below 1).
  api/visitors.php               visitors (sign-in not required; 005): VISITOR_HEADER X-Visitor-Key, the key (32 random
                                 bytes, base64url, 43; only its SHA-256 in users.visitor_key_hash), VISITOR_KEEP_DAYS 30,
                                 VISITOR_DEFAULTS (max_visitors 500, new_per_hour_per_address 10, new_per_hour 60,
                                 max_sessions 1000, document_max_bytes 131072, move_lock_timeout_ms 5000;
                                 visitorLimit() reads
                                 config/visitors.local.php); visitorsReady() (the column there) / visitorsMustBeReady()
                                 (503 visitors_unavailable); visitorFind() (401 visitor_unknown; last_seen_at at most
                                 hourly); visitorMake() (inside the save's transaction, an advisory xact lock, the
                                 limits -> 429 too_many_visitors, visitor_starts pruned and counted); visitorWriter(),
                                 visitorBodyLimit(), visitorDocumentOwner() (maker: generation 0 -> made; else the
                                 users row FOR UPDATE, 409, a visitor gone -> 401 visitor_unknown),
                                 visitorSessionCheck() (422 visitor_limit), visitorAnswerMade(); visitorMove()
                                 (one transaction, lock_timeout: the visitor's users row FOR UPDATE, then the
                                 person's; visitorMoveNotes() - the person's notes stay, the visitor's others added;
                                 visitorMovePath() - a step both have merged by VISITOR_STEP_MERGE: bestAccuracy
                                 max, attempts summed, passedAt earliest, lastAccuracy/updatedAt the newer's, other
                                 fields the person's, the visitor's added; each merged document over BODY_LIMIT is
                                 not made - the person's stays, the visitor's count as kept; rounds moved with id /
                                 request_key / recorded_at, a colliding one dropped; the visitor's rows and users
                                 row deleted; a new generation when notes or path were written; 23505 / 40001 /
                                 40P01 / 55P03 -> 503 visitor_move_retry, Retry-After 2; the person's row gone ->
                                 401 sign_in_required); visitorSweep()
                                 (STORE_PERSON_TABLES then users, 20 a batch, 2 s a statement, 5 s in all, SKIP
                                 LOCKED; visitor_starts pruned) and visitorSweepAfterAnswer() (hourly by
                                 storage/visitors-swept, always after a visitor is made).
  api/client_address.php         clientAddress() (REMOTE_ADDR; a trusted proxy's header, right-most untrusted),
                                 clientAddressCounted() / clientAddressBucket() (IPv4, IPv6 /64), clientAddressInRanges().
  api/after_response.php         afterResponse() (queues; ignore_user_abort), afterResponseRun() (index.php after run():
                                 fastcgi/litespeed_finish_request or flush, each piece in try/catch -> "[after] ...").
  api/migrations.php             the migrations through the anotoki family's engine (anotoki/lib, in vendor/):
                                 MIGRATIONS_SET 'piano_academy', DATABASE_UPDATE_LOCK (the advisory lock setup.php's
                                 Save, php migration.php, POST /api/admin/migrations/apply and the tests' builders all
                                 take - busy otherwise), migrationsDir(), migrationSet(), migrationFiles() (the folder as
                                 Migrator::files() lists it - a test holds them equal), databaseMigrator(?pdo, options)
                                 (the Migrator: the set, the lock, prepare = adoptLegacyMigrationsTable - the first
                                 runner's migrations(name) renamed to filename; status() / applicable() read only,
                                 apply() each file whole with its record, stopping at the first that fails - "statement
                                 N of M: ..." and its first lines), legacyMigrationsTable(), siteState() (the
                                 SiteState: settingsProblem(), storage/installed.lock, the Migrator).
  api/translations.php           the app's words: languages* (all, offered, create/update/delete; en and sk cannot be
                                 deleted, en not switched off), translationBundle(), translationGrid(),
                                 translationsCheck() (key, language, text, length, placeholders as English's),
                                 translationsSave/Import/Export, translationsReady() (002's tables there - asked
                                 by the bundle's route while an update waits). The one module not keyed by a user id
                                 (translations.updated_by is the request's person, or null from a migration or the CLI).
  api/store.php                  one person's data: storeStateJson($id, $withGeneration) (the database's jsonb
                                 text, never through PHP arrays; one statement, so the documents and their
                                 generation are one snapshot), storeProgressCounts / storeCountsHaveProgress (empty
                                 documents are no progress), storeCheckProgress/Path, storeCleanSession
                                 (SESSION_FIELDS whitelist + bounds, SESSION_MODES), storeAddSession (Idempotency-Key
                                 -> stored once). The generation: GENERATION_HEADER, storeGenerationFrom() (428),
                                 storeLockGeneration() (the users row FOR UPDATE), storeRequireGeneration() (409),
                                 storeNewGeneration() (nextval of the sequence), storeProgressChanged() (the 409);
                                 storeGenerationFrom($h, $allowZero) - 0 for a visitor's or a maker's save;
                                 storeAddSession(..., $beforeAdding) (a visitor's cap, in its transaction);
                                 STORE_PERSON_TABLES (what a delete or the sweep empties before users).
  api/transfer.php               one person's data as an export ('piano-academy-export' v1): EXPORT_LIMIT (5 MiB,
                                 the import's body limit and the largest export handed out), transferExport(),
                                 transferExportJson() (409 export_too_large), transferReadFile() /
                                 transferReadExport() (422 not_an_export / invalid_export as ApiErrors; version 1
                                 only; the file's userId not read; leftOut), transferPreview() (the dry run),
                                 transferImport($id, $data, $replace) (one transaction: the users row FOR UPDATE,
                                 409 has_progress unless replacing, the old rows out, sessions 500 to a statement,
                                 a new generation), transferReassign (UPDATE users SET id; FKs cascade).
  api/people.php                 ADMIN's: peopleList() (people only, id > 0; counts, the most recently seen first - the
                                 only read across people), peopleVisitors() ({count, sessions}), peopleDelete() (false
                                 below 1; the users row FOR UPDATE, then STORE_PERSON_TABLES - sessions, path,
                                 progress, imports -, users; translations.updated_by goes null).
  api/db.php                     dbConnect(settings, name, persistent), db() (persistent under cli-server),
                                 dbQuery/All/One/Value/Exec, dbTx, dbExists, dbServer, ensureDatabase() (made when
                                 it may be: setup's Save, php migration.php, the tests).
  api/anotoki_iam.php            the IAM's PHP SDK, v1.1.0, copied byte for byte from ../anotoki-iam/sdk/php/: the
                                 token verifier and the sign-in switch's reader (anotoki_iam_login_required()).
  config/config.php              the loader. visitorSettings(): the optional config/visitors.local.php
                                 (client_address.trusted_proxies / client_ip_header, visitors.* limits; never
                                 written by setup, never "not set up"; unreadable -> the defaults, logged).
                                 Reads config/database.local.php + config/auth.local.php (required,
                                 gitignored, no fallback) -> settingsProblem(), databaseSettings(), authSettings(),
                                 writeLocalConfig() (readable by its owner only), storageDir(). auth.local.php needs
                                 issuer, client_id, cache_dir and passes over any other key (an old file's mode /
                                 local_user_id). PIANO_TEST_CONFIG = another folder, honoured only while its
                                 database is piano_test_*.
  migrations/piano_academy/      001_init.sql: users, progress (notes jsonb), path_progress (data jsonb),
                                 sessions (seq, id, request_key, recorded_at, data jsonb), imports.
                                 002_languages_and_translations.sql: languages (code, name, native_name, enabled,
                                 sort_order; en and sk), translation_keys (name, description), translations (key_name,
                                 language_code, value, updated_at, updated_by); refuses a database that is not UTF8.
                                 003_site_strings.sql: every key with its English and Slovak (ON CONFLICT DO NOTHING)
                                 and a DO $$ gate; a test reads its layout as text.
                                 004_family_shell.sql (applied in the owner's database, frozen): the
                                 sequence progress_generation and users.progress_generation (bigint, not null,
                                 numbered from it); then the work's strings in 003's form (signIn.storageUnavailable,
                                 signOut.*, progressChanged.*, ownProgress.*, brand.*, topbar.*, midi.button/none/
                                 title); boot.notSetUp.text reworded in en and sk only where it is still 003's;
                                 the keys the bar replaced deleted (footer.translations, account.myAccount,
                                 account.signedOut); the descriptions of the old header and footer rewritten; the
                                 schema gate (no VALUES - it must stay so, or migration_keys() reads the wrong
                                 block), and the strings' gate last (exactly the inserted keys, the retired ones
                                 gone, no description telling of the header). (tests/unit/translations passes over
                                 exactly the one ALTER TABLE users statement and the column.)
                                 005_visitors.sql (written 2026-10-05, whole and final; the owner applies it at the
                                 hand-over): the sequence visitor_ids (down from -1), users.visitor_key_hash
                                 char(64), 001's users_id_check replaced by users_kind_check (id <> 0, negative =
                                 has a hash of 64 hex), users_visitor_key_hash (unique), users_visitors_by_last_seen
                                 (partial), visitor_starts (address, started_at) + two indexes; the strings
                                 visitor.* and ownProgress.visitor in 003's form; signIn.button's description;
                                 a schema gate that holds on every re-run (no "empty" checks: visitors may be
                                 there) and the strings' gate. No DO $$ before the strings (migration_keys()
                                 reads the first DO block's VALUES), no word 004's gate refuses in a
                                 description ("header", "account panel", "admin area"...: 004 may run again
                                 over it). tests/unit/translations passes over exactly its schema statements
                                 (VISITORS_STATEMENTS).
                                 006_account_preferences.sql (written 2026-10-06, whole and final; with 005 at the
                                 hand-over): words only, in 003's form - theme.notSaved (also kept English) and
                                 language.notSaved, a choice the anotoki account would not take - and the strings'
                                 gate. Its header is pinned by tests/unit/migrations ("the next change is 007").
                                 007_site_status_words.sql (written 2026-10-07, whole and final; with 005 and 006 at
                                 the hand-over): words only - one DELETE of the old "not set up yet" card's four keys
                                 (boot.notSetUp.*: the family's status page took its place; their strings cascade)
                                 and a gate that holds on every re-run. Pinned by tests/unit/migrations ("the next
                                 change is 008").
  setup.php                      the web setup (see "Setup and settings"). Parseable by PHP 7.4.
  router.php                     PHP's built-in server: /api -> api/index.php, /setup.php, else the built
                                 frontend (PIANO_FRONTEND_DIST or ../frontend/dist/piano-academy/browser) with the SPA
                                 fallback; never a .php file or a dot-file; files with an extension 404 when missing.
  migration.php                  CLI migrations (--status, --dry-run), the family's engine, under the update lock.
  tools/progress.php             CLI --export=FILE --user=ID / --import=FILE --user=ID [--replace] / --move=FROM
                                 --to=TO (no size limit).
  tools/translations.php         CLI --status (the key scan against the database; exit 1 on a gap) / --export CODE
                                 [FILE] / --import CODE FILE. Refuses while a migration is pending.
  tools/translation_keys.php     the key scan (which keys frontend/src/app asks for, dynamic-keys.ts, the kept
                                 English) - used by the CLI and tests/unit/translations.test.php.
  tools/build.php                the upload: runs the frontend build, then dist/ = app + .htaccess + setup.php + api/
                                 + config/config.php + migrations/ + vendor/ + storage/ (deny .htaccess everywhere
                                 PHP-only) + 3rdpartylicenses.txt. Refuses a non-build or in-repo --out.
  tests/                         run.php, lib.php (test_migrate($pdo, $through) / test_migrate_before($pdo, $file):
                                 the app's Migrator with the files after a point held back as drafts - a database as
                                 it stood then; names_of()), unit/*, api/*; tools/testdb.php (template [--fresh] -
                                 built with the app's Migrator -, create, drop,
                                 sweep), testenv.php (always the IAM: --issuer, --jwks), fake-iam.php (the stand-in
                                 IAM; also the account's preferences: the claim while its state has some, POST
                                 /api/oidc/preferences with the preflight, the token verified, 400 / 401 / 503).
  storage/                       gitignored: cache/ (the IAM's keys); backups/ when you dump into it.

frontend/                        Angular 21, standalone + zoneless + signals, OnPush, three files per component
  src/app/app.config.ts          zoneless, router (component input binding, scroll to top), HttpClient (fetch +
                                 siteStatusInterceptor - the family's, outermost - + authInterceptor),
                                 provideSiteMigrations() (core/state/site-migrations.ts), PianoTitleStrategy,
                                 provideAppInitializer: ThemeService, changelog load, SiteStatus.check() (GET
                                 /api/site-status, first), BootService.start() (sign-in settings, then the language and
                                 its strings, then - unless the site is not ready: `waiting` - the person's state).
  src/app/app.routes.ts          auth/callback (never guarded); admin (canActivate adminSignInGuard, lazy
                                 layouts/admin-layout): translations (staff), languages, people, migrations
                                 (adminGuard; the family's MigrationsPageComponent, lazy from @anotoki/lib/migrations),
                                 database -> migrations, '' -> translations (migrations while
                                 BootService.onlyMigrations); /translations and /languages redirect to /admin/...; the
                                 learner's pages under '' with canActivateChild signInGuard: '' home,
                                 lesson/:unitId/:stepId, trainer, sheet, songs, songs/:songId, stats, ** -> ''.
                                 Pages with notation are lazy and wait for VexFlow's fonts (withNotation). Titles are
                                 keys (title.*); the admin pages' are English ('Translations', 'People', ...).
  src/app/app.component.*        the frame: <app-top-bar>, the signed-out banner (a person's only), the "progress changed elsewhere"
                                 note (store.changedElsewhere); a visitor's notes (status ready, BootService.visiting,
                                 nobody signed in; core/i18n/visitor-words.ts): #visitor-sign-in-now (sign-in required
                                 meanwhile: AuthService.loginRequired, with Sign in), #visitor-sign-in-why (a refused
                                 or unstartable sign-in in the card's words, closable), #visitor-refused
                                 (ApiService.visitorRefusal: full / busy, with Sign in), #visitor-lost (VisitorKey.lost,
                                 closable), and #visitor-notice ({days} 30, Sign in) on '/' and '/stats' only, while no
                                 sign-in is required; after a sign-in #visitor-moved (+ #visitor-kept) and
                                 #visitor-not-moved (BootService.visitorMoved / visitorNotMoved, closable) - every
                                 note only while the site is ready (SiteStatus.blocked() false); then
                                 <anotoki-site-gate> (the family's: the status page in the view's place while the site
                                 is not ready - an ADMIN still has /admin/migrations) around the boot card or
                                 <router-outlet> (pageShown: status ready, or an ADMIN on /admin/migrations - one
                                 outlet, kept as the app starts after an Apply; status sign-in: "Loading…" while the
                                 guard goes to the IAM, the sign-in card only after signInFailure), the footer (the
                                 version -> What's new).
  layouts/top-bar/               the anotoki family's one bar (the survey's structure, Piano's tokens): brand
                                 (ui/brand: mark + "anotoki" + brand.area; on a phone brand.short "Piano"), the
                                 sections (APP_LINKS: nav.* keys, '/lesson/' under Learn, '/songs/' under Songs;
                                 drawn once status is ready, and not while the site is not ready),
                                 #save-status "Not saved yet", the piano (ui/midi-panel),
                                 the language, the theme, the person's menu (#topbar-user-button -> #user-menu: name,
                                 e-mail, role pill, #account-link "Your anotoki account", #admin-link for the staff or
                                 #topbar-back "Back to Piano Academy" in /admin, #sign-out-btn) - or #sign-in-btn once
                                 the sign-in ran out mid-session. PHONE_BAR_MAX 1240 (a matchMedia signal; the same
                                 number in the .scss): up to it the brand, the piano's dot, language, theme and
                                 #topbar-menu-button -> #topbar-menu (the sections, then the person's items); "Not
                                 saved yet" is a dot on that button (aria-describedby) and the menu's first line.
                                 NAME_BAR_MIN (+201): the name beside the initial. Menus: openMenu signal, focus into
                                 the first item (afterNextRender), arrows/Home/End, Escape and outside click, Tab and
                                 Shift+Tab -> preventDefault + closeMenu(true) (the focus on the button); a crossing of
                                 the fold closes them. Under /admin: ADMIN_LINKS (English; Languages, People, Migrations
                                 for ADMIN; Migrations alone while an update waits), the brand "Piano Academy -
                                 admin panel" ("admin panel" on a phone), no chooser, no piano. The person's menu:
                                 topbar.admin "Admin panel". Sign out: settleBeforeSignOut (spinner), then the
                                 signOut.* question (<app-confirm-dialog name="sign-out-confirm">, drawn while closed).
  core/title.strategy.ts         a route title matching title.<word> goes through t(); "<title> · Piano Academy".
  core/auth/                     anotoki-auth.mjs + .d.ts (the IAM's browser SDK v1.2.0, copied unchanged from
                                 ../anotoki-iam/sdk/js/), auth.service.ts (init: /api/auth/config {issuer, clientId,
                                 loginRequired} then createAuth + init(); signals user/signedIn/roles/isStaff/isAdmin/
                                 signInFailure; preferences (the account's {theme, date_format, time_format} while
                                 signed in - null for nobody, a visitor, an IAM before its 015);
                                 savePreferences(changes) (the SDK's: user() and every tab follow; rejects with the
                                 IAM's code); loginRequired (true unless the settings said exactly false;
                                 requireSignInNow() - the API refused a visitor for it - sets it for the page load);
                                 userKey() (sub or null); displayName (the person's name or null - the bar words the
                                 rest); signIn(returnTo?, uiLocales?) -> Promise<boolean> (false + signInFailure when
                                 it cannot start, e.g. storage_unavailable)), sign-in.guard.ts (signInGuard - learner
                                 pages - and adminSignInGuard - /admin -, the survey's: signed out -> the IAM and back
                                 to the address asked for, after BootService.beforeSignIn() (a visitor's saves on
                                 their way first); signInGuard lets a visitor through (status ready,
                                 BootService.visiting, no sign-in required), adminSignInGuard never; through after a
                                 signInFailure; through, nobody sent to the IAM, while the site is not ready
                                 (SiteStatus.blocked(): the status page stands in, with its own Sign in, and the
                                 address stays); nothing while the boot status is otherwise loading / not-set-up /
                                 load-error),
                                 visitor-key.ts (VisitorKey: the key in localStorage piano-academy:visitor, 43
                                 base64url; current() read at send time, a storage event; remember() - the first key
                                 stays; forget(key, lost) - compare-and-delete; lost; active; memory when storage
                                 refuses; injects AuthService only), auth.interceptor.ts (who by ISSUED_AS - an
                                 unmarked request: signedIn() ? person : visitor. A person's: the token - none: NOT
                                 sent, a local 401 sign_in_required -, one retry with a fresh token after a 401,
                                 never the key but with CARRIES_VISITOR_KEY (the move). A visitor's, no sign-in
                                 required: the key held now, never a token; the answer's X-Visitor-Key remembered
                                 when none was sent; 401 visitor_unknown forgets the key sent; 401 sign_in_required
                                 -> requireSignInNow(), the key KEPT. A visitor's while required: bare.
                                 /api/auth/config and /api/translations/ go untouched).
  core/i18n/                     translation.service.ts (TranslationService: the language - ?lang= of this tab, the
                                 chooser's choice, the token's locale, the browser's tags, English; signed in with
                                 preferences: ?lang=, this page's choice, the account's locale, then this device's
                                 (`stored`), the browser's - and a change of the account's followed (_watchToken: not
                                 over ?lang=, not while a save is out; _chosen dropped); the bundle from
                                 GET /api/translations/{code}, cached in localStorage with English's own beside it;
                                 inAdmin / effectiveLanguage: under /admin every key is read in English
                                 (navigated(url) from the title strategy); t(), plural(), has(),
                                 around() / aroundPlural() (a sentence cut around one placeholder); a key
                                 with no string is shown as itself and warns once "[i18n] ..."; saveToAccount(code):
                                 the chooser's choice to the account for somebody signed in - setLanguage() calls it
                                 for a choice that won, the chooser for a re-pick; one save at a time, the latest
                                 last, nothing when the account says it already or keeps no preferences;
                                 invalid_request (not offered) silent, another refusal - access_denied too -
                                 languageNotSaved),
                                 translate.pipe.ts, translate-plural.pipe.ts, local-date.pipe.ts (dates in the page's
                                 language: 'day', 'moment', and 'stamp' - the admin panel's yyyy-MM-dd HH:mm, the
                                 server's "YYYY-MM-DD HH:MM" kept as its numbers; for somebody signed in the
                                 account's date order and clock when chosen - a moment's date and time side by side,
                                 each half the language's own where automatic), date-patterns.ts (the family's four
                                 orders and two clocks, the IAM's; `utc` for the server's numbers),
                                 kept-english.ts (KEPT_ENGLISH: the shell's English for when there is no bundle at
                                 all), visitor-words.ts (VISITOR_KEEP_DAYS 30 - the backend's, a test holds them equal;
                                 VISITOR_WORDS, the keys of 005; visitorRefusalKey(status, code): visitor.full for
                                 422 visitor_limit / 413 too_large, visitor.busy for 429 too_many_visitors - read
                                 by ApiService.visitorRefusal and the store; the shell and Stats draw the words),
                                 dynamic-keys.ts (prefix -> every tail, for keys put together at run time:
                                 path.phase., path.step., path.hint., path.unit.), path-words.ts (phaseTitle,
                                 phaseDescription, stepTitle, stepShort, unitTitle, hintKey), error-text.ts
                                 (signInFailureKey/Params: the
                                 sign-in card words a failure from its code - access_denied, storage_unavailable,
                                 else signIn.failed with the code), translation.model.ts.
  core/admin/                    localization-drafts.service.ts: the admin pages' unsaved cells and language rows,
                                 kept for the tab (piano-academy:localization-drafts), count(), clear(); the
                                 browser's "Leave site?" while any is unsaved - not signed out on the way to the
                                 sign-in, which the drafts survive (unless the tab's storage refused them).
  core/testing/                  provideTestTranslations(values, bundle) and provideTestDialog() (jsdom has no
                                 showModal()) for specs.
  core/api/api.service.ts        every call; setDataOwner()/dataOwner (a readonly signal: a person's id, VISITOR_OWNER
                                 'visitor', or null; calls refuse any other user than the page loaded); gate(asPerson)
                                 -> the Caller, decided as the call is ISSUED and carried in ISSUED_AS (an
                                 HttpContextToken; CARRIES_VISITOR_KEY for the move): a person's page signed out ->
                                 401 sign_in_required whatever the switch (never a visitor's), somebody else -> 409
                                 wrongUser; a visitor's page with somebody signed in -> 409 wrongUser, a sign-in
                                 required or a person's call (the own file, /api/admin/, the move: AS_PERSON) -> 401,
                                 nothing sent. request(method, url, body, {headers | () => headers, asPerson,
                                 carriesKey}) - headers worked out when sent. A visitor's PUT progress / PUT path /
                                 POST sessions without a key: ONE maker at a time (visitorSave(); the others wait,
                                 then go with the key and the generation its answer brought - Progress-Generation
                                 adopted only over nobody's 0); after a 429 too_many_visitors no maker before its
                                 Retry-After (a local 429 with the time left); visitorRefusal (the words' key: 413 /
                                 422 visitor_limit -> visitor.full, 429 -> visitor.busy; null after a visitor's save
                                 got through). ApiError.retryAfterMs. moveVisitor(key) (POST /api/visitor/move, the
                                 token and X-Visitor-Key; VisitorMove), adoptOutbox(from) (another owner's outbox
                                 entries into this owner's, keys kept, none twice). fetchState() keeps the
                                 generation (0 only on a visitor's page), saveProgress/savePath send it
                                 (GENERATION_HEADER; none -> not sent, 409 progress_changed locally: never a 428);
                                 isProgressChanged(); the own file: exportMyProgress() (text + the server's file
                                 name), previewImport(text) (?dryRun=true), importMyProgress(text, replace), EXPORT_LIMIT;
                                 the admin panel's calls under /api/admin/ (languages, translations, people,
                                 deletePerson - the Migrations page's are the family's page's own); the session outbox (localStorage
                                 piano-learning:unsaved-sessions:<user>, Idempotency-Key, kept on any failure but
                                 400/413/415/422, unsavedSessions signal, outboxKept()).
  core/state/progress-store.service.ts  the state signal; updateNote(midi, change) (one answer into the progress
                                 as the store holds it now - no page keeps a copy) and savePathProgress (chained,
                                 latest state sent; a save waits for a reload in progress), failed flags (a 428
                                 too), RETRY_MS 15 s (or a Retry-After, when longer), 'online'; a visitor's 413 /
                                 422 visitor_limit is held back (heldBack: sent again only with the next change,
                                 never by a retry); a 409 progress_changed is never
                                 resent: reloadFromServer() + changedElsewhere (not on a visitor's page whose key
                                 the server no longer knew - VisitorKey.lost says that); announceReplaced() writes
                                 piano-academy:progress-replaced:<id> (other tabs load again on its storage event);
                                 settle() (a failed save once more) and wouldLoseOnSignOut() before sign-out.
  core/state/boot.service.ts     status loading | not-set-up | waiting (the site not ready - SiteStatus asked by the
                                 initializer, or a 503 update_pending / not_set_up since: the sign-in and the strings,
                                 then nothing - no move, no state; resumeAfterUpdate() - the family's onUpToDate after
                                 an ADMIN's Apply - goes on from there and asks for the strings again) | sign-in
                                 | load-error | ready; onlyMigrations (update-pending + ADMIN: the bar's Migrations
                                 alone, /admin opens it); never runs on empty state; sends nobody to the IAM itself (the
                                 guard does); reloads when another user signs in in another tab (a visitor's tab
                                 too); beforeunload with a failed save; signIn() (after beforeSignIn(): a visitor's
                                 saves settle first), settleBeforeSignOut(), signOut(). Nobody signed in and no
                                 sign-in required: a visitor (setDataOwner(VISITOR_OWNER); visiting; a 401
                                 visitor_unknown -> the state again as nobody; 401 sign_in_required -> sign-in, the
                                 key kept). Signed in: with a key held the move FIRST (moveVisitor(): one at a time;
                                 answered -> the key forgotten, visitorMoved {kept} when something came; 422 ->
                                 forgotten; 503 visitor_move_retry with Retry-After <= MOVE_RETRY_MAX_MS 5 s waited
                                 out once; else the key kept and visitorNotMoved), then adoptOutbox(VISITOR_OWNER)
                                 on every signed-in start, then the person's state. The sign-in listener moves a
                                 key held when a sign-in comes back mid-session (and loads the progress again).
  core/state/site-migrations.ts  provideSiteMigrations(): @anotoki/lib/migrations' config - statusUrl /api/site-status,
                                 apiBase /api/admin/migrations, migrationsRoute /admin/migrations; isAdmin /
                                 isSignedIn from AuthService; signIn -> BootService.signIn() (lazily: BootService reads
                                 SiteStatus - a circle otherwise); language -> TranslationService.language(); formatDate
                                 -> localDateText(iso, 'stamp', ...) (the account's order and clock); onUpToDate ->
                                 BootService.resumeAfterUpdate(). Specs provide it too (with markReady()/report()).
  core/music/                    theory, srs, songs, path services (+ music.types.ts): ALL the domain logic.
  core/midi/midi.service.ts      PianoMidi (EventTarget: noteon/noteoff/connected/disconnected/devicechange;
                                 window.pianoMIDI) + MidiService (status {connected, name} - the device's own name;
                                 problem {kind: unsupported | refused | failed, detail} - the panel words the kind and
                                 shows the browser's detail as it is, lang="en"; devices, remembered device, reconnect).
  core/notation/notation.ts      VexFlow wrapper (renderSingleNote, renderSequence); notationFontsReady().
  core/player/sequence-player.ts the one play-along/grading loop (wait / tempo); window.pianoPlayer. Its
                                 feedback(key, params?, kind?) callback hands over a key, never a sentence.
  core/audio/metronome.ts        click track + performance.now() timing reference.
  core/theme/, core/changelog/   light/dark/auto (public/theme-boot.js before paint, from piano-academy:theme - the
                                 theme on the screen, always written); signed in, the account's theme (the IAM's):
                                 taken at sign-in and when it changes, never while a save of its own is out; set()
                                 shows at once and saves (one at a time, the latest last); refused: the account's
                                 back and notSaved; signed out or no preferences: the device's, nothing saved.
                                 public/changelog.json.
  ui/                            the bar's kit, after the survey's: brand, icon (paths, only the icons used),
                                 spinner, midi-panel (the piano: #midi-button with a dot and #midi-label - the
                                 device's name or midi.none - its name midi.button {status}; #midi-box, hidden while
                                 closed: the status sentence, the device list, Connect, Rescan; focus to the list,
                                 Escape back to the button, kept inside the screen), theme-toggle (round, icon-only;
                                 #theme-not-saved under it, role alert, when the account refused - gone at the next
                                 press or a click elsewhere), language-switcher (round, in the bar; its menu opens
                                 downward; Tab closes it onto its button; its note: language.notLoaded, or
                                 language.notSaved; a signed-in choice - or a re-pick of the page's language the
                                 account lacks - goes to saveToAccount()), keep-on-screen.ts (a menu or note under a
                                 bar button moved onto the screen: --shift); piano-keyboard (+ KeyboardModel), notation, changelog-dialog,
                                 confirm-dialog (native <dialog>; ask(question?) or a `words` input drawn while
                                 closed; `name` for its ids).
  boot/                          sign-in-card (drawn only after a failed sign-in; words it from its code),
                                 load-error. (Not set up / being updated / not available: the family's
                                 <anotoki-site-status>, in its own en/sk words.)
  layouts/admin-layout/          /admin's frame, English: the outlet (its sections are the top bar's links there) -
                                 or "signed out" / "not signed in" / "this part is for the people who keep Piano
                                 Academy's words".
  pages/                         home (the path), lesson (+ steps/meet, drill, sequence; step-outcome.ts: Feedback
                                 {key, params, kind}), trainer, sheet, songs (+ song-player), stats (+ own-progress:
                                 "Your progress file" - Download; Bring back a file: size checked, refused while a
                                 save waits, the dry run's counts, a second press, over progress a question, then the
                                 progress loaded again; ownProgressProblem() words each code - only for somebody
                                 signed in; in its place #own-progress-visitor: ownProgress.visitor + Sign in),
                                 auth-callback.
  pages/admin/                   the admin panel's pages, English literals: translations (the grid: search, missing
                                 only, a cell per key and language, plural samples, export/import a language's file),
                                 languages (add, rename, order, offer, delete), people (ADMIN: counts, delete after a
                                 question; oneself -> this tab loads again; #people-visitors: how many visitors, their
                                 rounds - api.people() answers {people, visitors}); migrations is the family's
                                 <anotoki-migrations-page> (the route loads it from @anotoki/lib/migrations: Pending
                                 with drafts, Applied with when and each file's SQL, Missing, "Apply pending" after a
                                 question; drawn for an ADMIN while an update waits, then onUpToDate ->
                                 BootService.resumeAfterUpdate() starts the app in place),
                                 translation-cell, translation-grid.ts, admin.guard.ts (adminGuard: not ADMIN ->
                                 /admin/translations), unsaved-changes.guard.ts (asks before leaving with drafts;
                                 beforeunload too), admin-error.ts (the server's sentence - shown only here),
                                 _admin.scss. core/util/save-file.ts hands the browser a file. ApiError carries details.

docs/                            README.md (index), architecture.md, api.md (every route, who may call it),
                                 decisions.md. (server/data/ and start.ps1 / start.sh are gone; git keeps them.)
```

### Where each person's data lives

`progress.notes` (keyed by MIDI number), `path_progress.data` (`{steps: {...}}`)
and `sessions` (one row per finished round) - all keyed by `user_id`, the IAM
user id. `users` keeps the id, a copy of `preferred_username` from the tokens,
`created_at`, `last_seen_at`, `progress_generation` (004) and
`visitor_key_hash` (005: a visitor's - a negative id, from `visitor_ids`, with
no name; null for every person). Every store
function takes the user id and every query filters on it; the id only ever
comes from the verified token, or from the visitor key `requireOwner()` looked
up (`api/visitors.php`). The browser computes all SRS/path changes and
PUTs the whole document; between two tabs the last write wins - but a save
names the generation it loaded, and only an import, an administrator's
delete or a visitor's move at sign-in (when it adds notes or steps) starts a
new one, so a tab of before any of them is refused (409
progress_changed) and never writes the old progress back. The numbers come
from one sequence and are never reused (a deleted person's new users row
cannot match an old tab). An import, a delete and a save of one person take
turns on their users row (FOR UPDATE). `imports` (001) is written by nothing
any more.

Each person's own file: `GET /api/me/export` / `POST /api/me/import` - into an
account without progress, or in place of it with `?replace=true` after the
page asked (never merged: merging needs the SRS logic, which is the
browser's); a dry run first answers the counts. ADMIN sees everybody's counts
and deletes a person whole (`/api/admin/people`, `api/people.php`).

The site's strings (`languages`, `translation_keys`, `translations`) are the
one exception: they belong to the site, not to a person, so no query on them
is scoped to a user id. Anybody reads them (the bundle); the staff write them
(EDITOR or ADMIN; languages: ADMIN); the one user id there is
`translations.updated_by`, the request's own.

## Setup and settings

- `backend/config/database.local.php` + `auth.local.php` are required and
  gitignored; `config/config.php` validates them (`settingsProblem()`); no
  committed template, no fallback. Without them: 503 `not_set_up` on every API
  route but `/api/site-status` (the family's gate; `setup: "/setup.php"` only
  while `storage/installed.lock` is not there - once a host's install wrote it,
  the setup page is never offered again; no `detail` any more), the family's
  status page ("This site is not set up yet" / "not available right now"). A
  database behind the code: 503 `update_pending` everywhere but the open paths
  - the family's status page ("The site is being updated"; "A database update
  is waiting" for the site's ADMIN, who has the Migrations page).
- **It asks for the database and the IAM, nothing else** (no sign-in mode, no
  IAM user id, no old progress, no file). Defaults: host `127.0.0.1` here /
  `localhost` on a host, port 5432, name `anotoki_piano`, user `postgres` here
  / empty on a host, issuer `http://localhost:4300` here / empty on a host,
  client id `piano-academy`. Saved values are shown on this computer only (the
  survey's `$shown` rule); a blank password keeps the saved one. Save writes
  `auth.local.php` as exactly issuer / client_id / cache_dir.
- `setup.php` is local when `isThisComputer(PHP_SAPI, REMOTE_ADDR, HTTP_HOST,
  wasForwarded($_SERVER))`: no token, a double-submit nonce (cookie
  `piano_setup_nonce`, SameSite=Strict, + hidden field; a foreign `Origin` is
  refused, `Origin: null` - what the browser sends under the page's
  no-referrer policy - is fine), never deletes itself, never shows a password.
  Anything else is a real host: token in `storage/setup-token.php`, a flock so
  two installs never overlap, then `storage/installed.lock` and self-delete
  (never the repository's own copy - it has tests/ beside it).
- **Save applies the migrations under the update lock**
  (`databaseMigrator($pdo)->apply()`, the family's engine): busy -> "Another
  database update is running".
- **Test connection**: `setup.php?test=database|iam` (POST, the same proof as
  Save). Database: the named database first, then the server's `postgres`
  (can it create one?) - the family's sentences, word for word (a test pins
  them). IAM: `{issuer}/.well-known/openid-configuration`, the issuer must
  match, then its JWKS ("... Make sure it knows this app as \"piano-academy\".").
- Only the form page loads `setup.php?asset=js` (the live CSP allows no inline
  script); finished pages load nothing - on a host the file is gone by then.

## Learning path (the main flow)

Duolingo-style: words -> sentences -> story. Learn (home) shows a Continue
button, every phase with its units and step chips, a "notes due for review"
banner (links to the Note Trainer), and free-practice buttons.

- **Structure** (`core/music/path.service.ts`): `phases` -> `units` -> `steps`.
  Every unit uses the same ladder, built by `unit()`:
  `meet` (only with new notes) -> `drill` -> `read` -> `tempo` -> `song`.
  - meet: each new note on the staff + blue key + its hint (`hintKey(midi)` -> `path.hint.<midi>`; `NOTE_HINTS` is the list of MIDI numbers that have one); play it 3x. Not graded (100), no SRS, no session.
  - drill: 10 flashcards, staff only, ~40% new notes, the rest older notes of the phase by due date, never the same note twice in a row. Updates SRS.
  - read: 8-note melody (`generateMelody`: stepwise, home note at both ends, every new note), SequencePlayer 'wait'.
  - tempo: a fresh melody, SequencePlayer 'tempo', 50-80 BPM (default 60).
  - song: the unit's song at 60/80/100% (default 80%). A no-clock practice run is allowed and does NOT count.
- **Pass rule:** best accuracy >= `PASS_ACCURACY` (80); strictly in order; unlimited retries; a pass stays. A step passed out of order (the move at sign-in can bring one from a visitor's progress) unlocks nothing past the first step not passed - `path.service.spec.ts` pins it.
- **Note pool** of a unit = the new notes of its phase's units up to it (`notePoolForUnit`). Songs use only pool notes and every new note of their unit - `path.service.spec.ts` asserts it.
- **Persistence:** `{steps: {"rh-2/drill": {attempts, lastAccuracy, bestAccuracy, passedAt, updatedAt}}}`. Step keys `unitId/stepId` are saved - never rename a unit or step id.
- **Sessions** from lessons: `mode: 'lesson'`, `label` ("C, D, E · Drill" - English whatever the page's language, from `STEP_TYPES[type].short`, as every label stored before), `unitId`, `stepId`. Stats words a lesson's or a song's row from its ids in the page's language (`stats.lessonLabel`); only a row whose ids the app no longer knows shows the stored English, marked `lang="en"`.
- **The path's words are keys**: phase titles and descriptions, step names and short forms, the hints and the one worded unit title (`rh-5`, "B and high C") are `path.phase.*`, `path.step.*`, `path.hint.*`, `path.unit.*`, named through `core/i18n/path-words.ts`. `STEP_TYPES` holds only the English `short` for stored labels; `Phase` has no title or description of its own. A unit title of note letters only ("C, D, E") has no key and stands as it is.
- **CURRICULUM order must match the path's new-note order** (right hand, then left); the free Note Trainer introduces notes in that order.
- Later phases are `comingSoon` with no units (dashed "Coming soon" rows).

### Roadmap (agreed with the owner: one phase at a time; the owner tries each before the next)

| # | Phase (id) | Units | App capability needed first |
|---|---|---|---|
| 1 | Right hand (`right-hand`) - **done** | C D E -> G -> F -> A -> B C5; Hot Cross Buns, Mary, Ode to Joy, Twinkle, Joy to the World | - |
| 2 | Left hand (`left-hand`) | C3 D3 E3 -> F3 G3 -> A3 B3, simple tunes an octave lower | Bass clef in `Notation.renderSequence` (`clefForMidi` / a clef option), a lower `phase.keyboard`, NOTE_HINTS for the left hand, bass-clef songs |
| 3 | Both hands (`hands-together`) | alternating hands, then a held LH note + RH melody | Grand staff (treble + bass, StaveConnector), simultaneous notes, grading two voices |
| 4 | Left-hand chords (`left-hand-chords`) | C, F, G triads | Chord detection (note-ons within ~150 ms as one event), chord SRS items, half/whole notes in Notation |
| 5 | Right-hand chords (`right-hand-chords`) | the same chords RH | reuses 4 |
| 6 | Melody and chords (`melody-and-chords`) | RH melody over LH chords | reuses 3 + 4 |

The pass rule and step ladder stay the same in every phase. A new step type
gets a `StepType`, a `STEP_TYPES` entry and a case in `lesson-page.component.html`.
A new phase, step type, hint or worded unit title also needs its tails in
`core/i18n/dynamic-keys.ts` and its strings (English and Slovak) in a migration.

## Signing in, roles, hosting

- **The IAM is the only way to sign in.** No configured owner, no
  `local_user_id` (an old `auth.local.php` that still has them signs in
  through the IAM it names). The one other identity is a visitor, and only
  while the IAM says sign-in is not required (below). Cross-site writes cannot
  happen: bodies must be `application/json` (a preflight nobody answers - no
  CORS anywhere).
- **The token**: the SDK does code flow + PKCE; tokens in localStorage
  (`anotoki-auth:piano-academy`), shared by all tabs, refresh serialised across
  tabs. Redirect URI `<origin>/auth/callback` (a route), post-logout `<origin>/`;
  the IAM registers `http://localhost:4500` for development; the live site's
  client in the IAM needs `https://piano.anotoki.eu` the same way. `AuthService.init()` runs in the app
  initializer, before the router's first navigation, so the SDK's
  `history.replaceState(returnTo)` is what the router reads. The backend
  verifies every access token (RS256, typ at+jwt, kid in the JWKS cached in
  cache_dir for an hour, iss, aud piano-academy, exp/nbf/iat 60 s leeway, sub =
  user id). Who may sign in is the IAM's ("Roles that may sign in", IAM
  010; MEMBER among them). A token that is sent and does not verify is 401
  on every route that reads one - never "nobody", never a person without a
  role. Only Bearer is a sign-in: `Basic ...` counts as no header.
- **The switch** ("Sign-in required", the IAM's per application):
  `authLoginRequired()` wraps the SDK's `anotoki_iam_login_required()` (kept
  a minute in `cache_dir` - this app's own folder -, single flight, 2 s
  timeout, 404 = required, out of reach = the last answer or required);
  relayed as `loginRequired` by `/api/auth/config`. No test asks a
  real IAM: `application_file` (`test_application_file()`,
  `test_login_required()`) or the stand-in; `test_offline_auth()` refuses
  anything else.
- **Visitors** (the switch off; `api/visitors.php`, 005, the build analyzer's
  pattern): who a request is, in this order (`requireOwner()`, which with
  the move is the only reader of the key): a Bearer header - that person or 401, the key not read;
  sign-in required - 401 `sign_in_required`, the key not looked up, counted or
  swept early; `X-Visitor-Key` - that visitor (401 `visitor_unknown` for a key
  nobody has, or a row that went during the request); nobody - the empty
  state (generation 0), and a first save makes a visitor in its own
  transaction (it names generation 0; the answer has the key, the new
  generation and no-store). Limits: 429 `too_many_visitors` (at once - new
  visitors only -, an hour per counted address, an hour in all), 422
  `visitor_limit` (rounds), 413 (a visitor's document); `config/visitors.local.php`
  (optional) changes them and names the trusted proxies (Cloudflare's ranges
  behind its proxy). The sweep after the answer deletes visitors unseen 30
  days (no early sweep of thin ones). A visitor never passes `requireUser()` /
  `requireRole()`: no own file, no admin panel. 005 pending: 503
  `visitors_unavailable`. **The move at sign-in** (`POST /api/visitor/move`,
  the token AND the key, whatever the switch): the person's notes stay where
  both have one, a path step both have is merged so a pass is never lost
  (best max, attempts added, the earlier pass), the visitor's other notes,
  steps and every round come; a merged document over `BODY_LIMIT` is not
  made (the person's stays); a new generation when notes or path changed;
  then the visitor goes; again: `{found: false}`; a row held too long: 503
  `visitor_move_retry`. **In the browser** (stage D): `AuthService.loginRequired`;
  who a request is decided as `ApiService` issues it (`ISSUED_AS`, from the
  page's data owner), never from a token's being there as it leaves - a
  person's request with no token is never sent; the key (`VisitorKey`) only
  on a visitor's request while no sign-in is required, KEPT while one is
  (only `visitor_unknown` forgets it); one maker at a round's end; the move
  before the person's state (`BootService`); the visitor's outbox taken on at
  every signed-in start; a visitor's 413 / 429 not sent for ever. **The
  visitor's words** (stage E; the shell's, `app.component`): under the bar
  on Learn and Stats only (the practice screens stay clear) the notice -
  kept for this browser 30 days after the last visit, signing in keeps it -
  with Sign in; on any page sign-in required meanwhile (with Sign in), a
  refused sign-in in the card's words (a visitor gets no signed-out banner),
  a save refused (`visitor.full` / `visitor.busy`, with Sign in) and the
  progress ended (`visitor.lost`, closable); after a sign-in `visitor.moved`
  (+ `visitor.kept` when the account kept its own for some of it) or
  `visitor.notMoved`, closable. Stats: the sign-in line in place of the
  progress file. The top bar's Sign in is offered to a visitor as to anybody
  signed out.
- **Roles** (the token's `roles` for this client id): none - learns, with their
  own progress; **EDITOR** - also the staff routes (rewording the words);
  **ADMIN** - also the languages, the people (counts, delete) and the database. `requireRole()` on the
  route GROUP (`api/routes/admin.php`), 403 `forbidden`. **MEMBER** -
  every account holds it - is an ordinary learner: no check needs it or
  refuses it. Taking it away in the IAM refuses the next sign-in and refresh;
  the token held verifies until it runs out. The frontend's `isStaff` / `isAdmin` (the admin panel's
  sections, `adminGuard`, the bar's Admin item, the family's status page's
  "Open Migrations" and its Migrations page - `isAdmin` is their config's) only
  hide what the server refuses anyway.
- **Language at sign-in**: the authorize request carries `uiLocales` (the
  page's language), and a token's `locale` claim is the account's language.
  **Which language** (the family's order, decided 2026-10-06; the survey's
  `TranslationService` is the reference): signed in with preferences, this
  tab's `?lang=` and a choice made on the page this visit, then the account's
  `locale` (when the site has it), then this device's remembered choice
  (`stored` in `languageCandidates()`), the browser's, English; a change of
  the account's language made elsewhere is followed when it comes
  (`_watchToken()`: over the device's choice and an earlier choice on the
  page, not over `?lang=`, not while a choice made here is on its way to the
  account). Signed out, or no preferences: `?lang=`, this device's choice,
  the token's `locale`, the browser's - the token adopted only while nothing
  is chosen here. A choice that won in the chooser is saved to the account
  too (`setLanguage()` -> `saveToAccount()`), and still remembered on this
  device.
- **The account's theme, dates and clock** (the IAM's 015, SDK 1.2.0):
  `AuthService.preferences` while signed in (null for nobody, a visitor, an
  IAM that sends none - then the app's own settings, nothing saved). The
  theme is the account's everywhere, the admin panel too (`ThemeService`);
  dates follow its order and clock (`localDate`); the bar's two buttons save
  a choice and say a refusal under themselves (`theme.notSaved`,
  `language.notSaved` - a language the IAM does not offer is silent; the
  words promise no retry: after `access_denied` it would not help).
- **Every page signs in first** (`signInGuard`, `adminSignInGuard`): anybody
  signed out is sent to the IAM and back to the page asked for - but a
  visitor (the app runs for one, no sign-in required) goes through to the
  learner pages, never to `/admin`; the sign-in card is drawn only after a
  sign-in that came back without one or could not start.
- **The top bar's menu**: the username (or `account.signedIn`), e-mail, role,
  "Your anotoki account" (new tab), Admin (staff), "Sign out" (settles first;
  asks `signOut.*` when progress would be lost); signed out mid-session: "Sign
  in", and the banner "You are signed out, so your progress is not saved.";
  "Not saved yet" while anything waits (all of them keys). The sign-in card words a failure from its code
  (`core/i18n/error-text.ts`): `access_denied` is `signIn.notCompleted`,
  `storage_unavailable` `signIn.storageUnavailable`, anything else
  `signIn.failed` with the code; the IAM's and the SDK's own English sentences
  are never shown.
- **Hosting** (Apache + PHP + PostgreSQL, FTP only): `php tools/build.php` ->
  upload `dist/` into the web root -> `/setup.php` with the token. Web MIDI and
  the SDK's Web Crypto need HTTPS there. A later migration: an administrator's
  Apply on the admin panel's Migrations page (signing in works meanwhile), or
  delete `storage/installed.lock` and run `/setup.php` again (idempotent) at
  once - until then every visitor reads "The site is being updated". The
  upload carries `vendor/anotoki/lib` (the family's library) with the rest of
  `vendor/`. Before a release with strings, export both languages in the
  browser (DEV.md, "Releasing the app's words"). The upload's policy allows
  scripts from this origin and the family's visitor counter (Umami,
  `https://umami.anotoki.eu`, in `src/index.html`; `async`, so the app never
  waits for it) - told to leave the query string and the fragment out, as the
  callback's `code` arrives in the query (`docs/decisions.md`).

## The app's words (English and Slovak)

The owner's decisions: the app's own words live in the database and are
edited in the browser; English and Slovak, English the fallback; **Slovak is
informal ("ty")**; **a missing string shows its key on the page** (on purpose:
the owner sees which one is missing); learning material and fixed terms are
not translated; the admin panel's pages are English.

- **Model**: a key (`translation_keys`, with a description for the
  translator) and one string per language (`translations`). Keys are the
  code's: only a migration writes a key and its first strings; the browser
  only rewords a string. Every insert is `ON CONFLICT DO NOTHING`, so what the
  owner reworded survives every later migration. A string is text, never HTML
  (the scan fails a template that gives `innerHTML` a translated string); a
  value goes in as a `{placeholder}`, and a translation may use only the
  placeholders its English has. Plurals are a family `key.one` / `.few` /
  `.other` (English `.few` = `.other`), asked for with `translatePlural` /
  `plural()`.
- **Asking for a word**: `'key' | translate`, `'key' | translatePlural: count`,
  `i18n.t()` inside a `computed()` / `effect()` so a language switch re-words
  it. A key put together at run time comes from a prefix declared in
  `core/i18n/dynamic-keys.ts` with every tail written out; never from the
  address, a stored session or anything typed.
- **State holds keys, never sentences**: a step's `Feedback` is
  `{key, params, kind}`, the player's callback is `feedback(key, params?, kind?)`,
  `MidiService` keeps a problem kind, `AuthService.displayName` a name or null.
  The page words them, and words them again when the language changes in the
  middle of a step. Nothing worded is awaited in a MIDI handler.
- **Not translated**: note names (the English letters C D E F G A B - B in
  Slovak too, never H; a name the code makes comes from
  `TheoryService.midiToName()`), chord letters, "BPM", "4/4", the five song
  titles whole (bracketed parts included), MIDI device names, the browser's
  own error text (shown as a detail, `lang="en"`), product names, the
  changelog's entries, the setup page, persisted ids and the
  English `label` / `songTitle` stored with a session.
- **The shell without a bundle**: while there is no bundle at all (not set up,
  backend down, a database without the words' tables yet) the shell and its cards read their
  English from `core/i18n/kept-english.ts`. A new shell string goes there too,
  letter for letter its English in the migration (a test holds them equal).
- **A new string** is a new migration in 003's layout, with English and
  Slovak (`tests/unit/translations.test.php` reads every migration that
  inserts into `translation_keys` as text: one `INSERT INTO translation_keys`
  block, one `INSERT INTO translations` block per seeded language, a closing
  `DO $$` gate naming exactly its keys; it names only the three tables and
  nothing of 001). Because every insert is `ON CONFLICT DO NOTHING`, an insert
  never rewords a string a database already has: a string reworded after
  release needs an `UPDATE` in the migration (only where the row still holds
  the old text, so the owner's own wording stands), and a key the code stops
  using a `DELETE` (the scan fails on an unused key). 002 and 003 themselves
  only create and insert, and a test holds them to it. Collect a release's
  strings into **one** migration: on the host every migration means a setup
  re-run (DEV.md, "Releasing the app's words"). 003 was generated in one step
  from a reviewed catalogue kept outside the repository; before it is
  released, edit it in place and run `php tests/tools/testdb.php template --fresh`.
- **The scan** (`tools/translation_keys.php`, run by the tests and by
  `php tools/translations.php --status`): every key the frontend asks for is in
  the database and every key in the database is asked for; a family asked for
  as one string (or the other way round) fails; the checkout is CRLF, so the
  scan normalises `\r\n`.

### Slovak glossary - one word each, everywhere

| English | Slovak |
| --- | --- |
| note | nota |
| key (of the piano) | kláves - masculine (modrý kláves, čierne klávesy); never "klávesa" |
| staff | notová osnova |
| melody / song / sheet (music) | melódia / skladba / noty |
| New sheet (Sheet Practice's button and its sentence) | Nová melódia ("nové noty" already means new notes to learn) |
| metronome / click / count-in / tempo | metronóm / klik / odpočítanie / tempo ("along with the click": "spolu s metronómom") |
| octave / chord / bass clef | oktáva / akord / basový kľúč |
| right / left hand | pravá / ľavá ruka |
| Middle C | stredné C |
| path / phase / unit / step | cesta / časť / lekcia / krok |
| the learning path, named outside the path (Sheet Practice, Songs) | cesta v Učení |
| lesson (the page, and the mode in Stats) | lekcia |
| drill | precvičovanie |
| review; due for review | opakovanie; na zopakovanie |
| learning / mastered (note status) | učím sa / zvládnuté |
| round, session | kolo |
| practice run | skúšobné kolo |
| streak | séria dní |
| locked | zamknuté |
| Learn / Note Trainer / Sheet Practice / Songs / Stats | Učenie / Tréning nôt / Hra z nôt / Skladby / Štatistiky |
| Sign in (heading / button) | Prihlásenie / Prihlásiť sa |
| Sign out, My account | Odhlásiť sa, Môj účet |

Slovak rules: a note name, a song title and a device name are never declined -
a `{placeholder}`, after a colon, or alone, never after a preposition; the mode
names are declined ("v Tréningu nôt"). A label under a number is a noun phrase
or "label: {count}". `%` and `ms` with a space ("{accuracy} %"); "{times}-krát".
Nothing gendered about the learner ("prihlásený", "dokončil si" are out). The
en dash and „ “ quotes, never a hyphen as a dash or a straight quote.

## Conventions

- **Frontend**: Angular 21, standalone, zoneless, signals (`signal`, `computed`,
  `input`, `output`, `viewChild`), OnPush, `inject()`. **Every component is three
  files** - `.ts`, `.html`, `.scss` - never an inline template or styles. HttpClient
  for the API (the interceptor adds the token). Colours only from the CSS
  tokens in `styles.scss`, defined for light and dark; everything works at 390 px.
- **Domain logic only in `core/music/`** (theory, srs, songs, path services),
  pure and unit-tested. Views compute grades/updated state with them and save the
  result; the backend just checks the shape. Never copy that logic into a
  component or into PHP.
- **Imperative islands**: VexFlow (`Notation`, via `<app-notation>`'s
  `notation()`), the keyboard (`KeyboardModel`, drawn by `<app-piano-keyboard>`),
  Web MIDI (`PianoMidi`), Web Audio (`Metronome`). The `SequencePlayer` gets its
  collaborators passed in.
- **Teardown**: every component removes its `noteon` listener and clears its
  timers in `DestroyRef.onDestroy`; a player is `destroy()`ed. Lesson steps stop
  listening once they report.
- **Lesson steps report at once, the screen waits.** A step emits
  `done({accuracy, session, delayMs})` the moment the attempt ends; the lesson
  saves immediately and only delays the result screen. Never wrap the report in
  a timeout.
- **Backend**: PHP 8.2, `declare(strict_types=1)`, camelCase functions by area,
  `?` parameters in every query, errors as `ApiError` -> `{error, code}`.
  `setup.php` stays PHP 7.4-parseable. A new session field or mode goes into
  `SESSION_FIELDS` / `SESSION_MODES` (api/store.php) and `SessionInput`.
- **Persistence**: whole documents per person plus one row per session; new
  persisted state is a new field or a new migration, never a file.
- UI text is plain, short and encouraging - the owner is a beginner and a
  non-native English speaker. Every learner-facing word is a key with English
  and informal Slovak (see "The app's words"); the admin pages are English
  literals. A change a learner would notice gets a line in
  `frontend/public/changelog.json`.

## Gotchas already hit (don't rediscover these)

- **`Renderer.Backends.SVG`, not `Renderer.Backend.SVG`** (VexFlow 5; the singular is undefined).
- **Clear a VexFlow surface with `context.clear()`, never by emptying the container**: the Renderer inserts its `<svg>` once; removing it leaves later draws on a detached node.
- **VexFlow 5 options are camelCase**: `new Voice({ numBeats, beatValue })` - the old `num_beats` was silently ignored.
- **Lay each measure out with `formatToStave`**: a fixed justify width ran the first measure's notes (clef + time signature take room) over its barline.
- **VexFlow draws noteheads as `<text>` in its music font**: colour `text` as well as `path` to mark a note, and draw only once the font has loaded - `notationFontsReady()` (awaited by the lazy routes; VexFlow adds its FontFaces to `document.fonts` on import).
- **Cap SM-2's ease factor and interval** (`MIN/MAX_EASE_FACTOR`, `MAX_INTERVAL_HOURS`) - uncapped, a drilled note overflowed Date.
- **One key press is not one review**: 2 learning steps (4 h, 24 h), then only the first pass of a *local* day grows the schedule (`lastGrowthAt`); a miss always lapses. `repairInflatedProgress()` fixes older data at load, in memory (saved with the next save).
- **New-note pacing counts only `learning`**, not `review`, against `maxActiveNew`.
- **Don't `await` saves in a MIDI handler** before advancing: two fast presses were graded against one note. The store chains PUTs.
- **Metronome clicks outlive the view** unless stopped: the player stops it on start/stop/destroy.
- **Drill "no repeats" needs the constructive `spreadOut`**; plain reshuffling failed half the time.
- **Never run on empty state after a failed load**: the whole map is PUT, so one key press would overwrite the real progress. Boot stops with a card instead; the backend refuses empty/non-JSON bodies.
- **Days are local, timestamps UTC**: `localDayKey()` for streaks; never `.slice(0, 10)`.
- **Mastered notes still come back when due** (`isDue()` covers every started status).
- **Tempo tests must hit the clicks**: stamp note i with `window.pianoPlayer.expectedTimes[i]`; a press stamped at Start is count-in noise. The trainer ignores presses in its 700 ms feedback pause.
- **A song must not lock itself mid-play**: a miss can send a note back to `learning`; the song page decides "unlocked" once, on open.
- **PHP's JSON trap: `{}` decodes to `[]`** - bodies are decoded to objects, documents go out as the database's jsonb text; jsonb reorders keys (tests compare with `assert_json_same`). `get_object_vars()` returns int keys for "60".
- **Slim's body parser would decode to arrays** - there is none; `jsonBody()` reads the raw body.
- **`Referrer-Policy: no-referrer` makes a form POST's `Origin` "null"** - setup.php's own form; treat it as "no origin", the nonce decides.
- **The Angular dev proxy adds no forwarding headers**, so the local setup works through `ng serve`; a proxy that does is "not this computer" by design.
- **Sign in at `http://localhost:4500`**: the IAM registers that origin for `piano-academy`; `127.0.0.1:8300` (the backend serving a built app) cannot sign in.
- **The family's engine has no "apply this one file"**: a test that needs a database as it stood at some point (before 005, with only 001) uses `test_migrate($pdo, $through)` / `test_migrate_before($pdo, $file)` (`tests/lib.php`: the Migrator's `ready` holds the files after the point back as drafts - a draft and everything after it wait), and to run a file again takes its row off the record first. `Migrator::status()` and `applicable()` read only - they never create the bookkeeping table (`apply()` does).
- **Persistent connections under `php -S` keep session state**: `dbConnect()` with `$persistent` runs `ROLLBACK; SELECT pg_advisory_unlock_all()` first, so a request that died never leaves a transaction or the update lock behind.
- **Git Bash's `sed -i` turns a CRLF file into LF**: most files here are CRLF (`git ls-files --eol`); edit with the Edit tool, or put the endings back.
- **An SDK change in `localStorage` from the same tab is invisible to its in-memory session** (the `storage` event fires in other tabs only) - reload to make a test's token edit count.
- **Web Crypto (and Web MIDI) need a secure context**: plain http on a non-localhost name has no `crypto.subtle`, so PKCE fails; the live site is HTTPS (browser tests use `--unsafely-treat-insecure-origin-as-secure`).
- **npm 10.9 + vitest peers: "Cannot read properties of null (reading 'edgesOut')"** - `frontend/.npmrc` sets `legacy-peer-deps`.
- **`npm` is a batch file on Windows**: `cmd /c "npm" ...` (as PHP's array proc_open quotes it) loses its folder; `tools/build.php` passes a plain command line there.
- **PHP's built-in server differs by version** for a missing `.php` (8.2: 404, 8.5: the docroot's index.html) - tests assert only what matters.
- **PHP 8.5 deprecates `$http_response_header`** (compile-time): the tests use curl; the SDK reads the stream's meta data.
- **`getopt()` stops at the first non-option argument** - `tests/tools/testenv.php` parses its arguments by hand.
- **Stop the whole process tree** of any server (`taskkill /T`), or the next start finds the port taken.
- **PHP's built-in server answers one request at a time** (no PHP_CLI_SERVER_WORKERS on Windows): a test of two requests at once needs two servers on the same database (`tests/api/me.test.php`).
- **`INSERT ... ON CONFLICT DO UPDATE ... WHERE` locks the conflicting row even when the WHERE is false**: `usersSeen()` on every request waits while an import or a delete holds that person's users row - harmless, and it is why a test that holds the row itself proves nothing about the import's own `FOR UPDATE` (me.test.php holds a lock on `sessions` instead, inside the import's transaction).
- **PostgreSQL 18 lists a NOT NULL as a constraint** (`<table>_<column>_not_null` in pg_constraint); older servers do not - a test comparing constraints across a migration that adds a NOT NULL column passes over that one.
- **Apache under CGI/FastCGI drops `Authorization`**: both `CGIPassAuth On` and `SetEnvIf Authorization` in the upload's `.htaccess`; when the PSR-7 header is empty, `requestUserId()` falls back to the SDK's `anotoki_iam_authorization_header()` (which also reads `REDIRECT_HTTP_AUTHORIZATION`).
- **Another person signing in in another tab** would have let this tab save as them: `ApiService` refuses calls whose `userKey()` differs from the page's owner, and `BootService` reloads the page.
- **Zoneless change detection is scheduled**: after a click, wait for the DOM (`waitForFunction`), don't read it synchronously.
- **A zoneless OnPush `<dialog>` opens before its words are drawn**: the confirm dialog set its question and called `showModal()` at once, and opened empty (or with the last question). `ask()` calls `ChangeDetectorRef.detectChanges()` before `showModal()`.
- **jsdom has no `showModal()`**: a spec of a page that opens the confirm dialog calls `provideTestDialog()` (`core/testing/test-dialog.ts`) in `beforeAll`.
- **Headless Chromium asks `beforeunload` only after a real press** (`Input.dispatchMouseEvent`); values set by script alone give no question.
- **A component's styles have a budget** (`angular.json`: a warning over 6 kB, an error over 12 kB); the admin pages `@use` the shared `pages/admin/_admin.scss` and keep only their own rules in their files.
- **The server's sentence is shown only on the admin pages** (`admin-error.ts`); a learner's page words what happened from its own keys (`ownProgressProblem()` for the own file).
- **Two confirm dialogs on one page need their own ids**: `<app-confirm-dialog name="...">` (the default `ow-confirm` is the admin pages', which their specs read).
- **A question a learner meets in the shell must be drawn while closed** - the shell spec reads every kept-English string from the DOM: pass it as the dialog's `words` (the sign-out question), not only to `ask()`.
- **Person or visitor is decided when a request is ISSUED, never when it is sent** (`ISSUED_AS`): the build analyzer's interceptor sent a request as a visitor whenever no token came back, so a person whose refresh failed had their round stored in the visitor's row - or, with no key, MADE a visitor out of it (the server cannot tell). A person's request with no token fails locally (401 `sign_in_required`), and `gate()` refuses a person's page whose person signed out before anything (401, never "somebody else", whatever the switch). `auth.interceptor.spec.ts` holds it (mutation-checked).
- **A visitor's key is kept while a sign-in is required**: a 401 `sign_in_required` to a visitor only calls `AuthService.requireSignInNow()`; forgetting the key there would lose exactly what the next sign-in should move.
- **A visitor whose key the server no longer knows gets a 409 next, not a "changed elsewhere"**: the 401 `visitor_unknown` forgets the key (`VisitorKey.lost`), and the next save goes as nobody's with the visitor's old generation - 409 `progress_changed`. `ProgressStore` loads nobody's progress then but leaves `changedElsewhere` unset on a visitor's page while `lost` is true ("replaced by a file or an administrator" would be wrong; `visitor.lost` says it). `progress-store.service.spec.ts` pins it.
- **Three saves at a round's end would make three visitors**: `ApiService.visitorSave()` lets one "maker" (no key) out at a time; the others wait and work their headers out after the wait (the `headers` function), so they carry the key and the generation the maker's answer brought.
- **Extra awaits in `ApiService` break specs that count microtasks** (`progress-store.service.spec.ts`'s `settle()` is five `Promise.resolve()`s): `request()` is not `async` - it returns `send()`'s promise, and `send()` maps the answer inside the observable - so a person's call takes as many ticks as before.
- **A save without a generation is never sent**: `ApiService` throws a local 409 `progress_changed` instead, and the store loads the progress again - so the server's 428 can only mean another client, or a header dropped on the way: kept as a failed save ("Not saved yet"), never "changed elsewhere".
- **A page that keeps its own copy of the progress undoes an import**: a round that copied `store.progress()` at its start and saved the copy whole after each answer wrote the old progress back under the new generation after a reload. Answers go through `ProgressStore.updateNote(midi, change)`; read `store.progress()` to pick a round, never keep it.
- **An accessible name holds the words the control shows** (WCAG 2.5.3): a key that names a control with visible text takes that text as a placeholder (`language.button` {code}, `midi.button` {label}); the browser check compares them.
- **`HttpClient` with `responseType: 'text'` gets a refusal's body as text**: `ApiError` parses it as JSON for the code (`bodyDetails()`).
- **A menu fades in over 140 ms**: a screenshot taken at once shows it see-through, over the page - the browser check waits and asks `elementFromPoint` whether the menu is on top.
- **jsdom has no `matchMedia`**: the bar is then a desktop's; a spec of the phone's bar stubs it (`vi.stubGlobal('matchMedia', ...)`) and answers only the bar's `max-width` query - ThemeService asks `prefers-color-scheme` and listens too.
- **A spec of ThemeService makes the service before the account arrives** (`signedInWith()` in `theme.service.spec.ts`), as the app does at its start: made lazily after the account was set, its effect's FIRST run comes after the person's choice and its refusal - and puts the account's theme back by itself, so a missing revert passed (found by a mutation check).
- **A "nothing happens" check must wait as long as the thing would take**: the spec "once somebody chose here, the token no longer decides" checked one microtask after the token changed - before a switch on its way could have landed - so a regression that followed the token anyway passed (found by a mutation check); it waits with `settled()` and counts the requests now.
- **A preferences save is an auth change too**: the SDK's `savePreferences()` writes the session and fires `onChange` like a refresh, in every tab - `BootService`'s listener sees the same person (no reload), `TranslationService`'s sees a changed `locale` but a choice stored here (nothing to adopt). A fake `AuthService` in a spec of anything that draws the theme button needs `preferences`.
- **The stand-in IAM sends no `preferences` unless its state has some**: every tour and test before 2026-10-06 runs as against an IAM before its 015 (the app's own settings); the preferences tour sets them and puts `null` back at its end.
- **The bar's fold is measured, not guessed**: a row that does not fit squeezes the person's button first (its container has `min-width: 0`), so a measure taken on a crowded row reads too little - `--measure` measures at NAME_BAR_MIN - 1, where nothing is squeezed.
- **Another session's browser check may hold 8590 / 8597**: never stop it; `SITE_PORT` / `IAM_PORT` for others (the database is named after the port).
- **The MIDI notice** words the problem's kind in the page's language and adds the browser's own reason after a colon, as it is, `lang="en"` - in Slovak too.
- **The IAM's switch is kept a minute and remembered for the request**: a test that flips the stand-in's `login_required` sees the old answer until the kept file (`<cache_dir>/anotoki-iam-application-*.json`) is older than `application_ttl` - move its times back (`api/auth`'s `switch_age()`), delete it, or give `application_ttl` 1 (`testenv.php --application-ttl=1`); in-process, the SDK remembers the answer in a static (`anotoki_iam_login_required_reset()`), while `application_file` is read on every call. A test whose settings name neither a file nor an IAM on this computer is refused by `test_offline_auth()` - it would ask the live IAM (the hosted site's settings, written by setup.php, get `application_file` added in `api/hosting`).
- **Only Bearer is a sign-in**: `requestUser()` uses the SDK's `anotoki_iam_sent_bearer()`; `Basic ...` (a host behind a password file) is nobody, never a 401 of its own - and a Bearer header that does not verify never falls back to the visitor key (`requireOwner()` asks `requestUser()` first; `tests/api/visitors.test.php` holds it).
- **The visitor key is read in `requireOwner()` and in the move (`routes/visitor.php`, behind `requireUser()`) and nowhere else**, and a visitor is made only inside the transaction of a save whose body already checked out (`visitorMake()` refuses to run outside one): a refused or failed save makes nobody and counts nothing. `signedInUser()` refuses a visitor `SiteUser`, so `requireUser()` / `requireRole()` stacked inside `requireOwner()` still mean a verified token.
- **A maker's save names generation 0** (what nobody's state says); a visitor's or a person's later save to 0 is 409 `progress_changed` (a second tab) - a person's 0 stays a 428 as before.
- **Work after the answer runs after a 204's client has gone**: a 204 has no body, so curl (and the browser) has the whole answer before the after-response sweep is done - a test that looks for the sweep's effect after a 204 polls (`eventually()` in `tests/api/visitors.test.php`); after a 200 under `php -S` (no Content-Length, the connection closes at the end) it has run.
- **A table of a person's data must be in `STORE_PERSON_TABLES`** (`api/store.php`): the sweep and `peopleDelete()` empty those before the users row, and the foreign keys do not cascade - one left out makes every sweep batch that meets such a visitor fail (logged, never failing a request).
- **005's descriptions must pass 004's gate**: the browser check's "database behind" tour takes 005 off the record and applies it again (with visitors in the database), and `tests/unit/migrations.test.php` runs 004 and 005 again over visitors - 004's strings gate refuses any description with "header", "account panel", "footer's theme", "admin area" or "admin console".
- **While an update waits, one page runs: Migrations, for an ADMIN** (the family's `<anotoki-site-gate>` lets it through: update-pending + ADMIN + the route). `AppComponent.pageShown` draws the outlet for an ADMIN on `/admin/migrations` whatever the boot status - ONE outlet for both, so the page (and what its Apply said) is not drawn again as the app starts; the bar has Migrations alone (`BootService.onlyMigrations`), `/admin` opens it; after an Apply that leaves nothing applicable the family's page calls `onUpToDate` -> `resumeAfterUpdate()` (the start goes on from `waiting`: the move, the progress, `ready`, and the strings again - `TranslationService.reload()`, as the ones in memory are from before the update) and `SiteStatus.markReady()` - no page load. Anything new that must work while an update waits needs a path in `SITE_OPEN_PATHS` on the server (and nothing that reads tables a pending migration makes) and the same care in the shell.
- **The gate's content is projected**: `<anotoki-site-gate>` shows or hides what the shell puts in it, and Angular makes projected content whether it is shown or not - so the shell keeps its own `@if (pageShown())` around the outlet: while the site is not ready no learner page is even made. A component that must not run then must not sit inside the gate unconditionally.
- **Nothing may stand in front of `GET /api/site-status`** - no token, key or role check, no middleware of a route group, no gate of the app's own, nothing that needs the IAM or the settings to be right: the pages ask it before anybody can be signed in, and the family's frontend reads any 401 or 500 there as "unavailable" ("The site is not available right now" instead of the right page). `tests/api/site.test.php` asks it as everybody (`askers()`) in every state; a settings file PHP cannot run is "not set up" (`localSettings()`), not a 500.
- **The status page reloads by itself once the site is back** (visitors' and learners' views ask `/api/site-status` every 30 s): a progress save still failing at that moment makes the browser ask "Leave site?" (`BootService`'s beforeunload) - the store retries every 15 s, so it is usually through first.
- **A migration must never change what `usersSeen()` writes** (the users table's `id`, `preferred_username`, `last_seen_at`): the Migrations page's own routes go through the role check, which keeps the caller's users row on every call - also while the database is behind - so such a migration would make the page that applies it fail with `503 database_unavailable` before it runs.
- **`String.replace` with a string treats `$$` as `$`**: an edit script that writes Playwright's `$$eval` through it gets `$eval` - use split/join.
- **A spec's stand-in for `<app-notation>`** must provide `NotationComponent` by `useExisting`, or the page's `viewChild(NotationComponent)` finds nothing (`steps.spec.ts`, `trainer-page.component.spec.ts`).

## Known issues (not fixed yet)

- **Tempo mode assumes one note per click**: windows come from the beat index, not `note.beat` / `durationBeats`. Rhythm (phase 4) needs per-note times and a click per beat.
- **Unsaved progress/path changes live only while the page is open** (sessions survive in the outbox; a failed progress PUT is retried while the tab lives, `beforeunload` warns in iam mode).
- **The owner's computer and the hosted site keep separate databases**; move data with an export. The same holds for the app's words: each database has its own strings, and the Translations page's export and import (or `tools/translations.php`) are the bridge.

## Tests

- **Backend** (`cd backend && php tests/run.php`; also under PHP 8.2): each file
  its own process and throwaway database; `tests/lib.php` first (it writes a
  `PIANO_TEST_CONFIG` folder with the machine's DB server + a `piano_test_`
  name before the app loads, and refuses anything else).
  - Tokens: `test_token($id, $roles = [], $extra = [], $sign = [])` - no roles is a learner; `test_auth_iam()` the settings that check them; `test_auth_settings()` what the test process itself loads.
  - `unit/auth` - loopback, local names, relayed requests (`isThisComputer`), the old functions gone, the browser's settings whatever an old mode says (with `loginRequired`), what reaches the SDK, only Bearer a sign-in (Basic is nobody, "Bearer" alone a 401), roles and `SiteUser::has` (MEMBER a learner), the cache path, no test asking an IAM off this computer (`test_offline_auth()` and a scan of every settings write under tests/), textClip.
  - `unit/config` - not set up without/with bad files, a file PHP cannot run no setting (named with its line - never with PHP's message, which may quote the password), an old file with mode / local_user_id still a setting, no committed stand-in, the test folder only for piano_test_, owner-only writes.
  - `unit/migrations` - through the family's engine as the app sets it up: an empty database gets every migration (nothing written to find out, the record's shape kept, the folder listed as the engine lists it, the app's lock - busy, then applied); `php migration.php` builds a database from nothing (`--status` / `--dry-run` only read); the older `migrations(name)` table is read and renamed in place (the `prepare` hook); a failing file rolled back whole and named ("statement N of M"), it and the files after it waiting; the family's splitter; 004 adds the sequence and users.progress_generation (a number of its own for every row) and nothing else of 001, says it is unfinished, and its gate refuses a column of another shape; 005 adds exactly the visitors' schema (no row changes; what users_kind_check lets in), 004 and 005 run again over a database with visitors, and 005's gate refuses 001's check under another name; 006's header (finished, words only: four statements, the gate last; the next change is 007); 007 (finished, the next change is 008; one DELETE and its gate: exactly the card's four keys and their strings go, nothing else - not a table of 001 -, again and again, the gate refusing a key that stays).
  - `api/site` - the site's gate on the real server, state by state: not set up and never installed (every path but `/api/site-status` 503 `not_set_up` with the setup page, JSON, no-store, inside the security headers), not set up once installed (`storage/installed.lock`: never the setup page), an update waiting (503 `update_pending` + Retry-After 60 for every kind of route and every caller - a person, an ADMIN, a visitor's key, nobody -, paths that only look open held too, nothing written; the open paths answer: the sign-in settings, the words - with ETag -, the health check, the Migrations page's routes by the token's role; Apply makes it ready), the database out of reach (`unavailable`: nothing held, the routes' own 503 `database_unavailable`), a settings file PHP cannot run (not set up, no 500, the log names the file and line), ready. In every one `GET /api/site-status` answers 200 `{state, installed}` to anybody (`askers()`: nobody while the IAM requires a sign-in, a visitor's key, a token that does not verify, one that ran out, a Basic header) - also with the IAM's switch off and with the IAM out of reach: the pages read it before anybody can be signed in, and a 401 or a 500 there would have them say "not available right now".
  - `unit/visitors` - the counted address (trusted proxies, right to left, an IPv6 /64, X-Forwarded-For never on its own), visitors.local.php and its limits (an unreadable file: the defaults), the key, the 30 days equal in the frontend, visitorMake() only inside a transaction, usersSeen() a person's only, the work after the answer.
  - `api/visitors` - two servers (one with small limits) with sign-in off: nobody's state, the first save of each kind makes a visitor (the key once, only its hash stored, nowhere in a log), a failed first save makes nobody and counts nothing, the visitor's own documents and generation (0 is a second tab's 409), unknown and malformed keys, a Bearer header never falling back to the key, isolation, no own file or admin panel, sign-in required again (the key not looked up), seen at most hourly, the limits (per address, /64, X-Forwarded-For, in all, at once, rounds, document size), a whole progress fits, the sweep (30 days, every child table, batches, SKIP LOCKED, the marker, at once after a new visitor, a failing sweep never failing the request), a database without 005 (every round held at the gate, nobody made; `visitorsMustBeReady()` still 503 `visitors_unavailable` under it - a process of its own), requireUser()/requireRole() refusing a visitor however stacked. Mutation-checked.
  - `api/visitor_move` - the move at sign-in: the person's note byte for byte, the visitor's others, a step both have merged (a pass never lost: best max, attempts added, the earlier pass, the newer last try; fields only the visitor has), every round with its id / key / time, the visitor gone and its key 401 `visitor_unknown`, a new generation (an old tab 409); again `found: false`; an empty account; rounds alone keep the generation; a colliding round dropped and the person's retry of a moved one stored once; merged notes / path over BODY_LIMIT not made; no token 401, no or a malformed key 422; the switch on; another person untouched; a row held past `move_lock_timeout_ms` 503 `visitor_move_retry`; the person's row gone 401. Mutation-checked.
  - `unit/transfer` - an export into an account (the file's userId not read), refusals (not_an_export / invalid_export, versions), export/import round trip, replacing (never a mix, nobody else touched, a new generation each time), a move, `tools/progress.php` (--user required, --replace, --move, no --owner).
  - `api/me` - one's own file: the export (download headers, nobody else's), a round trip, the dry run, the replace rule, every refusal with a code and a sentence, the size limit both ways (an export just under EXPORT_LIMIT comes back whole; over it is never handed out); the generation: 428 without, two tabs side by side never refuse each other, a tab of before an import or an ADMIN's delete gets 409 and nothing comes back; an import holding the users row while a save and a second import wait (two servers: php -S answers one request at a time).
  - `api/api` - the progress routes through the router as a learner (`api()` sends the generation a fresh load gives): 401s (no token, expired, another issuer, "Bearer ", Basic - nothing written), the answers, `{}` round trips, shape checks (400/413/415), session whitelist and bounds, Idempotency-Key, order, 404/405, no CORS, the built app's files and SPA fallback, not set up (the setup page named while never installed; the status says so), a database behind (503 `update_pending`, POST /api/sessions too; nothing written to find out).
  - `api/auth` - tests-signed tokens: 401s, every bad token, users row, two people isolated; a whole sign-in through the stand-in IAM (PKCE, MEMBER / EDITOR / ADMIN, refresh, deny, the ID token refused); an old settings file opens nothing; the JWKS downloaded and cached; the IAM's switch relayed (off, garbage, out of reach), the stand-in's public route, and the switch read from the stand-in (kept a minute, fetches counted in its `log`, the last answer while it is down and logged once, 404 and nothing read = required, a signed-in request never asks); the stand-in's preferences (none at first - no claim, a save 503 -, then the claim in the tokens, the SDK's save: the preflight, a cross-origin answer, only what it names changed, a language into the next token, 400 for what it does not take, 401 for no token / not one / another's key, 503 when refusing).
  - `api/admin` - every admin route role by role (nobody / a bad token 401, learner / MEMBER / no roles claim 403 in that group's words, EDITOR through the staff group only, ADMIN through all); People (counts, order, a visitor counted on its own line and never listed or deleted, one person deleted whole - their imports row too - nobody else touched, the string they reworded kept by nobody, 404, deleting oneself); the Migrations page's routes in the family's shapes (the list with ISO UTC times, a file's SQL - 404 for anything that is no file of the set -, Apply; the Database page's old addresses 404) and on a database behind (everything else 503 `update_pending`; an EDITOR 403 and nobody 401 in the site's own words; 409 busy and `php migration.php` refused under the lock; then applied and ready), a failed update named and logged.
  - `api/setup` - the local setup: exactly the family's fields and defaults, nonce, Origin, Test connection's sentences (DB and IAM), Save under the lock, auth.local.php exactly three keys, a re-save over an old file, a relayed or foreign-named request is a real host showing nothing saved, a settings file PHP cannot run (the page opens and names it, Save writes it anew).
  - `api/hosting` - `tools/build.php` (exact contents - the family's library in, the old engine and gates out -, refusals), the host setup (token, tests, install, lock, self-delete, re-upload refused; installed: the status `ready`/`installed`, and with the settings gone `not_set_up` without the setup page), a re-run for an update (nothing saved shown, an owner or file sent along ignored), the front controller.
  - `unit/translations` - the seeded languages and keys, English and Slovak for every key, placeholders, plural families, the migrations of this work touching only their three tables and nobody's progress, 002 refusing a non-UTF8 database, every seeded string passing a save's checks, a string migration's gate, the key scan (used and unused keys, families, dynamic keys, the kept English, `innerHTML`).
  - `api/translations` - the bundle (ETag/304, unknown codes, no token looked at), the staff's routes and ADMIN's (an editor rewords, imports and exports, and is refused the languages), languages, saves checked whole, export/import, the CLI, concurrent deletes and saves, `updated_by` following a person, only 001 applied (the words 503 `update_pending` from their own route - no table asked for -, the admin routes the gate's, nobody looked up).
- **Frontend** (`cd frontend && npm test`, Vitest + jsdom): theory, srs, path (incl. songs vs pools), songs, the API outbox (HttpTestingController), the store's save chain and retries, boot states, the sign-in card (failure worded from its code), stats, the sequence player (wait and tempo, keys handed to `feedback`); and with the words: `TranslationService`, the pipes, `path-words`, the title strategy, the interceptor, the language chooser, the shell with no bundle (no text of a key's shape), `MidiService`, the home, lesson, steps and trainer pages (a language switch mid-step re-words the feedback), the admin pages (Translations, Languages, People; Migrations is the family's, tested in the library), the admin layout per role, the routes and guards (`signInGuard`: redirect and the way back, the failure escape, the boot states, nobody sent to the IAM while the site is not ready - the address kept; `adminGuard`; the split, the Migrations route loading the family's page), grid, drafts and confirm dialog; while the site is not ready (2026-10-07, `app.component.spec`, `boot.service.spec`, `top-bar.component.spec`): a visitor and a signed-in learner read "The site is being updated" in their language (Slovak too) with no error, no code, no setup or Migrations link, a Sign in only for nobody, and no note of the shell's; an ADMIN reads "A database update is waiting" and its "Open Migrations" reaches the page; a signed-out ADMIN's Sign in goes to the IAM with this address and comes back to the Migrations page; the page stays as the app starts after an Apply; the setup page only while never installed (installed, or the database out of reach: "not available right now"); the start waits (sign-in and strings, no move, no state - also for an update that came after the site was asked) and resumes after an Apply, the strings asked again; the bar's sections gone while it waits, Migrations alone for an ADMIN in /admin; the generation on every save and no save without one (`api.service.me.spec.ts`), a 409 settled by loading again and the other tabs' marker (`progress-store`), a reload in the middle of a round sends none of the old notes (`progress-store`, `trainer-page` with the real store) and an answer during a reload waits for it, a 428 kept as a failed save, the own progress file's flow and every code (`own-progress`), the top bar (`top-bar`: the row, the sections lit, the menus' keys - Tab and Shift+Tab from the first, a middle and the last item onto the menu button, mutation-checked -, the phone's menu, "Not saved yet", the admin panel in English, the sign-out question, no empty phone menu before the app runs, every control's name holding its words), the signed-out banner saying why a sign-in could not start (`app.component`), the piano's widget (`midi-panel`), the translation service's admin panel (English under /admin). Visitors (stage D): `visitor-key.spec` (the first key stays, compare-and-delete, the storage event, memory when storage refuses, `active`), `auth.interceptor.spec` (decided as issued, both ways; a person's request with no token never sent - through `ApiService` too, the round kept in the outbox; the key only on a visitor's; remembered from a maker's answer; `visitor_unknown` forgets, `sign_in_required` keeps it and calls `requireSignInNow()`; the move carries both), `api.service.visitor.spec` (generation 0 only on a visitor's page; one maker for a progress PUT, a path PUT and a round at once; a failed maker; 429 and its Retry-After; 413 / 422 `visitorRefusal`; a person's calls refused on a visitor's page; `moveVisitor`; `adoptOutbox`), `auth.service.spec` (`loginRequired` only on an explicit false), `sign-in.guard.spec` (a visitor through to the learner pages, never `/admin`, saves settled first), `boot.service.spec` (a visitor with no key / a key / a key gone / sign-in required meanwhile; the move before the state - found, not found, 503 waited out once, kept on failure, 422 forgotten, mid-session; the visitor's outbox at a signed-in start), `progress-store.spec` (a visitor's 413 held back, a 429 after its Retry-After; the 409 after `lost` says no "changed elsewhere"). Stage E: `app.component.spec` (every visitor note and the moved / kept / not-moved notes in the kept English - the no-bundle sweep and "nothing kept is a leftover" cover them; the notice on `/` and `/stats` only; no signed-out banner for a visitor; a refused sign-in worded and closable; a person whose sign-in ended gets none of the visitor's notes), `stats-page.component.spec` (the progress file for somebody signed in, the sign-in line for a visitor), `people.component.spec` (the visitors line), `top-bar.component.spec` (Sign in offered to a visitor, in the row and the phone's menu). Mutation-checked: the null-token request sent, no single flight, the gate falling to a visitor, the key forgotten on `sign_in_required`, the 413 retried, no outbox adoption, the move after the state, a visitor let into `/admin`, the signed-out banner shown to a visitor, "changed elsewhere" after `lost`. The account's preferences (2026-10-06): `theme.service.spec` (the device's for nobody - nothing saved; the account's taken at sign-in and when it changes, kept for the first paint; a choice saved, none when the account has it or keeps none; no flick while a save is out; one save at a time, the latest last; a refusal puts the account's back and says so; an overtaken refusal is no news; signed out mid-save), `theme-toggle.component.spec` (the note, role alert, gone at a press or a click elsewhere), `pipes.spec` (each order for a day, a moment's halves, the 12- and 24-hour clocks in English and Slovak, nobody signed in or nothing chosen as before, the stamp - the server's numbers kept across a DST gap - and the patterns), `translation.service.spec` (`saveToAccount`: nothing when the account has it, for a visitor or with no preferences; one at a time, the latest last; `invalid_request` silent; another refusal - `access_denied` too - said, an overtaken one not; the family's order: the account's language over the device's, not over `?lang=`, the device's next when the site lacks the account's, the old order signed out or without preferences; a choice that won saved as it switches, an overtaken one not; a refused language kept for the visit, the account's at the next; an account change followed over the device's and an earlier choice on the page, not over `?lang=`, not while a save is out), `language-switcher.component.spec` (saved once the page switched, not when the strings could not be had, a re-pick the account lacks saved, the note in the page's language, silence for a language the IAM lacks), `auth.service.spec` (`preferences` only while signed in, `savePreferences` handed to the SDK), `stats-page` and `people` specs (their times in the account's order and clock; the family's Migrations page takes the same `localDateText(..., 'stamp')`). Mutation-checked: the account adopted while a save is out, no revert, no note, no queue (theme and language), a save without an account, `invalid_request` said, the re-pick not saved, a save before the switch, the server's clock moved to the reader's zone, a moment's one chosen half ignored, a session that ended still choosing, the note kept after a click elsewhere; and the language order: the device before the account, an account change not taking the place of this page's choice, followed while a save is out, followed over `?lang=`, followed over a stored choice without preferences, a switch not saved. A spec gives its strings with `provideTestTranslations()` (`core/testing/`).
- **Browser**: the committed check, skill `check-in-browser` (`node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep] [--measure]`, `PHP=` the 8.2+ binary): `playwright-core` in `<temp>/pw` (never in `frontend/`) + headless Edge, the stand-in IAM on 8597 and the built app on 8590 (`SITE_PORT` / `IAM_PORT` when another check holds them), `piano_test_browser_<port>`; everything stopped and dropped at the end. It checks a deep link signed out -> the IAM -> back (no call for a learner's data before the IAM); the bar at 360 / 390 / PHONE_BAR_MAX / +1 / 1280 / NAME_BAR_MIN, light and dark, English and Slovak, by bounding boxes; every bar control's name holding the words it shows; the menus on top of the page, their contents, keys and real Tab / Shift+Tab presses (the focus on the menu button); the piano's box; "Not saved yet" (a save made to fail); the own progress file and three stale tabs (Stats; the Note Trainer mid-round in the same browser and in another - a note played after the import, a 409 in the other, and the imported notes still on the server); the EDITOR / ADMIN split and the admin panel in English; every learner page in Slovak with no key-shaped text, and a refused sign-in (no menu button at 390); and, with the stand-in's `login_required` false (the app keeps its answer one second there: `testenv.php --application-ttl=1`), a visitor: Learn without the IAM and its notice, a lesson's meet and drill whose first save is held at the network so the drill's notes, path and round meet it - exactly one save without a key and ONE visitor row -, the progress after a reload, Stats' sign-in line, another browser empty, `/admin` to the IAM, then a sign-in as a person who has note 60: moved and kept said, her C byte for byte, the visitor's steps and round hers, the key and the visitor gone; in Slovak at 360 / 390 the notice wrapping, the phone's menu, a visitor deleted under the page (`visitor.lost`, the next 409 without "changed elsewhere", a new visitor after); sign-in required again mid-visit (`visitor.signInNow`, the key and the visitor kept, a new browser sent to the IAM, the sign-in moving it); and the account's preferences, with the stand-in's `preferences` set (the real SDK 1.2.0 against the stand-in's endpoint): the account's dark over this browser's light at sign-in (kept for the first paint), Stats' rounds and What's new in the account's order and clock, the button saving to the account, another tab following, a refusal at 390 (the account's theme back, the note inside the screen and on top, gone at a click elsewhere), Slovak chosen in the bar becoming the account's language and another tab following it, a fresh browser that remembered Slovak reading the account's English, and an ADMIN's admin panel in the account's dark with People's and Migrations' times in its order and clock; a database behind the code (005 off the record): the family's status page for a visitor and a learner ("The site is being updated", no error, nothing asked that fails, nobody sent to the IAM; in Slovak at 390), Sign in from it coming back to the address, the ADMIN's "A database update is waiting" -> the family's Migrations page (a failed Apply with what PostgreSQL said, then "Up to date" and the app resumed in place), and the learner's page coming back by itself; and not set up (the setup page only while never installed - "not available right now" once `installed.lock` is there -, Try again once set up). Look at its screenshots (`--keep`), then delete the kept folder: its settings hold the database password.
  - At the rebuild (before the IAM was the only way in): every view (a lesson's meet/drill/read/in time, a trainer round, sheet practice, songs, stats, changelog, light/dark/390 px, no overflow, no console errors) and against the stand-in IAM (sign-in, saves, IAM outage -> "Not saved yet" + outbox, beforeunload, signed out mid-session, another user in another tab, sign-out, access denied/cancelled); the setup page locally and as a host (via `--host-resolver-rules`).
  - With the translation work (a flow of about 540 checks, kept in that work's scratchpad, not committed): English, then Slovak through the chooser and `?lang=`, `<html lang>`, no text of a key's shape and nothing left in English, a lesson's steps with their feedback in Slovak and re-worded on a language switch mid-step, practice pages, Stats with a stored English label; the owner pages (a string changed and seen after a reload, a plural family, export and import, a language added, hidden and deleted, leaving with unsaved cells asks); the stand-in IAM (the sign-in card in Slovak before signing in, `ui_locales` in the authorize request, a token's `locale` with nothing stored, ADMIN sees the owner link, a MEMBER does not and gets 403 `owner_only`, a refused sign-in worded from its code); every boot state (not set up, a pending migration, load error, sign in, ready) with and without a bundle; 390 px and 1100 px, light and dark: no sideways scroll, the chooser's menu inside the screen, the nav in at most three rows.

## Testing without real MIDI hardware

```js
window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', {
  detail: { midi: 60, velocity: 100, timestamp: performance.now() },
}));
```

`window.pianoMIDI` is the live `PianoMidi`; every practice view listens to it.
Read the staff with `.vf-stavenote[data-midi]` in DOM order, e.g.
`#dr-notation .vf-stavenote[data-midi]` (drill), `#tr-notation` (trainer),
`#sh-notation` (sheet), `#sg-notation` (song), `app-sequence-step` (read,
in time, song steps), `#mt-notation` (meet).

A throwaway app (never the owner's database), signed in through the stand-in IAM:

```bash
cd backend
php tests/tools/testdb.php template
php tests/tools/testenv.php storage/manual --db=piano_test_manual      # its IAM: http://127.0.0.1:8597
PIANO_TEST_CONFIG=storage/manual php -S 127.0.0.1:8590 router.php
# afterwards: php tests/tools/testdb.php drop piano_test_manual
```

The stand-in IAM: make a key
(`php -r "require 'api/anotoki_iam.php'; echo json_encode(anotoki_iam_test_keypair('k'));" > <dir>/key.json`),
run `FAKE_IAM_DIR=<dir> FAKE_IAM_ISSUER=http://127.0.0.1:8597 php -S 127.0.0.1:8597 tests/tools/fake-iam.php`
(`testenv.php --issuer=` for another address). `POST /_test/state`
sets who signs in (`user`: `{id, username, roles, locale?}` - `roles` `["MEMBER", "ADMIN"]`,
`["MEMBER", "EDITOR"]` or `["MEMBER"]` for a learner, `locale` is the token's claim, `en` by default), the
token lifetime (`ttl`), what it says about the app at `GET /api/public/applications/{id}`
(`login_required`, default true; `application_missing` - a 404) and failures (`down` - every
endpoint but the key set 503, `refuse`, `deny` + `deny_description` - which the app never
shows: it words `access_denied` itself). Its `log` lists the requests it got. The app keeps
its answer a minute (`testenv.php --application-ttl=1` for a check that switches mid-run,
or delete `<folder>/cache/anotoki-iam-application-*.json`).

`navigator.requestMIDIAccess()` is refused in headless browsers - the app shows
"The browser did not allow MIDI: <the browser's reason>" (the problem kind
`refused`, worded in the page's language; the reason in English) in the status
pill instead of crashing, which is what to check.

### Review checklist (every change)

- Every listener and timer a component adds is removed in `DestroyRef.onDestroy`; players destroyed.
- MIDI handlers advance state synchronously; saves are fire-and-forget.
- No page keeps a copy of the progress: an answer goes through `store.updateNote(midi, change)`.
- No logic copied out of `core/music/`; no persisted unit/step id renamed.
- Components are three files; colours from tokens; works at 390 px, light and dark.
- Every new query on a person's data is scoped to the request's user id; nothing takes a user id from a body or URL. The site's strings are the exception: public to read, the staff's to write; People (ADMIN) the one read across people.
- The visitor key is read only by `requireOwner()` and the move (`routes/visitor.php`); a new per-person route that a visitor may use takes `requireOwner()`, any other `requireUser()` / `requireRole()` (which refuse a visitor); a new table of a person's data goes into `STORE_PERSON_TABLES`; a new migration's descriptions pass 004's and 005's gates when they run again.
- A save of a whole document checks the generation inside its transaction (`storeRequireGeneration()`); anything that replaces or deletes a person's progress takes their users row first (`storeLockGeneration()`) and starts a new generation (`storeNewGeneration()`) - or deletes the users row.
- Every admin route is inside a group of `api/routes/admin.php` that has `requireRole()` (staff or ADMIN); a present-but-bad token is a 401 everywhere; nothing reads a setting to decide who somebody is.
- A new learner route is under the `''` route with `canActivateChild: [signInGuard]` (a visitor's too); a new admin page under `admin` (`adminSignInGuard`, and `adminGuard` when it is ADMIN's); the admin pages stay English.
- A new API call goes through `ApiService.request()` and is a person's (`asPerson` / `AS_PERSON`) unless it is one of a visitor's four (state, progress, path, sessions - the backend's `requireOwner()` routes); nothing decides person or visitor from whether a token is there as a request leaves.
- A learner never sees the server's sentence: a failed call is worded from its code, by a key.
- A new session field or mode is in `SESSION_FIELDS` / `SESSION_MODES` and `SessionInput`.
- A schema change is a new migration; `setup.php` still parses under PHP 7.4.
- Anything "per day" uses local dates.
- A date or time a page writes goes through the `localDate` pipe (the account's order and clock for somebody signed in); a control that changes the theme or the language saves a signed-in person's choice through `AuthService.savePreferences()` - only while `preferences` is not null, one save at a time, the latest last, a refusal said by a key.
- UI text short and plain; a learner-visible change has a changelog line.
- A learner-facing word is a key with English and informal Slovak ("ty") in a migration; state holds keys, never sentences.
- Nothing worded is awaited in a MIDI handler.
- Note names, song titles and device names are never translated.
- A new shell string is also in `kept-english.ts`; a key put together at run time has its prefix and tails in `dynamic-keys.ts`.
- The top bar's words are keys (in kept-english.ts too) but for the admin panel's own (English literals); a change to its row is measured again (`run.mjs --measure`) and PHONE_BAR_MAX changed in the .ts and the .scss together; the browser check passes and its screenshots are looked at.
- `php tests/run.php` (8.5 and 8.2), `npm test`, `npm run build` pass; interactive changes checked in a browser on a throwaway database; `setup.php` still parses under PHP 7.4.

## Extending the curriculum

Currently 15 white keys, C3-C5 (`TheoryService.curriculum`); the path uses the
8 right-hand ones. Sequences are treble clef only (`Notation.renderSequence`) -
the blocker for phase 2.

1. **Bass clef in sheets/songs**: `clefForMidi` exists (used by single notes);
   `renderSequence` needs a clef option, and Sheet Practice stops filtering to `midi >= 60`.
2. **Sharps/flats**: add them to the curriculum; `midiToVexKey` / `midiToName`
   spell sharps and `buildNote` adds the `Accidental`. Flats are not
   distinguished yet (a key-signature-aware speller later).
3. **A wider range**: the curriculum and each phase's `keyboard` range.
4. **More songs**: `SongsService.songs`, named from a unit; quarter notes
   (`seq()`) until rhythm arrives in the notation (phase 4).
