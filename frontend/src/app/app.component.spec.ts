import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, DestroyRef, Provider, inject } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { ROUTES, Router, provideRouter } from '@angular/router';
import { SignInFailureComponent, type AnotokiUser } from '@anotoki/lib/auth';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { SiteStatus } from '@anotoki/lib/migrations';
import { SiteSettings } from '@anotoki/lib/site-settings';
import { AnotokiThemeMode, ThemeService } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AppComponent } from './app.component';
import { ApiService, VISITOR_OWNER } from './api/api.service';
import { SIGN_IN_FAILED_ROUTE, provideSiteAuth } from './shared/auth/site-auth';
import { VisitorKey } from './shared/auth/visitor-key';
import { ChangelogEntry, ChangelogService } from './shared/changelog/changelog.service';
import { provideFamilyKit } from './shared/family-kit';
import { KEPT_ENGLISH } from './shared/i18n/kept-english';
import { provideSiteTranslations } from './shared/i18n/site-translations';
import { VISITOR_WORDS } from './shared/i18n/visitor-words';
import { pianoLegalConfig } from './shared/legal/legal.config';
import { MidiService } from './shared/midi/midi.service';
import { provideSiteAdmin } from './shared/site-admin';
import { provideSiteSettings } from './shared/site-settings';
import { BootService } from './shared/state/boot.service';
import { ProgressStore } from './shared/state/progress-store.service';
import { SITE_STATUS_URL, provideSiteMigrations } from './shared/state/site-migrations';
import { TestAuth, provideTestAuth } from './shared/testing/test-auth';
import { provideTestKit } from './shared/testing/test-kit';

/**
 * A key as it would stand on a page: a namespace, then segments that begin
 * with a letter, joined by dots - "nav.learn", "boot.loadError.title". (A
 * version, "v0.4.0", is not one: its segments are numbers.)
 */
const KEY_SHAPE = /(?<![A-Za-z0-9._-])[a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+(?![A-Za-z0-9_-])/;

/** The attributes whose value is read by a person (or to one). */
const WORDED_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder'];

const RELEASES: ChangelogEntry[] = [
  { version: '0.4.0', date: '2026-09-28', changes: { added: ['Songs you can play along with'], updated: ['The metronome is louder'], fixed: ['A note could be counted twice'] } },
  { version: '0.3.0', date: '2026-09-01', changes: { added: ['The learning path'] } },
];

const PERSON: AnotokiUser = { sub: '7', preferred_username: 'mia', email: null, email_verified: true, locale: null, roles: [], preferences: null };

/** The services whose state decides what the shell draws. */
interface Shell {
  fixture: ComponentFixture<AppComponent>;
  host: HTMLElement;
  boot: BootService;
  /** The family's AnotokiAuth as the spec drives it (shared/testing/test-auth.ts): its state, who, the IAM's switch, a failure. */
  auth: TestAuth;
  store: ProgressStore;
  midi: MidiService;
  theme: ThemeService;
  changelog: ChangelogService;
  api: ApiService;
  visitorKey: VisitorKey;
  /** Where the site stands (the family's SiteStatus): ready, unless a state says otherwise. */
  site: SiteStatus;
}

/** A page under the shell's outlet, where a spec needs one drawn. */
@Component({ selector: 'app-stub-page', template: '<p id="stub-page">the page</p>' })
class StubPageComponent {}

/** A page that counts how often it is made and how often it goes: whether anything runs behind the status page. */
@Component({ selector: 'app-counted-page', template: '<p id="counted-page">the page</p>' })
class CountedPageComponent {
  static made = 0;
  static gone = 0;

  constructor() {
    CountedPageComponent.made++;
    inject(DestroyRef).onDestroy(() => CountedPageComponent.gone++);
  }
}

/**
 * The shell, made with the providers given: the real translation service with no bundle unless they say otherwise -
 * wired as the app wires it (shared/i18n/site-translations.ts: the kept English) - the family's sign-in configured as
 * the app configures it (shared/auth/site-auth.ts: the failure's screen on its route, its words from this app's), its
 * state the spec's (nobody known yet: the sign-in settings not read, nothing asked for), the admin panel's and the
 * feedback form's configuration (shared/site-admin.ts), and the legal pages' (shared/legal/legal.config.ts: the footer's
 * links in the page's language and the database's words).
 */
async function shell(providers: Provider[] = []): Promise<Shell> {
  TestBed.resetTestingModule();
  const auth = new TestAuth();
  auth.now.set('starting');
  TestBed.configureTestingModule({
    // The shell itself, so its @defer blocks' components (the feedback dialog, What's new) are resolved by compileComponents() below.
    imports: [AppComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: SIGN_IN_FAILED_ROUTE.slice(1), component: SignInFailureComponent }]),
      provideSiteTranslations(),
      provideSiteMigrations(),
      provideSiteAuth(),
      ...provideTestAuth(auth),
      provideFamilyKit(),
      provideSiteAdmin(),
      provideSiteSettings(),
      provideAnotokiLegal(pianoLegalConfig),
      ...providers,
    ],
  });
  await TestBed.compileComponents();
  // As the app's initializer leaves it: the site asked, and ready.
  const site = TestBed.inject(SiteStatus);
  site.markReady();
  const fixture = TestBed.createComponent(AppComponent);
  return {
    fixture,
    host: fixture.nativeElement,
    boot: TestBed.inject(BootService),
    auth,
    store: TestBed.inject(ProgressStore),
    midi: TestBed.inject(MidiService),
    theme: TestBed.inject(ThemeService),
    changelog: TestBed.inject(ChangelogService),
    api: TestBed.inject(ApiService),
    visitorKey: TestBed.inject(VisitorKey),
    site,
  };
}

/** The family's status page, as drawn in the view's place: its heading, its words and its buttons and links. */
function statusPage(s: Shell): { title: string | undefined; text: string | undefined; lang: string | null; actions: string[]; links: (string | null)[] } | null {
  const page = s.host.querySelector('anotoki-site-status section');
  if (!page) return null;
  return {
    title: page.querySelector('h1')?.textContent?.trim(),
    text: page.querySelector('p')?.textContent?.trim(),
    lang: page.getAttribute('lang'),
    actions: Array.from(page.querySelectorAll('a, button')).map((control) => control.textContent?.trim() ?? ''),
    links: Array.from(page.querySelectorAll('a')).map((link) => link.getAttribute('href')),
  };
}

/** Somebody signed in - `user` - or nobody: signed out where the IAM requires a sign-in. */
function session(auth: TestAuth, user: AnotokiUser | null): void {
  if (user) auth.signInAs(user);
  else auth.signedOut();
}

/** Practising without signing in (the IAM does not require it): the app runs on a visitor's progress. */
function visiting(s: Shell): void {
  s.auth.visiting();
  s.api.setDataOwner(VISITOR_OWNER);
  s.store.loaded.set(true);
  s.boot.status.set('ready');
}

/** Is this node inside something marked as another language's text (the server's, the browser's, a release note)? */
function foreign(node: Node, root: HTMLElement): boolean {
  for (let element = node instanceof Element ? node : node.parentElement; element && element !== root; element = element.parentElement) {
    if (element.hasAttribute('lang')) return true;
  }
  return false;
}

/**
 * Everything the shell says in its own words: every text node and every
 * worded attribute, drawn or not (a closed dialog's too) - but for what is
 * marked as somebody else's text with a `lang` of its own.
 */
function said(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text !== '' && !foreign(node, root)) out.push(text);
  }
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (foreign(element, root)) continue;
    for (const name of WORDED_ATTRIBUTES) {
      const value = element.getAttribute(name)?.trim();
      if (value) out.push(value);
    }
  }
  return out;
}

const keysIn = (texts: string[]): string[] => texts.filter((text) => KEY_SHAPE.test(text));

/** What an element says, its white space as one space. */
const text = (s: Shell, selector: string): string | undefined => s.host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

/** Every state the shell can be drawn in, by name: each sets the services and leaves the drawing to the caller. */
const STATES: Record<string, (s: Shell) => void> = {
  'loading, before anything is known': () => undefined,
  'not set up, never installed: the setup page offered': (s) => {
    s.site.report('not_set_up', false);
    s.boot.status.set('not-set-up');
  },
  'not set up once installed: only "not available right now"': (s) => {
    s.site.report('not_set_up', true);
    s.boot.status.set('not-set-up');
  },
  'the database out of reach': (s) => {
    s.site.report('unavailable');
    s.boot.status.set('waiting');
  },
  'an update waits, nobody signed in': (s) => {
    session(s.auth, null);
    s.site.report('update_pending');
    s.boot.status.set('waiting');
  },
  'an update waits, a learner signed in': (s) => {
    session(s.auth, { ...PERSON, roles: ['MEMBER'] });
    s.site.report('update_pending');
    s.boot.status.set('waiting');
  },
  "an update waits, the site's ADMIN signed in": (s) => {
    session(s.auth, { ...PERSON, roles: ['MEMBER', 'ADMIN'] });
    s.site.report('update_pending');
    s.boot.status.set('waiting');
  },
  "an update came in the middle of a visitor's practising, a save refused meanwhile": (s) => {
    visiting(s);
    s.api.visitorRefusal.set(VISITOR_WORDS.busy);
    s.site.report('update_pending');
  },
  'the progress could not be loaded': (s) => s.boot.status.set('load-error'),
  'nobody signed in, on the way to the IAM': (s) => {
    session(s.auth, null);
    s.boot.status.set('sign-in');
  },
  'running, signed in, a piano connected, the list of changes there': (s) => {
    session(s.auth, PERSON);
    vi.spyOn(s.auth, 'accountUrl').mockReturnValue('http://localhost:4300/account');
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.midi.connectedName.set('KAWAI ES120');
    s.changelog.entries.set(RELEASES);
    s.theme.set('light');
  },
  'running, signed in, a theme the anotoki account would not take': (s) => {
    // The account keeps light; a choice of dark is refused, and the account's light is back with the note.
    session(s.auth, { ...PERSON, preferences: { theme: 'light', date_format: null, time_format: null } });
    vi.spyOn(s.auth, 'savePreferences').mockRejectedValue(Object.assign(new Error('refused'), { code: 'access_denied' }));
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.theme.set('dark');
  },
  'running, signed in with a token that names nobody, a save that did not get through, no MIDI device': (s) => {
    session(s.auth, { ...PERSON, preferred_username: null });
    s.store.loaded.set(true);
    s.store.progressFailed.set(true);
    s.boot.status.set('ready');
    s.midi.asked.set(true);
    s.theme.set('dark');
  },
  'running, signed out in the middle of practising': (s) => {
    session(s.auth, null);
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.theme.set('auto');
  },
  'running, signed out in the middle of practising, and a sign-in that could not start': (s) => {
    session(s.auth, null);
    s.auth.failed('storage_unavailable');
    s.store.loaded.set(true);
    s.boot.status.set('ready');
  },
  'running, an editor, in a browser with no Web MIDI': (s) => {
    session(s.auth, { ...PERSON, roles: ['EDITOR'] });
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.midi.problem.set({ kind: 'unsupported', detail: null });
  },
  'running, the progress replaced or deleted somewhere else and loaded again': (s) => {
    session(s.auth, PERSON);
    s.store.loaded.set(true);
    s.store.changedElsewhere.set(true);
    s.boot.status.set('ready');
  },
  'running as a visitor, on Learn: how long this browser keeps the progress': (s) => visiting(s),
  'running as a visitor whose progress here has ended, and a save this browser cannot keep': (s) => {
    visiting(s);
    s.visitorKey.lost.set(true);
    s.api.visitorRefusal.set(VISITOR_WORDS.full);
  },
  'running as a visitor, while too many people start without signing in': (s) => {
    visiting(s);
    s.api.visitorRefusal.set(VISITOR_WORDS.busy);
  },
  'running as a visitor, and the IAM began to require a sign-in meanwhile': (s) => {
    visiting(s);
    s.auth.noteSignInRequired();
  },
  'running as a visitor, after a sign-in the IAM turned away': (s) => {
    visiting(s);
    s.auth.failed('access_denied');
  },
  'running, signed in, this browser’s progress moved into the account - which kept its own for some': (s) => {
    session(s.auth, PERSON);
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.boot.visitorMoved.set({ kept: true });
  },
  'running, signed in, this browser’s progress could not be moved into the account this time': (s) => {
    session(s.auth, PERSON);
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.boot.visitorNotMoved.set(true);
  },
  'the browser refused MIDI': (s) => s.midi.problem.set({ kind: 'refused', detail: null }),
  'the browser refused MIDI, in its own words': (s) => s.midi.problem.set({ kind: 'refused', detail: 'Permission to use Web MIDI API was not granted.' }),
  'the piano could not be connected': (s) => s.midi.problem.set({ kind: 'failed', detail: null }),
  'the piano could not be connected, with the reason': (s) => s.midi.problem.set({ kind: 'failed', detail: 'MIDI input input-1 not found.' }),
};

/** Where the family's bar (@anotoki/lib/shell's <anotoki-top-bar>) draws what the shell's checks read. */
const BAR = {
  nav: 'anotoki-top-bar nav',
  personButton: '.anotoki-top-bar__person-button',
  personName: '.anotoki-top-bar__person-name',
  phoneButton: '.anotoki-top-bar__menu-button',
  menu: 'anotoki-top-bar [role="menu"]',
  signIn: '.anotoki-top-bar__sign-in',
  signOut: '.anotoki-top-bar__sign-out-item',
  theme: 'anotoki-theme-toggle [role="radio"]',
} as const;

/** Where the family's footer (@anotoki/lib/footer's <anotoki-site-footer>) draws what the shell's checks read: its own markers. */
const FOOTER = {
  footer: 'anotoki-site-footer footer',
  row: 'anotoki-site-footer .anotoki-site-footer__row',
  version: 'anotoki-site-footer [data-version]',
  whatsNew: 'anotoki-site-footer [data-whats-new]',
  feedback: 'anotoki-site-footer [data-open-feedback]',
  legal: 'anotoki-site-footer anotoki-legal-links',
} as const;

/** Everything of the shell's frame, any one of which must not stand round the status page. */
const FRAME = ['app-top-bar', 'anotoki-top-bar', 'nav', '.notes', '#view-root', 'anotoki-site-footer', 'footer'];

/**
 * How the shell is looked at: on a phone's screen (the menu button), with a menu opened, the piano's box, the
 * sign-out question, the feedback form, What's new - or at another address than the start page (the failure's
 * screen).
 */
interface Look {
  phone?: boolean;
  open?: 'account' | 'phone' | 'piano' | 'sign-out' | 'feedback' | 'whats-new';
  at?: string;
}

/** The screen as wide as a phone, or not: what the top bar asks matchMedia (jsdom has none). */
function screen(phone: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: phone && media.includes('max-width'), media, addEventListener: () => undefined, removeEventListener: () => undefined }));
}

/** Lets a click, the promises it starts and the change detection after them run out. */
async function settledAll(s: Shell): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done));
    await s.fixture.whenStable();
  }
}

/** Lets the code a press fetches come, and what it draws be drawn: until `selector` is on the page, or the rounds run out. */
async function opened(s: Shell, selector: string): Promise<void> {
  for (let i = 0; i < 20 && !s.host.querySelector(selector); i++) {
    await settledAll(s);
  }
}

/** The footer's row as it reads: each part's words and the dots between them, in their order. */
function footerRow(s: Shell): string[] {
  return Array.from(s.host.querySelectorAll(`${FOOTER.row} > *`)).map((part) => part.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

/** The footer's Terms · Privacy · Contact: each link's words and address. */
function footerLinks(s: Shell): [string | undefined, string | null][] {
  return Array.from(s.host.querySelectorAll(`${FOOTER.legal} a`)).map((link) => [link.textContent?.trim(), link.getAttribute('href')]);
}

/** The status page stands alone: nothing of the shell's frame round it - only the gate's own <main> holding it. */
function standsAlone(s: Shell): { status: boolean; frame: string[]; mains: number } {
  return {
    status: !!s.host.querySelector('anotoki-site-gate > main.anotoki-site-gate__status > anotoki-site-status'),
    frame: FRAME.filter((selector) => s.host.querySelector(selector) !== null),
    mains: s.host.querySelectorAll('main').length,
  };
}

async function drawn(state: (s: Shell) => void, providers: Provider[] = [], look: Look = {}): Promise<Shell> {
  screen(look.phone ?? false);
  const s = await shell(providers);
  state(s);
  await s.fixture.whenStable();
  if (look.at) {
    await TestBed.inject(Router).navigateByUrl(look.at);
    await settledAll(s);
  }
  if (look.open === 'feedback') {
    (s.host.querySelector(FOOTER.feedback) as HTMLButtonElement).click();
    // The family's footer fetches the dialog's and the form's code with the press: the dialog a moment later.
    await opened(s, 'anotoki-footer-feedback-dialog anotoki-dialog');
  } else if (look.open === 'piano') {
    // The device list is the family's select, drawn once the page is idle (a @defer): as it is by then.
    for (const block of await s.fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
    (s.host.querySelector('#midi-button') as HTMLButtonElement).click();
    await s.fixture.whenStable();
  } else if (look.open === 'whats-new') {
    // The footer's What's new opens this app's dialog - its code loaded as it opens (a @defer): the dialog a moment
    // later. (With no list of changes there is neither the version nor What's new, so nothing opens it.)
    (s.host.querySelector(FOOTER.whatsNew) as HTMLButtonElement).click();
    await settledAll(s);
  } else if (look.open) {
    (s.host.querySelector(look.open === 'phone' ? BAR.phoneButton : BAR.personButton) as HTMLButtonElement).click();
    await s.fixture.whenStable();
    if (look.open === 'sign-out') {
      // Some progress would be lost: the question, in the learner's words.
      vi.spyOn(s.boot, 'settleBeforeSignOut').mockResolvedValue(true);
      (s.host.querySelector(BAR.signOut) as HTMLButtonElement).click();
      await settledAll(s);
    }
  }
  return s;
}

/** The states the bar's menus are looked at in, opened: the person's menu and the phone's, with each role; the piano's box; the sign-out question. */
const OPENED: [string, (s: Shell) => void, Look][] = [
  [
    "the person's menu of an ADMIN, a save waiting",
    (s) => {
      session(s.auth, { ...PERSON, roles: ['ADMIN'] });
      vi.spyOn(s.auth, 'accountUrl').mockReturnValue('http://localhost:4300/account');
      s.store.loaded.set(true);
      s.store.progressFailed.set(true);
      s.boot.status.set('ready');
    },
    { open: 'account' },
  ],
  [
    "the person's menu of an EDITOR",
    (s) => {
      session(s.auth, { ...PERSON, roles: ['EDITOR'] });
      vi.spyOn(s.auth, 'accountUrl').mockReturnValue('http://localhost:4300/account');
      s.store.loaded.set(true);
      s.boot.status.set('ready');
    },
    { open: 'account' },
  ],
  [
    "the phone's menu of a learner, a save waiting",
    (s) => {
      session(s.auth, PERSON);
      s.store.loaded.set(true);
      s.store.progressFailed.set(true);
      s.boot.status.set('ready');
    },
    { phone: true, open: 'phone' },
  ],
  [
    "the phone's menu, signed out in the middle of practising",
    (s) => {
      session(s.auth, null);
      s.store.loaded.set(true);
      s.boot.status.set('ready');
    },
    { phone: true, open: 'phone' },
  ],
  [
    "the piano's box, no MIDI device found",
    (s) => {
      s.midi.asked.set(true);
    },
    { open: 'piano' },
  ],
  [
    "What's new, opened from the footer's What's new",
    (s) => {
      s.changelog.entries.set(RELEASES);
    },
    { open: 'whats-new' },
  ],
  [
    'the sign-out question, some progress not saved',
    (s) => {
      session(s.auth, PERSON);
      s.store.loaded.set(true);
      s.store.progressFailed.set(true);
      s.boot.status.set('ready');
    },
    { open: 'sign-out' },
  ],
  ['the feedback form, nobody signed in', () => undefined, { open: 'feedback' }],
  [
    'the feedback form of a learner',
    (s) => {
      session(s.auth, { ...PERSON, email: 'mia@example.test' });
      s.store.loaded.set(true);
      s.boot.status.set('ready');
    },
    { open: 'feedback' },
  ],
  // The failure's screens - the family's, under the bar, where the guards send a sign-in that did not work.
  [
    "the failure's screen after a sign-in the IAM turned away",
    (s) => {
      session(s.auth, null);
      s.auth.failed('access_denied');
      s.boot.status.set('sign-in');
    },
    { at: SIGN_IN_FAILED_ROUTE },
  ],
  [
    "the failure's screen after a sign-in that failed",
    (s) => {
      session(s.auth, null);
      s.auth.failed('invalid_grant');
      s.boot.status.set('sign-in');
    },
    { at: SIGN_IN_FAILED_ROUTE },
  ],
  [
    "the failure's screen after a sign-in that could not start",
    (s) => {
      session(s.auth, null);
      s.auth.failed('storage_unavailable');
      s.boot.status.set('sign-in');
    },
    { at: SIGN_IN_FAILED_ROUTE },
  ],
];

describe('the shell with no bundle', () => {
  // The family's dialogs, menus and boxes ask jsdom for what it lacks (showModal(), checkVisibility(), popovers).
  beforeAll(() => provideTestKit());
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  for (const [name, state, look] of [...Object.entries(STATES).map(([name, state]) => [name, state, {}] as const), ...OPENED]) {
    it(`renders no text of a key's shape, and asks for no string it has not got: ${name}`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const s = await drawn(state, [], look);

      expect(TestBed.inject(TranslationService).ready()).toBe(false);
      const texts = said(s.host);
      if (standsAlone(s).status) {
        // The status page alone - the family's, in its own words, marked as such: nothing of the shell's to say, and
        // no key in the page's words either.
        const page = statusPage(s)!;
        expect(page.title).toBeTruthy();
        expect(keysIn([page.title ?? '', page.text ?? '', ...page.actions])).toEqual([]);
      } else {
        expect(texts.length).toBeGreaterThan(5);
      }
      expect(keysIn(texts)).toEqual([]);
      // A missing string is a warning as well as a key on the page: none of either.
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it('says itself in the English kept in code: the cards, the top bar and the footer', async () => {
    const notSetUp = await drawn(STATES['not set up, never installed: the setup page offered']);
    // The family's page alone, in its own words (and marked as such): nothing of the shell round it.
    expect(statusPage(notSetUp)).toEqual({
      title: 'This site is not set up yet',
      text: 'Its setup page connects it to its database and to the anotoki sign-in.',
      lang: 'en',
      actions: ['Open the setup page', 'Try again'],
      links: ['/setup.php'],
    });
    expect(standsAlone(notSetUp).frame).toEqual([]);

    // The start on its way: "Loading…", the bar and the footer - with no strings yet, in the English kept in code.
    const loading = await drawn(STATES['loading, before anything is known']);
    expect(loading.host.querySelector('.loading')?.textContent).toBe('Loading…');
    // Before the app runs there is nothing to practise on: the bar has no sections yet.
    expect(loading.host.querySelector(BAR.nav)).toBeNull();
    expect(loading.host.querySelector('.anotoki-brand__brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy: Learn');
    expect(loading.host.querySelector('.anotoki-brand__area')?.textContent).toBe('Piano Academy');
    expect(loading.host.querySelector('#midi-label')?.textContent?.trim()).toBe('No piano');
    expect(loading.host.querySelector('#midi-button')?.getAttribute('aria-label')).toBe('No piano: Piano not connected');
    expect(loading.host.querySelector('#midi-button')?.getAttribute('title')).toBe('Piano not connected');
    // The family's theme switch: its three choices named in this app's words (the kit's own "Theme" names the group).
    expect(Array.from(loading.host.querySelectorAll(BAR.theme)).map((choice) => choice.getAttribute('aria-label'))).toEqual(['Theme: light', 'Theme: dark', 'Theme: automatic']);
    expect(loading.host.querySelector('anotoki-theme-toggle [role="radiogroup"]')?.getAttribute('aria-label')).toBe('Theme');
    // No language to choose from while there are no strings: the chooser is not there.
    expect(loading.host.querySelector('anotoki-language-switcher button')).toBeNull();
    // The family's footer, in the library's own words: no list of changes yet, so neither the version nor What's new -
    // Feedback alone in its row, no dot beside it - then About · Support · Terms · Privacy · Contact.
    expect(footerRow(loading)).toEqual(['Feedback']);
    expect(footerLinks(loading).map(([word]) => word)).toEqual(['About', 'Support', 'Terms', 'Privacy', 'Contact']);
    // The piano's box, opened: the state said whole.
    const box = await drawn(STATES['loading, before anything is known'], [], { open: 'piano' });
    expect(box.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Piano not connected');
    expect(box.host.querySelector('#midi-box-title')?.textContent).toBe('Your piano');

    // The family's error state: its alert said at once, its heading and sentence this app's, its Try again too.
    const loadError = await drawn(STATES['the progress could not be loaded']);
    expect(loadError.host.querySelector('#load-error .anotoki-alert__heading')?.textContent).toBe('Could not load your progress');
    expect(loadError.host.querySelector('#load-error [role="alert"]')).not.toBeNull();
    expect(loadError.host.querySelector('#load-error button')?.textContent?.trim()).toBe('Try again');

    const onTheWay = await drawn(STATES['nobody signed in, on the way to the IAM']);
    expect(onTheWay.host.querySelector('anotoki-sign-in-failure')).toBeNull();
    expect(onTheWay.host.querySelector('.loading')?.textContent).toBe('Loading…');

    // The family's screen of a sign-in that did not work, under the bar: its words this app's where it had its own
    // (kept-english.ts's KEPT_LIBRARY_ENGLISH, the database's with a bundle), the library's for the rest.
    const failure = (s: Shell) => ({
      title: text(s, '.anotoki-sign-in-failure__title'),
      message: text(s, '.anotoki-sign-in-failure__message'),
      buttons: Array.from(s.host.querySelectorAll('.anotoki-sign-in-failure__actions button')).map((button) => button.textContent?.trim()),
    });
    const [denied, failed, storage] = ['turned away', 'failed', 'could not start'].map((what) => OPENED.find(([name]) => name.endsWith(what))!);
    expect(failure(await drawn(denied[1], [], denied[2]))).toEqual({
      title: 'Signing in did not work',
      message: 'Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.',
      buttons: ['Try again', 'Back'],
    });
    expect(failure(await drawn(failed[1], [], failed[2])).message).toBe('Signing in did not work. Please try again. (invalid_grant)');
    const cannot = await drawn(storage[1], [], storage[2]);
    expect(failure(cannot).message).toBe('This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.');
    expect(cannot.host.querySelector('.anotoki-sign-in-failure__message')?.getAttribute('role')).toBe('alert');
    // Under the bar, in the view's place: the bar has no sections yet - nothing to practise on.
    expect(cannot.host.querySelector('#view-root anotoki-sign-in-failure')).not.toBeNull();
    expect(cannot.host.querySelector(BAR.nav)).toBeNull();

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there']);
    expect(Array.from(running.host.querySelectorAll(`${BAR.nav} a`)).map((link) => link.textContent?.trim())).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    expect(running.host.querySelector(BAR.nav)?.getAttribute('aria-label')).toBe('Main');
    expect(running.host.querySelector('#midi-label')?.textContent?.trim()).toBe('KAWAI ES120');
    expect(running.host.querySelector(BAR.personName)?.textContent).toBe('mia');
    expect(running.host.querySelector(BAR.personButton)?.getAttribute('aria-label')).toBe('Your menu: mia');
    const menu = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], { open: 'account' });
    expect(menu.host.querySelector(BAR.menu)?.getAttribute('aria-label')).toBe('Your menu');
    expect(menu.host.querySelector(`${BAR.menu} a[href="http://localhost:4300/account"]`)?.textContent?.trim()).toBe('Your anotoki account');
    expect(menu.host.querySelector(BAR.signOut)?.textContent?.trim()).toBe('Sign out');
    const connected = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], { open: 'piano' });
    expect(connected.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Connected: KAWAI ES120');
    // The family's footer in the build analyzer's order: the version and What's new from the list of changes (its
    // newest entry: one source), then Feedback - a dot between two of them, drawn and never read. The version reads
    // "v0.4.0" on screen and "Version 0.4.0" to a screen reader (anotoki-lib 0.7.1): its text holds both.
    expect(footerRow(running)).toEqual(['v0.4.0Version 0.4.0', '·', "What's new", '·', 'Feedback']);
    expect(Array.from(running.host.querySelectorAll(`${FOOTER.row} .anotoki-site-footer__dot`)).map((dot) => dot.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
    expect([FOOTER.whatsNew, FOOTER.feedback].map((part) => running.host.querySelector(part)?.getAttribute('aria-haspopup'))).toEqual(['dialog', 'dialog']);
    expect(running.host.querySelector('#progress-changed')).toBeNull();
    // What's new: the family's dialog, drawn once the footer's What's new is pressed - its heading, the newest marked, each list named.
    expect(running.host.querySelector('app-changelog-dialog anotoki-dialog')).toBeNull();
    const news = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], { open: 'whats-new' });
    expect(news.host.querySelector('app-changelog-dialog .anotoki-dialog__title')?.textContent).toBe("What's new");
    expect(news.host.querySelector('app-changelog-dialog dialog')?.hasAttribute('open')).toBe(true);
    expect(news.host.querySelector('.release-date')?.textContent).toBe('28 September 2026');
    expect(news.host.querySelector('.release.is-latest anotoki-badge.latest')?.textContent?.trim()).toBe('Latest');
    expect(Array.from(news.host.querySelectorAll('.release-section')).map((heading) => heading.textContent?.trim())).toEqual(['Added', 'Changed', 'Fixed', 'Added']);
    // Its Close (beside the dialog's own) closes it.
    (news.host.querySelector('#whats-new-close') as HTMLButtonElement).click();
    await settledAll(news);
    expect(news.host.querySelector('app-changelog-dialog anotoki-dialog')).toBeNull();
    // The sign-out question (the family's dialog), asked when some progress would be lost: in the kept English too.
    const question = await drawn(OPENED.find(([name]) => name.startsWith('the sign-out question'))![1], [], { open: 'sign-out' });
    expect(question.host.querySelector('anotoki-confirm-host .anotoki-dialog__title')?.textContent).toBe('Sign out without your latest progress?');
    expect(question.host.querySelector('anotoki-confirm-host .anotoki-confirm-host__message')?.textContent).toBe('Some of your progress could not be saved yet. If you sign out now, it is lost.');
    expect(question.host.querySelector('anotoki-confirm-host [data-answer="no"]')?.textContent?.trim()).toBe('Stay signed in');
    expect(question.host.querySelector('anotoki-confirm-host [data-answer="yes"]')?.textContent?.trim()).toBe('Sign out anyway');

    const changed = await drawn(STATES['running, the progress replaced or deleted somewhere else and loaded again']);
    expect(changed.host.querySelector('#progress-changed span')?.textContent).toBe(
      'Your progress was replaced or deleted somewhere else - by a file brought back in another tab, or by an administrator. This page now shows what is saved.',
    );
    expect(changed.host.querySelector('#progress-changed-close')?.textContent).toBe('Close');

    const signedOut = await drawn(STATES['running, signed out in the middle of practising']);
    expect(signedOut.host.querySelector('#signed-out-banner span')?.textContent).toBe('You are signed out, so your progress is not saved.');
    expect(signedOut.host.querySelector('#signed-out-sign-in')?.textContent).toBe('Sign in');
    expect(signedOut.host.querySelector(BAR.personName)).toBeNull();
    expect(signedOut.host.querySelector(BAR.signIn)?.textContent?.trim()).toBe('Sign in');
    expect(signedOut.host.querySelector('#signed-out-why')).toBeNull();

    // The banner's (or the bar's) Sign in could not even start: the banner says why, in the failure's screen's words - the page stays.
    const cannotStart = await drawn(STATES['running, signed out in the middle of practising, and a sign-in that could not start']);
    expect(cannotStart.host.querySelector('#signed-out-why')?.textContent).toBe('This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.');
    expect(cannotStart.host.querySelector('#signed-out-sign-in')?.textContent).toBe('Sign in');
    expect(cannotStart.host.querySelector('anotoki-sign-in-failure')).toBeNull();

    // A phone: "Piano" beside the mark, the menu button - and in its menu the sections, then the person's items.
    const phone = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], { phone: true, open: 'phone' });
    expect(phone.host.querySelector('.anotoki-brand__area')?.textContent).toBe('Piano');
    expect(phone.host.querySelector(BAR.phoneButton)?.getAttribute('aria-label')).toBe('Menu');
    expect(phone.host.querySelector(BAR.nav)).toBeNull();
    expect(Array.from(phone.host.querySelectorAll(`${BAR.menu} [role="menuitem"]`)).map((item) => item.textContent?.trim())).toEqual([
      'Learn',
      'Note Trainer',
      'Sheet Practice',
      'Songs',
      'Stats',
      'Your anotoki account',
      'Sign out',
    ]);
  });

  it('says a visitor’s notes in the English kept in code - the notice on Learn and Stats only, never the signed-out banner', async () => {
    const routes: Provider = { provide: ROUTES, multi: true, useValue: [{ path: '**', component: StubPageComponent }] };
    const go = async (s: Shell, url: string): Promise<void> => {
      await TestBed.inject(Router).navigateByUrl(url);
      await s.fixture.whenStable();
    };

    const learn = await drawn(STATES['running as a visitor, on Learn: how long this browser keeps the progress'], [routes]);
    const signIn = vi.spyOn(learn.boot, 'signIn').mockResolvedValue(undefined);
    expect(text(learn, '#visitor-notice span')).toBe(
      'You are practising without signing in. Your progress is kept for this browser for 30 days after your last visit. Sign in to keep it in your account.',
    );
    (learn.host.querySelector('#visitor-notice-sign-in') as HTMLButtonElement).click();
    expect(signIn).toHaveBeenCalledTimes(1);
    // Nobody's sign-in ended: no signed-out banner. The bar offers Sign in.
    expect(learn.host.querySelector('#signed-out-banner')).toBeNull();
    expect(text(learn, BAR.signIn)).toBe('Sign in');
    // Nothing else is said.
    for (const id of ['visitor-sign-in-now', 'visitor-sign-in-why', 'visitor-refused', 'visitor-lost', 'visitor-moved', 'visitor-not-moved', 'progress-changed']) {
      expect(learn.host.querySelector('#' + id)).toBeNull();
    }
    // The practice screens stay clear; Stats has it again.
    await go(learn, '/trainer');
    expect(learn.host.querySelector('#visitor-notice')).toBeNull();
    await go(learn, '/stats');
    expect(learn.host.querySelector('#visitor-notice')).not.toBeNull();
    await go(learn, '/lesson/rh-1/drill');
    expect(learn.host.querySelector('#visitor-notice')).toBeNull();

    const lost = await drawn(STATES['running as a visitor whose progress here has ended, and a save this browser cannot keep']);
    expect(text(lost, '#visitor-lost span')).toBe('The progress this browser kept without signing in has ended: it was not used for 30 days, or it was moved into an account at a sign-in.');
    expect(text(lost, '#visitor-refused span')).toBe('Without signing in, this browser cannot keep any more. Sign in to keep practising with your progress saved.');
    expect(text(lost, '#visitor-refused-sign-in')).toBe('Sign in');
    expect(lost.host.querySelector('#visitor-refused')?.getAttribute('role')).toBe('alert');
    (lost.host.querySelector('#visitor-lost-close') as HTMLButtonElement).click();
    await lost.fixture.whenStable();
    expect(lost.host.querySelector('#visitor-lost')).toBeNull();
    // A save that got through takes the refusal away (ApiService clears it).
    lost.api.visitorRefusal.set(null);
    await lost.fixture.whenStable();
    expect(lost.host.querySelector('#visitor-refused')).toBeNull();

    const busy = await drawn(STATES['running as a visitor, while too many people start without signing in']);
    expect(text(busy, '#visitor-refused span')).toBe('Too many people are practising without signing in just now, so this is not saved yet. Sign in, or try again later.');

    const now = await drawn(STATES['running as a visitor, and the IAM began to require a sign-in meanwhile']);
    expect(text(now, '#visitor-sign-in-now span')).toBe('Piano Academy now asks everybody to sign in. Sign in to go on - your progress from this browser comes with you.');
    expect(text(now, '#visitor-sign-in-now-button')).toBe('Sign in');
    expect(now.host.querySelector('#visitor-sign-in-now')?.getAttribute('role')).toBe('alert');
    // Not "kept for 30 days without signing in" any more, and still no signed-out banner.
    expect(now.host.querySelector('#visitor-notice')).toBeNull();
    expect(now.host.querySelector('#signed-out-banner')).toBeNull();

    // A sign-in the IAM turned away (MEMBER taken away, say): said in the failure's screen's words, never swallowed - and closable.
    const denied = await drawn(STATES['running as a visitor, after a sign-in the IAM turned away']);
    expect(text(denied, '#visitor-sign-in-why span')).toBe('Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.');
    expect(denied.host.querySelector('#visitor-sign-in-why')?.getAttribute('role')).toBe('alert');
    expect(denied.host.querySelector('#signed-out-banner')).toBeNull();
    expect(denied.host.querySelector('anotoki-sign-in-failure')).toBeNull();
    expect(denied.host.querySelector('#visitor-notice')).not.toBeNull();
    (denied.host.querySelector('#visitor-sign-in-why-close') as HTMLButtonElement).click();
    await denied.fixture.whenStable();
    expect(denied.host.querySelector('#visitor-sign-in-why')).toBeNull();
    // Another failure is said again.
    denied.auth.failed('storage_unavailable');
    await denied.fixture.whenStable();
    expect(text(denied, '#visitor-sign-in-why span')).toBe('This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.');

    // A person whose sign-in ran out is no visitor: their banner, none of the visitor's notes.
    const person = await drawn(STATES['running, signed out in the middle of practising']);
    expect(person.host.querySelector('#signed-out-banner')).not.toBeNull();
    expect(person.host.querySelector('#visitor-notice')).toBeNull();
    person.visitorKey.lost.set(true);
    person.api.visitorRefusal.set(VISITOR_WORDS.full);
    await person.fixture.whenStable();
    expect(person.host.querySelector('#visitor-lost')).toBeNull();
    expect(person.host.querySelector('#visitor-refused')).toBeNull();
  });

  it('says what came of this browser’s progress after a sign-in - moved (and kept where the account had its own), or not this time - closable', async () => {
    const moved = await drawn(STATES['running, signed in, this browser’s progress moved into the account - which kept its own for some']);
    expect(text(moved, '#visitor-moved span')).toBe('Your progress from practising without signing in is now in your account.');
    expect(text(moved, '#visitor-kept')).toBe('Where your account already had progress, it was kept.');
    expect(moved.host.querySelector('#visitor-notice')).toBeNull();
    (moved.host.querySelector('#visitor-moved-close') as HTMLButtonElement).click();
    await moved.fixture.whenStable();
    expect(moved.host.querySelector('#visitor-moved')).toBeNull();
    expect(moved.boot.visitorMoved()).toBeNull();

    // Everything came, nothing of the account's was in the way: no second sentence.
    moved.boot.visitorMoved.set({ kept: false });
    await moved.fixture.whenStable();
    expect(moved.host.querySelector('#visitor-moved')).not.toBeNull();
    expect(moved.host.querySelector('#visitor-kept')).toBeNull();

    const notMoved = await drawn(STATES['running, signed in, this browser’s progress could not be moved into the account this time']);
    expect(text(notMoved, '#visitor-not-moved span')).toBe(
      'Your progress from practising without signing in could not be moved into your account yet. Nothing is lost: it is tried again on your next visit.',
    );
    expect(text(notMoved, '#visitor-not-moved-close')).toBe('Close');
    (notMoved.host.querySelector('#visitor-not-moved-close') as HTMLButtonElement).click();
    await notMoved.fixture.whenStable();
    expect(notMoved.host.querySelector('#visitor-not-moved')).toBeNull();
  });

  it('words what stands in for a name, and a problem with the piano, itself - the services hold no sentence', async () => {
    const nameless = await drawn(STATES['running, signed in with a token that names nobody, a save that did not get through, no MIDI device']);
    expect(nameless.auth.displayName()).toBe('');
    expect(nameless.host.querySelector(BAR.personName)?.textContent).toBe('Signed in');
    expect(nameless.host.querySelector('#save-status')?.textContent).toBe('Not saved yet');
    expect(nameless.host.querySelector('#save-status')?.getAttribute('title')).toBe('Some of your progress is not on the server yet. The app keeps trying.');
    // On a phone: a dot on the menu button, and the sentence as the menu's first line.
    const phone = await drawn(STATES['running, signed in with a token that names nobody, a save that did not get through, no MIDI device'], [], { phone: true, open: 'phone' });
    expect(phone.host.querySelector('#save-status')).toBeNull();
    const button = phone.host.querySelector(BAR.phoneButton)!;
    expect(button.querySelector('.anotoki-top-bar__mark-dot')).not.toBeNull();
    const described = button.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(phone.host.querySelector(`#${described}`)?.textContent).toBe('Not saved yet');
    expect(phone.host.querySelector(`${BAR.menu} .anotoki-top-bar__menu-note strong`)?.textContent).toBe('Not saved yet');
    expect(phone.host.querySelector(`${BAR.menu} .anotoki-top-bar__menu-note span`)?.textContent).toBe('Some of your progress is not on the server yet. The app keeps trying.');
    const box = await drawn(STATES['running, signed in with a token that names nobody, a save that did not get through, no MIDI device'], [], { open: 'piano' });
    expect(box.host.querySelector('#midi-device-select option')?.textContent).toBe('No MIDI devices found');

    const unsupported = await drawn(STATES['running, an editor, in a browser with no Web MIDI'], [], { open: 'piano' });
    expect(unsupported.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Web MIDI not supported — use Chrome or Edge');

    const refused = await drawn(STATES['the browser refused MIDI, in its own words'], [], { open: 'piano' });
    const status = refused.host.querySelector('#midi-status')!;
    expect(status.textContent?.trim()).toBe('The browser did not allow MIDI: Permission to use Web MIDI API was not granted.');
    // The browser's own words are English whatever the page is in, and say so.
    expect(status.querySelector('span[lang="en"]')?.textContent).toBe('Permission to use Web MIDI API was not granted.');

    const failed = await drawn(STATES['the piano could not be connected'], [], { open: 'piano' });
    expect(failed.host.querySelector('#midi-status')?.textContent?.trim()).toBe('The piano could not be connected');
    expect(failed.host.querySelector('#midi-status span')).toBeNull();
  });

  it("shows the staff the way to the admin panel in the person's menu - an EDITOR and an ADMIN, with their role, and nobody else", async () => {
    const open = { open: 'account' } as const;
    const adminLink = (s: Shell): Element | null => s.host.querySelector(`${BAR.menu} a[href="/admin"]`);
    const role = (s: Shell): Element | null => s.host.querySelector(`${BAR.menu} .anotoki-top-bar__menu-role`);
    const editor = await drawn(STATES['running, an editor, in a browser with no Web MIDI'], [], open);
    expect(adminLink(editor)?.textContent?.trim()).toBe('Admin panel');
    expect(role(editor)?.textContent).toBe('Editor');

    const learner = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], open);
    expect(adminLink(learner)).toBeNull();
    expect(role(learner)).toBeNull();

    const admin = await drawn(
      (s) => {
        STATES['running, signed in, a piano connected, the list of changes there'](s);
        s.auth.signInAs({ ...PERSON, roles: ['ADMIN'] });
      },
      [],
      open,
    );
    expect(adminLink(admin)?.textContent?.trim()).toBe('Admin panel');
    expect(role(admin)?.textContent).toBe('Administrator');

    const member = await drawn(
      (s) => {
        STATES['running, signed in, a piano connected, the list of changes there'](s);
        s.auth.signInAs({ ...PERSON, roles: ['MEMBER'] });
      },
      [],
      open,
    );
    expect(adminLink(member)).toBeNull();
  });

  it("opens the family's feedback form from the footer - for everybody, in the library's words - and closes it again", async () => {
    // Nobody signed in, nothing loaded yet: the family's footer has it all the same - "Feedback", the build analyzer's word.
    const nobody = await drawn(() => undefined);
    expect(text(nobody, FOOTER.feedback)).toBe('Feedback');
    // Its code is not loaded until it is pressed.
    expect(nobody.host.querySelector('anotoki-feedback-dialog, anotoki-feedback-form')).toBeNull();

    const form = await drawn(() => undefined, [], { open: 'feedback' });
    // In the kit's dialog, named by the footer's words (the form draws no heading of its own), outside the footer's landmark.
    expect(text(form, 'anotoki-dialog .anotoki-dialog__title')).toBe('Feedback');
    expect(form.host.querySelector('anotoki-dialog anotoki-feedback-form')).not.toBeNull();
    expect(form.host.querySelector('anotoki-feedback-form .anotoki-feedback-form__title')).toBeNull();
    expect(form.host.querySelector('footer anotoki-dialog')).toBeNull();
    // The places of this app it can be about, in the page's words (shared/site-admin.ts); nobody signed in: no "without my name".
    expect(form.host.querySelector('anotoki-feedback-form [data-section]')).not.toBeNull();
    expect(form.host.querySelector('anotoki-feedback-form [data-anonymous]')).toBeNull();
    // Cancel - in the dialog's own footer since anotoki-lib 0.8.0, always in view - closes it, and the focus is back on Feedback.
    (form.host.querySelector('anotoki-dialog [data-cancel]') as HTMLButtonElement).click();
    await settledAll(form);
    expect(form.host.querySelector('anotoki-dialog')).toBeNull();
    expect(document.activeElement).toBe(form.host.querySelector(FOOTER.feedback));
    // And it opens again, afresh.
    (form.host.querySelector(FOOTER.feedback) as HTMLButtonElement).click();
    await opened(form, 'anotoki-dialog anotoki-feedback-form');
    expect(form.host.querySelector('anotoki-dialog anotoki-feedback-form')).not.toBeNull();

    // A learner: "send it without my name" is offered.
    const learner = await drawn(OPENED.find(([name]) => name === 'the feedback form of a learner')![1], [], { open: 'feedback' });
    expect(learner.host.querySelector('anotoki-feedback-form [data-anonymous]')).not.toBeNull();
  });

  /** The stub page under every address - and the Migrations page's - for the gate's cases. */
  const anyPage: Provider = {
    provide: ROUTES,
    multi: true,
    useValue: [
      { path: 'admin/migrations', component: StubPageComponent },
      { path: '**', component: StubPageComponent },
    ],
  };

  /** Lets a click's navigation, the change detection and the gate's following of the router run out. */
  async function settled(s: Shell): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((done) => setTimeout(done));
      await s.fixture.whenStable();
    }
  }

  async function go(s: Shell, url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await settled(s);
  }

  it('while an update waits a visitor and a signed-in learner read that the site is being updated - in their language, no error, no code, no setup or Migrations link; Sign in only for nobody', async () => {
    const nobody = await drawn(STATES['an update waits, nobody signed in'], [anyPage]);
    expect(statusPage(nobody)).toEqual({
      title: 'The site is being updated',
      text: 'It will be back in a few minutes. This page reloads by itself.',
      lang: 'en',
      actions: ['Sign in'],
      links: [],
    });
    expect(nobody.host.querySelector('anotoki-site-status section')?.getAttribute('role')).toBe('status');
    // Nothing else on the page: no error, no code, no way to the setup page or the Migrations page - and nothing of the
    // shell's frame round it (no bar, no note, no footer), the gate's own <main> its one landmark.
    const page = (s: Shell): string => s.host.textContent?.trim() ?? '';
    expect(page(nobody)).toBe(['The site is being updated', 'It will be back in a few minutes. This page reloads by itself.', 'Sign in'].join(''));
    expect(nobody.host.querySelector('[role="alert"], a[href="/setup.php"], a[href="/admin/migrations"], #stub-page')).toBeNull();
    expect(standsAlone(nobody)).toEqual({ status: true, frame: [], mains: 1 });
    // Whatever the address: an admin panel's too.
    await go(nobody, '/admin/migrations');
    expect(statusPage(nobody)?.title).toBe('The site is being updated');
    expect(nobody.host.querySelector('#stub-page')).toBeNull();

    const learner = await drawn(STATES['an update waits, a learner signed in'], [anyPage]);
    expect(statusPage(learner)).toEqual({ title: 'The site is being updated', text: 'It will be back in a few minutes. This page reloads by itself.', lang: 'en', actions: [], links: [] });
    await go(learner, '/admin/migrations');
    expect(learner.host.querySelector('#stub-page')).toBeNull();
    expect(statusPage(learner)?.actions).toEqual([]);

    // In Slovak, in the family's own Slovak words.
    const slovak = await drawn(STATES['an update waits, nobody signed in'], [provideTestTranslations({}, { language: 'sk' })]);
    expect(statusPage(slovak)).toEqual({
      title: 'Stránku práve aktualizujeme',
      text: 'O pár minút bude späť. Táto stránka sa obnoví sama.',
      lang: 'sk',
      actions: ['Prihlásiť sa'],
      links: [],
    });

    // An update that came in the middle of practising: the page goes, and no note of the shell's says anything else.
    const visitor = await drawn(STATES["an update came in the middle of a visitor's practising, a save refused meanwhile"], [anyPage]);
    expect(statusPage(visitor)?.title).toBe('The site is being updated');
    for (const id of ['visitor-refused', 'visitor-notice', 'signed-out-banner', 'stub-page']) {
      expect(visitor.host.querySelector('#' + id), id).toBeNull();
    }
    // The frame went with the page: no bar, no footer meanwhile.
    expect(standsAlone(visitor).frame).toEqual([]);
  });

  it("while an update waits the site's ADMIN reads that a database update is waiting, in English, and reaches the Migrations page - nothing else of the app", async () => {
    const admin = await drawn(STATES["an update waits, the site's ADMIN signed in"], [anyPage]);
    expect(statusPage(admin)).toEqual({
      title: 'A database update is waiting',
      text: 'This site is closed to everybody else until the update is applied. Back the database up first.',
      lang: 'en',
      actions: ['Open Migrations'],
      links: ['/admin/migrations'],
    });
    expect(admin.host.querySelector('#stub-page')).toBeNull();

    (admin.host.querySelector('anotoki-site-status a') as HTMLAnchorElement).click();
    await settled(admin);
    expect(TestBed.inject(Router).url).toBe('/admin/migrations');
    expect(admin.host.querySelector('#stub-page')).not.toBeNull();
    expect(statusPage(admin)).toBeNull();

    // Anywhere else: the same notice again.
    await go(admin, '/stats');
    expect(admin.host.querySelector('#stub-page')).toBeNull();
    expect(statusPage(admin)?.title).toBe('A database update is waiting');
  });

  it('a signed-out ADMIN presses Sign in on the status page - to the IAM, to come back to this address - and comes back to the Migrations page', async () => {
    const signedOut = await drawn(STATES['an update waits, nobody signed in'], [anyPage]);
    await go(signedOut, '/admin/migrations');
    // The address bar, as the router leaves it in a browser.
    history.replaceState(null, '', '/admin/migrations');
    try {
      // The family's sign-in (BootService.signIn()): it comes back to the page it started on - the address bar's.
      (signedOut.host.querySelector('anotoki-site-status button') as HTMLButtonElement).click();
      await settled(signedOut);
      expect(signedOut.auth.signIn).toHaveBeenCalledTimes(1);

      // Back from the IAM (its callback puts the address back before the router reads it): the ADMIN is on the Migrations page.
      const back = await drawn(STATES["an update waits, the site's ADMIN signed in"], [anyPage]);
      await go(back, '/admin/migrations');
      expect(back.host.querySelector('#stub-page')).not.toBeNull();
      expect(statusPage(back)).toBeNull();
    } finally {
      history.replaceState(null, '', '/');
    }
  });

  it("the Migrations page stays on the screen as the app starts after its Apply - and is nobody else's way in", async () => {
    const admin = await drawn(STATES["an update waits, the site's ADMIN signed in"], [anyPage]);
    await go(admin, '/admin/migrations');
    const page = admin.host.querySelector('#stub-page');
    expect(page).not.toBeNull();
    // Applied: the site is ready, the start goes on - and the page on the screen is the same one, not drawn again.
    admin.site.markReady();
    admin.boot.status.set('loading');
    await settled(admin);
    expect(admin.host.querySelector('#stub-page')).toBe(page);
    admin.boot.status.set('ready');
    await settled(admin);
    expect(admin.host.querySelector('#stub-page')).toBe(page);

    // An EDITOR: the status page, whatever the address.
    const editor = await drawn(
      (s) => {
        STATES['an update waits, a learner signed in'](s);
        s.auth.signInAs({ ...PERSON, roles: ['MEMBER', 'EDITOR'] });
      },
      [anyPage],
    );
    await go(editor, '/admin/migrations');
    expect(editor.host.querySelector('#stub-page')).toBeNull();
    expect(statusPage(editor)?.title).toBe('The site is being updated');

    // Not set up at all: nothing to apply - no Migrations page for an ADMIN either.
    const notSetUp = await drawn(
      (s) => {
        STATES['not set up once installed: only "not available right now"'](s);
        session(s.auth, { ...PERSON, roles: ['ADMIN'] });
      },
      [anyPage],
    );
    await go(notSetUp, '/admin/migrations');
    expect(notSetUp.host.querySelector('#stub-page')).toBeNull();
    expect(statusPage(notSetUp)?.title).toBe('The site is not available right now');
  });

  it('makes no page behind the status page - an update that comes in the middle of practising takes the page away, and a start that waits makes none', async () => {
    const counted: Provider = { provide: ROUTES, multi: true, useValue: [{ path: '**', component: CountedPageComponent }] };
    const count = (): number[] => [CountedPageComponent.made, CountedPageComponent.gone];
    CountedPageComponent.made = CountedPageComponent.gone = 0;

    const practising = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [counted]);
    await go(practising, '/trainer');
    expect(practising.host.querySelector('#counted-page')).not.toBeNull();
    expect(count()).toEqual([1, 0]);
    // A save is answered that an update waits: the status page - and the page is gone, not hidden and still running
    // (as the gate's content given as it is would leave it: made by Angular whether it shows or not).
    practising.site.report('update_pending');
    await settled(practising);
    expect(statusPage(practising)?.title).toBe('The site is being updated');
    expect(count()).toEqual([1, 1]);

    // A start that waits for the update: no page is made, wherever the address goes.
    CountedPageComponent.made = CountedPageComponent.gone = 0;
    const waiting = await drawn(STATES['an update waits, a learner signed in'], [counted]);
    await go(waiting, '/stats');
    await go(waiting, '/trainer');
    expect(statusPage(waiting)?.title).toBe('The site is being updated');
    expect(count()).toEqual([0, 0]);
    // The site is back - the status page's own check, which loads the page afresh next (anotoki-lib 0.2.0's
    // checkForReload): the site is NOT reported ready, so the gate stays shut and no page is made in the moment
    // before the reload. (0.1.x reported it ready first: then only the shell's own pageShown() held the page back.)
    const asked = waiting.site.checkForReload();
    TestBed.inject(HttpTestingController).expectOne(SITE_STATUS_URL).flush({ state: 'ready', installed: true });
    expect(await asked).toBe('ready');
    await settled(waiting);
    expect(statusPage(waiting)?.title).toBe('The site is being updated');
    expect(count()).toEqual([0, 0]);
    // An ADMIN's Apply made the site ready (the Migrations page marks it so) while this start still waits: it goes on
    // in place (resumeAfterUpdate), and the moment until it is done is a card of the start, not a page on progress
    // that was never loaded.
    waiting.site.markReady();
    await settled(waiting);
    expect(statusPage(waiting)).toBeNull();
    expect(text(waiting, '#view-root')).toBe('Loading…');
    expect(count()).toEqual([0, 0]);
  });

  it('offers the setup page only while the site was never installed - never once it was, nor while its database is out of reach', async () => {
    const never = await drawn(STATES['not set up, never installed: the setup page offered']);
    expect(statusPage(never)?.links).toEqual(['/setup.php']);

    const installed = await drawn(STATES['not set up once installed: only "not available right now"']);
    expect(statusPage(installed)).toEqual({
      title: 'The site is not available right now',
      text: 'Please try again in a few minutes. This page reloads by itself.',
      lang: 'en',
      actions: ['Try again'],
      links: [],
    });
    // Nobody is offered it then - an ADMIN neither.
    const admin = await drawn((s) => {
      STATES['not set up once installed: only "not available right now"'](s);
      session(s.auth, { ...PERSON, roles: ['ADMIN'] });
    });
    expect(admin.host.querySelector('a[href="/setup.php"]')).toBeNull();

    const unavailable = await drawn(STATES['the database out of reach']);
    expect(statusPage(unavailable)?.title).toBe('The site is not available right now');
    expect(unavailable.host.querySelector('a[href="/setup.php"]')).toBeNull();
  });

  it("draws the status page alone in every state the site cannot run in - no bar, no section, no note, no footer, the gate's own <main> its one landmark - and the frame comes back with the site", async () => {
    const closed = [
      'not set up, never installed: the setup page offered',
      'not set up once installed: only "not available right now"',
      'the database out of reach',
      'an update waits, nobody signed in',
      'an update waits, a learner signed in',
      "an update waits, the site's ADMIN signed in",
      "an update came in the middle of a visitor's practising, a save refused meanwhile",
    ];
    for (const name of closed) {
      const s = await drawn(STATES[name], [anyPage]);
      expect(standsAlone(s), name).toEqual({ status: true, frame: [], mains: 1 });
      // On any address: an admin panel's too.
      await go(s, '/admin/translations');
      expect(standsAlone(s), `${name}, on an admin panel's address`).toEqual({ status: true, frame: [], mains: 1 });
    }

    // Ready again (an ADMIN's Apply marks it so; the start goes on): the frame is back round the page - the bar with
    // its sections, the page in its <main>, the footer with its links - and the status page is gone.
    const back = await drawn(STATES['an update waits, a learner signed in'], [anyPage]);
    back.site.markReady();
    back.store.loaded.set(true);
    back.boot.status.set('ready');
    await go(back, '/stats');
    expect(standsAlone(back)).toEqual({ status: false, frame: FRAME, mains: 1 });
    expect(back.host.querySelector('#view-root #stub-page')).not.toBeNull();
    expect(Array.from(back.host.querySelectorAll(`${BAR.nav} a`)).map((link) => link.textContent?.trim())).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    expect(footerLinks(back).map(([, href]) => href)).toEqual(['/about', '/support', '/terms', '/privacy', '/contact']);

    // The one page that runs while an update waits - the ADMIN's Migrations page - is the admin panel's: its frame
    // (sites/admin/app.component, the family's admin frame - Migrations alone in its column, its footer, its <main>) is
    // the page's, and neither the shell nor the gate draws anything round it.
    const admin = await drawn(STATES["an update waits, the site's ADMIN signed in"], [anyPage]);
    await go(admin, '/admin/migrations');
    expect(admin.host.querySelector('app-view-root #stub-page')).not.toBeNull();
    expect(standsAlone(admin)).toEqual({ status: false, frame: [], mains: 0 });
  });

  it("the site settings: the announcement above the bar and the administrators' notice above the page - the learner's frame alone; closed for maintenance, the family's sign for everybody but the site's ADMIN, who uses the site as it is", async () => {
    const s = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [anyPage]);
    const load = TestBed.inject(SiteSettings).load();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/site-settings')
      .flush({ maintenance: false, announcement: { level: 'warning', message: { en: 'New songs on Friday.' } }, pages: [{ path: '/stats', visibility: 'EDITOR', blocked: false }] });
    await load;
    await go(s, '/trainer');
    const bar = s.host.querySelector('anotoki-announcement [data-announcement]');
    expect([bar?.getAttribute('data-level'), bar?.querySelector('.anotoki-announcement__message')?.textContent?.trim()]).toEqual(['warning', 'New songs on Friday.']);
    // Above the site's own bar: the site talking, not navigation.
    expect(bar!.compareDocumentPosition(s.host.querySelector('app-top-bar')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A learner is told nothing of what others are not shown - and the bar offers no section Page access closes to them.
    expect(s.host.querySelector('anotoki-page-notice anotoki-alert')).toBeNull();
    expect(Array.from(s.host.querySelectorAll(`${BAR.nav} a`)).map((link) => link.textContent?.trim())).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs']);

    // The site's ADMIN on a page kept for some readers: told so, between the notes and the page.
    session(s.auth, { ...PERSON, roles: ['MEMBER', 'ADMIN'] });
    await go(s, '/stats');
    const notice = s.host.querySelector('anotoki-page-notice anotoki-alert[data-notice]');
    expect(notice).not.toBeNull();
    expect(notice!.compareDocumentPosition(s.host.querySelector('#view-root')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(s.host.querySelectorAll(`${BAR.nav} a`)).map((link) => link.textContent?.trim())).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    // The admin panel's frame is its own: neither of the shell's there.
    await go(s, '/admin/translations');
    expect(s.host.querySelector('anotoki-announcement, anotoki-page-notice')).toBeNull();

    // Closed for maintenance: the ADMIN uses the site as it is - the frame round the page -, a learner reads the sign alone.
    await go(s, '/trainer');
    s.site.report('maintenance', true, { en: 'Back at noon.' });
    await settled(s);
    expect(standsAlone(s)).toEqual({ status: false, frame: FRAME, mains: 1 });
    session(s.auth, { ...PERSON, roles: ['MEMBER'] });
    await settled(s);
    await new Promise((done) => setTimeout(done, 50));
    await settled(s);
    expect(standsAlone(s)).toEqual({ status: true, frame: [], mains: 1 });
    expect(s.host.querySelector('anotoki-site-status [data-maintenance-message]')?.textContent?.trim()).toBe('Back at noon.');
  });

  it('draws nothing of its own round the admin panel - no bar, no note, no footer, no <main>: its frame has them - and makes its page once as the address crosses from one half to the other', async () => {
    const counted: Provider = {
      provide: ROUTES,
      multi: true,
      useValue: [
        { path: 'admin', component: CountedPageComponent },
        { path: '**', component: StubPageComponent },
      ],
    };
    CountedPageComponent.made = CountedPageComponent.gone = 0;
    const s = await drawn(
      (made) => {
        session(made.auth, { ...PERSON, roles: ['ADMIN'] });
        made.store.loaded.set(true);
        made.boot.status.set('ready');
      },
      [counted],
    );
    await go(s, '/stats');
    expect(standsAlone(s)).toEqual({ status: false, frame: FRAME, mains: 1 });
    expect(s.host.querySelector('#view-root #stub-page')).not.toBeNull();

    // Into the admin panel: the shell's frame goes, the panel's page stands with nothing round it - made once, though
    // the shell's <main> it was made in went (two outlets, one in each place, would make it again in the second).
    await go(s, '/admin');
    expect(s.host.querySelector('app-view-root #counted-page')).not.toBeNull();
    expect(standsAlone(s)).toEqual({ status: false, frame: [], mains: 0 });
    expect([CountedPageComponent.made, CountedPageComponent.gone]).toEqual([1, 0]);

    // And back: the frame round the learner's page again; the panel's page gone once.
    await go(s, '/stats');
    expect([CountedPageComponent.made, CountedPageComponent.gone]).toEqual([1, 1]);
    expect(standsAlone(s)).toEqual({ status: false, frame: FRAME, mains: 1 });
    expect(s.host.querySelector('#view-root #stub-page')).not.toBeNull();
  });

  it("the admin panel's address while the start cannot go on (the progress did not load): the card alone in the view's <main> - no bar, no footer", async () => {
    const s = await drawn(
      (made) => {
        session(made.auth, { ...PERSON, roles: ['ADMIN'] });
        made.boot.status.set('load-error');
      },
      [anyPage],
    );
    // (An ADMIN's Migrations page is drawn whatever the start says: any other page of the panel.)
    await go(s, '/admin/translations');
    expect(s.host.querySelector('#view-root app-load-error')).not.toBeNull();
    expect(s.host.querySelector('#stub-page')).toBeNull();
    expect(standsAlone(s)).toEqual({ status: false, frame: ['#view-root'], mains: 1 });
  });

  it("the theme switch: its three choices named in the app's words, the one in force checked and kept for the next first paint", async () => {
    const modes: AnotokiThemeMode[] = ['light', 'dark', 'auto'];
    for (const mode of modes) {
      const s = await drawn((made) => made.theme.set(mode));
      const choices = Array.from(s.host.querySelectorAll(BAR.theme));
      // Icons alone in the top bar: each named, with a tooltip - "as the device is set" in the kit's own words.
      expect(choices.map((choice) => [choice.getAttribute('aria-label'), choice.getAttribute('title'), choice.textContent?.trim(), choice.querySelector('anotoki-icon') ? 'icon' : ''])).toEqual([
        ['Theme: light', 'Theme: light', '', 'icon'],
        ['Theme: dark', 'Theme: dark', '', 'icon'],
        ['Theme: automatic', 'As your device is set', '', 'icon'],
      ]);
      expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual(modes.map((one) => String(one === mode)));
      // The theme on the screen, kept for the next page load's first paint (the kit's theme-boot.js) - none for "as the device is set".
      expect(localStorage.getItem('piano-academy:theme')).toBe(mode === 'auto' ? null : mode);
    }
  });

  it('draws every string the table keeps: nothing in kept-english.ts is a leftover', async () => {
    const texts = new Set<string>();
    for (const state of Object.values(STATES)) {
      for (const text of said((await drawn(state)).host)) texts.add(text);
    }
    // The bar's menus are drawn only while open, and the phone's bar only on a phone's screen.
    for (const [, state, look] of OPENED) {
      for (const text of said((await drawn(state, [], look)).host)) texts.add(text);
    }
    // The theme's three modes and the empty list of changes are states of their own.
    for (const mode of ['auto', 'light', 'dark'] as AnotokiThemeMode[]) {
      for (const text of said((await drawn((s) => s.theme.set(mode))).host)) texts.add(text);
    }
    const all = [...texts];

    /** The kept string as a pattern: a {placeholder} stands for whatever was put in. */
    const pattern = (value: string): RegExp => new RegExp(`^${value.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[A-Za-z]+\}/g, '.+')}$`);
    const notDrawn = Object.entries(KEPT_ENGLISH)
      // The tab's titles are written to document.title by the title strategy, not drawn here.
      .filter(([key]) => !key.startsWith('title.'))
      // A problem's sentence may be followed by ": " and the browser's own words.
      .filter(([, value]) => !all.some((text) => pattern(value).test(text) || pattern(`${value}:`).test(text)))
      .map(([key]) => key);
    expect(notDrawn).toEqual([]);
  });

  it('keeps no string that has a key’s shape itself - the check above would take it for a missing one', () => {
    expect(Object.values(KEPT_ENGLISH).filter((value) => KEY_SHAPE.test(value))).toEqual([]);
  });
});

describe('the shell with a bundle in memory', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a key that has no string as the key - the kept English is out of play (and the check above can see a key)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = await drawn(STATES['the progress could not be loaded'], [provideTestTranslations({ 'nav.learn': 'Learn' })]);

    const keys = keysIn(said(s.host));
    expect(keys).toContain('boot.loadError.title');
    expect(keys).toContain('brand.area');
    expect(keys).toContain('midi.notConnected');
    // The family's words are the library's keys (anotoki.*): never a key on the page - where the bundle has no string,
    // this app's own words for them (the theme switch's, kept-english.ts), else the kit's.
    expect(keys.filter((key) => key.startsWith('anotoki.'))).toEqual([]);
    expect(Array.from(s.host.querySelectorAll(BAR.theme)).map((choice) => choice.getAttribute('aria-label'))).toEqual(['Theme: light', 'Theme: dark', 'Theme: automatic']);
    expect(warn).toHaveBeenCalled();

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [provideTestTranslations({ 'nav.learn': 'Learn' })]);
    const shown = keysIn(said(running.host));
    expect(shown).toContain('nav.trainer');
    expect(shown).not.toContain('nav.learn');
    expect(running.host.querySelector(`${BAR.nav} a`)?.textContent?.trim()).toBe('Learn');
  });

  it("words the status page in the language the page is read in - English on an address of the admin panel - and always in the database's words, an owner's rewording too", async () => {
    const reworded = [
      provideTestTranslations({ 'anotoki.siteStatus.updatingTitle': 'Stránka sa práve vylepšuje' }, { language: 'sk', english: { 'anotoki.siteStatus.updatingTitle': 'The site is being improved' } }),
    ];
    const s = await drawn(STATES['an update waits, nobody signed in'], reworded);
    // A learner's address: Slovak, the owner's Slovak.
    expect([statusPage(s)?.title, statusPage(s)?.lang]).toEqual(['Stránka sa práve vylepšuje', 'sk']);
    // An address of the admin panel (the title strategy tells the words where the page is): English, as the whole
    // panel is - the owner's English, never the module's own Slovak words for a Slovak reader.
    TestBed.inject(TranslationService).noteAddress('/admin/migrations');
    await settledAll(s);
    expect([statusPage(s)?.title, statusPage(s)?.lang]).toEqual(['The site is being improved', 'en']);
    // Back on a learner's address: Slovak again.
    TestBed.inject(TranslationService).noteAddress('/stats');
    await settledAll(s);
    expect([statusPage(s)?.title, statusPage(s)?.lang]).toEqual(['Stránka sa práve vylepšuje', 'sk']);
  });

  it("marks what is not the app’s own as such where the page is not: the family's status page, the release notes", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const slovak = [provideTestTranslations({ 'whatsNew.added': 'Pridané' }, { language: 'sk' })];
    // The family's page in the page's language - and its administrator's part in English, marked so.
    expect(statusPage(await drawn(STATES['an update waits, nobody signed in'], slovak))?.lang).toBe('sk');
    expect(statusPage(await drawn(STATES["an update waits, the site's ADMIN signed in"], slovak))?.lang).toBe('en');

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], slovak, { open: 'whats-new' });
    const lists = Array.from(running.host.querySelectorAll('.release ul'));
    expect(lists.length).toBe(4);
    expect(lists.map((list) => list.getAttribute('lang'))).toEqual(['en', 'en', 'en', 'en']);
    // The frame around them is the page's: its headings carry no lang of their own, and the day is written the Slovak way.
    expect(running.host.querySelector('.release-section--added')?.textContent).toBe('Pridané');
    expect(running.host.querySelector('.release-section--added')?.hasAttribute('lang')).toBe(false);
    expect(running.host.querySelector('.release-date')?.textContent).toBe('28. septembra 2026');

    // On an English page the release notes need no mark: the page says English already.
    const english = [provideTestTranslations({})];
    const plain = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], english, { open: 'whats-new' });
    expect(Array.from(plain.host.querySelectorAll('.release ul')).map((list) => list.hasAttribute('lang'))).toEqual([false, false, false, false]);
  });
});

describe('the legal pages and the footer’s links (anotoki-lib 0.6.0)', () => {
  // The family's dialogs, menus and boxes ask jsdom for what it lacks (showModal(), checkVisibility(), popovers).
  beforeAll(() => provideTestKit());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('the footer has the family’s About · Support · Terms · Privacy · Contact under every page, in the library’s words - also while the app has no strings, and in the database’s words, an owner’s rewording too', async () => {
    const onTheWay = await drawn(STATES['nobody signed in, on the way to the IAM']);
    expect(footerLinks(onTheWay)).toEqual([
      ['About', '/about'],
      ['Support', '/support'],
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Contact', '/contact'],
    ]);
    expect(onTheWay.host.querySelector(`${FOOTER.footer} anotoki-legal-links nav`)?.getAttribute('aria-label')).toBe('Legal');
    // Under the footer's row, in the same <footer> landmark: the row first (Feedback alone while the list of changes is not there).
    const parts = Array.from(onTheWay.host.querySelector(FOOTER.footer)?.children ?? []);
    expect(parts.map((part) => part.tagName.toLowerCase())).toEqual(['div', 'anotoki-legal-links']);
    expect(parts[0].classList.contains('anotoki-site-footer__row')).toBe(true);
    expect(onTheWay.host.querySelectorAll('footer').length).toBe(1);

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there']);
    expect(footerLinks(running).map(([, href]) => href)).toEqual(['/about', '/support', '/terms', '/privacy', '/contact']);

    const slovak = [provideTestTranslations({ 'anotoki.legalLinks.privacy': 'Osobné údaje' }, { language: 'sk' })];
    const reworded = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], slovak);
    expect(footerLinks(reworded)).toEqual([
      ['O projekte', '/about'],
      ['Podporiť', '/support'],
      ['Podmienky', '/terms'],
      ['Osobné údaje', '/privacy'],
      ['Kontakt', '/contact'],
    ]);
  });

  it('a legal page is drawn whatever the start says - nobody signed in where a sign-in is required: the page, not the start’s "Loading…" - and the bar offers Sign in there, back to the page', async () => {
    const routes: Provider = {
      provide: ROUTES,
      multi: true,
      useValue: [
        { path: 'privacy', component: StubPageComponent },
        { path: '**', component: StubPageComponent },
      ],
    };
    const s = await drawn(STATES['nobody signed in, on the way to the IAM'], [routes], { at: '/privacy' });
    expect(s.host.querySelector('#view-root #stub-page')).not.toBeNull();
    expect(s.host.querySelector('.loading')).toBeNull();
    const signIn = vi.spyOn(s.boot, 'signIn').mockResolvedValue(undefined);
    expect(text(s, BAR.signIn)).toBe('Sign in');
    (s.host.querySelector(BAR.signIn) as HTMLButtonElement).click();
    expect(signIn).toHaveBeenCalledTimes(1);
    // The open page's link is marked in the footer.
    expect(s.host.querySelector('footer [data-legal-link="privacy"]')?.getAttribute('aria-current')).toBe('page');

    // About and Support (anotoki-lib 0.8.0) the same way: pages of the legal frame, anybody's.
    for (const page of ['about', 'support']) {
      await TestBed.inject(Router).navigateByUrl(`/${page}`);
      await settledAll(s);
      expect(s.host.querySelector('#view-root #stub-page'), page).not.toBeNull();
      expect(s.host.querySelector('.loading'), page).toBeNull();
      expect(text(s, BAR.signIn), page).toBe('Sign in');
      expect(s.host.querySelector(`footer [data-legal-link="${page}"]`)?.getAttribute('aria-current'), page).toBe('page');
    }

    // Anywhere else in the same state the start's card stands (the guard is on its way to the IAM) - no page, no Sign in.
    await TestBed.inject(Router).navigateByUrl('/stats');
    await settledAll(s);
    expect(s.host.querySelector('#stub-page')).toBeNull();
    expect(text(s, '.loading')).toBe('Loading…');
    expect(s.host.querySelector(BAR.signIn)).toBeNull();
  });

  it('while the site is not ready the family’s status page stands in a legal page’s place too, as in every page’s - alone, the footer and its links gone with the frame', async () => {
    const routes: Provider = { provide: ROUTES, multi: true, useValue: [{ path: 'terms', component: StubPageComponent }] };
    const s = await drawn(STATES['an update waits, nobody signed in'], [routes], { at: '/terms' });
    expect(s.host.querySelector('#stub-page')).toBeNull();
    expect(statusPage(s)?.title).toBe('The site is being updated');
    // A page of its own, with no header and no footer (the owner's rule of 2026-10-18): no links to the legal pages
    // meanwhile - they are pages of the site, which is not running.
    expect(footerLinks(s)).toEqual([]);
    expect(standsAlone(s)).toEqual({ status: true, frame: [], mains: 1 });
  });
});
