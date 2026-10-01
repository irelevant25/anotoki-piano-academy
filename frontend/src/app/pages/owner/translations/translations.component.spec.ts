import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { OwnerLanguage, TranslationGrid, TranslationKeyRow } from '../../../core/i18n/translation.model';
import { TranslationService } from '../../../core/i18n/translation.service';
import { LOCALIZATION_DRAFTS_KEY, LocalizationDrafts } from '../../../core/owner/localization-drafts.service';
import { provideTestDialog } from '../../../core/testing/test-dialog';
import { TranslationsComponent } from './translations.component';

const ENGLISH: OwnerLanguage = { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true };
const SLOVAK: OwnerLanguage = { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', enabled: true, sortOrder: 2, seeded: true };
const CZECH: OwnerLanguage = { code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false, sortOrder: 3, seeded: false };
const GERMAN: OwnerLanguage = { code: 'de', name: 'German', nativeName: 'Deutsch', enabled: false, sortOrder: 4, seeded: false };

/** The owner, as AuthService.userKey() names the person signed in. */
const OWNER = '7';

/** A promise the test settles by hand: the server's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** What the server answers when it refuses: its sentence and code in the body, with whatever else it says (key, language). */
function refused(status: number, code: string, sentence: string, more: Record<string, unknown> = {}): ApiError {
  return new ApiError(`PUT /api/owner/translations failed: ${status}`, status, code, false, { error: sentence, code, ...more });
}

/** No answer at all: the network, or the server down. */
const NO_ANSWER = new ApiError('PUT /api/owner/translations failed: 0', 0);
const NO_ANSWER_TEXT = 'The server could not be reached. Check the connection and try again.';

const key = (name: string, values: Record<string, string>, description = ''): TranslationKeyRow => ({ name, description, values });

/** As the API sends it: the keys by name, so a family's forms come few, one, other. */
function grid(changes: Record<string, Record<string, string>> = {}, languages: OwnerLanguage[] = [ENGLISH, SLOVAK]): TranslationGrid {
  const keys = [
    key('common.close', { en: 'Close', sk: 'Zavrieť' }, 'A button that closes what is open.'),
    key('home.due.few', { en: '{count} notes are due', sk: '{count} noty čakajú' }, 'How many notes are due for review. {count} is the number.'),
    key('home.due.one', { en: '{count} note is due', sk: '1 nota čaká' }, 'How many notes are due for review. {count} is the number.'),
    key('home.due.other', { en: '{count} notes are due', sk: '{count} nôt čaká' }, 'How many notes are due for review. {count} is the number.'),
    key('home.title', { en: 'Start here' }, 'Home page: the heading.'),
  ];
  return { languages, keys: keys.map((row) => ({ ...row, values: { ...row.values, ...changes[row.name] } })) };
}

describe('TranslationsComponent', () => {
  let fixture: ComponentFixture<TranslationsComponent>;
  let host: HTMLElement;
  let api: {
    translationGrid: ReturnType<typeof vi.fn>;
    saveTranslations: ReturnType<typeof vi.fn>;
    exportTranslations: ReturnType<typeof vi.fn>;
    importTranslations: ReturnType<typeof vi.fn>;
  };
  let refreshed: ReturnType<typeof vi.fn>;

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string, within: ParentNode = host) => clean(within.querySelector(selector)?.textContent);
  const all = (selector: string, within: ParentNode = host) => Array.from(within.querySelectorAll(selector)).map((element) => clean(element.textContent));
  /** The pieces of each element - its children - with a space between, as the eye sees them. */
  const parts = (selector: string) => Array.from(host.querySelectorAll(selector)).map((element) => all(':scope > *', element).join(' '));
  const row = (name: string) => host.querySelector<HTMLElement>(`[id="key-${name}"]`)!;
  const box = (name: string, code: string) => row(name).querySelector<HTMLTextAreaElement>(`textarea[lang="${code}"]`)!;
  const shownKeys = () => all('.key-name');
  const button = (label: string, within: ParentNode = host) => Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => clean(candidate.textContent) === label)!;
  const bar = () => text('.bar-state');
  const question = () => host.querySelector<HTMLDialogElement>('dialog.confirm')!;

  /** Lets the promises of a click run out, then the page draw. */
  async function settle(): Promise<void> {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }

  async function type(element: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  /** Answers the question that is open - "Leave without saving?", "Import ... ?" - and says what it asked. */
  async function answer(yes: boolean): Promise<string> {
    const title = question().hasAttribute('open') ? text('#ow-confirm-title') : '';
    question()
      .querySelector<HTMLButtonElement>(`[data-answer="${yes ? 'yes' : 'no'}"]`)!
      .click();
    await settle();
    return title;
  }

  async function page(answerWith: TranslationGrid | ApiError = grid(), person: string | null = OWNER): Promise<void> {
    api = {
      translationGrid: answerWith instanceof ApiError ? vi.fn().mockRejectedValue(answerWith) : vi.fn().mockResolvedValue(answerWith),
      saveTranslations: vi.fn(),
      exportTranslations: vi.fn(),
      importTranslations: vi.fn(),
    };
    refreshed = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { userKey: () => person, signedIn: () => person !== null, onAuthChange: () => () => undefined } },
        { provide: TranslationService, useValue: { reload: refreshed } },
      ],
    });
    await draw();
  }

  /** The page drawn - the first time, or again after it was left. */
  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(TranslationsComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  beforeAll(() => provideTestDialog());

  beforeEach(() => sessionStorage.clear());

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    sessionStorage.clear();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('shows a row for every key - its name, what it is for - and a box for every language', async () => {
    await page();

    expect(text('h2')).toBe('Translations');
    expect(all('.keys-head span')).toEqual(['Key', 'English', 'Slovak']);
    expect(shownKeys()).toEqual(['common.close', 'home.due.one', 'home.due.few', 'home.due.other', 'home.title']);
    expect(text('.description', row('common.close'))).toBe('A button that closes what is open.');
    expect(box('common.close', 'en').value).toBe('Close');
    expect(box('common.close', 'sk').value).toBe('Zavrieť');
    expect(box('common.close', 'sk').getAttribute('aria-label')).toBe('Slovak: common.close');
    expect(box('common.close', 'sk').rows).toBe(1);

    // An empty box says what leaving it empty means.
    expect(box('home.title', 'sk').value).toBe('');
    expect(box('home.title', 'sk').placeholder).toBe('Falls back to English');
    expect(box('home.title', 'en').placeholder).toBe('Required');
    expect(text('.shown')).toBe('5 of 5 keys');
  });

  it('is an English page whatever language the app is read in, and links to the languages', async () => {
    await page();

    // The root says so: the shell around it may be Slovak.
    const root = host.firstElementChild!;
    expect(root.getAttribute('lang')).toBe('en');
    // Everything the page draws is inside it - the question it asks, too.
    expect(root.contains(question())).toBe(true);
    expect(Array.from(host.children)).toHaveLength(1);
    expect(Array.from(host.querySelectorAll('.page-head a')).map((link) => [clean(link.textContent), link.getAttribute('href')])).toEqual([['Languages', '/languages']]);
  });

  it('says how much of each language is written - a plain count - and which is the fallback and which is hidden', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));

    expect(all('.language-name strong')).toEqual(['English', 'Slovak', 'Czech']);
    expect(all('.coverage-count')).toEqual(['5 of 5', '4 of 5', '0 of 5']);
    expect(all('.coverage')).toEqual(['5 of 5 keys have a string', '4 of 5 keys have a string', '0 of 5 keys have a string']);
    expect(parts('.language-name')).toEqual(['English en Fallback', 'Slovak sk', 'Czech cs Hidden']);
  });

  it('counts a language as written without the forms its numbers never take: German has no `few`', async () => {
    // Every key in German but the family's `few` - which German never says, and the app never reads.
    const german = { 'common.close': { de: 'Schließen' }, 'home.due.one': { de: '{count} Note wartet' }, 'home.due.other': { de: '{count} Noten warten' }, 'home.title': { de: 'Hier beginnen' } };
    // Slovak in the same state is not finished: it says `few` for 2, 3 and 4.
    await page(grid({ ...german, 'home.due.few': { sk: '' }, 'home.title': { sk: 'Začni tu', de: 'Hier beginnen' } }, [ENGLISH, SLOVAK, GERMAN]));

    expect(all('.coverage-count')).toEqual(['5 of 5', '4 of 5', '4 of 4']);
    expect(all('.numbers', row('home.due.few'))).toEqual([
      'For the numbers: not used in English - the fallback for other languages',
      'For the numbers: 2-4',
      'For the numbers: not used in German',
    ]);

    const select = host.querySelector<HTMLSelectElement>('select')!;
    const missingIn = async (code: string) => {
      select.value = code;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    };
    await missingIn('de');
    expect(shownKeys()).toEqual([]);
    expect(text('.empty')).toContain('Nothing is missing in German');
    await missingIn('sk');
    expect(shownKeys()).toEqual(['home.due.one', 'home.due.few', 'home.due.other']);
  });

  it('holds a plural family together: one, few, other, the numbers each is for, and the family tried on 1, 3 and 12', async () => {
    await page();

    const block = host.querySelector<HTMLElement>('.block.is-plural')!;
    expect(text('.family code', block)).toBe('home.due');
    expect(text('.family-note', block)).toBe('Plural: one text for each kind of number');
    expect(all('.key-name', block)).toEqual(['home.due.one', 'home.due.few', 'home.due.other']);
    expect(all('.numbers', block)).toEqual([
      'For the numbers: 1',
      'For the numbers: 1',
      'For the numbers: not used in English - the fallback for other languages',
      'For the numbers: 2-4',
      'For the numbers: everything else',
      'For the numbers: 0, 5 and more',
    ]);
    expect(text('.samples-lead', block)).toBe('As the app says it for 1, 3 and 12');
    expect(all('.sample[lang="en"] li', block)).toEqual(['1 note is due', '3 notes are due', '12 notes are due']);
    expect(all('.sample[lang="sk"] li', block)).toEqual(['1 nota čaká', '3 noty čakajú', '12 nôt čaká']);
    // Every other key is a block of its own, with no such line.
    expect(host.querySelectorAll('.block')).toHaveLength(3);
    expect(host.querySelectorAll('.samples')).toHaveLength(1);

    // The line follows the boxes as they are typed in - and an emptied form reads in English, as in the app.
    await type(box('home.due.few', 'sk'), '{count} nôtky čakajú');
    expect(all('.sample[lang="sk"] li', block)).toEqual(['1 nota čaká', '3 nôtky čakajú', '12 nôt čaká']);
    await type(box('home.due.few', 'sk'), '');
    expect(all('.sample[lang="sk"] li', block)).toEqual(['1 nota čaká', '3 notes are due', '12 nôt čaká']);
  });

  it('finds by a key or a text, whatever the case and the diacritics', async () => {
    await page();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;

    await type(search, 'ZAVRIET');
    expect(shownKeys()).toEqual(['common.close']);
    expect(text('.shown')).toBe('1 of 5 keys');

    await type(search, 'not caka');
    expect(shownKeys()).toEqual(['home.due.one', 'home.due.few', 'home.due.other']);

    await type(search, 'home.ti');
    expect(shownKeys()).toEqual(['home.title']);

    await type(search, 'nothing like this');
    expect(shownKeys()).toEqual([]);
    expect(text('.empty')).toContain('No key matches');

    button('Show every key').click();
    await settle();
    expect(shownKeys()).toHaveLength(5);
    expect(search.value).toBe('');
  });

  it('shows only what a language is missing - and keeps the row while it is being filled in', async () => {
    await page();
    const select = host.querySelector<HTMLSelectElement>('select')!;
    expect(Array.from(select.options).map((option) => clean(option.textContent))).toEqual(['Every key', 'Missing in Slovak']);

    select.value = 'sk';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(shownKeys()).toEqual(['home.title']);

    await type(box('home.title', 'sk'), 'Začni tu');
    expect(shownKeys()).toEqual(['home.title']);
  });

  it('saves with one button only the boxes that changed, marks them until then, and takes the grid the server answers', async () => {
    await page();
    const save = button('Save');
    expect(save.disabled).toBe(true);
    expect(bar()).toBe('Everything is saved');
    expect(host.querySelectorAll('.mark')).toHaveLength(0);

    await type(box('home.title', 'sk'), 'Začni tu');
    await type(box('common.close', 'en'), 'Shut');
    await type(box('common.close', 'sk'), 'Zatvoriť');
    // Typed back to what the app has: not a change.
    await type(box('common.close', 'sk'), 'Zavrieť');

    expect(save.disabled).toBe(false);
    expect(bar()).toBe('2 strings changed, not saved yet');
    expect(all('.mark', row('home.title'))).toEqual(['Changed']);
    expect(all('.mark', row('common.close'))).toEqual(['Changed']);
    expect(box('common.close', 'en').closest('.grow')!.classList.contains('is-changed')).toBe(true);
    expect(box('common.close', 'sk').closest('.grow')!.classList.contains('is-changed')).toBe(false);

    // The answer is the grid as it is now - with what somebody else saved meanwhile.
    api.saveTranslations.mockResolvedValue(grid({ 'home.title': { sk: 'Začni tu' }, 'common.close': { en: 'Shut', sk: 'Zatvoriť' } }));
    save.click();
    await settle();

    expect(api.saveTranslations).toHaveBeenCalledTimes(1);
    expect(api.saveTranslations).toHaveBeenCalledWith({ 'home.title': { sk: 'Začni tu' }, 'common.close': { en: 'Shut' } });
    expect(box('common.close', 'sk').value).toBe('Zatvoriť');
    expect(host.querySelectorAll('.mark')).toHaveLength(0);
    expect(button('Save').disabled).toBe(true);
    expect(all('.coverage-count')).toEqual(['5 of 5', '5 of 5']);
    // What became of the save is said where Save is, in a live region - there is no toast here.
    expect(bar()).toBe('2 strings are saved.');
    expect(host.querySelector('.bar-state')!.getAttribute('role')).toBe('status');
    // The app around the page gets its strings again: reload(), never the start's init().
    expect(refreshed).toHaveBeenCalledTimes(1);

    // "Saved" was about the boxes as they stood: the next keystroke takes it away.
    await type(box('home.title', 'sk'), 'Začni tu!');
    expect(bar()).toBe('1 string changed, not saved yet');
    await type(box('home.title', 'sk'), 'Začni tu');
    expect(bar()).toBe('Everything is saved');
  });

  it("shows the server's refusal beside the key it is about, and keeps what was typed", async () => {
    await page();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await type(box('home.due.few', 'sk'), '{pocet} noty čakajú');
    await type(box('home.title', 'sk'), 'Začni');
    // The refused key is brought out of a search that hides it.
    await type(search, 'home.title');
    expect(shownKeys()).toEqual(['home.title']);

    const sentence = 'The Slovak string of "home.due.few" uses {pocet}, which its English string does not have.';
    api.saveTranslations.mockRejectedValue(refused(422, 'unknown_placeholder', sentence, { key: 'home.due.few', language: 'sk', placeholder: 'pocet' }));
    button('Save').click();
    await settle();

    expect(search.value).toBe('');
    expect(shownKeys()).toHaveLength(5);
    // The server's own sentence, as it is: read from the answer's body.
    expect(text('.field-error', row('home.due.few'))).toBe(`Nothing was saved. ${sentence}`);
    expect(row('home.due.few').querySelector('.field-error')!.getAttribute('role')).toBe('alert');
    expect(host.querySelectorAll('.field-error')).toHaveLength(1);
    expect(box('home.due.few', 'sk').getAttribute('aria-invalid')).toBe('true');
    expect(box('home.due.few', 'en').getAttribute('aria-invalid')).toBeNull();
    expect(bar()).toBe('Nothing was saved: see home.due.few');
    // Nothing is lost: both boxes are as typed, and still to save.
    expect(box('home.due.few', 'sk').value).toBe('{pocet} noty čakajú');
    expect(box('home.title', 'sk').value).toBe('Začni');
    expect(button('Save').disabled).toBe(false);
    expect(refreshed).not.toHaveBeenCalled();

    // Changing the refused box answers the refusal.
    await type(box('home.due.few', 'sk'), '{count} noty čakajú!');
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
    expect(box('home.due.few', 'sk').getAttribute('aria-invalid')).toBeNull();
  });

  it('says where Save is - in the bar that stays in view - what is about no key: a save that did not reach the server', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Začni');
    api.saveTranslations.mockRejectedValue(NO_ANSWER);
    button('Save').click();
    await settle();

    expect(bar()).toBe(`Nothing was saved. ${NO_ANSWER_TEXT}`);
    expect(host.querySelector('.bar-state .bar-refused')).not.toBeNull();
    // A live region: said to somebody who does not see the bar, too.
    expect(host.querySelector('.bar-state')!.getAttribute('role')).toBe('status');
    // Not at the top of the page, far above a key low in the list - and beside no key.
    expect(host.querySelector('.problem')).toBeNull();
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
    expect(box('home.title', 'sk').value).toBe('Začni');
    expect(button('Save').disabled).toBe(false);
    expect(refreshed).not.toHaveBeenCalled();

    // The next save that works takes the sentence away.
    api.saveTranslations.mockResolvedValue(grid({ 'home.title': { sk: 'Začni' } }));
    button('Save').click();
    await settle();
    expect(bar()).toBe('The string is saved.');
  });

  it("says the same in the bar for a server that failed - its sentence when it gave one - and takes it away with Discard", async () => {
    await page();
    await type(box('home.title', 'sk'), 'Začni');
    api.saveTranslations.mockRejectedValue(refused(500, 'server', 'Something went wrong on the server.'));
    button('Save').click();
    await settle();
    expect(bar()).toBe('Nothing was saved. Something went wrong on the server.');

    // An answer with no body to read: the page's own words, never a blank.
    api.saveTranslations.mockRejectedValue(new ApiError('PUT /api/owner/translations failed: 502', 502));
    button('Save').click();
    await settle();
    expect(bar()).toBe('Nothing was saved. The server answered with an error (502). Try again.');

    button('Discard').click();
    await settle();
    await answer(true);
    expect(bar()).toBe('Everything is saved');
  });

  it('takes the failed save out of the bar once the owner types again: it says what stands now', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Začni');
    api.saveTranslations.mockRejectedValue(refused(500, 'server', 'Something went wrong on the server.'));
    button('Save').click();
    await settle();
    expect(bar()).toBe('Nothing was saved. Something went wrong on the server.');

    await type(box('home.title', 'sk'), 'Začni tu');
    expect(bar()).toBe('1 string changed, not saved yet');

    // Typed back to what the app has: nothing is changed, and the bar says so.
    await type(box('home.title', 'sk'), '');
    expect(bar()).toBe('Everything is saved');
  });

  it('keeps the boxes, and says so, when the save is refused because the sign-in is over', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Začni tu');
    await type(box('common.close', 'en'), 'Shut');
    // ApiService sends nothing for nobody: 401, no body.
    api.saveTranslations.mockRejectedValue(new ApiError('Not signed in', 401));
    button('Save').click();
    await settle();

    expect(bar()).toBe('Nothing was saved. You are signed out. Sign in again - what you typed is kept in this tab.');
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
    expect(box('home.title', 'sk').value).toBe('Začni tu');
    expect(box('common.close', 'en').value).toBe('Shut');
    expect(host.querySelectorAll('.mark')).toHaveLength(2);
    expect(button('Save').disabled).toBe(false);
    // Kept for the way to the sign-in and back, under the person who typed them.
    expect(JSON.parse(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)!)).toEqual({ owner: '7', strings: { 'home.title': { sk: 'Začni tu' }, 'common.close': { en: 'Shut' } }, languages: {} });
    expect(refreshed).not.toHaveBeenCalled();

    // The server's own 401 (a token it no longer takes) reads the same: the page's words, not the server's.
    api.saveTranslations.mockRejectedValue(refused(401, 'invalid_token', 'The sign-in is no longer valid.'));
    button('Save').click();
    await settle();
    expect(bar()).toBe('Nothing was saved. You are signed out. Sign in again - what you typed is kept in this tab.');
    expect(TestBed.inject(LocalizationDrafts).count()).toBe(2);
  });

  it('keeps the boxes, and says so, when somebody else is signed in in another tab', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Začni tu');
    // ApiService sends nothing under another name than the one the page loaded with: 409, wrongUser.
    api.saveTranslations.mockRejectedValue(new ApiError('Signed in as somebody else', 409, null, true));
    button('Save').click();
    await settle();

    expect(bar()).toBe('Nothing was saved. Somebody else is signed in now, in another tab, and nothing is sent under their name. What you typed is still in its boxes.');
    expect(box('home.title', 'sk').value).toBe('Začni tu');
    expect(all('.mark', row('home.title'))).toEqual(['Changed']);
    expect(button('Save').disabled).toBe(false);
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
  });

  it('gets past a refusal about a language that is gone: reads the grid again, keeps the rest, and says so where Save is', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));
    await type(box('home.title', 'cs'), 'Začni tady');
    await type(box('home.title', 'sk'), 'Začni tu');
    expect(bar()).toBe('2 strings changed, not saved yet');

    // Czech was deleted in another tab meanwhile: the whole save is refused on its first cell.
    api.saveTranslations.mockRejectedValue(refused(422, 'unknown_language', 'The app has no language "cs".', { key: 'home.title', language: 'cs' }));
    // ... and the grid, read again, has no Czech - and a string saved elsewhere.
    api.translationGrid.mockResolvedValue(grid({ 'common.close': { sk: 'Zatvoriť' } }));
    button('Save').click();
    await settle();

    expect(api.translationGrid).toHaveBeenCalledTimes(2);
    expect(all('.keys-head span')).toEqual(['Key', 'English', 'Slovak']);
    expect(row('home.title').querySelector('textarea[lang="cs"]')).toBeNull();
    expect(box('common.close', 'sk').value).toBe('Zatvoriť');
    // The Slovak box is as typed, marked, and still to save.
    expect(box('home.title', 'sk').value).toBe('Začni tu');
    expect(all('.mark', row('home.title'))).toEqual(['Changed']);
    expect(bar()).toBe('Nothing was saved. The app has no language "cs". What was typed for it could not be kept. Save again for the rest.');
    // Not beside the key: no box is left that could answer it.
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
    expect(host.querySelector('textarea[aria-invalid="true"]')).toBeNull();

    // The next Save sends what is left, and goes through.
    api.saveTranslations.mockResolvedValue(grid({ 'common.close': { sk: 'Zatvoriť' }, 'home.title': { sk: 'Začni tu' } }));
    button('Save').click();
    await settle();
    expect(api.saveTranslations).toHaveBeenLastCalledWith({ 'home.title': { sk: 'Začni tu' } });
    expect(bar()).toBe('The string is saved.');
  });

  it('says only that nothing could be kept when everything typed was for the language that is gone', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));
    await type(box('home.title', 'cs'), 'Začni tady');
    api.saveTranslations.mockRejectedValue(refused(422, 'unknown_language', 'The app has no language "cs".', { key: 'home.title', language: 'cs' }));
    api.translationGrid.mockResolvedValue(grid());
    button('Save').click();
    await settle();

    expect(bar()).toBe('Nothing was saved. The app has no language "cs". What was typed for it could not be kept.');
    expect(button('Save').disabled).toBe(true);
  });

  it('shows such a refusal beside its key, as any other, when the grid cannot be read again', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));
    await type(box('home.title', 'cs'), 'Začni tady');
    api.saveTranslations.mockRejectedValue(refused(422, 'unknown_language', 'The app has no language "cs".', { key: 'home.title', language: 'cs' }));
    api.translationGrid.mockRejectedValue(NO_ANSWER);
    button('Save').click();
    await settle();

    expect(text('.field-error', row('home.title'))).toBe('Nothing was saved. The app has no language "cs".');
    expect(bar()).toBe('Nothing was saved: see home.title');
    expect(box('home.title', 'cs').value).toBe('Začni tady');
  });

  it('keeps what is typed while a save is on its way - even the old text typed back', async () => {
    await page();
    await type(box('common.close', 'en'), 'Shut');
    const saving = later<TranslationGrid>();
    api.saveTranslations.mockReturnValue(saving.promise);
    button('Save').click();
    await settle();
    expect(api.saveTranslations).toHaveBeenCalledWith({ 'common.close': { en: 'Shut' } });
    expect(button('Save').getAttribute('aria-busy')).toBe('true');
    // A second press while it is out sends nothing more.
    button('Save').click();
    await settle();
    expect(api.saveTranslations).toHaveBeenCalledTimes(1);

    // Before the answer: back to what the app had when the save left - which the save is about to replace.
    await type(box('common.close', 'en'), 'Close');
    saving.resolve(grid({ 'common.close': { en: 'Shut' } }));
    await settle();

    // The app says "Shut" now; the box says what was typed, and that is a change again.
    expect(box('common.close', 'en').value).toBe('Close');
    expect(all('.mark', row('common.close'))).toEqual(['Changed']);
    expect(bar()).toBe('1 string changed, not saved yet');
    expect(button('Save').disabled).toBe(false);
    expect(button('Save').getAttribute('aria-busy')).toBeNull();
  });

  it('lets go of a box typed back to the old text when the save it waited for fails', async () => {
    await page();
    await type(box('common.close', 'en'), 'Shut');
    const saving = later<TranslationGrid>();
    api.saveTranslations.mockReturnValue(saving.promise);
    button('Save').click();
    await settle();

    await type(box('common.close', 'en'), 'Close');
    saving.reject(NO_ANSWER);
    await settle();

    // Nothing was saved, and the box says what the app has: no change is left.
    expect(box('common.close', 'en').value).toBe('Close');
    expect(host.querySelectorAll('.mark')).toHaveLength(0);
    expect(button('Save').disabled).toBe(true);
  });

  it('keeps a row found only by its unsaved words while they are being rewritten', async () => {
    await page();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await type(box('home.title', 'sk'), 'Povedz nám svoj názor');
    await type(search, 'nazor');
    expect(shownKeys()).toEqual(['home.title']);

    // The word that was found is the one being changed: the row, its box and the cursor stay.
    const typedIn = box('home.title', 'sk');
    typedIn.focus();
    await type(typedIn, 'Povedz nám svoj pohľad');
    expect(shownKeys()).toEqual(['home.title']);
    expect(box('home.title', 'sk')).toBe(typedIn);
    expect(document.activeElement).toBe(typedIn);
    expect(box('home.title', 'sk').value).toBe('Povedz nám svoj pohľad');
    expect(bar()).toBe('1 string changed, not saved yet');

    // The rows are looked at again when the search changes.
    await type(search, 'nazor ');
    expect(shownKeys()).toEqual([]);
    await type(search, 'pohlad');
    expect(shownKeys()).toEqual(['home.title']);
  });

  it('writes the numbers of a form with no space of the template around them: nothing a line could break at after their dot', async () => {
    await page();

    // Under one another (a phone) the label reads "English · not used in English - ...", and the style sheet holds
    // the dot to the first word of the numbers. A space between the two - the template's indentation - would be
    // where a line ends, with the dot left behind at the end of it.
    const numbers = row('home.due.few').querySelector('.numbers')!;
    const words = numbers.querySelector('.numbers-text')!;
    expect(words.textContent).toBe('not used in English - the fallback for other languages');
    expect(words.childNodes).toHaveLength(1);
    // And no loose text beside the two pieces: what a screen reader is told, then the numbers.
    expect(Array.from(numbers.childNodes).map((node) => node.nodeName)).toEqual(['SPAN', 'SPAN']);
    // (Between them a space that is none of the template's: written out as a no-break one.)
    expect(numbers.textContent).toBe(`For the numbers:${String.fromCharCode(0xa0)}not used in English - the fallback for other languages`);
  });

  describe('what is typed and not saved', () => {
    const drafts = () => TestBed.inject(LocalizationDrafts);

    it('is in its boxes again when the page comes back', async () => {
      await page();
      await type(box('home.title', 'sk'), 'Začni tu');
      await type(box('common.close', 'en'), 'Shut');

      // The page goes with no question asked - nothing of a navigation, no guard.
      fixture.destroy();
      host.remove();
      expect(drafts().count()).toBe(2);

      await draw();
      expect(api.translationGrid).toHaveBeenCalledTimes(2);
      expect(box('home.title', 'sk').value).toBe('Začni tu');
      expect(box('common.close', 'en').value).toBe('Shut');
      expect(all('.mark', row('home.title'))).toEqual(['Changed']);
      expect(all('.mark', row('common.close'))).toEqual(['Changed']);
      expect(bar()).toBe('2 strings changed, not saved yet');
      expect(button('Save').disabled).toBe(false);
    });

    it('is kept for the tab too, under a name of this app, for the way to the sign-in and back', async () => {
      await page();
      await type(box('home.title', 'sk'), 'Začni tu');

      expect(LOCALIZATION_DRAFTS_KEY).toBe('piano-academy:localization-drafts');
      expect(JSON.parse(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)!)).toEqual({ owner: '7', strings: { 'home.title': { sk: 'Začni tu' } }, languages: {} });
    });

    it("is kept on the owner's own computer too, where nobody signs in: under the one owner that mode has", async () => {
      await page(grid(), 'local');
      await type(box('home.title', 'sk'), 'Začni tu');

      expect(JSON.parse(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)!)).toEqual({ owner: 'local', strings: { 'home.title': { sk: 'Začni tu' } }, languages: {} });
    });

    it('comes back only as far as it is still a change: not what the app says by now, and nothing for a key or a language that is gone', async () => {
      sessionStorage.setItem(
        LOCALIZATION_DRAFTS_KEY,
        JSON.stringify({ owner: '7', strings: { 'common.close': { sk: 'Zatvoriť', cs: 'Zavřít' }, 'gone.key': { en: 'x' }, 'home.title': { sk: 'Začni tu' } }, languages: {} }),
      );
      // The very same "Zatvoriť" was saved elsewhere meanwhile.
      await page(grid({ 'common.close': { sk: 'Zatvoriť' } }));

      expect(box('home.title', 'sk').value).toBe('Začni tu');
      expect(host.querySelectorAll('.mark')).toHaveLength(1);
      expect(bar()).toBe('1 string changed, not saved yet');
      expect(drafts().strings()).toEqual({ 'home.title': { sk: 'Začni tu' } });
    });

    it('has the browser ask before the tab is closed or loaded again', async () => {
      await page();
      const closing = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(closing()).toBe(false);

      await type(box('home.title', 'sk'), 'Začni');
      expect(closing()).toBe(true);
    });
  });

  it('asks before it is left with changes not saved, and not otherwise - and "Leave" gives them up', async () => {
    await page();
    const component = fixture.componentInstance;
    expect(component.canLeave()).toBe(true);
    expect(question().hasAttribute('open')).toBe(false);

    await type(box('home.title', 'sk'), 'Začni');
    const stay = component.canLeave() as Promise<boolean>;
    await settle();
    // The question is a native dialog of the page's own, in English.
    expect(question().hasAttribute('open')).toBe(true);
    expect(text('#ow-confirm-text')).toBe('1 changed string is not saved yet, and leaving loses it.');
    expect(all('dialog.confirm button')).toEqual(['Stay here', 'Leave']);
    expect(await answer(false)).toBe('Leave without saving?');
    expect(await stay).toBe(false);
    expect(question().hasAttribute('open')).toBe(false);
    // Staying keeps what was typed.
    expect(box('home.title', 'sk').value).toBe('Začni');
    expect(TestBed.inject(LocalizationDrafts).count()).toBe(1);

    const leave = component.canLeave() as Promise<boolean>;
    await settle();
    await answer(true);
    expect(await leave).toBe(true);
    // Given up, as the question said: not in the boxes the next time, and not kept for the tab.
    expect(TestBed.inject(LocalizationDrafts).strings()).toEqual({});
    expect(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)).toBeNull();
    expect(component.canLeave()).toBe(true);
  });

  it('takes the question closed without an answer - Esc - for "stay"', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Začni');
    const asked = fixture.componentInstance.canLeave() as Promise<boolean>;
    await settle();

    // What Esc does to a dialog: it closes, and no button said anything.
    question().close();
    await settle();

    expect(await asked).toBe(false);
    expect(box('home.title', 'sk').value).toBe('Začni');
  });

  it('discards every change, after asking', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Začni');
    await type(box('common.close', 'sk'), '');

    button('Discard').click();
    await settle();
    expect(await answer(true)).toBe('Discard 2 changes?');

    expect(box('home.title', 'sk').value).toBe('');
    expect(box('common.close', 'sk').value).toBe('Zavrieť');
    expect(button('Save').disabled).toBe(true);
    expect(api.saveTranslations).not.toHaveBeenCalled();
  });

  it('exports a language as a file made here, from what the API answers', async () => {
    await page();
    // jsdom has no object URLs: stood in for here, and taken away again after the test.
    const saved: Blob[] = [];
    Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => (saved.push(blob), 'blob:strings')), revokeObjectURL: vi.fn() });
    let download = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      download = `${this.download} <- ${this.href}`;
    });
    api.exportTranslations.mockResolvedValue({ 'common.close': 'Zavrieť', 'home.due.one': '1 nota čaká' });

    button('Export', host.querySelectorAll('.language')[1]).click();
    await settle();

    expect(api.exportTranslations).toHaveBeenCalledWith('sk');
    expect(download).toBe('translations-sk.json <- blob:strings');
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('application/json');
    expect(await saved[0].text()).toBe('{\n    "common.close": "Zavrieť",\n    "home.due.one": "1 nota čaká"\n}\n');
    // Said in the page's status line - a live region, not a toast.
    expect(text('#ow-status')).toBe('2 strings of Slovak are downloaded.');
    expect(host.querySelector('#ow-status')!.getAttribute('role')).toBe('status');
  });

  it('says so in an error line when a language cannot be exported', async () => {
    await page();
    api.exportTranslations.mockRejectedValue(NO_ANSWER);

    button('Export', host.querySelectorAll('.language')[1]).click();
    await settle();

    expect(text('.problem p')).toBe(`Slovak was not exported. ${NO_ANSWER_TEXT}`);
    expect(host.querySelector('.problem')!.getAttribute('role')).toBe('alert');
    expect(text('#ow-status')).toBe('');
  });

  describe('importing', () => {
    async function choose(name: string, content: string): Promise<void> {
      const input = host.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
      Object.defineProperty(input, 'files', { value: [new File([content], name, { type: 'application/json' })], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    }

    it('keeps the file picker behind a button: the button opens it', async () => {
      await page();
      const input = host.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
      const opened = vi.spyOn(input, 'click').mockImplementation(() => undefined);
      expect(input.classList.contains('visually-hidden')).toBe(true);
      expect(input.getAttribute('aria-label')).toBe('A JSON file of strings to import into Slovak');

      button('Import', host.querySelectorAll('.language')[1]).click();

      expect(opened).toHaveBeenCalledTimes(1);
    });

    it('sends the file to the language after asking, and takes the grid that comes back', async () => {
      await page();
      await type(box('common.close', 'en'), 'Shut');
      api.importTranslations.mockResolvedValue(grid({ 'home.title': { sk: 'Začni tu' } }));

      await choose('sk.json', '{"home.title": "Začni tu", "common.close": ""}');
      expect(api.importTranslations).not.toHaveBeenCalled();
      expect(await answer(true)).toBe('Import 1 string into Slovak?');

      expect(api.importTranslations).toHaveBeenCalledWith('sk', { 'home.title': 'Začni tu', 'common.close': '' });
      expect(box('home.title', 'sk').value).toBe('Začni tu');
      expect(text('#ow-status')).toBe('The strings of Slovak are imported.');
      expect(refreshed).toHaveBeenCalledTimes(1);
      // What was typed and not saved is still typed.
      expect(box('common.close', 'en').value).toBe('Shut');
      expect(button('Save').disabled).toBe(false);
    });

    it('keeps what is typed while the file is on its way - even the text the import is about to replace', async () => {
      await page();
      const importing = later<TranslationGrid>();
      api.importTranslations.mockReturnValue(importing.promise);
      await choose('sk.json', '{"common.close": "Zatvoriť"}');
      await answer(true);

      // Typed, and typed back to what the app still has this moment.
      await type(box('common.close', 'sk'), 'Zavrieť!');
      await type(box('common.close', 'sk'), 'Zavrieť');
      importing.resolve(grid({ 'common.close': { sk: 'Zatvoriť' } }));
      await settle();

      // The app says "Zatvoriť" now; the box says what was typed, and that is a change.
      expect(box('common.close', 'sk').value).toBe('Zavrieť');
      expect(all('.mark', row('common.close'))).toEqual(['Changed']);
      expect(button('Save').disabled).toBe(false);
    });

    it('says a file holds no string when its values have nothing in them to see - a zero-width space too - and sends nothing', async () => {
      await page();
      await choose('sk.json', '{"home.title": "\\u200B", "common.close": " \\u2060 "}');

      expect(question().hasAttribute('open')).toBe(false);
      expect(api.importTranslations).not.toHaveBeenCalled();
      expect(text('.problem')).toContain('It holds no string: every value in it is empty.');
    });

    it('does nothing when the answer is no', async () => {
      await page();
      await choose('sk.json', '{"home.title": "Začni"}');
      await answer(false);

      expect(api.importTranslations).not.toHaveBeenCalled();
    });

    it("says what is wrong with a file that is not a language's strings, without sending it", async () => {
      await page();
      await choose('notes.json', '["home.title"]');

      expect(question().hasAttribute('open')).toBe(false);
      expect(api.importTranslations).not.toHaveBeenCalled();
      const alert = text('.problem');
      expect(alert).toContain('"notes.json" was not imported');
      expect(alert).toContain('one JSON object of "key": "text"');
      expect(host.querySelector('.problem')!.getAttribute('role')).toBe('alert');
    });

    it("shows the server's sentence when it refuses the file: the keys the app does not have", async () => {
      await page();
      const sentence = 'The app has no such keys: "home.titel", "home.leed". Keys are made by the code, never here.';
      api.importTranslations.mockRejectedValue(refused(422, 'unknown_key', sentence, { key: 'home.titel', keys: ['home.titel', 'home.leed'] }));
      await choose('sk.json', '{"home.titel": "Začni", "home.leed": "Úvod"}');
      await answer(true);

      const alert = text('.problem');
      expect(alert).toContain('"sk.json" was not imported');
      expect(alert).toContain(sentence);
      expect(refreshed).not.toHaveBeenCalled();

      button('Dismiss').click();
      await settle();
      expect(host.querySelector('.problem')).toBeNull();
    });
  });

  it("says so when the grid cannot be loaded - in the server's words - and tries again", async () => {
    await page(refused(503, 'db', 'The database cannot be reached right now.'));

    expect(text('.problem')).toContain('The translations could not be loaded.');
    expect(text('.problem')).toContain('The database cannot be reached right now.');
    expect(host.querySelector('.problem')!.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.keys')).toBeNull();

    api.translationGrid.mockResolvedValue(grid());
    button('Try again').click();
    await settle();
    expect(shownKeys()).toHaveLength(5);
  });

  it('says so, too, when it is opened by somebody the server does not take for the owner', async () => {
    await page(refused(403, 'owner_only', 'Only the owner of this site can change its words.'));

    expect(text('.problem')).toContain('Only the owner of this site can change its words.');
    expect(host.querySelector('.keys')).toBeNull();
  });

  it('puts the languages under one another when there are more than fit side by side', async () => {
    await page();
    expect(host.querySelector('.keys')!.classList.contains('is-stacked')).toBe(false);
    host.remove();
    TestBed.resetTestingModule();

    await page(grid({}, [ENGLISH, SLOVAK, CZECH, GERMAN]));

    expect(host.querySelector('.keys')!.classList.contains('is-stacked')).toBe(true);
    // Each box then says its language itself.
    expect(all('.cell-language', row('home.title'))).toEqual(['English', 'Slovak', 'Czech', 'German']);
    expect(box('home.title', 'cs').placeholder).toBe('Falls back to English');
  });
});
