import { EnvironmentProviders, Injector, inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { DEFAULT_OPEN_WHILE_CLOSED, provideAnotokiMigrations } from '@anotoki/lib/migrations';
import { TranslationService, siteStatusWords } from '@anotoki/lib/translations';
import { SIGN_IN_FAILED_ROUTE } from '../auth/site-auth';
import { AdminDates } from '../admin-dates';
import { STAFF_ROUTE } from '../site-settings';
import { BootService } from './boot.service';

/** Where the site stands: the backend's GET /api/site-status (anotoki/lib's MigrationsRoutes::status()). */
export const SITE_STATUS_URL = '/api/site-status';
/** The Migrations page's API: GET, GET /file, POST /apply (anotoki/lib's MigrationsRoutes::admin()). */
export const MIGRATIONS_API = '/api/admin/migrations';
/** The admin panel's route that shows <anotoki-migrations-page>. */
export const MIGRATIONS_ROUTE = '/admin/migrations';

/**
 * What anybody reaches while the site is closed for maintenance (the site
 * settings' Getting in), each with everything under it: the family's - the
 * sign-in's way back (/auth), the legal pages, About and Support - and this
 * app's screen of a sign-in that did not work, which is at an address of its
 * own here (SIGN_IN_FAILED_ROUTE, not under /auth).
 */
export const OPEN_WHILE_CLOSED: readonly string[] = [...DEFAULT_OPEN_WHILE_CLOSED, SIGN_IN_FAILED_ROUTE];

/**
 * The anotoki family's one behaviour while the site is not ready
 * (@anotoki/lib/migrations: SiteStatus, the interceptor, <anotoki-site-gate>,
 * <anotoki-site-status>, <anotoki-migrations-page>), wired to this app's
 * own: who is signed in and whether they are the site's ADMIN (the token's
 * roles - AnotokiAuth), how a sign-in starts (BootService.signIn(): a
 * visitor's saves first, the IAM's pages in the language read here, and back
 * to this address - or, from the closed sign's Sign in at the staff route,
 * back to the start page), the language on the page (English in the admin
 * panel), the status page's words from the database in that language (the
 * library's anotoki.siteStatus.* - an owner's rewording on the Translations
 * page reaches it; the module's built-in words while no bundle is in
 * memory), the account's date order and clock for the Migrations page's
 * dates (the admin panel's stamp), and what an Apply that leaves nothing to
 * apply does: the start goes on where it stopped
 * (BootService.resumeAfterUpdate()).
 *
 * While the site is closed for maintenance (anotoki-lib 0.11.0) the gate
 * draws the family's closed sign for everybody but the site's ADMIN, who uses
 * the site as it is; the sign offers Sign in at STAFF_ROUTE alone, and the
 * pages of OPEN_WHILE_CLOSED stay anybody's.
 *
 * BootService is asked for when it is used, never as the configuration is
 * made: it reads SiteStatus, which needs this configuration - a circle
 * otherwise.
 */
export function provideSiteMigrations(): EnvironmentProviders {
  return provideAnotokiMigrations(() => {
    const auth = inject(AnotokiAuth);
    const i18n = inject(TranslationService);
    const injector = inject(Injector);
    return {
      statusUrl: SITE_STATUS_URL,
      apiBase: MIGRATIONS_API,
      migrationsRoute: MIGRATIONS_ROUTE,
      isAdmin: () => auth.isAdmin(),
      isSignedIn: () => auth.signedIn(),
      signIn: (returnTo?: string) => injector.get(BootService).signIn(returnTo),
      staffRoute: STAFF_ROUTE,
      openWhileClosed: OPEN_WHILE_CLOSED,
      // The language the page is read in: the reader's, but English on an address of the admin panel, as the whole
      // panel is (effectiveLanguage - the library's advice). The words below are given in this very language, so the
      // page always says the database's words, an owner's rewording too - never the module's own beside them.
      language: () => i18n.effectiveLanguage(),
      // Read whenever the page draws: it follows the language and the strings (the database's anotoki.siteStatus.*;
      // the module's own while no bundle is in memory).
      get words() {
        return siteStatusWords(i18n);
      },
      formatDate: (iso) => injector.get(AdminDates).format(iso),
      onUpToDate: () => injector.get(BootService).resumeAfterUpdate(),
    };
  });
}
