import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, SignInFailure } from '../../core/auth/auth.service';
import { BootService } from '../../core/state/boot.service';
import { AdminLayoutComponent } from './admin-layout.component';

describe('AdminLayoutComponent: the admin panel split by role, in English', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;
  let host: HTMLElement;
  const boot = { signIn: vi.fn(async () => undefined) };

  async function as(person: { signedIn: boolean; roles?: string[]; failure?: SignInFailure | null }): Promise<void> {
    const roles = person.signedIn ? (person.roles ?? []) : [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            signedIn: () => person.signedIn,
            isAdmin: () => roles.includes('ADMIN'),
            isStaff: () => roles.includes('ADMIN') || roles.includes('EDITOR'),
            signInFailure: () => person.failure ?? null,
          },
        },
        { provide: BootService, useValue: boot },
      ],
    });
    fixture = TestBed.createComponent(AdminLayoutComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  // The sections are the top bar's links in the admin panel (layouts/top-bar's spec): the layout draws none of its own.
  it('draws the page for an ADMIN and an EDITOR - English, with no section nav of its own', async () => {
    for (const roles of [['ADMIN'], ['EDITOR']]) {
      TestBed.resetTestingModule();
      await as({ signedIn: true, roles });
      expect(host.querySelector('router-outlet')).not.toBeNull();
      expect(host.querySelector('.admin-area')?.getAttribute('lang')).toBe('en');
      expect(host.querySelector('nav')).toBeNull();
    }
  });

  it('tells a learner (or an old MEMBER) whose the area is, and draws no page', async () => {
    for (const roles of [[], ['MEMBER']]) {
      TestBed.resetTestingModule();
      await as({ signedIn: true, roles });
      expect(host.querySelector('#admin-no-role h2')?.textContent).toBe('This part is for the people who keep Piano Academy\'s words');
      expect(host.querySelector('router-outlet')).toBeNull();
    }
  });

  it('signed out: after a session that ended, and after a sign-in that came back without one - each with its Sign in', async () => {
    await as({ signedIn: false });
    expect(host.querySelector('#admin-signed-out h2')?.textContent).toBe('You are signed out');
    (host.querySelector('#admin-sign-in') as HTMLButtonElement).click();
    expect(boot.signIn).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    await as({ signedIn: false, failure: { code: 'access_denied', message: '' } });
    expect(host.querySelector('#admin-signed-out h2')?.textContent).toBe('You are not signed in');
    expect(host.querySelector('router-outlet')).toBeNull();
  });
});
