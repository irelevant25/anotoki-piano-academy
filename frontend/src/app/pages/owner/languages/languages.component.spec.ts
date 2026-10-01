import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { OwnerLanguage } from '../../../core/i18n/translation.model';
import { TranslationService } from '../../../core/i18n/translation.service';
import { LOCALIZATION_DRAFTS_KEY, LocalizationDrafts } from '../../../core/owner/localization-drafts.service';
import { provideTestDialog } from '../../../core/testing/test-dialog';
import { LanguagesComponent } from './languages.component';

const ENGLISH: OwnerLanguage = { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true };
const SLOVAK: OwnerLanguage = { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', enabled: true, sortOrder: 2, seeded: true };
const CZECH: OwnerLanguage = { code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false, sortOrder: 3, seeded: false };

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

/** What the server answers when it refuses: its sentence and code in the body. */
function refused(status: number, code: string, sentence: string): ApiError {
  return new ApiError(`/api/owner/languages failed: ${status}`, status, code, false, { error: sentence, code });
}

/** No answer at all: the network, or the server down. */
const NO_ANSWER = new ApiError('/api/owner/languages failed: 0', 0);
const NO_ANSWER_TEXT = 'The server could not be reached. Check the connection and try again.';

describe('LanguagesComponent', () => {
  let fixture: ComponentFixture<LanguagesComponent>;
  let host: HTMLElement;
  let api: {
    languages: ReturnType<typeof vi.fn>;
    createLanguage: ReturnType<typeof vi.fn>;
    updateLanguage: ReturnType<typeof vi.fn>;
    deleteLanguage: ReturnType<typeof vi.fn>;
  };
  let refreshed: ReturnType<typeof vi.fn>;

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string, within: ParentNode = host) => clean(within.querySelector(selector)?.textContent);
  const all = (selector: string, within: ParentNode = host) => Array.from(within.querySelectorAll(selector)).map((element) => clean(element.textContent));
  /** The pieces of each row's head - its children - with a space between, as the eye sees them. */
  const heads = () => Array.from(host.querySelectorAll('.head')).map((element) => all(':scope > *', element).join(' '));
  const rows = () => Array.from(host.querySelectorAll<HTMLElement>('.language'));
  const row = (code: string) => host.querySelector<HTMLElement>(`[id="ow-language-${code}"]`)!;
  const fields = (within: ParentNode) => Array.from(within.querySelectorAll<HTMLInputElement>('input.field-input'));
  const tick = (code: string) => row(code).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const button = (label: string, within: ParentNode = host) => Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => clean(candidate.textContent) === label);
  const error = (within: ParentNode) => text('.field-error', within);
  /** What the last change did: the line that stays in view. */
  const said = () => text('.bar-state');
  const question = () => host.querySelector<HTMLDialogElement>('dialog.confirm')!;

  /** Lets the promises of a click run out, then the page draw. */
  async function settle(): Promise<void> {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }

  async function type(element: HTMLInputElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function flip(code: string): Promise<void> {
    tick(code).click();
    await settle();
  }

  async function answer(yes: boolean): Promise<string> {
    const title = question().hasAttribute('open') ? text('#ow-confirm-title') : '';
    question()
      .querySelector<HTMLButtonElement>(`[data-answer="${yes ? 'yes' : 'no'}"]`)!
      .click();
    await settle();
    return title;
  }

  async function page(answerWith: OwnerLanguage[] | ApiError = [ENGLISH, SLOVAK, CZECH]): Promise<void> {
    api = {
      languages: answerWith instanceof ApiError ? vi.fn().mockRejectedValue(answerWith) : vi.fn().mockResolvedValue(answerWith),
      createLanguage: vi.fn(),
      updateLanguage: vi.fn(),
      deleteLanguage: vi.fn(),
    };
    refreshed = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { userKey: () => OWNER, signedIn: () => true, onAuthChange: () => () => undefined } },
        { provide: TranslationService, useValue: { reload: refreshed } },
      ],
    });
    await draw();
  }

  /** The page drawn - the first time, or again after it was left. */
  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(LanguagesComponent);
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
  });

  it('lists every language - the hidden ones too - with its code, its two names and its place in the order', async () => {
    // Whatever order they come in: by their place, as the chooser shows them.
    await page([CZECH, SLOVAK, ENGLISH]);

    expect(text('h2')).toBe('Languages');
    expect(heads()).toEqual(['en English English Fallback', 'sk Slovak Slovenčina Released with the app', 'cs Czech Čeština']);
    expect(rows().map((language) => fields(language).map((field) => field.value))).toEqual([
      ['English', 'English', '1'],
      ['Slovak', 'Slovenčina', '2'],
      ['Czech', 'Čeština', '3'],
    ]);
    // The order is a number box; the names are text boxes.
    expect(fields(row('cs')).map((field) => field.type)).toEqual(['text', 'text', 'number']);
    expect(all('.list .check-label')).toEqual(['Offered', 'Offered', 'Hidden']);
    expect(row('cs').querySelector('.native')!.getAttribute('lang')).toBe('cs');
    expect(said()).toBe('Everything is saved');
  });

  it('is an English page whatever language the app is read in, and links to the translations', async () => {
    await page();

    // The root says so: the shell around it may be Slovak.
    const root = host.firstElementChild!;
    expect(root.getAttribute('lang')).toBe('en');
    expect(root.contains(question())).toBe(true);
    expect(Array.from(host.children)).toHaveLength(1);
    expect(Array.from(host.querySelectorAll('.page-head a')).map((link) => [clean(link.textContent), link.getAttribute('href')])).toEqual([['Translations', '/translations']]);
  });

  it('marks English as the fallback, and its checkbox cannot be changed', async () => {
    await page();

    expect(tick('en').checked).toBe(true);
    expect(tick('en').disabled).toBe(true);
    expect(text('.offered .field-hint', row('en'))).toBe('Always offered: every other language falls back to it.');
    expect(tick('sk').disabled).toBe(false);
    expect(text('.offered .field-hint', row('sk'))).toBe('People can choose it.');
    expect(text('.offered .field-hint', row('cs'))).toBe('Nobody is offered it; its strings are kept.');
  });

  it('offers Delete only for a language the app is not released in', async () => {
    await page();

    expect(rows().map((language) => !!button('Delete', language))).toEqual([false, false, true]);
  });

  it('renames a language and moves it, sending only what changed', async () => {
    await page();
    const save = button('Save', row('cs'))!;
    expect(save.disabled).toBe(true);

    await type(fields(row('cs'))[1], 'Česky');
    await type(fields(row('cs'))[2], '0');
    expect(save.disabled).toBe(false);
    expect(said()).toBe('1 language has changes not saved yet');

    api.updateLanguage.mockResolvedValue({ ...CZECH, nativeName: 'Česky', sortOrder: 0 });
    save.click();
    await settle();

    expect(api.updateLanguage).toHaveBeenCalledWith('cs', { nativeName: 'Česky', sortOrder: 0 });
    // It comes first now.
    expect(heads()[0]).toBe('cs Czech Česky');
    expect(button('Save', row('cs'))!.disabled).toBe(true);
    // Said in the line that stays in view - a live region, not a toast.
    expect(said()).toBe('Czech is saved.');
    expect(host.querySelector('.bar-state')!.getAttribute('role')).toBe('status');
    // The chooser's list comes with the app's strings: read again - reload(), never the start's init().
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('puts a row back as it is saved with Undo', async () => {
    await page();
    await type(fields(row('sk'))[0], 'Slovakian');
    expect(button('Save', row('sk'))!.disabled).toBe(false);

    button('Undo', row('sk'))!.click();
    await settle();

    expect(fields(row('sk'))[0].value).toBe('Slovak');
    expect(button('Save', row('sk'))!.disabled).toBe(true);
    expect(button('Undo', row('sk'))).toBeUndefined();
    expect(api.updateLanguage).not.toHaveBeenCalled();
  });

  it('does not send an order that is not a whole number from 0 to 1000', async () => {
    await page();
    await type(fields(row('sk'))[2], '1001');
    button('Save', row('sk'))!.click();
    await settle();

    expect(api.updateLanguage).not.toHaveBeenCalled();
    expect(error(row('sk'))).toBe('The order is a whole number from 0 to 1000.');
    expect(row('sk').querySelector('.field-error')!.getAttribute('role')).toBe('alert');
  });

  it("shows the server's sentence in the row when it refuses a change, and keeps what was typed", async () => {
    await page();
    await type(fields(row('sk'))[0], 'Slovakian');
    api.updateLanguage.mockRejectedValue(refused(422, 'invalid_language', 'The name in English must be 1 to 50 characters long.'));
    button('Save', row('sk'))!.click();
    await settle();

    expect(error(row('sk'))).toBe('The name in English must be 1 to 50 characters long.');
    expect(fields(row('sk'))[0].value).toBe('Slovakian');
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('keeps the row as typed, and says so, when the save is refused because the sign-in is over - or somebody else is signed in', async () => {
    await page();
    await type(fields(row('sk'))[0], 'Slovakian');
    // ApiService sends nothing for nobody: 401, no body.
    api.updateLanguage.mockRejectedValue(new ApiError('Not signed in', 401));
    button('Save', row('sk'))!.click();
    await settle();

    expect(error(row('sk'))).toBe('You are signed out. Sign in again - what you typed is kept in this tab.');
    expect(fields(row('sk'))[0].value).toBe('Slovakian');
    expect(button('Save', row('sk'))!.disabled).toBe(false);
    expect(JSON.parse(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)!).languages).toEqual({ sk: { name: 'Slovakian', nativeName: 'Slovenčina', sortOrder: '2' } });

    // Nor under another name than the one the page loaded with: 409, wrongUser.
    api.updateLanguage.mockRejectedValue(new ApiError('Signed in as somebody else', 409, null, true));
    button('Save', row('sk'))!.click();
    await settle();

    expect(error(row('sk'))).toBe('Somebody else is signed in now, in another tab, and nothing is sent under their name. What you typed is still in its boxes.');
    expect(fields(row('sk'))[0].value).toBe('Slovakian');
    expect(TestBed.inject(LocalizationDrafts).count()).toBe(1);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('keeps what is typed in a row while it is being saved: a change to what the answer saved', async () => {
    await page();
    await type(fields(row('cs'))[0], 'Czech language');
    const saving = later<OwnerLanguage>();
    api.updateLanguage.mockReturnValue(saving.promise);
    button('Save', row('cs'))!.click();
    await settle();
    expect(api.updateLanguage).toHaveBeenCalledWith('cs', { name: 'Czech language' });
    // One row at a time goes to the server.
    await type(fields(row('sk'))[0], 'Slovakian');
    expect(button('Save', row('sk'))!.disabled).toBe(true);

    // Before the answer: the other name, in the same row.
    await type(fields(row('cs'))[1], 'Česky');
    saving.resolve({ ...CZECH, name: 'Czech language' });
    await settle();

    expect(heads()[2]).toBe('cs Czech language Čeština');
    expect(fields(row('cs')).map((field) => field.value)).toEqual(['Czech language', 'Česky', '3']);
    expect(button('Save', row('cs'))!.disabled).toBe(false);
    expect(button('Undo', row('cs'))).toBeDefined();
    expect(button('Save', row('sk'))!.disabled).toBe(false);
    // What the save did, and what is still to save: both said.
    expect(all('.bar-state span')).toEqual(['Czech language is saved.', '2 languages have changes not saved yet']);

    // And that is what the next Save sends - nothing of what is saved already.
    api.updateLanguage.mockResolvedValue({ ...CZECH, name: 'Czech language', nativeName: 'Česky' });
    button('Save', row('cs'))!.click();
    await settle();
    expect(api.updateLanguage).toHaveBeenLastCalledWith('cs', { nativeName: 'Česky' });
    expect(button('Save', row('cs'))!.disabled).toBe(true);
  });

  it('keeps even the old name typed back while the row is being saved - and lets it go when the save fails', async () => {
    await page();
    await type(fields(row('cs'))[0], 'Czech language');
    const saving = later<OwnerLanguage>();
    api.updateLanguage.mockReturnValue(saving.promise);
    button('Save', row('cs'))!.click();
    await settle();

    await type(fields(row('cs'))[0], 'Czech');
    saving.resolve({ ...CZECH, name: 'Czech language' });
    await settle();

    // Saved as "Czech language"; the field says "Czech", which is a change again.
    expect(heads()[2]).toBe('cs Czech language Čeština');
    expect(fields(row('cs'))[0].value).toBe('Czech');
    expect(button('Save', row('cs'))!.disabled).toBe(false);

    // The same once more, and the save fails: the field says what is saved, so nothing is left to save.
    const failing = later<OwnerLanguage>();
    api.updateLanguage.mockReturnValue(failing.promise);
    button('Save', row('cs'))!.click();
    await settle();
    await type(fields(row('cs'))[0], 'Czech language');
    failing.reject(NO_ANSWER);
    await settle();

    expect(error(row('cs'))).toBe(NO_ANSWER_TEXT);
    expect(fields(row('cs'))[0].value).toBe('Czech language');
    expect(button('Save', row('cs'))!.disabled).toBe(true);
  });

  it('hides and offers a language the moment its checkbox is changed', async () => {
    await page();
    api.updateLanguage.mockResolvedValue({ ...SLOVAK, enabled: false });
    await flip('sk');

    expect(api.updateLanguage).toHaveBeenCalledWith('sk', { enabled: false });
    expect(tick('sk').checked).toBe(false);
    expect(text('.check-label', row('sk'))).toBe('Hidden');
    expect(row('sk').classList.contains('is-hidden')).toBe(true);
    expect(said()).toBe('Slovak is hidden: nobody is offered it.');

    api.updateLanguage.mockResolvedValue({ ...CZECH, enabled: true });
    await flip('cs');
    expect(api.updateLanguage).toHaveBeenLastCalledWith('cs', { enabled: true });
    expect(text('.check-label', row('cs'))).toBe('Offered');
    expect(said()).toBe('Czech is offered to everybody now.');
    expect(refreshed).toHaveBeenCalledTimes(2);
  });

  it('puts the checkbox back, and says why, when the server refuses', async () => {
    await page();
    // As a request answers: later, with the page drawn meanwhile - hidden, and saving.
    const refusal = refused(409, 'fallback_language', 'English cannot be switched off: every other language falls back to it.');
    api.updateLanguage.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(refusal), 20)));
    await flip('sk');
    expect(tick('sk').checked).toBe(false);
    expect(tick('sk').getAttribute('aria-busy')).toBe('true');
    // Nothing else can be changed while it is on its way.
    expect(tick('cs').disabled).toBe(true);

    await new Promise((done) => setTimeout(done, 30));
    await settle();

    expect(tick('sk').checked).toBe(true);
    expect(text('.check-label', row('sk'))).toBe('Offered');
    expect(error(row('sk'))).toBe('English cannot be switched off: every other language falls back to it.');
    expect(tick('sk').getAttribute('aria-busy')).toBeNull();
    expect(tick('cs').disabled).toBe(false);
  });

  it('deletes a language after asking - in a dialog of the page', async () => {
    await page();
    api.deleteLanguage.mockResolvedValue(undefined);
    button('Delete', row('cs'))!.click();
    await settle();
    expect(api.deleteLanguage).not.toHaveBeenCalled();
    expect(question().hasAttribute('open')).toBe(true);
    expect(text('#ow-confirm-text')).toBe('Every string of the app written in it goes with it, and none of it can be brought back.');
    expect(all('dialog.confirm button')).toEqual(['Cancel', 'Delete']);
    expect(await answer(true)).toBe('Delete Czech (cs)?');

    expect(api.deleteLanguage).toHaveBeenCalledWith('cs');
    expect(heads()).toHaveLength(2);
    expect(said()).toBe('Czech is deleted.');
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('keeps the language when the answer is no', async () => {
    await page();
    button('Delete', row('cs'))!.click();
    await settle();
    await answer(false);

    expect(api.deleteLanguage).not.toHaveBeenCalled();
    expect(heads()).toHaveLength(3);
  });

  it("shows the server's sentence when a language cannot be deleted", async () => {
    await page();
    const sentence = 'Slovak is one of the languages the app is released in, so it cannot be deleted. Switch it off instead.';
    api.deleteLanguage.mockRejectedValue(refused(409, 'seeded_language', sentence));
    button('Delete', row('cs'))!.click();
    await settle();
    await answer(true);

    expect(error(row('cs'))).toBe(sentence);
    expect(heads()).toHaveLength(3);
    expect(refreshed).not.toHaveBeenCalled();
  });

  describe('adding a language', () => {
    const form = () => host.querySelector<HTMLFormElement>('form.add')!;
    const add = () => button('Add the language', form())!;
    const offer = () => form().querySelector<HTMLInputElement>('input[type="checkbox"]')!;

    it('adds it hidden unless told otherwise - to the list, in its place - and empties the form', async () => {
      await page([ENGLISH, SLOVAK]);
      expect(add().disabled).toBe(true);
      // Whether readers are offered it at once: a checkbox, off, with the reason beside it.
      expect(text('.check-label', form())).toBe('Offer it to readers right away');
      expect(text('.offered .field-hint', form())).toBe('A new language starts hidden - write its strings, then offer it.');
      expect(offer().checked).toBe(false);

      const [code, name, nativeName] = fields(form());
      await type(code, ' DE ');
      await type(name, 'German');
      await type(nativeName, 'Deutsch');
      expect(add().disabled).toBe(false);

      api.createLanguage.mockResolvedValue({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: false, sortOrder: 3, seeded: false });
      form().dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();

      // `enabled` goes with it, said outright - not left to what the server takes for granted.
      expect(api.createLanguage).toHaveBeenCalledTimes(1);
      expect(api.createLanguage).toHaveBeenCalledWith({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: false });
      expect(heads()).toEqual(['en English English Fallback', 'sk Slovak Slovenčina Released with the app', 'de German Deutsch']);
      // The new row says it is hidden.
      expect(text('.check-label', row('de'))).toBe('Hidden');
      expect(tick('de').checked).toBe(false);
      expect(row('de').classList.contains('is-hidden')).toBe(true);
      expect(fields(form()).map((field) => field.value)).toEqual(['', '', '']);
      expect(said()).toBe('German is added, hidden. Write its strings, then offer it.');
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('offers it at once when the checkbox says so - and the checkbox is off again for the next one', async () => {
      await page([ENGLISH, SLOVAK]);
      const [code, name, nativeName] = fields(form());
      await type(code, 'de');
      await type(name, 'German');
      await type(nativeName, 'Deutsch');
      offer().click();
      await settle();
      expect(offer().checked).toBe(true);

      api.createLanguage.mockResolvedValue({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: true, sortOrder: 3, seeded: false });
      add().click();
      await settle();

      expect(api.createLanguage).toHaveBeenCalledWith({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: true });
      expect(text('.check-label', row('de'))).toBe('Offered');
      expect(row('de').classList.contains('is-hidden')).toBe(false);
      expect(said()).toBe('German is added, and offered to everybody. It reads in English until its strings are written.');
      expect(offer().checked).toBe(false);
    });

    it('keeps the checkbox as it was set when the server refuses, for the next try', async () => {
      await page();
      const [code, name, nativeName] = fields(form());
      await type(code, 'sk');
      await type(name, 'Slovak');
      await type(nativeName, 'Slovensky');
      offer().click();
      await settle();
      api.createLanguage.mockRejectedValue(refused(409, 'language_exists', 'There is a language "sk" already.'));
      add().click();
      await settle();

      expect(offer().checked).toBe(true);
    });

    it('says what a code is while one that is none is typed, and does not send it', async () => {
      await page();
      const [code, name, nativeName] = fields(form());
      await type(code, 'german');
      await type(name, 'German');
      await type(nativeName, 'Deutsch');

      expect(error(form())).toBe('A language\'s code is two small letters, or two and two with a dash between: "sk", "pt-br".');
      expect(code.getAttribute('aria-invalid')).toBe('true');
      expect(add().disabled).toBe(true);
      // Enter in a field submits the form whatever the button says: nothing goes either.
      form().dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      expect(api.createLanguage).not.toHaveBeenCalled();
    });

    it("shows the server's sentence when the language is there already", async () => {
      await page();
      const [code, name, nativeName] = fields(form());
      await type(code, 'sk');
      await type(name, 'Slovak');
      await type(nativeName, 'Slovensky');
      api.createLanguage.mockRejectedValue(refused(409, 'language_exists', 'There is a language "sk" already.'));
      add().click();
      await settle();

      expect(text('.add-error')).toBe('There is a language "sk" already.');
      expect(host.querySelector('.add-error')!.getAttribute('role')).toBe('alert');
      expect(fields(form())[0].value).toBe('sk');
      expect(heads()).toHaveLength(3);
    });
  });

  it('asks before it is left with a row changed and not saved - and "Leave" gives the changes up', async () => {
    await page();
    const component = fixture.componentInstance;
    expect(component.canLeave()).toBe(true);

    await type(fields(row('sk'))[0], 'Slovakian');
    const stay = component.canLeave() as Promise<boolean>;
    await settle();
    expect(question().hasAttribute('open')).toBe(true);
    expect(text('#ow-confirm-text')).toBe('1 language has changes that are not saved yet, and leaving loses them.');
    expect(all('dialog.confirm button')).toEqual(['Stay here', 'Leave']);
    expect(await answer(false)).toBe('Leave without saving?');
    expect(await stay).toBe(false);
    // Staying keeps what was typed.
    expect(fields(row('sk'))[0].value).toBe('Slovakian');

    const leave = component.canLeave() as Promise<boolean>;
    await settle();
    await answer(true);
    expect(await leave).toBe(true);
    // Given up, as the question said: not in the row the next time, and not kept for the tab.
    expect(TestBed.inject(LocalizationDrafts).languages()).toEqual({});
    expect(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)).toBeNull();
    expect(component.canLeave()).toBe(true);
  });

  describe('what is typed in a row and not saved', () => {
    const drafts = () => TestBed.inject(LocalizationDrafts);

    it('is in its fields again when the page comes back', async () => {
      await page();
      await type(fields(row('sk'))[0], 'Slovakian');
      await type(fields(row('cs'))[2], '0');

      // The page goes with no question asked - nothing of a navigation, no guard.
      fixture.destroy();
      host.remove();
      expect(drafts().count()).toBe(2);

      await draw();
      expect(api.languages).toHaveBeenCalledTimes(2);
      expect(fields(row('sk')).map((field) => field.value)).toEqual(['Slovakian', 'Slovenčina', '2']);
      expect(fields(row('cs')).map((field) => field.value)).toEqual(['Czech', 'Čeština', '0']);
      expect(button('Save', row('sk'))!.disabled).toBe(false);
      expect(button('Undo', row('cs'))).toBeDefined();
      expect(button('Save', row('en'))!.disabled).toBe(true);
    });

    it('is kept for the tab too, for the way to the sign-in and back', async () => {
      await page();
      await type(fields(row('sk'))[0], 'Slovakian');

      expect(JSON.parse(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)!)).toEqual({ owner: '7', strings: {}, languages: { sk: { name: 'Slovakian', nativeName: 'Slovenčina', sortOrder: '2' } } });
    });

    it('comes back only as far as it is still a change: not for a language that is gone, and not what is saved by now', async () => {
      sessionStorage.setItem(
        LOCALIZATION_DRAFTS_KEY,
        JSON.stringify({
          owner: '7',
          strings: {},
          languages: {
            sk: { name: 'Slovakian', nativeName: 'Slovenčina', sortOrder: '2' },
            // Deleted elsewhere meanwhile.
            de: { name: 'German', nativeName: 'Deutsch!', sortOrder: '4' },
            // Saved elsewhere meanwhile, the very same.
            cs: { name: 'Czech', nativeName: 'Česky', sortOrder: '3' },
          },
        }),
      );
      await page([ENGLISH, SLOVAK, { ...CZECH, nativeName: 'Česky' }]);

      expect(drafts().languages()).toEqual({ sk: { name: 'Slovakian', nativeName: 'Slovenčina', sortOrder: '2' } });
      expect(fields(row('sk'))[0].value).toBe('Slovakian');
      expect(rows().map((language) => button('Save', language)!.disabled)).toEqual([true, false, true]);
    });

    it('has the browser ask before the tab is closed or loaded again', async () => {
      await page();
      const closing = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(closing()).toBe(false);

      await type(fields(row('sk'))[0], 'Slovakian');
      expect(closing()).toBe(true);
    });
  });

  it("says so when the languages cannot be loaded, and tries again", async () => {
    await page(NO_ANSWER);

    expect(text('.problem')).toContain('The languages could not be loaded.');
    expect(text('.problem')).toContain(NO_ANSWER_TEXT);
    expect(host.querySelector('.problem')!.getAttribute('role')).toBe('alert');
    expect(rows()).toHaveLength(0);

    api.languages.mockResolvedValue([ENGLISH, SLOVAK]);
    button('Try again')!.click();
    await settle();
    expect(rows()).toHaveLength(2);
  });
});
