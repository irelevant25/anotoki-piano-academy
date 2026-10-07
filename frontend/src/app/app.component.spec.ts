import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, DestroyRef, Provider, WritableSignal, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ROUTES, Router, provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { AppComponent } from './app.component';
import { ApiService, VISITOR_OWNER } from './core/api/api.service';
import { type AnotokiUser } from './core/auth/anotoki-auth';
import { AuthService } from './core/auth/auth.service';
import { VisitorKey } from './core/auth/visitor-key';
import { ChangelogEntry, ChangelogService } from './core/changelog/changelog.service';
import { KEPT_ENGLISH } from './core/i18n/kept-english';
import { TranslationService } from './core/i18n/translation.service';
import { VISITOR_WORDS } from './core/i18n/visitor-words';
import { MidiService } from './core/midi/midi.service';
import { BootService } from './core/state/boot.service';
import { ProgressStore } from './core/state/progress-store.service';
import { provideSiteMigrations } from './core/state/site-migrations';
import { provideTestTranslations } from './core/testing/test-translations';
import { ThemeMode, ThemeService } from './core/theme/theme.service';

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
  auth: AuthService;
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

/** The shell, made with the providers given: the real translation service with no bundle unless they say otherwise. */
function shell(providers: Provider[] = []): Shell {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideSiteMigrations(), ...providers] });
  // As the app's initializer leaves it: the site asked, and ready.
  const site = TestBed.inject(SiteStatus);
  site.markReady();
  const fixture = TestBed.createComponent(AppComponent);
  return {
    fixture,
    host: fixture.nativeElement,
    boot: TestBed.inject(BootService),
    auth: TestBed.inject(AuthService),
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

/** The SDK holds a session for `user`, or none. */
function session(auth: AuthService, user: AnotokiUser | null): void {
  (auth as unknown as { authenticated: { set(value: boolean): void } }).authenticated.set(user !== null);
  auth.user.set(user);
}

/** Whether the IAM requires a sign-in, as /api/auth/config said (AuthService.loginRequired). */
function required(auth: AuthService, value: boolean): void {
  (auth as unknown as { _loginRequired: WritableSignal<boolean> })._loginRequired.set(value);
}

/** Practising without signing in (the IAM does not require it): the app runs on a visitor's progress. */
function visiting(s: Shell): void {
  session(s.auth, null);
  required(s.auth, false);
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
  'an update waits, the site\'s ADMIN signed in': (s) => {
    session(s.auth, { ...PERSON, roles: ['MEMBER', 'ADMIN'] });
    s.site.report('update_pending');
    s.boot.status.set('waiting');
  },
  'an update came in the middle of a visitor\'s practising, a save refused meanwhile': (s) => {
    visiting(s);
    s.api.visitorRefusal.set(VISITOR_WORDS.busy);
    s.site.report('update_pending');
  },
  'the progress could not be loaded': (s) => s.boot.status.set('load-error'),
  'nobody signed in, on the way to the IAM (no card)': (s) => {
    session(s.auth, null);
    s.boot.status.set('sign-in');
  },
  'the sign-in card after a sign-in the IAM turned away': (s) => {
    session(s.auth, null);
    s.auth.signInFailure.set({ code: 'access_denied', message: 'This account cannot use Piano Academy' });
    s.boot.status.set('sign-in');
  },
  'the sign-in card after a sign-in that failed': (s) => {
    session(s.auth, null);
    s.auth.signInFailure.set({ code: 'state_mismatch', message: 'That sign-in did not start here' });
    s.boot.status.set('sign-in');
  },
  'the sign-in card after a sign-in that could not start': (s) => {
    session(s.auth, null);
    s.auth.signInFailure.set({ code: 'storage_unavailable', message: 'This browser will not let the site remember the sign-in in progress' });
    s.boot.status.set('sign-in');
  },
  'running, signed in, a piano connected, the list of changes there': (s) => {
    session(s.auth, PERSON);
    vi.spyOn(s.auth, 'accountUrl').mockReturnValue('http://localhost:4300/account');
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.midi.connectedName.set('KAWAI ES120');
    s.changelog.entries.set(RELEASES);
    s.theme.mode.set('light');
  },
  'running, signed in, a theme the anotoki account would not take': (s) => {
    session(s.auth, PERSON);
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.theme.notSaved.set(true);
  },
  'running, signed in with a token that names nobody, a save that did not get through, no MIDI device': (s) => {
    session(s.auth, { ...PERSON, preferred_username: null });
    s.store.loaded.set(true);
    s.store.progressFailed.set(true);
    s.boot.status.set('ready');
    s.midi.asked.set(true);
    s.theme.mode.set('dark');
  },
  'running, signed out in the middle of practising': (s) => {
    session(s.auth, null);
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.theme.mode.set('auto');
  },
  'running, signed out in the middle of practising, and a sign-in that could not start': (s) => {
    session(s.auth, null);
    s.auth.signInFailure.set({ code: 'storage_unavailable', message: 'This browser will not let the site remember the sign-in in progress' });
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
    required(s.auth, true);
  },
  'running as a visitor, after a sign-in the IAM turned away': (s) => {
    visiting(s);
    s.auth.signInFailure.set({ code: 'access_denied', message: 'This account cannot use Piano Academy' });
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

/** How the top bar is looked at: on a phone's screen (the menu button), and with a menu opened. */
interface Look {
  phone?: boolean;
  open?: 'account' | 'phone';
}

/** The screen as wide as a phone, or not: what the top bar asks matchMedia (jsdom has none). */
function screen(phone: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: phone && media.includes('max-width'), media, addEventListener: () => undefined, removeEventListener: () => undefined }));
}

async function drawn(state: (s: Shell) => void, providers: Provider[] = [], look: Look = {}): Promise<Shell> {
  screen(look.phone ?? false);
  const s = shell(providers);
  state(s);
  await s.fixture.whenStable();
  if (look.open) {
    (s.host.querySelector(look.open === 'account' ? '#topbar-user-button' : '#topbar-menu-button') as HTMLButtonElement).click();
    await s.fixture.whenStable();
  }
  return s;
}

/** The states the bar's menus are looked at in, opened: the person's menu and the phone's, with each role. */
const OPENED: [string, (s: Shell) => void, Look][] = [
  ['the person\'s menu of an ADMIN, a save waiting', (s) => {
    session(s.auth, { ...PERSON, roles: ['ADMIN'] });
    vi.spyOn(s.auth, 'accountUrl').mockReturnValue('http://localhost:4300/account');
    s.store.loaded.set(true);
    s.store.progressFailed.set(true);
    s.boot.status.set('ready');
  }, { open: 'account' }],
  ['the person\'s menu of an EDITOR', (s) => {
    session(s.auth, { ...PERSON, roles: ['EDITOR'] });
    vi.spyOn(s.auth, 'accountUrl').mockReturnValue('http://localhost:4300/account');
    s.store.loaded.set(true);
    s.boot.status.set('ready');
  }, { open: 'account' }],
  ['the phone\'s menu of a learner, a save waiting', (s) => {
    session(s.auth, PERSON);
    s.store.loaded.set(true);
    s.store.progressFailed.set(true);
    s.boot.status.set('ready');
  }, { phone: true, open: 'phone' }],
  ['the phone\'s menu, signed out in the middle of practising', (s) => {
    session(s.auth, null);
    s.store.loaded.set(true);
    s.boot.status.set('ready');
  }, { phone: true, open: 'phone' }],
];

describe('the shell with no bundle', () => {
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
      expect(texts.length).toBeGreaterThan(5);
      expect(keysIn(texts)).toEqual([]);
      // A missing string is a warning as well as a key on the page: none of either.
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it('says itself in the English kept in code: the cards, the top bar and the footer', async () => {
    const notSetUp = await drawn(STATES['not set up, never installed: the setup page offered']);
    // The family's page in the view's place, in its own words (and marked as such).
    expect(statusPage(notSetUp)).toEqual({
      title: 'This site is not set up yet',
      text: 'Its setup page connects it to its database and to the anotoki sign-in.',
      lang: 'en',
      actions: ['Open the setup page', 'Try again'],
      links: ['/setup.php'],
    });
    // Before the app runs there is nothing to practise on: the bar has no sections yet.
    expect(notSetUp.host.querySelector('#topbar-nav')).toBeNull();
    expect(notSetUp.host.querySelector('.brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy: Learn');
    expect(notSetUp.host.querySelector('.brand .area')?.textContent).toBe('Piano Academy');
    expect(notSetUp.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Piano not connected');
    expect(notSetUp.host.querySelector('#midi-label')?.textContent?.trim()).toBe('No piano');
    expect(notSetUp.host.querySelector('#midi-button')?.getAttribute('aria-label')).toBe('No piano: Piano not connected');
    expect(notSetUp.host.querySelector('#midi-box-title')?.textContent).toBe('Your piano');
    expect(notSetUp.host.querySelector('#theme-toggle')?.getAttribute('aria-label')).toBe('Theme: automatic (press to change)');
    // No language to choose from while there are no strings: the chooser is not there.
    expect(notSetUp.host.querySelector('app-language-switcher button')).toBeNull();

    const loading = await drawn(STATES['loading, before anything is known']);
    expect(loading.host.querySelector('.loading')?.textContent).toBe('Loading…');

    const loadError = await drawn(STATES['the progress could not be loaded']);
    expect(loadError.host.querySelector('#load-error h2')?.textContent).toBe('Could not load your progress');
    expect(loadError.host.querySelector('#boot-retry')?.textContent).toBe('Try again');

    const onTheWay = await drawn(STATES['nobody signed in, on the way to the IAM (no card)']);
    expect(onTheWay.host.querySelector('.sign-in-card')).toBeNull();
    expect(onTheWay.host.querySelector('.loading')?.textContent).toBe('Loading…');

    const storage = await drawn(STATES['the sign-in card after a sign-in that could not start']);
    expect(storage.host.querySelector('.sign-in-card [role="alert"]')?.textContent).toBe('This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.');

    const signIn = await drawn(STATES['the sign-in card after a sign-in that failed']);
    expect(signIn.host.querySelector('.sign-in-card h2')?.textContent).toBe('Sign in');
    expect(signIn.host.querySelector('#sign-in-start')?.textContent).toBe('Sign in');
    expect(signIn.host.querySelector('.sign-in-card [role="alert"]')?.textContent).toBe('Signing in did not work. Please try again. (state_mismatch)');

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there']);
    expect(Array.from(running.host.querySelectorAll('#topbar-nav a')).map((link) => link.textContent?.trim())).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    expect(running.host.querySelector('#topbar-nav')?.getAttribute('aria-label')).toBe('Main');
    expect(running.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Connected: KAWAI ES120');
    expect(running.host.querySelector('#midi-label')?.textContent?.trim()).toBe('KAWAI ES120');
    expect(running.host.querySelector('#account-name')?.textContent).toBe('mia');
    expect(running.host.querySelector('#topbar-user-button')?.getAttribute('aria-label')).toBe('Your menu: mia');
    const menu = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], { open: 'account' });
    expect(menu.host.querySelector('#user-menu')?.getAttribute('aria-label')).toBe('Your menu');
    expect(menu.host.querySelector('#account-link')?.textContent?.trim()).toBe('Your anotoki account');
    expect(menu.host.querySelector('#sign-out-btn')?.textContent?.trim()).toBe('Sign out');
    expect(running.host.querySelector('#app-version')?.textContent).toBe('Piano Academy v0.4.0');
    expect(running.host.querySelector('#app-version')?.getAttribute('title')).toBe('What\'s new');
    expect(running.host.querySelector('#changelog-title')?.textContent).toBe('What\'s new');
    expect(running.host.querySelector('.release-date')?.textContent).toBe('28 September 2026');
    // The sign-out question, drawn in its closed dialog: in the kept English too.
    expect(running.host.querySelector('#sign-out-confirm-title')?.textContent).toBe('Sign out without your latest progress?');
    expect(running.host.querySelector('#sign-out-confirm-text')?.textContent).toBe('Some of your progress could not be saved yet. If you sign out now, it is lost.');
    expect(running.host.querySelector('#progress-changed')).toBeNull();

    const changed = await drawn(STATES['running, the progress replaced or deleted somewhere else and loaded again']);
    expect(changed.host.querySelector('#progress-changed span')?.textContent).toBe('Your progress was replaced or deleted somewhere else - by a file brought back in another tab, or by an administrator. This page now shows what is saved.');
    expect(changed.host.querySelector('#progress-changed-close')?.textContent).toBe('Close');

    const signedOut = await drawn(STATES['running, signed out in the middle of practising']);
    expect(signedOut.host.querySelector('#signed-out-banner span')?.textContent).toBe('You are signed out, so your progress is not saved.');
    expect(signedOut.host.querySelector('#signed-out-sign-in')?.textContent).toBe('Sign in');
    expect(signedOut.host.querySelector('#account-name')).toBeNull();
    expect(signedOut.host.querySelector('#sign-in-btn')?.textContent?.trim()).toBe('Sign in');
    expect(signedOut.host.querySelector('#signed-out-why')).toBeNull();

    // The banner's (or the bar's) Sign in could not even start: the banner says why, as the sign-in card would - the page stays.
    const cannotStart = await drawn(STATES['running, signed out in the middle of practising, and a sign-in that could not start']);
    expect(cannotStart.host.querySelector('#signed-out-why')?.textContent).toBe('This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.');
    expect(cannotStart.host.querySelector('#signed-out-sign-in')?.textContent).toBe('Sign in');
    expect(cannotStart.host.querySelector('app-sign-in-card')).toBeNull();

    // A phone: "Piano" beside the mark, the menu button - and in its menu the sections, then the person's items.
    const phone = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], { phone: true, open: 'phone' });
    expect(phone.host.querySelector('.brand .area')?.textContent).toBe('Piano');
    expect(phone.host.querySelector('#topbar-menu-button')?.getAttribute('aria-label')).toBe('Menu');
    expect(phone.host.querySelector('#topbar-nav')).toBeNull();
    expect(Array.from(phone.host.querySelectorAll('#topbar-menu [role="menuitem"]')).map((item) => item.textContent?.trim())).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats', 'Your anotoki account', 'Sign out']);
  });

  it('says a visitor’s notes in the English kept in code - the notice on Learn and Stats only, never the signed-out banner', async () => {
    const routes: Provider = { provide: ROUTES, multi: true, useValue: [{ path: '**', component: StubPageComponent }] };
    const go = async (s: Shell, url: string): Promise<void> => {
      await TestBed.inject(Router).navigateByUrl(url);
      await s.fixture.whenStable();
    };

    const learn = await drawn(STATES['running as a visitor, on Learn: how long this browser keeps the progress'], [routes]);
    const signIn = vi.spyOn(learn.boot, 'signIn').mockResolvedValue(undefined);
    expect(text(learn, '#visitor-notice span')).toBe('You are practising without signing in. Your progress is kept for this browser for 30 days after your last visit. Sign in to keep it in your account.');
    (learn.host.querySelector('#visitor-notice-sign-in') as HTMLButtonElement).click();
    expect(signIn).toHaveBeenCalledTimes(1);
    // Nobody's sign-in ended: no signed-out banner. The bar offers Sign in.
    expect(learn.host.querySelector('#signed-out-banner')).toBeNull();
    expect(text(learn, '#sign-in-btn')).toBe('Sign in');
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

    // A sign-in the IAM turned away (MEMBER taken away, say): said in the sign-in card's words, never swallowed - and closable.
    const denied = await drawn(STATES['running as a visitor, after a sign-in the IAM turned away']);
    expect(text(denied, '#visitor-sign-in-why span')).toBe('Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.');
    expect(denied.host.querySelector('#visitor-sign-in-why')?.getAttribute('role')).toBe('alert');
    expect(denied.host.querySelector('#signed-out-banner')).toBeNull();
    expect(denied.host.querySelector('app-sign-in-card')).toBeNull();
    expect(denied.host.querySelector('#visitor-notice')).not.toBeNull();
    (denied.host.querySelector('#visitor-sign-in-why-close') as HTMLButtonElement).click();
    await denied.fixture.whenStable();
    expect(denied.host.querySelector('#visitor-sign-in-why')).toBeNull();
    // Another failure is said again.
    denied.auth.signInFailure.set({ code: 'storage_unavailable', message: '' });
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
    expect(text(notMoved, '#visitor-not-moved span')).toBe('Your progress from practising without signing in could not be moved into your account yet. Nothing is lost: it is tried again on your next visit.');
    expect(text(notMoved, '#visitor-not-moved-close')).toBe('Close');
    (notMoved.host.querySelector('#visitor-not-moved-close') as HTMLButtonElement).click();
    await notMoved.fixture.whenStable();
    expect(notMoved.host.querySelector('#visitor-not-moved')).toBeNull();
  });

  it('words what stands in for a name, and a problem with the piano, itself - the services hold no sentence', async () => {
    const nameless = await drawn(STATES['running, signed in with a token that names nobody, a save that did not get through, no MIDI device']);
    expect(nameless.auth.displayName()).toBeNull();
    expect(nameless.host.querySelector('#account-name')?.textContent).toBe('Signed in');
    expect(nameless.host.querySelector('#save-status')?.textContent).toBe('Not saved yet');
    expect(nameless.host.querySelector('#save-status')?.getAttribute('title')).toBe('Some of your progress is not on the server yet. The app keeps trying.');
    // On a phone: a dot on the menu button, and the sentence as the menu's first line.
    const phone = await drawn(STATES['running, signed in with a token that names nobody, a save that did not get through, no MIDI device'], [], { phone: true, open: 'phone' });
    expect(phone.host.querySelector('#save-status')).toBeNull();
    expect(phone.host.querySelector('#topbar-unsaved-dot')).not.toBeNull();
    expect(phone.host.querySelector('#topbar-menu-button')?.getAttribute('aria-describedby')).toBe('topbar-unsaved');
    expect(phone.host.querySelector('#topbar-unsaved')?.textContent).toBe('Not saved yet');
    expect(phone.host.querySelector('#topbar-menu-unsaved strong')?.textContent).toBe('Not saved yet');
    expect(phone.host.querySelector('#topbar-menu-unsaved span')?.textContent).toBe('Some of your progress is not on the server yet. The app keeps trying.');
    expect(nameless.host.querySelector('#midi-device-select option')?.textContent).toBe('No MIDI devices found');

    const unsupported = await drawn(STATES['running, an editor, in a browser with no Web MIDI']);
    expect(unsupported.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Web MIDI not supported — use Chrome or Edge');

    const refused = await drawn(STATES['the browser refused MIDI, in its own words']);
    const status = refused.host.querySelector('#midi-status')!;
    expect(status.textContent?.trim()).toBe('The browser did not allow MIDI: Permission to use Web MIDI API was not granted.');
    // The browser's own words are English whatever the page is in, and say so.
    expect(status.querySelector('span[lang="en"]')?.textContent).toBe('Permission to use Web MIDI API was not granted.');

    const failed = await drawn(STATES['the piano could not be connected']);
    expect(failed.host.querySelector('#midi-status')?.textContent?.trim()).toBe('The piano could not be connected');
    expect(failed.host.querySelector('#midi-status span')).toBeNull();
  });

  it('shows the staff the way to the admin panel in the person\'s menu - an EDITOR and an ADMIN, with their role, and nobody else', async () => {
    const open = { open: 'account' } as const;
    const editor = await drawn(STATES['running, an editor, in a browser with no Web MIDI'], [], open);
    expect(editor.host.querySelector('#admin-link')?.textContent?.trim()).toBe('Admin panel');
    expect(editor.host.querySelector('#admin-link')?.getAttribute('href')).toBe('/admin');
    expect(editor.host.querySelector('#topbar-role')?.textContent).toBe('Editor');

    const learner = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [], open);
    expect(learner.host.querySelector('#admin-link')).toBeNull();
    expect(learner.host.querySelector('#topbar-role')).toBeNull();

    const admin = await drawn((s) => {
      STATES['running, signed in, a piano connected, the list of changes there'](s);
      s.auth.user.set({ ...PERSON, roles: ['ADMIN'] });
    }, [], open);
    expect(admin.host.querySelector('#admin-link')?.textContent?.trim()).toBe('Admin panel');
    expect(admin.host.querySelector('#topbar-role')?.textContent).toBe('Administrator');

    const member = await drawn((s) => {
      STATES['running, signed in, a piano connected, the list of changes there'](s);
      s.auth.user.set({ ...PERSON, roles: ['MEMBER'] });
    }, [], open);
    expect(member.host.querySelector('#admin-link')).toBeNull();
  });

  /** The stub page under every address - and the Migrations page's - for the gate's cases. */
  const anyPage: Provider = { provide: ROUTES, multi: true, useValue: [{ path: 'admin/migrations', component: StubPageComponent }, { path: '**', component: StubPageComponent }] };

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
    // Nothing else in the view: no error, no code, no way to the setup page or the Migrations page.
    const view = (s: Shell): string => s.host.querySelector('#view-root')?.textContent?.trim() ?? '';
    expect(view(nobody)).toBe(['The site is being updated', 'It will be back in a few minutes. This page reloads by itself.', 'Sign in'].join(''));
    expect(nobody.host.querySelector('[role="alert"], a[href="/setup.php"], a[href="/admin/migrations"], #stub-page')).toBeNull();
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
    const visitor = await drawn(STATES['an update came in the middle of a visitor\'s practising, a save refused meanwhile'], [anyPage]);
    expect(statusPage(visitor)?.title).toBe('The site is being updated');
    for (const id of ['visitor-refused', 'visitor-notice', 'signed-out-banner', 'stub-page']) {
      expect(visitor.host.querySelector('#' + id), id).toBeNull();
    }
    // The bar offers no section to go to meanwhile.
    expect(visitor.host.querySelector('#topbar-nav')).toBeNull();
  });

  it('while an update waits the site\'s ADMIN reads that a database update is waiting, in English, and reaches the Migrations page - nothing else of the app', async () => {
    const admin = await drawn(STATES['an update waits, the site\'s ADMIN signed in'], [anyPage]);
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
      const login = vi.fn(async (_options: { returnTo: string; uiLocales?: string }) => undefined);
      (signedOut.auth as unknown as { client: unknown }).client = { login };
      (signedOut.host.querySelector('anotoki-site-status button') as HTMLButtonElement).click();
      await settled(signedOut);
      expect(login).toHaveBeenCalledTimes(1);
      expect(login).toHaveBeenCalledWith({ returnTo: '/admin/migrations' });

      // Back from the IAM (its callback puts the address back before the router reads it): the ADMIN is on the Migrations page.
      const back = await drawn(STATES['an update waits, the site\'s ADMIN signed in'], [anyPage]);
      await go(back, '/admin/migrations');
      expect(back.host.querySelector('#stub-page')).not.toBeNull();
      expect(statusPage(back)).toBeNull();
    } finally {
      history.replaceState(null, '', '/');
    }
  });

  it('the Migrations page stays on the screen as the app starts after its Apply - and is nobody else\'s way in', async () => {
    const admin = await drawn(STATES['an update waits, the site\'s ADMIN signed in'], [anyPage]);
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
    const editor = await drawn((s) => {
      STATES['an update waits, a learner signed in'](s);
      s.auth.user.set({ ...PERSON, roles: ['MEMBER', 'EDITOR'] });
    }, [anyPage]);
    await go(editor, '/admin/migrations');
    expect(editor.host.querySelector('#stub-page')).toBeNull();
    expect(statusPage(editor)?.title).toBe('The site is being updated');

    // Not set up at all: nothing to apply - no Migrations page for an ADMIN either.
    const notSetUp = await drawn((s) => {
      STATES['not set up once installed: only "not available right now"'](s);
      session(s.auth, { ...PERSON, roles: ['ADMIN'] });
    }, [anyPage]);
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
    // The site is back - the status page's own check, which loads the site afresh next: the gate opens, but the start
    // still waits, so the moment until then is a card of the start, not a page on progress that was never loaded.
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

  it('the theme button says each mode, and that pressing changes it', async () => {
    const modes: ThemeMode[] = ['auto', 'light', 'dark'];
    const seen: string[][] = [];
    for (const mode of modes) {
      const s = await drawn((made) => made.theme.mode.set(mode));
      const button = s.host.querySelector('#theme-toggle')!;
      seen.push([button.textContent?.replace(/\s+/g, ' ').trim() ?? '', button.getAttribute('title') ?? '', button.getAttribute('aria-label') ?? '', button.querySelector('app-icon')?.innerHTML.length ? 'icon' : '']);
    }
    // Round and icon-only in the top bar: the mode is its title, and its name says pressing changes it.
    expect(seen).toEqual([
      ['', 'Theme: automatic', 'Theme: automatic (press to change)', 'icon'],
      ['', 'Theme: light', 'Theme: light (press to change)', 'icon'],
      ['', 'Theme: dark', 'Theme: dark (press to change)', 'icon'],
    ]);
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
    for (const mode of ['auto', 'light', 'dark'] as ThemeMode[]) {
      for (const text of said((await drawn((s) => s.theme.mode.set(mode))).host)) texts.add(text);
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
    expect(keys).toContain('theme.autoSpoken');
    expect(warn).toHaveBeenCalled();

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], [provideTestTranslations({ 'nav.learn': 'Learn' })]);
    const shown = keysIn(said(running.host));
    expect(shown).toContain('nav.trainer');
    expect(shown).not.toContain('nav.learn');
    expect(running.host.querySelector('#topbar-nav a')?.textContent?.trim()).toBe('Learn');
  });

  it('marks what is not the app’s own as such where the page is not: the family\'s status page, the release notes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const slovak = [provideTestTranslations({ 'whatsNew.added': 'Pridané' }, { language: 'sk' })];
    // The family's page in the page's language - and its administrator's part in English, marked so.
    expect(statusPage(await drawn(STATES['an update waits, nobody signed in'], slovak))?.lang).toBe('sk');
    expect(statusPage(await drawn(STATES['an update waits, the site\'s ADMIN signed in'], slovak))?.lang).toBe('en');

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], slovak);
    const lists = Array.from(running.host.querySelectorAll('.release ul'));
    expect(lists.length).toBe(4);
    expect(lists.map((list) => list.getAttribute('lang'))).toEqual(['en', 'en', 'en', 'en']);
    // The frame around them is the page's: its headings carry no lang of their own, and the day is written the Slovak way.
    expect(running.host.querySelector('.section-title.added')?.textContent).toBe('Pridané');
    expect(running.host.querySelector('.section-title.added')?.hasAttribute('lang')).toBe(false);
    expect(running.host.querySelector('.release-date')?.textContent).toBe('28. septembra 2026');

    // On an English page the release notes need no mark: the page says English already.
    const english = [provideTestTranslations({})];
    const plain = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], english);
    expect(Array.from(plain.host.querySelectorAll('.release ul')).map((list) => list.hasAttribute('lang'))).toEqual([false, false, false, false]);
  });
});
