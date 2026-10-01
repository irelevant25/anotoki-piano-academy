import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../testing/test-translations';
import { LocalDatePipe } from './local-date.pipe';
import { TranslatePluralPipe } from './translate-plural.pipe';
import { TranslatePipe } from './translate.pipe';
import { TranslationService } from './translation.service';

const ENGLISH = {
  'common.close': 'Close',
  'player.wrong.tryAgain': 'That was {played} - this is {target}.',
  'home.due.one': '{count} note is due for review.',
  'home.due.few': '{count} notes are due for review.',
  'home.due.other': '{count} notes are due for review.',
  'meet.instruction.one': 'This is your new note. Find the blue key and press it {times} times.',
  'meet.instruction.few': 'These are your new notes. Find the blue key for each and press it {times} times.',
  'meet.instruction.other': 'These are your new notes. Find the blue key for each and press it {times} times.',
};
const SLOVAK = {
  'common.close': 'Zavrieť',
  'player.wrong.tryAgain': 'To bolo {played} – toto je {target}.',
  'home.due.one': 'Na zopakovanie čaká {count} nota.',
  'home.due.few': 'Na zopakovanie čakajú {count} noty.',
  'home.due.other': 'Na zopakovanie čaká {count} nôt.',
  'meet.instruction.one': 'Toto je tvoja nová nota. Nájdi modrý kláves a stlač ho {times}-krát.',
  'meet.instruction.few': 'Toto sú tvoje nové noty. Pri každej nájdi modrý kláves a stlač ho {times}-krát.',
  'meet.instruction.other': 'Toto sú tvoje nové noty. Pri každej nájdi modrý kláves a stlač ho {times}-krát.',
};

function pipes(language: 'en' | 'sk') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH), TranslatePipe, TranslatePluralPipe, LocalDatePipe],
  });
  return {
    i18n: TestBed.inject(TranslationService),
    translate: TestBed.inject(TranslatePipe),
    plural: TestBed.inject(TranslatePluralPipe),
    date: TestBed.inject(LocalDatePipe),
  };
}

describe('the translate pipes', () => {
  it('word a key, and fill its placeholders - a note name goes in as it is, in every language', () => {
    expect(pipes('en').translate.transform('player.wrong.tryAgain', { played: 'D4', target: 'B4' })).toBe('That was D4 - this is B4.');
    expect(pipes('sk').translate.transform('player.wrong.tryAgain', { played: 'D4', target: 'B4' })).toBe('To bolo D4 – toto je B4.');
  });

  it('pick the plural form, and carry more placeholders beside the number', () => {
    const { plural } = pipes('sk');
    expect(plural.transform('home.due', 1)).toBe('Na zopakovanie čaká 1 nota.');
    expect(plural.transform('home.due', 4)).toBe('Na zopakovanie čakajú 4 noty.');
    expect(plural.transform('home.due', 5)).toBe('Na zopakovanie čaká 5 nôt.');
    // A family on the number of new notes; how often each is pressed is another number, written as it is.
    expect(plural.transform('meet.instruction', 1, { times: 3 })).toBe('Toto je tvoja nová nota. Nájdi modrý kláves a stlač ho 3-krát.');
    expect(plural.transform('meet.instruction', 2, { times: 3 })).toBe('Toto sú tvoje nové noty. Pri každej nájdi modrý kláves a stlač ho 3-krát.');
    expect(pipes('en').plural.transform('meet.instruction', 1, { times: 3 })).toBe('This is your new note. Find the blue key and press it 3 times.');
  });

  it('show a key that has no string as the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { translate, plural } = pipes('en');
    expect(translate.transform('home.nothing')).toBe('home.nothing');
    expect(plural.transform('home.nothing', 2)).toBe('home.nothing.other');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('answer again when the language on the page changes under the same key', async () => {
    const { i18n, translate, plural } = pipes('sk');
    expect(translate.transform('common.close')).toBe('Zavrieť');
    expect(plural.transform('home.due', 3)).toBe('Na zopakovanie čakajú 3 noty.');
    expect(await i18n.setLanguage('en', false)).toBe(true);
    expect(translate.transform('common.close')).toBe('Close');
    expect(plural.transform('home.due', 3)).toBe('3 notes are due for review.');
  });
});

describe('the localDate pipe', () => {
  it('writes a day in full, the way the language does', () => {
    const noon = new Date(2026, 9, 20, 12).toISOString();
    expect(pipes('en').date.transform(noon, 'day')).toBe('20 October 2026');
    expect(pipes('en').date.transform(noon)).toBe('20 October 2026');
    expect(pipes('sk').date.transform(noon, 'day')).toBe('20. októbra 2026');
  });

  it('reads a calendar day - a release of the changelog - as that day here, not as midnight somewhere else', () => {
    expect(pipes('en').date.transform('2026-09-29', 'day')).toBe('29 September 2026');
    expect(pipes('sk').date.transform('2026-01-01', 'day')).toBe('1. januára 2026');
  });

  it('writes a moment - when a round was played - with its time, in the learner’s own time zone', () => {
    const played = new Date(2026, 9, 20, 18, 5).toISOString();
    expect(pipes('en').date.transform(played, 'moment')).toBe('20 Oct 2026, 18:05');
    expect(pipes('sk').date.transform(played, 'moment')).toBe('20. 10. 2026, 18:05');
  });

  it('gives nothing for nothing, and what is not a date back as it came', () => {
    const { date } = pipes('en');
    expect(date.transform(null, 'day')).toBe('');
    expect(date.transform(undefined, 'moment')).toBe('');
    expect(date.transform('', 'day')).toBe('');
    expect(date.transform('soon', 'day')).toBe('soon');
  });

  it('follows the language without a new value', async () => {
    const { i18n, date } = pipes('sk');
    expect(date.transform('2026-10-20', 'day')).toBe('20. októbra 2026');
    expect(await i18n.setLanguage('en', false)).toBe(true);
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
  });
});
