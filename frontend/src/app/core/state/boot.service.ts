import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiError, ApiService, VISITOR_OWNER, VisitorMove } from '../api/api.service';
import { AuthService, NotSetUpError } from '../auth/auth.service';
import { VisitorKey } from '../auth/visitor-key';
import { TranslationService } from '../i18n/translation.service';
import { MidiService } from '../midi/midi.service';
import { AppState } from '../music/music.types';
import { ProgressStore } from './progress-store.service';

/**
 * Where the app is while it starts:
 *   loading      the sign-in settings and the progress are on their way
 *   not-set-up   the backend has no settings yet (or its database needs an update): /setup.php -
 *                or, for an ADMIN when only a migration is pending, the admin panel's Migrations page
 *   sign-in      nobody signed in, and the IAM requires a sign-in: the sign-in guard sends the
 *                browser to the IAM - or, after a sign-in that came back without one, lets the
 *                sign-in card be drawn
 *   load-error   the progress could not be loaded - and the app does not run without it
 *   ready        the progress is in memory - a person's, or a visitor's (`visiting`); the views run
 */
export type BootStatus = 'loading' | 'not-set-up' | 'sign-in' | 'load-error' | 'ready';

/** A move after a sign-in that brought something: whether the account kept progress of its own for some of it. */
export interface VisitorMoved {
  kept: boolean;
}

/** The longest Retry-After of a move refused for a moment (503 visitor_move_retry) that is waited out, once. */
export const MOVE_RETRY_MAX_MS = 5000;

/**
 * The start of the app, in the order that keeps progress safe: sign-in first
 * (every API call of a person's needs the token), then the person's state.
 * Any failure stops it with a card saying so - it never runs on empty state,
 * because the first save would overwrite the real progress with it.
 *
 * Nobody signed in while the IAM does not require a sign-in here
 * (AuthService.loginRequired): a VISITOR - the page's data owner is
 * VISITOR_OWNER, and its state is the visitor's whose key this browser holds
 * (core/auth/visitor-key.ts), or nobody's (empty, generation 0) until the
 * first save makes one. A key the server no longer knows is forgotten
 * (VisitorKey.lost) and the start goes on with nobody's. A sign-in that came
 * back refused is a visitor too (the page says why).
 *
 * Signed in with a visitor key held: what the visitor kept becomes the
 * person's first (POST /api/visitor/move), then the person's state is loaded
 * - so it holds the merge. Answered (found or not - another tab's move is no
 * error) the key is forgotten; `visitorMoved` says what came, for the page
 * to word. Not answered (no answer, a 5xx, 503 visitor_move_retry - waited
 * out once when it says a few seconds): the key is kept, `visitorNotMoved`
 * says so, and the next sign-in or page load asks again - the data is out of
 * sight meanwhile, never lost. A key that is no key (422) is forgotten.
 * Every signed-in start also takes on the rounds a visitor of this browser
 * left in its outbox (ApiService.adoptOutbox(): their Idempotency-Keys stop
 * doubles), whoever moved the rest. The move runs again after a sign-in
 * that comes back in the middle of practising (the sign-in listener below -
 * no injection circle: VisitorKey knows only AuthService).
 *
 * Between the two comes the language and its strings (TranslationService):
 * once the sign-in settings are read and before anybody is asked to sign in,
 * so the sign-in card is in the learner's language. Where the settings could
 * not be read nothing is asked for - the shell words itself from the strings
 * kept from the last visit, or from the English kept in code.
 *
 * Also here: another person signing in in another tab reloads this one (it
 * holds the other person's progress), and leaving the page with a save that
 * did not get through asks first.
 *
 * Nobody signed in is not sent anywhere from here: the routes' sign-in guard
 * (core/auth/sign-in.guard.ts) does that, once the start is over - and it
 * reads the status this service ends with (and `visiting`).
 */
@Injectable({ providedIn: 'root' })
export class BootService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly store = inject(ProgressStore);
  private readonly midi = inject(MidiService);
  private readonly i18n = inject(TranslationService);
  private readonly visitorKey = inject(VisitorKey);

  readonly status = signal<BootStatus>('loading');
  /** What the backend said is missing, when it said it (to this computer only). */
  readonly notSetUpDetail = signal<string | null>(null);
  /** The backend is set up, but its database is behind the code (503 not_set_up with update: true). */
  readonly needsUpdate = signal(false);
  /**
   * The database is only behind the code and the person is an ADMIN: the one
   * page of the app that works is the admin panel's Migrations page, which
   * applies what is pending (the "not set up yet" card links to it).
   */
  readonly onlyMigrations = computed(() => this.status() === 'not-set-up' && this.needsUpdate() && this.auth.isAdmin());
  /** The progress in memory is a visitor's (or nobody's, before the first save): nobody signed in, no sign-in required at the start. */
  readonly visiting = computed(() => this.api.dataOwner() === VISITOR_OWNER);
  /** The move after a sign-in brought this browser's progress into the account (null: nothing to say). */
  readonly visitorMoved = signal<VisitorMoved | null>(null);
  /** The move after a sign-in did not happen this time: the key is kept, and it is asked again. */
  readonly visitorNotMoved = signal(false);
  /** Whose progress is in memory (AuthService.userKey(), or VISITOR_OWNER). */
  private loadedFor: string | null = null;
  /** Leaving for the IAM on purpose: no "unsaved changes" question. */
  private leaving = false;
  /** The move on its way: answers whether it found the visitor. */
  private moving: Promise<boolean> | null = null;

  constructor() {
    this.auth.onAuthChange(() => {
      // Somebody signed in in another tab who is not whose progress this page holds (a person's, or a visitor's).
      const key = this.auth.userKey();
      if (this.status() === 'ready' && key !== null && key !== this.loadedFor) {
        this.leaving = true;
        location.reload();
        return;
      }
      // Signed in again in the middle of practising, with a visitor key held (another tab visited meanwhile).
      if (this.status() === 'ready' && key !== null && this.visitorKey.current() !== null) {
        void this.moveVisitor().then((found) => {
          if (this.api.adoptOutbox(VISITOR_OWNER) > 0) this.store.retryUnsaved();
          if (found) this.store.reloadFromServer().catch((error: unknown) => console.error('The progress could not be loaded after the move.', error));
        });
      }
      if (this.store.hasUnsaved()) this.store.retryUnsaved();
    });

    globalThis.addEventListener?.('beforeunload', (event: BeforeUnloadEvent) => {
      if (this.leaving || !(this.store.progressFailed() || this.store.pathFailed())) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  /** Once, before the first page is drawn (app.config.ts). Never throws: the status says what happened. */
  async start(): Promise<void> {
    try {
      await this.auth.init();
    } catch (error) {
      // Nothing can be asked for: the strings kept from the last visit when
      // there are any, the English kept in code otherwise - and no request.
      await this.i18n.init(false);
      if (error instanceof NotSetUpError) {
        this.notSetUpDetail.set(error.detail);
        this.status.set('not-set-up');
        return;
      }
      console.error('Failed to load the sign-in settings.', error);
      this.status.set('load-error');
      return;
    }

    // The language and its strings, before the signed-in test: the sign-in
    // card has them too. It never rejects - a bundle that does not come is
    // "no bundle", and the start goes on.
    await this.i18n.init(true);

    if (this.auth.signedIn()) {
      this.loadedFor = this.auth.userKey();
      this.api.setDataOwner(this.loadedFor);
      // What this browser kept as a visitor first: the state loaded next holds it.
      await this.moveVisitor();
      this.api.adoptOutbox(VISITOR_OWNER);
    } else if (!this.auth.loginRequired()) {
      this.loadedFor = VISITOR_OWNER;
      this.api.setDataOwner(VISITOR_OWNER);
    } else {
      // A visitor key this browser holds is kept: the sign-in moves it.
      this.status.set('sign-in');
      return;
    }

    try {
      this.store.load(await this.fetchState());
    } catch (error) {
      // A 401 after which the SDK holds no session any more means the sign-in
      // is over - or, for a visitor, that the IAM requires one now (the
      // interceptor said so: AuthService.requireSignInNow()); with a session
      // left, the IAM could not be reached to renew it - that is the error
      // card's "Try again".
      if (error instanceof ApiError && error.status === 401 && !this.auth.signedIn()) {
        this.api.setDataOwner(null);
        this.loadedFor = null;
        this.status.set('sign-in');
        return;
      }
      if (error instanceof ApiError && error.code === 'not_set_up') {
        this.needsUpdate.set(error.details?.['update'] === true);
        this.status.set('not-set-up');
        return;
      }
      console.error('Failed to load saved progress.', error);
      this.status.set('load-error');
      return;
    }

    this.status.set('ready');
    this.midi.start();
  }

  /** The state of the page's owner - for a visitor whose key the server no longer knows (forgotten then), nobody's. */
  private async fetchState(): Promise<AppState> {
    try {
      return await this.api.fetchState();
    } catch (error) {
      if (this.loadedFor === VISITOR_OWNER && error instanceof ApiError && error.status === 401 && error.code === 'visitor_unknown') {
        return this.api.fetchState();
      }
      throw error;
    }
  }

  /**
   * The move after a sign-in (see the class): answers whether it found the
   * visitor - the person's progress changed then. One at a time; it does
   * nothing without a person and a key.
   */
  private moveVisitor(): Promise<boolean> {
    this.moving ??= this.moveOnce(true).finally(() => (this.moving = null));
    return this.moving;
  }

  private async moveOnce(again: boolean): Promise<boolean> {
    const key = this.visitorKey.current();
    if (key === null || !this.auth.signedIn()) return false;
    let result: VisitorMove;
    try {
      result = await this.api.moveVisitor(key);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        // Not a key the server could ever know: nothing to move, now or later.
        this.visitorKey.forget(key);
        return false;
      }
      if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
        const wait = error.retryAfterMs;
        if (again && error.code === 'visitor_move_retry' && wait !== null && wait <= MOVE_RETRY_MAX_MS) {
          await new Promise((resolve) => setTimeout(resolve, wait));
          return this.moveOnce(false);
        }
        console.error('The progress kept without signing in could not be moved into the account this time.', error);
        this.visitorNotMoved.set(true);
      }
      // A 401: the sign-in ended meanwhile - the next one asks again. The key is kept.
      return false;
    }
    this.visitorKey.forget(key);
    this.visitorNotMoved.set(false);
    // Not found: another tab moved it (or it was swept) - nothing to say.
    if (!result.found) return false;
    const kept = result.notes.kept + result.steps.merged + result.steps.kept > 0;
    if (kept || result.notes.moved + result.steps.moved + result.sessions > 0) this.visitorMoved.set({ kept });
    return true;
  }

  /**
   * Before leaving a visitor's page for the IAM: the saves on their way
   * arrive first (as before signing out), so the move takes them along.
   */
  async beforeSignIn(): Promise<void> {
    if (this.visiting()) await this.store.settle();
  }

  /**
   * After an ADMIN applied the pending migrations on the Migrations page
   * while the database was behind: the progress is loaded now and the app
   * runs on where it stands - no reload, so the page keeps saying what was
   * applied. Anything that is not that state is left as it is, and so is a
   * database still behind (the page shows what is pending). The strings are
   * asked for again at once (TranslationService.reload()): the start's
   * request for them got 503, so the app has no bundle - or the one cached
   * from before the update, without the keys it added - and would not ask
   * again by itself.
   */
  async resumeAfterUpdate(): Promise<void> {
    if (!this.onlyMigrations()) return;
    try {
      this.store.load(await this.api.fetchState());
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'not_set_up')) console.error('Failed to load saved progress after the update.', error);
      return;
    }
    this.needsUpdate.set(false);
    this.status.set('ready');
    void this.i18n.reload();
    this.midi.start();
  }

  /**
   * To the IAM, in the language the app is read in - so its pages open in the
   * same one. Only a language that came with a bundle is passed: while there
   * is none the page is in the kept English, which nobody chose, and saying
   * so would override what the IAM knows about the person.
   */
  async signIn(): Promise<void> {
    await this.beforeSignIn();
    this.leaving = true;
    // Could not start: the sign-in card words why (AuthService.signInFailure), and the page stays.
    if (!(await this.auth.signIn(undefined, this.i18n.ready() ? this.i18n.language() : undefined))) {
      this.leaving = false;
    }
  }

  /**
   * Before signing out: a failed save goes once more and what is on its way
   * arrives. Answers whether signing out now would still lose progress - the
   * caller asks the learner first then (ProgressStore.wouldLoseOnSignOut()).
   * Rounds that wait in the outbox are kept for the next sign-in.
   */
  async settleBeforeSignOut(): Promise<boolean> {
    await this.store.settle();
    return this.store.wouldLoseOnSignOut();
  }

  /** Signs out now - after settleBeforeSignOut(), and the learner's yes when it said something would be lost. */
  signOut(): void {
    this.leaving = true;
    this.auth.signOut();
  }
}
