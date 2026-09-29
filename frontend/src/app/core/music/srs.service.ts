import { Injectable } from '@angular/core';
import { NoteState, ProgressMap } from './music.types';

// Adaptive scheduling for single notes, modelled on the SM-2 spaced-repetition
// algorithm (the one Anki uses for vocabulary) and adapted to the piano:
// grading blends pitch with timing instead of pure recall. The browser works
// out every change here; the server only keeps the result.

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.5;
/** About six months - plenty for a mastered note's reviews. */
const MAX_INTERVAL_HOURS = 24 * 180;
/**
 * The first correct answers are "learning steps" (4 h, then 24 h) and may all
 * happen in one sitting. Past them, the interval grows at most once a day.
 */
const LEARNING_STEPS = 2;

export interface Attempt {
  /** Did the played pitch match the target? */
  correct: boolean;
  /** How far off the expected moment, in ms - null where there is no clock (the Note Trainer). */
  timingErrorMs: number | null;
  /** What counts as "on time" (grade 5) at this tempo. */
  timingToleranceMs?: number;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

@Injectable({ providedIn: 'root' })
export class SrsService {
  /** A never-practised note. */
  createInitialNoteState(midi: number): NoteState {
    return {
      midi,
      status: 'new',
      repetitions: 0,
      easeFactor: 2.5,
      intervalHours: 0,
      dueAt: null,
      lastGrade: null,
      totalAttempts: 0,
      correctAttempts: 0,
      avgTimingErrorMs: null,
      lastGrowthAt: null,
      updatedAt: null,
    };
  }

  /** A raw attempt as an SM-2 grade, 0-5. */
  gradeAttempt({ correct, timingErrorMs, timingToleranceMs = 250 }: Attempt): number {
    if (!correct) return 1;
    if (timingErrorMs === null || timingErrorMs === undefined) return 4; // correct, no clock to be on time with
    const off = Math.abs(timingErrorMs);
    if (off <= timingToleranceMs * 0.4) return 5;
    if (off <= timingToleranceMs) return 4;
    if (off <= timingToleranceMs * 2) return 3;
    return 2; // the right key, but well off the beat
  }

  /**
   * One graded attempt applied to a note (the SM-2 rule). Grade 3 and up is a
   * pass: repetitions grow and the interval stretches by the ease factor.
   * Below 3 is a lapse: repetitions start again and the note comes back soon.
   *
   * A lesson plays the same note many times within minutes, unlike a flashcard
   * seen once a day. So once a note is past its learning steps, only the first
   * pass of a (local) day moves the schedule; later passes that day still count
   * for accuracy but leave repetitions, interval, ease and dueAt alone.
   */
  updateNoteState(state: NoteState, grade: number, timingErrorMs: number | null = null, now: Date = new Date()): NoteState {
    const next: NoteState = { ...state };
    next.totalAttempts += 1;
    if (grade >= 3) next.correctAttempts += 1;
    next.lastGrade = grade;
    next.updatedAt = now.toISOString();

    if (timingErrorMs !== null && timingErrorMs !== undefined) {
      next.avgTimingErrorMs = next.avgTimingErrorMs === null
        ? Math.abs(timingErrorMs)
        : next.avgTimingErrorMs * 0.8 + Math.abs(timingErrorMs) * 0.2;
    }

    if (grade < 3) {
      next.repetitions = 0;
      next.intervalHours = 1;
      next.status = next.status === 'mastered' ? 'review' : 'learning';
    } else if (next.repetitions >= LEARNING_STEPS && next.lastGrowthAt && sameLocalDay(new Date(next.lastGrowthAt), now)) {
      return next; // moved forward already today
    } else {
      next.lastGrowthAt = now.toISOString();
      next.repetitions += 1;
      if (next.repetitions === 1) next.intervalHours = 4;
      else if (next.repetitions === 2) next.intervalHours = 24;
      else next.intervalHours = Math.min(MAX_INTERVAL_HOURS, Math.round(next.intervalHours * next.easeFactor));

      // Both bounds matter: without a cap on the ease factor, a note drilled
      // many times compounds intervalHours on every rep; without a cap on the
      // interval, that eventually overflows Date's range and dueAt throws.
      next.easeFactor = Math.min(MAX_EASE_FACTOR, Math.max(MIN_EASE_FACTOR, next.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))));

      if (next.repetitions >= 5 && next.intervalHours >= 240) next.status = 'mastered';
      else if (next.repetitions >= 2) next.status = 'review';
      else next.status = 'learning';
    }

    next.dueAt = new Date(now.getTime() + next.intervalHours * 3600 * 1000).toISOString();
    return next;
  }

  /**
   * A one-time repair for progress saved before the once-per-day rule, when
   * every key press grew the interval and notes were "mastered" with months-
   * long intervals after one sitting. Such notes (no lastGrowthAt, more
   * repetitions than the learning steps) go back to where one sitting really
   * gets you: the end of the learning steps, due a day after the last
   * practice. Idempotent; applied in memory at start, saved with the next save.
   */
  repairInflatedProgress(progress: ProgressMap): ProgressMap {
    const repaired: ProgressMap = {};
    for (const [midi, state] of Object.entries(progress)) {
      if (state && state.lastGrowthAt === undefined && state.repetitions > LEARNING_STEPS) {
        const last = state.updatedAt ? new Date(state.updatedAt) : new Date();
        repaired[midi] = {
          ...state,
          repetitions: LEARNING_STEPS,
          intervalHours: 24,
          status: 'review',
          dueAt: new Date(last.getTime() + 24 * 3600 * 1000).toISOString(),
          lastGrowthAt: last.toISOString(),
        };
      } else {
        repaired[midi] = state;
      }
    }
    return repaired;
  }

  /** "Known" - past its first learning, so sheets and songs may use it. */
  isUnlocked(state: NoteState | null | undefined): boolean {
    return !!state && (state.status === 'review' || state.status === 'mastered');
  }

  /** A started note (learning, review or mastered) whose review time has come. */
  isDue(state: NoteState | null | undefined, now: number = Date.now()): boolean {
    return !!state && state.status !== 'new' && !!state.dueAt && new Date(state.dueAt).getTime() <= now;
  }

  /**
   * The next practice queue: overdue notes first, then learning and review
   * notes not due yet (soonest first), then at most one new note from the
   * curriculum - held back while maxActiveNew notes are still being learned.
   */
  pickPracticeQueue(progress: ProgressMap, curriculum: readonly number[], { maxActiveNew = 3, count = 8 } = {}): number[] {
    const now = Date.now();
    const withState = curriculum.map((midi) => ({ midi, state: progress[midi] ?? this.createInitialNoteState(midi) }));

    // Mastered notes come back only when their (long) interval runs out; they
    // are never pulled in early like learning and review notes are.
    const active = withState.filter(({ state }) => state.status === 'learning' || state.status === 'review');
    const due = withState
      .filter(({ state }) => this.isDue(state, now))
      .sort((a, b) => new Date(a.state.dueAt as string).getTime() - new Date(b.state.dueAt as string).getTime());
    const dueSet = new Set(due.map((x) => x.midi));
    const notYetDue = active
      .filter(({ midi }) => !dueSet.has(midi))
      .sort((a, b) => new Date(a.state.dueAt ?? 0).getTime() - new Date(b.state.dueAt ?? 0).getTime());

    const queue = [...due, ...notYetDue];

    // Only notes still "learning" count against the new-note cap: a note in
    // "review" is known, and reinforcing it on its schedule must not hold back
    // the next new note for days.
    const learning = withState.filter(({ state }) => state.status === 'learning').length;
    if (learning < maxActiveNew && queue.length < count) {
      const nextNew = withState.find(({ state }) => state.status === 'new');
      if (nextNew) queue.push(nextNew);
    }

    // Nothing started yet, or everything mastered and nothing due: the first
    // curriculum note starts a brand-new learner off.
    if (queue.length === 0) return [curriculum[0]];

    return queue.slice(0, count).map((x) => x.midi);
  }

  /** How many started notes (mastered ones included) are due for review now. */
  countDueNotes(progress: ProgressMap, curriculum: readonly number[], now: number = Date.now()): number {
    return curriculum.filter((midi) => this.isDue(progress[midi], now)).length;
  }

  /** The notes known well enough for generated sheets and songs. */
  getKnownNotes(progress: ProgressMap, curriculum: readonly number[]): number[] {
    return curriculum.filter((midi) => this.isUnlocked(progress[midi]));
  }
}
