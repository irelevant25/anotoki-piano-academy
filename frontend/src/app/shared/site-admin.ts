import { EnvironmentProviders, Injector, inject } from '@angular/core';
import { provideAnotokiAdmin } from '@anotoki/lib/admin';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { PeoplePerson, provideAnotokiPeople } from '@anotoki/lib/people';
import { TranslationService } from '@anotoki/lib/translations';
import { AdminDates } from './admin-dates';
import { VISITOR_KEEP_DAYS } from './i18n/visitor-words';
import { ProgressStore } from './state/progress-store.service';
import { MIGRATIONS_ROUTE } from './state/site-migrations';

/**
 * The places of the app a feedback message can be about: the value the
 * server keeps (the backend's FEEDBACK_SECTIONS, api/admin_tools.php - in
 * English, as the admin page shows them) and the key of its words in the
 * learner's language (the bar's sections).
 */
export const FEEDBACK_SECTIONS: readonly { value: string; key: string }[] = [
  { value: 'Learn', key: 'nav.learn' },
  { value: 'Note Trainer', key: 'nav.trainer' },
  { value: 'Sheet Practice', key: 'nav.sheet' },
  { value: 'Songs', key: 'nav.songs' },
  { value: 'Stats', key: 'nav.stats' },
];

/** The admin panel's routes of the family's pages (sites/admin/admin.routes.ts), in the menu's order. */
export const ADMIN_TOOL_ROUTES = {
  siteSettings: '/admin/site-settings',
  people: '/admin/people',
  feedback: '/admin/feedback',
  errors: '/admin/errors',
  audit: '/admin/audit',
  backups: '/admin/backups',
} as const;

/**
 * The People page's question before a delete, in this app's words: who, and
 * what goes - their notes, steps of the path and rounds (the server's
 * columns, PEOPLE_COLUMNS in api/people.php), and their feedback's reply
 * address - and that the backups made before keep it until they are
 * deleted, while a restore of one deletes it again (anotoki-lib 0.5.0: the
 * restore does again every delete the audit log holds since its backup).
 */
export function deleteQuestion(person: PeoplePerson): { title: string; message: string; confirm: string } {
  const name = person.name ?? `the person with IAM id ${person.sub}`;
  const count = (key: string): number => (typeof person[key] === 'number' ? (person[key] as number) : 0);
  return {
    title: `Delete the progress of ${name}?`,
    message:
      `Everything Piano Academy keeps of ${name} goes: ${count('notes')} notes, ${count('steps')} steps of the path and ${count('sessions')} rounds, ` +
      "and their feedback's reply address (its words stay). The backups made before keep it until they are deleted; restoring one deletes it again. " +
      'Their anotoki account stays; if they sign in again, they start from nothing.',
    confirm: 'Delete their progress',
  };
}

/**
 * The anotoki family's admin pages and the visitors' feedback form
 * (anotoki-lib 0.5.0), wired to this app's own. Every page is the site's
 * ADMIN's alone (the owner's decision of 2026-10-07: EDITORs see none of
 * them) - the token's roles, AnotokiAuth.isAdmin; the server checks again on
 * every route - in English, as the whole admin panel is, its dates in the
 * order and clock the reader's anotoki account chose (the admin panel's
 * stamp):
 *
 * - People (@anotoki/lib/people/page): everybody who signed in, with how much
 *   progress the app keeps of them, the visitors counted on a line of their
 *   own, the scrub of the accounts the IAM deleted, and "Delete their
 *   progress" behind the page's question alone (no proof of a recent sign-in:
 *   the owner's decision of 2026-10-11) - one's own too, after which this tab
 *   loads its own (empty) progress and tells the other tabs.
 * - The error log (the server's failures, and the pages' own errors -
 *   shared/error-report.ts), the audit log, feedback and backups
 *   (@anotoki/lib/admin/*): a backup made, downloaded, deleted or restored
 *   asks for a sign-in of the last ten minutes - "Sign in again" goes through
 *   the IAM asking for the password; its maker is named (the server's names).
 *   The admin bar's "Feedback" says how many are new (FeedbackUnread): no
 *   mail is sent.
 * - The site settings (@anotoki/lib/admin/site-settings, anotoki-lib 0.11.0):
 *   Getting in, the announcement and Page access, a card each - the maintenance
 *   page's and the announcement's words written in each of this app's
 *   languages, under their own names (the translations module's).
 * - The feedback form (@anotoki/lib/feedback/form, opened from the family's
 *   footer - its Feedback, @anotoki/lib/footer - and from Contact):
 *   for everybody, in the language on the page (English in the admin panel),
 *   the library's words from the database (anotoki.feedback.*) - the places
 *   it can be about worded as the bar's sections; "send it without my name",
 *   and the account's address written in for somebody signed in - the reply
 *   address is what the form sends (they may keep, change or clear it): the
 *   server never fills one in. The form says itself that its message is
 *   anybody's (the library's issuedAs('anybody'), anotoki-lib 0.7.2): the
 *   person's, with the token, while somebody is signed in, nobody's otherwise
 *   - a visitor's key goes to the progress routes alone. The server takes
 *   anybody's.
 *
 * The factories run in an injection context; ProgressStore is asked for when
 * a delete needs it.
 */
export function provideSiteAdmin(): EnvironmentProviders[] {
  return [
    provideAnotokiPeople(() => {
      const auth = inject(AnotokiAuth);
      const injector = inject(Injector);
      return {
        isAdmin: () => auth.isAdmin(),
        me: () => auth.sub(),
        lead: 'Everybody who signed in and whom Piano Academy keeps anything of, the most recently seen first.',
        formatDate: (iso) => injector.get(AdminDates).format(iso),
        delete: {
          label: 'Delete their progress',
          question: (person) => deleteQuestion(person),
          done: (person) => {
            if (person.sub !== auth.sub()) return;
            // One's own: this tab loads the (empty) progress now, and the other tabs are told.
            const store = injector.get(ProgressStore);
            store.announceReplaced();
            store.reloadFromServer().catch(() => store.changedElsewhere.set(true));
          },
        },
        visitorsLine: (visitors) =>
          `${visitors.count} ${visitors.count === 1 ? 'visitor' : 'visitors'} practising without signing in, with ${Number(visitors['sessions'] ?? 0)} rounds - ` +
          `they go ${VISITOR_KEEP_DAYS} days after their last visit.`,
        migrationsRoute: MIGRATIONS_ROUTE,
      };
    }),
    provideAnotokiAdmin(() => {
      const auth = inject(AnotokiAuth);
      const i18n = inject(TranslationService);
      const injector = inject(Injector);
      return {
        isAdmin: () => auth.isAdmin(),
        signInAgain: () => auth.signIn({ prompt: 'login' }),
        migrationsRoute: MIGRATIONS_ROUTE,
        siteName: 'Piano Academy',
        formatDate: (iso) => injector.get(AdminDates).format(iso),
        // The Site settings page: a field for each language the pages are read in, under its own name.
        languages: () => i18n.languages().map((language) => ({ code: language.code, name: language.native_name })),
      };
    }),
    provideAnotokiFeedback(() => {
      const auth = inject(AnotokiAuth);
      const i18n = inject(TranslationService);
      return {
        language: () => i18n.effectiveLanguage(),
        translate: (key) => i18n.libraryWord(key),
        sections: () => FEEDBACK_SECTIONS.map((section) => ({ value: section.value, label: i18n.t(section.key) })),
        signedIn: () => auth.signedIn(),
        email: () => auth.user()?.email ?? null,
      };
    }),
  ];
}
