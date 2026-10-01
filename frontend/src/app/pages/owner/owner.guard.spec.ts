import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { ownerGuard } from './owner.guard';
import { unsavedChangesGuard } from './unsaved-changes.guard';

describe('ownerGuard', () => {
  /** The guard's answer for a person as AuthService describes them. */
  function answer(person: { signedIn: boolean; isOwner: boolean }): boolean | UrlTree {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { signedIn: () => person.signedIn, isOwner: () => person.isOwner } }],
    });
    return TestBed.runInInjectionContext(() => ownerGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as boolean | UrlTree;
  }

  it('lets the owner in', () => {
    expect(answer({ signedIn: true, isOwner: true })).toBe(true);
  });

  it('lets the navigation stand while nobody is signed in: only the sign-in card is drawn, and signing in comes back here', () => {
    expect(answer({ signedIn: false, isOwner: false })).toBe(true);
  });

  it('sends a signed-in person who is not the owner to the start page', () => {
    const where = answer({ signedIn: true, isOwner: false });

    expect(where).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(where as UrlTree)).toBe('/');
  });
});

describe("the owner's routes", () => {
  const route = (path: string) => routes.find((candidate) => candidate.path === path)!;

  it.each([
    ['translations', 'Translations'],
    ['languages', 'Languages'],
  ])('/%s is lazy, for the owner, asks before it is left, and has an English title written as it is', (path, title) => {
    const found = route(path);

    expect(found.loadComponent).toBeTypeOf('function');
    expect(found.component).toBeUndefined();
    expect(found.canActivate).toEqual([ownerGuard]);
    expect(found.canDeactivate).toEqual([unsavedChangesGuard]);
    // Not a `title.*` key: the title strategy writes it as it is, in whatever language the app is read.
    expect(found.title).toBe(title);
  });

  it('stand before the catch-all, which would send them to the start page', () => {
    const paths = routes.map((candidate) => candidate.path);

    expect(paths.indexOf('translations')).toBeLessThan(paths.indexOf('**'));
    expect(paths.indexOf('languages')).toBeLessThan(paths.indexOf('**'));
  });

  it('load the two pages', async () => {
    const translations = (await route('translations').loadComponent!()) as { name: string };
    const languages = (await route('languages').loadComponent!()) as { name: string };

    expect(translations.name).toContain('TranslationsComponent');
    expect(languages.name).toContain('LanguagesComponent');
  });

  it('ask the page itself whether it may be left', async () => {
    const page = { canLeave: vi.fn().mockReturnValue(false) };

    expect(unsavedChangesGuard(page, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot)).toBe(false);
    expect(page.canLeave).toHaveBeenCalledTimes(1);
  });

  it("let the way out free when the route is active but its page was never drawn - a boot card in its place", () => {
    // The router asks about the outlet's component, and an outlet that was not drawn has none.
    expect(unsavedChangesGuard(null, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot)).toBe(true);
  });

  it("let a navigation away from such a route happen: the router asks the guard about null", async () => {
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
