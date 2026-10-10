import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SiteGateComponent, SitePagesDirective, SiteStatus } from '@anotoki/lib/migrations';
import { ConfirmHostComponent } from '@anotoki/lib/ui/dialog';
import { filter, map } from 'rxjs';
import { LoadErrorComponent } from './boot/load-error/load-error.component';
import { SignInCardComponent } from './boot/sign-in-card/sign-in-card.component';
import { ApiService } from './core/api/api.service';
import { AuthService, SignInFailure } from './core/auth/auth.service';
import { VisitorKey } from './core/auth/visitor-key';
import { ChangelogService } from './core/changelog/changelog.service';
import { signInFailureKey, signInFailureParams } from './core/i18n/error-text';
import { TranslatePipe } from './core/i18n/translate.pipe';
import { TranslationService } from './core/i18n/translation.service';
import { VISITOR_KEEP_DAYS, VISITOR_WORDS } from './core/i18n/visitor-words';
import { BootService } from './core/state/boot.service';
import { ProgressStore } from './core/state/progress-store.service';
import { MIGRATIONS_ROUTE } from './core/state/site-migrations';
import { TopBarComponent } from './layouts/top-bar/top-bar.component';
import { ChangelogDialogComponent } from './ui/changelog-dialog/changelog-dialog.component';

/**
 * The frame around every view: the family's top bar (layouts/top-bar: the
 * brand, the sections, the piano, the language, the theme and the person's
 * menu - the admin panel's sections under /admin), the view - or, while the
 * app cannot run yet, the card saying why - and the footer with the version,
 * which opens what is new. Also the notes that cannot be missed, under the
 * bar: signed out in the middle of practising, and the progress replaced or
 * deleted somewhere else (ProgressStore.changedElsewhere).
 *
 * While the site is not ready - an update waits, it is not set up, its
 * database is out of reach - the anotoki family's gate
 * (<anotoki-site-gate>, @anotoki/lib/migrations) draws its status page in
 * the view's place: visitors and learners read, in their language, that the
 * site is being updated (no error, no code, a quiet Sign in while nobody is
 * signed in), and it comes back by itself; the site's ADMIN reads that a
 * database update is waiting, and opens the Migrations page - the one page
 * that works then; the setup page only while the site was never installed.
 * The notes under the bar wait meanwhile: nothing but that page is said.
 * The view is the gate's marked template (<ng-template anotokiSitePages>,
 * anotoki-lib 0.2.0), made only while the gate shows it: no page runs behind
 * the status page - not at the start, and not when an update comes in the
 * middle of practising (the page goes then; the status page loads the site
 * afresh once it is back, without opening the gate first).
 *
 * The family's "Are you sure?" (<anotoki-confirm-host>, ConfirmService) is
 * drawn here once, for every question the app asks.
 *
 * For a VISITOR - practising without signing in, while the IAM does not
 * require it (BootService.visiting) - the notes of core/i18n/visitor-words.ts:
 * on Learn and Stats only (the practice screens stay clear) that the progress
 * is kept for this browser for VISITOR_KEEP_DAYS days after the last visit
 * and that signing in keeps it, with Sign in; that sign-in became required
 * meanwhile (Sign in - the key is kept, so the sign-in moves the progress);
 * that the progress this browser kept has ended (VisitorKey.lost); that a
 * save was refused because this browser keeps as much as a visitor may, or
 * too many people started without signing in this hour
 * (ApiService.visitorRefusal); and why a sign-in came back refused (the
 * signed-out banner's words, which a visitor does not get). After a sign-in
 * that brought this browser's progress into the account: that it did (and
 * that the account kept its own where it had some) - or that it could not
 * this time (BootService.visitorMoved / visitorNotMoved).
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
    TopBarComponent,
    ChangelogDialogComponent,
    SignInCardComponent,
    LoadErrorComponent,
    SiteGateComponent,
    SitePagesDirective,
    ConfirmHostComponent,
  ],
})
export class AppComponent {
  protected readonly boot = inject(BootService);
  protected readonly changelog = inject(ChangelogService);
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  protected readonly visitorKey = inject(VisitorKey);
  private readonly i18n = inject(TranslationService);
  protected readonly store = inject(ProgressStore);
  protected readonly site = inject(SiteStatus);

  private readonly changelogDialog = viewChild.required(ChangelogDialogComponent);

  private readonly router = inject(Router);
  /** The address of the page, without its query. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  /**
   * Inside the gate, the page rather than a card of the start: the app runs -
   * or an ADMIN is on the Migrations page, which works while the rest of the
   * app waits for an update. One outlet for both, so that page stays (with
   * what its Apply said) as the app starts after it. Otherwise the card that
   * says where the start is (loading, the sign-in card, could not load).
   * (Whether anything of the view is made at all is the gate's - also in the
   * moment the status page finds the site back: since anotoki-lib 0.2.0 it
   * reloads without opening the gate first, so no page of a start that waited
   * is made for that moment.)
   */
  protected readonly pageShown = computed(
    () => this.boot.status() === 'ready' || (this.auth.isAdmin() && (this.path() === MIGRATIONS_ROUTE || this.path().startsWith(MIGRATIONS_ROUTE + '/'))),
  );

  /** A sign-in that came back without one, or could not start: the card says so (otherwise the guard is on its way to the IAM). */
  protected readonly signInFailed = computed(() => this.auth.signInFailure() !== null);

  /**
   * Signed out in the middle of practising (the sign-in ran out elsewhere):
   * said where it cannot be missed. A person's page only - a visitor's is
   * nobody's sign-in that ended (it has the visitor's notes below).
   */
  protected readonly signedOutBanner = computed(() => this.store.loaded() && !this.auth.signedIn() && !this.boot.visiting());

  /**
   * Why the banner's (or the bar's) Sign in did nothing: a sign-in that could
   * not start in the middle of practising (the browser refused the storage
   * the sign-in in progress is kept in) - worded as the sign-in card words it.
   */
  protected readonly signInWhy = computed(() => {
    const failure = this.auth.signInFailure();
    return failure ? this.i18n.t(signInFailureKey(failure.code), signInFailureParams(failure.code)) : '';
  });

  protected readonly words = VISITOR_WORDS;
  protected readonly keepDays = VISITOR_KEEP_DAYS;

  /** A visitor's page: the app runs on a visitor's progress (or nobody's), and nobody signed in since. */
  protected readonly visitor = computed(() => this.boot.status() === 'ready' && this.boot.visiting() && !this.auth.signedIn());

  /** How long this browser's progress is kept, and that signing in keeps it: on Learn and Stats only, while no sign-in is required. */
  protected readonly visitorNotice = computed(() => this.visitor() && !this.auth.loginRequired() && (this.path() === '/' || this.path() === '/stats'));

  /** The API said a sign-in is required now (AuthService.requireSignInNow()): the visitor's saves wait for it. */
  protected readonly visitorSignInNow = computed(() => this.visitor() && this.auth.loginRequired());

  /** The server no longer knows this browser's key: what it kept has ended. Once, closable. */
  protected readonly visitorLost = computed(() => this.visitor() && this.visitorKey.lost());

  /** A visitor's save refused for good (visitor.full) or for now (visitor.busy) - the key of the words. */
  protected readonly visitorRefusal = computed(() => (this.visitor() ? this.api.visitorRefusal() : null));

  /** The sign-in failure the visitor closed: its words stay away until another one. */
  private readonly whyClosed = signal<SignInFailure | null>(null);

  /**
   * Why a sign-in started from a visitor's page did not happen - refused by
   * the IAM (access_denied: this account may not use Piano Academy now) or
   * unable to start - in the sign-in card's words, never swallowed: the
   * visitor stays on their page, and the signed-out banner is not theirs.
   */
  protected readonly visitorSignInWhy = computed(() => {
    const failure = this.auth.signInFailure();
    return this.visitor() && failure !== null && failure !== this.whyClosed() ? this.signInWhy() : '';
  });

  protected closeVisitorSignInWhy(): void {
    this.whyClosed.set(this.auth.signInFailure());
  }

  protected openChangelog(): void {
    this.changelogDialog().open();
  }
}
