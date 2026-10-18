import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { KeyboardModel } from './keyboard-model';
import { PianoKeyboardComponent } from './piano-keyboard.component';

const ENGLISH = { 'keyboard.label': 'On-screen piano keyboard' };
const SLOVAK = { 'keyboard.label': 'Klaviatúra na obrazovke' };

describe('PianoKeyboardComponent', () => {
  let fixture: ComponentFixture<PianoKeyboardComponent>;

  const svg = () => (fixture.nativeElement as HTMLElement).querySelector('svg.piano-keyboard')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    fixture = TestBed.createComponent(PianoKeyboardComponent);
    fixture.componentRef.setInput('model', new KeyboardModel());
    await fixture.whenStable();
  });

  it("is named for a screen reader in the page's language, from a key", () => {
    expect(svg().getAttribute('role')).toBe('img');
    expect(svg().getAttribute('aria-label')).toBe('Klaviatúra na obrazovke');
  });

  it('is named again when the language changes', async () => {
    expect(await TestBed.inject(TranslationService).setLanguage('en')).toBe(true);
    await fixture.whenStable();
    expect(svg().getAttribute('aria-label')).toBe('On-screen piano keyboard');
  });
});
