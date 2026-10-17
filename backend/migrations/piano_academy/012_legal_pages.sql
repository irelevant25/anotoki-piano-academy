-----------------------------------------------------------
-- TERMS, PRIVACY AND CONTACT: PIANO ACADEMY'S FACTS IN THE FAMILY'S PAGES
--
-- Finished (2026-10-18). The owner applies it with 005 to 011 at the
-- hand-over (after a pg_dump of the database): on this computer by Save on
-- /setup.php (or php migration.php, or an ADMIN's "Apply pending" on the
-- admin panel's Migrations page); on the host, upload the build and apply
-- it at once on the Migrations page. The anotoki library's sets of the
-- words (anotoki_translations: its 005 is the legal pages' own words, 006
-- to 010 the kit's newer pieces') and of the people run right after it, in
-- the same Apply. Until then the site tells everybody it is being updated,
-- and an ADMIN that a database update is waiting. Once applied it never
-- changes: the next change is 013.
--
-- From anotoki-lib 0.6.0 every anotoki site shows Terms, Privacy and
-- Contact - the family's pages (@anotoki/lib/legal/pages), their structure
-- and shared words the library's (anotoki.legal.*), each site's facts its
-- own (the frontend's core/legal/legal-facts.ts names them). These are
-- Piano Academy's facts, true of the code as it is - what it keeps, what
-- for and how long, its browser storage by name - in English and informal
-- Slovak (ty, and nothing gendered about the learner):
--
--   legal.about                  what Piano Academy is (Terms' first words)
--   legal.record.*               the record of a person (users)
--   legal.progress.*             the progress (progress, path_progress, sessions)
--   legal.limits.*               the counts that stop floods (keyed codes, a day / an hour)
--   legal.words.*                who saved a word (translations.updated_by)
--   legal.visitors.*             practising without an account ({days}: 30)
--   legal.feedback.*             the form at the foot of every page
--   legal.auditLog.what          the audit log - the staff's changes and a person's own progress file brought back
--   legal.backups.*              the backups, kept by count
--   legal.storage.*              the cookies and stored items the library has no words for
--
-- No string holds an address: where a link goes (the anotoki account's
-- pages, the operator, Cloudflare, the authority) is the code's, never a
-- string an administrator rewords (the library's 0.6.0 review; a test
-- holds it). The tab's titles of the three pages (title.terms,
-- title.privacy, title.contact, also in kept-english.ts) and the name of
-- the lesson's row of step dots (lesson.steps: the family's dots, heard
-- "Step 2 of 5: ...") come with them; brand.area, the app's name, is the
-- site's name on the pages too, and its description says so.
--
-- What's new's sentence for a list of changes that did not load
-- (whatsNew.notLoaded) goes, its strings with it (ON DELETE CASCADE): the
-- dialog opens only from the footer's version, which is there only while
-- the list came, so nothing could ever show it - and the key scan fails on
-- a key nobody asks for.
--
-- In 003's form: a key, its English and its Slovak string, every insert
-- stepping aside for a row that is already there; then the description,
-- the delete and the strings' gate. Nothing else of the schema, and nothing
-- of anybody's progress, changes. One string on a line, an apostrophe
-- written twice and nothing else escaped: that is all the statement
-- splitter knows of a string.
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- title: the browser tab's titles of the legal pages
    ('title.terms', 'The browser tab''s title of the Terms of use page (/terms, the anotoki family''s legal page), before " · Piano Academy". The same words as the page''s own heading (the library''s anotoki.legal.termsTitle). No placeholders. Also in kept-english.ts.'),
    ('title.privacy', 'The browser tab''s title of the Privacy policy page (/privacy, the anotoki family''s legal page), before " · Piano Academy". The same words as the page''s own heading (the library''s anotoki.legal.privacyTitle). No placeholders. Also in kept-english.ts.'),
    ('title.contact', 'The browser tab''s title of the Contact page (/contact, the anotoki family''s legal page), before " · Piano Academy". The same words as the page''s own heading (the library''s anotoki.legal.contactTitle). No placeholders. Also in kept-english.ts.'),
    -- lesson: the unit's steps as dots above a lesson's step
    ('lesson.steps', 'A lesson''s page: the name a screen reader hears for the row of the unit''s steps above the step (the family''s step dots, each a pill of the step''s short name); not shown. Each step is heard by its whole name (path.step.*.title), the one in hand as "Step 2 of 5: ...". No placeholders.'),
    -- legal: Piano Academy's facts on the family's Terms, Privacy and Contact pages (the library''s words around them)
    ('legal.about', 'Terms of use, its first section ("What Piano Academy is"): what Piano Academy is, a sentence or two - the library''s next sentence says it is one of the anotoki sites, run by its operator, free to use. No address in it. No placeholders.'),
    ('legal.record.name', 'The Privacy page: the heading of one part of what Piano Academy keeps - its record of each person who signs in - and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.record.what', 'The Privacy page, the record of a person: exactly what it holds (the anotoki account''s id and name from the sign-in, first and last use, the number that keeps an old tab from saving over newer progress) - and never an e-mail address. No placeholders.'),
    ('legal.record.why', 'The Privacy page, the record of a person: what it is for (under "What for"). No placeholders.'),
    ('legal.record.kept', 'The Privacy page, the record of a person: how long it stays (under "How long it is kept") - until an administrator deletes the person''s data on the People page; when the anotoki account is deleted, the name goes from it. No placeholders.'),
    ('legal.progress.name', 'The Privacy page: the heading of the part about each person''s progress (the notes, the path''s steps, the rounds), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.progress.what', 'The Privacy page, the progress: what it holds - each note''s review schedule, the path''s steps passed with their best score, and a log of every practice round (when, mode, lesson or song, tempo, notes right, timing). No placeholders.'),
    ('legal.progress.why', 'The Privacy page, the progress: what it is for (under "What for"). No placeholders.'),
    ('legal.progress.kept', 'The Privacy page, the progress: how long it stays - no time limit: until the person replaces it with a progress file of their own or an administrator deletes their data; it stays, nameless, when the account is deleted. No placeholders.'),
    ('legal.limits.name', 'The Privacy page: the heading of the part about the counts that stop one sender from flooding the site (feedback, error reports, new visitors), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.limits.what', 'The Privacy page, the limits: what is counted, and how - by the account, or by a code made from the IP address with a secret key, never the address itself. No placeholders.'),
    ('legal.limits.why', 'The Privacy page, the limits: what they are for (under "What for"). No placeholders.'),
    ('legal.limits.kept', 'The Privacy page, the limits: how long a count stays - a day, the new visitors'' count an hour, then deleted at the next count. No placeholders.'),
    ('legal.words.name', 'The Privacy page: the heading of the part about the people who keep the site''s words (editors and administrators: who saved a word, and when), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.words.what', 'The Privacy page, the words'' writers: what is kept - each word''s last writer and when. No placeholders.'),
    ('legal.words.why', 'The Privacy page, the words'' writers: what it is for (under "What for"). No placeholders.'),
    ('legal.words.kept', 'The Privacy page, the words'' writers: how long - until the word is saved again; a person''s data deleted leaves the word, saved by nobody. No placeholders.'),
    ('legal.visitors.what', 'The Privacy page, the part "Using the site without an account" (its heading the library''s): what is kept while Piano Academy lets people practise without signing in - their progress under a random key of the browser''s (only a hash of it kept), when made and last used. No placeholders.'),
    ('legal.visitors.why', 'The Privacy page, practising without an account: what it is for (under "What for"). No placeholders.'),
    ('legal.visitors.kept', 'The Privacy page, practising without an account: how long it stays - until a sign-in moves it into the account, or {days} days after the last visit. {days}: a whole number of days (30), the same as the note under the top bar says.'),
    ('legal.feedback.what', 'The Privacy page, the part "Feedback" (its heading the library''s): exactly what a message sent with the form keeps - the words, its kind and part of Piano Academy, the page without anything after ? or #, its language, the browser, the account unless sent without the name, a reply address only if left. No placeholders.'),
    ('legal.feedback.kept', 'The Privacy page, feedback: how long a message stays - until an administrator deletes it; one marked as spam 30 days, a resolved one a year (deleted with the first message sent after that day); the reply address and browser go when the account is deleted. No placeholders.'),
    ('legal.auditLog.what', 'The Privacy page, the part "The audit log" (its heading the library''s): what it keeps - the editors'' and administrators'' changes in the admin panel, and each progress file a person brings back into their own account: who, what and when; never an IP address. No placeholders.'),
    ('legal.backups.what', 'The Privacy page, the part "Backups" (its heading the library''s): what a backup is and when one is made; the library''s sentence on where they are kept follows it. No placeholders.'),
    ('legal.backups.kept', 'The Privacy page, backups: how long they stay - kept by count (14 daily, made only on days the site is used; 5 before an update; 5 before a restore; one by hand until deleted), and what is deleted stays in the copies made before. No placeholders.'),
    ('legal.storage.signIn.purpose', 'The Privacy page, "Cookies and storage in your browser": what the sign-in''s stored item is for (anotoki-auth:piano-academy, the keys the anotoki account gave this site). No placeholders.'),
    ('legal.storage.signInUnderWay.purpose', 'The Privacy page, browser storage: the items a sign-in keeps for its tab while it is on its way to the anotoki account and back (one-time check values, the account''s public settings). No placeholders.'),
    ('legal.storage.signInUnderWay.kept', 'The Privacy page, browser storage: how long a sign-in on its way keeps its items - until it comes back (the settings an hour), never longer than the tab is open. No placeholders.'),
    ('legal.storage.hint.purpose', 'The Privacy page, browser storage: the anotoki account''s cookie for every anotoki site (anotoki_signed_in) - it reaches Piano Academy too, which never reads it. No placeholders.'),
    ('legal.storage.tabLanguage.purpose', 'The Privacy page, browser storage: the language a link with ?lang= chose, kept for that tab alone. No placeholders.'),
    ('legal.storage.untilTabClosed', 'The Privacy page, browser storage: how long an item kept for one tab stays - until the tab is closed. No placeholders.'),
    ('legal.storage.visitorKey.kept', 'The Privacy page, browser storage: how long the key of somebody practising without an account stays in the browser - until a sign-in moves the progress into the account, the site no longer knows it, or the site''s data is cleared. No placeholders.'),
    ('legal.storage.outbox.purpose', 'The Privacy page, browser storage: the finished practice rounds that wait in the browser until the server has them. No placeholders.'),
    ('legal.storage.outbox.kept', 'The Privacy page, browser storage: how long a finished round waits in the browser - until the server has it, or refuses it for good. No placeholders.'),
    ('legal.storage.replaced.purpose', 'The Privacy page, browser storage: the note a tab leaves after a progress file is brought back, so that the other tabs load the new progress. No placeholders.'),
    ('legal.storage.replaced.kept', 'The Privacy page, browser storage: how long that note stays - until the next file brought back, or the site''s data is cleared. No placeholders.'),
    ('legal.storage.piano.purpose', 'The Privacy page, browser storage: the name of the piano (the MIDI device) last connected, so that the site connects to it again. No placeholders.'),
    ('legal.storage.piano.kept', 'The Privacy page, browser storage: how long the piano''s name stays - until another piano is connected, or the site''s data is cleared. No placeholders.'),
    ('legal.storage.wordDrafts.purpose', 'The Privacy page, browser storage: for editors and administrators, the words typed on the admin panel''s Translations page and not saved yet (that page''s name is English, as the admin panel is). No placeholders.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    ('title.terms', 'Terms of use'),
    ('title.privacy', 'Privacy policy'),
    ('title.contact', 'Contact'),
    ('lesson.steps', 'The unit''s steps'),
    ('legal.about', 'Piano Academy teaches you to read notes and play them on a piano connected to your computer - any USB-MIDI keyboard: a learning path of short lessons, free practice, and your progress kept for you.'),
    ('legal.record.name', 'Your record'),
    ('legal.record.what', 'Your anotoki account''s id and the name it gives (copied from your sign-in), when you first and last used Piano Academy, and a number that changes whenever your progress is replaced, so that an older browser tab cannot save over it.'),
    ('legal.record.why', 'To keep your progress under your account, and show it to you alone.'),
    ('legal.record.kept', 'Until an administrator deletes your data here (a later visit makes a new, empty record). When your anotoki account is deleted, without your name.'),
    ('legal.progress.name', 'Your progress'),
    ('legal.progress.what', 'How well you know each note and when it is next due for review, the steps of the learning path you have passed with your best score in each, and a log of your practice rounds: when, which mode, lesson or song, the tempo, how many notes were right, and your timing.'),
    ('legal.progress.why', 'To show you your progress and choose what you practise next - on every computer you sign in on.'),
    ('legal.progress.kept', 'Until you replace it with a progress file of your own, or an administrator deletes your data here - no time limit. When your anotoki account is deleted, it stays, without your name.'),
    ('legal.limits.name', 'Limits against floods'),
    ('legal.limits.what', 'How many feedback messages and error reports each sender sends, and how many people start practising without an account from one address - counted by the sender''s account, or by a code made from the IP address with a secret key, never the address itself.'),
    ('legal.limits.why', 'To keep Piano Academy working for everybody when somebody sends too much.'),
    ('legal.limits.kept', 'A day - the count of people starting without an account, an hour - and then deleted at the next count.'),
    ('legal.words.name', 'If you keep the site''s words'),
    ('legal.words.what', 'Editors and administrators reword Piano Academy''s words in its admin panel: each word keeps who saved it last, and when.'),
    ('legal.words.why', 'So that the people who keep the words know who changed what.'),
    ('legal.words.kept', 'Until the word is saved again. When an administrator deletes that person''s data here, the word stays, saved by nobody.'),
    ('legal.visitors.what', 'While Piano Academy lets you practise without signing in: your progress - the notes, the path''s steps and your rounds - under a random key this browser keeps (the site keeps only a hash of it), and when it was made and last used.'),
    ('legal.visitors.why', 'So that you can practise without an account - and take your progress into your account when you sign in.'),
    ('legal.visitors.kept', 'Until you sign in - it then moves into your account - or {days} days after your last visit, when it is deleted.'),
    ('legal.feedback.what', 'What you send with the form at the foot of every page: your message, its kind and the part of Piano Academy it is about, the page''s address without anything after ? or #, the page''s language and your browser''s name; your account''s id, unless you send it without your name; and an address to answer you at, only if you leave one (signed in, the form writes your account''s in - you may change it or clear it).'),
    ('legal.feedback.kept', 'Until an administrator deletes it - a message marked as spam goes 30 days later, a resolved one a year later (with the first message sent after that day). When your anotoki account is deleted, or an administrator deletes your data here, the reply address and the browser go from your messages; the words stay.'),
    ('legal.auditLog.what', 'What the site''s editors and administrators do in its admin panel - the words and languages saved, a person''s data deleted, an update applied, the backups, the error log and feedback handled - and each progress file somebody brings back into their own account: who, what and when. Never an IP address.'),
    ('legal.backups.what', 'A copy of the site''s whole database: one on each day the site is used, one before every update and every restore, and one whenever an administrator makes it. Each copy holds what the site kept when it was made.'),
    ('legal.backups.kept', 'The 14 newest daily copies - made only on days the site is used, so they may reach back further than 14 days -, the 5 newest made before an update and the 5 newest made before a restore; a copy made by hand until an administrator deletes it. What is deleted on the site stays in the copies made before, until they go.'),
    ('legal.storage.signIn.purpose', 'Your sign-in to this site: the keys your anotoki account gave it, and whose they are.'),
    ('legal.storage.signInUnderWay.purpose', 'A sign-in on its way: the one-time values it is checked with, and the anotoki account''s public settings.'),
    ('legal.storage.signInUnderWay.kept', 'Until the sign-in comes back - the settings an hour -, and never longer than the tab is open.'),
    ('legal.storage.hint.purpose', 'Set by the anotoki account when you sign in there, for every anotoki site. It reaches this site too, which never reads it.'),
    ('legal.storage.tabLanguage.purpose', 'The language a link with ?lang= chose, for this tab alone.'),
    ('legal.storage.untilTabClosed', 'Until the tab is closed.'),
    ('legal.storage.visitorKey.kept', 'Until you sign in (your progress then moves into your account), the site no longer knows the key, or you clear the site''s data in your browser.'),
    ('legal.storage.outbox.purpose', 'The practice rounds you finished that have not reached the server yet, so that none is lost when the connection fails.'),
    ('legal.storage.outbox.kept', 'Until the server has them, or refuses one for good.'),
    ('legal.storage.replaced.purpose', 'A short note a tab leaves when you bring back a progress file, so that your other tabs load the new progress.'),
    ('legal.storage.replaced.kept', 'Until the next file you bring back, or until you clear the site''s data in your browser.'),
    ('legal.storage.piano.purpose', 'The name of the piano last connected, so that the site connects to it again.'),
    ('legal.storage.piano.kept', 'Until another piano is connected, or you clear the site''s data in your browser.'),
    ('legal.storage.wordDrafts.purpose', 'For editors and administrators: the words typed on the Translations page and not saved yet.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    ('title.terms', 'Podmienky používania'),
    ('title.privacy', 'Ochrana osobných údajov'),
    ('title.contact', 'Kontakt'),
    ('lesson.steps', 'Kroky lekcie'),
    ('legal.about', 'Piano Academy ťa naučí čítať noty a hrať ich na klavíri pripojenom k počítaču – stačí akékoľvek USB-MIDI zariadenie: cesta z krátkych lekcií, voľné cvičenie a tvoj uložený postup.'),
    ('legal.record.name', 'Tvoj záznam'),
    ('legal.record.what', 'Identifikátor tvojho účtu anotoki a meno, ktoré účet poskytne (prevzaté pri prihlásení), čas prvého a posledného použitia Piano Academy a číslo, ktoré sa mení pri každom nahradení tvojho postupu, aby ho stará karta prehliadača neprepísala.'),
    ('legal.record.why', 'Aby sa tvoj postup uchovával pod tvojím účtom a bol viditeľný len pre teba.'),
    ('legal.record.kept', 'Kým tvoje údaje tu nezmaže správca (ďalšia návšteva vytvorí nový, prázdny záznam). Po zmazaní účtu anotoki už bez tvojho mena.'),
    ('legal.progress.name', 'Tvoj postup'),
    ('legal.progress.what', 'Ako dobre poznáš jednotlivé noty a kedy sú znova na zopakovanie, kroky cesty, ktoré máš za sebou, s najlepším výsledkom v každom z nich, a záznam tvojich kôl: kedy, aký režim, lekcia či skladba, tempo, koľko nôt bolo správne a tvoje načasovanie.'),
    ('legal.progress.why', 'Aby sa ti ukazoval tvoj postup a vyberalo sa, čo cvičiť ďalej – na každom počítači, kde sa prihlásiš.'),
    ('legal.progress.kept', 'Kým ho nenahradíš vlastným súborom s postupom alebo kým tvoje údaje tu nezmaže správca – bez časového obmedzenia. Po zmazaní účtu anotoki zostáva, ale bez tvojho mena.'),
    ('legal.limits.name', 'Obmedzenia proti zahlteniu'),
    ('legal.limits.what', 'Koľko správ spätnej väzby a hlásení o chybách pošle každý odosielateľ a koľko ľudí začne cvičiť bez účtu z jednej adresy – počíta sa podľa účtu odosielateľa alebo podľa kódu, ktorý vznikne z IP adresy s tajným kľúčom, nikdy nie podľa samotnej adresy.'),
    ('legal.limits.why', 'Aby Piano Academy fungovala pre všetkých, aj keď niekto posiela priveľa.'),
    ('legal.limits.kept', 'Deň – počet ľudí, ktorí začnú bez účtu, hodinu – a potom sa pri ďalšom počítaní zmaže.'),
    ('legal.words.name', 'Ak spravuješ slová stránky'),
    ('legal.words.what', 'Editori a správcovia upravujú slová Piano Academy v administrátorskom paneli: pri každom slove sa uchováva, kto ho naposledy uložil a kedy.'),
    ('legal.words.why', 'Aby tí, čo spravujú slová, vedeli, kto čo zmenil.'),
    ('legal.words.kept', 'Kým sa slovo znova neuloží. Keď údaje toho človeka tu zmaže správca, slovo zostane, ale bez toho, kto ho uložil.'),
    ('legal.visitors.what', 'Kým Piano Academy dovolí cvičiť bez prihlásenia: tvoj postup – noty, kroky cesty a tvoje kolá – pod náhodným kľúčom, ktorý uchováva tento prehliadač (stránka si z neho necháva len odtlačok), a kedy vznikol a kedy sa naposledy použil.'),
    ('legal.visitors.why', 'Aby sa dalo cvičiť bez účtu – a pri prihlásení sa postup presunul do tvojho účtu.'),
    ('legal.visitors.kept', 'Kým sa neprihlásiš – vtedy sa presunie do tvojho účtu – alebo {days} dní od tvojej poslednej návštevy, keď sa zmaže.'),
    ('legal.feedback.what', 'Čo pošleš formulárom na konci každej stránky: tvoju správu, jej druh a časť Piano Academy, ktorej sa týka, adresu stránky bez všetkého za ? alebo #, jazyk stránky a názov tvojho prehliadača; identifikátor tvojho účtu, ak ju nepošleš bez mena; a adresu na odpoveď, len ak nejakú necháš (po prihlásení do formulára vpíše adresu tvojho účtu – môžeš ju zmeniť alebo vymazať).'),
    ('legal.feedback.kept', 'Kým ju správca nezmaže – správa označená ako spam zanikne o 30 dní, vyriešená o rok (s prvou správou poslanou po tom dni). Po zmazaní tvojho účtu anotoki, alebo keď tvoje údaje tu zmaže správca, sa z tvojich správ odstráni adresa na odpoveď aj údaj o prehliadači; text zostáva.'),
    ('legal.auditLog.what', 'Čo robia editori a správcovia stránky v administrátorskom paneli – uložené slová a jazyky, zmazané údaje človeka, použitá aktualizácia, zálohy, záznam chýb a spätná väzba – a každý súbor s postupom, ktorý si niekto obnoví do vlastného účtu: kto, čo a kedy. Nikdy nie IP adresa.'),
    ('legal.backups.what', 'Kópia celej databázy stránky: jedna v každý deň, keď sa stránka používa, jedna pred každou aktualizáciou a obnovením a jedna vždy, keď ju vytvorí správca. Každá kópia obsahuje to, čo stránka uchovávala v čase jej vzniku.'),
    ('legal.backups.kept', '14 najnovších denných kópií – vznikajú len v dni, keď sa stránka používa, takže môžu siahať ďalej ako 14 dní –, 5 najnovších kópií pred aktualizáciou a 5 najnovších pred obnovením; ručne vytvorená kópia, kým ju správca nezmaže. Čo sa na stránke zmaže, zostáva v skôr vytvorených kópiách, kým nezaniknú.'),
    ('legal.storage.signIn.purpose', 'Tvoje prihlásenie na tejto stránke: kľúče, ktoré jej dal tvoj účet anotoki, a komu patria.'),
    ('legal.storage.signInUnderWay.purpose', 'Prihlásenie, ktoré práve prebieha: jednorazové hodnoty, ktorými sa overuje, a verejné nastavenia účtu anotoki.'),
    ('legal.storage.signInUnderWay.kept', 'Kým sa prihlásenie nevráti – nastavenia hodinu –, a nikdy nie dlhšie, než je karta otvorená.'),
    ('legal.storage.hint.purpose', 'Nastavuje ho účet anotoki pri prihlásení, pre všetky stránky anotoki. Dostane sa aj na túto stránku, ktorá ho nikdy nečíta.'),
    ('legal.storage.tabLanguage.purpose', 'Jazyk, ktorý zvolil odkaz s ?lang=, len pre túto kartu.'),
    ('legal.storage.untilTabClosed', 'Kým sa karta nezatvorí.'),
    ('legal.storage.visitorKey.kept', 'Kým sa neprihlásiš (tvoj postup sa vtedy presunie do tvojho účtu), kým kľúč stránka už nepozná alebo kým nevymažeš údaje stránky v prehliadači.'),
    ('legal.storage.outbox.purpose', 'Dokončené kolá, ktoré sa ešte nedostali na server, aby sa žiadne nestratilo, keď zlyhá pripojenie.'),
    ('legal.storage.outbox.kept', 'Kým ich server nemá alebo kým niektoré natrvalo neodmietne.'),
    ('legal.storage.replaced.purpose', 'Krátka poznámka, ktorú zanechá karta, keď obnovíš postup zo súboru, aby si tvoje ostatné karty načítali nový postup.'),
    ('legal.storage.replaced.kept', 'Do ďalšieho obnovenia zo súboru alebo do vymazania údajov stránky v prehliadači.'),
    ('legal.storage.piano.purpose', 'Názov naposledy pripojeného klavíra, aby sa k nemu stránka znova pripojila.'),
    ('legal.storage.piano.kept', 'Kým sa nepripojí iný klavír alebo kým nevymažeš údaje stránky v prehliadači.'),
    ('legal.storage.wordDrafts.purpose', 'Pre editorov a správcov: slová napísané na stránke Translations, ktoré ešte nie sú uložené.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- The app's name is the site's name on the legal pages too: what the translator reads about it says so.
UPDATE translation_keys SET description = 'The top bar: the app''s name after "anotoki" in the brand, which links home - and the site''s name the legal pages (Terms, Privacy, Contact) say. A name, never translated or declined. No placeholders. Also in kept-english.ts.'
 WHERE name = 'brand.area';

-- What's new's sentence for a list that did not load: nothing can show it (see the top of this file).
DELETE FROM translation_keys WHERE name IN ('whatsNew.notLoaded');

-----------------------------------------------------------
-- PROVE IT: THE STRINGS
--
-- Every key this file writes is here and reads in both languages: a page
-- never shows a key, and Slovak never falls back to English by accident.
-- What's new's old sentence is gone, and brand.area's description tells
-- of the legal pages.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('title.terms'), ('title.privacy'), ('title.contact'), ('lesson.steps'), ('legal.about'),
          ('legal.record.name'), ('legal.record.what'), ('legal.record.why'), ('legal.record.kept'),
          ('legal.progress.name'), ('legal.progress.what'), ('legal.progress.why'), ('legal.progress.kept'),
          ('legal.limits.name'), ('legal.limits.what'), ('legal.limits.why'), ('legal.limits.kept'),
          ('legal.words.name'), ('legal.words.what'), ('legal.words.why'), ('legal.words.kept'),
          ('legal.visitors.what'), ('legal.visitors.why'), ('legal.visitors.kept'),
          ('legal.feedback.what'), ('legal.feedback.kept'), ('legal.auditLog.what'), ('legal.backups.what'), ('legal.backups.kept'),
          ('legal.storage.signIn.purpose'), ('legal.storage.signInUnderWay.purpose'), ('legal.storage.signInUnderWay.kept'),
          ('legal.storage.hint.purpose'), ('legal.storage.tabLanguage.purpose'), ('legal.storage.untilTabClosed'),
          ('legal.storage.visitorKey.kept'), ('legal.storage.outbox.purpose'), ('legal.storage.outbox.kept'),
          ('legal.storage.replaced.purpose'), ('legal.storage.replaced.kept'), ('legal.storage.piano.purpose'),
          ('legal.storage.piano.kept'), ('legal.storage.wordDrafts.purpose')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;

    IF EXISTS (SELECT 1 FROM translation_keys WHERE name = 'whatsNew.notLoaded') OR EXISTS (SELECT 1 FROM translations WHERE key_name = 'whatsNew.notLoaded') THEN
        RAISE EXCEPTION 'What''s new''s sentence for a list that did not load is still there';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM translation_keys WHERE name = 'brand.area' AND description LIKE '%legal pages%') THEN
        RAISE EXCEPTION 'the description of brand.area does not tell of the legal pages';
    END IF;
END $$;
