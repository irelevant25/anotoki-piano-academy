// Adaptive scheduling for individual notes, modeled on the SM-2 spaced-repetition
// algorithm (as used by Anki for language learning) and adapted for piano:
// grading blends pitch correctness with timing accuracy instead of pure recall.

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.5;
const MAX_INTERVAL_HOURS = 24 * 180; // ~6 months - plenty for a "mastered" note's review cadence
// The first correct answers are "learning steps" (4 h, then 24 h) and may all
// happen in one sitting. Past that, the interval grows at most once per day.
const LEARNING_STEPS = 2;

/** @returns {object} a fresh, never-practiced state for a MIDI note. */
export function createInitialNoteState(midi) {
  return {
    midi,
    status: 'new', // new -> learning -> review -> mastered (or back to learning on a miss)
    repetitions: 0,
    easeFactor: 2.5,
    intervalHours: 0,
    dueAt: null,
    lastGrade: null,
    totalAttempts: 0,
    correctAttempts: 0,
    avgTimingErrorMs: null,
    lastGrowthAt: null, // last time a correct answer moved the schedule forward
    updatedAt: null,
  };
}

/**
 * Turns a raw attempt into a 0-5 SM-2 style grade.
 * @param {object} attempt
 * @param {boolean} attempt.correct - whether the played pitch matched the target.
 * @param {number|null} attempt.timingErrorMs - ms off from the expected onset, or
 *   null when the mode has no tempo context (e.g. free note trainer).
 * @param {number} [attempt.timingToleranceMs] - ms considered "on time" (grade 5) at this tempo.
 */
export function gradeAttempt({ correct, timingErrorMs, timingToleranceMs = 250 }) {
  if (!correct) return 1;
  if (timingErrorMs === null || timingErrorMs === undefined) return 4; // correct, no tempo context
  const absErr = Math.abs(timingErrorMs);
  if (absErr <= timingToleranceMs * 0.4) return 5;
  if (absErr <= timingToleranceMs) return 4;
  if (absErr <= timingToleranceMs * 2) return 3;
  return 2; // correct pitch, but timing was well off
}

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Applies one graded attempt to a note's SRS state (SM-2 update rule).
 * grade >= 3 counts as a "pass": repetitions grow and the review interval
 * expands by the ease factor. grade < 3 is a "lapse": repetitions reset and
 * the note comes back for review soon.
 *
 * A piano lesson plays the same note many times within minutes, unlike a
 * flashcard seen once a day. So once a note is past its learning steps, only
 * the first pass of a (local) day moves the schedule; later passes that day
 * still count for accuracy but leave repetitions/interval/ease/dueAt alone.
 */
export function updateNoteState(state, grade, timingErrorMs = null, now = new Date()) {
  const next = { ...state };
  next.totalAttempts += 1;
  if (grade >= 3) next.correctAttempts += 1;
  next.lastGrade = grade;
  next.updatedAt = now.toISOString();

  if (timingErrorMs !== null && timingErrorMs !== undefined) {
    next.avgTimingErrorMs =
      next.avgTimingErrorMs === null
        ? Math.abs(timingErrorMs)
        : next.avgTimingErrorMs * 0.8 + Math.abs(timingErrorMs) * 0.2;
  }

  if (grade < 3) {
    next.repetitions = 0;
    next.intervalHours = 1;
    next.status = next.status === 'mastered' ? 'review' : 'learning';
  } else if (next.repetitions >= LEARNING_STEPS && next.lastGrowthAt && sameLocalDay(new Date(next.lastGrowthAt), now)) {
    return next; // already moved forward today
  } else {
    next.lastGrowthAt = now.toISOString();
    next.repetitions += 1;
    if (next.repetitions === 1) next.intervalHours = 4;
    else if (next.repetitions === 2) next.intervalHours = 24;
    else next.intervalHours = Math.min(MAX_INTERVAL_HOURS, Math.round(next.intervalHours * next.easeFactor));

    // Both bounds matter: without an ease-factor cap, a note drilled many times
    // in one sitting (every SRS update, however frequent) compounds intervalHours
    // exponentially every rep; without an interval cap that eventually overflows
    // JS's Date range and updateNoteState throws when computing dueAt.
    next.easeFactor = Math.min(MAX_EASE_FACTOR, Math.max(MIN_EASE_FACTOR, next.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))));

    if (next.repetitions >= 5 && next.intervalHours >= 240) next.status = 'mastered';
    else if (next.repetitions >= 2) next.status = 'review';
    else next.status = 'learning';
  }

  next.dueAt = new Date(now.getTime() + next.intervalHours * 3600 * 1000).toISOString();
  return next;
}

/**
 * One-time repair for progress saved before the once-per-day rule: there,
 * every key press grew the interval, so notes became "mastered" with
 * months-long intervals after a single sitting. Such notes (no lastGrowthAt,
 * more repetitions than the learning steps) are put back to where one sitting
 * really gets you: end of the learning steps, due a day after the last practice.
 */
export function repairInflatedProgress(progressMap) {
  const repaired = {};
  for (const [midi, state] of Object.entries(progressMap)) {
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

/** A note counts as "known" for sheet/song generation once it's past initial learning. */
export function isUnlocked(state) {
  return !!state && (state.status === 'review' || state.status === 'mastered');
}

/**
 * Builds the next practice queue: overdue notes first, then not-yet-due
 * learning/review notes (soonest first), then at most one new note from the
 * curriculum (capped by maxActiveNew so the learner isn't overwhelmed).
 */
export function pickPracticeQueue(progressMap, curriculum, opts = {}) {
  const { maxActiveNew = 3, count = 8 } = opts;
  const now = Date.now();

  const withState = curriculum.map((midi) => ({
    midi,
    state: progressMap[midi] || createInitialNoteState(midi),
  }));

  // Mastered notes come back only when their (long) interval runs out; they
  // are never pulled in early like learning/review notes are.
  const active = withState.filter(({ state }) => state.status === 'learning' || state.status === 'review');
  const due = withState
    .filter(({ state }) => isDue(state, now))
    .sort((a, b) => new Date(a.state.dueAt) - new Date(b.state.dueAt));
  const dueSet = new Set(due.map((x) => x.midi));
  const notYetDue = active
    .filter(({ midi }) => !dueSet.has(midi))
    .sort((a, b) => new Date(a.state.dueAt) - new Date(b.state.dueAt));

  const queue = [...due, ...notYetDue];

  // Only "learning" (not yet graduated to review) notes count against the new-note
  // cap - a note that has reached "review" is functionally known and reinforcing it
  // on its spaced schedule shouldn't block the next new note from being introduced.
  const learningCount = withState.filter(({ state }) => state.status === 'learning').length;
  if (learningCount < maxActiveNew && queue.length < count) {
    const nextNew = withState.find(({ state }) => state.status === 'new');
    if (nextNew) queue.push(nextNew);
  }

  if (queue.length === 0) {
    // Nothing introduced yet, or everything is mastered with nothing due:
    // fall back to the first curriculum note (bootstraps a brand-new learner).
    return [curriculum[0]];
  }

  return queue.slice(0, count).map((x) => x.midi);
}

/** A started note (learning, review or mastered) whose review time has come. */
function isDue(state, now) {
  return !!state && state.status !== 'new' && !!state.dueAt && new Date(state.dueAt).getTime() <= now;
}

/** How many started notes (mastered ones included) are due for review right now. */
export function countDueNotes(progressMap, curriculum, now = Date.now()) {
  return curriculum.filter((midi) => isDue(progressMap[midi], now)).length;
}

/** Notes currently known well enough to appear in generated sheets/songs. */
export function getKnownNotes(progressMap, curriculum) {
  return curriculum.filter((midi) => isUnlocked(progressMap[midi]));
}
