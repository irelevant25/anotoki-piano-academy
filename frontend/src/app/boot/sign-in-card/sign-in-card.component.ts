import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { AuthService } from '../../core/auth/auth.service';
import { signInFailureKey, signInFailureParams } from '../../core/i18n/error-text';
import { BootService } from '../../core/state/boot.service';

/**
 * Drawn only after a sign-in that came back without one, or could not start
 * (a signed-out visitor is otherwise sent straight to the IAM by the sign-in
 * guard): sign in with the anotoki account, and why the last try did not
 * work - worded from the failure's code, in the language on the page, never
 * in the IAM's or the SDK's own English: one sentence for access_denied (the
 * IAM turned the account away, or the person went back), one for a browser
 * that refuses the site's storage (storage_unavailable), and one with the
 * code for anything else.
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
    void this.boot.signIn();
  }
}
