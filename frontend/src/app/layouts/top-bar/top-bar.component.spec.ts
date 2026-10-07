import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { BootService, BootStatus } from '../../core/state/boot.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { provideSiteMigrations } from '../../core/state/site-migrations';
import { provideTestDialog } from '../../core/testing/test-dialog';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { PianoTitleStrategy } from '../../core/title.strategy';
import { PHONE_BAR_MAX, TopBarComponent } from './top-bar.component';

const ENGLISH: Record<string, string> = {
  'brand.area': 'Piano Academy',
  'brand.short': 'Piano',
  'topbar.home': 'anotoki Piano Academy: Learn',
  'nav.label': 'Main',
  'nav.learn': 'Learn',
  'nav.trainer': 'Note Trainer',
  'nav.sheet': 'Sheet Practice',
  'nav.songs': 'Songs',
  'nav.stats': 'Stats',
  'topbar.phoneMenu': 'Menu',
  'topbar.menuButton': 'Your menu: {name}',
  'topbar.menu': 'Your menu',
  'topbar.roleAdmin': 'Administrator',
  'topbar.roleEditor': 'Editor',
  'topbar.account': 'Your anotoki account',
  'topbar.admin': 'Admin panel',
  'account.notSaved': 'Not saved yet',
  'account.notSavedHint': 'Some of your progress is not on the server yet. The app keeps trying.',
  'account.signedIn': 'Signed in',
  'account.signOut': 'Sign out',
  'signIn.button': 'Sign in',
  'signOut.title': 'Sign out without your latest progress?',
  'signOut.text': 'Some of your progress could not be saved yet. If you sign out now, it is lost.',
  'signOut.confirm': 'Sign out anyway',
  'signOut.cancel': 'Stay signed in',
  'midi.button': '{label}: {status}',
  'midi.none': 'No piano',
  'midi.title': 'Your piano',
  'midi.notConnected': 'Piano not connected',
  'midi.connected': 'Connected: {name}',
  'midi.device': 'MIDI input device',
  'midi.connect': 'Connect',
  'midi.rescan': 'Rescan MIDI devices',
  'midi.noDevices': 'No MIDI devices found',
  'theme.auto': 'Theme: automatic',
  'theme.autoSpoken': 'Theme: automatic (press to change)',
  'language.button': 'Language: {name} ({code})',
  'title.learn': 'Learn',
};

const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'topbar.home': 'anotoki Piano Academy: Učenie',
  'nav.label': 'Hlavná',
  'nav.learn': 'Učenie',
  'nav.trainer': 'Tréning nôt',
  'nav.sheet': 'Hra z nôt',
  'nav.songs': 'Skladby',
  'nav.stats': 'Štatistiky',
  'topbar.phoneMenu': 'Ponuka',
  'topbar.menuButton': 'Tvoja ponuka: {name}',
  'topbar.menu': 'Tvoja ponuka',
  'topbar.roleAdmin': 'Správca',
  'topbar.roleEditor': 'Editor',
  'topbar.account': 'Tvoj účet anotoki',
  'topbar.admin': 'Administrátorský panel',
  'account.notSaved': 'Zatiaľ neuložené',
  'account.signOut': 'Odhlásiť sa',
  'signIn.button': 'Prihlásiť sa',
  'signOut.title': 'Odhlásiť sa bez posledného postupu?',
  'signOut.text': 'Časť tvojho postupu sa zatiaľ nepodarilo uložiť. Ak sa teraz odhlásiš, stratí sa.',
  'signOut.confirm': 'Aj tak sa odhlásiť',
  'signOut.cancel': 'Neodhlasovať sa',
  'midi.button': '{label}: {status}',
  'midi.none': 'Bez klavíra',
  'midi.notConnected': 'Klavír nie je pripojený',
};

@Component({ selector: 'app-blank', template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class BlankComponent {}

/** Who is signed in, as the bar reads it: null for nobody. */
interface Person {
  name: string | null;
  roles: string[];
  email?: string | null;
}

/** A media query list that the spec turns: the phone's screen or not. */
class Screen {
  matches = false;
  private readonly listeners = new Set<() => void>();
  addEventListener(_type: string, listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void): void {
    this.listeners.delete(listener);
  }
  turn(phone: boolean): void {
    this.matches = phone;
    for (const listener of this.listeners) listener();
  }
}

describe('TopBarComponent: the family\'s one bar', () => {
  let fixture: ComponentFixture<TopBarComponent>;
  let host: HTMLElement;
  let router: Router;
  let screen: Screen;
  const asked: string[] = [];
  const person = signal<Person | null>({ name: 'mia', roles: [] });
  const status = signal<BootStatus>('ready');
  const onlyMigrations = signal(false);
  const unsaved = signal(false);
  const loaded = signal(true);
  /** What settling answers: would signing out now lose progress? */
  let settled: (wouldLose: boolean) => void = () => undefined;
  const boot = {
    status,
    onlyMigrations,
    signIn: vi.fn(async () => undefined),
    settleBeforeSignOut: vi.fn(() => new Promise<boolean>((resolve) => (settled = resolve))),
    signOut: vi.fn(),
  };

  beforeAll(() => provideTestDialog());

  async function bar(options: { phone?: boolean; language?: 'en' | 'sk'; at?: string } = {}): Promise<void> {
    screen = new Screen();
    screen.matches = options.phone ?? false;
    asked.length = 0;
    vi.stubGlobal('matchMedia', (media: string) => {
      asked.push(media);
      // The bar's width; anything else (the theme's prefers-color-scheme) is a list that never changes.
      return media.includes('max-width') ? screen : { matches: false, media, addEventListener: () => undefined, removeEventListener: () => undefined };
    });
    const slovak = options.language === 'sk';
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: BlankComponent },
          { path: 'lesson/:unit/:step', component: BlankComponent },
          { path: 'trainer', component: BlankComponent },
          { path: 'sheet', component: BlankComponent },
          { path: 'songs', component: BlankComponent },
          { path: 'songs/:id', component: BlankComponent },
          { path: 'stats', component: BlankComponent },
          { path: 'admin', component: BlankComponent },
          { path: 'admin/:page', component: BlankComponent },
        ]),
        { provide: TitleStrategy, useClass: PianoTitleStrategy },
        ...(slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)),
        {
          provide: AuthService,
          useValue: {
            signedIn: computed(() => person() !== null),
            displayName: computed(() => person()?.name ?? null),
            user: computed(() => (person() ? { email: person()?.email ?? null } : null)),
            isAdmin: computed(() => person()?.roles.includes('ADMIN') ?? false),
            isStaff: computed(() => (person()?.roles ?? []).some((role) => role === 'ADMIN' || role === 'EDITOR')),
            accountUrl: () => 'http://localhost:4300/account',
            signInFailure: signal(null),
            // The account's theme, dates and clock: none here (an IAM that sends none) - the theme button keeps the device's.
            preferences: signal(null),
          },
        },
        { provide: BootService, useValue: boot },
        { provide: ProgressStore, useValue: { unsaved, loaded } },
        // Where the site stands (the family's SiteStatus): ready, unless a case says otherwise.
        provideSiteMigrations(),
      ],
    });
    TestBed.inject(SiteStatus).markReady();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(TopBarComponent);
    host = fixture.nativeElement;
    await router.navigateByUrl(options.at ?? '/');
    await fixture.whenStable();
  }

  beforeEach(() => {
    person.set({ name: 'mia', roles: [] });
    status.set('ready');
    unsaved.set(false);
    loaded.set(true);
    boot.signIn.mockClear();
    boot.settleBeforeSignOut.mockClear();
    boot.signOut.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const $ = <T extends Element = HTMLElement>(selector: string): T | null => host.querySelector<T>(selector);
  const texts = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  /** What the row holds, left to right, by what each thing is. */
  const row = (): string[] =>
    Array.from(host.querySelectorAll('.topbar-inner > *, .topbar-actions > *')).filter((element) => !element.classList.contains('topbar-actions')).map((element) => element.id || element.className || element.tagName.toLowerCase());
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  };
  const press = (target: Element, key: string, shift = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  const items = (): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>('.menu [role="menuitem"]'));
  async function open(which: 'account' | 'phone'): Promise<HTMLButtonElement> {
    const button = $<HTMLButtonElement>(which === 'account' ? '#topbar-user-button' : '#topbar-menu-button')!;
    button.click();
    await fixture.whenStable();
    return button;
  }

  describe('on a wide screen', () => {
    it('is one row in the family\'s order: brand, sections, the piano, language, theme, the person', async () => {
      await bar();
      expect(row()).toEqual(['app-brand', 'topbar-nav', 'app-midi-panel', 'app-language-switcher', 'app-theme-toggle', 'user-menu']);
      expect($('.brand')?.getAttribute('href')).toBe('/');
      expect($('.brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy: Learn');
      expect(texts('.brand .wordmark span')).toEqual(['anotoki', 'Piano Academy']);
      expect($('#topbar-nav')?.getAttribute('aria-label')).toBe('Main');
      expect(texts('#topbar-nav a')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
      expect(asked).toContain(`(max-width: ${PHONE_BAR_MAX}px)`);
    });

    it('lights the section the page is in - a lesson under Learn, a song under Songs - and marks the page\'s own link', async () => {
      await bar({ at: '/lesson/rh-1/drill' });
      const active = (): string[] => texts('#topbar-nav a.is-active');
      const current = (): string[] => texts('#topbar-nav a[aria-current="page"]');
      expect(active()).toEqual(['Learn']);
      expect(current()).toEqual([]);

      await router.navigateByUrl('/songs/ode-to-joy');
      await fixture.whenStable();
      expect(active()).toEqual(['Songs']);
      expect(current()).toEqual([]);

      await router.navigateByUrl('/stats?from=deep');
      await fixture.whenStable();
      expect(active()).toEqual(['Stats']);
      expect(current()).toEqual(['Stats']);
    });

    it('has no sections before the app runs: there is nothing to practise on yet', async () => {
      status.set('not-set-up');
      await bar();
      expect($('#topbar-nav')).toBeNull();
      expect($('app-midi-panel')).not.toBeNull();
    });

    it('"Not saved yet" stands beside the piano while some progress waits, and leads the person\'s menu', async () => {
      unsaved.set(true);
      await bar();
      expect(row().slice(2, 4)).toEqual(['save-status', 'app-midi-panel']);
      expect($('#save-status')?.textContent).toBe('Not saved yet');
      await open('account');
      expect($('#user-menu .menu-note strong')?.textContent).toBe('Not saved yet');
    });

    it('the person\'s menu: name, address, role; their account, the admin panel for the staff, Sign out', async () => {
      person.set({ name: 'mia', roles: ['ADMIN'], email: 'mia@example.com' });
      await bar();
      expect($('#topbar-user-button')?.getAttribute('aria-label')).toBe('Your menu: mia');
      expect($('#account-name')?.textContent).toBe('mia');
      expect($('.avatar')?.textContent).toBe('M');
      const button = await open('account');
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect($('#user-menu')?.getAttribute('aria-label')).toBe('Your menu');
      expect(texts('.menu-head > span')).toEqual(['mia', 'mia@example.com', 'Administrator']);
      expect(texts('#user-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Admin panel', 'Sign out']);
      expect($('#account-link')?.getAttribute('href')).toBe('http://localhost:4300/account');
      expect($('#account-link')?.getAttribute('target')).toBe('_blank');
      expect($('#admin-link')?.getAttribute('href')).toBe('/admin');
    });

    it('an EDITOR is named so and gets the admin panel; a learner, or a MEMBER of old, neither', async () => {
      person.set({ name: 'ed', roles: ['EDITOR'] });
      await bar();
      await open('account');
      expect($('#topbar-role')?.textContent).toBe('Editor');
      expect($('#admin-link')).not.toBeNull();

      for (const roles of [[], ['MEMBER']]) {
        TestBed.resetTestingModule();
        person.set({ name: 'mia', roles });
        await bar();
        await open('account');
        expect($('#topbar-role')).toBeNull();
        expect($('#admin-link')).toBeNull();
        expect(texts('#user-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Sign out']);
      }
    });

    it('names somebody whose token names nobody in the app\'s words, and gives no e-mail that is the name itself', async () => {
      person.set({ name: null, roles: [] });
      await bar();
      expect($('#account-name')?.textContent).toBe('Signed in');
      expect($('.avatar')?.textContent).toBe('?');
      TestBed.resetTestingModule();
      person.set({ name: 'mia@example.com', roles: [], email: 'mia@example.com' });
      await bar();
      await open('account');
      expect(texts('.menu-head > span')).toEqual(['mia@example.com']);
    });

    it('signed out in the middle of practising: Sign in - and before the app ran, nothing (the guard is on its way to the IAM)', async () => {
      person.set(null);
      await bar();
      expect(row().at(-1)).toBe('sign-in-btn');
      $<HTMLButtonElement>('#sign-in-btn')!.click();
      expect(boot.signIn).toHaveBeenCalledTimes(1);

      TestBed.resetTestingModule();
      loaded.set(false);
      status.set('sign-in');
      await bar();
      expect($('#sign-in-btn')).toBeNull();
      expect($('.user-menu')).toBeNull();
    });

    it('a visitor - practising without signing in, the app running on their progress -: Sign in, in the row and in the phone’s menu after the sections', async () => {
      // The bar asks only whether somebody is signed in and the progress is loaded: a visitor is both "not" and "yes".
      person.set(null);
      await bar({ at: '/trainer' });
      expect(row().at(-1)).toBe('sign-in-btn');
      expect($('#topbar-user-button')).toBeNull();
      $<HTMLButtonElement>('#sign-in-btn')!.click();
      expect(boot.signIn).toHaveBeenCalledTimes(1);

      TestBed.resetTestingModule();
      await bar({ phone: true, at: '/trainer' });
      await open('phone');
      expect(texts('#topbar-menu [role="menuitem"]').slice(-1)).toEqual(['Sign in']);
      expect($('#topbar-sign-in-item')).not.toBeNull();
    });
  });

  describe('the menus\' keys and focus', () => {
    it('opens into its first item; arrows, Home and End move round it; Escape closes it onto its button', async () => {
      await bar();
      const button = await open('account');
      expect(document.activeElement).toBe(items()[0]);
      press(items()[0], 'ArrowDown');
      expect(document.activeElement).toBe(items()[1]);
      press(items()[1], 'ArrowDown');
      expect(document.activeElement).toBe(items()[0]);
      press(items()[0], 'ArrowUp');
      expect(document.activeElement).toBe(items()[1]);
      press(items()[1], 'Home');
      expect(document.activeElement).toBe(items()[0]);
      press(items()[0], 'End');
      expect(document.activeElement).toBe(items()[1]);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();
      expect($('#user-menu')).toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button);
    });

    it('Tab and Shift+Tab from the first, a middle and the last item: the browser\'s step is stopped, the menu closed, the focus on the menu button - never <body>', async () => {
      person.set({ name: 'mia', roles: ['ADMIN'] });
      await bar();
      for (const shift of [false, true]) {
        for (const at of ['first', 'middle', 'last'] as const) {
          const button = await open('account');
          const all = items();
          expect(all.length).toBe(3);
          const item = at === 'first' ? all[0] : at === 'middle' ? all[1] : all[2];
          item.focus();
          const event = press(item, 'Tab', shift);
          await fixture.whenStable();
          expect(event.defaultPrevented, `${shift ? 'Shift+' : ''}Tab from the ${at}`).toBe(true);
          expect($('#user-menu'), `${shift ? 'Shift+' : ''}Tab from the ${at}`).toBeNull();
          expect(document.activeElement, `${shift ? 'Shift+' : ''}Tab from the ${at}`).toBe(button);
        }
      }
    });

    it('the button again closes it onto the button; a click outside closes it and leaves the focus be; choosing an item closes it', async () => {
      await bar();
      const button = await open('account');
      button.click();
      await fixture.whenStable();
      expect($('#user-menu')).toBeNull();
      expect(document.activeElement).toBe(button);

      await open('account');
      document.body.click();
      await fixture.whenStable();
      expect($('#user-menu')).toBeNull();

      person.set({ name: 'ed', roles: ['EDITOR'] });
      await fixture.whenStable();
      await open('account');
      $<HTMLAnchorElement>('#admin-link')!.click();
      await settle();
      expect($('#user-menu')).toBeNull();
      expect(router.url).toBe('/admin');
    });
  });

  describe('on a phone', () => {
    it('is the brand ("Piano"), the piano\'s dot, the language, the theme and the menu button - the sections and the person inside it', async () => {
      await bar({ phone: true });
      expect(row()).toEqual(['app-brand', 'app-midi-panel', 'app-language-switcher', 'app-theme-toggle', 'phone-menu']);
      expect(texts('.brand .wordmark span')).toEqual(['Piano']);
      expect($('#midi-label')).toBeNull();
      expect($('#topbar-menu-button')?.getAttribute('aria-label')).toBe('Menu');

      const button = await open('phone');
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect($('#topbar-menu')?.getAttribute('aria-label')).toBe('Menu');
      expect(texts('#topbar-menu [role="menuitem"]')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats', 'Your anotoki account', 'Sign out']);
      expect(host.querySelectorAll('#topbar-menu [role="separator"]').length).toBe(2);
      expect(texts('#topbar-menu .menu-link.is-active')).toEqual(['Learn']);
      expect(texts('#topbar-menu .menu-link[aria-current="page"]')).toEqual(['Learn']);
      expect(document.activeElement).toBe(items()[0]);
    });

    it('keys: arrows round the menu, and Tab and Shift+Tab from the first, a middle and the last item onto the menu button', async () => {
      await bar({ phone: true });
      let button = await open('phone');
      press(items()[0], 'ArrowUp');
      expect(document.activeElement).toBe(items().at(-1));
      press(items().at(-1)!, 'ArrowDown');
      expect(document.activeElement).toBe(items()[0]);
      for (const shift of [false, true]) {
        for (const index of [0, 3, 6]) {
          if (!$('#topbar-menu')) button = await open('phone');
          const item = items()[index];
          item.focus();
          const event = press(item, 'Tab', shift);
          await fixture.whenStable();
          expect(event.defaultPrevented).toBe(true);
          expect($('#topbar-menu')).toBeNull();
          expect(document.activeElement).toBe(button);
        }
      }
    });

    it('a section chosen goes there and closes the menu', async () => {
      await bar({ phone: true });
      await open('phone');
      (items().find((item) => item.textContent?.trim() === 'Stats') as HTMLAnchorElement).click();
      await settle();
      expect(router.url).toBe('/stats');
      expect($('#topbar-menu')).toBeNull();
    });

    it('"Not saved yet" is a dot on the menu button, said to a screen reader, and the menu\'s first line', async () => {
      unsaved.set(true);
      await bar({ phone: true });
      expect($('#save-status')).toBeNull();
      expect($('#topbar-unsaved-dot')).not.toBeNull();
      expect($('#topbar-menu-button')?.getAttribute('aria-describedby')).toBe('topbar-unsaved');
      expect($('#topbar-unsaved')?.textContent).toBe('Not saved yet');
      await open('phone');
      expect($('#topbar-menu')?.firstElementChild?.id).toBe('topbar-menu-unsaved');
    });

    it('signed out: the sections, then Sign in', async () => {
      person.set(null);
      await bar({ phone: true });
      await open('phone');
      expect(texts('#topbar-menu [role="menuitem"]').slice(-1)).toEqual(['Sign in']);
      $<HTMLButtonElement>('#topbar-sign-in-item')!.click();
      expect(boot.signIn).toHaveBeenCalledTimes(1);
    });

    it('before the app runs, a signed-out visitor gets no menu button - its menu would hold nothing', async () => {
      person.set(null);
      loaded.set(false);
      status.set('sign-in');
      await bar({ phone: true });
      expect($('#topbar-menu-button')).toBeNull();
      for (const state of ['not-set-up', 'load-error', 'loading'] as BootStatus[]) {
        status.set(state);
        await fixture.whenStable();
        expect($('#topbar-menu-button')).toBeNull();
      }
      // An administrator on the "not set up yet" card: their own menu is there.
      status.set('not-set-up');
      person.set({ name: 'mia', roles: ['ADMIN'] });
      await fixture.whenStable();
      await open('phone');
      expect(texts('#topbar-menu [role="menuitem"]').slice(-1)).toEqual(['Sign out']);
    });

    it('a screen turned past the fold closes the open menu, and the desktop\'s row comes', async () => {
      await bar({ phone: true });
      await open('phone');
      screen.turn(false);
      await fixture.whenStable();
      expect($('#topbar-menu')).toBeNull();
      expect($('#topbar-menu-button')).toBeNull();
      expect(row()).toEqual(['app-brand', 'topbar-nav', 'app-midi-panel', 'app-language-switcher', 'app-theme-toggle', 'user-menu']);
    });
  });

  describe('the words', () => {
    /** What a control shows: its text, but for what is hidden from everybody (the avatar's initial, the icons). */
    const shown = (element: Element): string => {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll('[aria-hidden="true"], .visually-hidden, app-icon').forEach((hidden) => hidden.remove());
      // Each piece apart: "anotoki" and "Piano Academy" are two spans the styles set apart, with no space between them in the DOM.
      const pieces: string[] = [];
      const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) pieces.push(node.textContent ?? '');
      return pieces.join(' ').replace(/\s+/g, ' ').trim();
    };

    for (const phone of [false, true]) {
      for (const language of ['en', 'sk'] as const) {
        it(`every named control's name holds the words it shows - label in name (${phone ? 'a phone' : 'a wide screen'}, ${language})`, async () => {
          await bar({ phone, language });
          const named = Array.from(host.querySelectorAll('a[aria-label], button[aria-label]'));
          expect(named.length).toBeGreaterThanOrEqual(4);
          const checked: string[] = [];
          for (const control of named) {
            const words = shown(control);
            if (words === '') continue;
            expect(control.getAttribute('aria-label')?.toLowerCase(), control.id || control.className).toContain(words.toLowerCase());
            checked.push(control.id || control.className);
          }
          // The brand, the piano (but on a phone, where it shows no words) and the language at least.
          expect(checked).toEqual(expect.arrayContaining(phone ? ['brand'] : ['brand', 'midi-button']));
          expect(checked.some((id) => id.startsWith('language-button'))).toBe(true);
        });
      }
    }

    it('reads the learner\'s language - and English in the admin panel, with its own sections, no chooser and no piano', async () => {
      await bar({ language: 'sk' });
      expect(texts('#topbar-nav a')).toEqual(['Učenie', 'Tréning nôt', 'Hra z nôt', 'Skladby', 'Štatistiky']);
      expect($('#topbar-user-button')?.getAttribute('aria-label')).toBe('Tvoja ponuka: mia');
      expect($('app-language-switcher')).not.toBeNull();

      person.set({ name: 'mia', roles: ['ADMIN'] });
      await router.navigateByUrl('/admin/people');
      await fixture.whenStable();
      expect(TestBed.inject(TranslationService).effectiveLanguage()).toBe('en');
      expect(texts('#topbar-nav a')).toEqual(['Translations', 'Languages', 'People', 'Migrations']);
      expect(texts('#topbar-nav a[aria-current="page"]')).toEqual(['People']);
      expect($('.brand')?.getAttribute('href')).toBe('/admin');
      expect($('.brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy - admin panel');
      expect(texts('.brand .wordmark span')).toEqual(['anotoki', 'Piano Academy - admin panel']);
      expect($('app-language-switcher')).toBeNull();
      expect($('app-midi-panel')).toBeNull();
      expect($('#topbar-user-button')?.getAttribute('aria-label')).toBe('Your menu: mia');
      await open('account');
      expect(texts('#user-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Back to Piano Academy', 'Sign out']);
      expect($('#topbar-back')?.getAttribute('href')).toBe('/');
      expect($('#topbar-role')?.textContent).toBe('Administrator');
    });

    it('the admin panel on a phone: "admin panel" beside the mark, inside the brand link\'s name', async () => {
      person.set({ name: 'mia', roles: ['ADMIN'] });
      await bar({ phone: true, at: '/admin/people' });
      expect(texts('.brand .wordmark span')).toEqual(['admin panel']);
      expect($('.brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy - admin panel');
    });

    it('while an update waits: an ADMIN in the admin panel has Migrations alone; elsewhere, and anybody else, no sections', async () => {
      person.set({ name: 'mia', roles: ['ADMIN'] });
      status.set('waiting');
      onlyMigrations.set(true);
      try {
        await bar({ at: '/admin/migrations' });
        TestBed.inject(SiteStatus).report('update_pending');
        await fixture.whenStable();
        expect(texts('#topbar-nav a')).toEqual(['Migrations']);
        expect(texts('#topbar-nav a[aria-current="page"]')).toEqual(['Migrations']);
        await router.navigateByUrl('/');
        await fixture.whenStable();
        expect($('#topbar-nav')).toBeNull();
        TestBed.resetTestingModule();
        onlyMigrations.set(false);
        await bar({ at: '/admin/migrations' });
        expect($('#topbar-nav')).toBeNull();
      } finally {
        status.set('ready');
        onlyMigrations.set(false);
      }
    });

    it('an update that comes in the middle of practising: the sections go while the status page stands in the view\'s place - and come back with the site', async () => {
      await bar({ at: '/trainer' });
      expect(texts('#topbar-nav a')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
      const site = TestBed.inject(SiteStatus);
      site.report('update_pending');
      await fixture.whenStable();
      expect($('#topbar-nav')).toBeNull();
      site.markReady();
      await fixture.whenStable();
      expect(texts('#topbar-nav a')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    });

    it('the admin panel\'s sections by role: an EDITOR has Translations alone, somebody with no role none', async () => {
      person.set({ name: 'ed', roles: ['EDITOR'] });
      await bar({ at: '/admin/translations' });
      expect(texts('#topbar-nav a')).toEqual(['Translations']);
      TestBed.resetTestingModule();
      person.set({ name: 'mia', roles: [] });
      await bar({ at: '/admin/translations' });
      expect($('#topbar-nav')).toBeNull();
    });
  });

  describe('signing out', () => {
    const signOutButton = (): HTMLButtonElement => $<HTMLButtonElement>('#sign-out-btn')!;
    const dialog = (): HTMLDialogElement => $<HTMLDialogElement>('dialog.confirm')!;

    it('settles what is waiting first, with a spinner on the item - then signs out when nothing would be lost', async () => {
      await bar({ language: 'sk' });
      await open('account');
      signOutButton().click();
      await fixture.whenStable();
      expect(boot.settleBeforeSignOut).toHaveBeenCalledTimes(1);
      expect(signOutButton().disabled).toBe(true);
      expect(signOutButton().getAttribute('aria-busy')).toBe('true');
      expect(signOutButton().querySelector('app-spinner')).not.toBeNull();
      expect(boot.signOut).not.toHaveBeenCalled();

      settled(false);
      await settle();
      expect(dialog().hasAttribute('open')).toBe(false);
      expect(boot.signOut).toHaveBeenCalledTimes(1);
    });

    it('asks in the learner\'s language when progress would be lost - and stays signed in on no', async () => {
      await bar({ language: 'sk' });
      // The question is drawn while closed (the shell's checks read it).
      expect($('#sign-out-confirm-title')?.textContent).toBe('Odhlásiť sa bez posledného postupu?');
      await open('account');
      signOutButton().click();
      settled(true);
      await settle();
      expect($('#user-menu')).toBeNull();
      expect(dialog().hasAttribute('open')).toBe(true);
      expect(dialog().querySelector('p')?.textContent).toBe('Časť tvojho postupu sa zatiaľ nepodarilo uložiť. Ak sa teraz odhlásiš, stratí sa.');
      expect(dialog().querySelector('[data-answer="yes"]')?.textContent?.trim()).toBe('Aj tak sa odhlásiť');
      expect(dialog().querySelector('[data-answer="no"]')?.textContent?.trim()).toBe('Neodhlasovať sa');

      (dialog().querySelector('[data-answer="no"]') as HTMLButtonElement).click();
      await settle();
      expect(boot.signOut).not.toHaveBeenCalled();
      await open('account');
      expect(signOutButton().disabled).toBe(false);
      expect(signOutButton().querySelector('app-spinner')).toBeNull();
    });

    it('signs out on yes', async () => {
      await bar();
      await open('account');
      signOutButton().click();
      settled(true);
      await settle();
      (dialog().querySelector('[data-answer="yes"]') as HTMLButtonElement).click();
      await settle();
      expect(boot.signOut).toHaveBeenCalledTimes(1);
    });
  });
});
