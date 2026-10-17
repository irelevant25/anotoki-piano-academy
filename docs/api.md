# The API

Every route starts with `/api/`. Answers are JSON; an error is
`{error: sentence, code}` (plus fields of its own). Bodies are JSON only:
anything else is `415 unsupported_media_type`, too large `413 too_large`. There
is no CORS anywhere: another site's page cannot call a write.

Before any route, the site's gate (the anotoki family's - `anotoki/lib`'s
`SiteGate`, the same on every anotoki site; its bodies are the family's,
`{code, message}`):

- no settings (a file missing, saying too little, or not PHP that runs) ->
  `503 {code: "not_set_up", installed, message}`, with
  `setup: "/setup.php"` only while the site was never installed
  (`storage/installed.lock`), on every path but `GET /api/site-status`;
- a migration waiting -> `503 {code: "update_pending", message: "The site is
  being updated. Try again in a few minutes."}` with `Retry-After: 60` on
  every path but the open ones: `GET /api/auth/config`, `GET
  /api/translations/{code}`, `GET /api/health`, `/api/admin/migrations...`,
  the error log's `/api/admin/errors...` and the backups'
  `/api/admin/backups...` but a restore (and `GET /api/site-status`).
  "Behind" below means that answer;
- the database out of reach: through - a route that needs it answers
  `503 database_unavailable` as ever.

Who is asking is read once, in front of every route but the first four
below (the anotoki family's `Identify`, `anotoki/lib` 0.5.0). A token that is
sent must check out, or the answer is `401 invalid_token`
(`WWW-Authenticate: Bearer realm="piano-academy", error="invalid_token"`) -
`Authorization: Bearer` with no token too; no token where one is needed is
`401 sign_in_required`. The library's refusals of who is asking are
`Cache-Control: no-store`.

Only `Authorization: Bearer ...` is a sign-in; another scheme (`Basic ...`)
counts as no header. While the IAM says this app does not require sign-in,
one's own progress (the next section's first four routes) is also a
**visitor's** - see "Without signing in" below.

## Anybody

The first four read no token at all; the last two read who is asking as every other route does (a token that does not check out is `401 invalid_token` there too).

| Route | Answers |
| --- | --- |
| `GET /api/health` | `{ok: true}`; asked from this computer (loopback) also `database` and `pending` (the migrations still to apply). Answers while behind |
| `GET /api/auth/config` | `{issuer, client_id, login_required, sign_in_available}` (the anotoki family's `AuthRoutes::config()`, snake_case; `no-store`): how the browser signs in, and whether the IAM says this app requires sign-in (its "Sign-in required" switch for `piano-academy`, read by the library's `SignInRule` from `{issuer}/api/public/applications/piano-academy`, kept a minute, `true` whenever nothing better is known - an IAM out of reach with nothing read, a 404, an answer about another app). `sign_in_available`: `false` once the IAM answered that it does not know this app - the pages offer no sign-in then. While `login_required` is `true`, every learner route requires a token; while `false`, one's own progress is also a visitor's (below). Answers while behind: somebody can sign in then |
| `GET /api/translations/{code}` | a language's strings with English underneath: `{language, languages: [{code, name, native_name}], values, english?}` (the anotoki family's bundle, `anotoki/lib`'s `TranslationsRoutes::bundle()` - the IAM's format, snake_case; the library's own words, `anotoki.*`, among the values); ETag + `no-cache` (304); `sk-sk` is answered by `sk`, an unknown code in English, a code that is none is `404 not_found`. Answers while behind (the gate's open path, `TranslationsRoutes::openPath()`), from the words the database has - without the words' tables or their English yet (a fresh database before its first Apply), or with the database out of reach: `503 {error, code: "translations_unavailable"}` with `Retry-After: 60`, and the pages read the English kept in code |
| `GET /api/site-status` | where the site stands, for the pages: `{state: "ready" \| "not_set_up" \| "update_pending" \| "unavailable", installed}` and nothing else (the family's `MigrationsRoutes::status()`); always `200`, in every state, to anybody - no token, key or header is read, so a sign-in the IAM requires, a token that does not verify or a settings file PHP cannot run never turns it into a 401 or a 500; `no-store` |
| `POST /api/feedback` | a message from the form at the foot of every page (the family's `FeedbackRoutes::public()`): `{kind: "bug" \| "idea" \| "other", section?, subject?, message, email?, page?, language?, anonymous?}` -> `201 {ok: true}` (no id). `section` one of `Learn`, `Note Trainer`, `Sheet Practice`, `Songs`, `Stats`; `page` kept as a path, without its query. Who sent it comes from the token alone - nobody for a visitor; the reply address is `email` as the form sends it (the form writes a signed-in sender's account address in, theirs to keep, change or clear) - the server fills none in (anotoki-lib 0.5.0) - and with `anonymous` neither the id nor an address is kept. Nothing of where it came from is kept. `422` with its code (`kind_unknown`, `message_required`, `subject_required`, `subject_too_long`, `section_unknown`, `email_invalid`, `too_long`); `429 too_many` with `retry_after` past 5 an hour or 20 a day from one sender - a person by their account, a visitor (and an `anonymous` message) by their address bucket - or 300 a day from the visitors together, as many from the people signed in; a filled `website` (the honeypot) is answered as a kept message, and nothing is kept. No mail. `503 feature_unavailable` while its table waits, `503 storage_unavailable` when the counts cannot be kept; behind -> 503 |
| `POST /api/client-errors` | an error a page met in the browser, into the error log (the family's `ErrorLogRoutes::client()`; the pages' reporter, `@anotoki/lib/error-report`, sends it through the app's HttpClient - a person's with their token): `{type?, message, page?, stack?, status?}` -> `204`, written as `source: client`, by the person (none for a visitor), redacted again (the page scrubs it first); JSON only (`415`), 8 KB at most (`413`), a message (`422 message_required`); `429 too_many` with `retry_after` past 20 an hour from one sender - a person by their account, a visitor by their address bucket - or 500 a day from the visitors together, as many from the people signed in. Behind -> 503 (the gate's, not written) |

## Signed in (any role, or none): one's own progress

Behind -> 503 on every route here, `POST /api/sessions` too (the gate holds a
round as it holds a save). Who it is comes from the token alone, or - for the first
four routes, while sign-in is not required - from the visitor key ("Without
signing in" below). An id in the address or the body is nobody's.

| Route | Answers |
| --- | --- |
| `GET /api/state` | `{progress, sessions, path, generation}` - `generation`: the generation of this progress (below). Nobody (no token, no key, sign-in not required): `{"progress":{},"sessions":[],"path":{"steps":{}},"generation":0}`, nothing read or written |
| `PUT /api/progress` | the whole note-progress object, keyed by MIDI number, with the `Progress-Generation` header -> 204 |
| `PUT /api/path` | `{steps: {"unitId/stepId": {...}}}`, with the `Progress-Generation` header -> 204 |
| `POST /api/sessions` | one finished round -> 201 with the stored session; with an `Idempotency-Key` the browser used before: 200 and nothing added. No generation: a round is added, never written over anything |
| `GET /api/me/export` | their own progress as a file to download: `{format: "piano-academy-export", version: 1, exportedAt, userId, progress, path, sessions}`, `Content-Disposition: attachment; filename="piano-academy-progress-YYYY-MM-DD.json"`. `409 export_too_large` (with `limit`) when it would not fit through the import |
| `POST /api/visitor/move` | with `X-Visitor-Key` too: at sign-in, this browser's progress without signing in into the account - see "The move at sign-in" below |
| `POST /api/me/import` | an export (the body, as the file holds it) into their own account; the file's `userId` is not read. See below |

### The generation: a tab that loaded the progress before an import or a delete

Each person's progress has a **generation**, a whole number `GET /api/state`
answers. A save of a whole document names the generation it was made to, in the
header `Progress-Generation: <n>`:

- missing, empty or not a whole number from 1: `428 generation_required`;
- not the generation there is now: `409 progress_changed` with
  `generation` (the one now, or `null`) - **nothing is saved**. The tab loads
  the progress again (`GET /api/state`) and goes on from there; it never sends
  the old documents again.

Only an import (`POST /api/me/import`, or `php tools/progress.php --import`),
an administrator's delete (`DELETE /api/admin/people/{sub}`) and a visitor's
move at sign-in that adds notes or path steps (`POST /api/visitor/move`) start
a new generation. Ordinary saves keep it: two tabs learning side by side never refuse
each other (the last save wins, as before). An import answers the new generation.

### Without signing in (when the IAM says sign-in is not required)

`GET /api/state`, `PUT /api/progress`, `PUT /api/path` and `POST /api/sessions`
are also a **visitor's** (`api/visitors.php`): somebody who has not signed in,
known by the key the server handed their browser, sent back in the
`X-Visitor-Key` request header. Who a request is, in this order (the
family's `Identify`): a Bearer header - that person, or 401 (the key is not
read); sign-in required - nobody, so these routes answer 401
`sign_in_required` (the key is not looked up); `X-Visitor-Key` - that
visitor, or `401 visitor_unknown`; else nobody. The key is read on every
route but the public ones, and opens none but these four (the browser sends
it to them alone).

- **Nobody's first save makes a visitor**, in the save's own transaction once
  its body checks out: a whole-document save names `Progress-Generation: 0`
  (anything else: `409 progress_changed`, `generation: null`). The answer
  (204, or 201 for a round) carries `X-Visitor-Key: <43 characters>` - the
  only time the key leaves the server -, `Progress-Generation: <the new
  visitor's>` and `Cache-Control: no-store`. A save that fails or is refused
  makes nobody.
- **The visitor** then reads and saves as a person does (the generation
  rules above; a save to 0 is a second tab's: `409 progress_changed`).
- `401 visitor_unknown`: a key nobody has (unused for 30 days and deleted, or
  moved into an account at a sign-in), or of the wrong shape - or a row that
  went while the request was on its way.
- `429 too_many_visitors` (`Retry-After: 3600`): too many visitors at once,
  or too many new ones this hour from this address (an IPv6 /64 counts as
  one) or in all - new visitors only.
- `422 visitor_limit` with `params: {limit: "sessions", max}`: as many rounds
  as a visitor keeps. `413 too_large`: a visitor's progress or path over
  128 KiB.
- `503 visitors_unavailable` (`Retry-After: 60`): migration 005 not applied
  yet - which the gate answers first ("behind") on every route; this one is
  for a save that would reach such a database all the same.
- A key never opens `/api/me/export`, `/api/me/import` or `/api/admin/...`:
  `401 sign_in_required`.

The address a limit counts is the connection's, or - from one of the trusted proxies, Cloudflare's published ranges by default - the one address its `CF-Connecting-IP` names - the one header ever read: X-Real-IP, True-Client-IP and X-Forwarded-For are the caller's own words (an IPv6 address by its /64) - and, with the origin secret (the optional `backend/config/cloudflare.local.php`), only on a request that carries it in `X-Anotoki-Origin`, any other from Cloudflare counting as its edge (a file there that cannot be read cleanly is a secret no request carries: every request from Cloudflare counts as its edge); `visitor_starts` keeps a keyed hash of it, never the address. The limits and the trusted proxies can be changed in the optional
`backend/config/visitors.local.php` (`backend/config/config.php`). Visitors
unseen for 30 days are deleted after somebody's answer.

### The move at sign-in

`POST /api/visitor/move` with the person's token **and** `X-Visitor-Key`
(no body), whatever the IAM's switch says: the visitor's progress becomes the
person's, in one transaction (`visitorMove()` in `api/visitors.php`).

- **Notes**: a note the person has stays as it is; the visitor's others are
  added.
- **Path steps**: a step both have is merged - `bestAccuracy` the larger,
  `attempts` added, `passedAt` the earlier (a pass is never lost),
  `lastAccuracy` / `updatedAt` from the newer; other fields the person's,
  the visitor's added. The visitor's other steps are added.
- **Rounds**: every one comes, with its id, Idempotency-Key and time (one
  whose id or key the person already has stays behind).
- A merged notes or path document over 256 KiB is not made: the person's
  stays, the visitor's count as `kept`.
- Then the visitor and its key are gone (`401 visitor_unknown` from then on).
  When the person's notes or path changed, their progress has a new
  generation: their other tabs get `409 progress_changed` and load it again.

`200 {found: true, notes: {moved, kept}, steps: {moved, merged, kept},
sessions, generation}` - `sessions` the rounds moved, `generation` the
person's now. A key nobody has (moved already, swept, never there):
`200 {found: false, ...}` with zeros and `generation: null` - the move can be
asked again. No key, or one that is not a key: `422 invalid` with
`field: "visitor_key"`. No token: `401`. Another request holding the visitor
or the person's rows longer than `move_lock_timeout_ms` (5 s), a deadlock, or
a round that collided: `503 visitor_move_retry` with `Retry-After: 2`, nothing
moved. The person's own row deleted meanwhile: `401 sign_in_required`.

### `POST /api/me/import`

`?dryRun=true` (or `1`): what it would do, nothing written -
`{dryRun: true, hasProgress, current: {notes, steps, sessions}, incoming: {notes, steps, sessions}, leftOut}`.
`hasProgress` true means the real import needs `?replace=true`.

Without a dry run:

| Case | Answer |
| --- | --- |
| an account without progress (empty documents count as none) | 200 `{notes, steps, sessions, replaced: false, generation, leftOut}` |
| an account with progress, no `?replace=true` | `409 has_progress` with `current: {notes, steps, sessions}` - nothing changes |
| `?replace=true` | its notes, path and sessions go and the file's take their place, in one transaction: 200 `{..., replaced: true, generation, leftOut}` - never a mix of the two |
| not JSON, not an object, not a Piano Academy export (`format`) | `422 not_an_export` |
| another `version`, or a progress / path / sessions part that is not one | `422 invalid_export` (the sentence says which) - nothing of it is taken |
| a body over `EXPORT_LIMIT` (5 MiB, the export's own limit) | `413 too_large` |
| not sent as JSON | `415 unsupported_media_type` |

A session in the file that a `POST /api/sessions` would refuse is left out and
counted in `leftOut`. The import takes the person's users row first (`FOR
UPDATE`): two imports into one account, or an import and a save, take turns -
the second sees what the first left (a save then gets `409 progress_changed`, a
second import `409 has_progress`).

## The staff: EDITOR or ADMIN

`403 forbidden` "This is for the people who keep Piano Academy's words. Ask the
site's administrator for the editor role." for anybody else signed in. Behind
-> 503 (before the person is looked up).

The words' routes here and the languages' under ADMIN are the anotoki
family's (`anotoki/lib`'s `TranslationsRoutes::strings()` and `::languages()`,
on every anotoki site): the IAM's wire format, snake_case; who may call them
is this app's (`requireRole()` on each group, `api/routes/admin.php`). A body
is read by the library itself: over 1 MiB `413 too_large`, not JSON `415
unsupported_media_type`, empty `422 empty_body`, broken `400 invalid_json`;
the words' tables not there yet `503 translations_unavailable` (`Retry-After:
60`); a `{code}` that is no language code `404 not_found`. A save is checked
string by string (placeholders, markup, length) and refused whole, `422` with
the key, the language and what is wrong. Answers carry `Cache-Control:
no-store`. A save, an import and a language's change are written into the
audit log (`translations.saved`, `translations.imported`,
`language.created|updated|deleted`), by the request's person; so is a
person's own import (`progress.imported`).

| Route | Answers |
| --- | --- |
| `GET /api/admin/languages` | `{languages: [{code, name, native_name, enabled, sort_order, seeded, strings}]}`, hidden ones too |
| `GET /api/admin/translations` | the grid: `{languages: [the same], keys: [{name, description, values: {code: text}}]}` - the library's keys (`anotoki.*`) among them |
| `PUT /api/admin/translations` | `{values: {key: {code: text}}}`, only what changed -> the grid; an empty text takes the string away (English never) |
| `GET /api/admin/translations/{code}/export` | that language's own strings as a file, `{key: text}` (`translations-{code}.json`) |
| `PUT /api/admin/translations/{code}/import` | `{key: text}` -> the grid; empty strings passed over; checked as a save is, all of it or none of it (a key the database has not: `422 unknown_key`) |

## ADMIN alone

`403 forbidden` "Only an administrator of Piano Academy may do this." for
anybody else signed in, an editor included. The People and admin tools'
routes are the anotoki family's (`anotoki/lib` 0.5.0), in its shapes; each
group checks the site's ADMIN once more itself, behind this app's check.

| Route | Answers |
| --- | --- |
| `POST /api/admin/languages` | `{code, name, native_name, enabled?}` -> 201 `{language}`; 409 `language_exists`, 422 `invalid_language`, `too_many_languages`. Behind -> 503 |
| `PUT /api/admin/languages/{code}` | `{name?, native_name?, enabled?, sort_order?}` -> `{language}`; 409 `fallback_language`. Behind -> 503 |
| `DELETE /api/admin/languages/{code}` | 200 `{strings}`: the strings that went with it; 409 `fallback_language`, `seeded_language` (English and Slovak, which the migrations write strings for). Behind -> 503 |
| `GET /api/admin/people?q=&page=` | the family's People page (`PeopleRoutes::admin()`): `{people: [{sub, name, first_seen_at, last_seen_at, anonymized_at, iam_url, notes, steps, sessions}], columns, total, page, page_size: 50, visitors: {count, sessions}, sync, ready, problems}` - the people who signed in, the most recently seen first, 50 a page; `q` a name (any case) or an IAM id (`422 invalid_query` for one no name could be); `anonymized_at` when the IAM deleted the account (the name is `deleted-{sub}` then); `sync` where the scrub stands; the visitors only counted (they go 30 days after their last visit). Behind -> 503 |
| `DELETE /api/admin/people/{sub}` | `200 {deleted: {Notes, Steps, Rounds}}` (the counts): everything the app keeps of that person goes, in one transaction - notes, path, sessions, an `imports` row, the users row (a string they reworded stays, by nobody), and their feedback's reply address and browser (the words stay). A tab of theirs still open gets `409 progress_changed` on its next save; their next visit starts empty. `404 not_found` for nobody - a visitor's id too. Deleting oneself is allowed. Audited (`person.data_deleted`, with `deleted` and `_txid`: written inside the delete's own transaction - none is made without it, so while the audit log's table waits for an update the answer is `503 feature_unavailable` and nothing goes); a restore of a backup made before does the delete again. The page's question is all it asks. Behind -> 503 |
| `POST /api/admin/people/sync` | the scrub of the IAM's deleted accounts now (it also runs after an answer, at most hourly): `{run, sync}`; audited (`people.synced`). Behind -> 503 |
| `GET /api/admin/migrations` | the admin panel's Migrations page - the anotoki family's (`anotoki/lib`'s `MigrationsRoutes::admin()`, `Migrator::status()`): `{sets: ["anotoki_admin", "piano_academy", "anotoki_translations", "anotoki_people"], applied: [{set, name, applied_at}], pending: [{set, name, ready, blocked}], missing: [{set, name, applied_at}]}` - applied in the order they ran, `applied_at` ISO 8601 UTC ("2026-10-06T10:01:02Z"); pending in the order they will run; missing: recorded, but the file is not there. Reads only the migrations (the role check reads the token alone and records nobody) - works while behind |
| `GET /api/admin/migrations/file?set=piano_academy&name=NNN_name.sql` | `{set, name, sql}`: a file of a set as it is; anything else `404 {code: "not_found", message}` - works while behind |
| `POST /api/admin/migrations/apply` | a backup of the database as it is first (the library's before-migration backup, once per list of pending files; `note` names it; one that cannot be made stops the update before anything runs), then applies what is pending, in order, each file in its own transaction with its record, under the update lock, stopping at the first that fails (rolled back whole) -> `{applied: [{set, name}], failed: {set, name} \| null, error: string \| null, note}` - `error` is what PostgreSQL said, "statement N of M: ..." and the statement's first lines (ADMIN only; logged too, "[db] the migration ... failed"; the owner, 2026-10-04) - a failure is answered 200, so the page can say it; `409 {code: "busy", message}` while setup.php, `php migration.php` or another update runs, nothing applied - works while behind; audited (`migrations.applied`). (Until 2026-10-04: `/api/admin/database` and `.../update` - gone, nothing outside the app used them.) |
| `/api/admin/errors` | the error log (the family's `ErrorLogRoutes::admin()`; `storage/logs/`, 30 days): `GET ?days=&level=&status=&search=` the report (`{total, errors, warnings, notices, distinct, truncated, days, daily, statuses, groups, dropped}`), `GET /{fingerprint}` every occurrence of one, `DELETE ?before=YYYY-MM-DD` the days before (none: all) -> `{deleted}`, audited (`errors.cleared`). A line holds no query, header, body, token or address. Works while behind |
| `/api/admin/audit` | the audit log (`AuditRoutes::admin()`), read only: `GET ?actor=&action=&target_type=&target_id=&from=&to=&page=` -> `{total, page, pageSize: 50, items}`, `GET /facets`. `503 feature_unavailable` while its table waits |
| `/api/admin/feedback` | feedback (`FeedbackRoutes::admin()`): `GET ?kind=&status=&section=&search=&page=` -> `{total, page, pageSize: 25, items}`, `GET /facets`, `GET /unread` -> `{unread}` (the admin bar's count), `GET /{id}` -> `{message}` (a new one becomes read), `PUT /{id}/status {status: new \| read \| resolved \| spam}`, `DELETE /{id}` -> `{deleted: true}` - both audited (a delete's `feedback.deleted` with the message's `created_at`, written inside the delete's transaction: a restore deletes it again by both; `503 feature_unavailable` while the audit log's table waits). Each item's `user_name` / `handled_by_name` is this app's copy of the IAM's name. Spam goes after 30 days, a resolved message a year after it was resolved. `503 feature_unavailable` while its table waits |
| `/api/admin/backups` | the backups (`BackupsRoutes::admin()`; `storage/backups/`): `GET` -> `{backups, status}` (each backup's `sealed` and its maker's name, `created_by_name`), `GET /proof` -> `{kind: "recent_sign_in"}`, `POST {description?}` -> `201 {backup}`, `GET /{id}`, `DELETE /{id}`, `POST /{id}/ticket` -> `{url, expires_in}` (a download), `GET /{id}/preview` (what a restore would take away), `POST /{id}/restore {confirm: the id's last 6 characters}`. Making, downloading, deleting and restoring one need a sign-in of the last ten minutes: `403 reauth_required` otherwise (the page offers "Sign in again"); each is audited (`backup.*`). A restore runs only for a backup sealed by this installation (an HMAC under `storage/anotoki-lib.key`; one made before anotoki-lib 0.5.0, elsewhere or changed since: `422 archive_invalid`, restored offline), only where the database's migrations and columns are the backup's (`409 schema_differs`), after a backup of its own; inside its transaction it does again every People delete and feedback delete made since the backup, and every progress takes a new generation (a page left open since before gets `409 progress_changed` on its next save) - what fails there rolls it back whole (`500 restore_failed`); once committed, the scrub of the IAM's deleted accounts runs again - what could not be done is its `after_restore_error`. Not encrypted (the owner, 2026-10-11) - sealed. Kept: the newest 14 daily, 5 before an update, 5 before a restore; one made by hand until the owner deletes it - no backup goes for its age (the owner, 2026-10-11). Works while behind, but a restore |
| `GET /api/admin/backups/{id}/file?ticket=` | the backup itself, as an attachment - deliberately outside every admin check (a browser's navigation sends no token): the ticket from `POST /{id}/ticket` is the check - good once, for that backup, for 60 seconds; anything else `403 ticket_invalid` |