import { Routes } from '@angular/router';
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

export const routes: Routes = [
  { path: '', component: HomePageComponent, title: 'Learn · Piano Academy' },
  {
    path: 'lesson/:unitId/:stepId',
    title: 'Lesson · Piano Academy',
    loadComponent: withNotation(() => import('./pages/lesson/lesson-page.component').then((m) => m.LessonPageComponent)),
  },
  {
    path: 'trainer',
    title: 'Note Trainer · Piano Academy',
    loadComponent: withNotation(() => import('./pages/trainer/trainer-page.component').then((m) => m.TrainerPageComponent)),
  },
  {
    path: 'sheet',
    title: 'Sheet Practice · Piano Academy',
    loadComponent: withNotation(() => import('./pages/sheet/sheet-page.component').then((m) => m.SheetPageComponent)),
  },
  {
    path: 'songs',
    title: 'Songs · Piano Academy',
    loadComponent: () => import('./pages/songs/songs-page.component').then((m) => m.SongsPageComponent),
  },
  {
    path: 'songs/:songId',
    title: 'Songs · Piano Academy',
    loadComponent: withNotation(() => import('./pages/songs/song-player-page.component').then((m) => m.SongPlayerPageComponent)),
  },
  { path: 'stats', component: StatsPageComponent, title: 'Stats · Piano Academy' },
  // The IAM's redirect URI; see AuthService.init() for where the sign-in is finished.
  { path: 'auth/callback', component: AuthCallbackPageComponent, title: 'Signing in · Piano Academy' },
  { path: '**', redirectTo: '' },
];
