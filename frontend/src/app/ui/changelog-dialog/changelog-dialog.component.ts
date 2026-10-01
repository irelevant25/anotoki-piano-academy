import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { ChangelogService } from '../../core/changelog/changelog.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { FALLBACK_LANGUAGE, TranslationService } from '../../core/i18n/translation.service';

/**
 * What is new, release by release (public/changelog.json) - opened from the
 * version number in the footer. A native <dialog>: Esc and the Close button
 * close it, and focus comes back to where it was.
 *
 * The frame is in the language on the page (its keys are `whatsNew.*`, and in
 * core/i18n/kept-english.ts too: the dialog opens in every state of the
 * start); a release's day is written the way that language writes dates. The
 * entries themselves are not translated: they are English as the file has
 * them, and say so (lang="en") wherever the page is in another language.
 */
@Component({
  selector: 'app-changelog-dialog',
  templateUrl: './changelog-dialog.component.html',
  styleUrl: './changelog-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, LocalDatePipe],
})
export class ChangelogDialogComponent {
  protected readonly changelog = inject(ChangelogService);
  private readonly i18n = inject(TranslationService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** The `lang` of the entries' lists: English where the page is not - nothing where it is, the page says so already. */
  protected readonly entriesLang = computed(() => (this.i18n.language() === FALLBACK_LANGUAGE ? null : FALLBACK_LANGUAGE));

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
}
