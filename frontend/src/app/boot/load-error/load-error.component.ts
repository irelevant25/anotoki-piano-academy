import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@anotoki/lib/translations';

/**
 * The progress could not be loaded. The app stops here on purpose: running on
 * empty state, the first save would overwrite the learner's real progress.
 *
 * Often drawn with no strings at all (the backend is down): its keys are in
 * core/i18n/kept-english.ts too.
 */
@Component({
  selector: 'app-load-error',
  templateUrl: './load-error.component.html',
  styleUrl: './load-error.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class LoadErrorComponent {
  protected retry(): void {
    location.reload();
  }
}
