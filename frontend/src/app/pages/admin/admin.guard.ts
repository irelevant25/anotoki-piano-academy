import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * The admin panel's pages for ADMIN alone - Languages, People, Migrations. An
 * EDITOR (or anybody signed in without a role) who opens one by its address
 * is sent to the Translations page; the admin layout then says what is there
 * for them (an EDITOR the page itself, anybody else that the area is not
 * theirs).
 *
 * While nobody is signed in the navigation stands: the sign-in guard on
 * /admin has sent the browser to the IAM already - or, after a sign-in that
 * came back without one, the layout draws the signed-out note.
 *
 * It only hides: the server refuses everybody but ADMIN anyway (403 forbidden).
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.signedIn() && !auth.isAdmin() ? inject(Router).parseUrl('/admin/translations') : true;
};
