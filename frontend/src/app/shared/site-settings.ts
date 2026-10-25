import { EnvironmentProviders, inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideAnotokiSiteSettings } from '@anotoki/lib/site-settings';

/**
 * Where this browser keeps the mark of the announcement its reader hid - a
 * mark of its words and its kind, never the words: hidden until they change.
 * The Privacy page names it (sites/main/legal/legal-facts.ts, the library's
 * storage preset 'announcement').
 */
export const ANNOUNCEMENT_KEY = 'piano-academy:announcement';

/**
 * The administrators' way in while the site is closed for maintenance: the
 * family's closed sign offers Sign in at this address alone (and nowhere
 * else, so a closed site never offers a door it will not open). A route of
 * the learner's site (sites/main/main.routes.ts): the router keeps the
 * address while the site is closed - it never takes it for an unknown one -
 * and sends anybody to the start page while it is open.
 */
export const STAFF_ROUTE = '/staff';

/**
 * The anotoki family's site settings (@anotoki/lib/site-settings, anotoki-lib
 * 0.11.0) wired to this app's sign-in: who the reader is - their roles from
 * the token (AnotokiAuth), and whether anybody is signed in - for Page
 * access, and where the announcement's mark is kept. The settings themselves
 * are read once as the app starts (app.config.ts: SiteSettings.load(), beside
 * where the site stands, before the router's first navigation - so a page
 * Page access closes is never drawn for a moment), and again after an
 * administrator saves them (the library's admin page).
 *
 * What it draws: the announcement above the learner's site's bar
 * (<anotoki-announcement>, app.component), what the administrators alone
 * read above a page (<anotoki-page-notice>: the site is closed, the page is
 * switched off or kept for some readers - the learner's frame, and the admin
 * panel's for the first), and the guard on the learner's pages
 * (pageAccessGuard, a canMatch: a page closed to the reader falls through to
 * the start page, as an unknown address does). Nothing here is a security
 * boundary: the server refuses a page's API paths itself (PageAccessGate).
 */
export function provideSiteSettings(): EnvironmentProviders {
  return provideAnotokiSiteSettings(() => {
    const auth = inject(AnotokiAuth);
    return { roles: () => auth.roles(), signedIn: () => auth.signedIn(), storageKey: ANNOUNCEMENT_KEY };
  });
}
