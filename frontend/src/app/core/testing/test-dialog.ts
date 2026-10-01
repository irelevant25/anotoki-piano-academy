/**
 * jsdom knows the <dialog> element and its `open`, but not how one is opened
 * or closed: showModal() and close() are missing there. A spec of a page that
 * asks through a dialog calls this first; it gives the element the two, as far
 * as a spec needs them - `open` set and taken away, and the `close` event.
 * A browser has its own, and this touches nothing there.
 */
export function provideTestDialog(): void {
  const dialog = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: (returnValue?: string) => void };
  if (typeof dialog.showModal !== 'function') {
    dialog.showModal = function (this: HTMLDialogElement): void {
      this.setAttribute('open', '');
    };
  }
  if (typeof dialog.close !== 'function') {
    dialog.close = function (this: HTMLDialogElement): void {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
