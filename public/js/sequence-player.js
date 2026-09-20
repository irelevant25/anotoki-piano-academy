// Plays a note sequence against the learner's MIDI input: renders it as staff
// notation, highlights the current note, grades each played note and feeds
// the grades into shared/srs.js. Shared by Sheet Practice, Songs, and the
// learning path's read / play-in-time / song steps.
//
// Two modes:
//  - 'tempo': 4-beat metronome count-in, then the music moves by itself, one
//    note per click (like a rhythm game). Each note owns the half beat before
//    and after its click; a key press is graded against the note whose window
//    it falls in (pitch + how close to the click). A note nobody played in
//    its window is marked missed and the music keeps going. Presses during
//    the count-in, and extra presses on a note already answered, are ignored.
//  - 'wait':  no clock; waits on each note until it's played correctly.
//    Accuracy counts first-try hits; after a couple of misses the right key
//    is shown on the on-screen keyboard.

import { midiToName } from '/shared/theory.js';
import { gradeAttempt, updateNoteState } from '/shared/srs.js';
import { Notation } from './notation.js';
import { Metronome } from './metronome.js';

const WAIT_MODE_HINT_AFTER_MISSES = 2;

export class SequencePlayer {
  /**
   * @param {object} opts
   * @param {object} opts.ctx - the app ctx (midi, getState, getNoteState, saveProgress).
   * @param {HTMLElement} opts.notationEl
   * @param {import('./keyboard.js').PianoKeyboard} opts.keyboard
   * @param {HTMLElement} opts.feedbackEl
   * @param {(result: object) => void} [opts.onFinish] - called with
   *   { mode, bpm, correct, total, accuracy, avgTimingErrorMs, startedAt, endedAt }.
   */
  constructor({ ctx, notationEl, keyboard, feedbackEl, onFinish = () => {} }) {
    this.ctx = ctx;
    this.keyboard = keyboard;
    this.feedbackEl = feedbackEl;
    this.onFinish = onFinish;
    this.notation = new Notation(notationEl);
    this.metronome = new Metronome();
    this.notes = [];
    this.staveNotes = [];
    this.active = false;
    this.destroyed = false;
    this.windowTimer = null;
    this._onNoteOn = (e) => this._handleNoteOn(e);
    ctx.midi.addEventListener('noteon', this._onNoteOn);
  }

  /** @param {{midi:number}[]} notes */
  load(notes, { timeSignature = '4/4' } = {}) {
    this.stop();
    this.notes = notes;
    this.staveNotes = this.notation.renderSequence(notes, { timeSignature });
  }

  get isActive() {
    return this.active;
  }

  start({ mode = 'tempo', bpm = 80 } = {}) {
    if (this.destroyed || this.notes.length === 0) return;
    this.stop();
    this.mode = mode;
    this.bpm = bpm;
    this.active = true;
    this.index = 0;
    this.correct = 0;
    this.timingErrors = [];
    this.missesOnCurrent = 0;
    this.progress = { ...this.ctx.getState().progress };
    this.startedAt = new Date().toISOString();
    window.pianoPlayer = this; // like window.pianoMIDI: lets devtools/tests read expectedTimes
    this.keyboard.clearStates();
    this.staveNotes.forEach((n) => n.getSVGElement()?.classList.remove('is-correct', 'is-incorrect'));
    this._markCurrent();

    if (mode === 'tempo') {
      this.beatMs = 60000 / bpm;
      this.expectedTimes = this.metronome.schedule(this.notes.length, bpm, { leadInBeats: 4 }).expectedPerformanceTimes;
      // Per note: null (not answered yet) | 'correct' | 'incorrect' | 'missed'.
      this.results = this.notes.map(() => null);
      this._scheduleWindowEnd();
      this._setFeedback('Listen to the 4-beat count-in, then play one note on every click.');
    } else {
      this.expectedTimes = null;
      this._setFeedback('Play the blue note. Take your time - there is no clock.');
    }
  }

  stop() {
    this.active = false;
    clearTimeout(this.windowTimer);
    this.metronome.stop();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.ctx.midi.removeEventListener('noteon', this._onNoteOn);
  }

  _handleNoteOn(e) {
    if (!this.active) return;
    const played = e.detail.midi;
    if (this.mode === 'wait') this._handleWait(played, this.notes[this.index].midi);
    else this._handleTempo(played, e.detail.timestamp);
  }

  /**
   * The clock, not the learner, moves the music: when the current note's
   * window (click + half a beat) closes, an unanswered note becomes a miss
   * and the next note becomes current. After the last window the run ends.
   */
  _scheduleWindowEnd() {
    const closesAt = this.expectedTimes[this.index] + this.beatMs / 2;
    this.windowTimer = setTimeout(() => {
      if (!this.active) return;
      if (this.results[this.index] === null) {
        // Not played = no evidence about the note itself, so no SRS update.
        this.results[this.index] = 'missed';
        this._markNote(this.index, 'is-incorrect');
        this._setFeedback('Missed one - keep going.', 'incorrect');
      }
      if (this.index === this.notes.length - 1) {
        this._finish();
        return;
      }
      this.index += 1;
      this._markCurrent();
      this._scheduleWindowEnd();
    }, Math.max(0, closesAt - performance.now()));
  }

  _handleTempo(played, timestamp) {
    // The press belongs to the note with the nearest click. Before the first
    // window it is count-in noise; on an answered note it is an extra press.
    const i = Math.round((timestamp - this.expectedTimes[0]) / this.beatMs);
    if (i < 0 || i >= this.notes.length || this.results[i] !== null) return;

    const target = this.notes[i].midi;
    const correct = played === target;
    const timingErrorMs = timestamp - this.expectedTimes[i];
    const toleranceMs = this.beatMs / 2;
    this._updateSrs(target, gradeAttempt({ correct, timingErrorMs, timingToleranceMs: toleranceMs }), timingErrorMs);
    this.results[i] = correct ? 'correct' : 'incorrect';
    if (correct) {
      this.correct += 1;
      this.timingErrors.push(timingErrorMs);
      const tight = Math.abs(timingErrorMs) <= toleranceMs * 0.4;
      this._setFeedback(tight ? 'Right on the click!' : `Good - a little ${timingErrorMs < 0 ? 'early' : 'late'}.`, 'correct');
    } else {
      this._setFeedback(`That was ${midiToName(played)} - keep going.`, 'incorrect');
    }
    this._markNote(i, correct ? 'is-correct' : 'is-incorrect');
    this.keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    setTimeout(() => this.keyboard.setKeyState(played, null), 250);

    if (i === this.notes.length - 1) this._finish();
  }

  _handleWait(played, target) {
    if (played !== target) {
      // Only the first miss on a note counts against it in the scheduler.
      if (this.missesOnCurrent === 0) this._updateSrs(target, gradeAttempt({ correct: false, timingErrorMs: null }), null);
      this.missesOnCurrent += 1;
      this.keyboard.setKeyState(played, 'incorrect');
      setTimeout(() => this.keyboard.setKeyState(played, null), 400);
      if (this.missesOnCurrent >= WAIT_MODE_HINT_AFTER_MISSES) this.keyboard.setKeyState(target, 'target');
      this._setFeedback(`That was ${midiToName(played)} - try again.`, 'incorrect');
      return;
    }

    const firstTry = this.missesOnCurrent === 0;
    if (firstTry) {
      this.correct += 1;
      this._updateSrs(target, gradeAttempt({ correct: true, timingErrorMs: null }), null);
    }
    this.missesOnCurrent = 0;
    this._markNote(this.index, firstTry ? 'is-correct' : 'is-incorrect');
    this.keyboard.clearStates();
    this.keyboard.setKeyState(played, 'correct');
    setTimeout(() => this.keyboard.setKeyState(played, null), 250);
    this._setFeedback(firstTry ? 'Good!' : 'Got it.', 'correct');
    this._advance();
  }

  _updateSrs(target, grade, timingErrorMs) {
    this.progress[target] = updateNoteState(this.progress[target] || this.ctx.getNoteState(target), grade, timingErrorMs);
    this.ctx.saveProgress(this.progress).catch((err) => console.error('Failed to save progress', err));
  }

  _advance() {
    this.index += 1;
    if (this.index < this.notes.length) {
      this._markCurrent();
      return;
    }
    this._finish();
  }

  _finish() {
    // Not stop(): closing the metronome here could cut off the last click.
    this.active = false;
    clearTimeout(this.windowTimer);
    this.staveNotes.forEach((n) => n.getSVGElement()?.classList.remove('is-current'));
    if (this.mode === 'tempo') this.results.forEach((r, i) => { if (r === null) this._markNote(i, 'is-incorrect'); });
    const total = this.notes.length;
    const accuracy = Math.round((this.correct / total) * 100);
    const avgTimingErrorMs = this.timingErrors.length
      ? Math.round(this.timingErrors.reduce((a, b) => a + Math.abs(b), 0) / this.timingErrors.length)
      : null;
    this._setFeedback(
      `Done - ${this.correct}/${total} correct (${accuracy}%)${avgTimingErrorMs !== null ? `, avg timing off by ${avgTimingErrorMs}ms` : ''}.`,
      accuracy >= 80 ? 'correct' : null,
    );
    this.onFinish({
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

  _markNote(i, cls) {
    const el = this.staveNotes[i]?.getSVGElement();
    if (!el) return;
    el.classList.remove('is-current', 'is-correct', 'is-incorrect');
    el.classList.add(cls);
  }

  _markCurrent() {
    this.staveNotes.forEach((n, i) => {
      const el = n.getSVGElement();
      if (!el) return;
      el.classList.toggle('is-current', i === this.index);
    });
  }

  _setFeedback(text, kind = null) {
    this.feedbackEl.textContent = text;
    this.feedbackEl.className = kind ? `feedback feedback--${kind}` : 'feedback';
  }
}

/** The session-log fields shared by every mode that uses a SequencePlayer. */
export function sessionFieldsFromResult(result) {
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
