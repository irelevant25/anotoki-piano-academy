# Decisions

Why things are the way they are. Read the reason before undoing one.

## 2026-10-13 - the origin secret (`anotoki-lib` PHP 0.5.2, Angular 0.5.0)

The owner's decision of 2026-10-13, for every anotoki site. Cloudflare's
published ranges are every Cloudflare customer's, not the owner's zone alone:
anybody's Worker can open a connection to the host from them and write a
CF-Connecting-IP of its choosing - a new address for every request, past
every limit counted per address (new visitors an hour, feedback's and the
pages' reports' senders). So a Transform Rule of the owner's zone adds a
secret header, `X-Anotoki-Origin`, to every request through it, and the app,
given the same value, believes CF-Connecting-IP only on a request that
carries it (the library's `ClientAddress::of()`, compared in constant time).
Any other request from Cloudflare counts as the edge it came from: coarser -
a Worker's made-up visitors share the edge's one bucket - never looser.

- **One setting, the same file in every site**: the optional
  `config/cloudflare.local.php` (`['origin_secret' => ...]`), read by
  `originSecret()` in `config/config.php` - put there by hand like
  `visitors.local.php`: setup neither writes nor reads it, the build never
  carries it, and it is never a reason for "not set up". Only a string with
  something in it is a secret (trimmed); anything else, or no file, is none -
  the app as before. A file PHP cannot run is said in PHP's error log by its
  line alone (what PHP said may quote the file) and passed over. The secret
  is never printed or logged.
- **Every reading of an address takes it**: `clientAddress()` (the visitors'
  limits) and `adminContext()` (`originSecret:` - feedback's limits and the
  error log's). The audit log keeps no address, so it needs none.
- **Only the PHP half changed**: the frontend stays on the 0.5.0 tarball.

## 2026-10-12 - the family's library 0.5.0 (`anotoki-lib` 0.5.0)

The library's 0.5.0 changes what a site's hooks are given and may do, so
every site takes it on purpose, both halves together. The owner's decisions
of 2026-10-11 for every site, and what they mean here:

- **A restore does not bring back what was deleted.** Inside its
  transaction, before anybody sees its rows, the library does again every
  delete the audit log holds from the backup's time on - a person's on the
  People page (with this app's own delete, `peopleDeleteHook()`) and a
  feedback message's (`People::replay()`); once it committed, the scrub of
  the IAM's deleted accounts runs at once (`People::afterRestore()`, with
  this app's runner after the answer). A delete that cannot be done again
  rolls the restore back whole. `peopleScrubAfterRestore()` and the
  hand-written afterRestore are gone; the People page's question says
  "restoring one deletes it again".
- **The new generations after a restore are made inside it.** The library
  offers `then:` for a site's own work after a restore, and suggests it for
  these; it runs after the commit and after the scrub has asked the IAM - a
  tab open since before the restore holds the generation the restored row
  has again, and in between its next save would go over what was restored.
  Inside the restore's transaction (`backupsRestoreHooks()`: the library's
  `beforeCommit`, then `storeRenewGenerationsAfterRestore()`) the restore
  still holds `users`, so that save waits and then meets the new number
  (409). A renewal that fails rolls the restore back (before, the restore
  stayed and said so). The sequence's jump of 10^12 is gone: the library's
  restore never moves a sequence back, so `nextval()` hands out no number
  an open tab holds.
- **The People delete does all its work on the connection it is handed**
  (`peopleDelete($pdo, $id)`; the db helpers take a connection last). The
  library's `People::delete()` holds the transaction - forgetting the
  person's feedback and writing `person.data_deleted` (naming its
  transaction) in it, so no delete is made without its entry; in a restore
  that connection is the restore's own, which holds every table it loaded:
  on the app's own (`db()`) a statement would wait on those locks while the
  restore waits on it, until PostgreSQL ends the restore a minute later. The
  delete begins, commits or rolls back nothing. A test holds it
  (mutation-checked: on `db()` the restore hangs and fails).
- **The pages' own errors go to the error log** (every site): the
  library's reporter is the app's ErrorHandler (`core/error-report.ts`,
  beside Angular's global listeners), sends each error - scrubbed, at most
  five a page load - through the app's HttpClient, so the family's
  interceptor gives a person's report their token and a visitor's none, to
  `POST /api/client-errors` (`ErrorLogRoutes::client()`): behind the gate and
  `identify()` like every route, twenty an hour from one sender (a person by
  account, a visitor by address bucket), 500 a day from the visitors and as
  many from the people. No CSRF header here: the API reads no cookie (who
  asks is a Bearer token), every body is JSON and there is no CORS, so
  another site's page cannot send one.
- **Real visitors' addresses through Cloudflare, and never the address
  itself kept.** The site is behind Cloudflare: its published ranges (15
  IPv4, 7 IPv6, 2026-10-11) are the trusted proxies in the committed
  `config/config.php` (`CLIENT_ADDRESS_TRUSTED_PROXIES`, held equal to the
  library's list), and CF-Connecting-IP is believed only on a connection
  from one of them. The owner's rule is that header only, from Cloudflare's
  ranges only: the header is pinned in code - no setting names another
  (X-Real-IP and True-Client-IP, which Cloudflare passes on untouched, are
  the visitor's own words; an older `client_ip_header` is passed over) -
  and `visitors.local.php` may name other ranges, or none on a computer not
  behind Cloudflare, but never a catch-all: a range wider than /8 (IPv4) or
  /16 (IPv6), 0.0.0.0/0 or ::/0, is refused, never believed, and said in the
  log. One rule, the library's `ClientAddress`, for this app's visitor
  limits and the library's own (`adminContext()` gets the same proxies and
  header): a header is one address - a list, which this app read from the
  right, is now no address and the connection counts. `visitor_starts`
  keeps a keyed hash of the bucket (`clientAddressKey()`, a key derived
  from the installation's) - before, the bucket itself; rows of before go
  within the hour. A keyed hash is a pseudonym while its key lasts, not
  anonymity: whoever holds the key can test a guessed address against it.
- **Feedback's reply address is the one the form sends.** The form writes
  a signed-in sender's account address in; they keep it, change it, clear
  it, or tick "Send it without my name" - "their choice" (2026-10-11), now
  made on the page: the server fills no address in. A signed-in sender is
  counted by their account, apart from the visitors.
- **Backups name their maker and are sealed.** The Backups page's "By" is
  this app's copy of the IAM's name (`adminContext()`'s `names`, which the
  audit log and feedback now read too). A plain backup carries an HMAC
  under this installation's key (`storage/anotoki-lib.key`), and only a
  sealed one is restored here: a file put into the folder, or changed, is
  refused. **The backups made before 0.5.0 carry no seal and are restored
  offline only** (DEV.md says how); nothing is public yet, so a new backup
  right after the update is the way. Files `0600`, folders `0700`.
- **What 0.5.0 made unnecessary is gone**: `peopleScrubAfterRestore()` and
  the hand-written afterRestore (its own sentence of what failed - the
  library's chains the causes), the generation sequence's jump after a
  restore, the delete's own forgetting of the person's feedback, the
  admin context's own address reading (`clientKey`: Cloudflare's ranges now
  go to the library), the audit log's and feedback's own name lookups (the
  context's `names`), the account's address given to feedback, and the
  address reading's right-to-left list and its configurable header
  (`client_address.php` is the library's rule, CF-Connecting-IP pinned).
  The error log never had an exclusion of this app's: the
  library's `expected` codes leave the states out (`update_pending`,
  `not_set_up`), and a 503 that is a failure (`database_unavailable`,
  `storage_unavailable`) stays in - `tests/api/site.test.php` holds both
  (mutation-checked).
- **Known, the library's to mend**: 0.5.0's restore moves each sequence on
  to the greater of the backup's next value and today's - right for one that
  counts up, wrong for `visitor_ids`, which counts down from -1: on a
  database where a visitor was ever made it asks `setval(visitor_ids, 0)`,
  out of bounds, and the restore fails whole (`500 restore_failed`, nothing
  restored). `admin-tools.test.php`'s last test holds what a restore must do,
  and fails until a release of the library mends it.
- **Nothing a learner notices**: no line in What's new, no words, no
  migration. The first load is 533.5 kB (535.4 with 0.4.1): the sign-in's
  two screens left it, the reporter came in.

## 2026-10-11, later still - Piano's own pages on the family's kit (`@anotoki/lib` 0.4.1)

Since 0.2.0 the family's kit drew the bar, its menus and the questions; the
pages kept their own buttons, cards, chips and fields "for a later phase".
This is that phase, for every anotoki site at once (the owner's decisions of
2026-10-07): the site's own UI building blocks become the kit's, its domain
pieces stay its own, built from the kit and its tokens. What that means
here:

- **One palette, Piano's colours over it - never a kit component made to
  look like Piano's.** Every button is `anotokiButton` (44 px, 50 for the
  large ones), every card `<anotoki-card>` (its corners, shadow and title),
  every note `<anotoki-alert>` (with its icon), every pill `<anotoki-badge>`,
  every select `<anotoki-select>` (the label over it), What's new
  `<anotoki-dialog>`, the load error `<anotoki-error-state>`, Stats' table the
  family's table styles - each as the kit draws it. Piano looks like itself
  by its palette, the Continue card, the path, the staff and the keyboard.
  The old names Piano's components gave the family's tokens (`--panel`,
  `--text-dim`, `--accent`...) are gone: they say `--anotoki-*`, and only
  Piano's own colours (`--key-*`, `--notation-*`, the Continue card's glow)
  keep names of Piano's.
- **Piano's light green is a shade darker** (`#187a4b`, was `#1d8a55`): as
  words and as the fill under a done unit's ✓ it read 4.4:1 on white and
  3.8:1 on the path's rows; now 5.4:1 and 4.7:1 (WCAG AA). Words in green,
  red or amber are the kit's `success-text`, `danger-text` and
  `warning-text`, never the fills; a locked unit, a locked song and a phase
  still to come say their words in the quiet grey instead of being faded
  (faded, their descriptions fell under 3:1).
- **The family's base, utilities and tables are taken** (`anotoki.base`,
  `.utilities`, `.tables` in `styles.scss`). This undoes "the base is not
  taken" of 2026-10-08: the pages were written for the browser's type then;
  they are the kit's now, which is drawn for the base (15 px type, its
  headings, no paragraph margins). The pages space their own blocks (a
  column with gaps - `.stack`, `.practice`), and the few headings of Piano's
  that should stand out (the Continue card's, a phase's, a lesson's) say
  their size in their component.
- **What stays Piano's own** - nothing like it in the kit, or nothing another
  site would use: the path (the Continue card with its blue edge and glow,
  the phases' heads, the units, the step chips - a step is a small button
  with three states; the kit has no chip), a lesson's step dots and result,
  the practice screens (`pages/_practice.scss`), the figures in tiles
  (`pages/_stat-tiles.scss`: the kit has no metric tile), the keyboard, the
  staff, the piano's round-ended button in the bar, What's new's releases
  (in the kit's dialog, their lists named by the kit's badges).
- **The piano's device list is the kit's select in a `@defer (on idle)`
  block.** The kit's fields are one lazy entry point (`@anotoki/lib/ui/forms`)
  that a first load must not carry, and the bar is part of every first load:
  the select is loaded once the page is idle, long before anybody opens the
  piano's box. A copy of a select of Piano's own would have been a one-off
  of a piece the kit has.
- **The notes under the bar are the kit's alerts**, as wide as the page under
  them: the ones that come of what just happened are said at once (role
  `alert` or `status`, as before - the kit's `announce`), the visitor's
  notice is part of the page. The bar's "Not saved yet" is the kit's warning
  badge.
- **Stats' recent rounds use `.table-stack`**: on a phone every round is a
  small card, each cell named - before, a table wider than a phone that
  scrolled sideways, its last three columns out of sight.
- **No words, no migration.** Every key the pages asked for is still asked
  for (What's new keeps its Close beside the dialog's own ×, so
  `whatsNew.close` stays used); "Tempo:" keeps its colon over the kit's
  select. One line in What's new's 0.4.0, unreleased.
- **The first load is 535 kB** (was 519): the kit's alert, card, badge and
  error state on the first page (Learn), and the base, utilities and tables
  (+4 kB of CSS) - under angular.json's 550 kB warning.

## 2026-10-11, later - signing in, people and the admin tools through the family's library (`anotoki-lib` 0.4.1)

Every anotoki site signed in through the IAM with copies of its SDKs, kept
its own record of people and would have built its own admin tools; the owner
asked for one implementation, the library's. Both halves are 0.4.1 (never
0.4.0, two of whose queries failed on PHP 8.2). The owner's decisions, and
what they mean here:

- **Signing in is the library's.** The vendored SDKs (`api/anotoki_iam.php`,
  `core/auth/anotoki-auth.mjs`), this app's `AuthService`, interceptor,
  guards, sign-in card and its stand-in IAM (`tests/tools/fake-iam.php`)
  went; `Anotoki\Lib\Auth` and `@anotoki/lib/auth` stand there, wired in
  `api/auth.php`, `api/meddleware/auth.php` and `core/auth/site-auth.ts`,
  refusing in this app's `{error, code}`. The tokens stay where the SDK kept
  them (`anotoki-auth:piano-academy`): nobody is signed out by the move. What
  stays this app's: the visitors - the key and the paths it goes to, the move
  at sign-in, and the first save that makes a visitor while the others wait
  (in `ApiService`, not the library's interceptor: a waiting save works its
  `Progress-Generation` out after that save has answered) - the roles'
  words, and `beforeSignIn` (a visitor's saves arrive first).
- **No sign-in by the IAM's hint** (genshin and the build analyzer only):
  `hint: false`. With it the page does not follow a sign-out at the IAM as
  it loads either - as before.
- **A sign-in that did not work has a screen of its own**, the family's
  (`/sign-in-failed`: why, Try again, Back), in place of the sign-in card.
  Migration 011 moves this app's three sentences under the library's keys -
  every language, the owner's wording, who saved it and when - and deletes
  the card's five keys; its gate proves every string arrived as it was.
- **People is the library's page; the delete stays this app's.** The page's
  question is all a delete asks (no recent sign-in), and every delete is
  audited (`person.data_deleted`). The scrub of the accounts the IAM deleted
  blanks the name (`deleted-{sub}`; migration 010 adds `users.anonymized_at`
  and nothing else) and, through this app's hook, the address and browser
  that person's feedback gave; the progress stays, nobody's. No transition
  machinery: the sites are not public yet.
- **The admin tools are for the site's ADMIN alone** - EDITORs see none of
  them: the error log, the audit log, feedback and backups. No file
  explorer: this app keeps no files of its own.
- **Feedback mails nobody**: the admin bar's Feedback link counts the new
  ones. **A signed-in sender's account address is the reply address unless
  they tick "Send it without my name"** (the owner, 2026-10-11: "it's their
  choice"); the form says so under the box. That address is kept with the
  message alone, and forgotten - with the browser's name; the words stay -
  when the People page deletes that person and when the scrub blanks an
  account the IAM deleted.
- **Backups have no maximum age** (the owner, 2026-10-11): a backup is kept
  until the owner deletes it, and nothing deletes one for its age - one made
  by hand stays (the page marks it stale after 90 days and deletes nothing
  for it); the automatic ones are the library's, kept by count (the newest
  14 daily, 5 before an update, 5 before a restore). So a deleted person's
  data stays in the backups made before their scrub until those go. A
  restore runs here, after a backup of its own; before it answers, every
  progress - a visitor's too - takes a new generation, far past any number
  handed out (the restore sets the rows and the sequence back to the
  backup's day: a page left open since then would otherwise save over what
  was restored, and the next import hand out a number an open page holds),
  and the scrub of the IAM's deleted accounts runs again. Either that cannot
  finish is said - the Backups page, the error log - and a scrub left
  undone runs with the next request, not an hour later. The owner's own
  `pg_dump` files in `storage/backups/` are never touched - the library
  deletes only files of its own names.
- **The backups are not encrypted** (the owner, 2026-10-11, for every site:
  only the IAM's are, from its master key). This site has no secret of its
  own to derive a key from, and one kept beside the files in `storage/`
  would protect nothing. What a backup holds: every table - each person's
  IAM id and name, when first and last seen, their progress, path and
  rounds; the visitors' rows (a hash of each key, never the key); the words
  and who last reworded them; the feedback messages with their reply
  addresses, browsers and pages; the audit log (who did what - never an
  address); the scrub's own record (the ids the IAM deleted, and when); the
  applied migrations and their SQL. Not in one: a token or a password (none
  is kept), the settings (the database's password is in `config/`), the
  error log (files of its own). Who can read one: the site's ADMIN, on the
  Backups page (a download needs a sign-in of the last ten minutes and a
  single-use link of a minute); whoever can read the host's files - its FTP
  account and the hosting's staff (`storage/` is closed to the web by the
  upload's `.htaccess`; a host that ignored it would serve the files); and
  wherever a downloaded copy is kept: it is as private as that place.
- **A restore brings back what was deleted for a person** (People - Delete
  their progress) since the backup was made, until the library's 0.4.2
  keeps such a delete across a restore. Until then, after a restore, delete
  them again; the People page's question says so before a delete. (No
  longer since 0.5.0 - the release 0.4.2 became - 2026-10-12, above.)
- **The pages' own errors are not logged yet**: they go to every site's error
  log with the library's 0.4.2 (its Angular reporter). `ErrorLogRoutes::client`
  is not mounted until then. (Mounted since 0.5.0, 2026-10-12, above.)
- **What's new tells what a learner notices**: 0.4.0 (still unreleased)
  gains "Send feedback" and the sign-in failure's page; the admin tools are
  the staff's.
- **The admin panel's bar folds at its own width**: an ADMIN's eight
  sections and the count beside Feedback need 1258 px with the brand short,
  and the whole wordmark beside them would not fit the family's row (84rem)
  at any width - so there the brand is short at every width ("Piano",
  "admin panel" under it; the whole name stays the link's) and the bar folds
  up to `ADMIN_PHONE_BAR_MAX` 1280, as Japanese Academy's and the build
  analyzer's admin panels do. The learner's bar is as it was.

What changed in behaviour, beyond the pages: `Authorization: Bearer` with no
token is `401 invalid_token` (it was `sign_in_required`); a request a role
check refuses records nobody; the library's `Identify` reads a visitor's key
on every route but the public ones while no sign-in is required (only
`requireOwner()` takes a visitor, and the browser sends the key only to the
progress routes); the browser tries a visitor's request once more after
`visitor_unknown`, without the key; an EDITOR who opens an ADMIN page goes to
the start page (it was Translations); the day's backup is made after the
first good answer of each UTC day; on a LATIN1 database the admin set's two
tables are made before 002 refuses it.

The first load is 519.0 kB (it was 482.7 kB - over the 500 kB warning): the
library's auth module is 32.5 kB where this app's SDK and services were about
17 kB, and the feedback form's words add 4.2 kB. A lazy Home (about -15 kB)
or the feedback form's setup inside the dialog's chunk (about -5 kB) would
bring it back under; the owner's call.

## 2026-10-11 - the words through the family's library (`anotoki-lib` 0.3.0)

Every anotoki site kept its words in the same three tables, each with code of
its own to read and write them; the owner asked for one implementation, the
library's (`Anotoki\Lib\Translations`, `@anotoki/lib/translations`). Both
halves are 0.3.0. The owner's decisions, and what they mean here:

- **One wire format, the IAM's (snake_case).** The admin routes say
  `native_name` and `sort_order`, the bundle's languages
  `{code, name, native_name}`; the library reads a body itself (1 MiB, `415`,
  `422 empty_body`, `400 invalid_json`), a deleted language answers
  `200 {strings}` (it was 204), and a bundle without its tables
  `503 translations_unavailable` (it was `update_pending`, which is the
  gate's own word). The backend and the frontend moved together; nothing
  else calls these routes.
- **The permissions stay the site's.** The library decides nobody's: its
  route groups take this app's `requireRole()` - the strings for the staff
  (EDITOR, ADMIN), the languages for ADMIN, as before - and its admin pages
  hide what the server refuses (`allows`).
- **Every owner rewording survives.** The kit read this app's own keys
  (`core/i18n/kit-words.ts`); it reads the library's, `anotoki.*`, now.
  Migration 009 copies every string of those 17 keys under the library's
  key - every language, the owner's wording, `updated_at` and `updated_by`
  with it - before the library's own 002 runs (which writes a string only
  where a library key has none), deletes the 15 keys only the kit asked for
  (the key scan fails on a key nothing asks for), and its gate proves that
  every string arrived as it was. `common.loading` and `signIn.button` stay
  this app's too: its own pages ask for them. So the theme switch keeps this
  app's names ("Theme: light"): in the database under `anotoki.theme.*`, and
  in code (`KEPT_LIBRARY_ENGLISH`) for while no bundle is in memory.
- **What's new tells what a learner notices.** Nothing here: the words are
  the same, and the admin pages are the staff's. 0.4.0 is still unreleased.

What went to the library: this app's `TranslationService`, its pipes, the
Translations and Languages pages with their grid, cell, drafts and guard,
the words' routes and checks (`api/translations.php` keeps the wiring), and
the command line (`tools/translations.php` is the library's command with this
app's scan). What stays this app's: the English kept in code,
`dynamic-keys.ts`, the role checks, the error body (`{error, code}`), the
storage keys (`piano-academy:language`, `:language-cache`,
`:localization-drafts` - a learner's choice and cached words survive the
upgrade). The status page reads in the page's own language, English on an
address of the admin panel (`effectiveLanguage()`, the library's advice), and
its words come from the database in that same language - so a Slovak reader
on an admin address gets the owner's English, never the module's built-in
Slovak beside a reworded database.

The kit with 0.3.0: each piece imported from its own entry point (never the
`@anotoki/lib/ui` barrel), its own class names (the specs and the browser
check read `anotoki-top-bar__person-button`...), and its shadows written
right - `styles.scss`'s plain values for the small shadow and the dark
mark's halo are gone. With the library alone the first load was 501.6 kB
(0.2.0: 500.9 kB): the barrel's 6.5 kB went, but the library's
`TranslationService` is 5.7 kB more than this app's own was, and the shell
grew 2.4 kB. So the Stats page is lazy now, a chunk of its own as the
practice pages are (the owner's decision): the first load is 482.7 kB, under
its 500 kB warning again.

## 2026-10-08 - the anotoki family's kit (`@anotoki/lib` 0.2.0)

The owner asked for one UI kit for every anotoki site (2026-10-07): the
library's Angular half 0.2.0 holds the family's styles, components and frame,
built from the IAM's. Its PHP half did not change and stays at 0.1.0. The
owner's decisions for Piano Academy:

- **One palette in the library, which a site overrides - the colours only.**
  Piano keeps its own colours, light and dark: `styles.scss` writes the
  family's tokens through `anotoki.root(...)` with Piano's palette, and
  Piano's pages say them by their old names (`--panel`, `--accent`...),
  each the family's token it became. What Piano had no colour for keeps the
  family's value; the 3:1 edge of a control (`border-strong`, WCAG 1.4.11)
  is made in Piano's grey-blue, and Piano's own fields and the piano's
  button in the bar take it too. Everything else is the family's
  (2026-10-11): its corners (16 px on menus, boxes and cards, 20 on a
  question), its shadows, its font. Two of the family's own values - the
  small shadow and the dark mark's halo - are written in `styles.scss` as
  plain values until the library's 0.3.0: 0.2.0 writes those one-item Sass
  lists as `(…,)`, which is no CSS (the theme switch's chosen segment flat,
  the mark sunk into the dark bar).
- **Manrope on every site** (`anotoki.fonts`). The family's base styles
  (`anotoki.base`) are not taken: Piano's pages are written for the
  browser's own type and keep their look. (Undone on 2026-10-11, when the
  pages moved onto the kit: see the top of this file.)
- **The family's segmented theme switch** (light / dark / as the device is
  set) in place of Piano's round button that went round the three. The row
  is wider, so the bar folds a little earlier: `PHONE_BAR_MAX` 1320 (from
  1240), measured again with the real labels (the widest row 1314 px, in
  Slovak, in Manrope; 1293 in English). Migration 008 deletes the
  round button's three spoken keys (`theme.*Spoken`) - the key scan fails on
  a key nothing asks for - and tells the other theme keys' descriptions of
  the switch; the owner's strings stay.
- **One admin wordmark**: "anotoki Piano Academy · admin panel"; where the
  bar takes a short form (a phone) Piano's own, "Piano", with "admin panel"
  under it.
- **Every word the site shows today still shows.** The kit's built-in
  Slovak is informal, as Piano's; but where Piano has a string of its own
  for a kit word, the kit says Piano's - the database's, with the owner's
  rewordings: `provideAnotokiUi`'s `lookup` asks `TranslationService` for
  the keys in `core/i18n/kit-words.ts` (written by their two parts, so the
  key scan never reads a kit key as one of Piano's). The switch's three
  choices are named with Piano's `theme.light` / `dark` / `auto` ("Theme:
  light", what the round button said); what Piano never had - the switch's
  name, "As your device is set", "Saving…" - is the kit's own.

What is the family's now: the top bar (`layouts/top-bar` wraps
`<anotoki-top-bar>`: Piano's brand, sections, person and menu items, "Not
saved yet" and the piano as its widgets, the phone's dot and the menus'
note), the brand, the icons, the spinner, the language chooser, the menus,
the popover the piano's box sits in, the questions (`ConfirmService`: the
sign-out question, replacing a progress file, the admin pages'),
`ThemeService` and `theme-boot.js`. The family's pieces bring the family's
look and keep it (the owner's decision, 2026-10-11): the question has a
title row with ×, a footer, 44 px buttons, a filled red yes and a blurred
backdrop; the bar's Sign in is the family's button, not a pill; the menus'
"Not saved yet" is a soft amber box. What stays Piano's: the pages, the
keyboard, the notation, the piano's widget, What's new (until a family
changelog), the notes under the bar, and - for now - its own controls: bare
buttons and selects, `.btn-primary`, `.card`, `.chip`, the admin fields.
They move onto the kit's components in a later phase of this round (the
kit's buttons are 44 px high: every page changes with them). Meanwhile their
element rules stay global but never reach the family's components
(`$piano-own` in `styles.scss`), which set every property they rely on. The
first load is 0.9 kB over its 500 kB warning with the kit; that is left for
the library's 0.3.0, whose tree-shaking keeps what only lazy pages use out
of it.

Two behaviours changed with it. The way into the admin panel is in the
person's menu only while the site is ready: while an update waits, the
family's status page links an ADMIN to Migrations, and the rest of the panel
could not load then (the server answers its routes 503 but the Migrations
page's). And the gate's template is marked
(`<ng-template anotokiSitePages>`), the Migrations page comes from
`@anotoki/lib/migrations/page` (out of the first load), and the status page
reloads without reopening the gate first (`SiteStatus.checkForReload()`) -
so the moment before that reload makes no page, which `pageShown()` used to
cover too; it keeps its other two jobs (the page or the start's card, one
outlet for an ADMIN's Migrations page across the Apply) and is unchanged.

## 2026-10-07 - versions have three numbers

The owner's rule for every anotoki site: a version is MAJOR.MINOR.PATCH -
big changes, new features, bug fixes. What's new's entries were renamed
(0.4 -> 0.4.0, 0.3 -> 0.3.0, 0.2 -> 0.2.0, 0.1 -> 0.1.0) and none was added:
0.4.0 already holds this round's line. `frontend/package.json` said 0.4.0
already; its package-lock's root still said 0.3.0 and says 0.4.0 now. A new
release is a new entry on top with three numbers, and `package.json`'s
version line the same - `core/changelog/changelog.service.spec.ts` reads
both files and holds them to it. Nothing here remembers which What's new
somebody saw (it opens only from the footer's version), so no "0.4" kept in
a browser had to be read as "0.4.0".

## 2026-10-07 - the gate makes the pages only while the site is open (`@anotoki/lib` 0.1.1)

Given as it is, the content of `<anotoki-site-gate>` (0.1.0) is made by
Angular whether the gate shows it or not. The shell kept its own
`@if (pageShown())` around the outlet, so a start that waited for an update
made no page; but an update that came in the middle of practising (the start
already `ready`) left the page made behind the status page - its listeners,
its timers and its requests running while nobody saw it. The library's 0.1.1
takes the view as an `<ng-template>` and makes it only while it shows it: the
page goes with the update now, and the status page loads the site afresh
once it is back. Its PHP half is unchanged and stays at 0.1.0.

The template is not optional here: under 0.1.1, content given as it is would
be read as a template anyway - the gate's `contentChild(TemplateRef)` takes
the shell's first `@if` block for it and draws a bare `<router-outlet>`, so
"Loading…", the sign-in card and "Could not load" would vanish. `pageShown()`
stays inside the template: it picks the page or the start's card, keeps one
outlet for an ADMIN's Migrations page across the Apply, and keeps a waiting
start's page from being made in the moment the site is back, before the
reload. The notes under the bar (`@if (!site.blocked())`), the bar's
sections, the sign-in guard and `BootService`'s `waiting` stay as they were:
they never depended on what the gate makes.

## 2026-10-07 - one behaviour while the site is not ready: the anotoki family's library

The owner's request, for every anotoki site (the IAM, genshin, the survey
site, Piano Academy, Japanese Academy, the build analyzer):

> When there is a new migration, some sites behave differently than others.
> Japanese won't let me go to the admin or anywhere if I am not logged in, but
> I cannot log in because a migration is waiting. Genshin gives me no warning.
> Piano and survey show me a setup error with buttons to the setup page or the
> migrations page. This needs to be consistent. I do not want logged-in users
> or visitors to see the error about what is going on. The admin should see
> it. If the setup was already done it should never offer that button again,
> especially as setup.php is no longer there.

So what the sites share went into one library, `anotoki-lib`
(`irelevant25/anotoki-lib` on GitHub, version 0.1.0: the PHP package
`anotoki/lib` and the Angular package `@anotoki/lib`, one version for both),
starting with the database migrations; Piano Academy takes both halves from
GitHub (`backend/composer.json`, `vendor/anotoki/lib`; the release's tarball
in `frontend/package.json`) and keeps nothing of its own that they do:

- **The engine** is the library's `Migrator` (`api/migrations.php` sets it
  up): the same files, the same `migrations (id, filename, applied_at)`
  table, the app's own advisory lock (`DATABASE_UPDATE_LOCK`, so every way
  of applying still takes turns), and the rename of the first runner's
  `migrations(name)` column as its `prepare` hook. `api/migration_runner.php`,
  `api/database_update.php` and `api/meddleware/setup.php` are gone; setup's
  Save, `php migration.php`, the admin panel's Apply and the tests' database
  builders all go through it.
- **The gate** is the library's `SiteGate`, in front of every route: not
  set up -> 503 `not_set_up` (the setup page named only while
  `storage/installed.lock` is not there - once installed it is never
  offered again); an update waiting -> 503 `update_pending` everywhere but
  the sign-in settings, the words, the health check and the Migrations
  page's routes, so somebody can sign in, the pages have their words and an
  ADMIN reaches Apply. It replaces the app's "not set up" gate and its
  per-route schema check (`requireCurrentSchema`, which answered
  `not_set_up` with `update: true`); `POST /api/sessions`, which had no
  schema check, waits too now. `GET /api/site-status` says the state to the
  pages - always 200, to anybody, in every state: nothing of the app's may
  stand in front of it (the pages ask it before anybody can be signed in, and
  read a 401 or a 500 there as "not available right now" - what another
  site's sign-in gate did to it); a settings file PHP cannot run is "not set
  up" now, where it was a 500. The words' route answers while an update waits, from the database
  as it is; a database without the words' tables (002 waiting) answers that
  route `update_pending` as the gate would.
- **The pages** are the library's: `<anotoki-site-gate>` around the shell's
  outlet draws "The site is being updated" for visitors and learners (in
  their language, no error, no code, a quiet Sign in while nobody is signed
  in; it comes back by itself), "A database update is waiting" with "Open
  Migrations" for the site's ADMIN (the token's roles), "This site is not
  set up yet" with the setup page only while never installed, "The site is
  not available right now" otherwise; the admin panel's Migrations page is
  the library's `<anotoki-migrations-page>` (Pending with drafts, Applied
  with each file's SQL, Missing, "Apply pending"). The app's "not set up
  yet" card and its own Migrations page are gone; migration 007 deletes the
  card's four words (`boot.notSetUp.*`), which nothing asks for any more.
- **Signing in works while an update waits** - the deadlock the owner met
  on Japanese Academy: the start reads the sign-in settings and the words
  (both open), then waits without asking for the progress or moving a
  visitor; the sign-in guard sends nobody to the IAM then, and the
  navigation goes on, so the status page's Sign in comes back to the address
  it was pressed on. An ADMIN's Apply that leaves nothing to apply goes on
  with the start in place (`BootService.resumeAfterUpdate()`), the Migrations
  page staying on the screen; everybody else's page reloads by itself once
  the site is back.

Gone with it: the server's `detail` (what is missing, to this computer only)
in the "not set up" answer - the library's body has none; `php
migration.php` still says what is missing.

## 2026-10-06 - the theme, the dates and the clock are the anotoki account's

The owner's decision, made for the whole family in the IAM (its migration 015
and browser SDK 1.2.0; `../anotoki-iam/docs/decisions.md`): "it should be in
the iam only and apply for every project/application". A site's own controls
save a signed-in person's choice to the account, and there is one theme
everywhere - every site, every area of it, the admin panel included.

**The SDK 1.2.0, vendored byte for byte** (`core/auth/anotoki-auth.mjs` and
`.d.ts`; the PHP SDK stays 1.1.0 - nothing of it changed).
`AuthService.preferences` is the account's theme, date order and clock while
somebody is signed in - null for nobody, for a visitor, and from an IAM that
sends none (before its 015, or a sign-in without `profile`). Null: everything
is as it was, and nothing is saved to the account (the IAM would answer 503).

**The theme** (`core/theme/theme.service.ts`, after the IAM's own): signed
in, the account's - taken at sign-in and whenever the account says another
(another tab, another anotoki site, a refresh of the tokens), but not while
a choice made here is still being saved, or the page would flick back. The
bar's button shows a choice at once and saves it (`savePreferences({theme})`):
one save at a time, the latest choice last, so two saves never race. A
refusal puts the account's theme back on the screen and says so under the
button (`theme.notSaved`). The admin panel has the same button, so the whole
site has one theme. The theme on the screen is still kept in
`piano-academy:theme`, which `public/theme-boot.js` reads before the first
paint. Signed out it is the device's, as before; and the device's earlier
choice is not carried into the account at sign-in - which of a person's
devices should win is not knowable (the IAM's reasoning). (Since 2026-10-08
the service, the button and the boot script are the family's - its
`ThemeService`, its switch and its `theme-boot.js` - with the same rules and
the same key: "the anotoki family's kit", above.)

**Dates and times** (`core/i18n/local-date.pipe.ts`, with the family's four
orders and two clocks in `date-patterns.ts`): for somebody signed in whose
account chose an order or a clock, a day is written in that order, and a
moment as the date and the time side by side - each half the language's own
where the account left it automatic. Otherwise exactly as before. The admin
panel's People and Migrations go through the same pipe (`stamp`):
`yyyy-MM-dd HH:mm` as they always showed, or the account's order and clock.
The Migrations page's times are the server's own numbers (its clock is UTC),
put in the chosen order as they are - never moved into the reader's time
zone, which would make them read differently from what the page showed
before.

**Which language a reader gets** - decided for the whole family (the survey
site's `TranslationService` is the reference; Japanese Academy, the build
analyzer and genshin do the same). For somebody signed in whose IAM sends the
account's preferences, strongest first: `?lang=` of this tab and a choice
made on the page this visit, then the account's language (when the site has
it), then the choice this device remembered, the browser's languages,
English. A change of the account's language made elsewhere - its page,
another anotoki site, another tab - is followed when it comes, over the
device's choice and over a choice made earlier on the page; not over this
tab's `?lang=`, and not while a choice made here is on its way to the
account (the answer to an earlier save would turn the page back to it).
Signed out, and through an IAM that sends no preferences, exactly as before:
`?lang=`, this device's choice, the token's `locale`, the browser's,
English - the token's language adopted only while nothing is chosen here.
The chooser saves a signed-in person's choice to the account too
(`savePreferences({language})`: one save at a time, the latest last, only a
choice that won) - also a choice of the language already on the page, which
the account may not have yet - and still remembers it on this device, for
when nobody is signed in. A language the IAM does not offer
(`invalid_request`) stays this site's own for the visit, silently - the next
visit reads the account's again; any other refusal (the IAM out of reach,
the sign-in ended, `access_denied`: the account no longer let into Piano
Academy) is said under the chooser (`language.notSaved`: "...it holds for
this visit only"), and the page stays in the chosen language for the visit.
Before this decision the device's choice came first on this site; the IAM's
own pages put the account first, and now every site does.

**The words of a refusal promise nothing**: `theme.notSaved` and
`language.notSaved` say what happened and not to try again - after
`access_denied` (the SDK's code when the site no longer lets the person in)
trying again would not help.

**Migration 006**: the two sentences, in English and Slovak - words only.
Written whole and final; the owner applies it at the hand-over, with 005.

## 2026-10-06 - the family's visitor counter, without the query string

The owner asked for Umami - the family's own, at `umami.anotoki.eu` - on every
anotoki site. `frontend/src/index.html` loads its script, and the upload's
policy (`backend/tools/build.php`) allows it in `script-src`; what it sends
goes to its own origin, which `connect-src`'s `https:` already allows. It sets
no cookie and stores nothing in the browser. It is told to leave the query
string and the fragment out (`data-exclude-search`, `data-exclude-hash`): the
sign-in comes back to `/auth/callback?code=...&state=...`, and the script may
read the address before the app has run - a counter that kept it would hold
every sign-in's code. It is `async`, not the snippet's `defer`: a deferred
script and the app's module run in order, so the app would wait for the
counter - for as long as a slow or unreachable `umami.anotoki.eu` takes to
give up. The paths still go, which is what the counter is for; README's "Data
and privacy" says what it gets. The price: the script runs in the app's pages,
beside the sign-in's tokens in localStorage, so the site trusts whoever
controls what `umami.anotoki.eu` serves that far.

## 2026-10-05 - the visitor's words (visitors, stage E)

What somebody practising without signing in reads, and what a person reads
after a sign-in that brought a visitor's progress along - all the shell's
(`app.component`), keys of migration 005 (`core/i18n/visitor-words.ts`),
English kept in code too (`kept-english.ts`), Slovak informal.

**The notice only on Learn and Stats.** "Your progress is kept for this
browser for 30 days after your last visit. Sign in to keep it in your
account." with Sign in, under the bar - on `/` and `/stats`, never on a
practice screen (a lesson, the Note Trainer, Sheet Practice, Songs), whose
staff and keyboard need the room and the attention. The bar's Sign in is
there on every page anyway. The notice stands while sign-in is not
required; when the API says it is required meanwhile
(`AuthService.requireSignInNow()`), `visitor.signInNow` (an alert, with Sign
in) takes its place on every page - the visitor's saves wait for it, their
key is kept, and the sign-in moves what it holds.

**Notes that need no answer are closable; the others go by themselves.**
`visitor.lost`, `visitor.moved` (+ `visitor.kept`), `visitor.notMoved` and a
refused sign-in have a Close; `visitor.full` / `visitor.busy` stand while
`ApiService.visitorRefusal` holds them (it clears after a visitor's save
gets through) and offer Sign in, the way out of both.

**A refused sign-in is worded for a visitor too.** The signed-out banner
(a person whose sign-in ran out) is not a visitor's, so a sign-in the IAM
turned away (`access_denied`, e.g. MEMBER taken away) or one that could not
start is said in a note of its own, in the sign-in card's words
(`error-text.ts`) - never swallowed; the visitor stays on their page.

**After a lost key, no "changed elsewhere".** A 401 `visitor_unknown` (swept
after 30 days, or moved by a sign-in in another tab) forgets the key and
says `visitor.lost`; the page's next save then goes as nobody's with the
visitor's old generation and is refused (409 `progress_changed`).
`ProgressStore` loads nobody's progress, as for any 409, but does not set
`changedElsewhere` on a visitor's page while `VisitorKey.lost` is true:
"replaced by a file brought back in another tab, or by an administrator"
would be wrong, and the loss is already said once. Any other 409 on a
visitor's page (a second tab's maker first) is said as before.

**Stats offers the sign-in in place of the progress file** for anybody not
signed in (a visitor, or a person whose sign-in ran out): a progress file is
an account's (the own file's routes are `requireUser()`), and its card would
only answer "signed out". **People** counts the visitors in a line under the
list (`{count, sessions}`), English as the whole admin panel, never as rows:
they have no name and go by themselves.

**What's new**: one line in 0.2's entry (the visitors ship with 005, which
ships with 0.2).

**The browser check proves the one maker for real**: the visitor's first
save is held at the network while a lesson's drill issues its notes, its
path and its round; exactly one save goes without the key and exactly one
visitor row is made.

## 2026-10-05 - visitors in the browser (stage D: who a request is, the key, the move)

The frontend serves visitors while the IAM says no sign-in is required
(`AuthService.loginRequired`, from `/api/auth/config`; only an explicit
`false` - anything else, or an older backend that does not say it, requires
one).

**Who a request is, decided when it is issued.** `ApiService` decides it from
the page's data owner - a person's IAM id, or `VISITOR_OWNER` on a visitor's
page - and carries it on the request (`ISSUED_AS`, an `HttpContext` token);
the interceptor reads it. Never from whether a token happens to be there when
the request leaves: the build analyzer's interceptor did that (`if (!token)
asVisitor`), and a person whose refresh had failed (the IAM session ended,
their MEMBER taken away) then sent their round as a visitor - with a key held
it landed in the visitor's row; with none, the server saw nobody's save and
MADE a visitor out of the person's round. The server cannot tell these apart,
so only the browser can stop it: a person's request with no token is never
sent (401 `sign_in_required` locally - the round waits in the outbox, the
signed-out handling takes over), and a person's page whose person signed out
is refused in `ApiService` before anything (401, whatever the switch says -
never "signed in as somebody else", never a visitor's). The key goes only on
a visitor's request, and a key in a person's answer is never kept. The move
is the one request that carries both (`CARRIES_VISITOR_KEY`). The own file,
the admin panel and the move are a person's: on a visitor's page they are
refused before they are sent.

**The key is kept while a sign-in is required** (the family's design 4.3;
section 2's "forgets" was corrected). The interceptor stops sending it, a 401
`sign_in_required` only tells `AuthService.requireSignInNow()` - so the next
sign-in still moves the visitor's progress, and the switch turned off again
within 30 days brings it back. Only a 401 `visitor_unknown` forgets it, and
only while the stored key is still the one that was sent (another tab may
have a new one).

**One maker.** The end of a round sends a progress PUT, a path PUT and the
round at once; for somebody without a key each would make a visitor of its
own. So the first save without a key is the maker and the others wait for it
(`ApiService`), then go with the key and the generation its answer brought;
a maker that failed leaves no key, and the next one makes. Nobody's state is
generation 0, which only a maker names.

**The move before the state.** Signed in with a key held, `BootService` moves
the visitor first and loads the person's state after - so the page holds the
merge and its generation. Answered, found or not (another tab's move is no
error), the key goes; 422 forgets it; a 503 `visitor_move_retry` with a
Retry-After of a few seconds is waited out once; otherwise (no answer, a
5xx) the key stays and the next sign-in or page load asks again - the
visitor's progress is out of sight meanwhile, never lost (`visitorNotMoved`,
for the page to say). A sign-in that comes back in the middle of practising
moves too (the sign-in listener - `VisitorKey` knows only `AuthService`, so
there is no injection circle).

**The visitor's outbox on every signed-in start.** Rounds a visitor of this
browser left in its outbox become the person's whether or not this tab made
the move (`ApiService.adoptOutbox()`): another tab may have moved the rest,
or the key may have been forgotten. Their Idempotency-Keys stop doubles (a
round the visitor already stored was moved with its key; the server answers
the stored one). They are rounds played in this browser, as the move's are.

**A visitor's refusals that sending again cannot fix soon** are not sent for
ever: a 413 (a document larger than a visitor's may be) is "Not saved yet"
and goes again only with the next change; a 422 `visitor_limit` drops the
round (as every 422); after a 429 `too_many_visitors` no new visitor is asked
for before its Retry-After (refused locally meanwhile, with the time left),
and the store tries again then, not every 15 s. `ApiService.visitorRefusal`
holds the key of the words for the page.

**The guards.** A learner page lets a visitor through (`BootService.visiting`
and no sign-in required); a person whose sign-in ended in the middle of
practising is no visitor - their page holds their progress - and goes by the
IAM as before. The admin panel has its own guard (`adminSignInGuard`): a
sign-in whatever the switch. Signing in from a visitor's page waits for the
saves on their way first (`BootService.beforeSignIn()`), as signing out does.

The visitor's words on the page followed in stage E (the entry "the
visitor's words").

## 2026-10-05 - the move at sign-in (visitors, stage C)

The owner: "when they register the data could transfer". `POST
/api/visitor/move` takes the person's token and the visitor's key - the one
place the two meet - and works whatever the IAM's switch says (switching
sign-in on stops a key from being somebody, not from being handed in with a
token).

**The person's data stays where both have the same thing** (the family's
rule), and nothing the visitor practised is lost where the person had
nothing:

- **Notes**: a note the person has stays byte for byte; the visitor's others
  are added. Choosing between two SRS states means comparing schedules -
  domain logic, which lives in the frontend only - and "the newer wins" could
  roll a well-learned note back to a beginner's state.
- **Path steps are merged per step** (the critique's option, adopted by the
  coordinator): `bestAccuracy` the larger, `attempts` added, `passedAt` the
  earlier, `lastAccuracy` / `updatedAt` from the newer. A step is passed by
  its best (`path.service.ts`), so a pass is never lost - keeping the
  person's record whole would drop a visitor's pass of a step the person had
  tried and failed. A step record is a tally, not a schedule: merging it needs
  no SRS judgement. A later step passed out of order unlocks nothing (the path
  opens up to the first step not passed; `path.service.spec.ts` pins it), so
  the union is safe with today's unlock rule.
- **Rounds**: every one moves, with its id, Idempotency-Key and time - so the
  browser's outbox, posting a visitor's round again as the person's, gets
  the stored one back, not a second row.

**Merged documents are size-checked** (the critique): a note's value is any
object, so 128 keys do not bound the bytes; a merged notes or path document
over `BODY_LIMIT` would make every later whole-document save of the person's
a 413. Such a merge is not made: the person's document stays, the visitor's
count as `kept`. Far beyond real use, and tested with padded documents.

**The answer counts what happened**: `notes: {moved, kept}` (kept: notes the
person had, or all of the visitor's when the merge was too large), `steps:
{moved, merged, kept}` (merged: steps both had; kept: only when the merge was
too large), `sessions` (rounds moved) and the person's `generation`. The page
says `visitor.moved`, and `visitor.kept` ("where your account already had
progress, it was kept") when any of notes.kept, steps.merged or steps.kept is
above 0 - a merged step keeps the account's pass and best.

**One transaction, the visitor's row first, then the person's**, with a
`lock_timeout` (`move_lock_timeout_ms`, 5 s): a save of either side waits or
is refused, and a visitor's save that waited finds its row gone (401
`visitor_unknown`). A lock not had in time, a deadlock, a serialization
failure or a round that collided with one the person was adding: 503
`visitor_move_retry` with `Retry-After: 2`, nothing moved - the browser asks
again. A key nobody has (another tab moved it, the sweep) is `{found: false}`,
so the move is safe to repeat. When the person's notes or path changed they
get a new generation: their other tabs load the merge instead of saving the
old documents over it. Rounds alone need none. All SQL with `?` parameters
(native prepares: no repeated named ones), `jsonb_exists()` rather than the
`?` operator.

## 2026-10-05 - visitors while sign-in is not required (stage B: the backend)

The owner: "The visitors will have automatically created account with role
visitors or something like that with all data there. Its just they can lose
their data because they are not stored via credentials. But when they
register the data could transfer." The family's pattern is the build
analyzer's visitor accounts, with its critique built in from the start.

**A visitor is a users row of the app's own** - "the role visitor" the owner
speaks of is that mark, never an IAM role: a negative id from the sequence
`visitor_ids` (an IAM id is always 1 or more, so the two never meet), no
name, and the SHA-256 of a key (`users.visitor_key_hash`, migration 005).
001's `CHECK (id > 0)` makes way for `users_kind_check`: a negative id has a
key's hash, a positive one never, 0 is nobody's. Every store function is the
same for a visitor: the id is the only thing that differs, so the isolation
is the same.

**The key is the server's.** 32 random bytes, base64url, handed out once in
the `X-Visitor-Key` header of the answer to the save that made the visitor
(with `Cache-Control: no-store`), never in a body, an address or a log; the
browser sends it back in the same header. Only `requireOwner()` reads it
(and the move at sign-in, behind a token - stage C, below), and only after
two questions: a Bearer header is that person or a 401 (a token
that does not verify never falls back to the key); sign-in required is a 401
`sign_in_required` without the key being looked up, counted or seen. A key
nobody has, or whose row went during the request (the sweep, a move at a
sign-in in another tab), is 401 `visitor_unknown` - never a 500.

**Made on the first save, in that save's transaction.** A page view never
makes a visitor (`GET /api/state` answers nobody the empty state). The first
`PUT /api/progress`, `PUT /api/path` or `POST /api/sessions` checks its body,
then makes the visitor inside its own transaction: a save that fails or is
refused makes nobody and counts nothing (the analyzer's "unmake" and "give
back", for free). Its whole-document save names **generation 0** - what
nobody's state said - and its answer carries the new row's generation beside
the key; a second tab that later sends the key with 0 is refused 409 and
loads the visitor's progress, as an old tab of a person's is.

**Limits, and why these.** New visitors an hour per counted address (10: an
IPv4 address, an IPv6 /64 - one household is handed a whole /64), an hour in
all (60), at once (500 - a full site refuses new visitors only, existing ones
go on), a visitor's rounds (1000) and the size of a visitor's progress or path
(128 KiB - a whole progress and three hundred path steps fit twice over; a
person's limit is the app's 256 KiB). Counted in `visitor_starts` under an
advisory lock, so two at once count exactly; the rows are kept an hour. The
counted address is REMOTE_ADDR unless that is a proxy `config/visitors.local.php`
trusts - then its header, read from the right; `X-Forwarded-For` is never
believed on its own (anybody can write it). Behind Cloudflare's proxy the
owner lists Cloudflare's ranges there. `visitors.local.php` is optional,
gitignored and never written by setup: no setting is needed for the defaults.
(Since 2026-10-12, anotoki-lib 0.5.0: Cloudflare's ranges are the committed
default, the header is CF-Connecting-IP alone and one address, a catch-all
range is refused, and `visitor_starts` keeps a keyed hash of it - above.)
At worst 500 visitors x (2 x 128 KiB + 1000 rounds) is a few hundred MB, and
reaching 500 takes at least eight hours at 60 an hour - the People page's
visitors line is where to watch it, and the file lowers the limits.

**The sweep keeps the notice's promise.** Visitors unseen for 30 days go with
everything of theirs; there is no early sweep of visitors with little
progress (the notice says 30 days after the last visit). It runs after
somebody's answer (at most once an hour by `storage/visitors-swept`, and at
once after a visitor is made), with `ignore_user_abort`, 20 visitors a batch
(`FOR UPDATE SKIP LOCKED` - a visitor another request holds waits for the next
sweep), 2 s a statement and 5 s in all, every table of a person's data emptied
first (`STORE_PERSON_TABLES`, the list `peopleDelete()` uses too - one left
out would make a batch fail every time), and the counted addresses of an hour
ago pruned. A failure is logged ("[after] ...") and never fails the request.
Where PHP cannot close the connection first (mod_php) the person waits for it
- bounded by those 5 s, and in practice a few milliseconds.

**A visitor never passes the checks that mean "a verified token".**
`signedInUser()` refuses a visitor `SiteUser`, so `requireUser()` and
`requireRole()` refuse one however they are stacked: no own progress file
(`/api/me/...`), no admin panel, no role. People lists people only and counts
the visitors on a line of their own; a visitor goes by the sweep, never from
that page.

**While 005 waits**, the routes with a schema check answer what they always
do (503 `not_set_up`, `update: true`); `POST /api/sessions`, which has none,
answers a visitor's round - or one that would make a visitor - 503
`visitors_unavailable`, never a 500.

**005 holds when it runs again.** Its gates check what is there, never that a
table is empty, so they hold over a database with visitors; its descriptions
avoid the words 004's gate refuses; and the browser check's "database
behind" tour now takes 005 - the newest - off the record and applies it again
(`tests/unit/migrations.test.php` runs 004 and 005 again over visitors too).

The frontend followed: stage D (the entry above) and E (the visitor's words).

## 2026-10-05 - sign-in per site, MEMBER for everyone (stage A: the switch)

The owner: "I would like to be able to setup if log in is required for a
specific project and also what roles can log in to a specific project. The
default role for users should be member. Every user needs to have a role."
The IAM (its migration 010) gives every application a "Sign-in required"
switch and a checklist of the roles that may sign in, and every account
MEMBER in every application again.

**The switch is the IAM's, read by the SDK, never by code of our own.** The
vendored `api/anotoki_iam.php` is the IAM's PHP SDK 1.1.0, byte for byte;
`authLoginRequired()` only wraps `anotoki_iam_login_required()` (and logs a
failed ask). The rule is the family's: `GET
{issuer}/api/public/applications/piano-academy`; a 200 about this app is kept
a minute; a 404 (an unknown or switched-off application) is "required", kept
the same way; anything else - no answer, a 5xx, a proxy's page, an answer
about another app - is the last answer, or **required when none was ever
read** (fail closed). One request asks while the others use the last answer
(single flight), with its own 2 s timeout; only a request without a token
asks. The kept answer is in `cache_dir`, a folder of this app's own: in a
shared temp folder anybody on the host could open the app to visitors.
`GET /api/auth/config` relays it (`loginRequired`), so the browser never asks
the IAM. Until the IAM serves the route (its 010) it answers 404: required -
today's behaviour, so the order of the uploads does not matter.

**Only the Bearer scheme is a sign-in.** `Authorization: Bearer` (with or
without a token) is that person or a 401; `Basic ...` - what a host behind a
password file sends with every request - says nothing about who is using the
app and counts as no header. This matters once visitors come: a Bearer header
that does not verify must never fall back to being a visitor.

**MEMBER is an ordinary learner.** Every account holds it; no check needs it
or refuses it. Taking a person's MEMBER away in the IAM refuses their next
sign-in and refresh (when MEMBER is a role that may sign in here), while the
access token they hold verifies until it runs out - minutes. With sign-in not
required they could still use the app as a visitor: blocking stops signing
in, not visiting; to keep somebody out entirely, require sign-in.

**No test asks a real IAM.** The tests give the IAM's answer as a file
(`application_file`, the SDK's seam) or point the app at the stand-in IAM on
this computer, which serves the public route (`login_required`,
`application_missing`); `tests/lib.php` refuses settings that would ask
anything else (`test_offline_auth()`), and `unit/auth` pins it. The hosted
site's settings in `api/hosting` (written by setup.php, naming
`https://iam.anotoki.eu`) get the answer as a file before the site is asked.

## 2026-10-04 - the anotoki family, made one way

The owner set every anotoki site up afresh and asked for them to work one way
(the frame is the same for the IAM, the survey, Japanese Academy, the build
analyzer and this app).

**The IAM is the only way in.** "There is no need from project to support no
iam alternative/version of the projects." The "no sign-in" mode (auth mode
`none`, which acted as a configured `local_user_id` on the owner's computer)
is gone from the backend, its settings, the setup page and the tests. Who a
request is comes only from a verified IAM token. The tests sign in through the
tests' own tokens and the stand-in IAM (`backend/tests/tools/fake-iam.php`).

**Every account may use the app; who administers it is a role.** The IAM's
access for `piano-academy` is "everyone". There is no configured owner any
more: EDITOR rewords the app's words; ADMIN does that and also adds and
deletes languages, applies database updates and deletes a person's data. The roles are checked on whole route groups (`requireRole()` in
`api/routes/admin.php`), so a route added to a group cannot forget its check.
The old MEMBER role means nothing here. (Reversed on 2026-10-05, below:
MEMBER is back, every account holds it, and it is an ordinary learner.)

**A token that is sent must check out.** A present-but-bad token is a 401 on
every route that reads one - never treated as nobody, never as a person
without a role. The public routes (health, the sign-in settings, a language's
strings) read no token at all: the sign-in card needs its words before anybody
is signed in.

**An old settings file keeps working.** `auth.local.php` keeps its name (the
survey's is `iam.local.php`; renaming would have made the owner's installation
"not set up"), and any key but `issuer`, `client_id`, `cache_dir` is passed
over - so the owner's file with `mode` and `local_user_id` signs in through the
IAM it names. The next Save on the setup page writes the three keys only.

**The setup page asks for the database and the IAM, nothing else.** No
sign-in mode, no IAM user id, no old-progress import, no export upload. New
setups default to the database `anotoki_piano` on port 5432; the owner's own
database keeps its name, `anotoki_piano_academy`. "Test connection" answers in
the family's words (the survey's). On a host the page shows nothing that is
saved (a blank password keeps the saved one).

**One update at a time.** The setup page, `php migration.php` and an
administrator's update in the app take the same advisory lock before applying
migrations; the second is told another update is running. An administrator can
bring a database that is behind up to date from the app (the admin panel's
Migrations page, `/api/admin/migrations`), so a host does not need the setup
page re-uploaded for every migration.

**The old progress and the launchers are gone (git keeps them).** `server/data/`
(the progress from before the database - the owner let it go rather than
bring it in) and `start.ps1` / `start.sh` are deleted, by the owner's
decision. The root holds only `.claude/`, `.gitignore`, `CLAUDE.md`,
`README.md`, `DEV.md`, `backend/`, `frontend/`, `docs/`. The app is used through
`npm start` on `http://localhost:4500` - the address the IAM knows for it.
`tools/progress.php` stays for an operator: `--user` always given, `--move`
instead of `--owner`.

**The imports table stays.** It recorded the one-time import of `server/data/`;
nothing writes it now, and dropping it would gain nothing and edit history.

**Each person exports and imports their own progress.** "The import/export the
users data should be available for every user." Any signed-in person downloads
their own progress as a file (`GET /api/me/export`, the same
`piano-academy-export` the operator's `tools/progress.php` writes) and brings a
file back into their own account (`POST /api/me/import`). The `userId` inside a
file is never read: a file goes into whoever imports it, so it can move between
accounts and databases.

**An import replaces, after a question - it never merges.** Into an account
without progress it simply goes in; into one with progress it is refused
(`409 has_progress`) unless the page asks again with `?replace=true` after the
person said yes, and then the old notes, path and sessions go first, in the same
transaction. Merging two progress documents would need the SRS logic, which is
the browser's alone. A dry run (`?dryRun=true`) answers what an import would do,
so the question can name the numbers. Empty documents count as no progress.

**One size limit for both ways.** `EXPORT_LIMIT` (5 MiB - some ten thousand
rounds, and under PHP's usual 8M `post_max_size`) is the import's body limit and
the largest export the app hands out: an export that would be larger is refused
(`409 export_too_large`) rather than handed out to fail on its way back. The
operator's tool has no limit.

**A generation of each person's progress, not a revision of every save.** The
browser saves whole documents, so a tab still open on the progress from before
an import - or from before an administrator deleted it - would write the old
progress back with its next save. The survey's editor answers the same problem
with a revision that every save raises; here that would make one tab's two
chains of saves (progress and path, sent side by side) and two tabs learning at
once refuse each other all day, and there is no "merge" to offer. So the number
moves only when the whole progress is replaced or deleted: `GET /api/state`
hands it out, every `PUT /api/progress` / `PUT /api/path` names it
(`Progress-Generation`), and a save to an old one is `409 progress_changed` -
nothing saved, the tab loads again (`ProgressStore`: it never retries the old
documents, and tells the learner why). Between two ordinary tabs the last save still wins, as before.
The numbers come from one sequence, never reused, so a deleted person whose
next request makes a new users row cannot match a number an old tab holds. A
session is added, never written over anything, so `POST /api/sessions` checks
no generation: a round played in an old tab is a round played.

**Imports, saves and deletes of one person take turns.** Each takes the
person's users row first (`SELECT ... FOR UPDATE`) and holds it to the end of
its transaction: a second import sees the first's progress (`409
has_progress`), a save sees the new generation (`409 progress_changed`), and
nothing is ever half one and half the other. "Has progress" is asked once
before the transaction (the usual refusal, at no cost) and again under the lock.

**An administrator deletes a person whole.** `DELETE /api/admin/people/{id}`
(ADMIN alone) deletes their notes, path, sessions, an `imports` row and their
users row - not only "the progress", since the users row holds their name too.
A string they reworded stays, by nobody. They may come back: their next visit
starts empty. The People list is the only read across people in the app.

**The generation is migration 004's schema part.** One sequence and one column
with a default on `users`, additive and gated. 004 also holds every string of
this work - the own-progress card, the sign-out question, the top bar - and
retires the three keys the bar took the place of (`footer.translations`,
`account.myAccount`, `account.signedOut`), with the descriptions that told of
the old header and footer rewritten. It is finished; the owner applies it at
the hand-over, after a `pg_dump` (on the host: upload, apply at once, then the
IAM's 007), not before.

**Every page sends a signed-out visitor to the IAM - the card only after a
failure.** "The iam, japanese, piano and survey should require login at
minimum": opening any page while signed out goes straight to the IAM and back
to that page (`core/auth/sign-in.guard.ts`, the survey's guard ported:
`canActivateChild` on the learner's pages, `canActivate` on `/admin`). The
sign-in card stays only for a sign-in that came back refused or cancelled, or
could not start (a browser that refuses the site's storage): sent back to the
IAM then, the browser would go round for ever. While the app cannot run (not
set up, out of reach) the guard sends nobody anywhere - the boot cards are
drawn without a sign-in. The mid-session "signed out" banner stays: the page
the learner is on keeps what it has until they choose to sign in again (the
browser asks before a page with an unsaved save is left).

**The admin panel is `/admin`, English, split by role.** The owner's two pages
became the admin panel's (`pages/admin/`, `layouts/admin-layout/`):
Translations for the staff (EDITOR or ADMIN); Languages, People and Migrations
for ADMIN alone (`adminGuard` sends anybody else to Translations). The old
addresses `/translations` and `/languages` redirect there. Everything there
is English, as the owner's pages were, and only hides what the server refuses
anyway.

**The family's Migrations page, and "Admin panel" (the owner, 2026-10-04).**
Every anotoki site has the IAM's Migrations page in its admin panel, ADMIN
only: Pending (in the order they will run), Applied (with when), "Apply
pending" after a question - the files in order, each in its own transaction,
stopping at the first that fails, which is named and rolled back whole. Piano's
Database page became it (`/admin/migrations`, `/api/admin/migrations` and
`/apply`; the old page's address redirects, its API routes are gone - nothing
outside the app used them); the lock stays. While
the database is behind, no page runs on it - but this one: the not-set-up card
links an ADMIN to it, the shell draws it in place of the card, and once nothing
is pending the app starts where it stands (no reload, so the page still says
what it applied; the strings are asked for again then, as they were refused
with 503 at the start). And the area is called **admin panel** wherever it is named,
as on every site of the family: "Admin panel" / "Administrátorský panel" in the
person's menu (004, unapplied, changed in place), "Piano Academy - admin panel"
beside the mark ("admin panel" on a phone), "... · Admin panel · Piano Academy"
in the tab.

**A failed migration shows PostgreSQL's own words (the owner, 2026-10-04).**
Under "Stopped at <file>" the Migrations page shows what the database said -
the statement's number, the error and the statement's first lines - in a box,
as the IAM's page does, on this computer and on the host alike. Until then it
said only "PostgreSQL refused it. What it said is in the server's log." The
apply route is ADMIN only, the error says what to fix, and on a host with only
FTP the server's log is hard to reach. It is logged too. Nothing else changes:
no other answer carries a database's error. (A failure is still answered 200,
not the IAM's 500: the page reads both the same, and nothing else calls it.)

**A refused save is settled by loading again, and the other tabs are told.**
On `409 progress_changed` the store stops that save for good, loads the
progress again (the new generation with it) and the shell says why ("replaced
or deleted somewhere else"). The frontend never sends a save without a
generation, so the server's `428` cannot come from it (a spec holds that); one
that comes all the same (a proxy or the host dropping the header) is kept as a
failed save - "Not saved yet", the sign-out question - never taken for a
change elsewhere, which would throw every note away unsaid.
After an import - or an administrator deleting their own progress - the tab
writes a marker to `localStorage` (`piano-academy:progress-replaced:<id>`), and
the person's other tabs load the progress at once instead of waiting for
their next save to be refused.

**A round keeps no copy of the progress (stage 5).** The review found the
Note Trainer, the drill step and the sequence player taking a copy of the
note progress when a round started and saving that copy whole after every
answer: after a reload (another tab's import, a 409) the copy - the old
progress - went out under the new generation, and the server took it. Of the
two ways out - the pages drop their copy and start a fresh round when the
store reloads, or the store takes one note at a time - the second was chosen:
one place (`ProgressStore.updateNote()`) instead of three pages and every
page to come; a round goes on undisturbed; and the answer is built on the
note as the store holds it at that moment, the imported one included. There
is no "save this whole map" any more, so a page cannot bring the bug back.

**The own progress file asks twice before it replaces.** Bring back a file:
the size is checked in the browser (nothing over `EXPORT_LIMIT` is sent), a
file is refused while a save is waiting, then the server's dry run shows what
is saved now and what the file brings - nothing written. Bringing it in is a
second press; over existing progress a question names that it is replaced,
never mixed. Every refusal is worded from its code; the server's sentence is
never shown to a learner.

**Signing out asks only when it would lose something.** Sign out first lets
what is waiting arrive (a failed save goes once more, with a spinner on the
button). If progress or the path still did not get through - they live in the
page only - or finished rounds could not be kept by the browser, the learner
is asked in their language before the IAM ends the session. Rounds in the
outbox are kept for the next sign-in and are no reason to ask.

**One top bar, the family's - five sections, and Piano's own fold.** "All
other should have same top menu bar structure": the survey's bar, rebuilt in
Piano's tokens (`layouts/top-bar`). The five sections stay (Learn, Note
Trainer, Sheet Practice, Songs, Stats - the trainer is one of the app's
modes). With the real labels the widest row is 1237 px (Slovak, "Not saved
yet" showing, a device name at its widest; 1174 with "No piano"), measured by
the browser check's `--measure`; so `PHONE_BAR_MAX` is 1240, not the
survey's 760, and above it only the person's name gives way (it shows from
1441 px). On a phone the brand is "Piano" (`brand.short`: "anotoki Piano
Academy" does not fit at 360 px beside the piano, the language, the theme and
the menu button). (Since 2026-10-08 the bar is the family's own component
with its segmented theme switch, and the fold is 1320: "the anotoki
family's kit", above.)

**The piano is an app widget in the bar.** A dot (green: connected) and the
device's name - "No piano" without one, the dot alone on a phone; the button
opens a box with the state, the devices, Connect and Rescan. A disclosure,
not a menu (it holds a list and buttons): the focus goes to the list, Escape
gives it back to the button, and the box stays inside a 360 px screen.

**"Not saved yet": a pill on a desktop, a dot on a phone.** The pill stands
beside the piano; on a phone a dot on the menu button (said to a screen
reader through `aria-describedby`), and the sentence is the menu's first
line.

**Every control's name holds what it shows (stage 5).** WCAG 2.5.3 (label
in name), added to the family's bar spec: a voice user says what they see.
The language button shows "SK" and is named "Jazyk: Slovenčina (SK)"
(`language.button` gets `{code}`; 004 rewords 003's string only where it
is still 003's); the piano's button starts with its label ("No piano: Piano
not connected"); the brand link is "anotoki Piano Academy: Learn". The
browser check compares each control's drawn words with its name.

**A sign-in that cannot start mid-practice says why (stage 5).** With the app
running, the bar's and the banner's Sign in go through the SDK; when the
browser refuses the storage the sign-in in progress is kept in, nothing
would happen at all. Piano has no toast: the signed-out banner adds the
sign-in card's sentence for that failure. Before the app runs a signed-out
visitor has no menu button on a narrow screen either - its menu would hold
nothing.

**The admin panel's bar is English.** Under `/admin` `TranslationService`
answers every key from English's own strings (the bundle's `english`,
`effectiveLanguage`), as the survey's does, and the bar shows the admin
sections (English literals, the admin panel being English) with no chooser and
no piano; the learner's choice stays for the way back. The admin layout's
own section nav and the footer's admin link went into the bar.

**The footer keeps the version.** "Piano Academy v0.2" opens What's new; the
language and the theme moved into the bar.

**Version 0.2, with its entry.** The owner decided builders add a changelog
entry in plain words and the version (only `frontend/package.json`'s version
line - the owner edits that file too): sign-in always, the own progress file,
the one bar, the pages in Slovak (they shipped without an entry). The 0.1
entry's "no sign-in on your own computer" is history and stays as written.

**A browser check in the repository.** `.claude/skills/check-in-browser`
(the survey's idea, Piano's tours): headless Edge through `playwright-core`
(kept outside the repository, in `<temp>/pw`), the stand-in IAM, a throwaway
`piano_test_browser_<port>` database, ports 8590 and 8597 (others when they
are taken). It checks by bounding boxes, not by eye alone - and its
screenshots are looked at.
