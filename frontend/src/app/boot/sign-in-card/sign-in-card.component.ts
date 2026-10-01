import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { signInFailureKey, signInFailureParams } from '../../core/i18n/error-text';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { BootService } from '../../core/state/boot.service';

/**
 * Signed out (auth mode "iam"): sign in with the anotoki account. After a
 * sign-in that came back without one, it says so - worded from the failure's
 * code, in the language on the page, never in the IAM's or the SDK's own
 * English: one sentence for access_denied (the IAM turned the account away,
 * or the person went back), and one with the code for anything else.
 */
@Component({
  selector: 'app-sign-in-card',
  templateUrl: './sign-in-card.component.html',
  styleUrl: './sign-in-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class SignInCardComponent {
  private readonly auth = inject(AuthService);
  private readonly boot = inject(BootService);
  private readonly i18n = inject(TranslationService);

  /** Worded inside a computed(): t() reads signals, so the sentence follows the language. */
  protected readonly why = computed(() => {
    const failure = this.auth.signInFailure();
    return failure ? this.i18n.t(signInFailureKey(failure.code), signInFailureParams(failure.code)) : '';
  });

  protected signIn(): void {
    this.boot.signIn();
  }
}
