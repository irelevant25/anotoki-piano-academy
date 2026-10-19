---
name: deploy-piano
description: Build Piano Academy for the FTP-only hosting and ship it to piano.anotoki.eu with anotoki-deploy - a release of frontend/ and backend/, swapped in whole, a rollback, the setup page on a first install or for a new migration. Use when the user asks to deploy, release, upload or publish Piano Academy, roll a release back, or asks what a new version needs on the hosting.
---

# Deploy Piano Academy

The hosting is SFTP only - PHP, PostgreSQL, Apache with `.htaccess`, no shell.
A release is built and put up by **anotoki-deploy** (the anotoki library's
deploy tool, the same for every site; this app's facts are in
`backend/composer.json`, `extra["anotoki-deploy"]`). DEV.md (*Building and
deploying*) has the whole of it.

The app's folder on the host, `anotoki.eu/sub/piano/`: `frontend/` and
`backend/` - the release, each replaced whole - beside `config/` (the
`*.local.php` settings) and `storage/` (the lock, logs, backups, the library's
key), which no release writes, under the switch: the folder's `.htaccess`,
which sends every request into `frontend/`. Never upload, rename or delete
anything in `config/` or `storage/` as part of a release.

Ask for (and never print, store in a repository, or put in a commit) the SFTP
login; it is the owner's to give per session (`ANOTOKI_DEPLOY_SECRETS` names
the `secrets.json` that holds it, outside every repository, with the pinned
`hostkey.txt` beside it). Confirm with the owner before `--go` - it changes the
live site.

## 1. Build

```bash
cd backend && php tests/run.php     # green first
cd ../frontend && npm test          # and these
npx anotoki-deploy build            # npm run build, then the release -> ../dist/
```

(Until `@anotoki/deploy` is a dev dependency of `frontend/` - from anotoki-lib
0.9.0's release - `node ../../anotoki-lib/deploy/cli.mjs` stands for
`npx anotoki-deploy`.)

## 2. Release

```bash
npx anotoki-deploy deploy --backups <folder>        # a dry run: what goes up
npx anotoki-deploy deploy --backups <folder> --go   # the live frontend/ and backend/ copied into <folder>,
                                                    # the release up as .new, checked, swapped in, the app checked
npx anotoki-deploy rollback --go                    # if it is wrong: the release before (kept as .old) back in
npx anotoki-deploy status                           # what is on the host
```

Nothing of the version before stays on the host; `config/` and `storage/`
stay as they are.

## 3. The database

- **A version with a new migration**: the app is closed until it is applied;
  an ADMIN signs in and presses **Apply pending** on `/admin/migrations` (it
  backs the database up first). Once applied, going back to the release before
  (`rollback`) is no longer clean - check the release before pressing it.
- **The setup page instead**: delete `storage/installed.lock` over SFTP before
  the release, then open `/setup.php` (each release carries it) with the same
  details; it applies what is pending, locks, and deletes itself.
- **First install**: in the hosting panel a PostgreSQL database and its user,
  and HTTPS (Web MIDI needs it). `deploy --go`, then `npx anotoki-deploy switch
  --go` once (the folder's `.htaccess` becomes the switch), then
  `https://piano.anotoki.eu/setup.php`: the token it writes into
  `storage/setup-token.php` (read it over SFTP), the database, the IAM
  (`https://iam.anotoki.eu`, client id `piano-academy`).

## 4. Check

The tool checks the live app after each swap: the app (the release just sent),
`/api/health`, an old bundle answering 404, and `backend/`, `config/`,
`storage/` never served. Then sign in, and open the admin panel as an ADMIN.
