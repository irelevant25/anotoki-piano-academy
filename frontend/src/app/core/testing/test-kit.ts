import { TestBed } from '@angular/core/testing';
import { ConfirmHostComponent } from '@anotoki/lib/ui/dialog';
import { provideTestDialog } from './test-dialog';

/**
 * jsdom lacks what the anotoki family's kit (@anotoki/lib) asks a browser
 * for, beyond a dialog's showModal() and close() (provideTestDialog()):
 * checkVisibility() - which controls a box's autofocus and a dialog's Tab
 * count as drawn - and the popover API that puts a menu or a box in the top
 * layer. A spec of a page that draws the family's bar, a menu, a box or a
 * dialog calls this first; it gives jsdom as much of each as a spec needs
 * (drawn unless hidden or in a closed dialog; a box shown in place) - the
 * library's own test setup does the same. A browser has its own, and this
 * touches nothing there.
 */
export function provideTestKit(): void {
  provideTestDialog();
  const element = Element.prototype as Element & { checkVisibility?: () => boolean };
  if (typeof element.checkVisibility !== 'function') {
    element.checkVisibility = function (this: Element): boolean {
      return !this.closest('[hidden], dialog:not([open])');
    };
  }
  const html = HTMLElement.prototype as HTMLElement & { showPopover?: () => void; hidePopover?: () => void };
  if (typeof html.showPopover !== 'function') {
    html.showPopover = function (): void {};
    html.hidePopover = function (): void {};
  }
}

/** The family's question as a spec reads and answers it. */
export interface TestQuestions {
  /** The question's dialog while one is asked (open); null otherwise. */
  open(): HTMLDialogElement | null;
  /** Its heading, '' while none is asked. */
  title(): string;
  /** Its sentence. */
  text(): string;
  /** What its two buttons say: the no, then the yes. */
  answers(): string[];
  /** Presses the yes or the no. */
  answer(yes: boolean): void;
  /** Takes the host out of the page (afterEach). */
  remove(): void;
}

const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The family's "Are you sure?" (ConfirmService) for a spec of a page that
 * asks one: the app draws <anotoki-confirm-host> once in its root, so a page
 * made on its own has none - this draws one beside it, in the same TestBed
 * (the same ConfirmService). Call it after the TestBed is configured.
 */
export function drawTestQuestions(): TestQuestions {
  const fixture = TestBed.createComponent(ConfirmHostComponent);
  const host: HTMLElement = fixture.nativeElement;
  document.body.appendChild(host);
  const open = (): HTMLDialogElement | null => host.querySelector<HTMLDialogElement>('dialog[open]');
  return {
    open,
    title: () => (open() ? clean(host.querySelector('.title')?.textContent) : ''),
    text: () => clean(host.querySelector('.message')?.textContent),
    answers: () => ['no', 'yes'].map((answer) => clean(host.querySelector(`[data-answer="${answer}"]`)?.textContent)),
    answer: (yes) => host.querySelector<HTMLButtonElement>(`[data-answer="${yes ? 'yes' : 'no'}"]`)!.click(),
    remove: () => host.remove(),
  };
}
