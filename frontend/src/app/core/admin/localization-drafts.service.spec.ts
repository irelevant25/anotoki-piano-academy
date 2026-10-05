import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { LOCALIZATION_DRAFTS_KEY, LanguageDraft, LocalizationDrafts } from './localization-drafts.service';

/** Two people as AuthService.userKey() names them under the IAM: by their id. */
const ANNA = '1';
const BEN = '2';
/** The one fixed owner of the owner's own computer, where nobody signs in. */
const LOCAL = 'local';

const STRINGS = { 'home.title': { sk: 'Povedz nám svoj názor' }, 'common.close': { en: 'Shut', sk: 'Zatvoriť' } };
const CZECH: LanguageDraft = { name: 'Czech', nativeName: 'Česky', sortOrder: '7' };

describe('LocalizationDrafts', () => {
  let person: string | null = ANNA;
  const listeners = new Set<() => void>();
  /** As the sign-in tells it: in this tab or another, signed in, out, or as somebody else. */
  const signedInAs = (who: string | null) => {
    person = who;
    listeners.forEach((listener) => listener());
  };

  /** The service as a page load makes it: new, with whatever the tab has kept. */
  function load(): LocalizationDrafts {
    TestBed.resetTestingModule();
    listeners.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { userKey: () => person, signedIn: () => person !== null, onAuthChange: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)) } }],
    });
    return TestBed.inject(LocalizationDrafts);
  }

  const stored = () => sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY);
  /** What the tab keeps is written when the page next draws: here, now. */
  const drawn = () => TestBed.tick();

  function closing(): Event {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    sessionStorage.clear();
    person = ANNA;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('counts the changed cells and the changed rows', () => {
    const drafts = load();
    expect(drafts.count()).toBe(0);

    drafts.strings.set(STRINGS);
    expect(drafts.count()).toBe(3);

    drafts.languages.set({ cs: CZECH });
    expect(drafts.count()).toBe(4);

    drafts.clear();
    expect(drafts.count()).toBe(0);
    expect(drafts.strings()).toEqual({});
    expect(drafts.languages()).toEqual({});
  });

  it('keeps them under a name of this app', () => {
    expect(LOCALIZATION_DRAFTS_KEY).toBe('piano-academy:localization-drafts');
  });

  describe('whose they are', () => {
    it('keeps them through a sign-out - the session ending, another tab, this one - and for the same person signing in again', () => {
      const drafts = load();
      drafts.strings.set(STRINGS);
      drafts.languages.set({ cs: CZECH });

      signedInAs(null);
      expect(drafts.strings()).toEqual(STRINGS);
      expect(drafts.languages()).toEqual({ cs: CZECH });

      signedInAs(ANNA);
      expect(drafts.count()).toBe(4);
    });

    it('lets go of them only when somebody else signs in', () => {
      const drafts = load();
      drafts.strings.set(STRINGS);
      drafts.languages.set({ cs: CZECH });
      drawn();
      expect(stored()).not.toBeNull();

      signedInAs(null);
      signedInAs(BEN);
      expect(drafts.count()).toBe(0);
      drawn();
      expect(stored()).toBeNull();

      // And what Ben types is Ben's: Anna coming back does not get it.
      drafts.strings.set({ 'home.title': { sk: 'Benov názor' } });
      signedInAs(ANNA);
      expect(drafts.strings()).toEqual({});
    });

    it('takes the first person to sign in as the owner, with nothing to let go of', () => {
      person = null;
      const drafts = load();

      signedInAs(ANNA);
      drafts.strings.set(STRINGS);
      drawn();

      expect(JSON.parse(stored()!).owner).toBe('1');
      signedInAs(BEN);
      expect(drafts.count()).toBe(0);
    });

    it("has one fixed owner on the owner's own computer, where nobody signs in: kept from page load to page load", () => {
      person = LOCAL;
      const before = load();
      before.strings.set(STRINGS);
      before.languages.set({ cs: CZECH });
      drawn();
      expect(JSON.parse(stored()!)).toEqual({ owner: 'local', strings: STRINGS, languages: { cs: CZECH } });

      const after = load();
      expect(after.strings()).toEqual(STRINGS);
      expect(after.languages()).toEqual({ cs: CZECH });

      // The same browser tab pointed at the hosted app's sign-in would be somebody else: none of it is theirs.
      person = ANNA;
      expect(load().count()).toBe(0);
      expect(stored()).toBeNull();
    });
  });

  describe('kept for the tab', () => {
    it('mirrors them to sessionStorage with their owner, and takes them away from there when there are none', () => {
      const drafts = load();
      drawn();
      expect(stored()).toBeNull();

      drafts.strings.set(STRINGS);
      drafts.languages.set({ cs: CZECH });
      drawn();
      expect(JSON.parse(stored()!)).toEqual({ owner: '1', strings: STRINGS, languages: { cs: CZECH } });

      // Typed back, one by one, to what is saved: none left.
      drafts.strings.set({});
      drafts.languages.set({});
      drawn();
      expect(stored()).toBeNull();
    });

    it('takes them out of the tab the moment they are given up - the page may be left before it draws again', () => {
      const drafts = load();
      drafts.strings.set(STRINGS);
      drawn();
      expect(stored()).not.toBeNull();

      drafts.clear();

      expect(stored()).toBeNull();
      // So whoever loads the page next - the same person, signed in again - starts with none.
      expect(load().count()).toBe(0);
    });

    it('finds them again after the round trip to the sign-in: a new page load, the same person', () => {
      const before = load();
      before.strings.set(STRINGS);
      before.languages.set({ cs: CZECH });
      drawn();

      const after = load();
      expect(after).not.toBe(before);
      expect(after.strings()).toEqual(STRINGS);
      expect(after.languages()).toEqual({ cs: CZECH });
      expect(after.count()).toBe(4);
    });

    it('keeps them while nobody is signed in - the page loaded again after the session ended - for the person who comes back', () => {
      const before = load();
      before.strings.set(STRINGS);
      drawn();

      person = null;
      const signedOut = load();
      expect(signedOut.strings()).toEqual(STRINGS);
      drawn();
      expect(JSON.parse(stored()!).owner).toBe('1');

      signedInAs(ANNA);
      expect(signedOut.strings()).toEqual(STRINGS);

      // Somebody else coming instead gets none of it.
      person = null;
      const again = load();
      expect(again.strings()).toEqual(STRINGS);
      signedInAs(BEN);
      expect(again.strings()).toEqual({});
    });

    it("gives nobody another person's: a page load as somebody else starts with none, and what was kept is removed", () => {
      const before = load();
      before.strings.set(STRINGS);
      drawn();

      person = BEN;
      const after = load();
      expect(after.count()).toBe(0);
      expect(stored()).toBeNull();
    });

    it.each([
      ['not JSON', '{"owner": "1", "strings": {'],
      ['a text', '"drafts"'],
      ['null', 'null'],
      ['a list', '[]'],
      ['no owner', JSON.stringify({ strings: STRINGS, languages: {} })],
      ['an owner that is not a text', JSON.stringify({ owner: 1, strings: STRINGS, languages: {} })],
      ['an empty owner', JSON.stringify({ owner: '', strings: STRINGS, languages: {} })],
      ['no strings', JSON.stringify({ owner: '1', languages: {} })],
      ['strings that are a list', JSON.stringify({ owner: '1', strings: [], languages: {} })],
      ['a key whose cells are a text', JSON.stringify({ owner: '1', strings: { 'home.title': 'Názor' }, languages: {} })],
      ['a cell that is not a text', JSON.stringify({ owner: '1', strings: { 'home.title': { sk: 7 } }, languages: {} })],
      ['no languages', JSON.stringify({ owner: '1', strings: STRINGS })],
      ['a language that is a text', JSON.stringify({ owner: '1', strings: {}, languages: { cs: 'Czech' } })],
      ['a language without its order', JSON.stringify({ owner: '1', strings: {}, languages: { cs: { name: 'Czech', nativeName: 'Česky' } } })],
      ['an order that is a number', JSON.stringify({ owner: '1', strings: {}, languages: { cs: { name: 'Czech', nativeName: 'Česky', sortOrder: 7 } } })],
    ])('takes a broken value for no drafts, and removes it: %s', (_, value) => {
      sessionStorage.setItem(LOCALIZATION_DRAFTS_KEY, value);

      const drafts = load();

      expect(drafts.count()).toBe(0);
      expect(drafts.strings()).toEqual({});
      expect(drafts.languages()).toEqual({});
      expect(stored()).toBeNull();
    });

    it('reads a key named like something every object has as a key and nothing more', () => {
      sessionStorage.setItem(LOCALIZATION_DRAFTS_KEY, '{"owner": "1", "strings": {"__proto__": {"sk": "x"}}, "languages": {}}');

      const drafts = load();

      expect(Object.keys(drafts.strings())).toEqual(['__proto__']);
      expect(drafts.count()).toBe(1);
      expect(({} as Record<string, unknown>)['sk']).toBeUndefined();
    });

    it('works in memory when the tab keeps nothing: storage that refuses to be read or written breaks no page', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });

      const drafts = load();
      drafts.strings.set(STRINGS);
      expect(() => drawn()).not.toThrow();
      expect(drafts.count()).toBe(3);

      signedInAs(null);
      expect(drafts.strings()).toEqual(STRINGS);
      expect(() => drafts.clear()).not.toThrow();
      expect(() => drawn()).not.toThrow();
    });
  });

  describe('closing the tab', () => {
    it('has the browser ask while something is not saved - whichever page is showing - and not otherwise', () => {
      const drafts = load();
      expect(closing().defaultPrevented).toBe(false);

      drafts.languages.set({ cs: CZECH });
      expect(closing().defaultPrevented).toBe(true);

      drafts.clear();
      drafts.strings.set({ 'home.title': { sk: 'Názor' } });
      expect(closing().defaultPrevented).toBe(true);

      drafts.clear();
      expect(closing().defaultPrevented).toBe(false);
    });

    it('asks on the owner\'s own computer too, where nobody signs in', () => {
      person = LOCAL;
      const drafts = load();
      expect(closing().defaultPrevented).toBe(false);

      drafts.strings.set({ 'home.title': { sk: 'Názor' } });
      expect(closing().defaultPrevented).toBe(true);
    });

    it('keeps what was typed that very moment: the way to the sign-in is an unload too', () => {
      const drafts = load();
      drafts.strings.set(STRINGS);
      // Not drawn since: nothing is in the tab's storage yet.
      expect(stored()).toBeNull();

      closing();
      expect(JSON.parse(stored()!).strings).toEqual(STRINGS);

      // A page that goes without asking (a phone's browser) says so too.
      drafts.strings.set({ 'home.title': { sk: 'Názor' } });
      window.dispatchEvent(new Event('pagehide'));
      expect(JSON.parse(stored()!).strings).toEqual({ 'home.title': { sk: 'Názor' } });
    });

    it('listens once, and no longer than it lives', () => {
      const first = load();
      first.strings.set(STRINGS);
      sessionStorage.clear();

      // A new page load, as somebody with nothing typed: the one before asks nothing any more.
      person = BEN;
      load();

      expect(closing().defaultPrevented).toBe(false);
    });

    it('asks nothing on the way to the sign-in, signed out, when the drafts are kept for the way back - and asks where they could not be kept', () => {
      const drafts = load();
      drafts.strings.set(STRINGS);
      signedInAs(null);

      // The page is the sign-in card, and the way on is a page load to the IAM and back, which the drafts survive.
      expect(closing().defaultPrevented).toBe(false);
      expect(JSON.parse(stored()!).strings).toEqual(STRINGS);

      // Signed in, an unload is no way to the sign-in: closing the tab would lose them, and it is asked.
      signedInAs(ANNA);
      expect(closing().defaultPrevented).toBe(true);

      // Signed out where the tab's storage refuses the write: the drafts are in memory only, and the page load loses them.
      signedInAs(null);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      });
      expect(closing().defaultPrevented).toBe(true);
    });
  });
});
