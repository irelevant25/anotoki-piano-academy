/**
 * The English of everything the app draws while it has no strings at all.
 *
 * The app's words live in the database - and the shell (the top bar, the
 * footer, the cards that say why the app cannot run) is drawn exactly when the
 * database cannot be asked: on a fresh install, whenever the backend or its
 * database is down. The family's TranslationService (@anotoki/lib/translations,
 * core/i18n/site-translations.ts: `fallbackEnglish`) answers from this table
 * only while no bundle is in memory; with one, a key that has no string shows
 * as the key, as everywhere. (The page that says the site is being updated,
 * not set up or not available is the anotoki family's, and so are the words
 * of the family's kit - the bar's menus, the language chooser, the theme
 * switch, "Saving…" while a Sign out waits: the library's own keys,
 * anotoki.*, built into it in English and Slovak, and in the database.)
 *
 * A key here is also a key in the database, with the same English: the
 * backend's test (tests/unit/translations.test.php) holds the two equal, and
 * reads this file as text. So every entry is on a line of its own - the key,
 * a colon, the English, a comma - both in single quotes, an apostrophe written
 * with a backslash before it and nothing else escaped. A new string for the
 * shell goes into a migration and into this table.
 */
export const KEPT_ENGLISH: Readonly<Record<string, string>> = {
  // While the start is on its way (app.component).
  'common.loading': 'Loading…',
  // The top bar (layouts/top-bar): the brand - "Piano" alone on a phone - and its link's name.
  'brand.area': 'Piano Academy',
  'brand.short': 'Piano',
  'topbar.home': 'anotoki Piano Academy: Learn',
  // The bar's sections (its nav's name, then the links); the home page's free-practice buttons use the four modes too.
  'nav.label': 'Main',
  'nav.learn': 'Learn',
  'nav.trainer': 'Note Trainer',
  'nav.sheet': 'Sheet Practice',
  'nav.songs': 'Songs',
  'nav.stats': 'Stats',
  // The card "could not load" (boot/load-error).
  'boot.loadError.title': 'Could not load your progress',
  'boot.loadError.text': 'The app did not start, so your saved progress stays safe. Check that the server is still running, then try again.',
  'boot.loadError.tryAgain': 'Try again',
  // Sign in: the signed-out banner's button and the visitor's notes' (a sign-in that did not work is said on the
  // family's own screen, in the library's words - KEPT_LIBRARY_ENGLISH below).
  'signIn.button': 'Sign in',
  // Who is signed in and what waits, in the top bar (layouts/top-bar), and the signed-out banner (app.component).
  'account.notSaved': 'Not saved yet',
  'account.notSavedHint': 'Some of your progress is not on the server yet. The app keeps trying.',
  'account.signedIn': 'Signed in',
  'account.signedOutBanner': 'You are signed out, so your progress is not saved.',
  // Signing out while some progress could not be saved (layouts/top-bar: the question, the family's ConfirmService).
  'signOut.title': 'Sign out without your latest progress?',
  'signOut.text': 'Some of your progress could not be saved yet. If you sign out now, it is lost.',
  'signOut.confirm': 'Sign out anyway',
  'signOut.cancel': 'Stay signed in',
  // The progress was replaced or deleted somewhere else, and the page loaded it again (app.component).
  'progressChanged.text': 'Your progress was replaced or deleted somewhere else - by a file brought back in another tab, or by an administrator. This page now shows what is saved.',
  'progressChanged.close': 'Close',
  // Practising without signing in, and a sign-in that moved that progress into the account (app.component; core/i18n/visitor-words.ts).
  'visitor.notice': 'You are practising without signing in. Your progress is kept for this browser for {days} days after your last visit. Sign in to keep it in your account.',
  'visitor.moved': 'Your progress from practising without signing in is now in your account.',
  'visitor.kept': 'Where your account already had progress, it was kept.',
  'visitor.notMoved': 'Your progress from practising without signing in could not be moved into your account yet. Nothing is lost: it is tried again on your next visit.',
  'visitor.lost': 'The progress this browser kept without signing in has ended: it was not used for {days} days, or it was moved into an account at a sign-in.',
  'visitor.signInNow': 'Piano Academy now asks everybody to sign in. Sign in to go on - your progress from this browser comes with you.',
  'visitor.full': 'Without signing in, this browser cannot keep any more. Sign in to keep practising with your progress saved.',
  'visitor.busy': 'Too many people are practising without signing in just now, so this is not saved yet. Sign in, or try again later.',
  'visitor.close': 'Close',
  // The piano, in the top bar (ui/midi-panel): the button, and the box it opens.
  'midi.button': '{label}: {status}',
  'midi.none': 'No piano',
  'midi.title': 'Your piano',
  'midi.connected': 'Connected: {name}',
  'midi.notConnected': 'Piano not connected',
  'midi.unsupported': 'Web MIDI not supported — use Chrome or Edge',
  'midi.refused': 'The browser did not allow MIDI',
  'midi.failed': 'The piano could not be connected',
  'midi.device': 'MIDI input device',
  'midi.noDevices': 'No MIDI devices found',
  'midi.connect': 'Connect',
  'midi.rescan': 'Rescan MIDI devices',
  // The footer (app.component): the version button's hint.
  'footer.whatsNew': 'What\'s new',
  // The frame of the list of changes (ui/changelog-dialog); its entries are not translated.
  'whatsNew.title': 'What\'s new',
  'whatsNew.close': 'Close',
  'whatsNew.latest': 'Latest',
  'whatsNew.added': 'Added',
  'whatsNew.changed': 'Changed',
  'whatsNew.fixed': 'Fixed',
  // The browser tab's titles (app.routes.ts, title.strategy.ts).
  'title.learn': 'Learn',
  'title.lesson': 'Lesson',
  'title.trainer': 'Note Trainer',
  'title.sheet': 'Sheet Practice',
  'title.songs': 'Songs',
  'title.stats': 'Stats',
  'title.signingIn': 'Signing in',
  'title.terms': 'Terms of use',
  'title.privacy': 'Privacy policy',
  'title.contact': 'Contact',
};

/**
 * The library's words this app says its own way, for while no bundle is in
 * memory (the translations module's `libraryWords`, core/i18n/site-translations.ts):
 * the top bar's theme switch names its three choices with this app's words -
 * "Theme: light", what the round button said before the family's switch took
 * its place - where the library's own are "Light"; and a sign-in that did not
 * work is said in the sentences the app's sign-in card said before the
 * family's screen took its place (the screen, the signed-out banner and a
 * visitor's note read them). The database has them under the library's keys
 * (migrations 009 and 011 copied this app's strings there, the owner's
 * wording too); with a bundle in memory its strings are read, these never.
 * Written as KEPT_ENGLISH is, and held by the same test to the database's
 * English.
 */
export const KEPT_LIBRARY_ENGLISH: Readonly<Record<string, string>> = {
  'anotoki.theme.auto': 'Theme: automatic',
  'anotoki.theme.light': 'Theme: light',
  'anotoki.theme.dark': 'Theme: dark',
  'anotoki.signIn.notCompleted': 'Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.',
  'anotoki.signIn.failed': 'Signing in did not work. Please try again. ({code})',
  'anotoki.signIn.storageUnavailable': 'This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.',
};
