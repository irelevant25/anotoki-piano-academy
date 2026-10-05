import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTestDialog } from '../../core/testing/test-dialog';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let host: HTMLElement;

  const dialog = () => host.querySelector<HTMLDialogElement>('dialog')!;
  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const yes = () => host.querySelector<HTMLButtonElement>('[data-answer="yes"]')!;
  const no = () => host.querySelector<HTMLButtonElement>('[data-answer="no"]')!;

  beforeAll(() => provideTestDialog());

  beforeEach(async () => {
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  });

  afterEach(() => host.remove());

  it('is closed until something is asked', () => {
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it('asks in a dialog named by its heading and described by its sentence, and answers yes by its button', async () => {
    const asked = fixture.componentInstance.ask({ title: 'Delete Czech (cs)?', message: 'Its strings go with it.', confirmLabel: 'Delete', danger: true });
    await fixture.whenStable();

    expect(dialog().hasAttribute('open')).toBe(true);
    expect(clean(host.querySelector(`#${dialog().getAttribute('aria-labelledby')}`)?.textContent)).toBe('Delete Czech (cs)?');
    expect(clean(host.querySelector(`#${dialog().getAttribute('aria-describedby')}`)?.textContent)).toBe('Its strings go with it.');
    expect(clean(no().textContent)).toBe('Cancel');
    expect(clean(yes().textContent)).toBe('Delete');
    // Going on loses something: said by the button's look as well. "No" is where the focus starts.
    expect(yes().classList.contains('is-danger')).toBe(true);
    expect(no().hasAttribute('autofocus')).toBe(true);

    yes().click();

    expect(await asked).toBe(true);
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it('has its words the moment it opens - never empty, never the last question’s', async () => {
    const first = fixture.componentInstance.ask({ title: 'Discard the change?', message: 'a', confirmLabel: 'Discard' });
    // No waiting for change detection: the dialog is open now, so its words must be there now.
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(clean(host.querySelector('#ow-confirm-title')?.textContent)).toBe('Discard the change?');
    expect(clean(yes().textContent)).toBe('Discard');
    no().click();
    expect(await first).toBe(false);

    const second = fixture.componentInstance.ask({ title: 'Leave without saving?', message: 'b', confirmLabel: 'Leave', cancelLabel: 'Stay here' });
    expect(clean(host.querySelector('#ow-confirm-title')?.textContent)).toBe('Leave without saving?');
    expect(clean(host.querySelector('#ow-confirm-text')?.textContent)).toBe('b');
    expect(clean(no().textContent)).toBe('Stay here');
    no().click();
    expect(await second).toBe(false);
  });

  it('answers no by its other button, which can be given its own words', async () => {
    const asked = fixture.componentInstance.ask({ title: 'Leave without saving?', message: 'Leaving loses it.', confirmLabel: 'Leave', cancelLabel: 'Stay here' });
    await fixture.whenStable();
    expect(clean(no().textContent)).toBe('Stay here');
    expect(yes().classList.contains('is-danger')).toBe(false);

    no().click();

    expect(await asked).toBe(false);
  });

  it('takes Esc and a click beside it for no', async () => {
    const byEsc = fixture.componentInstance.ask({ title: 'A?', message: 'a', confirmLabel: 'Yes' });
    // What Esc does: the dialog closes, and no button said anything.
    dialog().close();
    expect(await byEsc).toBe(false);

    const beside = fixture.componentInstance.ask({ title: 'B?', message: 'b', confirmLabel: 'Yes' });
    // The backdrop is the dialog element itself; its content is inside it.
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(await beside).toBe(false);
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it('does not take an earlier "yes" for the answer to the next question', async () => {
    const first = fixture.componentInstance.ask({ title: 'A?', message: 'a', confirmLabel: 'Yes' });
    yes().click();
    expect(await first).toBe(true);

    const second = fixture.componentInstance.ask({ title: 'B?', message: 'b', confirmLabel: 'Yes' });
    dialog().close();
    expect(await second).toBe(false);
  });

  it('answers the open question no when another is asked, and when the page goes', async () => {
    const first = fixture.componentInstance.ask({ title: 'A?', message: 'a', confirmLabel: 'Yes' });
    const second = fixture.componentInstance.ask({ title: 'B?', message: 'b', confirmLabel: 'Yes' });
    expect(await first).toBe(false);
    await fixture.whenStable();
    expect(clean(host.querySelector('h2')?.textContent)).toBe('B?');

    fixture.destroy();
    expect(await second).toBe(false);
  });
});
