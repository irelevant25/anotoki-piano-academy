import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { ApiService, GENERATION_HEADER, isProgressChanged } from './api.service';

/** Lets the service's awaits run until it has sent its next request. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const EMPTY = { progress: {}, sessions: [], path: { steps: {} } };

describe('ApiService: the generation of the progress, the own file', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AnotokiAuth, useValue: { subject: () => '5' } }] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
    api.setDataOwner('5');
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  async function loaded(generation: unknown): Promise<void> {
    const state = api.fetchState();
    await settle();
    http.expectOne('/api/state').flush({ ...EMPTY, generation });
    // The documents only: the generation stays with the service.
    expect(await state).toEqual(EMPTY);
  }

  it('names the generation GET /api/state gave on every save of a whole document', async () => {
    await loaded(41);
    const progress = api.saveProgress({});
    const path = api.savePath({ steps: {} });
    await settle();
    for (const url of ['/api/progress', '/api/path']) {
      const put = http.expectOne(url);
      expect(put.request.method).toBe('PUT');
      expect(put.request.headers.get(GENERATION_HEADER)).toBe('41');
      put.flush(null, { status: 204, statusText: 'No Content' });
    }
    await Promise.all([progress, path]);

    // A load after an import names the new one.
    await loaded(42);
    const again = api.saveProgress({});
    await settle();
    const next = http.expectOne('/api/progress');
    expect(next.request.headers.get(GENERATION_HEADER)).toBe('42');
    next.flush(null, { status: 204, statusText: 'No Content' });
    await again;
  });

  it('never sends a save without a generation - so the server never has to answer 428', async () => {
    for (const given of [undefined, null, 0, -1, 1.5, '7', 2 ** 60]) {
      await loaded(given);
      await expect(api.saveProgress({})).rejects.toSatisfy(isProgressChanged);
      await expect(api.savePath({ steps: {} })).rejects.toSatisfy(isProgressChanged);
    }
    http.expectNone('/api/progress');
    http.expectNone('/api/path');
  });

  it('isProgressChanged: 409 progress_changed only - never another 409, never a 428', async () => {
    await loaded(3);
    const saving = api.saveProgress({});
    await settle();
    http.expectOne('/api/progress').flush({ error: 'Your progress was replaced.', code: 'progress_changed', generation: 4 }, { status: 409, statusText: 'Conflict' });
    const refused = await saving.catch((error: unknown) => error);
    expect(isProgressChanged(refused)).toBe(true);
    expect(refused).toMatchObject({ status: 409, code: 'progress_changed', details: { generation: 4 } });

    const other = api.importMyProgress('{}', false).catch((error: unknown) => error);
    await settle();
    http.expectOne('/api/me/import').flush({ error: 'You have progress.', code: 'has_progress' }, { status: 409, statusText: 'Conflict' });
    expect(isProgressChanged(await other)).toBe(false);

    // The header lost on the way: a failed save, not a change elsewhere.
    const headerless = api.savePath({ steps: {} }).catch((error: unknown) => error);
    await settle();
    http.expectOne('/api/path').flush({ error: 'Name the generation.', code: 'generation_required' }, { status: 428, statusText: 'Precondition Required' });
    expect(isProgressChanged(await headerless)).toBe(false);
  });

  it('downloads the own file as it came, under the name the server gave', async () => {
    const file = api.exportMyProgress();
    await settle();
    const request = http.expectOne('/api/me/export');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('text');
    request.flush('{"format":"piano-academy-export"}', { headers: { 'Content-Disposition': 'attachment; filename="piano-academy-progress-2026-10-04.json"' } });
    expect(await file).toEqual({ name: 'piano-academy-progress-2026-10-04.json', text: '{"format":"piano-academy-export"}' });
  });

  it('names a download itself when the server gave no plain name - and reads the code of a refusal sent as text', async () => {
    const file = api.exportMyProgress();
    await settle();
    http.expectOne('/api/me/export').flush('{}', { headers: { 'Content-Disposition': 'attachment; filename="../x.json"; x' } });
    expect((await file).name).toMatch(/^piano-academy-progress-\d{4}-\d{2}-\d{2}\.json$/);

    const big = api.exportMyProgress().catch((error: unknown) => error);
    await settle();
    http.expectOne('/api/me/export').flush(JSON.stringify({ error: 'Too large.', code: 'export_too_large', limit: 5242880 }), { status: 409, statusText: 'Conflict' });
    expect(await big).toMatchObject({ status: 409, code: 'export_too_large', details: { limit: 5242880 } });
  });

  it('sends a chosen file as it was read, as JSON: first a dry run, then into the account - replacing only when told', async () => {
    const text = '{"format":"piano-academy-export","version":1}';
    const preview = api.previewImport(text);
    await settle();
    const dry = http.expectOne('/api/me/import?dryRun=true');
    expect(dry.request.method).toBe('POST');
    expect(dry.request.body).toBe(text);
    expect(dry.request.headers.get('Content-Type')).toBe('application/json');
    const looked = { dryRun: true, hasProgress: false, current: { notes: 0, steps: 0, sessions: 0 }, incoming: { notes: 3, steps: 1, sessions: 2 }, leftOut: 0 };
    dry.flush(looked);
    expect(await preview).toEqual(looked);

    const into = api.importMyProgress(text, false);
    await settle();
    const plain = http.expectOne('/api/me/import');
    expect(plain.request.body).toBe(text);
    expect(plain.request.headers.get('Content-Type')).toBe('application/json');
    plain.flush({ notes: 3, steps: 1, sessions: 2, replaced: false, generation: 9, leftOut: 0 });
    await into;

    const over = api.importMyProgress(text, true);
    await settle();
    http.expectOne('/api/me/import?replace=true').flush({ notes: 3, steps: 1, sessions: 2, replaced: true, generation: 10, leftOut: 0 });
    expect(await over).toMatchObject({ replaced: true, generation: 10 });
  });
});
