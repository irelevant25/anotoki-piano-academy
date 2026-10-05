import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslationService } from './i18n/translation.service';

/** The app's name: a name, so it is written here and never translated. */
const APP_NAME = 'Piano Academy';

/** What the admin panel's pages say between their own title and the app's name (English, as they are). */
const ADMIN_PANEL = 'Admin panel';

/** A route's title that is a translation key: `title.learn`, `title.signingIn`. */
const TITLE_KEY = /^title\.[A-Za-z0-9]+$/;

/**
 * "Learn · Piano Academy": a page's own title first, where a tab shows the
 * start of it.
 *
 * A route's `title` is a translation key (`title.learn` ... `title.signingIn`)
 * on the pages a learner sees, and plain English on the admin panel's pages
 * ('Translations', 'Migrations'), which are English; either works here -
 * and those say so: "Migrations · Admin panel · Piano Academy". The
 * title follows the language: switching it renames the tab without a
 * navigation. While no bundle is in memory the key is worded from the kept
 * English, as the rest of the shell; with one, a key that has no string shows
 * as itself - the owner wants to see which.
 *
 * It also tells the translation service that a navigation has ended - which is
 * when that one asks again for strings it could not get - because the service
 * cannot ask the Router itself (the Router builds this strategy, and this
 * strategy needs that service).
 */
@Injectable()
export class PianoTitleStrategy extends TitleStrategy {
  private readonly _title = inject(Title);
  private readonly _i18n = inject(TranslationService);

  /** The current route's title as the route wrote it: a key, or English. Undefined: the route has none. */
  private readonly _page = signal<string | undefined>(undefined);
  /** The page is in the admin panel (/admin). */
  private readonly _admin = signal(false);

  constructor() {
    super();
    effect(() => {
      const page = this._page();
      if (page === undefined) {
        this._title.setTitle(APP_NAME);
        return;
      }
      const own = TITLE_KEY.test(page) ? this._i18n.t(page) : page;
      this._title.setTitle(this._admin() ? `${own} · ${ADMIN_PANEL} · ${APP_NAME}` : `${own} · ${APP_NAME}`);
    });
  }

  /** After every navigation. */
  override updateTitle(snapshot: RouterStateSnapshot): void {
    this._i18n.navigated(snapshot.url);
    const path = snapshot.url.split(/[?#]/)[0];
    this._admin.set(path === '/admin' || path.startsWith('/admin/'));
    this._page.set(this.buildTitle(snapshot));
  }
}
