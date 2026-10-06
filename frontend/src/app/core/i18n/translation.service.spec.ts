import { HttpClient, HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { defer, from } from 'rxjs';
import { type AnotokiPreferenceChanges, type AnotokiPreferences, type AnotokiSavedPreferences } from '../auth/anotoki-auth';
import { AuthService } from '../auth/auth.service';
import { TEST_LANGUAGES, provideTestTranslations } from '../testing/test-translations';
import { KEPT_ENGLISH } from './kept-english';
import { TranslationBundle } from './translation.model';
import { CACHE_WAIT_MS, RETRY_WAIT_MS, TranslationService, languageCandidates, pickLanguage } from './translation.service';

const LANGUAGE_KEY = 'piano-academy:language';
const CACHE_KEY = 'piano-academy:language-cache';

const ENGLISH = {
  'common.close': 'Close',
  'home.hello': 'Hello {name}, you have {count}.',
  'songs.play': 'Play {title} with the metronome.',
  'home.due.one': '{count} note is due for review.',
  'home.due.few': '{count} notes are due for review.',
  'home.due.other': '{count} notes are due for review.',
  'home.learnMore.one': 'Learn at least {count} note first - you know {known} so far.',
  'home.learnMore.few': 'Learn at least {count} notes first - you know {known} so far.',
  'home.learnMore.other': 'Learn at least {count} notes first - you know {known} so far.',
  'home.onlyEnglish': 'Only in English',
  // Placeholders named like what every object inherits: filled only from what a parameter object has itself.
  'home.proto': 'x {constructor} {toString} y',
};
const SLOVAK = {
  ...ENGLISH,
  'common.close': 'Zavrieť',
  'home.hello': 'Ahoj {name}, máš {count}.',
  'songs.play': 'Zahraj s metronómom: {title}.',
  'home.due.one': 'Na zopakovanie čaká {count} nota.',
  'home.due.few': 'Na zopakovanie čakajú {count} noty.',
  'home.due.other': 'Na zopakovanie čaká {count} nôt.',
  'home.learnMore.one': 'Najprv sa nauč aspoň {count} notu – zatiaľ poznáš {known}.',
  'home.learnMore.few': 'Najprv sa nauč aspoň {count} noty – zatiaľ poznáš {known}.',
  'home.learnMore.other': 'Najprv sa nauč aspoň {count} nôt – zatiaľ poznáš {known}.',
};

const EN_BUNDLE: TranslationBundle = { language: 'en', languages: TEST_LANGUAGES, values: ENGLISH };
const SK_BUNDLE: TranslationBundle = { language: 'sk', languages: TEST_LANGUAGES, values: SLOVAK };
/** What the server sends for another language than English: English itself beside it. */
const SK_ANSWER = { ...SK_BUNDLE, english: ENGLISH };

/** The server: Slovak for `sk`, English - saying so - for anything else. */
function answer(code: string): Promise<unknown> {
  return Promise.resolve(code === 'sk' ? SK_ANSWER : EN_BUNDLE);
}

/** The Slovak bundle as it is once the owner has reworded a string in the browser. */
function reworded(close: string): TranslationBundle {
  return { ...SK_BUNDLE, values: { ...SLOVAK, 'common.close': close } };
}

const OFFLINE = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });
const PENDING_MIGRATION = new HttpErrorResponse({ status: 503, error: { error: 'The database needs an update.', code: 'not_set_up' } });

/** Everything already on its way has run: the answers of requests that were settled, and what follows them. */
function settled(): Promise<void> {
  return new Promise((done) => setTimeout(done));
}

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

describe('languageCandidates() and pickLanguage(): which language a learner gets', () => {
  it('orders the wishes: this tab, the chooser, the token, each browser tag and its first subtag, English', () => {
    const candidates = languageCandidates({ tab: 'de', chosen: 'fr', token: 'it', browser: ['sk-SK', 'cs'] });
    expect(candidates.map((candidate) => candidate.code)).toEqual(['de', 'fr', 'it', 'sk-sk', 'sk', 'cs', 'en']);
    expect(candidates.filter((candidate) => candidate.browser).map((candidate) => candidate.code)).toEqual(['sk-sk', 'sk', 'cs']);
  });

  it('lower-cases, and ignores whatever does not look like a language code', () => {
    const candidates = languageCandidates({ tab: 'SK', chosen: 'english', token: '../../etc', browser: ['zh-Hant-TW', 'fil', null, undefined, ''] });
    expect(candidates.map((candidate) => candidate.code)).toEqual(['sk', 'zh', 'en']);
  });

  it('takes the first wish that is on offer, and English when none is', () => {
    expect(pickLanguage(languageCandidates({ tab: 'de', chosen: 'sk', browser: ['en-GB'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ tab: 'sk', chosen: 'en' }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ token: 'sk', browser: ['en'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ browser: ['de-AT', 'fr'] }), ['en', 'sk'])).toBe('en');
  });

  it('gives a Czech browser Slovak - while no Czech is on offer, and only at the browser step', () => {
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ', 'en'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ', 'en'] }), ['en', 'sk', 'cs'])).toBe('cs');
    expect(pickLanguage(languageCandidates({ tab: 'cs' }), ['en', 'sk'])).toBe('en');
    expect(pickLanguage(languageCandidates({ token: 'cs', browser: ['en'] }), ['en', 'sk'])).toBe('en');
    // The alias still counts for the browser when the same code was also asked for elsewhere.
    expect(pickLanguage(languageCandidates({ tab: 'cs', browser: ['cs'] }), ['en', 'sk'])).toBe('sk');
  });
});

describe('TranslationService', () => {
  /** What the server is asked for: the code of each GET /api/translations/{code}, in order. */
  const server = vi.fn<(code: string) => Promise<unknown>>();
  /** HttpClient, as far as the service uses it: every address it asks for is noted, and answered by `server`. */
  const asked: string[] = [];
  const http = {
    get: (url: string) => {
      asked.push(url);
      return defer(() => from(server(decodeURIComponent(url.replace('/api/translations/', '')))));
    },
  };
  /** The SDK's session is live: a user it holds counts only then. */
  const live = signal(true);
  /** Who is signed in: their account's language, and - from an IAM that keeps them (its 015) - its preferences. */
  const user = signal<{ locale: string | null; preferences?: AnotokiPreferences } | null>(null);
  let listeners: (() => void)[] = [];
  /** A save to the account: answered by each spec (a pending promise by default). */
  const savePreferences = vi.fn<(changes: AnotokiPreferenceChanges) => Promise<AnotokiSavedPreferences>>();
  const auth = {
    user,
    signedIn: () => live() && user() !== null,
    // As AuthService has it: the account's while somebody is signed in, and only from an IAM that sends them.
    preferences: () => (live() ? (user()?.preferences ?? null) : null),
    savePreferences,
    onAuthChange: (listener: () => void) => {
      listeners.push(listener);
      return () => undefined;
    },
  };
  let warn: ReturnType<typeof vi.spyOn>;
  let browser: ReturnType<typeof vi.spyOn>;

  const providers = [
    { provide: HttpClient, useValue: http },
    { provide: AuthService, useValue: auth },
  ];

  function service(): TranslationService {
    return TestBed.inject(TranslationService);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    server.mockReset().mockImplementation(answer);
    asked.length = 0;
    live.set(true);
    user.set(null);
    listeners = [];
    savePreferences.mockReset().mockReturnValue(new Promise(() => undefined));
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    browser = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    TestBed.configureTestingModule({ providers });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('choosing the language as the app starts', () => {
    it('asks GET /api/translations/{code}, and needs one request for a Slovak browser’s first visit: the server answers a regional code by its base language', async () => {
      browser.mockReturnValue(['sk-SK', 'sk']);
      server.mockImplementation((code: string) => Promise.resolve(code === 'sk-sk' || code === 'sk' ? SK_ANSWER : EN_BUNDLE));
      await service().init(true);

      expect(asked).toEqual(['/api/translations/sk-sk']);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('asks for the first wish and, answered in English (an older server), settles on the list that came: two requests at most', async () => {
      browser.mockReturnValue(['sk-SK', 'en']);
      await service().init(true);

      expect(server.mock.calls).toEqual([['sk-sk'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().languages()).toEqual(TEST_LANGUAGES);
      expect(service().t('common.close')).toBe('Zavrieť');
    });

    it('starts in English rather than in keys when the language it settled on cannot be had', async () => {
      browser.mockReturnValue(['sk-SK']);
      server.mockResolvedValueOnce(EN_BUNDLE).mockRejectedValueOnce(OFFLINE);
      await service().init(true);

      expect(server.mock.calls).toEqual([['sk-sk'], ['sk']]);
      expect(service().ready()).toBe(true);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
    });

    it('needs one request when the first wish is on offer, or when nothing wished for is', async () => {
      browser.mockReturnValue(['sk']);
      await service().init(true);
      expect(server.mock.calls).toEqual([['sk']]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers });
      localStorage.clear();
      server.mockClear();
      browser.mockReturnValue(['de-DE', 'fr']);
      await service().init(true);
      expect(server.mock.calls).toEqual([['de-de']]);
      expect(service().language()).toBe('en');
    });

    it('gives a Czech browser Slovak', async () => {
      browser.mockReturnValue(['cs-CZ', 'cs', 'en']);
      await service().init(true);
      expect(service().language()).toBe('sk');
    });

    it('keeps ?lang= for this tab only, and takes it out of the address before the router reads it', async () => {
      history.replaceState(null, '', '/songs/ode-to-joy?tab=people&lang=SK&x=a%20b#top');
      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init(true);

      expect(service().language()).toBe('sk');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
      expect(location.pathname + location.search + location.hash).toBe('/songs/ode-to-joy?tab=people&x=a%20b#top');
    });

    it('ignores a ?lang= that is not a language code: never stored, never sent - and still removed', async () => {
      history.replaceState(null, '', '/?lang=%3Cscript%3E');
      await service().init(true);

      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(location.search).toBe('');
      expect(server.mock.calls).toEqual([['en-gb']]);
      expect(service().language()).toBe('en');
    });

    it('keeps ?lang= and a choice for as long as the page lives where storage refuses to be written', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      browser.mockReturnValue(['en']);
      history.replaceState(null, '', '/?lang=sk');
      await service().init(true);

      // Nothing could be kept - and the link works all the same, with the parameter gone from the address.
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(service().language()).toBe('sk');
      expect(location.search).toBe('');

      // A choice made here outlives the link - and the next start, whatever the browser would rather read.
      browser.mockReturnValue(['sk']);
      expect(await service().setLanguage('en')).toBe(true);
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
      await service().init(true);
      expect(service().language()).toBe('en');
    });

    it('puts this tab before the chooser, the chooser before the token, the token before the browser', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'sk' });
      await service().init(true);
      expect(service().language()).toBe('sk');
      // Used, not stored: a change on the account page arrives with the next token.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();

      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init(true);
      expect(service().language()).toBe('en');

      sessionStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init(true);
      expect(service().language()).toBe('sk');
    });

    it('takes the token’s locale only from somebody signed in: a session that ended has no token to read', async () => {
      browser.mockReturnValue(['en']);
      live.set(false);
      // Nothing the SDK could hold counts while nobody is signed in - not even a user somebody left behind.
      user.set({ locale: 'sk' });
      await service().init(true);

      expect(server.mock.calls).toEqual([['en']]);
      expect(service().language()).toBe('en');
    });

    it('adopts a changed locale of the token while nothing is stored here - without storing it', async () => {
      browser.mockReturnValue(['en']);
      await service().init(true);
      expect(service().language()).toBe('en');

      user.set({ locale: 'sk' });
      listeners.forEach((listener) => listener());
      await vi.waitFor(() => expect(service().language()).toBe('sk'));
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

      // Once somebody chose here, the token no longer decides - for an account that sends no preferences
      // (an IAM before its 015): waited out, so a switch on its way would have landed.
      await service().setLanguage('en');
      user.set({ locale: 'en' });
      listeners.forEach((listener) => listener());
      user.set({ locale: 'sk' });
      listeners.forEach((listener) => listener());
      await settled();
      expect(service().language()).toBe('en');
      expect(server.mock.calls.filter(([code]) => code === 'sk')).toHaveLength(1);
    });

    it('says the language of the strings on <html lang>, and the locale dates are written in', async () => {
      browser.mockReturnValue(['sk']);
      await service().init(true);
      TestBed.tick();
      expect(document.documentElement.lang).toBe('sk');
      expect(service().locale()).toBe('sk-SK');

      await service().setLanguage('en');
      TestBed.tick();
      expect(document.documentElement.lang).toBe('en');
      expect(service().locale()).toBe('en-GB');

      // Any other language is its own locale.
      const czech = [...TEST_LANGUAGES, { code: 'cs', name: 'Czech', nativeName: 'Čeština' }];
      server.mockResolvedValue({ language: 'cs', languages: czech, values: ENGLISH, english: ENGLISH });
      await service().setLanguage('cs');
      expect(service().locale()).toBe('cs');
    });
  });

  describe('the cache', () => {
    it('starts, asks the server and words the page when the cache is corrupt', async () => {
      for (const corrupt of [
        '{not json',
        '[]',
        'null',
        JSON.stringify({ language: 'en', languages: 'en', values: ENGLISH }),
        JSON.stringify({ language: 'EN', languages: TEST_LANGUAGES, values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: [{ code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' }], values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: [{ code: 'en', name: 'English' }], values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: TEST_LANGUAGES, values: { 'common.close': 7 } }),
        JSON.stringify({ language: 'en', languages: TEST_LANGUAGES, values: ['Close'] }),
        JSON.stringify({ language: 'en', languages: TEST_LANGUAGES }),
      ]) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers });
        server.mockClear();
        browser.mockReturnValue(['en']);
        localStorage.setItem(CACHE_KEY, corrupt);

        await service().init(true);

        expect(server, corrupt).toHaveBeenCalled();
        expect(service().ready(), corrupt).toBe(true);
        expect(service().t('common.close'), corrupt).toBe('Close');
        // What the server sent has taken the corrupt cache's place.
        expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null').values['common.close'], corrupt).toBe('Close');
      }
    });

    it('holds the language, the languages and the strings - and the English the server sends beside another language, which the admin panel reads', async () => {
      browser.mockReturnValue(['sk']);
      await service().init(true);

      expect(service().language()).toBe('sk');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')).toEqual(SK_ANSWER);

      // And a bundle that comes without it is a bundle all the same.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers });
      server.mockReset().mockRejectedValue(OFFLINE);
      await service().init(true);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
    });

    it('is not used when it is in another language than the one chosen now', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['en']);
      const slow = later<unknown>();
      server.mockReturnValue(slow.promise);

      const started = service().init(true);
      // No cache: nothing is shown in Slovak meanwhile, and the start waits for the server.
      expect(service().ready()).toBe(false);
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
      slow.resolve(EN_BUNDLE);
      await started;
      expect(service().language()).toBe('en');
    });

    it('follows a language offered again (or added) at once, not one visit late: it settles on the list that came, whatever answered', async () => {
      // Slovak was chosen here; while it was hidden, the visit was in English and that is what was kept.
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      localStorage.setItem(CACHE_KEY, JSON.stringify({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH }));
      await service().init(true);

      // The kept language is asked for - and its answer names Slovak again.
      expect(server.mock.calls).toEqual([['en'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('follows a language hidden since the last visit: the cache is in force only until the answer', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      const english = { language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH };
      server.mockResolvedValue(english);
      await service().init(true);

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([TEST_LANGUAGES[0]]);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')).toEqual(english);
    });

    it('waits a second for the fresh bundle, then starts from the cache - and the answer replaces it when it comes', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(reworded('Zatvoriť')));
      browser.mockReturnValue(['sk']);
      const slow = later<unknown>();
      server.mockReturnValue(slow.promise);

      let started = false;
      const starting = service()
        .init(true)
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS - 1);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zatvoriť');

      vi.useRealTimers();
      slow.resolve(SK_ANSWER);
      await vi.waitFor(() => expect(service().t('common.close')).toBe('Zavrieť'));
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Zavrieť');
    });

    it('does not wait the second out when the server answers, or fails, sooner', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'common.close': 'Shut' } }));
      await service().init(true);
      expect(service().t('common.close')).toBe('Close');

      server.mockRejectedValue(OFFLINE);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'common.close': 'Shut' } }));
      await service().init(true);
      expect(service().t('common.close')).toBe('Shut');
    });

    it('asks once more, a moment later, when there is no cache and the first bundle does not come', async () => {
      vi.useFakeTimers();
      server.mockRejectedValueOnce(OFFLINE);

      let started = false;
      const starting = service()
        .init(true)
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS - 1);
      expect(server.mock.calls).toEqual([['en-gb']]);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;

      // The same request again: the page waited for it, and starts with its strings.
      expect(server.mock.calls).toEqual([['en-gb'], ['en-gb']]);
      expect(service().ready()).toBe(true);
      expect(service().t('common.close')).toBe('Close');
    });

    it('goes on without a bundle when the server cannot give one - after the one retry: a migration is pending, or it is out of reach', async () => {
      vi.useFakeTimers();
      server.mockRejectedValue(PENDING_MIGRATION);
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await expect(starting).resolves.toBeUndefined();

      expect(server).toHaveBeenCalledTimes(2);
      expect(service().ready()).toBe(false);
      expect(service().languages()).toEqual([]);
      expect(service().language()).toBe('en');
    });

    it('init(false) asks for nothing: the cache if there is one', async () => {
      await service().init(false);
      expect(asked).toEqual([]);
      expect(service().ready()).toBe(false);

      localStorage.setItem(CACHE_KEY, JSON.stringify(EN_BUNDLE));
      await service().init(false);
      expect(asked).toEqual([]);
      expect(service().ready()).toBe(true);
      expect(service().t('common.close')).toBe('Close');
    });

    it('init(false) takes the cache in whatever language it is in - and leaves it where it is', async () => {
      // A learner whose Slovak came from the token: nobody is signed in now, and the browser says English.
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['en']);
      await service().init(false);

      expect(asked).toEqual([]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')).toEqual(SK_BUNDLE);

      // A corrupt one is removed all the same.
      localStorage.setItem(CACHE_KEY, '{not json');
      await service().init(false);
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('init(false) still takes ?lang= out of the address, and keeps it for the tab', async () => {
      history.replaceState(null, '', '/?lang=sk');
      await service().init(false);

      expect(location.search).toBe('');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(asked).toEqual([]);
    });

    it('takes nothing from the server that is not a bundle', async () => {
      vi.useFakeTimers();
      server.mockResolvedValue({ language: 'en', languages: TEST_LANGUAGES, values: { 'common.close': ['Close'] } });
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      expect(service().ready()).toBe(false);
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });
  });

  describe('the English kept in code: only while no bundle is in memory', () => {
    /** A plural family and a sentence with a name in it, put into the kept table for one test: the shell's own arrive with the shell. */
    const KEPT = KEPT_ENGLISH as Record<string, string>;
    const LENT = {
      'test.notes.one': '{count} note waits.',
      'test.notes.other': '{count} notes wait.',
      'test.device': 'Connected: {name}',
    };

    beforeEach(() => Object.assign(KEPT, LENT));
    afterEach(() => Object.keys(LENT).forEach((key) => delete KEPT[key]));

    it('words the shell from the kept English, and warns about nothing it holds', async () => {
      await service().init(false);
      expect(service().ready()).toBe(false);

      expect(service().t('title.learn')).toBe('Learn');
      expect(service().t('signIn.failed', { code: 'state_mismatch' })).toBe('Signing in did not work. Please try again. (state_mismatch)');
      expect(service().has('title.learn')).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('goes the same way for plural(), around() and aroundPlural()', async () => {
      await service().init(false);

      expect(service().plural('test.notes', 1)).toBe('1 note waits.');
      // English rules, while there is no bundle: that is the language the kept strings are in.
      expect(service().plural('test.notes', 3)).toBe('3 notes wait.');
      expect(service().around('test.device', 'name')).toEqual(['Connected: ', '', true]);
      expect(service().aroundPlural('test.notes', 2, 'count')).toEqual(['', ' notes wait.', true]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('shows a key the table does not hold as the key, and warns once', async () => {
      await service().init(false);

      expect(service().t('home.continue')).toBe('home.continue');
      expect(service().t('home.continue')).toBe('home.continue');
      expect(service().has('home.continue')).toBe(false);
      expect(service().has('constructor')).toBe(false);
      expect(service().t('constructor')).toBe('constructor');
      expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.continue'"], ["[i18n] no string for 'constructor'"]]);
    });

    it('is out of play once a bundle is in memory: a missing string shows its key, kept or not', async () => {
      // The bundle has none of the kept keys - as after a migration that has not brought them yet.
      await service().init(true);
      expect(service().ready()).toBe(true);

      expect(service().t('title.learn')).toBe('title.learn');
      expect(service().has('title.learn')).toBe(false);
      expect(service().plural('test.notes', 1)).toBe('test.notes.other');
      expect(service().around('test.device', 'name')).toEqual(['test.device', '', false]);
      expect(service().aroundPlural('test.notes', 2, 'count')).toEqual(['test.notes.other', '', false]);
      expect(warn.mock.calls).toEqual([["[i18n] no string for 'title.learn'"], ["[i18n] no string for 'test.notes.other'"], ["[i18n] no string for 'test.device'"]]);
    });

    it('gives way to the bundle the moment one comes - also a cached one, in its own language', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...SK_BUNDLE, values: { ...SLOVAK, 'title.learn': 'Učenie' } }));
      await service().init(false);

      expect(service().t('title.learn')).toBe('Učenie');
      expect(service().t('title.stats')).toBe('title.stats');
    });
  });

  describe('the admin panel: English whatever the learner chose', () => {
    it('reads every key in English under /admin, and the learner\'s language again outside it - the choice untouched', async () => {
      browser.mockReturnValue(['sk']);
      await service().init(true);
      TestBed.tick();
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(document.documentElement.lang).toBe('sk');

      for (const address of ['/admin', '/admin/translations', '/admin/people?x=1', '/admin#top']) {
        service().navigated(address);
        TestBed.tick();
        expect(service().inAdmin(), address).toBe(true);
        expect(service().effectiveLanguage(), address).toBe('en');
        expect(service().t('common.close'), address).toBe('Close');
        expect(service().plural('home.due', 2), address).toBe('2 notes are due for review.');
        expect(service().locale(), address).toBe('en-GB');
        expect(document.documentElement.lang, address).toBe('en');
      }
      expect(service().language()).toBe('sk');

      for (const address of ['/', '/stats', '/administrator', '/songs/admin']) {
        service().navigated(address);
        TestBed.tick();
        expect(service().inAdmin(), address).toBe(false);
        expect(service().t('common.close'), address).toBe('Zavrieť');
        expect(document.documentElement.lang, address).toBe('sk');
      }
    });

    it('an English page is English there too; a cached bundle from before English was kept beside it reads its own', async () => {
      await service().init(true);
      service().navigated('/admin/translations');
      expect(service().t('common.close')).toBe('Close');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers });
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['sk']);
      server.mockReset().mockRejectedValue(OFFLINE);
      await service().init(true);
      service().navigated('/admin/translations');
      expect(service().t('common.close')).toBe('Zavrieť');
    });
  });

  describe('asking again: a page that started without its strings heals at the next navigation', () => {
    /** A start with no cache and a server out of reach: both attempts fail, and the page has no bundle. */
    async function startWithout(): Promise<void> {
      vi.useFakeTimers();
      server.mockRejectedValue(OFFLINE);
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(service().ready()).toBe(false);
      server.mockClear();
    }

    it('asks once at each navigation while no bundle is in memory - and no more once one has come', async () => {
      browser.mockReturnValue(['sk']);
      await startWithout();

      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().ready()).toBe(false);

      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk'], ['sk']]);

      // The server is back: the next click brings the strings, in the learner's language.
      server.mockImplementation(answer);
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(3);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');

      service().navigated();
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(3);
    });

    it('asks again while the cached bundle is in force because its refresh failed', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { ...ENGLISH, 'common.close': 'Shut' } }));
      server.mockRejectedValue(OFFLINE);
      await service().init(true);
      expect(service().t('common.close')).toBe('Shut');
      server.mockClear();

      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['en']]);
      expect(service().t('common.close')).toBe('Shut');

      server.mockImplementation(answer);
      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['en'], ['en']]);
      expect(service().t('common.close')).toBe('Close');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Close');

      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(2);
    });

    it('never has two loads in flight: a navigation asks for nothing while an answer is still on its way', async () => {
      await startWithout();
      const slow = later<unknown>();
      server.mockReturnValue(slow.promise);

      service().navigated();
      service().navigated();
      await settled();
      service().navigated();
      expect(server).toHaveBeenCalledTimes(1);

      slow.resolve(EN_BUNDLE);
      await settled();
      expect(service().ready()).toBe(true);
      service().navigated();
      expect(server).toHaveBeenCalledTimes(1);
    });

    it('leaves a start that is still waiting for its fresh bundle alone', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(reworded('Zatvoriť')));
      browser.mockReturnValue(['sk']);
      const slow = later<unknown>();
      server.mockReturnValue(slow.promise);
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();

      // The page started from the cache; its refresh is still out - the first navigation does not ask a second time.
      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk']]);

      slow.resolve(SK_ANSWER);
      await settled();
      expect(service().t('common.close')).toBe('Zavrieť');
      service().navigated();
      expect(server).toHaveBeenCalledTimes(1);
    });

    it('never overtakes a choice that is being loaded', async () => {
      await startWithout();
      const slovak = later<unknown>();
      server.mockReturnValue(slovak.promise);

      const choosing = service().setLanguage('sk');
      service().navigated();
      await settled();
      expect(server.mock.calls).toEqual([['sk']]);

      slovak.resolve(SK_ANSWER);
      expect(await choosing).toBe(true);
      expect(service().language()).toBe('sk');
    });

    it('asks for nothing before the start has run, nor after a start that asked for nothing', async () => {
      service().navigated();
      await settled();
      expect(server).not.toHaveBeenCalled();

      // The app is not set up, or its backend is out of reach: init(false).
      await service().init(false);
      service().navigated();
      service().navigated();
      await settled();
      expect(server).not.toHaveBeenCalled();
      expect(asked).toEqual([]);
    });

    it('asks for nothing more once the server has said it is not set up (a migration is pending): the page is loaded again after the setup', async () => {
      vi.useFakeTimers();
      server.mockRejectedValue(PENDING_MIGRATION);
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(server).toHaveBeenCalledTimes(2);

      // The "not set up yet" card is drawn: its navigation asks nothing a third time.
      service().navigated();
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(2);
      expect(service().ready()).toBe(false);
    });

    it('asks again from reload() on - once an ADMIN applied what was pending and the app started in place - and at each navigation while that fails', async () => {
      vi.useFakeTimers();
      server.mockRejectedValue(PENDING_MIGRATION);
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      vi.useRealTimers();
      server.mockClear();

      // BootService.resumeAfterUpdate(): the database is current now, but this answer is lost.
      server.mockRejectedValue(OFFLINE);
      await service().reload();
      expect(server).toHaveBeenCalledTimes(1);
      expect(service().ready()).toBe(false);

      // So the next click asks again, and the strings come.
      server.mockImplementation(answer);
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(2);
      expect(service().ready()).toBe(true);
      expect(service().t('common.close')).toBe('Close');
    });
  });

  describe('reload(): the strings again, after the owner changed them or the languages', () => {
    it('asks for the bundle of the language on the page again, and puts it in force and in the cache', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init(true);
      expect(service().t('common.close')).toBe('Zavrieť');
      server.mockClear();

      server.mockImplementation((code: string) => Promise.resolve(code === 'sk' ? reworded('Zatvoriť') : EN_BUNDLE));
      await service().reload();

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zatvoriť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Zatvoriť');
    });

    it('follows a language hidden a moment ago: the page goes to what the list that came still offers', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init(true);
      server.mockClear();

      server.mockResolvedValue({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH });
      await service().reload();

      expect(server.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([TEST_LANGUAGES[0]]);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('en');
    });

    it('follows a language offered a moment ago: the learner who chose it gets it without loading the page again', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      server.mockResolvedValue({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH });
      await service().init(true);
      expect(service().language()).toBe('en');
      server.mockClear();

      server.mockImplementation(answer);
      await service().reload();

      expect(server.mock.calls).toEqual([['en'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().languages()).toEqual(TEST_LANGUAGES);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('never rejects: the page stays as it is when the server cannot be had - and asks again at the next navigation', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init(true);
      // Fresh from the server: a navigation asks for nothing.
      service().navigated();
      server.mockClear();

      server.mockRejectedValue(OFFLINE);
      await expect(service().reload()).resolves.toBeUndefined();
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(server).toHaveBeenCalledTimes(1);

      // Known to be behind now: the next click asks once more.
      server.mockImplementation((code: string) => Promise.resolve(code === 'sk' ? reworded('Zatvoriť') : EN_BUNDLE));
      service().navigated();
      await settled();
      expect(server).toHaveBeenCalledTimes(2);
      expect(service().t('common.close')).toBe('Zatvoriť');
    });

    it('is the load that counts: an answer still on its way from before the change is dropped', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['sk']);
      const before = later<unknown>();
      server.mockReturnValueOnce(before.promise);
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();

      server.mockResolvedValue(reworded('Zatvoriť'));
      await service().reload();
      expect(service().t('common.close')).toBe('Zatvoriť');

      // The start's answer was made before the save: it must not put the old word back.
      before.resolve(SK_ANSWER);
      await settled();
      expect(service().t('common.close')).toBe('Zatvoriť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Zatvoriť');
    });
  });

  describe('setLanguage(): the chooser', () => {
    it('loads the bundle, then switches and remembers - and the choice outlives the ?lang= of this tab', async () => {
      sessionStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init(true);
      server.mockClear();

      const slow = later<unknown>();
      server.mockReturnValue(slow.promise);
      const switching = service().setLanguage('sk');
      expect(service().language()).toBe('en');
      slow.resolve(SK_ANSWER);

      expect(await switching).toBe(true);
      expect(service().language()).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('lets the last choice win: going back to the language on the page drops the one still on its way', async () => {
      await service().init(true);
      const slow = later<unknown>();
      server.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(EN_BUNDLE)));

      const first = service().setLanguage('sk');
      // A change of mind, back to English: no request is needed - and it is a choice all the same.
      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_ANSWER);

      expect(await first).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
    });

    it('lets the last choice win with two loads in flight: the slower, earlier answer is dropped when it comes', async () => {
      const czech = {
        language: 'cs',
        languages: [...TEST_LANGUAGES, { code: 'cs', name: 'Czech', nativeName: 'Čeština' }],
        values: { ...ENGLISH, 'common.close': 'Zavřít' },
        english: ENGLISH,
      };
      await service().init(true);
      const slow = later<unknown>();
      server.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(code === 'cs' ? czech : EN_BUNDLE)));

      const first = service().setLanguage('sk');
      expect(await service().setLanguage('cs')).toBe(true);
      slow.resolve(SK_ANSWER);

      expect(await first).toBe(false);
      expect(service().language()).toBe('cs');
      expect(service().t('common.close')).toBe('Zavřít');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('cs');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('cs');
    });

    it('is not undone by a start’s answer that comes late', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['sk']);
      const slow = later<unknown>();
      server.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(EN_BUNDLE)));
      const starting = service().init(true);
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(service().language()).toBe('sk');

      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_ANSWER);
      await settled();

      expect(service().language()).toBe('en');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('en');
    });

    it('never rejects: false, and the page stays as it is, when the strings cannot be had', async () => {
      await service().init(true);
      server.mockRejectedValue(new HttpErrorResponse({ status: 503, error: { code: 'db' } }));

      expect(await service().setLanguage('sk')).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    });

    it('does not switch to a language the server no longer offers, and asks for nothing that is not a code', async () => {
      await service().init(true);
      server.mockClear();

      expect(await service().setLanguage('de')).toBe(false);
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

      server.mockClear();
      expect(await service().setLanguage('../owner')).toBe(false);
      expect(server).not.toHaveBeenCalled();
    });
  });

  describe('an account that sends its preferences (the IAM’s 015): its language before what this device remembered', () => {
    const PREFERENCES: AnotokiPreferences = { theme: 'auto', date_format: null, time_format: null };

    /** The next visit: a new page load, with what the browser kept. */
    function nextVisit(): void {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers });
      listeners = [];
    }

    /** The account's language as the SDK passes a change of it on - saved here, in another tab, on another site: user() first, then every listener. */
    function accountSays(locale: string): void {
      user.set({ locale, preferences: PREFERENCES });
      listeners.forEach((listener) => listener());
    }

    it('reads the account’s language over what this device remembered - not over this tab’s ?lang= - and the device’s first for anybody else, as before', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'en');
      user.set({ locale: 'sk', preferences: PREFERENCES });
      await service().init(true);
      expect(service().language()).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');

      // A link's ?lang= holds for its tab, over the account too.
      history.replaceState(null, '', '/?lang=en');
      await service().init(true);
      expect(service().language()).toBe('en');

      // Signed out, or signed in through an IAM that sends no preferences: the device's choice first.
      sessionStorage.clear();
      nextVisit();
      user.set(null);
      await service().init(true);
      expect(service().language()).toBe('en');
      nextVisit();
      user.set({ locale: 'sk' });
      await service().init(true);
      expect(service().language()).toBe('en');
    });

    it('reads the device’s choice next, when the site does not have the account’s language', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      user.set({ locale: 'de', preferences: PREFERENCES });
      await service().init(true);
      expect(service().language()).toBe('sk');
    });

    it('saves the chooser’s choice to the account, as it switches - nothing for a visitor, nor through an IAM that sends no preferences, nor what the account has', async () => {
      browser.mockReturnValue(['en']);
      await service().init(true);

      expect(await service().setLanguage('sk')).toBe(true);
      user.set({ locale: 'en' });
      expect(await service().setLanguage('en')).toBe(true);
      expect(savePreferences).not.toHaveBeenCalled();

      user.set({ locale: 'en', preferences: PREFERENCES });
      expect(await service().setLanguage('en')).toBe(true);
      expect(savePreferences).not.toHaveBeenCalled();
      expect(await service().setLanguage('sk')).toBe(true);
      expect(savePreferences.mock.calls).toEqual([[{ language: 'sk' }]]);
      // On this device too, for when nobody is signed in.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
    });

    it('saves only a choice that won: one overtaken on its way is not sent', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init(true);
      const slow = later<unknown>();
      server.mockImplementation((code: string) => (code === 'sk' ? slow.promise : answer(code)));

      const overtaken = service().setLanguage('sk');
      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_ANSWER);
      expect(await overtaken).toBe(false);
      expect(service().language()).toBe('en');
      expect(savePreferences).not.toHaveBeenCalled();
    });

    it('keeps a language the IAM does not offer as this site’s own for the visit, silently - the next visit reads the account’s again', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init(true);
      expect(service().language()).toBe('en');

      savePreferences.mockRejectedValue(Object.assign(new Error('Not a language the IAM offers'), { code: 'invalid_request' }));
      expect(await service().setLanguage('sk')).toBe(true);
      await settled();
      expect(savePreferences.mock.calls).toEqual([[{ language: 'sk' }]]);
      expect(service().language()).toBe('sk');
      expect(service().languageNotSaved()).toBe(false);

      // For the rest of the visit: the strings read again (an editor saved some) are still Slovak - over the account's English.
      await service().reload();
      expect(service().language()).toBe('sk');

      nextVisit();
      await service().init(true);
      expect(service().language()).toBe('en');
      // The device keeps what was chosen on it, for when nobody is signed in.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
    });

    it('says any other refusal - access_denied too: this account may no longer use Piano Academy - and the page stays in the chosen language for the visit', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init(true);

      savePreferences.mockRejectedValueOnce(Object.assign(new Error('The IAM could not be reached'), { code: 'network' }));
      expect(await service().setLanguage('sk')).toBe(true);
      await settled();
      expect(service().language()).toBe('sk');
      expect(service().languageNotSaved()).toBe(true);
      await service().reload();
      expect(service().language()).toBe('sk');

      savePreferences.mockRejectedValueOnce(Object.assign(new Error('No access to this application'), { code: 'access_denied' }));
      const again = service().setLanguage('sk');
      // A new choice puts the note away until its own answer comes.
      expect(service().languageNotSaved()).toBe(false);
      expect(await again).toBe(true);
      await settled();
      expect(service().languageNotSaved()).toBe(true);
      expect(savePreferences.mock.calls).toEqual([[{ language: 'sk' }], [{ language: 'sk' }]]);
      expect(service().language()).toBe('sk');
    });

    it('follows a change of the account’s language when it comes - over the device’s choice, and over a choice made earlier on this page', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'en');
      user.set({ locale: 'sk', preferences: PREFERENCES });
      await service().init(true);
      expect(service().language()).toBe('sk');

      // Changed on the IAM's account page, on another anotoki site, in another tab.
      accountSays('en');
      await vi.waitFor(() => expect(service().language()).toBe('en'));

      // Chosen here and saved, then changed elsewhere again: the newer wish wins - and still does when the strings are read again.
      savePreferences.mockImplementation(async (changes: AnotokiPreferenceChanges) => {
        accountSays(String(changes.language));
        return { locale: changes.language ?? null, preferences: PREFERENCES };
      });
      expect(await service().setLanguage('sk')).toBe(true);
      await settled();
      expect(service().language()).toBe('sk');
      accountSays('en');
      await vi.waitFor(() => expect(service().language()).toBe('en'));
      await service().reload();
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
    });

    it('does not follow it over this tab’s ?lang=', async () => {
      browser.mockReturnValue(['en']);
      history.replaceState(null, '', '/?lang=en');
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init(true);

      accountSays('sk');
      await settled();
      expect(service().language()).toBe('en');
    });

    it('does not follow it while a choice made here is on its way to the account: the answer to that save is the last word', async () => {
      const THREE = [...TEST_LANGUAGES, { code: 'cs', name: 'Czech', nativeName: 'Čeština' }];
      server.mockImplementation((code: string) =>
        Promise.resolve(code === 'sk' ? { ...SK_ANSWER, languages: THREE } : code === 'cs' ? { language: 'cs', languages: THREE, values: ENGLISH, english: ENGLISH } : { ...EN_BUNDLE, languages: THREE }),
      );
      browser.mockReturnValue(['en']);
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init(true);
      const saved = later<AnotokiSavedPreferences>();
      savePreferences.mockReturnValue(saved.promise);

      expect(await service().setLanguage('sk')).toBe(true);
      // Another anotoki site changes the account meanwhile: not followed while this page's choice is on its way.
      accountSays('cs');
      await settled();
      expect(service().language()).toBe('sk');

      // The IAM took this page's choice last: its answer is the account's language now.
      accountSays('sk');
      saved.resolve({ locale: 'sk', preferences: PREFERENCES });
      await settled();
      expect(service().language()).toBe('sk');
      expect(asked.filter((url) => url.endsWith('/cs'))).toEqual([]);
    });
  });
});

describe('TranslationService: the request itself', () => {
  it('goes out through HttpClient, to /api/translations/{code}', async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['sk-SK']);
    const auth = { user: () => null, signedIn: () => false, preferences: () => null, onAuthChange: () => () => undefined };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: auth }] });
    const http = TestBed.inject(HttpTestingController);
    const i18n = TestBed.inject(TranslationService);

    const starting = i18n.init(true);
    await settled();
    const request = http.expectOne('/api/translations/sk-sk');
    expect(request.request.method).toBe('GET');
    request.flush({ ...SK_BUNDLE, english: ENGLISH });
    await starting;

    expect(i18n.language()).toBe('sk');
    expect(i18n.t('common.close')).toBe('Zavrieť');
    http.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });
});

describe('TranslationService: wording', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  function slovak(): TranslationService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    return TestBed.inject(TranslationService);
  }

  function english(): TranslationService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(ENGLISH)] });
    return TestBed.inject(TranslationService);
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('fills placeholders in one pass: what a parameter holds is never filled again', () => {
    const i18n = english();
    expect(i18n.t('home.hello', { name: '{count}', count: 3 })).toBe('Hello {count}, you have 3.');
    expect(i18n.t('home.hello', { name: 'Anna {name}', count: '{name}' })).toBe('Hello Anna {name}, you have {name}.');
  });

  it('leaves a placeholder with no parameter as written', () => {
    const i18n = english();
    expect(i18n.t('home.hello')).toBe('Hello {name}, you have {count}.');
    expect(i18n.t('home.hello', { name: 'Anna' })).toBe('Hello Anna, you have {count}.');
    expect(i18n.t('home.hello', { name: null, count: 0 })).toBe('Hello {name}, you have 0.');
    // Not a name a parameter object merely inherits: `constructor` and `toString` are on every object.
    expect(i18n.t('home.proto', { count: 1 })).toBe('x {constructor} {toString} y');
    expect(i18n.t('home.proto', { constructor: 'a', toString: 'b' })).toBe('x a b y');
  });

  it('gives an unknown key back as itself and warns once', () => {
    const i18n = english();
    expect(i18n.t('home.missing')).toBe('home.missing');
    expect(i18n.t('home.missing', { name: 'x' })).toBe('home.missing');
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.missing'"]]);
  });

  it('has only the keys of the bundle - nothing an object would inherit', () => {
    const i18n = english();
    expect(i18n.has('common.close')).toBe(true);
    expect(i18n.has('constructor')).toBe(false);
    expect(i18n.has('toString')).toBe(false);
    expect(i18n.has('__proto__')).toBe(false);
    expect(i18n.t('constructor')).toBe('constructor');
  });

  it('cuts a sentence around a placeholder before filling the halves - a song title stands where each language puts it', () => {
    const i18n = english();
    expect(i18n.around('songs.play', 'title')).toEqual(['Play ', ' with the metronome.', true]);
    // The cut is made in the stored string: a parameter cannot move it.
    expect(i18n.around('home.hello', 'count', { name: '{count}' })).toEqual(['Hello {count}, you have ', '.', true]);
    expect(slovak().around('songs.play', 'title')).toEqual(['Zahraj s metronómom: ', '.', true]);
  });

  it('says when the cut was not made, so the page does not glue the value onto a sentence that left it out - or onto a key', () => {
    const i18n = english();
    // A string without the placeholder (another language may leave one out): the whole sentence, and nothing to mark up.
    expect(i18n.around('common.close', 'name')).toEqual(['Close', '', false]);
    expect(i18n.around('home.hello', 'title', { name: 'Anna', count: 2 })).toEqual(['Hello Anna, you have 2.', '', false]);
    // No string at all: the key, as everywhere - and it warns.
    expect(i18n.around('home.missing', 'name')).toEqual(['home.missing', '', false]);
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.missing'"]]);
  });

  it('picks the plural form English asks for', () => {
    const i18n = english();
    expect([0, 1, 2, 5, 12].map((count) => i18n.plural('home.due', count))).toEqual([
      '0 notes are due for review.',
      '1 note is due for review.',
      '2 notes are due for review.',
      '5 notes are due for review.',
      '12 notes are due for review.',
    ]);
  });

  it('picks the plural form Slovak asks for: 1, 2 to 4, and 0 with 5 and more', () => {
    const i18n = slovak();
    expect([0, 1, 2, 3, 4, 5, 12, 22].map((count) => i18n.plural('home.due', count))).toEqual([
      'Na zopakovanie čaká 0 nôt.',
      'Na zopakovanie čaká 1 nota.',
      'Na zopakovanie čakajú 2 noty.',
      'Na zopakovanie čakajú 3 noty.',
      'Na zopakovanie čakajú 4 noty.',
      'Na zopakovanie čaká 5 nôt.',
      'Na zopakovanie čaká 12 nôt.',
      'Na zopakovanie čaká 22 nôt.',
    ]);
    // A form the family does not have (Slovak "many", for fractions) is the family's "other".
    expect(i18n.plural('home.due', 1.5)).toBe('Na zopakovanie čaká 1.5 nôt.');
    // Inside a family the number is {count}, whatever else is handed in.
    expect(i18n.plural('home.due', 3, { count: 99 })).toBe('Na zopakovanie čakajú 3 noty.');
    // A second number goes in bare: nothing agrees with it.
    expect(i18n.plural('home.learnMore', 3, { known: 1 })).toBe('Najprv sa nauč aspoň 3 noty – zatiaľ poznáš 1.');
  });

  it('cuts the form plural() would choose around its number: aroundPlural(), in English', () => {
    const i18n = english();
    expect(i18n.aroundPlural('home.due', 1, 'count')).toEqual(['', ' note is due for review.', true]);
    expect(i18n.aroundPlural('home.due', 4, 'count')).toEqual(['', ' notes are due for review.', true]);
    // Cut at another placeholder, the number is filled as plural() fills it.
    expect(i18n.aroundPlural('home.learnMore', 2, 'known')).toEqual(['Learn at least 2 notes first - you know ', ' so far.', true]);
  });

  it('cuts the form plural() would choose around its number: aroundPlural(), in Slovak - the verb agrees too', () => {
    const i18n = slovak();
    expect(i18n.aroundPlural('home.due', 1, 'count')).toEqual(['Na zopakovanie čaká ', ' nota.', true]);
    expect(i18n.aroundPlural('home.due', 3, 'count')).toEqual(['Na zopakovanie čakajú ', ' noty.', true]);
    expect(i18n.aroundPlural('home.due', 7, 'count')).toEqual(['Na zopakovanie čaká ', ' nôt.', true]);
    expect(i18n.aroundPlural('home.learnMore', 5, 'known', { known: 2 })).toEqual(['Najprv sa nauč aspoň 5 nôt – zatiaľ poznáš ', '.', true]);
    // A form that leaves the placeholder out, and a family that is not there: not cut.
    expect(i18n.aroundPlural('home.due', 2, 'title')).toEqual(['Na zopakovanie čakajú 2 noty.', '', false]);
    expect(i18n.aroundPlural('home.nothing', 2, 'count')).toEqual(['home.nothing.other', '', false]);
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.nothing.other'"]]);
  });

  it('switches between the bundles a spec was given, with no HTTP', async () => {
    const i18n = slovak();
    expect(await i18n.setLanguage('en', false)).toBe(true);
    expect(i18n.t('common.close')).toBe('Close');
    expect(await i18n.setLanguage('sk', false)).toBe(true);
    expect(i18n.t('common.close')).toBe('Zavrieť');
  });

  it('has an init() and a reload() in a spec that answer at once and leave the language the spec chose', async () => {
    const i18n = slovak();
    await expect(i18n.init(true)).resolves.toBeUndefined();
    await expect(i18n.reload()).resolves.toBeUndefined();
    expect(i18n.language()).toBe('sk');
    expect(i18n.t('common.close')).toBe('Zavrieť');
    // With a bundle in memory the kept English is out of play in a spec too.
    expect(i18n.t('title.learn')).toBe('title.learn');
  });
});

describe('TranslationService.saveToAccount(): the chooser’s choice is the anotoki account’s language too', () => {
  /** The account as AuthService holds it: its language (the token's locale) and its preferences - null for nobody, a visitor, or an IAM before its 015. */
  const user = signal<{ locale: string | null } | null>(null);
  const preferences = signal<AnotokiPreferences | null>(null);
  let saves: { changes: AnotokiPreferenceChanges; accept(): void; refuse(code: string): void }[];
  const auth = {
    user,
    signedIn: () => user() !== null,
    onAuthChange: () => () => undefined,
    preferences,
    savePreferences: vi.fn(
      (changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> =>
        new Promise((resolve, reject) => {
          saves.push({
            changes,
            // As the SDK does: user() says the account's new language before the promise resolves.
            accept: () => {
              user.set({ locale: changes.language ?? user()?.locale ?? null });
              resolve({ locale: user()?.locale ?? null, preferences: preferences() });
            },
            refuse: (code) => reject(Object.assign(new Error('The IAM refused the change'), { code })),
          });
        }),
    ),
  };
  const ACCOUNT: AnotokiPreferences = { theme: 'auto', date_format: null, time_format: null };

  function service(): TranslationService {
    return TestBed.inject(TranslationService);
  }

  /** The answers given have come back, and what they set off has run. */
  const settle = (): Promise<void> => new Promise((done) => setTimeout(done));

  beforeEach(() => {
    user.set({ locale: 'en' });
    preferences.set(ACCOUNT);
    saves = [];
    auth.savePreferences.mockClear();
    TestBed.configureTestingModule({ providers: [provideTestTranslations({}, { language: 'sk' }), { provide: AuthService, useValue: auth }] });
  });

  it('saves the language a signed-in person chose - only that, through the SDK', async () => {
    service().saveToAccount('sk');
    expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }]);
    saves[0].accept();
    await settle();
    expect(user()?.locale).toBe('sk');
    expect(service().languageNotSaved()).toBe(false);
  });

  it('saves nothing when the account says it already, for a visitor, or while the IAM keeps no preferences (before its 015)', async () => {
    user.set({ locale: 'sk' });
    service().saveToAccount('sk');
    preferences.set(null);
    service().saveToAccount('en');
    user.set(null);
    service().saveToAccount('en');
    service().saveToAccount('not a code');
    await settle();
    expect(auth.savePreferences).not.toHaveBeenCalled();
  });

  it('one save at a time, the latest choice last - and none when the account has it by then', async () => {
    service().saveToAccount('sk');
    service().saveToAccount('en');
    service().saveToAccount('de');
    service().saveToAccount('en');
    expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }]);

    // The first answer: only the latest choice waiting (en) is saved, so it is the account's last word.
    saves[0].accept();
    await settle();
    expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }, { language: 'en' }]);
    saves[1].accept();
    await settle();
    expect(user()?.locale).toBe('en');

    // Back to the account's own language while a save is on its way: when it settles, nothing more to save.
    service().saveToAccount('sk');
    service().saveToAccount('en');
    saves[2].refuse('network');
    await settle();
    expect(saves).toHaveLength(3);
    expect(service().languageNotSaved()).toBe(false);
  });

  it('keeps a language the IAM does not offer as this site’s own, silently', async () => {
    service().saveToAccount('cs');
    saves[0].refuse('invalid_request');
    await settle();
    expect(service().languageNotSaved()).toBe(false);
    expect(service().language()).toBe('sk');
  });

  it('says any other refusal - until the next choice - and a refusal a later choice overtook is no news', async () => {
    service().saveToAccount('sk');
    saves[0].refuse('temporarily_unavailable');
    await settle();
    expect(service().languageNotSaved()).toBe(true);

    service().saveToAccount('sk');
    expect(service().languageNotSaved()).toBe(false);
    service().saveToAccount('de');
    saves[1].refuse('network');
    await settle();
    expect(service().languageNotSaved()).toBe(false);
    expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }, { language: 'sk' }, { language: 'de' }]);
    saves[2].refuse('invalid_token');
    await settle();
    expect(service().languageNotSaved()).toBe(true);
  });
});
