import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { type AnotokiPreferences } from '@anotoki/lib/auth';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import type { MockInstance } from 'vitest';
import { provideFamilyKit } from '../../core/family-kit';
import { ProgressMap, Session } from '../../core/music/music.types';
import { BootService } from '../../core/state/boot.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { TestAuth, provideTestAuth } from '../../core/testing/test-auth';
import { OwnProgressComponent } from './own-progress/own-progress.component';
import { StatsPageComponent, computeStreak, localDayKey, practiceMinutes } from './stats-page.component';

/** The own progress file's card has a spec of its own (own-progress.component.spec.ts): here it stands empty. */
@Component({ selector: 'app-own-progress', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class OwnProgressStandIn {}

function session(startedAt: string, endedAt?: string): Session {
  return { id: startedAt, recordedAt: endedAt ?? startedAt, mode: 'trainer', startedAt, endedAt };
}

describe('Stats', () => {
  it('counts the streak in local days, and today does not break it before it is over', () => {
    const now = new Date(2026, 8, 28, 20, 0);
    const days = [27, 26, 25].map((day) => session(new Date(2026, 8, day, 9, 0).toISOString()));
    expect(computeStreak(days, now)).toBe(3);
    expect(computeStreak([session(new Date(2026, 8, 28, 8, 0).toISOString()), ...days], now)).toBe(4);
    expect(computeStreak([session(new Date(2026, 8, 20, 8, 0).toISOString())], now)).toBe(0);
    expect(computeStreak([], now)).toBe(0);
  });

  it('keys a day by the local calendar', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-1-5');
  });

  it('adds up the minutes practiced, leaving out odd gaps', () => {
    expect(
      practiceMinutes([
        session('2026-09-28T08:00:00.000Z', '2026-09-28T08:10:00.000Z'),
        session('2026-09-28T09:00:00.000Z', '2026-09-28T09:05:00.000Z'),
        session('2026-09-28T10:00:00.000Z', '2026-09-28T13:00:00.000Z'),
        session('2026-09-28T11:00:00.000Z'),
      ]),
    ).toBe(15);
  });
});

/** The page's own strings, and the path's words a lesson's row is made of. */
const ENGLISH: Record<string, string> = {
  'keyboard.label': 'On-screen piano keyboard',
  'common.percent': '{value}%',
  'common.milliseconds': '{value}ms',
  'stats.title': 'Your Progress',
  'stats.tile.known': 'Notes known',
  'stats.tile.mastered': 'Notes mastered',
  'stats.tile.accuracy': 'Overall accuracy',
  'stats.tile.streak': 'Day streak',
  'stats.tile.sessions': 'Sessions logged',
  'stats.tile.minutes': 'Minutes practiced',
  'stats.keyboard.title': 'Keyboard mastery',
  'stats.keyboard.learning': 'learning',
  'stats.keyboard.review': 'review',
  'stats.keyboard.mastered': 'mastered',
  'stats.recent.title': 'Recent sessions',
  'stats.recent.empty': 'No sessions yet — practice a round in Note Trainer to get started.',
  'stats.recent.when': 'When',
  'stats.recent.mode': 'Mode',
  'stats.recent.score': 'Score',
  'stats.recent.accuracy': 'Accuracy',
  'stats.recent.timing': 'Avg timing',
  'stats.mode.lesson': 'Lesson: {name}',
  'stats.mode.song': 'Song: {name}',
  'stats.mode.sheet': 'Sheet Practice',
  'stats.mode.trainer': 'Note Trainer',
  'stats.lessonLabel': '{unit} · {step}',
  'path.unit.rh-5.title': 'B and high C',
  'path.step.meet.short': 'Meet',
  'path.step.drill.short': 'Drill',
  'path.step.read.short': 'Read',
  'path.step.tempo.short': 'In time',
  'path.step.song.short': 'Song',
  'ownProgress.visitor': 'Sign in to save your progress to a file, or to bring it back from one.',
  'signIn.button': 'Sign in',
};

const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'keyboard.label': 'Klaviatúra na obrazovke',
  'common.percent': '{value} %',
  'common.milliseconds': '{value} ms',
  'stats.title': 'Tvoj postup',
  'stats.recent.title': 'Posledné kolá',
  'stats.recent.empty': 'Zatiaľ tu nie je žiadne kolo – začni jedným kolom v Tréningu nôt.',
  'stats.mode.lesson': 'Lekcia: {name}',
  'stats.mode.song': 'Skladba: {name}',
  'stats.mode.sheet': 'Hra z nôt',
  'stats.mode.trainer': 'Tréning nôt',
  'path.unit.rh-5.title': 'B a vysoké C',
  'path.step.meet.short': 'Zoznámenie',
  'path.step.drill.short': 'Precvičovanie',
  'path.step.read.short': 'Čítanie',
  'path.step.tempo.short': 'V rytme',
  'path.step.song.short': 'Skladba',
  'ownProgress.visitor': 'Prihlás sa a môžeš si postup uložiť do súboru alebo ho zo súboru obnoviť.',
  'signIn.button': 'Prihlásiť sa',
};

describe('Stats: the page in the language of the reader', () => {
  let fixture: ComponentFixture<StatsPageComponent>;
  let host: HTMLElement;
  let warn: MockInstance;
  const sessions = signal<Session[]>([]);
  const progress = signal<ProgressMap>({});
  const boot = { signIn: vi.fn(async () => undefined) };

  /** "Recent sessions", line by line: [when, mode, score, accuracy, timing] as the page reads. */
  const rows = (): string[][] =>
    Array.from(host.querySelectorAll('tbody tr')).map((row) => Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()));
  /** The Mode cells: what each says, and the language its name is marked as (null: the page's own). */
  const modes = (): Array<[string, string | null]> =>
    Array.from(host.querySelectorAll('tbody tr')).map((row) => {
      const cell = row.querySelectorAll('td')[1];
      return [(cell.textContent ?? '').replace(/\s+/g, ' ').trim(), cell.querySelector('[lang]')?.getAttribute('lang') ?? null];
    });
  /** A figure of the family's tiles (@anotoki/lib/ui/stat-tiles): its number as shown. */
  const tile = (index: number): string => (host.querySelectorAll('anotoki-stat-tile .anotoki-stat-tile__value')[index].textContent ?? '').trim();

  async function show(list: Session[], language: 'en' | 'sk' = 'sk', signedIn = true, preferences: AnotokiPreferences | null = null): Promise<void> {
    sessions.set(list);
    TestBed.configureTestingModule({
      providers: [
        language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ProgressStore, useValue: { progress, sessions, knownNotes: signal<number[]>([]) } },
        { provide: BootService, useValue: boot },
        ...provideTestAuth(),
        // The family's kit as the app wires it: its icons with the piano's among them (the empty list's).
        provideFamilyKit(),
      ],
    });
    TestBed.overrideComponent(StatsPageComponent, { remove: { imports: [OwnProgressComponent] }, add: { imports: [OwnProgressStandIn] } });
    const auth = TestBed.inject(TestAuth);
    if (signedIn) auth.signInAs({ sub: '7', preferred_username: 'mia', preferences });
    else auth.visiting();
    fixture = TestBed.createComponent(StatsPageComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  const played = (id: string, more: Partial<Session>): Session => ({
    id,
    recordedAt: '2026-10-20T16:05:00.000Z',
    startedAt: '2026-10-20T16:00:00.000Z',
    mode: 'trainer',
    attempts: 10,
    correct: 8,
    accuracy: 80,
    ...more,
  });

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    progress.set({});
  });

  afterEach(() => vi.restoreAllMocks());

  it('words a lesson from its step and a song from the app’s own song - not from the English kept with the session', async () => {
    await show([
      played('1', { mode: 'lesson', unitId: 'rh-5', stepId: 'drill', label: 'B and high C · Drill' }),
      played('2', { mode: 'lesson', unitId: 'rh-1', stepId: 'read', label: 'C, D, E · Read' }),
      played('3', { mode: 'song', songId: 'hot-cross-buns', songTitle: 'A title from long ago' }),
      played('4', { mode: 'sheet' }),
      played('5', { mode: 'trainer' }),
    ]);

    // Newest first. A unit title that is only note letters is shown as it is; a song's title is its name.
    expect(modes()).toEqual([
      ['Tréning nôt', null],
      ['Hra z nôt', null],
      ['Skladba: Hot Cross Buns', null],
      ['Lekcia: C, D, E · Čítanie', null],
      ['Lekcia: B a vysoké C · Precvičovanie', null],
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('shows what was stored, marked as English, when the step or the song is not in the app', async () => {
    await show([
      played('1', { mode: 'lesson', unitId: 'rh-9', stepId: 'drill', label: 'High notes · Drill' }),
      played('2', { mode: 'lesson', label: 'C, D, E · Drill' }),
      played('3', { mode: 'lesson', unitId: 'rh-1', stepId: 'warm-up', label: 'C, D, E · Warm-up' }),
      played('4', { mode: 'song', songId: 'a-song-that-left', songTitle: 'A Song That Left' }),
      played('5', { mode: 'song', songTitle: 'Ode to Joy (opening phrase)' }),
    ]);

    expect(modes()).toEqual([
      ['Skladba: Ode to Joy (opening phrase)', 'en'],
      ['Skladba: A Song That Left', 'en'],
      ['Lekcia: C, D, E · Warm-up', 'en'],
      ['Lekcia: C, D, E · Drill', 'en'],
      ['Lekcia: High notes · Drill', 'en'],
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never makes a key of anything a session holds', async () => {
    const t = vi.spyOn(TranslationService.prototype, 't');
    const around = vi.spyOn(TranslationService.prototype, 'around');
    await show([
      // Every field is whatever was stored: ids and a mode that look like keys of the app's strings.
      played('1', { mode: 'stats.title' as Session['mode'], label: 'stats.title', unitId: 'stats.title', stepId: 'stats.title' }),
      played('2', { mode: 'lesson', unitId: 'path.unit.rh-5', stepId: 'title', label: 'path.unit.rh-5.title' }),
      played('3', { mode: 'lesson', unitId: 'rh-5', stepId: 'short', label: 'rh-5 · short' }),
      played('4', { mode: 'song', songId: 'stats.mode.sheet', songTitle: 'stats.mode.sheet' }),
      played('5', { mode: 'constructor' as Session['mode'] }),
    ]);

    // A mode the app does not have reads as the Note Trainer's; the rest is shown as stored.
    expect(modes()).toEqual([
      ['Tréning nôt', null],
      ['Skladba: stats.mode.sheet', 'en'],
      ['Lekcia: rh-5 · short', 'en'],
      ['Lekcia: path.unit.rh-5.title', 'en'],
      ['Tréning nôt', null],
    ]);
    // Every key that was asked for is one the page has in its strings: none was put together from a session.
    const asked = [...t.mock.calls, ...around.mock.calls].map(([key]) => key);
    expect(asked.length).toBeGreaterThan(0);
    for (const key of asked) expect(Object.keys(ENGLISH)).toContain(key);
    expect(warn).not.toHaveBeenCalled();
  });

  it('writes the day and the numbers the way the language does', async () => {
    await show([played('1', { mode: 'sheet', correct: 4, attempts: 6, accuracy: 67, avgTimingErrorMs: 115 }), played('2', { mode: 'trainer', correct: 8, attempts: 12, accuracy: 67 })]);

    const when = new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-10-20T16:00:00.000Z'));
    expect(rows()).toEqual([
      [when, 'Tréning nôt', '8/12', '67 %', '—'],
      [when, 'Hra z nôt', '4/6', '67 %', '115 ms'],
    ]);
    // The page's language decides, not the browser's: toLocaleString() is what the page used to show.
    expect(when).not.toBe(new Date('2026-10-20T16:00:00.000Z').toLocaleString());
  });

  it('writes when a round was played in the order and on the clock the anotoki account chose - the language’s own way for what it left automatic', async () => {
    const start = new Date('2026-10-20T16:00:00.000Z');
    const pad = (value: number): string => String(value).padStart(2, '0');
    const clock24 = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const clock12 = new Intl.DateTimeFormat('sk-SK', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }).format(start);
    const day = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;

    await show([played('1', { mode: 'sheet' })], 'sk', true, { theme: 'auto', date_format: 'ymd_dash', time_format: '24' });
    expect(rows()[0][0]).toBe(`${day} ${clock24}`);

    // The clock alone chosen: the date the Slovak way, then the 12-hour clock in Slovak's words.
    TestBed.resetTestingModule();
    await show([played('1', { mode: 'sheet' })], 'sk', true, { theme: 'auto', date_format: null, time_format: '12' });
    expect(rows()[0][0]).toBe(`${new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium' }).format(start)} ${clock12}`);

    // Nothing chosen - or nobody signed in: as before.
    TestBed.resetTestingModule();
    await show([played('1', { mode: 'sheet' })], 'sk', true, { theme: 'dark', date_format: null, time_format: null });
    expect(rows()[0][0]).toBe(new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short' }).format(start));
  });

  it('follows the language when it changes on the page', async () => {
    await show([played('1', { mode: 'lesson', unitId: 'rh-5', stepId: 'tempo', label: 'B and high C · In time', avgTimingErrorMs: 90 })]);
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Tvoj postup');
    expect(rows()[0].slice(1)).toEqual(['Lekcia: B a vysoké C · V rytme', '8/10', '80 %', '90 ms']);

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Your Progress');
    expect(rows()[0]).toEqual([
      new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-10-20T16:00:00.000Z')),
      'Lesson: B and high C · In time',
      '8/10',
      '80%',
      '90ms',
    ]);
  });

  it('has the progress file’s card for somebody signed in - and, for a visitor, the sign-in in its place', async () => {
    await show([], 'sk');
    expect(host.querySelector('app-own-progress')).not.toBeNull();
    expect(host.querySelector('#own-progress-visitor')).toBeNull();

    TestBed.resetTestingModule();
    boot.signIn.mockClear();
    await show([], 'sk', false);
    expect(host.querySelector('app-own-progress')).toBeNull();
    expect(host.querySelector('#own-progress-visitor p')?.textContent).toBe('Prihlás sa a môžeš si postup uložiť do súboru alebo ho zo súboru obnoviť.');
    const button = host.querySelector<HTMLButtonElement>('#own-progress-sign-in')!;
    expect(button.textContent).toBe('Prihlásiť sa');
    button.click();
    expect(boot.signIn).toHaveBeenCalledTimes(1);
    // The rest of the page is the visitor's progress, as anybody's.
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Tvoj postup');
    expect(warn).not.toHaveBeenCalled();
  });

  it('has a dash for the accuracy before the first answer, and a sentence where the table would be', async () => {
    await show([], 'en');
    expect(tile(2)).toBe('—');
    expect(host.querySelector('table')).toBeNull();
    // The family's empty state, with the piano (an icon the app registers with the kit).
    expect(host.querySelector('anotoki-empty-state .anotoki-empty-state__heading')?.textContent).toBe('No sessions yet — practice a round in Note Trainer to get started.');
    expect(host.querySelector('anotoki-empty-state anotoki-icon svg path')).not.toBeNull();

    progress.set({ 60: { totalAttempts: 3, correctAttempts: 2, status: 'learning' } } as unknown as ProgressMap);
    await fixture.whenStable();
    expect(tile(2)).toBe('67%');
    expect(warn).not.toHaveBeenCalled();
  });

  it('draws the figures as the family’s tiles - a list, each read number first - and marks the table’s numbers for the family’s stacked rows (anotoki-lib 0.6.0)', async () => {
    await show([played('1', { mode: 'sheet', correct: 4, attempts: 6, accuracy: 67, avgTimingErrorMs: 115 })], 'sk');
    const tiles = host.querySelector('anotoki-stat-tiles');
    expect(tiles?.getAttribute('role')).toBe('list');
    const each = Array.from(host.querySelectorAll('anotoki-stat-tile'));
    expect(each.map((one) => one.getAttribute('role'))).toEqual(['listitem', 'listitem', 'listitem', 'listitem', 'listitem', 'listitem']);
    expect(each.map((one) => one.querySelector('.anotoki-stat-tile__label')?.textContent?.trim())).toEqual([
      'Notes known',
      'Notes mastered',
      'Overall accuracy',
      'Day streak',
      'Sessions logged',
      'Minutes practiced',
    ]);
    expect([tile(0), tile(3), tile(4)]).toEqual(['0/15', '0', '1']);
    // Score, accuracy and timing are numbers: at the column's end on a desktop, read from their names when a round is a small card.
    expect(Array.from(host.querySelectorAll('thead th')).map((cell) => cell.classList.contains('cell-num'))).toEqual([false, false, true, true, true]);
    expect(Array.from(host.querySelectorAll('tbody tr:first-child td')).map((cell) => cell.classList.contains('cell-num'))).toEqual([false, false, true, true, true]);
  });
});
