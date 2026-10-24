import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { SiteStatus } from '@anotoki/lib/migrations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { ChangelogService } from '../../shared/changelog/changelog.service';
import { provideFamilyKit } from '../../shared/family-kit';
import { pianoLegalConfig } from '../../shared/legal/legal.config';
import { provideSiteAdmin } from '../../shared/site-admin';
import { BootService, BootStatus } from '../../shared/state/boot.service';
import { provideSiteMigrations } from '../../shared/state/site-migrations';
import { TestAuth, provideTestAuth } from '../../shared/testing/test-auth';
import { provideTestKit } from '../../shared/testing/test-kit';
import { AppComponent } from './app.component';

/** The app's words the panel's frame asks for: the sign-out question (the bar's, in English here). The frame's own are the kit's. */
const ENGLISH: Record<string, string> = {
  'signOut.title': 'Sign out without your latest progress?',
  'signOut.text': 'Some of your progress could not be saved yet. If you sign out now, it is lost.',
  'signOut.confirm': 'Sign out anyway',
  'signOut.cancel': 'Stay signed in',
};

/** The eight pages of an ADMIN, in the column's order, and where each goes. */
const ADMIN_PAGES = [
  ['Translations', '/admin/translations'],
  ['Languages', '/admin/languages'],
  ['People', '/admin/people'],
  ['Feedback', '/admin/feedback'],
  ['Error log', '/admin/errors'],
  ['Audit log', '/admin/audit'],
  ['Backups', '/admin/backups'],
  ['Migrations', '/admin/migrations'],
];

/**
 * The admin panel's root (app.component): the family's admin frame (@anotoki/lib/admin/frame) for the staff, wired to
 * Piano Academy's - its name, the person, the way back, the one sign-out, the theme, the pages by role, the footer - and
 * for anybody else the page that says why there is nothing here. The frame's own behaviour (its column, its phone row
 * and drawer, its skip link, the body's scrolling) is the library's, tested there.
 */
describe("AppComponent (the admin panel): the family's admin frame, split by role, in English", () => {
  let fixture: ComponentFixture<AppComponent>;
  let host: HTMLElement;
  let site: SiteStatus;
  let changelog: ChangelogService;
  const status = signal<BootStatus>('ready');
  const onlyMigrations = signal(false);
  /** What settling answers: would signing out now lose progress? */
  let settled: (wouldLose: boolean) => void = () => undefined;
  const boot = {
    status,
    onlyMigrations,
    signIn: vi.fn(async () => undefined),
    settleBeforeSignOut: vi.fn(() => new Promise<boolean>((resolve) => (settled = resolve))),
    signOut: vi.fn(),
  };
  /** How many feedback messages are new (the family's FeedbackUnread; null until the server said, and for anybody but an ADMIN). */
  const unread = { count: signal<number | null>(null), refresh: vi.fn(async () => undefined) };

  // The family's dialogs and boxes ask jsdom for what it lacks (showModal(), popovers, checkVisibility()).
  beforeAll(() => provideTestKit());

  async function as(person: { signedIn: boolean; roles?: string[]; name?: string; email?: string; failure?: string }): Promise<void> {
    TestBed.resetTestingModule();
    // A computer's window: no width the frame asks about matches (its phone's row and drawer are the library's to test).
    vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const auth = new TestAuth();
    if (person.signedIn) auth.signInAs({ sub: '7', roles: person.roles ?? [], preferred_username: person.name ?? null, email: person.email ?? null });
    else auth.signedOut();
    if (person.failure) auth.failed(person.failure);
    unread.refresh.mockClear();
    TestBed.configureTestingModule({
      // The panel itself, so its @defer block's component (What's new) is resolved by compileComponents() below.
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        ...provideTestTranslations(ENGLISH),
        ...provideTestAuth(auth),
        { provide: BootService, useValue: boot },
        { provide: FeedbackUnread, useValue: unread },
        provideSiteMigrations(),
        provideFamilyKit(),
        provideSiteAdmin(),
        provideAnotokiLegal(pianoLegalConfig),
      ],
    });
    await TestBed.compileComponents();
    site = TestBed.inject(SiteStatus);
    site.markReady();
    changelog = TestBed.inject(ChangelogService);
    fixture = TestBed.createComponent(AppComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  beforeEach(() => {
    status.set('ready');
    onlyMigrations.set(false);
    unread.count.set(null);
    boot.signIn.mockClear();
    boot.settleBeforeSignOut.mockClear();
    boot.signOut.mockClear();
  });

  afterEach(() => {
    host?.remove();
    vi.unstubAllGlobals();
  });

  const $ = <T extends Element = HTMLElement>(selector: string): T | null => host.querySelector<T>(selector);
  const texts = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  /** The column's pages: each link's words and where it goes. */
  const pages = (): string[][] =>
    Array.from(host.querySelectorAll('.anotoki-side-nav__link')).map((link) => [link.querySelector('.anotoki-side-nav__label')?.textContent?.trim() ?? '', link.getAttribute('href') ?? '']);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();
    }
  };

  it("draws the frame for an ADMIN and an EDITOR, in English: the panel's name, who is signed in, Back to Piano Academy, Sign out, the theme, the page in the one <main> and the footer - no top bar", async () => {
    for (const roles of [['ADMIN'], ['EDITOR']]) {
      await as({ signedIn: true, roles, name: 'mia', email: 'mia@example.com' });
      expect($('anotoki-admin-frame')?.getAttribute('lang')).toBe('en');
      expect($('.anotoki-admin-frame__brand')?.textContent?.trim()).toBe('anotoki Piano Academy · admin panel');
      expect($('.anotoki-admin-frame__brand')?.getAttribute('href')).toBe('/admin');
      expect(texts('.anotoki-admin-frame__name')).toEqual(['mia']);
      expect(texts('.anotoki-admin-frame__email')).toEqual(['mia@example.com']);
      expect($('.anotoki-admin-frame__back')?.textContent?.trim()).toBe('Back to Piano Academy');
      expect($('.anotoki-admin-frame__back')?.getAttribute('href')).toBe('/');
      expect($('.anotoki-admin-frame__sign-out')?.textContent?.trim()).toBe('Sign out');
      // The family's theme switch - light, dark, as the device is set - in the frame's theme row.
      expect(host.querySelectorAll('.anotoki-admin-frame__theme anotoki-theme-toggle [role="radio"]').length).toBe(3);
      expect($('main#main router-outlet')).not.toBeNull();
      expect(host.querySelectorAll('main').length).toBe(1);
      expect($('anotoki-site-footer footer')).not.toBeNull();
      expect($('app-top-bar, anotoki-top-bar')).toBeNull();
    }
  });

  it('names the person as the family does: the name, the address under it - and the address alone, said once, when the token names nobody', async () => {
    await as({ signedIn: true, roles: ['EDITOR'], email: 'ed@example.com' });
    expect(texts('.anotoki-admin-frame__name')).toEqual(['ed@example.com']);
    expect($('.anotoki-admin-frame__email')).toBeNull();
  });

  it('the pages by role, under their headings: an EDITOR has Translations alone, an ADMIN every page - "Feedback" with how many messages are new', async () => {
    await as({ signedIn: true, roles: ['EDITOR'] });
    expect(texts('.anotoki-side-nav__heading')).toEqual(['Localization']);
    expect(pages()).toEqual([['Translations', '/admin/translations']]);
    expect($('nav')?.getAttribute('aria-label')).toBe('Admin panel');

    await as({ signedIn: true, roles: ['ADMIN'] });
    expect(texts('.anotoki-side-nav__heading')).toEqual(['Localization', 'System']);
    expect(pages()).toEqual(ADMIN_PAGES);
    // Nothing new (or not known yet): no number.
    expect($('.anotoki-side-nav__badge')).toBeNull();
    unread.count.set(0);
    await fixture.whenStable();
    expect($('.anotoki-side-nav__badge')).toBeNull();
    // Three new messages: the number beside "Feedback" - no mail is sent, so this is how an ADMIN hears of one.
    unread.count.set(3);
    await fixture.whenStable();
    expect(texts('.anotoki-side-nav__badge')).toEqual(['3']);
    expect($('.anotoki-side-nav__link[href="/admin/feedback"] .anotoki-side-nav__badge')).not.toBeNull();
  });

  it('while an update waits: an ADMIN has the Migrations page alone - anybody else, no page', async () => {
    status.set('waiting');
    onlyMigrations.set(true);
    await as({ signedIn: true, roles: ['ADMIN'] });
    site.report('update_pending');
    await fixture.whenStable();
    expect(texts('.anotoki-side-nav__heading')).toEqual(['System']);
    expect(pages()).toEqual([['Migrations', '/admin/migrations']]);
    onlyMigrations.set(false);
    await fixture.whenStable();
    expect(pages()).toEqual([]);
    // Ready again: every page.
    onlyMigrations.set(false);
    status.set('ready');
    site.markReady();
    await fixture.whenStable();
    expect(pages()).toEqual(ADMIN_PAGES);
  });

  it('asks how many feedback messages are new for an ADMIN (the column\'s "Feedback") - never for anybody else', async () => {
    await as({ signedIn: true, roles: ['ADMIN'] });
    expect(unread.refresh).toHaveBeenCalledTimes(1);
    for (const roles of [['EDITOR'], ['MEMBER']]) {
      await as({ signedIn: true, roles });
      expect(unread.refresh).not.toHaveBeenCalled();
    }
    await as({ signedIn: false });
    expect(unread.refresh).not.toHaveBeenCalled();
  });

  it('Sign out is the one the bar runs: settled first - "Saving…" meanwhile - and asked, in English, when progress would be lost, the safe answer first', async () => {
    await as({ signedIn: true, roles: ['ADMIN'] });
    const button = (): HTMLButtonElement => $<HTMLButtonElement>('.anotoki-admin-frame__sign-out')!;
    button().click();
    await fixture.whenStable();
    expect(boot.settleBeforeSignOut).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().textContent?.trim()).toBe('Saving…');
    expect(boot.signOut).not.toHaveBeenCalled();

    settled(true);
    await settle();
    const confirm = TestBed.inject(ConfirmService);
    expect(confirm.pending()).toEqual(
      expect.objectContaining({
        title: 'Sign out without your latest progress?',
        message: 'Some of your progress could not be saved yet. If you sign out now, it is lost.',
        confirmLabel: 'Sign out anyway',
        cancelLabel: 'Stay signed in',
        tone: 'danger',
      }),
    );
    confirm.settle(false);
    await settle();
    expect(boot.signOut).not.toHaveBeenCalled();
    expect(button().textContent?.trim()).toBe('Sign out');

    // Nothing that would be lost: signed out at once, no question.
    button().click();
    settled(false);
    await settle();
    expect(confirm.pending()).toBeNull();
    expect(boot.signOut).toHaveBeenCalledTimes(1);
  });

  it("the footer's version and What's new once the list of changes came - What's new opens this app's own dialog", async () => {
    await as({ signedIn: true, roles: ['EDITOR'] });
    expect($('anotoki-site-footer [data-version]')).toBeNull();
    changelog.entries.set([{ version: '0.4.0', date: '2026-09-28', changes: { added: ['Songs you can play along with'] } }]);
    await fixture.whenStable();
    expect($('anotoki-site-footer [data-version]')?.textContent).toContain('0.4.0');
    $<HTMLButtonElement>('anotoki-site-footer [data-whats-new]')!.click();
    await settle();
    expect($('app-changelog-dialog')).not.toBeNull();
  });

  it('tells a learner (or an old MEMBER) whose the area is - on a page of its own, no frame, no menu, no page', async () => {
    for (const roles of [[], ['MEMBER']]) {
      await as({ signedIn: true, roles });
      expect($('#admin-no-role h2')?.textContent).toBe("This part is for the people who keep Piano Academy's words");
      expect($('#admin-no-role a')?.getAttribute('href')).toBe('/');
      expect($('main.admin-alone')?.getAttribute('lang')).toBe('en');
      expect(host.querySelectorAll('main').length).toBe(1);
      expect($('anotoki-admin-frame')).toBeNull();
      expect($('router-outlet')).toBeNull();
    }
  });

  it('signed out: after a session that ended, and after a sign-in that came back without one - each with its Sign in, no frame', async () => {
    await as({ signedIn: false });
    expect($('#admin-signed-out h2')?.textContent).toBe('You are signed out');
    expect($('anotoki-admin-frame')).toBeNull();
    ($('#admin-sign-in') as HTMLButtonElement).click();
    expect(boot.signIn).toHaveBeenCalledTimes(1);

    await as({ signedIn: false, failure: 'access_denied' });
    expect($('#admin-signed-out h2')?.textContent).toBe('You are not signed in');
    expect($('router-outlet')).toBeNull();
  });
});
