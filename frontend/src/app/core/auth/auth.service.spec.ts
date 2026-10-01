import { TestBed } from '@angular/core/testing';
import { signInFailureKey, signInFailureParams } from '../i18n/error-text';
import { type AnotokiUser } from './anotoki-auth';
import { AuthService } from './auth.service';

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
  const client = { login: vi.fn(() => Promise.resolve()) };
  let auth: AuthService;

  beforeEach(() => {
    client.login.mockClear();
    history.replaceState(null, '', '/songs/ode-to-joy?tempo=80#top');
    auth = TestBed.inject(AuthService);
    (auth as unknown as { client: typeof client }).client = client;
  });

  afterEach(() => history.replaceState(null, '', '/'));

  it('goes to the IAM in the language it is told, and comes back to this address', () => {
    auth.signIn('sk');
    expect(client.login.mock.calls).toEqual([[{ returnTo: '/songs/ode-to-joy?tempo=80#top', uiLocales: 'sk' }]]);
  });

  it('names no language when it is told none: the IAM then decides by what it knows about the person', () => {
    auth.signIn();
    auth.signIn('');
    expect(client.login.mock.calls).toEqual([[{ returnTo: '/songs/ode-to-joy?tempo=80#top' }], [{ returnTo: '/songs/ode-to-joy?tempo=80#top' }]]);
  });
});

describe('AuthService: who is signed in, as the header is told', () => {
  let auth: AuthService;

  const person = (more: Partial<AnotokiUser> = {}): AnotokiUser => ({ sub: '7', preferred_username: 'mia', email: 'mia@example.test', email_verified: true, locale: null, roles: [], ...more });
  /** The SDK holds a session (or none) - what sync() reads after init() and after every change. */
  const session = (user: AnotokiUser | null): void => {
    (auth as unknown as { authenticated: { set(value: boolean): void } }).authenticated.set(user !== null);
    auth.user.set(user);
  };

  beforeEach(() => {
    auth = TestBed.inject(AuthService);
    auth.mode.set('iam');
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
    auth.mode.set('none');
    expect(auth.displayName()).toBeNull();
  });

  it('isOwner: this application’s ADMIN where people sign in; on the owner’s own computer, whoever uses it', () => {
    session(null);
    expect(auth.isOwner()).toBe(false);
    session(person());
    expect(auth.isOwner()).toBe(false);
    session(person({ roles: ['MEMBER'] }));
    expect(auth.isOwner()).toBe(false);
    session(person({ roles: ['MEMBER', 'ADMIN'] }));
    expect(auth.isOwner()).toBe(true);

    // The roles of a session that has ended count for nothing.
    (auth as unknown as { authenticated: { set(value: boolean): void } }).authenticated.set(false);
    expect(auth.isOwner()).toBe(false);

    auth.mode.set('none');
    auth.user.set(null);
    expect(auth.isOwner()).toBe(true);
  });
});
