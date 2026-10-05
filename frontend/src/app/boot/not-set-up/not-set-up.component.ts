import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BootService } from '../../core/state/boot.service';

/**
 * The backend answered 503 not_set_up: config/database.local.php and
 * config/auth.local.php are not there yet (or the database needs an update).
 * The setup page does both.
 *
 * Drawn with no strings at all, as a rule - the database is what is missing:
 * its keys are in core/i18n/kept-english.ts too. What the server says is
 * missing (it says so to the owner's own computer only) is the server's
 * English, shown as it came and marked lang="en".
 *
 * When the database is only behind the code (update: true) and the person is
 * an ADMIN of the app (BootService.onlyMigrations), the card also links to
 * the admin panel's Migrations page, which shows what is pending and applies
 * it (and is drawn for them while nothing else of the app is) - English, as
 * the admin panel is, and only hiding what the server refuses everybody else.
 */
@Component({
  selector: 'app-not-set-up',
  templateUrl: './not-set-up.component.html',
  styleUrl: './not-set-up.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink],
})
export class NotSetUpComponent {
  protected readonly boot = inject(BootService);
}
