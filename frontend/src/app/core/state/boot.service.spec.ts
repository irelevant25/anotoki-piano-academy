import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { ApiService, VISITOR_OWNER } from '../api/api.service';
import { authInterceptor } from '../auth/auth.interceptor';
import { AuthService, NotSetUpError } from '../auth/auth.service';
import { VISITOR_KEY_HEADER, VISITOR_STORAGE_KEY, VisitorKey } from '../auth/visitor-key';
import { RETRY_WAIT_MS, TranslationService } from '../i18n/translation.service';
import { provideTestTranslations } from '../testing/test-translations';
import { BootService } from './boot.service';
import { ProgressStore } from './progress-store.service';
import { provideSiteMigrations } from './site-migrations';

/** What the family's gate answers every other request while an update waits (anotoki/lib's SiteGate). */
const UPDATE_PENDING = { code: 'update_pending', message: 'The site is being updated. Try again in a few minutes.' };

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Any request for the app's strings. */
const forStrings = (request: { url: string }): boolean => request.url.startsWith('/api/translations/');

/**
 * AuthService as far as the start uses it: the sign-in settings read (or the
 * error they fail with), and who is signed in. The real one would load the
 * IAM's SDK; what it does with /api/auth/config is its own spec's.
 */
function standInAuth() {
  const auth = {
    /** What reading the sign-in settings throws: nothing, NotSetUpError, or anything else. */
    failing: null as unknown,
    person: '7' as string | null,
    admin: false,
    /** The IAM's switch as the settings said it (true: a sign-in is required). */
    required: true,
    /** The sign-in listeners BootService added (onAuthChange). */
    listeners: [] as (() => void)[],
    init: vi.fn(async () => {
      if (auth.failing) throw auth.failing;
    }),
    signedIn: () => auth.person !== null,
    loginRequired: () => auth.required,
    requireSignInNow: vi.fn(() => {
      auth.required = true;
    }),
    userKey: () => auth.person,
    user: () => null,
    // The account's preferences: none here (an IAM before its 015) - the language is decided as it always was.
    preferences: () => null,
    isAdmin: () => auth.admin,
    accessToken: vi.fn(async () => (auth.person !== null ? 'token-7' : null)),
    refreshToken: vi.fn(async () => null),
    onAuthChange: (listener: () => void) => {
      auth.listeners.push(listener);
      return () => undefined;
    },
    signIn: vi.fn(async (_returnTo?: string, _uiLocales?: string) => true),
    signOut: vi.fn(),
  };
  return auth;
}

describe('BootService', () => {
  let boot: BootService;
  let http: HttpTestingController;
  let store: ProgressStore;
  let auth: ReturnType<typeof standInAuth>;

  beforeEach(() => {
    localStorage.clear();
    auth = standInAuth();
    // The strings are there already and cost no request (the stand-in): these cases are about the sign-in and the progress.
    // Where the site stands is the family's SiteStatus - not asked here (the app's initializer asks it): ready, but where a case says.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations(), provideSiteMigrations(), { provide: AuthService, useValue: auth }] });
    boot = TestBed.inject(BootService);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ProgressStore);
    TestBed.inject(SiteStatus).markReady();
  });

  afterEach(() => http.verify());

  it('an app that is not set up says so, and loads nothing', async () => {
    auth.failing = new NotSetUpError();
    await boot.start();
    expect(boot.status()).toBe('not-set-up');
    http.expectNone('/api/state');
  });

  it('signed in, it loads the progress and runs - repaired where it has to be', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/state').flush({
      progress: { 60: { midi: 60, status: 'mastered', repetitions: 6, intervalHours: 938, easeFactor: 2.5, updatedAt: '2026-09-09T14:08:49.446Z' } },
      sessions: [],
      path: { steps: {} },
      generation: 3,
    });
    await started;
    expect(boot.status()).toBe('ready');
    expect(store.loaded()).toBe(true);
    expect(store.progress()['60']).toMatchObject({ status: 'review', repetitions: 2 });
  });

  it('nobody signed in: no progress is asked for, and the status says so - the sign-in guard goes on from there', async () => {
    auth.person = null;
    await boot.start();
    expect(boot.status()).toBe('sign-in');
    http.expectNone('/api/state');
    // The start itself sends nobody anywhere: that is the routes' guard's (core/auth/sign-in.guard.ts).
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('a failed load stops the app: it never runs on empty progress', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = boot.start();
    await settle();
    http.expectOne('/api/state').flush({ error: 'boom', code: 'server_error' }, { status: 500, statusText: 'Server Error' });
    await started;
    expect(boot.status()).toBe('load-error');
    expect(store.loaded()).toBe(false);
    consoleError.mockRestore();
  });

  it('while an update waits the start signs in and stops there: nothing that would fail is asked for - for everybody', async () => {
    for (const who of ['a learner', 'nobody', 'a visitor'] as const) {
      TestBed.resetTestingModule();
      auth = standInAuth();
      auth.person = who === 'a learner' ? '7' : null;
      auth.required = who !== 'a visitor';
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations(), provideSiteMigrations(), { provide: AuthService, useValue: auth }] });
      TestBed.inject(SiteStatus).report('update_pending');
      boot = TestBed.inject(BootService);
      await boot.start();
      expect(auth.init, who).toHaveBeenCalledTimes(1);
      expect(boot.status(), who).toBe('waiting');
      expect(boot.onlyMigrations(), who).toBe(false);
      TestBed.inject(HttpTestingController).expectNone(() => true);
      // Nobody is sent to the IAM by the start - the status page has a Sign in of its own.
      expect(auth.signIn).not.toHaveBeenCalled();
    }
    http = TestBed.inject(HttpTestingController);
  });

  it('the database out of reach, or not set up after all: the start waits the same way', async () => {
    for (const code of ['unavailable', 'not_set_up']) {
      TestBed.resetTestingModule();
      auth = standInAuth();
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations(), provideSiteMigrations(), { provide: AuthService, useValue: auth }] });
      TestBed.inject(SiteStatus).report(code);
      boot = TestBed.inject(BootService);
      await boot.start();
      expect(boot.status(), code).toBe('waiting');
      TestBed.inject(HttpTestingController).expectNone('/api/state');
    }
    http = TestBed.inject(HttpTestingController);
  });

  it('an update that came after the site was asked: the progress\'s 503 says so - the start waits, and the site\'s status hears it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = boot.start();
    await settle();
    http.expectOne('/api/state').flush(UPDATE_PENDING, { status: 503, statusText: 'Service Unavailable', headers: { 'Retry-After': '60' } });
    await started;
    expect(boot.status()).toBe('waiting');
    expect(TestBed.inject(SiteStatus).state()).toBe('update-pending');
    expect(store.loaded()).toBe(false);
    // No error to anybody: the family's page says it.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('while an update waits an ADMIN has the Migrations page alone - and once it applied what was pending, the app starts where it stands', async () => {
    auth.admin = true;
    const site = TestBed.inject(SiteStatus);
    site.report('update_pending');
    await boot.start();
    expect([boot.status(), boot.onlyMigrations()]).toEqual(['waiting', true]);
    http.expectNone('/api/state');
    const reload = vi.spyOn(TestBed.inject(TranslationService), 'reload');

    // Still behind (another file came meanwhile): it waits on.
    let resumed = boot.resumeAfterUpdate();
    await settle();
    http.expectOne('/api/state').flush(UPDATE_PENDING, { status: 503, statusText: 'Service Unavailable' });
    await resumed;
    expect([boot.status(), boot.onlyMigrations()]).toEqual(['waiting', true]);
    expect(reload).not.toHaveBeenCalled();

    // Applied: the Migrations page says the site is ready, and the start goes on where it stopped.
    resumed = boot.resumeAfterUpdate();
    site.markReady();
    await settle();
    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 4 });
    await resumed;
    expect([boot.status(), boot.onlyMigrations()]).toEqual(['ready', false]);
    expect(store.loaded()).toBe(true);
    // The strings again: the ones in memory are from before the update.
    expect(reload).toHaveBeenCalledTimes(1);

    // Running: asks nothing.
    await boot.resumeAfterUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('while an update waits anybody but an ADMIN has the status page alone - the Migrations page is no way in for them', async () => {
    TestBed.inject(SiteStatus).report('update_pending');
    await boot.start();
    expect([boot.status(), boot.onlyMigrations()]).toEqual(['waiting', false]);
  });

  it('an API that cannot be reached is the error card', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.failing = new Error('offline');
    await boot.start();
    expect(boot.status()).toBe('load-error');
    consoleError.mockRestore();
  });

  it('before signing out: says whether anything would be lost, after one more try', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 3 });
    await started;

    expect(await boot.settleBeforeSignOut()).toBe(false);

    store.progressFailed.set(true);
    const asking = boot.settleBeforeSignOut();
    await settle();
    http.expectOne('/api/progress').flush({ error: 'down', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(await asking).toBe(true);

    boot.signOut();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('BootService: where the language comes into the start', () => {
  const order: string[] = [];
  let auth: ReturnType<typeof standInAuth>;
  let boot: BootService;
  let statusAtInit: string | null = null;

  beforeEach(() => {
    localStorage.clear();
    order.length = 0;
    statusAtInit = null;
    auth = standInAuth();
    auth.person = null;
    auth.init.mockImplementation(async () => {
      order.push('auth');
      if (auth.failing) throw auth.failing;
    });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations({}, { language: 'sk' }), provideSiteMigrations(), { provide: AuthService, useValue: auth }],
    });
    boot = TestBed.inject(BootService);
    TestBed.inject(SiteStatus).markReady();
    vi.spyOn(TestBed.inject(TranslationService), 'init').mockImplementation(async (request: boolean) => {
      order.push(`i18n:${request}`);
      statusAtInit = boot.status();
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  it('gets the strings once the sign-in settings are read, and before anybody is sent to sign in: the sign-in card has them', async () => {
    await boot.start();
    expect(order).toEqual(['auth', 'i18n:true']);
    // Nothing was drawn meanwhile: the card comes after the strings.
    expect(statusAtInit).toBe('loading');
    expect(boot.status()).toBe('sign-in');
  });

  it('asks for nothing when the app is not set up: only what the browser kept, before the status page is shown', async () => {
    auth.failing = new NotSetUpError();
    await boot.start();
    expect(order).toEqual(['auth', 'i18n:false']);
    expect(statusAtInit).toBe('loading');
    expect(boot.status()).toBe('not-set-up');
  });

  it('asks for nothing when the backend cannot be reached either', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.failing = new Error('offline');
    await boot.start();
    expect(order).toEqual(['auth', 'i18n:false']);
    expect(boot.status()).toBe('load-error');
    consoleError.mockRestore();
  });

  it('signs in with the language the app is read in, so the IAM’s pages open in the same one - and back to this address', async () => {
    await boot.signIn();
    expect(auth.signIn.mock.calls).toEqual([[undefined, 'sk']]);
  });

  it('while an update waits it still gets the sign-in and the strings - the status page has them - and the family\'s page signs in the same way', async () => {
    TestBed.inject(SiteStatus).report('update_pending');
    await boot.start();
    expect(order).toEqual(['auth', 'i18n:true']);
    expect(boot.status()).toBe('waiting');
    // The status page's "Sign in" is this one (core/state/site-migrations.ts): to the IAM in the page's language, back to this address.
    await TestBed.inject(ANOTOKI_MIGRATIONS_CONFIG).signIn();
    expect(auth.signIn.mock.calls).toEqual([[undefined, 'sk']]);
  });
});

describe('BootService with the real translation service', () => {
  let boot: BootService;
  let http: HttpTestingController;
  let i18n: TranslationService;
  let auth: ReturnType<typeof standInAuth>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['sk-SK', 'en']);
    auth = standInAuth();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideSiteMigrations(), { provide: AuthService, useValue: auth }] });
    boot = TestBed.inject(BootService);
    http = TestBed.inject(HttpTestingController);
    i18n = TestBed.inject(TranslationService);
    TestBed.inject(SiteStatus).markReady();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('asks for no strings when the sign-in settings cannot be read: the shell is worded from the English kept in code', async () => {
    auth.failing = new NotSetUpError();
    await boot.start();
    await settle();

    expect(boot.status()).toBe('not-set-up');
    http.expectNone(forStrings);
    http.expectNone('/api/state');
    expect(i18n.ready()).toBe(false);
    expect(i18n.t('title.learn')).toBe('Learn');
  });

  it('asks for no strings when the backend cannot be reached at all', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.failing = new Error('offline');
    await boot.start();
    await settle();

    expect(boot.status()).toBe('load-error');
    http.expectNone(forStrings);
    expect(i18n.ready()).toBe(false);
    consoleError.mockRestore();
  });

  it('goes on to the progress when the strings cannot be had: a bundle that fails is no bundle, not a stopped app', async () => {
    const started = boot.start();
    await settle();

    // The strings come first - and the progress is not asked for while they are out.
    http.expectNone('/api/state');
    http.expectOne('/api/translations/sk-sk').flush({ error: 'The database needs an update.', code: 'not_set_up' }, { status: 503, statusText: 'Service Unavailable' });
    // One more try a moment later, and no third.
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS + 50));
    http.expectNone('/api/state');
    http.expectOne('/api/translations/sk-sk').error(new ProgressEvent('error'));
    await settle();

    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 1 });
    await started;
    expect(boot.status()).toBe('ready');
    expect(i18n.ready()).toBe(false);
    expect(i18n.t('title.learn')).toBe('Learn');
  });

  it('starts with its strings when they come, in the language the browser asks for - and only then loads the progress', async () => {
    const started = boot.start();
    await settle();

    http.expectNone('/api/state');
    http.expectOne('/api/translations/sk-sk').flush({
      language: 'sk',
      languages: [
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
      ],
      values: { 'title.learn': 'Učenie' },
      english: { 'title.learn': 'Learn' },
    });
    await settle();
    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 1 });
    await started;

    expect(boot.status()).toBe('ready');
    expect(i18n.language()).toBe('sk');
    expect(i18n.t('title.learn')).toBe('Učenie');
  });

  it('started in place after an ADMIN applied what was pending, it asks for the strings it could not have while the database had none', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.admin = true;
    const site = TestBed.inject(SiteStatus);
    site.report('update_pending');
    // The words answer while an update waits - but a database without their tables (002 waiting) has none to give.
    const noWords = { error: 'The site is being updated. Try again in a few minutes.', code: 'update_pending' };
    const started = boot.start();
    await settle();
    http.expectOne('/api/translations/sk-sk').flush(noWords, { status: 503, statusText: 'Service Unavailable' });
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS + 50));
    http.expectOne('/api/translations/sk-sk').flush(noWords, { status: 503, statusText: 'Service Unavailable' });
    await started;
    http.expectNone('/api/state');
    expect([boot.status(), boot.onlyMigrations(), i18n.ready()]).toEqual(['waiting', true, false]);

    // The Migrations page applied it (and said the site is ready): the app starts where it stands - and its strings come.
    const resumed = boot.resumeAfterUpdate();
    site.markReady();
    await settle();
    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 2 });
    await resumed;
    await settle();
    http.expectOne('/api/translations/sk-sk').flush({
      language: 'sk',
      languages: [
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
      ],
      values: { 'title.learn': 'Učenie' },
      english: { 'title.learn': 'Learn' },
    });
    await settle();
    expect(boot.status()).toBe('ready');
    expect(i18n.ready()).toBe(true);
    expect(i18n.t('title.learn')).toBe('Učenie');
    consoleError.mockRestore();
  });

  it('signs in without naming a language while there are no strings: the kept English is nobody’s choice', async () => {
    await boot.signIn();
    expect(auth.signIn.mock.calls).toEqual([[undefined, undefined]]);
  });
});

describe('BootService: visitors, and the move at a sign-in', () => {
  const KEY = 'k'.repeat(43);
  const STATE = { progress: {}, sessions: [], path: { steps: {} } };
  const VISITOR_OUTBOX = 'piano-learning:unsaved-sessions:' + VISITOR_OWNER;
  const PERSON_OUTBOX = 'piano-learning:unsaved-sessions:7';
  const moved = (more: object = {}) => ({ found: true, notes: { moved: 2, kept: 0 }, steps: { moved: 1, merged: 0, kept: 0 }, sessions: 3, generation: 12, ...more });

  let boot: BootService;
  let http: HttpTestingController;
  let store: ProgressStore;
  let api: ApiService;
  let auth: ReturnType<typeof standInAuth>;

  /** Builds the app around the stand-in IAM, as it is when the page loads - its interceptors as app.config.ts has them, the site ready. */
  function start(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([siteStatusInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideTestTranslations(),
        provideSiteMigrations(),
        { provide: AuthService, useValue: auth },
      ],
    });
    boot = TestBed.inject(BootService);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ProgressStore);
    api = TestBed.inject(ApiService);
    TestBed.inject(SiteStatus).markReady();
  }

  beforeEach(() => {
    localStorage.clear();
    auth = standInAuth();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('nobody signed in, no sign-in required: a visitor', () => {
    beforeEach(() => {
      auth.person = null;
      auth.required = false;
      start();
    });

    it('with no key yet: nobody’s progress - empty, generation 0 - and the app runs, for a visitor', async () => {
      const started = boot.start();
      await settle();
      const asked = http.expectOne('/api/state');
      expect(asked.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
      expect(asked.request.headers.has('Authorization')).toBe(false);
      asked.flush({ ...STATE, generation: 0 });
      await started;
      expect([boot.status(), boot.visiting(), api.dataOwner(), store.loaded()]).toEqual(['ready', true, VISITOR_OWNER, true]);
      expect(auth.signIn).not.toHaveBeenCalled();

      // The first save names nobody's 0 - and makes the visitor.
      const saved = store.updateNote(60, (note) => note);
      await settle();
      const put = http.expectOne('/api/progress');
      expect(put.request.headers.get('Progress-Generation')).toBe('0');
      put.flush(null, { status: 204, statusText: 'No Content', headers: { [VISITOR_KEY_HEADER]: KEY, 'Progress-Generation': '31' } });
      await saved;
      expect(TestBed.inject(VisitorKey).current()).toBe(KEY);
    });

    it('with a key: the visitor’s own progress', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const started = boot.start();
      await settle();
      const asked = http.expectOne('/api/state');
      expect(asked.request.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
      asked.flush({ ...STATE, generation: 31 });
      await started;
      expect(boot.status()).toBe('ready');
    });

    it('a key the server no longer knows is forgotten - lost, said once - and the visitor starts again as nobody', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const started = boot.start();
      await settle();
      http.expectOne('/api/state').flush({ error: 'gone', code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      const again = http.expectOne('/api/state');
      expect(again.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
      again.flush({ ...STATE, generation: 0 });
      await started;
      expect(boot.status()).toBe('ready');
      expect(TestBed.inject(VisitorKey).lost()).toBe(true);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    });

    it('a sign-in required meanwhile (the API said so): the sign-in status - and the key is KEPT for the move', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const started = boot.start();
      await settle();
      http.expectOne('/api/state').flush({ error: 'Sign in.', code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized' });
      await started;
      expect([boot.status(), boot.visiting(), auth.loginRequired()]).toEqual(['sign-in', false, true]);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
    });

    it('a sign-in that came back refused leaves a visitor a visitor (the page says why)', async () => {
      const started = boot.start();
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 0 });
      await started;
      expect(boot.status()).toBe('ready');
    });

    it('signing in from a visitor’s page waits for the saves on their way first, as signing out does', async () => {
      const started = boot.start();
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 0 });
      await started;
      const settling = vi.spyOn(store, 'settle').mockResolvedValue();
      await boot.signIn();
      expect(settling).toHaveBeenCalledTimes(1);
      expect(settling.mock.invocationCallOrder[0]).toBeLessThan(auth.signIn.mock.invocationCallOrder[0]);
    });
  });

  it('a sign-in required from the start: the sign-in status, nothing asked for - and a key held is left alone', async () => {
    auth.person = null;
    start();
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    await boot.start();
    expect([boot.status(), boot.visiting()]).toEqual(['sign-in', false]);
    http.expectNone('/api/state');
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
  });

  describe('signed in, with a visitor key held', () => {
    beforeEach(() => {
      start();
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    });

    /** The move's request, once it is out. */
    async function theMove() {
      // Twice: a move asked again waits out its Retry-After (a timer) first.
      await settle();
      await settle();
      const move = http.expectOne('/api/visitor/move');
      http.expectNone('/api/state');
      return move;
    }

    it('moves what the visitor kept first - the token and the key in one request - then loads the person’s progress, which holds it', async () => {
      const started = boot.start();
      const move = await theMove();
      expect(move.request.method).toBe('POST');
      expect(move.request.headers.get('Authorization')).toBe('Bearer token-7');
      expect(move.request.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
      move.flush(moved({ notes: { moved: 2, kept: 1 } }));
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
      await started;

      expect(boot.status()).toBe('ready');
      expect(boot.visitorMoved()).toEqual({ kept: true });
      expect(boot.visitorNotMoved()).toBe(false);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    });

    it('says nothing when another tab moved it already (found: false) - and forgets the key all the same', async () => {
      const started = boot.start();
      (await theMove()).flush({ found: false, notes: { moved: 0, kept: 0 }, steps: { moved: 0, merged: 0, kept: 0 }, sessions: 0, generation: null });
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
      await started;
      expect([boot.visitorMoved(), boot.visitorNotMoved()]).toEqual([null, false]);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    });

    it('a move held up for a moment (503 visitor_move_retry) is asked once more after its Retry-After', async () => {
      const started = boot.start();
      (await theMove()).flush({ error: 'busy', code: 'visitor_move_retry' }, { status: 503, statusText: 'Unavailable', headers: { 'Retry-After': '0' } });
      (await theMove()).flush(moved());
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
      await started;
      expect(boot.visitorMoved()).toEqual({ kept: false });
    });

    it('a move that does not happen keeps the key - out of sight, never lost - says so, and the app runs on the person’s progress', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const started = boot.start();
      (await theMove()).flush({ error: 'busy', code: 'visitor_move_retry' }, { status: 503, statusText: 'Unavailable', headers: { 'Retry-After': '0' } });
      (await theMove()).flush({ error: 'busy', code: 'visitor_move_retry' }, { status: 503, statusText: 'Unavailable', headers: { 'Retry-After': '0' } });
      await settle();
      http.expectNone('/api/visitor/move');
      http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
      await started;
      expect([boot.status(), boot.visitorMoved(), boot.visitorNotMoved()]).toEqual(['ready', null, true]);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
      expect(consoleError).toHaveBeenCalled();
    });

    it('a server error or no answer at all: the same, without waiting', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const started = boot.start();
      (await theMove()).error(new ProgressEvent('error'));
      await settle();
      http.expectNone('/api/visitor/move');
      http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
      await started;
      expect(boot.visitorNotMoved()).toBe(true);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
    });

    it('a key that is no key (422) is forgotten: nothing to move, now or later', async () => {
      const started = boot.start();
      (await theMove()).flush({ error: 'bad key', code: 'invalid', field: 'visitor_key' }, { status: 422, statusText: 'Unprocessable Content' });
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
      await started;
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
      expect(boot.visitorNotMoved()).toBe(false);
    });

    it('while an update waits the move waits with everything else: not asked for, the key kept, nothing said', async () => {
      TestBed.inject(SiteStatus).report('update_pending');
      await boot.start();
      await settle();
      http.expectNone('/api/visitor/move');
      http.expectNone('/api/state');
      expect([boot.status(), boot.visitorMoved(), boot.visitorNotMoved()]).toEqual(['waiting', null, false]);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
    });

    it('an update that came after the site was asked: the move\'s 503 is no failure to word - the key kept, the start waits', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const started = boot.start();
      (await theMove()).flush(UPDATE_PENDING, { status: 503, statusText: 'Service Unavailable', headers: { 'Retry-After': '60' } });
      await settle();
      http.expectNone('/api/visitor/move');
      http.expectOne('/api/state').flush(UPDATE_PENDING, { status: 503, statusText: 'Service Unavailable', headers: { 'Retry-After': '60' } });
      await started;
      expect([boot.status(), boot.visitorMoved(), boot.visitorNotMoved()]).toEqual(['waiting', null, false]);
      expect(TestBed.inject(SiteStatus).state()).toBe('update-pending');
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('signed in again in the middle of practising (another tab visited meanwhile): moved then, and the progress loaded again', async () => {
      localStorage.removeItem(VISITOR_STORAGE_KEY);
      const started = boot.start();
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
      await started;

      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      for (const listener of auth.listeners) listener();
      (await theMove()).flush(moved());
      await settle();
      http.expectOne('/api/state').flush({ ...STATE, generation: 13 });
      await settle();
      expect(boot.visitorMoved()).toEqual({ kept: false });
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    });
  });

  it('every signed-in start takes on the rounds a visitor of this browser left in its outbox - keys and all - whoever moved the rest', async () => {
    start();
    const waiting = { key: 'round-1', session: { mode: 'trainer', attempts: 3, correct: 3, accuracy: 100 }, queuedAt: '2026-10-05T08:00:00.000Z' };
    localStorage.setItem(VISITOR_OUTBOX, JSON.stringify([waiting]));
    const started = boot.start();
    await settle();
    // No key held: no move - only the outbox.
    http.expectNone('/api/visitor/move');
    http.expectOne('/api/state').flush({ ...STATE, generation: 12 });
    await started;
    await settle();

    const round = http.expectOne('/api/sessions');
    expect(round.request.headers.get('Idempotency-Key')).toBe('round-1');
    expect(round.request.headers.get('Authorization')).toBe('Bearer token-7');
    expect(localStorage.getItem(VISITOR_OUTBOX)).toBeNull();
    expect(JSON.parse(localStorage.getItem(PERSON_OUTBOX)!)).toEqual([waiting]);
    round.flush({ id: '1-a', recordedAt: '2026-10-05T08:00:00.000Z', mode: 'trainer', attempts: 3, correct: 3, accuracy: 100 }, { status: 200, statusText: 'OK' });
    await settle();
    expect(localStorage.getItem(PERSON_OUTBOX)).toBeNull();
  });
});
