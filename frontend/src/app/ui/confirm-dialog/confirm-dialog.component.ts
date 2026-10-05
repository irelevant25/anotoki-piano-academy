import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';

/** What is asked: a heading, a sentence, and what the two buttons say. */
export interface Question {
  title: string;
  message: string;
  /** The button that goes on with it: "Delete", "Leave". */
  confirmLabel: string;
  /** The button that does not. "Cancel" when left out (the admin panel's English). */
  cancelLabel?: string;
  /** Going on loses something: the button says so by its colour. */
  danger?: boolean;
}

/**
 * A question with two answers: "Delete Czech?", "Leave without saving?",
 * "Replace your progress?". A native <dialog>, as the changelog's: Esc and a
 * click beside it are "no", and focus comes back to where it was.
 *
 * One question at a time; asking again while one is open answers the open one
 * "no". The admin pages pass English literals to ask(); a learner's page
 * passes words it has worded from keys - either to ask(), or as `words`, the
 * question it always asks, drawn in the closed dialog too (so the shell's
 * check for words without a string sees them).
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly changes = inject(ChangeDetectorRef);

  /** The question asked when ask() is given none. */
  readonly words = input<Question | null>(null);
  /** The start of its heading's and sentence's ids - one of its own for each dialog of a page. */
  readonly name = input('ow-confirm');

  private readonly asked = signal<Question | null>(null);
  protected readonly question = computed(() => this.asked() ?? this.words());

  /** Who waits for the answer to the open question. */
  private waiting: ((yes: boolean) => void) | null = null;
  /** What the button that closed the dialog said; Esc says nothing, which is "no". */
  private answered = false;

  constructor() {
    // A page that goes with its question open has answered "no".
    inject(DestroyRef).onDestroy(() => this.settle(false));
  }

  /** Opens the question (or the `words` one); resolves with the answer. */
  ask(question?: Question): Promise<boolean> {
    this.settle(false);
    this.asked.set(question ?? null);
    this.answered = false;
    // Its words are on it before it opens: a screen reader names the dialog by its heading
    // as it opens, and nobody should see it empty - or with the last question's words.
    this.changes.detectChanges();
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
    return new Promise<boolean>((resolve) => (this.waiting = resolve));
  }

  protected answer(yes: boolean): void {
    this.answered = yes;
    this.dialog().nativeElement.close();
  }

  /** The dialog closed: by one of its buttons, by Esc, or by a click beside it. */
  protected closed(): void {
    this.settle(this.answered);
  }

  /** A click on the backdrop (the dialog element itself, outside its content) is "no". */
  protected backdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.answer(false);
  }

  private settle(yes: boolean): void {
    const waiting = this.waiting;
    this.waiting = null;
    this.answered = false;
    waiting?.(yes);
  }
}
