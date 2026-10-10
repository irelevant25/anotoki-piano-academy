import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { ThemeService } from '@anotoki/lib/shell';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { ChangelogService } from './core/changelog/changelog.service';
import { provideFamilyKit } from './core/family-kit';
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
    // heard whatever request it came to, as it finally is - after the token's one retry.
    provideHttpClient(withFetch(), withInterceptors([siteStatusInterceptor, authInterceptor])),
    // The anotoki family's one behaviour while the site is not ready (@anotoki/lib/migrations).
    provideSiteMigrations(),
    // The anotoki family's kit and frame (@anotoki/lib/ui, @anotoki/lib/shell): its words where this
    // app has its own in this app's, the theme the account's, the languages this app's (core/family-kit.ts).
    provideFamilyKit(),
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
