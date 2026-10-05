import { CanDeactivateFn } from '@angular/router';

/** A page with changes that are kept only when saved: it says whether it may be left, asking first when it has some. */
export interface HoldsUnsavedChanges {
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Leaving a page inside the app (a link, the navigation, Back) asks the page
 * first. Closing the tab or reloading is the browser's to ask:
 * LocalizationDrafts, which holds what both pages have not saved, listens for
 * `beforeunload`. A page that goes with no navigation at all - the way to the
 * sign-in and back - is not asked anything, and need not be: its drafts are
 * kept there for its return.
 *
 * The route can be active with no page drawn: while the app shows its
 * sign-in, not-set-up or load-error card the outlet is not there, and the
 * router asks the guard about null. Nothing typed can be on a page never
 * drawn, so the way is free.
 */
export const unsavedChangesGuard: CanDeactivateFn<HoldsUnsavedChanges | null> = (page) => page?.canLeave() ?? true;
