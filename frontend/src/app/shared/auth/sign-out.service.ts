import { Injectable, inject } from '@angular/core';
import { TranslationService } from '@anotoki/lib/translations';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { BootService } from '../state/boot.service';

/**
 * Signing out, the one way there is: the top bar's Sign out (sites/main/common/top-bar) and the admin panel's frame's
 * (sites/admin/app.component) both run it, so a person signing out of either is asked the same thing.
 *
 * It signs out everywhere (the IAM ends its session) - after what is waiting is settled: a failed save goes once more
 * and what is on its way arrives (the bar's item and the frame's Sign out say "Saving…" while the promise is out). If
 * progress or the path still did not get through - or finished rounds the browser could not keep - signing out would
 * lose them, and the person is asked first, in the page's language (signOut.*: the learner's words, English in the
 * admin panel), the safe answer first.
 */
@Injectable({ providedIn: 'root' })
export class SignOutService {
  private readonly boot = inject(BootService);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(TranslationService);

  /** Signs out; `beforeAsking` closes what asked (the bar's menu) before the question, so the question stands alone. */
  async signOut(beforeAsking?: () => void): Promise<void> {
    try {
      if (await this.boot.settleBeforeSignOut()) {
        beforeAsking?.();
        const yes = await this.confirm.ask({
          title: this.i18n.t('signOut.title'),
          message: this.i18n.t('signOut.text'),
          confirmLabel: this.i18n.t('signOut.confirm'),
          cancelLabel: this.i18n.t('signOut.cancel'),
          tone: 'danger',
        });
        if (!yes) return;
      }
      this.boot.signOut();
    } catch (error) {
      console.error('Signing out failed.', error);
    }
  }
}
