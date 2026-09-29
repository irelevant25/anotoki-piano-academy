import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BootService } from '../../core/state/boot.service';

/**
 * The backend answered 503 not_set_up: config/database.local.php and
 * config/auth.local.php are not there yet (or the database needs an update).
 * The setup page does both.
 */
@Component({
  selector: 'app-not-set-up',
  templateUrl: './not-set-up.component.html',
  styleUrl: './not-set-up.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotSetUpComponent {
  protected readonly boot = inject(BootService);
}
