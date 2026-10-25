import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { personOrVisitorGuard } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { pageAccessGuard } from '@anotoki/lib/site-settings';
import { HomePageComponent } from './home/home-page.component';

/**
 * A page that draws notation opens once VexFlow's fonts can draw - otherwise
 * its first staff would be laid out with the wrong glyphs. VexFlow comes in
 * with these pages (a chunk of its own), not with the app's first load.
 */
function withNotation<T>(load: () => Promise<T>): () => Promise<T> {
  return () => Promise.all([load(), import('./common/notation/notation').then((m) => m.notationFontsReady())]).then(([component]) => component);
}

/** The legal pages' frame, loaded with the first of them that is opened (and the app's facts with it, out of the first load). */
const legalFrame = () => import('./legal/legal-layout/legal-layout.component').then((m) => m.LegalLayoutComponent);

/**
 * The staff route (/staff, shared/site-settings.ts' STAFF_ROUTE): the
 * administrators' way in while the site is closed for maintenance. While the
 * site is not open to this reader the address stays - the router never takes
 * it for an unknown one, whose fallback would move it - and the family's gate
 * draws the closed sign over it, with Sign in there alone (back to the start
 * page afterwards). Open - the site ready, or the site's ADMIN signed in while
 * it is closed, who uses it as it is - there is nothing at the address: the
 * start page.
 */
export const staffRouteGuard: CanActivateFn = () => inject(SiteStatus).blocked() || inject(Router).createUrlTree(['/']);

/**
 * The learner's site's addresses - every one but the sign-in's own pages and
 * the admin panel's: the legal pages, About and Support, each in the legal
 * frame, the staff route, and the learner's pages. The map of every address
 * and its guards is app.routes.ts's, which spreads these in last, as they
 * stand and in this order.
 *
 * Page access (the site settings, shared/site-settings.ts) governs the
 * learner's pages - Learn, a lesson, the Note Trainer, Sheet Practice, Songs
 * and a song, Stats: the family's pageAccessGuard, a canMatch on each, so a
 * page closed to the reader falls through to "**" and the start page, as an
 * unknown address does - never a redirect that says the page exists. Where
 * Learn itself is closed to them the router follows no second redirect, and
 * the last "**" draws the page that says it is not open. The legal pages,
 * About, Support and the staff route are nobody's to govern (the library's
 * reserved pages, and the server refuses a row for one).
 */
export const MAIN_ROUTES: Routes = [
  // The legal pages: anybody's, each a path of its own in the frame that gives them the app's facts (app.routes.ts).
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
  // About and Support, the family's: anybody's, in the legal pages' frame, the same way.
  {
    path: 'about',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.about.title', loadComponent: () => import('@anotoki/lib/legal/about').then((m) => m.AboutPageComponent) }],
  },
  {
    path: 'support',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.support.title', loadComponent: () => import('@anotoki/lib/legal/support').then((m) => m.SupportPageComponent) }],
  },
  // The administrators' way in while the site is closed (the closed sign's Sign in): nothing of its own to draw - while
  // the site is open the guard sends anybody to the start page, and while it is closed the gate draws over it.
  { path: 'staff', canActivate: [staffRouteGuard], children: [] },
  // The learner's pages, each governed by Page access.
  {
    path: '',
    canActivateChild: [personOrVisitorGuard],
    children: [
      { path: '', component: HomePageComponent, title: 'title.learn', canMatch: [pageAccessGuard] },
      {
        path: 'lesson/:unitId/:stepId',
        title: 'title.lesson',
        canMatch: [pageAccessGuard],
        loadComponent: withNotation(() => import('./features/lesson/lesson-page.component').then((m) => m.LessonPageComponent)),
      },
      {
        path: 'trainer',
        title: 'title.trainer',
        canMatch: [pageAccessGuard],
        loadComponent: withNotation(() => import('./features/trainer/trainer-page.component').then((m) => m.TrainerPageComponent)),
      },
      {
        path: 'sheet',
        title: 'title.sheet',
        canMatch: [pageAccessGuard],
        loadComponent: withNotation(() => import('./features/sheet/sheet-page.component').then((m) => m.SheetPageComponent)),
      },
      {
        path: 'songs',
        title: 'title.songs',
        canMatch: [pageAccessGuard],
        loadComponent: () => import('./features/songs/songs-page.component').then((m) => m.SongsPageComponent),
      },
      {
        path: 'songs/:songId',
        title: 'title.songs',
        canMatch: [pageAccessGuard],
        loadComponent: withNotation(() => import('./features/songs/song-player-page.component').then((m) => m.SongPlayerPageComponent)),
      },
      // A chunk of its own, as the practice pages: the first load stays under its 500 kB budget (docs/decisions.md,
      // 2026-10-11). No notation on it, so no wait for VexFlow's fonts.
      {
        path: 'stats',
        title: 'title.stats',
        canMatch: [pageAccessGuard],
        loadComponent: () => import('./features/stats/stats-page.component').then((m) => m.StatsPageComponent),
      },
      // An unknown address - or a page closed to the reader - goes to the start page.
      { path: '**', redirectTo: '' },
      // Reached only where the start page is closed to the reader too (the router follows one redirect, no second).
      { path: '**', title: 'title.notOpen', loadComponent: () => import('./not-open/not-open.component').then((m) => m.NotOpenComponent) },
    ],
  },
];
