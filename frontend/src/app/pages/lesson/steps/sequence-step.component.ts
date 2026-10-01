import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { MidiService } from '../../../core/midi/midi.service';
import { PathStep, Song } from '../../../core/music/music.types';
import { PASS_ACCURACY, PathService } from '../../../core/music/path.service';
import { SrsService } from '../../../core/music/srs.service';
import { TheoryService } from '../../../core/music/theory.service';
import { PlayerResult, SequencePlayer, sessionFieldsFromResult } from '../../../core/player/sequence-player';
import { ProgressStore } from '../../../core/state/progress-store.service';
import { NotationComponent } from '../../../ui/notation/notation.component';
import { KeyboardModel } from '../../../ui/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../../ui/piano-keyboard/piano-keyboard.component';
import { Feedback, StepOutcome } from '../step-outcome';

const MELODY_LENGTH = 8;

/** A tempo on offer: the number, and whether it is the song's own - the template words it. */
interface TempoOption {
  value: number;
  original: boolean;
}

/**
 * The steps that play a sequence (SequencePlayer):
 *   read    a short melody over the unit's notes, no clock - it waits for each note
 *   tempo   a new melody with a metronome count-in, one note on every click
 *   song    the unit's song with the metronome. A practice run with no clock
 *           is allowed, but only the metronome run finishes the step.
 */
@Component({
  selector: 'app-sequence-step',
  templateUrl: './sequence-step.component.html',
  styleUrl: './sequence-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotationComponent, PianoKeyboardComponent, TranslatePipe],
})
export class SequenceStepComponent {
  private readonly midi = inject(MidiService);
  private readonly theory = inject(TheoryService);
  private readonly srs = inject(SrsService);
  private readonly path = inject(PathService);
  private readonly store = inject(ProgressStore);
  private readonly i18n = inject(TranslationService);

  readonly entry = input.required<PathStep>();
  readonly done = output<StepOutcome>();

  private readonly staff = viewChild.required(NotationComponent);
  protected readonly keyboard = new KeyboardModel();
  /** A key and its values, never a sentence: the template words it. */
  protected readonly feedback = signal<Feedback>({ key: null, kind: null });
  protected readonly started = signal(false);

  protected readonly type = computed(() => this.entry().step.type);
  protected readonly range = computed(() => this.entry().phase.keyboard ?? { lowMidi: 48, highMidi: 84 });
  protected readonly song = computed<Song | null>(() => (this.type() === 'song' ? this.path.songForStep(this.entry().step) : null));
  /**
   * The song step's instruction, cut where the song's title goes: the title
   * is a name, drawn in bold and never translated, and the sentence around it
   * is the language's.
   */
  protected readonly songLine = computed(() => this.i18n.around('sequence.song.instruction', 'title'));
  protected readonly tempos = computed<TempoOption[]>(() => {
    const song = this.song();
    if (song) return [0.6, 0.8, 1].map((factor) => ({ value: Math.round(song.bpm * factor), original: factor === 1 }));
    return [50, 60, 70, 80].map((value) => ({ value, original: false }));
  });
  /** 60 BPM for a melody; 80% of the song's own tempo. */
  protected readonly bpm = signal(0);

  private player: SequencePlayer | null = null;
  private practising = false;

  constructor() {
    afterNextRender(() => this.begin());
    inject(DestroyRef).onDestroy(() => this.player?.destroy());
  }

  private begin(): void {
    const entry = this.entry();
    const pool = this.path.notePoolForUnit(entry.unit.id);
    this.keyboard.markKnown(pool);
    this.bpm.set(this.tempos()[1].value);
    this.player = new SequencePlayer({
      midi: this.midi.piano,
      srs: this.srs,
      theory: this.theory,
      store: this.store,
      notation: this.staff().notation(),
      keyboard: this.keyboard,
      feedback: (key, params, kind = null) => this.feedback.set({ key, params, kind }),
      onFinish: (result) => this.finished(result),
    });

    const song = this.song();
    if (song) {
      this.player.load(song.notes, { timeSignature: song.timeSignature });
      return;
    }
    this.player.load(this.path.generateMelody(pool, MELODY_LENGTH, entry.unit.newNotes).map((midi) => ({ midi })));
    if (this.type() === 'read') this.player.start({ mode: 'wait' });
  }

  protected chooseTempo(event: Event): void {
    this.bpm.set(Number((event.target as HTMLSelectElement).value));
  }

  /** In time, or the song with the metronome: the run that counts. */
  protected startInTime(): void {
    this.practising = false;
    this.started.set(true);
    this.player?.start({ mode: 'tempo', bpm: this.bpm() });
  }

  /** The song's practice run: no clock, and it does not count. */
  protected startPractice(): void {
    this.practising = true;
    this.player?.start({ mode: 'wait' });
  }

  private finished(result: PlayerResult): void {
    if (this.practising) {
      this.feedback.set({
        key: 'sequence.song.practiceResult',
        params: { accuracy: result.accuracy },
        kind: result.accuracy >= PASS_ACCURACY ? 'correct' : null,
      });
      return;
    }
    const song = this.song();
    // The title stored with the session is the song's own English name, as ever.
    const session = song ? { songId: song.id, songTitle: song.title, ...sessionFieldsFromResult(result) } : sessionFieldsFromResult(result);
    this.done.emit({ accuracy: result.accuracy, session, delayMs: 900 });
  }
}
