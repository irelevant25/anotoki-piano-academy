import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TopBarComponent as FamilyTopBarComponent, TopBarBrand, TopBarLink, TopBarMenuItem, TopBarMenuNote, TopBarPerson, TopBarPhoneMark } from '@anotoki/lib/shell';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
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

/** The admin panel's sections: Translations for the staff, the rest for an ADMIN. */
export const ADMIN_LINKS: readonly BarLink[] = [
  { english: 'Translations', path: '/admin/translations', under: [] },
  { english: 'Languages', path: '/admin/languages', under: [], adminOnly: true },
  { english: 'People', path: '/admin/people', under: [], adminOnly: true },
  { english: 'Migrations', path: '/admin/migrations', under: [], adminOnly: true },
];

/** The admin panel's wordmark: the family's one form, "anotoki {site} · admin panel" (English, as the panel is). */
export const ADMIN_BRAND = { area: 'Piano Academy', panel: 'admin panel', label: 'anotoki Piano Academy · admin panel' } as const;

/**
 * Up to this width the bar is a phone's: the links and the person's menu fold
 * into one menu button. Piano's own number (the survey's is 760), measured
 * with the real labels in English and Slovak (the browser check's --measure):
 * the widest row - "anotoki Piano Academy", the five sections, "Not saved
 * yet", the piano with a device name at its widest (8rem), the language, the
 * family's theme switch and the person's initial - needs 1293 px in English
 * and 1314 px in Slovak, in Manrope (1221 and 1254 with "No piano"; the
 * admin panel's row 1098) - inside the family's row too, which is never
 * wider than 84rem (1344 px).
 */
export const PHONE_BAR_MAX = 1320;
/** From this width the person's name stands beside the initial (200 px for it, as in the family's bar). */
export const NAME_BAR_MIN = PHONE_BAR_MAX + 201;

/**
 * The bar across the top of every page: the anotoki family's one bar
 * (@anotoki/lib/shell's <anotoki-top-bar>), told what is Piano Academy's -
 * its brand, its sections, who is signed in and what they may do, and the
 * two widgets it carries before the language: "Not saved yet" while some
 * progress waits, and the piano (ui/midi-panel). The family's bar draws the
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
 * visitor); before, the guard is on its way to the IAM, or the sign-in card
 * has its own button.
 *
 * The admin panel (/admin) has the same bar with its own sections, in English
 * (TranslationService reads every key in English there - effectiveLanguage),
 * the family's wordmark "anotoki Piano Academy · admin panel", no language
 * chooser and no piano, and "Back to Piano Academy" in the person's menu.
 * The way into it is in the person's menu for the staff, while the site is
 * ready. Every word a learner meets here is a key, and in kept-english.ts too
 * (the bar is drawn while the app has no strings); the family's own words are
 * the database's where this app has them (core/i18n/kit-words.ts).
 */
@Component({
  selector: 'app-top-bar',
  imports: [FamilyTopBarComponent, MidiPanelComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  protected readonly auth = inject(AuthService);
  protected readonly boot = inject(BootService);
  protected readonly store = inject(ProgressStore);
  private readonly site = inject(SiteStatus);
  private readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);

  private readonly bar = viewChild.required(FamilyTopBarComponent);

  protected readonly phoneMax = PHONE_BAR_MAX;
  protected readonly nameMin = NAME_BAR_MIN;

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
    return links.map((link) => ({ id: link.path, label: link.key ? this.i18n.t(link.key) : (link.english ?? ''), path: link.path, under: link.under }));
  });

  /** Who is signed in: their name as it is (worded only when the token names nobody), the address under it when it is not the name, the role. */
  protected readonly person = computed<TopBarPerson | null>(() => {
    if (!this.auth.signedIn()) return null;
    const name = this.auth.displayName();
    const email = this.auth.user()?.email ?? null;
    return {
      name: name ?? this.i18n.t('account.signedIn'),
      email: email && email !== name ? email : null,
      role: this.auth.isAdmin() ? this.i18n.t('topbar.roleAdmin') : this.auth.isStaff() ? this.i18n.t('topbar.roleEditor') : null,
    };
  });

  /** Between the person's name and Sign out: their anotoki account (a new tab), and the admin panel for the staff - or the way back from it. */
  protected readonly menuItems = computed<TopBarMenuItem[]>(() => {
    const items: TopBarMenuItem[] = [];
    const account = this.auth.signedIn() ? this.auth.accountUrl() : null;
    if (account) items.push({ id: 'account', label: this.i18n.t('topbar.account'), icon: 'user', href: account, newTab: true });
    if (this.auth.isStaff()) {
      if (this.inAdmin()) {
        items.push({ id: 'back', label: 'Back to Piano Academy', icon: 'arrowLeft', path: '/' });
      } else if (!this.site.blocked()) {
        items.push({ id: 'admin', label: this.i18n.t('topbar.admin'), icon: 'shield', path: '/admin' });
      }
    }
    return items;
  });

  /**
   * Sign in: only once the app has run and the sign-in ended (in the middle
   * of practising), or for a visitor. Before, a signed-out visitor is on the
   * way to the IAM, or has the sign-in card with its own button. To the IAM
   * and back to this page, its pages in the learner's language (BootService:
   * a visitor's saves arrive first - the family's item waits for them).
   */
  private readonly offerSignIn = computed(() => !this.auth.signedIn() && this.store.loaded());
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
