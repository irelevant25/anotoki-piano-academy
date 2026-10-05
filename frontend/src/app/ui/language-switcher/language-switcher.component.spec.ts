import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { TEST_LANGUAGES, provideTestTranslations } from '../../core/testing/test-translations';
import { LanguageSwitcherComponent } from './language-switcher.component';

const ENGLISH = { 'language.button': 'Language: {name} ({code})', 'language.notLoaded': 'The language could not be loaded. Please try again.' };
const SLOVAK = { 'language.button': 'Jazyk: {name} ({code})', 'language.notLoaded': 'Jazyk sa nepodarilo načítať. Skús to znova.' };

describe('LanguageSwitcherComponent', () => {
  let fixture: ComponentFixture<LanguageSwitcherComponent>;
  let host: HTMLElement;

  const button = () => host.querySelector<HTMLButtonElement>('button.switcher')!;
  const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  const note = () => host.querySelector<HTMLElement>('[role="alert"]');

  async function open(): Promise<void> {
    button().click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    fixture = TestBed.createComponent(LanguageSwitcherComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is one button: the code in capitals, named with the language as its speakers write it - and with the code it shows', () => {
    expect(host.hidden).toBe(false);
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(button().textContent?.trim()).toBe('SK');
    expect(button().getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
    expect(button().getAttribute('aria-haspopup')).toBe('menu');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    // Label in name (WCAG 2.5.3): a voice user says what they see - "click SK".
    expect(button().getAttribute('aria-label')).toContain(button().textContent?.trim() ?? '-');
  });

  it('opens a menu of the languages on offer, each in its own name and saying which language that is', async () => {
    await open();

    expect(button().getAttribute('aria-expanded')).toBe('true');
    const menu = host.querySelector('[role="menu"]')!;
    expect(menu.id).toBe(button().getAttribute('aria-controls'));
    expect(menu.getAttribute('aria-labelledby')).toBe(button().id);
    expect(items().map((item) => [item.querySelector('.menu-label')?.textContent?.trim(), item.getAttribute('lang'), item.getAttribute('aria-checked')])).toEqual([
      ['English', 'en', 'false'],
      ['Slovenčina', 'sk', 'true'],
    ]);
    // Focus goes into the menu, onto the language in use.
    expect(document.activeElement).toBe(items()[1]);
  });

  it('marks the language in use with a check mark - a character, which a screen reader is not told about', async () => {
    await open();

    expect(items()[0].querySelector('.check')).toBeNull();
    const check = items()[1].querySelector('.check')!;
    expect(check.textContent).toBe('✓');
    expect(check.getAttribute('aria-hidden')).toBe('true');
  });

  it('moves with the arrow keys, and closes on Escape and on a click outside', async () => {
    await open();
    items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items()[0]);
    items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items()[1]);
    items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(items()[0]);
    items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(items()[1]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(button());

    await open();
    document.body.click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
  });

  describe('on a narrow screen', () => {
    /**
     * jsdom lays nothing out: every element of the chooser is given the box it
     * would have with its left edge at `left` (160 px wide), moved by the
     * `--shift` the component has set on it - in a screen 390 px wide.
     */
    function layOut(left: number): void {
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(390);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const x = left + (parseFloat(this.style.getPropertyValue('--shift')) || 0);
        return new DOMRect(x, 600, 160, 86);
      });
    }
    const shift = (element: Element | null) => (element as HTMLElement | null)?.style.getPropertyValue('--shift');

    it('moves the menu in by as much as it takes to stand wholly on the screen, when the button is at its right edge', async () => {
      layOut(238);
      await open();

      // 238 + 160 = 398: 8 px past the screen, and 8 px more to keep off its edge.
      expect(shift(host.querySelector('.menu'))).toBe('-16px');
    });

    it('never past the left edge, and not at all where the menu fits', async () => {
      layOut(-30);
      await open();
      expect(shift(host.querySelector('.menu'))).toBe('38px');

      await open();
      vi.restoreAllMocks();
      layOut(100);
      await open();
      expect(shift(host.querySelector('.menu'))).toBe('0px');
    });

    it('moves the note that a language could not be loaded in the same way', async () => {
      vi.spyOn(TestBed.inject(TranslationService), 'setLanguage').mockResolvedValue(false);
      layOut(252);
      await open();
      items()[0].click();
      await fixture.whenStable();

      expect(shift(note())).toBe('-30px');
    });
  });

  it('switches the language of the page, and remembers it on this device', async () => {
    await open();
    items()[0].click();
    await fixture.whenStable();

    expect(TestBed.inject(TranslationService).language()).toBe('en');
    expect(localStorage.getItem('piano-academy:language')).toBe('en');
    expect(button().textContent?.trim()).toBe('EN');
    expect(button().getAttribute('aria-label')).toBe('Language: English (EN)');
    expect(items()).toEqual([]);
    expect(note()).toBeNull();
  });

  it('says so beside the button, and stays as it was, when the language could not be loaded - until the next press', async () => {
    const i18n = TestBed.inject(TranslationService);
    vi.spyOn(i18n, 'setLanguage').mockResolvedValue(false);
    await open();
    items()[0].click();
    await fixture.whenStable();

    expect(i18n.language()).toBe('sk');
    expect(button().textContent?.trim()).toBe('SK');
    // In the language the page is still in.
    expect(note()?.textContent?.trim()).toBe('Jazyk sa nepodarilo načítať. Skús to znova.');

    await open();
    expect(note()).toBeNull();
  });

  it('takes a second choice while the first is on its way - the last one wins, and the one overtaken is not called a failure', async () => {
    const i18n = TestBed.inject(TranslationService);
    let overtaken!: (switched: boolean) => void;
    const slow = new Promise<boolean>((done) => (overtaken = done));
    const setLanguage = vi.spyOn(i18n, 'setLanguage').mockImplementation((code: string) => (code === 'en' ? slow : Promise.resolve(true)));

    await open();
    items()[0].click();
    await fixture.whenStable();
    expect(button().getAttribute('aria-busy')).toBe('true');

    // A change of mind while English is on its way: back to Slovak, the language still on the page.
    await open();
    items()[1].click();
    await fixture.whenStable();
    expect(setLanguage.mock.calls).toEqual([['en'], ['sk']]);
    expect(button().hasAttribute('aria-busy')).toBe(false);

    // The first choice comes back as the service answers one that was overtaken.
    overtaken(false);
    await fixture.whenStable();
    expect(note()).toBeNull();
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(button().textContent?.trim()).toBe('SK');
  });

  it('goes back to the language on the page when that is chosen while another is on its way - with the real service', async () => {
    const i18n = TestBed.inject(TranslationService);
    let answer!: (bundle: unknown) => void;
    const slow = new Promise<unknown>((done) => (answer = done));
    // What the service would fetch for English: held back until the person has changed their mind.
    const fetch = vi.spyOn(i18n as unknown as { fetchBundle(code: string): Promise<unknown> }, 'fetchBundle').mockReturnValue(slow);

    await open();
    items()[0].click();
    await fixture.whenStable();
    await open();
    items()[1].click();
    await fixture.whenStable();

    answer({ language: 'en', languages: i18n.languages(), values: ENGLISH });
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(i18n.language()).toBe('sk');
    expect(localStorage.getItem('piano-academy:language')).toBe('sk');
    expect(button().textContent?.trim()).toBe('SK');
    expect(note()).toBeNull();
  });
});

describe('LanguageSwitcherComponent with nothing to choose between', () => {
  afterEach(() => localStorage.clear());

  it('is not drawn while only one language is on offer', async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations({ 'language.button': 'Language: {name} ({code})' }, { languages: [TEST_LANGUAGES[0]] })] });
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.hidden).toBe(true);
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('is not drawn while the app has no strings from the server: the list of languages comes with the bundle', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const auth = { user: () => null, signedIn: () => false, onAuthChange: () => () => undefined };
    // The real service, with no bundle: the app is not set up, so nothing was asked for.
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: HttpClient, useValue: { get: () => expect.unreachable('nothing is asked for') } },
      ],
    });
    await TestBed.inject(TranslationService).init(false);
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.hidden).toBe(true);
    // Nothing was worded, so no key was looked up - none is missing.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
