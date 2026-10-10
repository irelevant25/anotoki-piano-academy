import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiService, EXPORT_LIMIT, ImportPreview } from '../../../core/api/api.service';
import { ProgressStore } from '../../../core/state/progress-store.service';
import { TestQuestions, drawTestQuestions, provideTestKit } from '../../../core/testing/test-kit';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { OwnProgressComponent, ownProgressProblem } from './own-progress.component';

/** The card's Slovak, as migration 004 writes it. */
const SLOVAK: Record<string, string> = {
  'ownProgress.title': 'Súbor s tvojím postupom',
  'ownProgress.text': 'Ulož si kópiu svojho postupu alebo ho obnov zo súboru – napríklad z iného počítača.',
  'ownProgress.download': 'Stiahnuť',
  'ownProgress.bringBack': 'Obnoviť zo súboru',
  'ownProgress.working': 'Chvíľku…',
  'ownProgress.preview.title': 'Čo prináša tento súbor',
  'ownProgress.preview.now': 'Uložené teraz',
  'ownProgress.preview.file': 'V súbore',
  'ownProgress.preview.leftOut.one': '{count} kolo v súbore sa nedá použiť a vynechá sa.',
  'ownProgress.preview.leftOut.few': '{count} kolá v súbore sa nedajú použiť a vynechajú sa.',
  'ownProgress.preview.leftOut.other': '{count} kôl v súbore sa nedá použiť a vynechá sa.',
  'ownProgress.preview.replaces': 'Obnovením sa tvoj postup nahradí: to, čo je uložené teraz, sa natrvalo stratí.',
  'ownProgress.preview.bringIn': 'Obnoviť',
  'ownProgress.preview.replace': 'Nahradiť môj postup',
  'ownProgress.cancel': 'Zrušiť',
  'ownProgress.confirm.title': 'Nahradiť tvoj postup?',
  'ownProgress.confirm.text': 'Tvoj uložený postup zmizne a na jeho miesto príde ten zo súboru. Nedá sa to vrátiť – ak ho možno budeš chcieť späť, najprv si ho stiahni.',
  'ownProgress.confirm.yes': 'Nahradiť',
  'ownProgress.confirm.no': 'Ponechať môj',
  'ownProgress.done': 'Postup zo súboru je obnovený:',
  'ownProgress.count.notes.one': '{count} nota',
  'ownProgress.count.notes.few': '{count} noty',
  'ownProgress.count.notes.other': '{count} nôt',
  'ownProgress.count.steps.one': '{count} krok cesty',
  'ownProgress.count.steps.few': '{count} kroky cesty',
  'ownProgress.count.steps.other': '{count} krokov cesty',
  'ownProgress.count.rounds.one': '{count} kolo',
  'ownProgress.count.rounds.few': '{count} kolá',
  'ownProgress.count.rounds.other': '{count} kôl',
  'ownProgress.error.unsaved': 'Časť tvojho postupu ešte nie je uložená. Počkaj, kým sa uloží, a skús to znova.',
  'ownProgress.error.tooLarge': 'Tento súbor je príliš veľký. Súbor s postupom má najviac {megabytes} MB.',
  'ownProgress.error.exportTooLarge': 'Tvoj postup je na jeden súbor príliš veľký (najviac {megabytes} MB), preto sa tu nedá stiahnuť.',
  'ownProgress.error.notAnExport': 'Tento súbor nie je súbor s postupom z aplikácie Piano Academy.',
  'ownProgress.error.invalidExport': 'Tento súbor s postupom je poškodený alebo z inej verzie aplikácie, preto sa nič neobnovilo.',
  'ownProgress.error.unreadable': 'Prehliadač tento súbor nedokázal prečítať.',
  'ownProgress.error.signedOut': 'Prihlásenie sa skončilo. Prihlás sa a skús to znova.',
  'ownProgress.error.otherPerson': 'Na inej karte je teraz prihlásený niekto iný. Načítaj stránku znova.',
  'ownProgress.error.offline': 'Server sa nepodarilo zastihnúť. Skontroluj pripojenie a skús to znova.',
  'ownProgress.error.notSetUp': 'Aplikácia sa práve aktualizuje. Skús to o chvíľu znova.',
  'ownProgress.error.failed': 'Nepodarilo sa to. Skús to znova.',
  'ownProgress.error.hasProgressNow': 'Medzitým pribudol v tvojom účte postup. Je ukázaný nižšie: obnovením zo súboru sa teraz nahradí.',
  'ownProgress.error.reload': 'Súbor je obnovený, ale táto stránka ho nedokázala načítať. Načítaj stránku znova.',
};

const TEXT = '{"format":"piano-academy-export","version":1}';
const EMPTY = { notes: 0, steps: 0, sessions: 0 };
const preview = (more: Partial<ImportPreview> = {}): ImportPreview => ({ dryRun: true, hasProgress: false, current: EMPTY, incoming: { notes: 3, steps: 2, sessions: 5 }, leftOut: 0, ...more });
const refused = (status: number, code: string | null, extra: Record<string, unknown> = {}) => new ApiError(`failed: ${status}`, status, code, false, code ? { error: 'The server’s own sentence.', code, ...extra } : null);

describe('OwnProgressComponent: the learner’s own progress file', () => {
  let fixture: ComponentFixture<OwnProgressComponent>;
  let host: HTMLElement;
  const api = {
    exportMyProgress: vi.fn(),
    previewImport: vi.fn(),
    importMyProgress: vi.fn(),
  };
  const store = { hasUnsaved: vi.fn(() => false), announceReplaced: vi.fn(), reloadFromServer: vi.fn(async () => undefined) };

  /** The family's question (ConfirmService), drawn beside the page as the app's root draws it. */
  let questions: TestQuestions;

  // The family's dialog asks jsdom for what it lacks (showModal(), checkVisibility()).
  beforeAll(() => provideTestKit());
  afterEach(() => questions.remove());

  beforeEach(async () => {
    for (const mock of [...Object.values(api), ...Object.values(store)]) mock.mockReset();
    store.hasUnsaved.mockReturnValue(false);
    store.reloadFromServer.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [provideTestTranslations(SLOVAK, { language: 'sk' }), { provide: ApiService, useValue: api }, { provide: ProgressStore, useValue: store }],
    });
    questions = drawTestQuestions();
    fixture = TestBed.createComponent(OwnProgressComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  const text = (selector: string): string | null => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const press = async (selector: string): Promise<void> => {
    (host.querySelector(selector) as HTMLButtonElement).click();
    await fixture.whenStable();
  };
  /** The person chooses a file (or something that says it is one, of this size). */
  async function choose(file: { size: number; text: () => Promise<string> }): Promise<void> {
    const input = host.querySelector<HTMLInputElement>('#own-file')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }
  const file = (content = TEXT) => ({ size: content.length, text: vi.fn(async () => content) });
  async function answer(yes: boolean): Promise<void> {
    questions.answer(yes);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  it('downloads the file under the name the server gave', async () => {
    api.exportMyProgress.mockResolvedValue({ name: 'piano-academy-progress-2026-10-04.json', text: TEXT });
    const created = vi.fn((_blob: Blob) => 'blob:own');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });

    await press('#own-download');
    expect(clicked).toEqual(['piano-academy-progress-2026-10-04.json']);
    expect(await created.mock.calls[0][0].text()).toBe(TEXT);
    expect(text('#own-problem')).toBeNull();
    vi.restoreAllMocks();
  });

  it('says why a download was refused, in the learner’s words - never the server’s sentence', async () => {
    api.exportMyProgress.mockRejectedValue(refused(409, 'export_too_large', { limit: EXPORT_LIMIT }));
    await press('#own-download');
    expect(text('#own-problem')).toBe('Tvoj postup je na jeden súbor príliš veľký (najviac 5 MB), preto sa tu nedá stiahnuť.');
  });

  it('refuses a file over the limit before sending anything', async () => {
    const big = { size: EXPORT_LIMIT + 1, text: vi.fn(async () => TEXT) };
    await choose(big);
    expect(api.previewImport).not.toHaveBeenCalled();
    expect(big.text).not.toHaveBeenCalled();
    expect(text('#own-problem')).toBe('Tento súbor je príliš veľký. Súbor s postupom má najviac 5 MB.');
  });

  it('refuses a file while some progress is not saved yet: a waiting save would be refused after the import', async () => {
    store.hasUnsaved.mockReturnValue(true);
    await choose(file());
    expect(api.previewImport).not.toHaveBeenCalled();
    expect(text('#own-problem')).toBe('Časť tvojho postupu ešte nie je uložená. Počkaj, kým sa uloží, a skús to znova.');
  });

  it('shows what the file brings first (the dry run), then brings it into an account without progress at the second press', async () => {
    api.previewImport.mockResolvedValue(preview({ leftOut: 2 }));
    await choose(file());
    expect(api.previewImport).toHaveBeenCalledWith(TEXT);
    expect(text('#own-now')).toBe('0 nôt, 0 krokov cesty, 0 kôl');
    expect(text('#own-incoming')).toBe('3 noty, 2 kroky cesty, 5 kôl');
    expect(text('#own-left-out')).toBe('2 kolá v súbore sa nedajú použiť a vynechajú sa.');
    expect(host.querySelector('#own-replaces')).toBeNull();
    expect(api.importMyProgress).not.toHaveBeenCalled();

    api.importMyProgress.mockResolvedValue({ notes: 3, steps: 2, sessions: 1, replaced: false, generation: 8, leftOut: 2 });
    expect(text('#own-bring-in')).toBe('Obnoviť');
    await press('#own-bring-in');
    await fixture.whenStable();
    expect(api.importMyProgress).toHaveBeenCalledWith(TEXT, false);
    // No question: there was nothing to replace.
    expect(questions.open()).toBeNull();
    // The import started a new generation: the page loads it, and the other tabs are told.
    expect(store.announceReplaced).toHaveBeenCalledTimes(1);
    expect(store.reloadFromServer).toHaveBeenCalledTimes(1);
    expect(text('#own-done')).toBe('Postup zo súboru je obnovený: 3 noty, 2 kroky cesty, 1 kolo');
    expect(host.querySelector('#own-preview')).toBeNull();
  });

  it('replaces progress only after the question said yes - and never when it said no', async () => {
    api.previewImport.mockResolvedValue(preview({ hasProgress: true, current: { notes: 12, steps: 4, sessions: 30 } }));
    await choose(file());
    expect(text('#own-now')).toBe('12 nôt, 4 kroky cesty, 30 kôl');
    expect(text('#own-replaces')).toBe('Obnovením sa tvoj postup nahradí: to, čo je uložené teraz, sa natrvalo stratí.');
    expect(text('#own-bring-in')).toBe('Nahradiť môj postup');

    await press('#own-bring-in');
    expect(questions.open()).not.toBeNull();
    expect(questions.title()).toBe('Nahradiť tvoj postup?');
    expect(questions.answers()).toEqual(['Ponechať môj', 'Nahradiť']);
    await answer(false);
    expect(api.importMyProgress).not.toHaveBeenCalled();
    expect(host.querySelector('#own-preview')).not.toBeNull();

    api.importMyProgress.mockResolvedValue({ notes: 3, steps: 2, sessions: 5, replaced: true, generation: 9, leftOut: 0 });
    await press('#own-bring-in');
    await answer(true);
    expect(api.importMyProgress).toHaveBeenCalledWith(TEXT, true);
    expect(store.reloadFromServer).toHaveBeenCalledTimes(1);
  });

  it('asks before replacing when progress came into the account between the look and the press (409 has_progress)', async () => {
    api.previewImport.mockResolvedValue(preview());
    await choose(file());
    api.importMyProgress.mockRejectedValueOnce(refused(409, 'has_progress', { current: { notes: 1, steps: 0, sessions: 1 } }));
    await press('#own-bring-in');
    await fixture.whenStable();
    expect(text('#own-problem')).toBe('Medzitým pribudol v tvojom účte postup. Je ukázaný nižšie: obnovením zo súboru sa teraz nahradí.');
    expect(text('#own-now')).toBe('1 nota, 0 krokov cesty, 1 kolo');
    expect(text('#own-bring-in')).toBe('Nahradiť môj postup');
    expect(api.importMyProgress).toHaveBeenCalledTimes(1);
  });

  it('cancel drops the file: nothing is written', async () => {
    api.previewImport.mockResolvedValue(preview());
    await choose(file());
    await press('#own-cancel');
    expect(host.querySelector('#own-preview')).toBeNull();
    expect(api.importMyProgress).not.toHaveBeenCalled();
  });

  it('words a refused file from its code', async () => {
    api.previewImport.mockRejectedValue(refused(422, 'not_an_export'));
    await choose(file('[1, 2]'));
    expect(text('#own-problem')).toBe('Tento súbor nie je súbor s postupom z aplikácie Piano Academy.');
    expect(host.querySelector('#own-preview')).toBeNull();

    const unreadable = { size: 10, text: vi.fn(async () => Promise.reject(new Error('NotReadableError'))) };
    await choose(unreadable);
    expect(text('#own-problem')).toBe('Prehliadač tento súbor nedokázal prečítať.');
  });

  it('says when the file is in but the page could not load it', async () => {
    api.previewImport.mockResolvedValue(preview());
    await choose(file());
    api.importMyProgress.mockResolvedValue({ notes: 3, steps: 2, sessions: 5, replaced: false, generation: 9, leftOut: 0 });
    store.reloadFromServer.mockRejectedValue(new ApiError('down', 0));
    await press('#own-bring-in');
    await fixture.whenStable();
    expect(text('#own-progress [role="alert"]')).toBe('Súbor je obnovený, ale táto stránka ho nedokázala načítať. Načítaj stránku znova.');
  });
});

describe('ownProgressProblem(): every code the own file’s routes give, worded by a key of its own', () => {
  it.each([
    [refused(422, 'not_an_export'), 'ownProgress.error.notAnExport'],
    [refused(422, 'invalid_export'), 'ownProgress.error.invalidExport'],
    [refused(413, 'too_large'), 'ownProgress.error.tooLarge'],
    [refused(413, null), 'ownProgress.error.tooLarge'],
    [refused(409, 'export_too_large'), 'ownProgress.error.exportTooLarge'],
    [refused(503, 'not_set_up'), 'ownProgress.error.notSetUp'],
    [refused(503, 'update_pending'), 'ownProgress.error.notSetUp'],
    [refused(401, 'sign_in_required'), 'ownProgress.error.signedOut'],
    [refused(401, 'invalid_token'), 'ownProgress.error.signedOut'],
    [new ApiError('Not signed in', 401), 'ownProgress.error.signedOut'],
    [new ApiError('Signed in as somebody else', 409, null, true), 'ownProgress.error.otherPerson'],
    [new ApiError('no answer', 0), 'ownProgress.error.offline'],
    [refused(415, 'unsupported_media_type'), 'ownProgress.error.failed'],
    [refused(500, 'server_error'), 'ownProgress.error.failed'],
    [new Error('anything'), 'ownProgress.error.failed'],
  ])('%#: %s', (error, key) => {
    expect(ownProgressProblem(error).key).toBe(key);
  });

  it('gives the size limit as whole megabytes', () => {
    expect(ownProgressProblem(refused(413, 'too_large')).params).toEqual({ megabytes: 5 });
  });
});
