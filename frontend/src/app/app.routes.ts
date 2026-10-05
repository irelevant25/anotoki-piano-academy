import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { adminSignInGuard, signInGuard } from './core/auth/sign-in.guard';
import { BootService } from './core/state/boot.service';
import { adminGuard } from './pages/admin/admin.guard';
import { unsavedChangesGuard } from './pages/admin/unsaved-changes.guard';
import { AuthCallbackPageComponent } from './pages/auth-callback/auth-callback-page.component';
import { HomePageComponent } from './pages/home/home-page.component';
import { StatsPageComponent } from './pages/stats/stats-page.component';

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
 * visitor's too; the admin panel never is. The boot cards (not set up, could not load) are drawn without a
 * sign-in; so is the sign-in card after a sign-in that came back without one.
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
  // the database is behind, the Migrations page is the one an ADMIN can use, and /admin opens it.
  {
    path: 'admin',
    canActivate: [adminSignInGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => (inject(BootService).onlyMigrations() ? 'migrations' : 'translations') },
      {
        path: 'translations',
        title: 'Translations',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/admin/translations/translations.component').then((m) => m.TranslationsComponent),
      },
      {
        path: 'languages',
        title: 'Languages',
        canActivate: [adminGuard],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/admin/languages/languages.component').then((m) => m.LanguagesComponent),
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
        loadComponent: () => import('./pages/admin/migrations/migrations.component').then((m) => m.MigrationsComponent),
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
      { path: 'stats', component: StatsPageComponent, title: 'title.stats' },
      { path: '**', redirectTo: '' },
    ],
  },
];
