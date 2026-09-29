<?php

declare(strict_types=1);

/**
 * The tests' throwaway databases (used by tests/run.php):
 *
 *   php tests/tools/testdb.php template       make or update piano_test_template: its tables
 *   php tests/tools/testdb.php create NAME    a new test database, copied from the template
 *   php tests/tools/testdb.php drop NAME      drop a test database
 *   php tests/tools/testdb.php sweep          drop test databases more than 6 hours old
 *                                             (left behind by a run that was killed)
 *
 * It only ever touches databases whose name starts with piano_test_, on the
 * server named in config/database.local.php.
 */

const TEMPLATE = 'piano_test_template';

$command = $argv[1] ?? '';
$name = $argv[2] ?? '';

// The app's functions, but never its settings: nothing here reads or writes
// the owner's database.
putenv('PIANO_TEST_CONFIG');
require __DIR__ . '/../../api/bootstrap.php';

$file = PIANO_BACKEND . '/config/database.local.php';
if (!is_file($file)) {
    fwrite(STDERR, "testdb: there is no config/database.local.php yet - open /setup.php first.\n");
    exit(1);
}
$server = require $file;

function testName(string $name): string
{
    if (!preg_match('/^piano_test_[a-z0-9_]+$/D', $name) || $name === TEMPLATE) {
        fwrite(STDERR, "testdb: not a test database name: $name\n");
        exit(1);
    }

    return $name;
}

switch ($command) {
    case 'template':
        ensureDatabase($server, TEMPLATE);
        $pdo = dbConnect($server, TEMPLATE);
        $result = applyPendingMigrations($pdo);
        $pdo = null;
        if ($result['failed'] !== null) {
            fwrite(STDERR, "testdb: {$result['failed']} failed: {$result['error']}\n");
            exit(1);
        }
        echo TEMPLATE . ': ' . ($result['applied'] ? 'updated (' . implode(', ', $result['applied']) . ')' : 'up to date') . "\n";
        break;

    case 'create':
        dbServer($server)->exec('CREATE DATABASE "' . testName($name) . '" ENCODING \'UTF8\' TEMPLATE "' . TEMPLATE . '"');
        dbServer($server)->exec('COMMENT ON DATABASE "' . $name . "\" IS 'piano test " . time() . "'");
        echo "$name\n";
        break;

    case 'drop':
        dbServer($server)->exec('DROP DATABASE IF EXISTS "' . testName($name) . '" WITH (FORCE)');
        break;

    case 'sweep':
        $rows = dbServer($server)->query("SELECT datname, shobj_description(oid, 'pg_database') AS note FROM pg_database WHERE datname LIKE 'piano\\_test\\_%'")->fetchAll();
        foreach ($rows as $row) {
            if ($row['datname'] !== TEMPLATE && preg_match('/^piano test (\d+)$/', (string) $row['note'], $m) && (int) $m[1] < time() - 6 * 3600) {
                dbServer($server)->exec('DROP DATABASE IF EXISTS "' . testName($row['datname']) . '" WITH (FORCE)');
                echo "dropped {$row['datname']}\n";
            }
        }
        break;

    default:
        fwrite(STDERR, "usage: php tests/tools/testdb.php template | create NAME | drop NAME | sweep\n");
        exit(1);
}
