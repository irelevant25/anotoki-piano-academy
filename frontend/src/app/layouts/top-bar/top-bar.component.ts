import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TopBarBrand, TopBarComponent as FamilyTopBarComponent, TopBarLink, TopBarMenuItem, TopBarMenuNote, TopBarPerson, TopBarPhoneMark } from '@anotoki/lib/shell';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { filter, map } from 'rxjs';
import { isLegalPage } from '../../core/legal/legal.config';
import { ADMIN_TOOL_ROUTES } from '../../core/site-admin';
import { BootService } from '../../core/state/boot.service';
import { ProgressStore } from '../../core/state/progress-store.service';
import { MidiPanelComponent } from '../../ui/midi-panel/midi-panel.component';

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

/**
 * The admin panel's sections: Translations for the staff, the rest for an
 * ADMIN - the languages, the people, the migrations, and the family's admin
 * tools (core/site-admin.ts). Feedback carries how many messages are new.
 */
export const ADMIN_LINKS: readonly BarLink[] = [
  { english: 'Translations', path: '/admin/translations', under: [] },
  { english: 'Languages', path: '/admin/languages', under: [], adminOnly: true },
  { english: 'People', path: ADMIN_TOOL_ROUTES.people, under: [], adminOnly: true },
  { english: 'Feedback', path: ADMIN_TOOL_ROUTES.feedback, under: [], adminOnly: true },
  { english: 'Error log', path: ADMIN_TOOL_ROUTES.errors, under: [], adminOnly: true },
  { english: 'Audit log', path: ADMIN_TOOL_ROUTES.audit, under: [], adminOnly: true },
  { english: 'Backups', path: ADMIN_TOOL_ROUTES.backups, under: [], adminOnly: true },
  { english: 'Migrations', path: '/admin/migrations', under: [], adminOnly: true },
];

/** The admin panel's wordmark: the family's one form, "anotoki {site} · admin panel" (English, as the panel is). */
export const ADMIN_BRAND = { area: 'Piano Academy', panel: 'admin panel', label: 'anotoki Piano Academy · admin panel' } as const;

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
 * The same for the admin panel, whose row is its own: an ADMIN's eight
 * sections - the family's admin tools among them, "Feedback" with the number
 * of new messages - beside the brand, the theme switch and the person's
 * initial (no language, no piano). Its brand is short there at every width
 * ("Piano" with "admin panel" under it, the whole name in the link's name),
 * as Japanese Academy's and the build analyzer's admin panels are: the full
 * wordmark beside eight sections would not fit in the family's row (84rem).
 * Measured as PHONE_BAR_MAX is (--measure), with a two-digit count beside
 * Feedback and "Not saved yet" showing: 1255 px, in English and with Slovak
 * chosen alike (the panel is English) - room for a scrollbar above it.
 */
export const ADMIN_PHONE_BAR_MAX = 1280;

/** No screen is this wide: in the admin panel the brand is short at every width (the bar's shortBrandMax). */
export const ADMIN_SHORT_BRAND_MAX = 100000;

/**
 * The bar across the top of every page: the anotoki family's one bar
 * (@anotoki/lib/shell's <anotoki-top-bar>), told what is Piano Academy's -
 * its brand, its sections, who is signed in and what they may do, and the
 * two widgets it carries before the language: "Not saved yet" while some
 * progress waits (the family's warning badge), and the piano
 * (ui/midi-panel). The family's bar draws the
 * row in the family's order, folds into one menu button up to PHONE_BAR_MAX
 * ("Piano", brand.short, beside the mark), and has the family's menus, keys,
 * language chooser and theme switch (light / dark / as the device is set).
 *
 * On a phone "Not saved yet" is a dot on the menu button, named for a screen
 * reader (the bar's phoneMark), and both menus open with it and what it means
 * (menuNote). Signing out settles what is waiting first - the family's item
 * says "Saving…" meanwhile - and asks, in the learner's words (signOut.*),
 * when progress would be lost (the family's ConfirmService). Sign in is
 * offered once the app has run (in the middle of practising, or to a
 * visitor); before, the guard is on its way to the IAM, or the screen that
 * says why a sign-in did not work has its own Try again.
 *
 * The admin panel (/admin) has the same bar with its own sections, in English
 * (TranslationService reads every key in English there - effectiveLanguage) -
 * "Feedback" with the number of new messages beside it (the family's
 * FeedbackUnread, asked by the admin layout), folding up to
 * ADMIN_PHONE_BAR_MAX, the family's wordmark short at every width ("Piano"
 * with "admin panel" under it; "anotoki Piano Academy · admin panel" the
 * link's name), no language chooser and no piano, and "Back to Piano
 * Academy" in the person's menu.
 * The way into it is in the person's menu for the staff, while the site is
 * ready. Every word a learner meets here is a key, and in kept-english.ts too
 * (the bar is drawn while the app has no strings) - but the family's own words:
 * the bar's, and the person's role and menu items, worded as every anotoki
 * site words them ("Administrator", "Your anotoki account", "Admin panel"),
 * are the library's keys in the database (anotoki.topbar.*: an owner's
 * rewording reaches them), built into the library for when there is no bundle
 * - never shown as a key.
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
  private readonly unread = inject(FeedbackUnread);
  protected readonly boot = inject(BootService);
  protected readonly store = inject(ProgressStore);
  private readonly site = inject(SiteStatus);
  private readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);

  private readonly bar = viewChild.required(FamilyTopBarComponent);

  /** The address of the page, without its query: which area. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  private readonly here = computed(() => this.path().split(/[?#]/)[0] || '/');

  /** The admin panel: its own sections, English, no chooser, no piano. */
  protected readonly inAdmin = computed(() => this.here() === '/admin' || this.here().startsWith('/admin/'));

  /**
   * Where the bar folds (the admin panel's row is its own), where the name
   * shows beside the initial, and up to where the brand is short (null: up
   * to the fold, the family's default; the admin panel's at every width).
   */
  protected readonly phoneMax = computed(() => (this.inAdmin() ? ADMIN_PHONE_BAR_MAX : PHONE_BAR_MAX));
  protected readonly nameMin = computed(() => this.phoneMax() + (NAME_BAR_MIN - PHONE_BAR_MAX));
  protected readonly shortBrandMax = computed(() => (this.inAdmin() ? ADMIN_SHORT_BRAND_MAX : null));

  protected readonly brand = computed<TopBarBrand>(() =>
    this.inAdmin()
      ? { ...ADMIN_BRAND, short: this.i18n.t('brand.short'), link: '/admin' }
      : { area: this.i18n.t('brand.area'), short: this.i18n.t('brand.short'), link: '/', label: this.i18n.t('topbar.home') },
  );

  /**
   * The sections: the learner's once the app runs (before, there is nothing
   * to practise on); in the admin panel the ones the person's role opens -
   * none for somebody without one, whom the admin layout sends back. While
   * the site is not ready (the family's status page in the view's place)
   * none - but while an update waits an ADMIN there has the Migrations page
   * alone.
   */
  protected readonly links = computed<TopBarLink[]>(() => {
    let links: readonly BarLink[];
    if (this.boot.status() !== 'ready' || this.site.blocked()) {
      links = this.boot.onlyMigrations() && this.inAdmin() ? ADMIN_LINKS.filter((link) => link.path === '/admin/migrations') : [];
    } else if (!this.inAdmin()) {
      links = APP_LINKS;
    } else if (!this.auth.isStaff()) {
      links = [];
    } else {
      links = ADMIN_LINKS.filter((link) => !link.adminOnly || this.auth.isAdmin());
    }
    return links.map((link) => ({
      id: link.path,
      label: link.key ? this.i18n.t(link.key) : (link.english ?? ''),
      path: link.path,
      under: link.under,
      ...(link.path === ADMIN_TOOL_ROUTES.feedback ? { badge: this.unread.count() || null } : {}),
    }));
  });

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

  /** Between the person's name and Sign out: their anotoki account (a new tab), and the admin panel for the staff - or the way back from it. */
  protected readonly menuItems = computed<TopBarMenuItem[]>(() => {
    const items: TopBarMenuItem[] = [];
    const account = this.auth.signedIn() ? this.auth.accountUrl() : null;
    if (account) items.push({ id: 'account', label: this.i18n.t('anotoki.topbar.account'), icon: 'user', href: account, newTab: true });
    if (this.auth.isStaff()) {
      if (this.inAdmin()) {
        items.push({ id: 'back', label: 'Back to Piano Academy', icon: 'arrowLeft', path: '/' });
      } else if (!this.site.blocked()) {
        items.push({ id: 'admin', label: this.i18n.t('anotoki.topbar.admin'), icon: 'shield', path: '/admin' });
      }
    }
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
  private readonly offerSignIn = computed(
    () => !this.auth.signedIn() && (this.store.loaded() || (isLegalPage(this.here()) && this.boot.status() === 'sign-in')),
  );
  protected readonly signIn = computed(() => (this.offerSignIn() ? () => this.boot.signIn() : null));

  /**
   * Signs out everywhere (the IAM ends its session) - after what is waiting is
   * settled (the family's item says "Saving…" meanwhile): a failed save goes
   * once more and what is on its way arrives. If progress or the path still
   * did not get through - or finished rounds the browser could not keep -
   * signing out would lose them, and the learner is asked first, in their
   * language (signOut.*), the safe answer first.
   */
  protected readonly signOut = async (): Promise<void> => {
    try {
      if (await this.boot.settleBeforeSignOut()) {
        // The question stands alone: the menu that asked goes first.
        this.bar().closeMenu(false);
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
  };

  /** "Not saved yet" on a phone: a dot on the menu button, its words for a screen reader. */
  protected readonly phoneMark = computed<TopBarPhoneMark | null>(() => (this.store.unsaved() ? { dot: true, description: this.i18n.t('account.notSaved') } : null));

  /** "Not saved yet", and what it means, heading both menus. */
  protected readonly menuNote = computed<TopBarMenuNote | null>(() =>
    this.store.unsaved() ? { title: this.i18n.t('account.notSaved'), text: this.i18n.t('account.notSavedHint') } : null,
  );
}
