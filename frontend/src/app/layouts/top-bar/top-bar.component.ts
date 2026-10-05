import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, Signal, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { BootService } from '../../core/state/boot.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { BrandComponent } from '../../ui/brand/brand.component';
import { ConfirmDialogComponent, Question } from '../../ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { LanguageSwitcherComponent } from '../../ui/language-switcher/language-switcher.component';
import { MidiPanelComponent } from '../../ui/midi-panel/midi-panel.component';
import { SpinnerComponent } from '../../ui/spinner/spinner.component';
import { ThemeToggleComponent } from '../../ui/theme-toggle/theme-toggle.component';

/**
 * A section in the bar: its words - a key where learners read it, English
 * where only the admin panel does - where it goes, and the addresses under it
 * that are part of it.
 */
export interface BarLink {
  /** The key of its words (the learner's sections). */
  key?: string;
  /** Its words in English (the admin panel's sections: the admin panel is English). */
  english?: string;
  path: string;
  /** Address beginnings that belong to the section too (a lesson is under Learn, a song under Songs). */
  under: readonly string[];
  /** Only an ADMIN has this section (the rest of the admin panel is the staff's: EDITOR or ADMIN). */
  adminOnly?: boolean;
}

/** The learner's sections. */
export const APP_LINKS: readonly BarLink[] = [
  { key: 'nav.learn', path: '/', under: ['/lesson/'] },
  { key: 'nav.trainer', path: '/trainer', under: [] },
  { key: 'nav.sheet', path: '/sheet', under: [] },
  { key: 'nav.songs', path: '/songs', under: ['/songs/'] },
  { key: 'nav.stats', path: '/stats', under: [] },
];

/** The admin panel's sections: Translations for the staff, the rest for an ADMIN. */
export const ADMIN_LINKS: readonly BarLink[] = [
  { english: 'Translations', path: '/admin/translations', under: [] },
  { english: 'Languages', path: '/admin/languages', under: [], adminOnly: true },
  { english: 'People', path: '/admin/people', under: [], adminOnly: true },
  { english: 'Migrations', path: '/admin/migrations', under: [], adminOnly: true },
];

/**
 * Up to this width the bar is a phone's: the links and the person's menu fold
 * into one menu button. Piano's own number (the survey's is 760), measured
 * with the real labels in English and Slovak (the browser check's --measure):
 * the widest row - "anotoki Piano Academy", the five sections, "Not saved
 * yet", the piano with a device name at its widest (8rem), the language, the
 * theme and the person's initial - needs 1210 px in English and 1237 px in
 * Slovak (1139 and 1174 with "No piano"). The same number is in the .scss.
 */
export const PHONE_BAR_MAX = 1240;
/** From this width the person's name stands beside the initial (200 px for it, as in the family's bar). */
export const NAME_BAR_MIN = PHONE_BAR_MAX + 201;

/** Which of the bar's two menus is open: the person's (account) or the phone's (links and account). */
type OpenMenu = 'account' | 'phone' | null;

/**
 * The bar across the top of every page - the anotoki family's one bar
 * (the survey's layouts/top-bar), in one row, in this order: the brand (the
 * mark, "anotoki" and "Piano Academy", linking home); the sections as links;
 * then "Not saved yet" while some progress waits, the piano (the MIDI widget),
 * the language, the theme, and the person's menu (name, address, role; their
 * anotoki account; the way into the admin panel for the staff, or back from
 * it; signing out) - or the button to sign in.
 *
 * On a phone (up to PHONE_BAR_MAX) the brand is the mark and "Piano"
 * (brand.short), the piano is its dot and icon, and the links and the
 * person's menu (or Sign in) are inside one menu button at the right; "Not
 * saved yet" is a dot on that button, and its sentence the menu's first line.
 *
 * Both menus are the IAM's own pattern, as the survey's bar has them: a menu
 * button, focus into the menu when it opens, arrow keys, Home and End between
 * its items, Escape and a click outside to close it - Escape gives the focus
 * back to the button. Tab and Shift+Tab close it with the focus on the button
 * too, so the next Tab moves on from there (not to <body>).
 *
 * The admin panel (/admin) has the same bar with its own sections, in English,
 * no language chooser and no piano: TranslationService reads every key in
 * English there (effectiveLanguage), so the bar has no case of its own for
 * that. Every word a learner meets here is a key, and in kept-english.ts too
 * (the bar is drawn while the app has no strings).
 */
@Component({
  selector: 'app-top-bar',
  imports: [NgTemplateOutlet, RouterLink, BrandComponent, ConfirmDialogComponent, IconComponent, LanguageSwitcherComponent, MidiPanelComponent, SpinnerComponent, ThemeToggleComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
})
export class TopBarComponent {
  protected readonly auth = inject(AuthService);
  protected readonly boot = inject(BootService);
  protected readonly store = inject(ProgressStore);
  private readonly _i18n = inject(TranslationService);
  private readonly _router = inject(Router);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);
  private readonly _question = viewChild.required(ConfirmDialogComponent);

  /** Which menu is open, if one is. */
  protected readonly openMenu = signal<OpenMenu>(null);
  protected readonly signingOut = signal(false);
  /** The bar of a phone: the links and the person's menu inside the menu button. */
  protected readonly phone = this._matches(`(max-width: ${PHONE_BAR_MAX}px)`);

  /** The address of the page, without its query: which area, which link. */
  private readonly _path = toSignal(
    this._router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this._router.url),
    ),
    { initialValue: this._router.url },
  );
  private readonly _here = computed(() => this._path().split(/[?#]/)[0] || '/');

  /** The admin panel: its own sections, English, no chooser, no piano. */
  protected readonly inAdmin = computed(() => this._here() === '/admin' || this._here().startsWith('/admin/'));

  /**
   * The sections: the learner's once the app runs (before, there is nothing
   * to practise on); in the admin panel the ones the person's role opens -
   * none for somebody without one, whom the admin layout sends back. While
   * the database is behind, an ADMIN there has the Migrations page alone.
   */
  protected readonly links = computed<readonly BarLink[]>(() => {
    if (this.boot.status() !== 'ready') return this.boot.onlyMigrations() && this.inAdmin() ? ADMIN_LINKS.filter((link) => link.path === '/admin/migrations') : [];
    if (!this.inAdmin()) return APP_LINKS;
    if (!this.auth.isStaff()) return [];
    return ADMIN_LINKS.filter((link) => !link.adminOnly || this.auth.isAdmin());
  });

  /** The person's name: their own, as it is; worded only when the token names nobody. */
  protected readonly name = computed(() => this.auth.displayName() ?? this._i18n.t('account.signedIn'));
  protected readonly initial = computed(() => (this.auth.displayName()?.trim()[0] ?? '?').toUpperCase());
  /** The e-mail address under the name, when it is not the name itself. */
  protected readonly email = computed(() => {
    const email = this.auth.signedIn() ? this.auth.user()?.email : null;
    return email && email !== this.auth.displayName() ? email : null;
  });
  protected readonly accountUrl = computed(() => (this.auth.signedIn() ? this.auth.accountUrl() : null));
  /**
   * Sign in: only once the app has run and the sign-in ended (in the middle
   * of practising). Before, a signed-out visitor is on the way to the IAM, or
   * has the sign-in card with its own button.
   */
  protected readonly offerSignIn = computed(() => !this.auth.signedIn() && this.store.loaded());
  /**
   * The phone's menu button, only when its menu would hold something: before
   * the app runs a signed-out visitor (the sign-in card, not set up, could
   * not load) has no section, no person and no Sign in - an empty menu.
   */
  protected readonly phoneMenu = computed(() => this.links().length > 0 || this.auth.signedIn() || this.offerSignIn());

  /** The sign-out question, worded in a computed(): it follows the language, and is drawn in the closed dialog too. */
  protected readonly signOutWords = computed<Question>(() => ({
    title: this._i18n.t('signOut.title'),
    message: this._i18n.t('signOut.text'),
    confirmLabel: this._i18n.t('signOut.confirm'),
    cancelLabel: this._i18n.t('signOut.cancel'),
    danger: true,
  }));

  private readonly _accountButton = viewChild<ElementRef<HTMLButtonElement>>('accountButton');
  private readonly _phoneButton = viewChild<ElementRef<HTMLButtonElement>>('phoneButton');
  private readonly _menu = viewChild<ElementRef<HTMLElement>>('menu');

  constructor() {
    // From a phone's bar to a desktop's (a turned tablet, a wider window): the open menu would belong to neither.
    // And a phone's menu that has nothing left to hold is gone with its button.
    effect(() => {
      this.phone();
      this.phoneMenu();
      untracked(() => this.closeMenu(false));
    });
  }

  /** Whether the screen matches a media query, kept current while the bar is there. */
  private _matches(media: string): Signal<boolean> {
    const matches = signal(false);
    const query = globalThis.matchMedia?.(media);
    if (query) {
      const update = () => matches.set(query.matches);
      update();
      query.addEventListener('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
    }
    return matches.asReadonly();
  }

  /** The page is this link's own address. */
  protected isPage(link: BarLink): boolean {
    return this._here() === link.path;
  }

  /** The page is in this link's section: its own address or one under it. */
  protected inSection(link: BarLink): boolean {
    const here = this._here();
    return here === link.path || link.under.some((start) => here.startsWith(start));
  }

  /** To the IAM and back to this page, its pages in the learner's language (BootService); the card says why when it cannot start. */
  protected signIn(): void {
    this.closeMenu(false);
    void this.boot.signIn();
  }

  protected toggleMenu(which: 'account' | 'phone'): void {
    if (this.openMenu() === which) {
      this.closeMenu(true);
      return;
    }
    this.openMenu.set(which);
    // Into the menu once it is drawn, as a menu button is expected to do. Drawn
    // means after the next render: with no zone, a microtask runs before it.
    afterNextRender(() => this._menuItems()[0]?.focus(), { injector: this._injector });
  }

  /** Closes the open menu; `returnFocus`: back to the button that opened it (Escape, Tab, the button again). */
  closeMenu(returnFocus: boolean): void {
    const open = this.openMenu();
    if (!open) {
      return;
    }
    this.openMenu.set(null);
    if (returnFocus) {
      (open === 'account' ? this._accountButton() : this._phoneButton())?.nativeElement.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    const open = this.openMenu();
    if (!open) {
      return;
    }
    const root = this._host.nativeElement.querySelector(open === 'account' ? '.user-menu' : '.phone-menu');
    if (!root || !root.contains(event.target as Node)) {
      this.closeMenu(false);
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this._menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'Tab') {
      // Tab (or Shift+Tab) leaves the menu from its button. Left to the browser,
      // the focus would move to the next item of a menu still drawn - with no
      // zone it is removed only at the next render - and then fall to <body>.
      event.preventDefault();
      this.closeMenu(true);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  /**
   * Signs out everywhere (the IAM ends its session) - after what is waiting is
   * settled (a spinner meanwhile): a failed save goes once more and what is on
   * its way arrives. If progress or the path still did not get through - or
   * finished rounds the browser could not keep - signing out would lose them,
   * and the learner is asked first, in their language (signOut.*).
   */
  protected async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      if (await this.boot.settleBeforeSignOut()) {
        this.closeMenu(false);
        if (!(await this._question().ask())) {
          this.signingOut.set(false);
          return;
        }
      }
      this.boot.signOut();
    } catch (error) {
      console.error('Signing out failed.', error);
      this.signingOut.set(false);
    }
  }

  private _menuItems(): HTMLElement[] {
    const menu = this._menu()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
  }
}
