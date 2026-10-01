import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { LoadErrorComponent } from './boot/load-error/load-error.component';
import { NotSetUpComponent } from './boot/not-set-up/not-set-up.component';
import { SignInCardComponent } from './boot/sign-in-card/sign-in-card.component';
import { AuthService } from './core/auth/auth.service';
import { ChangelogService } from './core/changelog/changelog.service';
import { TranslatePipe } from './core/i18n/translate.pipe';
import { BootService } from './core/state/boot.service';
import { ProgressStore } from './core/state/progress-store.service';
import { AccountPanelComponent } from './ui/account-panel/account-panel.component';
import { ChangelogDialogComponent } from './ui/changelog-dialog/changelog-dialog.component';
import { LanguageSwitcherComponent } from './ui/language-switcher/language-switcher.component';
import { MidiPanelComponent } from './ui/midi-panel/midi-panel.component';
import { ThemeToggleComponent } from './ui/theme-toggle/theme-toggle.component';

interface NavItem {
  id: string;
  /** The key of its word: state holds keys, the template words them. */
  labelKey: string;
  path: string;
}

/**
 * The frame around every view: the header (the piano connection, and who is
 * signed in), the navigation, the "signed out" banner, the view - or, while
 * the app cannot run yet, the card saying why - and the footer with the
 * version (which opens what is new), the owner's link to the app's words, the
 * language and the theme.
 *
 * All of it is drawn in every state of the start, also when the app has no
 * strings at all (not set up, the backend down): every key used out here is
 * in core/i18n/kept-english.ts too, which the translation service reads while
 * no bundle is in memory.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    TranslatePipe,
    MidiPanelComponent,
    AccountPanelComponent,
    LanguageSwitcherComponent,
    ThemeToggleComponent,
    ChangelogDialogComponent,
    SignInCardComponent,
    NotSetUpComponent,
    LoadErrorComponent,
  ],
})
export class AppComponent {
  protected readonly boot = inject(BootService);
  protected readonly changelog = inject(ChangelogService);
  private readonly auth = inject(AuthService);
  private readonly store = inject(ProgressStore);
  private readonly router = inject(Router);

  private readonly changelogDialog = viewChild.required(ChangelogDialogComponent);

  protected readonly nav: NavItem[] = [
    { id: 'home', labelKey: 'nav.learn', path: '/' },
    { id: 'trainer', labelKey: 'nav.trainer', path: '/trainer' },
    { id: 'sheet', labelKey: 'nav.sheet', path: '/sheet' },
    { id: 'songs', labelKey: 'nav.songs', path: '/songs' },
    { id: 'stats', labelKey: 'nav.stats', path: '/stats' },
  ];

  /**
   * The link to the app's words, for the person who may change them - once the
   * app runs. It only hides what the server refuses anyway.
   */
  protected readonly ownerLink = computed(() => this.boot.status() === 'ready' && this.auth.isOwner());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The nav item lit: a lesson belongs to Learn, a song to Songs. */
  protected readonly activeNav = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    if (path === '/' || path === '' || path.startsWith('/lesson')) return 'home';
    return path.split('/')[1] ?? 'home';
  });

  /** Signed out in the middle of practising (the sign-in ran out elsewhere): said where it cannot be missed. */
  protected readonly signedOutBanner = computed(() => this.auth.usesSignIn() && this.store.loaded() && !(this.auth.signedIn() && this.auth.user() !== null));

  /** The navigation does nothing until the progress is in memory - there is nothing to practise on before. */
  protected go(path: string): void {
    if (this.boot.status() !== 'ready') return;
    void this.router.navigateByUrl(path);
  }

  protected openChangelog(): void {
    this.changelogDialog().open();
  }
}
