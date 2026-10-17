// The browser check's tours (run.mjs starts everything and runs this):
//
//   node flow.mjs <app> <iam> <work folder> [--measure]
//
// Headless Edge (BROWSER=chrome for Chrome) through playwright-core, installed in $PW_DIR - never in the
// repository. One browser context per person, so each has storage of its own. Every step prints "ok" or
// "FAIL"; the screenshots go to <work>/shots - look at them. --measure prints only what the top bar's row
// needs (how PHONE_BAR_MAX was chosen).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(process.env.PW_DIR, 'node_modules', 'noop.js'));
const { chromium } = require('playwright-core');

const [APP, IAM, WORK] = process.argv.slice(2);
const MEASURE = process.argv.includes('--measure');
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const shots = join(WORK, 'shots');

/** The bar's fold, as layouts/top-bar has it - the check follows the number. */
const BAR_SOURCE = readFileSync(join(repo, 'frontend/src/app/layouts/top-bar/top-bar.component.ts'), 'utf8');
const PHONE_BAR_MAX = Number(/export const PHONE_BAR_MAX = (\d+);/.exec(BAR_SOURCE)[1]);
const NAME_BAR_MIN = PHONE_BAR_MAX + Number(/export const NAME_BAR_MIN = PHONE_BAR_MAX \+ (\d+);/.exec(BAR_SOURCE)[1]);
/** The admin panel's own fold (its row is not the learner's), and where its person's name shows. */
const ADMIN_PHONE_BAR_MAX = Number(/export const ADMIN_PHONE_BAR_MAX = (\d+);/.exec(BAR_SOURCE)[1]);
const ADMIN_NAME_BAR_MIN = ADMIN_PHONE_BAR_MAX + (NAME_BAR_MIN - PHONE_BAR_MAX);
const VERSION = JSON.parse(readFileSync(join(repo, 'frontend/public/changelog.json'), 'utf8'))[0].version;

const failures = [];
function check(ok, what, seen) {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${ok || seen === undefined ? '' : ` -> ${JSON.stringify(seen)}`}`);
  if (!ok) failures.push(what);
}
function step(title) {
  console.log(`\n== ${title}`);
}

/**
 * SQL on the check's own throwaway database (run.mjs's settings in <work>/config, PIANO_TEST_CONFIG - honoured
 * only for a piano_test_ database), through the app's own connection. For the tour of a database behind the code.
 */
function onTheDatabase(sql) {
  execFileSync(process.env.PHP ?? 'php', ['-r', 'require "api/bootstrap.php"; db()->exec($argv[1]);', sql], {
    cwd: join(repo, 'backend'),
    env: { ...process.env, PIANO_TEST_CONFIG: join(WORK, 'config') },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

/** Rows of a SELECT on the check's own throwaway database (as onTheDatabase), as JSON. */
function fromTheDatabase(sql) {
  const out = execFileSync(process.env.PHP ?? 'php', ['-r', 'require "api/bootstrap.php"; echo json_encode(dbAll($argv[1]));', sql], {
    cwd: join(repo, 'backend'),
    env: { ...process.env, PIANO_TEST_CONFIG: join(WORK, 'config') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(String(out));
}

/** The visitors' ids in the database (users rows with a negative id), the newest first. */
function visitorIds() {
  return fromTheDatabase('SELECT id FROM users WHERE id < 0 ORDER BY id').map((row) => Number(row.id));
}

/**
 * What the stand-in IAM says about Piano Academy's "Sign-in required" - and a moment for the app to hear it
 * (run.mjs gives the app's kept answer one second: testenv.php --application-ttl=1).
 */
async function switchSignIn(required) {
  await fetch(`${IAM}/_test/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login_required: required }) });
  await new Promise((done) => setTimeout(done, 1300));
}

/** Waits until `test()` is true (polled), or the time is up. */
async function waitFor(test, ms) {
  for (const end = Date.now() + ms; Date.now() < end && !test(); ) await new Promise((done) => setTimeout(done, 100));
}

/**
 * Who the stand-in IAM (the anotoki family's, vendor/anotoki/lib/php/testing/stand-in-iam.php) signs in next - with
 * the account's preferences as `user.preferences` - and whether it turns the sign-in away.
 */
async function iamAs(user, more = {}) {
  await fetch(`${IAM}/_test/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, deny: false, ...more }) });
}

// Every account holds MEMBER (the IAM gives it to everybody): MEMBER alone is a learner.
const MIA = { id: 7, username: 'mia', roles: ['MEMBER'] };
const ED = { id: 8, username: 'ed', roles: ['MEMBER', 'EDITOR'] };
const ADA = { id: 1, username: 'ada', roles: ['MEMBER', 'ADMIN'] };

/** The admin panel's Migrations page: the anotoki family's (@anotoki/lib/migrations/page). */
const MIGRATIONS = 'anotoki-migrations-page';

/**
 * The migration sets as the engine records them - the library's files named with their set, the app's one set's by
 * their names alone - each with its files on disk, in its own order: the check follows the files.
 */
const sqlFiles = (folder) => readdirSync(join(repo, folder)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const MIGRATION_SETS = [
  ['anotoki_admin/', sqlFiles('backend/vendor/anotoki/lib/php/migrations/admin')],
  ['', sqlFiles('backend/migrations/piano_academy')],
  ['anotoki_translations/', sqlFiles('backend/vendor/anotoki/lib/php/migrations/translations')],
  ['anotoki_people/', sqlFiles('backend/vendor/anotoki/lib/php/migrations/people')],
].map(([set, files]) => [set, files.map((name) => `${set}${name}`)]);

/** A figure on Stats and in the Note Trainer: the family's stat tile's value (@anotoki/lib/ui/stat-tiles). */
const TILE = 'anotoki-stat-tile .anotoki-stat-tile__value';

/** Where the footer's Terms · Privacy · Contact are: the family's links (@anotoki/lib/legal's <anotoki-legal-links>). */
const LEGAL_LINKS = '#footer-legal';

/** An ADMIN's sections in the admin panel (layouts/top-bar's ADMIN_LINKS): the family's admin tools among them. */
const ADMIN_SECTIONS = 'Translations|Languages|People|Feedback|Error log|Audit log|Backups|Migrations';

/** The family's screen of a sign-in that did not work (<anotoki-sign-in-failure>, on /sign-in-failed under the bar). */
const FAILURE = 'anotoki-sign-in-failure';

/**
 * Where the family's bar (@anotoki/lib/shell's <anotoki-top-bar>, in layouts/top-bar) draws what the tours read: the
 * kit's own class names (anotoki-<component>__<part>, since anotoki-lib 0.3.0).
 */
const BAR = {
  /** Somebody is signed in: the person's button on a wide bar, the menu button on a phone's. */
  signedIn: '.anotoki-top-bar__person-button, .anotoki-top-bar__menu-button',
  person: '.anotoki-top-bar__person-button',
  name: '.anotoki-top-bar__person-name',
  phoneButton: '.anotoki-top-bar__menu-button',
  /** The open menu (the person's or the phone's). */
  menu: 'anotoki-top-bar [role="menu"]',
  nav: 'anotoki-top-bar nav',
  signIn: '.anotoki-top-bar__sign-in',
  language: '.anotoki-language-switcher__switcher',
  /** The theme switch's choices, and the one in force. */
  theme: 'anotoki-theme-toggle [role="radio"]',
  themeChosen: 'anotoki-theme-toggle [role="radio"][aria-checked="true"]',
  themeNote: 'anotoki-theme-toggle [role="alert"]',
};

/** The family's question (ConfirmService's <anotoki-confirm-host>, in the app's root), while one is asked. */
const QUESTION = 'anotoki-confirm-host dialog[open]';

/** A desktop's window: wide enough for the whole bar (the sections beside the brand), the person's name not yet beside the initial. */
const DESKTOP = 1440;

/**
 * The family's status page (<anotoki-site-status>, in the view's place while the site is not ready), as it is
 * read: its title, its sentence, its language, the words of its buttons and links, and where its links go.
 * Null while it is not on the page.
 */
async function siteStatus(page) {
  return page.evaluate(() => {
    const section = document.querySelector('anotoki-site-status section');
    if (!section) return null;
    return {
      title: section.querySelector('h1')?.textContent.trim(),
      text: section.querySelector('p')?.textContent.trim(),
      lang: section.getAttribute('lang'),
      controls: [...section.querySelectorAll('a, button')].map((control) => control.textContent.trim()),
      links: [...section.querySelectorAll('a[href]')].map((link) => link.getAttribute('href')),
    };
  });
}

/** Every namespace of the app's words: a text of the shape "<namespace>.<word>" on a page is a key where a word should be. */
const english = await (await fetch(`${APP}/api/translations/en`)).json();
const NAMESPACES = [...new Set(Object.keys(english.values).map((key) => key.split('.')[0]))];
const KEY_SHAPE = new RegExp(`(?<![\\w.@/-])(?:${NAMESPACES.join('|')})\\.[A-Za-z][\\w-]*(?:\\.[A-Za-z][\\w-]*)*(?![\\w-])`, 'g');

const browser = await chromium.launch({ channel: process.env.BROWSER === 'chrome' ? 'chrome' : 'msedge', headless: true });
const errors = [];

async function newContext({ width = DESKTOP, height = 900, scheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'en-GB', colorScheme: scheme, acceptDownloads: true });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  return context;
}

/** Signs in on a page through the stand-in IAM: open an address, the guard goes there and back. */
async function signedIn(context, user, address = '/') {
  await iamAs(user);
  const page = await context.newPage();
  await page.goto(`${APP}${address}`);
  await page.waitForSelector(BAR.signedIn, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('#view-root .loading') === null, null, { timeout: 20000 });
  return page;
}

/** Text of a key's shape on the page - in the words and in what is read out (aria-label, title, alt, placeholder). */
async function keysOnPage(page) {
  const said = await page.evaluate(() => {
    const out = [document.body.innerText];
    for (const element of document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
      for (const name of ['aria-label', 'title', 'alt', 'placeholder']) {
        const value = element.getAttribute(name);
        if (value) out.push(value);
      }
    }
    return out.join('\n');
  });
  return [...new Set(said.match(KEY_SHAPE) ?? [])];
}

/**
 * The bar's row, thing by thing, left to right: what is drawn, and where. A thing is named by Piano's own id
 * (save-status), by its component (anotoki-brand, app-midi-panel), or by the part the family's class names
 * (nav, person-button, menu-button, sign-in: anotoki-top-bar__<part>) - the family's ids are made up as the page
 * is drawn. The menus' own elements take no room in the row.
 */
async function barRow(page) {
  return page.evaluate(() => {
    const what = (element) => {
      if (element.id && !element.id.startsWith('anotoki-')) return element.id;
      if (element.tagName.includes('-')) return element.tagName.toLowerCase();
      return ['person-button', 'menu-button', 'sign-in', 'nav'].find((part) => element.classList.contains(`anotoki-top-bar__${part}`)) ?? element.tagName.toLowerCase();
    };
    const things = [...document.querySelectorAll('.anotoki-top-bar__row > *, .anotoki-top-bar__actions > *')].filter((element) => !element.classList.contains('anotoki-top-bar__actions') && element.tagName !== 'ANOTOKI-MENU');
    return things
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { what: what(element), left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom), width: box.width };
      })
      .filter((thing) => thing.width > 0);
  });
}

/** The bar at one width: one row in order, inside the screen, nothing on top of anything, no page wider than the screen. */
async function checkBar(page, label, width) {
  const phone = width <= PHONE_BAR_MAX;
  const row = await barRow(page);
  const bar = await page.evaluate(() => {
    const box = document.querySelector('.anotoki-top-bar__topbar').getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, scroll: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth };
  });
  const order = row.map((thing) => thing.what);
  const expected = phone
    ? ['anotoki-brand', 'app-midi-panel', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'menu-button']
    : ['anotoki-brand', 'nav', 'app-midi-panel', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'person-button'];
  check(JSON.stringify(order) === JSON.stringify(expected), `${label}: the row in the family's order (${phone ? 'a phone\'s' : 'a desktop\'s'})`, order);
  check(row.every((thing) => thing.left >= 0 && thing.right <= width), `${label}: everything inside the screen`, row);
  check(row.every((thing) => thing.top >= bar.top - 1 && thing.bottom <= bar.bottom + 1), `${label}: one row, inside the bar's height`, row);
  check(row.every((thing, i) => i === 0 || row[i - 1].right <= thing.left + 1), `${label}: nothing on top of anything`, row);
  check(bar.scroll <= bar.screen, `${label}: no sideways scroll`, bar);
  if (!phone) {
    const nameShown = await page.evaluate((selector) => getComputedStyle(document.querySelector(selector)).display !== 'none', BAR.name);
    check(nameShown === width >= NAME_BAR_MIN, `${label}: the person's name ${width >= NAME_BAR_MIN ? 'beside' : 'not beside'} the initial`);
  } else {
    check((await page.textContent('.anotoki-brand__wordmark'))?.trim() === 'Piano', `${label}: "Piano" beside the mark`);
  }
  const named = await labelsInNames(page);
  check(named.length >= (phone ? 2 : 3) && named.every((control) => control.ok), `${label}: every bar control's name holds the words it shows (label in name)`, named);
  return row;
}

/**
 * The admin panel's bar at one width: folded up to ADMIN_PHONE_BAR_MAX, one row above it (the brand, the
 * sections, the theme switch, the person - no language, no piano), the brand short at every width.
 */
async function checkAdminBar(page, label, width) {
  const phone = width <= ADMIN_PHONE_BAR_MAX;
  const row = await barRow(page);
  const bar = await page.evaluate(() => {
    const box = document.querySelector('.anotoki-top-bar__topbar').getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, scroll: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth };
  });
  const order = row.map((thing) => thing.what);
  const expected = phone ? ['anotoki-brand', 'anotoki-theme-toggle', 'menu-button'] : ['anotoki-brand', 'nav', 'anotoki-theme-toggle', 'person-button'];
  check(JSON.stringify(order) === JSON.stringify(expected), `${label}: the admin panel's row (${phone ? 'folded' : 'whole'})`, order);
  check(row.every((thing) => thing.left >= 0 && thing.right <= width), `${label}: everything inside the screen`, row);
  check(row.every((thing) => thing.top >= bar.top - 1 && thing.bottom <= bar.bottom + 1), `${label}: one row, inside the bar's height`, row);
  check(row.every((thing, i) => i === 0 || row[i - 1].right <= thing.left + 1), `${label}: nothing on top of anything`, row);
  check(bar.scroll <= bar.screen, `${label}: no sideways scroll`, bar);
  const brand = await page.evaluate(() => [...document.querySelectorAll('.anotoki-brand__wordmark > span')].filter((span) => span.checkVisibility()).map((span) => span.textContent.trim()));
  check(JSON.stringify(brand) === JSON.stringify(['Piano', 'admin panel']), `${label}: the brand short at every width - "Piano", "admin panel" under it`, brand);
  return row;
}

/**
 * WCAG 2.5.3 (label in name): each control of the bar that shows words has an accessible name holding
 * them - a voice user says what they see ("click SK"). The words shown: the text nodes the screen
 * draws, but for what is hidden from everybody (aria-hidden: the avatar's initial, the icons); spaces
 * are passed over (the wordmark's two spans have none between them in the DOM).
 */
async function labelsInNames(page) {
  return page.evaluate(() => {
    const squeeze = (text) => text.replace(/\s+/g, '').toLowerCase();
    const out = [];
    for (const control of document.querySelectorAll('app-top-bar a[aria-label], app-top-bar button[aria-label]')) {
      if (!control.checkVisibility()) continue;
      let shown = '';
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        // Not drawn, hidden from everybody, or there for a screen reader only (the phone's "Not saved yet").
        if (parent.closest('[aria-hidden="true"], .anotoki-visually-hidden') || !parent.checkVisibility()) continue;
        shown += node.textContent;
      }
      if (squeeze(shown) === '') continue;
      const name = control.getAttribute('aria-label');
      out.push({ control: control.id || control.className.split(' ')[0], shown: shown.replace(/\s+/g, ' ').trim(), name, ok: squeeze(name).includes(squeeze(shown)) });
    }
    return out;
  });
}

/**
 * What floats over the page (a menu, the piano's box) is on top of it: at five points inside it, the
 * element there is its own. Waits for the fade-in first (140 ms), so a screenshot shows it whole.
 */
async function onTop(page, selector, label) {
  await page.waitForTimeout(250);
  const covered = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    const box = element.getBoundingClientRect();
    const points = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].map(([x, y]) => [box.left + box.width * x, box.top + box.height * y]);
    return points.filter(([x, y]) => !element.contains(document.elementFromPoint(x, y))).map(([x, y]) => [Math.round(x), Math.round(y), document.elementFromPoint(x, y)?.tagName]);
  }, selector);
  check(covered.length === 0, `${label}: on top of the page, nothing of it covered`, covered);
}

/** A save that does not get through: the progress waits ("Not saved yet"). */
async function makeUnsaved(page) {
  await page.route('**/api/progress', (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()));
  await page.goto(`${APP}/trainer`);
  await page.waitForSelector('#tr-notation .vf-stavenote[data-midi]', { timeout: 20000 });
  const midi = Number(await page.getAttribute('#tr-notation .vf-stavenote[data-midi]', 'data-midi'));
  await page.evaluate((note) => window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', { detail: { midi: note, velocity: 100, timestamp: performance.now() } })), midi);
}

/** In the Note Trainer: plays the note on the staff (right), as a piano would. */
async function playShown(page) {
  await page.waitForSelector('#tr-notation .vf-stavenote[data-midi]', { timeout: 20000 });
  const midi = Number(await page.getAttribute('#tr-notation .vf-stavenote[data-midi]', 'data-midi'));
  await page.evaluate((note) => window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', { detail: { midi: note, velocity: 100, timestamp: performance.now() } })), midi);
  return midi;
}

/**
 * A lesson step played to its end: the note on its staff (`staff`, e.g. #mt-notation, #dr-notation), again and
 * again, until `end` shows (the result screen). A press while the step pauses between notes is passed over.
 */
async function playUntil(page, staff, end) {
  for (let presses = 0; presses < 120 && !(await page.$(end)); presses++) {
    const midi = await page.getAttribute(`${staff} .vf-stavenote[data-midi]`, 'data-midi', { timeout: 20000 }).catch(() => null);
    if (midi !== null) await page.evaluate((note) => window.pianoMIDI.dispatchEvent(new CustomEvent('noteon', { detail: { midi: note, velocity: 100, timestamp: performance.now() } })), Number(midi));
    await page.waitForTimeout(300);
  }
  await page.waitForSelector(end, { timeout: 10000 });
}

/* ------------------------------------------------------------------ --measure */

if (MEASURE) {
  // A two-digit count beside the admin panel's "Feedback": twelve new messages, on the check's own throwaway database.
  onTheDatabase("INSERT INTO anotoki_feedback (kind, message) SELECT 'idea', 'A message to measure the bar by, ' || n FROM generate_series(1, 12) AS n");
  const results = [];
  for (const language of ['en', 'sk']) {
    for (const [who, user] of [['a learner', MIA], ['an ADMIN', ADA]]) {
      for (const area of ['/stats', '/admin/translations']) {
        if (area.startsWith('/admin') && user === MIA) continue;
        const admin = area.startsWith('/admin');
        // As wide as a desktop bar gets with the initial alone (the name shows from the area's NAME_BAR_MIN): nothing is squeezed.
        const context = await newContext({ width: (admin ? ADMIN_NAME_BAR_MIN : NAME_BAR_MIN) - 1 });
        const page = await signedIn(context, user, `/stats?lang=${language}`);
        await makeUnsaved(page);
        await page.waitForSelector('#save-status', { timeout: 10000 }).catch(() => undefined);
        if (admin) {
          await page.click(BAR.person);
          await page.click(`${BAR.menu} a[href="/admin"]`);
          await page.waitForSelector(`${BAR.nav} a[href="/admin/translations"]`);
          await page.waitForSelector(`${BAR.nav} a[href="/admin/feedback"] .anotoki-top-bar__badge`, { timeout: 10000 }).catch(() => undefined);
        }
        const need = await page.evaluate(() => {
          const inner = document.querySelector('.anotoki-top-bar__row');
          const actions = document.querySelector('.anotoki-top-bar__actions');
          const px = (element, name) => parseFloat(getComputedStyle(element)[name]);
          const outer = [...inner.children].filter((element) => element.getBoundingClientRect().width > 0);
          const inside = [...actions.children].filter((element) => element.getBoundingClientRect().width > 0);
          const width = (element) => element.getBoundingClientRect().width;
          // The person's button with the initial alone (the name shows only from NAME_BAR_MIN).
          const own = outer.filter((element) => element !== actions).reduce((sum, element) => sum + width(element), 0);
          const acts = inside.reduce((sum, element) => sum + width(element), 0) + px(actions, 'columnGap') * (inside.length - 1);
          const label = document.querySelector('#midi-label');
          return {
            row: Math.ceil(px(inner, 'paddingLeft') + px(inner, 'paddingRight') + own + acts + px(inner, 'columnGap') * (outer.length - 1)),
            deviceRoom: label ? Math.ceil(parseFloat(getComputedStyle(label).maxWidth) - label.getBoundingClientRect().width) : 0,
            unsaved: !!document.querySelector('#save-status'),
            // The family's bar draws its row no wider than this (84rem): what it needs must fit in it too.
            rowMax: Math.floor(parseFloat(getComputedStyle(inner).maxWidth)),
          };
        });
        const badge = admin ? await page.evaluate((nav) => document.querySelector(`${nav} a[href="/admin/feedback"] .anotoki-top-bar__badge`)?.textContent.trim() ?? '', BAR.nav) : '';
        results.push({ language, who, area, badge, ...need, withDevice: need.row + need.deviceRoom });
        await context.close();
      }
    }
  }
  console.table(results);
  const widest = (admin) => Math.max(...results.filter((result) => result.area.startsWith('/admin') === admin).map((result) => result.withDevice));
  const rowMax = Math.min(...results.map((result) => result.rowMax));
  console.log(`The learner's widest row: ${widest(false)} px (with a device name at its widest) - PHONE_BAR_MAX now: ${PHONE_BAR_MAX}.`);
  console.log(`The admin panel's widest row: ${widest(true)} px (a two-digit count beside Feedback) - ADMIN_PHONE_BAR_MAX now: ${ADMIN_PHONE_BAR_MAX}. The row's own limit: ${rowMax} px.`);
  await browser.close();
  process.exit(widest(false) <= PHONE_BAR_MAX && widest(true) <= ADMIN_PHONE_BAR_MAX && Math.max(widest(false), widest(true)) <= rowMax ? 0 : 1);
}

/* ------------------------------------------------------------------ the tours */

try {
  step('A deep link, signed out: to the IAM, and back to the page asked for');
  {
    await iamAs(MIA);
    const context = await newContext();
    const page = await context.newPage();
    // The stand-in IAM answers its sign-in page with a redirect at once: the trip is seen in the requests.
    const seen = [];
    // Every call to the app's API, and where the browser was going at the time: nothing of a learner's page before the IAM.
    const calls = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) seen.push(request.url().split("?")[0]);
      else if (request.url().startsWith(`${APP}/api/`)) calls.push({ api: request.url().slice(APP.length).split('?')[0], afterCallback: seen.some((url) => url.endsWith('/auth/callback')) });
    });
    await page.goto(`${APP}/stats?from=deep`);
    await page.waitForSelector('#own-progress', { timeout: 20000 });
    check(seen.some((url) => url.startsWith(IAM)) && seen.some((url) => url.endsWith('/auth/callback')), 'the browser went to the IAM, and came back through /auth/callback', seen);
    const before = calls.filter((call) => !call.afterCallback).map((call) => call.api);
    const learnerCalls = before.filter((api) => !/^\/api\/(site-status|auth\/config|translations\/[a-z-]+|health)$/.test(api));
    check(learnerCalls.length === 0, 'before the trip to the IAM: no call for a learner\'s data (/api/state, saves, /api/me) - only where the site stands, the sign-in\'s settings and the words', before);
    check(calls.some((call) => call.afterCallback && call.api === '/api/state'), 'the progress loaded only after the way back', calls);
    check(new URL(page.url()).pathname === '/stats' && new URL(page.url()).search === '?from=deep', 'and came back to /stats?from=deep', page.url());
    check((await page.textContent(BAR.name)) === 'mia', 'signed in as the learner, named in the bar');
    check((await page.textContent('#app-version'))?.trim() === `Piano Academy v${VERSION}`, `the footer says the version (${VERSION})`);
    await page.screenshot({ path: join(shots, `stats-${DESKTOP}-light.png`), fullPage: true });
    await context.close();
  }

  step('The bar at every width that matters, light and dark, English and Slovak');
  for (const language of ['en', 'sk']) {
    for (const scheme of ['light', 'dark']) {
      const context = await newContext({ scheme });
      const page = await signedIn(context, MIA, `/?lang=${language}`);
      for (const width of [360, 390, 1280, PHONE_BAR_MAX, PHONE_BAR_MAX + 1, DESKTOP, NAME_BAR_MIN]) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(150);
        const label = `${language} ${scheme} ${width}`;
        const row = await checkBar(page, label, width);
        if (scheme === 'light') console.log(`       ${label}: ${row.map((thing) => `${thing.what} ${thing.left}-${thing.right}`).join(', ')}`);
        await page.screenshot({ path: join(shots, `bar-${language}-${scheme}-${width}.png`), clip: { x: 0, y: 0, width, height: 120 } });
      }
      check((await page.getAttribute('html', 'lang')) === language, `${language} ${scheme}: <html lang="${language}">`);
      await context.close();
    }
  }

  step('The phone\'s menu: what is in it, the keys, a real Tab');
  {
    const context = await newContext({ width: 360 });
    const page = await signedIn(context, ED, '/songs');
    const onTheButton = () => page.evaluate((selector) => document.activeElement === document.querySelector(selector), BAR.phoneButton);
    await page.click(BAR.phoneButton);
    await page.waitForSelector(BAR.menu);
    const items = await page.$$eval(`${BAR.menu} [role="menuitem"]`, (all) => all.map((item) => item.textContent.replace(/\s+/g, ' ').trim()));
    check(JSON.stringify(items) === JSON.stringify(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats', 'Your anotoki account', 'Admin panel', 'Sign out']), 'the sections, then the person\'s items', items);
    check((await page.$$eval(`${BAR.menu} [role="menuitem"].anotoki-menu-item--active`, (all) => all.map((item) => item.textContent.trim()))).join() === 'Songs', 'the page\'s section stands out');
    check((await page.textContent(`${BAR.menu} .anotoki-top-bar__menu-role`))?.trim() === 'Editor', 'an EDITOR is named so');
    await onTop(page, BAR.menu, "the phone's menu");
    const box = await page.$eval(BAR.menu, (menu) => menu.getBoundingClientRect().toJSON());
    check(box.left >= 0 && box.right <= 360, 'the menu inside the 360 px screen', box);
    check((await page.evaluate(() => document.activeElement.textContent.trim())) === 'Learn', 'the focus on its first item');
    await page.keyboard.press('ArrowDown');
    check((await page.evaluate(() => document.activeElement.textContent.trim())) === 'Note Trainer', 'ArrowDown to the next');
    await page.keyboard.press('End');
    check((await page.evaluate(() => document.activeElement.textContent.trim())) === 'Sign out', 'End to the last');
    await page.screenshot({ path: join(shots, 'phone-menu-360.png') });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    check(!(await page.$(BAR.menu)), 'a real Tab closes the menu');
    check(await onTheButton(), 'and the focus is on the menu button - not <body>', await page.evaluate(() => document.activeElement?.tagName));
    await page.keyboard.press('Enter');
    await page.waitForSelector(BAR.menu);
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(150);
    check(await onTheButton(), 'Shift+Tab: the same');
    await page.keyboard.press('Enter');
    await page.waitForSelector(BAR.menu);
    await page.click(`${BAR.menu} a[href="/stats"]`);
    await page.waitForSelector('#own-progress');
    check(new URL(page.url()).pathname === '/stats' && !(await page.$(BAR.menu)), 'a section chosen: there, and the menu closed');
    await context.close();
  }

  step('The person\'s menu on a desktop: a real Tab from its last item');
  {
    const context = await newContext();
    const page = await signedIn(context, MIA, '/');
    await page.click(BAR.person);
    await page.waitForSelector(BAR.menu);
    await onTop(page, BAR.menu, "the person's menu");
    await page.screenshot({ path: join(shots, `account-menu-${DESKTOP}.png`), clip: { x: 0, y: 0, width: DESKTOP, height: 320 } });
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    check(!(await page.$(BAR.menu)) && (await page.evaluate((selector) => document.activeElement === document.querySelector(selector), BAR.person)), 'Tab from Sign out: closed, the focus on the person\'s button');
    await context.close();
  }

  step('The piano\'s box (the family\'s popover): inside the screen at 360 px, Escape and the focus back');
  for (const width of [360, DESKTOP]) {
    const context = await newContext({ width });
    const page = await signedIn(context, MIA, '/');
    await page.click('#midi-button');
    await page.waitForSelector('#midi-box');
    await page.waitForTimeout(100);
    const box = await page.$eval('#midi-box', (element) => element.getBoundingClientRect().toJSON());
    check(box.left >= 0 && box.right <= width, `${width}: the box inside the screen`, box);
    await onTop(page, '#midi-box', `${width}: the piano's box`);
    // The device list is the family's select (its own <select> inside #midi-device-select, loaded once the page is idle).
    check(await page.evaluate(() => document.activeElement?.tagName === 'SELECT' && !!document.activeElement.closest('#midi-device-select')), `${width}: the focus on the device list`);
    check(/MIDI/.test(await page.textContent('#midi-status')), `${width}: the state said (headless has no MIDI)`, await page.textContent('#midi-status'));
    await page.screenshot({ path: join(shots, `midi-box-${width}.png`), clip: { x: 0, y: 0, width, height: 360 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check(await page.isHidden('#midi-box'), `${width}: Escape closes it`);
    check((await page.evaluate(() => document.activeElement?.id)) === 'midi-button', `${width}: and gives the focus back to the button`);
    await context.close();
  }

  step('"Not saved yet": a pill beside the piano on a desktop; a dot on the menu button on a phone, its sentence in the menu');
  {
    const context = await newContext();
    const page = await signedIn(context, MIA, '/');
    await makeUnsaved(page);
    await page.waitForSelector('#save-status', { timeout: 15000 }).catch(() => undefined);
    check((await page.textContent('#save-status').catch(() => null)) === 'Not saved yet', 'the pill, while the save does not get through');
    await page.screenshot({ path: join(shots, `unsaved-${DESKTOP}.png`), clip: { x: 0, y: 0, width: DESKTOP, height: 120 } });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    check(!!(await page.$(`${BAR.phoneButton} .anotoki-top-bar__mark-dot`)), 'on a phone: the dot on the menu button');
    const described = await page.evaluate((selector) => {
      const id = document.querySelector(selector)?.getAttribute('aria-describedby');
      return id ? document.getElementById(id)?.textContent?.trim() : null;
    }, BAR.phoneButton);
    check(described === 'Not saved yet', 'its words for a screen reader, tied to the button', described);
    await page.click(BAR.phoneButton);
    await page.waitForSelector(BAR.menu);
    check((await page.textContent(`${BAR.menu} .anotoki-top-bar__menu-note strong`).catch(() => null)) === 'Not saved yet', 'and the menu\'s first line says it');
    await onTop(page, BAR.menu, 'that menu');
    await page.screenshot({ path: join(shots, 'unsaved-360-menu.png') });
    await checkBar(page, 'unsaved 360', 360);
    await context.close();
  }

  step('Your progress file: download, bring back, replace - and a stale tab told');
  {
    const context = await newContext();
    const a = await signedIn(context, MIA, '/stats');
    await a.waitForSelector('#own-progress');
    const [download] = await Promise.all([a.waitForEvent('download'), a.click('#own-download')]);
    const file = join(WORK, 'mine.json');
    await download.saveAs(file);
    check(/^piano-academy-progress-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), 'the download has the server\'s name', download.suggestedFilename());
    const exported = JSON.parse(readFileSync(file, 'utf8'));
    check(exported.format === 'piano-academy-export', 'and is a progress file');
    const note = (midi) => ({ midi, status: 'review', repetitions: 1, intervalHours: 4, easeFactor: 2.5, totalAttempts: 3, correctAttempts: 3, updatedAt: '2026-10-04T10:00:00.000Z' });
    exported.progress = { 60: note(60) };
    writeFileSync(file, JSON.stringify(exported));
    await a.setInputFiles('#own-file', file);
    await a.waitForSelector('#own-preview');
    check((await a.textContent('#own-incoming')).includes('1 note'), 'the dry run says what the file brings', await a.textContent('#own-incoming'));
    await a.click('#own-bring-in');
    await a.waitForSelector('#own-done');
    check((await a.textContent('#own-done')).includes('1 note'), 'brought back, and said so');

    // Three stale tabs, all open before the replace: Stats in this browser; the Note Trainer in this browser, in the
    // middle of a round (its storage event comes); the Note Trainer in another browser (no event: its next save is refused).
    const b = await context.newPage();
    await b.goto(`${APP}/stats`);
    await b.waitForSelector('#own-progress');
    const t = await context.newPage();
    await t.goto(`${APP}/trainer`);
    await t.waitForSelector('#tr-notation .vf-stavenote[data-midi]', { timeout: 20000 });
    const otherContext = await newContext();
    const o = await signedIn(otherContext, MIA, '/trainer');
    await o.waitForSelector('#tr-notation .vf-stavenote[data-midi]', { timeout: 20000 });
    const IMPORTED = ['60', '62', '64', '65', '67'];
    for (const midi of IMPORTED) exported.progress[midi] = note(Number(midi));
    writeFileSync(file, JSON.stringify(exported));
    await a.setInputFiles('#own-file', file);
    await a.waitForSelector('#own-replaces');
    await a.click('#own-bring-in');
    await a.waitForSelector(QUESTION);
    check((await a.textContent(`${QUESTION} .anotoki-dialog__title`))?.trim() === 'Replace your progress?', 'over progress: a question first (the family\'s)');
    check((await a.evaluate(() => document.activeElement?.getAttribute('data-answer'))) === 'no', 'the focus on the safe answer');
    await a.waitForTimeout(250);
    await a.screenshot({ path: join(shots, 'replace-question.png') });
    await a.click(`${QUESTION} [data-answer="yes"]`);
    await a.waitForSelector('#own-done');
    check(true, 'replaced');
    await b.waitForSelector('#progress-changed', { timeout: 10000 }).catch(() => undefined);
    check(!!(await b.$('#progress-changed')), 'the other tab says the progress changed elsewhere');
    await b.waitForFunction((tile) => document.querySelector(tile)?.textContent?.trim().startsWith('5/'), TILE, { timeout: 5000 }).catch(() => undefined);
    check((await b.textContent(TILE)).trim().startsWith('5/'), 'and shows what is saved now (5 notes)', (await b.textContent(TILE)).trim());
    await b.screenshot({ path: join(shots, 'stale-tab.png'), fullPage: true });

    // The Note Trainer in this browser heard it: it loaded the progress in the middle of its round. A note played now is
    // saved into what the import left - under the new generation, and with all five notes.
    await t.waitForSelector('#progress-changed', { timeout: 10000 }).catch(() => undefined);
    check(!!(await t.$('#progress-changed')), 'the Note Trainer in the middle of a round says the progress changed elsewhere');
    const tSave = t.waitForResponse((response) => response.url().endsWith('/api/progress') && response.request().method() === 'PUT', { timeout: 10000 });
    await playShown(t);
    const tSaved = await tSave;
    const tBody = JSON.parse(tSaved.request().postData() ?? '{}');
    check(tSaved.status() === 204 && IMPORTED.every((midi) => midi in tBody), 'its next note is saved over nothing: the five imported notes go with it', { status: tSaved.status(), notes: Object.keys(tBody) });
    await t.screenshot({ path: join(shots, 'stale-trainer.png'), fullPage: true });

    // The Note Trainer in the other browser heard nothing: its next save names the old generation and is refused (409);
    // it loads the progress, says so, and the note after that is saved into the five notes.
    const oRefused = o.waitForResponse((response) => response.url().endsWith('/api/progress') && response.request().method() === 'PUT', { timeout: 10000 });
    await playShown(o);
    check((await oRefused).status() === 409, 'another browser\'s Note Trainer: its next save is refused (409 progress_changed)', (await oRefused).status());
    await o.waitForSelector('#progress-changed', { timeout: 10000 }).catch(() => undefined);
    check(!!(await o.$('#progress-changed')), 'and it says the progress changed elsewhere');
    await o.waitForTimeout(1000); // the trainer's pause before the next prompt
    const oSave = o.waitForResponse((response) => response.url().endsWith('/api/progress') && response.request().method() === 'PUT', { timeout: 10000 });
    await playShown(o);
    const oSaved = await oSave;
    const oBody = JSON.parse(oSaved.request().postData() ?? '{}');
    check(oSaved.status() === 204 && IMPORTED.every((midi) => midi in oBody), 'the note after that is saved into the five imported notes - none of the round\'s old copy', { status: oSaved.status(), notes: Object.keys(oBody) });

    // What the server holds now: the file the person downloads has every imported note.
    const [after] = await Promise.all([a.waitForEvent('download'), a.click('#own-download')]);
    const afterFile = join(WORK, 'after.json');
    await after.saveAs(afterFile);
    const kept = Object.keys(JSON.parse(readFileSync(afterFile, 'utf8')).progress);
    check(IMPORTED.every((midi) => kept.includes(midi)), 'on the server: the imported notes survived both stale tabs', kept);
    await otherContext.close();
    await context.close();
  }

  step('The admin panel: EDITOR and ADMIN, English with Slovak chosen');
  {
    const context = await newContext();
    const page = await signedIn(context, ED, '/?lang=sk');
    const sections = (on) => on.$$eval(`${BAR.nav} a`, (all) => all.map((a) => a.textContent.trim()));
    check((await sections(page)).join('|') === 'Učenie|Tréning nôt|Hra z nôt|Skladby|Štatistiky', 'Slovak sections for an EDITOR who chose Slovak');
    await page.click(BAR.person);
    await page.waitForSelector(BAR.menu);
    check((await page.textContent(`${BAR.menu} a[href="/admin"]`))?.trim() === 'Administrátorský panel', 'the way in, in Slovak: "Administrátorský panel"');
    await page.click(`${BAR.menu} a[href="/admin"]`);
    await page.waitForSelector(`${BAR.nav} a[href="/admin/translations"]`);
    check(new URL(page.url()).pathname === '/admin/translations', 'into the admin panel, on Translations');
    check((await sections(page)).join('|') === 'Translations', 'an EDITOR\'s section: Translations alone');
    check((await page.getAttribute('html', 'lang')) === 'en', '<html lang="en"> in the admin panel');
    // The admin panel's brand is short at every width (eight sections for an ADMIN leave the whole wordmark no room):
    // "Piano" with "admin panel" under it - the whole "anotoki Piano Academy · admin panel" in the link's name.
    const brandShown = await page.$$eval('.anotoki-brand__wordmark > span', (all) => all.filter((span) => span.checkVisibility()).map((span) => span.textContent.trim()));
    check(brandShown.join('|') === 'Piano|admin panel', 'the brand short: "Piano", "admin panel" under it', brandShown);
    check((await page.getAttribute('.anotoki-brand__brand', 'aria-label')) === 'anotoki Piano Academy · admin panel', 'the brand link\'s name: the family\'s "anotoki Piano Academy · admin panel"');
    check((await page.title()) === 'Translations · Admin panel · Piano Academy', 'the title names the admin panel', await page.title());
    check(!(await page.$('anotoki-language-switcher')) && !(await page.$('app-midi-panel')), 'no language chooser, no piano');
    check((await page.getAttribute(BAR.person, 'aria-label')) === 'Your menu: ed', 'the bar\'s words in English');
    await page.click(BAR.person);
    await page.waitForSelector(BAR.menu);
    const items = await page.$$eval(`${BAR.menu} [role="menuitem"]`, (all) => all.map((item) => item.textContent.replace(/\s+/g, ' ').trim()));
    check(JSON.stringify(items) === JSON.stringify(['Your anotoki account', 'Back to Piano Academy', 'Sign out']), 'the person\'s menu in English, with the way back', items);
    check(!(await page.$('#admin-nav')), 'the admin layout draws no section nav of its own');
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(shots, 'admin-editor.png'), clip: { x: 0, y: 0, width: DESKTOP, height: 400 } });
    await page.keyboard.press('Escape');
    // The pages for ADMIN alone (the family's adminGuard): an EDITOR who opens one is sent to the start page.
    await page.goto(`${APP}/admin/people`);
    await page.waitForFunction(() => location.pathname === '/', null, { timeout: 10000 }).catch(() => undefined);
    check(new URL(page.url()).pathname === '/', 'an EDITOR on /admin/people lands on the start page', page.url());
    check(await page.evaluate(async () => (await fetch('/api/admin/people')).status === 401), 'the API itself answers no token with 401');
    await page.waitForSelector(`${BAR.nav} a[href="/stats"]`);
    check((await page.getAttribute('html', 'lang')) === 'sk', 'back: Slovak again');
    await context.close();

    const adminContext = await newContext();
    const admin = await signedIn(adminContext, ADA, '/admin/people');
    await admin.waitForSelector('[data-people] [data-person]', { timeout: 20000 });
    check((await sections(admin)).join('|') === ADMIN_SECTIONS, 'an ADMIN\'s sections: the family\'s admin tools among them', await sections(admin));
    check((await admin.$$eval(`${BAR.nav} a[aria-current="page"]`, (all) => all.map((a) => a.textContent.trim()))).join() === 'People', 'People is the page');
    await admin.screenshot({ path: join(shots, 'admin-people.png'), fullPage: true });
    // Migrations: the anotoki family's page (@anotoki/lib/migrations/page), in the admin panel's frame.
    await admin.click(`${BAR.nav} a[href="/admin/migrations"]`);
    await admin.waitForSelector(`${MIGRATIONS} [data-pending]`);
    check((await admin.textContent(`${MIGRATIONS} [data-pending]`)).includes('Nothing pending'), 'Migrations (the family\'s page): nothing pending');
    check(await admin.isDisabled(`${MIGRATIONS} [data-apply]`), 'Apply pending is off with nothing pending');
    await admin.waitForSelector(`${MIGRATIONS} [data-applied] li`);
    const applied = await admin.$$eval(`${MIGRATIONS} [data-applied] li`, (all) => all.map((li) => [li.querySelector('code').textContent.trim(), li.querySelector('.anotoki-migrations-page__when')?.textContent.trim() ?? '']));
    // Four sets: the library's admin tools' first, the app's own, then the library's words' and people's - the
    // library's files named with their set, the app's one set's by their names alone (as the engine records them).
    // Listed in the order they were applied: a database made at once has the app's 012 before the library's words,
    // one brought up to date (the tests' template, which this check's database is a copy of) has the newer files of
    // every set after the older ones - so each set is checked in its own order, every file once.
    const names = applied.map(([name]) => name);
    const everyFile = MIGRATION_SETS.flatMap(([, files]) => files);
    check(
      names.length === everyFile.length &&
        everyFile.every((file) => names.filter((name) => name === file).length === 1) &&
        MIGRATION_SETS.every(([set, files]) => JSON.stringify(names.filter((name) => (set ? name.startsWith(set) : !name.includes('/')))) === JSON.stringify(files)) &&
        JSON.stringify(names.slice(0, 3)) === JSON.stringify(['anotoki_admin/001_audit_log.sql', 'anotoki_admin/002_feedback.sql', '001_init.sql']) &&
        names.indexOf('002_languages_and_translations.sql') < names.indexOf('anotoki_translations/001_languages_and_strings.sql') &&
        applied.every(([, when]) => /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(when)),
      `Applied: every file once with when (the admin panel's stamp), each set in its own order - the app's to ${MIGRATION_SETS[1][1].at(-1)}, the library's words' to ${MIGRATION_SETS[2][1].at(-1)} -, the library's admin tools first, its words after the app's tables of them`,
      names,
    );
    check((await admin.title()) === 'Migrations · Admin panel · Piano Academy', 'its title', await admin.title());
    // Each applied file's SQL, read from the server, in the family's dialog: the focus on Close, Escape closes it.
    const sql = `${MIGRATIONS} anotoki-dialog[data-sql] dialog[open]`;
    await admin.locator(`${MIGRATIONS} [data-applied] li`, { hasText: '009_strings_through_the_library.sql' }).locator('button').click();
    await admin.waitForSelector(`${sql} pre.anotoki-migrations-page__sql`, { timeout: 10000 });
    check((await admin.textContent(`${sql} pre.anotoki-migrations-page__sql`)).includes("'anotoki.topbar.signIn'"), 'View: 009\'s SQL from the server', (await admin.textContent(sql)).slice(0, 200));
    check((await admin.evaluate(() => document.activeElement?.hasAttribute('data-close'))) === true, 'the focus on Close');
    await admin.waitForTimeout(250);
    await admin.screenshot({ path: join(shots, `admin-migrations-sql-${DESKTOP}.png`) });
    await admin.keyboard.press('Escape');
    await admin.waitForSelector(sql, { state: 'detached', timeout: 3000 }).catch(() => undefined);
    check(!(await admin.$(sql)), 'Escape closes it');
    await admin.screenshot({ path: join(shots, `admin-migrations-${DESKTOP}.png`), fullPage: true });
    // The Database page's old address.
    await admin.goto(`${APP}/admin/database`);
    await admin.waitForSelector(`${MIGRATIONS} [data-pending]`);
    check(new URL(admin.url()).pathname === '/admin/migrations', '/admin/database goes to /admin/migrations', admin.url());
    // A phone: the admin panel's bar (Piano's own short form beside the mark, "admin panel" under it) and the page, nothing wider than the screen.
    await admin.setViewportSize({ width: 360, height: 800 });
    await admin.waitForTimeout(200);
    const shortBrand = await admin.evaluate(() => [...document.querySelectorAll('.anotoki-brand__wordmark > span')].filter((span) => span.checkVisibility()).map((span) => span.textContent.trim()));
    check(JSON.stringify(shortBrand) === JSON.stringify(['Piano', 'admin panel']), 'at 360: "Piano" beside the mark, "admin panel" under it', shortBrand);
    check(await admin.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'at 360: no sideways scroll');
    await admin.screenshot({ path: join(shots, 'admin-migrations-360.png'), fullPage: true });
    await adminContext.close();

    // A learner (no role here) is sent to the start page by the family's staffGuard: the admin panel is not theirs.
    const learnerContext = await newContext();
    const learner = await signedIn(learnerContext, MIA, '/admin/people');
    await learner.waitForSelector(`${BAR.nav} a[href="/stats"]`, { timeout: 20000 });
    check(new URL(learner.url()).pathname === '/' && !(await learner.$(`${BAR.nav} a[href="/admin/translations"]`)), 'a learner on the admin panel\'s address: the start page, none of its sections', learner.url());
    await learnerContext.close();
  }

  step(`A sign-in that did not work: the family's screen under the bar (/sign-in-failed) - why, in this app's words, Try again; light and dark, ${DESKTOP} and 390`);
  {
    const NO = { id: 9, username: 'no', roles: [] };
    for (const scheme of ['light', 'dark']) {
      for (const width of [DESKTOP, 390]) {
        const label = `${scheme}, ${width}`;
        await iamAs(NO, { deny: true });
        const context = await newContext({ width, scheme });
        const page = await context.newPage();
        await page.goto(`${APP}/stats`);
        await page.waitForSelector(`${FAILURE} [role="alert"]`, { timeout: 20000 });
        check(new URL(page.url()).pathname === '/sign-in-failed', `${label}: the guard sent the browser to /sign-in-failed`, page.url());
        const said = await page.evaluate((screen) => ({
          title: document.querySelector(`${screen} h1`)?.textContent.trim(),
          message: document.querySelector(`${screen} [role="alert"]`)?.textContent.trim(),
          buttons: [...document.querySelectorAll(`${screen} button`)].map((button) => button.textContent.trim()),
        }), FAILURE);
        check(
          said.title === 'Signing in did not work' &&
            said.message === 'Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.' &&
            JSON.stringify(said.buttons) === JSON.stringify(['Try again', 'Back']),
          `${label}: "Signing in did not work", why in this app's words (011's copy), Try again and Back`,
          said,
        );
        check(!!(await page.$('app-top-bar anotoki-top-bar')) && !!(await page.$(`#view-root ${FAILURE}`)), `${label}: in this app's frame, under its bar`);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label}: no sideways scroll`);
        check((await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '')).includes('noindex'), `${label}: noindex while it shows`);
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(shots, `sign-in-failed-${scheme}-${width}.png`), fullPage: true });
        if (scheme === 'light' && width === DESKTOP) {
          // Try again, now that the IAM lets the account in: signed in, back on the page the sign-in started from.
          await iamAs(MIA);
          await page.click(`${FAILURE} [data-retry]`);
          await page.waitForSelector('#own-progress', { timeout: 20000 });
          check(new URL(page.url()).pathname === '/stats' && (await page.textContent(BAR.name)) === 'mia', 'Try again: signed in, back on /stats', page.url());
        }
        await context.close();
      }
    }
    await iamAs(MIA);
  }

  step(`The feedback form (the family's, from the footer's "Send feedback"): light and dark, ${DESKTOP} and 390 - sent, kept, no mail`);
  {
    const before = Number(fromTheDatabase('SELECT count(*) AS n FROM anotoki_feedback')[0].n);
    for (const scheme of ['light', 'dark']) {
      for (const width of [DESKTOP, 390]) {
        const label = `${scheme}, ${width}`;
        const context = await newContext({ width, scheme });
        const page = await signedIn(context, MIA, '/stats');
        check((await page.textContent('#feedback-open'))?.trim() === 'Send feedback', `${label}: "Send feedback" at the foot of the page`);
        await page.click('#feedback-open');
        await page.waitForSelector('anotoki-dialog dialog[open] anotoki-feedback-form [data-send]', { timeout: 20000 });
        await page.waitForTimeout(300);
        check((await page.textContent('anotoki-dialog dialog[open] .anotoki-dialog__title'))?.trim() === 'Send feedback', `${label}: in the family's dialog, its heading the form's title`);
        const box = await page.$eval('anotoki-dialog dialog[open]', (dialog) => {
          const rect = dialog.getBoundingClientRect();
          return { left: rect.left, right: rect.right, screen: document.documentElement.clientWidth };
        });
        check(box.left >= 0 && box.right <= box.screen, `${label}: the dialog inside the screen`, box);
        check(!!(await page.$('anotoki-feedback-form [data-anonymous]')) && !!(await page.$('anotoki-feedback-form [data-section]')), `${label}: a learner's form - this app's places, "without my name"`);
        check((await keysOnPage(page)).length === 0, `${label}: no key in it`, await keysOnPage(page));
        await page.screenshot({ path: join(shots, `feedback-form-${scheme}-${width}.png`) });
        if (scheme === 'light') {
          await page.fill('anotoki-feedback-form [data-message] textarea', `The Note Trainer at ${width} px is lovely.`);
          const sent = page.waitForResponse((response) => response.url().endsWith('/api/feedback') && response.request().method() === 'POST', { timeout: 10000 });
          await page.click('anotoki-feedback-form [data-send]');
          check((await sent).status() === 201, `${label}: sent - the server kept it (201)`);
          await page.waitForSelector('anotoki-feedback-form [data-thanks]', { timeout: 10000 });
          await page.waitForTimeout(250);
          await page.screenshot({ path: join(shots, `feedback-thanks-${width}.png`) });
        }
        await page.keyboard.press('Escape');
        await page.waitForSelector('anotoki-dialog dialog[open]', { state: 'detached', timeout: 3000 }).catch(() => undefined);
        check(!(await page.$('anotoki-dialog dialog[open]')), `${label}: Escape closes it`);
        await context.close();
      }
    }
    const kept = fromTheDatabase(`SELECT user_id, page, kind, message FROM anotoki_feedback ORDER BY id OFFSET ${before}`);
    check(kept.length === 2 && kept.every((row) => Number(row.user_id) === 7 && row.page === '/stats' && row.kind === 'bug'), 'the server kept both, by mia, from /stats - and nothing of where they came from', kept);
  }

  step(`Terms, Privacy and Contact (the family's pages, @anotoki/lib/legal/pages) with nobody signed in and a sign-in required - never a trip to the IAM: 1280 and 390, light and dark, English and Slovak; the footer's links; signed in, from Stats`);
  {
    // Each page's heading is the library's words (its translations' 005) and the tab's title too (migration 012's
    // title.*); the footer's links are the library's words (anotoki.legalLinks.*).
    const LEGAL = {
      en: { headings: { '/terms': 'Terms of use', '/privacy': 'Privacy policy', '/contact': 'Contact' }, links: ['Terms', 'Privacy', 'Contact'], signIn: 'Sign in' },
      sk: { headings: { '/terms': 'Podmienky používania', '/privacy': 'Ochrana osobných údajov', '/contact': 'Kontakt' }, links: ['Podmienky', 'Súkromie', 'Kontakt'], signIn: 'Prihlásiť sa' },
    };
    // Every address a legal page of Piano Academy's may link to: the anotoki account's pages at the IAM the app signs in
    // with, its own Contact page, the family's address and operator, the authority, Cloudflare (core/legal/legal-facts.ts).
    const ADDRESSES = [`${IAM}/account`, `${IAM}/privacy`, '/contact', 'mailto:support@anotoki.eu', 'https://codehero.sk', 'https://dataprotection.gov.sk/', 'https://www.cloudflare.com/privacypolicy/'];
    const attribute = (page, selector, name) => page.getAttribute(selector, name, { timeout: 5000 }).catch(() => null);
    for (const language of ['en', 'sk']) {
      for (const scheme of ['light', 'dark']) {
        for (const width of [1280, 390]) {
          const label = `${language} ${scheme} ${width}`;
          const words = LEGAL[language];
          const context = await newContext({ width, scheme });
          const page = await context.newPage();
          const trips = [];
          const calls = [];
          page.on('request', (request) => {
            if (request.isNavigationRequest() && request.frame() === page.mainFrame()) trips.push(request.url());
            else if (request.url().startsWith(`${APP}/api/`)) calls.push(request.url().slice(APP.length).split('?')[0]);
          });
          for (const [index, address] of ['/terms', '/privacy', '/contact'].entries()) {
            // The first by its address, the language with it; the others from the footer's links, in the app.
            if (index === 0) await page.goto(`${APP}${address}?lang=${language}`);
            else await page.click(`${LEGAL_LINKS} a[href="${address}"]`);
            const heading = words.headings[address];
            const where = `${label} ${address}`;
            await page.waitForFunction((expected) => document.querySelector('#view-root h1')?.textContent.trim() === expected, heading, { timeout: 20000 }).catch(() => undefined);
            const shown = (await page.textContent('#view-root h1', { timeout: 5000 }).catch(() => null))?.trim();
            check(new URL(page.url()).pathname === address && shown === heading, `${where}: "${heading}", on its own address`, [page.url(), shown]);
            check((await page.title()) === `${heading} · Piano Academy`, `${where}: the tab's title`, await page.title());
            check((await page.getAttribute('html', 'lang')) === language, `${where}: <html lang="${language}">`);
            await page.waitForTimeout(250);
            check((await keysOnPage(page)).length === 0, `${where}: no key on the page`, await keysOnPage(page));
            check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${where}: no sideways scroll`);
            const footer = await page.$$eval(`${LEGAL_LINKS} a`, (all) => all.map((a) => [a.textContent.trim(), a.getAttribute('href'), a.getAttribute('aria-current')]));
            check(
              JSON.stringify(footer.map(([text]) => text)) === JSON.stringify(words.links) && JSON.stringify(footer.filter(([, , current]) => current === 'page').map(([, href]) => href)) === JSON.stringify([address]),
              `${where}: the footer's links in the library's words, this page's marked`,
              footer,
            );
            if (address === '/terms') {
              check(!!(await page.textContent('[data-about]', { timeout: 5000 }).catch(() => ''))?.trim() && !(await page.$('[data-fan]')), `${where}: what Piano Academy is (012's words) first, no fan clause`);
            }
            if (address === '/privacy') {
              check((await attribute(page, '[data-account-privacy]', 'href')) === `${IAM}/privacy` && (await attribute(page, '[data-account-page]', 'href')) === `${IAM}/account`, `${where}: the anotoki account's Privacy page and account page, at the IAM the app signs in with`, [await attribute(page, '[data-account-privacy]', 'href'), await attribute(page, '[data-account-page]', 'href')]);
              const kept = await page.$$eval('[data-kept]', (all) => all.map((part) => part.getAttribute('data-kept')));
              check(JSON.stringify(kept) === JSON.stringify(['data-0', 'data-1', 'data-2', 'data-3', 'visitors', 'feedback', 'error-log', 'audit-log', 'backups']), `${where}: what is kept - the app's four parts, the visitors, feedback, the error log, the audit log, the backups`, kept);
              const stored = await page.$$eval('[data-stored] code', (all) => all.map((code) => code.textContent.trim()));
              check(stored.length === 11 && stored[0] === 'anotoki-auth:piano-academy' && stored.includes('anotoki_signed_in') && stored.includes('piano-academy:visitor'), `${where}: this browser's storage by name - the sign-in's under the app's client id`, stored);
              const links = await page.$$eval('anotoki-privacy-page a[href]', (all) => all.map((a) => a.getAttribute('href')));
              check(links.every((href) => href.startsWith('#') || ADDRESSES.includes(href)), `${where}: every link where the code says`, links);
              if (language === 'en') {
                const recipients = await page.$$eval('[data-recipient] .anotoki-legal-page__item-name', (all) => all.map((name) => name.textContent.trim()));
                check(JSON.stringify(recipients) === JSON.stringify(['The hosting company (to be named)', 'Cloudflare, Inc.']), `${where}: who else handles data - the hosting company (to be named), Cloudflare`, recipients);
              }
            }
            if (address === '/contact') {
              check((await attribute(page, '[data-section="email"] a', 'href')) === 'mailto:support@anotoki.eu' && (await attribute(page, '[data-account-page]', 'href')) === `${IAM}/account`, `${where}: the family's address, and the anotoki account's page to delete the account`);
              check(!!(await page.$('[data-section="feedback"] [data-open-feedback]')), `${where}: the feedback form offered first`);
            }
            await page.screenshot({ path: join(shots, `legal-${language}-${scheme}-${width}${address.replace('/', '-')}.png`), fullPage: true });
          }
          // Nobody signed in where a sign-in is required: the bar offers Sign in - on a folded bar in its menu, alone (no
          // sections: the app does not run for nobody).
          if (width <= PHONE_BAR_MAX) {
            await page.click(BAR.phoneButton);
            await page.waitForSelector(BAR.menu);
            const items = await page.$$eval(`${BAR.menu} [role="menuitem"]`, (all) => all.map((item) => item.textContent.replace(/\s+/g, ' ').trim()));
            check(JSON.stringify(items) === JSON.stringify([words.signIn]), `${label}: the folded bar's menu holds Sign in alone`, items);
            await onTop(page, BAR.menu, `${label}: that menu`);
            await page.screenshot({ path: join(shots, `legal-${language}-${scheme}-${width}-menu.png`) });
            await page.keyboard.press('Escape');
          } else {
            check((await page.textContent(BAR.signIn, { timeout: 5000 }).catch(() => null))?.trim() === words.signIn, `${label}: Sign in in the bar`);
          }
          // Contact's "Send feedback": the family's form in the kit's dialog, for anybody - nothing sent here.
          if (scheme === 'light') {
            await page.click('[data-open-feedback]');
            await page.waitForSelector('anotoki-dialog dialog[open] anotoki-feedback-form [data-send]', { timeout: 20000 });
            await page.waitForTimeout(300);
            const box = await page.$eval('anotoki-dialog dialog[open]', (dialog) => {
              const rect = dialog.getBoundingClientRect();
              return { left: rect.left, right: rect.right, screen: document.documentElement.clientWidth };
            });
            check(box.left >= 0 && box.right <= box.screen && (await keysOnPage(page)).length === 0, `${label}: Contact's "Send feedback" opens the family's form, inside the screen, no key`, box);
            await page.screenshot({ path: join(shots, `legal-${language}-${width}-contact-feedback.png`) });
            await page.keyboard.press('Escape');
            await page.waitForSelector('anotoki-dialog dialog[open]', { state: 'detached', timeout: 3000 }).catch(() => undefined);
            check(!(await page.$('anotoki-dialog dialog[open]')), `${label}: Escape closes it`);
          }
          check(trips.length === 1 && !trips.some((url) => url.startsWith(IAM)), `${label}: one page load, never a trip to the IAM`, trips);
          const learnerCalls = calls.filter((api) => !/^\/api\/(site-status|auth\/config|translations\/[a-z-]+|health)$/.test(api));
          check(learnerCalls.length === 0, `${label}: no call for a learner's data - only where the site stands, the sign-in's settings and the words`, calls);
          await context.close();
        }
      }
    }

    // Signed in: the footer's Privacy from Stats - in the app (no page load, nothing to the IAM), the person's bar and the
    // learner's sections still there, none of them this page; an address the app does not have goes to Learn.
    const context = await newContext();
    const page = await signedIn(context, MIA, '/stats');
    const trips = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) trips.push(request.url());
    });
    await page.click(`${LEGAL_LINKS} a[href="/privacy"]`);
    await page.waitForFunction(() => document.querySelector('#view-root h1')?.textContent.trim() === 'Privacy policy', null, { timeout: 20000 }).catch(() => undefined);
    check(new URL(page.url()).pathname === '/privacy' && trips.length === 0, 'signed in: the footer\'s Privacy opens in the app - no page load, nothing to the IAM', [page.url(), trips]);
    const sections = await page.$$eval(`${BAR.nav} a`, (all) => all.map((a) => [a.textContent.trim(), a.getAttribute('aria-current')]));
    check((await page.textContent(BAR.name)) === 'mia' && sections.length === 5 && sections.every(([, current]) => current === null), 'the person\'s bar and the learner\'s sections - none of them this page', sections);
    await page.screenshot({ path: join(shots, `legal-signed-in-privacy-${DESKTOP}.png`), fullPage: true });
    await page.goto(`${APP}/no-such-page`);
    await page.waitForFunction(() => location.pathname === '/' && !!document.querySelector('#view-root app-home-page'), null, { timeout: 20000 }).catch(() => undefined);
    check(new URL(page.url()).pathname === '/' && !!(await page.$('#view-root app-home-page')), 'an address the app does not have: Learn', page.url());
    await context.close();
  }

  step(`The family's admin pages (ADMIN, English): People, Feedback (how many are new, in the bar), Error log, Audit log, Backups - light and dark, ${DESKTOP} and 390`);
  {
    // Something for the error log: a 404, its query never kept.
    await fetch(`${APP}/api/no-such-thing?token=secret-in-the-query`);
    const PAGES = [
      ['people', '[data-people] [data-person]'],
      ['feedback', '[data-messages] [data-message]'],
      ['errors', '[data-groups] [data-fingerprint], [data-groups] tr'],
      ['audit', '[data-entries] [data-entry]'],
      ['backups', '[data-backups] [data-backup]'],
    ];
    for (const scheme of ['light', 'dark']) {
      for (const width of [DESKTOP, 390]) {
        const label = `${scheme}, ${width}`;
        const context = await newContext({ width, scheme });
        const page = await signedIn(context, ADA, '/admin/people');
        for (const [name, ready] of PAGES) {
          await page.goto(`${APP}/admin/${name}`);
          await page.waitForSelector(ready, { timeout: 20000 });
          await page.waitForTimeout(300);
          check((await page.getAttribute('html', 'lang')) === 'en', `${label} ${name}: in English`);
          check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label} ${name}: no sideways scroll`);
          check((await keysOnPage(page)).length === 0, `${label} ${name}: no key on the page`, await keysOnPage(page));
          await page.screenshot({ path: join(shots, `admin-${name}-${scheme}-${width}.png`), fullPage: true });
        }
        await context.close();
      }
    }

    // Once, on a desktop: what each page holds of this app's.
    const context = await newContext();
    const page = await signedIn(context, ADA, '/admin/feedback');
    const unread = Number(fromTheDatabase("SELECT count(*) AS n FROM anotoki_feedback WHERE status = 'new'")[0].n);
    const badge = () => page.evaluate((nav) => document.querySelector(`${nav} a[href="/admin/feedback"] .anotoki-top-bar__badge`)?.textContent.trim() ?? null, BAR.nav);
    await page.waitForSelector('[data-messages] [data-message]', { timeout: 20000 });
    await page.waitForTimeout(300);
    check(unread > 0 && (await badge()) === String(unread), 'the bar: "Feedback" with how many messages are new (no mail is sent)', [unread, await badge()]);
    // The admin panel's own fold: folded up to ADMIN_PHONE_BAR_MAX, one row from a pixel more, the brand short at every width.
    for (const width of [ADMIN_PHONE_BAR_MAX, ADMIN_PHONE_BAR_MAX + 1, DESKTOP]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const row = await checkAdminBar(page, `the admin panel's bar at ${width}`, width);
      console.log(`       admin ${width}: ${row.map((thing) => `${thing.what} ${thing.left}-${thing.right}`).join(', ')}`);
      await page.screenshot({ path: join(shots, `admin-bar-${width}.png`), clip: { x: 0, y: 0, width, height: 120 } });
    }
    await page.setViewportSize({ width: DESKTOP, height: 900 });
    await page.waitForTimeout(150);
    await page.click('[data-messages] [data-message]');
    await page.waitForSelector('[data-viewer]', { timeout: 10000 });
    check((await page.textContent('[data-viewer]'))?.includes('lovely'), 'a message opened: its words, as text', (await page.textContent('[data-viewer]'))?.slice(0, 200));
    await page.screenshot({ path: join(shots, `admin-feedback-message-${DESKTOP}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(([nav, expected]) => (document.querySelector(`${nav} a[href="/admin/feedback"] .anotoki-top-bar__badge`)?.textContent.trim() ?? '0') === expected, [BAR.nav, String(unread - 1)], { timeout: 5000 }).catch(() => undefined);
    check(((await badge()) ?? '0') === String(unread - 1), 'opened: read - the bar\'s number one less', await badge());

    // A page's own error (anotoki-lib 0.5.0's reporter, core/error-report.ts): thrown outside Angular's own code, it
    // goes to the console and - through the app's HttpClient, so with ada's token - into the error log. Thrown on
    // purpose, so it is taken off the list of the page errors this check otherwise allows none of.
    const thrown = 'The browser check threw this on purpose';
    const reportSent = page.waitForResponse((response) => response.url().endsWith('/api/client-errors') && response.request().method() === 'POST', { timeout: 10000 }).catch(() => null);
    await page.evaluate((words) => setTimeout(() => { throw new Error(`${words} (token=abc123secretvalue456)`); }, 0), thrown);
    const report = await reportSent;
    check(report?.status() === 204 && ((await report?.request().headerValue('authorization')) ?? '').startsWith('Bearer '), 'a page\'s own error: reported to the error log (204), with her token', report?.status());
    await page.waitForTimeout(300);
    errors.splice(0, errors.length, ...errors.filter((message) => !message.includes(thrown)));

    await page.goto(`${APP}/admin/errors`);
    await page.waitForSelector('[data-groups]', { timeout: 20000 });
    const errorLog = await page.textContent('[data-groups]');
    check(errorLog.includes('/api/no-such-thing') && !errorLog.includes('secret-in-the-query'), 'the error log: the 404 by its path - never its query', errorLog.slice(0, 300));
    check(errorLog.includes(thrown) && !errorLog.includes('abc123secretvalue456'), 'the error log: the page\'s own error, the secret in it gone', errorLog.slice(0, 400));
    await page.screenshot({ path: join(shots, `admin-errors-client-${DESKTOP}.png`), fullPage: true });

    await page.goto(`${APP}/admin/people`);
    await page.waitForSelector('[data-people] [data-person]', { timeout: 20000 });
    check(!!(await page.$('[data-person="1"] [data-you]')), 'People: the reader\'s own row says so');
    check(!!(await page.$('[data-sync]')) && !!(await page.$('[data-visitors]')), 'People: where the scrub of the IAM\'s deleted accounts stands, and the visitors\' line');

    await page.goto(`${APP}/admin/backups`);
    await page.waitForSelector('[data-backups] [data-backup]', { timeout: 20000 });
    check(!!(await page.$('[data-backups] [data-backup*="-daily-"]')), 'Backups: the daily one, made after the day\'s first answer');
    const manual = () => page.$$('[data-backups] [data-backup*="-manual-"]');
    const already = (await manual()).length;
    await page.click('[data-create]');
    await page.waitForSelector('[data-guarded-confirm], [data-backups] [data-backup*="-manual-"]', { timeout: 10000 }).catch(() => undefined);
    if (await page.$('[data-guarded-confirm]')) await page.click('[data-guarded-confirm]');
    await page.waitForTimeout(1500);
    await page.waitForFunction((count) => document.querySelectorAll('[data-backups] [data-backup*="-manual-"]').length > count, already, { timeout: 20000 }).catch(() => undefined);
    check((await manual()).length === already + 1, 'Back up now (a sign-in of the last ten minutes): a backup made, in the list');
    const madeRows = await Promise.all((await manual()).map((row) => row.textContent()));
    check(madeRows.some((text) => (text ?? '').includes('ada')), 'the backup made by hand: "By" ada - the name this app keeps of her', madeRows.map((text) => text?.slice(0, 160)));
    await page.screenshot({ path: join(shots, `admin-backups-made-${DESKTOP}.png`), fullPage: true });

    await page.goto(`${APP}/admin/audit`);
    await page.waitForSelector('[data-entries] [data-entry]', { timeout: 20000 });
    const audit = await page.textContent('[data-entries]');
    check(audit.includes('backup.created') && audit.includes('ada'), 'the audit log: the backup, made by ada - named as this app knows her', audit.slice(0, 300));
    await context.close();
  }

  step(`The words' pages (the family's, @anotoki/lib/translations/admin) and a Slovak page: light and dark, ${DESKTOP} and 390`);
  {
    for (const scheme of ['light', 'dark']) {
      for (const width of [DESKTOP, 390]) {
        const label = `${scheme}, ${width}`;
        const context = await newContext({ width, scheme });
        const page = await signedIn(context, ADA, '/admin/translations');
        // Translations: this app's strings through the library's routes (snake_case), the library's words among them.
        await page.waitForSelector('anotoki-translations-page anotoki-translation-cell', { timeout: 20000 });
        const coverage = await page.$$eval('anotoki-translations-page li[data-language]', (all) => all.map((li) => li.getAttribute('data-language')));
        check(JSON.stringify(coverage) === JSON.stringify(['en', 'sk']), `${label}: Translations - English and Slovak, each with its coverage`, coverage);
        check((await page.$$('anotoki-translations-page anotoki-translation-cell')).length > 100, `${label}: Translations - this app's strings in the grid`);
        const said = await page.textContent('anotoki-translations-page');
        check(said.includes('anotoki.topbar.account') && said.includes('nav.learn'), `${label}: Translations - the library's keys (009 copied this app's words there) beside this app's own`);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label}: Translations - no sideways scroll`);
        check((await page.getAttribute('html', 'lang')) === 'en', `${label}: Translations - in English`);
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(shots, `words-translations-${scheme}-${width}.png`) });
        // Languages: the two released ones, each under its own name (native_name).
        await page.goto(`${APP}/admin/languages`);
        await page.waitForSelector('anotoki-languages-page li[data-language]', { timeout: 20000 });
        const languages = await page.$$eval('anotoki-languages-page li[data-language]', (all) => all.map((li) => [li.getAttribute('data-language'), li.querySelector('.anotoki-languages-page__native')?.textContent.trim()]));
        check(JSON.stringify(languages) === JSON.stringify([['en', 'English'], ['sk', 'Slovenčina']]), `${label}: Languages - English and Slovak, each under its own name`, languages);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label}: Languages - no sideways scroll`);
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(shots, `words-languages-${scheme}-${width}.png`), fullPage: true });
        // A learner's page in Slovak: no key where a word should be, the kit's words (the library's keys) too.
        await page.goto(`${APP}/?lang=sk`);
        await page.waitForFunction(() => document.documentElement.lang === 'sk', null, { timeout: 20000 });
        await page.waitForSelector(`${BAR.nav} a[href="/stats"], ${BAR.phoneButton}`, { timeout: 20000 });
        check((await keysOnPage(page)).length === 0, `${label}: Learn in Slovak - no key on the page`, await keysOnPage(page));
        const themes = await page.$$eval(BAR.theme, (all) => all.map((choice) => choice.getAttribute('aria-label')));
        check(JSON.stringify(themes) === JSON.stringify(['Vzhľad: svetlý', 'Vzhľad: tmavý', 'Vzhľad: systémový']), `${label}: the theme switch in this app's Slovak (the library's keys, 009's copy)`, themes);
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(shots, `words-slovak-learn-${scheme}-${width}.png`) });
        await context.close();
      }
    }
  }

  step('Every learner page in Slovak: no key where a word should be');
  {
    const context = await newContext({ width: 390 });
    const page = await signedIn(context, MIA, '/');
    await page.click(BAR.language);
    await page.click('[role="menuitemradio"][lang="sk"]');
    await page.waitForFunction(() => document.documentElement.lang === 'sk');
    const pages = ['/', '/lesson/rh-1/meet', '/trainer', '/sheet', '/songs', '/songs/hot-cross-buns', '/stats'];
    for (const address of pages) {
      await page.goto(`${APP}${address}`);
      await page.waitForFunction(() => !!document.querySelector('#view-root router-outlet')?.nextElementSibling, null, { timeout: 20000 });
      await page.waitForTimeout(400);
      const keys = await keysOnPage(page);
      check(keys.length === 0, `${address}: no key on the page`, keys);
      check((await page.getAttribute('html', 'lang')) === 'sk', `${address}: <html lang="sk">`);
      await page.screenshot({ path: join(shots, `sk-390${address.replace(/\//g, '_') || '_home'}.png`), fullPage: true });
    }
    // The own file's question, in Slovak.
    await page.goto(`${APP}/stats`);
    await page.waitForSelector('#own-progress');
    const file = join(WORK, 'mine.json');
    await page.setInputFiles('#own-file', file);
    await page.waitForSelector('#own-replaces');
    await page.click('#own-bring-in');
    await page.waitForSelector(QUESTION);
    check((await page.textContent(`${QUESTION} .anotoki-dialog__title`))?.trim() === 'Nahradiť tvoj postup?', 'the question before replacing, in Slovak');
    check((await keysOnPage(page)).length === 0, 'and no key in it');
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(shots, 'sk-390-question.png') });
    await page.click(`${QUESTION} [data-answer="no"]`);
    await page.waitForSelector(QUESTION, { state: 'detached', timeout: 3000 }).catch(() => undefined);
    await page.click(BAR.phoneButton);
    await page.waitForSelector(BAR.menu);
    check((await keysOnPage(page)).length === 0, 'the phone\'s menu in Slovak: no key');
    check((await page.textContent(`${BAR.menu} a[href="/"]`))?.trim() === 'Učenie', 'its sections in Slovak');
    await onTop(page, BAR.menu, 'the Slovak menu');
    await page.screenshot({ path: join(shots, 'sk-390-menu.png') });
    await context.close();

    // A sign-in turned away, in Slovak: the family's screen that says why, no loop.
    await iamAs({ id: 9, username: 'no', roles: [] }, { deny: true });
    const denied = await newContext();
    const d = await denied.newPage();
    let trips = 0;
    d.on('framenavigated', (frame) => {
      if (frame === d.mainFrame() && frame.url().includes('/auth/callback')) trips++;
    });
    await d.goto(`${APP}/songs?lang=sk`);
    await d.waitForSelector(`${FAILURE} [role="alert"]`, { timeout: 20000 });
    await d.waitForTimeout(800);
    check(trips === 1, 'a refused sign-in: one trip to the IAM, no loop', trips);
    check(new URL(d.url()).pathname === '/sign-in-failed', 'on the failure\'s screen (/sign-in-failed), under the bar', d.url());
    check((await keysOnPage(d)).length === 0, 'the screen in Slovak: no key');
    check((await d.getAttribute(`${FAILURE} section`, 'lang')) === 'sk' && (await d.textContent(`${FAILURE} [role="alert"]`))?.trim().startsWith('Prihlásenie'), 'and in Slovak - this app\'s own sentence (011\'s copy under the library\'s key)', await d.textContent(`${FAILURE} [role="alert"]`));
    await d.screenshot({ path: join(shots, 'sk-sign-in-refused.png') });
    // Narrow: nobody signed in and the app not running - the bar has no menu button, whose menu would be empty.
    await d.setViewportSize({ width: 390, height: 800 });
    await d.waitForTimeout(150);
    check(!(await d.$(BAR.phoneButton)), 'the screen at 390: no menu button with an empty menu');
    check(await d.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the screen at 390: no sideways scroll');
    await d.screenshot({ path: join(shots, 'sk-sign-in-refused-390.png') });
    await denied.close();
    await iamAs(MIA);
  }

  step('Without signing in (the IAM says sign-in is not required): a visitor practises, signs in, and the progress is the person\'s');
  {
    // The stand-in IAM says Piano Academy does not require a sign-in; the app keeps that answer one second (run.mjs's --application-ttl=1).
    await switchSignIn(false);
    check(visitorIds().length === 0, 'no visitor in the database before', visitorIds());

    const context = await newContext();
    const page = await context.newPage();
    const navigations = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(request.url());
    });
    // Every save of a visitor's, as it goes out: with the key or without (a maker). The first maker is held at the network
    // until the lesson's last saves were issued, so they meet it: one maker, the others wait for its key.
    const saves = [];
    let release;
    const released = new Promise((done) => (release = done));
    await page.route(/\/api\/(progress|path|sessions)$/, async (route) => {
      const request = route.request();
      const key = request.headers()['x-visitor-key'] ?? null;
      saves.push({ what: `${request.method()} ${new URL(request.url()).pathname}`, key });
      if (key === null) await released;
      await route.continue();
    });

    await page.goto(`${APP}/`);
    await page.waitForSelector('#visitor-notice', { timeout: 20000 });
    check(!navigations.some((url) => url.startsWith(IAM)), 'the Learn page opens without the IAM', navigations);
    check((await page.textContent('#visitor-notice span'))?.trim() === 'You are practising without signing in. Your progress is kept for this browser for 30 days after your last visit. Sign in to keep it in your account.', 'the notice says how long this browser keeps the progress');
    check(!!(await page.$('#visitor-notice-sign-in')) && !!(await page.$(BAR.signIn)) && !(await page.$('#signed-out-banner')), 'Sign in beside it and in the bar; no "signed out" banner');
    check((await page.evaluate(() => localStorage.getItem('piano-academy:visitor'))) === null && visitorIds().length === 0, 'looking makes nobody: no key, no visitor row');
    await page.screenshot({ path: join(shots, `visitor-learn-${DESKTOP}.png`), fullPage: true });

    // A lesson's first two steps: the meet's save (the path) is the first - held -, then the drill's notes, its path and its round.
    await page.goto(`${APP}/lesson/rh-1/meet`);
    check(!(await page.$('#visitor-notice')), 'a practice screen: no notice');
    await playUntil(page, '#mt-notation', '#ls-next');
    await page.click('#ls-next');
    // The drill on the screen first: the meet's own Next may still be there a moment after the click (the view is
    // drawn on the next frame), and would end the drill's playing before it began.
    await page.waitForSelector('#dr-notation', { timeout: 20000 });
    await playUntil(page, '#dr-notation', '#ls-next, #ls-retry');
    await page.waitForTimeout(800);
    const before = saves.map((save) => save.what);
    check(saves.length === 1 && saves[0].key === null && visitorIds().length === 0, 'while the first save is on its way, nothing else goes: one maker out, the drill\'s notes, path and round wait', before);
    release();
    await page.waitForFunction(() => /^[A-Za-z0-9_-]{43}$/.test(localStorage.getItem('piano-academy:visitor') ?? ''), null, { timeout: 10000 });
    await waitFor(() => saves.some((save) => save.what === 'POST /api/sessions') && saves.some((save, i) => i > 0 && save.what === 'PUT /api/path'), 10000);
    await page.waitForTimeout(800);
    const keyless = saves.filter((save) => save.key === null).map((save) => save.what);
    check(keyless.length === 1 && keyless[0] === 'PUT /api/path', 'exactly one save without a key (the maker); the rest carried the key it brought', saves.map((save) => `${save.what}${save.key ? ' +key' : ''}`));
    const visitors = visitorIds();
    check(visitors.length === 1, 'exactly ONE visitor row in the database, after the round\'s three kinds of save', visitors);
    const visitor = visitors[0];
    const kept = fromTheDatabase(`SELECT (SELECT count(*) FROM sessions WHERE user_id = ${visitor}) AS sessions, (SELECT count(*) FROM jsonb_object_keys((SELECT notes FROM progress WHERE user_id = ${visitor}))) AS notes, (SELECT jsonb_exists(data->'steps', 'rh-1/meet') AND jsonb_exists(data->'steps', 'rh-1/drill') FROM path_progress WHERE user_id = ${visitor}) AS steps`)[0];
    check(Number(kept.sessions) === 1 && Number(kept.notes) >= 3 && kept.steps === true, 'the visitor\'s row holds the round, the notes and both steps', kept);
    await page.unroute(/\/api\/(progress|path|sessions)$/);

    // A reload keeps it; Stats has the line in place of the progress file's card.
    await page.goto(`${APP}/stats`);
    await page.waitForSelector('#own-progress-visitor');
    check(!(await page.$('#own-progress')) && (await page.textContent('#own-progress-visitor p'))?.trim() === 'Sign in to save your progress to a file, or to bring it back from one.', 'Stats: no progress file for a visitor - the sign-in line in its place');
    check(!!(await page.$('#visitor-notice')), 'Stats: the notice');
    const tiles = await page.$$eval(TILE, (all) => all.map((tile) => tile.textContent.trim()));
    check(tiles[4] === '1', 'a reload keeps the visitor\'s progress (its round)', tiles);
    await page.screenshot({ path: join(shots, `visitor-stats-${DESKTOP}.png`), fullPage: true });

    // Another browser starts empty, and the admin panel is never a visitor's: it goes to the IAM.
    const other = await newContext();
    const o = await other.newPage();
    const oNavigations = [];
    o.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === o.mainFrame()) oNavigations.push(request.url());
    });
    await o.goto(`${APP}/stats`);
    await o.waitForSelector('#own-progress-visitor');
    const oTiles = await o.$$eval(TILE, (all) => all.map((tile) => tile.textContent.trim()));
    check(oTiles[4] === '0', 'another browser starts empty', oTiles);
    await o.goto(`${APP}/admin`);
    await o.waitForSelector(BAR.signedIn, { timeout: 20000 });
    check(oNavigations.some((url) => url.startsWith(IAM)), '/admin goes to the IAM, never to a visitor', oNavigations);
    await other.close();

    // The sign-in: MIA already has note 60 (her imported progress). Her note stays as it was, the visitor's steps and round come.
    const mine = () => fromTheDatabase("SELECT notes->'60' AS c, (SELECT count(*) FROM sessions WHERE user_id = 7) AS sessions, (SELECT data->'steps' FROM path_progress WHERE user_id = 7) AS steps FROM progress WHERE user_id = 7")[0];
    const mia = mine();
    await iamAs(MIA);
    await page.click('#visitor-notice-sign-in');
    await page.waitForSelector('#visitor-moved', { timeout: 20000 });
    check((await page.textContent('#visitor-moved span'))?.trim() === 'Your progress from practising without signing in is now in your account.', 'signed in: the progress of this browser is in the account, and the page says so');
    check((await page.textContent('#visitor-kept'))?.trim() === 'Where your account already had progress, it was kept.', 'and that the account kept its own where it had some (C, D, E)');
    check((await page.textContent(BAR.name)) === 'mia' && !!(await page.$('#own-progress')) && !(await page.$('#visitor-notice')), 'mia\'s page now: her progress file, no notice');
    check((await page.evaluate(() => localStorage.getItem('piano-academy:visitor'))) === null, 'the key is gone from the browser');
    const after = mine();
    check(visitorIds().length === 0, 'and the visitor from the database', visitorIds());
    check(after.c === mia.c, 'her note C is byte for byte what it was', { before: mia.c, after: after.c });
    const steps = JSON.parse(after.steps ?? '{}');
    check(Number(after.sessions) === Number(mia.sessions) + 1 && 'rh-1/meet' in steps && 'rh-1/drill' in steps, 'the visitor\'s round and both steps are hers', { sessions: [mia.sessions, after.sessions], steps: Object.keys(steps) });
    await page.screenshot({ path: join(shots, `visitor-moved-${DESKTOP}.png`), fullPage: true });
    await page.click('#visitor-moved-close');
    await page.waitForSelector('#visitor-moved', { state: 'detached', timeout: 5000 }).catch(() => undefined);
    check(!(await page.$('#visitor-moved')), 'closed');
    await context.close();
  }

  step('Without signing in, in Slovak on a phone: the notice wraps; a key the server no longer knows is said once');
  {
    await switchSignIn(false);
    for (const width of [360, 390]) {
      const context = await newContext({ width });
      const page = await context.newPage();
      await page.goto(`${APP}/?lang=sk`);
      await page.waitForSelector('#visitor-notice', { timeout: 20000 });
      check((await keysOnPage(page)).length === 0, `${width}: no key on the visitor's Learn page`, await keysOnPage(page));
      const notice = await page.evaluate(() => {
        const box = document.querySelector('#visitor-notice').getBoundingClientRect();
        return { right: box.right, height: box.height, scroll: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth };
      });
      check(notice.scroll <= notice.screen && notice.right <= width && notice.height > 40, `${width}: the notice wraps inside the screen, no sideways scroll`, notice);
      check(!!(await page.$(BAR.phoneButton)), `${width}: the menu button (Sign in is in its menu)`);
      await page.screenshot({ path: join(shots, `visitor-sk-${width}.png`), fullPage: true });
      if (width === 390) {
        await page.click(BAR.phoneButton);
        await page.waitForSelector(BAR.menu);
        const items = await page.$$eval(`${BAR.menu} [role="menuitem"]`, (all) => all.map((item) => item.textContent.replace(/\s+/g, ' ').trim()));
        check(items.at(-1) === 'Prihlásiť sa' && (await keysOnPage(page)).length === 0, 'the phone\'s menu: the sections, then Sign in', items);
        await onTop(page, BAR.menu, 'the visitor\'s phone menu');
        await page.screenshot({ path: join(shots, 'visitor-sk-390-menu.png') });
        await page.keyboard.press('Escape');
      }
      if (width === 360) {
        // A visitor made by a note in the Note Trainer - then gone from the server (as after 30 days, or a move in another tab).
        await page.goto(`${APP}/trainer?lang=sk`);
        await playShown(page);
        await page.waitForFunction(() => !!localStorage.getItem('piano-academy:visitor'), null, { timeout: 10000 });
        const [gone] = visitorIds();
        onTheDatabase(`DELETE FROM sessions WHERE user_id = ${gone}; DELETE FROM path_progress WHERE user_id = ${gone}; DELETE FROM progress WHERE user_id = ${gone}; DELETE FROM users WHERE id = ${gone}`);
        await page.waitForTimeout(1000);
        // The note's save goes with the key nobody has now: 401 visitor_unknown - the family's interceptor forgets the key
        // and sends the save once more as nobody's, with the old generation: refused (409), nobody's progress loaded, and
        // said once, not twice.
        const answers = [];
        const heard = (response) => {
          if (response.url().endsWith('/api/progress') && response.request().method() === 'PUT') answers.push(response.status());
        };
        page.on('response', heard);
        await playShown(page);
        await page.waitForSelector('#visitor-lost', { timeout: 10000 });
        await page.waitForTimeout(800);
        page.off('response', heard);
        check(answers[0] === 401 && answers.includes(409) && !answers.includes(204), 'the save with the lost key: 401, then once more as nobody\'s with the old generation - refused (409), nothing saved', answers);
        check((await page.evaluate(() => localStorage.getItem('piano-academy:visitor'))) === null, 'a key the server no longer knows is forgotten');
        check(!!(await page.$('#visitor-lost')) && (await keysOnPage(page)).length === 0, 'and the page says the progress kept here has ended - in Slovak, no key');
        check(!(await page.$('#progress-changed')), 'no "changed elsewhere" over it - the lost note says it');
        await page.screenshot({ path: join(shots, 'visitor-sk-360-lost.png'), fullPage: true });
        // And the note after that makes a new visitor (kept in the database for the "behind" tour: 005 runs again over it).
        await page.waitForTimeout(1000);
        await playShown(page);
        await page.waitForFunction(() => !!localStorage.getItem('piano-academy:visitor'), null, { timeout: 10000 });
        check(visitorIds().length === 1, 'the next note starts a new visitor', visitorIds());
      }
      await context.close();
    }
  }

  step('Sign-in required again while somebody visits: their saves stop, the key is kept, and a sign-in moves it');
  {
    await switchSignIn(false);
    const context = await newContext({ width: 390 });
    const page = await context.newPage();
    const earlier = visitorIds();
    await page.goto(`${APP}/trainer?lang=sk`);
    await playShown(page);
    await page.waitForFunction(() => !!localStorage.getItem('piano-academy:visitor'), null, { timeout: 10000 });
    const key = await page.evaluate(() => localStorage.getItem('piano-academy:visitor'));
    const visitorsThen = visitorIds();
    const visitor = visitorsThen.find((id) => !earlier.includes(id));
    check(visitor !== undefined && visitorsThen.length === earlier.length + 1, 'a note in the Note Trainer makes this browser a visitor', visitorsThen);
    await switchSignIn(true);
    await page.waitForTimeout(1000);
    await playShown(page);
    await page.waitForSelector('#visitor-sign-in-now', { timeout: 10000 });
    check((await page.evaluate(() => localStorage.getItem('piano-academy:visitor'))) === key, 'the save refused (401 sign_in_required): the key is KEPT');
    check(visitorIds().length === visitorsThen.length, 'and the visitor stays in the database', visitorIds());
    check((await keysOnPage(page)).length === 0 && (await page.textContent('#visitor-sign-in-now span'))?.trim().startsWith('Piano Academy teraz vyžaduje prihlásenie'), 'the page says a sign-in is required now - in Slovak');
    await page.screenshot({ path: join(shots, 'visitor-sk-390-sign-in-now.png'), fullPage: true });

    // A browser with nothing of a visitor's: straight to the IAM, as before.
    const fresh = await newContext();
    const f = await fresh.newPage();
    const fNavigations = [];
    f.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === f.mainFrame()) fNavigations.push(request.url());
    });
    await iamAs(ED);
    await f.goto(`${APP}/songs`);
    await f.waitForSelector(BAR.signedIn, { timeout: 20000 });
    check(fNavigations.some((url) => url.startsWith(IAM)) && !(await f.$('#visitor-notice')), 'sign-in required: a new browser is sent to sign in, no notice', fNavigations);
    await fresh.close();

    // People (ADMIN): the visitors counted in a line of their own, never listed.
    const adminContext = await newContext();
    const admin = await signedIn(adminContext, ADA, '/admin/people');
    await admin.waitForSelector('[data-visitors]', { timeout: 20000 });
    const line = (await admin.textContent('[data-visitors]'))?.replace(/\s+/g, ' ').trim();
    const count = visitorIds().length;
    check(line?.startsWith(`${count} visitor${count === 1 ? '' : 's'} practising without signing in, with `) && !(await admin.$('[data-people] [data-person^="-"]')), 'People (the family\'s page) counts the visitors in a line of this app\'s, and lists none', line);
    await admin.screenshot({ path: join(shots, 'admin-people-visitors.png'), fullPage: true });
    await adminContext.close();

    // The sign-in moves what the kept key holds: a person with no progress yet gets it all.
    const ZOE = { id: 13, username: 'zoe', roles: ['MEMBER'] };
    await iamAs(ZOE);
    await page.click('#visitor-sign-in-now-button');
    await page.waitForSelector('#visitor-moved', { timeout: 20000 });
    check(!(await page.$('#visitor-kept')), 'moved, nothing of the account\'s in the way: no "kept" sentence');
    check((await page.evaluate(() => localStorage.getItem('piano-academy:visitor'))) === null && !visitorIds().includes(visitor), 'the key and the visitor are gone', visitorIds());
    const zoe = fromTheDatabase('SELECT (SELECT count(*) FROM jsonb_object_keys(notes)) AS notes FROM progress WHERE user_id = 13')[0];
    check(Number(zoe?.notes) >= 1, 'zoe has the notes played without signing in', zoe);
    check((await keysOnPage(page)).length === 0, 'the moved note in Slovak: no key');
    await page.screenshot({ path: join(shots, 'visitor-sk-390-moved.png'), fullPage: true });
    await context.close();
    await iamAs(MIA);
  }

  step('The anotoki account’s theme, dates and clock (the IAM’s 015): followed when signed in, the admin panel too; saved from the bar; a refusal said');
  {
    /** What the stand-in IAM holds now: the account's preferences, and who signs in (their language). */
    const iamState = async () => (await fetch(`${IAM}/_test/state`)).json();
    const iamSet = (changes) => fetch(`${IAM}/_test/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    /** Polls an async test until it holds, or the time is up. */
    const until = async (test, ms = 5000) => {
      for (const end = Date.now() + ms; Date.now() < end; await new Promise((done) => setTimeout(done, 100))) {
        if (await test()) return true;
      }
      return false;
    };
    const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme);
    /** The theme switch's choice in force, by its name ("Theme: dark"). */
    const shown = (page) => page.getAttribute(BAR.themeChosen, 'aria-label');
    const choose = (page, mode) => page.click(`${BAR.theme}[data-value="${mode}"]`);

    // The account chose dark, its dates day first with dots, and the 12-hour clock; this browser had light.
    await iamAs({ ...MIA, preferences: { theme: 'dark', date_format: 'dmy_dot', time_format: '12' } }, { answers: {} });
    const context = await newContext({ scheme: 'light' });
    const page = await context.newPage();
    await page.goto(`${APP}/api/health`);
    await page.evaluate(() => localStorage.setItem('piano-academy:theme', 'light'));
    await page.goto(`${APP}/stats`);
    await page.waitForSelector(BAR.signedIn, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('#view-root .loading') === null, null, { timeout: 20000 });
    await until(async () => (await theme(page)) === 'dark');
    check((await theme(page)) === 'dark' && (await shown(page)) === 'Theme: dark', 'signed in: the account’s dark, over this browser’s light', [await theme(page), await shown(page)]);
    check((await page.evaluate(() => localStorage.getItem('piano-academy:theme'))) === 'dark', 'kept for the next first paint (theme-boot.js)');
    const whens = await page.$$eval('#view-root tbody tr td:first-child', (cells) => cells.map((cell) => cell.textContent.trim()));
    check(whens.every((when) => /^\d{1,2}\.\d{1,2}\.\d{4} \d{1,2}:\d{2} [ap]m$/.test(when)), 'Stats: when each round was played, in the account’s order and on its clock', whens);
    // What's new: its code loaded only once the footer's version is pressed (the dialog drawn when it arrives).
    await page.click('#app-version');
    await page.waitForSelector('.release-date', { timeout: 20000 });
    const [year, month, day] = JSON.parse(readFileSync(join(repo, 'frontend/public/changelog.json'), 'utf8'))[0].date.split('-').map(Number);
    check((await page.textContent('.release-date'))?.trim() === `${day}.${month}.${year}`, 'What’s new: the release day in the account’s order', await page.textContent('.release-date'));
    await page.screenshot({ path: join(shots, `account-dark-whats-new-${DESKTOP}.png`) });
    await page.keyboard.press('Escape');

    // The bar's switch: automatic, saved to the account - and another tab of the site follows the next choice at once.
    await choose(page, 'auto');
    check(await until(async () => (await iamState()).user?.preferences?.theme === 'auto'), 'the switch saved "automatic" to the account', (await iamState()).user?.preferences);
    check((await theme(page)) === 'light' && (await page.evaluate(() => localStorage.getItem('piano-academy:theme'))) === null, 'automatic: the system’s light, nothing kept for the first paint', await theme(page));
    const other = await context.newPage();
    await other.goto(`${APP}/`);
    await other.waitForSelector(BAR.signedIn, { timeout: 20000 });
    await choose(page, 'light');
    check(await until(async () => (await iamState()).user?.preferences?.theme === 'light'), 'light saved to the account');
    await until(async () => (await shown(other)) === 'Theme: light');
    check((await shown(other)) === 'Theme: light', 'the other tab shows it too (the family\'s client tells every tab)', await shown(other));
    await other.close();

    // The account would not take it: the account's theme back, and a note under the switch - on a phone too.
    await iamSet({ answers: { '/api/oidc/preferences': { status: 403, body: JSON.stringify({ error: 'access_denied', error_description: 'The account may not change this now.' }) } } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await choose(page, 'dark');
    await page.waitForSelector(BAR.themeNote, { timeout: 5000 }).catch(() => undefined);
    check((await page.textContent(BAR.themeNote))?.trim() === 'The theme could not be saved to your anotoki account.', 'refused: said under the switch, promising nothing', await page.textContent(BAR.themeNote).catch(() => null));
    check((await shown(page)) === 'Theme: light' && (await theme(page)) === 'light' && (await iamState()).user?.preferences?.theme === 'light', 'refused: the account’s light on the screen again', [await shown(page), await theme(page)]);
    await page.waitForTimeout(150);
    const note = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { left: Math.round(box.left), right: Math.round(box.right), screen: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, onTop: !!hit && element.contains(hit) };
    }, BAR.themeNote);
    check(note.left >= 0 && note.right <= note.screen && note.scroll <= note.screen && note.onTop, 'the note at 390: inside the screen, on top of the page, no sideways scroll', note);
    await page.screenshot({ path: join(shots, 'account-theme-refused-390.png') });
    // Elsewhere: Stats' second heading, clear of the bar (its first stands under the bar and the note at 390).
    await page.locator('#view-root h2').nth(1).click();
    await page.waitForSelector(BAR.themeNote, { state: 'detached', timeout: 3000 }).catch(() => undefined);
    check(!(await page.$(BAR.themeNote)), 'a click elsewhere: the note goes');
    await iamSet({ answers: {} });

    // The language chosen in the bar is the account's too - another tab of the site follows it, over this browser's
    // remembered choice; the dates keep the account's order and clock, in Slovak's words.
    const twin = await context.newPage();
    await twin.goto(`${APP}/`);
    await twin.waitForSelector(BAR.signedIn, { timeout: 20000 });
    check((await twin.getAttribute('html', 'lang')) === 'en', 'another tab, in English');
    await page.click(BAR.language);
    await page.click('[role="menuitemradio"][lang="sk"]');
    check(await until(async () => (await iamState()).user?.locale === 'sk'), 'Slovak chosen in the bar: the account’s language now', (await iamState()).user);
    await until(async () => (await page.getAttribute('html', 'lang')) === 'sk');
    await until(async () => (await twin.getAttribute('html', 'lang')) === 'sk');
    check((await twin.getAttribute('html', 'lang')) === 'sk', 'the other tab follows the account’s new language', await twin.getAttribute('html', 'lang'));
    await twin.close();
    const slovak = await page.$$eval('#view-root tbody tr td:first-child', (cells) => cells.map((cell) => cell.textContent.trim()));
    check(slovak.every((when) => /^\d{1,2}\.\d{1,2}\.\d{4} \d{1,2}:\d{2} [AP]M$/.test(when)), 'in Slovak: the same order and clock', slovak);
    check((await keysOnPage(page)).length === 0, 'no key on the page', await keysOnPage(page));
    await page.screenshot({ path: join(shots, 'account-sk-390.png'), fullPage: true });
    await context.close();

    // The account's language before what a browser remembered: this one chose Slovak, the account says English.
    await iamAs({ ...MIA, preferences: { theme: 'auto', date_format: null, time_format: null } });
    const readerContext = await newContext();
    const reader = await readerContext.newPage();
    await reader.goto(`${APP}/api/health`);
    await reader.evaluate(() => localStorage.setItem('piano-academy:language', 'sk'));
    await reader.goto(`${APP}/`);
    await reader.waitForSelector(BAR.signedIn, { timeout: 20000 });
    await reader.waitForFunction(() => document.querySelector('#view-root .loading') === null, null, { timeout: 20000 });
    check((await reader.getAttribute('html', 'lang')) === 'en', 'signed in: the account’s English over this browser’s Slovak', await reader.getAttribute('html', 'lang'));
    check((await reader.evaluate(() => localStorage.getItem('piano-academy:language'))) === 'sk', 'this browser keeps its choice, for when nobody is signed in');
    await readerContext.close();

    // The admin panel follows the same account: one theme everywhere, its stamps in the account's order and clock.
    const adminContext = await newContext({ scheme: 'light' });
    const admin = await signedIn(adminContext, { ...ADA, preferences: { theme: 'dark', date_format: 'mdy_slash', time_format: '24' } }, '/admin/people');
    await admin.waitForSelector('[data-people] [data-person]', { timeout: 20000 });
    await until(async () => (await theme(admin)) === 'dark');
    check((await theme(admin)) === 'dark', 'the admin panel: the account’s dark too', await theme(admin));
    const seen = await admin.$$eval('[data-people] [data-person] .anotoki-people-page__time', (cells) => cells.map((cell) => cell.textContent.trim()).filter((text) => text !== ''));
    check(seen.length > 0 && seen.every((when) => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(when)), 'People (the family\'s page): first and last seen in the account’s order, on its 24-hour clock', seen);
    await admin.click(`${BAR.nav} a[href="/admin/migrations"]`);
    await admin.waitForSelector(`${MIGRATIONS} [data-applied] li`);
    const ran = await admin.$$eval(`${MIGRATIONS} [data-applied] .anotoki-migrations-page__when`, (all) => all.map((when) => when.textContent.trim()));
    check(ran.length > 0 && ran.every((when) => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(when)), 'Migrations (the family’s page, the app’s way of writing dates): when each ran, in the account’s order', ran);
    await admin.screenshot({ path: join(shots, 'account-admin-migrations-dark.png'), fullPage: true });
    await adminContext.close();
    // An IAM that keeps no preferences again, for what follows.
    await iamAs(MIA);
  }

  step('A database behind the code: everybody else reads that the site is being updated, an ADMIN signs in from that page and applies it on the Migrations page - one Apply failing with what PostgreSQL said - and the pages come back');
  {
    // 005 - a schema part of its own (006 to 012 and the library's files stay applied) - taken off the record: the
    // code is ahead of the database, and the site's gate (anotoki/lib's SiteGate) answers 503 update_pending but on its
    // open paths. 005 runs again cleanly - every statement steps aside for what is there, and its gates hold with
    // visitors in the database; tests/unit/migrations.test.php runs 004 and 005 again too.
    onTheDatabase("DELETE FROM migrations WHERE filename = '005_visitors.sql'");

    /** A page's trips (navigations of its main frame) and its API answers, as they happen. */
    const watch = (page) => {
      const seen = { navigations: [], answers: [] };
      page.on('request', (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) seen.navigations.push(request.url());
      });
      page.on('response', (response) => {
        if (response.url().startsWith(`${APP}/api/`)) seen.answers.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
      return seen;
    };

    // A learner, not signed in yet (sign-in required): the status page at once - nobody is sent to the IAM while the
    // site is being updated, nothing fails, and the one thing to press is a quiet Sign in.
    await iamAs(MIA);
    const learnerContext = await newContext();
    const learner = await learnerContext.newPage();
    const learnerSeen = watch(learner);
    await learner.goto(`${APP}/stats`);
    await learner.waitForSelector('anotoki-site-status section', { timeout: 20000 });
    let shown = await siteStatus(learner);
    check(shown.title === 'The site is being updated' && shown.text === 'It will be back in a few minutes. This page reloads by itself.' && shown.lang === 'en', 'signed out: "The site is being updated" (the family\'s page), in English', shown);
    check(JSON.stringify(shown.controls) === JSON.stringify(['Sign in']) && shown.links.length === 0, 'nothing to press but a quiet Sign in: no setup page, no Migrations, no error', shown);
    check(!learnerSeen.navigations.some((url) => url.startsWith(IAM)), 'nobody is sent to the IAM while the site is being updated', learnerSeen.navigations);
    check(learnerSeen.answers.every((answer) => answer.startsWith('200 ') || answer.startsWith('304 ')), 'and nothing the page asked failed (where the site stands, the sign-in\'s settings, the words)', learnerSeen.answers);
    check(!(await learner.$(`app-load-error, ${FAILURE}, #signed-out-banner`)) && !(await learner.$(BAR.nav)), 'no error card, no failure\'s screen, no banner, no sections in the bar');
    await learner.screenshot({ path: join(shots, `behind-signed-out-${DESKTOP}.png`), fullPage: true });

    // Signing in works meanwhile: to the IAM and back to the page it started from - still being updated, now with nothing to press.
    await learner.click('anotoki-site-status button');
    await learner.waitForSelector(BAR.signedIn, { timeout: 20000 });
    check(learnerSeen.navigations.some((url) => url.startsWith(IAM)) && new URL(learner.url()).pathname === '/stats', 'its Sign in: to the IAM and back to /stats', learnerSeen.navigations);
    check((await learner.textContent(BAR.name)) === 'mia', 'signed in as the learner, named in the bar');
    shown = await siteStatus(learner);
    check(shown?.title === 'The site is being updated' && shown.controls.length === 0, 'a learner signed in: still being updated, nothing to press', shown);
    await learner.screenshot({ path: join(shots, `behind-learner-${DESKTOP}.png`), fullPage: true });
    // The Migrations page is not a learner's: the same status page on its address, and nothing of it drawn.
    await learner.goto(`${APP}/admin/migrations`);
    await learner.waitForSelector('anotoki-site-status section', { timeout: 20000 });
    check((await siteStatus(learner))?.title === 'The site is being updated' && !(await learner.$(MIGRATIONS)), 'a learner on /admin/migrations: the same page, no Migrations', await siteStatus(learner));
    check(!learnerSeen.answers.some((answer) => answer.includes('/api/admin/')), 'and nothing of the admin panel asked for', learnerSeen.answers);
    // Back to Stats, where the page waits - it is to come back by itself once the update is applied (below).
    await learner.goto(`${APP}/stats`);
    await learner.waitForSelector('anotoki-site-status section', { timeout: 20000 });
    await learner.evaluate(() => (window.beforeTheUpdate = true));

    // A visitor in Slovak on a phone: the same page in Slovak, no key, inside the screen.
    const slovakContext = await newContext({ width: 390 });
    const slovak = await slovakContext.newPage();
    await slovak.goto(`${APP}/?lang=sk`);
    await slovak.waitForSelector('anotoki-site-status section', { timeout: 20000 });
    await slovak.waitForFunction(() => document.documentElement.lang === 'sk', null, { timeout: 10000 }).catch(() => undefined);
    shown = await siteStatus(slovak);
    check(shown.title === 'Stránku práve aktualizujeme' && shown.lang === 'sk' && JSON.stringify(shown.controls) === JSON.stringify(['Prihlásiť sa']), 'in Slovak: "Stránku práve aktualizujeme", its Sign in in Slovak', shown);
    check((await keysOnPage(slovak)).length === 0 && (await slovak.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)), 'at 390: no key, no sideways scroll', await keysOnPage(slovak));
    await slovak.screenshot({ path: join(shots, 'behind-sk-390.png'), fullPage: true });
    await slovakContext.close();

    // The site's ADMIN, not signed in yet: the same page - its Sign in, and back to the same address as the ADMIN,
    // told in English that a database update is waiting, with the way to the Migrations page.
    await iamAs(ADA);
    const context = await newContext();
    const page = await context.newPage();
    const adminSeen = watch(page);
    await page.goto(`${APP}/`);
    await page.waitForSelector('anotoki-site-status section', { timeout: 20000 });
    check(JSON.stringify((await siteStatus(page)).controls) === JSON.stringify(['Sign in']), 'an ADMIN not signed in yet: the same page, with Sign in', await siteStatus(page));
    await page.click('anotoki-site-status button');
    await page.waitForSelector(BAR.signedIn, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('anotoki-site-status h1')?.textContent.trim() === 'A database update is waiting', null, { timeout: 10000 }).catch(() => undefined);
    shown = await siteStatus(page);
    check(adminSeen.navigations.some((url) => url.startsWith(IAM)) && new URL(page.url()).pathname === '/', 'its Sign in: to the IAM and back to the same page', adminSeen.navigations);
    check(shown?.title === 'A database update is waiting' && shown.lang === 'en' && JSON.stringify(shown.controls) === JSON.stringify(['Open Migrations']), 'signed in, the site\'s ADMIN: "A database update is waiting", in English, with "Open Migrations"', shown);
    check(!(await page.$(BAR.nav)), 'the bar: no sections outside the admin panel');
    await page.screenshot({ path: join(shots, `behind-admin-${DESKTOP}.png`), fullPage: true });
    await page.click('anotoki-site-status a');
    await page.waitForSelector(`${MIGRATIONS} [data-pending] li`, { timeout: 20000 });
    check(new URL(page.url()).pathname === '/admin/migrations', 'on the Migrations page', page.url());
    const pending = await page.$$eval(`${MIGRATIONS} [data-pending] li`, (all) => all.map((li) => `${li.querySelector('code').textContent.trim()} ${li.querySelector('anotoki-badge').textContent.trim()}`));
    check(JSON.stringify(pending) === JSON.stringify(['005_visitors.sql pending']), 'Pending: 005', pending);
    check((await page.$$eval(`${BAR.nav} a`, (all) => all.map((a) => a.textContent.trim()))).join('|') === 'Migrations', 'the bar: Migrations alone while the database is behind');
    await page.screenshot({ path: join(shots, `migrations-behind-${DESKTOP}.png`), fullPage: true });

    // An Apply that fails: users.visitor_key_hash made a text, so 005's gate refuses - the page shows what PostgreSQL said.
    onTheDatabase('ALTER TABLE users ALTER COLUMN visitor_key_hash TYPE TEXT');
    await page.click(`${MIGRATIONS} [data-apply]`);
    await page.waitForSelector(`${MIGRATIONS} anotoki-dialog[data-confirm] dialog[open]`);
    check((await page.evaluate(() => document.activeElement?.hasAttribute('data-confirm-cancel'))) === true, 'the question: the focus on Cancel (the safe answer first)');
    await page.click(`${MIGRATIONS} [data-confirm-apply]`);
    await page.waitForSelector(`${MIGRATIONS} [data-result][data-tone="danger"]`, { timeout: 20000 });
    const result = `${MIGRATIONS} [data-result]`;
    // The family's page names the site's one set's files by their names alone, the library's sets' with the set.
    check((await page.textContent(`${result} .anotoki-alert__heading`))?.trim() === 'Stopped at 005_visitors.sql', 'a failed Apply: Stopped at 005', await page.textContent(result));
    check((await page.textContent(`${result} .anotoki-migrations-page__result-text`)).replace(/\s+/g, ' ').trim() === 'Nothing was applied. The failed file was rolled back as a whole.', 'nothing applied, rolled back whole', await page.textContent(result));
    const said = (await page.textContent(`${result} pre.anotoki-migrations-page__error`)) ?? '';
    check(said.includes('users.visitor_key_hash is not a char(64) that may be null') && /^statement \d+ of \d+: SQLSTATE\[P0001\]/.test(said), 'what PostgreSQL said, word for word, on the page', said);
    await page.waitForFunction((apply) => document.querySelector(apply)?.disabled === false, `${MIGRATIONS} [data-apply]`, { timeout: 10000 }).catch(() => undefined);
    check(!(await page.isDisabled(`${MIGRATIONS} [data-apply]`)) && (await page.$$(`${MIGRATIONS} [data-pending] li`)).length === 1, 'still pending: Apply pending is on again');
    check((await siteStatus(learner))?.title === 'The site is being updated', 'meanwhile the learner\'s page still says the site is being updated');
    await page.screenshot({ path: join(shots, `migrations-failed-${DESKTOP}.png`), fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const wider = await page.evaluate(() => {
      const screen = document.documentElement.clientWidth;
      const over = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > screen + 0.5 && !el.closest('pre.anotoki-migrations-page__error'));
      return { scroll: document.documentElement.scrollWidth, screen, over: over.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} ${Math.round(el.getBoundingClientRect().right)}`) };
    });
    check(wider.scroll <= wider.screen, 'the error at 360: no sideways scroll', wider);
    await page.screenshot({ path: join(shots, 'migrations-failed-360.png'), fullPage: true });
    await page.setViewportSize({ width: DESKTOP, height: 900 });
    onTheDatabase('ALTER TABLE users ALTER COLUMN visitor_key_hash TYPE CHAR(64)');

    await page.click(`${MIGRATIONS} [data-apply]`);
    await page.waitForSelector(`${MIGRATIONS} anotoki-dialog[data-confirm] dialog[open]`);
    check((await page.textContent(`${MIGRATIONS} anotoki-dialog[data-confirm] .anotoki-dialog__title`))?.trim() === 'Apply 1 pending migration?', 'asked first');
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(shots, 'migrations-question.png') });
    await page.click(`${MIGRATIONS} [data-confirm-apply]`);
    await page.waitForSelector(`${MIGRATIONS} [data-result][data-tone="success"]`, { timeout: 20000 });
    check((await page.textContent(`${result} .anotoki-alert__heading`))?.trim() === 'Up to date', 'Up to date', await page.textContent(result));
    check((await page.textContent(`${result} .anotoki-migrations-page__result-text`))?.trim() === 'Applied: 005_visitors.sql.', 'Applied: 005', await page.textContent(result));
    await page.waitForSelector(`${BAR.nav} a[href="/admin/people"]`, { timeout: 20000 });
    check((await page.$$eval(`${BAR.nav} a`, (all) => all.map((a) => a.textContent.trim()))).join('|') === ADMIN_SECTIONS, 'the app started where it stands: every section, the result still on the page');
    check((await page.textContent(`${MIGRATIONS} [data-pending]`)).includes('Nothing pending'), 'nothing pending now');
    await page.screenshot({ path: join(shots, `migrations-applied-${DESKTOP}.png`), fullPage: true });
    await page.click(BAR.person);
    await page.click(`${BAR.menu} a[href="/"]`);
    await page.waitForSelector(`${BAR.nav} a[href="/stats"]`);
    check(!(await siteStatus(page)), 'back to Piano Academy: the app runs');
    // The strings in memory are from before the update: the Learn page has every word only if the resume asked again.
    await page.waitForFunction(() => !!document.querySelector('#view-root router-outlet')?.nextElementSibling, null, { timeout: 20000 });
    let keysAfter = await keysOnPage(page);
    for (let tries = 0; keysAfter.length > 0 && tries < 20; tries++) {
      await page.waitForTimeout(250);
      keysAfter = await keysOnPage(page);
    }
    check(keysAfter.length === 0, 'back to Piano Academy: the Learn page in words, no key (the strings were asked for again)', keysAfter);
    await page.screenshot({ path: join(shots, `after-apply-learn-${DESKTOP}.png`), fullPage: true });
    await context.close();

    // The learner's page came back by itself: it asks again every 30 seconds, and loads the page afresh once the site is ready.
    await learner.waitForSelector('#own-progress', { timeout: 45000 }).catch(() => undefined);
    check(!!(await learner.$('#own-progress')) && !(await siteStatus(learner)), 'the learner\'s page came back by itself: Stats, the learner\'s own', await siteStatus(learner));
    check((await learner.evaluate(() => window.beforeTheUpdate)) === undefined && new URL(learner.url()).pathname === '/stats', 'loaded afresh, on the same address', learner.url());
    await learner.screenshot({ path: join(shots, `behind-learner-back-${DESKTOP}.png`), fullPage: true });
    await learnerContext.close();
    await iamAs(MIA);
  }

  step('Not set up: the setup page only while the site was never installed - and Try again once it is set up');
  {
    // The throwaway settings lose their IAM file, as before a first setup; the installer's lock (storage/installed.lock -
    // under the tests' settings, <config>/storage) says whether the site was ever installed.
    const settings = join(WORK, 'config', 'auth.local.php');
    const lock = join(WORK, 'config', 'storage', 'installed.lock');
    const context = await newContext({ width: 390 });
    const page = await context.newPage();
    const navigations = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(request.url());
    });
    renameSync(settings, `${settings}.away`);
    try {
      await page.goto(`${APP}/stats`);
      await page.waitForSelector('anotoki-site-status section', { timeout: 20000 });
      const never = await siteStatus(page);
      check(never.title === 'This site is not set up yet' && JSON.stringify(never.controls) === JSON.stringify(['Open the setup page', 'Try again']) && JSON.stringify(never.links) === JSON.stringify(['/setup.php']), 'never installed: "This site is not set up yet", the setup page and Try again', never);
      check(!navigations.some((url) => url.startsWith(IAM)) && (await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)), 'nobody sent to the IAM; at 390 no sideways scroll', navigations);
      await page.screenshot({ path: join(shots, 'not-set-up-390.png'), fullPage: true });

      // Installed once: nobody is offered the setup page again - the site is "not available right now".
      mkdirSync(dirname(lock), { recursive: true });
      writeFileSync(lock, 'the browser check\n');
      await page.reload();
      await page.waitForSelector('anotoki-site-status section', { timeout: 20000 });
      const installed = await siteStatus(page);
      check(installed.title === 'The site is not available right now' && JSON.stringify(installed.controls) === JSON.stringify(['Try again']) && installed.links.length === 0, 'installed once: "The site is not available right now" and Try again - never the setup page', installed);
      check(!(await page.$('a[href*="setup.php"]')), 'no way to the setup page anywhere on the page');
      await page.screenshot({ path: join(shots, 'not-available-390.png'), fullPage: true });
    } finally {
      rmSync(lock, { force: true });
      renameSync(`${settings}.away`, settings);
    }

    // Set up again: Try again finds the site ready, and the page starts afresh - to the IAM and back, to Stats.
    await iamAs(MIA);
    await page.click('anotoki-site-status button');
    await page.waitForSelector('#own-progress', { timeout: 20000 }).catch(() => undefined);
    check(!!(await page.$('#own-progress')) && !(await siteStatus(page)) && new URL(page.url()).pathname === '/stats', 'set up again: Try again - the page starts afresh, on Stats', page.url());
    await context.close();
  }

  check(errors.length === 0, 'no error on any page', errors);
} catch (error) {
  check(false, 'the tours ran to their end', String(error?.stack ?? error));
} finally {
  await browser.close();
}

console.log(`\n${failures.length === 0 ? 'Every check passed.' : `${failures.length} failed:\n  ${failures.join('\n  ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
