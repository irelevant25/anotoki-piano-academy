# anotoki · Piano Academy

Browser piano tutor for a KAWAI ES120 (any USB-MIDI keyboard): Web MIDI in the
browser, a Duolingo-style **learning path** (phases -> units -> steps: meet,
drill, read, play in time, song; 80% to pass), with Note Trainer, Sheet
Practice, Songs and Stats as free practice. Every person's progress is kept in
PostgreSQL under their anotoki IAM user id.

| Part | Folder | Stack |
| --- | --- | --- |
| Backend | `backend/` | PHP 8.2+, Slim 4, PostgreSQL |
| Frontend | `frontend/` | Angular 21, standalone + zoneless, signals; VexFlow 5.0.0 (npm) ([frontend/README.md](frontend/README.md)) |
| Knowledge base | `docs/`, `.claude/` | architecture, API, decisions; the skill and the agent |

Dev addresses: frontend `http://localhost:4500` (`ng serve`, proxying `/api` and
`/setup.php`), backend `:8300` (`composer start` in `backend/`), the IAM
`http://localhost:4300` (repo `../anotoki-iam`: `backend/` on 8100, `frontend/`
on 4300). Sign in at `http://localhost:4500`: that is the address the IAM
knows for `piano-academy` (`127.0.0.1` does not sign in).

**Under way (2026-10-04): the anotoki family made one way** - the IAM only,
roles ADMIN / EDITOR, each person's own export and import, one top bar. The
backend is done: sign-in, roles, setup and layout (stage 1); each person's
export and import, the progress generation, the People routes and migration
004's schema part (stage 2). The frontend is in step (stage 3): sign-in on
every page, the admin panel under `/admin`, the own progress file on Stats,
saves that name the generation, the sign-out question, and 004's strings for
them. The family's one top bar is in (stage 4: `shared/top-bar`), 004 is
finished with its strings, and the version is 0.2. Stage 5 reviewed it all
and fixed what it found (a round no longer keeps its own copy of the
progress; the bar's names hold the words they show; a 428 is a failed save). Then, at the owner's request, the
family's Migrations page (the IAM's) took the Database page's place, also
while the database is behind, and the area is "Admin panel" wherever it is
named. **004 is applied in the owner's database** (2026-10-05) and frozen:
a later change is a new migration (on the host: upload, apply at once, then
the IAM's migrations). `docs/README.md` says the same.

**Under way (2026-10-05): sign-in per site, MEMBER for everyone, visitors.**
Stage A (the switch) is in: the vendored IAM SDK 1.1.0, `authLoginRequired()`
relayed as `loginRequired` by `/api/auth/config`, only Bearer counting as a
sign-in, MEMBER an ordinary learner, the stand-in IAM's public route. Stage B
(the visitors' backend) is in: migration **005** (written whole and final,
2026-10-05 - the owner applies it at the hand-over, after a `pg_dump`, never
before: until then the owner's dev site says "needs an update"), visitors as
`users` rows with a negative id and a key's hash (`api/visitors.php`),
`requireOwner()` on the progress routes, the limits and the sweep, People's
visitors line. Stage C (the move at sign-in) is in: `POST /api/visitor/move`
(`api/routes/visitor.php`, `visitorMove()`) with the token and the key.
Stage D (the frontend's core) is in: `AuthService.loginRequired`,
`shared/auth/visitor-key.ts`, who a request is decided as `ApiService` issues
it (`ISSUED_AS`), one "maker", the move before the state, the visitor's
outbox taken on at every signed-in start, the guards (a visitor on the
learner pages, never on `/admin`). Stage E (the visitor's words) is in: the
shell's notes for a visitor (the notice on Learn and Stats, sign-in required
meanwhile, a progress ended, a save refused, a refused sign-in) and after a
sign-in (moved / kept / not moved), Stats' sign-in line in place of the
progress file, People's visitors line, the browser check's visitor tours
and a line in 0.2's What's new. Next: the review (F).

**2026-10-06: the theme, the dates and the clock are the anotoki account's**
(the IAM's migration 015, its browser SDK 1.2.0 - vendored; the owner's
decision, `docs/decisions.md`). Followed for somebody signed in - the whole
site, the admin panel too; the bar's theme button and language chooser save
a signed-in person's choice to the account, and the account's language
comes before this device's choice (the family's order). Migration **006** (two
sentences: a choice the account would not take) is written whole and final
and goes with 005 at the hand-over. It goes out as version 0.3 (its line in
What's new).

**2026-10-07: one way while the site is not ready - the anotoki family's
library** (`anotoki-lib` 0.1.0, the owner's request, `docs/decisions.md`;
both halves from GitHub: `anotoki/lib` in `backend/composer.json` and the
committed `vendor/`, `@anotoki/lib` as the release's tarball in
`frontend/package.json`, `bun.lock` and `package-lock.json`). Its engine
(`Migrator`) applies the migrations everywhere; its gate (`SiteGate`) stands
in front of every route; its pages (`<anotoki-site-gate>`, the status page,
`<anotoki-migrations-page>`) replace the app's "not set up yet" card and its
own Migrations page. Migration **007** (words only: the card's four
`boot.notSetUp.*` keys deleted) is written whole and final and goes with 005
and 006 at the hand-over.

**2026-10-07, later: `@anotoki/lib` 0.1.1, and versions of three numbers.**
The library's Angular half is 0.1.1 (its PHP half stays 0.1.0: 0.1.1 changed
nothing there). `<anotoki-site-gate>` takes the shell's view as a template
and makes it only while the site is open, so no page runs behind the status
page - also when an update comes in the middle of practising, which the
shell's own `@if (pageShown())` (0.1.0 made the gate's content whether it
showed or not) never covered; `pageShown()` stays for the start's cards and
the one outlet of an ADMIN's Migrations page. The versions are
MAJOR.MINOR.PATCH (the owner's rule: big changes / new features / bug
fixes): What's new's entries were renamed 0.1.0 ... 0.4.0 (nothing else
changed), `frontend/package.json` says 0.4.0, and a spec holds the two equal.

**2026-10-08 to 11: the anotoki family's kit - `@anotoki/lib` 0.2.0** (its
PHP half stays 0.1.0: 0.2.0 changed nothing there; the owner's decisions,
`docs/decisions.md`). The top bar is the family's `<anotoki-top-bar>`
(`shared/top-bar` wraps it with Piano's brand, sections, person and menu
items, "Not saved yet" and the piano as its widgets, the phone's dot and
the menus' note), with the family's segmented theme switch (light / dark /
as the device is set) in the round button's place - its row is wider, so
`PHONE_BAR_MAX` is 1320. The brand, icons, spinner, language chooser,
menus, the piano's popover, the questions (`ConfirmService`), `ThemeService`
and `theme-boot.js` are the family's too (`shared/family-kit.ts`); the kit's
words are this app's strings where it has them (`core/i18n/kit-words.ts`).
A site overrides the family's colours only (the owner's rule): Piano keeps
its palette (`anotoki.root()` in `styles.scss`) and takes the family's
corners, shadows, font (Manrope) and the look of the family's pieces;
`styles.scss` writes two of the family's own values - the small shadow, the
dark mark's halo - as plain values until the library's 0.3.0 (0.2.0 writes
those one-item lists as no CSS). Its pages, keyboard, notation, What's new
and its own buttons stay its own for now (they move onto the kit's
components in a later phase), their element rules kept off the family's
components. The gate's
template is marked (`anotokiSitePages`), the Migrations page is 0.2.0's
(`@anotoki/lib/migrations/page`). Migration **008** (words only: the round
button's three spoken keys deleted, four descriptions reworded) is written
whole and final and goes with 005, 006 and 007 at the hand-over. In What's
new's 0.4.0 (unreleased): the font, the look and the three-way switch.

**2026-10-11: the words through the family's library - `anotoki-lib` 0.3.0**
(both halves; the owner's decisions, `docs/decisions.md`). The words' three
tables stay as they are, and one implementation reads and writes them for
every anotoki site: the PHP half's `Anotoki\Lib\Translations`
(`api/translations.php` wires it: the bundle, the admin panel's routes behind
this app's own role checks, `tools/translations.php` - the library's command,
same name and flags) with its migration set `anotoki_translations` (after
this app's own: its 001 proves the tables' shape, its 002 adds the library's
54 words, `anotoki.*`), and the Angular half's `@anotoki/lib/translations`
(`TranslationService`, the pipes, the kit's words and the bar's language
chooser, the status page's words, the guard) and `/admin` (the Translations
and Languages pages), wired in `shared/i18n/site-translations.ts`. The wire
format is the IAM's, snake_case (`native_name`, `sort_order`). The kit's
words are the library's keys now: migration **009** copies this app's
strings of the 17 keys the kit said (`core/i18n/kit-words.ts`, gone) under
`anotoki.*` - every language, the owner's wording, who saved each and when -
and deletes the 15 only the kit asked for; it goes with 005 to 008 at the
hand-over, the library's two files right after it in the same Apply. Every
kit piece comes from its own entry point, the kit's class names are its own
(`anotoki-top-bar__person-button`...), and `styles.scss`'s plain-value
shadows are gone (0.3.0 writes them). The Stats page is lazy now (the first
load 482.7 kB, under its 500 kB budget), and the status page reads in the
page's own language - English on an admin address - with the database's
words in it. No line in What's new: a learner sees nothing new (the admin
pages are the staff's).

**2026-10-11, later: signing in, the people and the admin tools through the
family's library - `anotoki-lib` 0.4.1** (both halves; the owner's decisions,
`docs/decisions.md`). Signing in is the library's auth module: the PHP half's
`Anotoki\Lib\Auth` (`api/auth.php`, `api/meddleware/auth.php`: `identify()`
once in front of every route but the public ones, and this app's
`requireUser()`, `requireRole()`, `requireOwner()`, `adminByToken()` stacking
the library's checks) and `@anotoki/lib/auth` (`shared/auth/site-auth.ts`:
AnotokiAuth, its interceptor, its guards, its callback page and its screen
for a sign-in that did not work, `/sign-in-failed`, in this app's frame) -
the vendored IAM SDKs, `AuthService`, the interceptor, the guards, the
sign-in card and the stand-in `tests/tools/fake-iam.php` are gone (the
family's stand-in is `vendor/anotoki/lib/backend/testing/stand-in-iam.php`). No
sign-in by the IAM's hint here (`hint: false`: genshin's and the build
analyzer's). The people are the library's People module (`api/people.php`:
the table, the counts, the delete; `@anotoki/lib/people/page` on
`/admin/people`; the scrub of the accounts the IAM deleted, after an answer,
at most hourly). The admin tools are the library's, for the site's ADMIN
alone (`api/admin_tools.php`): the error log, the audit log (every admin
change, a person deleted, a progress file brought in), feedback (the
visitors' form from the footer, `ui/feedback-dialog`; no mail - the bar's
"Feedback" says how many are new; a signed-in sender's account address is
the reply address unless they tick "Send it without my name" - the owner's
decision: their choice; since 0.5.0 the address the form sends, below) and
backups (daily after the day's first answer,
before every update, by hand; a sign-in of the last ten minutes for each
made, downloaded, deleted or restored; no maximum age - the owner's
decision: one made by hand stays until the owner deletes it, a deleted
person's data with it, and a restore brings it back until the library's
0.5.0, below; not encrypted - only the IAM's are; before a restore answers, every
progress takes a new generation and the scrub runs again). The People
delete takes the person's feedback address too. The pages' own errors come to the error log with
the library's 0.5.0 (below).
Its sets run first and last
(`migrationSets()`: `anotoki_admin`, this app's, `anotoki_translations`,
`anotoki_people`). Migration **010** adds `users.anonymized_at`, **011** moves
the sign-in card's three failure sentences under the library's keys
(`anotoki.signIn.*`, every language, the owner's wording, who and when) and
deletes the card's five keys; both go with 005 to 009 at the hand-over. In
What's new's 0.4.0: Send feedback, and the sign-in failure's page. The first
load is 519 kB (the library's sign-in module is bigger than the SDK and
services it replaces) - over its 500 kB warning: the owner's call.

**2026-10-11, later still: Piano's own pages on the family's kit**
(`anotoki-lib` 0.4.1, no version change; the owner's decisions of 2026-10-07,
`docs/decisions.md`). Every button is the kit's `anotokiButton`, every card
`<anotoki-card>`, the notes under the bar, the review's reminder, the piano's
state and the progress file's warning and refusals `<anotoki-alert>`, "Coming
soon", "Latest", "Not saved yet" and What's new's lists `<anotoki-badge>`, the
tempo and the MIDI device `<anotoki-select>` (the piano's in a `@defer (on
idle)`: the kit's fields are a lazy entry point the bar's first load must not
carry), What's new `<anotoki-dialog>`, "Working…" the spinner, "Could not
load your progress" `<anotoki-error-state>`, Stats' table the family's table
styles (`.table-stack`: a small card a round on a phone) and its empty list
`<anotoki-empty-state>` (with the piano's icon). `styles.scss` takes
the family's base, utilities and tables and keeps only the palette and
Piano's own colours: `.btn-primary`, `.btn-large`, `.card`, `.chip`, `.tag`,
`.grid`, `.controls-row` and the global button / select rules
(`$piano-own`) are gone, and so are the old colour names (`--panel`,
`--accent`...: the components say `--anotoki-*`). Piano's own, from the
tokens: the path (the Continue card, the phases' heads, the units, the step
chips), a lesson's step dots and result, the practice screens
(`sites/main/features/_practice.scss`), the figures in tiles (`pages/_stat-tiles.scss`),
the keyboard, the staff, the piano's button, What's new's releases. Piano's
light green is a shade darker (`#187a4b`): its words now read AA. One line in
What's new's 0.4.0; no words, no migration. The first load is 535 kB (the
kit's alert, card, badge and error state on the first page, the base and
utilities: +16 kB), under angular.json's 550 kB warning.

**2026-10-12: the family's library 0.5.0 - `anotoki-lib` 0.5.0** (both
halves; the owner's decisions of 2026-10-11 for every site,
`docs/decisions.md`). A restore no longer brings back what was deleted:
inside its transaction, before anybody sees its rows, the library does again
every People delete and feedback delete the audit log holds from the
backup's time on (`People::replay()`, with this app's `peopleDeleteHook()`),
then every progress takes a new generation (`storeRenewGenerationsAfterRestore()`,
inside the restore too - not the library's `then:`, after the commit and the
scrub, when a tab of before could still save over what was restored; the
sequence's gap is gone: a restore never moves a sequence back), and once it
committed the scrub of the IAM's deleted accounts runs (`People::afterRestore()`);
`backupsRestoreHooks()` in `api/admin_tools.php`, `peopleScrubAfterRestore()`
gone. The People delete (`peopleDelete($pdo, $id)`) does ALL its work on the
connection the library hands it, inside the library's transaction - which
forgets the person's feedback and writes `person.data_deleted` in it, by its
transaction id - and begins none of its own (`db()` would wait on a
restore's locks). The pages' own errors go to the error log: the library's
reporter (`shared/error-report.ts`, `provideSiteErrorReport()` beside
`provideBrowserGlobalErrorListeners()`) posts them through the app's
HttpClient to `POST /api/client-errors` (`ErrorLogRoutes::client`, behind
the gate and `identify()`; 20 an hour from one sender, 500 a day from the
visitors and as many from the people). Where a request comes from is the
library's one rule (`Support\ClientAddress`): Cloudflare's published ranges
are committed as the trusted proxies (`CLIENT_ADDRESS_TRUSTED_PROXIES` in
`config/config.php`; `visitors.local.php` may name others or none, never a
catch-all - a range wider than /8 or /16 is refused), CF-Connecting-IP -
pinned in code, no setting names another - believed only from them, one
address (a list is none), and `adminContext()` gives the library the same
list and header; `visitor_starts` keeps a keyed hash of the bucket
(`clientAddressKey()`: a stable pseudonym while the installation's key
lasts), never the address itself. Feedback's
reply address is the one the form sends (the form writes the account's in;
the server fills none in), a signed-in sender counted by their account.
Backups name their maker (`adminContext()`'s `names`), and a plain backup is
sealed under `storage/anotoki-lib.key`: only a backup made here is restored
here - the ones made before 0.5.0 are restored offline only (DEV.md). The
admin routes' own name lookups gave way to the context's. The error log
keeps the library's rule - a state (`update_pending`, `not_set_up`) never a
line, a 503 that is a failure a line (`tests/api/site.test.php`). No line in
What's new; no migration. The first load is 533.5 kB (the sign-in's screens left
it; the reporter came in).

**2026-10-13: the origin secret - `anotoki-lib` PHP 0.5.2** (Angular stays
0.5.0; the owner's decision of 2026-10-13, `docs/decisions.md`). Cloudflare's
ranges are every Cloudflare customer's: anybody's Worker can connect from them
and write the CF-Connecting-IP it likes, a new address every time. A Transform
Rule of the owner's zone adds `X-Anotoki-Origin` with a secret to every
request; the app keeps the same value in the optional
`config/cloudflare.local.php` (`['origin_secret' => ...]`, `originSecret()` in
`config/config.php` - never written or read by setup, never printed or
logged) and believes CF-Connecting-IP only on a request that carries it -
`clientAddress()` and `adminContext()` (`originSecret:`) both pass it; any
other request from Cloudflare counts as its edge, coarser, never looser.
Without the file, as before. No line in What's new; no migration.

**2026-10-18: Terms, Privacy and Contact - `anotoki-lib` 0.6.1** (both
halves; the round-3 pass of every anotoki site, `docs/decisions.md`). The
family's legal pages (`@anotoki/lib/legal/pages`) on lazy routes of their
own - `/terms`, `/privacy`, `/contact`, each its own path with the frame
(`sites/main/legal/legal-layout`) as its parent, before the learner's routes and the
catch-all (`app.routes.spec.ts` holds `/` and an unknown address) - for
anybody: no guard, never a trip to the IAM; the shell shows them while
nobody is signed in, and the bar offers Sign in there. The root
configuration (`provideAnotokiLegal(pianoLegalConfig)`,
`shared/legal/legal.config.ts`: the page's language, the database's words) is
in the first load, Piano's facts (`sites/main/legal/legal-facts.ts`) come with the
frame. **The facts are true of the code as it is**: a change to what the app
keeps, or for how long, changes their `legal.*` strings (by a migration) and
`PIANO_LEGAL_UPDATED`. The operator is the library's default (Code Hero
s.r.o., support@anotoki.eu, Slovakia); the account is the anotoki account's
(its Privacy page and its account page at the IAM's address the app signs
in with); Contact opens the feedback form; every address and every stored
item's name is the code's, never a string. The footer has the family's
Terms · Privacy · Contact (`<anotoki-legal-links>`). The kit's new pieces
replace Piano's own: the path's step chips (`button[anotokiChip]`), the
Continue card (`tone="highlight"`), the figures on Stats and in the Note
Trainer (`<anotoki-stat-tiles>`; `pages/_stat-tiles.scss` is gone), a
lesson's step dots (`<anotoki-step-dots>`), Stats' number columns
(`.cell-num` under `.table-stack`); every select comes from
`@anotoki/lib/ui/select`. Kept: the piano's select in its `@defer (on idle)`
(the first load's budget), the meet step's count of plays (a count, not
steps), the path's phase heads and units. What's new's code loads when it
opens, so the first load stays under its 550 kB warning: 549.4 kB (533.5
before). **A `config/cloudflare.local.php` that is there but cannot be read
cleanly fails closed** (the IAM's rule): it prints anything (no `<?php`
line, a byte-order mark or a line before it, text after a closing tag), PHP
cannot parse or run it, or may not open it - a secret no request carries,
so every request from Cloudflare's ranges counts as its edge, the app
running on; one read cleanly that names no secret is none; each said in
PHP's error log at most once a day, by its kind and line or the bytes it
printed, never its text (`settingsFileReadCleanly()`, `settingsSaid()`;
`tests/unit/visitors.test.php`, and the attack in `tests/api/visitors.test.php`).
**Every settings file is read through that guard** - `database.local.php`
(the password), `auth.local.php`, `visitors.local.php` too, as the IAM reads
its own: whatever a file prints (a byte-order mark, no `<?php` line, text
after a closing tag) is caught and never sent, the file passed over - a
database or auth file then leaves the site not set up (never a 500, never
its text), a visitors file the defaults; said once a day by its kind and
line or its bytes, never what PHP said (`tests/api/site.test.php` holds the
attack: a byte-order-marked database file with no `<?php` line - no answer
carries its password, the status included).
Migration **012** adds the legal pages' 43 keys (English and informal
Slovak), rewords `brand.area`'s description and deletes the unreachable
`whatsNew.notLoaded` (What's new opens only from the version, which shows
once the list is loaded); the library's translations 005 to 010 (257
`anotoki.*` words now) run after it in the same Apply. In What's new's
0.4.0: Terms, Privacy and Contact at the foot of every page.

**2026-10-18, later: a settings file is never compiled unless it starts
with `<?php`, and `anotoki-lib` 0.6.2** (both halves; Japanese Academy's
review found it, the family's rule since - `docs/decisions.md`). A
`*.local.php` saved with a byte-order mark or a blank line before
`<?php declare(strict_types=1);` is a compile-time fatal error that no
handler and no output buffer catches: every request, the site's status
too, was a 500 instead of "not set up", and a broken `cloudflare.local.php`
never failed closed. `settingsFileReadCleanly()` now reads a file's first
five bytes and passes it over, uncompiled, unless they are `<?php` (any
case) - "does not start with <?php", said by that fault alone, never the
text (`tests/unit/config.test.php` and `unit/visitors.test.php` write both
starts for each kind of file; through the server `api/site.test.php` the
database's and `api/visitors.test.php` Cloudflare's). The library's 0.6.2
rewords three Privacy sentences (its translations 011, which keeps a
site's own words - Piano words two of the three itself, the backups and
the sign-in's storage; 011 runs after 012 in the same Apply, 005 to 011
now). No line in What's new (0.4.0 already has the legal pages); no
migration of Piano's.

**2026-10-18, after the deploy: the anotoki sites' one footer, the status
page alone - `anotoki-lib` 0.6.3** (both halves; the owner's choices of
2026-10-18, `docs/decisions.md`). The foot of every page, the admin panel's
too, is the family's footer (`<anotoki-site-footer>`, `@anotoki/lib/footer`,
the build analyzer's): a top border, "Version 0.4.0 · What's new ·
Feedback" - the version and What's new once `changelog.json` came (its
newest entry the version: one source), What's new opening Piano's own
dialog on `(whatsNew)`, Feedback the family's form in the kit's dialog,
which the footer loads with the press - then Terms · Privacy · Contact; its
words the library's (`anotoki.footer.*`). Piano's own footer,
`ui/feedback-dialog` and its one word (`footer.whatsNew`, migration **013**,
which also tells `whatsNew.title`'s description of the new footer) are
gone. **The gate is the outermost of the shell**: the bar, the notes, the
page's `<main>` and the footer are its marked template, so while the site is
not ready the family's status page stands alone in the gate's own `<main>` -
no bar, no footer (the owner's rule); an ADMIN's Migrations page has the
frame. **The feedback form's message says whom it is for**: the person's
while somebody is signed in, nobody's otherwise - the server takes
anybody's (an interceptor of Piano's said it then; since `anotoki-lib` 0.7.2
the form says it itself, `issuedAs('anybody')`, and the interceptor is
gone). **A present
`config/cloudflare.local.php` without a usable secret
fails closed** (the owner's "do as you think is the best"; the build
analyzer's and the survey's rule too): one read cleanly that names none -
blank, no array, a misspelt or another key, a value that is not a string -,
a folder in its place, as one that cannot be read cleanly: a secret no
request carries; only deleting the file switches the secret off. The web
root's `.htaccess` lets the host check run (`host-check.php`, by its exact
name, while it is there). The library's translations 012 (the footer's
words, 261 `anotoki.*` keys) runs after 013 in the same Apply. In What's
new's 0.4.0: the footer, and "Feedback". The first load is 558.1 kB
(549.4 before), under its warning, which the owner raised from 550 kB to
575 kB the same day.

## Always, before any work here

1. Load the **`piano-learning-app` skill** (`.claude/skills/piano-learning-app/SKILL.md`):
   the architecture, the learning-path design and roadmap, conventions, gotchas,
   and how to test without a piano. For delegated work use the **`piano-dev`**
   agent (`.claude/agents/piano-dev.md`), which loads it too.
2. `README.md` is what the app is; `DEV.md` how to set it up, run, test,
   build and deploy it; `docs/` how it works and why (`docs/README.md`);
   `backend/README.md` and `frontend/README.md` each part's layout, commands
   and tests.
3. To deploy, release or roll back: the **`deploy-piano`** skill
   (`.claude/skills/deploy-piano/SKILL.md`) - anotoki-deploy, a release of
   `frontend/` and `backend/` replaced whole beside the host's `config/` and
   `storage/`.

## Always, after a change

Walk the skill's review checklist, run the tests (below) - and the browser
check (skill `check-in-browser`) for anything a page shows - then keep the
knowledge base in step - part of finishing the task: the skill, this file (if
the essentials changed), `.claude/agents/piano-dev.md`, `docs/` (the pages
the change makes wrong), `README.md` ("Current state"), `DEV.md` (commands),
`backend/README.md`, `frontend/README.md`, and `frontend/public/changelog.json` (a line in plain
words for anything a learner would notice; a new release is a new entry on
top whose version has three numbers - MAJOR.MINOR.PATCH: big changes / new
features / bug fixes - and `frontend/package.json`'s version line the same).

## Essentials

- **Sign-in is the anotoki IAM, and nothing else, through the family's
  library** (`anotoki-lib`'s auth module): OIDC code + PKCE in the
  browser, RS256 access tokens verified by the backend with
  `Anotoki\Lib\Auth` (`iamClient()`, `accessTokens()`, `signInRule()` in
  `api/auth.php`). Who a request is comes only from a verified token (the
  library's `Identify`, once in front of every route but `publicPaths()`:
  `identify()` in `api/meddleware/auth.php`) - never a body, an address, a
  header of the app's own or a setting. Only the Bearer scheme is a sign-in
  (`Basic ...`, from a host behind a password file, counts as no header). No
  token: 401 `sign_in_required`; a Bearer header whose token does not check
  out (one with no token too): 401 `invalid_token` on every route that reads
  one, never anything else - in this app's error shape `{error, code}`
  (`authRefused()`). No configured owner. **Whether sign-in is required is
  the IAM's switch** for `piano-academy`: `signInRule()` (the library's
  `SignInRule`, kept a minute in `cache_dir`, one asking at a time, true -
  required - whenever nothing better is known), relayed as `login_required`
  by `GET /api/auth/config` (the library's `AuthRoutes::config()`: `{issuer,
  client_id, login_required, sign_in_available}`); no test ever asks a real
  IAM (`application_file` and `anonymized_file`, or the family's stand-in -
  `tests/lib.php` `test_offline_auth()`). While it is on, every learner route
  requires a token. While it is off, somebody who has not signed in is a
  **visitor** (`api/visitors.php`, migration 005): a `users` row with a
  negative id (never an IAM id), no name and no role, made by their first
  save (never a page view) in that save's own transaction, and found again by
  a random key the server hands out once (`X-Visitor-Key`; only its SHA-256
  is kept). The library's `Identify` finds the key's visitor
  (`visitorFound()`), and only `requireOwner()` (`api/meddleware/auth.php`:
  the library's `RequireCaller`) takes a visitor for anybody, on the progress
  routes - and the move at sign-in (`POST /api/visitor/move`,
  behind `requireUser()`, whatever the switch: the person's notes stay where
  both have one, a path step both have is merged so a pass is never lost,
  the visitor's other notes, steps and rounds come, then the visitor goes):
  a Bearer header is that person or 401 (the
  key not even read), sign-in required is 401 `sign_in_required` (the key not
  looked up), and `requireUser()` / `requireRole()` refuse a visitor however
  they are stacked - no own progress file, no admin panel. Limits per address
  (the family's rule, `api/client_address.php`: Cloudflare's published
  ranges committed as the trusted proxies - `CLIENT_ADDRESS_TRUSTED_PROXIES`
  -, their CF-Connecting-IP alone believed - pinned, never X-Real-IP,
  True-Client-IP or X-Forwarded-For - and, with the origin secret
  (`config/cloudflare.local.php`, optional, by hand), only on a request that
  carries it in `X-Anotoki-Origin` (any other from Cloudflare counts as its
  edge; a file there that yields no usable secret - one that cannot be read
  cleanly, or names none - is a secret no request carries: fails closed,
  said once a day, never its text; only deleting the file switches the
  secret off), an IPv6 /64 as one; `visitor_starts`
  keeps a keyed hash of it, a pseudonym, never the address itself), in all
  and per visitor (`config/visitors.local.php`, optional, never written by
  setup - it may name other proxies, or none, never a catch-all); visitors
  unseen 30 days are swept after somebody's answer. **In the browser, who a
  request is is decided when it is issued** (`ApiService`, from the page's
  data owner - a person's id or `VISITOR_OWNER` - carried in the `ISSUED_AS`
  HttpContext token), never from whether a token is there when it leaves: a
  person's request with no token is never sent (401 `sign_in_required`
  locally - never a visitor's, never a maker); the key
  (`shared/auth/visitor-key.ts`, localStorage) goes only on a visitor's
  request, on the progress routes alone (`VISITOR_PREFIXES`), and only while
  no sign-in is required; it is KEPT while one is (only 401 `visitor_unknown`
  forgets it, compare-and-delete); the move is the one request with both
  (`CARRIES_VISITOR_KEY`). The family's `anotokiAuthInterceptor` sends the
  token or the key (`ISSUED_AS` and `CARRIES_VISITOR_KEY` are the library's
  context tokens; the first save that makes a visitor goes alone in
  `ApiService`, whose waiting saves write their generation once it is back).
  **Every page signs in first** - but for a visitor while the IAM requires no
  sign-in, and the legal pages (`/terms`, `/privacy`, `/contact`, and About
  and Support, `/about`, `/support`: anybody's,
  no guard, never a trip to the IAM): the family's guards (`@anotoki/lib/auth`, `app.routes.ts`, `sites/main/main.routes.ts`, `sites/admin/admin.routes.ts`) -
  `personOrVisitorGuard` on the learner pages, `staffGuard` on `/admin`
  (never a visitor's), `adminGuard` on its ADMIN pages (anybody else signed
  in goes to the start page); anybody else signed out is sent to the IAM and
  back to the page; a sign-in that came back refused or cancelled, could not
  start or cannot be set up goes to the family's screen that says why
  (`/sign-in-failed`, `SignInFailureComponent` under the bar - Try again,
  Back; its words `anotoki.signIn.*`, this app's three sentences there by
  011) instead of round to the IAM. One that cannot start in the middle of
  practising is worded in the signed-out banner under the top bar, in the
  screen's words - for a visitor (who gets no signed-out banner) in a note of
  its own, the same words; a visitor's refused sign-in stays on their page.
  No sign-in by the IAM's hint (`hint: false` - the owner's: genshin and the
  build analyzer only). A
  visitor's notes are the shell's (`app.component`; the keys in
  `shared/i18n/visitor-words.ts`, migration 005's, in `kept-english.ts` too).
  The boot card "could not load" draws without a sign-in, and so does the
  family's status page while the site is not ready (below).
- **The theme, the dates, the clock and the language are the anotoki
  account's** for somebody signed in (`AnotokiAuth.preferences`: the
  token's `preferences` claim; null for nobody, a visitor, or an IAM before
  its 015 - then the app keeps its own settings and saves nothing). The family's `ThemeService` (`@anotoki/lib/shell`, wired in
  `shared/family-kit.ts`) shows the account's theme everywhere (taken at
  sign-in and whenever it changes, never while its own save is out) and the
  bar's theme switch saves a choice (`AnotokiAuth.savePreferences()`: one at
  a time, the latest last; refused, the account's theme back and
  `theme.notSaved`); the `localDate` pipe follows the account's date order and
  clock (`stamp` for the admin panel's People, Migrations and admin tools -
  the family's pages take it as their `formatDate`, `localDateText()`);
  the language chooser (the family's) saves a signed-in person's choice
  (the family's `TranslationService.setLanguage()`, its `account.save`
  `AnotokiAuth.savePreferences()` - `shared/i18n/site-translations.ts`: a language the
  IAM does not offer stays the site's own for the visit, silently; another
  refusal, `access_denied` too, is `anotoki.language.notSaved`). **Which language**
  (the family's order, the survey's the reference): signed in with
  preferences, this tab's `?lang=` and a choice made on the page this visit,
  then the account's `locale` (when the site has it), then this device's
  remembered choice, the browser's, English; a change of the account's
  language made elsewhere is followed when it comes - not over `?lang=`, not
  while a choice made here is on its way to the account. Signed out, or no
  preferences: `?lang=`, this device's choice, the token's `locale`, the
  browser's, as before. `piano-academy:theme` still keeps the theme on the
  screen for the family's `theme-boot.js` (`index.html`'s `data-storage-key`).
  Visitors: each device's own, as before.
- **Roles, from the token, checked on route groups**: a signed-in person with
  no role but **MEMBER** (every account holds it, in every application; no
  check needs it or refuses it) learns with their own progress - taking
  someone's MEMBER away in the IAM refuses their next sign-in and refresh,
  while the access token they hold verifies until it runs out (minutes);
  **EDITOR** also rewords the app's
  words; **ADMIN** also adds / changes / deletes languages, applies database
  updates, sees and deletes people's data (`/api/admin/people`) and has the
  admin tools - the error log (the server's failures and the pages' own
  errors), the audit log, feedback, backups (EDITORs see
  none of them: the owner's decision). `ROLE_ADMIN`, `ROLE_EDITOR`,
  `ROLES_STAFF`; `requireRole(...ROLES_STAFF)` / `requireRole(ROLE_ADMIN)` /
  `adminByToken()` on a whole Slim group in `api/routes/admin.php`
  (`/api/admin/...`), so a route added later cannot forget it; 403
  `forbidden` in this app's words (the library's groups guard themselves
  too). The frontend only hides what the server refuses anyway: the admin
  panel is `/admin` (English; Translations for `isStaff`, Languages / People
  / Feedback / Error log / Audit log / Backups / Migrations for `isAdmin` via
  the family's `adminGuard`; "Admin panel" in the person's menu, as on every
  anotoki site). People's delete asks its question alone (no recent sign-in)
  and is audited (`person.data_deleted`, inside the delete's own
  transaction); a restore of an older backup does it again.
- **Settings are required and never committed**: `backend/config/database.local.php`
  and `auth.local.php` (`issuer`, `client_id`, `cache_dir`; gitignored). Any
  other key is passed over, so an old file with `mode` / `local_user_id`
  still works (and signs in through the IAM). **Every `*.local.php` is read
  cleanly or not at all** (`settingsFileReadCleanly()` in
  `config/config.php`; the IAM's rule): a file that does not start with
  `<?php` - a byte-order mark, a blank line or a space before it, no `<?php`
  line (the password with it) - is passed over before PHP ever compiles it,
  its first five bytes read alone (with `declare(strict_types=1)` after such
  a start PHP could not even compile it: a fatal error nothing catches,
  every request a 500); what one that does start so prints as PHP reads it -
  text after a closing tag - is caught and never sent, and a file that
  prints, or that PHP cannot parse, run or open, is passed over - said once
  a day by its kind and line, its start or its bytes, never its text.
  **Where the site stands is the
  family's** (`anotoki/lib`; `siteState()` in `api/migrations.php`, the
  `SiteGate` in front of every route, `GET /api/site-status` for the pages -
  always 200 `{state, installed}`, to anybody: nothing may stand in front of
  it, no token, key or role check, since the pages ask it before anybody can
  be signed in and read a 401 or a 500 there as "not available right now"):
  without the settings (or with one that cannot be read cleanly) every path is `503 {code: "not_set_up", installed,
  message}` - `setup: "/setup.php"` only while `storage/installed.lock` is not
  there (a real host's install writes it; once installed the setup page is
  never offered again); a migration waiting is `503 {code:
  "update_pending"}` (`Retry-After: 60`) everywhere but `siteOpenPaths()` -
  `/api/auth/config`, `/api/translations/{code}` (the library's
  `TranslationsRoutes::openPath()`), `/api/health`,
  `/api/admin/migrations...` - so somebody can sign in, the pages have their
  words and an ADMIN reaches Apply. In the browser `<anotoki-site-gate>` -
  the outermost of the shell, its whole frame (the bar, the notes, the
  page's `<main>`, the footer) the marked template (`<ng-template
  anotokiSitePages>`), made only while the gate shows it, so no page runs
  behind it - draws the status page alone then, in its own `<main>` with no
  bar and no footer (the owner's rule of 2026-10-18; an ADMIN's Migrations
  page keeps the frame): "The site is being updated" for visitors and learners
  (their language, a quiet Sign in for nobody, a reload once the site is
  back), "A database update is waiting" for the site's ADMIN, who has the
  admin panel's **Migrations** page (`/admin/migrations`, the family's
  `<anotoki-migrations-page>` from `@anotoki/lib/migrations/page`: Pending,
  Applied with each file's SQL, "Apply pending") - the one page that runs;
  `BootService` waits (`waiting`: the sign-in and the words, no state, no
  move), the sign-in guard sends nobody to the IAM, and an Apply that leaves
  nothing to apply resumes the start in place (`resumeAfterUpdate()`). The web
  **`backend/setup.php`** writes them, asking for the database and the IAM
  only - on this computer (no token, a CSRF nonce, re-runnable, saved values
  shown) and on a real host (token + lock + self-delete, nothing saved shown).
  Setup's Save, `php migration.php`, an administrator's Apply
  (`POST /api/admin/migrations/apply`) and the tests' builders use the
  family's `Migrator` (`databaseMigrator()`) and take one advisory lock
  (`DATABASE_UPDATE_LOCK`). Never print the database password; never copy
  it anywhere git would publish.
- **The owner's database is `anotoki_piano_academy`** (their IAM user id is 1;
  new setups default to `anotoki_piano`, port 5432). Never run a test, an
  experiment or a manual server against it: use a throwaway `piano_test_*`
  database (`tests/tools/testenv.php`, `PIANO_TEST_CONFIG`, honoured only for
  `piano_test_` names). Back it up with `pg_dump` before any migration. A
  new migration is written whole and final in one go (the owner's dev site
  reads the folder) and the owner applies it at the hand-over, never before.
- **The domain logic lives in the frontend's services** (`frontend/src/app/shared/music/`:
  theory, srs, songs, path). The browser computes every SRS and path change and
  saves whole documents; the backend checks shapes and stores. Never copy that
  logic into a component or into PHP.
- **A save of a whole document names the generation of the progress**
  (`Progress-Generation`, from `GET /api/state`): only an import, an
  administrator's delete or a visitor's move at sign-in (notes or steps
  added) starts a new one, and a save to an old one is
  `409 progress_changed` - nothing saved; the page loads the progress again,
  never sends the old documents again (`ProgressStore`; it says why, and a
  tab that imported tells the person's other tabs through localStorage). The
  frontend never sends a save without a generation (no 428 from it; a 428 is
  kept as a failed save, "Not saved yet"). Nobody's state (a visitor without
  a key) is generation 0, which only the save that makes the visitor names -
  one such "maker" at a time (`ApiService`), the others wait for its key and
  generation. **No page keeps a copy of the
  progress**: an answer goes in through `ProgressStore.updateNote(midi,
  change)`, which applies `change` to the note as the store holds it now -
  a round's own copy, saved whole after a reload, would write the old
  progress back under the new generation. Anything new that replaces or deletes a
  person's progress takes their users row (`storeLockGeneration()`) and starts a
  new generation (`storeNewGeneration()`). Each person exports and imports their
  own progress (`/api/me/export`, `/api/me/import`: replacing only when asked,
  never merging; `EXPORT_LIMIT` both ways).
- **Angular components are three files** (`.ts`, `.html`, `.scss`) - never an
  inline template or styles. Standalone, OnPush, signals, zoneless. Where the
  family's kit has a piece (`@anotoki/lib`: a button, a card - the
  highlighted one too -, an alert, a badge, a chip, a field, a select, a
  dialog, the spinner, an error state, stat tiles, step dots, the table
  styles and their number columns, the bar, a menu, a popover, a question,
  an icon, the legal pages and links, the footer) it is the family's, as the family
  draws it - a site gives its colours, never its own look to a kit
  component; what the kit lacks and is Piano's alone (the path's phases and
  units, the practice screens, the meet step's count of plays, the keyboard,
  the staff, the piano's button) is built from the tokens. No global rule
  for buttons, selects or cards. Colours are
  the family's tokens (`--anotoki-*`) in Piano's palette (`anotoki.root()`)
  and Piano's own (`--key-*`, `--notation-*`); the font the family's
  Manrope, the type its base (`anotoki.base`).
- **One top bar, the anotoki family's** (`<anotoki-top-bar>`, wrapped by
  `shared/top-bar`): the brand, the five sections (Learn, Note Trainer,
  Sheet Practice, Songs, Stats), "Not saved yet" and the piano
  (`shared/ui/midi-panel`) as its widgets, the language, the theme switch (light /
  dark / as the device is set), the person's menu (their anotoki account,
  "Admin panel" for the staff while the site is ready, Sign out - which
  waits for the saves and asks when progress would be lost). Up to
  `PHONE_BAR_MAX` (1320 px, measured with the real labels - the browser
  check's `--measure`; the bar takes it as `phoneMax`) it is a phone's:
  "Piano" (`brand.short`) and one menu button, "Not saved yet" a dot on it
  (named for a screen reader) and the first line of both menus. Its menus'
  keys are the family's (Tab and Shift+Tab close the menu onto its button).
  Every control's accessible name holds the words it shows (WCAG 2.5.3,
  label in name: "Language: {name} ({code})", the piano's "{label}:
  {status}", "anotoki Piano Academy: Learn"). Under `/admin` it has the
  admin sections and the family's wordmark, short at every width ("Piano"
  with "admin panel" under it; "anotoki Piano Academy · admin panel" the
  link's name), folding up to its own `ADMIN_PHONE_BAR_MAX` (1280, measured
  the same way: eight sections and a two-digit count need 1255 px), in
  English (`TranslationService.effectiveLanguage`), with no chooser and no
  piano, and "Back to Piano Academy"; an ADMIN's "Feedback" there carries
  how many messages are new (the family's `FeedbackUnread`).
  **One footer, the anotoki family's** (`<anotoki-site-footer>`,
  `@anotoki/lib/footer` - the build analyzer's, the owner's choice of
  2026-10-18), under every page and the admin panel's: a top border,
  "v0.4.0 · What's new · Feedback" (a screen reader hears "Version 0.4.0";
  the version and What's new once
  `changelog.json` came - its newest entry the version, one source; What's
  new opens Piano's own dialog, `shared/ui/changelog-dialog`, on `(whatsNew)`, in a
  `@defer`; Feedback the family's form in the kit's dialog, whose code the
  footer loads with the press - its message the person's while somebody is
  signed in, nobody's otherwise: the form says it is anybody's itself,
  `issuedAs('anybody')`, as the server takes anybody's), then About ·
  Support · Terms · Privacy · Contact (the open page's marked); its words the library's
  (`anotoki.footer.*`; English in the admin panel). Never round the status
  page.
- **Terms, Privacy and Contact are the family's pages with Piano's facts**
  (`@anotoki/lib/legal/pages`, lazy; `sites/main/legal/legal-facts.ts`, given by
  the frame `sites/main/legal/legal-layout`): each page a path of its own with the
  frame as its parent, before the catch-all, no guard. The facts are true of
  the code as it is - its tables and how long each keeps what, the storage
  by name, Umami, the hosting company (WebSupport s.r.o., named by the owner
  on 2026-10-18) and Cloudflare; a
  change to what the app keeps, or for how long, changes the `legal.*`
  strings by a migration and `PIANO_LEGAL_UPDATED`. Every address a page
  links to (the anotoki account's pages at the IAM's address, the operator,
  Cloudflare) is the code's, never a string: a rewording changes words,
  never where a link goes (`legal-facts.spec.ts`). **About and Support**
  (anotoki-lib 0.8.0, `@anotoki/lib/legal/about`, `/support` - the same on
  every anotoki site) are `/about` and `/support`, in the same frame and the
  same way (`isLegalPage()` knows them); their tabs' titles are the library's
  headings (`anotoki.about.title`, `anotoki.support.title` - the app's name
  alone while no bundle is in memory).
- **PHP**: `declare(strict_types=1)`, camelCase functions by area (`store*`,
  `transfer*`, `auth*`, `translation*`, `language*`, `database*`...), `?`
  parameters in every query, every query **on a person's data** scoped to the
  request's user id (which only ever comes from the verified token - or, for
  a visitor, from the key `requireOwner()` looked up: a negative id, the same
  isolation; People lists and deletes people only). The
  site's strings are the exception: public to read (`GET /api/translations/{code}`),
  the staff's to write (`/api/admin/...`). `setup.php` stays parseable by
  PHP 7.4 (it must be able to say "PHP is too old"); the rest needs 8.2.
- **The app's words live in the database** (`languages`, `translation_keys`,
  `translations`; migrations 002 to 013, then the library's set
  `anotoki_translations`) and are edited in the browser, on the admin panel's
  Translations and Languages pages (the family's, from
  `@anotoki/lib/translations/admin`; English, not translated; EDITOR rewords,
  ADMIN also keeps the languages). One implementation for every anotoki site,
  the library's (`Anotoki\Lib\Translations`, wired in `api/translations.php`;
  `@anotoki/lib/translations`, wired in `shared/i18n/site-translations.ts`); one
  wire format, the IAM's (snake_case). The permissions stay this app's: the
  strings' routes for `ROLES_STAFF`, the languages' for `ROLE_ADMIN`, on the
  route groups. English and Slovak, English the fallback key by key; **Slovak
  is informal ("ty")**. A page asks by key (the `translate` / `translatePlural`
  pipes, `TranslationService`), and a key with no string **shows the key on
  purpose**. A new or reworded string is a new migration with the key, its
  English and its Slovak (003's layout - a test reads the file); state and
  stored sessions hold keys and ids, never sentences. The shell's English is
  also kept in code (`shared/i18n/kept-english.ts`) for when there is no bundle
  at all. The family's components read the library's own keys, `anotoki.*`
  (`forKit()`): the database's string - this app's wording, which 009 copied
  there, or the owner's rewording - else the library's built-in English and
  informal Slovak (`KEPT_LIBRARY_ENGLISH`: the theme switch's "Theme: light"
  and the sign-in failure's three sentences while no bundle is in memory); a
  library key never shows as a key, and the
  key scan (the library's `KeyScanner`, set up in `tools/translation_keys.php`)
  passes `anotoki.` by. A site migration never depends on a library file and
  never counts `anotoki.*` keys. Note
  names (C D E F G A B, B in Slovak too), song titles, MIDI device names and
  the changelog's entries are never translated.
- **Migrations are the schema**: `backend/migrations/piano_academy/NNN_name.sql`,
  applied by the anotoki family's engine - `anotoki/lib`'s `Migrator`, set up
  in `api/migrations.php` (`migrationSets()`: the library's `anotoki_admin`
  first - the audit log's and feedback's tables -, this app's set, then the
  library's `anotoki_translations` and `anotoki_people` - recorded in the
  same table as `<set>/<file>`, `migrationLabel()` -, `DATABASE_UPDATE_LOCK`,
  the first runner's `migrations(name)` adopted in its `prepare` hook); the
  bookkeeping table is the one it always was. An update (setup's Save, `php
  migration.php`, an ADMIN's Apply) goes through `databaseUpdater()`: a
  backup of the database as it is first (`api/admin_tools.php`). Never edit
  an applied one. The tests build a database as it stood at some point with
  `test_migrate()` / `test_migrate_before()` (`tests/lib.php`: the files after
  the point held back as drafts, the library's words and people too unless
  the build goes to the end; its admin tools' set always) and as an installed
  one stood before 0.4 with `test_migrate_as_installed()`.
- **The family's library** (`anotoki-lib`, one version for both halves):
  0.9.2 - PHP `anotoki/lib` (`^0.9.0`, Composer's VCS repository on GitHub,
  committed in `vendor/`), Angular `@anotoki/lib` (the GitHub release's
  v0.9.2 tarball, in both lock files). Never
  from a local path. Updating: DEV.md (Prerequisites) - both halves
  together, after its CHANGELOG.md (a release that leaves a half unchanged
  may leave it where it is). Each kit piece is imported from its own entry
  point (`@anotoki/lib/ui/config`, `/ui/icon`, `/ui/dialog`, `/ui/select`,
  `/ui/chips`, `/ui/stat-tiles`, `/ui/stepper`...; never the
  `@anotoki/lib/ui` barrel, which would put the whole kit in the first load),
  and a spec reads the kit's markup by the kit's own class names
  (`anotoki-<component>__<part>`, `--<state>`). Its components take this app's colours from the
  `--anotoki-*` tokens `styles.scss` writes (`anotoki.root()`); its gate,
  the outermost of the shell, takes the shell's whole frame as the template
  marked `anotokiSitePages` (content given as it is would be made behind the
  status page too; the frame beside the gate would stand round it).
- No piano in dev: dispatch `noteon` on `window.pianoMIDI`; read the staff via
  `.vf-stavenote[data-midi]`; `window.pianoPlayer.expectedTimes` for runs in
  time. `playwright-core` with Edge (`channel: 'msedge'`) works on this
  machine; the stand-in IAM is the family's,
  `backend/vendor/anotoki/lib/backend/testing/stand-in-iam.php` (on 8597 by
  default, its key from the library's `TestIam`; `POST /_test/state` sets
  `user` - who signs in, their roles and `preferences`, the account's theme,
  dates and clock (none: an IAM before 015) -, `deny`, `login_required` /
  `application_missing` - what it says about this app -, `anonymized` - the
  accounts it deleted - and `answers`, any answer for a path).
- The user is a beginner pianist writing in non-native English: keep UI text
  and explanations plain and short.

## Commands

```
# Backend (from backend/)
composer start                            # dev API (php -S localhost:8300 router.php) + setup page (+ the built app, if built)
php tests/run.php                         # every PHP test, throwaway databases
php migration.php [--status|--dry-run]    # migrations for the configured database
php tools/progress.php --export=FILE --user=ID   # also --import=FILE --user=ID [--replace], --move=FROM --to=TO
php tools/translations.php --status       # the library's command: the keys the frontend asks for against the database's (exit 1 on a gap)
php tools/translations.php --export sk [FILE]   # also --import sk FILE: one language's strings as flat JSON
php tests/tools/testdb.php template --fresh     # rebuild the tests' template after editing an unreleased migration
# the release: cd ../frontend && bun run anotoki-deploy build / deploy --backups <folder> [--go] (DEV.md)

# Frontend (from frontend/)
npm ci && npm start                       # ng serve on :4500
npm test                                  # Vitest unit tests
npm run build                             # production -> dist/piano-academy/browser/
cd .. && bun run format:check             # Prettier on every file of both halves, at the root (bun install there first)

# The app in a browser, signed in through the stand-in IAM (from the root; PHP=<8.2+ binary>)
node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep] [--measure]
```

## Working conventions

- **Stage nothing, commit nothing** unless asked; the owner edits alongside.
  Stage exact paths, never `git add -A`.
- **Stop every server you start** (and its process tree); check the ports after.
  The owner's dev servers may run on 4200-4700 and 8000-8500 (the other
  anotoki sites, and this one's 4500 / 8300) - never stop them, never use those
  ports. Throwaway servers go on 8590-8599 (the PHP tests pick free ports of
  their own).
- Other anotoki repositories are read, not changed.
