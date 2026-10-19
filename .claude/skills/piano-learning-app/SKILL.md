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
an update waiting -> 503 `update_pending` but for the open paths), its
pages replace the app's "not set up yet" card and its own Migrations page
(`<anotoki-site-gate>` around the shell's outlet, `<anotoki-migrations-page>`
at `/admin/migrations`); signing in works while an update waits. Migration
007 (written whole and final; words only - the card's four `boot.notSetUp.*`
keys deleted) goes with 005 and 006 at the hand-over.

**2026-10-07, later: `@anotoki/lib` 0.1.1 and three-number versions.** The
Angular half is 0.1.1 (the PHP half stays 0.1.0 - unchanged in 0.1.1): the
gate takes the shell's view as an `<ng-template>` and makes it only while it
shows it - no page runs behind the status page, also when an update comes in
the middle of practising (see the gotcha "The gate's content is a
template"). Versions are MAJOR.MINOR.PATCH: What's new's entries renamed
0.1.0 ... 0.4.0, nothing added; `frontend/package.json` 0.4.0 (and the
package-lock's root, which still said 0.3.0).

**2026-10-08 to 11: the anotoki family's kit - `@anotoki/lib` 0.2.0** (the
PHP half stays 0.1.0; the owner's decisions, `docs/decisions.md`). The top
bar is the family's `<anotoki-top-bar>`, wrapped by `layouts/top-bar` (see
its entry below), with the family's segmented theme switch in the round
button's place; the brand, icons, spinner, language chooser, menus, the
piano's popover, the questions (`ConfirmService` + `<anotoki-confirm-host>`),
`ThemeService` and `theme-boot.js` are the family's (`core/family-kit.ts`),
their words this app's strings where it has them (`core/i18n/kit-words.ts`).
A site overrides the family's colours only (the owner's rule): Piano keeps
its palette (`anotoki.root()` in `styles.scss`) and takes the family's
corners, shadows, Manrope and the look of its pieces; it keeps its pages,
keyboard, notation, What's new and own buttons for now (onto the kit's
components in a later phase), their
element rules kept off the kit's components (`$piano-own`). The gate's
template is marked (`<ng-template anotokiSitePages>`), the Migrations page
comes from `@anotoki/lib/migrations/page`. Migration 008 (written whole and
final; words only - the round button's three `theme.*Spoken` keys deleted,
four descriptions reworded) goes with 005, 006 and 007 at the hand-over.
`PHONE_BAR_MAX` 1320 (the switch is wider than the round button).

**2026-10-11: the words through the family's library - `anotoki-lib` 0.3.0**
(both halves; the owner's decisions, `docs/decisions.md`). One
implementation of the words for every anotoki site: the PHP half's
`Anotoki\Lib\Translations` (`api/translations.php` wires it; its routes on
this app's role checks; `tools/translations.php` is its command) with its
migration set `anotoki_translations` after this app's own, and the Angular
half's `@anotoki/lib/translations` (`TranslationService`, the pipes, the
kit's words and the chooser, the status page's words, the guard) and
`/admin` (the Translations and Languages pages), wired in
`core/i18n/site-translations.ts`. The wire format is the IAM's, snake_case.
This app's own `TranslationService`, pipes, admin pages, grid, cell, drafts,
`kit-words.ts` and the words' backend code are gone. The kit's words are
the library's keys (`anotoki.*`): migration 009 (written whole and final;
words only) copies this app's strings of the 17 keys the kit said there
and deletes the 15 only the kit asked for; it goes with 005 to 008 at the
hand-over, the library's two files after it in the same Apply. Each kit
piece comes from its own entry point, the kit's class names are its own
(`anotoki-top-bar__person-button`...), and `styles.scss`'s plain-value
shadows are gone. No line in What's new.

**2026-10-11, later: signing in, the people and the admin tools through the
family's library - `anotoki-lib` 0.4.1** (both halves; `docs/decisions.md`).
Signing in is the library's auth module - `Anotoki\Lib\Auth` on the server
(`api/auth.php`, `api/meddleware/auth.php`), `@anotoki/lib/auth` in the
browser (`core/auth/site-auth.ts`): the vendored SDKs, `AuthService`, this
app's interceptor and guards, the sign-in card, `error-text.ts` and the
stand-in `tests/tools/fake-iam.php` are gone (the family's stand-in is
`vendor/anotoki/lib/backend/testing/stand-in-iam.php`). A sign-in that did not
work goes to the family's screen, `/sign-in-failed`, under the bar. No sign-in
by the IAM's hint (`hint: false`). The People page is the library's
(`api/people.php`; `@anotoki/lib/people/page`), with the scrub of the accounts
the IAM deleted (migration 010: `users.anonymized_at`). The admin tools - the
error log, the audit log, feedback (the visitors' form from the footer, the
bar's count of new ones; no mail), backups - are the library's, for the
site's ADMIN alone (`api/admin_tools.php`, `core/site-admin.ts`). Migration
011 moves the sign-in card's three failure sentences under the library's
keys and deletes the card's five. 010 and 011 go with 005 to 009 at the
hand-over. What's new 0.4.0: Send feedback, and the sign-in failure's page.

**2026-10-11, later still: Piano's own pages on the family's kit**
(`@anotoki/lib` 0.4.1, no version change; the owner's decisions of
2026-10-07, `docs/decisions.md`). Every button is the kit's `anotokiButton`,
every card `<anotoki-card>`, the notes under the bar (`app.component`), the
review's reminder, the piano's state and the progress file's warning,
refusals and "done" `<anotoki-alert>`, "Coming soon", "Latest", "Not saved
yet" and What's new's three lists `<anotoki-badge>`, the tempo and the MIDI
device `<anotoki-select>` (`@anotoki/lib/ui/forms`, lazy; the piano's in a
`@defer (on idle)` block, out of the first load), What's new
`<anotoki-dialog>` (drawn only while open), "Working…" and "Loading…" the
spinner, "Could not load your progress" `<anotoki-error-state>`, Stats'
table the family's table styles (`.table .table-stack`). `styles.scss` takes
the family's base, utilities and tables and keeps the palette and Piano's own
colours only: `.btn-primary`, `.btn-large`, `.card`, `.chip`, `.tag`,
`.grid`, `.controls-row`, the global button / select rules (`$piano-own`)
and the old colour names (`--panel`, `--accent`...) are gone, and the tiles'
and the practice screens' classes (`.stat-tile`, `.prompt`, `.feedback`...)
moved into partials. Piano's own, from the `--anotoki-*` tokens: the path
(Continue card, phase heads, units, step chips), a lesson's step dots and
result, the practice screens (`pages/_practice.scss`), the tiles
(`pages/_stat-tiles.scss`), the keyboard, the staff, the piano's button,
What's new's releases. Light green `#187a4b` (was `#1d8a55`: its words under
4.5:1). One line in What's new 0.4.0; no words, no migration. First load
535 kB (was 519).

**2026-10-12: `anotoki-lib` 0.5.0** (both halves; the owner's decisions of
2026-10-11 for every site, `docs/decisions.md`). A restore does again, inside
its transaction, every People delete and feedback delete made since its
backup (`People::replay()` with `peopleDeleteHook()`), then gives every
progress a new generation - inside the restore too (`backupsRestoreHooks()`,
`api/admin_tools.php`; see the gotcha "Generations after a restore") - and
once committed runs the scrub (`People::afterRestore()`):
`peopleScrubAfterRestore()` and the generation sequence's gap are gone. The
People delete (`peopleDelete($pdo, $id)`) does all its work on the
connection the library hands it, never `db()`, and begins no transaction
(the library's holds the feedback forgetting and the audit entry). The
pages' own errors go to the error log (`core/error-report.ts` ->
`POST /api/client-errors`). Where a request comes from: the library's
`ClientAddress` with Cloudflare's ranges committed (`CLIENT_ADDRESS_TRUSTED_PROXIES`,
`config/config.php`; a catch-all range refused) and CF-Connecting-IP pinned,
the same list and header given to `adminContext()`; `visitor_starts` keeps a
keyed hash (`clientAddressKey()`, a pseudonym). Feedback's reply
address is what the form sends. Backups name their maker and are sealed
(only those restore here; the ones of before 0.5.0 offline only). No
migration, no line in What's new. First load 533.5 kB.

**2026-10-13: the origin secret, `anotoki-lib` PHP 0.5.2** (Angular stays
0.5.0; the owner's decision, `docs/decisions.md`): Cloudflare's ranges are
every Cloudflare customer's, so a Transform Rule of the owner's zone adds
`X-Anotoki-Origin` with a secret to every request, and the app - given the
same value in the optional `config/cloudflare.local.php` (`originSecret()`,
`config/config.php`; never written or read by setup, never printed or logged)
- believes CF-Connecting-IP only on a request that carries it: `clientAddress()`
and `adminContext()` (`originSecret:`) both pass it; any other request from
Cloudflare counts as its edge. Without the file, as before. No migration, no
line in What's new.

**2026-10-18: Terms, Privacy and Contact - `anotoki-lib` 0.6.1** (both
halves; the round-3 pass of every anotoki site, `docs/decisions.md`). The
family's legal pages (`@anotoki/lib/legal/pages`) on `/terms`, `/privacy`,
`/contact` - each its own lazy route with the frame `layouts/legal-layout`
as its parent, before the learner's `''` parent and the catch-all, no guard:
anybody's, signed out too, never a trip to the IAM (`isLegalPage()` in the
shell's `pageShown()` and the bar's Sign in). The root configuration
(`provideAnotokiLegal(pianoLegalConfig)`, `core/legal/legal.config.ts`) is in
the first load; Piano's facts (`core/legal/legal-facts.ts`,
`pianoLegalFacts()`) come with the frame - TRUE of the code (a change to what
the app keeps, or for how long, changes the `legal.*` strings by a migration
and `PIANO_LEGAL_UPDATED`), every address and stored item's name the code's.
The footer: the family's `<anotoki-legal-links>`. The kit's newer pieces in
Piano's place: the path's step chips (`button[anotokiChip]`), the Continue
card (`tone="highlight"`), the tiles (`<anotoki-stat-tiles>`;
`pages/_stat-tiles.scss` gone), a lesson's step dots (`<anotoki-step-dots>`),
Stats' `.cell-num`; every select from `@anotoki/lib/ui/select`. Kept: the
piano's select in its `@defer (on idle)`, the meet step's count of plays,
the phase heads and units. What's new is made only when it opens (a
`@defer`), so the first load is 549.4 kB, under its 550 kB warning (533.5
before). A `config/cloudflare.local.php` that cannot be read cleanly fails
closed (`settingsFileReadCleanly()`: a secret no request carries; said once a
day, never its text); one read cleanly that names no secret is none. Every
other `*.local.php` - the database's (its password), the auth's, the
visitors' - is read through the same guard: nothing a file prints is sent,
a database or auth file that cannot be read cleanly leaves the site not set
up, a visitors file the defaults (`tests/api/site.test.php`: a
byte-order-marked database file with no `<?php` line - no answer carries
its password).
Migration 012: the legal pages' 43 keys, `brand.area`'s description,
`whatsNew.notLoaded` deleted; the library's translations 005 to 010 after it
in the same Apply. What's new 0.4.0: Terms, Privacy and Contact.

**2026-10-18, later: a settings file is never compiled unless it starts
with `<?php`, and `anotoki-lib` 0.6.2** (both halves; Japanese Academy's
review, the family's rule since - `docs/decisions.md`). A `*.local.php`
saved with a byte-order mark or a blank line before
`<?php declare(strict_types=1);` is a compile-time fatal error that no
handler and no output buffer catches - every request, the status too, a
500 instead of "not set up", and Cloudflare's file never failing closed.
`settingsFileReadCleanly()` reads the first five bytes and passes the file
over, uncompiled, unless they are `<?php` (any case): "does not start with
<?php", said by that fault alone. The tests write both starts for each kind
of file (`unit/config`, `unit/visitors`) and through the server
(`api/site`: the database's, never a 500; `api/visitors`: Cloudflare's,
fails closed) - each fails with the check taken out. The library's 0.6.2
rewords three Privacy sentences (its translations 011, after 012 in the same
Apply; Piano's own words for the backups and the sign-in's storage stay).
No migration of Piano's, no line in What's new.

**2026-10-18, after the deploy: the anotoki sites' one footer, the status
page alone - `anotoki-lib` 0.6.3** (both halves; the owner's choices,
`docs/decisions.md`). The family's footer (`<anotoki-site-footer>`,
`@anotoki/lib/footer`, the build analyzer's) under every page and the admin
panel's: a top border, "Version 0.4.0 · What's new · Feedback" - the version
and What's new from `ChangelogService` once the list came, What's new
opening `ui/changelog-dialog` on `(whatsNew)`, Feedback the family's form in
the kit's dialog (the footer loads it with the press; `ui/feedback-dialog`
is gone) - then Terms · Privacy · Contact; its words `anotoki.footer.*`. The form's
message says whom it is for: the person's while somebody is signed in, nobody's
otherwise - the server takes anybody's (an interceptor of Piano's said it then;
since `anotoki-lib` 0.7.2 the form says it itself, `issuedAs('anybody')`).
Migration 013 deletes the old footer's `footer.whatsNew` and tells
`whatsNew.title`'s description of the new footer. **The gate is the
outermost of `app.component.html`**: the bar, the notes, the page's
`<main id="view-root">` and the footer are its marked template, so the
status page stands alone in the gate's own `<main>` (no bar, no footer, the
owner's rule) - an ADMIN's Migrations page keeps the frame;
`<anotoki-confirm-host>` stays outside the gate. A present
`config/cloudflare.local.php` without a usable secret - read cleanly naming
none, a folder in its place - fails closed like a broken one; only deleting
it switches the secret off (`originSecretFile()`). The upload's `.htaccess`
lets `host-check.php` run beside `setup.php`. The library's translations 012
(the footer's four words) runs after 013 in the same Apply. What's new
0.4.0: the footer, "Feedback". First load 558.1 kB, over its 550 kB warning
(the owner's call).

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
                                 for siteOpenPaths() - /api/auth/config, /api/translations/{code} (the library's
                                 TranslationsRoutes::openPath()), /api/health, /api/admin/migrations...;
                                 /api/site-status always passes) -> routing. Its header lists every route.
  api/.htaccess                  Apache: everything under /api/ to index.php; no other file runs.
  api/bootstrap.php              what every entry point loads: PHP >= 8.2, UTC, display_errors off for the web,
                                 warnings -> ErrorException (deprecations only logged), then every api/*.php.
  api/routes/public.php          GET /api/health ({ok} + database and pending migrations for loopback),
                                 GET /api/auth/config ({issuer, clientId, loginRequired} - the IAM's switch,
                                 authLoginRequired()),
                                 GET /api/translations/{code} (the library's TranslationsRoutes::bundle(): {language,
                                 languages: [{code, name, native_name}], values, english?}; no token looked at; ETag +
                                 no-cache, 304; sk-sk -> sk, unknown or hidden code -> English; open while an update
                                 waits - without the words' tables or their English (a fresh database before its
                                 first Apply), or the database out of reach: 503 {error, code:
                                 translations_unavailable} + Retry-After 60),
                                 GET /api/site-status ({state, installed}: anotoki/lib's MigrationsRoutes::status()),
                                 POST /api/feedback (FeedbackRoutes::public(): the reply address only as the form sends
                                 it), POST /api/client-errors (ErrorLogRoutes::client(), 0.5.0: a page's own error into
                                 the error log - 204; 415 / 413 / 422; 20 an hour from one sender, a person by account, a
                                 visitor by address bucket; behind the gate and identify(), like any route).
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
  api/routes/admin.php           /api/admin, Slim groups, the role check ON THE GROUP (a route added later
                                 cannot forget it): the strings - the library's TranslationsRoutes::strings(),
                                 ->add(requireRole(...ROLES_STAFF)): GET /languages ({languages: [{code, name,
                                 native_name, enabled, sort_order, seeded, strings}]}); GET, PUT /translations (the
                                 grid; a save is {values: {key: {code: text}}}); GET /translations/{code}/export,
                                 PUT /translations/{code}/import (flat {key: text}); the languages -
                                 TranslationsRoutes::languages(), ->add(requireRole(ROLE_ADMIN)): POST /languages;
                                 PUT /languages/{code}; DELETE /languages/{code} (200 {strings}). The library reads
                                 the bodies itself (1 MiB, 415, 422 empty_body, 400 invalid_json) and answers in
                                 this app's {error, code} (translationsRefused()). The people (requireRole(ROLE_ADMIN)):
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
                                 auth.php (the anotoki family's checks, anotoki/lib's Anotoki\Lib\Auth\Http, as this
                                 app stacks them: identify() - the library's Identify once, in front of every route but
                                 publicPaths() (site-status, auth/config, health, the words): a Bearer header -> the
                                 person or 401 invalid_token; sign-in required -> nobody (the key not read); an
                                 X-Visitor-Key -> the visitor (visitorFound()) or 401 visitor_unknown; else nobody;
                                 refusals in this app's {error, code} (authRefused()). requireUser() = RequirePerson
                                 + recordPerson() + SiteOwner; requireRole(...) = RequireRole (403 forbidden in the
                                 staff's or ADMIN's words) + recordPerson() + SiteOwner; adminByToken() = the ADMIN
                                 check alone, nobody recorded (the Migrations routes, the admin tools);
                                 requireOwner($nobody = refuse | empty | make) = RequireCaller + recordPerson() +
                                 SiteOwner(sweep): the person, else the visitor, else nobody as $nobody says (the
                                 attributes nobody / visitorToMake); SiteOwner puts 'user' (SiteUser) and 'userId' on
                                 the request; currentUser; queues the sweep).
  api/helpers.php                ApiError(status, errorCode, message, headers, extra); respondJson/respondJsonText/
                                 respondError ({error, code} + extra fields); jsonBody(request, limit) (JSON only: 415
                                 otherwise, 413 over the limit - 256 kB by default - null when empty, decoded to
                                 stdClass so {} stays {}); isoNow(), textClip() and the text* helpers.
  api/auth.php                   ROLE_ADMIN, ROLE_EDITOR, ROLES_STAFF; final class SiteUser {id, name, roles, visitor
                                 (false but for api/visitors.php's); has(...)}; the IAM through the anotoki family's
                                 library: authIamSettings() (+ the tests' jwks_file / application_file /
                                 anonymized_file, application_ttl / _timeout), iamClient() (IamClient::fromArray),
                                 signInRule() (SignInRule: the IAM's "Sign-in required", kept a minute in cache_dir,
                                 one asking at a time, true when unknown), accessTokens() (RS256, typ at+jwt, this
                                 client; why a token failed only in the log "[anotoki auth] token refused: ...", an
                                 expired one never), authLoginRequired(), authRefused() (a library Refusal in this
                                 app's {error, code}), usersEnsure() (the CLI's import: a person's id only,
                                 LogicException below 1), isLoopback(), isLocalHostName(), wasForwarded(),
                                 isThisComputer(sapi, remote, host, forwarded) (setup.php's no-token mode only).
  api/visitors.php               visitors (sign-in not required; 005): VISITOR_HEADER X-Visitor-Key, the key (32 random
                                 bytes, base64url, 43; only its SHA-256 in users.visitor_key_hash), VISITOR_KEEP_DAYS 30,
                                 VISITOR_DEFAULTS (max_visitors 500, new_per_hour_per_address 10, new_per_hour 60,
                                 max_sessions 1000, document_max_bytes 131072, move_lock_timeout_ms 5000;
                                 visitorLimit() reads
                                 config/visitors.local.php); visitorsReady() (the column there) / visitorsMustBeReady()
                                 (503 visitors_unavailable); visitorFound() (null for a key nobody has - the library's
                                 Identify answers 401 visitor_unknown; last_seen_at at most hourly); visitorMake() (inside the save's transaction, an advisory xact lock, the
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
  api/client_address.php         the family's one rule (anotoki/lib's Support\ClientAddress, 0.5.0): clientAddress()
                                 (REMOTE_ADDR; from a trusted proxy the one address CF-Connecting-IP names - pinned in
                                 code, no setting names another; a list is none; with the origin secret, originSecret(),
                                 only on a request carrying it in X-Anotoki-Origin, else the edge), clientAddressTrustedProxies()
                                 (visitors.local.php's list, an empty one too, else CLIENT_ADDRESS_TRUSTED_PROXIES:
                                 Cloudflare's ranges - each through clientAddressRangeTaken(): a range wider than /8
                                 (IPv4) or /16 (IPv6), or no range at all, refused and said in the log),
                                 clientAddressCounted() (IPv4, an IPv6 /64), clientAddressKey() / clientAddressHash() (the
                                 HMAC of the bucket under Keys::derive(Keys::installation(storage), 'visitor-addresses') -
                                 what visitor_starts keeps: a stable pseudonym while that key lasts, never the address).
  api/after_response.php         afterResponse() (queues; ignore_user_abort), afterResponseRun() (index.php after run():
                                 fastcgi/litespeed_finish_request or flush, each piece in try/catch -> "[after] ...").
  api/migrations.php             the migrations through the anotoki family's engine (anotoki/lib, in vendor/):
                                 MIGRATIONS_SET 'piano_academy', DATABASE_UPDATE_LOCK (the advisory lock setup.php's
                                 Save, php migration.php, POST /api/admin/migrations/apply and the tests' builders all
                                 take - busy otherwise), migrationsDir(), migrationSet(), migrationFiles() (the folder as
                                 Migrator::files() lists it - a test holds them equal), migrationSets() (the library's
                                 anotoki_admin first, this app's set, then the library's anotoki_translations and
                                 anotoki_people - each Schema::migrationSet(); recorded in the same table as
                                 <set>/<file>), migrationLabel() (a file named with its set
                                 when it is the library's: the tools, /api/health), databaseMigrator(?pdo, options)
                                 (the Migrator: the sets, the lock, prepare = adoptLegacyMigrationsTable - the first
                                 runner's migrations(name) renamed to filename; status() / applicable() read only,
                                 apply() each file whole with its record, stopping at the first that fails - "statement
                                 N of M: ..." and its first lines), legacyMigrationsTable(), siteState() (the
                                 SiteState: settingsProblem(), storage/installed.lock, the Migrator).
  api/translations.php           the app's words through the anotoki family's library (anotoki/lib's
                                 Anotoki\Lib\Translations: the bundle, the grid, the checks of a string, saves,
                                 import / export, the languages - en and sk cannot be deleted, en not switched off):
                                 TRANSLATION_RELEASED_LANGUAGES ['en', 'sk'], translationsConfig(), translations(?pdo)
                                 (built per request, like the Migrator), translationsRefused() (a library Refusal in
                                 this app's {error, code, ...extra}), translationsWriter() (who saves: the request's
                                 userId, from the token - never a body). The one module not keyed by a user id
                                 (translations.updated_by is the request's person, or null from a migration or the CLI).
  api/store.php                  one person's data: storeStateJson($id, $withGeneration) (the database's jsonb
                                 text, never through PHP arrays; one statement, so the documents and their
                                 generation are one snapshot), storeProgressCounts / storeCountsHaveProgress (empty
                                 documents are no progress), storeCheckProgress/Path, storeCleanSession
                                 (SESSION_FIELDS whitelist + bounds, SESSION_MODES), storeAddSession (Idempotency-Key
                                 -> stored once). The generation: GENERATION_HEADER, storeGenerationFrom() (428),
                                 storeLockGeneration($id, ?$pdo) (the users row FOR UPDATE), storeRequireGeneration() (409),
                                 storeNewGeneration() (nextval of the sequence), storeProgressChanged() (the 409),
                                 storeRenewGenerationsAfterRestore($pdo) (inside a restore's transaction, its
                                 beforeCommit: every users row a new number - no page of before saves over what was
                                 restored; the library never moves the sequence back, so the numbers are new);
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
  api/people.php                 the people through the anotoki family's library (anotoki/lib's Anotoki\Lib\People):
                                 people() (PeopleTable users: preferred_username, created_at, last_seen_at; the scrub's
                                 hook peopleForgetCopies() - a scrubbed person's feedback address and browser,
                                 Feedback::forgetPeopleOn() on the scrub's connection), recordPerson() (the library's
                                 RecordPerson: the users row on a person's request, never a visitor's, never one the IAM
                                 deleted), peopleColumns() (Notes, Steps, Rounds - counts, 0 for none),
                                 peopleDelete($pdo, $id) (null below 1 or for nobody; ALL on the $pdo the library hands
                                 it, inside its transaction - LogicException outside one -, none of its own:
                                 storeLockGeneration(), then STORE_PERSON_TABLES and users; the counts by label - the
                                 library's People::delete() forgets the feedback address and writes person.data_deleted
                                 in the same transaction), peopleDeleteHook() (the library's delete: the page's, and a
                                 restore's replay with a null request), peopleVisitors() ({count, sessions}),
                                 peopleNames() / peopleIdsNamed() (the admin tools' names), peopleActor(). The scrub of
                                 the IAM's deleted accounts: PeopleUpkeep after an answer, at most hourly (api/index.php),
                                 and at once after a restore (the library's People::afterRestore()).
  api/db.php                     dbConnect(settings, name, persistent), db() (persistent under cli-server),
                                 dbQuery/All/One/Value/Exec (each on db() - or on a ?PDO handed over: the People delete
                                 in a restore), dbTx, dbExists, dbServer, ensureDatabase() (made when it may be: setup's
                                 Save, php migration.php, the tests).
  api/admin_tools.php            the anotoki family's admin tools (anotoki/lib 0.5.0), the site's ADMIN alone:
                                 adminContext() (who acts and is ADMIN - the token -, the proof: a sign-in of the last ten
                                 minutes, names: peopleNames(), trustedProxies: api/client_address.php's, clientHeader:
                                 CF-Connecting-IP, originSecret: originSecret() - the library reads addresses by the same
                                 rule), errorLog() (storage/logs: 5xx, 404, 405,
                                 413, 415, 429, PHP warnings, the pages' own errors - source client; never a query, a
                                 header, a body, a token or an address), auditLog() / audit() (anotoki_audit_log; a
                                 pending file while its table waits), feedback() (anotoki_feedback; FEEDBACK_SECTIONS; no
                                 mail), feedbackSender() (the token's id alone - the reply address is the form's),
                                 backups() (storage/backups: daily after the day's first answer, before an update, before
                                 a restore, by hand; COPY on backupsConnection(); not encrypted - sealed; its restore
                                 hooks: backupsRestoreHooks() - beforeCommit: the library's People::replay() with
                                 peopleDeleteHook(), then storeRenewGenerationsAfterRestore(); afterRestore: the library's
                                 People::afterRestore() with afterResponse() as its runner; people() asked only when a
                                 restore runs - setup.php's Save backs up before the IAM's settings exist),
                                 databaseUpdater() (databaseMigrator() with the backup before the update).
  config/config.php              the loader. visitorSettings(): the optional config/visitors.local.php
                                 (client_address.trusted_proxies, visitors.* limits; never written by setup, never "not
                                 set up"; unreadable -> the defaults, logged; an older client_ip_header passed over).
                                 CLIENT_ADDRESS_TRUSTED_PROXIES: the one committed default - Cloudflare's published ranges
                                 (the library's ClientAddress::CLOUDFLARE, a test holds them equal); visitors.local.php
                                 may name others or none, never a catch-all. originSecret(): the optional
                                 config/cloudflare.local.php's origin_secret (originSecretFile(): no file -> none - the
                                 one way to switch it off; read cleanly - settingsFileReadCleanly(): nothing printed,
                                 nothing thrown - a string with something in it, trimmed; anything else there FAILS
                                 CLOSED (2026-10-18): read cleanly naming none - blank, no array, a misspelt or another
                                 key, not a string -, a folder in its place, or a file that cannot be read cleanly - it
                                 does not start with <?php, prints anything, a ParseError / Error, not readable ->
                                 originSecretNobodyCarries(), 256 random bits a process, so every
                                 request from Cloudflare's ranges counts as its edge; never written or read by setup;
                                 each fault said once a day by settingsSaid() - a stamp in storage/cache -, by its
                                 kind and line, its start or the bytes printed, never the text or the secret).
                                 Reads config/database.local.php + config/auth.local.php (required,
                                 gitignored, no fallback) - every *.local.php through settingsFileReadCleanly(): one
                                 that does not start with <?php (a BOM, a blank line, no <?php line - the password
                                 with it) passed over uncompiled, its first five bytes read alone (a BOM before
                                 declare(strict_types=1) would be a fatal error nothing catches, every request a 500);
                                 what one that does start so prints (text after a closing tag) caught and never sent,
                                 a file that prints or throws passed over and said once a day by settingsSaid() (its
                                 kind and line, its start or its bytes; never PHP's message):
                                 database / auth -> not set up, visitors -> the defaults, cloudflare -> fails closed
                                 -> settingsProblem(), databaseSettings(), authSettings(),
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
                                 008_family_theme_switch_words.sql (written 2026-10-08, whole and final; with 005-007):
                                 words only - the round theme button's three theme.*Spoken keys deleted, four
                                 descriptions told of the family's switch; the strings stay.
                                 009_strings_through_the_library.sql (written 2026-10-11, whole and final; with
                                 005-008, the library's two files right after it in the same Apply): words only -
                                 temporary tables kit_keys (this app's 17 keys the kit said -> anotoki.<the kit's
                                 word>, and whether the key goes) and kit_words (every string of them, with whether
                                 the library key had one), the library keys made (a placeholder description the
                                 library's 002 rewrites), every string copied with updated_at / updated_by (ON
                                 CONFLICT DO NOTHING), the 15 keys only the kit asked for deleted (common.loading,
                                 signIn.button stay), signIn.button's description, and the gate (each string under
                                 the library key exactly as it was). Pinned by tests/unit/migrations ("the next
                                 change is 010"), with an installed-shaped database and an owner's rewording.
                                 010_people.sql (written 2026-10-11, whole and final; with 005-009 and 011):
                                 users.anonymized_at timestamptz - nothing else, no row changed - and a gate (the
                                 column, nullable; no visitor's row with a time in it).
                                 011_sign_in_failure_words.sql (2026-10-11, whole and final): words only - the sign-in
                                 card's three failure sentences under the library's anotoki.signIn.* (every
                                 language, who and when; over a migration's string, never a person's), the card's
                                 five keys deleted, signIn.button's description, the gate. Pinned by
                                 tests/unit/migrations ("the next change is 012").
                                 012_legal_pages.sql (2026-10-18, whole and final; with 005-011): words only - the
                                 legal pages' 43 keys (legal.* - Piano's facts -, title.terms / .privacy / .contact,
                                 lesson.steps), English and informal Slovak, no address in any; brand.area's
                                 description (the legal pages' site name); whatsNew.notLoaded deleted; the gate
                                 (every key with English and Slovak, the old key gone, the description). Pinned by
                                 tests/unit/migrations ("the next change is 013") and tests/unit/translations (no
                                 address, Slovak never formal, nothing gendered about the learner).
                                 013_family_footer_words.sql (2026-10-18, after the deploy, whole and final; with
                                 005-012): words only - the old footer's footer.whatsNew deleted (its strings
                                 cascade), whatsNew.title's description told of the family's footer, the gate (no
                                 footer.* key or string, the description telling of "What's new" in the footer).
                                 Pinned by tests/unit/migrations ("the next change is 014").
                                 Before this set the library's anotoki_admin (vendor/anotoki/lib/backend/migrations/
                                 admin/: 001 the audit log, 002 feedback); after it anotoki_translations
                                 (migrations/translations/: 001 proves the three tables' shape, 002 the library's
                                 words, 003 the sign-in page's, 004 the feedback form's, 005 the legal pages', 006
                                 to 009 the bar's and the kit's newer pieces' - a string only where a key has none -,
                                 010 the Privacy page's two backups sentences reworded while still 005's word for
                                 word, 011 three more, 012 the footer's four words - 0.6.3) and anotoki_people (migrations/people/001:
                                 where the scrub stands). A database brought up to date records a newer file of a
                                 set after the later sets' older ones: tests compare each set in its own order.
  setup.php                      the web setup (see "Setup and settings"). Parseable by PHP 7.4.
  router.php                     PHP's built-in server: /api -> api/index.php, /setup.php, else the built
                                 frontend (PIANO_FRONTEND_DIST or ../frontend/dist/piano-academy/browser) with the SPA
                                 fallback; never a .php file or a dot-file; files with an extension 404 when missing.
  migration.php                  CLI migrations (--status, --dry-run), the family's engine, under the update lock.
  tools/progress.php             CLI --export=FILE --user=ID / --import=FILE --user=ID [--replace] / --move=FROM
                                 --to=TO (no size limit).
  tools/translations.php         the library's TranslationsCommand on this app: --status (the key scan against the
                                 database; exit 1 on a gap) / --export CODE [FILE] / --import CODE FILE (checked as a
                                 save, all or nothing). Refuses while a migration is pending; --help without settings.
  tools/translation_keys.php     the library's KeyScanner set up for this app: translationKeyScanner() (frontend/src/app;
                                 never core/testing/ or kept-english.ts; dynamic-keys.ts for keys
                                 built at run time; anotoki.* always passed by), translationKeptEnglish() (KEPT_ENGLISH,
                                 KEPT_LIBRARY_ENGLISH read as text) - used by the CLI and tests/unit/translations.test.php.
  tools/build.php                the upload: runs the frontend build, then dist/ = app + .htaccess + setup.php + api/
                                 + config/config.php + migrations/ + vendor/ + storage/ (deny .htaccess everywhere
                                 PHP-only) + 3rdpartylicenses.txt. Refuses a non-build or in-repo --out. The web root's
                                 .htaccess lets a visitor run setup.php and the host check (host-check.php - the
                                 repository's tools/host-check.php, uploaded by hand, never in a build) alone.
  tests/                         run.php, lib.php (test_migrate($pdo, $through) / test_migrate_before($pdo, $file):
                                 the app's Migrator with the files after a point held back as drafts - a database as
                                 it stood then; the library's set held back too unless the build goes to the end;
                                 names_of(), library_migration_files(), every_migration()), unit/*, api/*;
                                 tools/testdb.php (template [--fresh] -
                                 built with the app's Migrator -, create, drop,
                                 sweep), testenv.php (always the IAM: --issuer, --jwks). The stand-in IAM is the
                                 family's (vendor/anotoki/lib/backend/testing/stand-in-iam.php; stand_in_iam() starts
                                 it; the tests' key and tokens: the library's TestIam - test_keys(), test_token(),
                                 test_other_iam()); test_migrate_as_installed() builds a database as an installed one
                                 stood before 0.4 (the app's files, then the library's words); test_anonymized_file() /
                                 test_anonymized() - the IAM's deleted accounts as a file.
  storage/                       gitignored: cache/ (the IAM's keys and answers, the limits' counts), logs/ (the
                                 error log, a day a file), backups/ (the library's *.anotoki-backup; older files of
                                 anybody's are left alone).

frontend/                        Angular 21, standalone + zoneless + signals, OnPush, three files per component
  src/app/app.config.ts          provideBrowserGlobalErrorListeners() + provideSiteErrorReport() (core/error-report.ts:
                                 the family's reporter, @anotoki/lib/error-report - the app's ErrorHandler; a page's
                                 errors, scrubbed, at most 5 a page load, through the HttpClient below to POST
                                 /api/client-errors: a person's with the token, a visitor's bare; never a failed
                                 request's), zoneless, router (component input binding, scroll to top), HttpClient (fetch +
                                 SITE_INTERCEPTORS: siteStatusInterceptor - the family's, outermost -,
                                 anotokiAuthInterceptor),
                                 provideSiteMigrations() (core/state/site-migrations.ts), provideSiteTranslations()
                                 (core/i18n/site-translations.ts: the family's words wired to this app),
                                 provideSiteAuth() (core/auth/site-auth.ts: the family's sign-in), provideFamilyKit()
                                 (core/family-kit.ts: the family's kit and frame wired to this app),
                                 provideSiteAdmin() (core/site-admin.ts: People, the admin tools, the feedback form),
                                 provideAnotokiLegal(pianoLegalConfig) (core/legal/legal.config.ts: the legal pages'
                                 root configuration - the page's language, the database's words; the facts come with
                                 the pages' frame), PianoTitleStrategy,
                                 provideAppInitializer: ThemeService (the family's), changelog load, SiteStatus.check() (GET
                                 /api/site-status, first), BootService.start() (sign-in settings, then the language and
                                 its strings, then - unless the site is not ready: `waiting` - the person's state).
  src/app/app.routes.ts          auth/callback (the family's AuthCallbackComponent) and sign-in-failed (its
                                 SignInFailureComponent) - never guarded; admin (canActivate the family's staffGuard,
                                 lazy layouts/admin-layout): translations (staff), languages, people, migrations,
                                 errors, audit, feedback, backups (the family's adminGuard: anybody else signed in ->
                                 the start page; translations and languages the family's TranslationsPageComponent and
                                 LanguagesPageComponent, lazy from @anotoki/lib/translations/admin, canDeactivate
                                 anotokiUnsavedChangesGuard; people the family's PeoplePageComponent from
                                 @anotoki/lib/people/page; the admin tools' pages from @anotoki/lib/admin/errors,
                                 /audit, /feedback, /backups; MigrationsPageComponent from @anotoki/lib/migrations/page),
                                 database -> migrations, '' -> translations (migrations while
                                 BootService.onlyMigrations); /translations and /languages redirect to /admin/...;
                                 terms, privacy, contact - each its own path, loadComponent the frame
                                 layouts/legal-layout (it provides the facts: pianoLegalPagesConfig()), its child ''
                                 the family's TermsPageComponent / PrivacyPageComponent / ContactPageComponent from
                                 @anotoki/lib/legal/pages, titles title.terms / .privacy / .contact; no guard, BEFORE
                                 the learner's '' parent and the catch-all (the survey's lesson: under '' its guard
                                 would send nobody to the IAM, after ** they would be Learn); the
                                 learner's pages under '' with canActivateChild the family's personOrVisitorGuard: '' home,
                                 lesson/:unitId/:stepId, trainer, sheet, songs, songs/:songId, stats, ** -> ''.
                                 app.routes.spec.ts holds / and an unknown address, and the legal pages' places.
                                 Every learner page but home is lazy (stats too, since 2026-10-11: the first load's
                                 500 kB budget); pages with notation wait for VexFlow's fonts (withNotation). Titles are
                                 keys (title.*); the admin pages' are English ('Translations', 'People', ...).
  src/app/app.component.*        <anotoki-site-gate> outermost (the family's: while the site is not ready its status page
                                 ALONE, in the gate's own <main> - no bar, no note, no footer, the owner's rule of
                                 2026-10-18, anotoki-lib 0.6.3; an ADMIN still has /admin/migrations, in the frame);
                                 its marked template (<ng-template anotokiSitePages>, SitePagesDirective - made only
                                 while the gate shows it) is the whole frame:
                                 <app-top-bar>; the notes under the bar - the family's alerts (<anotoki-alert>, ui/alert;
                                 role alert / status by `announce`, the ids on the alert), in .notes as wide as the page:
                                 the signed-out banner (a person's only), the "progress changed elsewhere"
                                 note (store.changedElsewhere); a visitor's notes (status ready, BootService.visiting,
                                 nobody signed in; core/i18n/visitor-words.ts): #visitor-sign-in-now (sign-in required
                                 meanwhile: AnotokiAuth.loginRequired, with Sign in), #visitor-sign-in-why (a refused
                                 or unstartable sign-in in the family's words - failureText(), anotoki.signIn.* -,
                                 closable), #visitor-refused
                                 (ApiService.visitorRefusal: full / busy, with Sign in), #visitor-lost (VisitorKey.lost,
                                 closable), and #visitor-notice ({days} 30, Sign in) on '/' and '/stats' only, while no
                                 sign-in is required; after a sign-in #visitor-moved (+ #visitor-kept) and
                                 #visitor-not-moved (BootService.visitorMoved / visitorNotMoved, closable) - every
                                 note only while the site is ready (SiteStatus.blocked() false: not on an ADMIN's
                                 Migrations page while an update waits); then <main id="view-root"> holding the boot
                                 card or <router-outlet> (pageShown: status ready, the
                                 sign-in's own pages - /auth/callback, /sign-in-failed -, a legal page
                                 (isLegalPage(): anybody's, signed out too), or an ADMIN on
                                 /admin/migrations - one outlet, kept as the app starts after an Apply; status sign-in:
                                 "Loading…" while the guard goes to the IAM or to the failure's screen; waiting:
                                 "Loading…" - the family's spinner, .loading); then the family's footer
                                 (<anotoki-site-footer>, @anotoki/lib/footer: [version] changelog.version(),
                                 [whatsNew] only once the list came, (whatsNew) -> whatsNewOpen, feedback - the
                                 family's form in the kit's dialog, its code loaded with the press; then Terms ·
                                 Privacy · Contact, the open page's aria-current; words anotoki.footer.*,
                                 anotoki.legalLinks.*) and What's new, <app-changelog-dialog> in a @defer (its code
                                 loaded when it opens - the first load's budget). Outside the gate:
                                 <anotoki-confirm-host> (the family's questions:
                                 ConfirmService.ask() from anywhere - the sign-out question, the progress file's
                                 replace, the admin pages').
  layouts/top-bar/               a wrapper of the anotoki family's bar (@anotoki/lib/shell's <anotoki-top-bar
                                 #bar="anotokiTopBar">, `display: contents`), told what is Piano's: brand (the
                                 family's <anotoki-brand>: mark + "anotoki" + brand.area, topbar.home in its name; on
                                 a phone brand.short "Piano"), links (APP_LINKS: nav.* keys, '/lesson/' under Learn,
                                 '/songs/' under Songs; given once status is ready, and not while the site is not
                                 ready), person (name or account.signedIn, e-mail unless it is the name, role: the
                                 library's anotoki.topbar.roleAdmin / roleEditor), menuItems (anotoki.topbar.account -
                                 the IAM's account page, a new tab; for the staff anotoki.topbar.admin "Admin panel"
                                 -> /admin only while the site
                                 is ready (!SiteStatus.blocked()), or "Back to Piano Academy" in /admin), signIn (once
                                 the app ran: in the middle of practising, or a visitor - and on a legal page for
                                 nobody where a sign-in is required, status sign-in), signOut (an async action:
                                 settleBeforeSignOut - the family's item says "Saving…" meanwhile -, then, when
                                 something would be lost, bar().closeMenu(false) and ConfirmService.ask() with the
                                 signOut.* words, tone danger, the no first), phoneMark (the dot on the menu button,
                                 account.notSaved for a screen reader) and menuNote (account.notSaved +
                                 account.notSavedHint heading both menus) while store.unsaved(); [topBarWidgets]:
                                 #save-status "Not saved yet" (the family's warning badge; not on a phone) and the piano (ui/midi-panel,
                                 [compact] on a phone). PHONE_BAR_MAX 1320 (the bar's phoneMax; no .scss copy): up
                                 to it the brand, the piano's dot, language, theme switch and the menu button (the
                                 sections, then the person's items). NAME_BAR_MIN (+201, nameMin): the name beside the
                                 initial. The menus' keys are the family's (arrows/Home/End, Escape and outside
                                 click, Tab and Shift+Tab -> the focus on the button; a crossing of the fold closes
                                 them). Under /admin: ADMIN_LINKS (English; Languages, People, Feedback - with the
                                 family's FeedbackUnread count as its badge -, Error log, Audit log, Backups,
                                 Migrations for ADMIN; Migrations alone while an update waits), ADMIN_BRAND - the family's wordmark
                                 "anotoki Piano Academy · admin panel", short at every width there ("Piano" with
                                 "admin panel" under it: shortBrandMax ADMIN_SHORT_BRAND_MAX) -, its own fold
                                 ADMIN_PHONE_BAR_MAX 1280 (measured: 1255 px with eight sections and a two-digit
                                 count), [languages] false, no piano.
  core/title.strategy.ts         a route title matching title.<word> goes through t(); "<title> · Piano Academy"; after
                                 every navigation TranslationService.noteAddress(url) (the English area, a ?lang=, a
                                 bundle asked again) and the admin panel's mark (isAdminArea).
  core/auth/                     site-auth.ts (provideSiteAuth(): the anotoki family's sign-in, @anotoki/lib/auth,
                                 wired to this app - config /api/auth/config ({issuer, client_id, login_required,
                                 sign_in_available}), visitors VisitorKey, api.visitorPrefixes VISITOR_PREFIXES (the
                                 progress routes alone), language signInLanguage() (the IAM's pages in a language
                                 that came with a bundle), translate libraryWord() (anotoki.signIn.*: 011's copy of
                                 this app's sentences, KEPT_LIBRARY_ENGLISH while no bundle), beforeSignIn
                                 BootService.beforeSignIn(), redirectPath CALLBACK_PATH /auth/callback, failureRoute
                                 SIGN_IN_FAILED_ROUTE /sign-in-failed, hint false). AnotokiAuth (the library's: state
                                 starting | signed-in | visitor | signed-out | unavailable, user, signedIn, sub,
                                 roles, isAdmin, isStaff, displayName ('' for none), loginRequired (failing closed;
                                 noteSignInRequired() after a visitor's 401 sign_in_required), signInFailure {code,
                                 returnTo}, preferences, locale; signIn({returnTo, prompt}), signOut(), token(),
                                 subject(), savePreferences(), accountUrl()), anotokiAuthInterceptor (a person's
                                 request with the token or not sent - a local 401 -, one retry after a 401; a
                                 visitor's with the key on the visitor prefixes, the answer's key remembered, a
                                 visitor_unknown key forgotten and tried once more; ISSUED_AS / CARRIES_VISITOR_KEY
                                 the library's context tokens), the guards (personOrVisitorGuard, staffGuard,
                                 adminGuard: through while the site is not ready; a failure -> /sign-in-failed),
                                 AuthCallbackComponent, SignInFailureComponent. visitor-key.ts (VisitorKey, the
                                 library's VisitorKeyStore: the key in localStorage piano-academy:visitor, 43
                                 base64url; current() read at send time, a storage event; remember() - the first key
                                 stays; forget(key, lost) - compare-and-delete; lost; active; memory when storage
                                 refuses; injects AnotokiAuth only).
  core/i18n/                     site-translations.ts (provideSiteTranslations(): the family's TranslationService
                                 (@anotoki/lib/translations) wired to this app - storagePrefix 'piano-academy' (the
                                 keys it always had: :language, :language-cache, :localization-drafts),
                                 fallbackEnglish KEPT_ENGLISH, libraryWords {en: KEPT_LIBRARY_ENGLISH}, account
                                 {language: AnotokiAuth.locale(), decides: preferences() !== null,
                                 save: savePreferences({language}), userKey: subject()}, canAsk: the sign-in not
                                 starting or unavailable (nothing asked while its settings could not be read), admin {allows:
                                 strings isStaff, languages isAdmin; routes; siteName}). The service: the language
                                 (the family's order: ?lang= of this tab, a choice of this visit, the account's
                                 locale while it decides, this device's choice, the browser's, English; a change of
                                 the account's followed), the bundle (GET /api/translations/{code}, cached on the
                                 device), effectiveLanguage (English under /admin: noteAddress(url) from the title
                                 strategy), t(), plural(), has(), around() / aroundPlural(); a key with no string
                                 shown as itself, warned once "[i18n] ..." - a library key (anotoki.*) never;
                                 setLanguage(code, {remember, save, revertible}); forKit() / forShell() (the kit's
                                 words, the chooser); signInLanguage() (the language the IAM's pages open in -
                                 undefined while no bundle is in memory); the `translate` / `translatePlural` pipes;
                                 siteStatusWords(); anotokiUnsavedChangesGuard),
                                 local-date.pipe.ts (dates in the page's
                                 language: 'day', 'moment', and 'stamp' - the admin panel's yyyy-MM-dd HH:mm, the
                                 server's "YYYY-MM-DD HH:MM" kept as its numbers; for somebody signed in the
                                 account's date order and clock when chosen - a moment's date and time side by side,
                                 each half the language's own where automatic), date-patterns.ts (the family's four
                                 orders and two clocks, the IAM's; `utc` for the server's numbers),
                                 kept-english.ts (KEPT_ENGLISH: the shell's English for when there is no bundle at
                                 all; KEPT_LIBRARY_ENGLISH: the library's words this app says its own way - the theme
                                 switch's "Theme: light", the sign-in failure's three sentences -, read while no
                                 bundle is in memory; both held to the
                                 database's English by tests/unit/translations), visitor-words.ts (VISITOR_KEEP_DAYS 30 - the backend's, a test holds them equal;
                                 VISITOR_WORDS, the keys of 005; visitorRefusalKey(status, code): visitor.full for
                                 422 visitor_limit / 413 too_large, visitor.busy for 429 too_many_visitors - read
                                 by ApiService.visitorRefusal and the store; the shell and Stats draw the words),
                                 dynamic-keys.ts (prefix -> every tail, for keys put together at run time:
                                 path.phase., path.step., path.hint., path.unit.), path-words.ts (phaseTitle,
                                 phaseDescription, stepTitle, stepShort, unitTitle, hintKey).
  core/testing/                  test-auth.ts (TestAuth: the family's AnotokiAuth's signals set by a spec - signInAs(),
                                 signedOut(), visiting(), unavailable(), failed(code) -, its calls recorded;
                                 provideTestAuth(); provideTestAuthInterceptor() - the library's interceptor's config
                                 as this app's, a browser at this origin), provideTestDialog() (jsdom has no showModal()) and provideTestKit() (that, and
                                 checkVisibility() and the popover API the family's components ask for),
                                 drawTestQuestions() (an <anotoki-confirm-host> beside a page made on its own: the
                                 family's question read and answered - .anotoki-dialog__title,
                                 .anotoki-confirm-host__message) for specs. A spec's strings: the library's
                                 provideTestTranslations(values, {language, languages, english}) from
                                 @anotoki/lib/translations/testing (a bundle in memory, no HTTP) - with
                                 provideSiteTranslations() beside it where the spec needs this app's storage keys or
                                 account.
  core/api/api.service.ts        every call; setDataOwner()/dataOwner (a readonly signal: a person's id, VISITOR_OWNER
                                 'visitor', or null; calls refuse any other user than the page loaded); gate(asPerson)
                                 -> the Caller, decided as the call is ISSUED and carried in ISSUED_AS (the
                                 library's HttpContextToken; CARRIES_VISITOR_KEY for the move): a person's page
                                 signed out (AnotokiAuth.subject()) -> 401 sign_in_required whatever the switch
                                 (never a visitor's), somebody else -> 409 wrongUser; a visitor's page with somebody
                                 signed in -> 409 wrongUser, a sign-in required or a person's call (the own file, the
                                 move: asPerson) -> 401,
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
                                 name), previewImport(text) (?dryRun=true), importMyProgress(text, replace), EXPORT_LIMIT
                                 (the admin panel's calls are the family's pages' own); the session outbox (localStorage
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
                                 guards do); AnotokiAuth.init() first (never rejects: unavailable -> not-set-up,
                                 waiting or load-error), another user signing in in another tab reloads the page (the
                                 family's module does it); beforeunload with a failed save; signIn() (AnotokiAuth's,
                                 which asks beforeSignIn() first: a visitor's saves settle), settleBeforeSignOut(),
                                 signOut(). Nobody signed in and no
                                 sign-in required: a visitor (setDataOwner(VISITOR_OWNER); visiting; a 401
                                 visitor_unknown -> the state again as nobody; 401 sign_in_required -> sign-in, the
                                 key kept). Signed in: with a key held the move FIRST (moveVisitor(): one at a time;
                                 answered -> the key forgotten, visitorMoved {kept} when something came; 422 ->
                                 forgotten; 503 visitor_move_retry with Retry-After <= MOVE_RETRY_MAX_MS 5 s waited
                                 out once; else the key kept and visitorNotMoved), then adoptOutbox(VISITOR_OWNER)
                                 on every signed-in start, then the person's state. An effect on AnotokiAuth.user()
                                 (not its first look, the start's) moves a key held when a sign-in comes back
                                 mid-session (and loads the progress again).
  core/state/site-migrations.ts  provideSiteMigrations(): @anotoki/lib/migrations' config - statusUrl /api/site-status,
                                 apiBase /api/admin/migrations, migrationsRoute /admin/migrations; isAdmin /
                                 isSignedIn from AnotokiAuth; signIn -> BootService.signIn() (lazily: BootService reads
                                 SiteStatus - a circle otherwise); language -> TranslationService.effectiveLanguage()
                                 (English on an admin address, as the panel is); words -> siteStatusWords(i18n) (a getter,
                                 in that same language:
                                 the database's anotoki.siteStatus.*, the module's own while no bundle); formatDate
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
  core/family-kit.ts             provideFamilyKit(): the anotoki family's kit and frame wired to this app.
                                 provideAnotokiUi (@anotoki/lib/ui/config): ...TranslationService.forKit() - language
                                 = effectiveLanguage() (English in /admin), lookup = the library key's own words
                                 (libraryWord('anotoki.' + key): the database's string, else KEPT_LIBRARY_ENGLISH;
                                 null -> the kit's built-in words, never a key) -, icons {piano: PIANO_ICON} (rect from
                                 @anotoki/lib/ui/icon). provideAnotokiShell: theme
                                 {storageKey THEME_KEY 'piano-academy:theme' - the same as index.html's
                                 data-storage-key -, account = AnotokiAuth.preferences()?.theme ?? null, save =
                                 savePreferences({theme}), themeColor THEME_COLOR (light #f4f5f8, dark #14161c)};
                                 languages = TranslationService.forShell() (current, offered - code + native_name -,
                                 choose = setLanguage(), notSaved / clearNotSaved). The family's ThemeService: light / dark
                                 / auto on <html data-theme>, the theme on the screen kept under THEME_KEY (nothing
                                 for auto) for the kit's theme-boot.js; signed in, the account's theme - taken at
                                 sign-in and when it changes, never while a save of its own is out; set() shows at
                                 once and saves (one at a time, the latest last); refused: the account's back and
                                 refused() (the switch's note, anotoki.theme.notSaved); signed out or no preferences: the
                                 device's, nothing saved.
  core/site-admin.ts             provideSiteAdmin(): the family's People page (provideAnotokiPeople: isAdmin, me, this
                                 app's lead, "Delete their progress" with this app's question - deleteQuestion() -,
                                 one's own -> this tab loads its (empty) progress, the visitors' line, formatDate the
                                 admin stamp), admin tools (provideAnotokiAdmin: isAdmin, signInAgain -> signIn({prompt:
                                 'login'}), siteName) and the feedback form (provideAnotokiFeedback: language
                                 effectiveLanguage(), translate libraryWord(), FEEDBACK_SECTIONS - the server's values,
                                 the bar's words -, signedIn, email - the account's address written into the form, the
                                 person's to keep, change or clear: the server keeps what the form sends);
                                 ADMIN_TOOL_ROUTES. The delete's question says a restore of an older backup deletes it
                                 again (0.5.0). The form's POST /api/feedback says itself that it is anybody's
                                 (anotoki-lib 0.7.2, issuedAs('anybody')): the person's while somebody is signed in,
                                 nobody's otherwise (a visitor too: the key goes to the progress routes alone, and the
                                 server counts a visitor's message by address).
  core/error-report.ts           provideSiteErrorReport(): the family's reporter (@anotoki/lib/error-report) on
                                 ERROR_REPORT_ENDPOINT /api/client-errors; error-report.spec.ts holds it as app.config.ts
                                 gives it (a person's report with the token, a visitor's bare, no failed request's).
  core/changelog/                public/changelog.json (newest first; each version MAJOR.MINOR.PATCH, the newest
                                 package.json's - changelog.service.spec.ts reads both files and holds it). Nothing
                                 remembers which What's new somebody saw: it opens only from the footer's What's new.
  ui/                            Piano's own: midi-panel (the piano in the bar: #midi-button - Piano's round-ended
                                 button - with a dot and #midi-label
                                 - the device's name or midi.none - its name midi.button {status}; [anotokiPopoverTrigger]
                                 opens the family's <anotoki-popover> (label midi.title, align end, autoFocus) holding
                                 #midi-box: the status sentence (#midi-status, the family's alert: success / warning,
                                 announce polite), the device list (#midi-device-select, the family's <anotoki-select>
                                 from @anotoki/lib/ui/select, hideLabel inline - in a `@defer (on idle)`: the select
                                 is lazy, the bar in every first load - 6.4 kB more), Connect and Rescan (the family's buttons, Rescan iconOnly); the focus to the
                                 list, Escape, a click outside or the focus leaving close it onto the button, kept
                                 inside the screen by the popover), piano-keyboard (+ KeyboardModel), notation,
                                 changelog-dialog (What's new: the family's <anotoki-dialog>, open as it is made -
                                 the shell makes it from the footer's What's new, in a @defer - and (closed) when it
                                 goes; "Latest" and the Added / Changed / Fixed lists the
                                 family's badges; the releases Piano's own). (The feedback form's dialog is the
                                 family's footer's own since 0.6.3: ui/feedback-dialog is gone.)
                                 The bar's pieces (brand, icon, spinner, theme switch, language chooser, the
                                 popover's positioning) and the questions are the family's (@anotoki/lib) - none
                                 of them is copied here.
  boot/                          load-error (the family's <anotoki-error-state>: heading, sentence, Try again). (Not set up / being updated / not available: the family's
                                 <anotoki-site-status>, in its own en/sk words; a sign-in that did not work: the
                                 family's <anotoki-sign-in-failure> on /sign-in-failed.)
  layouts/admin-layout/          /admin's frame, English: the outlet (its sections are the top bar's links there) -
                                 or "signed out" / "not signed in" / "this part is for the people who keep Piano
                                 Academy's words" (the family's cards and buttons).
  layouts/legal-layout/          the legal pages' frame (lazy, <router-outlet />): providers ANOTOKI_LEGAL_CONFIG ->
                                 pianoLegalPagesConfig() (the root's, skipSelf, with the facts), so the facts load with
                                 the pages.
  core/legal/                    legal.config.ts (LEGAL_PAGE_PATHS - the library's DEFAULT_LEGAL_PATHS -, isLegalPage(),
                                 pianoLegalConfig(): language effectiveLanguage(), translate libraryWord(); its facts()
                                 throws - they come with the frame); legal-facts.ts (PIANO_LEGAL_UPDATED,
                                 SIGN_IN_HINT_COOKIE, pianoLegalPagesConfig(), pianoLegalFacts(i18n, auth): site
                                 brand.area, about legal.about, account {deleteUrl accountUrl(), privacyUrl
                                 issuer/privacy}, data - record, progress, limits, words -, visitors {days 30},
                                 feedback, auditLog, backups, storage (11 items by the code's own constants: the
                                 sign-in's, the hint cookie, THEME_KEY, the translations' names, VISITOR_STORAGE_KEY,
                                 OUTBOX_PREFIX, PROGRESS_REPLACED_PREFIX, LAST_DEVICE_KEY, the drafts), processors
                                 hosting (WebSupport s.r.o., named 2026-10-18) and cloudflare; its doc comment names the code each fact
                                 rests on - keep them true). legal-facts.spec.ts draws the pages for real.
  pages/                         home (the path), lesson (+ steps/meet, drill, sequence; step-outcome.ts: Feedback
                                 {key, params, kind}), trainer, sheet, songs (+ song-player), stats (+ own-progress:
                                 "Your progress file" - Download; Bring back a file: size checked, refused while a
                                 save waits, the dry run's counts, a second press, over progress a question, then the
                                 progress loaded again; ownProgressProblem() words each code - only for somebody
                                 signed in; in its place #own-progress-visitor: ownProgress.visitor + Sign in).
                                 Drawn with the family's pieces (anotokiButton, <anotoki-card> - the Continue card
                                 tone="highlight" -, <anotoki-alert>, <anotoki-badge>, the path's step chips
                                 (button[anotokiChip]: passed success, open primary, locked neutral and disabled;
                                 data-open / data-state), <anotoki-select> from ui/select - lazy pages, so it stays
                                 out of the first load -, <anotoki-stat-tiles> (Stats, the Note Trainer;
                                 anotoki-stat-tile__value / __label), a lesson's <anotoki-step-dots> (showLabels;
                                 lesson.steps its name; anotoki-step-dots__short), the spinner, the table styles:
                                 .table .table-stack, a card a round on a phone, the numbers .cell-num -, the empty
                                 state: Stats with no round yet, the piano's icon) and the
                                 utilities (.stack, .cluster, .facts); Piano's own from the tokens:
                                 the path (.phase-head, .unit, .unit-badge - home), the meet step's count of plays
                                 (●●○) and the result (lesson), _practice.scss (.practice - the practice screens'
                                 column -, .lesson-instruction, .controls, .prompt, .feedback / --correct /
                                 --incorrect: success-text / danger-text), @used by the pages that have it.
  (the admin panel's pages)      all the family's, English: people (<anotoki-people-page>, @anotoki/lib/people/page:
                                 the counts, the scrub's line, a search, pages of 50, delete after this app's
                                 question; [data-people], [data-person], [data-visitors]); the admin tools
                                 (@anotoki/lib/admin/errors, /audit, /feedback, /backups); translations and languages
                                 (<anotoki-translations-page> - the grid: search, missing only, a cell per key and
                                 language, plural samples, export / import a language's file, drafts kept for the tab -
                                 and <anotoki-languages-page> - add, rename, order, offer, delete), lazy from
                                 @anotoki/lib/translations/admin; migrations, <anotoki-migrations-page> (the route
                                 loads it from @anotoki/lib/migrations/page: Pending with drafts, Applied with when and
                                 each file's SQL - this app's files and the library's, each named with its set -,
                                 Missing, "Apply pending" after a question; drawn for an ADMIN while an update waits,
                                 then onUpToDate -> BootService.resumeAfterUpdate() starts the app in place).
                                 core/util/save-file.ts hands the browser a file. ApiError carries details.

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
- **The token**: the family's auth module (`@anotoki/lib/auth`, its client
  the IAM's SDK ported) does code flow + PKCE; tokens in localStorage
  (`anotoki-auth:piano-academy` - the SDK's keys: nobody was signed out by the
  move), shared by all tabs, refresh serialised across tabs. Redirect URI
  `<origin>/auth/callback` (a route), post-logout `<origin>/`; the IAM
  registers `http://localhost:4500` for development; the live site's client in
  the IAM needs `https://piano.anotoki.eu` the same way. `AnotokiAuth.init()`
  runs in the app initializer (`BootService.start()`), before the router's
  first navigation, so the address the sign-in started from is what the
  router reads. The backend (`Anotoki\Lib\Auth`)
  verifies every access token (RS256, typ at+jwt, kid in the JWKS cached in
  cache_dir for an hour, iss, aud piano-academy, exp/nbf/iat 60 s leeway, sub =
  user id). Who may sign in is the IAM's ("Roles that may sign in", IAM
  010; MEMBER among them). A token that is sent and does not verify is 401
  on every route that reads one - never "nobody", never a person without a
  role - a Bearer header with no token too (`invalid_token`). Only Bearer is
  a sign-in: `Basic ...` counts as no header.
- **The switch** ("Sign-in required", the IAM's per application):
  `signInRule()` - the library's `SignInRule` (kept a minute in `cache_dir` -
  this app's own folder -, one asking at a time, 2 s timeout, 404 =
  required, out of reach = the last answer or required); relayed as
  `login_required` by `/api/auth/config` (the library's `AuthRoutes`). No test
  asks a real IAM: `application_file` / `anonymized_file`
  (`test_application_file()`, `test_login_required()`,
  `test_anonymized_file()`) or the family's stand-in; `test_offline_auth()`
  refuses anything else.
- **Visitors** (the switch off; `api/visitors.php`, 005, the build analyzer's
  pattern): who a request is, in this order (the library's `Identify`; only
  `requireOwner()` takes a visitor for anybody): a Bearer header - that person or 401, the key not read;
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
  `visitor_move_retry`. **In the browser**: `AnotokiAuth.loginRequired`;
  who a request is decided as `ApiService` issues it (the library's
  `ISSUED_AS`, from the page's data owner), never from a token's being there
  as it leaves - a person's request with no token is never sent (the family's
  interceptor); the key (`VisitorKey`) only on a visitor's request to the
  progress routes while no sign-in is required, KEPT while one is
  (only `visitor_unknown` forgets it); one maker at a round's end; the move
  before the person's state (`BootService`); the visitor's outbox taken on at
  every signed-in start; a visitor's 413 / 429 not sent for ever. **The
  visitor's words** (stage E; the shell's, `app.component`): under the bar
  on Learn and Stats only (the practice screens stay clear) the notice -
  kept for this browser 30 days after the last visit, signing in keeps it -
  with Sign in; on any page sign-in required meanwhile (with Sign in), a
  refused sign-in in the failure screen's words (a visitor gets no signed-out
  banner, and stays on the page),
  a save refused (`visitor.full` / `visitor.busy`, with Sign in) and the
  progress ended (`visitor.lost`, closable); after a sign-in `visitor.moved`
  (+ `visitor.kept` when the account kept its own for some of it) or
  `visitor.notMoved`, closable. Stats: the sign-in line in place of the
  progress file. The top bar's Sign in is offered to a visitor as to anybody
  signed out.
- **Roles** (the token's `roles` for this client id): none - learns, with their
  own progress; **EDITOR** - also the staff routes (rewording the words);
  **ADMIN** - also the languages, the people (counts, delete - its question
  alone, audited), the database and the admin tools (error log, audit log,
  feedback, backups; EDITORs see none). `requireRole()` / `adminByToken()` on
  the route GROUP (`api/routes/admin.php`), 403 `forbidden`. **MEMBER** -
  every account holds it - is an ordinary learner: no check needs it or
  refuses it. Taking it away in the IAM refuses the next sign-in and refresh;
  the token held verifies until it runs out. The frontend's `isStaff` / `isAdmin` (the admin panel's
  sections, `adminGuard`, the bar's Admin item, the family's status page's
  "Open Migrations" and its Migrations page - `isAdmin` is their config's) only
  hide what the server refuses anyway.
- **Language at sign-in**: the authorize request carries `uiLocales` (the
  page's language), and a token's `locale` claim is the account's language.
  **Which language** (the family's order, decided 2026-10-06; since 0.3.0
  the family's own `TranslationService`): signed in with preferences, this
  tab's `?lang=` and a choice made on the page this visit, then the account's
  `locale` (when the site has it), then this device's remembered choice,
  the browser's, English; a change of the account's language made elsewhere
  is followed when it comes (over the device's choice and an earlier choice
  on the page, not over `?lang=`, not while a choice made here is on its way
  to the account). Signed out, or no preferences: `?lang=`, this device's
  choice, the token's `locale`, the browser's. A choice that won in the
  chooser (the family's, `forShell()`'s `choose` -> `setLanguage()`) is
  saved to the account too (`account.save` in `core/i18n/site-translations.ts`),
  and still remembered on this device.
- **The account's theme, dates and clock** (the IAM's 015):
  `AnotokiAuth.preferences` while signed in (null for nobody, a visitor, an
  IAM that sends none - then the app's own settings, nothing saved). The
  theme is the account's everywhere, the admin panel too (the family's
  `ThemeService`); dates follow its order and clock (`localDate`); the bar's
  theme switch and language chooser save a choice and say a refusal under
  themselves (`anotoki.theme.notSaved`,
  `anotoki.language.notSaved` - a language the IAM does not offer is silent; the
  words promise no retry: after `access_denied` it would not help).
- **Every page signs in first** (the family's `personOrVisitorGuard`,
  `staffGuard`, `adminGuard`): anybody signed out is sent to the IAM and back
  to the page asked for - but a visitor (no sign-in required) goes through to
  the learner pages, never to `/admin`; a sign-in that came back without one,
  could not start or cannot be set up goes to the family's screen
  (`/sign-in-failed`: why, Try again, Back) - never round to the IAM. No
  sign-in by the IAM's hint (`hint: false`).
- **The top bar's menu** (the family's, Piano's items): the username (or
  `account.signedIn`), e-mail, role, "Your anotoki account" (new tab), "Admin
  panel" (staff, while the site is ready), "Sign out" (settles first - the
  family's "Saving…" -; asks `signOut.*` through the family's
  `ConfirmService` when progress would be lost); signed out mid-session: "Sign
  in", and the banner "You are signed out, so your progress is not saved.";
  "Not saved yet" while anything waits (all of them keys). A sign-in that did
  not work is worded from its code alone (the library's `failureText()`, its
  words `anotoki.signIn.*`): `access_denied` is `notCompleted`,
  `storage_unavailable` `storageUnavailable`, `state_mismatch` `expired`,
  anything else `failed` with the code - this app's three sentences there
  since 011; the IAM's own English sentences are never shown. The family's
  footer's "Feedback" opens the family's form (no mail; the admin bar counts
  the new ones).
- **Hosting** (Apache + PHP + PostgreSQL, FTP only): `php tools/build.php` ->
  upload `dist/` into the web root -> `/setup.php` with the token. Web MIDI and
  the sign-in's Web Crypto need HTTPS there. A later migration: an administrator's
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

**Since `anotoki-lib` 0.3.0 the anotoki family's library reads and writes
them** (2026-10-11, `docs/decisions.md`): one implementation for every site
- the PHP half's `Anotoki\Lib\Translations` (`api/translations.php`), the
Angular half's `@anotoki/lib/translations` (`core/i18n/site-translations.ts`),
one wire format, the IAM's (snake_case). The permissions stay this app's
(the route groups' `requireRole()`). The library has words of its own,
`anotoki.*` (54: the kit's - bar, menus, chooser, theme switch, dialogs,
pages - and the status page's), in the same tables, written by its own
migration set `anotoki_translations` (after this app's) and reworded by the
owner like any other: the kit reads them (`forKit()`) - never this app's
keys. A library key never shows as a key: the database's string, else
`KEPT_LIBRARY_ENGLISH` (the words this app says its own way, English), else
the library's built-in English / informal Slovak. A site migration never
depends on a library file and never counts `anotoki.*` keys; to word a
library string its own way it writes the key first (`INSERT ... ON CONFLICT
DO NOTHING`), then the string (as 009 did).

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
  `MidiService` keeps a problem kind, `AnotokiAuth.displayName` a name or ''.
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
- **The scan** (the library's `KeyScanner`, set up in
  `tools/translation_keys.php`; run by the tests and by
  `php tools/translations.php --status`): every key the frontend asks for is in
  the database and every key in the database is asked for (`anotoki.*` passed
  by: the library's own); a family asked for as one string (or the other way
  round) fails; a quoted literal of a key's shape whose namespace the database
  has counts as asked for - so a library word is written `anotoki.<...>` whole
  (`i18n.t('anotoki.topbar.roleAdmin')`), never as the kit's short key next to
  a namespace this app still has (`topbar.home` keeps `topbar.` this app's).

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
  tokens, defined for light and dark: the family's `--anotoki-*` (in Piano's
  palette, `anotoki.root()` in `styles.scss`) and Piano's own `--key-*`,
  `--notation-*`, `--good-contrast`, `--continue-glow` - words in green, red
  or amber are `--anotoki-success-text` / `danger-text` / `warning-text`,
  never the fills; everything works at 390 px. Where the family's kit has a
  piece - a button, a card, an alert, a badge, a field, a dialog, the
  spinner, an error or empty state, the table styles, a menu, a popover, a
  question, an icon - use it, as the kit draws it (a site gives its colours,
  never its own look to a kit component), imported from its own entry point
  (`@anotoki/lib/ui/button`, `/ui/card`, `/ui/dialog`, `/ui/icon`,
  `/ui/config`, `/ui/chips`, `/ui/stat-tiles`, `/ui/stepper`... - never the
  `@anotoki/lib/ui` barrel, which puts the whole kit in the first load;
  `/ui/select` only on lazy pages, or in a `@defer`).
  Spacing between a page's blocks is the page's (a column with gaps,
  `.stack`, `.cluster`, `.practice`): the family's base gives `p` and the
  headings no margins. What is Piano's alone (the path, the practice
  screens, the tiles, the keyboard, the staff, the piano's button) is built
  from the tokens; a piece the kit lacks that another site could use is
  written down for the library, not copied.
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
  `frontend/public/changelog.json` - only lines that mean something to a
  learner. A new release is a new entry on top whose version has **three
  numbers, MAJOR.MINOR.PATCH** (the owner's rule, 2026-10-07: big changes /
  new features / bug fixes - "0.5.0", "0.4.1", never "0.5"), and
  `frontend/package.json`'s version line says the same (a spec holds the two
  equal).

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
- **`INSERT ... ON CONFLICT DO UPDATE ... WHERE` locks the conflicting row even when the WHERE is false**: the library's `PeopleRecorder` (`recordPerson()`) on every person's request waits while an import or a delete holds that person's users row - harmless, and it is why a test that holds the row itself proves nothing about the import's own `FOR UPDATE` (me.test.php holds a lock on `sessions` instead, inside the import's transaction).
- **PostgreSQL 18 lists a NOT NULL as a constraint** (`<table>_<column>_not_null` in pg_constraint); older servers do not - a test comparing constraints across a migration that adds a NOT NULL column passes over that one.
- **Apache under CGI/FastCGI drops `Authorization`**: both `CGIPassAuth On` and `SetEnvIf Authorization` in the upload's `.htaccess`; when the PSR-7 header is empty, the library's `Bearer::header()` reads `REDIRECT_HTTP_AUTHORIZATION` too.
- **Another person signing in in another tab** would have let this tab save as them: `ApiService` refuses calls whose `AnotokiAuth.subject()` differs from the page's owner, and the family's auth module reloads the page.
- **Zoneless change detection is scheduled**: after a click, wait for the DOM (`waitForFunction`), don't read it synchronously.
- **A zoneless OnPush `<dialog>` opens before its words are drawn**: Piano's old confirm dialog set its question and called `showModal()` at once, and opened empty (or with the last question) - its `ask()` called `ChangeDetectorRef.detectChanges()` first. The family's dialogs take care of it now: `ConfirmService`, and `<anotoki-dialog>` (What's new) opens itself as it appears in an `@if`, its words drawn by then.
- **jsdom lacks what the family's components ask a browser for**: `showModal()`, `checkVisibility()` (a box's autofocus, a dialog's Tab) and the popover API (a menu or a box in the top layer). A spec of a page that draws the family's bar, a menu, the piano's box or a question calls `provideTestKit()` (`core/testing/test-kit.ts`; `provideTestDialog()` alone is only the dialog) in `beforeAll`.
- **Headless Chromium asks `beforeunload` only after a real press** (`Input.dispatchMouseEvent`); values set by script alone give no question.
- **A component's styles have a budget** (`angular.json`: a warning over 6 kB, an error over 12 kB); every admin page is the family's now, with its own styles.
- **The server's sentence is shown only on the admin pages** (the family's); a learner's page words what happened from its own keys (`ownProgressProblem()` for the own file).
- **The family's question is drawn once, in the app's root** (`<anotoki-confirm-host>` in `app.component.html`; `ConfirmService.ask()` from anywhere): a page made on its own in a spec has none - `drawTestQuestions()` (`core/testing/test-kit.ts`) draws one beside it in the same TestBed and reads and answers it. Escape is a keydown on its `<dialog>` (jsdom has no cancel event of its own).
- **The family's question draws its words only while asked** - the shell spec reads every kept-English string from the DOM, so it opens what holds them (`OPENED` in `app.component.spec.ts`: the menus, the piano's box, the sign-out question, What's new) before it reads.
- **The first load is over its 550 kB warning** (558.1 kB since the family's footer, 2026-10-18; 549.4 before): the footer is in every first load (the owner's choice), so `ng build` warns until the owner raises the budget or more of the first page goes lazy - the owner's call. esbuild's tree-shaking is global, so an export of a module the first load already holds lands in the first load even when only a lazy page uses it (`NgComponentOutlet`, the legal Contact page's), and the footer's legal links bring `RouterLinkActive` and the legal module. Room was made before by loading What's new when it opens (a `@defer`); the footer's feedback form comes with the press. Before adding anything to the first page - an import in the shell, the bar, Learn - build and read "Initial total"; the piano's select made eager would cost 6.4 kB.
- **A legal page is a path of its own, before the catch-all** (the survey's lesson): under the learner's `''` parent its `personOrVisitorGuard` would send somebody signed out to the IAM, after `**` it would be Learn. The shell draws it for nobody too (`isLegalPage()` in `pageShown()`), and its facts must stay TRUE of the code: a change to a table, a time limit or a stored item changes `core/legal/legal-facts.ts`, the `legal.*` strings (a migration) and `PIANO_LEGAL_UPDATED`.
- **Person or visitor is decided when a request is ISSUED, never when it is sent** (`ISSUED_AS`): the build analyzer's interceptor sent a request as a visitor whenever no token came back, so a person whose refresh failed had their round stored in the visitor's row - or, with no key, MADE a visitor out of it (the server cannot tell). A person's request with no token fails locally (401 `sign_in_required`), and `gate()` refuses a person's page whose person signed out before anything (401, never "somebody else", whatever the switch). `api.service.visitor.spec.ts` holds it, with the family's interceptor.
- **A visitor's key is kept while a sign-in is required**: a 401 `sign_in_required` to a visitor only calls `AnotokiAuth.noteSignInRequired()` (the family's interceptor); forgetting the key there would lose exactly what the next sign-in should move.
- **A visitor whose key the server no longer knows gets a 409, not a "changed elsewhere"**: the 401 `visitor_unknown` forgets the key (`VisitorKey.lost`), and the family's interceptor sends that save once more without it - as nobody's, with the visitor's old generation: 409 `progress_changed` (the next note then makes a new visitor, and `lost` ends with its key). `ProgressStore` loads nobody's progress then but leaves `changedElsewhere` unset on a visitor's page while `lost` is true ("replaced by a file or an administrator" would be wrong; `visitor.lost` says it). `progress-store.service.spec.ts` pins it.
- **Three saves at a round's end would make three visitors**: `ApiService.visitorSave()` lets one "maker" (no key) out at a time; the others wait and work their headers out after the wait (the `headers` function), so they carry the key and the generation the maker's answer brought.
- **Extra awaits in `ApiService` break specs that count microtasks** (`progress-store.service.spec.ts`'s `settle()` is five `Promise.resolve()`s): `request()` is not `async` - it returns `send()`'s promise, and `send()` maps the answer inside the observable - so a person's call takes as many ticks as before.
- **A save without a generation is never sent**: `ApiService` throws a local 409 `progress_changed` instead, and the store loads the progress again - so the server's 428 can only mean another client, or a header dropped on the way: kept as a failed save ("Not saved yet"), never "changed elsewhere".
- **A page that keeps its own copy of the progress undoes an import**: a round that copied `store.progress()` at its start and saved the copy whole after each answer wrote the old progress back under the new generation after a reload. Answers go through `ProgressStore.updateNote(midi, change)`; read `store.progress()` to pick a round, never keep it.
- **An accessible name holds the words the control shows** (WCAG 2.5.3): a key that names a control with visible text takes that text as a placeholder (`language.button` {code}, `midi.button` {label}); the browser check compares them.
- **`HttpClient` with `responseType: 'text'` gets a refusal's body as text**: `ApiError` parses it as JSON for the code (`bodyDetails()`).
- **A menu fades in over 140 ms** (the family's menus and popover): a screenshot taken at once shows it see-through, over the page - the browser check waits and asks `elementFromPoint` whether the menu is on top.
- **jsdom has no `matchMedia`**: the bar is then a desktop's; a spec of the phone's bar stubs it (`vi.stubGlobal('matchMedia', ...)`) and answers only the bar's `max-width` query - the family's `ThemeService` asks `prefers-color-scheme` and listens too.
- **The theme service is the family's** (`@anotoki/lib/shell`, its rules tested in the library): `core/family-kit.spec.ts` holds Piano's wiring - the account's theme from the first moment, this app's storage key and colours, a refusal put back and said in this app's words. A spec that signs somebody in makes the service before the account arrives, as the app does at its start: made lazily after the account was set, a theme service's first run comes after the person's choice and its refusal - and puts the account's theme back by itself, so a missing revert would pass (found by a mutation check on Piano's old service).
- **A "nothing happens" check must wait as long as the thing would take**: the spec "once somebody chose here, the token no longer decides" checked one microtask after the token changed - before a switch on its way could have landed - so a regression that followed the token anyway passed (found by a mutation check); it waits with `settled()` and counts the requests now.
- **A preferences save is an auth change too**: `AnotokiAuth.savePreferences()` writes the session like a refresh, in every tab - `BootService`'s effect sees the same person (no move, no reload), `TranslationService` sees a changed `locale` but a choice stored here (nothing to adopt). `TestAuth`'s person in a spec of anything that draws the theme switch needs `preferences`.
- **The stand-in IAM sends no `preferences` unless its `user` has some**: every tour and test before 2026-10-06 runs as against an IAM before its 015 (the app's own settings); the preferences tour sets them and signs mia in again without them at its end.
- **The bar's fold is measured, not guessed**: a row that does not fit squeezes the person's button first (its container has `min-width: 0`), so a measure taken on a crowded row reads too little - `--measure` measures at NAME_BAR_MIN - 1, where nothing is squeezed.
- **Another session's browser check may hold 8590 / 8597**: never stop it; `SITE_PORT` / `IAM_PORT` for others (the database is named after the port).
- **The MIDI notice** words the problem's kind in the page's language and adds the browser's own reason after a colon, as it is, `lang="en"` - in Slovak too.
- **The IAM's switch is kept a minute and remembered for the request**: a test that flips the stand-in's `login_required` sees the old answer until the kept file (`<cache_dir>/anotoki-iam-application-*.json`) is older than `application_ttl` - move its times back (`api/auth`'s `switch_age()`), delete it, or give `application_ttl` 1 (`testenv.php --application-ttl=1`); the library's `SignInRule` holds its answer for the rest of a request (`Identify` resets it at the start of each), while `application_file` is read on every call. A test whose settings name neither a file nor an IAM on this computer is refused by `test_offline_auth()` - it would ask the live IAM (the hosted site's settings, written by setup.php, get `application_file` added in `api/hosting`).
- **Only Bearer is a sign-in** (the library's `Identify`): `Basic ...` (a host behind a password file) is nobody, never a 401 of its own; a bare `Bearer` is `invalid_token` - and a Bearer header that does not verify never falls back to the visitor key (`tests/api/visitors.test.php` holds it).
- **The library's `Identify` reads the visitor key (every route but the public ones, only while no sign-in is required), and the move reads it beside a token (`routes/visitor.php`, behind `requireUser()`) - but only `requireOwner()` takes a visitor for anybody**, and a visitor is made only inside the transaction of a save whose body already checked out (`visitorMake()` refuses to run outside one): a refused or failed save makes nobody and counts nothing. `requireUser()` / `requireRole()` are the library's `RequirePerson` / `RequireRole`, which refuse a visitor: they mean a verified token.
- **A maker's save names generation 0** (what nobody's state says); a visitor's or a person's later save to 0 is 409 `progress_changed` (a second tab) - a person's 0 stays a 428 as before.
- **Work after the answer runs after a 204's client has gone**: a 204 has no body, so curl (and the browser) has the whole answer before the after-response sweep is done - a test that looks for the sweep's effect after a 204 polls (`eventually()` in `tests/api/visitors.test.php`); after a 200 under `php -S` (no Content-Length, the connection closes at the end) it has run.
- **A table of a person's data must be in `STORE_PERSON_TABLES`** (`api/store.php`): the sweep and `peopleDelete()` empty those before the users row, and the foreign keys do not cascade - one left out makes every sweep batch that meets such a visitor fail (logged, never failing a request).
- **005's descriptions must pass 004's gate**: the browser check's "database behind" tour takes 005 off the record and applies it again (with visitors in the database), and `tests/unit/migrations.test.php` runs 004 and 005 again over visitors - 004's strings gate refuses any description with "header", "account panel", "footer's theme", "admin area" or "admin console".
- **While an update waits, one page runs: Migrations, for an ADMIN** (the family's `<anotoki-site-gate>` lets it through: update-pending + ADMIN + the route). `AppComponent.pageShown` draws the outlet for an ADMIN on `/admin/migrations` whatever the boot status - ONE outlet for both, so the page (and what its Apply said) is not drawn again as the app starts; the bar has Migrations alone (`BootService.onlyMigrations`), `/admin` opens it; after an Apply that leaves nothing applicable the family's page calls `onUpToDate` -> `resumeAfterUpdate()` (the start goes on from `waiting`: the move, the progress, `ready`, and the strings again - `TranslationService.reload()`, as the ones in memory are from before the update) and `SiteStatus.markReady()` - no page load. Anything new that must work while an update waits needs a path in `siteOpenPaths()` on the server (`api/index.php`; and nothing that reads tables a pending migration makes) and the same care in the shell.
- **The gate's content is a marked template** (`@anotoki/lib` 0.2.0): `<anotoki-site-gate><ng-template anotokiSitePages>...</ng-template></anotoki-site-gate>`, with `SitePagesDirective` in `AppComponent`'s imports - the gate makes the view only while it shows it, so no page runs behind the status page, also when an update comes in the middle of practising (the page is destroyed; the status page loads the site afresh once it is back, without reopening the gate first - `SiteStatus.checkForReload()`). An unmarked `<ng-template>` is not the pages under 0.2.0: nothing is drawn (development warns). Content given as it is Angular makes whether it shows or not: an update that came mid-practice would leave the page running behind the status page (`app.component.spec`'s "makes no page behind the status page" fails then); and 0.1.1 took the shell's first `@if` block for the template, so "Loading…", the sign-in card and "Could not load" vanished. `pageShown()` stays inside the template: it picks the page or the start's card and keeps one outlet for an ADMIN's Migrations page across the Apply (the moment before the status page's reload is the library's now).
- **A request that does not say whom it is for is the person's whenever the sign-in is set up** (the family's `AnotokiAuth.caller()`: 'person' unless a visitor's page, signed in or not), and a person's request with no token is never sent - `auth.refused()` makes the page follow. The library's feedback form posted so: while Piano requires a sign-in its message from somebody signed out (the footer's Feedback, Contact's form - anybody's) said "Sign in to send a message" and the page followed, what was typed lost (the survey's pass found it, 2026-10-18). Since `anotoki-lib` 0.7.2 the form marks it itself (`issuedAs('anybody')`: the person's while signed in, nobody's otherwise), and Piano's own interceptor is gone. Anything new of the library's that posts to this app's API without its own ISSUED_AS needs the same care.
- **The status page stands alone: the whole frame is the gate's template** (anotoki-lib 0.6.3, the owner's rule of 2026-10-18): the bar, the notes, the page's `<main id="view-root">`, the footer and What's new's dialog are inside `<ng-template anotokiSitePages>`; the gate draws the status page in a `<main>` of its own. Anything of the frame put beside the gate stands round the status page (`app.component.spec`'s "draws the status page alone" fails - with the bar outside the gate four tests fail), and a `<main>` round the gate makes two landmarks. Only the overlays stay outside (`<anotoki-confirm-host>`). While the status page shows there is no bar: no theme switch, no language chooser, no Sign in but the status page's own - and the browser check waits for the status page, never for the bar, after a Sign in from it.
- **The kit's words are the library's keys, `anotoki.*`** (since 0.3.0; `core/i18n/kit-words.ts` is gone): the kit asks `forKit()`'s `lookup` for `anotoki.<its key>` - the database's string (this app's wording, which migration 009 copied there, or the owner's rewording), else `KEPT_LIBRARY_ENGLISH` (English: the theme switch's "Theme: light"; the kit's own `theme.light` is "Light"), else the kit's built-in words - never a key. Where this app's own code says a library word (the bar's role pill, its menu items), it asks for the whole key, `i18n.t('anotoki.topbar.roleAdmin')`: the key scan (the library's `KeyScanner`) reads every quoted literal of a key's shape whose namespace the database has as a key the app asks for, and passes `anotoki.` by - the kit's short key (`'topbar.roleAdmin'`) would be read as a missing key of this app's `topbar.` namespace. Migration 004 cannot run again over 009 (its gate wants keys 009 moved): a test that re-runs an old migration builds through 008 first.
- **A token given to `anotoki.root()` as a one-item list is no CSS**: `x: (0 1px 2px ...,)` - Prettier's way of writing a long map value - comes out as `--anotoki-x: (0 1px 2px ...,)`, which no browser takes, so every `box-shadow` / `filter` reading it is none. `@anotoki/lib` 0.2.0's own one-item defaults had the same fault - `shadow-sm` (the theme switch's chosen segment) and the dark `mark-shadow` (the mark's halo in the dark bar) - and `styles.scss` wrote those two as plain values until 0.3.0 fixed them (2026-10-11: the plain values are gone). Look at the built `styles-*.css` for `: (` after a change there. Only colours are a site's to give (the owner's rule): no corners, shadows or font of Piano's own.
- **No global rule for buttons, selects or cards** (since 2026-10-11, the pages on the kit): a bare `button {}` would give the family's buttons Piano's padding and border (`$piano-own` kept Piano's old rules off them until the pages moved). A control of Piano's own (the step chips, the piano's button) sets everything it relies on in its component's `.scss` - `font: inherit`, the cursor, the margin.
- **The piano's device list is in a `@defer (on idle)` block** (`ui/midi-panel`): the kit's select is a lazy entry point (`@anotoki/lib/ui/select` since 0.6.0, 6.4 kB in the first load; `/ui/forms`, ~48 kB, before) and the bar is in every first load. Its import is the select alone (`SelectOption` an `import type`), used only in the block - anything else of the file that named it would put it back in the first load. A spec that makes the panel itself (`midi-panel.component.spec.ts`) imports it into the testing module and calls `compileComponents()` (else "has unresolved metadata"), then renders the block (`fixture.getDeferBlocks()`, `DeferBlockState.Complete`) as idle would; the shell spec does the same before it opens the box. The browser check finds the focus on the `<select>` inside `#midi-device-select` (the kit's field keeps the id on its host).
- **The kit's alert sets its own `role`** (`announce`: true - `alert`, `'polite'` - `status`, none - no role): a `role` written on `<anotoki-alert>` is removed by its host binding. The notes keep their ids on the alert; a spec reads `#signed-out-banner span` (the sentence is the first `<span>` inside).
- **The family's base gives `p`, `h1`-`h4` no margins** (and 15 px type): a page spaces its own blocks (`.stack`, `.cluster`, `.practice`, a host's gap), and a Piano heading that should stand out sets its size in its component (the Continue card's, a phase's, a lesson's).
- **Nothing may stand in front of `GET /api/site-status`** - no token, key or role check, no middleware of a route group, no gate of the app's own, nothing that needs the IAM or the settings to be right: the pages ask it before anybody can be signed in, and the family's frontend reads any 401 or 500 there as "unavailable" ("The site is not available right now" instead of the right page). `tests/api/site.test.php` asks it as everybody (`askers()`) in every state; a settings file PHP cannot run is "not set up" (`localSettings()`), not a 500.
- **The status page reloads by itself once the site is back** (visitors' and learners' views ask `/api/site-status` every 30 s): a progress save still failing at that moment makes the browser ask "Leave site?" (`BootService`'s beforeunload) - the store retries every 15 s, so it is usually through first.
- **The People delete works on the connection it is handed, never `db()`** (`peopleDelete($pdo, $id)`, anotoki-lib 0.5.0): the library's `People::delete()` holds the transaction - a savepoint inside a restore's - and a restore does the delete again on its own connection, which holds every table it loaded until it commits. A statement on `db()` there waits on those locks while the restore waits on it; nothing looks deadlocked (the restore's connection is idle), and PostgreSQL ends the restore a minute later (`500 restore_failed`). The hook begins, commits or rolls back nothing (a LogicException from the library otherwise). `admin-tools.test.php`'s replay test holds it (mutation-checked: `storeLockGeneration($id)` on `db()` hangs the restore 60 s and fails it).
- **Generations after a restore are renewed inside it** (`backupsRestoreHooks()`: the library's `beforeCommit`, after its replay), not in the library's `then:`: that runs after the commit and after the scrub has asked the IAM, and a tab open since before the restore - whose generation the restored row has again - could save over the restored progress in between. Inside, the restore still holds `users`, so a save waits and then meets the new number (409). A failure there rolls the restore back whole.
- **anotoki-lib 0.5.0's restore cannot restore a database whose `visitor_ids` was ever called** (it counts down from -1): the library moves every sequence on to the GREATER of the backup's next value and today's - right for a sequence that counts up - and asks `setval(visitor_ids, 0)`, out of its bounds: `500 restore_failed` ("setval: value 0 is out of bounds for sequence visitor_ids"), nothing restored. The library's to mend (after 0.5.0); `admin-tools.test.php`'s last test holds what a restore must do and fails until then. Until the fix a restore works only on a database where no visitor was ever made (the tests make their visitors' restore last).
- **The Migrations page's and the admin tools' routes record nobody** (`adminByToken()`: the token's ADMIN alone): they answer while the database is behind, and a check that wrote the caller's users row there would fail with `503 database_unavailable` on a users table a pending migration changes - before the Apply runs. A migration still never renames what the library's `PeopleRecorder` writes (`users.id`, `preferred_username`, `created_at`, `last_seen_at` - `people()`'s `PeopleTable`) without changing `people()` with it.
- **`String.replace` with a string treats `$$` as `$`**: an edit script that writes Playwright's `$$eval` through it gets `$eval` - use split/join.
- **A spec's stand-in for `<app-notation>`** must provide `NotationComponent` by `useExisting`, or the page's `viewChild(NotationComponent)` finds nothing (`steps.spec.ts`, `trainer-page.component.spec.ts`).
- **A settings file PHP cannot even compile is never required**: a `*.local.php` with a byte-order mark or a blank line before `<?php declare(strict_types=1);` is a compile-time fatal error ("strict_types declaration must be the very first statement") that no `try`, no handler and no output buffer catches - every request, the status too, was a 500. `settingsFileReadCleanly()` reads the first five bytes and passes over a file that does not start with `<?php` before PHP sees the rest (Japanese Academy's review, 2026-10-18); a test of a settings file writes both starts.

## Known issues (not fixed yet)

- **Tempo mode assumes one note per click**: windows come from the beat index, not `note.beat` / `durationBeats`. Rhythm (phase 4) needs per-note times and a click per beat.
- **Unsaved progress/path changes live only while the page is open** (sessions survive in the outbox; a failed progress PUT is retried while the tab lives, `beforeunload` warns in iam mode).
- **The owner's computer and the hosted site keep separate databases**; move data with an export. The same holds for the app's words: each database has its own strings, and the Translations page's export and import (or `tools/translations.php`) are the bridge.

## Tests

- **Backend** (`cd backend && php tests/run.php`; it must pass on PHP 8.5): each file
  its own process and throwaway database; `tests/lib.php` first (it writes a
  `PIANO_TEST_CONFIG` folder with the machine's DB server + a `piano_test_`
  name before the app loads, and refuses anything else).
  - Tokens: `test_token($id, $roles = [], $extra = [], $sign = [])` - no roles is a learner; `test_auth_iam()` the settings that check them; `test_auth_settings()` what the test process itself loads.
  - `unit/auth` - loopback, local names, relayed requests (`isThisComputer`), the old functions gone, the browser's settings whatever an old mode says (with `loginRequired`), what reaches the SDK, only Bearer a sign-in (Basic is nobody, "Bearer" alone a 401), roles and `SiteUser::has` (MEMBER a learner), the cache path, no test asking an IAM off this computer (`test_offline_auth()` and a scan of every settings write under tests/), textClip.
  - `unit/config` - not set up without/with bad files, a file PHP cannot run no setting (named with its kind and line - never with PHP's message, which may quote the password), a file that does not start with `<?php` (no `<?php` line, a byte-order mark or a line before it - before `declare(strict_types=1)` too, compiled a fatal error that would end the process) no setting, never compiled, named by its start; one that prints as PHP reads it (text after a closing tag) no setting, nothing printed, named by its bytes, an old file with mode / local_user_id still a setting, no committed stand-in, the test folder only for piano_test_, owner-only writes.
  - `unit/migrations` - through the family's engine as the app sets it up: an empty database gets every migration (nothing written to find out, the record's shape kept, the folder listed as the engine lists it, the app's lock - busy, then applied); `php migration.php` builds a database from nothing (`--status` / `--dry-run` only read); the older `migrations(name)` table is read and renamed in place (the `prepare` hook); a failing file rolled back whole and named ("statement N of M"), it and the files after it waiting; the family's splitter; 004 adds the sequence and users.progress_generation (a number of its own for every row) and nothing else of 001, says it is unfinished, and its gate refuses a column of another shape; 005 adds exactly the visitors' schema (no row changes; what users_kind_check lets in), 004 and 005 run again over a database with visitors, and 005's gate refuses 001's check under another name; 006's header (finished, words only: four statements, the gate last; the next change is 007); 007 (finished, the next change is 008; one DELETE and its gate: exactly the card's four keys and their strings go, nothing else - not a table of 001 -, again and again, the gate refusing a key that stays); 008; 009 (finished, the next change is 010, words only - its two temporary tables, the copies, the delete, a description, the gate; on a database as its owner left it - built through 008, an owner's rewording and somebody's string in place - every string the kit said goes under the library's key with its words, writer and time, the kept keys keep theirs, and the library's own 002 after it leaves them be; again over a later rewording, which stays; a string it could not move refused, rolled back whole); 010 to 013 likewise (013: words only, three statements - the old footer's `footer.whatsNew` gone with its strings, an owner's rewording too, `whatsNew.title`'s description told of the family's footer and its strings kept; again; its gate refusing a `footer.*` key that stays, or the description left as it was - rolled back whole); the library's words as vendor/ has them (anotoki-lib 0.7.2, to `012_footer_words.sql`).
  - `api/site` - the site's gate on the real server, state by state: not set up and never installed (every path but `/api/site-status` 503 `not_set_up` with the setup page, JSON, no-store, inside the security headers), not set up once installed (`storage/installed.lock`: never the setup page), an update waiting (503 `update_pending` + Retry-After 60 for every kind of route and every caller - a person, an ADMIN, a visitor's key, nobody -, paths that only look open held too, nothing written; the open paths answer: the sign-in settings, the words - with ETag -, the health check, the Migrations page's routes by the token's role; Apply makes it ready), the database out of reach (`unavailable`: nothing held, the routes' own 503 `database_unavailable`), a settings file PHP cannot run (not set up, no 500, the log names the file, the kind and the line, once), a `database.local.php` with a byte-order mark and no `<?php` line, its password in it, then one with a byte-order mark and one with a blank line before `<?php declare(strict_types=1);` (no answer carries the password or PHP's words - the status, the pages, the setup page -, not set up, never a 500, no warning or fatal error in the log, its start said once; mutation-checked: with a plain `require` the status begins with the whole file), ready. In every one `GET /api/site-status` answers 200 `{state, installed}` to anybody (`askers()`: nobody while the IAM requires a sign-in, a visitor's key, a token that does not verify, one that ran out, a Basic header) - also with the IAM's switch off and with the IAM out of reach: the pages read it before anybody can be signed in, and a 401 or a 500 there would have them say "not available right now". And the error log by the library's rule (0.5.0, no exclusion of this app's): `not_set_up` and `update_pending` never a line, the database out of reach's `503 database_unavailable` a line (mutation-checked: `expected => []` and a blanket exclusion of 503s each fail it).
  - `unit/visitors` - the counted address as committed (behind Cloudflare: an edge's CF-Connecting-IP, v4 and v6, an edge written as IPv6; anybody else's header the caller's word, a list no address); the header pinned (X-Real-IP, True-Client-IP, X-Forwarded-For, X-Client-IP, Forwarded from an edge never believed, nor when an older setting names one - passed over, said in the log); as visitors.local.php names the proxies (none, ranges of its own, a bare address; a catch-all - 0.0.0.0/0, ::/0, wider than /8 or /16 - or no range at all refused and said); an IPv6 /64; a keyed hash kept (64 hex, one per bucket, another installation another key), never the address; the origin secret (cloudflare.local.php: none - as before; a secret but no X-Anotoki-Origin, or a wrong one - the edge, twenty made-up visitors one bucket; the right one - the visitor; the right one from outside the ranges - the connection; only a string with something in it a secret; every file there that yields none FAILS CLOSED - a secret no request carries, the attack run on each case (a forged CF-Connecting-IP from Cloudflare's ranges, the file's own value carried or not, is the edge for this app's limits and the library's), nothing printed, said once by its kind and line, its start, its bytes or that it holds no origin_secret, never the text or the value: a file that cannot be read cleanly - no `<?php` line, a byte-order mark, a line before it, a byte-order mark or a blank line before `declare(strict_types=1)` (never compiled), text after a closing tag, a buffer left open, a ParseError, an Error -, a file read cleanly that names none (since 2026-10-18) - an empty value, only spaces, a number, a list, null, true, a misspelt key, the key in capitals, another key, no array, nothing returned, its first line alone, null returned -, a folder in its place; mended, read again; deleting the file the one way off); visitors.local.php and its limits (an unreadable file: the defaults), the key, the 30 days equal in the frontend, visitorMake() only inside a transaction, usersEnsure() a person's only, peopleDelete() only inside the library's transaction, the work after the answer. (`unit/config` holds `CLIENT_ADDRESS_TRUSTED_PROXIES` equal to the library's Cloudflare list, each range taken, and no setting of a header.) Mutation-checked: the catch-all taken, the header read from a setting.
  - `api/visitors` - two servers (one with small limits) with sign-in off: nobody's state, the first save of each kind makes a visitor (the key once, only its hash stored, nowhere in a log), a failed first save makes nobody and counts nothing, the visitor's own documents and generation (0 is a second tab's 409), unknown and malformed keys, a Bearer header never falling back to the key, isolation, no own file or admin panel, sign-in required again (the key not looked up), seen at most hourly, the limits (per address, /64, X-Forwarded-For, a list in the header, in all, at once, rounds, document size), only a keyed hash of an address in `visitor_starts` (each server its own key - `counted_as()`), with the origin secret a third server where made-up CF-Connecting-IPs without X-Anotoki-Origin (or with a wrong one) are one sender - the proxy - for the visitors' limit and the pages' reports alike, and the right secret a visitor of their own; a fourth server whose cloudflare.local.php has a byte-order mark before `<?php declare(strict_types=1);` and the secret - a 500 on every request with the five-byte check taken out - and a fifth whose file is read cleanly with the secret under a misspelt key (the attack such a file would let in: made-up CF-Connecting-IPs, even carrying the file's own value, all the edge - the third new visitor refused, the reports' limit tripped -, the log saying so once and never the secret, the site ready), a whole progress fits, the sweep (30 days, every child table, batches, SKIP LOCKED, the marker, at once after a new visitor, a failing sweep never failing the request), a database without 005 (every round held at the gate, nobody made; `visitorsMustBeReady()` still 503 `visitors_unavailable` under it - a process of its own), requireUser()/requireRole() refusing a visitor however stacked. Mutation-checked.
  - `api/admin-tools` - the library's admin tools as wired here: the day's backup; the error log (a 404's line, never its query, an address or a token) and the pages' own errors (`POST /api/client-errors`: written redacted by who met it, 415 / 413 / 422 / a forged token 401 writing nothing, 20 an hour from one sender - a person by their account apart - the counts keyed hashes); feedback (who from the token alone, the reply address only as the form sends it, "without my name", the honeypot, five an hour from one sender - a visitor by address, a person by account -, the admin side, a delete audited with its time and transaction); the audit log by name; backups (the proof, sealed, "By" a name, a single-use download, a restore with the before-restore backup and a new generation for every row - the tab of before 409); a restore doing again every People delete and feedback delete since its backup, on its own connection, at once - and none of before it (mutation-checked: the hook on `db()` hangs the restore and fails it); a backup without this installation's seal refused (422 `archive_invalid`); the scrub (and again after a restore, the IAM out of reach said and retried); last, a restore with visitors in the database - failing on anotoki-lib 0.5.0 (the gotcha "visitor_ids").
  - `api/visitor_move` - the move at sign-in: the person's note byte for byte, the visitor's others, a step both have merged (a pass never lost: best max, attempts added, the earlier pass, the newer last try; fields only the visitor has), every round with its id / key / time, the visitor gone and its key 401 `visitor_unknown`, a new generation (an old tab 409); again `found: false`; an empty account; rounds alone keep the generation; a colliding round dropped and the person's retry of a moved one stored once; merged notes / path over BODY_LIMIT not made; no token 401, no or a malformed key 422; the switch on; another person untouched; a row held past `move_lock_timeout_ms` 503 `visitor_move_retry`; the person's row gone 401. Mutation-checked.
  - `unit/transfer` - an export into an account (the file's userId not read), refusals (not_an_export / invalid_export, versions), export/import round trip, replacing (never a mix, nobody else touched, a new generation each time), a move, `tools/progress.php` (--user required, --replace, --move, no --owner).
  - `api/me` - one's own file: the export (download headers, nobody else's), a round trip, the dry run, the replace rule, every refusal with a code and a sentence, the size limit both ways (an export just under EXPORT_LIMIT comes back whole; over it is never handed out); the generation: 428 without, two tabs side by side never refuse each other, a tab of before an import or an ADMIN's delete gets 409 and nothing comes back; an import holding the users row while a save and a second import wait (two servers: php -S answers one request at a time).
  - `api/api` - the progress routes through the router as a learner (`api()` sends the generation a fresh load gives): 401s (no token, expired, another issuer, "Bearer ", Basic - nothing written), the answers, `{}` round trips, shape checks (400/413/415), session whitelist and bounds, Idempotency-Key, order, 404/405, no CORS, the built app's files and SPA fallback, not set up (the setup page named while never installed; the status says so), a database behind (503 `update_pending`, POST /api/sessions too; nothing written to find out).
  - `api/auth` - tests-signed tokens: 401s, every bad token, users row, two people isolated; a whole sign-in through the stand-in IAM (PKCE, MEMBER / EDITOR / ADMIN, refresh, deny, the ID token refused); an old settings file opens nothing; the JWKS downloaded and cached; the IAM's switch relayed (off, garbage, out of reach), the stand-in's public route, and the switch read from the stand-in (kept a minute, fetches counted in its `log`, the last answer while it is down and logged once, 404 and nothing read = required, a signed-in request never asks); the stand-in's preferences (none at first - no claim, a save 503 -, then the claim in the tokens, the SDK's save: the preflight, a cross-origin answer, only what it names changed, a language into the next token, 400 for what it does not take, 401 for no token / not one / another's key, 503 when refusing).
  - `api/admin` - every admin route role by role (nobody / a bad token 401, learner / MEMBER / no roles claim 403 in that group's words, EDITOR through the staff group only, ADMIN through all); People (counts, order, a visitor counted on its own line and never listed or deleted, one person deleted whole - their imports row too - nobody else touched, the string they reworded kept by nobody, 404, deleting oneself); the Migrations page's routes in the family's shapes (the list with ISO UTC times, a file's SQL - 404 for anything that is no file of the set -, Apply; the Database page's old addresses 404) and on a database behind (everything else 503 `update_pending`; an EDITOR 403 and nobody 401 in the site's own words; 409 busy and `php migration.php` refused under the lock; then applied and ready), a failed update named and logged.
  - `api/setup` - the local setup: exactly the family's fields and defaults, nonce, Origin, Test connection's sentences (DB and IAM), Save under the lock, auth.local.php exactly three keys, a re-save over an old file, a relayed or foreign-named request is a real host showing nothing saved, a settings file PHP cannot run (the page opens and names it, Save writes it anew).
  - `api/hosting` - `tools/build.php` (exact contents - the family's library in, the old engine and gates out -, refusals), the web root's `.htaccess` read as Apache reads it (every PHP file refused but `setup.php` and `host-check.php`, by their exact names; the host check never in a build, its token empty in the repository, a path that is no file the app's route), the host setup (token, tests, install, lock, self-delete, re-upload refused; installed: the status `ready`/`installed`, and with the settings gone `not_set_up` without the setup page), a re-run for an update (nothing saved shown, an owner or file sent along ignored), the front controller.
  - `unit/translations` - the seeded languages and keys, English and Slovak for every key, placeholders, plural families, the migrations of this work touching only their three tables and nobody's progress, 002 refusing a non-UTF8 database, every seeded string - this app's and the library's - passing the library's checks of a save, a string migration's gate (009's own tables admitted), the library's set after this app's own and its keys `anotoki.*`, the kept English (and `KEPT_LIBRARY_ENGLISH`) equal to the database's, the key scan as this app sets the library's up (used and unused keys, families, dynamic keys, never a spec's helper, the vendored SDK, the kept English or `anotoki.*`).
  - `api/translations` - the library's routes on this app: the bundle (ETag/304, unknown codes, no token looked at), the IAM's wire format both ways (snake_case answers; a camelCase body is no language), the staff's routes and ADMIN's role by role (an editor rewords, imports and exports, and is refused the languages; a learner, no roles, nobody refused), languages (added, renamed, reordered, switched off; deleted - 200 `{strings}`, never en or sk), saves checked whole, export/import (unknown keys refused), the CLI, concurrent deletes and saves, `updated_by` following a person, before any string (`translations_unavailable`), only 001 applied (the words not there yet - no table asked for -, the admin routes the gate's, nobody looked up).
- **Frontend** (`cd frontend && npm test`, Vitest + jsdom): theory, srs, path (incl. songs vs pools), songs, the API outbox (HttpTestingController), the store's save chain and retries, boot states, stats, the sequence player (wait and tempo, keys handed to `feedback`); and with the words: the family's `TranslationService` as this app wires it (`site-translations.ts`, in the start's, the title's and the kit's specs), the pipes, `path-words`, the title strategy, the language chooser, the shell with no bundle (no text of a key's shape), `MidiService`, the home, lesson, steps and trainer pages (a language switch mid-step re-words the feedback), the admin pages (all the family's, tested in the library - their routes, lazy, behind `adminGuard`, and the guard for unsaved changes as wired here; People, the admin tools and the feedback form as wired in `core/site-admin.spec.ts`), the browser's errors (`core/error-report.spec.ts`: the family's reporter is the ErrorHandler `appConfig` gives - asked of its own injector, mutation-checked -, a person's report with the token through the family's interceptor, scrubbed, a visitor's bare - no key -, never a failed request's, never the same twice), the admin layout per role (the feedback's count asked for an ADMIN), the routes and the family's guards as wired (`app.routes.spec.ts` - `/` and an unknown address, each legal page its own path in its frame, no guard, before the catch-all; `core/auth/site-auth.spec.ts`: the settings, the visitors' paths, the failure's route, no hint; the split, the routes loading the family's pages); while the site is not ready (2026-10-07, `app.component.spec`, `boot.service.spec`, `top-bar.component.spec`): a visitor and a signed-in learner read "The site is being updated" in their language (Slovak too) with no error, no code, no setup or Migrations link, a Sign in only for nobody, and no note of the shell's; an ADMIN reads "A database update is waiting" and its "Open Migrations" reaches the page; a signed-out ADMIN's Sign in goes to the IAM with this address and comes back to the Migrations page; the page stays as the app starts after an Apply; no page made behind the status page (the gate's marked template) - an update that comes in the middle of practising takes the page away (fails on content given as it is), a waiting start makes none, nor when the status page finds the site back (0.2.0's `checkForReload()`: the gate stays shut until the reload), nor while a waiting start resumes after an Apply (mutation-checked: `pageShown` true while waiting); the setup page only while never installed (installed, or the database out of reach: "not available right now"); the start waits (sign-in and strings, no move, no state - also for an update that came after the site was asked) and resumes after an Apply, the strings asked again; the bar's sections gone while it waits, Migrations alone for an ADMIN in /admin; the generation on every save and no save without one (`api.service.me.spec.ts`), a 409 settled by loading again and the other tabs' marker (`progress-store`), a reload in the middle of a round sends none of the old notes (`progress-store`, `trainer-page` with the real store) and an answer during a reload waits for it, a 428 kept as a failed save, the own progress file's flow and every code (`own-progress`), the top bar (`top-bar`, the family's bar told Piano's: the row in the family's order, the sections lit, the menus' keys - Tab and Shift+Tab from the first, a middle and the last item onto the menu button -, the phone's menu, "Not saved yet" - the pill, the phone's dot named for a screen reader, the menus' first line -, the person's menu and the way into the admin panel only while the site is ready, the admin panel in English with the family's wordmark - "Piano" and "admin panel" on a phone -, the sign-out question - settled first, asked only when something would be lost, the no first -, no empty phone menu before the app runs, every control's name holding its words), the theme switch (`app.component.spec`: its choices named in Piano's words, the one in force kept for the next first paint), the signed-out banner and the family's failure screen saying why a sign-in did not work, in this app's words (`app.component`), the family's footer (`app.component`: "Version 0.4.0 · What's new · Feedback" in the build analyzer's order, Feedback alone with no list of changes and never a stray dot, Terms · Privacy · Contact in the same landmark; its feedback form - the library's dialog named "Feedback", its code fetched by the press, the focus back on Feedback after Cancel), the status page alone in every closed state (not set up, installed and not set up, the database out of reach, an update waiting for nobody, a learner, an ADMIN, mid-visit - on any address: no bar, no section, no note, no footer, the gate's own `<main>` the one landmark; the frame back once the site is ready; an ADMIN's Migrations page in the frame, Migrations alone in the bar - mutation-checked: the bar put back outside the gate fails four tests), the piano's widget (`midi-panel`: its box the family's popover - a named group, Escape, a click outside and the focus leaving close it; the state the family's alert, said politely; the devices by their own names in the family's select - none asked yet, none found, a choice picks the device), the family's kit wired to Piano (`core/family-kit.spec.ts`: its words the database's strings of the library's keys - the owner's wording -, English in the admin panel, the kit's own where the database has none - never a key -, this app's English for the theme switch with no bundle; the language chooser on Piano's languages; the theme switch on the family's `ThemeService` with Piano's key and colours), the admin panel in English (the library's `effectiveLanguage`). Visitors (stage D): `visitor-key.spec` (the first key stays, compare-and-delete, the storage event, memory when storage refuses, `active`), `api.service.visitor.spec` with the family's interceptor (decided as issued, both ways; a person's request with no token never sent - the round kept in the outbox; the key only on a visitor's; remembered from a maker's answer; `visitor_unknown` forgets, `sign_in_required` keeps it and calls `noteSignInRequired()`; the move carries both; generation 0 only on a visitor's page; one maker for a progress PUT, a path PUT and a round at once; a failed maker; 429 and its Retry-After; 413 / 422 `visitorRefusal`; a person's calls refused on a visitor's page; `moveVisitor`; `adoptOutbox`) - `loginRequired` and the guards are the library's, tested there -, `boot.service.spec` (a visitor with no key / a key / a key gone / sign-in required meanwhile; the move before the state - found, not found, 503 waited out once, kept on failure, 422 forgotten, mid-session; the visitor's outbox at a signed-in start), `progress-store.spec` (a visitor's 413 held back, a 429 after its Retry-After; the 409 after `lost` says no "changed elsewhere"). Stage E: `app.component.spec` (every visitor note and the moved / kept / not-moved notes in the kept English - the no-bundle sweep and "nothing kept is a leftover" cover them; the notice on `/` and `/stats` only; no signed-out banner for a visitor; a refused sign-in worded and closable; a person whose sign-in ended gets none of the visitor's notes), `stats-page.component.spec` (the progress file for somebody signed in, the sign-in line for a visitor), `site-admin.spec` (the People page's visitors line), `top-bar.component.spec` (Sign in offered to a visitor, in the row and the phone's menu). Mutation-checked: the null-token request sent, no single flight, the gate falling to a visitor, the key forgotten on `sign_in_required`, the 413 retried, no outbox adoption, the move after the state, a visitor let into `/admin`, the signed-out banner shown to a visitor, "changed elsewhere" after `lost`. The account's preferences (2026-10-06; the theme's own rules - one save at a time, the latest last, no flick, a refusal put back - are the family's `ThemeService`'s since 2026-10-08, tested in the library): `family-kit.spec` (the device's theme for nobody - nothing saved; the account's from the first moment; a choice saved; a refusal puts the account's back and says so under the switch in Piano's words, gone at a click elsewhere), `pipes.spec` (each order for a day, a moment's halves, the 12- and 24-hour clocks in English and Slovak, nobody signed in or nothing chosen as before, the stamp - the server's numbers kept across a DST gap - and the patterns), the language's own rules (the save to the account, the family's order, a refusal, an account change followed) are the library's `TranslationService`'s since 0.3.0, tested there; `family-kit.spec`'s chooser (saved once the page switched, not when the strings could not be had, a re-pick the account lacks saved, the note in the page's language, silence for a language the IAM lacks, back to the page's language chosen while another is on its way), the `stats-page` spec (its times in the account's order and clock; the family's People and Migrations pages take the same `localDateText(..., 'stamp')`). Mutation-checked: the account adopted while a save is out, no revert, no note, no queue (the theme - on Piano's own service then - and the language), a save without an account, `invalid_request` said, the re-pick not saved, a save before the switch, the server's clock moved to the reader's zone, a moment's one chosen half ignored, a session that ended still choosing, the note kept after a click elsewhere; and the language order: the device before the account, an account change not taking the place of this page's choice, followed while a save is out, followed over `?lang=`, followed over a stored choice without preferences, a switch not saved. What's new (the family's dialog, drawn once the footer's What's new is pressed - its heading, the newest marked Latest, each list named by a badge, its Close: `app.component.spec`; `changelog.service.spec`, 2026-10-07): the shipped `public/changelog.json` read as a file - every version MAJOR.MINOR.PATCH, newest first, the newest `package.json`'s version (mutation-checked: a "0.4" fails both); the footer's version the newest entry's, neither it nor What's new when the list does not come. A spec gives its strings with the library's `provideTestTranslations()` (`@anotoki/lib/translations/testing`; `provideSiteTranslations()` beside it for this app's storage keys and account), jsdom what the family's components need with `provideTestKit()`, and reads the family's question with `drawTestQuestions()`.
- **Browser**: the committed check, skill `check-in-browser` (`node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep] [--measure]`, `PHP=` the 8.2+ binary): `playwright-core` in `<temp>/pw` (never in `frontend/`) + headless Edge, the stand-in IAM on 8597 and the built app on 8590 (`SITE_PORT` / `IAM_PORT` when another check holds them), `piano_test_browser_<port>`; everything stopped and dropped at the end. It checks a deep link signed out -> the IAM -> back (no call for a learner's data before the IAM); the family's bar at 360 / 390 / 1280 / PHONE_BAR_MAX / +1 / 1440 / NAME_BAR_MIN, light and dark, English and Slovak, by bounding boxes; every bar control's name holding the words it shows; the menus on top of the page, their contents, keys and real Tab / Shift+Tab presses (the focus on the menu button); the piano's box; "Not saved yet" (a save made to fail); the own progress file and three stale tabs (Stats; the Note Trainer mid-round in the same browser and in another - a note played after the import, a 409 in the other, and the imported notes still on the server); the EDITOR / ADMIN split and the admin panel in English; every learner page in Slovak with no key-shaped text, and a refused sign-in (no menu button at 390); Terms, Privacy and Contact with nobody signed in (no trip to the IAM, no call for a learner's data) at 1280 and 390, light and dark, English and Slovak - the headings and the tabs' titles, the footer's links with the open page's marked, the anotoki account's Privacy and account pages at the stand-in IAM, what is kept and stored by name, every link the code's, Contact's feedback form, Sign in alone in the folded bar's menu - and signed in, from Stats' footer, with an unknown address going to Learn; the family's footer under a learner's page (1280 and 390, light and dark, English and Slovak) and in the admin panel (English with Slovak chosen): "Version 0.4.0 · What's new · Feedback" in the library's words, Terms · Privacy · Contact under it, the build analyzer's look by computed style (a 1px top border, 1.25rem 1rem 1.5rem, 13 px, centred, as wide as the window, under the page), its What's new opening the app's dialog with the focus back on it; and, with the stand-in's `login_required` false (the app keeps its answer one second there: `testenv.php --application-ttl=1`), a visitor: Learn without the IAM and its notice, a lesson's meet and drill whose first save is held at the network so the drill's notes, path and round meet it - exactly one save without a key and ONE visitor row -, the progress after a reload, Stats' sign-in line, another browser empty, `/admin` to the IAM, then a sign-in as a person who has note 60: moved and kept said, her C byte for byte, the visitor's steps and round hers, the key and the visitor gone; in Slovak at 360 / 390 the notice wrapping, the phone's menu, a visitor deleted under the page (`visitor.lost`, the next 409 without "changed elsewhere", a new visitor after); sign-in required again mid-visit (`visitor.signInNow`, the key and the visitor kept, a new browser sent to the IAM, the sign-in moving it); and the account's preferences, with the stand-in's `preferences` set (the real SDK 1.2.0 against the stand-in's endpoint): the account's dark over this browser's light at sign-in (kept for the first paint), Stats' rounds and What's new in the account's order and clock, the theme switch saving to the account, another tab following, a refusal at 390 (the account's theme back, the note inside the screen and on top, gone at a click elsewhere), Slovak chosen in the bar becoming the account's language and another tab following it, a fresh browser that remembered Slovak reading the account's English, and an ADMIN's admin panel in the account's dark with People's and Migrations' times in its order and clock; a database behind the code (005 off the record): the family's status page for a visitor and a learner ("The site is being updated", no error, nothing asked that fails, nobody sent to the IAM; in Slovak at 390), alone - no bar, no footer, one `<main>` - at 1280 and 390, light and dark, English and Slovak, Sign in from it coming back to the address, the ADMIN's "A database update is waiting" -> the family's Migrations page in the frame (the bar with Migrations alone, the footer; a failed Apply with what PostgreSQL said, then "Up to date" and the app resumed in place), and the learner's page coming back by itself; and not set up, alone too (the setup page only while never installed - "not available right now" once `installed.lock` is there -, Try again once set up). Look at its screenshots (`--keep`), then delete the kept folder: its settings hold the database password.
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

The stand-in IAM (the family's): make a key
(`php -r 'require "vendor/autoload.php"; \Anotoki\Lib\Auth\Testing\TestIam::create($argv[1], $argv[2], "piano-academy", "manual");' <dir> http://127.0.0.1:8597`),
run `STAND_IN_DIR=<dir> STAND_IN_ISSUER=http://127.0.0.1:8597 php -S 127.0.0.1:8597 vendor/anotoki/lib/backend/testing/stand-in-iam.php`
(`testenv.php --issuer=` for another address; the browser check's `run.mjs` does both). `POST /_test/state`
sets who signs in (`user`: `{id, username, roles, locale?, preferences?}` - `roles` `["MEMBER", "ADMIN"]`,
`["MEMBER", "EDITOR"]` or `["MEMBER"]` for a learner, `locale` is the token's claim, `en` by default), the
token lifetime (`ttl`), what it says about the app at `GET /api/public/applications/{id}`
(`login_required`, default true; `application_missing` - a 404) and failures (`down` - every
endpoint but the key set 503, `refuse`, `deny` + `deny_description` - which the app never
shows: it words `access_denied` itself), the accounts it deleted (`anonymized: [{sub,
anonymized_at}]`) and any answer at all for a path (`answers`). Its `log` lists the requests it got. The app keeps
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
- A visitor is taken for anybody only by `requireOwner()` (and the move reads the key beside a token, `routes/visitor.php`); a new per-person route that a visitor may use takes `requireOwner()`, any other `requireUser()` / `requireRole()` (which refuse a visitor); a new table of a person's data goes into `STORE_PERSON_TABLES`; a new migration's descriptions pass 004's and 005's gates when they run again.
- A save of a whole document checks the generation inside its transaction (`storeRequireGeneration()`); anything that replaces or deletes a person's progress takes their users row first (`storeLockGeneration()`) and starts a new generation (`storeNewGeneration()`) - or deletes the users row.
- Code the library calls inside its own transaction - the People delete, a restore's hooks - works on the `$pdo` it is given (the db* helpers take it last), never `db()`, and begins, commits or rolls back nothing.
- Nothing keeps an address: what is counted per address is `clientAddressKey()` (a keyed hash - a pseudonym while the installation's key lasts, never called anonymous); where a request comes from is `clientAddress()` (the family's rule: CF-Connecting-IP alone, pinned, from Cloudflare's ranges - no setting names another header, and no catch-all range is taken; the origin secret, `originSecret()`, passed to every reading of an address - `clientAddress()`, `adminContext()` - and never printed or logged).
- Every admin route is inside a group of `api/routes/admin.php` that has `requireRole()` (staff or ADMIN) or `adminByToken()` (ADMIN, recording nobody); a present-but-bad token is a 401 everywhere; nothing reads a setting to decide who somebody is. The admin tools are ADMIN's alone, never EDITOR's.
- A new learner route is under the `''` route with `canActivateChild: [personOrVisitorGuard]` (a visitor's too); a new admin page under `admin` (`staffGuard`, and the family's `adminGuard` when it is ADMIN's); the admin pages stay English.
- A new API call goes through `ApiService.request()` and is a person's (`asPerson`) unless it is one of a visitor's four (state, progress, path, sessions - the backend's `requireOwner()` routes); nothing decides person or visitor from whether a token is there as a request leaves. (The requests of the app's that do not: the family's error reporter, `core/error-report.ts` - the library's, through the app's HttpClient; the family's interceptor decides it as it is handed over, by who the page is shown as: a person's with the token, else bare, never with a visitor's key - and the family's feedback form's message, which the form marks anybody's itself (`issuedAs('anybody')`, anotoki-lib 0.7.2): the person's while somebody is signed in, nobody's otherwise.)
- A learner never sees the server's sentence: a failed call is worded from its code, by a key.
- A new session field or mode is in `SESSION_FIELDS` / `SESSION_MODES` and `SessionInput`.
- A schema change is a new migration; `setup.php` still parses under PHP 7.4.
- Anything "per day" uses local dates.
- A date or time a page writes goes through the `localDate` pipe (the account's order and clock for somebody signed in); a control that changes the theme or the language saves a signed-in person's choice through `AnotokiAuth.savePreferences()` - only while `preferences` is not null, one save at a time, the latest last, a refusal said by a key.
- UI text short and plain; a learner-visible change has a changelog line (a new release: an entry on top, its version MAJOR.MINOR.PATCH, `package.json`'s the same).
- A learner-facing word is a key with English and informal Slovak ("ty") in a migration; state holds keys, never sentences.
- Nothing worded is awaited in a MIDI handler.
- Note names, song titles and device names are never translated.
- A new shell string is also in `kept-english.ts`; a key put together at run time has its prefix and tails in `dynamic-keys.ts`.
- The top bar's words are keys (in kept-english.ts too) but for the admin panel's own (English literals); a word the family's kit says is the library's key (`anotoki.*`, worded in the database - a new site wording of one goes in a migration as 009 did, never a mapping in code); a change to its row is measured again (`run.mjs --measure`) and PHONE_BAR_MAX changed in `top-bar.component.ts` (the bar's `phoneMax`; no .scss copy); the browser check passes and its screenshots are looked at.
- `php tests/run.php` (PHP 8.5), `npm test`, `npm run build` and `bun run format:check` (at the root) pass; interactive changes checked in a browser on a throwaway database; `setup.php` still parses under PHP 7.4.

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
