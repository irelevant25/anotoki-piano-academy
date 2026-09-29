import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { BootService } from '../../core/state/boot.service';
import { ProgressStore } from '../../core/state/progress-store.service';

/**
 * Who is signed in, in the header - with sign-in through the IAM only;
 * without it (auth mode "none") there is nothing here at all. The username,
 * the IAM's account page (a new tab), Sign out - or, signed out in the middle
 * of practising, "Signed out" and Sign in. "Not saved yet" when some progress
 * has not reached the server; the app keeps trying.
 */
@Component({
  selector: 'app-account-panel',
  templateUrl: './account-panel.component.html',
  styleUrl: './account-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPanelComponent {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(ProgressStore);
  private readonly boot = inject(BootService);

  protected readonly signedIn = computed(() => this.auth.signedIn() && this.auth.user() !== null);
  /** Before the app runs, a signed-out person has the sign-in card - nothing to show up here. */
  protected readonly visible = computed(() => this.auth.usesSignIn() && (this.signedIn() || this.store.loaded()));
  protected readonly signingOut = signal(false);

  protected signIn(): void {
    this.boot.signIn();
  }

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    await this.boot.signOut();
  }
}
