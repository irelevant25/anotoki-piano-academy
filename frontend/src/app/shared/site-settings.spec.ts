import { TestBed } from '@angular/core/testing';
import { ANOTOKI_MIGRATIONS_CONFIG, DEFAULT_OPEN_WHILE_CLOSED } from '@anotoki/lib/migrations';
import { ANOTOKI_SITE_SETTINGS_CONFIG } from '@anotoki/lib/site-settings';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ANNOUNCEMENT_KEY, STAFF_ROUTE, provideSiteSettings } from './site-settings';
import { BootService } from './state/boot.service';
import { OPEN_WHILE_CLOSED, provideSiteMigrations } from './state/site-migrations';
import { TestAuth, provideTestAuth } from './testing/test-auth';

/**
 * The family's site settings (anotoki-lib 0.11.0) as this app wires them: who the reader is - the sign-in's - for Page
 * access, where the announcement's mark is kept, and - while the site is closed for maintenance - the closed sign's one
 * door (the staff route, its Sign in back to the start page) and what stays anybody's.
 */
describe('the site settings, as this app wires them (shared/site-settings.ts)', () => {
  it("know the reader from this app's sign-in - their roles from the token, whether anybody is signed in - and keep the announcement's mark under this app's name", () => {
    const auth = new TestAuth();
    TestBed.configureTestingModule({ providers: [...provideTestAuth(auth), provideSiteSettings()] });
    const config = TestBed.inject(ANOTOKI_SITE_SETTINGS_CONFIG);
    expect([ANNOUNCEMENT_KEY, config.storageKey]).toEqual(['piano-academy:announcement', 'piano-academy:announcement']);
    expect([config.signedIn(), config.roles()]).toEqual([false, []]);
    auth.signInAs({ sub: '7', roles: ['MEMBER', 'EDITOR'] });
    expect([config.signedIn(), config.roles()]).toEqual([true, ['MEMBER', 'EDITOR']]);
  });

  it("while the site is closed: the sign's door at /staff, its Sign in back to the start page - and the family's open pages, this app's screen of a sign-in that did not work among them", async () => {
    const signIn = vi.fn(async () => undefined);
    TestBed.configureTestingModule({ providers: [...provideTestAuth(), ...provideTestTranslations({}), provideSiteMigrations(), { provide: BootService, useValue: { signIn } }] });
    const config = TestBed.inject(ANOTOKI_MIGRATIONS_CONFIG);
    expect([STAFF_ROUTE, config.staffRoute]).toEqual(['/staff', '/staff']);
    expect(config.openWhileClosed).toEqual(OPEN_WHILE_CLOSED);
    expect(OPEN_WHILE_CLOSED).toEqual([...DEFAULT_OPEN_WHILE_CLOSED, '/sign-in-failed']);
    expect(DEFAULT_OPEN_WHILE_CLOSED).toEqual(['/auth', '/terms', '/privacy', '/contact', '/about', '/support']);
    await config.signIn('/');
    expect(signIn).toHaveBeenCalledWith('/');
    // The status page's own Sign in (an update waiting): back to the page it is on.
    await config.signIn();
    expect(signIn).toHaveBeenLastCalledWith(undefined);
  });
});
