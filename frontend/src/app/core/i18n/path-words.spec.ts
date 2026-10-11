import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { StepType } from '../music/music.types';
import { NOTE_HINTS, PathService, STEP_TYPES } from '../music/path.service';
import { DYNAMIC_KEYS } from './dynamic-keys';
import { PathWords, hintKey, phaseDescription, phaseTitle, stepShort, stepTitle, unitTitle } from './path-words';

const ENGLISH = {
  'path.phase.right-hand.title': 'Right hand',
  'path.phase.right-hand.description': 'Learn the notes from Middle C up to the next C, one small group at a time.',
  'path.step.meet.title': 'Meet the notes',
  'path.step.meet.short': 'Meet',
  'path.step.tempo.title': 'Play in time',
  'path.step.tempo.short': 'In time',
  'path.hint.71': 'B is just right of the three black keys.',
  'path.unit.rh-5.title': 'B and high C',
};

const SLOVAK = {
  'path.phase.right-hand.title': 'Pravá ruka',
  'path.phase.right-hand.description': 'Nauč sa noty stredné C až ďalšie C, vždy po malej skupinke.',
  'path.step.meet.title': 'Zoznám sa s notami',
  'path.step.meet.short': 'Zoznámenie',
  'path.step.tempo.title': 'Hra v rytme',
  'path.step.tempo.short': 'V rytme',
  'path.hint.71': 'B je hneď vpravo od troch čiernych klávesov.',
  'path.unit.rh-5.title': 'B a vysoké C',
};

/** Answers with the key it was asked for, so a case can see which one that was. */
const KEYS: PathWords = { t: (key) => key };

/** A unit title that is only note letters: "C, D, E", "G". It is shown as it is and has no key. */
const NOTE_LETTERS = /^[A-G](, [A-G])*$/;

function words(language: 'en' | 'sk'): TranslationService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)] });
  return TestBed.inject(TranslationService);
}

describe('path-words: the learning path in the learner’s words', () => {
  afterEach(() => vi.restoreAllMocks());

  it('words a phase, a step type and a unit in English and in Slovak', () => {
    const en = words('en');
    expect(phaseTitle(en, { id: 'right-hand' })).toBe('Right hand');
    expect(phaseDescription(en, { id: 'right-hand' })).toBe('Learn the notes from Middle C up to the next C, one small group at a time.');
    expect(stepTitle(en, 'meet')).toBe('Meet the notes');
    expect(stepShort(en, 'tempo')).toBe('In time');
    expect(unitTitle(en, { id: 'rh-5', title: 'B and high C' })).toBe('B and high C');

    const sk = words('sk');
    expect(phaseTitle(sk, { id: 'right-hand' })).toBe('Pravá ruka');
    expect(phaseDescription(sk, { id: 'right-hand' })).toBe('Nauč sa noty stredné C až ďalšie C, vždy po malej skupinke.');
    expect(stepTitle(sk, 'tempo')).toBe('Hra v rytme');
    expect(stepShort(sk, 'meet')).toBe('Zoznámenie');
    expect(unitTitle(sk, { id: 'rh-5', title: 'B and high C' })).toBe('B a vysoké C');
  });

  it('asks for the keys the table writes out', () => {
    expect(phaseTitle(KEYS, { id: 'left-hand-chords' })).toBe('path.phase.left-hand-chords.title');
    expect(phaseDescription(KEYS, { id: 'left-hand-chords' })).toBe('path.phase.left-hand-chords.description');
    expect(stepTitle(KEYS, 'drill')).toBe('path.step.drill.title');
    expect(stepShort(KEYS, 'drill')).toBe('path.step.drill.short');
    expect(unitTitle(KEYS, { id: 'rh-5', title: 'B and high C' })).toBe('path.unit.rh-5.title');
    expect(hintKey(60)).toBe('path.hint.60');
  });

  it('shows a unit title of note letters as it is: note names are never translated, and no key is asked for', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sk = words('sk');
    expect(unitTitle(sk, { id: 'rh-1', title: 'C, D, E' })).toBe('C, D, E');
    expect(unitTitle(sk, { id: 'rh-2', title: 'G' })).toBe('G');
    expect(unitTitle(KEYS, { id: 'rh-1', title: 'C, D, E' })).toBe('C, D, E');
    expect(warn).not.toHaveBeenCalled();
  });

  it('makes no key from an id the table does not know - a unit is then shown by its own title', () => {
    expect(unitTitle(KEYS, { id: 'constructor', title: 'Anything' })).toBe('Anything');
    expect(unitTitle(KEYS, { id: 'rh-5.title', title: 'Anything' })).toBe('Anything');
    expect(unitTitle(KEYS, { id: '', title: 'Anything' })).toBe('Anything');
  });

  it('has the key of a hint for a note that has one, and nothing for any other', () => {
    expect(hintKey(71)).toBe('path.hint.71');
    expect(words('sk').t(hintKey(71)!)).toBe('B je hneď vpravo od troch čiernych klávesov.');
    // A black key, a left-hand note, and what is no note at all.
    expect(hintKey(61)).toBeNull();
    expect(hintKey(48)).toBeNull();
    expect(hintKey(Number.NaN)).toBeNull();
    expect(hintKey(60.5)).toBeNull();
  });

  it('a key with no string shows as the key, as everywhere', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const en = words('en');
    expect(phaseTitle(en, { id: 'left-hand' })).toBe('path.phase.left-hand.title');
    expect(stepShort(en, 'song')).toBe('path.step.song.short');
    expect(warn).toHaveBeenCalled();
  });
});

describe('the run-time keys of the path (dynamic-keys.ts) and PathService, in step', () => {
  let path: PathService;

  /** "path.phase.right-hand.title" -> "right-hand.title": what was added to the prefix. */
  const tail = (key: string, prefix: string): string => {
    expect(key.startsWith(prefix), `${key} begins with ${prefix}`).toBe(true);
    return key.slice(prefix.length);
  };
  const sorted = (tails: readonly string[]): string[] => [...tails].sort();

  beforeEach(() => {
    TestBed.resetTestingModule();
    path = TestBed.inject(PathService);
  });

  it('declares the four families, and no other', () => {
    expect(Object.keys(DYNAMIC_KEYS).sort()).toEqual(['path.hint.', 'path.phase.', 'path.step.', 'path.unit.']);
  });

  it('every phase has its title and its description declared - and nothing is declared for a phase that is gone', () => {
    expect(path.phases.length).toBe(6);
    const asked = path.phases.flatMap((phase) => [tail(phaseTitle(KEYS, phase), 'path.phase.'), tail(phaseDescription(KEYS, phase), 'path.phase.')]);
    expect(sorted(DYNAMIC_KEYS['path.phase.'])).toEqual(sorted(asked));
  });

  it('every step type has its name and its short name declared', () => {
    const types = Object.keys(STEP_TYPES) as StepType[];
    expect(types.length).toBe(5);
    // Every type a step of the path has is one STEP_TYPES knows.
    expect(path.pathSteps.every((entry) => types.includes(entry.step.type))).toBe(true);
    const asked = types.flatMap((type) => [tail(stepTitle(KEYS, type), 'path.step.'), tail(stepShort(KEYS, type), 'path.step.')]);
    expect(sorted(DYNAMIC_KEYS['path.step.'])).toEqual(sorted(asked));
  });

  it('every note with a hint has its key declared - and hintKey() knows exactly those', () => {
    expect(NOTE_HINTS.length).toBe(8);
    expect(sorted(DYNAMIC_KEYS['path.hint.'])).toEqual(sorted(NOTE_HINTS.map(String)));
    for (const midi of NOTE_HINTS) {
      expect(hintKey(midi)).toBe(`path.hint.${midi}`);
    }
    // Every note a unit introduces is met with a hint.
    const introduced = path.phases.flatMap((phase) => phase.units.flatMap((unit) => unit.newNotes));
    expect(introduced.filter((midi) => hintKey(midi) === null)).toEqual([]);
  });

  it('every unit title with ordinary words in it has a key declared; one of note letters only has none', () => {
    const units = path.phases.flatMap((phase) => phase.units);
    const worded = units.filter((unit) => !NOTE_LETTERS.test(unit.title));
    expect(worded.map((unit) => unit.id)).toEqual(['rh-5']);
    expect(sorted(DYNAMIC_KEYS['path.unit.'])).toEqual(sorted(worded.map((unit) => `${unit.id}.title`)));
    for (const unit of units) {
      expect(unitTitle(KEYS, unit)).toBe(NOTE_LETTERS.test(unit.title) ? unit.title : `path.unit.${unit.id}.title`);
    }
  });
});
