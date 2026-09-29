import { Injectable, inject, signal } from '@angular/core';
import { ApiError, ApiService } from '../api/api.service';
import { AuthService, NotSetUpError } from '../auth/auth.service';
import { MidiService } from '../midi/midi.service';
import { ProgressStore } from './progress-store.service';

/**
 * Where the app is while it starts:
 *   loading      the sign-in settings and the progress are on their way
 *   not-set-up   the backend has no settings yet (or its database needs an update): /setup.php
 *   sign-in      auth mode 'iam' and nobody signed in
 *   load-error   the progress could not be loaded - and the app does not run without it
 *   ready        the progress is in memory; the views run
 */
export type BootStatus = 'loading' | 'not-set-up' | 'sign-in' | 'load-error' | 'ready';

/**
 * The start of the app, in the order that keeps progress safe: sign-in first
 * (in auth mode 'iam' every API call needs the token), then the person's
 * state. Any failure stops it with a card saying so - it never runs on empty
 * state, because the first save would overwrite the real progress with it.
 *
 * Also here: another person signing in in another tab reloads this one (it
 * holds the other person's progress), and leaving the page with a save that
 * did not get through asks first (auth mode 'iam' only).
 */
@Injectable({ providedIn: 'root' })
export class BootService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly store = inject(ProgressStore);
  private readonly midi = inject(MidiService);

  readonly status = signal<BootStatus>('loading');
  /** What the backend said is missing, when it said it (to this computer only). */
  readonly notSetUpDetail = signal<string | null>(null);
  /** Whose progress is in memory (AuthService.userKey()). */
  private loadedFor: string | null = null;
  /** Leaving for the IAM on purpose: no "unsaved changes" question. */
  private leaving = false;

  constructor() {
    this.auth.onAuthChange(() => {
      // Somebody else signed in in another tab: this page holds the other person's progress.
      const key = this.auth.userKey();
      if (this.status() === 'ready' && key !== null && key !== this.loadedFor) {
        this.leaving = true;
        location.reload();
        return;
      }
      if (this.store.hasUnsaved()) this.store.retryUnsaved();
    });

    globalThis.addEventListener?.('beforeunload', (event: BeforeUnloadEvent) => {
      if (!this.auth.usesSignIn() || this.leaving || !(this.store.progressFailed() || this.store.pathFailed())) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  /** Once, before the first page is drawn (app.config.ts). Never throws: the status says what happened. */
  async start(): Promise<void> {
    try {
      await this.auth.init();
    } catch (error) {
      if (error instanceof NotSetUpError) {
        this.notSetUpDetail.set(error.detail);
        this.status.set('not-set-up');
        return;
      }
      console.error('Failed to load the sign-in settings.', error);
      this.status.set('load-error');
      return;
    }

    if (!this.auth.signedIn()) {
      this.status.set('sign-in');
      return;
    }

    this.loadedFor = this.auth.userKey();
    this.api.setDataOwner(this.loadedFor);
    try {
      this.store.load(await this.api.fetchState());
    } catch (error) {
      // A 401 after which the SDK holds no session any more means the sign-in
      // is over; with a session left, the IAM could not be reached to renew it
      // - that is the error card's "Try again".
      if (error instanceof ApiError && error.status === 401 && !this.auth.signedIn()) {
        this.status.set('sign-in');
        return;
      }
      if (error instanceof ApiError && error.code === 'not_set_up') {
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

  signIn(): void {
    this.leaving = true;
    this.auth.signIn();
  }

  /** Lets what is on its way arrive first; whatever does not stays in the outbox for the next sign-in. */
  async signOut(): Promise<void> {
    await this.store.settle();
    this.leaving = true;
    this.auth.signOut();
  }
}
