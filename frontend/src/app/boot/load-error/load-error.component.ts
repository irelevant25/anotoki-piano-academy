import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The progress could not be loaded. The app stops here on purpose: running on
 * empty state, the first save would overwrite the learner's real progress.
 */
@Component({
  selector: 'app-load-error',
  templateUrl: './load-error.component.html',
  styleUrl: './load-error.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadErrorComponent {
  protected retry(): void {
    location.reload();
  }
}
