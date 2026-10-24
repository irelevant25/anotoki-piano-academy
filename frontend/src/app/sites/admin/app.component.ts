import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AdminFrameBrand, AdminFrameComponent, AdminFrameLink, AdminFramePerson, SideNavGroup } from '@anotoki/lib/admin/frame';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { SiteFooterComponent } from '@anotoki/lib/footer';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ThemeToggleComponent } from '@anotoki/lib/shell';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { AnotokiIcons } from '@anotoki/lib/ui/icon';
import { iconDatabase, iconGlobe, iconHistory, iconLanguages, iconMessage, iconSave, iconUsers } from '@anotoki/lib/ui/icons';
import { SignOutService } from '../../shared/auth/sign-out.service';
import { ChangelogService } from '../../shared/changelog/changelog.service';
import { TRANSLATIONS_ROUTES } from '../../shared/i18n/site-translations';
import { ADMIN_TOOL_ROUTES } from '../../shared/site-admin';
import { BootService } from '../../shared/state/boot.service';
import { MIGRATIONS_ROUTE } from '../../shared/state/site-migrations';
import { ChangelogDialogComponent } from '../../shared/ui/changelog-dialog/changelog-dialog.component';

/** A page of the admin panel in the frame's column: its words (English, as the panel is), where it goes, its icon, and whether it is the ADMIN's alone. */
export interface AdminPage {
  label: string;
  path: string;
  icon: string;
  /** Only an ADMIN has it; the rest is the staff's (EDITOR or ADMIN). */
  adminOnly: boolean;
}

/**
 * The admin panel's pages under their headings, in the order the top bar had them before the frame: the app's words
 * (Translations for the staff, Languages for an ADMIN), then what keeps the site running - the people, the family's
 * admin tools (shared/site-admin.ts) and the database's migrations, all an ADMIN's.
 */
export const ADMIN_GROUPS: readonly { label: string; pages: readonly AdminPage[] }[] = [
  {
    label: 'Localization',
    pages: [
      { label: 'Translations', path: TRANSLATIONS_ROUTES.translations, icon: 'languages', adminOnly: false },
      { label: 'Languages', path: TRANSLATIONS_ROUTES.languages, icon: 'globe', adminOnly: true },
    ],
  },
  {
    label: 'System',
    pages: [
      { label: 'People', path: ADMIN_TOOL_ROUTES.people, icon: 'users', adminOnly: true },
      { label: 'Feedback', path: ADMIN_TOOL_ROUTES.feedback, icon: 'message', adminOnly: true },
      { label: 'Error log', path: ADMIN_TOOL_ROUTES.errors, icon: 'alert', adminOnly: true },
      { label: 'Audit log', path: ADMIN_TOOL_ROUTES.audit, icon: 'history', adminOnly: true },
      { label: 'Backups', path: ADMIN_TOOL_ROUTES.backups, icon: 'save', adminOnly: true },
      { label: 'Migrations', path: MIGRATIONS_ROUTE, icon: 'database', adminOnly: true },
    ],
  },
];

/** The admin panel's name at the top of the frame's column (the family's form, "anotoki {site} · admin panel"), linking to its home. */
export const ADMIN_BRAND: AdminFrameBrand = { name: 'anotoki Piano Academy · admin panel', path: '/admin' };

/** The way out of the panel: the learner's site. */
export const ADMIN_BACK: AdminFrameLink = { label: 'Back to Piano Academy', path: '/' };

/**
 * The icons of the panel's pages that the kit does not draw itself (it has `alert`): the family's
 * (@anotoki/lib/ui/icons), registered as the panel opens - its lazy chunk carries them, never the first load.
 */
const ADMIN_ICONS = { languages: iconLanguages, globe: iconGlobe, users: iconUsers, message: iconMessage, history: iconHistory, save: iconSave, database: iconDatabase };

/**
 * The admin panel (/admin), English like every page in it: the anotoki family's admin frame
 * (@anotoki/lib/admin/frame's <anotoki-admin-frame>, anotoki-lib 0.10.0 - genshin's, the owner's request of
 * 2026-10-24: never the learner's top bar, so the panel is never mistaken for the site). On a computer a column on the
 * left - the panel's name, who is signed in, "Back to Piano Academy", Sign out (the one sign-out the bar runs too:
 * SignOutService), the family's theme switch (the account's theme, as everywhere) and the panel's pages under their
 * headings (ADMIN_GROUPS) - and on the right the page, with the family's footer under it ("vX · What's new ·
 * Feedback", About · Support · Terms · Privacy · Contact - in English, as the panel is; What's new opens this app's own
 * dialog). On a phone (up to the frame's 860 px) a row with the name and Menu, which opens all of it in a drawer. The
 * shell draws nothing of its own round it (app.component: no bar, no notes, no footer of its - the frame has its own
 * <main>).
 *
 * The pages are the ones the person's role opens: Translations for the staff (EDITOR or ADMIN); Languages, People, the
 * admin tools and Migrations for ADMIN alone. While an update waits (the family's status page stands in every other
 * page's place) an ADMIN has the Migrations page alone. An ADMIN's "Feedback" says how many messages are new: asked
 * once as the panel opens (the family's FeedbackUnread; the Feedback page keeps it in step). The column only hides what
 * the server refuses anyway: an EDITOR who opens an ADMIN page by its address is sent to the start page (the family's
 * adminGuard), and the API answers 403 forbidden.
 *
 * Anybody else sees why there is nothing here, on a page of its own - no column, no menu (as genshin's page that says
 * the panel is not theirs):
 *
 * - nobody signed in, with a Sign in button of its own. Nobody arrives here
 *   signed out (the family's staffGuard sends them to the IAM first, or to
 *   the screen that says why a sign-in did not work), so this is a session
 *   that ended with an admin page open ("You are signed out"; what was typed
 *   on the Translations and Languages pages is kept for the tab) - or one
 *   whose new sign-in did not work ("You are not signed in");
 * - somebody signed in with no role here: whose the area is, and the way
 *   back. The API refuses them all the same.
 *
 * In those two the route under the panel is still the active one, with no page drawn: a guard on it is asked with no
 * page (unsavedChangesGuard).
 */
@Component({
  selector: 'app-admin-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, AdminFrameComponent, ThemeToggleComponent, SiteFooterComponent, ChangelogDialogComponent, ButtonComponent, CardComponent],
})
export class AppComponent {
  protected readonly auth = inject(AnotokiAuth);
  protected readonly changelog = inject(ChangelogService);
  private readonly boot = inject(BootService);
  private readonly site = inject(SiteStatus);
  private readonly unread = inject(FeedbackUnread);
  private readonly signOuts = inject(SignOutService);

  protected readonly brand = ADMIN_BRAND;
  protected readonly back = ADMIN_BACK;

  /** Who is signed in: the name (or the address alone, the family's displayName), the address under it. */
  protected readonly person = computed<AdminFramePerson | null>(() => (this.auth.signedIn() ? { name: this.auth.displayName() || null, email: this.auth.user()?.email ?? null } : null));

  /**
   * The pages the person's role opens, under their headings - a heading with none of them is left out. While the site
   * is not ready (an update waits) the Migrations page alone, for the ADMIN who applies it.
   */
  protected readonly groups = computed<SideNavGroup[]>(() => {
    const waiting = this.boot.status() !== 'ready' || this.site.blocked();
    const shown = (page: AdminPage): boolean => (waiting ? this.boot.onlyMigrations() && page.path === MIGRATIONS_ROUTE : !page.adminOnly || this.auth.isAdmin());
    return ADMIN_GROUPS.map((group) => ({
      id: group.label,
      label: group.label,
      links: group.pages.filter(shown).map((page) => ({
        id: page.path,
        label: page.label,
        path: page.path,
        icon: page.icon,
        // Nothing new (or not known yet): no number.
        ...(page.path === ADMIN_TOOL_ROUTES.feedback ? { badge: this.unread.count() || null } : {}),
      })),
    })).filter((group) => group.links.length > 0);
  });

  /** Sign out: the one way (SignOutService) - settled first, asked when progress would be lost; "Saving…" meanwhile. */
  protected readonly signOut = (): Promise<void> => this.signOuts.signOut();

  /** What's new is open (its code is loaded the first time) - from the footer's What's new, there only once the list came. */
  protected readonly whatsNewOpen = signal(false);

  constructor() {
    inject(AnotokiIcons).register(ADMIN_ICONS);
    // How many feedback messages are new, for the column's "Feedback" - asked for an ADMIN (the family's count asks
    // nothing for anybody else), again when an ADMIN signs in here.
    effect(() => {
      if (this.auth.isAdmin()) void this.unread.refresh();
    });
  }

  /** To the IAM and back to this page - its pages in the language the person reads the app in, not the admin panel's English. */
  protected signIn(): void {
    void this.boot.signIn();
  }
}
