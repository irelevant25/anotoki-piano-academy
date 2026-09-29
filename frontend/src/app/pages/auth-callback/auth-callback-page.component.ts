import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * /auth/callback - where the IAM sends the browser back after signing in (the
 * registered redirect URI). The work is done before the app is drawn: the SDK's
 * init() exchanges the code and puts the address the person came from back in
 * the address bar. Opened any other way, there is nothing to finish here.
 */
@Component({
  selector: 'app-auth-callback-page',
  templateUrl: './auth-callback-page.component.html',
  styleUrl: './auth-callback-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackPageComponent {
  constructor() {
    const router = inject(Router);
    afterNextRender(() => void router.navigateByUrl('/', { replaceUrl: true }));
  }
}
