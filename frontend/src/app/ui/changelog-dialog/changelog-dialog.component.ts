import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FALLBACK_LANGUAGE, TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { ChangelogService } from '../../core/changelog/changelog.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';

/**
 * What is new, release by release (public/changelog.json) - opened from the
 * version number in the footer. The family's dialog (@anotoki/lib/ui/dialog):
 * drawn while open, the focus kept inside it; Escape, its close button, the
 * Close button and the backdrop close it, and the focus comes back to the
 * version. The newest release says so, and each list says what it is, with
 * the family's badges.
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
  imports: [TranslatePipe, LocalDatePipe, BadgeComponent, ButtonComponent, DialogComponent],
})
export class ChangelogDialogComponent {
  protected readonly changelog = inject(ChangelogService);
  private readonly i18n = inject(TranslationService);

  /** The dialog is on the page (the family's dialog opens itself as it appears, and closes as it goes). */
  protected readonly opened = signal(false);

  /** The `lang` of the entries' lists: English where the page is not - nothing where it is, the page says so already. */
  protected readonly entriesLang = computed(() => (this.i18n.language() === FALLBACK_LANGUAGE ? null : FALLBACK_LANGUAGE));

  open(): void {
    this.opened.set(true);
  }

  protected close(): void {
    this.opened.set(false);
  }
}
