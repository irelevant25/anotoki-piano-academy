import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { Session } from '../music/music.types';
import { ApiError, ApiService } from './api.service';

const OUTBOX = 'piano-learning:unsaved-sessions:local';

/** Lets the service's awaits run until it has sent its next request. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function stored(id: string): Session {
  return { id, recordedAt: '2026-09-28T10:00:00.000Z', mode: 'trainer', attempts: 12, correct: 10, accuracy: 83 };
}

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    auth.mode.set('none'); // no sign-in: the page's user is 'local'
    api.setDataOwner('local');
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('keeps a session in the outbox until the server has it, sent with an Idempotency-Key', async () => {
    const saved: Session[] = [];
    api.onSessionSaved((session) => saved.push(session));

    const result = api.recordSession({ mode: 'trainer', attempts: 12, correct: 10, accuracy: 83 });
    expect(JSON.parse(localStorage.getItem(OUTBOX)!).length).toBe(1);
    expect(api.unsavedSessions()).toBe(1);

    await settle();
    const request = http.expectOne('/api/sessions');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(request.request.body).toEqual({ mode: 'trainer', attempts: 12, correct: 10, accuracy: 83 });
    request.flush(stored('1-a'), { status: 201, statusText: 'Created' });

    await expect(result).resolves.toEqual(stored('1-a'));
    expect(localStorage.getItem(OUTBOX)).toBeNull();
    expect(api.unsavedSessions()).toBe(0);
    expect(saved.map((s) => s.id)).toEqual(['1-a']);
  });

  it('a session that could not be sent waits - and goes again with the same key', async () => {
    const result = api.recordSession({ mode: 'sheet', attempts: 6, correct: 5, accuracy: 83 });
    await settle();
    const first = http.expectOne('/api/sessions');
    const key = first.request.headers.get('Idempotency-Key');
    first.flush({ error: 'The database is not reachable right now.', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    await expect(result).rejects.toBeInstanceOf(ApiError);
    expect(api.unsavedSessions()).toBe(1);

    const retry = api.retrySessions();
    await settle();
    const second = http.expectOne('/api/sessions');
    expect(second.request.headers.get('Idempotency-Key')).toBe(key);
    second.flush(stored('2-b'), { status: 200, statusText: 'OK' });
    await retry;
    expect(api.unsavedSessions()).toBe(0);
  });

  it('a session the server refuses is dropped, not tried for ever', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = api.recordSession({ mode: 'lesson', label: 'x' });
    await settle();
    http.expectOne('/api/sessions').flush({ error: 'bad', code: 'invalid_session' }, { status: 400, statusText: 'Bad Request' });
    await expect(result).rejects.toMatchObject({ status: 400, code: 'invalid_session' });
    expect(api.unsavedSessions()).toBe(0);
    consoleError.mockRestore();
  });

  it('sends what waits oldest first, one at a time', async () => {
    const first = api.recordSession({ mode: 'trainer', attempts: 1 });
    const second = api.recordSession({ mode: 'trainer', attempts: 2 });
    await settle();
    const one = http.expectOne('/api/sessions');
    expect(one.request.body.attempts).toBe(1);
    one.flush(stored('a'), { status: 201, statusText: 'Created' });
    await settle();
    const two = http.expectOne('/api/sessions');
    expect(two.request.body.attempts).toBe(2);
    two.flush(stored('b'), { status: 201, statusText: 'Created' });
    await expect(first).resolves.toMatchObject({ id: 'a' });
    await expect(second).resolves.toMatchObject({ id: 'b' });
  });

  it('never sends anything for another person than the one the page loaded', async () => {
    api.setDataOwner('7');
    await expect(api.saveProgress({})).rejects.toMatchObject({ status: 409, wrongUser: true });
    auth.mode.set(null);
    await expect(api.fetchState()).rejects.toMatchObject({ status: 401 });
    http.expectNone('/api/progress');
    http.expectNone('/api/state');
  });

  it('reads the server\'s error code', async () => {
    const state = api.fetchState();
    await settle();
    http.expectOne('/api/state').flush({ error: 'not set up', code: 'not_set_up' }, { status: 503, statusText: 'Unavailable' });
    await expect(state).rejects.toMatchObject({ status: 503, code: 'not_set_up' });
  });
});
