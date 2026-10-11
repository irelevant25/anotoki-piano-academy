import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { FeedbackFormComponent } from '@anotoki/lib/feedback/form';
import { TranslationService } from '@anotoki/lib/translations';
import { DialogComponent } from '@anotoki/lib/ui/dialog';

/**
 * The anotoki family's feedback form (@anotoki/lib/feedback/form) in the
 * family's dialog - opened from the footer's "Send feedback", for everybody:
 * a learner, a visitor, somebody not signed in. What it asks, its words (the
 * library's anotoki.feedback.*, an owner's rewording from the database) and
 * the places a message can be about are core/site-admin.ts's; the server
 * keeps it for the admin panel's Feedback page, and sends no mail.
 *
 * The app draws this only while it is open, inside a @defer: neither this
 * nor the form is in the first load. Escape, the backdrop, the form's Cancel
 * and its Close after the thanks all say `closed`.
 */
@Component({
  selector: 'app-feedback-dialog',
  templateUrl: './feedback-dialog.component.html',
  styleUrl: './feedback-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, FeedbackFormComponent],
})
export class FeedbackDialogComponent {
  private readonly i18n = inject(TranslationService);

  /** The dialog is done with: the app takes it off the page. */
  readonly closed = output<void>();

  /** The dialog's heading - the form's title, which the form itself then leaves out. */
  protected readonly heading = computed(() => this.i18n.t('anotoki.feedback.title'));
}
