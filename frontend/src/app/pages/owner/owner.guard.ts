import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * The owner's pages (/translations, /languages) are for the person who may
 * change the app's words: AuthService.isOwner().
 *
 * While nobody is signed in the navigation stands: nothing is drawn then but
 * the sign-in card, and signing in comes back to this very address. Only
 * somebody who is signed in and is not the owner is sent to the start page.
 *
 * It only hides: the server refuses everybody else anyway (403 owner_only).
 */
export const ownerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.signedIn() && !auth.isOwner() ? inject(Router).parseUrl('/') : true;
};
