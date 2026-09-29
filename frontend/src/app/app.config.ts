import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { ChangelogService } from './core/changelog/changelog.service';
import { BootService } from './core/state/boot.service';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route parameters (/lesson/:unitId/:stepId, /songs/:songId) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Before the first view: the theme (so nothing flashes), the changelog on
    // its way, and the start of the app - the sign-in (which, on the IAM's
    // callback, puts the address the person came from back before the router
    // reads it) and the person's progress. index.html shows "Loading…" meanwhile.
    provideAppInitializer(() => {
      inject(ThemeService);
      void inject(ChangelogService).load();
      return inject(BootService).start();
    }),
  ],
};
