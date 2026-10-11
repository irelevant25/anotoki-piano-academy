import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { BootService } from '../../core/state/boot.service';

/**
 * The frame of the admin panel (/admin), under the top bar - English, like
 * every page in it. Its sections are the bar's links there (layouts/top-bar:
 * Translations for the staff; Languages, People, the admin tools and
 * Migrations for ADMIN alone), and the way back is the bar's menu ("Back to
 * Piano Academy"). An ADMIN's "Feedback" there says how many messages are
 * new: asked once as the panel opens (the family's FeedbackUnread; the
 * Feedback page keeps it in step). It has three states:
 *
 * - staff (EDITOR or ADMIN): the page;
 * - nobody signed in, with a Sign in button of its own. Nobody arrives here
 *   signed out (the family's staffGuard sends them to the IAM first, or to
 *   the screen that says why a sign-in did not work), so this is a session
 *   that ended with an admin page open ("You are signed out"; what was typed
 *   on the Translations and Languages pages is kept for the tab) - or one
 *   whose new sign-in did not work ("You are not signed in");
 * - somebody signed in with no role here: whose the area is, and the way
 *   back. The API refuses them all the same.
 *
 * In the last two the route under the layout is still the active one, with
 * no page drawn: a guard on it is asked with no page (unsavedChangesGuard).
 * The bar's links only hide what the server refuses anyway: an EDITOR who opens an
 * ADMIN page by its address is sent to the start page (the family's adminGuard),
 * and the API answers 403 forbidden.
 */
@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
})
export class AdminLayoutComponent {
  protected readonly auth = inject(AnotokiAuth);
  private readonly boot = inject(BootService);

  constructor() {
    // How many feedback messages are new, for the bar's "Feedback" - asked for an ADMIN (the family's count asks
    // nothing for anybody else), again when an ADMIN signs in here.
    const unread = inject(FeedbackUnread);
    effect(() => {
      if (this.auth.isAdmin()) void unread.refresh();
    });
  }

  /** To the IAM and back to this page - its pages in the language the person reads the app in, not the admin panel's English. */
  protected signIn(): void {
    void this.boot.signIn();
  }
}
