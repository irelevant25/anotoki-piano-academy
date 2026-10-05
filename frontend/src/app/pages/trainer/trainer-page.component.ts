import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { MidiService, NoteOnDetail } from '../../core/midi/midi.service';
import { PathService } from '../../core/music/path.service';
import { SrsService } from '../../core/music/srs.service';
import { TheoryService } from '../../core/music/theory.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { NotationComponent } from '../../ui/notation/notation.component';
import { KeyboardModel } from '../../ui/piano-keyboard/keyboard-model';
import { PianoKeyboardComponent } from '../../ui/piano-keyboard/piano-keyboard.component';
import { Feedback } from '../lesson/step-outcome';

const ROUND_LENGTH = 12;

/**
 * The Note Trainer: a round of twelve notes from the adaptive schedule -
 * notes due for review first, then the ones being learned, and a new note
 * when there is room for one. Every answer goes into the SRS; the round is
 * logged as a session.
 */
@Component({
  selector: 'app-trainer-page',
  templateUrl: './trainer-page.component.html',
  styleUrl: './trainer-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotationComponent, PianoKeyboardComponent, TranslatePipe],
})
export class TrainerPageComponent {
  private readonly midi = inject(MidiService);
  private readonly theory = inject(TheoryService);
  private readonly srs = inject(SrsService);
  private readonly path = inject(PathService);
  private readonly store = inject(ProgressStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly i18n = inject(TranslationService);

  private readonly staff = viewChild(NotationComponent);
  protected readonly keyboard = new KeyboardModel();
  protected readonly roundLength = ROUND_LENGTH;

  protected readonly finished = signal(false);
  protected readonly index = signal(0);
  protected readonly correctCount = signal(0);
  /** A key and its values, never a sentence: the template words it. */
  protected readonly feedback = signal<Feedback>({ key: 'trainer.start', kind: null });
  /** The note's name: the same in every language. */
  protected readonly name = signal('');
  protected readonly accuracy = computed(() => Math.round((this.correctCount() / ROUND_LENGTH) * 100));

  /**
   * The line above the staff is two sentences, each cut at its number: the
   * numbers stay elements of their own (#tr-progress, #tr-correct), and the
   * words around them are the language's.
   */
  protected readonly prompt = computed(() => this.i18n.around('trainer.prompt', 'position'));
  protected readonly correctSoFar = computed(() => this.i18n.around('trainer.correctSoFar', 'count'));

  private round: number[] = [];
  private startedAt = '';
  private awaitingAnswer = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onNoteOn = (event: Event): void => this.answer((event as CustomEvent<NoteOnDetail>).detail.midi);

  constructor() {
    this.midi.piano.addEventListener('noteon', this.onNoteOn);
    this.newRound();
    // The timer too: a late "next prompt" after leaving would draw into nothing - or start a round nobody sees.
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) clearTimeout(this.timer);
      this.midi.piano.removeEventListener('noteon', this.onNoteOn);
    });
  }

  /** A fresh round - also "Practice again". */
  protected newRound(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    // Read, never kept: every answer goes into the store's progress as it is then (updateNote).
    const queue = this.srs.pickPracticeQueue(this.store.progress(), this.theory.curriculum, { count: 8 });
    this.round = [];
    while (this.round.length < ROUND_LENGTH) this.round.push(...this.path.shuffle(queue));
    this.round = this.round.slice(0, ROUND_LENGTH);
    this.index.set(0);
    this.correctCount.set(0);
    this.startedAt = new Date().toISOString();
    this.feedback.set({ key: 'trainer.start', kind: null });
    this.keyboard.markKnown(this.store.knownNotes());
    this.finished.set(false);
    afterNextRender(() => this.showPrompt(), { injector: this.injector });
  }

  private showPrompt(): void {
    const target = this.round[this.index()];
    this.name.set(this.theory.midiToName(target));
    this.feedback.set({ key: 'trainer.play', kind: null });
    this.keyboard.clearStates();
    this.staff()?.notation().renderSingleNote(target);
    this.awaitingAnswer = true;
  }

  /** The piano's handler: it sets a key and its values at once - nothing worded, nothing awaited. */
  private answer(played: number): void {
    if (!this.awaitingAnswer) return;
    this.awaitingAnswer = false;

    const target = this.round[this.index()];
    const correct = played === target;
    const grade = this.srs.gradeAttempt({ correct, timingErrorMs: null });
    this.store.updateNote(target, (current) => this.srs.updateNoteState(current, grade, null)).catch((error) => console.error('Failed to save progress', error));

    this.keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    if (!correct) this.keyboard.setKeyState(target, 'target');
    if (correct) {
      this.correctCount.update((n) => n + 1);
      this.feedback.set({ key: 'trainer.correct', kind: 'correct' });
    } else {
      this.feedback.set({ key: 'trainer.wrong', params: { played: this.theory.midiToName(played), target: this.theory.midiToName(target) }, kind: 'incorrect' });
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.index() + 1 >= ROUND_LENGTH) {
        this.finishRound();
      } else {
        this.index.update((i) => i + 1);
        this.showPrompt();
      }
    }, 700);
  }

  private finishRound(): void {
    this.awaitingAnswer = false;
    this.finished.set(true);
    this.store
      .recordSession({
        mode: 'trainer',
        startedAt: this.startedAt,
        endedAt: new Date().toISOString(),
        attempts: ROUND_LENGTH,
        correct: this.correctCount(),
        accuracy: this.accuracy(),
      })
      .catch((error) => console.error('Failed to record session', error));
  }

  protected viewStats(): void {
    void this.router.navigateByUrl('/stats');
  }
}
