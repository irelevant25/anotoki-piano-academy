/**
 * The English of everything the app draws while it has no strings at all.
 *
 * The app's words live in the database - and the shell (the top bar, the
 * footer, the cards that say why the app cannot run) is drawn exactly when the
 * database cannot be asked: on a fresh install, whenever the backend or its
 * database is down. TranslationService answers from this table only while no
 * bundle is in memory; with one, a key that has no string shows as the key,
 * as everywhere. (The page that says the site is being updated, not set up
 * or not available is the anotoki family's, with its own words in English
 * and Slovak: @anotoki/lib/migrations. So are the words of the family's kit
 * that this app has no string of its own for - the theme switch's name, its
 * "As your device is set", "Saving…" while a Sign out waits: @anotoki/lib/ui.
 * Those it has one for are read from here as any other: kit-words.ts.)
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
  // The sign-in card (boot/sign-in-card); its button is also the top bar's and the signed-out banner's.
  'signIn.title': 'Sign in',
  'signIn.text': 'Sign in with your anotoki account. Your progress is saved to it.',
  'signIn.button': 'Sign in',
  // A sign-in that came back without one, or could not start (the sign-in card; error-text.ts).
  'signIn.notCompleted': 'Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.',
  'signIn.failed': 'Signing in did not work. Please try again. ({code})',
  'signIn.storageUnavailable': 'This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.',
  // The top bar's menus (layouts/top-bar): the phone's, the person's, and what is in them.
  'topbar.phoneMenu': 'Menu',
  'topbar.menuButton': 'Your menu: {name}',
  'topbar.menu': 'Your menu',
  'topbar.roleAdmin': 'Administrator',
  'topbar.roleEditor': 'Editor',
  'topbar.account': 'Your anotoki account',
  'topbar.admin': 'Admin panel',
  // Who is signed in and what waits, in the top bar (layouts/top-bar), and the signed-out banner (app.component).
  'account.notSaved': 'Not saved yet',
  'account.notSavedHint': 'Some of your progress is not on the server yet. The app keeps trying.',
  'account.signedIn': 'Signed in',
  'account.signOut': 'Sign out',
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
  // The top bar's theme switch (the family's): what its three choices are called (core/i18n/kit-words.ts)...
  'theme.auto': 'Theme: automatic',
  'theme.light': 'Theme: light',
  'theme.dark': 'Theme: dark',
  // ...and the note under it when the anotoki account would not take the theme chosen there.
  'theme.notSaved': 'The theme could not be saved to your anotoki account.',
  // The footer (app.component): the version button's hint.
  'footer.whatsNew': 'What\'s new',
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
