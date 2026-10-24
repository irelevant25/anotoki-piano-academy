import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { ApiService, GENERATION_HEADER, VISITOR_OWNER } from '../../api/api.service';
import { VisitorKey } from '../auth/visitor-key';
import { VISITOR_WORDS } from '../i18n/visitor-words';
import { NoteState } from '../music/music.types';
import { SrsService } from '../music/srs.service';
import { PROGRESS_REPLACED_PREFIX, ProgressStore, RETRY_MS } from './progress-store.service';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const NO_CONTENT = { status: 204, statusText: 'No Content' };

describe('ProgressStore', () => {
  let store: ProgressStore;
  let http: HttpTestingController;
  let note: (midi: number) => NoteState;

  /** GET /api/state, answered with these documents and this generation. */
  const answerState = (generation: number, progress: Record<string, NoteState> = {}): void => http.expectOne('/api/state').flush({ progress, sessions: [], path: { steps: {} }, generation });

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AnotokiAuth, useValue: { subject: () => '5' } }] });
    const api = TestBed.inject(ApiService);
    api.setDataOwner('5');
    store = TestBed.inject(ProgressStore);
    http = TestBed.inject(HttpTestingController);
    const srs = TestBed.inject(SrsService);
    note = (midi) => ({ ...srs.createInitialNoteState(midi), status: 'review' });
    // As BootService loads it: the documents, and the generation they are of.
    const loading = api.fetchState();
    answerState(1);
    store.load(await loading);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('an answer goes into the progress as the store holds it, and a save sends the latest when its turn comes', async () => {
    const first = store.updateNote(60, () => note(60));
    const second = store.updateNote(62, (current) => ({ ...current, status: 'learning' }));
    await settle();

    const one = http.expectOne('/api/progress');
    expect(Object.keys(one.request.body)).toEqual(['60', '62']);
    expect(one.request.headers.get(GENERATION_HEADER)).toBe('1');
    one.flush(null, NO_CONTENT);
    await first;
    await settle();
    const two = http.expectOne('/api/progress');
    two.flush(null, NO_CONTENT);
    await second;
    expect(store.unsaved()).toBe(false);
  });

  it('a failed save is marked, and the latest state goes again after a while', async () => {
    const saving = store.updateNote(60, () => note(60)).catch(() => 'failed');
    await settle();
    http.expectOne('/api/progress').flush({ error: 'down', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(await saving).toBe('failed');
    expect(store.progressFailed()).toBe(true);
    expect(store.unsaved()).toBe(true);

    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await settle();
    const retry = http.expectOne('/api/progress');
    expect(Object.keys(retry.request.body)).toEqual(['60']);
    retry.flush(null, NO_CONTENT);
    await settle();
    expect(store.progressFailed()).toBe(false);
    expect(store.unsaved()).toBe(false);
  });

  it('a stored session joins the state once', async () => {
    const recorded = store.recordSession({ mode: 'trainer', attempts: 12, correct: 12, accuracy: 100 });
    await settle();
    http.expectOne('/api/sessions').flush({ id: 's1', recordedAt: '2026-09-28T10:00:00.000Z', mode: 'trainer' }, { status: 201, statusText: 'Created' });
    await recorded;
    expect(store.sessions().map((s) => s.id)).toEqual(['s1']);
  });

  it('a save refused as progress_changed is never sent again: the progress is loaded again, and the store says why', async () => {
    const saving = store.updateNote(60, () => note(60)).catch(() => 'refused');
    await settle();
    http
      .expectOne('/api/progress')
      .flush({ error: 'Your progress was replaced or deleted after this page loaded it.', code: 'progress_changed', generation: 2 }, { status: 409, statusText: 'Conflict' });
    expect(await saving).toBe('refused');
    await settle();

    // What the import left on the server comes in place of what this page held.
    answerState(2, { 64: note(64) });
    await settle();
    expect(Object.keys(store.progress())).toEqual(['64']);
    expect(store.changedElsewhere()).toBe(true);
    expect(store.progressFailed()).toBe(false);
    expect(store.unsaved()).toBe(false);

    // Not tried again - not later, not when the browser is back online.
    await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
    globalThis.dispatchEvent(new Event('online'));
    await settle();
    http.expectNone('/api/progress');

    // The next save names the generation it loaded.
    const next = store.updateNote(65, () => note(65));
    await settle();
    const put = http.expectOne('/api/progress');
    expect(put.request.headers.get(GENERATION_HEADER)).toBe('2');
    put.flush(null, NO_CONTENT);
    await next;
  });

  it('two saves refused together load the progress once', async () => {
    const one = store.updateNote(60, () => note(60)).catch(() => undefined);
    const two = store.savePathProgress({ steps: {} }).catch(() => undefined);
    await settle();
    for (const url of ['/api/progress', '/api/path']) {
      http.expectOne(url).flush({ error: 'changed', code: 'progress_changed', generation: null }, { status: 409, statusText: 'Conflict' });
    }
    await Promise.all([one, two]);
    await settle();
    answerState(3);
    await settle();
    http.expectNone('/api/state');
    expect(store.changedElsewhere()).toBe(true);
  });

  it('a load that fails after a refusal is tried again later - never the old documents', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const saving = store.updateNote(60, () => note(60)).catch(() => undefined);
    await settle();
    http.expectOne('/api/progress').flush({ error: 'changed', code: 'progress_changed', generation: 2 }, { status: 409, statusText: 'Conflict' });
    await saving;
    await settle();
    http.expectOne('/api/state').flush({ error: 'down', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(store.changedElsewhere()).toBe(true);

    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await settle();
    answerState(2);
    await settle();
    http.expectNone('/api/progress');
    consoleError.mockRestore();
  });

  it('another tab of the same person replaced the progress: this one loads it before it saves anything over it', async () => {
    globalThis.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_REPLACED_PREFIX + '5', newValue: 'x' }));
    await settle();
    answerState(4, { 67: note(67) });
    await settle();
    expect(Object.keys(store.progress())).toEqual(['67']);
    expect(store.changedElsewhere()).toBe(true);

    // Somebody else's marker, or one taken away, means nothing here.
    globalThis.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_REPLACED_PREFIX + '6', newValue: 'x' }));
    globalThis.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_REPLACED_PREFIX + '5', newValue: null }));
    await settle();
    http.expectNone('/api/state');
  });

  it('an answer after a reload goes into what the reload gave - the old notes are never sent again', async () => {
    const first = store.updateNote(60, () => note(60));
    await settle();
    http.expectOne('/api/progress').flush(null, NO_CONTENT);
    await first;

    // Another tab brought back a file: this one loads what the server holds now.
    globalThis.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_REPLACED_PREFIX + '5', newValue: 'x' }));
    await settle();
    answerState(7, { 64: note(64) });
    await settle();

    // The next answer, in the middle of whatever round this tab was in.
    const next = store.updateNote(62, () => note(62));
    await settle();
    const put = http.expectOne('/api/progress');
    expect(Object.keys(put.request.body).sort()).toEqual(['62', '64']);
    expect(put.request.headers.get(GENERATION_HEADER)).toBe('7');
    put.flush(null, NO_CONTENT);
    await next;
  });

  it('an answer while the progress is being loaded again waits for the load, and is made on what it gives', async () => {
    const first = store.updateNote(60, () => note(60));
    await settle();
    http.expectOne('/api/progress').flush(null, NO_CONTENT);
    await first;

    globalThis.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_REPLACED_PREFIX + '5', newValue: 'x' }));
    await settle();
    // The load is on its way: an answer now sends nothing yet - not the old notes under either generation.
    const during = store.updateNote(64, (current) => ({ ...current, repetitions: current.repetitions + 1 }));
    await settle();
    http.expectNone('/api/progress');

    answerState(8, { 64: { ...note(64), repetitions: 5 } });
    await settle();
    const put = http.expectOne('/api/progress');
    expect(Object.keys(put.request.body)).toEqual(['64']);
    expect(put.request.body['64'].repetitions).toBe(6);
    expect(put.request.headers.get(GENERATION_HEADER)).toBe('8');
    put.flush(null, NO_CONTENT);
    await during;
    expect(store.progress()['64'].repetitions).toBe(6);
  });

  it('a 428 (the header lost on the way) is a failed save - "Not saved yet" - never "changed elsewhere"', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const saving = store.updateNote(60, () => note(60)).catch(() => 'failed');
    await settle();
    http.expectOne('/api/progress').flush({ error: 'Name the generation.', code: 'generation_required' }, { status: 428, statusText: 'Precondition Required' });
    expect(await saving).toBe('failed');
    await settle();
    http.expectNone('/api/state');
    expect(store.changedElsewhere()).toBe(false);
    expect(store.progressFailed()).toBe(true);
    expect(store.unsaved()).toBe(true);
    expect(store.wouldLoseOnSignOut()).toBe(true);
    expect(consoleError).toHaveBeenCalled();

    // Kept and sent again, like any failed save.
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await settle();
    http.expectOne('/api/progress').flush(null, NO_CONTENT);
    await settle();
    expect(store.unsaved()).toBe(false);
    consoleError.mockRestore();
  });

  it('tells the other tabs after a replace here', () => {
    store.announceReplaced();
    expect(localStorage.getItem(PROGRESS_REPLACED_PREFIX + '5')).toMatch(/^\d+-/);
  });

  it('before signing out: a failed save goes once more, and only what still did not get through would be lost', async () => {
    const saving = store.updateNote(60, () => note(60)).catch(() => undefined);
    await settle();
    http.expectOne('/api/progress').flush({ error: 'down', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await saving;
    expect(store.wouldLoseOnSignOut()).toBe(true);

    // Through, the second time: nothing would be lost.
    const settled = store.settle();
    await settle();
    http.expectOne('/api/progress').flush(null, NO_CONTENT);
    await settled;
    expect(store.wouldLoseOnSignOut()).toBe(false);

    // Down again: settle() ends, and says so.
    const again = store.updateNote(62, () => note(62)).catch(() => undefined);
    await settle();
    http.expectOne('/api/progress').flush({ error: 'down', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await again;
    const failing = store.settle();
    await settle();
    http.expectOne('/api/progress').error(new ProgressEvent('error'));
    await failing;
    expect(store.wouldLoseOnSignOut()).toBe(true);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await settle();
    http.expectOne('/api/progress').flush(null, NO_CONTENT);
  });

  it('rounds waiting in the outbox are no reason to ask: the browser keeps them for the next sign-in', async () => {
    const recorded = store.recordSession({ mode: 'trainer', attempts: 1 }).catch(() => undefined);
    await settle();
    http.expectOne('/api/sessions').error(new ProgressEvent('error'));
    await recorded;
    expect(store.unsaved()).toBe(true);
    expect(store.wouldLoseOnSignOut()).toBe(false);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await settle();
    http.expectOne('/api/sessions').flush({ id: 's1', recordedAt: '2026-09-28T10:00:00.000Z', mode: 'trainer' }, { status: 201, statusText: 'Created' });
    await settle();
  });
});

describe('ProgressStore on a visitor’s page: a refusal sending again cannot fix soon is not sent for ever', () => {
  let store: ProgressStore;
  let http: HttpTestingController;
  let api: ApiService;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AnotokiAuth, useValue: { subject: () => null, signedIn: () => false, loginRequired: () => false } }],
    });
    api = TestBed.inject(ApiService);
    api.setDataOwner(VISITOR_OWNER);
    store = TestBed.inject(ProgressStore);
    http = TestBed.inject(HttpTestingController);
    const loading = api.fetchState();
    http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 0 });
    store.load(await loading);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('a document larger than a visitor’s may be (413): "Not saved yet", sent again with the next change - never every RETRY_MS by itself', async () => {
    const first = store.updateNote(60, (note) => note).catch(() => 'failed');
    await settle();
    http.expectOne('/api/progress').flush({ error: 'Too large.', code: 'too_large' }, { status: 413, statusText: 'Content Too Large' });
    expect(await first).toBe('failed');
    expect(store.progressFailed()).toBe(true);
    expect(api.visitorRefusal()).toBe(VISITOR_WORDS.full);

    await vi.advanceTimersByTimeAsync(RETRY_MS * 4);
    await settle();
    http.expectNone('/api/progress');
    // Nor when something else is tried again (the 'online' event, a sign-in elsewhere).
    store.retryUnsaved();
    await settle();
    http.expectNone('/api/progress');

    // The next answer sends it again, once.
    const next = store.updateNote(62, (note) => note);
    await settle();
    http.expectOne('/api/progress').flush(null, NO_CONTENT);
    await next;
    expect(store.progressFailed()).toBe(false);
  });

  it('too many new visitors (429): tried again after its Retry-After, not every RETRY_MS', async () => {
    const first = store.updateNote(60, (note) => note).catch(() => 'failed');
    await settle();
    http.expectOne('/api/progress').flush({ error: 'Too many.', code: 'too_many_visitors' }, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '60' } });
    expect(await first).toBe('failed');
    expect(api.visitorRefusal()).toBe(VISITOR_WORDS.busy);

    await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
    await settle();
    http.expectNone('/api/progress');

    await vi.advanceTimersByTimeAsync(60_000 - RETRY_MS * 2);
    await settle();
    http.expectOne('/api/progress').flush(null, { status: 204, statusText: 'No Content', headers: { 'Progress-Generation': '31' } });
    await settle();
    expect(store.progressFailed()).toBe(false);
    expect(api.visitorRefusal()).toBeNull();
  });

  it('a key the server no longer knows (visitor.lost): the 409 that follows loads nobody’s progress again, and says nothing of "changed elsewhere"', async () => {
    const refuse = async (): Promise<void> => {
      const saving = store.updateNote(60, (note) => note).catch(() => 'refused');
      await settle();
      http.expectOne('/api/progress').flush({ error: 'Changed.', code: 'progress_changed', generation: null }, { status: 409, statusText: 'Conflict' });
      expect(await saving).toBe('refused');
      await settle();
      http.expectOne('/api/state').flush({ progress: {}, sessions: [], path: { steps: {} }, generation: 0 });
      await settle();
    };
    // The interceptor forgot the key on a 401 visitor_unknown: the next save went as nobody's with the old generation.
    TestBed.inject(VisitorKey).lost.set(true);
    await refuse();
    expect(store.changedElsewhere()).toBe(false);
    expect(store.progressFailed()).toBe(false);

    // Any other 409 on a visitor's page (a second tab's maker first) is said as before.
    TestBed.inject(VisitorKey).lost.set(false);
    await refuse();
    expect(store.changedElsewhere()).toBe(true);
  });
});
