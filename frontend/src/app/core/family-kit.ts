import { EnvironmentProviders, inject } from '@angular/core';
import { provideAnotokiShell } from '@anotoki/lib/shell';
import { IconPaths, provideAnotokiUi, rect } from '@anotoki/lib/ui';
import { AuthService } from './auth/auth.service';
import { siteKeyFor } from './i18n/kit-words';
import { TranslationService } from './i18n/translation.service';

/** Where the theme on the screen is kept - the kit's theme-boot.js (index.html, data-storage-key) reads it before the first paint. */
export const THEME_KEY = 'piano-academy:theme';

/** The browser's chrome in each theme: the page's background (styles.scss, --bg). */
export const THEME_COLOR = { light: '#f4f5f8', dark: '#14161c' } as const;

/**
 * Piano Academy's own icon beside the kit's (the piano widget in the top bar):
 * a keyboard, white keys and two black ones, in the kit's 24-unit line style.
 */
export const PIANO_ICON: IconPaths = [rect(2, 5, 20, 14, 2), 'M8 19v-5', 'M12 19v-5', 'M16 19v-5', 'M7 5v9h2V5', 'M15 5v9h2V5'];

/**
 * The anotoki family's kit (@anotoki/lib/ui) and frame (@anotoki/lib/shell),
 * wired to this app's own: the top bar, its menus and the dialogs are the
 * family's, their words and their colours this app's.
 *
 * - The kit's words are in the language on the page - English in the admin
 *   panel (effectiveLanguage) - and where this app has a string of its own
 *   for one (core/i18n/kit-words.ts), its string: the database's, as the
 *   owner worded it, or the kept English while there is no bundle at all -
 *   and, as every word of this app's, its key where the database has none.
 *   The rest is the kit's own, built in for English and informal Slovak.
 * - The theme is the family's ThemeService: the anotoki account's for
 *   somebody signed in (the IAM's 015 - AuthService.preferences, null for
 *   nobody, a visitor, an IAM that sends none: then this device's, and
 *   nothing is saved), saved from the bar's switch with the SDK's
 *   savePreferences(); the theme on the screen kept under THEME_KEY.
 * - The language chooser offers this app's languages, under their own names,
 *   and chooses through TranslationService.choose() - which saves a signed-in
 *   person's choice to the account and says when it would not take it
 *   (languageNotSaved).
 *
 * The factories run in an injection context; specs give the same providers.
 */
export function provideFamilyKit(): EnvironmentProviders[] {
  return [
    provideAnotokiUi(() => {
      const i18n = inject(TranslationService);
      return {
        language: () => i18n.effectiveLanguage(),
        // As every word of this app's: a string the database lacks shows its key (the owner sees which).
        lookup: (key) => {
          const site = siteKeyFor(key);
          return site === null ? null : i18n.t(site);
        },
        icons: { piano: PIANO_ICON },
      };
    }),
    provideAnotokiShell(() => {
      const auth = inject(AuthService);
      const i18n = inject(TranslationService);
      return {
        theme: {
          storageKey: THEME_KEY,
          account: () => auth.preferences()?.theme ?? null,
          save: (theme) => auth.savePreferences({ theme }),
          themeColor: THEME_COLOR,
        },
        languages: {
          current: () => i18n.language(),
          offered: () => i18n.languages().map((language) => ({ code: language.code, name: language.nativeName })),
          choose: (code) => i18n.choose(code),
          notSaved: () => i18n.languageNotSaved(),
          clearNotSaved: () => i18n.languageNotSaved.set(false),
        },
      };
    }),
  ];
}
