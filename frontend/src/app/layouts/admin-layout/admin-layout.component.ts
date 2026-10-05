import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BootService } from '../../core/state/boot.service';

/**
 * The frame of the admin panel (/admin), under the top bar - English, like
 * every page in it. Its sections are the bar's links there (layouts/top-bar:
 * Translations for the staff; Languages, People and Migrations for ADMIN alone),
 * and the way back is the bar's menu ("Back to Piano Academy"). It has three
 * states:
 *
 * - staff (EDITOR or ADMIN): the page;
 * - nobody signed in, with a Sign in button of its own. Nobody arrives here
 *   signed out (the route's sign-in guard sends them to the IAM first), so
 *   this is either a session that ended with an admin page open ("You are
 *   signed out"; what was typed on the Translations and Languages pages is
 *   kept for the tab) or a sign-in that came back without one, or could not
 *   start, which the guard lets through ("You are not signed in");
 * - somebody signed in with no role here: whose the area is, and the way
 *   back. The API refuses them all the same.
 *
 * In the last two the route under the layout is still the active one, with
 * no page drawn: a guard on it is asked with no page (unsavedChangesGuard).
 * The bar's links only hide what the server refuses anyway: an EDITOR who opens an
 * ADMIN page by its address is sent to Translations (adminGuard), and the API
 * answers 403 forbidden.
 */
@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
})
export class AdminLayoutComponent {
  protected readonly auth = inject(AuthService);
  private readonly boot = inject(BootService);

  /** To the IAM and back to this page - its pages in the language the person reads the app in, not the admin panel's English. */
  protected signIn(): void {
    void this.boot.signIn();
  }
}
