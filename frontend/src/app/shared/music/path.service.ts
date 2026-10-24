import { Injectable, inject } from '@angular/core';
import { PathProgress, PathStep, Phase, ProgressMap, Song, Step, StepRecord, StepType, Unit } from './music.types';
import { SongsService } from './songs.service';
import { TheoryService } from './theory.service';

// The guided learning path, Duolingo-style: phases -> units -> steps. Every
// unit walks the same ladder - meet the new notes, drill them as flashcards,
// read a short melody, play one in time, then play a real song - from single
// notes ("words") to melodies ("sentences") to a song ("story"). Steps unlock
// strictly in order; a step is passed once its best accuracy reaches
// PASS_ACCURACY, and stays passed on a lower replay.
//
// Step keys ("unitId/stepId") are saved: renaming a unit or a step orphans
// everybody's progress on it.
//
// The path knows no language. What it says to the learner - a phase's title
// and description, a step type's name, where a new note's key sits, a unit
// title with ordinary words in it - is worded from these ids by
// shared/i18n/path-words.ts, in the language on the page; the keys are written
// out in shared/i18n/dynamic-keys.ts, and path-words.spec.ts holds that table
// and this path in step. A new phase, step type, hint or worded unit title
// needs its keys there, and its strings in a migration.

export const PASS_ACCURACY = 80;

/**
 * DATA, not words for the page: the English short name a finished lesson
 * round is stored under - its session label is `${unit.title} ·
 * ${STEP_TYPES[type].short}`, English whatever language the page is in, as
 * every label stored before. No page shows this: a step's name on the page is
 * stepTitle() / stepShort() of path-words.ts.
 */
export const STEP_TYPES: Record<StepType, { short: string }> = {
  meet: { short: 'Meet' },
  drill: { short: 'Drill' },
  read: { short: 'Read' },
  tempo: { short: 'In time' },
  song: { short: 'Song' },
};

/**
 * The right-hand notes that have a hint - where the key sits on the keyboard,
 * shown when the note is introduced - by MIDI number. The hint's words are the
 * language's (hintKey() of path-words.ts).
 */
export const NOTE_HINTS: readonly number[] = [60, 62, 64, 65, 67, 69, 71, 72];

export type UnitStatus = 'done' | 'current' | 'locked';

type Random = () => number;

function shuffle<T>(items: T[], random: Random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A random order in which the same note never comes twice in a row whenever
 * the mix allows it: each slot is drawn (weighted by the copies left) only
 * from notes that still leave a repeat-free way to fill the rest.
 */
function spreadOut(notes: number[], random: Random): number[] {
  const counts = new Map<number, number>();
  for (const midi of notes) counts.set(midi, (counts.get(midi) ?? 0) + 1);
  const out: number[] = [];
  while (out.length < notes.length) {
    const last = out[out.length - 1];
    const left = notes.length - out.length - 1; // slots left after this pick
    const available = [...counts].filter(([midi, count]) => count > 0 && midi !== last);
    const feasible = available.filter(([midi]) =>
      [...counts].every(([other, count]) => {
        const after = other === midi ? count - 1 : count;
        return other === midi ? after <= Math.floor(left / 2) : after <= Math.ceil(left / 2);
      }),
    );
    const options = feasible.length ? feasible : available.length ? available : [...counts].filter(([, count]) => count > 0);
    let r = random() * options.reduce((sum, [, count]) => sum + count, 0);
    const [pick] = options.find(([, count]) => (r -= count) < 0) ?? options[options.length - 1];
    out.push(pick);
    counts.set(pick, (counts.get(pick) ?? 0) - 1);
  }
  return out;
}

function randomWalk(notes: number[], length: number, random: Random): number[] {
  const indexes = [0];
  while (indexes.length < length - 1) {
    const current = indexes[indexes.length - 1];
    const r = random();
    let move = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
    if (current + move < 0 || current + move >= notes.length) move = -move;
    indexes.push(Math.min(notes.length - 1, Math.max(0, current + move)));
  }
  indexes.push(0);
  return indexes.map((i) => notes[i]);
}

/** 0 is ideal: every must-include note, no note twice in a row, and a step (or a small skip) into the final home note. */
function melodyScore(melody: number[], notes: number[], mustInclude: number[]): number {
  let score = mustInclude.filter((midi) => !melody.includes(midi)).length * 100;
  for (let i = 1; i < melody.length; i++) if (melody[i] === melody[i - 1]) score += 10;
  if (notes.indexOf(melody[melody.length - 2]) > 2) score += 5;
  return score;
}

@Injectable({ providedIn: 'root' })
export class PathService {
  private readonly theory = inject(TheoryService);
  private readonly library = inject(SongsService);

  readonly passAccuracy = PASS_ACCURACY;
  readonly stepTypes = STEP_TYPES;
  readonly noteHints = NOTE_HINTS;

  /**
   * The whole journey. Later phases are listed (comingSoon, no units) so the
   * learner sees where it goes; each needs something new in the app first -
   * the bass clef, both hands, chords (see the project skill's roadmap).
   *
   * A phase's title and description are not here: phaseTitle() and
   * phaseDescription() of path-words.ts word them from its id. A unit's title
   * is DATA - the English a lesson's stored session label begins with - and a
   * page shows it only through unitTitle(), which translates the one that has
   * ordinary words in it ("B and high C") and leaves note letters as they are.
   */
  readonly phases: readonly Phase[] = this.numbered([
    {
      id: 'right-hand',
      keyboard: { lowMidi: 48, highMidi: 84 },
      units: [
        this.unit('rh-1', 'C, D, E', ['C4', 'D4', 'E4'], 'hot-cross-buns'),
        this.unit('rh-2', 'G', ['G4'], 'mary-had-a-little-lamb'),
        this.unit('rh-3', 'F', ['F4'], 'ode-to-joy'),
        this.unit('rh-4', 'A', ['A4'], 'twinkle-twinkle'),
        this.unit('rh-5', 'B and high C', ['B4', 'C5'], 'joy-to-the-world'),
      ],
    },
    { id: 'left-hand', comingSoon: true, units: [] },
    { id: 'hands-together', comingSoon: true, units: [] },
    { id: 'left-hand-chords', comingSoon: true, units: [] },
    { id: 'right-hand-chords', comingSoon: true, units: [] },
    { id: 'melody-and-chords', comingSoon: true, units: [] },
  ]);

  /** Every step of the path, in the order it must be done. */
  readonly pathSteps: readonly PathStep[] = this.phases.flatMap((phase) =>
    phase.units.flatMap((unit) =>
      unit.steps.map((step) => ({
        key: this.stepKey(unit.id, step.id),
        phase,
        unit,
        step,
      })),
    ),
  );

  private unit(id: string, title: string, newNoteNames: string[], songId: string): Omit<Unit, 'number' | 'phaseId'> {
    const steps: Step[] = [];
    if (newNoteNames.length) steps.push({ id: 'meet', type: 'meet' });
    steps.push({ id: 'drill', type: 'drill' }, { id: 'read', type: 'read' }, { id: 'tempo', type: 'tempo' }, { id: 'song', type: 'song', songId });
    return { id, title, newNotes: newNoteNames.map((name) => this.theory.nameToMidi(name)), steps };
  }

  private numbered(phases: Array<Omit<Phase, 'number' | 'units'> & { units: Array<Omit<Unit, 'number' | 'phaseId'>> }>): Phase[] {
    return phases.map((phase, p) => ({
      ...phase,
      number: p + 1,
      units: phase.units.map((unit, i) => ({ ...unit, number: i + 1, phaseId: phase.id })),
    }));
  }

  stepKey(unitId: string, stepId: string): string {
    return `${unitId}/${stepId}`;
  }

  findStep(unitId: string | null | undefined, stepId: string | null | undefined): PathStep | null {
    if (!unitId || !stepId) return null;
    const key = this.stepKey(unitId, stepId);
    return this.pathSteps.find((entry) => entry.key === key) ?? null;
  }

  findUnit(unitId: string): Unit | null {
    for (const phase of this.phases) {
      const unit = phase.units.find((u) => u.id === unitId);
      if (unit) return unit;
    }
    return null;
  }

  songForStep(step: Step): Song | null {
    return this.library.byId(step.songId);
  }

  createInitialPathProgress(): PathProgress {
    return { steps: {} };
  }

  getStepRecord(path: PathProgress | null | undefined, key: string): StepRecord | null {
    return path?.steps?.[key] ?? null;
  }

  isStepPassed(path: PathProgress | null | undefined, key: string): boolean {
    const record = this.getStepRecord(path, key);
    return !!record && record.bestAccuracy >= PASS_ACCURACY;
  }

  private firstOpenIndex(path: PathProgress | null | undefined): number {
    const i = this.pathSteps.findIndex((entry) => !this.isStepPassed(path, entry.key));
    return i === -1 ? this.pathSteps.length : i;
  }

  /** A step is playable once every step before it has been passed. */
  isStepUnlocked(path: PathProgress | null | undefined, key: string): boolean {
    const i = this.pathSteps.findIndex((entry) => entry.key === key);
    return i !== -1 && i <= this.firstOpenIndex(path);
  }

  /** The first step not passed yet - null when the whole available path is done. */
  getNextStep(path: PathProgress | null | undefined): PathStep | null {
    return this.pathSteps[this.firstOpenIndex(path)] ?? null;
  }

  /** The step after `key` in path order (maybe in the next unit), or null. */
  getStepAfter(key: string): PathStep | null {
    const i = this.pathSteps.findIndex((entry) => entry.key === key);
    return i === -1 ? null : (this.pathSteps[i + 1] ?? null);
  }

  getUnitStatus(path: PathProgress | null | undefined, unit: Unit): UnitStatus {
    if (unit.steps.every((step) => this.isStepPassed(path, this.stepKey(unit.id, step.id)))) return 'done';
    return this.isStepUnlocked(path, this.stepKey(unit.id, unit.steps[0].id)) ? 'current' : 'locked';
  }

  /** A new path document with one attempt at a step added. */
  recordStepResult(path: PathProgress | null | undefined, key: string, accuracy: number, now: Date = new Date()): PathProgress {
    const previous = this.getStepRecord(path, key);
    const bestAccuracy = Math.max(previous?.bestAccuracy ?? 0, accuracy);
    const record: StepRecord = {
      attempts: (previous?.attempts ?? 0) + 1,
      lastAccuracy: accuracy,
      bestAccuracy,
      passedAt: previous?.passedAt ?? (bestAccuracy >= PASS_ACCURACY ? now.toISOString() : null),
      updatedAt: now.toISOString(),
    };
    return { ...(path ?? { steps: {} }), steps: { ...(path?.steps ?? {}), [key]: record } };
  }

  /** The notes a unit may use: its own new notes and those of the phase's earlier units. */
  notePoolForUnit(unitId: string): number[] {
    for (const phase of this.phases) {
      const i = phase.units.findIndex((unit) => unit.id === unitId);
      if (i !== -1) return [...new Set(phase.units.slice(0, i + 1).flatMap((unit) => unit.newNotes))].sort((a, b) => a - b);
    }
    return [];
  }

  /**
   * A drill step's flashcards: about 40% are the unit's new notes, the rest
   * earlier notes of the phase - the ones the scheduler wants soonest
   * (overdue, or never practised) first.
   */
  buildDrillRound(unit: Unit, progress: ProgressMap, length = 10, random: Random = Math.random): number[] {
    const pool = this.notePoolForUnit(unit.id);
    const dueTime = (midi: number): number => {
      const dueAt = progress[midi]?.dueAt;
      return dueAt ? new Date(dueAt).getTime() : 0;
    };
    const older = pool.filter((midi) => !unit.newNotes.includes(midi)).sort((a, b) => dueTime(a) - dueTime(b));

    const newCount = older.length === 0 ? length : unit.newNotes.length === 0 ? 0 : Math.max(unit.newNotes.length, Math.round(length * 0.4));
    const prompts: number[] = [];
    for (let i = 0; i < newCount; i++) prompts.push(unit.newNotes[i % unit.newNotes.length]);
    for (let i = 0; prompts.length < length; i++) prompts.push(older[i % older.length]);
    return spreadOut(prompts, random);
  }

  /**
   * A short, singable melody over `pool`: mostly steps (now and then a skip),
   * starting and ending on the lowest note (the "home" note - C for the right
   * hand), with every note of `mustInclude` in it at least once.
   */
  generateMelody(pool: number[], length = 8, mustInclude: number[] = [], random: Random = Math.random): number[] {
    const notes = [...pool].sort((a, b) => a - b);
    if (notes.length === 1) return Array(length).fill(notes[0]);

    // Many random walks, keeping the most singable - rather than forcing new
    // notes into one walk afterwards, which makes awkward leaps.
    let melody: number[] = [];
    let bestScore = Infinity;
    for (let attempt = 0; attempt < 200 && bestScore > 0; attempt++) {
      const candidate = randomWalk(notes, length, random);
      const score = melodyScore(candidate, notes, mustInclude);
      if (score < bestScore) {
        melody = candidate;
        bestScore = score;
      }
    }

    // A safety net for lengths so short no walk can reach a must-include note.
    const inner = Array.from({ length: Math.max(0, length - 2) }, (_, i) => i + 1);
    for (const midi of mustInclude) {
      if (melody.includes(midi) || inner.length === 0) continue;
      const spots = inner.filter((i) => melody[i - 1] !== midi && melody[i + 1] !== midi && !mustInclude.includes(melody[i]));
      const choices = spots.length ? spots : inner;
      melody[choices[Math.floor(random() * choices.length)]] = midi;
    }
    return melody;
  }

  /** Shuffled copy (the free-practice views use it too). */
  shuffle<T>(items: T[], random: Random = Math.random): T[] {
    return shuffle(items, random);
  }
}
