import { TestBed } from '@angular/core/testing';
import type { StaveNote } from 'vexflow/bravura';
import { KeyboardModel } from '../../ui/piano-keyboard/keyboard-model';
import { Metronome } from '../audio/metronome';
import { PianoMidi } from '../midi/midi.service';
import { NoteState, ProgressMap } from '../music/music.types';
import { SrsService } from '../music/srs.service';
import { TheoryService } from '../music/theory.service';
import type { Notation } from '../notation/notation';
import { FeedbackKind, PlayerResult, PlayerStore, SequencePlayer } from './sequence-player';

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
  let feedback: Array<[string, FeedbackKind | undefined]>;
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
      progress: () => progress,
      noteState: (m: number): NoteState => progress[m] ?? srs.createInitialNoteState(m),
      saveProgress: (p: ProgressMap) => {
        saved.push({ ...p });
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
      feedback: (text, kind) => feedback.push([text, kind]),
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
    expect(feedback.at(-1)?.[0]).toMatch(/^Done - 2\/3 correct \(67%\)/);
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
    expect(feedback.some(([text]) => text === 'Missed one - keep going.')).toBe(true);
    press(64, times[2] - 200); // a little early
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({ mode: 'tempo', bpm: 60, correct: 2, total: 3, accuracy: 67, avgTimingErrorMs: 115 });
    expect(saved.length).toBe(2); // a miss is no evidence about the note: no SRS update
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
