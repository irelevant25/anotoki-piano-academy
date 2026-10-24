import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { FALLBACK_LANGUAGE, TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { ChangelogService } from '../../changelog/changelog.service';
import { LocalDatePipe } from '../../i18n/local-date.pipe';

/**
 * What is new, release by release (public/changelog.json) - opened from
 * "What's new" in the family's footer (@anotoki/lib/footer's (whatsNew)). The
 * family's dialog (@anotoki/lib/ui/dialog): the focus kept inside it; Escape,
 * its close button, the Close button and the backdrop say `closed`, and the
 * focus comes back to What's new. The newest release says so, and each list
 * says what it is, with the family's badges. It is never empty: What's new is
 * in the footer only while the list came (app.component), so there is no
 * sentence for a list that did not (migration 012 took the old one away).
 *
 * The app draws this only while it is open, inside a @defer: it is not in the
 * first load (anotoki-lib 0.6.1's pass, to keep that load within its budget -
 * docs/decisions.md).
 *
 * The frame is in the language on the page (its keys are `whatsNew.*`, and in
 * shared/i18n/kept-english.ts too: the dialog opens in every state of the
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

  /** The dialog is done with: the app takes it off the page. */
  readonly closed = output<void>();

  /** The `lang` of the entries' lists: English where the page is not - nothing where it is, the page says so already. */
  protected readonly entriesLang = computed(() => (this.i18n.language() === FALLBACK_LANGUAGE ? null : FALLBACK_LANGUAGE));
}
