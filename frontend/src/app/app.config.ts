import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { anotokiAuthInterceptor } from '@anotoki/lib/auth';
import { SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { ThemeService } from '@anotoki/lib/shell';
import { routes } from './app.routes';
import { provideSiteAuth } from './core/auth/site-auth';
import { ChangelogService } from './core/changelog/changelog.service';
import { provideFamilyKit } from './core/family-kit';
import { provideSiteTranslations } from './core/i18n/site-translations';
import { provideSiteAdmin } from './core/site-admin';
import { BootService } from './core/state/boot.service';
import { provideSiteMigrations } from './core/state/site-migrations';
import { PianoTitleStrategy } from './core/title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route parameters (/lesson/:unitId/:stepId, /songs/:songId) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // The family's outermost: an answer that says the site is being updated (or is not set up) is
    // heard whatever request it came to, as it finally is - after the token's one retry. Then the
    // family's sign-in (@anotoki/lib/auth): a person's token, or a visitor's key, on this app's API.
    provideHttpClient(withFetch(), withInterceptors([siteStatusInterceptor, anotokiAuthInterceptor])),
    // The anotoki family's one behaviour while the site is not ready (@anotoki/lib/migrations).
    provideSiteMigrations(),
    // The app's words through the anotoki family's translations (@anotoki/lib/translations): the language and its
    // strings, the pipes, the admin panel's Translations and Languages pages (core/i18n/site-translations.ts).
    provideSiteTranslations(),
    // Signing in through the anotoki family's library (@anotoki/lib/auth): the IAM, this app's visitors, the
    // callback and the failure's screen (core/auth/site-auth.ts).
    provideSiteAuth(),
    // The anotoki family's kit and frame (@anotoki/lib/ui's pieces, @anotoki/lib/shell): its words the database's
    // (anotoki.*), the theme the account's, the languages this app's (core/family-kit.ts).
    provideFamilyKit(),
    // The admin panel's People page and admin tools (error log, audit log, feedback, backups), and the visitors'
    // feedback form - the family's (core/site-admin.ts).
    provideSiteAdmin(),
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
