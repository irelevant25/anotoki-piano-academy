import { AnotokiWordKey } from '@anotoki/lib/ui';

/**
 * The words of the anotoki family's kit (@anotoki/lib: the top bar, its menus,
 * the theme switch, the language chooser, the dialogs) that Piano Academy
 * says in its own - the database's strings, as the owner worded them: for
 * each kit word this app has a string of, the key of that string. The kit
 * asks for its words through provideAnotokiUi()'s `lookup` (app.config.ts),
 * which answers with these; every other kit word is the kit's own, built in
 * for English and (informal) Slovak - "Saving…" while a Sign out waits, the
 * theme switch's name, its "As your device is set".
 *
 * The kit's keys are written here by their two parts, never whole: a key
 * written whole is what the key scan (backend/tools/translation_keys.php)
 * reads as a key the app asks the database for, and the kit's own - which
 * the database does not have - would fail it. This app's keys, on the right,
 * are written whole: the scan sees them asked for, as they are.
 *
 * The theme switch's three choices are named with this app's theme.light,
 * theme.dark and theme.auto ("Theme: light"): what the round button said
 * before the family's switch took its place.
 */
const SITE_WORDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ui: {
    loading: 'common.loading',
  },
  topbar: {
    phoneMenu: 'topbar.phoneMenu',
    menuButton: 'topbar.menuButton',
    menu: 'topbar.menu',
    roleAdmin: 'topbar.roleAdmin',
    roleEditor: 'topbar.roleEditor',
    account: 'topbar.account',
    admin: 'topbar.admin',
    signIn: 'signIn.button',
    signOut: 'account.signOut',
  },
  language: {
    button: 'language.button',
    notLoaded: 'language.notLoaded',
    notSaved: 'language.notSaved',
  },
  theme: {
    light: 'theme.light',
    dark: 'theme.dark',
    auto: 'theme.auto',
    notSaved: 'theme.notSaved',
  },
};

/** This app's key for a word of the kit's, or null where the kit's own word stands. */
export function siteKeyFor(key: AnotokiWordKey): string | null {
  const [part, word] = key.split('.');
  return (Object.hasOwn(SITE_WORDS, part) && Object.hasOwn(SITE_WORDS[part], word) && SITE_WORDS[part][word]) || null;
}
