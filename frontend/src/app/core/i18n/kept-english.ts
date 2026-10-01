/**
 * The English of everything the app draws while it has no strings at all.
 *
 * The app's words live in the database - and the shell (header, navigation,
 * footer, the cards that say why the app cannot run) is drawn exactly when the
 * database cannot be asked: on a fresh install, while a migration waits for
 * the setup page, whenever the backend is down. TranslationService answers
 * from this table only while no bundle is in memory; with one, a key that has
 * no string shows as the key, as everywhere.
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
  // The navigation (app.component); the home page's free-practice buttons use the four modes too.
  'nav.label': 'Main',
  'nav.learn': 'Learn',
  'nav.trainer': 'Note Trainer',
  'nav.sheet': 'Sheet Practice',
  'nav.songs': 'Songs',
  'nav.stats': 'Stats',
  // The card "not set up yet" (boot/not-set-up).
  'boot.notSetUp.title': 'Piano Academy is not set up yet',
  'boot.notSetUp.text': 'Before you can practise, the app needs its database - and to know whether people sign in. The setup page asks for both and takes a minute.',
  'boot.notSetUp.open': 'Open the setup page',
  'boot.notSetUp.after': 'When it is done, come back here and reload the page.',
  // The card "could not load" (boot/load-error).
  'boot.loadError.title': 'Could not load your progress',
  'boot.loadError.text': 'The app did not start, so your saved progress stays safe. Check that the server is still running, then try again.',
  'boot.loadError.tryAgain': 'Try again',
  // The sign-in card (boot/sign-in-card); its button is also the account panel's and the signed-out banner's.
  'signIn.title': 'Sign in',
  'signIn.text': 'Sign in with your anotoki account. Your progress is saved to it.',
  'signIn.button': 'Sign in',
  // A sign-in that came back without one (the sign-in card; error-text.ts).
  'signIn.notCompleted': 'Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.',
  'signIn.failed': 'Signing in did not work. Please try again. ({code})',
  // Who is signed in, in the header (ui/account-panel), and the signed-out banner (app.component).
  'account.notSaved': 'Not saved yet',
  'account.notSavedHint': 'Some of your progress is not on the server yet. The app keeps trying.',
  'account.signedIn': 'Signed in',
  'account.signedOut': 'Signed out',
  'account.myAccount': 'My account',
  'account.signOut': 'Sign out',
  'account.signedOutBanner': 'You are signed out, so your progress is not saved.',
  // The piano, in the header (ui/midi-panel).
  'midi.connected': 'Connected: {name}',
  'midi.notConnected': 'Piano not connected',
  'midi.unsupported': 'Web MIDI not supported — use Chrome or Edge',
  'midi.refused': 'The browser did not allow MIDI',
  'midi.failed': 'The piano could not be connected',
  'midi.device': 'MIDI input device',
  'midi.noDevices': 'No MIDI devices found',
  'midi.connect': 'Connect',
  'midi.rescan': 'Rescan MIDI devices',
  // The footer's theme button (ui/theme-toggle): what it shows, and what it says to a screen reader.
  'theme.auto': 'Theme: automatic',
  'theme.light': 'Theme: light',
  'theme.dark': 'Theme: dark',
  'theme.autoSpoken': 'Theme: automatic (press to change)',
  'theme.lightSpoken': 'Theme: light (press to change)',
  'theme.darkSpoken': 'Theme: dark (press to change)',
  // The footer (app.component): the version button's hint, and the owner's link.
  'footer.whatsNew': 'What\'s new',
  'footer.translations': 'Translations',
  // The frame of the list of changes (ui/changelog-dialog); its entries are not translated.
  'whatsNew.title': 'What\'s new',
  'whatsNew.close': 'Close',
  'whatsNew.latest': 'Latest',
  'whatsNew.added': 'Added',
  'whatsNew.changed': 'Changed',
  'whatsNew.fixed': 'Fixed',
  'whatsNew.notLoaded': 'The list of changes could not be loaded.',
  // The browser tab's titles (app.routes.ts, title.strategy.ts).
  'title.learn': 'Learn',
  'title.lesson': 'Lesson',
  'title.trainer': 'Note Trainer',
  'title.sheet': 'Sheet Practice',
  'title.songs': 'Songs',
  'title.stats': 'Stats',
  'title.signingIn': 'Signing in',
};
