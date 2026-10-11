import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { type AnotokiPreferences } from '../auth/anotoki-auth';
import { AuthService } from '../auth/auth.service';
import { formatClock, formatDatePattern } from './date-patterns';
import { LocalDatePipe } from './local-date.pipe';

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
    expect(await i18n.setLanguage('en', { remember: false })).toBe(true);
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
    expect(await i18n.setLanguage('en', { remember: false })).toBe(true);
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
  });

  it('writes the admin panel’s stamp as it always was: yyyy-MM-dd HH:mm here, the server’s own as it came', () => {
    const { date } = pipes('en');
    expect(date.transform(new Date(2026, 9, 1, 9, 5).toISOString(), 'stamp')).toBe('2026-10-01 09:05');
    expect(date.transform('2026-10-04 09:30', 'stamp')).toBe('2026-10-04 09:30');
    expect(date.transform(null, 'stamp')).toBe('');
    expect(date.transform('soon', 'stamp')).toBe('soon');
  });
});

/** Somebody signed in whose anotoki account chose these - the SDK's user, as AuthService holds it - or, `signedIn` false, a session that ended. */
function account(preferences: AnotokiPreferences | null, signedIn = true): void {
  const auth = TestBed.inject(AuthService);
  (auth as unknown as { authenticated: WritableSignal<boolean> }).authenticated.set(signedIn);
  auth.user.set({ sub: '7', preferred_username: 'mia', email: null, email_verified: true, locale: 'en', roles: ['MEMBER'], preferences });
}

describe('the localDate pipe, for somebody whose anotoki account chose an order or a clock', () => {
  const chosen = (date_format: AnotokiPreferences['date_format'], time_format: AnotokiPreferences['time_format']): AnotokiPreferences => ({ theme: 'auto', date_format, time_format });
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
    expect(en.date.transform(evening, 'moment')).toBe('2026-10-20 18:05');
    account(chosen('dmy_dot', null));
    expect(en.date.transform(evening, 'moment')).toBe('20.10.2026 18:05');
    // The 12-hour clock in the page language's words for am and pm.
    account(chosen(null, '12'));
    expect(en.date.transform(evening, 'moment')).toBe(`20 Oct 2026 ${formatClock(new Date(evening), 'en-GB', '12')}`);
    expect(formatClock(new Date(evening), 'en-GB', '12')).toBe('6:05 pm');

    const sk = pipes('sk');
    account(chosen(null, '12'));
    expect(sk.date.transform(evening, 'moment')).toBe('20. 10. 2026 6:05 PM');
    // The 24-hour clock has two digits for the hour, where Slovak's own writes one.
    account(chosen(null, '24'));
    expect(sk.date.transform(morning, 'moment')).toBe('20. 10. 2026 09:05');
    account(chosen(null, null));
    expect(sk.date.transform(morning, 'moment')).toBe('20. 10. 2026, 9:05');
  });

  it('writes as the language does for nobody signed in - a visitor, or a session that ended - and for an account that chose nothing', () => {
    const { date } = pipes('en');
    account(chosen('ymd_dash', '12'), false);
    expect(date.transform(evening, 'moment')).toBe('20 Oct 2026, 18:05');
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
    // An IAM that sends no preferences (before its 015): the app's own way, as before.
    account(null);
    expect(date.transform(evening, 'moment')).toBe('20 Oct 2026, 18:05');
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

  it('writes the admin panel’s stamp in the account’s order and clock - the server’s own numbers as they are, never moved to another time zone', () => {
    const { date } = pipes('en');
    account(chosen('dmy_slash', '12'));
    expect(date.transform(new Date(2026, 9, 1, 12, 0).toISOString(), 'stamp')).toBe('01/10/2026 12:00 pm');
    expect(date.transform('2026-10-04 09:30', 'stamp')).toBe('04/10/2026 9:30 am');
    account(chosen('dmy_dot', null));
    expect(date.transform('2026-10-04 21:07', 'stamp')).toBe('4.10.2026 21:07');
    expect(date.transform(new Date(2026, 9, 1, 9, 5).toISOString(), 'stamp')).toBe('1.10.2026 09:05');
    account(chosen(null, '24'));
    expect(date.transform('2026-03-29 02:30', 'stamp')).toBe('2026-03-29 02:30');
  });
});

describe('the family’s date orders and clocks (date-patterns.ts)', () => {
  it('pads where the order does, and not in the dotted one', () => {
    const day = new Date(2026, 0, 5, 12);
    expect([formatDatePattern(day, 'dmy_dot'), formatDatePattern(day, 'dmy_slash'), formatDatePattern(day, 'mdy_slash'), formatDatePattern(day, 'ymd_dash')]).toEqual([
      '5.1.2026',
      '05/01/2026',
      '01/05/2026',
      '2026-01-05',
    ]);
  });

  it('reads UTC numbers when told: what the server wrote on its own clock', () => {
    const late = new Date(Date.UTC(2026, 11, 31, 23, 30));
    expect(formatDatePattern(late, 'ymd_dash', true)).toBe('2026-12-31');
    expect(formatClock(late, 'en-GB', '24', true)).toBe('23:30');
    expect(formatClock(late, 'en-GB', '12', true)).toBe('11:30 pm');
  });
});
