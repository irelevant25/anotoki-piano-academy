import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LanguageSwitcherComponent, ThemeService, ThemeToggleComponent } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { TEST_LANGUAGES, provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AnotokiWords, LIBRARY_WORDS } from '@anotoki/lib/ui/config';
import { type AnotokiPreferenceChanges, type AnotokiPreferences, type AnotokiSavedPreferences, type AnotokiTheme } from './auth/anotoki-auth';
import { AuthService } from './auth/auth.service';
import { THEME_COLOR, THEME_KEY, provideFamilyKit } from './family-kit';
import { KEPT_LIBRARY_ENGLISH } from './i18n/kept-english';
import { provideSiteTranslations } from './i18n/site-translations';
import { provideTestKit } from './testing/test-kit';

/** The family's language chooser and theme switch, as the top bar draws them (the bar's own spec has the rest). */
@Component({
  selector: 'app-kit-host',
  imports: [LanguageSwitcherComponent, ThemeToggleComponent],
  template: '<anotoki-language-switcher /><anotoki-theme-toggle />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class KitHostComponent {}

/** The kit's words as this app's database has them since its migration 009: the library's keys, with this app's wording copied there. */
const ENGLISH = {
  'anotoki.language.button': 'Language: {name} ({code})',
  'anotoki.language.notLoaded': 'The language could not be loaded. Please try again.',
  'anotoki.language.notSaved': 'The language could not be saved to your anotoki account - it holds for this visit only.',
  'anotoki.theme.auto': 'Theme: automatic',
  'anotoki.theme.light': 'Theme: light',
  'anotoki.theme.dark': 'Theme: dark',
  'anotoki.theme.notSaved': 'The theme could not be saved to your anotoki account.',
  'anotoki.topbar.account': 'Your anotoki account',
  'anotoki.topbar.roleAdmin': 'Administrator',
  'anotoki.topbar.signOut': 'Sign out',
  'anotoki.topbar.signIn': 'Sign in',
};

/** The owner's Slovak - where it is not the kit's own ("tvojho účtu anotoki", "Správca"), the database's is the one shown. */
const SLOVAK = {
  'anotoki.language.button': 'Jazyk: {name} ({code})',
  'anotoki.language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.',
  'anotoki.language.notSaved': 'Jazyk sa nepodarilo uložiť do tvojho účtu anotoki – platí len počas tejto návštevy.',
  'anotoki.theme.auto': 'Vzhľad: systémový',
  'anotoki.theme.light': 'Vzhľad: svetlý',
  'anotoki.theme.dark': 'Vzhľad: tmavý',
  'anotoki.theme.notSaved': 'Vzhľad sa nepodarilo uložiť do tvojho účtu anotoki.',
  'anotoki.topbar.account': 'Tvoj účet anotoki',
  'anotoki.topbar.roleAdmin': 'Správca',
  'anotoki.topbar.signOut': 'Odhlásiť sa',
  'anotoki.topbar.signIn': 'Prihlásiť sa',
};

/** A save to the account the spec answers by hand: what was sent, and how to answer it. */
interface PendingSave {
  changes: AnotokiPreferenceChanges;
  /** As the SDK does: the account's new preferences (and language) into user() first, then the promise resolves. */
  accept(): void;
  refuse(code?: string): void;
}

describe('the family\'s kit, wired to Piano Academy (core/family-kit.ts)', () => {
  let fixture: ComponentFixture<KitHostComponent>;
  let host: HTMLElement;
  /** The account: its language (the token's locale) - null: nobody signed in - and its preferences (null: an IAM that keeps none). */
  const user = signal<{ locale: string | null } | null>(null);
  const preferences = signal<AnotokiPreferences | null>(null);
  /** Whether the sign-in settings were read - what the strings may be asked for on (core/i18n/site-translations.ts: canAsk). */
  let settingsRead = true;
  let saves: PendingSave[];
  const auth = {
    user,
    signedIn: () => user() !== null,
    onAuthChange: () => () => undefined,
    preferences,
    settingsRead: () => settingsRead,
    userKey: () => (user() !== null ? '7' : null),
    isStaff: () => false,
    isAdmin: () => false,
    savePreferences: vi.fn(
      (changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> =>
        new Promise((resolve, reject) => {
          saves.push({
            changes,
            accept: () => {
              const now = { ...(preferences() ?? { theme: 'auto', date_format: null, time_format: null }), ...(changes.theme ? { theme: changes.theme } : {}) } as AnotokiPreferences;
              preferences.set(now);
              if (changes.language) user.set({ locale: changes.language });
              resolve({ locale: changes.language ?? user()?.locale ?? null, preferences: now });
            },
            refuse: (code = 'network') => reject(Object.assign(new Error('The IAM refused the change'), { code })),
          });
        }),
    ),
  };
  const sent = (): AnotokiPreferenceChanges[] => saves.map((save) => save.changes);

  const switcher = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>('.anotoki-language-switcher__switcher')!;
  const languages = (): HTMLButtonElement[] => Array.from(document.querySelectorAll<HTMLButtonElement>('anotoki-language-switcher [role="menuitemradio"]'));
  const note = (of: 'language' | 'theme'): string | null => host.querySelector(`anotoki-${of === 'language' ? 'language-switcher' : 'theme-toggle'} [role="alert"]`)?.textContent?.trim() ?? null;
  const themes = (): HTMLButtonElement[] => Array.from(host.querySelectorAll<HTMLButtonElement>('anotoki-theme-toggle [role="radio"]'));

  /** Lets a click, the promises it starts and the change detection after them run out. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
    }
  }

  /** The kit drawn, its words from these strings (Slovak unless said otherwise) - the translations wired as the app wires them. */
  async function draw(language: 'sk' | 'en' = 'sk'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        ...(language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)),
        provideSiteTranslations(),
        { provide: AuthService, useValue: auth },
        provideFamilyKit(),
      ],
    });
    fixture = TestBed.createComponent(KitHostComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  async function choose(index: number): Promise<void> {
    switcher().click();
    await settle();
    languages()[index].click();
    await settle();
  }

  // The family's menus and boxes ask jsdom for what it lacks (checkVisibility(), popovers).
  beforeAll(() => provideTestKit());

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    user.set(null);
    preferences.set(null);
    settingsRead = true;
    saves = [];
    auth.savePreferences.mockClear();
  });

  afterEach(() => {
    host?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  describe('the kit\'s words', () => {
    it('are the database\'s strings of the library\'s keys - this app\'s wording, the owner\'s - and the kit\'s own informal Slovak for the rest', async () => {
      await draw();
      const words = TestBed.inject(AnotokiWords);
      expect(words.t('topbar.account')).toBe('Tvoj účet anotoki');
      expect(words.t('topbar.roleAdmin')).toBe('Správca');
      expect(words.t('topbar.signOut')).toBe('Odhlásiť sa');
      expect(words.t('topbar.signIn')).toBe('Prihlásiť sa');
      expect(words.t('theme.notSaved')).toBe('Vzhľad sa nepodarilo uložiť do tvojho účtu anotoki.');
      // No string in the bundle for these: the kit's own.
      expect(words.t('theme.label')).toBe('Vzhľad');
      expect(words.t('topbar.saving')).toBe('Ukladá sa…');
      expect(words.lang()).toBe('sk');
    });

    it('are English in the admin panel, whatever the app is read in - the bundle\'s English', async () => {
      await draw();
      TestBed.inject(TranslationService).noteAddress('/admin/translations');
      const words = TestBed.inject(AnotokiWords);
      expect(words.lang()).toBe('en');
      expect(words.t('topbar.account')).toBe('Your anotoki account');
      expect(words.t('theme.light')).toBe('Theme: light');
      TestBed.inject(TranslationService).noteAddress('/stats');
      expect(words.t('theme.light')).toBe('Vzhľad: svetlý');
    });

    it('are never a key: a library word the database has no string for reads the kit\'s own - and warns of nothing', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      TestBed.configureTestingModule({ providers: [...provideTestTranslations({}), provideSiteTranslations(), { provide: AuthService, useValue: auth }, provideFamilyKit()] });
      expect(TestBed.inject(AnotokiWords).t('topbar.account')).toBe('Your anotoki account');
      expect(warn).not.toHaveBeenCalled();
    });

    it('while there are no strings at all: this app\'s English for the theme switch (kept-english.ts), the kit\'s own English for the rest', async () => {
      settingsRead = false;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const http = { get: vi.fn() };
      TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: http }, provideSiteTranslations(), { provide: AuthService, useValue: auth }, provideFamilyKit()] });
      await TestBed.inject(TranslationService).init();
      const words = TestBed.inject(AnotokiWords);
      expect(words.t('theme.light')).toBe('Theme: light');
      expect(words.t('theme.dark')).toBe('Theme: dark');
      expect(words.t('theme.auto')).toBe('Theme: automatic');
      expect(words.t('topbar.signIn')).toBe('Sign in');
      expect(words.t('ui.loading')).toBe('Loading…');
      expect(http.get).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('kept in code only where this app says a library word its own way: each a library key, never the library\'s own words again', () => {
      const library: Readonly<Record<string, string>> = LIBRARY_WORDS.en;
      for (const [key, english] of Object.entries(KEPT_LIBRARY_ENGLISH)) {
        expect(Object.hasOwn(library, key), key).toBe(true);
        expect(english, key).not.toBe(library[key]);
      }
    });
  });

  describe('the language chooser: the family\'s, on this app\'s languages', () => {
    it('is one button: the code, named with the language as its speakers write it and the code it shows - and a menu of the languages, each in its own name', async () => {
      await draw();
      expect(switcher().textContent?.trim()).toBe('SK');
      expect(switcher().getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
      switcher().click();
      await settle();
      expect(languages().map((item) => [item.textContent?.trim(), item.getAttribute('lang'), item.getAttribute('aria-checked')])).toEqual([
        ['English', 'en', 'false'],
        ['Slovenčina', 'sk', 'true'],
      ]);
    });

    it('switches the page, and remembers it on this device - under the key this app always had', async () => {
      await draw();
      await choose(0);
      expect(TestBed.inject(TranslationService).language()).toBe('en');
      expect(localStorage.getItem('piano-academy:language')).toBe('en');
      expect(switcher().textContent?.trim()).toBe('EN');
      expect(switcher().getAttribute('aria-label')).toBe('Language: English (EN)');
      expect(note('language')).toBeNull();
    });

    it('says so under the button, and stays as it was, when the language could not be loaded - in the page\'s language', async () => {
      await draw();
      const i18n = TestBed.inject(TranslationService);
      vi.spyOn(i18n, 'setLanguage').mockResolvedValue(false);
      await choose(0);
      expect(i18n.language()).toBe('sk');
      expect(note('language')).toBe('Jazyk sa nepodarilo načítať. Skús to znova.');
    });

    it('goes back to the language on the page when that is chosen while another is on its way - with the real service', async () => {
      await draw();
      const i18n = TestBed.inject(TranslationService);
      let answer!: (bundle: unknown) => void;
      const slow = new Promise<unknown>((done) => (answer = done));
      // What the service would fetch for English: held back until the person has changed their mind.
      const fetch = vi.spyOn(i18n as unknown as { fetchBundle(code: string): Promise<unknown> }, 'fetchBundle').mockReturnValue(slow);
      switcher().click();
      await settle();
      languages()[0].click();
      await settle();
      switcher().click();
      await settle();
      languages()[1].click();
      await settle();

      answer({ language: 'en', languages: i18n.languages(), values: ENGLISH });
      await settle();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(i18n.language()).toBe('sk');
      expect(localStorage.getItem('piano-academy:language')).toBe('sk');
      expect(switcher().textContent?.trim()).toBe('SK');
      expect(note('language')).toBeNull();
    });

    describe('for somebody signed in: the choice is the anotoki account\'s language too', () => {
      beforeEach(() => {
        user.set({ locale: 'sk' });
        preferences.set({ theme: 'auto', date_format: null, time_format: null });
      });

      it('saves the language to the account once the page has switched to it', async () => {
        await draw();
        await choose(0);
        expect(TestBed.inject(TranslationService).language()).toBe('en');
        expect(sent()).toEqual([{ language: 'en' }]);
        saves[0].accept();
        await settle();
        expect(note('language')).toBeNull();
      });

      it('saves nothing when the language could not be loaded: the page stayed where it was', async () => {
        await draw();
        vi.spyOn(TestBed.inject(TranslationService), 'setLanguage').mockResolvedValue(false);
        await choose(0);
        expect(sent()).toEqual([]);
      });

      it('saves the language already on the page when the account has another - a link\'s, or one the site chose while it lacked the account\'s', async () => {
        user.set({ locale: 'en' });
        await draw();
        const fetch = vi.spyOn(TestBed.inject(TranslationService) as unknown as { fetchBundle(code: string): Promise<unknown> }, 'fetchBundle');
        await choose(1);
        // Its words are on the page already: nothing is fetched for it.
        expect(fetch).not.toHaveBeenCalled();
        expect(sent()).toEqual([{ language: 'sk' }]);
        // The account has it now: nothing more to save.
        saves[0].accept();
        await choose(1);
        expect(sent()).toEqual([{ language: 'sk' }]);
      });

      it('says it under the button when the account would not take the language - the page stays in it for this visit - until the next choice', async () => {
        await draw();
        await choose(0);
        saves[0].refuse('access_denied');
        await settle();
        expect(TestBed.inject(TranslationService).language()).toBe('en');
        // In the language the page is in now.
        expect(note('language')).toBe('The language could not be saved to your anotoki account - it holds for this visit only.');
        // A click anywhere else puts it away.
        document.body.click();
        await settle();
        expect(note('language')).toBeNull();
      });

      it('keeps a language the IAM does not offer as this site\'s own, and says nothing', async () => {
        await draw();
        await choose(0);
        saves[0].refuse('invalid_request');
        await settle();
        expect(note('language')).toBeNull();
        expect(TestBed.inject(TranslationService).language()).toBe('en');
      });
    });

    it('saves nothing for a visitor, or while the IAM keeps no preferences', async () => {
      await draw();
      await choose(0);
      user.set({ locale: 'sk' });
      await choose(1);
      expect(sent()).toEqual([]);
      expect(TestBed.inject(TranslationService).language()).toBe('sk');
    });

    it('is not drawn while one language is on offer, nor while the app has no strings (the list comes with them)', async () => {
      TestBed.configureTestingModule({ providers: [...provideTestTranslations({}, { languages: [TEST_LANGUAGES[0]] }), provideSiteTranslations(), { provide: AuthService, useValue: auth }, provideFamilyKit()] });
      fixture = TestBed.createComponent(KitHostComponent);
      host = fixture.nativeElement;
      await fixture.whenStable();
      expect(host.querySelector('anotoki-language-switcher button')).toBeNull();

      host.remove();
      TestBed.resetTestingModule();
      // Not set up: the sign-in settings could not be read, so nothing is asked for.
      settingsRead = false;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      TestBed.configureTestingModule({
        providers: [{ provide: AuthService, useValue: auth }, { provide: HttpClient, useValue: { get: () => expect.unreachable('nothing is asked for') } }, provideSiteTranslations(), provideFamilyKit()],
      });
      await TestBed.inject(TranslationService).init();
      fixture = TestBed.createComponent(KitHostComponent);
      host = fixture.nativeElement;
      await fixture.whenStable();
      expect(host.querySelector('anotoki-language-switcher button')).toBeNull();
      // Nothing was worded that the app lacks: no key looked up and missing.
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('the theme: the family\'s ThemeService and switch, the account\'s theme for somebody signed in', () => {
    const account = (theme: AnotokiTheme): AnotokiPreferences => ({ theme, date_format: null, time_format: null });

    it('signed out: this device\'s theme - kept under this app\'s key for the kit\'s theme-boot.js - and nothing goes to an account', async () => {
      localStorage.setItem(THEME_KEY, 'dark');
      await draw();
      expect(TestBed.inject(ThemeService).mode()).toBe('dark');
      expect(document.documentElement.dataset['theme']).toBe('dark');
      expect(themes().map((choice) => choice.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);

      themes()[0].click();
      await settle();
      expect(localStorage.getItem(THEME_KEY)).toBe('light');
      themes()[2].click();
      await settle();
      expect(localStorage.getItem(THEME_KEY)).toBeNull();
      expect(sent()).toEqual([]);
    });

    it('names its three choices in this app\'s words - the database\'s, under the library\'s keys', async () => {
      await draw();
      expect(themes().map((choice) => choice.getAttribute('aria-label') ?? choice.textContent?.trim())).toEqual(['Vzhľad: svetlý', 'Vzhľad: tmavý', 'Vzhľad: systémový']);
    });

    it('signed in: the account\'s theme from the first moment, the browser\'s chrome in this app\'s colours - and a choice saved to the account', async () => {
      user.set({ locale: 'sk' });
      preferences.set(account('dark'));
      vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener: () => undefined, removeEventListener: () => undefined }));
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
      try {
        await draw();
        expect(TestBed.inject(ThemeService).mode()).toBe('dark');
        expect(meta.content).toBe(THEME_COLOR.dark);

        themes()[0].click();
        await settle();
        expect(sent()).toEqual([{ theme: 'light' }]);
        saves[0].accept();
        await settle();
        expect(meta.content).toBe(THEME_COLOR.light);
        expect(note('theme')).toBeNull();
      } finally {
        meta.remove();
      }
    });

    it('a choice the account would not take: the account\'s theme back, and the note under the switch in this app\'s words - until a click elsewhere', async () => {
      user.set({ locale: 'sk' });
      preferences.set(account('light'));
      await draw();
      themes()[1].click();
      await settle();
      expect(TestBed.inject(ThemeService).mode()).toBe('dark');
      saves[0].refuse('access_denied');
      await settle();
      expect(TestBed.inject(ThemeService).mode()).toBe('light');
      expect(note('theme')).toBe('Vzhľad sa nepodarilo uložiť do tvojho účtu anotoki.');
      document.body.click();
      await settle();
      expect(note('theme')).toBeNull();
    });
  });
});
