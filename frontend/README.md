# Piano Academy - the frontend

The app itself: Angular 21 - standalone components, zoneless, signals,
OnPush - with VexFlow 5.0.0 for the notation and Web MIDI for the piano. **All
the music logic** (the SRS schedule, the learning path, grading) runs here;
the backend checks the shapes of what is saved and stores it. The learner's
pages are in English and Slovak; the admin panel (`/admin`) is English. How it
works and why is in [`../docs/`](../docs/README.md) (the frontend's part:
[`../docs/architecture.md`](../docs/architecture.md), "The frontend");
setting it up and running it in [`../DEV.md`](../DEV.md); the whole map and
the gotchas in the project skill
([`../.claude/skills/piano-learning-app/SKILL.md`](../.claude/skills/piano-learning-app/SKILL.md)).

## Layout

```
src/
  main.ts, index.html                the start; the page (the family's theme-boot.js, copied from the library by
                                     angular.json, with this app's key - data-storage-key)
  styles.scss                        the family's styles (@anotoki/lib/styles: its tokens in Piano's palette,
                                     light and dark - the colours only -, through anotoki.root(); its corners,
                                     shadows, Manrope), Piano's own tokens (the keys, the notation) and the names its
                                     pages use for the family's (--border-strong: a field's 3:1 edge); Piano's
                                     own controls - bare buttons and selects, .btn-primary, .card, .chip - by
                                     rules that never reach the family's components ($piano-own)
  app/
    app.config.ts, app.routes.ts     providers (the interceptors - the family's siteStatusInterceptor first -;
                                     the family's kit and frame, provideFamilyKit(); where the site stands asked,
                                     then the start, in the app initializer) and the routes: every learner page
                                     behind signInGuard (a visitor too, while the IAM requires no sign-in), /admin
                                     behind adminSignInGuard (always a sign-in); /admin/migrations is the family's
                                     Migrations page (@anotoki/lib/migrations/page, lazy)
    app.component.*                  the frame: the top bar, the notes that cannot be missed (signed out,
                                     progress changed elsewhere; a visitor's: the notice on Learn and Stats,
                                     sign-in required meanwhile, a refused sign-in, a save refused, the progress
                                     ended; after a sign-in moved / kept / not moved - none while the site is not
                                     ready), the family's <anotoki-site-gate> with the page or a boot card as its
                                     marked template (<ng-template anotokiSitePages>: made only while the gate
                                     shows it, so nothing runs behind the status page), the footer's version,
                                     the family's questions (<anotoki-confirm-host>: ConfirmService)
    boot/                            the cards drawn instead of the app: sign in (after a failed sign-in
                                     only), could not load. (Not set up, being updated, not available: the
                                     family's status page, @anotoki/lib/migrations)
    core/
      family-kit.ts                  provideFamilyKit(): the anotoki family's kit (@anotoki/lib/ui) and frame
                                     (@anotoki/lib/shell) wired to this app's - their words (lookup: the
                                     database's strings, i18n/kit-words.ts), the piano's icon, the theme (the
                                     family's ThemeService: the account's for somebody signed in, saved from the
                                     bar's switch; this device's otherwise, under piano-academy:theme), the
                                     language chooser (TranslationService.choose())
      auth/                          AuthService (the IAM's browser SDK 1.2.0, vendored; loginRequired - the IAM's
                                     switch; preferences - the account's theme, dates and clock while signed in -
                                     and savePreferences()), the sign-in guards, the interceptor (the token for a
                                     person's request, the key for a visitor's - as ApiService issued it),
                                     VisitorKey (the visitor's key in localStorage)
      api/                           ApiService: one method a route of ../backend; who each call is for
                                     (ISSUED_AS); the session outbox; the generation every save names; a
                                     visitor's one "maker"; the move at a sign-in
      state/                         BootService (the start - a person's or a visitor's, the move first; waiting
                                     while the site is not ready, resumed after an ADMIN's Apply -, sign-out),
                                     site-migrations.ts (provideSiteMigrations(): the family's @anotoki/lib/migrations
                                     wired to this app's sign-in, language, dates and start), ProgressStore (the
                                     progress in memory - an answer at a time, updateNote(); no page keeps a copy -,
                                     its saves, a 409 settled by loading again)
      music/                         theory, srs, songs, path - ALL the domain logic, pure and tested
      i18n/                          TranslationService (the family's order: signed in with preferences, the account's
                                     language before this device's; choose(): the chooser's choice, saved to the
                                     account by saveToAccount()), the translate pipes, the localDate pipe and
                                     date-patterns (the account's date order and clock for somebody signed in),
                                     kit-words (the family's kit words this app says in its own strings), the
                                     kept English, error-text, visitor-words (the keys of practising without
                                     signing in, VISITOR_KEEP_DAYS; visitorRefusalKey() - ApiService.visitorRefusal;
                                     the shell (app.component) and Stats draw them)
      admin/                         LocalizationDrafts (what the Translations and Languages pages hold unsaved)
      testing/                       a spec's strings (provideTestTranslations()), jsdom's missing dialog, popover
                                     and checkVisibility (provideTestKit()), the family's question read and
                                     answered (drawTestQuestions())
      midi/, notation/, player/, audio/, changelog/, util/
    layouts/top-bar/                 the anotoki family's one bar (@anotoki/lib/shell's <anotoki-top-bar>), told
                                     Piano's brand, sections, person and menu items; its widgets "Not saved yet"
                                     and the piano; a phone's up to PHONE_BAR_MAX (1320); under /admin the
                                     admin sections and the wordmark, in English
    layouts/admin-layout/            /admin's frame: the page, or why there is nothing for you
    pages/                           home (the path), lesson (+ steps), trainer, sheet, songs, stats
                                     (+ own-progress: your progress file - signed in; a visitor gets the sign-in
                                     line in its place), auth-callback
    pages/admin/                     the admin panel: Translations (EDITOR, ADMIN); Languages, People (ADMIN).
                                     Migrations (ADMIN) is the family's page (@anotoki/lib/migrations/page)
    ui/                              Piano's own: the piano's widget in the bar (midi-panel, its box the family's
                                     popover), the piano keyboard, the notation, What's new (changelog-dialog)
public/                              changelog.json (the version shown: MAJOR.MINOR.PATCH, the newest entry's -
                                     package.json's too), anotoki.png (the family's mark), favicon.svg
proxy.conf.json                      /api and /setup.php to the backend on :8300
.npmrc, .nvmrc                       legacy-peer-deps (npm 10.9 and vitest), the Node version
```

`@anotoki/lib` is the Angular half of the anotoki family's library (the PHP
half is the backend's `anotoki/lib`; one version for both - 0.2.0 here, the
backend's 0.1.0, as 0.1.1 and 0.2.0 changed only this half): in
`package.json` as its GitHub release's tarball, in both `bun.lock` and
`package-lock.json`. What this app takes from it:

- `@anotoki/lib/styles` - the family's tokens (`--anotoki-*`) in Piano's
  palette, Manrope (`styles.scss`; the family's base is not included: Piano's
  pages keep their own type).
- `@anotoki/lib/ui`, `/ui/menu`, `/ui/dialog` - icons, the spinner, the
  menus, the piano's popover, the questions (`ConfirmService`, drawn by
  `<anotoki-confirm-host>` in `app.component.html`); their words through
  `provideFamilyKit()`'s `lookup`.
- `@anotoki/lib/shell` - the top bar, the language chooser, the theme switch
  and `ThemeService`, the brand; `assets/theme-boot.js` (angular.json).
- `@anotoki/lib/migrations` - where the site stands (`SiteStatus`,
  `siteStatusInterceptor`), the gate in front of the pages and its status
  page. The gate takes the shell's view as its marked template (`<ng-template
  anotokiSitePages>`, `app.component.html`) and makes it only while it shows
  it - given as it is, the view would be made behind the status page too.
- `@anotoki/lib/migrations/page` - the admin panel's Migrations page, lazy.

To update it: the new release's URL in `package.json`, then `bun install` and
`npm install --package-lock-only`, with the backend's half to the same
version where the release changed it (DEV.md).

Components are three files (`.ts`, `.html`, `.scss`); colours come from the
tokens in `src/styles.scss`; every page works at 390 px. Where the family has
a piece - the bar, a menu, a popover, a question - it is the family's;
Piano's own controls (bare `<button>`s and `<select>`s, `.btn-primary`,
`.card`, `.chip`) keep Piano's look through `styles.scss`, whose element
rules never reach the family's components. Every word a learner meets is a
key (`'stats.title' | translate`) whose strings are in the database (a
migration writes each with its English and informal Slovak); what the shell
draws while there are no strings at all is also in
`core/i18n/kept-english.ts`; the family's components say this app's strings
where it has them (`core/i18n/kit-words.ts`) and their own built-in English
and informal Slovak for the rest. The admin panel is English, written in its
templates. State holds keys and ids, never sentences, and a learner never sees
the server's own sentence.

The top bar is the anotoki family's (`<anotoki-top-bar>`, wrapped by
`layouts/top-bar`). Its fold, `PHONE_BAR_MAX`, is measured: `node
.claude/skills/check-in-browser/scripts/run.mjs --measure` prints what the
row needs with the real labels - change the number in `top-bar.component.ts`
(the family's bar takes it as `phoneMax`; there is no copy in a `.scss`).

## Commands

```bash
npm ci
npm start          # ng serve on http://localhost:4500, /api and /setup.php proxied to :8300
npm test           # Vitest, once (ng test)
npm run build      # production -> dist/piano-academy/browser/ (budgets: 6 kB warn, 12 kB error a component's styles)
```

Sign in at `http://localhost:4500` - the address the IAM knows for
`piano-academy`; `127.0.0.1` does not sign in. Any page you open while
signed out sends you to the IAM first, and back.

## Tests

`npm test` runs every `*.spec.ts` beside its code: no server, no browser -
`HttpTestingController` answers the API, stand-ins stand for the IAM's SDK,
`core/testing/` gives a spec its strings (`provideTestTranslations()`), jsdom
what it lacks for the family's components (`provideTestKit()`: the dialog,
the popover, `checkVisibility`) and the family's question to read and answer
(`drawTestQuestions()`). Among them: the music
logic; the start and every boot state; the shell drawn with no strings at all
(no text of a key's shape, every kept English string drawn); while the site
is not ready (the family's gate and status page): visitors and learners told
it is being updated in their language with no error and no setup or
Migrations link, an ADMIN told an update waits and on the Migrations page,
a signed-out ADMIN's Sign in coming back to the page, the setup page only
while never installed, the start waiting and resumed after an Apply, no page
made behind the status page (an update in the middle of practising takes the
page away); the sign-in
guard (the way to the IAM and back, the failure escape, the boot states,
nobody sent to the IAM while the site is not ready); the
routes and the admin panel's split by role; every save naming the generation,
none sent without one, a 409 settled by loading again and the other tabs told,
a reload in the middle of a round sending none of the old notes, a 428 kept
as a failed save; visitors (who a request is, decided as it is issued - a
person's request with no token never sent, never a visitor's; the key only on
a visitor's request, the first key kept, forgotten only for `visitor_unknown`
and kept while a sign-in is required; one "maker" at a round's end; the move
before the state; the visitor's outbox on every signed-in start; a 413 / 429
not sent for ever; the admin panel always a sign-in; the visitor's words in
the shell, Stats' sign-in line, People's visitors line, no "changed elsewhere"
after a lost key - several of them checked by taking the fix out once);
the own progress file (the size checked, the dry run, the question before a
replace, every code worded); the top bar - the family's, told Piano's (the
row, the sections lit, the menus' keys - Tab and Shift+Tab onto the menu
button, the phone's menu and its dot, "Not saved yet", the admin panel in
English with its wordmark, the way into it only while the site is ready, the
sign-out question); the piano's widget (its box the family's popover); the
admin pages; the family's kit wired to this app (`core/family-kit.spec.ts`:
its words this app's strings where it has them - the owner's wording - and
a key where the database has none; the language chooser on this app's
languages, its choice saved to the account; the theme switch on the
family's `ThemeService`, the account's theme, a refusal put back and said);
the anotoki account's preferences (the theme taken at sign-in and when it
changes; dates in the account's order and clock, nobody else's changed; a
language the IAM does not offer kept silently; the account's language
before this device's, a change of it followed - not over `?lang=`, not while
a save is out) - checked by taking each rule out once; What's new as shipped
(every version MAJOR.MINOR.PATCH, newest first, the newest `package.json`'s).

The key scan that holds the frontend's keys to the database's is the
backend's (`php tests/run.php`, `tests/unit/translations.test.php`). Pages in
a real browser: the committed browser check (DEV.md, "The browser check";
`.claude/skills/check-in-browser`), on throwaway servers and a throwaway
database, signed in through the stand-in IAM.
