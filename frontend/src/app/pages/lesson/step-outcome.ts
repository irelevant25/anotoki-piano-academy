import type { TranslationParams } from '@anotoki/lib/translations';
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

/**
 * What a practice view tells the learner under the staff: never a sentence,
 * but the key of one (with the values of its {placeholders}), so the template
 * words it in the language on the page - and words it again when the language
 * changes in the middle of a step. `key: null` is "nothing to say": the line
 * stays on the page, empty.
 *
 * A MIDI handler sets this synchronously; nothing worded is ever awaited there.
 * A note name goes in as a parameter, from TheoryService.midiToName().
 */
export interface Feedback {
  key: string | null;
  params?: TranslationParams;
  kind: 'correct' | 'incorrect' | null;
}
