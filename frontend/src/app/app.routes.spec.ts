import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthCallbackComponent, SignInFailureComponent, adminGuard, personOrVisitorGuard, staffGuard } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { type PublicPage, SiteSettings, pageAccessGuard } from '@anotoki/lib/site-settings';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { routes } from './app.routes';
import { LEGAL_PAGE_PATHS } from './shared/legal/legal.config';
import { provideSiteSettings } from './shared/site-settings';
import { provideSiteMigrations } from './shared/state/site-migrations';
import { TestAuth, provideTestAuth } from './shared/testing/test-auth';
import { HomePageComponent } from './sites/main/home/home-page.component';
import { staffRouteGuard } from './sites/main/main.routes';

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

  it("the learner's pages ask for a person - or a visitor, while the IAM lets visitors in - page by page, each governed by Page access", () => {
    expect(learner.canActivateChild).toEqual([personOrVisitorGuard]);
    expect(learner.children?.map((one) => [one.path, one.canMatch])).toEqual([
      ['', [pageAccessGuard]],
      ['lesson/:unitId/:stepId', [pageAccessGuard]],
      ['trainer', [pageAccessGuard]],
      ['sheet', [pageAccessGuard]],
      ['songs', [pageAccessGuard]],
      ['songs/:songId', [pageAccessGuard]],
      ['stats', [pageAccessGuard]],
      ['**', undefined],
      ['**', undefined],
    ]);
    // The last "**" is a page (the one that says it is not open), never a second redirect: the router follows one.
    const last = learner.children!.at(-1)!;
    expect([last.redirectTo, last.title]).toEqual([undefined, 'title.notOpen']);
  });

  it("the staff route is nobody's to govern and needs no sign-in: its guard alone, nothing of its own to draw", () => {
    const staff = route('staff');
    expect([staff.canActivate, staff.canActivateChild, staff.canMatch, staff.component, staff.loadComponent, staff.children]).toEqual([
      [staffRouteGuard],
      undefined,
      undefined,
      undefined,
      undefined,
      [],
    ]);
    expect(routes.map((one) => one.path).indexOf('staff')).toBeLessThan(routes.map((one) => one.path).indexOf(''));
  });

  it("the admin panel is the staff's (EDITOR or ADMIN) - never a visitor's - and everything in it but Translations is ADMIN's alone", () => {
    expect(admin.canActivate).toEqual([staffGuard]);
    const pages = (admin.children ?? []).filter((one) => one.loadComponent);
    expect(pages.map((one) => [one.path, one.title, (one.canActivate ?? []).includes(adminGuard)])).toEqual([
      ['translations', 'Translations', false],
      ['languages', 'Languages', true],
      ['people', 'People', true],
      ['migrations', 'Migrations', true],
      ['site-settings', 'Site settings', true],
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
      'site-settings': 'SiteSettingsPageComponent',
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

/**
 * The routes' stand-ins (as above) with what decides an address under the site settings kept: Page access's guard on
 * the learner's pages (the family's pageAccessGuard, a canMatch) and the staff route's own guard - the sign-in's
 * guards left out, as above.
 */
function standInsWithAccess(list: Routes): Routes {
  return list.map((route): Route => {
    if (route.redirectTo !== undefined) {
      return route;
    }
    const standIn: Route = { path: route.path, pathMatch: route.pathMatch, data: { route }, canMatch: route.canMatch, canActivate: route.path === 'staff' ? route.canActivate : undefined };
    return route.children ? { ...standIn, component: FrameStandInComponent, children: standInsWithAccess(route.children) } : { ...standIn, component: PageStandInComponent };
  });
}

/**
 * What the site settings make of an address (anotoki-lib 0.11.0, shared/site-settings.ts, sites/main/main.routes.ts):
 * a page Page access closes to the reader falls through to Learn as an unknown address does - never a redirect that
 * says it exists -, the site's ADMIN opens every page, the page that says it is not open where Learn is closed too;
 * and the staff route - the closed sign's one door - keeps its address while the site is not open to the reader, and is
 * the start page otherwise.
 */
describe('the routes: Page access and the staff route (the site settings)', () => {
  let auth: TestAuth;
  let harness: RouterTestingHarness;

  /** What GET /api/site-settings says, read as the app's start reads it. */
  async function told(pages: PublicPage[]): Promise<void> {
    const load = TestBed.inject(SiteSettings).load();
    TestBed.inject(HttpTestingController).expectOne('/api/site-settings').flush({ maintenance: false, announcement: null, pages });
    await load;
  }

  /** Where the router went for an address: its own address, and the page it drew (the app's route a stand-in stands for). */
  async function opened(address: string): Promise<[string, Route]> {
    await harness.navigateByUrl(address);
    return [TestBed.inject(Router).url, taken().at(-1)!];
  }

  beforeEach(async () => {
    auth = new TestAuth();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(standInsWithAccess(routes)),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideTestTranslations({}),
        ...provideTestAuth(auth),
        provideSiteMigrations(),
        provideSiteSettings(),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it("a page closed to the reader falls through to Learn, at the start page's address - and opens for those it is shown to", async () => {
    await told([{ path: '/trainer', visibility: 'USER', blocked: false }]);
    expect(await opened('/trainer')).toEqual(['/', route('', route(''))]);
    auth.signInAs({ sub: '7', roles: ['MEMBER'] });
    expect(await opened('/trainer')).toEqual(['/trainer', route('trainer', route(''))]);
  });

  it("a page switched off opens for the site's ADMIN alone - whoever switched it off must be able to look at it", async () => {
    await told([{ path: '/songs/:songId', visibility: 'PUBLIC', blocked: true }]);
    auth.signInAs({ sub: '7', roles: ['MEMBER', 'EDITOR'] });
    expect(await opened('/songs/ode-to-joy')).toEqual(['/', route('', route(''))]);
    // Another row, another decision: the list of songs opens.
    expect(await opened('/songs')).toEqual(['/songs', route('songs', route(''))]);
    auth.signInAs({ sub: '1', roles: ['MEMBER', 'ADMIN'] });
    expect(await opened('/songs/ode-to-joy')).toEqual(['/songs/ode-to-joy', route('songs/:songId', route(''))]);
  });

  it('where Learn is closed to the reader too, the page that says it is not open - never a navigation that finds nothing', async () => {
    await told([
      { path: '/', visibility: 'USER', blocked: false },
      { path: '/stats', visibility: 'USER', blocked: false },
    ]);
    const [address, page] = await opened('/stats');
    expect([address, page.title]).toEqual(['/', 'title.notOpen']);
    expect(((await page.loadComponent!()) as { name: string }).name).toContain('NotOpenComponent');
    expect((await opened('/no-such-page'))[1].title).toBe('title.notOpen');
    // A page still open to the reader opens as ever.
    expect(await opened('/trainer')).toEqual(['/trainer', route('trainer', route(''))]);
  });

  it("the staff route while the site is open: the start page - and while it is closed to the reader, the address stays for the closed sign's door", async () => {
    await told([]);
    expect((await opened('/staff'))[0]).toBe('/');
    // Closed for maintenance (the site settings' Getting in): the router keeps /staff, where the sign offers Sign in.
    TestBed.inject(SiteStatus).report('maintenance', true, { en: 'Back soon.' });
    expect(await opened('/staff')).toEqual(['/staff', route('staff')]);
    // The site's ADMIN uses the site as it is: nothing at the address but the start page.
    auth.signInAs({ sub: '1', roles: ['MEMBER', 'ADMIN'] });
    await opened('/trainer');
    expect((await opened('/staff'))[0]).toBe('/');
  });
});
