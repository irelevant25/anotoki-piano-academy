import { EnvironmentProviders, inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideAnotokiShell } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { IconPaths, provideAnotokiUi } from '@anotoki/lib/ui/config';
import { rect } from '@anotoki/lib/ui/icon';

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
 * The anotoki family's kit (@anotoki/lib/ui's pieces) and frame
 * (@anotoki/lib/shell), wired to this app's own: the top bar, its menus and
 * the dialogs are the family's, their words this app's database's and their
 * colours this app's.
 *
 * - The kit's words are in the language on the page - English in the admin
 *   panel - and read from the database: the library's own keys,
 *   anotoki.<the kit's word> (the translations module's forKit(): an owner's
 *   rewording on the Translations page reaches the kit; migration 009 put
 *   this app's own wording there, "Theme: light" among it). While no bundle is
 *   in memory, this app's English for the few it says its own way
 *   (kept-english.ts, KEPT_LIBRARY_ENGLISH), else the kit's own built-in
 *   English and informal Slovak - never a key.
 * - The theme is the family's ThemeService: the anotoki account's for
 *   somebody signed in (the IAM's 015 - AnotokiAuth.preferences, null for
 *   nobody, a visitor, an IAM that sends none: then this device's, and
 *   nothing is saved), saved from the bar's switch with
 *   AnotokiAuth.savePreferences(); the theme on the screen kept under THEME_KEY.
 * - The language chooser is the translations module's (forShell()): this
 *   app's languages, under their own names, a choice through setLanguage() -
 *   which saves a signed-in person's choice to the account and says when it
 *   would not take it (languageNotSaved).
 *
 * The factories run in an injection context; specs give the same providers.
 */
export function provideFamilyKit(): EnvironmentProviders[] {
  return [
    provideAnotokiUi(() => ({
      ...inject(TranslationService).forKit(),
      icons: { piano: PIANO_ICON },
    })),
    provideAnotokiShell(() => {
      const auth = inject(AnotokiAuth);
      return {
        theme: {
          storageKey: THEME_KEY,
          account: () => auth.preferences()?.theme ?? null,
          save: (theme) => auth.savePreferences({ theme }),
          themeColor: THEME_COLOR,
        },
        languages: inject(TranslationService).forShell(),
      };
    }),
  ];
}
