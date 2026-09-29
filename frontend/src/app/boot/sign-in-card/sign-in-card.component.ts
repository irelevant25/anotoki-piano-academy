import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService, describeSignInFailure } from '../../core/auth/auth.service';
import { BootService } from '../../core/state/boot.service';

/**
 * Signed out (auth mode "iam"): sign in with the anotoki account. After a
 * sign-in that came back without one, it says why - in the IAM's own words
 * when the IAM turned the account away ("This account cannot use Piano
 * Academy") or the person went back ("The sign-in was cancelled").
 */
@Component({
  selector: 'app-sign-in-card',
  templateUrl: './sign-in-card.component.html',
  styleUrl: './sign-in-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInCardComponent {
  private readonly auth = inject(AuthService);
  private readonly boot = inject(BootService);

  protected readonly why = computed(() => describeSignInFailure(this.auth.signInFailure()));

  protected signIn(): void {
    this.boot.signIn();
  }
}
