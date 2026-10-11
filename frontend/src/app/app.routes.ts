import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { adminSignInGuard, signInGuard } from './core/auth/sign-in.guard';
import { BootService } from './core/state/boot.service';
import { adminGuard } from './pages/admin/admin.guard';
import { AuthCallbackPageComponent } from './pages/auth-callback/auth-callback-page.component';
import { HomePageComponent } from './pages/home/home-page.component';

/**
 * A page that draws notation opens once VexFlow's fonts can draw - otherwise
 * its first staff would be laid out with the wrong glyphs. VexFlow comes in
 * with these pages (a chunk of its own), not with the app's first load.
 */
function withNotation<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    Promise.all([load(), import('./core/notation/notation').then((m) => m.notationFontsReady())]).then(([component]) => component);
}

/**
 * Every page is for somebody signed in (signInGuard, adminSignInGuard): anybody
 * else is sent to the IAM and comes back to the page asked for - the learner's
 * pages ask it page by page (canActivateChild), the admin panel once as it is
 * entered. While the IAM does not require a sign-in, the learner's pages are a
 * visitor's too; the admin panel never is. The card "could not load" is drawn without a sign-in; so is the
 * sign-in card after a sign-in that came back without one. While the site is not ready (an update
 * waits, it is not set up, its database is out of reach) nobody is sent anywhere: the family's status
 * page stands in every page's place (<anotoki-site-gate>), with a Sign in of its own.
 *
 * A title is a translation key (`title.*`): PianoTitleStrategy words it in the
 * language on the page and puts the app's name after it. The admin panel's
 * pages are English whatever the language, and so are their titles: written
 * here as they are (PianoTitleStrategy puts "Admin panel" between them and
 * the app's name).
 */
export const routes: Routes = [
  // The IAM's redirect URI; see AuthService.init() for where the sign-in is finished. Never guarded.
  { path: 'auth/callback', component: AuthCallbackPageComponent, title: 'title.signingIn' },
  // The admin panel (English): the app's words for the staff (EDITOR or ADMIN) - Translations; the
  // languages, the people and the migrations for ADMIN alone (adminGuard). The guards and the layout
  // only hide what the server refuses anyway; leaving a page with something not saved asks. While
  // an update waits, the Migrations page is the one an ADMIN can use, and /admin opens it.
  {
    path: 'admin',
    canActivate: [adminSignInGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => (inject(BootService).onlyMigrations() ? 'migrations' : 'translations') },
      // The anotoki family's pages of the words, in an entry point of their own (@anotoki/lib/translations/admin -
      // never in the first load); who may use them is this app's (core/i18n/site-translations.ts: `admin.allows`).
      {
        path: 'translations',
        title: 'Translations',
        canDeactivate: [anotokiUnsavedChangesGuard],
        loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.TranslationsPageComponent),
      },
      {
        path: 'languages',
        title: 'Languages',
        canActivate: [adminGuard],
        canDeactivate: [anotokiUnsavedChangesGuard],
        loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.LanguagesPageComponent),
      },
      {
        path: 'people',
        title: 'People',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/people/people.component').then((m) => m.PeopleComponent),
      },
      {
        path: 'migrations',
        title: 'Migrations',
        canActivate: [adminGuard],
        // The anotoki family's page, in an entry point of its own (@anotoki/lib/migrations/page - never in the
        // first load): Pending, Applied with each file's SQL, "Apply pending".
        loadComponent: () => import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent),
      },
      // The Migrations page's address before it was the family's (the Database page).
      { path: 'database', pathMatch: 'full', redirectTo: 'migrations' },
      { path: '**', redirectTo: 'translations' },
    ],
  },
  // Where the owner's two pages were before the admin panel.
  { path: 'translations', redirectTo: '/admin/translations', pathMatch: 'full' },
  { path: 'languages', redirectTo: '/admin/languages', pathMatch: 'full' },
  // The learner's pages.
  {
    path: '',
    canActivateChild: [signInGuard],
    children: [
      { path: '', component: HomePageComponent, title: 'title.learn' },
      {
        path: 'lesson/:unitId/:stepId',
        title: 'title.lesson',
        loadComponent: withNotation(() => import('./pages/lesson/lesson-page.component').then((m) => m.LessonPageComponent)),
      },
      {
        path: 'trainer',
        title: 'title.trainer',
        loadComponent: withNotation(() => import('./pages/trainer/trainer-page.component').then((m) => m.TrainerPageComponent)),
      },
      {
        path: 'sheet',
        title: 'title.sheet',
        loadComponent: withNotation(() => import('./pages/sheet/sheet-page.component').then((m) => m.SheetPageComponent)),
      },
      {
        path: 'songs',
        title: 'title.songs',
        loadComponent: () => import('./pages/songs/songs-page.component').then((m) => m.SongsPageComponent),
      },
      {
        path: 'songs/:songId',
        title: 'title.songs',
        loadComponent: withNotation(() => import('./pages/songs/song-player-page.component').then((m) => m.SongPlayerPageComponent)),
      },
      // A chunk of its own, as the practice pages: the first load stays under its 500 kB budget (docs/decisions.md,
      // 2026-10-11). No notation on it, so no wait for VexFlow's fonts.
      {
        path: 'stats',
        title: 'title.stats',
        loadComponent: () => import('./pages/stats/stats-page.component').then((m) => m.StatsPageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
