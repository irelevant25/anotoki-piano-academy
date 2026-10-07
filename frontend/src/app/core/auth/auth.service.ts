import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { type AnotokiAuth, type AnotokiPreferenceChanges, type AnotokiPreferences, type AnotokiSavedPreferences, type AnotokiUser, createAuth } from './anotoki-auth';

/**
 * Signing in, through the anotoki IAM - the only way in; the app has no login
 * of its own. The vendored browser SDK (anotoki-auth.mjs v1.2.0, copied
 * unchanged from the IAM's sdk/js/) does the OpenID Connect code flow with
 * PKCE and keeps the tokens in localStorage, shared by every tab, refreshing
 * them serialised across tabs; this wraps it in signals.
 *
 * The IAM's address, this app's client id and whether the IAM requires a
 * sign-in here come from the backend (GET /api/auth/config: {issuer,
 * clientId, loginRequired} - the backend reads the IAM's switch and relays
 * it, so the browser never asks the IAM for it), which says 503 not_set_up
 * until setup.php has run - and answers while an update waits, so somebody
 * can sign in then. While a sign-in is not required, somebody who has
 * not signed in practises as a visitor (core/auth/visitor-key.ts) - this
 * service knows nothing of visitors.
 *
 * The account's theme, date order and clock come with who signed in
 * (`preferences`, IAM migration 015), and its language as `user().locale`:
 * one choice every anotoki site follows. The theme button, the date pipe and
 * the language chooser read them here, and save a signed-in person's choice
 * to the account through savePreferences().
 */

/**
 * A sign-in that came back without one - or could not even start: the SDK's
 * error code, and the IAM's own English words. The page words the failure
 * from the code (core/i18n/error-text.ts); `message` is never shown.
 */
export interface SignInFailure {
  code: string;
  message: string;
}

/** GET /api/auth/config answered 503 not_set_up: the site has no settings (the family's status page says so). */
export class NotSetUpError extends Error {
  constructor() {
    super('Piano Academy is not set up yet.');
  }
}

/** The IAM's redirect URI: a route of this app, registered in the IAM for each origin. */
export const CALLBACK_PATH = '/auth/callback';

/** The IAM's roles of this app: EDITOR rewords the app's words; ADMIN also keeps the languages, the people and the database. */
export const ROLE_ADMIN = 'ADMIN';
export const ROLE_EDITOR = 'EDITOR';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private client: AnotokiAuth | null = null;
  /** onAuthChange() listeners - kept here, so one added before init() is not lost. */
  private readonly listeners = new Set<() => void>();

  readonly user = signal<AnotokiUser | null>(null);
  private readonly authenticated = signal(false);
  /**
   * The failed sign-in this page load came back with - or the last one that
   * could not start. Never cleared: the page load after a sign-in starts
   * clean. While it is set, the sign-in guard lets the pages through to the
   * sign-in card instead of sending the browser round to the IAM for ever.
   */
  readonly signInFailure = signal<SignInFailure | null>(null);

  private readonly _loginRequired = signal(true);
  /**
   * The IAM requires a sign-in here (its "Sign-in required" for this app, as
   * the backend relayed it). True until the settings say exactly false - an
   * older backend that does not say it, or settings that could not be read,
   * require one - and true again for the rest of the page load once the API
   * refused a visitor for it (requireSignInNow()).
   */
  readonly loginRequired = this._loginRequired.asReadonly();

  readonly signedIn = computed(() => this.authenticated() && this.user() !== null);
  /** This app's roles, from the IAM's token (its `roles` for this client id). */
  readonly roles = computed(() => (this.signedIn() ? (this.user()?.roles ?? []).map((role) => String(role).toUpperCase()) : []));
  /** May keep the languages, see and delete people's progress, apply database updates. */
  readonly isAdmin = computed(() => this.roles().includes(ROLE_ADMIN));
  /**
   * May use the admin panel - the Translations page at least: EDITOR or ADMIN.
   * Like isAdmin, it only hides what the server refuses anyway (403 forbidden).
   */
  readonly isStaff = computed(() => this.isAdmin() || this.roles().includes(ROLE_EDITOR));
  /**
   * The person's own name for the top bar: the username, else the e-mail
   * address - theirs, shown as it is. Null when there is none to show: nobody
   * signed in, or a token that names nobody. What is said then is the bar's
   * to word (account.signedIn): this service holds no sentence.
   */
  readonly displayName = computed<string | null>(() => {
    const user = this.signedIn() ? this.user() : null;
    return user ? user.preferred_username || user.email || null : null;
  });
  /**
   * The account's theme, date order and clock, which every anotoki site
   * follows - while somebody is signed in and the IAM sends them. Null for
   * nobody and for a visitor (each device keeps its own choices then), and
   * null from an IAM before its migration 015 or a sign-in without the
   * `profile` scope: then the app keeps its own settings, as it always did,
   * and saves nothing to the account.
   */
  readonly preferences = computed<AnotokiPreferences | null>(() => (this.signedIn() ? (this.user()?.preferences ?? null) : null));

  /**
   * Once per page load, before anything calls the API: reads the backend's
   * sign-in settings, then finishes a sign-in callback (the SDK puts the
   * address the person came from back in the address bar) or restores - and
   * refreshes - the stored session. Throws NotSetUpError when the backend is
   * not set up, and anything else when it cannot be reached.
   */
  async init(): Promise<void> {
    let config: { issuer?: string; clientId?: string; loginRequired?: unknown };
    try {
      config = await firstValueFrom(this.http.get<typeof config>('/api/auth/config'));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 503 && error.error?.code === 'not_set_up') {
        throw new NotSetUpError();
      }
      throw error;
    }
    // Only an explicit false lets visitors in: anything else - missing, a text - requires a sign-in.
    this._loginRequired.set(config?.loginRequired !== false);

    this.client = createAuth({
      issuer: String(config.issuer ?? ''),
      clientId: String(config.clientId ?? ''),
      redirectUri: `${location.origin}${CALLBACK_PATH}`,
      postLogoutRedirectUri: `${location.origin}/`,
    });
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

  /**
   * The API refused a visitor because the IAM requires a sign-in now (401
   * sign_in_required to a request sent as a visitor while the settings said
   * none was required): from here on this page load treats the app as one
   * that requires it. The visitor key is kept (the next sign-in moves what it
   * holds).
   */
  requireSignInNow(): void {
    this._loginRequired.set(true);
  }

  private sync(): void {
    this.user.set(this.client?.user() ?? null);
    this.authenticated.set(this.client?.isAuthenticated() ?? false);
  }

  /**
   * Whose data this page works on: the IAM user id ('sub'), null when signed
   * out. The page never saves under another key than the one it loaded with
   * (see ApiService).
   */
  userKey(): string | null {
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
   * To the IAM, and back to `returnTo` (this address, by default) when signed
   * in. `uiLocales` is the language the app is read in, so the IAM's pages
   * open in the same one. The caller says it (BootService, the sign-in
   * guard): this service never asks the translation service, which needs
   * this one - a circle.
   *
   * Answers true when the browser is on its way to the IAM. False when the
   * sign-in could not even start - no settings were read (the app is not set
   * up), or the browser refuses the site's storage, where the SDK keeps the
   * sign-in in progress (`storage_unavailable`) - and then `signInFailure`
   * says so, as it does for a sign-in that came back without one: the pages
   * go through to the sign-in card, which words it, instead of a blank page.
   */
  async signIn(returnTo = location.pathname + location.search + location.hash, uiLocales?: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.login(uiLocales ? { returnTo, uiLocales } : { returnTo });
      return true;
    } catch (error) {
      console.error('The sign-in could not start.', error);
      const code = (error as { code?: unknown } | null)?.code;
      this.signInFailure.set({ code: typeof code === 'string' ? code : '', message: error instanceof Error ? error.message : '' });
      return false;
    }
  }

  /** Signs out everywhere (the IAM ends its session) and lands on this site's start page. */
  signOut(): void {
    void this.client?.logout();
  }

  /** The IAM's account page: name, password, two-factor, sessions. */
  accountUrl(): string | null {
    return this.client ? this.client.accountUrl() : null;
  }

  /**
   * Saves a choice made here - the theme, the language - to the account, for
   * every anotoki site (the SDK's savePreferences(): POST
   * {issuer}/api/oidc/preferences with the access token). The SDK puts the
   * answer into user() at once, in every tab, and says so (onAuthChange).
   * Rejects with the IAM's error code in `code`: login_required (nobody
   * signed in - nor any settings read - or somebody else signed in
   * meanwhile: the SDK sends only this person's own token),
   * insufficient_scope, invalid_request (a value the IAM does not take: a
   * language it does not offer), access_denied (the IAM no longer lets this
   * account into Piano Academy - trying again would not help),
   * invalid_token, temporarily_unavailable, network... The caller decides
   * what each means to the person.
   */
  savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    if (!this.client) {
      return Promise.reject(Object.assign(new Error('Nobody is signed in'), { code: 'login_required' }));
    }
    return this.client.savePreferences(changes);
  }

  /** Signed in, out or refreshed, or a preference saved - in this tab or another. Returns an unsubscribe. */
  onAuthChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
