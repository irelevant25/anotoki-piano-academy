import { HttpClient, HttpContext, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_ADMIN_CONFIG } from '@anotoki/lib/admin';
import { ISSUED_AS, VISITOR_KEY_HEADER, anotokiAuthInterceptor } from '@anotoki/lib/auth';
import { ANOTOKI_FEEDBACK_CONFIG, DEFAULT_FEEDBACK_ENDPOINT } from '@anotoki/lib/feedback';
import { siteStatusInterceptor } from '@anotoki/lib/migrations';
import { ANOTOKI_PEOPLE_CONFIG, type PeoplePerson } from '@anotoki/lib/people';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { SITE_INTERCEPTORS } from '../app.config';
import { VISITOR_STORAGE_KEY, VisitorKey } from './auth/visitor-key';
import { FEEDBACK_SECTIONS, feedbackSenderInterceptor, provideSiteAdmin } from './site-admin';
import { ProgressStore } from './state/progress-store.service';
import { TestAuth, provideTestAuth, provideTestAuthInterceptor } from './testing/test-auth';

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

describe("the family's admin pages and feedback form, wired to Piano Academy (core/site-admin.ts)", () => {
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
        "Everything Piano Academy keeps of ana goes: 3 notes, 1 steps of the path and 2 rounds, and their feedback's reply address (its words stay). " +
        'The backups made before keep it until they are deleted; restoring one deletes it again. Their anotoki account stays; if they sign in again, they start from nothing.',
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

  it("the feedback form: this app's places in the page's words, the server's values in English - and the account's address written in for somebody signed in", () => {
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

/**
 * Whom the feedback form's message is for (feedbackSenderInterceptor, core/site-admin.ts), through the family's
 * interceptor as this app configures it: the form posts to its route and says nothing itself - as here.
 */
describe("the feedback form's message says whom it is for: the person's while somebody is signed in, nobody's otherwise - the server takes anybody's", () => {
  const KEY = 'k'.repeat(43);
  const MESSAGE = { kind: 'bug', message: 'The C key sticks.', page: '/terms', language: 'en', website: '' };
  let auth: TestAuth;
  let http: HttpClient;
  let requests: HttpTestingController;

  /** Lets the token's promise and the interceptors after it run out. */
  const settled = (): Promise<void> => new Promise((done) => setTimeout(done));

  beforeEach(() => {
    localStorage.clear();
    auth = new TestAuth();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([feedbackSenderInterceptor, anotokiAuthInterceptor])), provideHttpClientTesting(), ...provideTestAuth(auth), ...provideTestAuthInterceptor()],
    });
    auth.store = TestBed.inject(VisitorKey);
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    requests.verify();
    localStorage.clear();
  });

  it('nobody signed in where Piano Academy requires a sign-in (the legal pages, the footer under them): sent, with neither a token nor a key - and the page stays, nobody sent to sign in', async () => {
    auth.signedOut();
    const answer = firstValueFrom(http.post(DEFAULT_FEEDBACK_ENDPOINT, MESSAGE));
    await settled();
    const sent = requests.expectOne(DEFAULT_FEEDBACK_ENDPOINT);
    expect([sent.request.method, sent.request.headers.has('Authorization'), sent.request.headers.has(VISITOR_KEY_HEADER)]).toEqual(['POST', false, false]);
    expect(sent.request.body).toEqual(MESSAGE);
    sent.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await expect(answer).resolves.toEqual({ ok: true });
    expect(auth.refused).not.toHaveBeenCalled();
    expect(auth.token).not.toHaveBeenCalled();
  });

  it("a visitor (no sign-in required): nobody's too - the key goes to the progress routes alone", async () => {
    auth.visiting();
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    const answer = firstValueFrom(http.post(DEFAULT_FEEDBACK_ENDPOINT, MESSAGE));
    await settled();
    const sent = requests.expectOne(DEFAULT_FEEDBACK_ENDPOINT);
    expect([sent.request.headers.has('Authorization'), sent.request.headers.has(VISITOR_KEY_HEADER)]).toEqual([false, false]);
    sent.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await expect(answer).resolves.toEqual({ ok: true });
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
  });

  it('somebody signed in: theirs, with their token - the Feedback page names them', async () => {
    auth.signInAs({ sub: '7', preferred_username: 'mia' });
    const answer = firstValueFrom(http.post(DEFAULT_FEEDBACK_ENDPOINT, MESSAGE));
    await settled();
    const sent = requests.expectOne(DEFAULT_FEEDBACK_ENDPOINT);
    expect(sent.request.headers.get('Authorization')).toBe('Bearer token-7');
    sent.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await expect(answer).resolves.toEqual({ ok: true });
  });

  it("nothing else is touched: a request that says whom it is for keeps it, and another route stays the page's - a person's request with nobody signed in is still never sent", async () => {
    auth.signedOut();
    /** The status a request failed with (each refusal caught as it is made), or null for an answer. */
    const failed = (request: Observable<unknown>): Promise<number | null> =>
      firstValueFrom(request).then(
        () => null,
        (error: HttpErrorResponse) => error.status,
      );
    const said = failed(http.post(DEFAULT_FEEDBACK_ENDPOINT, MESSAGE, { context: new HttpContext().set(ISSUED_AS, 'person') }));
    const save = failed(http.put('/api/progress', {}));
    const asked = failed(http.get(DEFAULT_FEEDBACK_ENDPOINT));
    await settled();
    requests.expectNone(DEFAULT_FEEDBACK_ENDPOINT, "the message said it was a person's: never sent without a token");
    requests.expectNone('/api/progress');
    expect(await Promise.all([said, save, asked])).toEqual([401, 401, 401]);
    expect(auth.refused).toHaveBeenCalledTimes(3);
  });

  it("is the app's: before the family's sign-in in SITE_INTERCEPTORS (app.config.ts), after where the site stands", () => {
    expect(SITE_INTERCEPTORS).toEqual([siteStatusInterceptor, feedbackSenderInterceptor, anotokiAuthInterceptor]);
  });
});
