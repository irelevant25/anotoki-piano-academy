import { Route } from '@angular/router';
import { AuthCallbackComponent, SignInFailureComponent, adminGuard, personOrVisitorGuard, staffGuard } from '@anotoki/lib/auth';
import { routes } from './app.routes';

/** A route of the table by its path, under `parent`'s children (or at the top). */
function route(path: string, parent?: Route): Route {
  const found = (parent?.children ?? routes).find((one) => one.path === path);
  if (!found) throw new Error(`No route ${path}`);
  return found;
}

describe('the routes: who may open what, and what loads when', () => {
  const admin = route('admin');
  const learner = route('');

  it('the sign-in\'s own pages - the IAM\'s callback and the screen of a sign-in that did not work - are the family\'s, and never guarded', () => {
    for (const [path, component] of [
      ['auth/callback', AuthCallbackComponent],
      ['sign-in-failed', SignInFailureComponent],
    ] as const) {
      expect(route(path).component, path).toBe(component);
      expect([route(path).canActivate, route(path).canActivateChild], path).toEqual([undefined, undefined]);
    }
  });

  it('the learner\'s pages ask for a person - or a visitor, while the IAM lets visitors in - page by page', () => {
    expect(learner.canActivateChild).toEqual([personOrVisitorGuard]);
    expect(learner.children?.map((one) => one.path)).toEqual(['', 'lesson/:unitId/:stepId', 'trainer', 'sheet', 'songs', 'songs/:songId', 'stats', '**']);
  });

  it('the admin panel is the staff\'s (EDITOR or ADMIN) - never a visitor\'s - and everything in it but Translations is ADMIN\'s alone', () => {
    expect(admin.canActivate).toEqual([staffGuard]);
    const pages = (admin.children ?? []).filter((one) => one.loadComponent);
    expect(pages.map((one) => [one.path, one.title, (one.canActivate ?? []).includes(adminGuard)])).toEqual([
      ['translations', 'Translations', false],
      ['languages', 'Languages', true],
      ['people', 'People', true],
      ['migrations', 'Migrations', true],
      ['errors', 'Error log', true],
      ['audit', 'Audit log', true],
      ['feedback', 'Feedback', true],
      ['backups', 'Backups', true],
    ]);
  });

  it('the admin panel\'s pages are the family\'s, each from its own entry point - loaded when opened, never in the first load', async () => {
    const expected: Record<string, string> = {
      translations: 'TranslationsPageComponent',
      languages: 'LanguagesPageComponent',
      people: 'PeoplePageComponent',
      migrations: 'MigrationsPageComponent',
      errors: 'ErrorLogPageComponent',
      audit: 'AuditLogPageComponent',
      feedback: 'FeedbackPageComponent',
      backups: 'BackupsPageComponent',
    };
    for (const [path, name] of Object.entries(expected)) {
      const page = (await route(path, admin).loadComponent!()) as { name: string };
      expect(page.name, path).toContain(name);
    }
  });
});
