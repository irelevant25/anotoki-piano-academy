-----------------------------------------------------------
-- THE SITE SETTINGS: WHAT THE PRIVACY PAGE SAYS OF THEM, AND A PAGE THAT IS NOT OPEN
--
-- Finished (2026-10-25). The owner applies it after a pg_dump of the
-- database: on this computer by Save on /setup.php (or php migration.php, or
-- an ADMIN's "Apply pending" on the admin panel's Migrations page); on the
-- host, upload the build and apply it at once on the Migrations page. The
-- anotoki library's files of 0.11.0 go in the same Apply - anotoki_admin's
-- 003 (the site settings' two tables) before it, anotoki_translations' 014
-- (the kit's new pieces' words) and 015 (the site settings' words) after it.
-- Until then the site tells everybody it is being updated, and an ADMIN that
-- a database update is waiting. Once applied it never changes: the next
-- change is 015.
--
-- From anotoki-lib 0.11.0 Piano Academy has the family's site settings - the
-- switches its administrators throw without a deploy: Getting in (closing
-- the site for a while), an announcement at the top of its pages, and Page
-- access (who may see which page). The settings' own words are the
-- library's (anotoki.siteSettings.*, anotoki.maintenance.*, its 015). Two
-- things are Piano Academy's own, in English and informal Slovak (ty, and
-- nothing gendered about the learner):
--
--   legal.settings.*   the Privacy page: each setting, and each page's row of
--                      Page access, keeps who changed it last and when (the
--                      library's tables' updated_by - the administrator's IAM
--                      id) until it changes again; deleting that person's data
--                      here leaves it changed by nobody (api/people.php)
--   title.notOpen      the page drawn in place of one Page access closes to
--   notOpen.*          the reader, where Learn - every unknown or closed
--                      page's way back - is closed to them too (the router has
--                      nowhere else to go)
--
-- No string holds an address. In 003's form: a key, its English and its
-- Slovak string, every insert stepping aside for a row that is already
-- there; then the strings' gate. Nothing else of the schema, and nothing of
-- anybody's progress, changes. One string on a line, an apostrophe written
-- twice and nothing else escaped: that is all the statement splitter knows
-- of a string.
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- title: the browser tab's title of the page that is not open
    ('title.notOpen', 'The browser tab''s title of the page shown in place of one the site''s administrators closed to this reader (the site settings'' Page access) - when Learn is closed to them too - before " · Piano Academy". Short. No placeholders.'),
    -- notOpen: that page
    ('notOpen.title', 'The heading of the page shown in place of one the site''s administrators closed to this reader (the site settings'' Page access), when Learn is closed to them too: the page they asked for is not open to them now. No placeholders.'),
    ('notOpen.text', 'The sentence under the heading of the page that is not open: the administrators closed it for now, or opened it for some people only (for example, people who are signed in). Never says who. No placeholders.'),
    -- legal.settings: the Privacy page's part about the site settings
    ('legal.settings.name', 'The Privacy page: the heading of the part about the administrators who change the site''s settings (who changed a setting last, and when), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.settings.what', 'The Privacy page, the settings'' changers: what is kept - the site''s settings (an announcement at the top of its pages, closing the site for a while, who may see which page) each keep who changed them last, and when. No placeholders.'),
    ('legal.settings.why', 'The Privacy page, the settings'' changers: what it is for (under "What for"). No placeholders.'),
    ('legal.settings.kept', 'The Privacy page, the settings'' changers: how long - until the setting is changed again; a person''s data deleted leaves the setting, changed by nobody. No placeholders.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    ('title.notOpen', 'Not open right now'),
    ('notOpen.title', 'This page is not open right now'),
    ('notOpen.text', 'Piano Academy''s administrators have closed it for now, or opened it for some people only.'),
    ('legal.settings.name', 'If you change the site''s settings'),
    ('legal.settings.what', 'Administrators change Piano Academy''s settings in its admin panel - an announcement at the top of its pages, closing the site for a while, who may see which page: each setting keeps who changed it last, and when.'),
    ('legal.settings.why', 'So that the administrators know who changed what.'),
    ('legal.settings.kept', 'Until the setting is changed again. When an administrator deletes that person''s data here, the setting stays, changed by nobody.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    ('title.notOpen', 'Teraz nie je otvorené'),
    ('notOpen.title', 'Táto stránka teraz nie je otvorená'),
    ('notOpen.text', 'Správcovia Piano Academy ju zatiaľ zatvorili alebo ju otvorili len pre niektorých ľudí.'),
    ('legal.settings.name', 'Ak meníš nastavenia stránky'),
    ('legal.settings.what', 'Správcovia menia nastavenia Piano Academy v administrátorskom paneli – oznámenie navrchu stránok, dočasné zatvorenie stránky, kto môže vidieť ktorú stránku: pri každom nastavení sa uchováva, kto ho naposledy zmenil a kedy.'),
    ('legal.settings.why', 'Aby správcovia vedeli, kto čo zmenil.'),
    ('legal.settings.kept', 'Kým sa nastavenie znova nezmení. Keď údaje toho človeka tu zmaže správca, nastavenie zostane, ale bez toho, kto ho zmenil.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-----------------------------------------------------------
-- PROVE IT: THE STRINGS
--
-- Every key this file writes is here and reads in both languages: a page
-- never shows a key, and Slovak never falls back to English by accident.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('title.notOpen'), ('notOpen.title'), ('notOpen.text'),
          ('legal.settings.name'), ('legal.settings.what'), ('legal.settings.why'), ('legal.settings.kept')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
END $$;
