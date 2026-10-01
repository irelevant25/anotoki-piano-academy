import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('authInterceptor', () => {
  let usesSignIn = true;
  const auth = {
    usesSignIn: () => usesSignIn,
    accessToken: vi.fn(() => Promise.resolve<string | null>('token-1')),
    refreshToken: vi.fn(() => Promise.resolve<string | null>('token-2')),
  };
  let http: HttpClient;
  let server: HttpTestingController;

  beforeEach(() => {
    usesSignIn = true;
    auth.accessToken.mockClear();
    auth.refreshToken.mockClear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: AuthService, useValue: auth }],
    });
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
  });

  afterEach(() => server.verify());

  it('puts the token on the owner’s translation calls, as on every other call of the API', async () => {
    http.get('/api/owner/translations/sk/export').subscribe();
    http.get('/api/state').subscribe();
    await settle();

    expect(server.expectOne('/api/owner/translations/sk/export').request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(server.expectOne('/api/state').request.headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('lets the app’s strings through untouched: no token, and no waiting for one', () => {
    http.get('/api/translations/sk').subscribe();

    // At once: nothing was awaited - the strings are asked for before anybody is signed in.
    const request = server.expectOne('/api/translations/sk');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(auth.accessToken).not.toHaveBeenCalled();
    request.flush({});
  });

  it('leaves the sign-in settings alone too, and everything that is not the API', () => {
    http.get('/api/auth/config').subscribe();
    http.get('/changelog.json').subscribe();

    expect(server.expectOne('/api/auth/config').request.headers.has('Authorization')).toBe(false);
    expect(server.expectOne('/changelog.json').request.headers.has('Authorization')).toBe(false);
    expect(auth.accessToken).not.toHaveBeenCalled();
  });

  it('adds nothing without sign-in - on the owner’s own computer the owner calls carry no token either', () => {
    usesSignIn = false;
    http.get('/api/owner/translations').subscribe();

    expect(server.expectOne('/api/owner/translations').request.headers.has('Authorization')).toBe(false);
    expect(auth.accessToken).not.toHaveBeenCalled();
  });

  it('tries once more with a fresh token after a 401', async () => {
    let answer: unknown = null;
    http.get('/api/owner/languages').subscribe((body) => (answer = body));
    await settle();
    server.expectOne('/api/owner/languages').flush({ error: 'expired', code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
    await settle();

    const again = server.expectOne('/api/owner/languages');
    expect(again.request.headers.get('Authorization')).toBe('Bearer token-2');
    again.flush({ languages: [] });
    expect(answer).toEqual({ languages: [] });
  });
});
