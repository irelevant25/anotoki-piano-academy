---
name: check-in-browser
description: Check Piano Academy in a real browser, signed in, end to end - a deep link signed out goes to the IAM and back, with no call for a learner's data before; the anotoki family's top bar at 360, 390, the fold (PHONE_BAR_MAX) and one px over, 1280 and the name's width, light and dark, English and Slovak, by bounding boxes, every control's name holding the words it shows; the phone's and the person's menus (their contents, keys, a real Tab onto the menu button); the piano's box; "Not saved yet"; your progress file (download, bring back, replace) and three stale tabs - the Note Trainer mid-round in this browser and in another - whose next notes save nothing old over the import; the EDITOR / ADMIN split and the admin panel in English ("Admin panel", its brand and titles), the Migrations page, and a database behind the code applied from it by an ADMIN while a learner sees the card; the anotoki account's theme, dates and clock (the stand-in's `preferences`) - followed when signed in, the admin panel too, saved from the bar's theme button and language chooser, another tab following, a refusal said at 390; every learner page in Slovak with no key where a word should be; and with the IAM's "Sign-in required" off, a visitor - practising without signing in (one maker, exactly one visitor row), the notice, Stats, the sign-in that moves the progress into the account, a key the server lost, sign-in required again mid-visit - in English and in Slovak at 360 / 390 - with headless Edge and the stand-in IAM, on a throwaway database. Use after any change to a page, the bar, sign-in or the app's words, before saying such a change works, when a page looks broken, or when the user asks to see or screenshot the app. Its --measure is how the bar's fold is chosen.
---

# Check Piano Academy in a browser

One command, from the repository's root:

```bash
PHP=/path/to/php-8.2+ node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep] [--measure]
```

- **`scripts/run.mjs`** builds the frontend (`--no-build` skips it), makes a
  throwaway database `piano_test_browser_<port>` from the tests' template
  (`backend/tests/tools/testdb.php template`, then `testenv.php`), starts the
  stand-in IAM (`backend/tests/tools/fake-iam.php`, its own key) on **8597**
  and the built app on **8590** (`router.php`: the app and the API on one
  origin, as on the hosting; `PIANO_TEST_CONFIG` points at the throwaway
  settings), runs the tours, then stops both servers (the whole process tree)
  and drops the database - also when a check fails. It refuses to start when
  a port answers: that is another check or somebody's server - never stop it;
  `SITE_PORT=8593 IAM_PORT=8598` (any of 8590-8599) for others.
- **`scripts/flow.mjs`** - the tours, through `playwright-core` (installed
  once into `<temp>/pw` by run.mjs with `npx -y npm@11 install --prefix`,
  never into `frontend/`) and headless **Edge** (`BROWSER=chrome` for
  Chrome). One browser context per person. Every check prints `ok` or
  `FAIL`; the exit code is 0 only when all pass.
- **`--keep`** keeps the work folder (settings, logs, the downloaded file,
  `shots/`) and prints its path. **Look at the screenshots** - the bar at
  every width and theme, the menus, the piano's box, the Slovak pages, the
  admin panel. Bounding boxes catch overlap and overflow; only the eye catches
  a wrong colour or a clipped word.
- **`--measure`** prints, instead of the tours, what the top bar's row needs
  with the real labels - English and Slovak, a learner and an ADMIN, "Not
  saved yet" showing, and with a device name at its widest - measured at
  NAME_BAR_MIN - 1 px, where nothing is squeezed. `PHONE_BAR_MAX` in
  `frontend/src/app/layouts/top-bar/top-bar.component.ts` (and the same
  number in its `.scss`) stands just above the widest; the command exits 1
  when the row no longer fits. Measured 2026-10-04: 1210 px English, 1237 px
  Slovak (1139 / 1174 with "No piano"); the admin panel's row 899 px.

## The tours

| Tour | What it holds |
| --- | --- |
| A deep link | `/stats?from=deep` signed out -> the stand-in IAM -> `/auth/callback` -> back to `/stats?from=deep`; before the IAM no call for a learner's data (only `/api/auth/config`, the words), `/api/state` only after the way back; the bar names the person; the footer's version is the changelog's first entry |
| The bar | 360, 390, PHONE_BAR_MAX, +1, 1280, NAME_BAR_MIN; light and dark (the system's scheme); English and Slovak (`?lang=`): the row in the family's order (phone: brand, piano, language, theme, menu button; desktop: brand, sections, piano, language, theme, the person), everything inside the screen and inside the bar's height, nothing overlapping, no sideways scroll, "Piano" on a phone, the name only from NAME_BAR_MIN, `<html lang>`; label in name: each control that shows words (the brand, the piano, "SK", the person's name) has them in its accessible name |
| The phone's menu (360, an EDITOR) | the five sections then the person's items, the page's section lit, the role pill, inside the screen and on top of the page (`elementFromPoint` after the 140 ms fade), focus on the first item, ArrowDown, End, a **real Tab and Shift+Tab** (the menu closed, the focus on `#topbar-menu-button`, never `<body>`), a section chosen |
| The person's menu (1280) | on top of the page; End then a real Tab: closed, the focus on `#topbar-user-button` |
| The piano's box (360, 1280) | inside the screen, on top, the focus on the device list, the state said (headless Edge refuses MIDI), Escape closes it onto `#midi-button` |
| "Not saved yet" | a progress save made to fail (`page.route` aborts the PUT; one note-on in the trainer): the pill beside the piano; at 360 the dot on the menu button and the menu's first line |
| Your progress file | Download (the server's file name, an export); bring a file back into an empty account; three stale tabs open (Stats, the Note Trainer in the same browser, the Note Trainer in another browser); replace with the question (five notes); Stats shows `#progress-changed` and the new counts; the same browser's trainer says it too and its next note's save (204) carries all five; the other browser's next save is refused (409), it says so, and the note after that saves all five; a download afterwards still has them |
| The admin panel | an EDITOR with Slovak chosen: Slovak sections, "Administrátorský panel" into `/admin`, then English (`<html lang="en">`, the brand "anotoki Piano Academy - admin panel" and its link's name, the title "Translations · Admin panel · Piano Academy", the menu's items, "Back to Piano Academy"), Translations alone, no chooser, no piano, no section nav of the layout's; `/admin/people` -> Translations; back: Slovak again. An ADMIN: four sections, People lit; Migrations: nothing pending, Apply off, every file applied with when, its title; `/admin/database` -> `/admin/migrations`; at 360 "admin panel" beside the mark, no sideways scroll. A learner: no sections, the card |
| A visitor (the stand-in's `login_required` false) | `/` without the IAM: the notice (30 days, Sign in), Sign in in the bar, no signed-out banner, looking makes no key and no visitor row; no notice on a practice screen; a lesson's meet then drill with the FIRST save (the meet's path PUT) held at the network until the drill's notes, path and round were issued: nothing else goes while it is out, then exactly one save without `X-Visitor-Key` (the maker) and the rest with the key it brought, exactly ONE visitor row holding the round, the notes and both steps; a reload keeps it; Stats: the sign-in line in place of the progress file; another browser starts empty; `/admin` goes to the IAM; then Sign in as mia (who has note 60): "moved" and "kept" said, her C byte for byte as before, the visitor's round and steps hers, the key gone from localStorage and the visitor from the database, the note closable |
| A visitor in Slovak at 360 / 390 | no key on the page, the notice wrapping inside the screen (no sideways scroll), the phone's menu ending with "Prihlásiť sa"; at 360 a visitor made in the Note Trainer and deleted from the database under the page: the key forgotten, `visitor.lost` said, the next save (nobody's, the old generation) 409 with NO "changed elsewhere", the note after it a new visitor (kept for the next tour) |
| Sign-in required again mid-visit (390, Slovak) | a visitor's next save refused: `visitor.signInNow`, the key and the visitor row KEPT; a new browser is sent to the IAM with no notice; People (ADMIN) counts the visitors in a line and lists none; the note's Sign in as zoe (no progress): moved, no "kept", the key and the visitor gone, zoe has the notes |
| The account's theme, dates and clock (the stand-in's `preferences` set; the real SDK 1.2.0 against its `POST /api/oidc/preferences`) | mia's account dark, `dmy_dot`, 12-hour, this browser's theme light: signed in, the account's dark (kept in `piano-academy:theme` for the first paint), Stats' rounds and What's new's day in the account's order and clock; the theme button saves "automatic" then light to the account, and another tab of the site follows; with `preferences_refuse` at 390: the account's light back, `#theme-not-saved` said (promising no retry), inside the screen and on top, gone at a click elsewhere; Slovak chosen in the bar becomes the account's language and another tab follows it (over the browser's remembered choice - the family's order), the rounds keep the order and clock in Slovak's words, no key; a fresh browser that remembered Slovak, signed in to an account that says English: English, and the browser keeps its Slovak; ada's admin panel in the account's dark, People's and Migrations' times in `mdy_slash` on the 24-hour clock; `preferences` back to null for what follows |
| A database behind the code | 005 - the newest with a schema part (006, words only, stays applied) - taken off the throwaway database's record (it runs again cleanly, its gates holding with visitors in the database): a learner gets the card and no page on `/admin/migrations`; an ADMIN the card with "Open Migrations" (English) -> the page with 005 pending and Migrations alone in the bar -> a first "Apply pending" that fails (`users.visitor_key_hash` made a text, so 005's gate refuses): "Stopped at 005_visitors.sql", nothing applied, rolled back whole, and what PostgreSQL said word for word in its box (the IAM's way), Apply on again, no sideways scroll at 360 -> the column put right -> "Apply pending" -> the question -> "Up to date", every section in the bar (the app started in place, the result still on the page) -> "Back to Piano Academy" runs the app, the Learn page in words with no key (a fresh browser: the strings refused with 503 at the start are asked for again) |
| Slovak | the chooser in the bar -> sk; `/`, a lesson, trainer, sheet, songs, a song, stats at 390: no text of a key's shape (any namespace the database has, in the text and in aria-label / title / alt / placeholder), `<html lang="sk">`; the replace question; the phone's menu; a refused sign-in: the card in Slovak, one trip to the IAM; at 390 px no menu button (its menu would be empty) |
| Errors | no page error anywhere |

## Notes

- **Never against the owner's database**: the check makes and drops its own
  `piano_test_` database; it borrows only the PostgreSQL server and user of
  `backend/config/database.local.php` (through the tests' tools).
- **The stand-in IAM**: `POST /_test/state` with `{user: {id, username,
  roles}, deny}` decides who signs in next (`roles: ['MEMBER']` a learner -
  every account holds MEMBER -, `['MEMBER', 'EDITOR']`, `['MEMBER',
  'ADMIN']`); `login_required` / `application_missing` are what it says about
  the app's "Sign-in required" (default: required - the app asks it on
  `/api/auth/config` and keeps the answer a minute; run.mjs makes the
  throwaway settings with `testenv.php --application-ttl=1`, so the visitor
  tours' switch - flow.mjs's `switchSignIn()` - counts a second later). The
  visitor tours read the throwaway database (`fromTheDatabase()`,
  `visitorIds()`); every tour before them runs with sign-in required, and
  they leave it required. Its sign-in page
  redirects at once, so the trip is seen in the requests, not as a page.
- **No piano in a headless browser**: `navigator.requestMIDIAccess()` is
  refused, which is what the piano's box then says. Notes are played with
  `window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', ...))` (the
  project skill's "Testing without real MIDI hardware").
- A menu screenshot taken at once shows it half-faded over the page - the
  tours wait for the fade before they look.
- On Windows the check stops each server with `taskkill /T`; afterwards no
  listener is left on its ports and no `piano_test_browser_*` database.
