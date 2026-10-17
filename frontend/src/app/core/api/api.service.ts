import { HttpClient, HttpContext, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { AnotokiAuth, CARRIES_VISITOR_KEY, Caller, ISSUED_AS, VISITOR_KEY_HEADER } from '@anotoki/lib/auth';
import { firstValueFrom, map } from 'rxjs';
import { VisitorKey } from '../auth/visitor-key';
import { visitorRefusalKey } from '../i18n/visitor-words';
import { AppState, PathProgress, ProgressMap, Session, SessionInput } from '../music/music.types';
import { writeStorage } from '../util/storage';

// The backend's API. Every call goes through here, for the owner of the data
// the page loaded (setDataOwner()), and says as it is ISSUED whom it is for -
// a person's or a visitor's (ISSUED_AS, the anotoki family's HttpContext token
// its interceptor reads: @anotoki/lib/auth) - from that owner, never from
// whether a token happens to be there when it leaves:
//  - A person's page (the owner is their IAM user id): the person's access
//    token (the family's anotokiAuthInterceptor). Signed out meanwhile (the IAM session ended,
//    a sign-out in another tab), nothing is sent: 401 sign_in_required here,
//    whatever the IAM's switch says - a person's data never goes out as a
//    visitor's, and never makes one. Signed in as somebody else: 409, wrongUser.
//  - A visitor's page (the owner is VISITOR_OWNER: nobody signed in, and the
//    IAM said no sign-in is required): the visitor key, if this browser holds
//    one (core/auth/visitor-key.ts) - only the state and the three saves; the
//    own file and the move are a person's (refused here, 401, not sent).
//    Nobody's state is generation 0, and the first save of somebody
//    without a key makes the visitor (backend/api/visitors.php): its answer
//    brings the key and the visitor's first generation. A progress PUT, a path
//    PUT and a round's POST at the end of a round would make three visitors,
//    so the first save without a key is the one "maker" and the others wait
//    for it, then go with the key and the generation it brought (a maker that
//    failed: the next one makes) - here, not in the interceptor: a waiting
//    save writes its generation header only once the maker is back. A
//    sign-in required meanwhile (the API said so - AnotokiAuth.noteSignInRequired()):
//    nothing more is sent, the key is kept for the next sign-in's move
//    (moveVisitor()).
//
// Saves are fire-and-forget during play, so a failed one must not be lost:
//  - A finished session goes into an outbox (localStorage, one per user)
//    before it is sent, and leaves it only once the server has stored it. If
//    sending fails - the sign-in ran out and could not be renewed, the network
//    or the server was down - it waits there and is sent again
//    (retrySessions()), also after a reload or the next sign-in. Its
//    Idempotency-Key makes the server store it once, however often it arrives.
//  - Progress and path are whole documents: the next save carries the latest
//    state anyway, and ProgressStore retries a failed one. Each save names the
//    generation of the progress the page loaded (the Progress-Generation
//    header, from GET /api/state): after an import or an administrator's
//    delete the server refuses it (409 progress_changed) instead of writing
//    the old documents back - ProgressStore then loads the progress again.
//  - Nothing is ever sent for another user than the one the page loaded:
//    after a sign-out or an account switch in another tab, calls stop.
//  - A visitor's refusals that sending again cannot fix soon (413 too_large,
//    422 visitor_limit, 429 too_many_visitors) are kept in `visitorRefusal`
//    for the page to word; after a 429 no new visitor is asked for before its
//    Retry-After (refused here meanwhile, with the time left).

/** The outbox's localStorage key, before the page's owner (a person's id, or VISITOR_OWNER) - the Privacy page names it. */
export const OUTBOX_PREFIX = 'piano-learning:unsaved-sessions:';

/** The header a save of a whole document names its generation in (the backend's GENERATION_HEADER). */
export const GENERATION_HEADER = 'Progress-Generation';

/** The data owner of a visitor's page - never an IAM user id (those are numbers). */
export const VISITOR_OWNER = 'visitor';

/** How long no new visitor is asked for after a 429 without a Retry-After the page could read. */
const MAKER_PAUSE_MS = 60_000;

/** The saves that make a visitor when they are sent without a key. */
const MAKING_WRITES = new Set(['PUT /api/progress', 'PUT /api/path', 'POST /api/sessions']);

/**
 * POST /api/visitor/move: what the move after a sign-in did. `found` false:
 * the server knows no such visitor (moved in another tab, or swept) -
 * nothing to say. Notes the account had already stay the account's (`kept`);
 * a path step both had is merged (`merged`); `kept` there too when the merge
 * would have been too large. `generation`: the person's progress after it, or
 * null when nothing was found.
 */
export interface VisitorMove {
  found: boolean;
  notes: { moved: number; kept: number };
  steps: { moved: number; merged: number; kept: number };
  sessions: number;
  generation: number | null;
}

/** How a call is issued: its headers (a function: worked out only when it is sent), a person's only, the move's key. */
interface Call {
  headers?: Record<string, string> | (() => Record<string, string>);
  /** The own file, the move: never a visitor's (refused here, 401, nothing sent). */
  asPerson?: boolean;
  /** The move: a person's request with the visitor key the call set itself. */
  carriesKey?: boolean;
}

/**
 * The largest progress file, both ways: what GET /api/me/export hands out and
 * what POST /api/me/import takes (the backend's EXPORT_LIMIT, 5 MiB). A file
 * over it is refused here, before it is sent.
 */
export const EXPORT_LIMIT = 5 * 1024 * 1024;

/**
 * A call that did not work: the HTTP status (0 = no answer), the server's
 * code, and whether it was refused for being the wrong user.
 *
 * `details` is the answer's body when it is an object: the server's own
 * English sentence (`error`) and, for a string that was refused, the key and
 * the language it is about (`key`, `language`). Only the admin pages read the
 * sentence - they are English; a learner's page words a failure itself, from
 * the code, and never shows the server's sentence.
 *
 * `retryAfterMs`: the answer's Retry-After (seconds) in milliseconds, when it
 * had one.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly wrongUser = false,
    readonly details: Record<string, unknown> | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}

/** Nobody signed in for a person's call - refused here, nothing sent (the API would say the same). */
function notSignedIn(): ApiError {
  return new ApiError('Not signed in', 401, 'sign_in_required');
}

/** A Retry-After of seconds, in milliseconds (an HTTP date is not read). */
function retryAfter(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

/** Counts of one person's progress: notes with a state, steps of the path, rounds played. */
export interface ProgressCounts {
  notes: number;
  steps: number;
  sessions: number;
}

/** POST /api/me/import?dryRun=true: what an import would do - nothing is written. */
export interface ImportPreview {
  dryRun: true;
  /** The account has progress: bringing the file in replaces it, and is asked for. */
  hasProgress: boolean;
  current: ProgressCounts;
  incoming: ProgressCounts;
  /** Rounds in the file the server will not take (they are left out). */
  leftOut: number;
}

/** POST /api/me/import: what came in. */
export interface ImportResult extends ProgressCounts {
  replaced: boolean;
  generation: number;
  leftOut: number;
}

/** GET /api/me/export: the file, and the name to save it under. */
export interface ProgressFile {
  name: string;
  text: string;
}

/** An answer's body as `details`: a plain object - not a list, not a text, not the browser's own error for "no answer". */
function bodyDetails(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    // A call that asked for text (the progress file) gets its refusal as text: the API's JSON all the same.
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
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

/**
 * The progress was replaced or deleted after this page loaded it (409
 * progress_changed - also the local one when the page holds no generation to
 * name): sending the documents again can never work; the page has to load the
 * progress again. Not a 428 generation_required: this app never sends a save
 * without the header, so a 428 means something between the browser and the
 * server dropped it - a failed save ("Not saved yet"), not a change elsewhere.
 */
export function isProgressChanged(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'progress_changed';
}

/** The name the server gave a file (Content-Disposition), when it gave a plain one. */
function fileName(disposition: string | null): string | null {
  const found = /filename="([A-Za-z0-9._-]+)"/.exec(disposition ?? '');
  return found ? found[1] : null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AnotokiAuth);
  private readonly visitorKey = inject(VisitorKey);

  /** The IAM user id signed in when the page loaded its state (AnotokiAuth.subject()) - or VISITOR_OWNER on a visitor's page. */
  private readonly _owner = signal<string | null>(null);
  /**
   * The generation of the progress the page loaded (GET /api/state); every
   * whole-document save names it. 0: nobody's (a visitor's page before the
   * first save made the visitor).
   */
  private generation: number | null = null;
  /** The visitor's first save on its way (a "maker", sent without a key): the other saves wait for it. */
  private making: Promise<unknown> | null = null;
  /** No new visitor is asked for before this time (after a 429 too_many_visitors). */
  private makersPausedUntil = 0;
  /** Used when localStorage refuses. */
  private readonly memoryOutbox = new Map<string, OutboxEntry[]>();
  /** Outbox entry key -> the recordSession() promise waiting on it. */
  private readonly waiters = new Map<string, Waiter>();
  private flushing: Promise<void> | null = null;
  /** The browser refused its storage for the outbox: what waits lives in this page only. */
  private outboxInMemory = false;
  private onSaved: (session: Session) => void = () => {};

  /** How many finished sessions are not on the server yet. */
  readonly unsavedSessions = signal(0);
  /**
   * Whose data this page loaded: the IAM user id then, VISITOR_OWNER on a visitor's
   * page, or null (nothing loaded). Every later call must be for the same.
   */
  readonly dataOwner = this._owner.asReadonly();
  /**
   * The key of the words for the last refused save of a visitor's that
   * sending again cannot fix soon (VISITOR_WORDS.full: 413 too_large, 422
   * visitor_limit; VISITOR_WORDS.busy: 429 too_many_visitors) - null again
   * once a visitor's save gets through. The page words it.
   */
  readonly visitorRefusal = signal<string | null>(null);

  constructor() {
    // Another tab may send (or queue) a session of the same person: the count
    // follows the outbox wherever it changes.
    globalThis.addEventListener?.('storage', (event: StorageEvent) => {
      if (this._owner() !== null && event.key === this.outboxKey()) {
        this.unsavedSessions.set(this.loadOutbox().length);
      }
    });
  }

  /** Whose data this page loaded (a person's IAM user id, or VISITOR_OWNER); every later call must be for the same. */
  setDataOwner(key: string | null): void {
    this._owner.set(key);
    this.unsavedSessions.set(key === null ? 0 : this.loadOutbox().length);
  }

  /**
   * Whom a call of this page is for, now - or why it is not sent at all: a
   * person's page whose person is signed out (401, whatever the IAM's switch
   * says: never a visitor's instead) or is somebody else now (409
   * wrongUser); a visitor's page that somebody signed in on meanwhile (409
   * wrongUser - the page loads again), or where a sign-in is required now,
   * or a person's call on it (401).
   */
  private gate(asPerson = false): Caller {
    const owner = this._owner();
    const current = this.auth.subject();
    if (owner === VISITOR_OWNER) {
      if (current !== null) throw new ApiError('Signed in as somebody else', 409, null, true);
      if (asPerson || this.auth.loginRequired()) throw notSignedIn();
      return 'visitor';
    }
    if (owner === null || current !== owner) {
      // Signed out (the IAM session ended), or signed in as somebody else in another tab.
      throw current === null ? notSignedIn() : new ApiError('Signed in as somebody else', 409, null, true);
    }
    return 'person';
  }

  private failed(method: string, url: string, error: unknown): unknown {
    if (error instanceof HttpErrorResponse) {
      const details = bodyDetails(error.error);
      const code = typeof details?.['code'] === 'string' ? details['code'] : null;
      return new ApiError(`${method} ${url} failed: ${error.status}`, error.status, code, false, details, retryAfter(error.headers?.get('Retry-After')));
    }
    return error;
  }

  /** A call: who it is for is decided here, as it is issued - before anything waits or is sent. */
  private request<T>(method: string, url: string, body?: unknown, call: Call = {}): Promise<T> {
    let caller: Caller;
    try {
      caller = this.gate(call.asPerson);
    } catch (error) {
      return Promise.reject(error);
    }
    return caller === 'visitor' && MAKING_WRITES.has(`${method} ${url}`) ? this.visitorSave<T>(method, url, body, call) : this.send<T>(method, url, body, call, caller);
  }

  /** A visitor's save: one without a key at a time (see the top of this file). */
  private async visitorSave<T>(method: string, url: string, body: unknown, call: Call): Promise<T> {
    let caller = this.gate(call.asPerson);
    while (this.making) {
      await this.making.catch(() => undefined);
      caller = this.gate(call.asPerson);
    }
    if (this.visitorKey.current() !== null) {
      return this.send<T>(method, url, body, call, caller);
    }
    const left = this.makersPausedUntil - Date.now();
    if (left > 0) {
      throw new ApiError(`${method} ${url}: no new visitor yet`, 429, 'too_many_visitors', false, null, left);
    }
    const made = this.send<T>(method, url, body, call, caller);
    this.making = made;
    // Registered before any waiter's: when they wake, the maker is gone (and the first of them may make).
    const done = (): void => {
      if (this.making === made) this.making = null;
    };
    made.then(done, done);
    return made;
  }

  private async send<T>(method: string, url: string, body: unknown, call: Call, caller: Caller): Promise<T> {
    try {
      // Worked out now, after any wait: a save names the generation the page holds when it leaves.
      const headers = typeof call.headers === 'function' ? call.headers() : (call.headers ?? {});
      const context = new HttpContext().set(ISSUED_AS, caller).set(CARRIES_VISITOR_KEY, call.carriesKey === true);
      return await firstValueFrom(
        this.http.request<T>(method, url, { body, headers, context, observe: 'response' }).pipe(
          map((response) => {
            if (caller === 'visitor' && method !== 'GET') this.visitorSaved(response);
            return response.body as T;
          }),
        ),
      );
    } catch (error) {
      const failure = this.failed(method, url, error);
      if (caller === 'visitor') this.visitorRefused(failure);
      throw failure;
    }
  }

  /** A visitor's save got through: a refusal before it is over; the answer that made the visitor names its generation. */
  private visitorSaved(response: HttpResponse<unknown>): void {
    this.visitorRefusal.set(null);
    const generation = Number(response.headers.get(GENERATION_HEADER));
    // Only over nobody's 0: a page that loaded a visitor's progress keeps the generation it loaded.
    if (this.generation === 0 && Number.isSafeInteger(generation) && generation > 0) this.generation = generation;
  }

  /** A visitor's save refused: kept for the page to word; after a 429 no new visitor is asked for until its Retry-After. */
  private visitorRefused(failure: unknown): void {
    if (!(failure instanceof ApiError)) return;
    const words = visitorRefusalKey(failure.status, failure.code ?? undefined);
    if (words !== null) this.visitorRefusal.set(words);
    if (failure.status === 429 && failure.code === 'too_many_visitors') {
      this.makersPausedUntil = Date.now() + (failure.retryAfterMs ?? MAKER_PAUSE_MS);
    }
  }

  /** A call whose answer is text, with its headers: the progress file (a person's). */
  private async requestText(method: string, url: string): Promise<HttpResponse<string>> {
    const caller = this.gate(true);
    try {
      return await firstValueFrom(this.http.request(method, url, { observe: 'response', responseType: 'text', context: new HttpContext().set(ISSUED_AS, caller) }));
    } catch (error) {
      throw this.failed(method, url, error);
    }
  }

  /**
   * The progress of the page's owner, and the generation it is of - kept here
   * for the saves. A visitor's page without a key gets nobody's: empty, at
   * generation 0, which only the first save (the one that makes the visitor)
   * names.
   */
  async fetchState(): Promise<AppState> {
    const asVisitor = this._owner() === VISITOR_OWNER;
    const state = await this.request<AppState & { generation?: unknown }>('GET', '/api/state');
    const generation = state.generation;
    this.generation = typeof generation === 'number' && Number.isSafeInteger(generation) && (generation > 0 || (asVisitor && generation === 0)) ? generation : null;
    return { progress: state.progress, sessions: state.sessions, path: state.path };
  }

  /** The header of a whole-document save; without a generation the save is not sent at all (it could only be refused). */
  private generationHeader(url: string): Record<string, string> {
    this.gate(); // nobody signed in, or somebody else, before anything about the generation
    if (this.generation === null) {
      throw new ApiError(`PUT ${url}: no generation of the progress to name`, 409, 'progress_changed');
    }
    return { [GENERATION_HEADER]: String(this.generation) };
  }

  async saveProgress(progress: ProgressMap): Promise<void> {
    await this.request('PUT', '/api/progress', progress, { headers: () => this.generationHeader('/api/progress') });
  }

  async savePath(path: PathProgress): Promise<void> {
    await this.request('PUT', '/api/path', path, { headers: () => this.generationHeader('/api/path') });
  }

  // --- a visitor's progress at a sign-in ---

  /**
   * POST /api/visitor/move: what this browser's visitor kept (`key`) becomes
   * the signed-in person's - the token and the key in one request, whatever
   * the IAM's switch says. ApiError 503 `visitor_move_retry` (Retry-After),
   * 422 for a key that is no key, 401 for nobody signed in.
   */
  moveVisitor(key: string): Promise<VisitorMove> {
    return this.request<VisitorMove>('POST', '/api/visitor/move', null, { headers: { [VISITOR_KEY_HEADER]: key }, asPerson: true, carriesKey: true });
  }

  /**
   * The rounds another owner of this browser left in its outbox - a visitor's,
   * after a sign-in - become this page's owner's, keeping their
   * Idempotency-Keys (a round the visitor already stored was moved with its
   * key, so sending it again stores nothing twice). Answers how many came.
   */
  adoptOutbox(from: string): number {
    const owner = this._owner();
    if (owner === null || owner === from) return 0;
    const theirs = this.loadOutbox(OUTBOX_PREFIX + from);
    if (!theirs.length) return 0;
    const mine = this.loadOutbox();
    const known = new Set(mine.map((entry) => entry.key));
    this.storeOutbox([...mine, ...theirs.filter((entry) => !known.has(entry.key))]);
    this.memoryOutbox.delete(OUTBOX_PREFIX + from);
    writeStorage(OUTBOX_PREFIX + from, null);
    return theirs.length;
  }

  // --- the person's own progress file ---

  /** GET /api/me/export: the file (as it came) and its name. ApiError 409 `export_too_large`. */
  async exportMyProgress(): Promise<ProgressFile> {
    const answer = await this.requestText('GET', '/api/me/export');
    const today = new Date().toISOString().slice(0, 10);
    return { name: fileName(answer.headers.get('Content-Disposition')) ?? `piano-academy-progress-${today}.json`, text: answer.body ?? '' };
  }

  /**
   * What bringing `text` (a progress file, as it was read) in would do -
   * nothing is written. ApiError 422 `not_an_export` / `invalid_export`, 413
   * `too_large`.
   */
  previewImport(text: string): Promise<ImportPreview> {
    return this.request<ImportPreview>('POST', '/api/me/import?dryRun=true', text, { headers: { 'Content-Type': 'application/json' }, asPerson: true });
  }

  /**
   * Brings a progress file in: into an account with no progress - or, with
   * `replace` (only after the person said so), in the place of the progress
   * there. ApiError 409 `has_progress` (nothing written), 422, 413.
   */
  importMyProgress(text: string, replace: boolean): Promise<ImportResult> {
    return this.request<ImportResult>('POST', replace ? '/api/me/import?replace=true' : '/api/me/import', text, { headers: { 'Content-Type': 'application/json' }, asPerson: true });
  }

  // (The admin panel's calls are the family's pages' own - the People page, the Migrations page, the admin tools:
  // @anotoki/lib, through the interceptors.)

  // --- the session outbox ---

  private outboxKey(): string {
    return OUTBOX_PREFIX + this._owner();
  }

  private loadOutbox(key = this.outboxKey()): OutboxEntry[] {
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return this.memoryOutbox.get(key) ?? [];
    }
  }

  private storeOutbox(list: OutboxEntry[]): void {
    this.memoryOutbox.set(this.outboxKey(), list);
    try {
      if (list.length) localStorage.setItem(this.outboxKey(), JSON.stringify(list));
      else localStorage.removeItem(this.outboxKey());
      this.outboxInMemory = false;
    } catch {
      // kept in memory until the page closes
      this.outboxInMemory = list.length > 0;
    }
    this.unsavedSessions.set(list.length);
  }

  /** Is what waits in the outbox kept by the browser (and so sent after the next sign-in, or a reload)? */
  outboxKept(): boolean {
    return !this.outboxInMemory;
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
    if (this._owner() === null) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      try {
        for (;;) {
          const [entry] = this.loadOutbox(); // read again each time: another tab may have sent it
          if (!entry) return;
          const waiter = this.waiters.get(entry.key);
          let saved: Session;
          try {
            saved = await this.request<Session>('POST', '/api/sessions', entry.session, { headers: { 'Idempotency-Key': entry.key } });
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
