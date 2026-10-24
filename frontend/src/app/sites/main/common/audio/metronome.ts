// The click track, and the timing reference for tempo-graded practice (the
// play-in-time steps, Sheet Practice, Songs). Clicks are scheduled as
// sample-accurate Web Audio events; each beat's expected moment is also
// translated into a performance.now() timestamp, so it can be compared
// directly with the timestamps of MIDI note-ons (see PianoMidi).

export interface ScheduledBeats {
  /** When each beat of the piece (the count-in not included) is due, in performance.now() time. */
  expectedPerformanceTimes: number[];
  secondsPerBeat: number;
  leadInMs: number;
}

type AudioContextClass = typeof AudioContext;

export class Metronome {
  private audioContext: AudioContext | null = null;

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextClass }).webkitAudioContext;
      this.audioContext = new Context();
    }
    return this.audioContext;
  }

  private click(time: number, accent: boolean): void {
    const context = this.audioContext as AudioContext;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = accent ? 1000 : 800;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.25, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.09);
  }

  /**
   * Silences every click still scheduled - on a restart, or when the learner
   * leaves in the middle of a piece. Scheduled Web Audio clicks outlive the
   * page's view otherwise.
   */
  stop(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  /**
   * `leadInBeats` count-in clicks, then one click per beat of the piece, at
   * `bpm`. Returns when each beat of the piece is due.
   */
  schedule(beatCount: number, bpm: number, { leadInBeats = 4 } = {}): ScheduledBeats {
    const context = this.ensureContext();
    const secondsPerBeat = 60 / bpm;
    const contextTimeAtStart = context.currentTime;
    const startAudioTime = contextTimeAtStart + 0.15;
    const startPerformanceTime = performance.now();

    const expectedPerformanceTimes: number[] = [];
    for (let i = 0; i < leadInBeats + beatCount; i++) {
      const audioTime = startAudioTime + i * secondsPerBeat;
      this.click(audioTime, i % 4 === 0);
      if (i >= leadInBeats) {
        expectedPerformanceTimes.push(startPerformanceTime + (audioTime - contextTimeAtStart) * 1000);
      }
    }

    return { expectedPerformanceTimes, secondsPerBeat, leadInMs: leadInBeats * secondsPerBeat * 1000 };
  }
}
