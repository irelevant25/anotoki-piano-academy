import { Phase, StepType, Unit } from '../music/music.types';
import { DYNAMIC_KEYS } from './dynamic-keys';
import { TranslationService } from './translation.service';

/**
 * The learning path's own sentences, in the learner's language: a phase's
 * title and description, a step type's name and its short form, where a new
 * note's key sits, and the one unit title that has ordinary words in it.
 *
 * PathService stays pure: it knows ids, notes and rules, and no language. The
 * keys are put together here, only from its own ids - a phase's, a step's
 * type, a unit's, a MIDI number - and every one of them is written out in
 * dynamic-keys.ts, where the key scan reads them. path-words.spec.ts holds the
 * two in step. Nothing here takes an id from an address or a stored session:
 * a page finds the phase, the unit or the step in PathService first
 * (findStep(), findUnit()) and hands over what it found.
 *
 * What is not translated stays out of here: a unit title that is only note
 * letters ("C, D, E") is shown as it is, and so is every note name.
 *
 * Call these from a template's bindings or inside a computed(): t() reads
 * signals, so the words follow the language. Never keep what they answer in a
 * field or a signal.
 */

const PHASE = 'path.phase.';
const STEP = 'path.step.';
const HINT = 'path.hint.';
const UNIT = 'path.unit.';

/** What wording needs of the translation service. */
export type PathWords = Pick<TranslationService, 't'>;

/** Is `tail` one of the tails dynamic-keys.ts writes out for `prefix`? */
function declared(prefix: string, tail: string): boolean {
  return Object.hasOwn(DYNAMIC_KEYS, prefix) && DYNAMIC_KEYS[prefix].includes(tail);
}

/** "Right hand": the name of a phase of the path. */
export function phaseTitle(i18n: PathWords, phase: Pick<Phase, 'id'>): string {
  return i18n.t(`${PHASE}${phase.id}.title`);
}

/** The line under a phase's name: what is learned in it. */
export function phaseDescription(i18n: PathWords, phase: Pick<Phase, 'id'>): string {
  return i18n.t(`${PHASE}${phase.id}.description`);
}

/** "Meet the notes", "Note drill", "Read a melody", "Play in time", "Song": a step's name in full. */
export function stepTitle(i18n: PathWords, type: StepType): string {
  return i18n.t(`${STEP}${type}.title`);
}

/** "Meet", "Drill", "Read", "In time", "Song": a step's name on a chip and in a list. */
export function stepShort(i18n: PathWords, type: StepType): string {
  return i18n.t(`${STEP}${type}.short`);
}

/**
 * A unit's title as the learner reads it: translated where it has ordinary
 * words ("B and high C" - the note letters in it stay), and as PathService has
 * it where it is only note letters ("C, D, E"), which have no key.
 */
export function unitTitle(i18n: PathWords, unit: Pick<Unit, 'id' | 'title'>): string {
  const tail = `${unit.id}.title`;
  return declared(UNIT, tail) ? i18n.t(UNIT + tail) : unit.title;
}

/**
 * The key of "where this note's key sits" (the meet step) - null for a note
 * that has no hint, so the page draws nothing and asks for no key.
 */
export function hintKey(midi: number): string | null {
  const tail = String(midi);
  return declared(HINT, tail) ? HINT + tail : null;
}
