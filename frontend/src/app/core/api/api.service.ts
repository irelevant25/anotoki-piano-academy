import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LanguageChanges, NewLanguage, OwnerLanguage, TranslationChanges, TranslationGrid } from '../i18n/translation.model';
import { AppState, PathProgress, ProgressMap, Session, SessionInput } from '../music/music.types';

// The backend's API. Every call carries the access token in auth mode 'iam'
// (auth.interceptor.ts), and none of it without sign-in.
//
// Saves are fire-and-forget during play, so a failed one must not be lost:
//  - A finished session goes into an outbox (localStorage, one per user)
//    before it is sent, and leaves it only once the server has stored it. If
//    sending fails - the sign-in ran out and could not be renewed, the network
//    or the server was down - it waits there and is sent again
//    (retrySessions()), also after a reload or the next sign-in. Its
//    Idempotency-Key makes the server store it once, however often it arrives.
//  - Progress and path are whole documents: the next save carries the latest
//    state anyway, and ProgressStore retries a failed one.
//  - Nothing is ever sent for another user than the one the page loaded:
//    after a sign-out or an account switch in another tab, calls stop.

const OUTBOX_PREFIX = 'piano-learning:unsaved-sessions:';

/**
 * A call that did not work: the HTTP status (0 = no answer), the server's
 * code, and whether it was refused for being the wrong user.
 *
 * `details` is the answer's body when it is an object: the server's own
 * English sentence (`error`) and, for a string that was refused, the key and
 * the language it is about (`key`, `language`). Only the owner's two pages
 * read it - they are English; a learner's page words a failure itself and
 * never shows the server's sentence.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly wrongUser = false,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

/** An answer's body as `details`: a plain object - not a list, not a text, not the browser's own error for "no answer". */
function bodyDetails(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const kind: unknown = Object.getPrototypeOf(body);
  return kind === Object.prototype || kind === null ? (body as Record<string, unknown>) : null;
}

interface OutboxEntry {
  key: string;
  session: SessionInput;
  queuedAt: string;
}

interface Waiter {
  resolve: (session: Session) => void;
  reject: (error: unknown) => void;
}

function newKey(): string {
  // randomUUID() needs a secure context: http://127.0.0.1 is one, a LAN address is not.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A 4xx that sending again cannot fix: the server will never take this session. */
function isRefused(error: unknown): boolean {
  return error instanceof ApiError && [400, 413, 415, 422].includes(error.status);
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** userKey() when the page loaded its state. */
  private owner: string | null = null;
  /** Used when localStorage refuses. */
  private readonly memoryOutbox = new Map<string, OutboxEntry[]>();
  /** Outbox entry key -> the recordSession() promise waiting on it. */
  private readonly waiters = new Map<string, Waiter>();
  private flushing: Promise<void> | null = null;
  private onSaved: (session: Session) => void = () => {};

  /** How many finished sessions are not on the server yet. */
  readonly unsavedSessions = signal(0);

  constructor() {
    // Another tab may send (or queue) a session of the same person: the count
    // follows the outbox wherever it changes.
    globalThis.addEventListener?.('storage', (event: StorageEvent) => {
      if (this.owner !== null && event.key === this.outboxKey()) {
        this.unsavedSessions.set(this.loadOutbox().length);
      }
    });
  }

  /** Whose data this page loaded; every later call must be for the same user. */
  setDataOwner(key: string | null): void {
    this.owner = key;
    this.unsavedSessions.set(this.owner === null ? 0 : this.loadOutbox().length);
  }

  private async request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const current = this.auth.userKey();
    if (this.owner === null || current !== this.owner) {
      // Signed out (the IAM session ended), or signed in as somebody else in another tab.
      throw current === null
        ? new ApiError('Not signed in', 401)
        : new ApiError('Signed in as somebody else', 409, null, true);
    }
    try {
      return await firstValueFrom(this.http.request<T>(method, url, { body, headers }));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const details = bodyDetails(error.error);
        const code = typeof details?.['code'] === 'string' ? details['code'] : null;
        throw new ApiError(`${method} ${url} failed: ${error.status}`, error.status, code, false, details);
      }
      throw error;
    }
  }

  fetchState(): Promise<AppState> {
    return this.request<AppState>('GET', '/api/state');
  }

  async saveProgress(progress: ProgressMap): Promise<void> {
    await this.request('PUT', '/api/progress', progress);
  }

  async savePath(path: PathProgress): Promise<void> {
    await this.request('PUT', '/api/path', path);
  }

  // --- the app's own words: the owner's two pages (the server lets nobody else in) ---

  /** Every language, the hidden ones too. */
  async languages(): Promise<OwnerLanguage[]> {
    return (await this.request<{ languages: OwnerLanguage[] }>('GET', '/api/owner/languages')).languages;
  }

  /**
   * A new language, sorted last - and offered to readers at once only when
   * `enabled` says so: one with no strings yet reads in English throughout, so
   * the page that adds it says which it is, every time.
   * ApiError 409 `language_exists`, 422 `invalid_language` or `too_many_languages`.
   */
  async createLanguage(language: NewLanguage & { enabled: boolean }): Promise<OwnerLanguage> {
    return (await this.request<{ language: OwnerLanguage }>('POST', '/api/owner/languages', language)).language;
  }

  /** Its names, its place, whether it is offered. ApiError 409 `fallback_language` for switching English off. */
  async updateLanguage(code: string, changes: LanguageChanges): Promise<OwnerLanguage> {
    return (await this.request<{ language: OwnerLanguage }>('PUT', `/api/owner/languages/${encodeURIComponent(code)}`, changes)).language;
  }

  /** Its strings go with it. ApiError 409 `fallback_language` for English, `seeded_language` for a language the app is released in. */
  async deleteLanguage(code: string): Promise<void> {
    await this.request('DELETE', `/api/owner/languages/${encodeURIComponent(code)}`);
  }

  /** Every key with its string in every language. */
  translationGrid(): Promise<TranslationGrid> {
    return this.request<TranslationGrid>('GET', '/api/owner/translations');
  }

  /** Saves the cells that changed, all or none; answers the grid as it is now, other people's changes included. */
  saveTranslations(values: TranslationChanges): Promise<TranslationGrid> {
    return this.request<TranslationGrid>('PUT', '/api/owner/translations', { values });
  }

  /** One language's own strings as a flat {key: text} map - not merged with English. */
  exportTranslations(code: string): Promise<Record<string, string>> {
    return this.request<Record<string, string>>('GET', `/api/owner/translations/${encodeURIComponent(code)}/export`);
  }

  /** The way back: a flat {key: text} map, checked like a save; unknown keys are refused, blank values skipped. */
  importTranslations(code: string, values: Record<string, string>): Promise<TranslationGrid> {
    return this.request<TranslationGrid>('PUT', `/api/owner/translations/${encodeURIComponent(code)}/import`, values);
  }

  // --- the session outbox ---

  private outboxKey(): string {
    return OUTBOX_PREFIX + this.owner;
  }

  private loadOutbox(): OutboxEntry[] {
    try {
      const list = JSON.parse(localStorage.getItem(this.outboxKey()) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return this.memoryOutbox.get(this.outboxKey()) ?? [];
    }
  }

  private storeOutbox(list: OutboxEntry[]): void {
    this.memoryOutbox.set(this.outboxKey(), list);
    try {
      if (list.length) localStorage.setItem(this.outboxKey(), JSON.stringify(list));
      else localStorage.removeItem(this.outboxKey());
    } catch {
      // kept in memory until the page closes
    }
    this.unsavedSessions.set(list.length);
  }

  /**
   * Records a finished session: into the outbox first, then to the server.
   * Resolves with the stored session; rejects if it could not be sent now - it
   * then stays in the outbox and is sent later.
   */
  recordSession(session: SessionInput): Promise<Session> {
    const entry: OutboxEntry = { key: newKey(), session, queuedAt: new Date().toISOString() };
    this.storeOutbox([...this.loadOutbox(), entry]);
    const result = new Promise<Session>((resolve, reject) => this.waiters.set(entry.key, { resolve, reject }));
    this.retrySessions().catch(() => {});
    return result;
  }

  /**
   * Sends what waits in the outbox, oldest first, one at a time, and stops at
   * the first failure that sending again could fix. Resolves when the outbox is
   * empty; rejects while something still waits.
   */
  retrySessions(): Promise<void> {
    if (this.owner === null) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      try {
        for (;;) {
          const [entry] = this.loadOutbox(); // read again each time: another tab may have sent it
          if (!entry) return;
          const waiter = this.waiters.get(entry.key);
          let saved: Session;
          try {
            saved = await this.request<Session>('POST', '/api/sessions', entry.session, { 'Idempotency-Key': entry.key });
          } catch (error) {
            if (!isRefused(error)) throw error;
            console.error('The server refused a session; it is dropped.', entry.session, error);
            this.storeOutbox(this.loadOutbox().filter((e) => e.key !== entry.key));
            this.waiters.delete(entry.key);
            waiter?.reject(error);
            continue;
          }
          this.storeOutbox(this.loadOutbox().filter((e) => e.key !== entry.key));
          this.waiters.delete(entry.key);
          this.onSaved(saved);
          waiter?.resolve(saved);
        }
      } catch (error) {
        // Everything still waiting stays in the outbox; its callers hear it now.
        for (const [key, waiter] of this.waiters) {
          this.waiters.delete(key);
          waiter.reject(error);
        }
        throw error;
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /** Called with each session once the server has stored it (also ones from an earlier page load). */
  onSessionSaved(listener: (session: Session) => void): void {
    this.onSaved = listener;
  }
}
