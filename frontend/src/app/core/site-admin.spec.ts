import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_ADMIN_CONFIG } from '@anotoki/lib/admin';
import { ANOTOKI_FEEDBACK_CONFIG } from '@anotoki/lib/feedback';
import { ANOTOKI_PEOPLE_CONFIG, type PeoplePerson } from '@anotoki/lib/people';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { FEEDBACK_SECTIONS, provideSiteAdmin } from './site-admin';
import { ProgressStore } from './state/progress-store.service';
import { TestAuth, provideTestAuth } from './testing/test-auth';

const SLOVAK = {
  'nav.learn': 'Učenie',
  'nav.trainer': 'Tréning nôt',
  'nav.sheet': 'Hra z nôt',
  'nav.songs': 'Skladby',
  'nav.stats': 'Štatistiky',
  // An owner's rewording of the library's word, on the Translations page.
  'anotoki.feedback.title': 'Napíš nám',
};
const ENGLISH = { 'nav.learn': 'Learn', 'nav.trainer': 'Note Trainer', 'nav.sheet': 'Sheet Practice', 'nav.songs': 'Songs', 'nav.stats': 'Stats' };

describe('the family\'s admin pages and feedback form, wired to Piano Academy (core/site-admin.ts)', () => {
  let auth: TestAuth;
  const store = { announceReplaced: vi.fn(), reloadFromServer: vi.fn(async () => undefined), changedElsewhere: { set: vi.fn() } };

  beforeEach(() => {
    auth = new TestAuth().signInAs({ sub: '7', preferred_username: 'mia', email: 'mia@example.test', roles: ['MEMBER', 'ADMIN'] });
    store.announceReplaced.mockClear();
    store.reloadFromServer.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        ...provideTestAuth(auth),
        { provide: ProgressStore, useValue: store },
        provideSiteAdmin(),
      ],
    });
  });

  const person = (more: Partial<PeoplePerson> = {}): PeoplePerson => ({
    sub: '12',
    name: 'ana',
    first_seen_at: '2026-10-01T10:00:00Z',
    last_seen_at: '2026-10-10T10:00:00Z',
    anonymized_at: null,
    iam_url: 'http://localhost:4300/admin/users/12',
    notes: 3,
    steps: 1,
    sessions: 2,
    ...more,
  });

  it('People: the site\'s ADMIN from the token, "you" on their own row, the visitors on a line of their own - English, as the admin panel is', () => {
    const people = TestBed.inject(ANOTOKI_PEOPLE_CONFIG);
    expect([people.isAdmin?.(), people.me?.()]).toEqual([true, '7']);
    auth.signInAs({ sub: '7', roles: ['MEMBER', 'EDITOR'] });
    expect(people.isAdmin?.()).toBe(false);
    expect(people.lead).toBe('Everybody who signed in and whom Piano Academy keeps anything of, the most recently seen first.');
    expect(people.migrationsRoute).toBe('/admin/migrations');
    expect(people.visitorsLine?.({ count: 2, sessions: 5 })).toBe('2 visitors practising without signing in, with 5 rounds - they go 30 days after their last visit.');
    expect(people.visitorsLine?.({ count: 1, sessions: 0 })).toBe('1 visitor practising without signing in, with 0 rounds - they go 30 days after their last visit.');
  });

  it('People: "Delete their progress" asks its question alone - who, and what goes - and a delete of one\'s own loads this tab\'s (empty) progress', async () => {
    const people = TestBed.inject(ANOTOKI_PEOPLE_CONFIG);
    expect(people.delete?.label).toBe('Delete their progress');
    expect(people.delete?.question?.(person(), [])).toEqual({
      title: 'Delete the progress of ana?',
      message:
        'Everything Piano Academy keeps of ana goes: 3 notes, 1 steps of the path and 2 rounds, and their feedback\'s reply address (its words stay). ' +
        'The backups made before keep it: restoring one brings it back. Their anotoki account stays; if they sign in again, they start from nothing.',
      confirm: 'Delete their progress',
    });
    expect(people.delete?.question?.(person({ name: null, notes: undefined }), []).title).toBe('Delete the progress of the person with IAM id 12?');
    expect(people.delete?.question?.(person({ name: null, notes: undefined }), []).message).toContain('goes: 0 notes');

    // Somebody else's: nothing of this tab's changes.
    await people.delete?.done?.(person(), { deleted: { Notes: 3, Steps: 1, Rounds: 2 } });
    expect(store.reloadFromServer).not.toHaveBeenCalled();
    // One's own: this tab loads it again, and the other tabs are told.
    await people.delete?.done?.(person({ sub: '7' }), { deleted: { Notes: 0, Steps: 0, Rounds: 0 } });
    expect(store.announceReplaced).toHaveBeenCalledTimes(1);
    expect(store.reloadFromServer).toHaveBeenCalledTimes(1);
  });

  it('the admin tools: the site\'s ADMIN alone, and "Sign in again" asks the IAM for the password - the proof a backup asks for', () => {
    const admin = TestBed.inject(ANOTOKI_ADMIN_CONFIG);
    expect(admin.isAdmin()).toBe(true);
    expect([admin.siteName, admin.migrationsRoute]).toEqual(['Piano Academy', '/admin/migrations']);
    admin.signInAgain?.();
    expect(auth.signIn).toHaveBeenCalledWith({ prompt: 'login' });
    auth.signedOut();
    expect(admin.isAdmin()).toBe(false);
  });

  it('the feedback form: this app\'s places in the page\'s words, the server\'s values in English - and the account\'s address written in for somebody signed in', () => {
    const feedback = TestBed.inject(ANOTOKI_FEEDBACK_CONFIG);
    expect(feedback.sections?.()).toEqual([
      { value: 'Learn', label: 'Učenie' },
      { value: 'Note Trainer', label: 'Tréning nôt' },
      { value: 'Sheet Practice', label: 'Hra z nôt' },
      { value: 'Songs', label: 'Skladby' },
      { value: 'Stats', label: 'Štatistiky' },
    ]);
    expect(FEEDBACK_SECTIONS.map((section) => section.value)).toEqual(['Learn', 'Note Trainer', 'Sheet Practice', 'Songs', 'Stats']);
    expect([feedback.language?.(), feedback.signedIn?.(), feedback.email?.()]).toEqual(['sk', true, 'mia@example.test']);
    // On an address of the admin panel the form is English, as the panel is.
    TestBed.inject(TranslationService).noteAddress('/admin/feedback');
    expect(feedback.language?.()).toBe('en');
    // A visitor: nobody's name to leave out, no address to write in.
    auth.visiting();
    expect([feedback.signedIn?.(), feedback.email?.()]).toEqual([false, null]);
    // Its words: the database's, an owner's rewording of the library's too.
    TestBed.inject(TranslationService).noteAddress('/');
    expect(feedback.translate?.('anotoki.feedback.title')).toBe('Napíš nám');
  });
});
