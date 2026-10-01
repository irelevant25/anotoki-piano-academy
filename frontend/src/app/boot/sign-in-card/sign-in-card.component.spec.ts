import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { SignInCardComponent } from './sign-in-card.component';

const ENGLISH = {
  'signIn.notCompleted': 'Signing in was not completed. If you did not stop it yourself, this account may not have access to Piano Academy.',
  'signIn.failed': 'Signing in did not work. Please try again. ({code})',
};
const SLOVAK = {
  'signIn.notCompleted': 'Prihlásenie sa nedokončilo. Ak to nebol tvoj zámer, tento účet možno nemá k Piano Academy prístup.',
  'signIn.failed': 'Prihlásenie sa nepodarilo. Skús to znova. ({code})',
};

describe('SignInCardComponent: a sign-in that came back without one', () => {
  let fixture: ComponentFixture<SignInCardComponent>;
  let auth: AuthService;

  const why = (): string | null => fixture.nativeElement.querySelector('[role="alert"]')?.textContent?.trim() ?? null;

  beforeEach(async () => {
    // The card's own words are not what these cases are about: only the failure is looked at.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(SignInCardComponent);
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('says nothing when nothing went wrong', () => {
    expect(why()).toBeNull();
  });

  it('has one sentence when the IAM turned the account away or the person went back - its own, never the IAM’s words', async () => {
    auth.signInFailure.set({ code: 'access_denied', message: 'This account cannot use Piano Academy' });
    await fixture.whenStable();
    expect(why()).toBe('Prihlásenie sa nedokončilo. Ak to nebol tvoj zámer, tento účet možno nemá k Piano Academy prístup.');

    auth.signInFailure.set({ code: 'access_denied', message: '' });
    await fixture.whenStable();
    expect(why()).toBe('Prihlásenie sa nedokončilo. Ak to nebol tvoj zámer, tento účet možno nemá k Piano Academy prístup.');
  });

  it('asks to try again after anything else, naming the code - never the SDK’s sentence', async () => {
    auth.signInFailure.set({ code: 'state_mismatch', message: 'That sign-in did not start here, or took too long' });
    await fixture.whenStable();
    expect(why()).toBe('Prihlásenie sa nepodarilo. Skús to znova. (state_mismatch)');

    auth.signInFailure.set({ code: '', message: 'Something went wrong at the IAM' });
    await fixture.whenStable();
    expect(why()).toBe('Prihlásenie sa nepodarilo. Skús to znova. (unknown)');
  });

  it('follows the language of the page', async () => {
    auth.signInFailure.set({ code: 'invalid_grant', message: '' });
    await fixture.whenStable();
    expect(why()).toBe('Prihlásenie sa nepodarilo. Skús to znova. (invalid_grant)');

    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(why()).toBe('Signing in did not work. Please try again. (invalid_grant)');
  });
});
