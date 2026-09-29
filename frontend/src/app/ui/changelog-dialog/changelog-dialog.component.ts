import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { ChangelogService } from '../../core/changelog/changelog.service';

/**
 * What is new, release by release (public/changelog.json) - opened from the
 * version number in the footer. A native <dialog>: Esc and the Close button
 * close it, and focus comes back to where it was.
 */
@Component({
  selector: 'app-changelog-dialog',
  templateUrl: './changelog-dialog.component.html',
  styleUrl: './changelog-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogDialogComponent {
  protected readonly changelog = inject(ChangelogService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** A click on the backdrop (the dialog element itself, outside its content) closes it. */
  protected backdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  /** "2026-09-28" in the reader's own way of writing dates. */
  protected formatDate(date: string): string {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
}
