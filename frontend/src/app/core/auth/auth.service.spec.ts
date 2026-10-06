import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signInFailureKey, signInFailureParams } from '../i18n/error-text';
import { type AnotokiUser } from './anotoki-auth';
import { AuthService } from './auth.service';

describe('AuthService.loginRequired: whether the IAM requires a sign-in here, as the backend relays it', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The settings answered with `loginRequired` as given - and no IAM to go on to (the SDK refuses an empty issuer: the switch is read before). */
  async function settings(loginRequired?: unknown): Promise<boolean> {
    const reading = auth.init().catch(() => undefined);
    http.expectOne('/api/auth/config').flush(loginRequired === undefined ? { issuer: '', clientId: '' } : { issuer: '', clientId: '', loginRequired });
    await reading;
    return auth.loginRequired();
  }

  it('is required before the settings are read', () => {
    expect(auth.loginRequired()).toBe(true);
  });

  it('lets visitors in only on an explicit false', async () => {
    expect(await settings(false)).toBe(false);
  });

  it('requires a sign-in for anything else: true, missing (an older backend), a text, a number', async () => {
    for (const given of [true, undefined, 'false', 0, null]) {
      expect(await settings(given)).toBe(true);
    }
  });

  it('requires one from the moment the API refused a visitor for it, for the rest of the page load', async () => {
    expect(await settings(false)).toBe(false);
    auth.requireSignInNow();
    expect(auth.loginRequired()).toBe(true);
  });
});

describe('a sign-in that came back without one: signInFailureKey() and signInFailureParams()', () => {
  it('has one sentence for access_denied, true whoever ended it - the IAM turning the account away, or the person going back', () => {
    expect(signInFailureKey('access_denied')).toBe('signIn.notCompleted');
  });

  it('asks to try again after anything else, with the code', () => {
    expect(signInFailureKey('state_mismatch')).toBe('signIn.failed');
    expect(signInFailureParams('state_mismatch')).toEqual({ code: 'state_mismatch' });
    expect(signInFailureKey('invalid_grant')).toBe('signIn.failed');
    expect(signInFailureParams('invalid_grant')).toEqual({ code: 'invalid_grant' });
    expect(signInFailureParams('http_503')).toEqual({ code: 'http_503' });
  });

  it('has one sentence for a sign-in that could not start: the browser refused the site its storage', () => {
    expect(signInFailureKey('storage_unavailable')).toBe('signIn.storageUnavailable');
  });

  it('never makes a key from the code itself', () => {
    expect(signInFailureKey('')).toBe('signIn.failed');
    expect(signInFailureKey('constructor')).toBe('signIn.failed');
    expect(signInFailureKey('signIn.notCompleted')).toBe('signIn.failed');
  });

  it('shows the code only when it looks like one - never a sentence of the IAM or the SDK: it came through the address', () => {
    expect(signInFailureParams('This account cannot use Piano Academy')).toEqual({ code: 'unknown' });
    expect(signInFailureParams('Your account is locked. Call 0900 123 456')).toEqual({ code: 'unknown' });
    expect(signInFailureParams('<b>x</b>')).toEqual({ code: 'unknown' });
    expect(signInFailureParams('x'.repeat(41))).toEqual({ code: 'unknown' });
    expect(signInFailureParams('')).toEqual({ code: 'unknown' });
  });
});

describe('AuthService.signIn()', () => {
  /** The SDK's client, as far as signing in goes. */
  const client = { login: vi.fn((_parameters?: unknown) => Promise.resolve()) };
  let auth: AuthService;

  beforeEach(() => {
    client.login.mockReset().mockResolvedValue(undefined);
    history.replaceState(null, '', '/songs/ode-to-joy?tempo=80#top');
    auth = TestBed.inject(AuthService);
    (auth as unknown as { client: typeof client }).client = client;
  });

  afterEach(() => history.replaceState(null, '', '/'));

  it('goes to the IAM in the language it is told, and comes back to this address - or the one it is given', async () => {
    expect(await auth.signIn(undefined, 'sk')).toBe(true);
    expect(await auth.signIn('/stats', 'sk')).toBe(true);
    expect(client.login.mock.calls).toEqual([[{ returnTo: '/songs/ode-to-joy?tempo=80#top', uiLocales: 'sk' }], [{ returnTo: '/stats', uiLocales: 'sk' }]]);
  });

  it('names no language when it is told none: the IAM then decides by what it knows about the person', async () => {
    await auth.signIn();
    await auth.signIn(undefined, '');
    expect(client.login.mock.calls).toEqual([[{ returnTo: '/songs/ode-to-joy?tempo=80#top' }], [{ returnTo: '/songs/ode-to-joy?tempo=80#top' }]]);
  });

  it('answers false and keeps the failure when the sign-in cannot start - the pages then go through to the card that says why', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    client.login.mockRejectedValue(Object.assign(new Error('This browser will not let the site remember the sign-in in progress'), { code: 'storage_unavailable' }));
    expect(await auth.signIn()).toBe(false);
    expect(auth.signInFailure()).toEqual({ code: 'storage_unavailable', message: 'This browser will not let the site remember the sign-in in progress' });
    consoleError.mockRestore();
  });

  it('answers false without settings: the app is not set up, and there is no IAM to go to', async () => {
    (auth as unknown as { client: null }).client = null;
    expect(await auth.signIn()).toBe(false);
    expect(auth.signInFailure()).toBeNull();
  });
});

describe('AuthService: who is signed in, as the header is told', () => {
  let auth: AuthService;

  const person = (more: Partial<AnotokiUser> = {}): AnotokiUser => ({ sub: '7', preferred_username: 'mia', email: 'mia@example.test', email_verified: true, locale: null, roles: [], preferences: null, ...more });
  /** The SDK holds a session (or none) - what sync() reads after init() and after every change. */
  const session = (user: AnotokiUser | null): void => {
    (auth as unknown as { authenticated: { set(value: boolean): void } }).authenticated.set(user !== null);
    auth.user.set(user);
  };

  beforeEach(() => {
    auth = TestBed.inject(AuthService);
  });

  it('displayName is the person’s own name - the username, else the e-mail address', () => {
    session(person());
    expect(auth.displayName()).toBe('mia');
    session(person({ preferred_username: null }));
    expect(auth.displayName()).toBe('mia@example.test');
    session(person({ preferred_username: '' }));
    expect(auth.displayName()).toBe('mia@example.test');
  });

  it('displayName is null where there is no name to show - never a sentence: the account panel words what is said then', () => {
    session(person({ preferred_username: null, email: null }));
    expect(auth.displayName()).toBeNull();
    session(null);
    expect(auth.displayName()).toBeNull();
  });

  it('isStaff and isAdmin: this application’s EDITOR or ADMIN, and ADMIN alone - the old MEMBER means nothing', () => {
    const roles = (): [boolean, boolean] => [auth.isStaff(), auth.isAdmin()];
    session(null);
    expect(roles()).toEqual([false, false]);
    session(person());
    expect(roles()).toEqual([false, false]);
    session(person({ roles: ['MEMBER'] }));
    expect(roles()).toEqual([false, false]);
    session(person({ roles: ['EDITOR'] }));
    expect(roles()).toEqual([true, false]);
    session(person({ roles: ['MEMBER', 'ADMIN'] }));
    expect(roles()).toEqual([true, true]);
    session(person({ roles: ['admin'] }));
    expect(roles()).toEqual([true, true]);

    // The roles of a session that has ended count for nothing.
    (auth as unknown as { authenticated: { set(value: boolean): void } }).authenticated.set(false);
    expect(roles()).toEqual([false, false]);
    expect(auth.signedIn()).toBe(false);
  });

  it('userKey is the IAM user id of the session the SDK holds - and nobody without one (no "local" any more)', () => {
    expect(auth.userKey()).toBeNull();
    (auth as unknown as { client: { user(): AnotokiUser | null } }).client = { user: () => person() };
    expect(auth.userKey()).toBe('7');
  });

  it('preferences are the account’s while somebody is signed in - none for nobody, for a session that ended, or from an IAM that sends none', () => {
    const chosen = { theme: 'dark', date_format: 'ymd_dash', time_format: '12' } as const;
    session(person({ preferences: chosen }));
    expect(auth.preferences()).toEqual(chosen);

    // An IAM before its migration 015, or a sign-in without the profile scope: the app keeps its own settings.
    session(person({ preferences: null }));
    expect(auth.preferences()).toBeNull();
    session(null);
    expect(auth.preferences()).toBeNull();

    // What the SDK still holds of a session that has ended is nobody's choice.
    session(person({ preferences: chosen }));
    (auth as unknown as { authenticated: { set(value: boolean): void } }).authenticated.set(false);
    expect(auth.preferences()).toBeNull();
  });

  it('savePreferences() hands the change to the SDK, and its answer back - with no settings read, it refuses as for nobody signed in', async () => {
    await expect(auth.savePreferences({ theme: 'dark' })).rejects.toMatchObject({ code: 'login_required' });

    const saved = { locale: 'sk', preferences: { theme: 'dark', date_format: null, time_format: null } } as const;
    const client = { savePreferences: vi.fn(async (_changes: unknown) => saved) };
    (auth as unknown as { client: typeof client }).client = client;
    expect(await auth.savePreferences({ theme: 'dark' })).toEqual(saved);
    expect(client.savePreferences.mock.calls).toEqual([[{ theme: 'dark' }]]);

    // A refusal comes through as the SDK made it: the code is the IAM's.
    client.savePreferences.mockRejectedValueOnce(Object.assign(new Error('The IAM refused the change'), { code: 'invalid_request' }));
    await expect(auth.savePreferences({ language: 'de' })).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
