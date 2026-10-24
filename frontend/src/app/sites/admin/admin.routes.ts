import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { adminGuard, staffGuard } from '@anotoki/lib/auth';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { BootService } from '../../shared/state/boot.service';

/**
 * The admin panel's addresses: /admin and its pages, and where two of them
 * were before it. The map of every address and its guards is app.routes.ts's,
 * which spreads these in after the sign-in's own pages, as they stand and in
 * this order.
 */
export const ADMIN_ROUTES: Routes = [
  // The admin panel (English): the app's words for the staff (EDITOR or ADMIN) - Translations; the
  // languages, the people, the migrations and the admin tools for ADMIN alone (adminGuard). The
  // guards and the layout only hide what the server refuses anyway; leaving a page with something
  // not saved asks. While an update waits, the Migrations page is the one an ADMIN can use, and
  // /admin opens it. The family's pages are entry points of their own, never in the first load.
  {
    path: 'admin',
    canActivate: [staffGuard],
    loadComponent: () => import('./admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => (inject(BootService).onlyMigrations() ? 'migrations' : 'translations') },
      // The anotoki family's pages of the words, in an entry point of their own (@anotoki/lib/translations/admin -
      // never in the first load); who may use them is this app's (shared/i18n/site-translations.ts: `admin.allows`).
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
        // The anotoki family's People page (@anotoki/lib/people/page; shared/site-admin.ts says what is this app's).
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
      // The anotoki family's admin tools (@anotoki/lib/admin/*, shared/site-admin.ts): what failed, who did what,
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
];
