import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { readStorage, writeStorage } from '../util/storage';
import { KEPT_ENGLISH } from './kept-english';
import { SiteLanguage, TranslationBundle } from './translation.model';

/** What everything falls back to: the server merges English underneath every bundle. */
export const FALLBACK_LANGUAGE = 'en';

/**
 * The chooser's choice (localStorage) and the `?lang=` of this tab
 * (sessionStorage): the same name in two stores with two lifetimes.
 */
const LANGUAGE_KEY = 'piano-academy:language';
/** The last bundle, so a returning learner is not shown keys while the request is out. */
const CACHE_KEY = 'piano-academy:language-cache';

/** A language code as the database keeps it - the same expression as languageCodeOk() in PHP. */
const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/;
/** A placeholder in a string - the same expression as the server's check. */
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * At the browser step only: a language nobody offers that reads another far
 * more easily than English. Czech readers read Slovak. An exact match always
 * wins - this counts only while no `cs` language is on offer.
 */
const BROWSER_ALIASES: Record<string, string> = { cs: 'sk' };

/** What `Intl` is given: British English writes dates the way the rest of Europe reads them. */
const LOCALES: Record<string, string> = { en: 'en-GB', sk: 'sk-SK' };

/** How long a start with a cached bundle waits for the fresh one (a 304, usually). */
export const CACHE_WAIT_MS = 1000;
/** How long a start with no cache waits before it asks a second, last time for a bundle that did not come. */
export const RETRY_WAIT_MS = 500;

/** What fills a string's {placeholders}. */
export type TranslationParams = Record<string, string | number | null | undefined>;

/** A sentence cut at one placeholder: what stands before it, what stands after, and whether the cut was made. */
export type TranslationCut = [before: string, after: string, found: boolean];

/** A language somebody may want, and whether it is the browser that said so (only there do aliases count). */
export interface LanguageCandidate {
  code: string;
  browser: boolean;
}

/** Where a wish for a language can come from, strongest first. */
export interface LanguageSources {
  /** `?lang=`, kept for this tab. */
  tab?: string | null;
  /** What the chooser remembered on this device - or, while the account's language outranks that (`stored`), only what was chosen on this page. */
  chosen?: string | null;
  /** The `locale` claim of the IAM's token. */
  token?: string | null;
  /** What the chooser remembered on this device, after the account's language: for an account that sends its preferences. */
  stored?: string | null;
  /** `navigator.languages`. */
  browser?: readonly (string | null | undefined)[];
}

/** The code, lower-cased, when it has the shape of one - anything else is nothing: never stored, never sent. */
export function languageCode(raw: unknown): string | null {
  const code = typeof raw === 'string' ? raw.toLowerCase() : '';
  return LANGUAGE_CODE.test(code) ? code : null;
}

/**
 * Every language the learner may want, in order: `?lang=` / this tab, the
 * chooser's choice, the token's `locale`, the device's remembered choice when
 * it comes after the account's (`stored`), each browser tag and then its
 * first subtag (`sk-SK` also asks for `sk`), and English.
 */
export function languageCandidates(sources: LanguageSources): LanguageCandidate[] {
  const candidates: LanguageCandidate[] = [];
  const add = (raw: unknown, browser: boolean): void => {
    const code = languageCode(raw);
    if (code && !candidates.some((candidate) => candidate.code === code && candidate.browser === browser)) {
      candidates.push({ code, browser });
    }
  };
  add(sources.tab, false);
  add(sources.chosen, false);
  add(sources.token, false);
  add(sources.stored, false);
  for (const tag of sources.browser ?? []) {
    add(tag, true);
    add(typeof tag === 'string' ? tag.split('-')[0] : null, true);
  }
  add(FALLBACK_LANGUAGE, false);
  return candidates;
}

/** The first candidate that is on offer - or, for a browser's wish, whose alias is - else English. */
export function pickLanguage(candidates: readonly LanguageCandidate[], offered: readonly string[]): string {
  for (const candidate of candidates) {
    if (offered.includes(candidate.code)) {
      return candidate.code;
    }
    if (candidate.browser && Object.hasOwn(BROWSER_ALIASES, candidate.code) && offered.includes(BROWSER_ALIASES[candidate.code])) {
      return BROWSER_ALIASES[candidate.code];
    }
  }
  return FALLBACK_LANGUAGE;
}

/**
 * The app's own words: which language the pages are read in, and the strings
 * for it. They live in the database (the owner edits them in the browser) and
 * arrive as one bundle - GET /api/translations/{code}, asked for with
 * HttpClient directly: ApiService refuses every call until the progress is
 * loaded, and the strings are needed before that, on the sign-in card too.
 *
 * A key with no string comes back as itself, on the page, and warns once: the
 * owner wants to see which key is missing. The one exception is the time
 * while no bundle is in memory at all - the app is not set up, the backend is
 * down, a migration is pending - and the shell is drawn all the same: then,
 * and only then, a key is answered from the English kept in code
 * (kept-english.ts).
 *
 * The admin panel (/admin) is English whatever the learner chose: while the
 * address is there, `effectiveLanguage` is English and every string comes
 * from English's own (the bundle's `english`) - so what both areas share,
 * the top bar first, reads English there with no case of its own. The
 * learner's choice stays as it was, for the way back.
 *
 * Which language, strongest first: `?lang=` of this tab, the chooser's
 * choice, the IAM token's `locale`, the browser's languages, English. A
 * person whose anotoki account sends its preferences (the IAM's migration
 * 015; the family's decision of 2026-10-06) reads the account's language over
 * what this device remembered: only `?lang=` and a choice made on this page
 * come before it, a change of it made elsewhere is followed when it comes
 * (_watchToken()), and the chooser saves their choice to the account
 * (setLanguage() -> saveToAccount()), so the IAM and every anotoki site follow
 * it. A visitor - and anybody signed in through an IAM that sends no
 * preferences - keeps the device's choice first, as before.
 *
 * Keys are never built from the address, from the IAM's answer, from a stored
 * session or from anything a person typed - run-time keys come from closed
 * sets (dynamic-keys.ts). And state holds keys, kinds and params, never a
 * worded sentence: wording happens in a template (the pipes) or inside a
 * computed() / effect() that calls t(), which reads signals and so runs again
 * when the language changes. Nothing worded is awaited in a MIDI handler.
 *
 * Note names, song titles, device names and the other terms of the app are
 * never translated: they go into a sentence as a {placeholder}.
 *
 * This service never injects the Router: the Router builds the title strategy,
 * the strategy needs this service, and asking for the Router here would close
 * the circle (NG0200 at start-up). The strategy says when a navigation has
 * ended instead - navigated(). Nor does it inject BootService, which starts it.
 *
 * Every load - the start, a choice, reload(), asking again - takes the next
 * turn, and an answer is used only while its turn is still the last one: the
 * load begun last wins, however late an earlier answer comes.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly _http = inject(HttpClient);
  private readonly _auth = inject(AuthService);
  private readonly _document = inject(DOCUMENT);

  private readonly _language = signal(FALLBACK_LANGUAGE);
  private readonly _languages = signal<SiteLanguage[]>([]);
  /** The chosen language's strings, English merged underneath. Null: no bundle yet. Maps, so `has('constructor')` is false. */
  private readonly _values = signal<ReadonlyMap<string, string> | null>(null);
  /** English's own strings - what the admin panel reads. Null with no bundle, or a cached one from before it was kept. */
  private readonly _english = signal<ReadonlyMap<string, string> | null>(null);
  private readonly _inAdmin = signal(false);

  /**
   * The language on the page. A plain signal: it changes only once the bundle
   * of that language is in memory (init(), setLanguage()), never by itself
   * when a token or the address changes - a page is never in a language it has
   * no strings for. English while there is no bundle: that is what the kept
   * strings are in.
   */
  readonly language = this._language.asReadonly();
  /** The languages on offer, in the order the owner set. Empty while there is no bundle. */
  readonly languages = this._languages.asReadonly();
  /** A bundle is in memory - from the cache or from the server. */
  readonly ready = computed(() => this._values() !== null);
  /** The address is in the admin panel (/admin), which is English. */
  readonly inAdmin = this._inAdmin.asReadonly();
  /** The language actually on the page: English in the admin panel, the learner's everywhere else. */
  readonly effectiveLanguage = computed(() => (this._inAdmin() ? FALLBACK_LANGUAGE : this._language()));
  /** What `Intl` is given for dates in the language on the page. */
  readonly locale = computed(() => {
    const code = this.effectiveLanguage();
    return Object.hasOwn(LOCALES, code) ? LOCALES[code] : code;
  });

  /**
   * The account would not take the language last chosen here (saveToAccount()),
   * for another reason than not offering it: the chooser says so under its
   * button until the next press, or a click anywhere else. The page stays in
   * the language chosen.
   */
  readonly languageNotSaved = signal(false);

  /** Keys already complained about, so one missing string is one warning. */
  private readonly _warned = new Set<string>();
  /** Counts the loads begun: an answer that arrives after a later load began is dropped. */
  private _turn = 0;
  /** The loads still out. While there is one, nothing asks again: never two in flight for the same thing. */
  private _out = 0;
  /** init() has decided the language at least once: only then is there something to ask again for. */
  private _started = false;
  /**
   * The last init() was allowed to ask the server. False while the app could
   * not even read its sign-in settings (not set up, the backend out of reach):
   * then nothing is asked, at a navigation neither. Set false as well once
   * the server has answered that it is not set up (a migration is pending):
   * the app shows its "not set up yet" card, and after the setup the page is
   * loaded again - asking at the first page's navigation would only have
   * made a third request of a first visit. True again with reload(): an
   * ADMIN's Apply on the Migrations page starts the app without a page load
   * (BootService.resumeAfterUpdate()), and from then on the server is asked.
   */
  private _asking = false;
  /**
   * What is in force came from the server since this page was loaded. False
   * with no bundle at all, and with the cached one whose refresh has not come
   * (or failed): then the next navigation asks again.
   */
  private _fresh = false;
  /**
   * The two wishes that are kept in storage, held here as well for as long as
   * the page lives: `?lang=` of this tab, and what the chooser was told. A
   * browser whose storage refuses writes still gets both, until it reloads.
   */
  private _tab: string | null = null;
  private _chosen: string | null = null;
  /** The token's `locale` as last seen: only a changed one is adopted. */
  private _seenLocale: string | null = null;
  private _watching = false;
  /** A language save to the account is on its way. */
  private _savingLanguage = false;
  /** The latest language chosen while it is: saved once it settles. */
  private _nextLanguage: string | null = null;

  constructor() {
    // Honest for a screen reader: <html lang> is the language the strings on the page are in - English in the admin panel.
    effect(() => {
      this._document.documentElement.lang = this.effectiveLanguage();
    });
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /**
   * The string for a key in the language on the page, its {placeholders}
   * filled in one pass: a parameter's own text is never scanned again, and a
   * placeholder with no parameter stays as written.
   *
   * An unknown key comes back as itself - on purpose visible - and warns once.
   * Only while no bundle is in memory is the English kept in code answered.
   */
  t(key: string, params?: TranslationParams): string {
    const value = this._string(key);
    return value === undefined ? this._missing(key) : fill(value, params);
  }

  /**
   * One of a plural family - `key.one`, `key.few`, `key.other` - by the rules
   * of the language on the page (Slovak: 1 -> one, 2-4 -> few, 0 and 5+ ->
   * other). Inside a family the number is always `{count}`, whatever the code
   * calls it; it is written as it is (the app's numbers are whole).
   */
  plural(key: string, count: number, params?: TranslationParams): string {
    return this.t(this._form(key, count), { ...params, count });
  }

  /**
   * A sentence cut at one placeholder, for markup inside it:
   * `{{ before }}<strong>{{ title }}</strong>{{ after }}`. The stored string
   * is cut first and each half filled after, so nothing a parameter holds can
   * move the cut.
   *
   * The third answer says whether the cut was made. It is not when the key
   * has no string, and not when the string leaves the placeholder out - which
   * a language other than English may: then the whole sentence (or the key)
   * is the first half, and the page must not draw the marked-up value at all,
   * or it would be glued onto a sentence that does not name it.
   */
  around(key: string, placeholder: string, params?: TranslationParams): TranslationCut {
    return this._cut(key, placeholder, params);
  }

  /**
   * around() for a plural family: the form plural() would choose for the
   * number, cut at the placeholder - for a number drawn in markup inside a
   * plural sentence (`aroundPlural('home.due', n, 'count')` around a
   * `<strong>`). The halves are filled as plural() fills them, `{count}` too.
   */
  aroundPlural(key: string, count: number, placeholder: string, params?: TranslationParams): TranslationCut {
    return this._cut(this._form(key, count), placeholder, { ...params, count });
  }

  /** Whether t() has a string to answer for a key - in the bundle, or, while there is none, in the kept English. */
  has(key: string): boolean {
    return this._string(key) !== undefined;
  }

  /**
   * The string as stored: the bundle's when one is in memory - and then
   * nothing else; the kept English only while there is none.
   */
  private _string(key: string): string | undefined {
    // The admin panel reads English; a cached bundle from before English was kept beside it has only its own.
    const strings = this._inAdmin() ? (this._english() ?? this._values()) : this._values();
    const value = strings?.get(key);
    return value !== undefined ? value : !this.ready() && Object.hasOwn(KEPT_ENGLISH, key) ? KEPT_ENGLISH[key] : undefined;
  }

  /** The key of the family's form for a number; the family's `.other` when the language's form has no string. */
  private _form(key: string, count: number): string {
    const form = `${key}.${pluralRules(this.effectiveLanguage()).select(count)}`;
    return this._string(form) !== undefined ? form : `${key}.other`;
  }

  private _cut(key: string, placeholder: string, params?: TranslationParams): TranslationCut {
    const value = this._string(key);
    if (value === undefined) {
      return [this._missing(key), '', false];
    }
    const mark = `{${placeholder}}`;
    const at = value.indexOf(mark);
    return at < 0 ? [fill(value, params), '', false] : [fill(value.slice(0, at), params), fill(value.slice(at + mark.length), params), true];
  }

  // ── Choosing ───────────────────────────────────────────────────────────────

  /**
   * The chooser's choice: loads that language's bundle, then switches and
   * remembers it - for this page, and on this device - and, for a person whose
   * account sends its preferences, saves it to the account too
   * (saveToAccount(), in the same breath: a change of the account's language
   * arriving meanwhile must find the save on its way). Never rejects - false
   * when the strings could not be had, and the page stays as it is.
   *
   * `remember: false` is for a language that was not chosen here (the token's
   * `locale`): used, not stored - only the chooser writes the choice.
   *
   * The last choice wins: a choice takes its turn even when it needs no
   * request (the language already on the page), so a slower, earlier choice
   * still on its way is dropped when it comes - and that one answers false.
   * Only a choice that won is saved.
   */
  async setLanguage(code: string, remember = true): Promise<boolean> {
    const wanted = languageCode(code);
    if (!wanted) {
      return false;
    }
    const turn = ++this._turn;
    if (wanted !== this._language() || !this.ready()) {
      const bundle = await this._counted(this._request(wanted));
      if (turn !== this._turn) {
        return false;
      }
      if (!bundle || bundle.language !== wanted) {
        // Switched off a moment ago: the server answered in English. The page
        // stays in its language; the chooser stops offering the one that went.
        if (bundle?.languages.some((language) => language.code === this._language())) {
          this._languages.set(bundle.languages);
        }
        return false;
      }
      this._use(bundle);
    }
    if (remember) {
      // In memory too: storage may refuse the write, and the choice must hold for this page all the same.
      this._chosen = wanted;
      writeStorage(LANGUAGE_KEY, wanted);
      // A choice made here is stronger than the `?lang=` this tab came with.
      this._tab = null;
      writeTab(LANGUAGE_KEY, null);
      this.saveToAccount(wanted);
    }
    return true;
  }

  /**
   * The chooser's choice, for somebody signed in, is the account's language
   * too (the owner's decision of 2026-10-06): saved with the SDK's
   * savePreferences({ language }) - the IAM's mails, its pages and every
   * anotoki site read it, this one at the next visit too. Only while the IAM
   * keeps the account's preferences (AuthService.preferences: its migration
   * 015), and only when the account does not say this language already; a
   * visitor's choice stays this device's. setLanguage() calls it for a choice
   * that switched the page; the chooser calls it itself for a choice of the
   * language already on the page, which the account may not have yet.
   *
   * One save at a time, and the last choice is the one saved: two saves on
   * their way together could be answered in either order and leave the
   * account on a language the page no longer shows. A choice made while a
   * save is on its way waits for it - only the latest such choice, and only
   * if the account does not have it by then.
   *
   * The page has switched already, and stays in the chosen language for the
   * visit whatever the account answers (a choice made on this page comes
   * before the account's language): a language the IAM does not offer (400
   * invalid_request) is this site's own, and nothing is said; any other
   * refusal - the IAM out of reach, the sign-in ended, the account no longer
   * let into Piano Academy (access_denied) - is said under the chooser
   * (languageNotSaved), unless a later choice is already on its way, which
   * makes it old news.
   */
  saveToAccount(code: string): void {
    this.languageNotSaved.set(false);
    if (this._savingLanguage) {
      this._nextLanguage = code;
      return;
    }
    this._saveLanguage(code);
  }

  /**
   * Somebody is signed in and the IAM sends how their account says every
   * anotoki site should look (its migration 015): the account's language then
   * outranks what this device remembered, a change of it is followed, and the
   * chooser saves to it.
   */
  private _accountDecides(): boolean {
    return this._auth.preferences() !== null;
  }

  private _saveLanguage(code: string): void {
    const wanted = languageCode(code);
    if (!wanted || !this._accountDecides() || this._tokenLocale() === wanted) {
      return;
    }
    this._savingLanguage = true;
    /** The save is over: the next choice, if one waits, is saved now - and then this one's refusal is not news. */
    const settle = (): boolean => {
      const next = this._nextLanguage;
      this._savingLanguage = false;
      this._nextLanguage = null;
      if (next !== null) {
        this._saveLanguage(next);
      }
      return next !== null;
    };
    this._auth.savePreferences({ language: wanted }).then(
      () => {
        settle();
      },
      (error: unknown) => {
        if (!settle() && (error as { code?: unknown } | null)?.code !== 'invalid_request') {
          this.languageNotSaved.set(true);
        }
      },
    );
  }

  /**
   * The strings again, from the server: for whoever has just changed them, or
   * the languages on offer (the admin panel's Translations and Languages
   * pages, after a save), and for an app just started in place after the
   * pending migrations were applied (BootService.resumeAfterUpdate(): the
   * start's request got 503, so there is no bundle, or the cached one from
   * before the update). Asks for the bundle of the language on the page and
   * settles against the list that comes with it - so a language hidden or
   * offered a moment ago is followed - then puts the answer in force and in
   * the cache. Never rejects; when the server cannot be had, the page stays
   * as it is - and, being known to be behind, asks again at the next
   * navigation (after a 503 at the start too: reload() asks on purpose).
   *
   * Not init(): that one is the start - it takes `?lang=` out of the address
   * and starts from the cache.
   */
  async reload(): Promise<void> {
    try {
      // What is in memory is no longer known to be what the server has.
      this._fresh = false;
      // Asked on purpose: a 503 at the start (a migration was pending) no longer stops the navigations' asking.
      this._asking = true;
      await this._again();
    } catch (error) {
      console.error('[i18n] the strings could not be read again', error);
    }
  }

  /**
   * Said by the title strategy after every navigation - which is when a page
   * that started without its strings asks for them once more: while no bundle
   * is in memory (the first request failed - the page is in the kept English,
   * or in keys), or while the cached one is in force because its refresh
   * failed. One load a navigation, and none while another is out - so such a
   * page heals by itself at the next click, and a server that stays down is
   * asked no more often than somebody clicks. Nothing is asked where the start
   * itself asked nothing (init(false)).
   *
   * `url`, the address navigated to, says whether the page is in the admin
   * panel (English).
   */
  navigated(url?: string): void {
    if (url !== undefined) {
      const path = url.split(/[?#]/)[0];
      this._inAdmin.set(path === '/admin' || path.startsWith('/admin/'));
    }
    if (this._started && this._asking && !this._fresh && this._out === 0) {
      void this._again().catch((error: unknown) => console.error('[i18n] the strings could not be asked for again', error));
    }
  }

  // ── Starting ───────────────────────────────────────────────────────────────

  /**
   * Once as the app starts (BootService.start()): decides the language and
   * gets its strings before the first page is drawn. Never rejects, and may be
   * called again.
   *
   * `request: false` is the start that could not read its sign-in settings
   * (the app is not set up, or the backend is out of reach): nothing is asked
   * for. The cached bundle is taken when there is one - in whatever language
   * it is in - and the shell words itself from the kept English otherwise.
   *
   * `request: true`, after the sign-in (which, back from the IAM, has put the
   * address back) and before anybody is asked to sign in - the sign-in card
   * has its strings. A bundle that does not come (503 while a migration is
   * pending, the network) is "no bundle", and the start goes on.
   */
  async init(request: boolean): Promise<void> {
    try {
      await this._start(request);
    } catch (error) {
      console.error('[i18n] the language could not be set up', error);
    }
  }

  private async _start(request: boolean): Promise<void> {
    this._takeAddressLanguage();
    this._watchToken();
    this._started = true;
    this._asking = request;

    // Whether the server is asked decides what a cache is worth. While it is
    // not, nobody is signed in and nothing can be settled: the language the
    // cache is in is the best there is - a learner whose language comes from
    // the token would otherwise lose the strings exactly when they are all
    // there is.
    const candidates = this._candidates();
    const cached = this._cachedBundle(candidates, request);
    if (cached) {
      this._use(cached, false);
    }
    if (!request) {
      return;
    }

    const turn = ++this._turn;
    const first = cached ? cached.language : candidates[0].code;
    if (cached) {
      // With a cache the page may start from it, but not at once: a release adds
      // strings, and a returning learner would see their keys. The fresh bundle is
      // a 304 most of the time - worth a second's wait; it replaces the cache
      // whenever it comes.
      await Promise.race([this._counted(this._refresh(turn, candidates, first)), wait(CACHE_WAIT_MS)]);
      return;
    }
    await this._counted(this._firstLoad(turn, candidates, first));
  }

  /**
   * The start with no cache: the page waits for its strings, and a request
   * that fails is made once more after a moment - one lost answer should not
   * leave a first visit without its strings. After that the page is drawn as
   * it is, and asks again at each navigation (navigated()).
   */
  private async _firstLoad(turn: number, candidates: readonly LanguageCandidate[], first: string): Promise<void> {
    if ((await this._refresh(turn, candidates, first)) || turn !== this._turn) {
      return;
    }
    await wait(RETRY_WAIT_MS);
    if (turn === this._turn) {
      await this._refresh(turn, candidates, first);
    }
  }

  /**
   * The strings once more, for the wishes as they are now: what reload() does,
   * and what a navigation does for a page that has none from the server. It
   * asks first for the language in force - its bundle names the languages on
   * offer now - and takes the next turn, so it is the load that counts.
   */
  private _again(): Promise<boolean> {
    const turn = ++this._turn;
    const candidates = this._candidates();
    return this._counted(this._refresh(turn, candidates, this.ready() ? this._language() : candidates[0].code));
  }

  /**
   * One load, put in force when it came and is still the last one begun.
   * False: the server could not be had - or a later load has taken over.
   */
  private async _refresh(turn: number, candidates: readonly LanguageCandidate[], first: string): Promise<boolean> {
    const bundle = await this._load(candidates, first);
    if (!bundle || turn !== this._turn) {
      return false;
    }
    this._use(bundle);
    return true;
  }

  /** Counted while it is out, whichever way it ends. */
  private async _counted<T>(work: Promise<T>): Promise<T> {
    this._out++;
    try {
      return await work;
    } finally {
      this._out--;
    }
  }

  /**
   * The bundle for the language the candidates settle on. The list of offered
   * languages arrives with the bundle itself, so: ask for `first`, settle
   * against the list that came - whatever answered - and fetch that bundle if
   * it is another language than the one in hand. One request when `first` is
   * what the wishes settle on (the usual case: the server answers a regional
   * code like `sk-sk` with its base language); two at most - on a first visit
   * whose first wish is not on offer, or when the offered languages have
   * changed since the cached bundle was made (a language hidden, offered
   * again, or added: the learner is moved to it now, not one visit late).
   *
   * When the second request fails the first answer is what there is: a page in
   * English rather than in keys.
   */
  private async _load(candidates: readonly LanguageCandidate[], first: string): Promise<TranslationBundle | null> {
    const answer = await this._request(first);
    if (!answer) {
      return null;
    }
    const settled = pickLanguage(
      candidates,
      answer.languages.map((language) => language.code),
    );
    return settled === answer.language ? answer : ((await this._request(settled)) ?? answer);
  }

  /** One bundle from the server, checked - or null: out of reach, or not what a bundle is. */
  private async _request(code: string): Promise<TranslationBundle | null> {
    try {
      return bundleFrom(await this.fetchBundle(code));
    } catch (error) {
      // Offline, the API is down, or its database waits for a migration (503).
      // The cache - or the kept English - is what the page shows then; it is
      // not worth stopping the app over.
      if (notSetUp(error)) {
        this._asking = false;
      }
      return null;
    }
  }

  /**
   * GET /api/translations/{code} - with HttpClient directly, never through
   * ApiService; the interceptor lets it through untouched (no token, no
   * waiting for one). On its own so the tests' stand-in answers without HTTP.
   */
  protected fetchBundle(code: string): Promise<unknown> {
    return firstValueFrom(this._http.get<unknown>('/api/translations/' + encodeURIComponent(code)));
  }

  /**
   * Puts a bundle in force as the one a spec runs with (the tests' stand-in):
   * it counts as the server's - nothing asks for it again - and is kept nowhere.
   */
  protected use(bundle: TranslationBundle): void {
    this._use(bundle, false);
    this._fresh = true;
  }

  /**
   * Puts a checked bundle in force - strings first, then the language they are
   * in. The server's is kept for the next visit; the kept one (`keep: false`)
   * is only in force until the server's comes.
   */
  private _use(bundle: TranslationBundle, keep = true): void {
    this._values.set(new Map(Object.entries(bundle.values)));
    this._english.set(bundle.language === FALLBACK_LANGUAGE ? this._values() : bundle.english ? new Map(Object.entries(bundle.english)) : null);
    this._languages.set(bundle.languages);
    this._language.set(bundle.language);
    this._fresh = keep;
    if (keep) {
      writeStorage(CACHE_KEY, JSON.stringify({ language: bundle.language, languages: bundle.languages, values: bundle.values, ...(bundle.english ? { english: bundle.english } : {}) }));
    }
  }

  private _candidates(): LanguageCandidate[] {
    const navigator = this._document.defaultView?.navigator;
    const browser = navigator?.languages?.length ? navigator.languages : [navigator?.language];
    // An account that sends its preferences: its language comes before what
    // this device remembered - only this tab's `?lang=` and a choice made on
    // this page come before it.
    if (this._accountDecides()) {
      return languageCandidates({ tab: this._tabWish(), chosen: this._chosen, token: this._tokenLocale(), stored: readStorage(LANGUAGE_KEY), browser });
    }
    return languageCandidates({ tab: this._tabWish(), chosen: this._chosenWish(), token: this._tokenLocale(), browser });
  }

  /** `?lang=` of this tab: what this page took from its address, else what the tab kept. */
  private _tabWish(): string | null {
    return this._tab ?? readTab(LANGUAGE_KEY);
  }

  /** The chooser's choice: what was chosen on this page, else what the device kept. */
  private _chosenWish(): string | null {
    return this._chosen ?? readStorage(LANGUAGE_KEY);
  }

  /**
   * `?lang=` holds for this tab: kept in sessionStorage - it survives the
   * round trip to the IAM and the navigation inside the app - and taken out of
   * the address before the router reads it. Never written to localStorage:
   * a link somebody followed is not a choice they made. Kept in memory too,
   * because the parameter is gone from the address either way: where
   * sessionStorage refuses the write, the link still works for this page.
   */
  private _takeAddressLanguage(): void {
    const view = this._document.defaultView;
    const location = this._document.location;
    const parts = (location?.search ?? '').replace(/^\?/, '').split('&');
    const given = parts.filter((part) => part.split('=')[0] === 'lang');
    if (!view || !location || !given.length) {
      return;
    }
    let value = '';
    try {
      value = decodeURIComponent(given[0].split('=')[1] ?? '');
    } catch {
      // Not an address anybody wrote by hand; not a language either.
    }
    const code = languageCode(value);
    if (code) {
      this._tab = code;
      writeTab(LANGUAGE_KEY, code);
    }
    // The other parameters stay byte for byte as they came.
    const rest = parts.filter((part) => part !== '' && part.split('=')[0] !== 'lang').join('&');
    try {
      view.history.replaceState(view.history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    } catch {
      // A browser that refuses: the parameter stays, and does no harm.
    }
  }

  /**
   * The token's `locale` is used, not stored: a change made on the IAM's
   * account page arrives with the next token, one saved on another anotoki
   * site (or in another tab) as soon as the SDK has it. A changed one is
   * adopted when it comes, if this site has that language:
   *
   * - for an account that sends its preferences, whatever this device
   *   remembered and whatever was chosen on this page before it - it is the
   *   newer wish - but not over this tab's `?lang=`, and not while a choice
   *   made here is on its way to the account: the answer to an earlier save
   *   would turn the page back to it;
   * - otherwise only while nothing is stored here - no choice, no `?lang=`.
   */
  private _watchToken(): void {
    this._seenLocale = this._tokenLocale();
    if (this._watching) {
      return;
    }
    this._watching = true;
    this._auth.onAuthChange(() => {
      const locale = this._tokenLocale();
      if (locale === this._seenLocale) {
        return;
      }
      this._seenLocale = locale;
      if (!locale || locale === this._language() || !this._languages().some((language) => language.code === locale)) {
        return;
      }
      if (this._accountDecides()) {
        if (!this._savingLanguage && !languageCode(this._tabWish())) {
          // The account's newer wish takes the place of a choice made earlier on this page.
          this._chosen = null;
          void this.setLanguage(locale, false);
        }
        return;
      }
      if (!(languageCode(this._tabWish()) ?? languageCode(this._chosenWish()))) {
        void this.setLanguage(locale, false);
      }
    });
  }

  /** The signed-in person's token's locale; nobody signed in has none (not even a user the SDK left behind). */
  private _tokenLocale(): string | null {
    return this._auth.signedIn() ? languageCode(this._auth.user()?.locale) : null;
  }

  /**
   * The cached bundle, only when it is one - it parses, has the shape, and
   * (`settle`) is in the language the candidates settle on now. Anything else
   * is removed: a corrupt or outdated cache is no cache.
   *
   * Without `settle` - the app cannot start - the language is not asked about:
   * the wishes are not all known then (nobody is signed in, so the token says
   * nothing), and a cache in another language is still the learner's own words
   * from their last visit. It is used, and left where it is.
   */
  private _cachedBundle(candidates: readonly LanguageCandidate[], settle: boolean): TranslationBundle | null {
    const raw = readStorage(CACHE_KEY);
    if (raw === null) {
      return null;
    }
    let bundle: TranslationBundle | null = null;
    try {
      bundle = bundleFrom(JSON.parse(raw));
    } catch {
      bundle = null;
    }
    if (
      bundle &&
      (!settle ||
        bundle.language ===
          pickLanguage(
            candidates,
            bundle.languages.map((language) => language.code),
          ))
    ) {
      return bundle;
    }
    writeStorage(CACHE_KEY, null);
    return null;
  }

  private _missing(key: string): string {
    if (!this._warned.has(key)) {
      this._warned.add(key);
      console.warn(`[i18n] no string for '${key}'`);
    }
    return key;
  }
}

const PLURAL_RULES = new Map<string, Intl.PluralRules>();

/** The plural rules of a language: only ever asked with a code that passed the pattern. */
function pluralRules(language: string): Intl.PluralRules {
  let rules = PLURAL_RULES.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    PLURAL_RULES.set(language, rules);
  }
  return rules;
}

function fill(value: string, params?: TranslationParams): string {
  if (!params) {
    return value;
  }
  return value.replace(PLACEHOLDER, (whole, name: string) => {
    const given = Object.hasOwn(params, name) ? params[name] : undefined;
    return given === undefined || given === null ? whole : String(given);
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((done) => setTimeout(done, milliseconds));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The server's answer that it is not set up: 503 `not_set_up` (no settings, or a migration pending). */
function notSetUp(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 503 && isPlainObject(error.error) && error.error['code'] === 'not_set_up';
}

/** A flat {key: text} map, copied - or null when it is anything else. */
function stringsFrom(raw: unknown): Record<string, string> | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      return null;
    }
    strings[key] = value;
  }
  return strings;
}

/**
 * A bundle, from the server or from the cache, only when it is one: a language
 * code, the offered languages (strings, and the bundle's own among them) and a
 * flat map of strings. The `english` the server sends beside another language
 * is kept when it is a map of strings (the admin panel reads it), and passed
 * over when it is not - the page's own strings are what matter.
 */
function bundleFrom(raw: unknown): TranslationBundle | null {
  if (!isPlainObject(raw) || !Array.isArray(raw['languages'])) {
    return null;
  }
  const language = raw['language'];
  if (typeof language !== 'string' || !LANGUAGE_CODE.test(language)) {
    return null;
  }
  const languages: SiteLanguage[] = [];
  for (const entry of raw['languages']) {
    if (!isPlainObject(entry)) {
      return null;
    }
    const { code, name, nativeName } = entry;
    if (typeof code !== 'string' || !LANGUAGE_CODE.test(code) || typeof name !== 'string' || typeof nativeName !== 'string') {
      return null;
    }
    languages.push({ code, name, nativeName });
  }
  const values = stringsFrom(raw['values']);
  if (!values || !languages.some((entry) => entry.code === language)) {
    return null;
  }
  const english = language === FALLBACK_LANGUAGE ? null : stringsFrom(raw['english']);
  return english ? { language, languages, values, english } : { language, languages, values };
}

/** sessionStorage that never throws - what core/util/storage.ts is for localStorage. */
function readTab(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeTab(key: string, value: string | null): void {
  try {
    if (value === null) {
      globalThis.sessionStorage?.removeItem(key);
    } else {
      globalThis.sessionStorage?.setItem(key, value);
    }
  } catch {
    // Nothing to do: the language just will not hold for the tab.
  }
}
