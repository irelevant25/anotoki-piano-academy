import { Injectable, InjectionToken, Provider, inject } from '@angular/core';
import { SiteLanguage, TranslationBundle } from '../i18n/translation.model';
import { FALLBACK_LANGUAGE, TranslationService } from '../i18n/translation.service';

/** The two languages the app is seeded with. */
export const TEST_LANGUAGES: SiteLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
];

/** What a spec's bundle is made of beside its strings. */
export interface TestBundle {
  /** The language the spec's strings are in. English when left out. */
  language?: string;
  languages?: SiteLanguage[];
  /** For a spec in another language that switches to English: the English strings. */
  english?: Record<string, string>;
}

interface WholeTestBundle {
  bundle: TranslationBundle;
  english: Record<string, string> | null;
}

const TEST_BUNDLE = new InjectionToken<WholeTestBundle>('the bundle a spec runs with');

/**
 * The real service with a bundle already in memory, and no HTTP: what it would
 * fetch is answered from that bundle - its own language, English for any
 * other, as the server answers a language it does not offer.
 *
 * The bundle counts as the server's own, so a navigation in a spec asks for
 * nothing (navigated()). And with a bundle in memory the kept English is out
 * of play: a key the spec did not give comes back as itself.
 */
@Injectable()
class TestTranslationService extends TranslationService {
  private readonly _test = inject(TEST_BUNDLE);

  constructor() {
    super();
    this.use(this._test.bundle);
  }

  protected override fetchBundle(code: string): Promise<unknown> {
    const { bundle, english } = this._test;
    return Promise.resolve(code === bundle.language ? bundle : { language: FALLBACK_LANGUAGE, languages: bundle.languages, values: english ?? bundle.values });
  }

  /**
   * The start (BootService.start()) in a spec: the bundle is there already, so
   * nothing is decided, nothing is read from storage or the address, and no
   * HTTP goes out - a spec that ends with `http.verify()` sees none. A spec
   * that cares about the start asks whether it was called
   * (`vi.spyOn(i18n, 'init')`), or runs the real service.
   */
  override init(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * What a page calls after it has changed the strings or the languages: here
   * it answers at once and changes nothing - the language the spec chose stays
   * (the real one settles again on the browser's wishes, which would move a
   * Slovak spec to whatever jsdom says it speaks). A spec that cares asks
   * whether it was called: `vi.spyOn(i18n, 'reload')`.
   */
  override reload(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * For a spec that runs the translation service, a pipe or a component with
 * given strings: `provideTestTranslations({ 'common.close': 'Close' })` is an
 * English bundle of them; for another language, say which, and give English
 * beside it when the spec switches to it -
 * `provideTestTranslations({ 'common.close': 'Zavrieť' }, { language: 'sk', english: { 'common.close': 'Close' } })`.
 *
 * A key that is not given comes back as itself and warns, as in the app.
 */
export function provideTestTranslations(values: Record<string, string> = {}, bundle: TestBundle = {}): Provider[] {
  const whole: WholeTestBundle = {
    bundle: { language: bundle.language ?? FALLBACK_LANGUAGE, languages: bundle.languages ?? TEST_LANGUAGES, values },
    english: bundle.english ?? null,
  };
  return [
    { provide: TEST_BUNDLE, useValue: whole },
    { provide: TranslationService, useClass: TestTranslationService },
  ];
}
