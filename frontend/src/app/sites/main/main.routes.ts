import { Routes } from '@angular/router';
import { personOrVisitorGuard } from '@anotoki/lib/auth';
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
 * The learner's site's addresses - every one but the sign-in's own pages and
 * the admin panel's: the legal pages, About and Support, each in the legal
 * frame, and the learner's pages. The map of every address and its guards is
 * app.routes.ts's, which spreads these in last, as they stand and in this
 * order.
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
  // The learner's pages.
  {
    path: '',
    canActivateChild: [personOrVisitorGuard],
    children: [
      { path: '', component: HomePageComponent, title: 'title.learn' },
      {
        path: 'lesson/:unitId/:stepId',
        title: 'title.lesson',
        loadComponent: withNotation(() => import('./features/lesson/lesson-page.component').then((m) => m.LessonPageComponent)),
      },
      {
        path: 'trainer',
        title: 'title.trainer',
        loadComponent: withNotation(() => import('./features/trainer/trainer-page.component').then((m) => m.TrainerPageComponent)),
      },
      {
        path: 'sheet',
        title: 'title.sheet',
        loadComponent: withNotation(() => import('./features/sheet/sheet-page.component').then((m) => m.SheetPageComponent)),
      },
      {
        path: 'songs',
        title: 'title.songs',
        loadComponent: () => import('./features/songs/songs-page.component').then((m) => m.SongsPageComponent),
      },
      {
        path: 'songs/:songId',
        title: 'title.songs',
        loadComponent: withNotation(() => import('./features/songs/song-player-page.component').then((m) => m.SongPlayerPageComponent)),
      },
      // A chunk of its own, as the practice pages: the first load stays under its 500 kB budget (docs/decisions.md,
      // 2026-10-11). No notation on it, so no wait for VexFlow's fonts.
      {
        path: 'stats',
        title: 'title.stats',
        loadComponent: () => import('./features/stats/stats-page.component').then((m) => m.StatsPageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
