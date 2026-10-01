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

  describe("the owner's calls", () => {
    const ENGLISH = { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true };
    const CZECH = { code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false, sortOrder: 3, seeded: false };
    const GRID = { languages: [ENGLISH], keys: [{ name: 'common.loading', description: null, values: { en: 'Loading…' } }] };

    it('read and change the languages under /api/owner/languages', async () => {
      const list = api.languages();
      await settle();
      const listed = http.expectOne('/api/owner/languages');
      expect(listed.request.method).toBe('GET');
      listed.flush({ languages: [ENGLISH, CZECH] });
      await expect(list).resolves.toEqual([ENGLISH, CZECH]);

      const added = api.createLanguage({ code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false });
      await settle();
      const post = http.expectOne('/api/owner/languages');
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false });
      post.flush({ language: CZECH }, { status: 201, statusText: 'Created' });
      await expect(added).resolves.toEqual(CZECH);

      const changed = api.updateLanguage('cs', { enabled: true });
      await settle();
      const put = http.expectOne('/api/owner/languages/cs');
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ enabled: true });
      put.flush({ language: { ...CZECH, enabled: true } });
      await expect(changed).resolves.toEqual({ ...CZECH, enabled: true });

      const gone = api.deleteLanguage('cs');
      await settle();
      const removed = http.expectOne('/api/owner/languages/cs');
      expect(removed.request.method).toBe('DELETE');
      removed.flush(null, { status: 204, statusText: 'No Content' });
      await expect(gone).resolves.toBeUndefined();
    });

    it('read, save, export and import the strings under /api/owner/translations', async () => {
      const grid = api.translationGrid();
      await settle();
      http.expectOne({ method: 'GET', url: '/api/owner/translations' }).flush(GRID);
      await expect(grid).resolves.toEqual(GRID);

      // Only the changed cells go, wrapped in `values`.
      const saved = api.saveTranslations({ 'common.loading': { en: 'Wait…' } });
      await settle();
      const save = http.expectOne({ method: 'PUT', url: '/api/owner/translations' });
      expect(save.request.body).toEqual({ values: { 'common.loading': { en: 'Wait…' } } });
      save.flush(GRID);
      await expect(saved).resolves.toEqual(GRID);

      const exported = api.exportTranslations('sk');
      await settle();
      http.expectOne({ method: 'GET', url: '/api/owner/translations/sk/export' }).flush({ 'common.loading': 'Načítava sa…' });
      await expect(exported).resolves.toEqual({ 'common.loading': 'Načítava sa…' });

      // The file's strings go as they are: one flat object.
      const imported = api.importTranslations('sk', { 'common.loading': 'Načítavam…' });
      await settle();
      const put = http.expectOne({ method: 'PUT', url: '/api/owner/translations/sk/import' });
      expect(put.request.body).toEqual({ 'common.loading': 'Načítavam…' });
      put.flush(GRID);
      await expect(imported).resolves.toEqual(GRID);
    });

    it('go through the same gate as every call: nothing is sent for another person, or for nobody', async () => {
      api.setDataOwner('7');
      await expect(api.saveTranslations({ 'common.loading': { en: 'x' } })).rejects.toMatchObject({ status: 409, wrongUser: true, details: null });
      auth.mode.set(null);
      await expect(api.languages()).rejects.toMatchObject({ status: 401, details: null });
      http.expectNone('/api/owner/translations');
      http.expectNone('/api/owner/languages');
    });

    it("keep the answer's body of a refusal as `details`: the server's sentence, and the key and language it is about", async () => {
      const body = {
        error: 'The Slovak string of "common.loading" uses {pocet}, which its English string does not have.',
        code: 'unknown_placeholder',
        key: 'common.loading',
        language: 'sk',
        placeholder: 'pocet',
      };
      const saved = api.saveTranslations({ 'common.loading': { sk: '{pocet}' } });
      await settle();
      http.expectOne('/api/owner/translations').flush(body, { status: 422, statusText: 'Unprocessable Content' });

      await expect(saved).rejects.toMatchObject({ status: 422, code: 'unknown_placeholder', wrongUser: false, details: body });
    });

    it('have no details when the answer is no object: a text, a list, or no answer at all', async () => {
      const text = api.translationGrid();
      await settle();
      http.expectOne('/api/owner/translations').flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
      await expect(text).rejects.toMatchObject({ status: 502, code: null, details: null });

      const list = api.translationGrid();
      await settle();
      http.expectOne('/api/owner/translations').flush(['no'], { status: 500, statusText: 'Server Error' });
      await expect(list).rejects.toMatchObject({ status: 500, code: null, details: null });

      const none = api.translationGrid();
      await settle();
      http.expectOne('/api/owner/translations').error(new ProgressEvent('error'));
      await expect(none).rejects.toMatchObject({ status: 0, code: null, details: null });
    });
  });
});
