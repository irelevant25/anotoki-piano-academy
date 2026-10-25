import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TopBarBrand, TopBarComponent as FamilyTopBarComponent, TopBarLink, TopBarMenuItem, TopBarMenuNote, TopBarPerson, TopBarPhoneMark } from '@anotoki/lib/shell';
import { SiteSettings } from '@anotoki/lib/site-settings';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { filter, map } from 'rxjs';
import { SignOutService } from '../../../../shared/auth/sign-out.service';
import { isLegalPage } from '../../../../shared/legal/legal.config';
import { BootService } from '../../../../shared/state/boot.service';
import { ProgressStore } from '../../../../shared/state/progress-store.service';
import { MidiPanelComponent } from '../midi-panel/midi-panel.component';

/** A section in the bar: the key of its words, where it goes, and the addresses under it that are part of it. */
export interface BarLink {
  key: string;
  path: string;
  /** Address beginnings that belong to the section too (a lesson is under Learn, a song under Songs). */
  under: readonly string[];
}

/** The learner's sections. */
export const APP_LINKS: readonly BarLink[] = [
  { key: 'nav.learn', path: '/', under: ['/lesson/'] },
  { key: 'nav.trainer', path: '/trainer', under: [] },
  { key: 'nav.sheet', path: '/sheet', under: [] },
  { key: 'nav.songs', path: '/songs', under: ['/songs/'] },
  { key: 'nav.stats', path: '/stats', under: [] },
];

/**
 * Up to this width the bar is a phone's: the links and the person's menu fold
 * into one menu button. Piano's own number (the survey's is 760), measured
 * with the real labels in English and Slovak (the browser check's --measure):
 * the widest row - "anotoki Piano Academy", the five sections, "Not saved
 * yet" (the family's badge), the piano with a device name at its widest
 * (8rem), the language, the family's theme switch and the person's initial -
 * needs 1290 px in English and 1312 px in Slovak, in Manrope (1218 and 1252
 * with "No piano"; measured 2026-10-11) - inside the family's row too, which
 * is never wider than 84rem (1344 px).
 */
export const PHONE_BAR_MAX = 1320;
/** From this width the person's name stands beside the initial (200 px for it, as in the family's bar). */
export const NAME_BAR_MIN = PHONE_BAR_MAX + 201;

/**
 * The bar across the top of every page of the learner's site: the anotoki
 * family's one bar (@anotoki/lib/shell's <anotoki-top-bar>), told what is
 * Piano Academy's - its brand, its sections, who is signed in and what they
 * may do, and the two widgets it carries before the language: "Not saved
 * yet" while some progress waits (the family's warning badge), and the piano
 * (sites/main/common/midi-panel). The family's bar draws the
 * row in the family's order, folds into one menu button up to PHONE_BAR_MAX
 * ("Piano", brand.short, beside the mark), and has the family's menus, keys,
 * language chooser and theme switch (light / dark / as the device is set).
 *
 * On a phone "Not saved yet" is a dot on the menu button, named for a screen
 * reader (the bar's phoneMark), and both menus open with it and what it means
 * (menuNote). Signing out settles what is waiting first - the family's item
 * says "Saving…" meanwhile - and asks, in the learner's words (signOut.*),
 * when progress would be lost (the family's ConfirmService; the one sign-out,
 * shared/auth/sign-out.service.ts). Sign in is
 * offered once the app has run (in the middle of practising, or to a
 * visitor); before, the guard is on its way to the IAM, or the screen that
 * says why a sign-in did not work has its own Try again.
 *
 * The bar is the learner's site's alone: the admin panel (/admin) has the
 * family's admin frame instead (sites/admin/app.component), and the shell
 * draws no bar there. The way into it is in the person's menu for the staff,
 * while the site is ready. Every word a learner meets here is a key, and in
 * kept-english.ts too (the bar is drawn while the app has no strings) - but
 * the family's own words: the bar's, and the person's role and menu items,
 * worded as every anotoki site words them ("Administrator", "Your anotoki
 * account", "Admin panel"), are the library's keys in the database
 * (anotoki.topbar.*: an owner's rewording reaches them), built into the
 * library for when there is no bundle - never shown as a key.
 */
@Component({
  selector: 'app-top-bar',
  imports: [FamilyTopBarComponent, MidiPanelComponent, TranslatePipe, BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  protected readonly auth = inject(AnotokiAuth);
  protected readonly boot = inject(BootService);
  protected readonly store = inject(ProgressStore);
  private readonly site = inject(SiteStatus);
  private readonly settings = inject(SiteSettings);
  private readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly signOuts = inject(SignOutService);

  private readonly bar = viewChild.required(FamilyTopBarComponent);

  /** The address of the page, without its query. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly here = computed(() => this.path().split(/[?#]/)[0] || '/');

  /** Where the bar folds, and where the name shows beside the initial. */
  protected readonly phoneMax = PHONE_BAR_MAX;
  protected readonly nameMin = NAME_BAR_MIN;

  protected readonly brand = computed<TopBarBrand>(() => ({
    area: this.i18n.t('brand.area'),
    short: this.i18n.t('brand.short'),
    link: '/',
    label: this.i18n.t('topbar.home'),
  }));

  /**
   * The sections, once the app runs (before, there is nothing to practise
   * on). While the site is not ready (the family's status page in the view's
   * place) none. A section the site settings' Page access closes to the
   * reader is left out: its page would not open for them (the family's
   * pageAccessGuard), and a link that leads to the start page is no section.
   */
  protected readonly links = computed<TopBarLink[]>(() =>
    this.boot.status() !== 'ready' || this.site.blocked()
      ? []
      : APP_LINKS.filter((link) => this.settings.mayNavigate(link.path)).map((link) => ({ id: link.path, label: this.i18n.t(link.key), path: link.path, under: link.under })),
  );

  /** Who is signed in: their name as it is (worded only when the token names nobody), the address under it when it is not the name, the role. */
  protected readonly person = computed<TopBarPerson | null>(() => {
    if (!this.auth.signedIn()) return null;
    const name = this.auth.displayName();
    const email = this.auth.user()?.email ?? null;
    return {
      name: name || this.i18n.t('account.signedIn'),
      email: email && email !== name ? email : null,
      role: this.auth.isAdmin() ? this.i18n.t('anotoki.topbar.roleAdmin') : this.auth.isStaff() ? this.i18n.t('anotoki.topbar.roleEditor') : null,
    };
  });

  /** Between the person's name and Sign out: their anotoki account (a new tab), and the admin panel for the staff while the site is ready. */
  protected readonly menuItems = computed<TopBarMenuItem[]>(() => {
    const items: TopBarMenuItem[] = [];
    const account = this.auth.signedIn() ? this.auth.accountUrl() : null;
    if (account) items.push({ id: 'account', label: this.i18n.t('anotoki.topbar.account'), icon: 'user', href: account, newTab: true });
    if (this.auth.isStaff() && !this.site.blocked()) items.push({ id: 'admin', label: this.i18n.t('anotoki.topbar.admin'), icon: 'shield', path: '/admin' });
    return items;
  });

  /**
   * Sign in: only once the app has run and the sign-in ended (in the middle
   * of practising), or for a visitor - and on a legal page (Terms, Privacy,
   * Contact: anybody's) for somebody not signed in where a sign-in is
   * required, whom no guard sends to the IAM there. Before, a signed-out
   * visitor is on the way to the IAM, or on the screen that says why a
   * sign-in did not work, with its Try again. To the IAM
   * and back to this page, its pages in the learner's language (BootService:
   * a visitor's saves arrive first - the family's item waits for them).
   */
  private readonly offerSignIn = computed(() => !this.auth.signedIn() && (this.store.loaded() || (isLegalPage(this.here()) && this.boot.status() === 'sign-in')));
  protected readonly signIn = computed(() => (this.offerSignIn() ? () => this.boot.signIn() : null));

  /** Signs out everywhere, the one way (SignOutService): the menu that asked goes first when there is a question. */
  protected readonly signOut = (): Promise<void> => this.signOuts.signOut(() => this.bar().closeMenu(false));

  /** "Not saved yet" on a phone: a dot on the menu button, its words for a screen reader. */
  protected readonly phoneMark = computed<TopBarPhoneMark | null>(() => (this.store.unsaved() ? { dot: true, description: this.i18n.t('account.notSaved') } : null));

  /** "Not saved yet", and what it means, heading both menus. */
  protected readonly menuNote = computed<TopBarMenuNote | null>(() => (this.store.unsaved() ? { title: this.i18n.t('account.notSaved'), text: this.i18n.t('account.notSavedHint') } : null));
}
