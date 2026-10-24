import { Routes } from '@angular/router';
import { AuthCallbackComponent, SignInFailureComponent } from '@anotoki/lib/auth';
import { ADMIN_ROUTES } from './sites/admin/admin.routes';
import { MAIN_ROUTES } from './sites/main/main.routes';

/**
 * Every page is for somebody signed in - the anotoki family's guards
 * (@anotoki/lib/auth): anybody else is sent to the IAM and comes back to the
 * page asked for - the learner's pages ask it page by page
 * (personOrVisitorGuard, canActivateChild), the admin panel once as it is
 * entered (staffGuard: EDITOR or ADMIN; adminGuard on the pages for ADMIN
 * alone - anybody else signed in is sent to the start page). While the IAM
 * does not require a sign-in, the learner's pages are a visitor's too; the
 * admin panel never is. A sign-in that came back without one, could not
 * start, or cannot be set up goes to the family's screen that says why
 * (/sign-in-failed, in this app's frame: Try again, Back) instead of round to
 * the IAM again. The card "could not load" is drawn without a sign-in. While
 * the site is not ready (an update waits, it is not set up, its database is
 * out of reach) nobody is sent anywhere: the family's status page stands in
 * every page's place (<anotoki-site-gate>), with a Sign in of its own.
 *
 * The legal pages - Terms, Privacy, Contact: the anotoki family's
 * (@anotoki/lib/legal/pages) with Piano Academy's facts, which their frame
 * gives them (sites/main/legal/legal-layout) - are anybody's: no guard, nothing of a
 * person's progress on them, and the shell draws them whatever its start says
 * (AppComponent's pageShown). Each is a path of its own with the frame as its
 * parent - never one parent with an empty path holding the three: the router
 * takes an address it has read whole ("/") for such a parent when none of its
 * children match, and would draw the empty frame at "/" with no guard (the
 * survey's lesson, 2026-10-17; app.routes.spec.ts). They come before the
 * learner's pages, whose "**" would take them. Their paths are the library's
 * (DEFAULT_LEGAL_PATHS), the footer's links go there. The family's About and
 * Support pages (anotoki-lib 0.8.0: @anotoki/lib/legal/about, /support - the
 * same on every anotoki site) are in the same frame, the same way.
 *
 * A title is a translation key (`title.*`; About's and Support's the
 * library's own headings, `anotoki.about.title`, `anotoki.support.title`):
 * PianoTitleStrategy words it in the
 * language on the page and puts the app's name after it. The admin panel's
 * pages are English whatever the language, and so are their titles: written
 * here as they are (PianoTitleStrategy puts "Admin panel" between them and
 * the app's name).
 *
 * Each half's routes are its own: the admin panel's in
 * sites/admin/admin.routes.ts (/admin and its pages, and where two of them
 * were before it), the learner's site's in sites/main/main.routes.ts (the
 * legal pages, About and Support, the learner's pages) - spread in here after
 * the sign-in's own pages, which are both halves', as they stand and in their
 * order. Spread, not loaded as chunks of their own: the first load holds what
 * it always held (the route table, Learn), and every other page keeps its own
 * lazy chunk.
 */
export const routes: Routes = [
  // The IAM's redirect URI (shared/auth/site-auth.ts): AnotokiAuth.init() finishes the sign-in before the router
  // starts, so the page is seen only when opened by hand ("Signing you in…", then the start page). Never guarded.
  { path: 'auth/callback', component: AuthCallbackComponent, title: 'title.signingIn' },
  // Why a sign-in did not work - the family's screen, under this app's bar (the guards send the browser here).
  { path: 'sign-in-failed', component: SignInFailureComponent, title: 'title.signingIn' },
  ...ADMIN_ROUTES,
  ...MAIN_ROUTES,
];
