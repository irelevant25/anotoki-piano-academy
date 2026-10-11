import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { VISITOR_KEY_HEADER, anotokiAuthInterceptor } from '@anotoki/lib/auth';
import { VISITOR_STORAGE_KEY, VisitorKey } from '../auth/visitor-key';
import { VISITOR_WORDS } from '../i18n/visitor-words';
import { TestAuth, provideTestAuth, provideTestAuthInterceptor, testPerson } from '../testing/test-auth';
import { ApiService, GENERATION_HEADER, VISITOR_OWNER } from './api.service';

/** Lets the service's awaits run until it has sent its next request. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const KEY = 'k'.repeat(43);
const EMPTY = { progress: {}, sessions: [], path: { steps: {} } };
const ROUND = { mode: 'trainer' as const, attempts: 4, correct: 4, accuracy: 100 };
const STORED = { id: '1-a', recordedAt: '2026-10-05T08:00:00.000Z', ...ROUND };

describe('ApiService on a visitor’s page (nobody signed in, no sign-in required)', () => {
  let auth: TestAuth;
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    // A visitor's page, the family's interceptor as app.config.ts has it (core/auth/site-auth.ts: the progress routes carry the key).
    auth = new TestAuth().visiting();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([anotokiAuthInterceptor])), provideHttpClientTesting(), ...provideTestAuth(auth), ...provideTestAuthInterceptor()],
    });
    auth.store = TestBed.inject(VisitorKey);
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
    api.setDataOwner(VISITOR_OWNER);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    vi.useRealTimers();
  });

  /** GET /api/state, as nobody (no key: generation 0) or as the visitor. */
  async function loaded(generation: number): Promise<void> {
    const state = api.fetchState();
    await settle();
    http.expectOne('/api/state').flush({ ...EMPTY, generation });
    expect(await state).toEqual(EMPTY);
  }

  /** The answer of a save that made the visitor: its key and its progress's first generation. */
  const made = (request: TestRequest, generation = 31): void =>
    request.flush(request.request.method === 'POST' ? STORED : null, {
      status: request.request.method === 'POST' ? 201 : 204,
      statusText: 'Made',
      headers: { [VISITOR_KEY_HEADER]: KEY, [GENERATION_HEADER]: String(generation), 'Cache-Control': 'no-store' },
    });

  it('takes nobody’s progress at generation 0 - which only the first save names', async () => {
    await loaded(0);
    const saved = api.saveProgress({});
    await settle();
    const put = http.expectOne('/api/progress');
    expect(put.request.headers.get(GENERATION_HEADER)).toBe('0');
    expect(put.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
    expect(put.request.headers.has('Authorization')).toBe(false);
    made(put);
    await saved;
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);

    // From then on: the key, and the visitor's generation.
    const next = api.savePath({ steps: {} });
    await settle();
    const path = http.expectOne('/api/path');
    expect(path.request.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
    expect(path.request.headers.get(GENERATION_HEADER)).toBe('31');
    path.flush(null, { status: 204, statusText: 'No Content' });
    await next;
  });

  it('a round’s end - a progress PUT, a path PUT and the round at once - makes ONE visitor: the others wait for it, then go with its key and generation', async () => {
    await loaded(0);
    const progress = api.saveProgress({});
    const path = api.savePath({ steps: {} });
    const round = api.recordSession(ROUND);
    await settle();

    // One maker out; the others wait.
    const maker = http.expectOne('/api/progress');
    http.expectNone('/api/path');
    http.expectNone('/api/sessions');
    expect(maker.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
    made(maker);
    await progress;
    await settle();

    const second = http.expectOne('/api/path');
    expect(second.request.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
    expect(second.request.headers.get(GENERATION_HEADER)).toBe('31');
    second.flush(null, { status: 204, statusText: 'No Content' });
    const third = http.expectOne('/api/sessions');
    expect(third.request.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
    third.flush(STORED, { status: 201, statusText: 'Created' });
    await Promise.all([path, round]);
  });

  it('a maker that failed leaves no key, and the next save waiting makes the visitor', async () => {
    await loaded(0);
    const progress = api.saveProgress({}).catch((error: unknown) => error);
    const path = api.savePath({ steps: {} });
    await settle();
    http.expectOne('/api/progress').flush({ error: 'down', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(await progress).toMatchObject({ status: 503 });
    await settle();

    const next = http.expectOne('/api/path');
    expect(next.request.headers.has(VISITOR_KEY_HEADER)).toBe(false);
    expect(next.request.headers.get(GENERATION_HEADER)).toBe('0');
    made(next);
    await path;
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
  });

  it('after 429 too_many_visitors no new visitor is asked for before its Retry-After - and the page can word why', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
    await loaded(0);
    const first = api.saveProgress({}).catch((error: unknown) => error);
    await settle();
    http.expectOne('/api/progress').flush({ error: 'Too many.', code: 'too_many_visitors' }, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '3600' } });
    expect(await first).toMatchObject({ status: 429, code: 'too_many_visitors', retryAfterMs: 3_600_000 });
    expect(api.visitorRefusal()).toBe(VISITOR_WORDS.busy);

    // Half an hour later: refused here, nothing sent, with the time left.
    vi.setSystemTime(new Date('2026-10-05T10:30:00Z'));
    const again = await api.recordSession(ROUND).catch((error: unknown) => error);
    await settle();
    http.expectNone('/api/sessions');
    expect(again).toMatchObject({ status: 429, code: 'too_many_visitors', retryAfterMs: 1_800_000 });

    // Past it: a maker again (the waiting round goes now).
    vi.setSystemTime(new Date('2026-10-05T11:00:01Z'));
    const later = api.retrySessions();
    await settle();
    made(http.expectOne('/api/sessions'));
    await later;
    expect(api.visitorRefusal()).toBeNull();
  });

  it('a document larger than a visitor’s may be (413 too_large) - and a round over the cap (422 visitor_limit) - are kept for the page to word', async () => {
    await loaded(31);
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    const big = api.saveProgress({}).catch((error: unknown) => error);
    await settle();
    http.expectOne('/api/progress').flush({ error: 'Too large.', code: 'too_large' }, { status: 413, statusText: 'Content Too Large' });
    expect(await big).toMatchObject({ status: 413 });
    expect(api.visitorRefusal()).toBe(VISITOR_WORDS.full);

    const fine = api.savePath({ steps: {} });
    await settle();
    http.expectOne('/api/path').flush(null, { status: 204, statusText: 'No Content' });
    await fine;
    expect(api.visitorRefusal()).toBeNull();

    const round = api.recordSession(ROUND).catch((error: unknown) => error);
    await settle();
    http.expectOne('/api/sessions').flush({ error: 'Too many rounds.', code: 'visitor_limit', limit: 'sessions', max: 1000 }, { status: 422, statusText: 'Unprocessable Content' });
    expect(await round).toMatchObject({ status: 422 });
    expect(api.visitorRefusal()).toBe(VISITOR_WORDS.full);
    // The server never takes it: dropped, not tried for ever.
    expect(api.unsavedSessions()).toBe(0);
  });

  it('never sends a person’s call for a visitor - the own file, the move: 401 here, nothing sent', async () => {
    await expect(api.exportMyProgress()).rejects.toMatchObject({ status: 401, code: 'sign_in_required' });
    await expect(api.previewImport('{}')).rejects.toMatchObject({ status: 401 });
    await expect(api.moveVisitor(KEY)).rejects.toMatchObject({ status: 401 });
    await settle();
    http.expectNone(() => true);
  });

  it('sends nothing more once somebody signed in (the page loads again) or a sign-in is required now (the key stays)', async () => {
    await loaded(31);
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    // Somebody signed in in another tab: the IAM's client holds them, and the page is about to load afresh.
    auth.person.set(testPerson({ sub: '7' }));
    await expect(api.saveProgress({})).rejects.toMatchObject({ status: 409, wrongUser: true });
    // Signed out again - and the IAM requires a sign-in now.
    auth.signedOut();
    await expect(api.saveProgress({})).rejects.toMatchObject({ status: 401, code: 'sign_in_required' });
    await expect(api.fetchState()).rejects.toMatchObject({ status: 401 });
    await settle();
    http.expectNone(() => true);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
  });

  it('a person’s page takes no generation 0: nobody’s progress is never a person’s', async () => {
    auth.signInAs({ sub: '7' });
    api.setDataOwner('7');
    await loaded(0);
    await expect(api.saveProgress({})).rejects.toMatchObject({ status: 409, code: 'progress_changed' });
    await settle();
    http.expectNone('/api/progress');
  });

  describe('after a sign-in', () => {
    beforeEach(() => {
      auth.signInAs({ sub: '7' });
      api.setDataOwner('7');
    });

    it('moves the visitor with the person’s token and the key, in one request', async () => {
      const moving = api.moveVisitor(KEY);
      await settle();
      const move = http.expectOne('/api/visitor/move');
      expect(move.request.method).toBe('POST');
      expect(move.request.headers.get('Authorization')).toBe('Bearer token-7');
      expect(move.request.headers.get(VISITOR_KEY_HEADER)).toBe(KEY);
      const answer = { found: true, notes: { moved: 1, kept: 1 }, steps: { moved: 0, merged: 1, kept: 0 }, sessions: 2, generation: 40 };
      move.flush(answer);
      expect(await moving).toEqual(answer);
    });

    it('a move held up names how long to wait (Retry-After)', async () => {
      const moving = api.moveVisitor(KEY).catch((error: unknown) => error);
      await settle();
      http.expectOne('/api/visitor/move').flush({ error: 'busy', code: 'visitor_move_retry' }, { status: 503, statusText: 'Unavailable', headers: { 'Retry-After': '2' } });
      expect(await moving).toMatchObject({ status: 503, code: 'visitor_move_retry', retryAfterMs: 2000 });
    });

    it('takes on the rounds a visitor left in the outbox: their keys kept, none twice, the visitor’s outbox emptied', () => {
      const entry = (key: string) => ({ key, session: ROUND, queuedAt: '2026-10-05T08:00:00.000Z' });
      localStorage.setItem('piano-learning:unsaved-sessions:7', JSON.stringify([entry('mine')]));
      localStorage.setItem(`piano-learning:unsaved-sessions:${VISITOR_OWNER}`, JSON.stringify([entry('theirs'), entry('mine')]));
      api.setDataOwner('7');

      expect(api.adoptOutbox(VISITOR_OWNER)).toBe(2);
      expect(JSON.parse(localStorage.getItem('piano-learning:unsaved-sessions:7')!).map((e: { key: string }) => e.key)).toEqual(['mine', 'theirs']);
      expect(localStorage.getItem(`piano-learning:unsaved-sessions:${VISITOR_OWNER}`)).toBeNull();
      expect(api.unsavedSessions()).toBe(2);
      // Nothing more to take; and never from oneself.
      expect(api.adoptOutbox(VISITOR_OWNER)).toBe(0);
      expect(api.adoptOutbox('7')).toBe(0);
    });
  });
});
