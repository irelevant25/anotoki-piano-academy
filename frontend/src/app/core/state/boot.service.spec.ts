import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BootService } from './boot.service';
import { ProgressStore } from './progress-store.service';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('BootService', () => {
  let boot: BootService;
  let http: HttpTestingController;
  let store: ProgressStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
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
