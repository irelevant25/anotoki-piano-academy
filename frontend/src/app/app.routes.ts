import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthCallbackComponent, SignInFailureComponent, adminGuard, personOrVisitorGuard, staffGuard } from '@anotoki/lib/auth';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { BootService } from './core/state/boot.service';
import { HomePageComponent } from './pages/home/home-page.component';

/**
 * A page that draws notation opens once VexFlow's fonts can draw - otherwise
 * its first staff would be laid out with the wrong glyphs. VexFlow comes in
 * with these pages (a chunk of its own), not with the app's first load.
 */
function withNotation<T>(load: () => Promise<T>): () => Promise<T> {
  return () => Promise.all([load(), import('./core/notation/notation').then((m) => m.notationFontsReady())]).then(([component]) => component);
}

/**
 * Every page is for somebody signed in - the anotoki family's guards
 * (@anotoki/lib/auth): anybody else is sent to the IAM and comes back to the
 * page asked for - the learner's pages ask it page by page
 * (personOrVisitorGuard, canActivateChild), the admin panel once as it is
 * entered (staffGuard: EDITOR or ADMIN; adminGuard on the pages for ADMIN
 * alone - anybody else signed in is sent to the start page). While the IAM
 * does not require a sign-in, the learner's pages are a visitor's too; the
 * admin panel never is. A sign-in that came back without one, could not
 * start, or cannot be set up goes to the family's screen that says why
 * (/sign-in-failed, in this app's frame: Try again, Back) instead of round to
 * the IAM again. The card "could not load" is drawn without a sign-in. While
 * the site is not ready (an update waits, it is not set up, its database is
 * out of reach) nobody is sent anywhere: the family's status page stands in
 * every page's place (<anotoki-site-gate>), with a Sign in of its own.
 *
 * The legal pages - Terms, Privacy, Contact: the anotoki family's
 * (@anotoki/lib/legal/pages) with Piano Academy's facts, which their frame
 * gives them (layouts/legal-layout) - are anybody's: no guard, nothing of a
 * person's progress on them, and the shell draws them whatever its start says
 * (AppComponent's pageShown). Each is a path of its own with the frame as its
 * parent - never one parent with an empty path holding the three: the router
 * takes an address it has read whole ("/") for such a parent when none of its
 * children match, and would draw the empty frame at "/" with no guard (the
 * survey's lesson, 2026-10-17; app.routes.spec.ts). They come before the
 * learner's pages, whose "**" would take them. Their paths are the library's
 * (DEFAULT_LEGAL_PATHS), the footer's links go there.
 *
 * A title is a translation key (`title.*`): PianoTitleStrategy words it in the
 * language on the page and puts the app's name after it. The admin panel's
 * pages are English whatever the language, and so are their titles: written
 * here as they are (PianoTitleStrategy puts "Admin panel" between them and
 * the app's name).
 */

/** The legal pages' frame, loaded with the first of them that is opened (and the app's facts with it, out of the first load). */
const legalFrame = () => import('./layouts/legal-layout/legal-layout.component').then((m) => m.LegalLayoutComponent);

export const routes: Routes = [
  // The IAM's redirect URI (core/auth/site-auth.ts): AnotokiAuth.init() finishes the sign-in before the router
  // starts, so the page is seen only when opened by hand ("Signing you in…", then the start page). Never guarded.
  { path: 'auth/callback', component: AuthCallbackComponent, title: 'title.signingIn' },
  // Why a sign-in did not work - the family's screen, under this app's bar (the guards send the browser here).
  { path: 'sign-in-failed', component: SignInFailureComponent, title: 'title.signingIn' },
  // The admin panel (English): the app's words for the staff (EDITOR or ADMIN) - Translations; the
  // languages, the people, the migrations and the admin tools for ADMIN alone (adminGuard). The
  // guards and the layout only hide what the server refuses anyway; leaving a page with something
  // not saved asks. While an update waits, the Migrations page is the one an ADMIN can use, and
  // /admin opens it. The family's pages are entry points of their own, never in the first load.
  {
    path: 'admin',
    canActivate: [staffGuard],
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
        // The anotoki family's People page (@anotoki/lib/people/page; core/site-admin.ts says what is this app's).
        loadComponent: () => import('@anotoki/lib/people/page').then((m) => m.PeoplePageComponent),
      },
      {
        path: 'migrations',
        title: 'Migrations',
        canActivate: [adminGuard],
        // The anotoki family's page, in an entry point of its own (@anotoki/lib/migrations/page - never in the
        // first load): Pending, Applied with each file's SQL, "Apply pending".
        loadComponent: () => import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent),
      },
      // The anotoki family's admin tools (@anotoki/lib/admin/*, core/site-admin.ts): what failed, who did what,
      // what visitors wrote, and the database's backups.
      {
        path: 'errors',
        title: 'Error log',
        canActivate: [adminGuard],
        loadComponent: () => import('@anotoki/lib/admin/errors').then((m) => m.ErrorLogPageComponent),
      },
      {
        path: 'audit',
        title: 'Audit log',
        canActivate: [adminGuard],
        loadComponent: () => import('@anotoki/lib/admin/audit').then((m) => m.AuditLogPageComponent),
      },
      {
        path: 'feedback',
        title: 'Feedback',
        canActivate: [adminGuard],
        loadComponent: () => import('@anotoki/lib/admin/feedback').then((m) => m.FeedbackPageComponent),
      },
      {
        path: 'backups',
        title: 'Backups',
        canActivate: [adminGuard],
        loadComponent: () => import('@anotoki/lib/admin/backups').then((m) => m.BackupsPageComponent),
      },
      // The Migrations page's address before it was the family's (the Database page).
      { path: 'database', pathMatch: 'full', redirectTo: 'migrations' },
      { path: '**', redirectTo: 'translations' },
    ],
  },
  // Where the owner's two pages were before the admin panel.
  { path: 'translations', redirectTo: '/admin/translations', pathMatch: 'full' },
  { path: 'languages', redirectTo: '/admin/languages', pathMatch: 'full' },
  // The legal pages: anybody's, each a path of its own in the frame that gives them the app's facts (see above).
  {
    path: 'terms',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'title.terms', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.TermsPageComponent) }],
  },
  {
    path: 'privacy',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'title.privacy', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.PrivacyPageComponent) }],
  },
  {
    path: 'contact',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'title.contact', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.ContactPageComponent) }],
  },
  // The learner's pages.
  {
    path: '',
    canActivateChild: [personOrVisitorGuard],
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
