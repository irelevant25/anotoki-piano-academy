import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_AUTH_CONFIG, type AnotokiAuthConfig, failureText, signInWords } from '@anotoki/lib/auth';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { KEPT_LIBRARY_ENGLISH } from '../i18n/kept-english';
import { provideSiteTranslations } from '../i18n/site-translations';
import { BootService } from '../state/boot.service';
import { provideTestAuth } from '../testing/test-auth';
import { CALLBACK_PATH, SIGN_IN_FAILED_ROUTE, VISITOR_PREFIXES, provideSiteAuth } from './site-auth';
import { VisitorKey } from './visitor-key';

describe("the family's sign-in as this app sets it up (core/auth/site-auth.ts)", () => {
  const boot = { beforeSignIn: vi.fn(async () => true) };

  /** The module's configuration as the app gives it - with these words, and the start as a stand-in. */
  function configured(words: (Provider | EnvironmentProviders)[] = [provideTestTranslations({})]): AnotokiAuthConfig {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      // The family's AnotokiAuth itself is the library's (tested there): a stand-in for what VisitorKey reads of it.
      providers: [provideHttpClient(), provideHttpClientTesting(), ...words, provideSiteAuth(), ...provideTestAuth(), { provide: BootService, useValue: boot }],
    });
    return TestBed.inject(ANOTOKI_AUTH_CONFIG);
  }

  beforeEach(() => boot.beforeSignIn.mockClear());

  it("reads the backend's settings, comes back to this app's callback, says a failure on a route of its own - and never signs anybody in by the IAM's hint", () => {
    const config = configured();
    expect(config.config).toBe('/api/auth/config');
    expect([config.redirectPath, config.failureRoute, config.hint]).toEqual([CALLBACK_PATH, SIGN_IN_FAILED_ROUTE, false]);
    expect([CALLBACK_PATH, SIGN_IN_FAILED_ROUTE]).toEqual(['/auth/callback', '/sign-in-failed']);
  });

  it("sends a visitor's key on the progress routes alone - from this app's VisitorKey", () => {
    const config = configured();
    expect(config.api?.visitorPrefixes).toEqual(['/api/state', '/api/progress', '/api/path', '/api/sessions']);
    expect(VISITOR_PREFIXES).toEqual(config.api?.visitorPrefixes);
    // Not the feedback form's, nor anybody's own file: those carry no visitor.
    expect(VISITOR_PREFIXES.some((prefix) => '/api/feedback'.startsWith(prefix) || '/api/me/export'.startsWith(prefix))).toBe(false);
    expect(config.visitors?.()).toBe(TestBed.inject(VisitorKey));
    // The first save that makes a visitor goes alone in ApiService (its waiting saves name the generation it brings).
    expect(config.makesVisitor).toBeUndefined();
  });

  it("opens the IAM's pages in the language read here - one that came with a bundle, never the kept English nobody chose", () => {
    expect(configured([provideTestTranslations({}, { language: 'sk' })]).language?.()).toBe('sk');
    expect(configured([provideTestTranslations({})]).language?.()).toBe('en');
    // No bundle at all (the backend out of reach, a database without its words): nothing to name.
    expect(configured([provideSiteTranslations()]).language?.()).toBeUndefined();
  });

  it("words a failure in this app's own sentences while there is no bundle, and in the database's with one - an owner's rewording too", () => {
    const bare = configured([provideSiteTranslations()]);
    expect(bare.translate?.('anotoki.signIn.notCompleted')).toBe(KEPT_LIBRARY_ENGLISH['anotoki.signIn.notCompleted']);
    const words = signInWords(bare.language?.(), bare.words, bare.translate).words;
    expect(failureText('access_denied', words)).toBe('Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.');
    expect(failureText('invalid_grant', words)).toBe('Signing in did not work. Please try again. (invalid_grant)');
    expect(failureText('storage_unavailable', words)).toBe('This browser did not let the app remember the sign-in in progress. Allow this site to store data, then try again.');
    // A code is shown only as a code: anything else that came back in the address is no code.
    expect(failureText('<script>', words)).toBe('Signing in did not work. Please try again. (unknown)');
    // The rest of the screen is the library's own English.
    expect([words.failedTitle, words.retry, words.back]).toEqual(['Signing in did not work', 'Try again', 'Back']);

    const reworded = configured([provideTestTranslations({ 'anotoki.signIn.notCompleted': 'Prihlásenie sa nedokončilo - skús to znova.' }, { language: 'sk' })]);
    expect(TestBed.inject(TranslationService).ready()).toBe(true);
    const slovak = signInWords(reworded.language?.(), reworded.words, reworded.translate);
    expect(slovak.lang).toBe('sk');
    expect(failureText('access_denied', slovak.words)).toBe('Prihlásenie sa nedokončilo - skús to znova.');
  });

  it("asks the start before the browser leaves for the IAM (a visitor's saves arrive first) - whoever starts the sign-in", async () => {
    const config = configured();
    expect(await config.beforeSignIn?.()).toBe(true);
    expect(boot.beforeSignIn).toHaveBeenCalledTimes(1);
  });
});
