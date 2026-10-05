import type { StaveNote } from 'vexflow/bravura';
import type { KeyboardModel } from '../../ui/piano-keyboard/keyboard-model';
import { Metronome } from '../audio/metronome';
import type { NoteOnDetail, PianoMidi } from '../midi/midi.service';
import type { NoteState, SessionInput } from '../music/music.types';
import type { SrsService } from '../music/srs.service';
import type { TheoryService } from '../music/theory.service';
import type { Notation, SequenceNote } from '../notation/notation';

// Plays a note sequence against the learner's MIDI input: draws it as staff
// notation, marks the current note, grades each played note and feeds the
// grades into the SRS. Shared by Sheet Practice, Songs, and the learning
// path's read / play-in-time / song steps - there is no second grading loop.
//
// Two modes:
//  - 'tempo': a 4-beat metronome count-in, then the music moves by itself,
//    one note per click, like a rhythm game. Each note owns the half beat
//    before and after its click; a key press is graded against the note whose
//    window it falls in (the pitch, and how close to the click). A note nobody
//    played in its window is marked missed and the music keeps going. Presses
//    during the count-in, and extra presses on a note already answered, are
//    ignored.
//  - 'wait': no clock; it waits on each note until it is played. Accuracy
//    counts first-try hits; after a couple of misses the right key lights up.
//
// What it says to the learner it says as a key of the app's strings and the
// values for that string's {placeholders} - never as a sentence: the page
// words it, in the language it is in, and words it again when the language
// changes. Every key is a whole sentence (player.*), written out here as a
// literal so the key scan finds it. The player stays a plain class: nothing is
// injected, nothing is imported from core/i18n, and nothing is awaited in its
// MIDI handler.

const WAIT_MODE_HINT_AFTER_MISSES = 2;

export type PlayMode = 'tempo' | 'wait';
export type FeedbackKind = 'correct' | 'incorrect' | null;
/** The values of a sentence's placeholders: a note name ({note}) or whole numbers. */
export type FeedbackParams = Record<string, string | number>;

export interface PlayerResult {
  mode: PlayMode;
  bpm: number | null;
  correct: number;
  total: number;
  accuracy: number;
  avgTimingErrorMs: number | null;
  startedAt: string;
  endedAt: string;
}

/** What the player needs of ProgressStore: one note's answer into the store's progress as it is then - never a copy kept for a round. */
export interface PlayerStore {
  updateNote(midi: number, change: (current: NoteState) => NoteState): Promise<void>;
}

export interface SequencePlayerOptions {
  midi: PianoMidi;
  srs: SrsService;
  theory: TheoryService;
  store: PlayerStore;
  notation: Notation;
  keyboard: KeyboardModel;
  /** What to tell the learner: a key of the app's strings, its placeholders' values, and how it went. */
  feedback: (key: string, params?: FeedbackParams, kind?: FeedbackKind) => void;
  onFinish?: (result: PlayerResult) => void;
}

type NoteResult = 'correct' | 'incorrect' | 'missed' | null;

export class SequencePlayer {
  private notes: SequenceNote[] = [];
  private staveNotes: StaveNote[] = [];
  private active = false;
  private destroyed = false;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly keyTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly metronome = new Metronome();
  private readonly onNoteOn = (event: Event): void => this.handleNoteOn((event as CustomEvent<NoteOnDetail>).detail);

  mode: PlayMode = 'tempo';
  bpm = 80;
  private index = 0;
  private correct = 0;
  private timingErrors: number[] = [];
  private missesOnCurrent = 0;
  private startedAt = '';
  private beatMs = 0;
  /** When each note's click is due (performance.now() time) - the browser tests read these. */
  expectedTimes: number[] | null = null;
  private results: NoteResult[] = [];

  constructor(private readonly options: SequencePlayerOptions) {
    options.midi.addEventListener('noteon', this.onNoteOn);
  }

  /** Draws a new sequence (and stops whatever was playing). */
  load(notes: SequenceNote[], { timeSignature = '4/4' } = {}): void {
    this.stop();
    this.notes = notes;
    this.staveNotes = this.options.notation.renderSequence(notes, { timeSignature });
  }

  get isActive(): boolean {
    return this.active;
  }

  start({ mode = 'tempo', bpm = 80 }: { mode?: PlayMode; bpm?: number } = {}): void {
    if (this.destroyed || this.notes.length === 0) return;
    this.stop();
    this.mode = mode;
    this.bpm = bpm;
    this.active = true;
    this.index = 0;
    this.correct = 0;
    this.timingErrors = [];
    this.missesOnCurrent = 0;
    this.startedAt = new Date().toISOString();
    // Like window.pianoMIDI: lets the devtools and the browser tests read expectedTimes.
    (globalThis as { pianoPlayer?: SequencePlayer }).pianoPlayer = this;
    this.options.keyboard.clearStates();
    this.staveNotes.forEach((note) => note.getSVGElement()?.classList.remove('is-correct', 'is-incorrect'));
    this.markCurrent();

    if (mode === 'tempo') {
      this.beatMs = 60000 / bpm;
      this.expectedTimes = this.metronome.schedule(this.notes.length, bpm, { leadInBeats: 4 }).expectedPerformanceTimes;
      this.results = this.notes.map(() => null);
      this.scheduleWindowEnd();
      this.options.feedback('player.countIn');
    } else {
      this.expectedTimes = null;
      this.options.feedback('player.takeYourTime');
    }
  }

  stop(): void {
    this.active = false;
    if (this.windowTimer !== null) clearTimeout(this.windowTimer);
    this.windowTimer = null;
    this.metronome.stop();
  }

  /** Stops, lets go of the piano, and never starts again. */
  destroy(): void {
    this.destroyed = true;
    this.stop();
    for (const timer of this.keyTimers) clearTimeout(timer);
    this.keyTimers.clear();
    this.options.midi.removeEventListener('noteon', this.onNoteOn);
  }

  private handleNoteOn(detail: NoteOnDetail): void {
    if (!this.active) return;
    if (this.mode === 'wait') this.handleWait(detail.midi, this.notes[this.index].midi);
    else this.handleTempo(detail.midi, detail.timestamp);
  }

  /** A key lit for a moment. */
  private flashKey(midi: number, ms: number): void {
    const timer = setTimeout(() => {
      this.keyTimers.delete(timer);
      this.options.keyboard.setKeyState(midi, null);
    }, ms);
    this.keyTimers.add(timer);
  }

  /**
   * The clock, not the learner, moves the music: when the current note's
   * window (its click + half a beat) closes, an unanswered note becomes a miss
   * and the next note is current. After the last window the run ends.
   */
  private scheduleWindowEnd(): void {
    const expected = this.expectedTimes as number[];
    const closesAt = expected[this.index] + this.beatMs / 2;
    this.windowTimer = setTimeout(() => {
      if (!this.active) return;
      if (this.results[this.index] === null) {
        // Not played is no evidence about the note itself: no SRS update.
        this.results[this.index] = 'missed';
        this.markNote(this.index, 'is-incorrect');
        this.options.feedback('player.missed', undefined, 'incorrect');
      }
      if (this.index === this.notes.length - 1) {
        this.finish();
        return;
      }
      this.index += 1;
      this.markCurrent();
      this.scheduleWindowEnd();
    }, Math.max(0, closesAt - performance.now()));
  }

  private handleTempo(played: number, timestamp: number): void {
    const expected = this.expectedTimes as number[];
    // The press belongs to the note with the nearest click. Before the first
    // window it is count-in noise; on an answered note, an extra press.
    const i = Math.round((timestamp - expected[0]) / this.beatMs);
    if (i < 0 || i >= this.notes.length || this.results[i] !== null) return;

    const target = this.notes[i].midi;
    const correct = played === target;
    const timingErrorMs = timestamp - expected[i];
    const toleranceMs = this.beatMs / 2;
    this.updateSrs(target, this.options.srs.gradeAttempt({ correct, timingErrorMs, timingToleranceMs: toleranceMs }), timingErrorMs);
    this.results[i] = correct ? 'correct' : 'incorrect';
    if (correct) {
      this.correct += 1;
      this.timingErrors.push(timingErrorMs);
      const tight = Math.abs(timingErrorMs) <= toleranceMs * 0.4;
      this.options.feedback(tight ? 'player.onTheClick' : timingErrorMs < 0 ? 'player.early' : 'player.late', undefined, 'correct');
    } else {
      this.options.feedback('player.wrong.keepGoing', { note: this.options.theory.midiToName(played) }, 'incorrect');
    }
    this.markNote(i, correct ? 'is-correct' : 'is-incorrect');
    this.options.keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    this.flashKey(played, 250);

    if (i === this.notes.length - 1) this.finish();
  }

  private handleWait(played: number, target: number): void {
    const { keyboard, theory, srs } = this.options;
    if (played !== target) {
      // Only the first miss on a note counts against it in the scheduler.
      if (this.missesOnCurrent === 0) this.updateSrs(target, srs.gradeAttempt({ correct: false, timingErrorMs: null }), null);
      this.missesOnCurrent += 1;
      keyboard.setKeyState(played, 'incorrect');
      this.flashKey(played, 400);
      if (this.missesOnCurrent >= WAIT_MODE_HINT_AFTER_MISSES) keyboard.setKeyState(target, 'target');
      this.options.feedback('player.wrong.tryAgain', { note: theory.midiToName(played) }, 'incorrect');
      return;
    }

    const firstTry = this.missesOnCurrent === 0;
    if (firstTry) {
      this.correct += 1;
      this.updateSrs(target, srs.gradeAttempt({ correct: true, timingErrorMs: null }), null);
    }
    this.missesOnCurrent = 0;
    this.markNote(this.index, firstTry ? 'is-correct' : 'is-incorrect');
    keyboard.clearStates();
    keyboard.setKeyState(played, 'correct');
    this.flashKey(played, 250);
    this.options.feedback(firstTry ? 'player.good' : 'player.gotIt', undefined, 'correct');
    this.advance();
  }

  /** The grade into the SRS, and the save on its way - never awaited, so the next press is graded at once. */
  private updateSrs(target: number, grade: number, timingErrorMs: number | null): void {
    const { srs, store } = this.options;
    store.updateNote(target, (current) => srs.updateNoteState(current, grade, timingErrorMs)).catch((error) => console.error('Failed to save progress', error));
  }

  private advance(): void {
    this.index += 1;
    if (this.index < this.notes.length) {
      this.markCurrent();
      return;
    }
    this.finish();
  }

  private finish(): void {
    // Not stop(): closing the metronome here could cut off the last click.
    this.active = false;
    if (this.windowTimer !== null) clearTimeout(this.windowTimer);
    this.windowTimer = null;
    this.staveNotes.forEach((note) => note.getSVGElement()?.classList.remove('is-current'));
    if (this.mode === 'tempo') {
      this.results.forEach((result, i) => {
        if (result === null) this.markNote(i, 'is-incorrect');
      });
    }
    const total = this.notes.length;
    const accuracy = Math.round((this.correct / total) * 100);
    const avgTimingErrorMs = this.timingErrors.length
      ? Math.round(this.timingErrors.reduce((sum, error) => sum + Math.abs(error), 0) / this.timingErrors.length)
      : null;
    // Two whole sentences, not one with a clause glued on: a run in time also says how far off the clicks it was.
    const counts = { correct: this.correct, total, accuracy };
    if (avgTimingErrorMs !== null) this.options.feedback('player.doneTimed', { ...counts, ms: avgTimingErrorMs }, accuracy >= 80 ? 'correct' : null);
    else this.options.feedback('player.done', counts, accuracy >= 80 ? 'correct' : null);
    this.options.onFinish?.({
      mode: this.mode,
      bpm: this.mode === 'tempo' ? this.bpm : null,
      correct: this.correct,
      total,
      accuracy,
      avgTimingErrorMs,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
    });
  }

  private markNote(i: number, className: string): void {
    const element = this.staveNotes[i]?.getSVGElement();
    if (!element) return;
    element.classList.remove('is-current', 'is-correct', 'is-incorrect');
    element.classList.add(className);
  }

  private markCurrent(): void {
    this.staveNotes.forEach((note, i) => note.getSVGElement()?.classList.toggle('is-current', i === this.index));
  }
}

/** The session-log fields every mode that plays a sequence shares. */
export function sessionFieldsFromResult(result: PlayerResult): Pick<SessionInput, 'startedAt' | 'endedAt' | 'attempts' | 'correct' | 'accuracy' | 'bpm' | 'avgTimingErrorMs'> {
  return {
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    attempts: result.total,
    correct: result.correct,
    accuracy: result.accuracy,
    bpm: result.bpm,
    avgTimingErrorMs: result.avgTimingErrorMs,
  };
}
