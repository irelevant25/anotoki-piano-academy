import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@anotoki/lib/translations';
import { ErrorStateComponent } from '@anotoki/lib/ui/error-state';

/**
 * The progress could not be loaded. The app stops here on purpose: running on
 * empty state, the first save would overwrite the learner's real progress.
 * Said by the family's error state (its alert, said at once, and its Try
 * again), in this app's words.
 *
 * Often drawn with no strings at all (the backend is down): its keys are in
 * shared/i18n/kept-english.ts too.
 */
@Component({
  selector: 'app-load-error',
  templateUrl: './load-error.component.html',
  styleUrl: './load-error.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ErrorStateComponent],
})
export class LoadErrorComponent {
  protected retry(): void {
    location.reload();
  }
}
