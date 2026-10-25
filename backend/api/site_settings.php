<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Robots\Robots;
use Anotoki\Lib\SiteSettings\SiteSettings;

/**
 * The site settings - the switches Piano Academy's administrators throw
 * without a deploy (anotoki-lib 0.11.0's Anotoki\Lib\SiteSettings: genshin's,
 * for every anotoki site; the owner's request of 2026-10-25) - and robots.txt
 * and sitemap.xml (the library's Anotoki\Lib\Robots). This file says what is
 * Piano Academy's own of them. All three parts:
 *
 *   Getting in      maintenance mode: while it is on, the site's gate
 *                   (api/index.php) answers everybody but the site's ADMIN - judged
 *                   by the token alone, the gate runs before identify() - 503
 *                   {code: "maintenance", message, maintenance_message} with
 *                   Retry-After: 300, but on siteOpenPaths() and the reserved API
 *                   paths below; GET /api/site-status says "maintenance", and the
 *                   pages draw the family's closed sign (Sign in at /staff alone)
 *   Announcement    a bar above every page of the learner's site, information, a
 *                   warning or something wrong, its words per language
 *   Page access     a row per page path of the learner's site - who sees it, or
 *                   switched off for all but the administrators - and the API
 *                   paths refused with it (the library's PageAccessGate, inside
 *                   identify(): 423 page_locked); the pages' half is the family's
 *                   pageAccessGuard on the learner's routes
 *
 * The routes are the library's: GET /api/site-settings (public, before anybody
 * signs in: routes/public.php) and /api/admin/site-settings... (the ADMIN alone,
 * every change audited: routes/admin.php). The tables are the library's
 * anotoki_admin/003 (anotoki_site_settings, anotoki_page_access): while it
 * waits every switch is at its default, no page is governed, and the admin
 * routes answer 503 feature_unavailable.
 *
 * What never loosens (tests/api/site-settings.test.php holds each):
 *
 * - The site's ADMIN is never refused anything - the library's rule, and its
 *   SiteGate refuses to be built without the ADMIN check while the site offers
 *   Getting in.
 * - The reserved API paths keep answering - while the site is closed too - and
 *   no row may claim one, either way round (siteReservedApiPaths()): who the
 *   reader is and how they sign in, the health check, and the progress store
 *   whole, so the start of every page and a learner's saves work for whoever
 *   may use a page - a row that took /api/progress with one page would take it
 *   from every other page too. The cost, said plainly: a learner who was
 *   practising when the site closed keeps saving their own progress until the
 *   page is loaded again (the closed sign then); nobody new gets in.
 * - The reserved pages are nobody's to govern: the library's (the sign-in's way
 *   back, /staff, /admin, the legal pages, About, Support) and this app's own
 *   sign-in failure screen (SITE_RESERVED_PAGES).
 */

/**
 * The API paths that keep answering whatever the site settings say - each
 * itself and everything under it - beside the library's own (the site status,
 * the translations' bundles, the settings' two):
 *
 *   /api/auth/config   how the browser signs in (the library's AuthRoutes::openPath())
 *   /api/health        the health check (anotoki-deploy's smoke test after a release)
 *   /api/me            who the reader is - here the own progress file, /api/me/export and /api/me/import
 *   /api/state         the progress store: what every page's start loads,
 *   /api/progress      and the three saves (api/routes/progress.php) -
 *   /api/path          shared by every page, so no page's row may take them
 *   /api/sessions
 *   /api/visitor       the move at sign-in (POST /api/visitor/move), part of a signed-in start
 *
 * @return list<string>
 */
function siteReservedApiPaths(): array
{
    return [AuthRoutes::openPath(), '/api/health', '/api/me', '/api/state', '/api/progress', '/api/path', '/api/sessions', '/api/visitor'];
}

/** The pages no row may govern beside the library's: the family's screen of a sign-in that did not work, at this app's address (shared/auth/site-auth.ts). */
const SITE_RESERVED_PAGES = ['/sign-in-failed'];

/** Piano Academy's site settings: all three parts, the reserved paths above. */
function siteSettings(): SiteSettings
{
    static $settings = null;

    return $settings ??= new SiteSettings(pdo: static fn(): PDO => db(), parts: SiteSettings::PARTS, reservedApiPaths: siteReservedApiPaths(), reservedPages: SITE_RESERVED_PAGES);
}

/** The pages anybody may read, signed in or not, whatever the IAM says: the legal pages, About and Support. */
const SITE_OPEN_PAGES = ['/terms', '/privacy', '/contact', '/about', '/support'];

/** The learner's pages a visitor opens while the IAM lets people practise without signing in (Stats is a person's own, never listed). */
const SITE_LEARNER_PAGES = ['/', '/trainer', '/sheet', '/songs'];

/**
 * What robots keep out of beside the library's /admin, /api and /auth: a
 * learner's own numbers (Stats), the screen of a sign-in that did not work, and
 * the administrators' way in while the site is closed - nothing on them for a
 * search engine.
 */
const SITE_ROBOTS_DISALLOW = ['/stats', '/sign-in-failed', '/staff'];

/**
 * robots.txt and sitemap.xml (the library's Robots; RobotsRoutes in
 * routes/public.php): the site's own public address (siteAddress():
 * config/site.local.php's, else a release's https://piano.anotoki.eu or a
 * checkout's http://localhost:4500 - never the request's Host), the pages above, without
 * what Page access hides (a page for people signed in, for editors, for
 * administrators, or switched off) - kept an hour in storage/cache, made again
 * at once when what Page access hides or the address changes. The learner's
 * pages are listed only while the IAM lets visitors in (signInRule(): kept a
 * minute; required whenever nothing better is known): while it requires a
 * sign-in they would send a robot to the IAM's sign-in page. That switch is
 * not in the kept sitemap's key: a sitemap follows it within the hour.
 */
function siteRobots(): Robots
{
    static $robots = null;

    return $robots ??= new Robots(
        address: static fn(): string => siteAddress(),
        disallow: SITE_ROBOTS_DISALLOW,
        pages: SITE_OPEN_PAGES,
        entries: static fn(): array => authLoginRequired() ? [] : SITE_LEARNER_PAGES,
        settings: siteSettings(),
        cacheFile: storageDir() . '/cache/anotoki-sitemap.json',
    );
}
