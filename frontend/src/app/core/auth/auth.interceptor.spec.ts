import { HttpClient, HttpContext, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService, CARRIES_VISITOR_KEY, Caller, ISSUED_AS } from '../api/api.service';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { VISITOR_KEY_HEADER, VISITOR_STORAGE_KEY, VisitorKey } from './visitor-key';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const KEY = 'k'.repeat(43);
const OTHER_KEY = 'o'.repeat(43);
const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };

const as = (caller: Caller): { context: HttpContext } => ({ context: new HttpContext().set(ISSUED_AS, caller) });

describe('authInterceptor', () => {
  const signedIn = signal(true);
  const loginRequired = signal(true);
  const auth = {
    signedIn: () => signedIn(),
    loginRequired: () => loginRequired(),
    userKey: () => (signedIn() ? '5' : null),
    requireSignInNow: vi.fn(() => loginRequired.set(true)),
    accessToken: vi.fn(() => Promise.resolve<string | null>('token-1')),
    refreshToken: vi.fn(() => Promise.resolve<string | null>('token-2')),
  };
  let http: HttpClient;
  let server: HttpTestingController;
  let visitor: VisitorKey;

  beforeEach(() => {
    localStorage.clear();
    signedIn.set(true);
    loginRequired.set(true);
    auth.requireSignInNow.mockClear();
    auth.accessToken.mockReset().mockResolvedValue('token-1');
    auth.refreshToken.mockClear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: AuthService, useValue: auth }],
    });
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
    visitor = TestBed.inject(VisitorKey);
  });

  afterEach(() => {
    server.verify();
    localStorage.clear();
  });

  it('puts the token on the admin panel’s calls and a person’s own file, as on every other call of the API', async () => {
    http.get('/api/admin/translations/sk/export', as('person')).subscribe();
    http.get('/api/me/export', as('person')).subscribe();
    // One ApiService did not issue: a person's while somebody is signed in.
    http.get('/api/state').subscribe();
    await settle();

    expect(server.expectOne('/api/admin/translations/sk/export').request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(server.expectOne('/api/me/export').request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(server.expectOne('/api/state').request.headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('lets the app’s strings through untouched: no token, no key, and no waiting for either', () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    loginRequired.set(false);
    http.get('/api/translations/sk').subscribe();

    // At once: nothing was awaited - the strings are asked for before anybody is signed in.
    const request = server.expectOne('/api/translations/sk');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
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

  it('leaves where the site stands alone: asked before anybody is signed in - no token, no visitor\'s key, no waiting', () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    loginRequired.set(false);
    http.get('/api/site-status').subscribe();

    const request = server.expectOne('/api/site-status');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
    expect(auth.accessToken).not.toHaveBeenCalled();
    request.flush({ state: 'ready', installed: false });
  });

  it('tries once more with a fresh token after a 401', async () => {
    let answer: unknown = null;
    http.get('/api/admin/languages', as('person')).subscribe((body) => (answer = body));
    await settle();
    server.expectOne('/api/admin/languages').flush({ error: 'expired', code: 'invalid_token' }, UNAUTHORIZED);
    await settle();

    const again = server.expectOne('/api/admin/languages');
    expect(again.request.headers.get('Authorization')).toBe('Bearer token-2');
    again.flush({ languages: [] });
    expect(answer).toEqual({ languages: [] });
  });

  describe('a person’s request', () => {
    it('with no token to send (the refresh failed) is never sent: a 401 sign_in_required here - never a visitor’s, whatever the switch says', async () => {
      loginRequired.set(false);
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      auth.accessToken.mockResolvedValue(null);
      let failure: unknown = null;
      http.put('/api/progress', {}, as('person')).subscribe({ error: (error: unknown) => (failure = error) });
      http.post('/api/sessions', {}, as('person')).subscribe({ error: () => undefined });
      await settle();

      server.expectNone('/api/progress');
      server.expectNone('/api/sessions');
      expect(failure).toBeInstanceOf(HttpErrorResponse);
      expect(failure).toMatchObject({ status: 401, error: { code: 'sign_in_required' } });
      expect(auth.refreshToken).not.toHaveBeenCalled();
      expect(auth.requireSignInNow).not.toHaveBeenCalled();
      expect(visitor.current()).toBe(KEY);
    });

    it('stays a person’s when the sign-in ended between issuing and sending: decided as it was issued, not as it leaves', async () => {
      loginRequired.set(false);
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      http.put('/api/progress', {}, as('person')).subscribe({ error: () => undefined });
      signedIn.set(false);
      await settle();

      const sent = server.expectOne('/api/progress').request;
      expect(sent.headers.get('Authorization')).toBe('Bearer token-1');
      expect(sent.headers.has(VISITOR_KEY_HEADER)).toBe(false);
    });

    it('never carries the visitor key - even one set on it - and never keeps a key its answer names', async () => {
      loginRequired.set(false);
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      http.put('/api/progress', {}, { ...as('person'), headers: { [VISITOR_KEY_HEADER]: KEY } }).subscribe();
      await settle();
      const sent = server.expectOne('/api/progress');
      expect(sent.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);

      localStorage.clear();
      sent.flush(null, { status: 204, statusText: 'No Content', headers: { [VISITOR_KEY_HEADER]: OTHER_KEY } });
      expect(visitor.current()).toBeNull();
    });

    it('but the move after a sign-in: the token and the key it set itself, in one request', async () => {
      http.post('/api/visitor/move', null, { context: new HttpContext().set(ISSUED_AS, 'person').set(CARRIES_VISITOR_KEY, true), headers: { [VISITOR_KEY_HEADER]: KEY } }).subscribe();
      await settle();
      const sent = server.expectOne('/api/visitor/move').request;
      expect(sent.headers.get('Authorization')).toBe('Bearer token-1');
      expect(sent.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
    });
  });

  describe('a visitor’s request, while no sign-in is required', () => {
    beforeEach(() => {
      signedIn.set(false);
      loginRequired.set(false);
    });

    it('carries the key this browser holds now - never a token, not even one there is', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      signedIn.set(true);
      http.get('/api/state', as('visitor')).subscribe();
      await settle();
      const sent = server.expectOne('/api/state').request;
      expect(sent.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
      expect(sent.headers.has('Authorization')).toBe(false);
      expect(auth.accessToken).not.toHaveBeenCalled();
    });

    it('keeps the key the answer that made the visitor brings - and the first key stays', async () => {
      http.put('/api/progress', {}, as('visitor')).subscribe();
      await settle();
      const first = server.expectOne('/api/progress');
      expect(first.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
      first.flush(null, { status: 204, statusText: 'No Content', headers: { [VISITOR_KEY_HEADER]: KEY } });
      expect(visitor.current()).toBe(KEY);

      // Another tab's maker, sent before this key was stored, answers later with a key of its own.
      localStorage.removeItem(VISITOR_STORAGE_KEY);
      http.post('/api/sessions', {}, as('visitor')).subscribe();
      await settle();
      const late = server.expectOne('/api/sessions');
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      late.flush({}, { status: 201, statusText: 'Created', headers: { [VISITOR_KEY_HEADER]: OTHER_KEY } });
      expect(visitor.current()).toBe(KEY);
    });

    it('forgets the key the server no longer knows (401 visitor_unknown) - only while it is still the one held', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      http.get('/api/state', as('visitor')).subscribe({ error: () => undefined });
      await settle();
      server.expectOne('/api/state').flush({ error: 'gone', code: 'visitor_unknown' }, UNAUTHORIZED);
      expect(visitor.current()).toBeNull();
      expect(visitor.lost()).toBe(true);

      // Sent with KEY, refused - while another tab stored a new key meanwhile: that one stays.
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      http.get('/api/state', as('visitor')).subscribe({ error: () => undefined });
      await settle();
      const refused = server.expectOne('/api/state');
      localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
      refused.flush({ error: 'gone', code: 'visitor_unknown' }, UNAUTHORIZED);
      expect(visitor.current()).toBe(OTHER_KEY);
    });

    it('KEEPS the key when the API says a sign-in is required now - and the app knows it from then on', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      http.put('/api/path', {}, as('visitor')).subscribe({ error: () => undefined });
      await settle();
      server.expectOne('/api/path').flush({ error: 'Sign in.', code: 'sign_in_required' }, UNAUTHORIZED);
      expect(auth.requireSignInNow).toHaveBeenCalledTimes(1);
      expect(visitor.current()).toBe(KEY);
      expect(visitor.lost()).toBe(false);
    });

    it('stays a visitor’s when somebody signed in between issuing and sending', async () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      http.put('/api/progress', {}, as('visitor')).subscribe();
      signedIn.set(true);
      await settle();
      const sent = server.expectOne('/api/progress').request;
      expect(sent.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
      expect(sent.headers.has('Authorization')).toBe(false);
    });
  });

  it('a visitor’s request while a sign-in is required carries neither key nor token, and leaves the key where it is', async () => {
    signedIn.set(false);
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    http.get('/api/state', as('visitor')).subscribe({ error: () => undefined });
    await settle();
    const sent = server.expectOne('/api/state');
    expect(sent.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
    expect(sent.request.headers.has('Authorization')).toBe(false);
    sent.flush({ error: 'Sign in.', code: 'sign_in_required' }, UNAUTHORIZED);
    expect(visitor.current()).toBe(KEY);
  });

  describe('through ApiService: who a call is for comes from the page, as it is issued', () => {
    let api: ApiService;

    beforeEach(() => {
      api = TestBed.inject(ApiService);
    });

    it('a person’s save and round whose token cannot be renewed send nothing, carry no key, make no visitor - and the round waits in the outbox', async () => {
      loginRequired.set(false);
      api.setDataOwner('5');
      const loading = api.fetchState();
      await settle();
      server.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 3 });
      await loading;

      // The refresh failed: the SDK has no token to give.
      auth.accessToken.mockResolvedValue(null);
      const saved = api.saveProgress({}).catch((error: unknown) => error);
      const round = api.recordSession({ mode: 'trainer', attempts: 1, correct: 1, accuracy: 100 }).catch((error: unknown) => error);
      await settle();

      server.expectNone('/api/progress');
      server.expectNone('/api/sessions');
      expect(await saved).toMatchObject({ status: 401, code: 'sign_in_required' });
      expect(await round).toMatchObject({ status: 401, code: 'sign_in_required' });
      expect(api.unsavedSessions()).toBe(1);
      expect(visitor.current()).toBeNull();
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    });

    it('a person’s page signed out meanwhile sends nothing at all, whatever the switch says (401, never a visitor’s)', async () => {
      loginRequired.set(false);
      api.setDataOwner('5');
      signedIn.set(false);
      await expect(api.saveProgress({})).rejects.toMatchObject({ status: 401, code: 'sign_in_required', wrongUser: false });
      await expect(api.fetchState()).rejects.toMatchObject({ status: 401 });
      await settle();
      server.expectNone('/api/progress');
      server.expectNone('/api/state');
      expect(auth.accessToken).not.toHaveBeenCalled();
    });
  });
});
