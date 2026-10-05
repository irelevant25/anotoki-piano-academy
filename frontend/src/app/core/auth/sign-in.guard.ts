import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { TranslationService } from '../i18n/translation.service';
import { BootService } from '../state/boot.service';
import { AuthService } from './auth.service';

/**
 * Every page of the app is for somebody signed in - or, while the IAM does
 * not require a sign-in here, for a visitor too: anybody else is sent to the
 * IAM before anything of the page is drawn, and comes back to the address
 * they asked for. On every learner page (`signInGuard`, `canActivateChild` of
 * the route that holds them, so each page asks again) and on the admin panel
 * (`adminSignInGuard`, `canActivate`, once, as it is entered - never for a
 * visitor: visiting counts as signed out there). Who of the signed-in may use
 * the admin panel - EDITOR or ADMIN - the admin layout and the ADMIN guard
 * say, and the API decides. (The survey's guard, ported: anotoki-survey
 * core/auth/sign-in.guard.ts.)
 *
 * A learner page goes through to a visitor while the app runs for one
 * (BootService.visiting: the progress loaded is a visitor's, and no sign-in is
 * required now). A person whose sign-in ended in the middle of practising is
 * no visitor - their page holds their own progress - and goes by the IAM as
 * before; so does a visitor once the IAM requires a sign-in
 * (AuthService.requireSignInNow()) - and the visitor key stays for the move.
 *
 * It lets a page through with nobody signed in in one more case: this page
 * load came back from the IAM without a sign-in (refused, cancelled) - from
 * then on, for every page of the load. Sent straight back, the browser would
 * go round between the two for ever; the app draws the sign-in card instead
 * of the page (or, for a visitor, the page), and says what went wrong. A
 * sign-in that cannot even start (the browser refuses the site's storage) is
 * the same: the page goes through to the card, which says why - not a blank
 * page, the first navigation cancelled and nothing said.
 *
 * While the app cannot run (loading, not set up, the progress or the
 * sign-in settings could not be loaded) it lets nothing through and sends
 * nobody anywhere: the boot cards are drawn then, without a sign-in.
 *
 * A guard on activation, not on matching: refused, the navigation stops where
 * it is, rather than going on to the next route that would match.
 *
 * Signing in from a visitor's page waits for the saves on their way first
 * (BootService.beforeSignIn()), as signing out does.
 */
export const signInGuard: CanActivateFn & CanActivateChildFn = () => guard(true);

/** The admin panel's: always a sign-in, whatever the IAM's switch (see signInGuard). */
export const adminSignInGuard: CanActivateFn = () => guard(false);

function guard(visitorsWelcome: boolean): boolean | Promise<boolean> {
  const auth = inject(AuthService);
  if (auth.signedIn() || auth.signInFailure()) {
    return true;
  }
  const boot = inject(BootService);
  const status = boot.status();
  // 'sign-in': nobody signed in at the start; 'ready': the sign-in ended in the middle of practising - or a visitor.
  if (status !== 'sign-in' && status !== 'ready') {
    return false;
  }
  if (visitorsWelcome && status === 'ready' && boot.visiting() && !auth.loginRequired()) {
    return true;
  }
  const navigation = inject(Router).currentNavigation();
  const i18n = inject(TranslationService);
  // The IAM's pages in the language the person reads here - only one that came with a bundle (see BootService.signIn()).
  const returnTo = navigation ? navigation.extractedUrl.toString() : location.pathname + location.search + location.hash;
  return boot.beforeSignIn().then(() =>
    auth.signIn(returnTo, i18n.ready() ? i18n.language() : undefined).then((started) => {
      // On the way to the IAM: nothing of this page is drawn. Could not start: through, to the card that says why.
      return !started && auth.signInFailure() !== null;
    }),
  );
}
