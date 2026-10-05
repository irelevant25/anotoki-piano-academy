import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BootService, BootStatus } from '../state/boot.service';
import { provideTestTranslations } from '../testing/test-translations';
import { AuthService, SignInFailure } from './auth.service';
import { adminSignInGuard, signInGuard } from './sign-in.guard';

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

describe('signInGuard', () => {
  const signedIn = signal(false);
  const status = signal<BootStatus>('sign-in');
  const failure = signal<SignInFailure | null>(null);
  const loginRequired = signal(true);
  const visiting = signal(false);
  /** What happened, in order: the saves settled before a visitor's page leaves, then the sign-in. */
  const order: string[] = [];
  const auth = {
    signedIn: () => signedIn(),
    signInFailure: failure,
    loginRequired: () => loginRequired(),
    signIn: vi.fn(async (_returnTo?: string, _uiLocales?: string) => (order.push('signIn'), true)),
  };
  const boot = {
    status,
    visiting: () => visiting(),
    beforeSignIn: vi.fn(async () => {
      await Promise.resolve();
      order.push('settled');
    }),
  };

  beforeEach(() => {
    signedIn.set(false);
    status.set('sign-in');
    failure.set(null);
    loginRequired.set(true);
    visiting.set(false);
    order.length = 0;
    auth.signIn.mockReset().mockImplementation(async () => (order.push('signIn'), true));
    boot.beforeSignIn.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', canActivate: [adminSignInGuard], component: PageComponent },
          { path: '', canActivateChild: [signInGuard], children: [{ path: '', component: PageComponent }, { path: 'stats', component: PageComponent }, { path: 'songs/:songId', component: PageComponent }] },
        ]),
        provideTestTranslations({}, { language: 'sk' }),
        { provide: AuthService, useValue: auth },
        { provide: BootService, useValue: boot },
      ],
    });
  });

  const go = (url: string) => TestBed.inject(Router).navigateByUrl(url);

  it('lets somebody signed in through, on every page', async () => {
    signedIn.set(true);
    status.set('ready');
    expect(await go('/stats?x=1')).toBe(true);
    expect(await go('/admin')).toBe(true);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to the IAM first - nothing drawn - and back to the address they asked for, in their language', async () => {
    expect(await go('/stats')).toBe(false);
    expect(auth.signIn).toHaveBeenLastCalledWith('/stats', 'sk');
    expect(await go('/songs/ode-to-joy?tempo=80')).toBe(false);
    expect(auth.signIn).toHaveBeenLastCalledWith('/songs/ode-to-joy?tempo=80', 'sk');
    expect(await go('/admin')).toBe(false);
    expect(auth.signIn).toHaveBeenLastCalledWith('/admin', 'sk');
  });

  it('does the same when the sign-in ended in the middle of practising: the next page goes by the IAM', async () => {
    status.set('ready');
    expect(await go('/stats')).toBe(false);
    expect(auth.signIn).toHaveBeenCalledWith('/stats', 'sk');
  });

  it('lets a page load that came back from the IAM without a sign-in through: sent back, the browser would go round for ever', async () => {
    failure.set({ code: 'access_denied', message: 'No.' });
    expect(await go('/stats')).toBe(true);
    expect(await go('/admin')).toBe(true);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('lets the page through to the sign-in card when the sign-in cannot even start - not a blank page - and tries no second time', async () => {
    // As AuthService does it: the browser refused the site its storage, so the SDK could not keep the sign-in in progress.
    auth.signIn.mockImplementation(async () => {
      failure.set({ code: 'storage_unavailable', message: 'This browser will not let the site remember the sign-in in progress' });
      return false;
    });
    expect(await go('/stats')).toBe(true);
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect(await go('/admin')).toBe(true);
    expect(auth.signIn).toHaveBeenCalledTimes(1);
  });

  it('sends nobody anywhere while the app cannot run - the boot cards are drawn then, without a sign-in', async () => {
    for (const state of ['loading', 'not-set-up', 'load-error'] as const) {
      status.set(state);
      expect(await go('/stats')).toBe(false);
      expect(await go('/admin')).toBe(false);
    }
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('stays put when there are no sign-in settings to go by (signIn answers false with no failure)', async () => {
    auth.signIn.mockResolvedValue(false);
    expect(await go('/stats')).toBe(false);
  });

  describe('while the IAM does not require a sign-in', () => {
    beforeEach(() => loginRequired.set(false));

    it('lets a visitor through to every learner page - nobody sent anywhere', async () => {
      status.set('ready');
      visiting.set(true);
      expect(await go('/stats')).toBe(true);
      expect(await go('/songs/ode-to-joy')).toBe(true);
      expect(await go('/')).toBe(true);
      expect(auth.signIn).not.toHaveBeenCalled();
    });

    it('never lets a visitor into the admin panel: it goes by the IAM - after the saves on their way arrived', async () => {
      status.set('ready');
      visiting.set(true);
      expect(await go('/admin')).toBe(false);
      expect(auth.signIn).toHaveBeenLastCalledWith('/admin', 'sk');
      expect(order).toEqual(['settled', 'signIn']);
    });

    it('sends a person whose sign-in ended in the middle of practising by the IAM, as before: their page holds their own progress, no visitor’s', async () => {
      status.set('ready');
      expect(await go('/stats')).toBe(false);
      expect(auth.signIn).toHaveBeenLastCalledWith('/stats', 'sk');
    });

    it('lets nothing through while the app cannot run, and nobody through before it runs', async () => {
      visiting.set(true);
      for (const state of ['loading', 'not-set-up', 'load-error'] as const) {
        status.set(state);
        expect(await go('/stats')).toBe(false);
      }
      expect(auth.signIn).not.toHaveBeenCalled();
    });
  });

  it('sends a visitor by the IAM once the IAM requires a sign-in (the API said so in the middle of practising)', async () => {
    status.set('ready');
    visiting.set(true);
    expect(await go('/stats')).toBe(false);
    expect(auth.signIn).toHaveBeenLastCalledWith('/stats', 'sk');
    expect(order).toEqual(['settled', 'signIn']);
  });
});
