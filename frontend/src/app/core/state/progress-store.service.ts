import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import { AppState, NoteState, PathProgress, ProgressMap, Session, SessionInput } from '../music/music.types';
import { SrsService } from '../music/srs.service';
import { TheoryService } from '../music/theory.service';

/** How long a failed save waits before it is tried again. */
export const RETRY_MS = 15000;

interface SaveLine {
  chain: Promise<void>;
  send: () => Promise<void>;
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
 * Nothing here runs before the state is loaded: saving the whole progress map
 * on top of a failed load would overwrite somebody's real progress with an
 * empty one.
 */
@Injectable({ providedIn: 'root' })
export class ProgressStore {
  private readonly api = inject(ApiService);
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

  private readonly lines: Record<'progress' | 'path', SaveLine> = {
    progress: { chain: Promise.resolve(), send: () => this.api.saveProgress(this.state().progress) },
    path: { chain: Promise.resolve(), send: () => this.api.savePath(this.state().path) },
  };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    globalThis.addEventListener?.('online', () => {
      if (this.hasUnsaved()) this.retryUnsaved();
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

  /** Replaces the note progress and saves it. The caller may keep changing its own object: a copy is kept. */
  saveProgress(updated: ProgressMap): Promise<void> {
    this.state.update((state) => ({ ...state, progress: { ...updated } }));
    return this.persist('progress');
  }

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
    saved.catch(() => this.scheduleRetry());
    return saved;
  }

  private persist(kind: 'progress' | 'path'): Promise<void> {
    const line = this.lines[kind];
    const failed = kind === 'progress' ? this.progressFailed : this.pathFailed;
    line.chain = line.chain.catch(() => {}).then(line.send).then(
      () => failed.set(false),
      (error: unknown) => {
        failed.set(true);
        this.scheduleRetry();
        throw error;
      },
    );
    return line.chain;
  }

  hasUnsaved(): boolean {
    return this.progressFailed() || this.pathFailed() || this.api.unsavedSessions() > 0;
  }

  scheduleRetry(): void {
    if (this.retryTimer === null && this.hasUnsaved()) {
      this.retryTimer = setTimeout(() => this.retryUnsaved(), RETRY_MS);
    }
  }

  /** Sends again whatever did not get through. */
  retryUnsaved(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (!this.loaded()) return;
    if (this.progressFailed()) this.persist('progress').catch(() => {});
    if (this.pathFailed()) this.persist('path').catch(() => {});
    this.api.retrySessions().catch(() => this.scheduleRetry());
  }

  /** Lets what is on its way arrive (before signing out); whatever does not stays in the outbox. */
  async settle(): Promise<void> {
    await Promise.allSettled([this.lines.progress.chain, this.lines.path.chain, this.api.retrySessions()]);
  }

  private addSession(saved: Session): void {
    this.state.update((state) => (state.sessions.some((s) => s.id === saved.id) ? state : { ...state, sessions: [...state.sessions, saved] }));
  }
}
