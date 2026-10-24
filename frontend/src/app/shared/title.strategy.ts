import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslationService, isAdminArea } from '@anotoki/lib/translations';

/** The app's name: a name, so it is written here and never translated. */
const APP_NAME = 'Piano Academy';

/** What the admin panel's pages say between their own title and the app's name (English, as they are). */
const ADMIN_PANEL = 'Admin panel';

/** A route's title that is a translation key: `title.learn`, `title.signingIn`. */
const TITLE_KEY = /^title\.[A-Za-z0-9]+$/;

/**
 * A route's title that is the library's own heading of a page of its - `anotoki.about.title`,
 * `anotoki.support.title` (anotoki-lib 0.8.0's About and Support): its words come with a bundle alone, never kept here.
 */
const LIBRARY_TITLE_KEY = /^anotoki\.[A-Za-z0-9]+\.title$/;

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
 * as itself - the owner wants to see which. The library's heading of its
 * About or Support page is worded from the bundle too; while none is in
 * memory the tab says the app's name alone - never the key.
 *
 * It also tells the family's translation service where the page is after
 * every navigation (noteAddress()): the admin panel is English, a `?lang=`
 * arriving in the app holds for the tab, and a page behind asks again for the
 * strings it could not get - because the service cannot ask the Router itself
 * (the Router builds this strategy, and this strategy needs that service).
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
      const library = page !== undefined && LIBRARY_TITLE_KEY.test(page);
      if (page === undefined || (library && !this._i18n.ready())) {
        this._title.setTitle(APP_NAME);
        return;
      }
      const own = TITLE_KEY.test(page) || library ? this._i18n.t(page) : page;
      this._title.setTitle(this._admin() ? `${own} · ${ADMIN_PANEL} · ${APP_NAME}` : `${own} · ${APP_NAME}`);
    });
  }

  /** After every navigation. */
  override updateTitle(snapshot: RouterStateSnapshot): void {
    this._i18n.noteAddress(snapshot.url);
    this._admin.set(isAdminArea(snapshot.url));
    this._page.set(this.buildTitle(snapshot));
  }
}
