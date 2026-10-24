import { EnvironmentProviders, inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideAnotokiTranslations } from '@anotoki/lib/translations';
import { KEPT_ENGLISH, KEPT_LIBRARY_ENGLISH } from './kept-english';

/** Where this device's language, the last bundle and the admin panel's drafts are kept: `piano-academy:language`, `:language-cache`, `:localization-drafts` - the names they always had. */
export const TRANSLATIONS_STORAGE_PREFIX = 'piano-academy';

/** The admin panel's pages of the words, and its Migrations page (the Translations page links there while the database has no words yet). */
export const TRANSLATIONS_ROUTES = { translations: '/admin/translations', languages: '/admin/languages', migrations: '/admin/migrations' } as const;

/**
 * The app's words through the anotoki family's library
 * (@anotoki/lib/translations), wired to this app's own: TranslationService
 * (the language the pages are read in and its strings, from
 * GET /api/translations/{code}), the `translate` and `translatePlural` pipes,
 * the kit's words and the bar's language chooser (shared/family-kit.ts:
 * forKit(), forShell()), the status page's words (shared/state/site-migrations.ts:
 * siteStatusWords()), and the admin panel's Translations and Languages pages
 * (@anotoki/lib/translations/admin, sites/admin/admin.routes.ts).
 *
 * - The storage keys are the ones this app always had: a learner's chosen
 *   language and cached words survive the upgrade.
 * - While no bundle is in memory - the app not set up, the backend out of
 *   reach, a database without its words yet - the shell reads the English
 *   kept in code (kept-english.ts): this app's own keys, and the library's
 *   words it says its own way (the theme switch's "Theme: light", the
 *   sign-in failure's three sentences).
 * - The account (the IAM's 015, AnotokiAuth.preferences): its language - the
 *   token's `locale` - decides while it keeps the person's choices, and a
 *   choice made in the bar is saved to it (AnotokiAuth.savePreferences()); a
 *   language the IAM does not offer stays this site's own for the visit,
 *   silently (the IAM's invalid_request), any other refusal - access_denied
 *   too - is said under the chooser. Whose the admin panel's drafts are: the
 *   signed-in person's id.
 * - Nothing is asked of the server while its sign-in settings could not be
 *   read (not set up, out of reach: AnotokiAuth's `unavailable`): the cached
 *   words, or the kept English.
 * - The admin pages: the strings for the staff (EDITOR or ADMIN), the
 *   languages for ADMIN alone - what the server checks again on each route
 *   group; English, as the whole admin panel is.
 *
 * The factory runs in an injection context, the first time the module needs
 * it - never while the TranslationService is being made.
 */
export function provideSiteTranslations(): EnvironmentProviders {
  return provideAnotokiTranslations(() => {
    const auth = inject(AnotokiAuth);
    return {
      storagePrefix: TRANSLATIONS_STORAGE_PREFIX,
      fallbackEnglish: KEPT_ENGLISH,
      libraryWords: { en: KEPT_LIBRARY_ENGLISH },
      account: {
        // The token's locale - only somebody signed in, whose the page is, has one.
        language: () => auth.locale(),
        decides: () => auth.preferences() !== null,
        save: (code) => auth.savePreferences({ language: code }),
        userKey: () => auth.subject(),
      },
      // The sign-in settings were read: the backend answers, and is set up.
      canAsk: () => auth.state() !== 'starting' && auth.state() !== 'unavailable',
      admin: {
        allows: { strings: () => auth.isStaff(), languages: () => auth.isAdmin() },
        routes: TRANSLATIONS_ROUTES,
        siteName: 'Piano Academy',
      },
    };
  });
}
