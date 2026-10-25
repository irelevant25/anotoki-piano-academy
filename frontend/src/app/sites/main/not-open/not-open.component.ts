import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@anotoki/lib/translations';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';

/**
 * Drawn in place of a page the site's administrators closed to this reader
 * (the site settings' Page access: a page switched off, or kept for people
 * signed in, for editors or for administrators) when Learn is closed to them
 * too. A closed page falls through to the start page as an unknown address
 * does (the family's pageAccessGuard, a canMatch - never a redirect that says
 * the page exists); Learn is that start page, so where it is closed as well
 * the router has nowhere else to go, and this says so - at the start page's
 * address (the fallback's redirect already took the reader there), with the
 * bar's open sections above it. Its words are migration 014's (notOpen.*).
 * Nothing else of the app runs on it.
 */
@Component({
  selector: 'app-not-open',
  templateUrl: './not-open.component.html',
  styleUrl: './not-open.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent, TranslatePipe],
})
export class NotOpenComponent {}
