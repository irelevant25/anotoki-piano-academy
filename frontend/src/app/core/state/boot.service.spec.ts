import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService, NotSetUpError } from '../auth/auth.service';
import { RETRY_WAIT_MS, TranslationService } from '../i18n/translation.service';
import { provideTestTranslations } from '../testing/test-translations';
import { BootService } from './boot.service';
import { ProgressStore } from './progress-store.service';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Any request for the app's strings. */
const forStrings = (request: { url: string }): boolean => request.url.startsWith('/api/translations/');

describe('BootService', () => {
  let boot: BootService;
  let http: HttpTestingController;
  let store: ProgressStore;

  beforeEach(() => {
    localStorage.clear();
    // The strings are there already and cost no request (the stand-in): these cases are about the sign-in and the progress.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations()] });
    boot = TestBed.inject(BootService);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ProgressStore);
  });

  afterEach(() => http.verify());

  it('an app that is not set up says so, and loads nothing', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').flush(
      { error: 'Piano Academy is not set up yet.', code: 'not_set_up', setup: '/setup.php', detail: 'config/database.local.php is missing.' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await started;
    expect(boot.status()).toBe('not-set-up');
    expect(boot.notSetUpDetail()).toBe('config/database.local.php is missing.');
    http.expectNone('/api/state');
  });

  it('without sign-in it loads the progress and runs - repaired where it has to be', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').flush({ mode: 'none' });
    await settle();
    http.expectOne('/api/state').flush({
      progress: { 60: { midi: 60, status: 'mastered', repetitions: 6, intervalHours: 938, easeFactor: 2.5, updatedAt: '2026-09-09T14:08:49.446Z' } },
      sessions: [],
      path: { steps: {} },
    });
    await started;
    expect(boot.status()).toBe('ready');
    expect(store.loaded()).toBe(true);
    expect(store.progress()['60']).toMatchObject({ status: 'review', repetitions: 2 });
  });

  it('a failed load stops the app: it never runs on empty progress', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').flush({ mode: 'none' });
    await settle();
    http.expectOne('/api/state').flush({ error: 'boom', code: 'server_error' }, { status: 500, statusText: 'Server Error' });
    await started;
    expect(boot.status()).toBe('load-error');
    expect(store.loaded()).toBe(false);
    consoleError.mockRestore();
  });

  it('a database behind the code sends the learner to the setup page too', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').flush({ mode: 'none' });
    await settle();
    http.expectOne('/api/state').flush({ error: 'The database needs an update.', code: 'not_set_up' }, { status: 503, statusText: 'Unavailable' });
    await started;
    expect(boot.status()).toBe('not-set-up');
  });

  it('an API that cannot be reached is the error card', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').error(new ProgressEvent('error'));
    await started;
    expect(boot.status()).toBe('load-error');
    consoleError.mockRestore();
  });
});

describe('BootService: where the language comes into the start', () => {
  const order: string[] = [];
  /** What the sign-in settings answer: nothing (they were read), or the error they fail with. */
  let failing: unknown = null;
  let signedIn = false;
  const auth = {
    init: vi.fn(async () => {
      order.push('auth');
      if (failing) throw failing;
    }),
    signedIn: () => signedIn,
    usesSignIn: () => true,
    userKey: () => (signedIn ? '7' : null),
    user: () => null,
    onAuthChange: () => () => undefined,
    signIn: vi.fn(),
  };
  let boot: BootService;
  let statusAtInit: string | null = null;

  beforeEach(() => {
    localStorage.clear();
    order.length = 0;
    failing = null;
    signedIn = false;
    statusAtInit = null;
    auth.init.mockClear();
    auth.signIn.mockClear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations({}, { language: 'sk' }), { provide: AuthService, useValue: auth }],
    });
    boot = TestBed.inject(BootService);
    vi.spyOn(TestBed.inject(TranslationService), 'init').mockImplementation(async (request: boolean) => {
      order.push(`i18n:${request}`);
      statusAtInit = boot.status();
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  it('gets the strings once the sign-in settings are read, and before anybody is asked to sign in: the sign-in card has them', async () => {
    await boot.start();
    expect(order).toEqual(['auth', 'i18n:true']);
    // Nothing was drawn meanwhile: the card comes after the strings.
    expect(statusAtInit).toBe('loading');
    expect(boot.status()).toBe('sign-in');
  });

  it('asks for nothing when the app is not set up: only what the browser kept, before the card is shown', async () => {
    failing = new NotSetUpError('config/auth.local.php is missing.');
    await boot.start();
    expect(order).toEqual(['auth', 'i18n:false']);
    expect(statusAtInit).toBe('loading');
    expect(boot.status()).toBe('not-set-up');
  });

  it('asks for nothing when the backend cannot be reached either', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    failing = new Error('offline');
    await boot.start();
    expect(order).toEqual(['auth', 'i18n:false']);
    expect(boot.status()).toBe('load-error');
    consoleError.mockRestore();
  });

  it('signs in with the language the app is read in, so the IAM’s pages open in the same one', () => {
    boot.signIn();
    expect(auth.signIn.mock.calls).toEqual([['sk']]);
  });
});

describe('BootService with the real translation service', () => {
  let boot: BootService;
  let http: HttpTestingController;
  let i18n: TranslationService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['sk-SK', 'en']);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    boot = TestBed.inject(BootService);
    http = TestBed.inject(HttpTestingController);
    i18n = TestBed.inject(TranslationService);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('asks for no strings when the sign-in settings cannot be read: the shell is worded from the English kept in code', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').flush({ error: 'Piano Academy is not set up yet.', code: 'not_set_up', setup: '/setup.php' }, { status: 503, statusText: 'Service Unavailable' });
    await started;
    await settle();

    expect(boot.status()).toBe('not-set-up');
    http.expectNone(forStrings);
    http.expectNone('/api/state');
    expect(i18n.ready()).toBe(false);
    expect(i18n.t('title.learn')).toBe('Learn');
  });

  it('asks for no strings when the backend cannot be reached at all', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').error(new ProgressEvent('error'));
    await started;
    await settle();

    expect(boot.status()).toBe('load-error');
    http.expectNone(forStrings);
    expect(i18n.ready()).toBe(false);
    consoleError.mockRestore();
  });

  it('goes on to the progress when the strings cannot be had: a bundle that fails is no bundle, not a stopped app', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').flush({ mode: 'none' });
    await settle();

    // The strings come first - and the progress is not asked for while they are out.
    http.expectNone('/api/state');
    http.expectOne('/api/translations/sk-sk').flush({ error: 'The database needs an update.', code: 'not_set_up' }, { status: 503, statusText: 'Service Unavailable' });
    // One more try a moment later, and no third.
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS + 50));
    http.expectNone('/api/state');
    http.expectOne('/api/translations/sk-sk').error(new ProgressEvent('error'));
    await settle();

    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} } });
    await started;
    expect(boot.status()).toBe('ready');
    expect(i18n.ready()).toBe(false);
    expect(i18n.t('title.learn')).toBe('Learn');
  });

  it('starts with its strings when they come, in the language the browser asks for - and only then loads the progress', async () => {
    const started = boot.start();
    await settle();
    http.expectOne('/api/auth/config').flush({ mode: 'none' });
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
    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} } });
    await started;

    expect(boot.status()).toBe('ready');
    expect(i18n.language()).toBe('sk');
    expect(i18n.t('title.learn')).toBe('Učenie');
  });

  it('signs in without naming a language while there are no strings: the kept English is nobody’s choice', async () => {
    const signIn = vi.spyOn(TestBed.inject(AuthService), 'signIn').mockImplementation(() => undefined);
    boot.signIn();
    expect(signIn.mock.calls).toEqual([[undefined]]);
  });
});
