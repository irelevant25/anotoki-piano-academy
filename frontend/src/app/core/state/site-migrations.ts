import { EnvironmentProviders, Injector, inject } from '@angular/core';
import { provideAnotokiMigrations } from '@anotoki/lib/migrations';
import { AuthService } from '../auth/auth.service';
import { localDateText } from '../i18n/local-date.pipe';
import { TranslationService } from '../i18n/translation.service';
import { BootService } from './boot.service';

/** Where the site stands: the backend's GET /api/site-status (anotoki/lib's MigrationsRoutes::status()). */
export const SITE_STATUS_URL = '/api/site-status';
/** The Migrations page's API: GET, GET /file, POST /apply (anotoki/lib's MigrationsRoutes::admin()). */
export const MIGRATIONS_API = '/api/admin/migrations';
/** The admin panel's route that shows <anotoki-migrations-page>. */
export const MIGRATIONS_ROUTE = '/admin/migrations';

/**
 * The anotoki family's one behaviour while the site is not ready
 * (@anotoki/lib/migrations: SiteStatus, the interceptor, <anotoki-site-gate>,
 * <anotoki-site-status>, <anotoki-migrations-page>), wired to this app's
 * own: who is signed in and whether they are the site's ADMIN (the token's
 * roles - AuthService), how a sign-in starts (BootService.signIn(): a
 * visitor's saves first, the IAM's pages in the language read here, and back
 * to this address), the language on the page, the account's date order and
 * clock for the Migrations page's dates (the admin panel's stamp), and what
 * an Apply that leaves nothing to apply does: the start goes on where it
 * stopped (BootService.resumeAfterUpdate()).
 *
 * BootService is asked for when it is used, never as the configuration is
 * made: it reads SiteStatus, which needs this configuration - a circle
 * otherwise.
 */
export function provideSiteMigrations(): EnvironmentProviders {
  return provideAnotokiMigrations(() => {
    const auth = inject(AuthService);
    const i18n = inject(TranslationService);
    const injector = inject(Injector);
    return {
      statusUrl: SITE_STATUS_URL,
      apiBase: MIGRATIONS_API,
      migrationsRoute: MIGRATIONS_ROUTE,
      isAdmin: () => auth.isAdmin(),
      isSignedIn: () => auth.signedIn(),
      signIn: () => injector.get(BootService).signIn(),
      // The visitor's own, also on an address of the admin panel (English there is the panel's, not this page's).
      language: () => i18n.language(),
      formatDate: (iso) => localDateText(iso, 'stamp', i18n.locale(), auth.preferences()),
      onUpToDate: () => injector.get(BootService).resumeAfterUpdate(),
    };
  });
}
