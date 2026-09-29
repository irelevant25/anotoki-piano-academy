import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MidiService, NoteOnDetail } from '../../core/midi/midi.service';
import { ProgressMap } from '../../core/music/music.types';
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
  imports: [NotationComponent, PianoKeyboardComponent],
})
export class TrainerPageComponent {
  private readonly midi = inject(MidiService);
  private readonly theory = inject(TheoryService);
  private readonly srs = inject(SrsService);
  private readonly path = inject(PathService);
  private readonly store = inject(ProgressStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly staff = viewChild(NotationComponent);
  protected readonly keyboard = new KeyboardModel();
  protected readonly roundLength = ROUND_LENGTH;

  protected readonly finished = signal(false);
  protected readonly index = signal(0);
  protected readonly correctCount = signal(0);
  protected readonly feedback = signal<Feedback>({ text: 'Play the note shown above on your piano.', kind: null });
  protected readonly name = signal('');
  protected readonly accuracy = computed(() => Math.round((this.correctCount() / ROUND_LENGTH) * 100));

  private round: number[] = [];
  private progress: ProgressMap = {};
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
    this.progress = { ...this.store.progress() };
    const queue = this.srs.pickPracticeQueue(this.progress, this.theory.curriculum, { count: 8 });
    this.round = [];
    while (this.round.length < ROUND_LENGTH) this.round.push(...this.path.shuffle(queue));
    this.round = this.round.slice(0, ROUND_LENGTH);
    this.index.set(0);
    this.correctCount.set(0);
    this.startedAt = new Date().toISOString();
    this.feedback.set({ text: 'Play the note shown above on your piano.', kind: null });
    this.keyboard.markKnown(this.store.knownNotes());
    this.finished.set(false);
    afterNextRender(() => this.showPrompt(), { injector: this.injector });
  }

  private showPrompt(): void {
    const target = this.round[this.index()];
    this.name.set(this.theory.midiToName(target));
    this.feedback.set({ text: 'Play this note on your piano.', kind: null });
    this.keyboard.clearStates();
    this.staff()?.notation().renderSingleNote(target);
    this.awaitingAnswer = true;
  }

  private answer(played: number): void {
    if (!this.awaitingAnswer) return;
    this.awaitingAnswer = false;

    const target = this.round[this.index()];
    const correct = played === target;
    this.progress[target] = this.srs.updateNoteState(this.progress[target] ?? this.store.noteState(target), this.srs.gradeAttempt({ correct, timingErrorMs: null }), null);

    this.keyboard.setKeyState(played, correct ? 'correct' : 'incorrect');
    if (!correct) this.keyboard.setKeyState(target, 'target');
    if (correct) {
      this.correctCount.update((n) => n + 1);
      this.feedback.set({ text: 'Correct!', kind: 'correct' });
    } else {
      this.feedback.set({ text: `That was ${this.theory.midiToName(played)} — target was ${this.theory.midiToName(target)}.`, kind: 'incorrect' });
    }

    this.store.saveProgress(this.progress).catch((error) => console.error('Failed to save progress', error));

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
