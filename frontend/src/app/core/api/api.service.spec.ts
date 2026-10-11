import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { Session } from '../music/music.types';
import { ApiError, ApiService } from './api.service';

const OUTBOX = 'piano-learning:unsaved-sessions:5';

/** Lets the service's awaits run until it has sent its next request. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function stored(id: string): Session {
  return { id, recordedAt: '2026-09-28T10:00:00.000Z', mode: 'trainer', attempts: 12, correct: 10, accuracy: 83 };
}

/** Who is signed in, as far as ApiService asks: the IAM user id - null for nobody. */
let signedInAs: string | null = '5';
const auth = { userKey: () => signedInAs };

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    signedInAs = '5';
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: auth }] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
    api.setDataOwner('5');
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
    await expect(api.exportMyProgress()).rejects.toMatchObject({ status: 409, wrongUser: true });
    signedInAs = null;
    await expect(api.fetchState()).rejects.toMatchObject({ status: 401 });
    await expect(api.previewImport('{}')).rejects.toMatchObject({ status: 401 });
    http.expectNone('/api/progress');
    http.expectNone('/api/state');
  });

  it('reads the server\'s error code', async () => {
    const state = api.fetchState();
    await settle();
    http.expectOne('/api/state').flush({ error: 'not set up', code: 'not_set_up' }, { status: 503, statusText: 'Unavailable' });
    await expect(state).rejects.toMatchObject({ status: 503, code: 'not_set_up' });
  });

  describe("the admin panel's calls", () => {
    // (The words' admin routes are called by the family's pages themselves - @anotoki/lib/translations/admin -
    // through the app's HttpClient and its interceptors; ApiService has the People page's.)
    it('go through the same gate as every call: nothing is sent for another person, or for nobody', async () => {
      api.setDataOwner('7');
      await expect(api.deletePerson(3)).rejects.toMatchObject({ status: 409, wrongUser: true, details: null });
      signedInAs = null;
      await expect(api.people()).rejects.toMatchObject({ status: 401, details: null });
      http.expectNone('/api/admin/people/3');
      http.expectNone('/api/admin/people');
    });

    it("keep the answer's body of a refusal as `details`: the server's sentence, and its code", async () => {
      const body = { error: 'There is nobody with that id here.', code: 'not_found' };
      const gone = api.deletePerson(3);
      await settle();
      http.expectOne('/api/admin/people/3').flush(body, { status: 404, statusText: 'Not Found' });

      await expect(gone).rejects.toMatchObject({ status: 404, code: 'not_found', wrongUser: false, details: body });
    });

    it('have no details when the answer is no object: a text, a list, or no answer at all', async () => {
      const text = api.people();
      await settle();
      http.expectOne('/api/admin/people').flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
      await expect(text).rejects.toMatchObject({ status: 502, code: null, details: null });

      const list = api.people();
      await settle();
      http.expectOne('/api/admin/people').flush(['no'], { status: 500, statusText: 'Server Error' });
      await expect(list).rejects.toMatchObject({ status: 500, code: null, details: null });

      const none = api.people();
      await settle();
      http.expectOne('/api/admin/people').error(new ProgressEvent('error'));
      await expect(none).rejects.toMatchObject({ status: 0, code: null, details: null });
    });
  });
});
