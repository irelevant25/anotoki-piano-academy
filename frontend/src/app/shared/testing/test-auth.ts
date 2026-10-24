import { Provider, computed, signal } from '@angular/core';
import {
  ANOTOKI_AUTH_BROWSER,
  ANOTOKI_AUTH_CONFIG,
  AnotokiAuth,
  type AnotokiAuthConfig,
  type AnotokiPreferenceChanges,
  type AnotokiSavedPreferences,
  type AnotokiUser,
  type AuthBrowser,
  type AuthState,
  type Caller,
  type SignInFailure,
  type SignInOptions,
  type VisitorKeyStore,
} from '@anotoki/lib/auth';
import { vi } from 'vitest';
import { CALLBACK_PATH, SIGN_IN_FAILED_ROUTE, VISITOR_PREFIXES } from '../auth/site-auth';

/** A person for a spec: the sub, and whatever else the spec cares about - an ordinary account's claims for the rest. */
export type TestPerson = Partial<AnotokiUser> & { sub: string };

/** The whole user of a TestPerson: no name of the IAM's unless given, MEMBER, no preferences. */
export function testPerson(person: TestPerson): AnotokiUser {
  return { preferred_username: null, email: null, email_verified: true, locale: null, roles: ['MEMBER'], preferences: null, ...person };
}

/**
 * The anotoki family's AnotokiAuth (@anotoki/lib/auth) as this app's specs
 * drive it: the same signals - their values set by the spec, never by an IAM
 * - and its calls recorded. Given to a TestBed with provideTestAuth().
 *
 * The family's module itself (its client, interceptor, guards, callback) is
 * the library's, and tested there; the specs of this app's API calls use it
 * whole (provideTestAnotokiAuth, @anotoki/lib/auth/testing). The pages and
 * services read only what they are shown here.
 */
export class TestAuth {
  /** Where the page stands: set by the helpers below. */
  readonly now = signal<AuthState>('signed-out');
  /** Who the IAM's client holds (in any tab) - the page's person while signed in. */
  readonly person = signal<AnotokiUser | null>(null);
  /** The IAM's switch, as the backend relayed it (true: a sign-in is required). */
  readonly required = signal(true);
  /** A sign-in that came back without one, or could not start. */
  readonly failure = signal<SignInFailure | null>(null);

  readonly state = this.now.asReadonly();
  readonly user = computed(() => (this.now() === 'signed-in' ? this.person() : null));
  readonly signedIn = computed(() => this.now() === 'signed-in');
  readonly sub = computed(() => this.user()?.sub ?? null);
  readonly loginRequired = this.required.asReadonly();
  readonly visitorsWelcome = computed(() => !this.required());
  readonly signInAvailable = signal(true).asReadonly();
  readonly signInFailure = this.failure.asReadonly();
  readonly roles = computed(() => (this.user()?.roles ?? []).map((role) => String(role).toUpperCase()));
  readonly isAdmin = computed(() => this.roles().includes('ADMIN'));
  readonly isStaff = computed(() => this.isAdmin() || this.roles().includes('EDITOR'));
  readonly displayName = computed(() => {
    const user = this.user();
    return user ? user.preferred_username || user.email || '' : '';
  });
  readonly preferences = computed(() => this.user()?.preferences ?? null);
  readonly locale = computed(() => this.user()?.locale ?? null);

  /** The visitor key store the module was given (none by default). */
  store: VisitorKeyStore | null = null;

  readonly init = vi.fn(async (): Promise<void> => undefined);
  /** On its way to the IAM (true), unless a spec says otherwise. */
  readonly signIn = vi.fn(async (_options?: SignInOptions): Promise<boolean> => true);
  readonly register = vi.fn(async (_options?: Omit<SignInOptions, 'prompt'>): Promise<boolean> => true);
  readonly signOut = vi.fn(async (_options?: { local?: boolean }): Promise<boolean> => true);
  readonly token = vi.fn(async (): Promise<string | null> => (this.signedIn() ? `token-${this.sub()}` : null));
  readonly refresh = vi.fn(async (_refused?: string | null): Promise<string | null> => null);
  readonly refused = vi.fn((): void => undefined);
  readonly noteSignInRequired = vi.fn((): void => {
    this.required.set(true);
    if (this.now() === 'visitor') this.now.set('signed-out');
  });
  readonly savePreferences = vi.fn(async (changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> => {
    const user = this.person();
    if (!user || !this.signedIn()) throw Object.assign(new Error('Nobody is signed in'), { code: 'login_required' });
    const { language, ...rest } = changes;
    const saved = { locale: language ?? user.locale, preferences: { ...(user.preferences ?? { theme: 'auto' as const, date_format: null, time_format: null }), ...rest } };
    this.person.set({ ...user, ...saved });
    return saved;
  });

  /** The IAM user id signed in now (in any tab), or null. */
  subject(): string | null {
    return this.person()?.sub ?? null;
  }

  caller(): Caller {
    return this.now() === 'visitor' ? 'visitor' : 'person';
  }

  dismissFailure(): void {
    this.failure.set(null);
  }

  accountUrl(): string {
    return this.signedIn() ? 'https://iam.test/account' : '';
  }

  issuer(): string {
    return 'https://iam.test';
  }

  clientId(): string {
    return 'piano-academy';
  }

  async uiLocalesSupported(): Promise<string[] | null> {
    return ['en', 'sk'];
  }

  visitors(): VisitorKeyStore | null {
    return this.store;
  }

  uiLocales(): string | undefined {
    return undefined;
  }

  // --- for the specs ---

  /** Somebody signed in, whose the page is (a sign-in is required, unless `required` says otherwise). */
  signInAs(person: TestPerson, required = this.required()): this {
    this.required.set(required);
    this.person.set(testPerson(person));
    this.now.set('signed-in');
    return this;
  }

  /** Nobody signed in where somebody must be: on the way to the IAM, or a session that ended with the page open. */
  signedOut(): this {
    this.person.set(null);
    this.required.set(true);
    this.now.set('signed-out');
    return this;
  }

  /** A visitor: nobody signed in, and the IAM lets visitors in. */
  visiting(): this {
    this.person.set(null);
    this.required.set(false);
    this.now.set('visitor');
    return this;
  }

  /** The sign-in settings could not be read: the sign-in cannot be set up. */
  unavailable(): this {
    this.person.set(null);
    this.now.set('unavailable');
    return this;
  }

  /** A sign-in that came back without one (its code), or could not start. */
  failed(code: string, returnTo: string | null = null): this {
    this.failure.set({ code, returnTo });
    return this;
  }
}

/** A TestAuth as the TestBed's AnotokiAuth (and as itself, for the spec to drive). */
export function provideTestAuth(auth: TestAuth = new TestAuth()): Provider[] {
  return [
    { provide: TestAuth, useValue: auth },
    { provide: AnotokiAuth, useValue: auth },
  ];
}

/** A browser at this page's origin, for the family's interceptor: nothing is left or reloaded - the spec reads what was asked. */
export function testBrowser(): AuthBrowser & { navigations: string[]; reloads: number } {
  const browser = {
    navigations: [] as string[],
    reloads: 0,
    isBrowser: true,
    cookie: () => '',
    topLevel: () => true,
    prerendering: () => false,
    origin: () => location.origin,
    path: () => location.pathname + location.search + location.hash,
    navigate: (url: string) => void browser.navigations.push(url),
    reload: () => void browser.reloads++,
    now: () => Date.now(),
  };
  return browser;
}

/**
 * The family's interceptor (anotokiAuthInterceptor, given to
 * provideHttpClient by the spec) around a TestAuth: the module's configuration
 * as this app has it (shared/auth/site-auth.ts: the visitors' routes, the
 * callback, the failure's route, no hint) and a browser at this page's origin.
 * The visitor key store is the TestAuth's `store` - set it once the TestBed
 * is configured: `auth.store = TestBed.inject(VisitorKey)`.
 */
export function provideTestAuthInterceptor(): Provider[] {
  const config: AnotokiAuthConfig = {
    config: '/api/auth/config',
    api: { visitorPrefixes: [...VISITOR_PREFIXES] },
    redirectPath: CALLBACK_PATH,
    failureRoute: SIGN_IN_FAILED_ROUTE,
    hint: false,
  };
  return [
    { provide: ANOTOKI_AUTH_CONFIG, useValue: config },
    { provide: ANOTOKI_AUTH_BROWSER, useValue: testBrowser() },
  ];
}
