<?php

// The site settings (anotoki-lib 0.11.0, as api/site_settings.php wires them)
// and robots.txt and sitemap.xml, through the real server:
//
// - what every page is told (GET /api/site-settings): before anybody signs in -
//   a token that does not check out is never read -, all three parts, never a
//   page's API paths;
// - Getting in: closed for maintenance, everybody but the site's ADMIN is told
//   503 maintenance (the administrators' words, Retry-After: 300) on every
//   path but the open and the reserved ones; the status says "maintenance";
//   the reserved paths keep answering - a learner's saves too; the ADMIN - by
//   the token alone: a forged, an expired or another application's token is
//   nobody - uses the site as it is and opens it again (no lockout); and the
//   site's gate cannot be built without that check;
// - Page access: an API path a page's row refuses with it is 423 page_locked to
//   everybody that page is not shown to, however the path is spelled - never
//   the ADMIN; where two rows claim one path, the more open wins;
// - nothing claimable: no row may claim a reserved API path - the sign-in's
//   configuration, who the reader is, the health check, the progress store,
//   the move at sign-in, the library's own - either way round, nor a reserved
//   page; one put in by hand is passed over;
// - every change audited, and a person's data deleted leaves the settings
//   they changed by nobody;
// - robots.txt and sitemap.xml: by the configured public address alone (never
//   the request's Host), the public pages - the learner's only while the IAM
//   lets visitors in -, without what Page access hides; no address, no
//   sitemap. (Who may reach the admin routes - nobody 401, a learner and an
//   editor 403 - is tests/api/admin.test.php's.)

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Migrations\Http\SiteGate;
use Slim\Psr7\Factory\ResponseFactory;

const ADMIN = 1;
const EDITOR = 2;
const LEARNER = 3;
const OTHER_ADMIN = 4;

const SITE_URL = 'https://piano.example.test';

$GLOBALS['auth'] = null;
$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['auth'] = test_auth_iam();
    $GLOBALS['app'] = start_app($GLOBALS['auth']);
});

/** A token as the IAM signs it for these people ($extra: claims to change; $sign: test_token()'s). */
function token_for(int $user, array $extra = [], array $sign = []): string
{
    return test_token(
        $user,
        match ($user) {
            ADMIN, OTHER_ADMIN => [ROLE_ADMIN],
            EDITOR => [ROLE_EDITOR],
            default => [],
        },
        $extra,
        $sign,
    );
}

function ask(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

function as_user(int $user, string $method, string $url, mixed $body = null): array
{
    return ask($method, $url, $body, bearer(token_for($user)));
}

/** The administrator saves switches; the page's whole as the server answers it. */
function save_settings(array $settings): array
{
    $answer = as_user(ADMIN, 'PUT', '/api/admin/site-settings', ['settings' => $settings]);
    assert_same(200, $answer['status'], test_show($answer['body']));

    return $answer['body'];
}

/** The administrator governs a page. */
function add_page(array $row): array
{
    return as_user(ADMIN, 'POST', '/api/admin/site-settings/pages', $row);
}

/** Every switch at its default and no page governed, as before this file's tests - straight in the database. */
function settings_cleared(): void
{
    dbExec('DELETE FROM anotoki_site_settings');
    dbExec('DELETE FROM anotoki_page_access');
}

/** The audit log's entries of $action, oldest first: [actor, target type, target id, details]. */
function audited(string $action): array
{
    return array_map(
        static fn(array $row): array => [$row['actor_id'] === null ? null : (int) $row['actor_id'], $row['target_type'], $row['target_id'], json_decode((string) $row['details'], true)],
        dbAll('SELECT actor_id, target_type, target_id, details::text AS details FROM anotoki_audit_log WHERE action = ? ORDER BY id', [$action]),
    );
}

/** The server's config/site.local.php: its values, or a text as it is, or (null) no file. */
function site_file(array|string|null $contents): void
{
    $file = $GLOBALS['app']['config'] . '/site.local.php';
    if ($contents === null) {
        @unlink($file);

        return;
    }
    file_put_contents($file, is_string($contents) ? $contents : '<?php return ' . var_export($contents, true) . ";\n");
}

/** The sitemap's addresses, in its order. */
function sitemap_locations(string $xml): array
{
    preg_match_all('~<loc>([^<]*)</loc>~', $xml, $m);

    return array_map(static fn(string $loc): string => html_entity_decode($loc, ENT_XML1 | ENT_QUOTES, 'UTF-8'), $m[1]);
}

/** The kept sitemap goes: the next one is made afresh (it is kept an hour, and the IAM's switch is not in its key). */
function sitemap_forgotten(): void
{
    @unlink($GLOBALS['app']['config'] . '/storage/cache/anotoki-sitemap.json');
}

test(
    'what every page is told (GET /api/site-settings): before anybody signs in - a token that does not check out is not read -, all three parts at their defaults, never a page\'s API paths',
    function (): void {
        settings_cleared();
        $default = ['maintenance' => false, 'announcement' => null, 'pages' => []];
        $nobody = ask('GET', '/api/site-settings');
        assert_same([200, $default], [$nobody['status'], $nobody['body']]);
        $badToken = ask('GET', '/api/site-settings', null, bearer('not-a-token'));
        assert_same([200, $default], [$badToken['status'], $badToken['body']], 'a token that does not check out is never read here');

        $whole = save_settings(['announcement_enabled' => true, 'announcement_level' => 'warning', 'announcement_message' => ['en' => 'New songs on Friday.', 'sk' => 'V piatok nové skladby.']]);
        assert_same(['getting_in', 'announcement', 'page_access'], $whole['parts'], 'all three parts');
        assert_same(
            [
                '/api/site-status',
                '/api/translations',
                '/api/site-settings',
                '/api/admin/site-settings',
                '/api/auth/config',
                '/api/health',
                '/api/me',
                '/api/state',
                '/api/progress',
                '/api/path',
                '/api/sessions',
                '/api/visitor',
            ],
            $whole['reserved']['api_paths'],
        );
        assert_same(['/auth', '/staff', '/admin', '/terms', '/privacy', '/contact', '/about', '/support', '/sign-in-failed'], $whole['reserved']['pages']);
        $row = add_page(['path' => '/songs', 'visibility' => 'USER', 'blocked' => false, 'api_paths' => ['/api/feedback']]);
        assert_same(201, $row['status'], test_show($row['body']));
        assert_same(
            [
                'maintenance' => false,
                'announcement' => ['level' => 'warning', 'message' => ['en' => 'New songs on Friday.', 'sk' => 'V piatok nové skladby.']],
                'pages' => [['path' => '/songs', 'visibility' => 'USER', 'blocked' => false]],
            ],
            ask('GET', '/api/site-settings')['body'],
            'the announcement, and the page - never its API paths',
        );

        // Every change audited, by the administrator.
        assert_same([[ADMIN, 'site_settings', null]], array_map(static fn(array $entry): array => array_slice($entry, 0, 3), audited('site_settings.changed')));
        assert_json_same(['old' => false, 'new' => true], audited('site_settings.changed')[0][3]['announcement_enabled'], 'each switch before and after');
        assert_json_same(
            [[ADMIN, 'page_access', (string) $row['body']['pages'][0]['id'], ['path' => '/songs', 'visibility' => 'USER', 'blocked' => false, 'api_paths' => ['/api/feedback']]]],
            audited('page_access.added'),
        );
        settings_cleared();
    },
);

test(
    'Getting in: closed for maintenance, everybody but the site\'s ADMIN is told 503 maintenance with the administrators\' words - the status says so, the reserved paths keep answering, a learner\'s saves too',
    function (): void {
        settings_cleared();
        save_settings(['maintenance_mode' => true, 'maintenance_message' => ['en' => "Back at noon.\nThank you!", 'sk' => 'Späť o 12:00.']]);
        $message = ['en' => "Back at noon.\nThank you!", 'sk' => 'Späť o 12:00.'];

        assert_same(['state' => 'maintenance', 'installed' => false, 'maintenance_message' => $message], ask('GET', '/api/site-status')['body'], 'the status says it, with their words');

        // Everybody else, on a path that is neither open nor reserved: closed.
        $closed = [
            ['nobody', 'POST', '/api/feedback', ['kind' => 'idea', 'message' => 'Hello there, a long enough message.'], []],
            ['nobody', 'POST', '/api/client-errors', ['message' => 'boom'], []],
            ['a learner', 'POST', '/api/feedback', ['kind' => 'idea', 'message' => 'Hello there, a long enough message.'], bearer(token_for(LEARNER))],
            ['an editor', 'GET', '/api/admin/translations', null, bearer(token_for(EDITOR))],
            ['an editor', 'GET', '/robots.txt', null, bearer(token_for(EDITOR))],
        ];
        foreach ($closed as [$who, $method, $url, $body, $headers]) {
            $answer = ask($method, $url, $body, $headers);
            assert_same(
                [503, 'maintenance', 'The site is closed for maintenance. Try again later.', $message, '300'],
                [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['message'] ?? null, $answer['body']['maintenance_message'] ?? null, $answer['headers']['retry-after'] ?? null],
                "$who: $method $url",
            );
        }

        // A token that is not the site's ADMIN's is nobody here - another IAM's, an expired one, another application's,
        // an administrator of no role here: closed.
        $forged = [
            'another IAM\'s key' => token_for(ADMIN, [], ['iam' => test_other_iam('piano-test-key')]),
            'expired' => token_for(ADMIN, ['exp' => time() - 600, 'iat' => time() - 1200]),
            'another application\'s' => token_for(ADMIN, ['aud' => 'survey']),
            'no ADMIN role' => test_token(ADMIN, ['MEMBER', ROLE_EDITOR]),
        ];
        foreach ($forged as $what => $token) {
            $answer = ask('GET', '/api/admin/people', null, bearer($token));
            assert_same([503, 'maintenance'], [$answer['status'], $answer['body']['code'] ?? null], "a token $what is nobody: closed");
        }

        // The reserved paths keep answering, whoever asks: the sign-in's configuration, the words, the settings, the
        // health check - and the progress store whole, so a learner who was practising keeps their progress.
        assert_same(200, ask('GET', '/api/auth/config')['status']);
        assert_same(200, ask('GET', '/api/translations/en')['status']);
        assert_same(true, ask('GET', '/api/site-settings')['body']['maintenance'], 'the settings say it too (the administrators\' notice)');
        assert_same(200, ask('GET', '/api/health')['status']);
        $state = as_user(LEARNER, 'GET', '/api/state');
        assert_same(200, $state['status'], test_show($state['body']));
        $note = [
            'midi' => 60,
            'status' => 'learning',
            'repetitions' => 1,
            'easeFactor' => 2.5,
            'intervalHours' => 4,
            'dueAt' => '2026-10-25T12:00:00.000Z',
            'lastGrade' => 4,
            'totalAttempts' => 3,
            'correctAttempts' => 2,
            'avgTimingErrorMs' => null,
            'lastGrowthAt' => '2026-10-25T08:00:00.000Z',
            'updatedAt' => '2026-10-25T08:00:00.000Z',
        ];
        $saved = ask('PUT', '/api/progress', ['60' => $note], [...bearer(token_for(LEARNER)), 'Progress-Generation: ' . $state['body']['generation']]);
        assert_same(204, $saved['status'], 'a learner\'s save gets through: ' . test_show($saved['body']));
        $move = as_user(LEARNER, 'POST', '/api/visitor/move');
        assert_same([422, 'invalid'], [$move['status'], $move['body']['code'] ?? null], 'the move at sign-in reaches its route (no key: 422)');

        // The site's ADMIN uses the site as it is - their progress, the admin panel, the feedback form - and opens it again.
        assert_same(200, as_user(ADMIN, 'GET', '/api/admin/people')['status']);
        assert_same(200, as_user(ADMIN, 'GET', '/api/admin/translations')['status']);
        assert_same(200, as_user(ADMIN, 'GET', '/api/state')['status']);
        assert_same(201, as_user(ADMIN, 'POST', '/api/feedback', ['kind' => 'idea', 'message' => 'Hello there, a long enough message.'])['status']);
        save_settings(['maintenance_mode' => false]);
        assert_same(['state' => 'ready', 'installed' => false], ask('GET', '/api/site-status')['body']);
        assert_same(201, ask('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'Hello there, a long enough message.'])['status'], 'open again: nobody gets through');
        assert_json_same(
            [['old' => false, 'new' => true], ['old' => true, 'new' => false]],
            array_values(array_filter(array_map(static fn(array $entry): ?array => $entry[3]['maintenance_mode'] ?? null, audited('site_settings.changed')))),
            'closed and opened, each audited',
        );
        settings_cleared();
    },
);

test('Getting in: the site\'s gate is never built without the ADMIN check - whoever closed the site could never open it again', function (): void {
    assert_true(siteState()->offersMaintenance(), 'the site offers Getting in');
    assert_throws(static fn() => new SiteGate(siteState(), new ResponseFactory(), []), '/give its SiteGate the ADMIN check/');
});

test(
    'Page access: an API path a page\'s row refuses with it is 423 page_locked to everybody that page is not shown to, however the path is spelled - never the ADMIN; the more open of two rows wins',
    function (): void {
        settings_cleared();
        $feedback = ['kind' => 'idea', 'message' => 'Hello there, a long enough message.'];
        $songs = add_page(['path' => '/songs', 'visibility' => 'ADMIN', 'blocked' => false, 'api_paths' => ['/api/feedback']]);
        assert_same(201, $songs['status'], test_show($songs['body']));

        foreach (['nobody' => [], 'a learner' => bearer(token_for(LEARNER)), 'an editor' => bearer(token_for(EDITOR))] as $who => $headers) {
            $answer = ask('POST', '/api/feedback', $feedback, $headers);
            assert_same(
                [423, 'page_locked', 'That part of the site is not available.'],
                [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['error'] ?? null],
                "$who: refused, in the app's error shape",
            );
        }
        foreach (['/%61pi/feedback', '/api/feedback/', '/api/feedback?x=1'] as $spelled) {
            assert_same(423, ask('POST', $spelled, $feedback)['status'], "$spelled is the same path");
        }
        assert_same(201, as_user(ADMIN, 'POST', '/api/feedback', $feedback)['status'], 'the ADMIN is never refused');

        // Shown to people signed in: a learner gets through, nobody does not.
        $id = $songs['body']['pages'][0]['id'];
        $changed = as_user(ADMIN, 'PUT', '/api/admin/site-settings/pages', ['pages' => [['id' => $id, 'visibility' => 'USER']]]);
        assert_same(200, $changed['status'], test_show($changed['body']));
        assert_same(201, as_user(LEARNER, 'POST', '/api/feedback', $feedback)['status']);
        assert_same(423, ask('POST', '/api/feedback', $feedback)['status']);

        // Switched off: nobody but the ADMIN, whatever its visibility.
        as_user(ADMIN, 'PUT', '/api/admin/site-settings/pages', ['pages' => [['id' => $id, 'visibility' => 'PUBLIC', 'blocked' => true]]]);
        assert_same(423, as_user(LEARNER, 'POST', '/api/feedback', $feedback)['status']);
        assert_same(201, as_user(ADMIN, 'POST', '/api/feedback', $feedback)['status']);

        // Another page that claims the same path and is anybody's: the more open wins.
        assert_same(201, add_page(['path' => '/trainer', 'visibility' => 'PUBLIC', 'api_paths' => ['/api/feedback']])['status']);
        assert_same(201, ask('POST', '/api/feedback', $feedback)['status'], 'the more open row wins');

        // A page row with no API paths takes nothing away from the server: the page alone, its data still answers.
        settings_cleared();
        assert_same(201, add_page(['path' => '/stats', 'visibility' => 'ADMIN'])['status']);
        $state = as_user(LEARNER, 'GET', '/api/state');
        assert_same(200, $state['status'], 'Stats closed to a learner: their progress still answers every other page');
        assert_same(
            [['page_access.added', 3], ['page_access.changed', 2]],
            [['page_access.added', count(audited('page_access.added')) - 1], ['page_access.changed', count(audited('page_access.changed'))]],
            'every row added and changed, audited (the first file\'s row before)',
        );
        settings_cleared();
    },
);

test(
    'nothing claimable: no row may claim a reserved API path - the sign-in\'s configuration, who the reader is, the health check, the progress store, the move at sign-in, the library\'s own - either way round, nor a reserved page; one put in by hand is passed over',
    function (): void {
        settings_cleared();
        $reserved = [
            '/api/auth/config',
            '/api/auth',
            '/api/health',
            '/api/me',
            '/api/me/export',
            '/api/me/import',
            '/api/state',
            '/api/progress',
            '/api/path',
            '/api/sessions',
            '/api/visitor',
            '/api/visitor/move',
            '/api/site-status',
            '/api/translations',
            '/api/translations/sk',
            '/api/site-settings',
            '/api/admin/site-settings',
            '/api/admin/site-settings/pages',
            // covering one: every request the reserved path answers begins with it
            '/api/s',
            '/api/p',
            '/api/v',
            '/api/m',
        ];
        foreach ($reserved as $path) {
            $answer = add_page(['path' => '/trainer', 'visibility' => 'ADMIN', 'api_paths' => [$path]]);
            assert_same([422, 'invalid_api_path'], [$answer['status'], $answer['body']['code'] ?? null], "a row claiming $path: " . test_show($answer['body']));
        }
        assert_same(422, add_page(['path' => '/trainer', 'api_paths' => ['/api']])['status'], '/api covers every one');

        foreach (['/auth/callback', '/sign-in-failed', '/staff', '/admin', '/admin/people', '/terms', '/privacy', '/contact', '/about', '/support', '/:page', '/sign-in-failed/:why'] as $page) {
            $answer = add_page(['path' => $page, 'visibility' => 'ADMIN']);
            assert_same([422, 'invalid_page'], [$answer['status'], $answer['body']['code'] ?? null], "a row for $page: " . test_show($answer['body']));
        }
        assert_same(0, (int) dbValue('SELECT count(*) FROM anotoki_page_access'), 'none of them saved');

        // Put in by hand: passed over - the progress keeps answering, and the pages are never told of it.
        dbExec("INSERT INTO anotoki_page_access (path, visibility, blocked, api_paths) VALUES ('/trainer', 'ADMIN', true, '{/api/state,/api/progress}'), ('/sign-in-failed', 'ADMIN', true, '{}')");
        assert_same(200, as_user(LEARNER, 'GET', '/api/state')['status'], 'a row by hand claiming the progress store is passed over');
        assert_same(
            [['path' => '/trainer', 'visibility' => 'ADMIN', 'blocked' => true]],
            ask('GET', '/api/site-settings')['body']['pages'],
            'the reserved page\'s row by hand is no page anybody is told of',
        );
        settings_cleared();
    },
);

test('a person\'s data deleted on the People page leaves the site settings they changed by nobody, as the words they saved', function (): void {
    settings_cleared();
    // The administrator's users row (a route of the People page records them), then a switch and a page of theirs.
    assert_same(200, as_user(ADMIN, 'GET', '/api/admin/people')['status']);
    save_settings(['announcement_enabled' => true, 'announcement_message' => ['en' => 'Hello.']]);
    assert_same(201, add_page(['path' => '/sheet', 'visibility' => 'USER'])['status']);
    assert_same([ADMIN, ADMIN], [(int) dbValue("SELECT updated_by FROM anotoki_site_settings WHERE name = 'announcement_enabled'"), (int) dbValue('SELECT updated_by FROM anotoki_page_access')]);
    $whole = as_user(OTHER_ADMIN, 'GET', '/api/admin/site-settings')['body'];
    assert_true(is_string($whole['settings']['announcement_enabled']['updated_by_name']), 'named by the name this app keeps of them');

    $deleted = as_user(OTHER_ADMIN, 'DELETE', '/api/admin/people/' . ADMIN);
    assert_same(200, $deleted['status'], test_show($deleted['body']));
    assert_same([null, null], [dbValue("SELECT updated_by FROM anotoki_site_settings WHERE name = 'announcement_enabled'"), dbValue('SELECT updated_by FROM anotoki_page_access')]);
    assert_same(['Hello.'], array_values(ask('GET', '/api/site-settings')['body']['announcement']['message']), 'the settings stay as they were');
    settings_cleared();
});

test(
    'robots.txt and sitemap.xml: by the configured public address alone - never the request\'s Host -, the public pages, the learner\'s only while the IAM lets visitors in, never one Page access hides; no address, no sitemap',
    function (): void {
        settings_cleared();
        site_file(null);
        sitemap_forgotten();
        $disallowed = "User-agent: *\nDisallow: /admin\nDisallow: /api\nDisallow: /auth\nDisallow: /stats\nDisallow: /sign-in-failed\nDisallow: /staff\n";

        // No address: robots.txt names no sitemap, and there is none.
        $robots = ask('GET', '/robots.txt', null, ['Host: evil.example']);
        assert_same([200, 'text/plain; charset=utf-8', 'public, max-age=3600'], [$robots['status'], $robots['headers']['content-type'] ?? null, $robots['headers']['cache-control'] ?? null]);
        assert_same("# The robots of every search engine: what to leave alone, and where the site's pages are listed.\n" . $disallowed, $robots['raw'], 'no Sitemap line - never the request\'s Host');
        $none = ask('GET', '/sitemap.xml');
        assert_same([404, 'not_configured'], [$none['status'], $none['body']['code'] ?? null]);

        // A file that cannot be read cleanly is no address either (a byte-order mark before <?php: never compiled).
        site_file("\xEF\xBB\xBF<?php return ['public_url' => '" . SITE_URL . "'];\n");
        assert_same(404, ask('GET', '/sitemap.xml')['status']);
        site_file(['public_url' => SITE_URL]);

        // Sign-in required (the IAM's switch, as the tests start): the pages anybody reads alone.
        $robots = ask('GET', '/robots.txt', null, ['Host: evil.example', ...bearer('not-a-token')]);
        assert_same(200, $robots['status'], 'a token that does not check out is never read here');
        assert_true(str_ends_with($robots['raw'], $disallowed . "\nSitemap: " . SITE_URL . "/sitemap.xml\n"), $robots['raw']);
        $sitemap = ask('GET', '/sitemap.xml', null, ['Host: evil.example']);
        assert_same([200, 'application/xml; charset=utf-8', 'public, max-age=3600'], [$sitemap['status'], $sitemap['headers']['content-type'] ?? null, $sitemap['headers']['cache-control'] ?? null]);
        assert_true(str_starts_with($sitemap['raw'], '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), $sitemap['raw']);
        $legal = [SITE_URL . '/terms', SITE_URL . '/privacy', SITE_URL . '/contact', SITE_URL . '/about', SITE_URL . '/support'];
        assert_same($legal, sitemap_locations($sitemap['raw']), 'the legal pages, About and Support - the learner\'s pages would send a robot to the IAM');
        $xml = new DOMDocument();
        assert_true($xml->loadXML($sitemap['raw']), 'valid XML');

        // The IAM lets visitors in: the learner's pages too - never Stats, a person's own.
        test_login_required($GLOBALS['auth'], false);
        sitemap_forgotten();
        $learner = [SITE_URL . '/', SITE_URL . '/trainer', SITE_URL . '/sheet', SITE_URL . '/songs'];
        assert_same([...$legal, ...$learner], sitemap_locations(ask('GET', '/sitemap.xml')['raw']));

        // A page Page access hides - for people signed in, or switched off - leaves the sitemap at once (no waiting for the hour).
        assert_same(201, add_page(['path' => '/songs', 'visibility' => 'USER'])['status']);
        assert_same(201, add_page(['path' => '/', 'visibility' => 'PUBLIC', 'blocked' => true])['status']);
        assert_same([...$legal, SITE_URL . '/trainer', SITE_URL . '/sheet'], sitemap_locations(ask('GET', '/sitemap.xml')['raw']));

        test_login_required($GLOBALS['auth'], true);
        settings_cleared();
        site_file(null);
        sitemap_forgotten();
    },
);
