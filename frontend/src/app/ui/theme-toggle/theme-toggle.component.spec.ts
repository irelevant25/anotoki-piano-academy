import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { ThemeService } from '../../core/theme/theme.service';
import { ThemeToggleComponent } from './theme-toggle.component';

const ENGLISH = {
  'theme.auto': 'Theme: automatic',
  'theme.light': 'Theme: light',
  'theme.autoSpoken': 'Theme: automatic (press to change)',
  'theme.lightSpoken': 'Theme: light (press to change)',
  'theme.notSaved': 'The theme could not be saved to your anotoki account.',
};
const SLOVAK = {
  'theme.auto': 'Vzhľad: systémový',
  'theme.light': 'Vzhľad: svetlý',
  'theme.autoSpoken': 'Vzhľad: systémový (stlačením ho zmeníš)',
  'theme.lightSpoken': 'Vzhľad: svetlý (stlačením ho zmeníš)',
  'theme.notSaved': 'Vzhľad sa nepodarilo uložiť do tvojho účtu anotoki.',
};

describe('ThemeToggleComponent: the bar’s theme button, and why a choice did not reach the account', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let host: HTMLElement;
  let theme: ThemeService;

  const button = (): HTMLButtonElement => host.querySelector('#theme-toggle')!;
  const note = (): HTMLElement | null => host.querySelector('#theme-not-saved');

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    theme = TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(ThemeToggleComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
  });

  it('says nothing while nothing went wrong', () => {
    expect(note()).toBeNull();
    expect(button().getAttribute('aria-label')).toBe('Vzhľad: systémový (stlačením ho zmeníš)');
  });

  it('says it under the button, in the page’s language, when the account would not take the theme - until the next press', async () => {
    theme.notSaved.set(true);
    await fixture.whenStable();
    expect(note()?.getAttribute('role')).toBe('alert');
    expect(note()?.textContent?.trim()).toBe('Vzhľad sa nepodarilo uložiť do tvojho účtu anotoki.');

    // A click on the note itself is not "elsewhere".
    note()!.click();
    await fixture.whenStable();
    expect(note()).not.toBeNull();

    button().click();
    await fixture.whenStable();
    expect(theme.mode()).toBe('light');
    expect(note()).toBeNull();
  });

  it('lets the note go at a click anywhere else on the page', async () => {
    theme.notSaved.set(true);
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();
    expect(note()).toBeNull();
    expect(theme.notSaved()).toBe(false);
  });
});
