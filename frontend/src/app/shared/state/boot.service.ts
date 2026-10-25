import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { ApiError, ApiService, VISITOR_OWNER, VisitorMove } from '../../api/api.service';
import { VisitorKey } from '../auth/visitor-key';
import { MidiService } from '../midi/midi.service';
import { AppState } from '../music/music.types';
import { ProgressStore } from './progress-store.service';

/**
 * Where the app is while it starts:
 *   loading      the sign-in settings and the progress are on their way
 *   not-set-up   the backend has no settings yet: the family's status page says so
 *                (<anotoki-site-gate>, SiteStatus) - and nothing more can start
 *   waiting      the site is not ready (SiteStatus.blocked(): an update waits, the database is
 *                out of reach, or the site settings close the site for maintenance - never for
 *                the site's ADMIN, who uses it as it is): the sign-in and the strings are there,
 *                the progress is not asked for - the family's status page (or closed sign) stands
 *                in every page's place, and an ADMIN's Apply on the Migrations page goes on from
 *                here (resumeAfterUpdate())
 *   sign-in      nobody signed in, and the IAM requires a sign-in: the family's guard sends the
 *                browser to the IAM - or, after a sign-in that came back without one, to the
 *                family's screen that says why (/sign-in-failed, shared/auth/site-auth.ts)
 *   load-error   the progress could not be loaded - and the app does not run without it
 *   ready        the progress is in memory - a person's, or a visitor's (`visiting`); the views run
 */
export type BootStatus = 'loading' | 'not-set-up' | 'waiting' | 'sign-in' | 'load-error' | 'ready';

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
 * (AnotokiAuth.loginRequired): a VISITOR - the page's data owner is
 * VISITOR_OWNER, and its state is the visitor's whose key this browser holds
 * (shared/auth/visitor-key.ts), or nobody's (empty, generation 0) until the
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
 * that comes back in the middle of practising (the effect below - no
 * injection circle: VisitorKey knows only AnotokiAuth).
 *
 * The sign-in itself is the anotoki family's (@anotoki/lib/auth,
 * shared/auth/site-auth.ts): AnotokiAuth.init() reads the backend's sign-in
 * settings, finishes a callback (the address the person came from back in
 * the address bar before the router reads it) or restores the session. It
 * never rejects: settings that could not be read leave it `unavailable`.
 * Between it and the progress comes the language and its strings (the
 * family's TranslationService, @anotoki/lib/translations): once the sign-in
 * settings are read and before anybody is asked to sign in, so the failure's
 * screen is in the learner's language. Where the settings could not be read
 * nothing is asked for (the service's `canAsk`: the sign-in is not
 * `unavailable`) - the shell words itself from the strings kept from the last
 * visit, or from the English kept in code.
 *
 * Another person signing in in another tab - or anybody, on a page shown to
 * a visitor - loads this one afresh: the family's module does that (it holds
 * the other person's progress).
 *
 * While the site is not ready - an update waits, or its database is out of
 * reach: SiteStatus, asked by the app's initializer before this starts, or
 * told by any answer since - the start reads the sign-in settings (somebody
 * can sign in then: that is how an ADMIN gets to the Migrations page) and the
 * strings (both answer while an update waits), and stops there: `waiting`.
 * Nothing that would fail is asked for - no move, no state - and the family's
 * status page stands in every page's place. An ADMIN's Apply that leaves
 * nothing to apply goes on from there (resumeAfterUpdate()); everybody
 * else's status page loads the page again once the site is back.
 *
 * Also here: leaving the page with a save that did not get through asks
 * first.
 *
 * Nobody signed in is not sent anywhere from here: the family's guards on the
 * routes (personOrVisitorGuard, staffGuard, adminGuard - app.routes.ts) do
 * that, once the start is over.
 */
@Injectable({ providedIn: 'root' })
export class BootService {
  private readonly auth = inject(AnotokiAuth);
  private readonly api = inject(ApiService);
  private readonly store = inject(ProgressStore);
  private readonly midi = inject(MidiService);
  private readonly i18n = inject(TranslationService);
  private readonly visitorKey = inject(VisitorKey);
  private readonly site = inject(SiteStatus);

  readonly status = signal<BootStatus>('loading');
  /**
   * An update waits and the person is the site's ADMIN: the one page of the
   * app that works is the admin panel's Migrations page, which applies it
   * (the family's status page links to it). The bar has it alone then, and
   * /admin opens it.
   */
  readonly onlyMigrations = computed(() => this.site.state() === 'update-pending' && this.auth.isAdmin());
  /** The progress in memory is a visitor's (or nobody's, before the first save): nobody signed in, no sign-in required at the start. */
  readonly visiting = computed(() => this.api.dataOwner() === VISITOR_OWNER);
  /** The move after a sign-in brought this browser's progress into the account (null: nothing to say). */
  readonly visitorMoved = signal<VisitorMoved | null>(null);
  /** The move after a sign-in did not happen this time: the key is kept, and it is asked again. */
  readonly visitorNotMoved = signal(false);
  /** Whose progress is in memory (the IAM user id, AnotokiAuth.sub(), or VISITOR_OWNER). */
  private loadedFor: string | null = null;
  /** Leaving for the IAM on purpose: no "unsaved changes" question. */
  private leaving = false;
  /** The move on its way: answers whether it found the visitor. */
  private moving: Promise<boolean> | null = null;

  constructor() {
    // Signed in, signed out, or the person's claims anew - in this tab or another. (Another person signing in, or
    // anybody on a visitor's page, loads the page afresh: the family's module does that itself.)
    let looked = false;
    effect(() => {
      const key = this.auth.user()?.sub ?? null;
      untracked(() => {
        // The first look is at what the start found, and dealt with: only a change after it is news.
        if (!looked) {
          looked = true;
          return;
        }
        // Signed in again in the middle of practising, with a visitor key held (another tab visited meanwhile).
        if (this.status() === 'ready' && key !== null && key === this.loadedFor && this.visitorKey.current() !== null) {
          void this.moveVisitor().then((found) => {
            if (this.api.adoptOutbox(VISITOR_OWNER) > 0) this.store.retryUnsaved();
            if (found) this.store.reloadFromServer().catch((error: unknown) => console.error('The progress could not be loaded after the move.', error));
          });
        }
        if (this.store.hasUnsaved()) this.store.retryUnsaved();
      });
    });

    globalThis.addEventListener?.('beforeunload', (event: BeforeUnloadEvent) => {
      if (this.leaving || !(this.store.progressFailed() || this.store.pathFailed())) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  /**
   * Once, before the first page is drawn (app.config.ts - after it asked
   * where the site stands). Never throws: the status says what happened.
   */
  async start(): Promise<void> {
    // Never rejects: settings that could not be read leave the sign-in `unavailable`.
    await this.auth.init();

    // The language and its strings, before the signed-in test: the failure's
    // screen has them too. It never rejects - a bundle that does not come is
    // "no bundle", and the start goes on. Without the sign-in settings nothing
    // is asked for (shared/i18n/site-translations.ts's canAsk): the strings kept
    // from the last visit when there are any, the English kept in code
    // otherwise.
    await this.i18n.init();

    if (this.auth.state() === 'unavailable') {
      // Not set up (the family's status page says so), the site not ready, or the backend out of reach.
      if (this.site.state() === 'not-set-up') {
        this.status.set('not-set-up');
      } else if (this.site.blocked()) {
        this.status.set('waiting');
      } else {
        console.error('Failed to load the sign-in settings.');
        this.status.set('load-error');
      }
      return;
    }

    // The site is not ready: the sign-in is in place, the progress is not asked for (see the class).
    if (this.site.blocked()) {
      this.status.set('waiting');
      return;
    }
    await this.run();
  }

  /** The rest of the start: whose progress it is, and the progress. */
  private async run(): Promise<void> {
    if (this.auth.signedIn()) {
      this.loadedFor = this.auth.sub();
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
      // A 401 after which nobody is signed in any more means the sign-in is
      // over - or, for a visitor, that the IAM requires one now (the
      // interceptor said so: AnotokiAuth.noteSignInRequired()); with a session
      // left, the IAM could not be reached to renew it - that is the error
      // card's "Try again".
      if (error instanceof ApiError && error.status === 401 && !this.auth.signedIn()) {
        this.api.setDataOwner(null);
        this.loadedFor = null;
        this.status.set('sign-in');
        return;
      }
      // An update that came after the site was asked (or settings that went): the family's page says so.
      if (siteNotReady(error)) {
        this.site.report(error.code, typeof error.details?.['installed'] === 'boolean' ? error.details['installed'] : undefined);
        this.status.set('waiting');
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
      // The site is being updated: the move waits with everything else - the key kept, nothing to say (the status page says it).
      if (siteNotReady(error)) {
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
   * Before leaving a visitor's page for the IAM (the family's module asks it -
   * shared/auth/site-auth.ts - whoever starts the sign-in): the saves on their
   * way arrive first (as before signing out), so the move takes them along.
   * Always goes on.
   */
  async beforeSignIn(): Promise<boolean> {
    if (this.visiting()) await this.store.settle();
    return true;
  }

  /**
   * After an ADMIN's Apply on the Migrations page left nothing to apply (the
   * family's page calls it: onUpToDate, shared/state/site-migrations.ts): a
   * start that waited for the update goes on where it stopped - whose
   * progress it is, the move, the progress - and the app runs where it
   * stands, with no reload, so the page keeps saying what was applied. The
   * strings are asked for again at once (TranslationService.reload()): the
   * ones in memory are from before the update, without the keys it added (or
   * there are none: a database without its words yet), and nothing would ask
   * again by itself. Anything but a start that waited is left as it is; a
   * database still behind leaves it waiting.
   */
  async resumeAfterUpdate(): Promise<void> {
    if (this.status() !== 'waiting') return;
    this.status.set('loading');
    await this.run();
    if (this.status() === 'ready') void this.i18n.reload();
  }

  /**
   * To the IAM, and back to this page - or to `returnTo`: the family's closed
   * sign's Sign in at the staff route comes back to the start page, where the
   * site's ADMIN uses the site as it is - its pages in the language the app is
   * read in (shared/auth/site-auth.ts: only one that came with a bundle). A
   * visitor's saves arrive first (beforeSignIn()).
   */
  async signIn(returnTo?: string): Promise<void> {
    this.leaving = true;
    // Could not start: the page stays, and says why (AnotokiAuth.signInFailure).
    if (!(await (returnTo === undefined ? this.auth.signIn() : this.auth.signIn({ returnTo })))) {
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
    void this.auth.signOut();
  }
}

/**
 * The server's answer that the site is not ready: 503 update_pending, or not_set_up (the family's gate). (Never
 * maintenance here: the progress store and the move are reserved paths of the site settings, which keep answering while
 * the site is closed - a start that read the site closed waits before it asks for either.)
 */
function siteNotReady(error: unknown): error is ApiError & { code: 'update_pending' | 'not_set_up' } {
  return error instanceof ApiError && error.status === 503 && (error.code === 'update_pending' || error.code === 'not_set_up');
}
