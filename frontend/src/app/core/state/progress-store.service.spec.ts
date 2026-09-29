import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import { NoteState } from '../music/music.types';
import { SrsService } from '../music/srs.service';
import { ProgressStore, RETRY_MS } from './progress-store.service';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('ProgressStore', () => {
  let store: ProgressStore;
  let http: HttpTestingController;
  let note: (midi: number) => NoteState;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(AuthService).mode.set('none');
    TestBed.inject(ApiService).setDataOwner('local');
    store = TestBed.inject(ProgressStore);
    http = TestBed.inject(HttpTestingController);
    const srs = TestBed.inject(SrsService);
    note = (midi) => ({ ...srs.createInitialNoteState(midi), status: 'review' });
    store.load({ progress: {}, sessions: [], path: { steps: {} } });
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('keeps a copy of what it saves, and sends the latest when the save\'s turn comes', async () => {
    const progress: Record<string, NoteState> = { 60: note(60) };
    const first = store.saveProgress(progress);
    progress['62'] = note(62); // the caller keeps working on its own object
    const second = store.saveProgress(progress);
    await settle();

    const one = http.expectOne('/api/progress');
    expect(Object.keys(one.request.body)).toEqual(['60', '62']);
    one.flush(null, { status: 204, statusText: 'No Content' });
    await first;
    await settle();
    const two = http.expectOne('/api/progress');
    two.flush(null, { status: 204, statusText: 'No Content' });
    await second;
    expect(store.unsaved()).toBe(false);
  });

  it('a failed save is marked, and the latest state goes again after a while', async () => {
    const saving = store.saveProgress({ 60: note(60) }).catch(() => 'failed');
    await settle();
    http.expectOne('/api/progress').flush({ error: 'down', code: 'database_unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(await saving).toBe('failed');
    expect(store.progressFailed()).toBe(true);
    expect(store.unsaved()).toBe(true);

    await vi.advanceTimersByTimeAsync(RETRY_MS);
    await settle();
    const retry = http.expectOne('/api/progress');
    expect(Object.keys(retry.request.body)).toEqual(['60']);
    retry.flush(null, { status: 204, statusText: 'No Content' });
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
});
