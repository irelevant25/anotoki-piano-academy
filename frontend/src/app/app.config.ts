import { HttpInterceptorFn, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { anotokiAuthInterceptor } from '@anotoki/lib/auth';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { ThemeService } from '@anotoki/lib/shell';
import { routes } from './app.routes';
import { provideSiteAuth } from './shared/auth/site-auth';
import { ChangelogService } from './shared/changelog/changelog.service';
import { provideSiteErrorReport } from './shared/error-report';
import { provideFamilyKit } from './shared/family-kit';
import { provideSiteTranslations } from './shared/i18n/site-translations';
import { pianoLegalConfig } from './shared/legal/legal.config';
import { provideSiteAdmin } from './shared/site-admin';
import { BootService } from './shared/state/boot.service';
import { provideSiteMigrations } from './shared/state/site-migrations';
import { PianoTitleStrategy } from './shared/title.strategy';

/**
 * The app's HttpClient interceptors, in their order. The family's outermost: an answer that says the site is being
 * updated (or is not set up) is heard whatever request it came to, as it finally is - after the token's one retry.
 * Then the family's sign-in (@anotoki/lib/auth): a person's token, or a visitor's key, on this app's API - as each
 * request says (the feedback form's message says itself it is anybody's, anotoki-lib 0.7.2), or as the page is shown.
 */
export const SITE_INTERCEPTORS: HttpInterceptorFn[] = [siteStatusInterceptor, anotokiAuthInterceptor];

export const appConfig: ApplicationConfig = {
  providers: [
    // Every error - window's and a promise nobody caught's too - to the console and to the site's error log
    // (the family's reporter, through the HttpClient below: shared/error-report.ts).
    provideBrowserGlobalErrorListeners(),
    provideSiteErrorReport(),
    provideZonelessChangeDetection(),
    // Route parameters (/lesson/:unitId/:stepId, /songs/:songId) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // Where the site stands, then the family's sign-in (SITE_INTERCEPTORS).
    provideHttpClient(withFetch(), withInterceptors(SITE_INTERCEPTORS)),
    // The anotoki family's one behaviour while the site is not ready (@anotoki/lib/migrations).
    provideSiteMigrations(),
    // The app's words through the anotoki family's translations (@anotoki/lib/translations): the language and its
    // strings, the pipes, the admin panel's Translations and Languages pages (shared/i18n/site-translations.ts).
    provideSiteTranslations(),
    // Signing in through the anotoki family's library (@anotoki/lib/auth): the IAM, this app's visitors, the
    // callback and the failure's screen (shared/auth/site-auth.ts).
    provideSiteAuth(),
    // The anotoki family's kit and frame (@anotoki/lib/ui's pieces, @anotoki/lib/shell): its words the database's
    // (anotoki.*), the theme the account's, the languages this app's (shared/family-kit.ts).
    provideFamilyKit(),
    // The admin panel's People page and admin tools (error log, audit log, feedback, backups), and the visitors'
    // feedback form - the family's (shared/site-admin.ts).
    provideSiteAdmin(),
    // The anotoki family's legal pages - Terms, Privacy, Contact, and About and Support, on lazy routes open to anybody - and the footer's
    // links to them: the library's words around Piano Academy's facts, every address the pages link to in the code
    // (shared/legal/legal.config.ts; the facts, which only the pages read, come with their frame: sites/main/legal/legal-facts.ts).
    provideAnotokiLegal(pianoLegalConfig),
    // The browser tab's title: a route's title is a translation key, worded in
    // the language on the page, before the app's name.
    { provide: TitleStrategy, useClass: PianoTitleStrategy },
    // Before the first view: the theme (the family's ThemeService: the account's
    // from the first frame, so nothing flashes), the changelog on its way, where
    // the site stands (GET /api/site-status: while it is being updated the start
    // does only what works then), and the start of the app - the sign-in (which,
    // on the IAM's callback, puts the address the person came from back before
    // the router reads it), the language and its strings, and the person's
    // progress. index.html shows "Loading…" meanwhile.
    provideAppInitializer(async () => {
      inject(ThemeService);
      void inject(ChangelogService).load();
      const site = inject(SiteStatus);
      const boot = inject(BootService);
      await site.check();
      return boot.start();
    }),
  ],
};
