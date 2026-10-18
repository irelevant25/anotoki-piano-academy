import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiError, ApiService, VISITOR_OWNER, isProgressChanged } from '../api/api.service';
import { VisitorKey } from '../auth/visitor-key';
import { VISITOR_WORDS, visitorRefusalKey } from '../i18n/visitor-words';
import { AppState, NoteState, PathProgress, Session, SessionInput } from '../music/music.types';
import { SrsService } from '../music/srs.service';
import { TheoryService } from '../music/theory.service';

/** How long a failed save waits before it is tried again. */
export const RETRY_MS = 15000;

/**
 * The localStorage key (+ the person's id) a tab writes after it replaced the
 * person's progress (an import, an administrator deleting their own): the
 * person's other tabs hear it (the `storage` event) and load the progress
 * again before they save anything.
 */
export const PROGRESS_REPLACED_PREFIX = 'piano-academy:progress-replaced:';

interface SaveLine {
  chain: Promise<void>;
  send: () => Promise<void>;
}

/** When a failed save is tried again: RETRY_MS - or later, when the server said when (Retry-After). */
function retryDelay(error: unknown): number {
  return error instanceof ApiError && error.retryAfterMs !== null ? Math.max(RETRY_MS, error.retryAfterMs) : RETRY_MS;
}

/**
 * This person's progress in memory, and getting it to the server.
 *
 * Saves are chained so the PUTs reach the server in order; each one sends the
 * latest state when its turn comes, so the last write always wins with fresh
 * data. One that fails (the sign-in ran out, the network or the server is
 * down) is marked, and the latest state is sent again - after RETRY_MS, when
 * the browser is back online, and when the sign-in changes - until a save
 * gets through. Finished sessions go through ApiService's outbox.
 *
 * A visitor's save the server will not keep - the document is larger than a
 * visitor's may be (413 too_large), or a 422 visitor_limit - is not tried
 * again by itself: only with the next change (or after a sign-in), so it does
 * not go every RETRY_MS for ever; ApiService.visitorRefusal says why. A 429
 * (too many new visitors) is tried again after its Retry-After.
 *
 * One refusal is never sent again: 409 progress_changed - the progress was
 * replaced (an import, in another tab or on another computer) or deleted (by
 * an administrator) after this page loaded it. Sending the old documents
 * again would write the old progress back over it; instead the progress is
 * loaded again (reloadFromServer()) and `changedElsewhere` says why, for the
 * page to tell the learner. But not for a visitor whose key the server no
 * longer knows (VisitorKey.lost: swept after 30 days unused, or moved into an
 * account by a sign-in in another tab): their next save goes as a new
 * visitor's with the old generation and is refused so - that is the same
 * loss, and visitor.lost already says it; "replaced by a file or an
 * administrator" would be wrong.
 *
 * Nothing here runs before the state is loaded: saving the whole progress map
 * on top of a failed load would overwrite somebody's real progress with an
 * empty one.
 */
@Injectable({ providedIn: 'root' })
export class ProgressStore {
  private readonly api = inject(ApiService);
  private readonly visitorKey = inject(VisitorKey);
  private readonly srs = inject(SrsService);
  private readonly theory = inject(TheoryService);

  readonly state = signal<AppState>({ progress: {}, sessions: [], path: { steps: {} } });
  readonly loaded = signal(false);

  readonly progress = computed(() => this.state().progress);
  readonly sessions = computed(() => this.state().sessions);
  readonly pathProgress = computed(() => this.state().path);
  readonly knownNotes = computed(() => this.srs.getKnownNotes(this.progress(), this.theory.curriculum));

  readonly progressFailed = signal(false);
  readonly pathFailed = signal(false);
  /** Something is not on the server yet: a failed save, or sessions in the outbox. */
  readonly unsaved = computed(() => this.loaded() && (this.progressFailed() || this.pathFailed() || this.api.unsavedSessions() > 0));
  /**
   * The progress on the server was replaced or deleted somewhere else, and
   * this page has loaded it again (or is trying to): what it held was not
   * saved over it. The shell says so until the learner closes the note.
   */
  readonly changedElsewhere = signal(false);

  // A save whose turn comes while the progress is being loaded again waits for that load: the generation and
  // the documents then change together, so the old documents never go out under the new generation.
  private readonly lines: Record<'progress' | 'path', SaveLine> = {
    progress: { chain: Promise.resolve(), send: async () => this.api.saveProgress((await this.afterReload()).progress) },
    path: { chain: Promise.resolve(), send: async () => this.api.savePath((await this.afterReload()).path) },
  };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** A visitor's documents the server would not keep: sent again only with the next change, not by a retry. */
  private readonly heldBack = new Set<'progress' | 'path'>();
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private reloading: Promise<void> | null = null;
  /** Answers given while the progress is being loaded again: made again on what that load gives. */
  private changesDuringReload: { midi: number; change: (current: NoteState) => NoteState }[] = [];

  constructor() {
    globalThis.addEventListener?.('online', () => {
      if (this.hasUnsaved()) this.retryUnsaved();
    });
    // Another tab of this person replaced the progress: load it before anything here is saved over it.
    globalThis.addEventListener?.('storage', (event: StorageEvent) => {
      const owner = this.api.dataOwner();
      if (this.loaded() && owner !== null && event.key === PROGRESS_REPLACED_PREFIX + owner && event.newValue !== null) {
        this.progressChanged();
      }
    });
  }

  /** The state GET /api/state gave: the app can run from here on. */
  load(state: AppState): void {
    this.state.set({
      progress: this.srs.repairInflatedProgress(state.progress ?? {}),
      sessions: Array.isArray(state.sessions) ? state.sessions : [],
      path: state.path?.steps ? state.path : { steps: {} },
    });
    this.api.onSessionSaved((session) => this.addSession(session));
    this.loaded.set(true);
    // Sessions an earlier page load could not send are still in the outbox.
    if (this.api.unsavedSessions() > 0) this.retryUnsaved();
  }

  /** A note's state, or a fresh one for a note never played. */
  noteState(midi: number): NoteState {
    return this.progress()[midi] ?? this.srs.createInitialNoteState(midi);
  }

  /**
   * One note was answered: `change` gets the note's state as the store holds
   * it NOW (a fresh one for a note never played) and gives the new one, which
   * goes into the store's current map; then the map is saved. An answer given
   * while the progress is being loaded again is made again on what the load
   * gives.
   *
   * There is no "save this whole map": a page that kept its own copy of the
   * progress for a round and handed it back would, after a reload in the
   * middle of the round (an import, an administrator's delete, a 409), save
   * the old progress under the new generation - and the server would take it.
   */
  updateNote(midi: number, change: (current: NoteState) => NoteState): Promise<void> {
    if (this.reloading) this.changesDuringReload.push({ midi, change });
    this.applyChange(midi, change);
    return this.persist('progress');
  }

  private applyChange(midi: number, change: (current: NoteState) => NoteState): void {
    this.state.update((state) => ({
      ...state,
      progress: { ...state.progress, [midi]: change(state.progress[midi] ?? this.srs.createInitialNoteState(midi)) },
    }));
  }

  /** The path's document, worked out by the caller from pathProgress() just now - never from a copy kept for longer. */
  savePathProgress(updated: PathProgress): Promise<void> {
    this.state.update((state) => ({ ...state, path: updated }));
    return this.persist('path');
  }

  /**
   * Through the outbox: kept until the server has it. The stored session
   * reaches the state through onSessionSaved (see load()).
   */
  recordSession(session: SessionInput): Promise<Session> {
    const saved = this.api.recordSession(session);
    saved.catch((error: unknown) => this.scheduleRetry(retryDelay(error)));
    return saved;
  }

  private persist(kind: 'progress' | 'path'): Promise<void> {
    const line = this.lines[kind];
    const failed = kind === 'progress' ? this.progressFailed : this.pathFailed;
    line.chain = line.chain
      .catch(() => {})
      .then(line.send)
      .then(
        () => {
          failed.set(false);
          this.heldBack.delete(kind);
        },
        (error: unknown) => {
          if (isProgressChanged(error)) {
            // Never sent again: the progress on the server is another one now.
            failed.set(false);
            this.heldBack.delete(kind);
            this.progressChanged();
          } else if (this.visitorCannotKeep(error)) {
            // "Not saved yet" - and sent again with the next change, not every RETRY_MS for ever.
            failed.set(true);
            this.heldBack.add(kind);
          } else {
            // A 428 too: the header did not reach the server (a proxy that drops it?) - kept as "Not saved yet".
            if (error instanceof ApiError && error.status === 428) console.error('The save reached the server without its Progress-Generation header.', error);
            failed.set(true);
            this.heldBack.delete(kind);
            this.scheduleRetry(retryDelay(error));
          }
          throw error;
        },
      );
    return line.chain;
  }

  /** A visitor's save the server will not keep however often it is sent (413 too_large, 422 visitor_limit). */
  private visitorCannotKeep(error: unknown): boolean {
    return this.api.dataOwner() === VISITOR_OWNER && error instanceof ApiError && visitorRefusalKey(error.status, error.code ?? undefined) === VISITOR_WORDS.full;
  }

  /** The progress was replaced or deleted elsewhere: load it again, say so, and try again later when that fails. */
  private progressChanged(): void {
    if (!(this.api.dataOwner() === VISITOR_OWNER && this.visitorKey.lost())) this.changedElsewhere.set(true);
    this.reloadFromServer().catch((error: unknown) => {
      console.error('The progress could not be loaded again.', error);
      if (this.reloadTimer === null) {
        this.reloadTimer = setTimeout(() => {
          this.reloadTimer = null;
          this.progressChanged();
        }, RETRY_MS);
      }
    });
  }

  /**
   * Loads the person's progress from the server again, in the place of what
   * is in memory (and with it the generation the next saves name) - after an
   * import here, or a 409 progress_changed. Rejects when it could not be
   * loaded; what is in memory stays then.
   */
  reloadFromServer(): Promise<void> {
    if (this.reloading) return this.reloading;
    this.reloading = (async () => {
      try {
        const state = await this.api.fetchState();
        this.progressFailed.set(false);
        this.pathFailed.set(false);
        this.heldBack.clear();
        this.load(state);
        for (const { midi, change } of this.changesDuringReload) this.applyChange(midi, change);
      } finally {
        this.reloading = null;
        this.changesDuringReload = [];
      }
    })();
    return this.reloading;
  }

  /** The state to save: the one now, or - while the progress is being loaded again - the one that load gives. */
  private async afterReload(): Promise<AppState> {
    while (this.reloading) await this.reloading.catch(() => undefined);
    return this.state();
  }

  /** Tells this person's other tabs that their progress was replaced: they load it again (see the constructor). */
  announceReplaced(): void {
    const owner = this.api.dataOwner();
    if (owner === null) return;
    try {
      localStorage.setItem(PROGRESS_REPLACED_PREFIX + owner, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    } catch {
      // A browser that keeps nothing: the other tabs hear it from the server instead (409 on their next save).
    }
  }

  hasUnsaved(): boolean {
    return this.progressFailed() || this.pathFailed() || this.api.unsavedSessions() > 0;
  }

  /**
   * What signing out now would lose: a progress or path save that has not got
   * through (they live in this page only), or finished rounds the browser
   * could not keep in its storage. Rounds in the outbox are kept and sent
   * after the next sign-in.
   */
  wouldLoseOnSignOut(): boolean {
    return this.progressFailed() || this.pathFailed() || (this.api.unsavedSessions() > 0 && !this.api.outboxKept());
  }

  scheduleRetry(delay = RETRY_MS): void {
    if (this.retryTimer === null && this.hasUnsaved()) {
      this.retryTimer = setTimeout(() => this.retryUnsaved(), delay);
    }
  }

  /** Sends again whatever did not get through - but a visitor's documents the server would not keep (see the class). */
  retryUnsaved(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (!this.loaded()) return;
    if (this.progressFailed() && !this.heldBack.has('progress')) this.persist('progress').catch(() => {});
    if (this.pathFailed() && !this.heldBack.has('path')) this.persist('path').catch(() => {});
    this.api.retrySessions().catch((error: unknown) => this.scheduleRetry(retryDelay(error)));
  }

  /**
   * Before signing out: a failed save goes once more, and what is on its way
   * arrives. Whatever does not get through is still marked failed (see
   * wouldLoseOnSignOut()); rounds stay in the outbox.
   */
  async settle(): Promise<void> {
    if (this.loaded()) {
      if (this.progressFailed()) this.persist('progress').catch(() => {});
      if (this.pathFailed()) this.persist('path').catch(() => {});
    }
    await Promise.allSettled([this.lines.progress.chain, this.lines.path.chain, this.api.retrySessions()]);
  }

  private addSession(saved: Session): void {
    this.state.update((state) => (state.sessions.some((s) => s.id === saved.id) ? state : { ...state, sessions: [...state.sessions, saved] }));
  }
}
