import { inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { ANOTOKI_LEGAL_CONFIG, AnotokiLegalConfig, LegalFacts } from '@anotoki/lib/legal';
import { TranslationService, translationSettings } from '@anotoki/lib/translations';
import { OUTBOX_PREFIX } from '../api/api.service';
import { VISITOR_STORAGE_KEY } from '../auth/visitor-key';
import { THEME_KEY } from '../family-kit';
import { TRANSLATIONS_STORAGE_PREFIX } from '../i18n/site-translations';
import { VISITOR_KEEP_DAYS } from '../i18n/visitor-words';
import { LAST_DEVICE_KEY } from '../midi/midi.service';
import { PROGRESS_REPLACED_PREFIX } from '../state/progress-store.service';

/**
 * The day Piano Academy's facts last changed: the pages show the later of it
 * and the day the library's own words last did. Move it with any change to
 * what the app keeps or for how long - and the strings that say so
 * (`legal.*`, migration 012).
 */
export const PIANO_LEGAL_UPDATED = '2026-10-18';

/**
 * The anotoki account's cookie for every anotoki site (the IAM's
 * hint_cookie_name, set under the IAM's parent domain). The browser sends it
 * here too, but this app never reads it: no sign-in by the hint (`hint: false`,
 * core/auth/site-auth.ts).
 */
export const SIGN_IN_HINT_COOKIE = 'anotoki_signed_in';

/**
 * The legal pages' configuration: the app's (core/legal/legal.config.ts - the
 * page's language, the database's words) with the facts the pages read. Their
 * frame provides it (layouts/legal-layout), so the facts - this code and its
 * strings' keys - load with the pages, never with the first page.
 */
export function pianoLegalPagesConfig(): AnotokiLegalConfig {
  const root = inject(ANOTOKI_LEGAL_CONFIG, { skipSelf: true });
  const i18n = inject(TranslationService);
  const auth = inject(AnotokiAuth);
  return { ...root, facts: () => pianoLegalFacts(i18n, auth) };
}

/**
 * Piano Academy's facts, in the page's language - read as a page is drawn, so
 * a change of language redraws them. Each must stay true of the code:
 *
 * - the record of a person: users (migrations 001, 004, 010) - the anotoki
 *   account's id and the name from the sign-in (the library's RecordPerson,
 *   api/people.php), first and last seen, the progress generation, no address;
 *   deleted whole only by an ADMIN on the People page (peopleDelete() - the
 *   next visit makes an empty one again), its name scrubbed to the IAM's
 *   placeholder when the account is deleted (the library's Scrubber);
 * - the progress: progress (per note, the SRS schedule), path_progress (the
 *   steps, their best accuracy), sessions (one row a round: SESSION_FIELDS,
 *   api/store.php) - never deleted by age; replaced by the person's own import
 *   (/api/me/import?replace=true) or deleted by an ADMIN; kept, nobody's, when
 *   the account is deleted;
 * - the limits: feedback's and the pages' error reports' counts (the
 *   library's: a day of keyed hashes of the account or the address bucket, in
 *   storage/), visitor_starts (a keyed hash of the bucket, an hour -
 *   api/visitors.php); each gone at the next count after its time;
 * - the words: translations.updated_by (002: ON DELETE SET NULL), the staff's;
 * - visitors (005, while the IAM requires no sign-in): users with a negative
 *   id, the key's SHA-256, created and last seen; their progress under that
 *   id; moved into the account at a sign-in (visitorMove()), swept
 *   VISITOR_KEEP_DAYS after the last visit (visitorSweep(), after an answer);
 * - feedback (the library's, api/admin_tools.php's feedback(): the default
 *   keep - spam 30 days, resolved 365, pruned at most daily after a new
 *   message; new and read ones until deleted): the kind and the section too,
 *   the page as a path, the language, the browser, the sender's id unless
 *   "without my name", the reply address the form sends (the account's written
 *   in for somebody signed in); the reply address and browser forgotten by the
 *   scrub and by the People delete;
 * - the error log: the library's words and its 30 days (errorLog() sets no
 *   `days`); never an address, a keyed hash of its bucket;
 * - the audit log: the staff's changes and the admin tools', AND a person's
 *   own progress file brought back (progress.imported, api/routes/progress.php)
 *   - so in this app's words; never an address (no recordAddress), never pruned;
 * - backups: plain (sealed, not encrypted), the library's keeping by count - 14
 *   daily (made after the first answer of a UTC day: only days the site is
 *   used), 5 before an update, 5 before a restore, by hand until deleted
 *   (backups() sets none of its own) -, downloadable by an ADMIN;
 * - this browser's storage: the sign-in's (the library's auth module, under
 *   `anotoki-auth:{client id}`, and its session items while one is under way -
 *   no hint marker: `hint: false`), the IAM's hint cookie (sent here, never
 *   read), the theme (THEME_KEY), the language and its cached strings
 *   (TRANSLATIONS_STORAGE_PREFIX; a `?lang=` held for the tab), the visitor's
 *   key (VISITOR_STORAGE_KEY), the rounds not saved yet (OUTBOX_PREFIX), the
 *   note a tab leaves after an import (PROGRESS_REPLACED_PREFIX), the last
 *   piano (LAST_DEVICE_KEY), the admin pages' unsaved words;
 * - counting visits: the family's Umami (src/index.html: umami.anotoki.eu, the
 *   query and the fragment left out) - the library's words;
 * - who else handles data: the hosting company (WebSupport s.r.o., named by
 *   the owner on 2026-10-18: the servers, the database and the mail) and
 *   Cloudflare.
 *
 * Piano Academy takes feedback: the Contact page opens the family's form in
 * the kit's dialog (configured in core/site-admin.ts). Every address the pages
 * link to is the code's - the anotoki account's pages from the IAM's address
 * the app signs in with (GET /api/auth/config), the operator and Cloudflare in
 * the library -, never a string's: a rewording on the Translations page can
 * never change where a link goes (the 0.6.0 review). So are the cookies' and
 * stored items' names.
 */
export function pianoLegalFacts(i18n: TranslationService, auth: AnotokiAuth): LegalFacts {
  const iam = auth.issuer();
  const client = auth.clientId() || 'piano-academy';
  const words = translationSettings({ storagePrefix: TRANSLATIONS_STORAGE_PREFIX }).keys;
  // Each key written whole: the key scan (tools/translation_keys.php) reads the keys a page asks for as they are written.
  return {
    site: i18n.t('brand.area'),
    about: i18n.t('legal.about'),
    updated: PIANO_LEGAL_UPDATED,
    account: { deleteUrl: auth.accountUrl(), privacyUrl: iam ? `${iam}/privacy` : null },
    data: [
      { name: i18n.t('legal.record.name'), what: i18n.t('legal.record.what'), why: i18n.t('legal.record.why'), kept: i18n.t('legal.record.kept') },
      { name: i18n.t('legal.progress.name'), what: i18n.t('legal.progress.what'), why: i18n.t('legal.progress.why'), kept: i18n.t('legal.progress.kept') },
      { name: i18n.t('legal.limits.name'), what: i18n.t('legal.limits.what'), why: i18n.t('legal.limits.why'), kept: i18n.t('legal.limits.kept') },
      { name: i18n.t('legal.words.name'), what: i18n.t('legal.words.what'), why: i18n.t('legal.words.why'), kept: i18n.t('legal.words.kept') },
    ],
    visitors: {
      what: i18n.t('legal.visitors.what'),
      why: i18n.t('legal.visitors.why'),
      kept: i18n.t('legal.visitors.kept', { days: VISITOR_KEEP_DAYS }),
    },
    feedback: { what: i18n.t('legal.feedback.what'), kept: i18n.t('legal.feedback.kept') },
    // The staff's changes - and a person's own progress file brought back, which the library's words leave out.
    auditLog: { what: i18n.t('legal.auditLog.what') },
    // Kept by count, not by age: a daily copy is made on a day the site is used, so the 14 newest may span more days.
    backups: { what: i18n.t('legal.backups.what'), kept: i18n.t('legal.backups.kept') },
    storage: [
      { preset: 'signIn', name: `anotoki-auth:${client}`, purpose: i18n.t('legal.storage.signIn.purpose') },
      {
        name: `anotoki-auth:${client}:login:…, anotoki-auth:discovery:…`,
        kind: 'session',
        purpose: i18n.t('legal.storage.signInUnderWay.purpose'),
        kept: i18n.t('legal.storage.signInUnderWay.kept'),
      },
      { preset: 'signInHint', name: SIGN_IN_HINT_COOKIE, purpose: i18n.t('legal.storage.hint.purpose') },
      { preset: 'theme', name: THEME_KEY },
      { preset: 'language', name: `${words.language}, ${words.cache}` },
      { name: words.language, kind: 'session', purpose: i18n.t('legal.storage.tabLanguage.purpose'), kept: i18n.t('legal.storage.untilTabClosed') },
      { preset: 'visitorKey', name: VISITOR_STORAGE_KEY, kept: i18n.t('legal.storage.visitorKey.kept') },
      { name: `${OUTBOX_PREFIX}…`, kind: 'local', purpose: i18n.t('legal.storage.outbox.purpose'), kept: i18n.t('legal.storage.outbox.kept') },
      { name: `${PROGRESS_REPLACED_PREFIX}…`, kind: 'local', purpose: i18n.t('legal.storage.replaced.purpose'), kept: i18n.t('legal.storage.replaced.kept') },
      { name: LAST_DEVICE_KEY, kind: 'local', purpose: i18n.t('legal.storage.piano.purpose'), kept: i18n.t('legal.storage.piano.kept') },
      { name: words.drafts, kind: 'session', purpose: i18n.t('legal.storage.wordDrafts.purpose'), kept: i18n.t('legal.storage.untilTabClosed') },
    ],
    // The hosting company, named by the owner on 2026-10-18: the servers, the database and the mail.
    processors: [{ preset: 'hosting', name: 'WebSupport s.r.o.', url: 'https://www.websupport.sk' }, { preset: 'cloudflare' }],
  };
}
