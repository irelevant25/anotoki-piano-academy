import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { MidiService, NoteOnDetail } from '../../../core/midi/midi.service';
import { PathStep } from '../../../core/music/music.types';
import { PathService } from '../../../core/music/path.service';
import { SrsService } from '../../../core/music/srs.service';
import { TheoryService } from '../../../core/music/theory.service';
import { ProgressStore } from '../../../core/state/progress-store.service';
import { NotationComponent } from '../../../ui/notation/notation.component';
import { KeyboardModel } from '../../../ui/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../../ui/piano-keyboard/piano-keyboard.component';
import { Feedback, StepOutcome } from '../step-outcome';

const DRILL_LENGTH = 10;

/**
 * Drill: flashcards read from the staff alone (no name): the unit's new notes
 * mixed with earlier ones, never the same note twice in a row. Every answer
 * goes into the SRS.
 */
@Component({
  selector: 'app-drill-step',
  templateUrl: './drill-step.component.html',
  styleUrl: './drill-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotationComponent, PianoKeyboardComponent, TranslatePipe],
})
export class DrillStepComponent {
  private readonly midi = inject(MidiService);
  private readonly theory = inject(TheoryService);
  private readonly srs = inject(SrsService);
  private readonly path = inject(PathService);
  private readonly store = inject(ProgressStore);

  readonly entry = input.required<PathStep>();
  readonly done = output<StepOutcome>();

  private readonly staff = viewChild.required(NotationComponent);
  protected readonly keyboard = new KeyboardModel();
  protected readonly index = signal(0);
  protected readonly correctCount = signal(0);
  /** A key and its values, never a sentence: the template words it. */
  protected readonly feedback = signal<Feedback>({ key: null, kind: null });
  protected readonly range = computed(() => this.entry().phase.keyboard ?? { lowMidi: 48, highMidi: 84 });
  protected readonly length = DRILL_LENGTH;

  private round: number[] = [];
  private startedAt = '';
  private waiting = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onNoteOn = (event: Event): void => this.answer((event as CustomEvent<NoteOnDetail>).detail.midi);

  constructor() {
    this.midi.piano.addEventListener('noteon', this.onNoteOn);
    afterNextRender(() => this.begin());
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) clearTimeout(this.timer);
      this.midi.piano.removeEventListener('noteon', this.onNoteOn);
    });
  }

  private begin(): void {
    const unit = this.entry().unit;
    // Read, never kept: every answer goes into the store's progress as it is then (updateNote).
    this.round = this.path.buildDrillRound(unit, this.store.progress(), DRILL_LENGTH);
    this.startedAt = new Date().toISOString();
    this.keyboard.markKnown(this.path.notePoolForUnit(unit.id));
    this.showPrompt();
  }

  private showPrompt(): void {
    this.waiting = true;
    this.keyboard.clearStates();
    this.staff().notation().renderSingleNote(this.round[this.index()]);
    this.feedback.set({ key: 'drill.question', kind: null });
  }

  /** The piano's handler: it sets a key and its values at once - nothing worded, nothing awaited. */
  private answer(played: number): void {
    if (!this.waiting) return;
    this.waiting = false;
    const target = this.round[this.index()];
    const correct = played === target;
    const grade = this.srs.gradeAttempt({ correct, timingErrorMs: null });
    this.store.updateNote(target, (current) => this.srs.updateNoteState(current, grade, null)).catch((error) => console.error('Failed to save progress', error));

    this.keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    if (correct) {
      this.correctCount.update((n) => n + 1);
      this.feedback.set({ key: 'drill.correct', params: { note: this.theory.midiToName(target) }, kind: 'correct' });
    } else {
      this.keyboard.setKeyState(target, 'target');
      this.feedback.set({ key: 'drill.wrong', params: { played: this.theory.midiToName(played), target: this.theory.midiToName(target) }, kind: 'incorrect' });
    }

    const pauseMs = correct ? 700 : 1500;
    if (this.index() + 1 < this.round.length) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.index.update((i) => i + 1);
        this.showPrompt();
      }, pauseMs);
      return;
    }

    const accuracy = Math.round((this.correctCount() / this.round.length) * 100);
    this.done.emit({
      accuracy,
      session: { startedAt: this.startedAt, endedAt: new Date().toISOString(), attempts: this.round.length, correct: this.correctCount(), accuracy },
      delayMs: pauseMs,
    });
  }
}
