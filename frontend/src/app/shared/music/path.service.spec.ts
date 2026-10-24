import { TestBed } from '@angular/core/testing';
import { PathProgress } from './music.types';
import { NOTE_HINTS, PASS_ACCURACY, PathService, STEP_TYPES } from './path.service';
import { SongsService } from './songs.service';
import { TheoryService } from './theory.service';

/** A repeatable random(), so a failure can be replayed. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('PathService', () => {
  let path: PathService;

  beforeEach(() => {
    path = TestBed.inject(PathService);
  });

  it('lays out phase 1 as saved progress knows it (step keys never change)', () => {
    expect(path.pathSteps.map((entry) => entry.key).slice(0, 7)).toEqual(['rh-1/meet', 'rh-1/drill', 'rh-1/read', 'rh-1/tempo', 'rh-1/song', 'rh-2/meet', 'rh-2/drill']);
    expect(path.phases[0].units.map((unit) => unit.id)).toEqual(['rh-1', 'rh-2', 'rh-3', 'rh-4', 'rh-5']);
    expect(path.phases.slice(1).every((phase) => phase.comingSoon && phase.units.length === 0)).toBe(true);
    expect(path.phases[0].units[1]).toMatchObject({ number: 2, phaseId: 'right-hand' });
  });

  it('keeps, as data, the English a stored session label is made of - and no other words', () => {
    // "C, D, E · Drill": what every lesson round is stored under, whatever language the page is in.
    expect(path.phases[0].units.map((unit) => unit.title)).toEqual(['C, D, E', 'G', 'F', 'A', 'B and high C']);
    expect(STEP_TYPES).toEqual({ meet: { short: 'Meet' }, drill: { short: 'Drill' }, read: { short: 'Read' }, tempo: { short: 'In time' }, song: { short: 'Song' } });
    expect(path.stepTypes).toBe(STEP_TYPES);

    // A phase is its id, its keyboard and its units: its title and description are the language's (path-words.ts).
    expect(path.phases.map((phase) => phase.id)).toEqual(['right-hand', 'left-hand', 'hands-together', 'left-hand-chords', 'right-hand-chords', 'melody-and-chords']);
    for (const phase of path.phases) {
      expect(
        Object.keys(phase)
          .sort()
          .filter((name) => !['comingSoon', 'keyboard'].includes(name)),
      ).toEqual(['id', 'number', 'units']);
    }

    // The hints are the notes that have one - the right hand's eight - and hold no sentence.
    expect(NOTE_HINTS).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(path.noteHints).toBe(NOTE_HINTS);
  });

  it("introduces the notes in the curriculum's order", () => {
    const theory = TestBed.inject(TheoryService);
    const introduced = path.phases.flatMap((phase) => phase.units.flatMap((unit) => unit.newNotes));
    expect(introduced).toEqual(theory.curriculum.slice(0, introduced.length));
  });

  it('unlocks strictly in order, passes at 80% best, and a lower replay keeps a pass', () => {
    let progress: PathProgress = path.createInitialPathProgress();
    expect(path.getNextStep(progress)?.key).toBe('rh-1/meet');
    expect(path.isStepUnlocked(progress, 'rh-1/drill')).toBe(false);

    progress = path.recordStepResult(progress, 'rh-1/meet', 100);
    expect(path.isStepUnlocked(progress, 'rh-1/drill')).toBe(true);
    progress = path.recordStepResult(progress, 'rh-1/drill', PASS_ACCURACY - 10);
    expect(path.isStepPassed(progress, 'rh-1/drill')).toBe(false);
    expect(path.isStepUnlocked(progress, 'rh-1/read')).toBe(false);

    progress = path.recordStepResult(progress, 'rh-1/drill', 90, new Date('2026-09-20T10:00:00Z'));
    progress = path.recordStepResult(progress, 'rh-1/drill', 40);
    expect(path.getStepRecord(progress, 'rh-1/drill')).toMatchObject({ attempts: 3, lastAccuracy: 40, bestAccuracy: 90, passedAt: '2026-09-20T10:00:00.000Z' });
    expect(path.isStepPassed(progress, 'rh-1/drill')).toBe(true);
    expect(path.getUnitStatus(progress, path.phases[0].units[0])).toBe('current');
    expect(path.getUnitStatus(progress, path.phases[0].units[1])).toBe('locked');
    expect(path.getStepAfter('rh-1/song')?.key).toBe('rh-2/meet');
  });

  it('a step passed out of order - as the move at sign-in can bring one - unlocks nothing past the first step not passed', () => {
    // The server's move (api/visitors.php visitorMove()) adds a visitor's steps the account lacks: the
    // account may then hold a later step passed while an earlier one is not. The path opens up to the
    // first step not passed, and no further.
    const progress = path.recordStepResult(path.recordStepResult(path.createInitialPathProgress(), 'rh-1/meet', 100), 'rh-2/drill', 95);
    expect(path.isStepPassed(progress, 'rh-2/drill')).toBe(true);
    expect(path.getNextStep(progress)?.key).toBe('rh-1/drill');
    expect(path.isStepUnlocked(progress, 'rh-1/drill')).toBe(true);
    expect(path.isStepUnlocked(progress, 'rh-1/read')).toBe(false);
    expect(path.isStepUnlocked(progress, 'rh-2/read')).toBe(false);
    expect(path.isStepUnlocked(progress, 'rh-2/drill')).toBe(false);
    expect(path.getUnitStatus(progress, path.phases[0].units[1])).toBe('locked');
  });

  it('gives each unit the notes of its phase so far', () => {
    expect(path.notePoolForUnit('rh-1')).toEqual([60, 62, 64]);
    expect(path.notePoolForUnit('rh-3')).toEqual([60, 62, 64, 65, 67]);
    expect(path.notePoolForUnit('nope')).toEqual([]);
  });

  it('builds drill rounds of new and older notes, never one note twice in a row', () => {
    const unit = path.findUnit('rh-2');
    expect(unit).not.toBeNull();
    for (let seed = 1; seed <= 200; seed++) {
      const round = path.buildDrillRound(unit!, {}, 10, seeded(seed));
      expect(round.length).toBe(10);
      expect(round.filter((midi) => midi === 67).length).toBeGreaterThanOrEqual(4);
      expect(round.every((midi) => [60, 62, 64, 67].includes(midi))).toBe(true);
      for (let i = 1; i < round.length; i++) expect(round[i]).not.toBe(round[i - 1]);
    }
  });

  it('makes singable melodies with every new note, home at both ends', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const melody = path.generateMelody([60, 62, 64, 65, 67], 8, [65], seeded(seed));
      expect(melody.length).toBe(8);
      expect(melody[0]).toBe(60);
      expect(melody[7]).toBe(60);
      expect(melody).toContain(65);
    }
    expect(path.generateMelody([60], 4)).toEqual([60, 60, 60, 60]);
  });

  it("every song step names a song that uses only the unit's notes, and every new one", () => {
    const songs = TestBed.inject(SongsService);
    for (const unit of path.phases[0].units) {
      const song = path.songForStep(unit.steps.find((step) => step.type === 'song')!);
      expect(song, unit.id).not.toBeNull();
      const pool = path.notePoolForUnit(unit.id);
      const used = songs.requiredNotes(song!);
      expect(
        used.every((midi) => pool.includes(midi)),
        `${song!.id} stays inside ${unit.id}'s notes`,
      ).toBe(true);
      expect(
        unit.newNotes.every((midi) => used.includes(midi)),
        `${song!.id} uses every new note of ${unit.id}`,
      ).toBe(true);
    }
  });
});
