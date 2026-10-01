import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { type AnotokiAuth, type AnotokiUser, createAuth } from './anotoki-auth';

// Signing in. The backend says how (GET /api/auth/config):
//  - 'iam':  through the anotoki IAM, with the vendored browser SDK
//            (anotoki-auth.mjs v1.1.1, copied unchanged from the IAM's
//            sdk/js/). Tokens live in localStorage and are shared by every
//            tab; the SDK refreshes them, serialised across tabs.
//  - 'none': no login - the owner's own computer, where the backend acts as
//            the owner for every request. The app then shows no sign-in UI at all.

export type AuthMode = 'none' | 'iam';

/**
 * A sign-in that came back without one: the SDK's error code, and the IAM's
 * own English words. The page words the failure from the code
 * (core/i18n/error-text.ts); `message` is never shown.
 */
export interface SignInFailure {
  code: string;
  message: string;
}

/** GET /api/auth/config (or /api/state) answered 503 not_set_up: the setup page has not been run. */
export class NotSetUpError extends Error {
  constructor(readonly detail: string | null = null) {
    super('Piano Academy is not set up yet.');
  }
}

/** The IAM's redirect URI: a route of this app, registered in the IAM for each origin. */
export const CALLBACK_PATH = '/auth/callback';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private client: AnotokiAuth | null = null;
  /** onAuthChange() listeners - kept here, so one added before init() is not lost. */
  private readonly listeners = new Set<() => void>();

  readonly mode = signal<AuthMode | null>(null);
  readonly user = signal<AnotokiUser | null>(null);
  private readonly authenticated = signal(false);
  /** The failed sign-in this page load came back with, for the sign-in card. */
  readonly signInFailure = signal<SignInFailure | null>(null);

  /** True when this app needs a login (auth mode 'iam'). */
  readonly usesSignIn = computed(() => this.mode() === 'iam');
  readonly signedIn = computed(() => this.mode() === 'none' || this.authenticated());
  /**
   * The person's own name for the header: the username, else the e-mail
   * address - theirs, shown as it is. Null when there is none to show: nobody
   * signed in, or a token that names nobody. What is said then is the account
   * panel's to word (account.signedIn, account.signedOut): this service holds
   * no sentence.
   */
  readonly displayName = computed<string | null>(() => {
    const user = this.user();
    return user ? user.preferred_username || user.email || null : null;
  });
  /**
   * May change the app's words (the Translations and Languages pages): on the
   * owner's own computer, whoever uses it; with sign-in, this application's
   * ADMIN. It only hides what the server refuses anyway (requireOwner()).
   */
  readonly isOwner = computed(() => this.mode() === 'none' || (this.signedIn() && (this.user()?.roles ?? []).includes('ADMIN')));

  /**
   * Once per page load, before anything calls the API: reads the backend's
   * sign-in settings and, in 'iam' mode, finishes a sign-in callback (the SDK
   * puts the address the person came from back in the address bar) or
   * restores - and refreshes - the stored session. Throws NotSetUpError when
   * the backend is not set up, and anything else when it cannot be reached.
   */
  async init(): Promise<void> {
    let config: { mode?: string; issuer?: string; clientId?: string };
    try {
      config = await firstValueFrom(this.http.get<typeof config>('/api/auth/config'));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 503 && error.error?.code === 'not_set_up') {
        throw new NotSetUpError(typeof error.error?.detail === 'string' ? error.error.detail : null);
      }
      throw error;
    }

    if (config.mode === 'none') {
      this.mode.set('none');
      return;
    }

    this.client = createAuth({
      issuer: String(config.issuer ?? ''),
      clientId: String(config.clientId ?? ''),
      redirectUri: `${location.origin}${CALLBACK_PATH}`,
      postLogoutRedirectUri: `${location.origin}/`,
    });
    this.mode.set('iam');
    this.client.onChange(() => {
      this.sync();
      for (const listener of this.listeners) {
        try {
          listener();
        } catch (error) {
          console.error('A sign-in listener failed', error);
        }
      }
    });

    const result = await this.client.init();
    this.sync();
    if (result.error) {
      this.signInFailure.set({ code: result.error.code || '', message: result.error.message || '' });
    }
  }

  private sync(): void {
    this.user.set(this.client?.user() ?? null);
    this.authenticated.set(this.client?.isAuthenticated() ?? false);
  }

  /**
   * Whose data this page works on: the IAM user id ('sub'), 'local' without
   * sign-in, null when signed out. The page never saves under another key than
   * the one it loaded with (see ApiService).
   */
  userKey(): string | null {
    if (this.mode() === 'none') return 'local';
    const user = this.client?.user() ?? null;
    return user ? String(user.sub) : null;
  }

  /** A valid access token (refreshed when it is about to run out), or null. */
  accessToken(): Promise<string | null> {
    return this.client ? this.client.getAccessToken() : Promise.resolve(null);
  }

  /** After the API refused the current token: a different, fresh one - or null. */
  refreshToken(): Promise<string | null> {
    return this.client ? this.client.refresh() : Promise.resolve(null);
  }

  /**
   * To the IAM, and back to this address when signed in. `uiLocales` is the
   * language the app is read in, so the IAM's pages open in the same one. The
   * caller says it (BootService): this service never asks the translation
   * service, which needs this one - a circle.
   */
  signIn(uiLocales?: string): void {
    const returnTo = location.pathname + location.search + location.hash;
    void this.client?.login(uiLocales ? { returnTo, uiLocales } : { returnTo });
  }

  /** Signs out everywhere (the IAM ends its session) and lands on this site's start page. */
  signOut(): void {
    this.client?.logout();
  }

  accountUrl(): string | null {
    return this.client ? this.client.accountUrl() : null;
  }

  /** Signed in, out or refreshed - in this tab or another. Returns an unsubscribe. (Never called without sign-in.) */
  onAuthChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
