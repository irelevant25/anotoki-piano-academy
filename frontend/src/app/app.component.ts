import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AnotokiAuth, SignInFailure, failureText, signInWords } from '@anotoki/lib/auth';
import { SiteFooterComponent } from '@anotoki/lib/footer';
import { SiteGateComponent, SitePagesDirective, SiteStatus } from '@anotoki/lib/migrations';
import { AnnouncementComponent, PageNoticeComponent } from '@anotoki/lib/site-settings';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { ConfirmHostComponent } from '@anotoki/lib/ui/dialog';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { filter, map } from 'rxjs';
import { LoadErrorComponent } from './shared/boot/load-error/load-error.component';
import { ApiService } from './api/api.service';
import { CALLBACK_PATH, SIGN_IN_FAILED_ROUTE } from './shared/auth/site-auth';
import { VisitorKey } from './shared/auth/visitor-key';
import { ChangelogService } from './shared/changelog/changelog.service';
import { VISITOR_KEEP_DAYS, VISITOR_WORDS } from './shared/i18n/visitor-words';
import { isLegalPage } from './shared/legal/legal.config';
import { BootService } from './shared/state/boot.service';
import { ProgressStore } from './shared/state/progress-store.service';
import { MIGRATIONS_ROUTE } from './shared/state/site-migrations';
import { TopBarComponent } from './sites/main/common/top-bar/top-bar.component';
import { ChangelogDialogComponent } from './shared/ui/changelog-dialog/changelog-dialog.component';
import { ViewRootComponent } from './shared/view-root/view-root.component';

/**
 * The frame around every view of the learner's site: the family's top bar
 * (sites/main/common/top-bar: the brand, the sections, the piano, the
 * language, the theme and the person's menu), the view - or, while the app
 * cannot run yet, the card saying why - and the family's footer. The admin
 * panel (/admin) has none of it: its page is the family's admin frame
 * (sites/admin/app.component - its column, its own <main>, the footer under
 * it), drawn here with nothing round it; only a card of the start (while
 * the app cannot run) stands alone in the view's <main> there. Also the
 * notes that cannot be missed, under the bar: signed out in the middle of
 * practising, and the progress replaced or deleted somewhere else
 * (ProgressStore.changedElsewhere) - the family's alerts, as wide as the
 * page, the ones that come of what just happened said at once (role alert,
 * or status); the "Loading…" of the start is the family's too.
 *
 * The anotoki family's gate (<anotoki-site-gate>, @anotoki/lib/migrations) is
 * the outermost of it all, and the whole frame - the bar, the notes, the
 * view, the footer - is its marked template (<ng-template anotokiSitePages>):
 * while the site is not ready - an update waits, it is not set up, its
 * database is out of reach - the gate draws its status page alone, in a
 * <main> of its own, with no bar and no footer round it (the owner's rule of
 * 2026-10-18, anotoki-lib 0.6.3): visitors and learners read, in their
 * language, that the site is being updated (no error, no code, a quiet Sign
 * in while nobody is signed in), and it comes back by itself; the site's
 * ADMIN reads that a database update is waiting, and opens the Migrations
 * page - the one page that works then, in the frame (the bar with Migrations
 * alone, the footer; no note meanwhile); the setup page only while the site
 * was never installed. The template is made only while the gate shows it: no
 * page runs behind the status page - not at the start, and not when an update
 * comes in the middle of practising (the page goes then, and the frame with
 * it; the status page loads the site afresh once it is back, without opening
 * the gate first).
 *
 * The site settings (anotoki-lib 0.11.0, shared/site-settings.ts) add two
 * of the family's pieces to the learner's frame: the announcement above the
 * bar (<anotoki-announcement>: information, a warning or something wrong, in
 * the page's language, hidden in this browser until its words change) and,
 * between the notes and the page, what the administrators alone read about
 * it (<anotoki-page-notice>: the site is closed for maintenance, this page is
 * switched off or kept for some readers). While the site is closed the gate
 * draws the family's closed sign alone for everybody but the site's ADMIN -
 * the sign-in's way back, the legal pages, About and Support stay anybody's.
 *
 * The family's "Are you sure?" (<anotoki-confirm-host>, ConfirmService) is
 * drawn here once, outside the gate, for every question the app asks. The
 * footer is the family's (<anotoki-site-footer>, @anotoki/lib/footer: the
 * build analyzer's, the owner's choice of 2026-10-18), under every page and
 * the admin panel's: "vX · What's new · Feedback" ("Version X" to a screen
 * reader) - the version and
 * What's new once the list of changes came (changelog.json, its newest entry
 * the version: one source), What's new opening this app's own dialog
 * (shared/ui/changelog-dialog, loaded only when it is opened), Feedback the family's
 * form in the kit's dialog (its code loaded with the press, configured in
 * shared/site-admin.ts) - and About · Support · Terms · Privacy · Contact under
 * them (the library's paths, the open one marked). Its words are the library's
 * (`anotoki.footer.*`, `anotoki.legalLinks.*`): the database's, else its own.
 *
 * The sign-in's own pages - the IAM's callback and the family's screen that
 * says why a sign-in did not work - and the legal pages (Terms, Privacy,
 * Contact, and About and Support in their frame) are drawn in the view's place whatever the start says: nobody need
 * be signed in on them, and none runs on anybody's progress.
 *
 * For a VISITOR - practising without signing in, while the IAM does not
 * require it (BootService.visiting) - the notes of shared/i18n/visitor-words.ts:
 * on Learn and Stats only (the practice screens stay clear) that the progress
 * is kept for this browser for VISITOR_KEEP_DAYS days after the last visit
 * and that signing in keeps it, with Sign in; that sign-in became required
 * meanwhile (Sign in - the key is kept, so the sign-in moves the progress);
 * that the progress this browser kept has ended (VisitorKey.lost); that a
 * save was refused because this browser keeps as much as a visitor may, or
 * too many people started without signing in this hour
 * (ApiService.visitorRefusal); and why a sign-in came back refused (in the
 * family's words, anotoki.signIn.* - a visitor stays on their page rather
 * than going to the failure's screen). After a sign-in
 * that brought this browser's progress into the account: that it did (and
 * that the account kept its own where it had some) - or that it could not
 * this time (BootService.visitorMoved / visitorNotMoved).
 *
 * All of it is drawn in every state of the start, also when the app has no
 * strings at all (not set up, the backend down): every key used out here is
 * in shared/i18n/kept-english.ts too, which the translation service reads while
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
    LoadErrorComponent,
    SiteGateComponent,
    SitePagesDirective,
    ConfirmHostComponent,
    ViewRootComponent,
    AlertComponent,
    ButtonComponent,
    SpinnerComponent,
    SiteFooterComponent,
    AnnouncementComponent,
    PageNoticeComponent,
  ],
})
export class AppComponent {
  protected readonly boot = inject(BootService);
  protected readonly changelog = inject(ChangelogService);
  protected readonly auth = inject(AnotokiAuth);
  private readonly api = inject(ApiService);
  protected readonly visitorKey = inject(VisitorKey);
  private readonly i18n = inject(TranslationService);
  protected readonly store = inject(ProgressStore);
  protected readonly site = inject(SiteStatus);

  private readonly router = inject(Router);
  /** The address of the page, without its query. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  /** The admin panel (/admin): the family's admin frame is its page's frame - no bar, no notes, no footer of the shell's. */
  protected readonly adminArea = computed(() => this.path() === '/admin' || this.path().startsWith('/admin/'));

  /**
   * Inside the gate, the page rather than a card of the start: the app runs -
   * or an ADMIN is on the Migrations page, which works while the rest of the
   * app waits for an update, or the address is one of the sign-in's own pages
   * (the callback, the failure's screen), or one of the legal pages (Terms,
   * Privacy, Contact: anybody's, signed in or not, with nothing of a person's
   * progress on them - shared/legal). One outlet for all, so the
   * Migrations page stays (with what its Apply said) as the app starts after
   * it. Otherwise the card that says where the start is (loading, could not
   * load).
   * (Whether anything of the view is made at all is the gate's - also in the
   * moment the status page finds the site back: since anotoki-lib 0.2.0 it
   * reloads without opening the gate first, so no page of a start that waited
   * is made for that moment.)
   */
  protected readonly pageShown = computed(
    () =>
      this.boot.status() === 'ready' ||
      this.path() === SIGN_IN_FAILED_ROUTE ||
      this.path() === CALLBACK_PATH ||
      isLegalPage(this.path()) ||
      (this.auth.isAdmin() && (this.path() === MIGRATIONS_ROUTE || this.path().startsWith(MIGRATIONS_ROUTE + '/'))),
  );

  /**
   * Signed out in the middle of practising (the sign-in ran out elsewhere):
   * said where it cannot be missed. A person's page only - a visitor's is
   * nobody's sign-in that ended (it has the visitor's notes below).
   */
  protected readonly signedOutBanner = computed(() => this.store.loaded() && !this.auth.signedIn() && !this.boot.visiting());

  /**
   * Why the banner's (or the bar's) Sign in did nothing: a sign-in that could
   * not start in the middle of practising (the browser refused the storage
   * the sign-in in progress is kept in) - in the family's words of the
   * failure's screen (anotoki.signIn.*, from the code alone: an owner's
   * rewording in the database, else this app's English kept in code, else
   * the library's own).
   */
  protected readonly signInWhy = computed(() => {
    const failure = this.auth.signInFailure();
    if (!failure) return '';
    return failureText(failure.code, signInWords(this.i18n.signInLanguage(), undefined, (key) => this.i18n.libraryWord(key)).words);
  });

  protected readonly words = VISITOR_WORDS;
  protected readonly keepDays = VISITOR_KEEP_DAYS;

  /** A visitor's page: the app runs on a visitor's progress (or nobody's), and nobody signed in since. */
  protected readonly visitor = computed(() => this.boot.status() === 'ready' && this.boot.visiting() && !this.auth.signedIn());

  /** How long this browser's progress is kept, and that signing in keeps it: on Learn and Stats only, while no sign-in is required. */
  protected readonly visitorNotice = computed(() => this.visitor() && !this.auth.loginRequired() && (this.path() === '/' || this.path() === '/stats'));

  /** The API said a sign-in is required now (AnotokiAuth.noteSignInRequired()): the visitor's saves wait for it. */
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
   * unable to start - in the failure's screen's words, never swallowed: the
   * visitor stays on their page, and the signed-out banner is not theirs.
   */
  protected readonly visitorSignInWhy = computed(() => {
    const failure = this.auth.signInFailure();
    return this.visitor() && failure !== null && failure !== this.whyClosed() ? this.signInWhy() : '';
  });

  protected closeVisitorSignInWhy(): void {
    this.whyClosed.set(this.auth.signInFailure());
  }

  /** What's new is open (its code is loaded the first time) - from the footer's What's new, there only once the list came. */
  protected readonly whatsNewOpen = signal(false);
}
