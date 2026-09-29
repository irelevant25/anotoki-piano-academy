import type { SessionInput } from '../../core/music/music.types';

/**
 * What a step reports the moment an attempt ends. The lesson saves it at once;
 * `delayMs` only holds back the result screen, so the feedback for the last
 * note can still be read. (A step that waited before reporting would lose the
 * result when the learner left during the pause.)
 */
export interface StepOutcome {
  accuracy: number;
  /** The session to log - null for the meet step, which is not graded. */
  session: Partial<SessionInput> | null;
  delayMs: number;
}

export interface Feedback {
  text: string;
  kind: 'correct' | 'incorrect' | null;
}
