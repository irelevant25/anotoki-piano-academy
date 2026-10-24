import { TestBed } from '@angular/core/testing';
import type { StaveNote } from 'vexflow/bravura';
import { KeyboardModel } from '../piano-keyboard/keyboard-model';
import { Metronome } from '../audio/metronome';
import { PianoMidi } from '../../../../shared/midi/midi.service';
import { NoteState, ProgressMap } from '../../../../shared/music/music.types';
import { SrsService } from '../../../../shared/music/srs.service';
import { TheoryService } from '../../../../shared/music/theory.service';
import type { Notation } from '../notation/notation';
import { FeedbackKind, FeedbackParams, PlayerResult, PlayerStore, SequencePlayer } from './sequence-player';

/** A staff without VexFlow: one SVG group per note, as the player marks them. */
function fakeNotation(): Notation {
  return {
    renderSequence: (notes: { midi: number }[]) =>
      notes.map(() => {
        const element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        return { getSVGElement: () => element } as unknown as StaveNote;
      }),
  } as unknown as Notation;
}

describe('SequencePlayer', () => {
  let midi: PianoMidi;
  let srs: SrsService;
  let saved: ProgressMap[];
  /** What the player said, in order: a key of the app's strings, its placeholders' values, how it went - never a sentence. */
  let feedback: Array<[string, FeedbackParams | undefined, FeedbackKind | undefined]>;
  let results: PlayerResult[];
  let keyboard: KeyboardModel;
  let player: SequencePlayer;

  const press = (note: number, timestamp = performance.now()): void => {
    midi.dispatchEvent(new CustomEvent('noteon', { detail: { midi: note, velocity: 90, timestamp } }));
  };

  beforeEach(() => {
    midi = new PianoMidi();
    srs = TestBed.inject(SrsService);
    saved = [];
    feedback = [];
    results = [];
    keyboard = new KeyboardModel();
    const progress: ProgressMap = {};
    const store: PlayerStore = {
      updateNote: (m: number, change: (current: NoteState) => NoteState) => {
        progress[m] = change(progress[m] ?? srs.createInitialNoteState(m));
        saved.push({ ...progress });
        return Promise.resolve();
      },
    };
    player = new SequencePlayer({
      midi,
      srs,
      theory: TestBed.inject(TheoryService),
      store,
      notation: fakeNotation(),
      keyboard,
      feedback: (key, params, kind) => feedback.push([key, params, kind]),
      onFinish: (result) => results.push(result),
    });
  });

  afterEach(() => {
    player.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for each note, counts first tries, and shows the key after two misses', () => {
    player.load([{ midi: 60 }, { midi: 62 }, { midi: 64 }]);
    player.start({ mode: 'wait' });
    press(60);
    press(65);
    press(67);
    expect(keyboard.states().get(62)).toBe('target');
    press(62);
    press(64);
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({ mode: 'wait', bpm: null, correct: 2, total: 3, accuracy: 67, avgTimingErrorMs: null });
    // One SRS update per note played right first time (60, 64), one for the first miss on 62 - and none
    // for 62 played right after two misses.
    expect(saved.length).toBe(3);
    // Every word it says is a key with its values: the note that was played is a parameter, the result's numbers too.
    expect(feedback).toEqual([
      ['player.takeYourTime', undefined, undefined],
      ['player.good', undefined, 'correct'],
      ['player.wrong.tryAgain', { note: 'F4' }, 'incorrect'],
      ['player.wrong.tryAgain', { note: 'G4' }, 'incorrect'],
      ['player.gotIt', undefined, 'correct'],
      ['player.good', undefined, 'correct'],
      ['player.done', { correct: 2, total: 3, accuracy: 67 }, null],
    ]);
  });

  it('in time: the clock moves the music, count-in presses are ignored and a silent note is a miss', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const start = performance.now();
    const beat = 1000; // 60 BPM
    const times = [start + 4000, start + 5000, start + 6000];
    vi.spyOn(Metronome.prototype, 'schedule').mockReturnValue({ expectedPerformanceTimes: times, secondsPerBeat: 1, leadInMs: 4000 });
    vi.spyOn(Metronome.prototype, 'stop').mockImplementation(() => {});

    player.load([{ midi: 60 }, { midi: 62 }, { midi: 64 }]);
    player.start({ mode: 'tempo', bpm: 60 });
    press(60, start + 100); // during the count-in
    expect(saved.length).toBe(0);

    press(60, times[0] + 30); // on the click
    press(61, times[0] + 40); // an extra press on an answered note
    await vi.advanceTimersByTimeAsync(times[1] + beat / 2 - start + 10); // the second window closes unplayed
    expect(feedback.some(([key]) => key === 'player.missed')).toBe(true);
    expect(feedback.at(-1)).toEqual(['player.missed', undefined, 'incorrect']);
    press(64, times[2] - 200); // a little early
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({ mode: 'tempo', bpm: 60, correct: 2, total: 3, accuracy: 67, avgTimingErrorMs: 115 });
    expect(saved.length).toBe(2); // a miss is no evidence about the note: no SRS update
    // A run in time ends with the sentence that also says how far off the clicks it was - one key, not a clause glued on.
    expect(feedback.at(-1)).toEqual(['player.doneTimed', { correct: 2, total: 3, accuracy: 67, ms: 115 }, null]);
  });

  it('in time: says early, late or a wrong note by its own key', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const start = performance.now();
    const times = [start + 4000, start + 5000, start + 6000];
    vi.spyOn(Metronome.prototype, 'schedule').mockReturnValue({ expectedPerformanceTimes: times, secondsPerBeat: 1, leadInMs: 4000 });
    vi.spyOn(Metronome.prototype, 'stop').mockImplementation(() => {});

    player.load([{ midi: 60 }, { midi: 62 }, { midi: 64 }]);
    player.start({ mode: 'tempo', bpm: 60 });
    press(60, times[0] - 300);
    press(62, times[1] + 300);
    press(65, times[2]);
    expect(feedback).toEqual([
      ['player.countIn', undefined, undefined],
      ['player.early', undefined, 'correct'],
      ['player.late', undefined, 'correct'],
      ['player.wrong.keepGoing', { note: 'F4' }, 'incorrect'],
      ['player.doneTimed', { correct: 2, total: 3, accuracy: 67, ms: 300 }, null],
    ]);
  });

  it('says nothing but keys: no sentence ever comes out of the player', () => {
    player.load([{ midi: 60 }, { midi: 62 }]);
    player.start({ mode: 'wait' });
    press(61);
    press(60);
    press(62);
    expect(feedback.length).toBe(5);
    for (const [key] of feedback) expect(key).toMatch(/^player\.[A-Za-z]+(\.[A-Za-z]+)?$/);
  });

  it('never starts again once destroyed, and lets go of the piano', () => {
    player.load([{ midi: 60 }]);
    player.destroy();
    player.start({ mode: 'wait' });
    press(60);
    expect(results.length).toBe(0);
    expect(saved.length).toBe(0);
  });
});
