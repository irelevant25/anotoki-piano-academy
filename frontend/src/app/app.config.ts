import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { ChangelogService } from './core/changelog/changelog.service';
import { BootService } from './core/state/boot.service';
import { ThemeService } from './core/theme/theme.service';
import { PianoTitleStrategy } from './core/title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route parameters (/lesson/:unitId/:stepId, /songs/:songId) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // The browser tab's title: a route's title is a translation key, worded in
    // the language on the page, before the app's name.
    { provide: TitleStrategy, useClass: PianoTitleStrategy },
    // Before the first view: the theme (so nothing flashes), the changelog on
    // its way, and the start of the app - the sign-in (which, on the IAM's
    // callback, puts the address the person came from back before the router
    // reads it), the language and its strings, and the person's progress.
    // index.html shows "Loading…" meanwhile.
    provideAppInitializer(() => {
      inject(ThemeService);
      void inject(ChangelogService).load();
      return inject(BootService).start();
    }),
  ],
};
