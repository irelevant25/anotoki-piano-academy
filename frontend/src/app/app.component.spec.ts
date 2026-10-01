import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { type AnotokiUser } from './core/auth/anotoki-auth';
import { AuthService } from './core/auth/auth.service';
import { ChangelogEntry, ChangelogService } from './core/changelog/changelog.service';
import { KEPT_ENGLISH } from './core/i18n/kept-english';
import { TranslationService } from './core/i18n/translation.service';
import { MidiService } from './core/midi/midi.service';
import { BootService } from './core/state/boot.service';
import { ProgressStore } from './core/state/progress-store.service';
import { provideTestTranslations } from './core/testing/test-translations';
import { ThemeMode, ThemeService } from './core/theme/theme.service';

/**
 * A key as it would stand on a page: a namespace, then segments that begin
 * with a letter, joined by dots - "nav.learn", "boot.notSetUp.title". (A
 * version, "v0.4.0", is not one: its segments are numbers.)
 */
const KEY_SHAPE = /(?<![A-Za-z0-9._-])[a-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+(?![A-Za-z0-9_-])/;

/** The attributes whose value is read by a person (or to one). */
const WORDED_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder'];

const RELEASES: ChangelogEntry[] = [
  { version: '0.4.0', date: '2026-09-28', changes: { added: ['Songs you can play along with'], updated: ['The metronome is louder'], fixed: ['A note could be counted twice'] } },
  { version: '0.3.0', date: '2026-09-01', changes: { added: ['The learning path'] } },
];

const PERSON: AnotokiUser = { sub: '7', preferred_username: 'mia', email: null, email_verified: true, locale: null, roles: [] };

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
}

/** The shell, made with the providers given: the real translation service with no bundle unless they say otherwise. */
function shell(providers: Provider[] = []): Shell {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ...providers] });
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
  };
}

/** The SDK holds a session for `user`, or none. */
function session(auth: AuthService, user: AnotokiUser | null): void {
  auth.mode.set('iam');
  (auth as unknown as { authenticated: { set(value: boolean): void } }).authenticated.set(user !== null);
  auth.user.set(user);
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

/** Every state the shell can be drawn in, by name: each sets the services and leaves the drawing to the caller. */
const STATES: Record<string, (s: Shell) => void> = {
  'loading, before anything is known': () => undefined,
  'not set up, with what the server says is missing': (s) => {
    s.boot.notSetUpDetail.set('config/database.local.php is missing.');
    s.boot.status.set('not-set-up');
  },
  'the progress could not be loaded': (s) => s.boot.status.set('load-error'),
  'the sign-in card': (s) => {
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
  'running, signed in, a piano connected, the list of changes there': (s) => {
    session(s.auth, PERSON);
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.midi.connectedName.set('KAWAI ES120');
    s.changelog.entries.set(RELEASES);
    s.theme.mode.set('light');
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
  'running on the owner’s own computer, in a browser with no Web MIDI': (s) => {
    s.auth.mode.set('none');
    s.store.loaded.set(true);
    s.boot.status.set('ready');
    s.midi.problem.set({ kind: 'unsupported', detail: null });
  },
  'the browser refused MIDI': (s) => s.midi.problem.set({ kind: 'refused', detail: null }),
  'the browser refused MIDI, in its own words': (s) => s.midi.problem.set({ kind: 'refused', detail: 'Permission to use Web MIDI API was not granted.' }),
  'the piano could not be connected': (s) => s.midi.problem.set({ kind: 'failed', detail: null }),
  'the piano could not be connected, with the reason': (s) => s.midi.problem.set({ kind: 'failed', detail: 'MIDI input input-1 not found.' }),
};

async function drawn(state: (s: Shell) => void, providers: Provider[] = []): Promise<Shell> {
  const s = shell(providers);
  state(s);
  await s.fixture.whenStable();
  return s;
}

describe('the shell with no bundle', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  for (const [name, state] of Object.entries(STATES)) {
    it(`renders no text of a key's shape, and asks for no string it has not got: ${name}`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const s = await drawn(state);

      expect(TestBed.inject(TranslationService).ready()).toBe(false);
      const texts = said(s.host);
      expect(texts.length).toBeGreaterThan(5);
      expect(keysIn(texts)).toEqual([]);
      // A missing string is a warning as well as a key on the page: none of either.
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it('says itself in the English kept in code: the cards, the navigation, the header and the footer', async () => {
    const notSetUp = await drawn(STATES['not set up, with what the server says is missing']);
    expect(notSetUp.host.querySelector('#not-set-up h2')?.textContent).toBe('Piano Academy is not set up yet');
    expect(notSetUp.host.querySelector('#not-set-up a')?.textContent).toBe('Open the setup page');
    expect(Array.from(notSetUp.host.querySelectorAll('#app-nav .nav-btn')).map((button) => button.textContent?.trim())).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    expect(notSetUp.host.querySelector('#app-nav')?.getAttribute('aria-label')).toBe('Main');
    expect(notSetUp.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Piano not connected');
    expect(notSetUp.host.querySelector('#theme-toggle')?.getAttribute('aria-label')).toBe('Theme: automatic (press to change)');
    // No language to choose from while there are no strings: the chooser is not there.
    expect(notSetUp.host.querySelector('app-language-switcher button')).toBeNull();

    const loading = await drawn(STATES['loading, before anything is known']);
    expect(loading.host.querySelector('.loading')?.textContent).toBe('Loading…');

    const loadError = await drawn(STATES['the progress could not be loaded']);
    expect(loadError.host.querySelector('#load-error h2')?.textContent).toBe('Could not load your progress');
    expect(loadError.host.querySelector('#boot-retry')?.textContent).toBe('Try again');

    const signIn = await drawn(STATES['the sign-in card after a sign-in that failed']);
    expect(signIn.host.querySelector('.sign-in-card h2')?.textContent).toBe('Sign in');
    expect(signIn.host.querySelector('#sign-in-start')?.textContent).toBe('Sign in');
    expect(signIn.host.querySelector('.sign-in-card [role="alert"]')?.textContent).toBe('Signing in did not work. Please try again. (state_mismatch)');

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there']);
    expect(running.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Connected: KAWAI ES120');
    expect(running.host.querySelector('#account-name')?.textContent).toBe('mia');
    expect(running.host.querySelector('#sign-out-btn')?.textContent).toBe('Sign out');
    expect(running.host.querySelector('#app-version')?.textContent).toBe('Piano Academy v0.4.0');
    expect(running.host.querySelector('#app-version')?.getAttribute('title')).toBe('What\'s new');
    expect(running.host.querySelector('#changelog-title')?.textContent).toBe('What\'s new');
    expect(running.host.querySelector('.release-date')?.textContent).toBe('28 September 2026');

    const signedOut = await drawn(STATES['running, signed out in the middle of practising']);
    expect(signedOut.host.querySelector('#signed-out-banner span')?.textContent).toBe('You are signed out, so your progress is not saved.');
    expect(signedOut.host.querySelector('#signed-out-sign-in')?.textContent).toBe('Sign in');
    expect(signedOut.host.querySelector('#account-name')?.textContent).toBe('Signed out');
    expect(signedOut.host.querySelector('#sign-in-btn')?.textContent).toBe('Sign in');
  });

  it('words what stands in for a name, and a problem with the piano, itself - the services hold no sentence', async () => {
    const nameless = await drawn(STATES['running, signed in with a token that names nobody, a save that did not get through, no MIDI device']);
    expect(nameless.auth.displayName()).toBeNull();
    expect(nameless.host.querySelector('#account-name')?.textContent).toBe('Signed in');
    expect(nameless.host.querySelector('#save-status')?.textContent).toBe('Not saved yet');
    expect(nameless.host.querySelector('#save-status')?.getAttribute('title')).toBe('Some of your progress is not on the server yet. The app keeps trying.');
    expect(nameless.host.querySelector('#midi-device-select option')?.textContent).toBe('No MIDI devices found');

    const unsupported = await drawn(STATES['running on the owner’s own computer, in a browser with no Web MIDI']);
    expect(unsupported.host.querySelector('#midi-status')?.textContent?.trim()).toBe('Web MIDI not supported — use Chrome or Edge');
    // Without sign-in there is no account panel at all.
    expect(unsupported.host.querySelector('#account-panel')).toBeNull();

    const refused = await drawn(STATES['the browser refused MIDI, in its own words']);
    const status = refused.host.querySelector('#midi-status')!;
    expect(status.textContent?.trim()).toBe('The browser did not allow MIDI: Permission to use Web MIDI API was not granted.');
    // The browser's own words are English whatever the page is in, and say so.
    expect(status.querySelector('span[lang="en"]')?.textContent).toBe('Permission to use Web MIDI API was not granted.');

    const failed = await drawn(STATES['the piano could not be connected']);
    expect(failed.host.querySelector('#midi-status')?.textContent?.trim()).toBe('The piano could not be connected');
    expect(failed.host.querySelector('#midi-status span')).toBeNull();
  });

  it('shows the owner the way to the app’s words once the app runs - and nobody else', async () => {
    const owner = await drawn(STATES['running on the owner’s own computer, in a browser with no Web MIDI']);
    expect(owner.host.querySelector('#owner-link')?.textContent).toBe('Translations');

    const learner = await drawn(STATES['running, signed in, a piano connected, the list of changes there']);
    expect(learner.host.querySelector('#owner-link')).toBeNull();

    const admin = await drawn((s) => {
      STATES['running, signed in, a piano connected, the list of changes there'](s);
      s.auth.user.set({ ...PERSON, roles: ['ADMIN'] });
    });
    expect(admin.host.querySelector('#owner-link')?.textContent).toBe('Translations');

    // Before the app runs there is nothing to go to: the link waits for the progress, as the navigation does.
    const early = await drawn((s) => {
      s.auth.mode.set('none');
      s.boot.status.set('load-error');
    });
    expect(early.host.querySelector('#owner-link')).toBeNull();
  });

  it('the theme button says each mode, and that pressing changes it', async () => {
    const modes: ThemeMode[] = ['auto', 'light', 'dark'];
    const seen: string[][] = [];
    for (const mode of modes) {
      const s = await drawn((made) => made.theme.mode.set(mode));
      const button = s.host.querySelector('#theme-toggle')!;
      seen.push([button.textContent?.replace(/\s+/g, ' ').trim() ?? '', button.getAttribute('title') ?? '', button.getAttribute('aria-label') ?? '']);
    }
    expect(seen).toEqual([
      ['◐ Theme: automatic', 'Theme: automatic', 'Theme: automatic (press to change)'],
      ['☀ Theme: light', 'Theme: light', 'Theme: light (press to change)'],
      ['☾ Theme: dark', 'Theme: dark', 'Theme: dark (press to change)'],
    ]);
  });

  it('draws every string the table keeps: nothing in kept-english.ts is a leftover', async () => {
    const texts = new Set<string>();
    for (const state of Object.values(STATES)) {
      for (const text of said((await drawn(state)).host)) texts.add(text);
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
    const s = await drawn(STATES['not set up, with what the server says is missing'], [provideTestTranslations({ 'nav.learn': 'Learn' })]);

    const keys = keysIn(said(s.host));
    expect(keys).toContain('boot.notSetUp.title');
    expect(keys).toContain('nav.trainer');
    expect(keys).toContain('midi.notConnected');
    expect(keys).toContain('theme.autoSpoken');
    expect(keys).not.toContain('nav.learn');
    expect(s.host.querySelector('#app-nav .nav-btn')?.textContent?.trim()).toBe('Learn');
    expect(warn).toHaveBeenCalled();
  });

  it('marks what is not the app’s own as English where the page is not: the server’s detail, the release notes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const slovak = [provideTestTranslations({ 'whatsNew.added': 'Pridané' }, { language: 'sk' })];
    const notSetUp = await drawn(STATES['not set up, with what the server says is missing'], slovak);
    expect(notSetUp.host.querySelector('#not-set-up .detail')?.getAttribute('lang')).toBe('en');
    expect(notSetUp.host.querySelector('#not-set-up .detail')?.textContent).toBe('config/database.local.php is missing.');

    const running = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], slovak);
    const lists = Array.from(running.host.querySelectorAll('.release ul'));
    expect(lists.length).toBe(4);
    expect(lists.map((list) => list.getAttribute('lang'))).toEqual(['en', 'en', 'en', 'en']);
    // The frame around them is the page's: its headings carry no lang of their own, and the day is written the Slovak way.
    expect(running.host.querySelector('.section-title.added')?.textContent).toBe('Pridané');
    expect(running.host.querySelector('.section-title.added')?.hasAttribute('lang')).toBe(false);
    expect(running.host.querySelector('.release-date')?.textContent).toBe('28. septembra 2026');

    // On an English page the release notes need no mark: the page says English already. The server's detail is marked all the same.
    const english = [provideTestTranslations({})];
    const plain = await drawn(STATES['running, signed in, a piano connected, the list of changes there'], english);
    expect(Array.from(plain.host.querySelectorAll('.release ul')).map((list) => list.hasAttribute('lang'))).toEqual([false, false, false, false]);
    const detail = await drawn(STATES['not set up, with what the server says is missing'], english);
    expect(detail.host.querySelector('#not-set-up .detail')?.getAttribute('lang')).toBe('en');
  });
});
