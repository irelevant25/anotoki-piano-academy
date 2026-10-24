import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe, TranslatePluralPipe } from '@anotoki/lib/translations';
import { hintKey } from '../../../../../shared/i18n/path-words';
import { MidiService, NoteOnDetail } from '../../../../../shared/midi/midi.service';
import { PathStep } from '../../../../../shared/music/music.types';
import { TheoryService } from '../../../../../shared/music/theory.service';
import { NotationComponent } from '../../../common/notation/notation.component';
import { KeyboardModel } from '../../../common/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../../common/piano-keyboard/piano-keyboard.component';
import { Feedback, StepOutcome } from '../step-outcome';

const MEET_REPETITIONS = 3;

/**
 * Meet: each new note of the unit on the staff, its key lit blue, a hint
 * where to find it; play it three times. Not graded (it reports 100), no SRS
 * change, no session.
 */
@Component({
  selector: 'app-meet-step',
  templateUrl: './meet-step.component.html',
  styleUrl: './meet-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotationComponent, PianoKeyboardComponent, TranslatePipe, TranslatePluralPipe],
})
export class MeetStepComponent {
  private readonly midi = inject(MidiService);
  private readonly theory = inject(TheoryService);

  readonly entry = input.required<PathStep>();
  readonly done = output<StepOutcome>();

  private readonly staff = viewChild.required(NotationComponent);
  protected readonly keyboard = new KeyboardModel();
  protected readonly noteIndex = signal(0);
  protected readonly reps = signal(0);
  /** A key and its values, never a sentence: the template words it. */
  protected readonly feedback = signal<Feedback>({ key: null, kind: null });

  protected readonly newNotes = computed(() => this.entry().unit.newNotes);
  protected readonly target = computed(() => this.newNotes()[this.noteIndex()]);
  /** The note's name: the same in every language. */
  protected readonly name = computed(() => this.theory.midiToName(this.target()));
  /** The key of "where this note's key sits" - null for a note that has no hint. */
  protected readonly hint = computed(() => hintKey(this.target()));
  protected readonly repDots = computed(() => '●'.repeat(this.reps()) + '○'.repeat(MEET_REPETITIONS - this.reps()));
  protected readonly range = computed(() => this.entry().phase.keyboard ?? { lowMidi: 48, highMidi: 84 });
  protected readonly repetitions = MEET_REPETITIONS;

  private waiting = true;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly onNoteOn = (event: Event): void => this.play((event as CustomEvent<NoteOnDetail>).detail.midi);

  constructor() {
    this.midi.piano.addEventListener('noteon', this.onNoteOn);
    afterNextRender(() => this.showNote());
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
      this.midi.piano.removeEventListener('noteon', this.onNoteOn);
    });
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  private showNote(): void {
    const target = this.target();
    this.reps.set(0);
    this.waiting = true;
    this.staff().notation().renderSingleNote(target);
    this.keyboard.clearStates();
    this.keyboard.setKeyState(target, 'target');
    const count = this.newNotes().length;
    this.feedback.set(count > 1 ? { key: 'meet.noteOf', params: { position: this.noteIndex() + 1, total: count }, kind: null } : { key: null, kind: null });
  }

  /** The piano's handler: it sets a key and its values at once - nothing worded, nothing awaited. */
  private play(played: number): void {
    if (!this.waiting) return;
    const target = this.target();
    if (played !== target) {
      this.keyboard.setKeyState(played, 'incorrect');
      this.later(() => this.keyboard.setKeyState(played, null), 400);
      this.feedback.set({ key: 'meet.wrong', params: { note: this.theory.midiToName(played) }, kind: 'incorrect' });
      return;
    }

    this.reps.update((n) => n + 1);
    this.keyboard.setKeyState(target, 'correct');
    this.later(() => {
      if (this.waiting) this.keyboard.setKeyState(target, 'target');
    }, 250);
    if (this.reps() < MEET_REPETITIONS) {
      this.feedback.set({ key: 'meet.again', kind: 'correct' });
      return;
    }

    this.waiting = false;
    this.feedback.set({ key: 'meet.thatIs', params: { note: this.theory.midiToName(target) }, kind: 'correct' });
    if (this.noteIndex() + 1 < this.newNotes().length) {
      this.later(() => {
        this.noteIndex.update((i) => i + 1);
        this.showNote();
      }, 800);
    } else {
      this.done.emit({ accuracy: 100, session: null, delayMs: 800 });
    }
  }
}
