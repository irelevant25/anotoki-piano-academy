import { TestBed } from '@angular/core/testing';
import { type AnotokiPreferences } from '@anotoki/lib/auth';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AnotokiDatePipe, AnotokiDates } from '@anotoki/lib/ui/dates';
import { provideFamilyKit } from '../family-kit';
import { TestAuth, provideTestAuth } from '../testing/test-auth';
import { adminStamp } from '../../sites/admin/admin-stamp';

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

/** The pipes as this app has them: its words, its sign-in, and the family's kit as it wires it (shared/family-kit.ts: the dates' locale and the account's choices). */
function pipes(language: 'en' | 'sk') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
      ...provideTestAuth(),
      ...provideFamilyKit(),
      TranslatePipe,
      TranslatePluralPipe,
      AnotokiDatePipe,
    ],
  });
  return {
    i18n: TestBed.inject(TranslationService),
    translate: TestBed.inject(TranslatePipe),
    plural: TestBed.inject(TranslatePluralPipe),
    date: TestBed.inject(AnotokiDatePipe),
    dates: TestBed.inject(AnotokiDates),
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
    expect(await i18n.setLanguage('en', { remember: false })).toBe(true);
    expect(translate.transform('common.close')).toBe('Close');
    expect(plural.transform('home.due', 3)).toBe('3 notes are due for review.');
  });
});

// The family's date pipe (@anotoki/lib/ui/dates' anotokiDate, anotoki-lib 0.11.0) in the place of this app's own
// localDate: What's new's release days ('day', its 'day') and Stats' rounds ('datetime', its 'moment') - written as they
// were, but for one thing: a Slovak time before ten has two digits for its hour (09:05, the family's way; 9:05 before).
describe('the family’s date pipe, as this app wires it (shared/family-kit.ts)', () => {
  it('writes a day in full, the way the language does - What’s new’s release days', () => {
    const noon = new Date(2026, 9, 20, 12).toISOString();
    expect(pipes('en').date.transform(noon, 'day')).toBe('20 October 2026');
    expect(pipes('sk').date.transform(noon, 'day')).toBe('20. októbra 2026');
  });

  it('reads a calendar day - a release of the changelog - as that day here, not as midnight somewhere else', () => {
    expect(pipes('en').date.transform('2026-09-29', 'day')).toBe('29 September 2026');
    expect(pipes('sk').date.transform('2026-01-01', 'day')).toBe('1. januára 2026');
  });

  it('writes a moment - when a round was played - with its time, in the learner’s own time zone; a Slovak hour before ten with two digits', () => {
    const played = new Date(2026, 9, 20, 18, 5).toISOString();
    expect(pipes('en').date.transform(played, 'datetime')).toBe('20 Oct 2026, 18:05');
    expect(pipes('sk').date.transform(played, 'datetime')).toBe('20. 10. 2026, 18:05');
    const morning = new Date(2026, 9, 20, 9, 5).toISOString();
    expect(pipes('en').date.transform(morning, 'datetime')).toBe('20 Oct 2026, 09:05');
    expect(pipes('sk').date.transform(morning, 'datetime')).toBe('20. 10. 2026, 09:05');
  });

  it('gives nothing for nothing, and what is not a date back as it came', () => {
    const { date } = pipes('en');
    expect(date.transform(null, 'day')).toBe('');
    expect(date.transform(undefined, 'datetime')).toBe('');
    expect(date.transform('', 'day')).toBe('');
    expect(date.transform('soon', 'day')).toBe('soon');
  });

  it('follows the language without a new value', async () => {
    const { i18n, date } = pipes('sk');
    expect(date.transform('2026-10-20', 'day')).toBe('20. októbra 2026');
    expect(await i18n.setLanguage('en', { remember: false })).toBe(true);
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
  });
});

/** Somebody signed in whose anotoki account chose these - the user AnotokiAuth holds - or, `signedIn` false, a session that ended. */
function account(preferences: AnotokiPreferences | null, signedIn = true): void {
  const auth = TestBed.inject(TestAuth).signInAs({ sub: '7', preferred_username: 'mia', locale: 'en', preferences });
  if (!signedIn) auth.now.set('signed-out');
}

const chosen = (date_format: AnotokiPreferences['date_format'], time_format: AnotokiPreferences['time_format']): AnotokiPreferences => ({ theme: 'auto', date_format, time_format });

describe('the family’s date pipe, for somebody whose anotoki account chose an order or a clock', () => {
  const noon = new Date(2026, 9, 6, 12).toISOString();
  const evening = new Date(2026, 9, 20, 18, 5).toISOString();
  const morning = new Date(2026, 9, 20, 9, 5).toISOString();

  it('writes a day in the account’s order - every one of the four, a calendar day too', () => {
    const { date } = pipes('en');
    for (const [format, written] of [
      ['dmy_dot', '6.10.2026'],
      ['dmy_slash', '06/10/2026'],
      ['mdy_slash', '10/06/2026'],
      ['ymd_dash', '2026-10-06'],
    ] as const) {
      account(chosen(format, null));
      expect(date.transform(noon, 'day')).toBe(written);
      expect(date.transform('2026-10-06', 'day')).toBe(written);
    }
  });

  it('writes a moment as the date and the time side by side once either is chosen - each half the language’s own where it is automatic', () => {
    const en = pipes('en');
    account(chosen('ymd_dash', '24'));
    expect(en.date.transform(evening, 'datetime')).toBe('2026-10-20 18:05');
    account(chosen('dmy_dot', null));
    expect(en.date.transform(evening, 'datetime')).toBe('20.10.2026 18:05');
    // The 12-hour clock in the page language's words for am and pm.
    account(chosen(null, '12'));
    expect(en.date.transform(evening, 'datetime')).toBe('20 Oct 2026 6:05 pm');

    const sk = pipes('sk');
    account(chosen(null, '12'));
    expect(sk.date.transform(evening, 'datetime')).toBe('20. 10. 2026 6:05 PM');
    account(chosen(null, '24'));
    expect(sk.date.transform(morning, 'datetime')).toBe('20. 10. 2026 09:05');
    account(chosen(null, null));
    expect(sk.date.transform(morning, 'datetime')).toBe('20. 10. 2026, 09:05');
  });

  it('writes as the language does for nobody signed in - a visitor, or a session that ended - and for an account that chose nothing', () => {
    const { date } = pipes('en');
    account(chosen('ymd_dash', '12'), false);
    expect(date.transform(evening, 'datetime')).toBe('20 Oct 2026, 18:05');
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
    // An IAM that sends no preferences (before its 015): the language's own way.
    account(null);
    expect(date.transform(evening, 'datetime')).toBe('20 Oct 2026, 18:05');
    account(chosen(null, null));
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
  });

  it('follows a choice the account makes without a new value - on another site, in another tab', () => {
    const { date } = pipes('en');
    account(chosen(null, null));
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
    account(chosen('mdy_slash', null));
    expect(date.transform('2026-10-20', 'day')).toBe('10/20/2026');
  });
});

describe('the admin panel’s stamp (sites/admin/admin-stamp.ts): People’s, the Migrations page’s and the admin tools’ dates', () => {
  it('writes yyyy-MM-dd HH:mm in the reader’s time zone, as it always was - nothing for nothing, a text that is no date as it came', () => {
    const { dates } = pipes('en');
    expect(adminStamp(new Date(2026, 9, 1, 9, 5).toISOString(), dates)).toBe('2026-10-01 09:05');
    expect(adminStamp('2026-10-06T10:01:02Z', dates)).toBe(adminStamp(new Date(Date.UTC(2026, 9, 6, 10, 1, 2)).toISOString(), dates));
    expect(adminStamp(null, dates)).toBe('');
    expect(adminStamp('soon', dates)).toBe('soon');
  });

  it('writes the account’s order and clock in their place where it chose them', () => {
    const { dates } = pipes('en');
    account(chosen('dmy_slash', '12'));
    expect(adminStamp(new Date(2026, 9, 1, 12, 0).toISOString(), dates)).toBe('01/10/2026 12:00 pm');
    account(chosen('dmy_dot', null));
    expect(adminStamp(new Date(2026, 9, 1, 9, 5).toISOString(), dates)).toBe('1.10.2026 09:05');
    account(chosen(null, '12'));
    expect(adminStamp(new Date(2026, 9, 1, 21, 7).toISOString(), dates)).toBe('2026-10-01 9:07 pm');
  });
});
