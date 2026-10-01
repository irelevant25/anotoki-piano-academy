import { Routes } from '@angular/router';
import { AuthCallbackPageComponent } from './pages/auth-callback/auth-callback-page.component';
import { HomePageComponent } from './pages/home/home-page.component';
import { ownerGuard } from './pages/owner/owner.guard';
import { unsavedChangesGuard } from './pages/owner/unsaved-changes.guard';
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
 * A title is a translation key (`title.*`): PianoTitleStrategy words it in the
 * language on the page and puts the app's name after it. The owner's two
 * pages are English whatever the language, and so are their titles: written
 * here as they are.
 */
export const routes: Routes = [
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
  // The app's own words, for its owner (the footer's link): the guard only
  // hides what the server refuses, and leaving with something not saved asks.
  {
    path: 'translations',
    title: 'Translations',
    canActivate: [ownerGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/owner/translations/translations.component').then((m) => m.TranslationsComponent),
  },
  {
    path: 'languages',
    title: 'Languages',
    canActivate: [ownerGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/owner/languages/languages.component').then((m) => m.LanguagesComponent),
  },
  // The IAM's redirect URI; see AuthService.init() for where the sign-in is finished.
  { path: 'auth/callback', component: AuthCallbackPageComponent, title: 'title.signingIn' },
  { path: '**', redirectTo: '' },
];
