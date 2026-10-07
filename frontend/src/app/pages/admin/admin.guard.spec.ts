import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { adminSignInGuard, signInGuard } from '../../core/auth/sign-in.guard';
import { BootService } from '../../core/state/boot.service';
import { adminGuard } from './admin.guard';
import { unsavedChangesGuard } from './unsaved-changes.guard';

describe('adminGuard', () => {
  /** The guard's answer for a person as AuthService describes them. */
  function answer(person: { signedIn: boolean; isAdmin: boolean }): boolean | UrlTree {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { signedIn: () => person.signedIn, isAdmin: () => person.isAdmin } }],
    });
    return TestBed.runInInjectionContext(() => adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as boolean | UrlTree;
  }

  it('lets an ADMIN in', () => {
    expect(answer({ signedIn: true, isAdmin: true })).toBe(true);
  });

  it('lets the navigation stand while nobody is signed in: the sign-in guard has sent them to the IAM, or the layout says why not', () => {
    expect(answer({ signedIn: false, isAdmin: false })).toBe(true);
  });

  it('sends anybody else signed in - an EDITOR, a learner - to the Translations page', () => {
    const where = answer({ signedIn: true, isAdmin: false });

    expect(where).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(where as UrlTree)).toBe('/admin/translations');
  });
});

describe('the routes: every page signed in, the admin panel split by role', () => {
  const top = (path: string): Route => routes.find((candidate) => candidate.path === path)!;
  const admin = (path: string): Route => top('admin').children!.find((candidate) => candidate.path === path)!;

  it('asks for a sign-in on every learner page, page by page, and on the admin panel as it is entered - never on the IAM’s way back', () => {
    const learner = routes.find((candidate) => candidate.path === '' && candidate.children)!;
    expect(learner.canActivateChild).toEqual([signInGuard]);
    expect(learner.children!.map((child) => child.path)).toEqual(['', 'lesson/:unitId/:stepId', 'trainer', 'sheet', 'songs', 'songs/:songId', 'stats', '**']);
    // The admin panel's own: a sign-in whatever the IAM's switch - never a visitor's.
    expect(top('admin').canActivate).toEqual([adminSignInGuard]);
    expect(top('auth/callback').canActivate).toBeUndefined();
    expect(top('auth/callback').canActivateChild).toBeUndefined();
  });

  it('opens Translations for the staff, and Languages, People and Migrations for ADMIN alone', () => {
    expect(admin('translations').canActivate).toBeUndefined();
    for (const path of ['languages', 'people', 'migrations']) {
      expect(admin(path).canActivate).toEqual([adminGuard]);
    }
  });

  it.each([
    ['translations', 'Translations'],
    ['languages', 'Languages'],
    ['people', 'People'],
    ['migrations', 'Migrations'],
  ])('/admin/%s is lazy and has an English title written as it is', (path, title) => {
    const found = admin(path);

    expect(found.loadComponent).toBeTypeOf('function');
    expect(found.component).toBeUndefined();
    // Not a `title.*` key: the title strategy writes it as it is, in whatever language the app is read.
    expect(found.title).toBe(title);
  });

  it('asks before Translations and Languages are left with something not saved', () => {
    expect(admin('translations').canDeactivate).toEqual([unsavedChangesGuard]);
    expect(admin('languages').canDeactivate).toEqual([unsavedChangesGuard]);
  });

  it('sends the old addresses on: the owner\'s pages to the admin panel, the Database page to Migrations', () => {
    expect(top('translations').redirectTo).toBe('/admin/translations');
    expect(top('languages').redirectTo).toBe('/admin/languages');
    expect(admin('database').redirectTo).toBe('migrations');
  });

  it('opens the admin panel on Translations - on Migrations while the database is behind and only that page works', () => {
    const where = (onlyMigrations: boolean): unknown => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: BootService, useValue: { onlyMigrations: () => onlyMigrations } }] });
      const redirect = admin('').redirectTo as (snapshot: unknown) => string;
      return TestBed.runInInjectionContext(() => redirect({}));
    };
    expect(where(false)).toBe('translations');
    expect(where(true)).toBe('migrations');
  });

  it('stand before the learner pages, whose catch-all would send them to the start page', () => {
    const paths = routes.map((candidate) => candidate.path);
    expect(paths.indexOf('admin')).toBeLessThan(paths.indexOf(''));
    expect(paths.indexOf('translations')).toBeLessThan(paths.indexOf(''));
    expect(paths.indexOf('languages')).toBeLessThan(paths.indexOf(''));
  });

  it('load the layout and the four pages - the Migrations page the anotoki family\'s (@anotoki/lib/migrations)', async () => {
    const names = await Promise.all([top('admin'), admin('translations'), admin('languages'), admin('people'), admin('migrations')].map(async (route) => ((await route.loadComponent!()) as { name: string }).name));

    expect(names.join(' ')).toMatch(/AdminLayoutComponent.*TranslationsComponent.*LanguagesComponent.*PeopleComponent.*MigrationsPageComponent/);
  });

  it('ask the page itself whether it may be left', async () => {
    const page = { canLeave: vi.fn().mockReturnValue(false) };

    expect(unsavedChangesGuard(page, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot)).toBe(false);
    expect(page.canLeave).toHaveBeenCalledTimes(1);
  });

  it('let the way out free when the route is active but its page was never drawn - a boot card in its place', () => {
    // The router asks about the outlet's component, and an outlet that was not drawn has none.
    expect(unsavedChangesGuard(null, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot)).toBe(true);
  });

  it('let a navigation away from such a route happen: the router asks the guard about null', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'translations', children: [], canDeactivate: [unsavedChangesGuard] },
          { path: 'sheet', children: [] },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    // No outlet is drawn here, as none is while a boot card stands in the app's place.
    expect(await router.navigateByUrl('/translations')).toBe(true);

    expect(await router.navigateByUrl('/sheet')).toBe(true);
    expect(router.url).toBe('/sheet');
  });
});
