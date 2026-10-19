import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthCallbackComponent, SignInFailureComponent, adminGuard, personOrVisitorGuard, staffGuard } from '@anotoki/lib/auth';
import { routes } from './app.routes';
import { LEGAL_PAGE_PATHS } from './core/legal/legal.config';
import { HomePageComponent } from './pages/home/home-page.component';

/** A route of the table by its path, under `parent`'s children (or at the top). */
function route(path: string, parent?: Route): Route {
  const found = (parent?.children ?? routes).find((one) => one.path === path);
  if (!found) throw new Error(`No route ${path}`);
  return found;
}

@Component({ selector: 'app-test-frame', imports: [RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush, template: '<router-outlet />' })
class FrameStandInComponent {}

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageStandInComponent {}

/**
 * The app's routes as they are - their paths, their order, their nesting, their redirects - with a stand-in for every
 * frame and page and no guard, each knowing the route it stands for: what the router itself makes of an address is
 * what is checked.
 */
function standIns(list: Routes): Routes {
  return list.map((route): Route => {
    if (route.redirectTo !== undefined) {
      return route;
    }
    const standIn: Route = { path: route.path, pathMatch: route.pathMatch, matcher: route.matcher, data: { route } };
    return route.children ? { ...standIn, component: FrameStandInComponent, children: standIns(route.children) } : { ...standIn, component: PageStandInComponent };
  });
}

/** The app's routes the router took for the address it is at, from the top. */
function taken(): Route[] {
  const chain: Route[] = [];
  for (let node = TestBed.inject(Router).routerState.snapshot.root.firstChild; node; node = node.firstChild) {
    chain.push(node.data['route'] as Route);
  }
  return chain;
}

/**
 * Where an address goes (app.routes.ts): the legal pages are anybody's, each a path of its own with their frame as
 * its parent - and "/" is still Learn behind the learner's guard, an unknown address still Learn. One parent with an
 * empty path holding the three would take "/" for itself (the router takes an address it has read whole for such a
 * parent when none of its children match): the empty frame would stand there with no guard - the survey's lesson of
 * 2026-10-17.
 */
describe('the routes: what the router makes of an address', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(standIns(routes))] });
  });

  it('"/" is Learn, under the learner\'s guard - the family\'s personOrVisitorGuard, which sends anybody else to the IAM first', async () => {
    await RouterTestingHarness.create('/');
    const [frame, page] = taken();
    expect([frame.path, frame.canActivateChild]).toEqual(['', [personOrVisitorGuard]]);
    expect([page.path, page.component, page.title]).toEqual(['', HomePageComponent, 'title.learn']);
  });

  it("an unknown address goes to Learn - and so does one that only begins like a legal page's", async () => {
    const harness = await RouterTestingHarness.create();
    for (const address of ['/no-such-page', '/terms-of-use', '/privacy2', '/contact/me', '/about-us', '/support/me']) {
      await harness.navigateByUrl(address);
      const [frame, page] = taken();
      expect([address, TestBed.inject(Router).url, frame.canActivateChild, page.component]).toEqual([address, '/', [personOrVisitorGuard], HomePageComponent]);
    }
  });

  it('/terms, /privacy and /contact, /about and /support: the family’s pages, each its own path in the legal frame - no guard on the way, the frame and the page loaded when opened', async () => {
    const harness = await RouterTestingHarness.create();
    for (const [address, title, page] of [
      ['/terms', 'title.terms', 'TermsPageComponent'],
      ['/privacy', 'title.privacy', 'PrivacyPageComponent'],
      ['/contact', 'title.contact', 'ContactPageComponent'],
      ['/about', 'anotoki.about.title', 'AboutPageComponent'],
      ['/support', 'anotoki.support.title', 'SupportPageComponent'],
    ]) {
      await harness.navigateByUrl(address);
      const [frame, child, ...more] = taken();
      expect([frame.path, frame.component, frame.canActivate, frame.canActivateChild, frame.canMatch, more]).toEqual([address.slice(1), undefined, undefined, undefined, undefined, []]);
      expect([child.path, child.title, child.canActivate]).toEqual(['', title, undefined]);
      expect(((await frame.loadComponent!()) as { name: string }).name).toContain('LegalLayoutComponent');
      expect(((await child.loadComponent!()) as { name: string }).name).toContain(page);
    }
  });

  it("puts the legal pages, About and Support where the footer's links go - the library's paths - and before the learner's pages, whose \"**\" would take them", () => {
    const top = routes.map((one) => one.path);
    expect(LEGAL_PAGE_PATHS).toEqual(['/terms', '/privacy', '/contact', '/about', '/support']);
    for (const path of LEGAL_PAGE_PATHS) {
      expect(top.indexOf(path.slice(1)), path).toBeGreaterThan(-1);
      expect(top.indexOf(path.slice(1)), path).toBeLessThan(top.indexOf(''));
    }
  });
});

describe('the routes: who may open what, and what loads when', () => {
  const admin = route('admin');
  const learner = route('');

  it("the sign-in's own pages - the IAM's callback and the screen of a sign-in that did not work - are the family's, and never guarded", () => {
    for (const [path, component] of [
      ['auth/callback', AuthCallbackComponent],
      ['sign-in-failed', SignInFailureComponent],
    ] as const) {
      expect(route(path).component, path).toBe(component);
      expect([route(path).canActivate, route(path).canActivateChild], path).toEqual([undefined, undefined]);
    }
  });

  it("the learner's pages ask for a person - or a visitor, while the IAM lets visitors in - page by page", () => {
    expect(learner.canActivateChild).toEqual([personOrVisitorGuard]);
    expect(learner.children?.map((one) => one.path)).toEqual(['', 'lesson/:unitId/:stepId', 'trainer', 'sheet', 'songs', 'songs/:songId', 'stats', '**']);
  });

  it("the admin panel is the staff's (EDITOR or ADMIN) - never a visitor's - and everything in it but Translations is ADMIN's alone", () => {
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

  it("the admin panel's pages are the family's, each from its own entry point - loaded when opened, never in the first load", async () => {
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
