import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentInjector, ErrorHandler, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VISITOR_KEY_HEADER, anotokiAuthInterceptor } from '@anotoki/lib/auth';
import { ANOTOKI_ERROR_REPORT, AnotokiErrorReporter } from '@anotoki/lib/error-report';
import { appConfig } from '../app.config';
import { VISITOR_STORAGE_KEY, VisitorKey } from './auth/visitor-key';
import { ERROR_REPORT_ENDPOINT, provideSiteErrorReport } from './error-report';
import { TestAuth, provideTestAuth, provideTestAuthInterceptor } from './testing/test-auth';

/** Lets the reporter's timer and the interceptor's token run until the report has gone out. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI3In0.c2lnbmF0dXJlLW9mLXRoZS10b2tlbg';

describe('the browser’s errors into the error log (the family’s reporter, as app.config.ts wires it)', () => {
  let auth: TestAuth;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    auth = new TestAuth();
    TestBed.configureTestingModule({
      providers: [
        // The app's HttpClient and the family's interceptor (app.config.ts): the report is a request like any other.
        provideHttpClient(withInterceptors([anotokiAuthInterceptor])),
        provideHttpClientTesting(),
        ...provideTestAuth(auth),
        ...provideTestAuthInterceptor(),
        provideSiteErrorReport(),
      ],
    });
    auth.store = TestBed.inject(VisitorKey);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('is the app’s ErrorHandler, posting to the backend’s route - app.config.ts gives it', () => {
    expect(TestBed.inject(ErrorHandler)).toBeInstanceOf(AnotokiErrorReporter);
    expect(ERROR_REPORT_ENDPOINT).toBe('/api/client-errors');
    // The app's own providers, without starting the app (no initializer runs in an injector of its own) - asked of
    // them alone, never of this spec's around them.
    const app = createEnvironmentInjector(appConfig.providers, TestBed.inject(EnvironmentInjector));
    try {
      expect(app.get(ErrorHandler, null, { self: true })).toBeInstanceOf(AnotokiErrorReporter);
    } finally {
      app.destroy();
    }
  });

  it('sends a signed-in person’s error with their token - scrubbed, marked as a report - and still says it in the console', async () => {
    auth.signInAs({ sub: '7' });
    TestBed.inject(ErrorHandler).handleError(new TypeError(`Cannot read properties of undefined (reading 'notes') token=${JWT} for mia@example.com`));
    await settle();

    const report = http.expectOne(ERROR_REPORT_ENDPOINT);
    expect(report.request.method).toBe('POST');
    expect(report.request.headers.get('Authorization')).toBe('Bearer token-7');
    expect(report.request.context.get(ANOTOKI_ERROR_REPORT)).toBe(true);
    expect(report.request.body.type).toBe('TypeError');
    expect(report.request.body.message).toMatch(/^Cannot read properties of undefined \(reading 'notes'\)/);
    expect(JSON.stringify(report.request.body)).not.toMatch(/eyJhbGci|mia@example\.com/);
    expect(console.error).toHaveBeenCalled();
    report.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('sends a visitor’s bare - never their key, which only the progress routes carry', async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, 'k'.repeat(43));
    auth.visiting();
    TestBed.inject(ErrorHandler).handleError(new Error('A visitor’s page failed.'));
    await settle();

    const report = http.expectOne(ERROR_REPORT_ENDPOINT);
    expect(report.request.headers.has('Authorization')).toBe(false);
    expect(report.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
    report.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('never sends a failed request’s error (the server writes its own), nor the same error twice', async () => {
    auth.signInAs({ sub: '7' });
    const handler = TestBed.inject(ErrorHandler);
    handler.handleError(new HttpErrorResponse({ status: 500, url: '/api/state' }));
    await settle();
    http.expectNone(ERROR_REPORT_ENDPOINT);

    const error = new Error('Once is enough.');
    handler.handleError(error);
    handler.handleError(error);
    await settle();
    http.expectOne(ERROR_REPORT_ENDPOINT).flush(null, { status: 204, statusText: 'No Content' });
  });
});
