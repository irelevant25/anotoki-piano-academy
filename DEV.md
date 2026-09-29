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
| The anotoki IAM | - | only to try signing in: `../anotoki-iam`, its own DEV.md |

`backend/vendor/` is committed (the hosting cannot run Composer), so Composer
is only needed to change PHP dependencies. `frontend/.npmrc` sets
`legacy-peer-deps`: npm 10.9's installer trips over the test runner's optional
peers otherwise.

## First setup

Everything that belongs to one installation - the database connection, how
people sign in, the IAM's address and this app's client id there, the owner's
IAM user id, the key cache - lives in `backend/config/database.local.php` and
`backend/config/auth.local.php`. They are gitignored and **required**: without
them the API answers every request `503 {code: "not_set_up"}`, and the app shows
"Piano Academy is not set up yet" with a link to the setup page. Nothing falls
back to a committed default. The setup page writes them.

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

- **Database**: the server, port, database name (`piano_academy`), user and
  password. **Test the database** tries them without saving.
- **Sign-in**: **No sign-in** (auth mode `none`) for your own copy - every
  request acts as *Your IAM user id* (1 unless the IAM shows you another), and
  only this computer is answered. Or **the anotoki IAM** (auth mode `iam`):
  its address, `http://localhost:4300` on a development machine, and the client
  id `piano-academy`. **Test the IAM** fetches
  `{address}/.well-known/openid-configuration` and its keys.
- **Your old progress**: bring in `server/data/` once, into your account.

**Save** creates the database if it is missing, applies the migrations, writes
the two files and does the import.

`start.ps1` / `start.sh` do all this for the owner's own copy: they build the
frontend once, serve it from the backend at `http://127.0.0.1:8300` (PIANO_PORT
changes the port), bring the database up to date, and open the setup page the
first time.

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
app), and `/` after signing out. On the setup page choose the IAM, with the
address `http://localhost:4300`, and **Save**. Sign in at
`http://localhost:4500`; only accounts with a role in Piano Academy (the IAM's
admin console) get in.

## Day to day

| | Command | Address |
| --- | --- | --- |
| API and setup page | `cd backend && composer start` | `http://localhost:8300` |
| The app | `cd frontend && npm start` | `http://localhost:4500` |
| The owner's copy | `start.ps1` / `start.sh` | `http://127.0.0.1:8300` |

Command-line tools in `backend/`, all reading the same settings:

```bash
php migration.php [--status|--dry-run]          # apply pending migrations (setup.php does too)
php tools/progress.php --export=FILE [--user=ID] # one person's progress as a file
php tools/progress.php --import=PATH [--user=ID] # into an account that has none: an export, or a folder of old files
php tools/progress.php --owner=ID                # you are IAM user ID: your progress moves there
php tools/build.php [--out=DIR]                  # the upload (see Building and deploying)
```

The database is `migrations/piano_academy/NNN_name.sql`, applied in order by the
same engine as the IAM's and the genshin site's (`api/migration_runner.php`).
Never edit an applied migration; add the next number.

## Tests

```bash
cd backend
php tests/run.php                  # every tests/unit and tests/api file, four at a time

cd frontend
npm test                           # the unit tests (Vitest)
npm run build                      # the production build
```

The backend tests start the real router under PHP's built-in server (and the
upload, without a router, as a host would run it), each file against a
throwaway `piano_test_*` database copied from `piano_test_template`, with
settings of its own in a temp folder (`PIANO_TEST_CONFIG`, honoured only for
`piano_test_` databases). They borrow only the PostgreSQL server and user from
this machine's `config/database.local.php`, so run the setup once first. They
never touch `piano_academy` or `server/data/` (the import tests use copies).
To run them under a second PHP - the hosting's version - call that binary
instead of `php`: `run.php` starts each file with the PHP it runs under.

A throwaway copy of the app, for trying things in a browser:

```bash
cd backend
php tests/tools/testdb.php template       # the empty database it is copied from (run.php keeps it current)
php tests/tools/testenv.php storage/manual --db=piano_test_manual --auth=none
PIANO_TEST_CONFIG=storage/manual php -S 127.0.0.1:8399 router.php
# afterwards: php tests/tools/testdb.php drop piano_test_manual
```

(`storage/` is gitignored - the folder holds a copy of the database password.)

For sign-in, the stand-in IAM `tests/tools/fake-iam.php` (never the real one) -
its header says how to run it; `--auth=iam --issuer=http://127.0.0.1:8397` points
the throwaway copy at it.

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
   program. Enter the database, the IAM (`https://iam.anotoki.eu`, client id
   `piano-academy`), and - to bring your progress along - an export from your
   own computer (`php tools/progress.php --export=my-progress.json`) with your
   IAM user id (the IAM admin console shows it under Users). **Install** writes
   the settings, makes the tables, writes `storage/installed.lock`, and deletes
   the token and itself.
4. Sign in on the site.

**Later versions**: build and upload again (the settings and the lock stay). A
version with a new migration needs the setup page once more: delete
`storage/installed.lock`, and open `/setup.php` (the upload carries it) with the
same details - it applies what is missing and keeps everybody's progress.

If a whole site answers "500 Internal Server Error" after an upload, the host
may not allow a line of `.htaccess` (`Options -Indexes` or `CGIPassAuth`):
remove that line. If you gave the wrong IAM user id: in the hosting panel's
database tool run `UPDATE users SET id = <right id> WHERE id = <wrong id>;` -
all of that person's data moves with it (delete an empty row of the right id
first, if there is one).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Piano Academy is not set up yet"; the API answers 503 `not_set_up` | The setup page has not run, a `config/*.local.php` is missing - or the database needs an update (`php migration.php`, or the setup page). |
| The setup page asks for a token on this computer | It was not asked as `localhost` / `127.0.0.1` straight from PHP's built-in server: a LAN address, another name, or a proxy that adds forwarding headers makes it a real host's install. |
| 403 "Sign-in is switched off in this copy" | Auth mode `none` answers only this computer, by a local name, never through a proxy. |
| The app loads but every call fails | The backend on :8300 is not running, or was started without `router.php`. |
| Signing in bounces back with an error | The IAM does not know this address: use `http://localhost:4500`, which it registers for Piano Academy. |
| "Your sign-in has run out" on every request | The issuer in `config/auth.local.php` is not exactly the IAM's address, or the backend cannot reach `{issuer}/.well-known/jwks.json`. |
| The piano is not offered | Not Chrome or Edge, or not a secure page (`https://`, or `http://localhost` / `127.0.0.1`), or the browser was not allowed to use MIDI devices. |
| `tests/run.php` stops before any test | No `config/database.local.php` to borrow the PostgreSQL server from: run the setup first. |
