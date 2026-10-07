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
  /api/translations/{code}`, `GET /api/health`, `/api/admin/migrations...`
  (and `GET /api/site-status`). "Behind" below means that answer;
- the database out of reach: through - a route that needs it answers
  `503 database_unavailable` as ever.

A token that is sent must check out, or the answer is `401 invalid_token`
(`WWW-Authenticate: Bearer realm="piano-academy", error="invalid_token"`); no
token where one is needed is `401 sign_in_required`.

Only `Authorization: Bearer ...` is a sign-in; another scheme (`Basic ...`)
counts as no header. While the IAM says this app does not require sign-in,
one's own progress (the next section's first four routes) is also a
**visitor's** - see "Without signing in" below.

## Anybody (no token read)

| Route | Answers |
| --- | --- |
| `GET /api/health` | `{ok: true}`; asked from this computer (loopback) also `database` and `pending` (the migrations still to apply). Answers while behind |
| `GET /api/auth/config` | `{issuer, clientId, loginRequired}`: how the browser signs in, and whether the IAM says this app requires sign-in (its "Sign-in required" switch for `piano-academy`, read by the SDK from `{issuer}/api/public/applications/piano-academy`, kept a minute, `true` whenever nothing better is known - an IAM out of reach with nothing read, a 404, an answer about another app). While it is `true`, every learner route requires a token; while `false`, one's own progress is also a visitor's (below). Answers while behind: somebody can sign in then |
| `GET /api/translations/{code}` | a language's strings with English underneath: `{language, languages, values, english?}`; ETag + `no-cache` (304); an unknown code is answered in English, a code that is none is 404. Answers while behind, from the words the database has - a database without the words' tables yet (002 waiting): `503 {error, code: "update_pending"}` with `Retry-After: 60` |
| `GET /api/site-status` | where the site stands, for the pages: `{state: "ready" \| "not_set_up" \| "update_pending" \| "unavailable", installed}` and nothing else (the family's `MigrationsRoutes::status()`); always `200`, in every state, to anybody - no token, key or header is read, so a sign-in the IAM requires, a token that does not verify or a settings file PHP cannot run never turns it into a 401 or a 500; `no-store` |

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
an administrator's delete (`DELETE /api/admin/people/{id}`) and a visitor's
move at sign-in that adds notes or path steps (`POST /api/visitor/move`) start
a new generation. Ordinary saves keep it: two tabs learning side by side never refuse
each other (the last save wins, as before). An import answers the new generation.

### Without signing in (when the IAM says sign-in is not required)

`GET /api/state`, `PUT /api/progress`, `PUT /api/path` and `POST /api/sessions`
are also a **visitor's** (`api/visitors.php`): somebody who has not signed in,
known by the key the server handed their browser, sent back in the
`X-Visitor-Key` request header. Who a request is, in this order: a Bearer
header - that person, or 401 (the key is not read); sign-in required - 401
`sign_in_required` (the key is not looked up); `X-Visitor-Key` - that visitor;
else nobody.

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

The limits and the trusted proxies can be changed in the optional
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

| Route | Answers |
| --- | --- |
| `GET /api/admin/languages` | `{languages: [{code, name, nativeName, enabled, sortOrder, seeded}]}`, hidden ones too |
| `GET /api/admin/translations` | the grid: `{languages, keys: [{name, description, values: {code: text}}]}` |
| `PUT /api/admin/translations` | `{values: {key: {code: text}}}`, the changed ones -> the grid; 422 with the key, language and placeholder a check refused |
| `GET /api/admin/translations/{code}/export` | that language's own strings, `{key: text}` |
| `PUT /api/admin/translations/{code}/import` | `{key: text}` -> the grid; empty strings passed over, unknown keys 422 |

## ADMIN alone

`403 forbidden` "Only an administrator of Piano Academy may do this." for
anybody else signed in, an editor included.

| Route | Answers |
| --- | --- |
| `POST /api/admin/languages` | `{code, name, nativeName, enabled?}` -> 201 `{language}`; 409 `language_exists`, 422 `invalid_language`, `too_many_languages`. Behind -> 503 |
| `PUT /api/admin/languages/{code}` | `{name?, nativeName?, enabled?, sortOrder?}` -> `{language}`; 409 `fallback_language`. Behind -> 503 |
| `DELETE /api/admin/languages/{code}` | 204, its strings go with it; 409 `fallback_language`, `seeded_language`. Behind -> 503 |
| `GET /api/admin/people` | `{people: [{id, username, firstSeen, lastSeen, notes, steps, sessions}], visitors: {count, sessions}}`, the people who signed in, the most recently seen first; the visitors only counted (they go 30 days after their last visit). Behind -> 503 |
| `DELETE /api/admin/people/{id}` | 204: everything the app keeps of that person goes, in one transaction - notes, path, sessions, an `imports` row, the users row (a string they reworded stays, by nobody). A tab of theirs still open gets `409 progress_changed` on its next save; their next visit starts empty. `404 not_found` for an id with nobody (an `{id}` that is not a whole number is no route). Deleting oneself is allowed. Behind -> 503 |
| `GET /api/admin/migrations` | the admin panel's Migrations page - the anotoki family's (`anotoki/lib`'s `MigrationsRoutes::admin()`, `Migrator::status()`): `{sets: ["piano_academy"], applied: [{set, name, applied_at}], pending: [{set, name, ready, blocked}], missing: [{set, name, applied_at}]}` - applied in the order they ran, `applied_at` ISO 8601 UTC ("2026-10-06T10:01:02Z"); pending in the order they will run; missing: recorded, but the file is not there. Reads only the migrations (the role check keeps the caller's users row, as on every signed-in route) - works while behind |
| `GET /api/admin/migrations/file?set=piano_academy&name=NNN_name.sql` | `{set, name, sql}`: a file of the set as it is; anything else `404 {code: "not_found", message}` - works while behind |
| `POST /api/admin/migrations/apply` | applies what is pending, in order, each file in its own transaction with its record, under the update lock, stopping at the first that fails (rolled back whole) -> `{applied: [{set, name}], failed: {set, name} \| null, error: string \| null, note: null}` - `error` is what PostgreSQL said, "statement N of M: ..." and the statement's first lines (ADMIN only; logged too, "[db] the migration ... failed"; the owner, 2026-10-04) - a failure is answered 200, so the page can say it; `409 {code: "busy", message}` while setup.php, `php migration.php` or another update runs, nothing applied - works while behind. (Until 2026-10-04: `/api/admin/database` and `.../update` - gone, nothing outside the app used them.) |