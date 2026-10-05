-----------------------------------------------------------
-- THE ANOTOKI FAMILY, MADE ONE WAY
--
-- Finished (2026-10-04). The owner applies it at the hand-over, after a
-- pg_dump of the database: on this computer by Save on /setup.php (or
-- php migration.php); on the host in this order - upload the build, apply
-- this at once (an ADMIN: "Apply pending" on the admin panel's Migrations
-- page, linked from the "not set up yet" card; or /setup.php again), then
-- the IAM's 007. Until then the app answers "not set up yet" (the database
-- is behind the code). Once applied it never changes: the next change is
-- 005.
--
-- In this order: the generation of each person's progress (the schema);
-- the strings of what the family's work gives a learner - the sign-out
-- question, the note when the progress changed elsewhere, a learner's own
-- progress file, the top bar - in 003's form; the strings and descriptions
-- it rewords and the keys it retires; the schema's gate; the strings' gate.
--
-- A GENERATION OF EACH PERSON'S PROGRESS
--
-- The browser saves whole documents (PUT /api/progress, PUT /api/path). A
-- tab that loaded somebody's progress before an import replaced it, or
-- before an administrator deleted it, would write the old documents back
-- with its next save. So each person's progress has a generation:
-- GET /api/state hands it out, a save names it (the Progress-Generation
-- header), and a save made to another one is refused (409
-- progress_changed). Only an import and a delete start a new generation -
-- ordinary saves do not, so two saves of one tab never refuse each other.
--
-- The numbers come from one sequence and are never handed out twice: a
-- person whose users row an administrator deleted, and whose next request
-- made it again, gets a number no tab of theirs can be holding.
--
-- Additive: one sequence, and one column with a default on users. Each
-- users row there already gets a number of its own; no other column and no
-- row of anybody's progress changes.
-----------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS progress_generation;

ALTER TABLE users ADD COLUMN IF NOT EXISTS progress_generation BIGINT NOT NULL DEFAULT nextval('progress_generation');

ALTER SEQUENCE progress_generation OWNED BY users.progress_generation;

-----------------------------------------------------------
-- WHAT THE APP NOW SAYS TO A LEARNER
--
-- The words of what the family's work gives a learner, in 003's form: a
-- key, its English and its Slovak string (informal, ty - and nothing
-- gendered about the learner), every insert stepping aside for a row that
-- is already there.
--
--   signIn.storageUnavailable  a sign-in that could not start (the sign-in card)
--   signOut.*                  signing out while some progress could not be saved
--   progressChanged.*          the progress replaced or deleted somewhere else
--   ownProgress.*              the learner's own progress file, on Stats
--   brand.*, topbar.*          the family's top bar: the brand, the menus
--   midi.button/none/title     the piano in the top bar: its button and its box
--
-- The shell's (all but ownProgress) are also in the frontend's
-- core/i18n/kept-english.ts, letter for letter.
--
-- One string on a line, an apostrophe written twice and nothing else
-- escaped: that is all the statement splitter knows of a string.
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- signIn: a sign-in that could not even start
    ('signIn.storageUnavailable', 'The sign-in card, after a sign-in that could not start because the browser refused the site its storage (where the sign-in in progress is kept): private windows, blocked site data. No placeholders. Also in kept-english.ts.'),
    -- signOut: the question before signing out loses progress (the top bar''s Sign out)
    ('signOut.title', 'The heading of the question asked on Sign out when some progress could not be saved even after one more try: signing out now loses it. No placeholders. Also in kept-english.ts.'),
    ('signOut.text', 'The sentence of the sign-out question (signOut.title). No placeholders. Also in kept-english.ts.'),
    ('signOut.confirm', 'The sign-out question''s "yes" button (the dangerous one): sign out all the same. No placeholders. Also in kept-english.ts.'),
    ('signOut.cancel', 'The sign-out question''s "no" button: stay signed in, and keep trying to save. Nothing gendered about the learner. No placeholders. Also in kept-english.ts.'),
    -- progressChanged: the note under the top bar after the progress was replaced or deleted elsewhere
    ('progressChanged.text', 'The note under the top bar when a save was refused because the progress on the server was replaced (a file brought back in another tab or on another computer) or deleted (by an administrator) after this page loaded it; the page has loaded it again, and nothing of the old was saved over it. No placeholders. Also in kept-english.ts.'),
    ('progressChanged.close', 'The button that closes the note progressChanged.text. No placeholders. Also in kept-english.ts.'),
    -- ownProgress: the card "Your progress file" at the end of Stats
    ('ownProgress.title', 'The heading of the card at the end of Stats where learners download their own progress as a file, or bring it back from one. No placeholders.'),
    ('ownProgress.text', 'The card''s sentence under its heading (ownProgress.title). No placeholders.'),
    ('ownProgress.download', 'The card''s button that downloads the learner''s progress as a file. A verb. No placeholders.'),
    ('ownProgress.bringBack', 'The card''s button that opens the browser''s file chooser, to bring progress back from a file. No placeholders.'),
    ('ownProgress.working', 'Shown on the card while a download, a look at a chosen file or bringing it in is under way. No placeholders.'),
    ('ownProgress.preview.title', 'The heading of the box that shows what a chosen file would bring in, before anything is written. No placeholders.'),
    ('ownProgress.preview.now', 'In that box: the label before the counts of what is saved now (ownProgress.count.*). No placeholders.'),
    ('ownProgress.preview.file', 'In that box: the label before the counts of what the file holds (ownProgress.count.*). No placeholders.'),
    ('ownProgress.preview.leftOut.one', 'In that box, when some rounds in the file cannot be used and will be left out. {count}: how many (one form of a plural family).'),
    ('ownProgress.preview.leftOut.few', 'In that box, when some rounds in the file cannot be used and will be left out. {count}: how many (one form of a plural family).'),
    ('ownProgress.preview.leftOut.other', 'In that box, when some rounds in the file cannot be used and will be left out. {count}: how many (one form of a plural family).'),
    ('ownProgress.preview.replaces', 'In that box, when the learner already has progress: bringing the file in replaces it (never mixes the two). No placeholders.'),
    ('ownProgress.preview.bringIn', 'The box''s button that brings the file in, when the learner has no progress yet. No placeholders.'),
    ('ownProgress.preview.replace', 'The box''s button that brings the file in when the learner has progress: it replaces it (a question follows). No placeholders.'),
    ('ownProgress.cancel', 'The box''s button that drops the chosen file; nothing was written. No placeholders.'),
    ('ownProgress.confirm.title', 'The heading of the question asked before a file replaces the learner''s progress. No placeholders.'),
    ('ownProgress.confirm.text', 'The sentence of that question (ownProgress.confirm.title). No placeholders.'),
    ('ownProgress.confirm.yes', 'That question''s "yes" button (the dangerous one): replace. No placeholders.'),
    ('ownProgress.confirm.no', 'That question''s "no" button: keep the progress there is. No placeholders.'),
    ('ownProgress.done', 'After a file was brought in; the counts of what came in follow it (ownProgress.count.*, joined with commas). No placeholders.'),
    ('ownProgress.count.notes.one', 'A count in the box and after ownProgress.done: notes with a state of their own. {count}: how many (one form of a plural family).'),
    ('ownProgress.count.notes.few', 'A count in the box and after ownProgress.done: notes with a state of their own. {count}: how many (one form of a plural family).'),
    ('ownProgress.count.notes.other', 'A count in the box and after ownProgress.done: notes with a state of their own. {count}: how many (one form of a plural family).'),
    ('ownProgress.count.steps.one', 'A count in the box and after ownProgress.done: steps of the learning path tried. {count}: how many (one form of a plural family).'),
    ('ownProgress.count.steps.few', 'A count in the box and after ownProgress.done: steps of the learning path tried. {count}: how many (one form of a plural family).'),
    ('ownProgress.count.steps.other', 'A count in the box and after ownProgress.done: steps of the learning path tried. {count}: how many (one form of a plural family).'),
    ('ownProgress.count.rounds.one', 'A count in the box and after ownProgress.done: rounds played (sessions). {count}: how many (one form of a plural family).'),
    ('ownProgress.count.rounds.few', 'A count in the box and after ownProgress.done: rounds played (sessions). {count}: how many (one form of a plural family).'),
    ('ownProgress.count.rounds.other', 'A count in the box and after ownProgress.done: rounds played (sessions). {count}: how many (one form of a plural family).'),
    ('ownProgress.error.unsaved', 'The card, when a file is chosen while some progress is not saved yet. No placeholders.'),
    ('ownProgress.error.tooLarge', 'The card, when the chosen file is larger than the app takes (checked before it is sent, and by the server). {megabytes}: the limit in megabytes (5).'),
    ('ownProgress.error.exportTooLarge', 'The card, when the learner''s progress is too large to be handed out as one file. {megabytes}: the limit in megabytes (5).'),
    ('ownProgress.error.notAnExport', 'The card, when the chosen file is not a progress file of this app at all. "Piano Academy" is the app''s name, never translated or declined. No placeholders.'),
    ('ownProgress.error.invalidExport', 'The card, when the chosen file is a progress file, but damaged or of another version. No placeholders.'),
    ('ownProgress.error.unreadable', 'The card, when the browser could not read the chosen file. No placeholders.'),
    ('ownProgress.error.signedOut', 'The card, when the sign-in ended before the request. No placeholders.'),
    ('ownProgress.error.otherPerson', 'The card, when somebody else signed in in another tab of the same browser; nothing is sent under their name. No placeholders.'),
    ('ownProgress.error.offline', 'The card, when the server could not be reached. No placeholders.'),
    ('ownProgress.error.notSetUp', 'The card, when the server answered that it is not set up or its database is being updated. No placeholders.'),
    ('ownProgress.error.failed', 'The card, when anything else went wrong. No placeholders.'),
    ('ownProgress.error.hasProgressNow', 'The card, when progress arrived in the learner''s account between the look at the file and bringing it in: the box now shows it, and asks before replacing it. No placeholders.'),
    ('ownProgress.error.reload', 'The card, when the file was brought in but the page could not load the new progress. No placeholders.'),
    -- the top bar (layouts/top-bar): the brand, the menus, the person's menu
    ('brand.area', 'The top bar: the app''s name after "anotoki" in the brand, which links home. A name, never translated or declined. No placeholders. Also in kept-english.ts.'),
    ('brand.short', 'The top bar on a phone: the app''s short name alone beside the anotoki mark - "anotoki Piano Academy" does not fit at 360 px beside the piano, the language, the theme and the menu button. A name, never translated. No placeholders. Also in kept-english.ts.'),
    ('topbar.home', 'The accessible name (aria-label) of the brand''s link in the top bar, which goes to Learn, the home page. It starts with what the link shows ("anotoki Piano Academy"; "Piano" on a phone), so a voice user can say what they see (WCAG 2.5.3, label in name). "anotoki Piano Academy" is the app''s name, never translated. No placeholders. Also in kept-english.ts.'),
    ('topbar.phoneMenu', 'The top bar on a phone: the accessible name of the menu button (three lines) and of the menu it opens - the sections, then the person''s menu. No placeholders. Also in kept-english.ts.'),
    ('topbar.menuButton', 'The accessible name of the person''s button in the top bar (their initial, and their name on a wide screen), which opens their menu. {name}: their username as it is, never translated. Also in kept-english.ts.'),
    ('topbar.menu', 'The accessible name of the person''s menu: name, role, their anotoki account, the admin panel, Sign out. No placeholders. Also in kept-english.ts.'),
    ('topbar.roleAdmin', 'The person''s menu: a small label under the name of somebody with the ADMIN role (keeps the languages and the people, and applies the database''s migrations). No placeholders. Also in kept-english.ts.'),
    ('topbar.roleEditor', 'The person''s menu: a small label under the name of somebody with the EDITOR role (rewords the app''s words). No placeholders. Also in kept-english.ts.'),
    ('topbar.account', 'The person''s menu: the link to their anotoki account page (opens in a new tab). "anotoki" is a name, never translated or capitalised. No placeholders. Also in kept-english.ts.'),
    ('topbar.admin', 'The person''s menu, for EDITOR and ADMIN only: the way into the admin panel (Translations, Languages, People, Migrations), whose pages are in English. Every anotoki site calls it so ("Admin panel"). No placeholders. Also in kept-english.ts.'),
    -- midi: the piano in the top bar - its button, and the box the button opens
    ('midi.button', 'The accessible name (aria-label) of the piano''s button in the top bar, which opens the box with the MIDI devices. {label}: what the button shows (midi.none, or the MIDI device''s own name) - keep it first, so a voice user can say what they see (WCAG 2.5.3, label in name); {status}: the piano''s state as a whole sentence (midi.connected, midi.notConnected, ...), put in as it is. Also in kept-english.ts.'),
    ('midi.none', 'The piano''s button in the top bar, beside its amber dot, while no piano is connected (with one, the device''s own name stands there). Short: the button is narrow. No placeholders. Also in kept-english.ts.'),
    ('midi.title', 'The heading of the box the piano''s button opens: the state, the MIDI devices, Connect, Rescan. No placeholders. Also in kept-english.ts.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    ('signIn.storageUnavailable', 'This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.'),
    ('signOut.title', 'Sign out without your latest progress?'),
    ('signOut.text', 'Some of your progress could not be saved yet. If you sign out now, it is lost.'),
    ('signOut.confirm', 'Sign out anyway'),
    ('signOut.cancel', 'Stay signed in'),
    ('progressChanged.text', 'Your progress was replaced or deleted somewhere else - by a file brought back in another tab, or by an administrator. This page now shows what is saved.'),
    ('progressChanged.close', 'Close'),
    ('ownProgress.title', 'Your progress file'),
    ('ownProgress.text', 'Keep a copy of your progress, or bring it back from a file - from another computer, for example.'),
    ('ownProgress.download', 'Download'),
    ('ownProgress.bringBack', 'Bring back a file'),
    ('ownProgress.working', 'One moment…'),
    ('ownProgress.preview.title', 'What this file brings'),
    ('ownProgress.preview.now', 'Saved now'),
    ('ownProgress.preview.file', 'In the file'),
    ('ownProgress.preview.leftOut.one', '{count} round in the file cannot be used and is left out.'),
    ('ownProgress.preview.leftOut.few', '{count} rounds in the file cannot be used and are left out.'),
    ('ownProgress.preview.leftOut.other', '{count} rounds in the file cannot be used and are left out.'),
    ('ownProgress.preview.replaces', 'Bringing it in replaces your progress: what is saved now is gone for good.'),
    ('ownProgress.preview.bringIn', 'Bring it in'),
    ('ownProgress.preview.replace', 'Replace my progress'),
    ('ownProgress.cancel', 'Cancel'),
    ('ownProgress.confirm.title', 'Replace your progress?'),
    ('ownProgress.confirm.text', 'Your saved progress goes, and the file''s comes in its place. This cannot be undone - download your progress first if you may want it back.'),
    ('ownProgress.confirm.yes', 'Replace'),
    ('ownProgress.confirm.no', 'Keep mine'),
    ('ownProgress.done', 'Your progress from the file is in:'),
    ('ownProgress.count.notes.one', '{count} note'),
    ('ownProgress.count.notes.few', '{count} notes'),
    ('ownProgress.count.notes.other', '{count} notes'),
    ('ownProgress.count.steps.one', '{count} step of the path'),
    ('ownProgress.count.steps.few', '{count} steps of the path'),
    ('ownProgress.count.steps.other', '{count} steps of the path'),
    ('ownProgress.count.rounds.one', '{count} round'),
    ('ownProgress.count.rounds.few', '{count} rounds'),
    ('ownProgress.count.rounds.other', '{count} rounds'),
    ('ownProgress.error.unsaved', 'Some of your progress is not saved yet. Wait until it is, then try again.'),
    ('ownProgress.error.tooLarge', 'That file is too large. A progress file is at most {megabytes} MB.'),
    ('ownProgress.error.exportTooLarge', 'Your progress is too large for one file (at most {megabytes} MB), so it cannot be downloaded here.'),
    ('ownProgress.error.notAnExport', 'That file is not a Piano Academy progress file.'),
    ('ownProgress.error.invalidExport', 'That progress file is damaged or from another version of the app, so nothing was brought in.'),
    ('ownProgress.error.unreadable', 'The browser could not read that file.'),
    ('ownProgress.error.signedOut', 'You are signed out. Sign in, then try again.'),
    ('ownProgress.error.otherPerson', 'Somebody else is signed in now, in another tab. Load the page again.'),
    ('ownProgress.error.offline', 'The server could not be reached. Check the connection and try again.'),
    ('ownProgress.error.notSetUp', 'The app is being updated right now. Try again in a while.'),
    ('ownProgress.error.failed', 'That did not work. Please try again.'),
    ('ownProgress.error.hasProgressNow', 'Meanwhile your account got progress of its own. It is shown below: bringing the file in now replaces it.'),
    ('ownProgress.error.reload', 'The file is in, but this page could not load it. Load the page again.'),
    ('brand.area', 'Piano Academy'),
    ('brand.short', 'Piano'),
    ('topbar.home', 'anotoki Piano Academy: Learn'),
    ('topbar.phoneMenu', 'Menu'),
    ('topbar.menuButton', 'Your menu: {name}'),
    ('topbar.menu', 'Your menu'),
    ('topbar.roleAdmin', 'Administrator'),
    ('topbar.roleEditor', 'Editor'),
    ('topbar.account', 'Your anotoki account'),
    ('topbar.admin', 'Admin panel'),
    ('midi.button', '{label}: {status}'),
    ('midi.none', 'No piano'),
    ('midi.title', 'Your piano')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    ('signIn.storageUnavailable', 'Tento prehliadač nedovolil aplikácii zapamätať si prebiehajúce prihlásenie. Povoľ tejto stránke ukladať údaje a skús to znova.'),
    ('signOut.title', 'Odhlásiť sa bez posledného postupu?'),
    ('signOut.text', 'Časť tvojho postupu sa zatiaľ nepodarilo uložiť. Ak sa teraz odhlásiš, stratí sa.'),
    ('signOut.confirm', 'Aj tak sa odhlásiť'),
    ('signOut.cancel', 'Neodhlasovať sa'),
    ('progressChanged.text', 'Tvoj postup sa medzitým zmenil inde: nahradil ho súbor obnovený na inej karte, alebo ho vymazal správca. Stránka teraz ukazuje to, čo je uložené.'),
    ('progressChanged.close', 'Zavrieť'),
    ('ownProgress.title', 'Súbor s tvojím postupom'),
    ('ownProgress.text', 'Ulož si kópiu svojho postupu alebo ho obnov zo súboru – napríklad z iného počítača.'),
    ('ownProgress.download', 'Stiahnuť'),
    ('ownProgress.bringBack', 'Obnoviť zo súboru'),
    ('ownProgress.working', 'Chvíľku…'),
    ('ownProgress.preview.title', 'Čo prináša tento súbor'),
    ('ownProgress.preview.now', 'Uložené teraz'),
    ('ownProgress.preview.file', 'V súbore'),
    ('ownProgress.preview.leftOut.one', '{count} kolo v súbore sa nedá použiť a vynechá sa.'),
    ('ownProgress.preview.leftOut.few', '{count} kolá v súbore sa nedajú použiť a vynechajú sa.'),
    ('ownProgress.preview.leftOut.other', '{count} kôl v súbore sa nedá použiť a vynechá sa.'),
    ('ownProgress.preview.replaces', 'Obnovením sa tvoj postup nahradí: to, čo je uložené teraz, sa natrvalo stratí.'),
    ('ownProgress.preview.bringIn', 'Obnoviť'),
    ('ownProgress.preview.replace', 'Nahradiť môj postup'),
    ('ownProgress.cancel', 'Zrušiť'),
    ('ownProgress.confirm.title', 'Nahradiť tvoj postup?'),
    ('ownProgress.confirm.text', 'Tvoj uložený postup zmizne a na jeho miesto príde ten zo súboru. Nedá sa to vrátiť – ak ho možno budeš chcieť späť, najprv si ho stiahni.'),
    ('ownProgress.confirm.yes', 'Nahradiť'),
    ('ownProgress.confirm.no', 'Ponechať môj'),
    ('ownProgress.done', 'Postup zo súboru je obnovený:'),
    ('ownProgress.count.notes.one', '{count} nota'),
    ('ownProgress.count.notes.few', '{count} noty'),
    ('ownProgress.count.notes.other', '{count} nôt'),
    ('ownProgress.count.steps.one', '{count} krok cesty'),
    ('ownProgress.count.steps.few', '{count} kroky cesty'),
    ('ownProgress.count.steps.other', '{count} krokov cesty'),
    ('ownProgress.count.rounds.one', '{count} kolo'),
    ('ownProgress.count.rounds.few', '{count} kolá'),
    ('ownProgress.count.rounds.other', '{count} kôl'),
    ('ownProgress.error.unsaved', 'Časť tvojho postupu ešte nie je uložená. Počkaj, kým sa uloží, a skús to znova.'),
    ('ownProgress.error.tooLarge', 'Tento súbor je príliš veľký. Súbor s postupom má najviac {megabytes} MB.'),
    ('ownProgress.error.exportTooLarge', 'Tvoj postup je na jeden súbor príliš veľký (najviac {megabytes} MB), preto sa tu nedá stiahnuť.'),
    ('ownProgress.error.notAnExport', 'Tento súbor nie je súbor s postupom z aplikácie Piano Academy.'),
    ('ownProgress.error.invalidExport', 'Tento súbor s postupom je poškodený alebo z inej verzie aplikácie, preto sa nič neobnovilo.'),
    ('ownProgress.error.unreadable', 'Prehliadač tento súbor nedokázal prečítať.'),
    ('ownProgress.error.signedOut', 'Prihlásenie sa skončilo. Prihlás sa a skús to znova.'),
    ('ownProgress.error.otherPerson', 'Na inej karte je teraz prihlásený niekto iný. Načítaj stránku znova.'),
    ('ownProgress.error.offline', 'Server sa nepodarilo zastihnúť. Skontroluj pripojenie a skús to znova.'),
    ('ownProgress.error.notSetUp', 'Aplikácia sa práve aktualizuje. Skús to o chvíľu znova.'),
    ('ownProgress.error.failed', 'Nepodarilo sa to. Skús to znova.'),
    ('ownProgress.error.hasProgressNow', 'Medzitým pribudol v tvojom účte postup. Je ukázaný nižšie: obnovením zo súboru sa teraz nahradí.'),
    ('ownProgress.error.reload', 'Súbor je obnovený, ale táto stránka ho nedokázala načítať. Načítaj stránku znova.'),
    ('brand.area', 'Piano Academy'),
    ('brand.short', 'Piano'),
    ('topbar.home', 'anotoki Piano Academy: Učenie'),
    ('topbar.phoneMenu', 'Ponuka'),
    ('topbar.menuButton', 'Tvoja ponuka: {name}'),
    ('topbar.menu', 'Tvoja ponuka'),
    ('topbar.roleAdmin', 'Správca'),
    ('topbar.roleEditor', 'Editor'),
    ('topbar.account', 'Tvoj účet anotoki'),
    ('topbar.admin', 'Administrátorský panel'),
    ('midi.button', '{label}: {status}'),
    ('midi.none', 'Bez klavíra'),
    ('midi.title', 'Tvoj klavír')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- A string of 003 that the family's work made untrue: the card "not set up
-- yet" no longer asks whether people sign in (they always do, through the
-- IAM). Reworded in both languages - only where it is still 003's own
-- words, so a wording of the owner's stands.
UPDATE translations SET value = 'Before you can practise, the app needs its database and its sign-in through the anotoki IAM. The setup page asks for both and takes a minute.'
 WHERE key_name = 'boot.notSetUp.text' AND language_code = 'en'
   AND value = 'Before you can practise, the app needs its database - and to know whether people sign in. The setup page asks for both and takes a minute.';

UPDATE translations SET value = 'Skôr než začneš cvičiť, aplikácia potrebuje svoju databázu a prihlasovanie cez anotoki IAM. Stránka nastavenia sa spýta na oboje a zaberie to minútu.'
 WHERE key_name = 'boot.notSetUp.text' AND language_code = 'sk'
   AND value = 'Skôr než začneš cvičiť, aplikácia potrebuje svoju databázu – a musí vedieť, či sa ľudia majú prihlasovať. Stránka nastavenia sa spýta na oboje a zaberie to minútu.';

-- The language chooser's button shows the language's code ("SK"), and its
-- accessible name must hold what it shows (WCAG 2.5.3, label in name: a
-- voice user says "click SK"): 003's "Language: {name}" gets the code, which
-- the chooser passes as {code}. Only where it is still 003's own words.
UPDATE translations SET value = 'Language: {name} ({code})'
 WHERE key_name = 'language.button' AND language_code = 'en' AND value = 'Language: {name}';

UPDATE translations SET value = 'Jazyk: {name} ({code})'
 WHERE key_name = 'language.button' AND language_code = 'sk' AND value = 'Jazyk: {name}';

-- The keys the top bar took the place of: the footer's link to the admin
-- panel (the bar's menu has "Admin panel" now), the header's "My account" (the
-- bar says "Your anotoki account", a new key: the meaning changed) and its
-- "Signed out" (the bar offers Sign in; the banner says it). Their strings
-- go with them (ON DELETE CASCADE); nothing asks for them any more.
DELETE FROM translation_keys WHERE name IN ('footer.translations', 'account.myAccount', 'account.signedOut');

-- What the translator reads about a key whose place moved from the old
-- header and footer into the top bar. Descriptions are the code's (the
-- browser never edits them), so they are written over by name.
UPDATE translation_keys k SET description = v.description FROM (VALUES
    ('language.button', 'The accessible name (aria-label) of the language chooser''s round button in the top bar; the button itself shows only the language''s code ("SK"). {name}: the current language as its speakers write it ("Slovenčina"), never translated. {code}: the code the button shows ("SK") - keep it in, so a voice user can say what they see (WCAG 2.5.3, label in name).'),
    ('language.notLoaded', 'The small note under the language chooser''s button in the top bar when a language chosen there could not be fetched; the page stays in the language it was in, and the note goes at the next press. No placeholders.'),
    ('signIn.button', 'The button that starts signing in, in three places: on the sign-in card, in the top bar (and its menu on a phone) when the sign-in ended, and in the signed-out banner. A verb. No placeholders. Also in kept-english.ts.'),
    ('nav.label', 'The accessible name (aria-label) of the top bar''s sections (Learn, Note Trainer, ...); not visible. No placeholders. Also in kept-english.ts. The same words as the anotoki account site uses for its navigation.'),
    ('nav.learn', 'The top bar''s sections (in the menu on a phone): the home page with the learning path. No placeholders. Also in kept-english.ts.'),
    ('nav.trainer', 'The top bar''s sections, and the home page''s free-practice buttons: the Note Trainer (flashcards of single notes). No placeholders. Also in kept-english.ts.'),
    ('nav.sheet', 'The top bar''s sections, and the home page''s free-practice buttons: Sheet Practice (a short piece made of the notes already learned). No placeholders. Also in kept-english.ts.'),
    ('nav.songs', 'The top bar''s sections, and the home page''s free-practice buttons: the list of songs. No placeholders. Also in kept-english.ts.'),
    ('nav.stats', 'The top bar''s sections, and the home page''s free-practice buttons: the statistics page. No placeholders. Also in kept-english.ts.'),
    ('account.notSaved', 'The top bar: a small pill shown while some progress has not reached the server yet (on a phone a dot on the menu button, and this as the menu''s first line). No placeholders. Also in kept-english.ts.'),
    ('account.notSavedHint', 'The tooltip (title) of the "Not saved yet" pill in the top bar, and the line under it in the menus. No placeholders. Also in kept-english.ts.'),
    ('account.signedIn', 'The top bar''s person''s menu: what stands where the person''s name would, when somebody is signed in and the account gives no username and no e-mail address. Nothing gendered about the person. No placeholders. Also in kept-english.ts.'),
    ('account.signOut', 'The person''s menu in the top bar: the item that signs out. No placeholders. Also in kept-english.ts.'),
    ('account.signedOutBanner', 'The banner under the top bar when the sign-in ended in the middle of practising; the Sign in button stands beside it. Nothing gendered about the person. No placeholders. Also in kept-english.ts.'),
    ('midi.connected', 'The piano''s state while a piano is connected: in the box the top bar''s piano button opens, and in that button''s name. {name}: the MIDI device''s own name as the browser gives it ("KAWAI ES120"), never translated or declined - keep it after the colon. Also in kept-english.ts.'),
    ('midi.notConnected', 'The piano''s state while no piano is connected and nothing went wrong: in the box the top bar''s piano button opens, and in that button''s name. No placeholders. Also in kept-english.ts.'),
    ('midi.unsupported', 'The piano''s state in a browser that has no Web MIDI: in the box the top bar''s piano button opens, and in that button''s name. "Web MIDI", "Chrome" and "Edge" are names, never translated. No placeholders. Also in kept-english.ts.'),
    ('midi.refused', 'The piano''s state when the browser would not give the app the MIDI devices (the permission was denied, or asking failed): in the piano''s box in the top bar. The page may add a colon and the browser''s own English words after it, so the sentence has no full stop. "MIDI" is a term, never translated or declined. No placeholders. Also in kept-english.ts.'),
    ('midi.failed', 'The piano''s state when the chosen MIDI device could not be connected: in the piano''s box in the top bar. The page may add a colon and an English detail after it, so the sentence has no full stop. No placeholders. Also in kept-english.ts.'),
    ('midi.device', 'The accessible name (aria-label) of the list of MIDI devices in the piano''s box in the top bar; not visible. "MIDI" is a term, never translated. No placeholders. Also in kept-english.ts.'),
    ('midi.noDevices', 'The one (disabled) entry of the list of MIDI devices in the piano''s box when the browser found none. "MIDI" is a term, never translated. No placeholders. Also in kept-english.ts. The list is narrow (14rem) and cuts a longer entry: keep it about as short as the English.'),
    ('midi.connect', 'The piano''s box in the top bar: the button that connects the MIDI device chosen in the list. No placeholders. Also in kept-english.ts.'),
    ('midi.rescan', 'The tooltip and accessible name of the round-arrow button in the piano''s box, which asks the browser for the MIDI devices again. "MIDI" is a term, never translated. No placeholders. Also in kept-english.ts.'),
    ('theme.auto', 'The tooltip (title) of the top bar''s round theme button while the theme follows the system''s setting. Pressing the button goes on to light, then dark. No placeholders. Also in kept-english.ts.'),
    ('theme.light', 'The tooltip (title) of the top bar''s round theme button while the light theme is chosen. No placeholders. Also in kept-english.ts.'),
    ('theme.dark', 'The tooltip (title) of the top bar''s round theme button while the dark theme is chosen. No placeholders. Also in kept-english.ts.'),
    ('theme.autoSpoken', 'What the top bar''s theme button says to a screen reader (aria-label) while the theme follows the system''s setting: the same as theme.auto, and that pressing changes it. No placeholders. Also in kept-english.ts.'),
    ('theme.lightSpoken', 'What the top bar''s theme button says to a screen reader (aria-label) while the light theme is chosen: the same as theme.light, and that pressing changes it. No placeholders. Also in kept-english.ts.'),
    ('theme.darkSpoken', 'What the top bar''s theme button says to a screen reader (aria-label) while the dark theme is chosen: the same as theme.dark, and that pressing changes it. No placeholders. Also in kept-english.ts.')
) AS v(name, description)
 WHERE k.name = v.name;

-----------------------------------------------------------
-- PROVE IT
--
-- Exactly what the schema part adds, in the shape the code reads it: the
-- sequence, and the column - a bigint, never null, numbered from the
-- sequence - with a number on every users row, each its own.
-----------------------------------------------------------

DO $$
BEGIN
    IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('progress_generation')) IS DISTINCT FROM 'S' THEN
        RAISE EXCEPTION 'the sequence progress_generation is not there';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'progress_generation'
                      AND data_type = 'bigint' AND is_nullable = 'NO'
                      AND column_default = 'nextval(''progress_generation''::regclass)') THEN
        RAISE EXCEPTION 'users.progress_generation is not a bigint, never null, numbered from progress_generation';
    END IF;
    IF EXISTS (SELECT progress_generation FROM users GROUP BY progress_generation HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'two users rows have the same progress_generation';
    END IF;
END $$;

-----------------------------------------------------------
-- PROVE IT: THE STRINGS
--
-- Every key this file writes is here and reads in both languages: a page
-- never shows a key, and Slovak never falls back to English by accident.
-- The keys it retires are gone, and no description tells of the old header,
-- its account panel or the footer's link any more; the menu's way into
-- the admin panel is called so, and no description calls it otherwise.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('signIn.storageUnavailable'), ('signOut.title'), ('signOut.text'), ('signOut.confirm'), ('signOut.cancel'),
          ('progressChanged.text'), ('progressChanged.close'), ('ownProgress.title'), ('ownProgress.text'),
          ('ownProgress.download'), ('ownProgress.bringBack'), ('ownProgress.working'), ('ownProgress.preview.title'),
          ('ownProgress.preview.now'), ('ownProgress.preview.file'), ('ownProgress.preview.leftOut.one'),
          ('ownProgress.preview.leftOut.few'), ('ownProgress.preview.leftOut.other'), ('ownProgress.preview.replaces'),
          ('ownProgress.preview.bringIn'), ('ownProgress.preview.replace'), ('ownProgress.cancel'),
          ('ownProgress.confirm.title'), ('ownProgress.confirm.text'), ('ownProgress.confirm.yes'),
          ('ownProgress.confirm.no'), ('ownProgress.done'), ('ownProgress.count.notes.one'),
          ('ownProgress.count.notes.few'), ('ownProgress.count.notes.other'), ('ownProgress.count.steps.one'),
          ('ownProgress.count.steps.few'), ('ownProgress.count.steps.other'), ('ownProgress.count.rounds.one'),
          ('ownProgress.count.rounds.few'), ('ownProgress.count.rounds.other'), ('ownProgress.error.unsaved'),
          ('ownProgress.error.tooLarge'), ('ownProgress.error.exportTooLarge'), ('ownProgress.error.notAnExport'),
          ('ownProgress.error.invalidExport'), ('ownProgress.error.unreadable'), ('ownProgress.error.signedOut'),
          ('ownProgress.error.otherPerson'), ('ownProgress.error.offline'), ('ownProgress.error.notSetUp'),
          ('ownProgress.error.failed'), ('ownProgress.error.hasProgressNow'), ('ownProgress.error.reload'),
          ('brand.area'), ('brand.short'), ('topbar.home'), ('topbar.phoneMenu'), ('topbar.menuButton'), ('topbar.menu'),
          ('topbar.roleAdmin'), ('topbar.roleEditor'), ('topbar.account'), ('topbar.admin'), ('midi.button'),
          ('midi.none'), ('midi.title')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
    IF EXISTS (SELECT 1 FROM translation_keys WHERE name IN ('footer.translations', 'account.myAccount', 'account.signedOut')) THEN
        RAISE EXCEPTION 'a key the top bar took the place of is still there';
    END IF;
    IF EXISTS (SELECT 1 FROM translation_keys WHERE description ILIKE '%header%' OR description ILIKE '%account panel%' OR description ILIKE '%footer''s theme%') THEN
        RAISE EXCEPTION 'a description still tells of the old header or footer';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM translation_keys WHERE name = 'language.button' AND description LIKE '%{code}%') THEN
        RAISE EXCEPTION 'the description of language.button does not tell of {code}';
    END IF;
    -- "Admin panel" on every anotoki site (the owner, 2026-10-04): the menu's way in, in both
    -- languages, and no description calling it anything else.
    IF (SELECT value FROM translations WHERE key_name = 'topbar.admin' AND language_code = 'en') IS DISTINCT FROM 'Admin panel'
       OR (SELECT value FROM translations WHERE key_name = 'topbar.admin' AND language_code = 'sk') IS DISTINCT FROM 'Administrátorský panel' THEN
        RAISE EXCEPTION 'topbar.admin is not "Admin panel" / "Administrátorský panel"';
    END IF;
    IF EXISTS (SELECT 1 FROM translation_keys WHERE description ILIKE '%admin area%' OR description ILIKE '%admin console%') THEN
        RAISE EXCEPTION 'a description still calls the admin panel something else';
    END IF;
END $$;
