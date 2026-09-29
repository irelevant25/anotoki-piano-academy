// The shapes the app works with - and saves. A note's progress, the path's
// step records and a finished session are stored by the backend exactly as
// they are here (it checks their shape, never their meaning), so a field
// renamed here is a field lost from everybody's saved progress.

/** new -> learning -> review -> mastered (or back to learning on a miss). */
export type NoteStatus = 'new' | 'learning' | 'review' | 'mastered';

/** One note's spaced-repetition state (see SrsService). */
export interface NoteState {
  midi: number;
  status: NoteStatus;
  repetitions: number;
  easeFactor: number;
  intervalHours: number;
  dueAt: string | null;
  lastGrade: number | null;
  totalAttempts: number;
  correctAttempts: number;
  avgTimingErrorMs: number | null;
  /** The last time a correct answer moved the schedule forward (once per local day). */
  lastGrowthAt: string | null;
  updatedAt: string | null;
}

/** Every note's state, keyed by MIDI number ("60"). PUT /api/progress takes the whole map. */
export type ProgressMap = Record<string, NoteState>;

/** One learning-path step's results, kept under "unitId/stepId". */
export interface StepRecord {
  attempts: number;
  lastAccuracy: number;
  bestAccuracy: number;
  passedAt: string | null;
  updatedAt: string;
}

/** PUT /api/path takes the whole document. */
export interface PathProgress {
  steps: Record<string, StepRecord>;
}

export interface SongNote {
  midi: number;
  beat: number;
  durationBeats: number;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  timeSignature: string;
  notes: SongNote[];
}

export type StepType = 'meet' | 'drill' | 'read' | 'tempo' | 'song';

export interface Step {
  /** Persisted in step keys: never rename. */
  id: string;
  type: StepType;
  songId?: string;
}

export interface KeyboardRange {
  lowMidi: number;
  highMidi: number;
}

export interface Unit {
  /** Persisted in step keys: never rename. */
  id: string;
  title: string;
  newNotes: number[];
  steps: Step[];
  number: number;
  phaseId: string;
}

export interface Phase {
  id: string;
  title: string;
  description: string;
  comingSoon?: boolean;
  keyboard?: KeyboardRange;
  units: Unit[];
  number: number;
}

/** One step of the path with where it sits. */
export interface PathStep {
  key: string;
  phase: Phase;
  unit: Unit;
  step: Step;
}

export type SessionMode = 'trainer' | 'sheet' | 'song' | 'lesson';

/**
 * A finished round, as the app records it. A new field or mode needs a line
 * in the backend's SESSION_FIELDS / SESSION_MODES too (api/store.php), or the
 * server drops or refuses it.
 */
export interface SessionInput {
  mode: SessionMode;
  label?: string;
  unitId?: string;
  stepId?: string;
  songId?: string;
  songTitle?: string;
  startedAt?: string;
  endedAt?: string;
  attempts?: number;
  correct?: number;
  accuracy?: number;
  bpm?: number | null;
  avgTimingErrorMs?: number | null;
}

/** A session as the server stored it: it gives the id and the time. */
export interface Session extends SessionInput {
  id: string;
  recordedAt: string;
}

/** Everything the app starts with: GET /api/state. */
export interface AppState {
  progress: ProgressMap;
  sessions: Session[];
  path: PathProgress;
}
