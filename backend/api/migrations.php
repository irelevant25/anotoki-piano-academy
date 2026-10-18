<?php

declare(strict_types=1);

use Anotoki\Lib\Admin\Schema as AdminSchema;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\People\Schema as PeopleSchema;
use Anotoki\Lib\Translations\Schema as TranslationsSchema;

/**
 * The database's migrations, and where the site stands - through the anotoki
 * family's one engine, the Composer package anotoki/lib (its
 * Anotoki\Lib\Migrations, in vendor/), so a migration reads and runs the same
 * in every anotoki repository. This file only says what is Piano Academy's
 * own: the folder, the lock, the shape its first record had, its settings.
 *
 * The migrations are the schema, in four sets, in this order (the library's
 * README): the library's admin tools' set first (anotoki_admin: the audit
 * log's and feedback's tables - nothing of this app's builds on it, and
 * nothing but the library makes an anotoki_* table); this app's own,
 * migrations/piano_academy/NNN_name.sql; then the library's set of the words
 * (anotoki_translations: the family's one schema of languages, keys and
 * strings - which this app's 002 made long before, so the library's 001 only
 * proves its shape - and the library's own words, anotoki.*); then its set
 * of the people (anotoki_people: where the scrub of the IAM's deleted
 * accounts stands - after this app's 010, which adds users.anonymized_at).
 * The library's files are in vendor/anotoki/lib/backend/migrations/. Each set is
 * applied in natural order (100 after 99), each file in a transaction of its
 * own together with its row in the `migrations` table - all of it or none of
 * it - stopping at the first that fails, because every migration is written
 * expecting the ones before it to have run. The library's files are recorded
 * as `<set>/<file>` (`anotoki_translations/001_....sql`) in the same table,
 * whose shape does not change. Nothing is ever un-applied: a rollback that
 * half works is worse than none.
 *
 * Whoever applies them - setup.php's Save, php migration.php, an
 * administrator's Apply on the admin panel's Migrations page
 * (POST /api/admin/migrations/apply), the tests' database builders - takes
 * the same PostgreSQL advisory lock first (DATABASE_UPDATE_LOCK), so two of
 * them never apply the same file at once: the second is told it is busy, and
 * applies nothing. The lock is the database's own: it is let go when the
 * update ends, or when its connection does. The three ways of updating a
 * database that is in use make a backup of it first (api/admin_tools.php's
 * databaseUpdater(): the library's before-migration backup); the tests'
 * builders make none.
 *
 * Where the site stands is decided afresh for every request (siteState(), the
 * SiteGate in api/index.php, GET /api/site-status): not set up (the settings
 * files are missing or say too little), an update pending (a migration file
 * is waiting), unavailable (the database cannot be reached), or ready.
 */

/** The one set of migrations: its name, and its folder's under migrations/. */
const MIGRATIONS_SET = 'piano_academy';

/** The advisory lock every way of updating takes - the number this app always took (any would do). */
const DATABASE_UPDATE_LOCK = 3_300_004_500;

/** migrations/piano_academy/ - in the repository's backend/ and in the upload alike. */
function migrationsDir(): string
{
    return PIANO_BACKEND . '/migrations/' . MIGRATIONS_SET;
}

function migrationSet(): MigrationSet
{
    return new MigrationSet(MIGRATIONS_SET, migrationsDir());
}

/**
 * Every set, in the order they run (anotoki/lib's README): the library's
 * admin tools' set FIRST (Admin\Schema::migrationSet()), the app's own, then
 * the library's set of the words (Translations\Schema::migrationSet()) - after
 * it, as the library asks of a site whose own migrations made those tables -
 * and of the people (People\Schema::migrationSet()), after the app's 010.
 *
 * @return list<MigrationSet>
 */
function migrationSets(): array
{
    return [AdminSchema::migrationSet(), migrationSet(), TranslationsSchema::migrationSet(), PeopleSchema::migrationSet()];
}

/**
 * A file as people are told of it - the command line, the setup page, the
 * health check: the app's own by its name, the library's with its set before
 * it, as the `migrations` table records it ("anotoki_translations/001_....sql").
 *
 * @param array{set: string, name: string} $file
 */
function migrationLabel(array $file): string
{
    return $file['set'] === MIGRATIONS_SET ? $file['name'] : $file['set'] . '/' . $file['name'];
}

/**
 * The files of the app's own set, in the order they run: the *.sql files
 * directly in its folder, hidden ones left out, natural order - what
 * Migrator::files() lists (tests/unit/migrations.test.php holds the two
 * equal). For what only reads the folder and has no connection at hand: the
 * tests.
 *
 * @return list<string>
 */
function migrationFiles(): array
{
    $entries = is_dir(migrationsDir()) ? (scandir(migrationsDir()) ?: []) : [];
    $files = array_filter($entries, static fn(string $entry): bool => $entry[0] !== '.' && str_ends_with($entry, '.sql') && is_file(migrationsDir() . '/' . $entry));
    natsort($files);

    return array_values($files);
}

/**
 * The engine on $pdo - the app's own connection when none is given (setup.php,
 * the command line and the tests bring theirs) - with every set
 * (migrationSets()): whoever applies, applies the library's files too. $options
 * are the Migrator's, over the app's own: the tests hold the files after a
 * point back with `ready`, to build a database as it stood then.
 */
function databaseMigrator(?PDO $pdo = null, array $options = []): Migrator
{
    return new Migrator(
        $pdo ?? db(),
        migrationSets(),
        $options + [
            'lock' => DATABASE_UPDATE_LOCK,
            'prepare' => adoptLegacyMigrationsTable(...),
        ],
    );
}

/** Does `migrations` still have the column this app's first runner called `name` (and no `filename`)? */
function legacyMigrationsTable(PDO $pdo): bool
{
    $columns = $pdo
        ->query(
            "SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'migrations' AND column_name IN ('name', 'filename')",
        )
        ->fetchAll(PDO::FETCH_COLUMN);

    return $columns === ['name'];
}

/**
 * The Migrator's `prepare`, run before anything is written: before it took
 * the family's engine (2026-09-28) Piano Academy kept its own record,
 * migrations (name text PRIMARY KEY, applied_at timestamptz). The rows are
 * the same facts; only the column was named differently. Renamed once, in
 * place, so a database set up before then reads as what it is. (Reading it
 * needs no rename: the engine reads a `name` column as it is.)
 */
function adoptLegacyMigrationsTable(PDO $pdo): void
{
    if (legacyMigrationsTable($pdo)) {
        $pdo->exec('ALTER TABLE migrations RENAME COLUMN name TO filename');
    }
}

/**
 * Where the site stands, for the SiteGate in front of every route
 * (api/index.php) and for GET /api/site-status: its settings
 * (settingsProblem()); whether its installer finished on a real host -
 * storage/installed.lock, which setup.php writes there and never on this
 * computer, after which nobody is offered the setup page again; and the
 * migrations, asked only once the settings are complete. The state itself is
 * computed afresh on every call (SiteState::state()).
 */
function siteState(): SiteState
{
    static $state = null;

    return $state ??= new SiteState(
        settingsProblem: static fn(): ?string => settingsProblem(),
        installed: static fn(): bool => is_file(storageDir() . '/installed.lock'),
        migrator: static fn(): Migrator => databaseMigrator(),
    );
}
