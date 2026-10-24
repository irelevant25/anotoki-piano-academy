import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { provideFamilyKit } from '../../../../shared/family-kit';
import { BootService, BootStatus } from '../../../../shared/state/boot.service';
import { ProgressStore } from '../../../../shared/state/progress-store.service';
import { provideSiteMigrations } from '../../../../shared/state/site-migrations';
import { provideTestKit } from '../../../../shared/testing/test-kit';
import { PianoTitleStrategy } from '../../../../shared/title.strategy';
import { ADMIN_PHONE_BAR_MAX, ADMIN_SHORT_BRAND_MAX, PHONE_BAR_MAX, TopBarComponent } from './top-bar.component';

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
  'anotoki.topbar.phoneMenu': 'Menu',
  'anotoki.topbar.menuButton': 'Your menu: {name}',
  'anotoki.topbar.menu': 'Your menu',
  'anotoki.topbar.roleAdmin': 'Administrator',
  'anotoki.topbar.roleEditor': 'Editor',
  'anotoki.topbar.account': 'Your anotoki account',
  'anotoki.topbar.admin': 'Admin panel',
  'account.notSaved': 'Not saved yet',
  'account.notSavedHint': 'Some of your progress is not on the server yet. The app keeps trying.',
  'account.signedIn': 'Signed in',
  'anotoki.topbar.signOut': 'Sign out',
  'signIn.button': 'Sign in',
  'anotoki.topbar.signIn': 'Sign in',
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
  'anotoki.theme.auto': 'Theme: automatic',
  'anotoki.theme.light': 'Theme: light',
  'anotoki.theme.dark': 'Theme: dark',
  'anotoki.theme.notSaved': 'The theme could not be saved to your anotoki account.',
  'anotoki.language.button': 'Language: {name} ({code})',
  'anotoki.language.notLoaded': 'The language could not be loaded. Please try again.',
  'anotoki.language.notSaved': 'The language could not be saved to your anotoki account - it holds for this visit only.',
  'common.loading': 'Loading…',
  'title.learn': 'Learn',
};

/** The owner's own Slovak where it differs from the kit's built-in words ("Správca", "Tvoj účet anotoki"): the database's, under the library's keys (migration 009 copied this app's there), are the ones shown. */
const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'topbar.home': 'anotoki Piano Academy: Učenie',
  'nav.label': 'Hlavná',
  'nav.learn': 'Učenie',
  'nav.trainer': 'Tréning nôt',
  'nav.sheet': 'Hra z nôt',
  'nav.songs': 'Skladby',
  'nav.stats': 'Štatistiky',
  'anotoki.topbar.phoneMenu': 'Ponuka',
  'anotoki.topbar.menuButton': 'Tvoja ponuka: {name}',
  'anotoki.topbar.menu': 'Tvoja ponuka',
  'anotoki.topbar.roleAdmin': 'Správca',
  'anotoki.topbar.roleEditor': 'Editor',
  'anotoki.topbar.account': 'Tvoj účet anotoki',
  'anotoki.topbar.admin': 'Administrátorský panel',
  'account.notSaved': 'Zatiaľ neuložené',
  'anotoki.topbar.signOut': 'Odhlásiť sa',
  'signIn.button': 'Prihlásiť sa',
  'anotoki.topbar.signIn': 'Prihlásiť sa',
  'signOut.title': 'Odhlásiť sa bez posledného postupu?',
  'signOut.text': 'Časť tvojho postupu sa zatiaľ nepodarilo uložiť. Ak sa teraz odhlásiš, stratí sa.',
  'signOut.confirm': 'Aj tak sa odhlásiť',
  'signOut.cancel': 'Neodhlasovať sa',
  'midi.button': '{label}: {status}',
  'midi.none': 'Bez klavíra',
  'midi.notConnected': 'Klavír nie je pripojený',
  'anotoki.theme.auto': 'Vzhľad: systémový',
  'anotoki.theme.light': 'Vzhľad: svetlý',
  'anotoki.theme.dark': 'Vzhľad: tmavý',
  'anotoki.language.button': 'Jazyk: {name} ({code})',
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

/**
 * Piano Academy's wrapper of the family's bar (@anotoki/lib/shell's <anotoki-top-bar>): what it tells the bar -
 * the brand, the sections, the person, the menu's items, Sign in and Sign out, the widgets, the marks - and in
 * whose words. The bar's own behaviour (its menus, keys and fold) is the library's, tested there; what is
 * checked of it here is that it holds with Piano's words and widgets in it.
 */
describe("TopBarComponent: Piano Academy in the family's one bar", () => {
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
  /** How many feedback messages are new (the family's FeedbackUnread; null until the server said, and for anybody but an ADMIN). */
  const unread = signal<number | null>(null);
  /** What settling answers: would signing out now lose progress? */
  let settled: (wouldLose: boolean) => void = () => undefined;
  const boot = {
    status,
    onlyMigrations,
    signIn: vi.fn(async () => undefined),
    settleBeforeSignOut: vi.fn(() => new Promise<boolean>((resolve) => (settled = resolve))),
    signOut: vi.fn(),
  };

  // The family's menus and boxes ask jsdom for what it lacks (checkVisibility(), popovers).
  beforeAll(() => provideTestKit());

  async function bar(options: { phone?: boolean; language?: 'en' | 'sk'; at?: string } = {}): Promise<void> {
    screen = new Screen();
    screen.matches = options.phone ?? false;
    asked.length = 0;
    vi.stubGlobal('matchMedia', (media: string) => {
      asked.push(media);
      const still = (matches: boolean) => ({ matches, media, addEventListener: () => undefined, removeEventListener: () => undefined });
      // No screen is wider than the admin panel's "short brand" width; the bar's other widths turn with the spec's screen;
      // anything else (the theme's prefers-color-scheme) is a list that never changes.
      if (media === `(max-width: ${ADMIN_SHORT_BRAND_MAX}px)`) return still(true);
      return media.includes('max-width') ? screen : still(false);
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
          provide: AnotokiAuth,
          useValue: {
            signedIn: computed(() => person() !== null),
            // The family's: the name, else the address - '' when the token names nobody.
            displayName: computed(() => person()?.name ?? ''),
            user: computed(() => (person() ? { email: person()?.email ?? null } : null)),
            isAdmin: computed(() => person()?.roles.includes('ADMIN') ?? false),
            isStaff: computed(() => (person()?.roles ?? []).some((role) => role === 'ADMIN' || role === 'EDITOR')),
            accountUrl: () => 'http://localhost:4300/account',
            signInFailure: signal(null),
            // The account's theme, dates and clock: none here (an IAM that sends none) - the theme switch keeps the device's.
            preferences: signal(null),
            savePreferences: vi.fn(async () => undefined),
          },
        },
        { provide: BootService, useValue: boot },
        { provide: ProgressStore, useValue: { unsaved, loaded } },
        { provide: FeedbackUnread, useValue: { count: unread, refresh: async () => undefined } },
        // Where the site stands (the family's SiteStatus): ready, unless a case says otherwise.
        provideSiteMigrations(),
        // The family's kit with this app's words, theme and languages - as app.config.ts has it.
        provideFamilyKit(),
      ],
    });
    TestBed.inject(SiteStatus).markReady();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(TopBarComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await router.navigateByUrl(options.at ?? '/');
    await fixture.whenStable();
  }

  beforeEach(() => {
    person.set({ name: 'mia', roles: [] });
    status.set('ready');
    unsaved.set(false);
    loaded.set(true);
    unread.set(null);
    boot.signIn.mockClear();
    boot.settleBeforeSignOut.mockClear();
    boot.signOut.mockClear();
  });

  afterEach(() => {
    host?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const $ = <T extends Element = HTMLElement>(selector: string): T | null => host.querySelector<T>(selector);
  const texts = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  /** The family's classes for the bar's parts, by the part's name (the kit's class names are its own: anotoki-<component>__<part>). */
  const PARTS: Readonly<Record<string, string>> = {
    'anotoki-top-bar__person-button': 'person-button',
    'anotoki-top-bar__menu-button': 'menu-button',
    'anotoki-top-bar__sign-in': 'sign-in',
    'anotoki-language-switcher__switcher': 'switcher',
    'anotoki-brand__brand': 'brand',
  };
  /** What a thing of the bar is: Piano's own id, a component's name, or the name of the family's part (its ids are its own, made up). */
  const what = (element: Element): string => {
    if (element.id && !element.id.startsWith('anotoki-')) return element.id;
    if (element.tagName.includes('-')) return element.tagName.toLowerCase();
    return Object.entries(PARTS).find(([name]) => element.classList.contains(name))?.[1] ?? element.tagName.toLowerCase();
  };
  /** What the row holds, left to right, by what each thing is (the menus' own elements take no room in it). */
  const row = (): string[] =>
    Array.from(host.querySelectorAll('.anotoki-top-bar__row > *, .anotoki-top-bar__actions > *'))
      .filter((element) => !element.classList.contains('anotoki-top-bar__actions') && element.tagName !== 'ANOTOKI-MENU')
      .map(what);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();
    }
  };
  const press = (target: Element, key: string, shift = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  const menu = (): HTMLElement | null => $('anotoki-menu [role="menu"]');
  const items = (): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>('anotoki-menu [role="menuitem"]'));
  async function open(which: 'account' | 'phone'): Promise<HTMLButtonElement> {
    const button = $<HTMLButtonElement>(which === 'account' ? '.anotoki-top-bar__person-button' : '.anotoki-top-bar__menu-button')!;
    button.click();
    await settle();
    return button;
  }

  describe('on a wide screen', () => {
    it("is one row in the family's order: brand, sections, the piano, language, theme, the person", async () => {
      await bar();
      expect(row()).toEqual(['anotoki-brand', 'nav', 'app-midi-panel', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'person-button']);
      expect($('.anotoki-brand__brand')?.getAttribute('href')).toBe('/');
      expect($('.anotoki-brand__brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy: Learn');
      expect(texts('.anotoki-brand__wordmark > span')).toEqual(['anotoki', 'Piano Academy']);
      expect($('nav')?.getAttribute('aria-label')).toBe('Main');
      expect(texts('nav a')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
      // The family's bar folds at Piano's own width.
      expect(asked).toContain(`(max-width: ${PHONE_BAR_MAX}px)`);
    });

    it("lights the section the page is in - a lesson under Learn, a song under Songs - and marks the page's own link", async () => {
      await bar({ at: '/lesson/rh-1/drill' });
      const active = (): string[] => texts('nav a.anotoki-top-bar__link--active');
      const current = (): string[] => texts('nav a[aria-current="page"]');
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
      expect($('nav')).toBeNull();
      expect($('app-midi-panel')).not.toBeNull();
    });

    it('"Not saved yet" stands beside the piano while some progress waits, and heads the person\'s menu', async () => {
      unsaved.set(true);
      await bar();
      expect(row().slice(2, 4)).toEqual(['save-status', 'app-midi-panel']);
      expect($('#save-status')?.textContent).toBe('Not saved yet');
      expect($('#save-status')?.getAttribute('title')).toBe('Some of your progress is not on the server yet. The app keeps trying.');
      await open('account');
      expect(menu()?.firstElementChild?.classList.contains('anotoki-top-bar__menu-note')).toBe(true);
      expect($('.anotoki-top-bar__menu-note strong')?.textContent).toBe('Not saved yet');
      expect($('.anotoki-top-bar__menu-note span')?.textContent).toBe('Some of your progress is not on the server yet. The app keeps trying.');
    });

    it("the person's menu: name, address, role; their account (a new tab), the admin panel for the staff, Sign out", async () => {
      person.set({ name: 'mia', roles: ['ADMIN'], email: 'mia@example.com' });
      await bar();
      expect($('.anotoki-top-bar__person-button')?.getAttribute('aria-label')).toBe('Your menu: mia');
      expect($('.anotoki-top-bar__person-name')?.textContent).toBe('mia');
      expect($('.anotoki-top-bar__initial')?.textContent).toBe('M');
      const button = await open('account');
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(menu()?.getAttribute('aria-label')).toBe('Your menu');
      expect(texts('.anotoki-top-bar__menu-head > span')).toEqual(['mia', 'mia@example.com', 'Administrator']);
      expect(texts('anotoki-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Admin panel', 'Sign out']);
      const account = $<HTMLAnchorElement>('anotoki-menu a[href="http://localhost:4300/account"]');
      expect(account?.getAttribute('target')).toBe('_blank');
      expect($('anotoki-menu a[href="/admin"]')?.textContent?.trim()).toBe('Admin panel');
    });

    it('an EDITOR is named so and gets the admin panel; a learner, or a MEMBER of old, neither', async () => {
      person.set({ name: 'ed', roles: ['EDITOR'] });
      await bar();
      await open('account');
      expect($('.anotoki-top-bar__menu-role')?.textContent).toBe('Editor');
      expect($('anotoki-menu a[href="/admin"]')).not.toBeNull();

      for (const roles of [[], ['MEMBER']]) {
        TestBed.resetTestingModule();
        person.set({ name: 'mia', roles });
        await bar();
        await open('account');
        expect($('.anotoki-top-bar__menu-role')).toBeNull();
        expect($('anotoki-menu a[href="/admin"]')).toBeNull();
        expect(texts('anotoki-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Sign out']);
      }
    });

    it("the way into the admin panel only while the site is ready: an update waiting, the family's page links to Migrations", async () => {
      person.set({ name: 'mia', roles: ['ADMIN'] });
      await bar();
      TestBed.inject(SiteStatus).report('update_pending');
      await fixture.whenStable();
      await open('account');
      expect(texts('anotoki-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Sign out']);
      press(items()[0], 'Escape');
      await fixture.whenStable();
      // In the admin panel (its Migrations page), the way back stays.
      await router.navigateByUrl('/admin/migrations');
      await fixture.whenStable();
      await open('account');
      expect(texts('anotoki-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Back to Piano Academy', 'Sign out']);
    });

    it("names somebody whose token names nobody in the app's words, and gives no e-mail that is the name itself", async () => {
      person.set({ name: null, roles: [] });
      await bar();
      expect($('.anotoki-top-bar__person-name')?.textContent).toBe('Signed in');
      expect($('.anotoki-top-bar__initial')?.textContent).toBe('S');
      TestBed.resetTestingModule();
      person.set({ name: 'mia@example.com', roles: [], email: 'mia@example.com' });
      await bar();
      await open('account');
      expect(texts('.anotoki-top-bar__menu-head > span')).toEqual(['mia@example.com']);
    });

    it('signed out in the middle of practising: Sign in - and before the app ran, nothing (the guard is on its way to the IAM)', async () => {
      person.set(null);
      await bar();
      expect(row().at(-1)).toBe('sign-in');
      expect($('.anotoki-top-bar__sign-in')?.textContent?.trim()).toBe('Sign in');
      $<HTMLButtonElement>('.anotoki-top-bar__sign-in')!.click();
      await settle();
      expect(boot.signIn).toHaveBeenCalledTimes(1);

      TestBed.resetTestingModule();
      loaded.set(false);
      status.set('sign-in');
      await bar();
      expect($('.anotoki-top-bar__sign-in')).toBeNull();
      expect($('.anotoki-top-bar__person-button')).toBeNull();
    });

    it('a visitor - practising without signing in, the app running on their progress -: Sign in, in the row and in the phone’s menu after the sections', async () => {
      // The bar asks only whether somebody is signed in and the progress is loaded: a visitor is both "not" and "yes".
      person.set(null);
      await bar({ at: '/trainer' });
      expect(row().at(-1)).toBe('sign-in');
      expect($('.anotoki-top-bar__person-button')).toBeNull();
      $<HTMLButtonElement>('.anotoki-top-bar__sign-in')!.click();
      await settle();
      expect(boot.signIn).toHaveBeenCalledTimes(1);

      TestBed.resetTestingModule();
      await bar({ phone: true, at: '/trainer' });
      await open('phone');
      expect(texts('anotoki-menu [role="menuitem"]').slice(-1)).toEqual(['Sign in']);
      expect($('.anotoki-top-bar__sign-in-item')).not.toBeNull();
    });
  });

  describe("the menus' keys and focus (the family's menus, with Piano's items)", () => {
    it('opens into its first item; arrows move round it; Escape closes it onto its button', async () => {
      await bar();
      const button = await open('account');
      expect(document.activeElement).toBe(items()[0]);
      press(items()[0], 'ArrowDown');
      expect(document.activeElement).toBe(items()[1]);
      press(items()[1], 'ArrowDown');
      expect(document.activeElement).toBe(items()[0]);
      press(items()[0], 'Escape');
      await fixture.whenStable();
      expect(menu()).toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button);
    });

    it("Tab and Shift+Tab from the first, a middle and the last item: the browser's step is stopped, the menu closed, the focus on the menu button - never <body>", async () => {
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
          expect(menu(), `${shift ? 'Shift+' : ''}Tab from the ${at}`).toBeNull();
          expect(document.activeElement, `${shift ? 'Shift+' : ''}Tab from the ${at}`).toBe(button);
        }
      }
    });

    it('choosing an item closes the menu and goes there', async () => {
      person.set({ name: 'ed', roles: ['EDITOR'] });
      await bar();
      await open('account');
      $<HTMLAnchorElement>('anotoki-menu a[href="/admin"]')!.click();
      await settle();
      expect(menu()).toBeNull();
      expect(router.url).toBe('/admin');
    });
  });

  describe('on a phone', () => {
    it('is the brand ("Piano"), the piano\'s dot, the language, the theme and the menu button - the sections and the person inside it', async () => {
      await bar({ phone: true });
      expect(row()).toEqual(['anotoki-brand', 'app-midi-panel', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'menu-button']);
      expect(texts('.anotoki-brand__wordmark > span')).toEqual(['Piano']);
      expect($('#midi-label')).toBeNull();
      expect($('.anotoki-top-bar__menu-button')?.getAttribute('aria-label')).toBe('Menu');

      const button = await open('phone');
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(menu()?.getAttribute('aria-label')).toBe('Menu');
      expect(texts('anotoki-menu [role="menuitem"]')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats', 'Your anotoki account', 'Sign out']);
      expect(host.querySelectorAll('anotoki-menu [role="separator"]').length).toBe(2);
      expect(texts('anotoki-menu [role="menuitem"].anotoki-menu-item--active')).toEqual(['Learn']);
      expect(texts('anotoki-menu [role="menuitem"][aria-current="page"]')).toEqual(['Learn']);
      expect(document.activeElement).toBe(items()[0]);
    });

    it('a section chosen goes there and closes the menu', async () => {
      await bar({ phone: true });
      await open('phone');
      (items().find((item) => item.textContent?.trim() === 'Stats') as HTMLAnchorElement).click();
      await settle();
      expect(router.url).toBe('/stats');
      expect(menu()).toBeNull();
    });

    it('"Not saved yet" is a dot on the menu button, said to a screen reader, and the menu\'s first line', async () => {
      unsaved.set(true);
      await bar({ phone: true });
      expect($('#save-status')).toBeNull();
      expect($('.anotoki-top-bar__menu-button .anotoki-top-bar__mark-dot')).not.toBeNull();
      const described = $('.anotoki-top-bar__menu-button')?.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      expect($(`#${described}`)?.textContent).toBe('Not saved yet');
      await open('phone');
      expect(menu()?.firstElementChild?.classList.contains('anotoki-top-bar__menu-note')).toBe(true);
      expect($('.anotoki-top-bar__menu-note strong')?.textContent).toBe('Not saved yet');
    });

    it('signed out: the sections, then Sign in', async () => {
      person.set(null);
      await bar({ phone: true });
      await open('phone');
      expect(texts('anotoki-menu [role="menuitem"]').slice(-1)).toEqual(['Sign in']);
      $<HTMLButtonElement>('.anotoki-top-bar__sign-in-item')!.click();
      await settle();
      expect(boot.signIn).toHaveBeenCalledTimes(1);
    });

    it('before the app runs, a signed-out visitor gets no menu button - its menu would hold nothing', async () => {
      person.set(null);
      loaded.set(false);
      status.set('sign-in');
      await bar({ phone: true });
      expect($('.anotoki-top-bar__menu-button')).toBeNull();
      for (const state of ['not-set-up', 'load-error', 'loading'] as BootStatus[]) {
        status.set(state);
        await fixture.whenStable();
        expect($('.anotoki-top-bar__menu-button')).toBeNull();
      }
      // Somebody signed in before the app runs: their own menu is there.
      person.set({ name: 'mia', roles: ['ADMIN'] });
      await fixture.whenStable();
      await open('phone');
      expect(texts('anotoki-menu [role="menuitem"]').slice(-1)).toEqual(['Sign out']);
    });

    it("a screen turned past the fold closes the open menu, and the desktop's row comes", async () => {
      await bar({ phone: true });
      await open('phone');
      screen.turn(false);
      await fixture.whenStable();
      expect(menu()).toBeNull();
      expect($('.anotoki-top-bar__menu-button')).toBeNull();
      expect(row()).toEqual(['anotoki-brand', 'nav', 'app-midi-panel', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'person-button']);
    });
  });

  describe('the words', () => {
    /** What a control shows: its text, but for what is hidden from everybody (the initial, the icons, a mark's description). */
    const shown = (element: Element): string => {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll('[aria-hidden="true"], .anotoki-visually-hidden, anotoki-icon').forEach((hidden) => hidden.remove());
      // Each piece apart: "anotoki" and "Piano Academy" are two spans the styles set apart.
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
            checked.push(what(control));
          }
          // The brand, the piano (but on a phone, where it shows no words) and the language at least.
          expect(checked).toEqual(expect.arrayContaining(phone ? ['brand', 'switcher'] : ['brand', 'midi-button', 'switcher']));
        });
      }
    }

    it("reads the learner's language - the family's words in this app's strings - and English in the admin panel, with its own sections, no chooser and no piano", async () => {
      await bar({ language: 'sk' });
      expect(texts('nav a')).toEqual(['Učenie', 'Tréning nôt', 'Hra z nôt', 'Skladby', 'Štatistiky']);
      expect($('.anotoki-top-bar__person-button')?.getAttribute('aria-label')).toBe('Tvoja ponuka: mia');
      expect($('.anotoki-language-switcher__switcher')?.getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
      expect(Array.from(host.querySelectorAll('anotoki-theme-toggle [role="radio"]')).map((choice) => choice.getAttribute('aria-label'))).toEqual([
        'Vzhľad: svetlý',
        'Vzhľad: tmavý',
        'Vzhľad: systémový',
      ]);
      person.set({ name: 'mia', roles: ['ADMIN'] });
      await fixture.whenStable();
      await open('account');
      // The owner's Slovak, where the kit's own would say "Administrátor", "Tvoj anotoki účet".
      expect(texts('.anotoki-top-bar__menu-role')).toEqual(['Správca']);
      expect(texts('anotoki-menu [role="menuitem"]')).toEqual(['Tvoj účet anotoki', 'Administrátorský panel', 'Odhlásiť sa']);
      press(items()[0], 'Escape');
      await fixture.whenStable();

      await router.navigateByUrl('/admin/people');
      await fixture.whenStable();
      expect(TestBed.inject(TranslationService).effectiveLanguage()).toBe('en');
      expect(texts('nav a')).toEqual(['Translations', 'Languages', 'People', 'Feedback', 'Error log', 'Audit log', 'Backups', 'Migrations']);
      expect(texts('nav a[aria-current="page"]')).toEqual(['People']);
      expect($('.anotoki-brand__brand')?.getAttribute('href')).toBe('/admin');
      // The family's admin wordmark, short at every width (eight sections leave the whole one no room): "Piano" with
      // "admin panel" under it - "anotoki Piano Academy · admin panel" in the link's name.
      expect($('.anotoki-brand__brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy · admin panel');
      expect(texts('.anotoki-brand__area')).toEqual(['Piano']);
      expect(texts('.anotoki-brand__panel')).toEqual(['admin panel']);
      expect($('.anotoki-brand__name')).toBeNull();
      // Its own fold: the admin panel's row is not the learner's.
      expect(asked).toContain(`(max-width: ${ADMIN_PHONE_BAR_MAX}px)`);
      expect(asked).toContain(`(max-width: ${ADMIN_SHORT_BRAND_MAX}px)`);
      expect($('anotoki-language-switcher')).toBeNull();
      expect($('app-midi-panel')).toBeNull();
      expect($('.anotoki-top-bar__person-button')?.getAttribute('aria-label')).toBe('Your menu: mia');
      await open('account');
      expect(texts('anotoki-menu [role="menuitem"]')).toEqual(['Your anotoki account', 'Back to Piano Academy', 'Sign out']);
      expect($('anotoki-menu a[href="/"]')?.textContent?.trim()).toBe('Back to Piano Academy');
      expect($('.anotoki-top-bar__menu-role')?.textContent).toBe('Administrator');
    });

    it('the admin panel\'s sections by role: an EDITOR has Translations alone, an ADMIN every tool - "Feedback" with how many messages are new', async () => {
      person.set({ name: 'mia', roles: ['EDITOR'] });
      await bar({ at: '/admin/translations' });
      expect(texts('nav a')).toEqual(['Translations']);

      person.set({ name: 'mia', roles: ['ADMIN'] });
      await fixture.whenStable();
      expect(texts('nav a')).toEqual(['Translations', 'Languages', 'People', 'Feedback', 'Error log', 'Audit log', 'Backups', 'Migrations']);
      expect(Array.from(host.querySelectorAll('nav a')).map((link) => link.getAttribute('href'))).toEqual([
        '/admin/translations',
        '/admin/languages',
        '/admin/people',
        '/admin/feedback',
        '/admin/errors',
        '/admin/audit',
        '/admin/backups',
        '/admin/migrations',
      ]);
      // Nothing new (or not known yet): no number.
      expect($('nav .anotoki-top-bar__badge')).toBeNull();
      unread.set(0);
      await fixture.whenStable();
      expect($('nav .anotoki-top-bar__badge')).toBeNull();
      // Three new messages: the number beside "Feedback" - no mail is sent, so this is how an ADMIN hears of one.
      unread.set(3);
      await fixture.whenStable();
      expect(texts('nav .anotoki-top-bar__badge')).toEqual(['3']);
      expect($('nav a[href="/admin/feedback"] .anotoki-top-bar__badge')).not.toBeNull();
      // Never on the learner's sections.
      await router.navigateByUrl('/');
      await fixture.whenStable();
      expect($('nav .anotoki-top-bar__badge')).toBeNull();
    });

    it('the admin panel on a phone: Piano\'s own short form beside the mark, "admin panel" under it, both in the brand link\'s name', async () => {
      person.set({ name: 'mia', roles: ['ADMIN'] });
      await bar({ phone: true, at: '/admin/people' });
      expect(texts('.anotoki-brand__area')).toEqual(['Piano']);
      expect(texts('.anotoki-brand__panel')).toEqual(['admin panel']);
      expect($('.anotoki-brand__name')).toBeNull();
      expect($('.anotoki-brand__brand')?.getAttribute('aria-label')).toBe('anotoki Piano Academy · admin panel');
    });

    it('while an update waits: an ADMIN in the admin panel has Migrations alone; elsewhere, and anybody else, no sections', async () => {
      person.set({ name: 'mia', roles: ['ADMIN'] });
      status.set('waiting');
      onlyMigrations.set(true);
      try {
        await bar({ at: '/admin/migrations' });
        TestBed.inject(SiteStatus).report('update_pending');
        await fixture.whenStable();
        expect(texts('nav a')).toEqual(['Migrations']);
        expect(texts('nav a[aria-current="page"]')).toEqual(['Migrations']);
        await router.navigateByUrl('/');
        await fixture.whenStable();
        expect($('nav')).toBeNull();
        TestBed.resetTestingModule();
        onlyMigrations.set(false);
        await bar({ at: '/admin/migrations' });
        expect($('nav')).toBeNull();
      } finally {
        status.set('ready');
        onlyMigrations.set(false);
      }
    });

    it("an update that comes in the middle of practising: the sections go while the status page stands in the view's place - and come back with the site", async () => {
      await bar({ at: '/trainer' });
      expect(texts('nav a')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
      const site = TestBed.inject(SiteStatus);
      site.report('update_pending');
      await fixture.whenStable();
      expect($('nav')).toBeNull();
      site.markReady();
      await fixture.whenStable();
      expect(texts('nav a')).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    });

    it("the admin panel's sections by role: an EDITOR has Translations alone, somebody with no role none", async () => {
      person.set({ name: 'ed', roles: ['EDITOR'] });
      await bar({ at: '/admin/translations' });
      expect(texts('nav a')).toEqual(['Translations']);
      TestBed.resetTestingModule();
      person.set({ name: 'mia', roles: [] });
      await bar({ at: '/admin/translations' });
      expect($('nav')).toBeNull();
    });
  });

  describe('signing out', () => {
    const signOutItem = (): HTMLButtonElement => $<HTMLButtonElement>('.anotoki-top-bar__sign-out-item')!;

    it('settles what is waiting first - the family\'s item waits, "Saving…" - then signs out when nothing would be lost', async () => {
      await bar({ language: 'sk' });
      const button = await open('account');
      signOutItem().click();
      await fixture.whenStable();
      expect(boot.settleBeforeSignOut).toHaveBeenCalledTimes(1);
      expect(signOutItem().disabled).toBe(true);
      expect(signOutItem().getAttribute('aria-busy')).toBe('true');
      expect(signOutItem().querySelector('anotoki-spinner')).not.toBeNull();
      // The kit's own word while it waits, in its (informal) Slovak.
      expect(signOutItem().textContent?.trim()).toBe('Ukladá sa…');
      expect(document.activeElement).toBe(button);
      expect(boot.signOut).not.toHaveBeenCalled();

      settled(false);
      await settle();
      expect(TestBed.inject(ConfirmService).pending()).toBeNull();
      expect(boot.signOut).toHaveBeenCalledTimes(1);
    });

    it("asks in the learner's language when progress would be lost - the safe answer first - and stays signed in on no", async () => {
      await bar({ language: 'sk' });
      await open('account');
      signOutItem().click();
      settled(true);
      await settle();
      // The menu goes; the family's question (ConfirmService) asks, in the learner's words.
      expect(menu()).toBeNull();
      const confirm = TestBed.inject(ConfirmService);
      expect(confirm.pending()).toEqual(
        expect.objectContaining({
          title: 'Odhlásiť sa bez posledného postupu?',
          message: 'Časť tvojho postupu sa zatiaľ nepodarilo uložiť. Ak sa teraz odhlásiš, stratí sa.',
          confirmLabel: 'Aj tak sa odhlásiť',
          cancelLabel: 'Neodhlasovať sa',
          tone: 'danger',
        }),
      );

      confirm.settle(false);
      await settle();
      expect(boot.signOut).not.toHaveBeenCalled();
      await open('account');
      expect(signOutItem().disabled).toBe(false);
      expect(signOutItem().querySelector('anotoki-spinner')).toBeNull();
      expect(signOutItem().textContent?.trim()).toBe('Odhlásiť sa');
    });

    it('signs out on yes', async () => {
      await bar();
      await open('account');
      signOutItem().click();
      settled(true);
      await settle();
      TestBed.inject(ConfirmService).settle(true);
      await settle();
      expect(boot.signOut).toHaveBeenCalledTimes(1);
    });
  });
});
