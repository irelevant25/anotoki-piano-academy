// The whole browser check in one go, from the repository's root:
//
//   node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep] [--measure]
//
// It builds the frontend (unless --no-build), makes a throwaway database (piano_test_browser_<port>, a copy of the
// tests' template - backend/tests/tools/testenv.php), starts the anotoki family's stand-in IAM
// (backend/vendor/anotoki/lib/backend/testing/stand-in-iam.php, its key made by the library's TestIam) on 8597 and the app on 8590 (SITE_PORT / IAM_PORT for others; router.php: the built app and the API on one origin, as on the hosting, with
// PIANO_TEST_CONFIG pointing at the throwaway settings), drives headless Edge (or Chrome: BROWSER=chrome)
// through playwright-core (flow.mjs), and then stops all of it and drops the database - also when the check
// fails. --keep leaves the work folder (settings, logs, screenshots, the downloaded file) behind to look at;
// the screenshots are there while it runs. --measure only prints what the top bar's row needs, in English and
// in Slovak (how PHONE_BAR_MAX and ADMIN_PHONE_BAR_MAX in shared/top-bar were chosen).
//
// PHP: the `php` on the PATH, or PHP=<the 8.2+ binary>. playwright-core is installed once into <temp>/pw (never
// into the repository): `npx -y npm@11 install --prefix "<temp>/pw" playwright-core` - this script does it when
// it is missing (PW_DIR for another folder). Nothing here touches the owner's database, settings, servers
// (4200-4700, 8000-8500), browser profile or the real IAM.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const backend = join(repo, 'backend');
const frontend = join(repo, 'frontend');
const args = new Set(process.argv.slice(2));
const windows = process.platform === 'win32';

// Throwaway ports (8590-8599); another check may hold the defaults - SITE_PORT / IAM_PORT for others.
const SITE = Number(process.env.SITE_PORT ?? 8590);
const IAM = Number(process.env.IAM_PORT ?? 8597);
// One database a port, so two checks on other ports never share one.
const DATABASE = `piano_test_browser_${SITE}`;
const php = process.env.PHP ?? 'php';
const pw = process.env.PW_DIR ?? join(tmpdir(), 'pw');

const work = mkdtempSync(join(tmpdir(), 'piano-academy-browser-'));
const config = join(work, 'config');
const children = [];

function run(command, commandArgs, options = {}) {
  // npm and npx are .cmd files on Windows: batch files, which only a shell runs.
  return execFileSync(command, commandArgs, { stdio: 'inherit', shell: windows && ['npm', 'npx'].includes(command), ...options });
}

function start(command, commandArgs, options = {}) {
  const log = join(work, `${options.name}.log`);
  const child = spawn(command, commandArgs, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, ...options });
  child.stderr.on('data', (chunk) => writeFileSync(log, chunk, { flag: 'a' }));
  children.push(child);
  return child;
}

async function waitForUrl(url, what) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`${what} did not start (${url}).`);
}

async function portFree(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
    return false;
  } catch {
    return true;
  }
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode === null) {
      // On Windows a process's children go only with /T.
      if (windows) {
        try {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
          // already gone
        }
      } else {
        child.kill('SIGTERM');
      }
    }
  }
}

let code = 1;
let started = false;
try {
  for (const port of [SITE, IAM]) {
    if (!(await portFree(port))) {
      throw new Error(`Port ${port} is in use: another check, or a server of somebody else's - look before stopping anything.`);
    }
  }
  if (!existsSync(join(pw, 'node_modules', 'playwright-core'))) {
    mkdirSync(pw, { recursive: true });
    run('npx', ['-y', 'npm@11', 'install', '--prefix', pw, 'playwright-core']);
  }
  if (!args.has('--no-build')) {
    run('npx', ['ng', 'build'], { cwd: frontend });
  }

  // The throwaway database (the tests' template, migrated to the end) and the settings that point at it and at the stand-in IAM.
  started = true;
  run(php, ['tests/tools/testdb.php', 'template'], { cwd: backend });
  run(php, ['tests/tools/testenv.php', config, `--db=${DATABASE}`, `--issuer=http://127.0.0.1:${IAM}`, '--application-ttl=1'], { cwd: backend });
  // The stand-in's key (key.json, as the library's TestIam writes it) in a folder of its own, where it keeps its state too.
  const iamDir = join(work, 'stand-in-iam');
  mkdirSync(iamDir, { recursive: true });
  run(php, ['-r', 'require "vendor/autoload.php"; \\Anotoki\\Lib\\Auth\\Testing\\TestIam::create($argv[1], $argv[2], "piano-academy", "browser-check");', iamDir, `http://127.0.0.1:${IAM}`], {
    cwd: backend,
  });

  start(php, ['-S', `127.0.0.1:${IAM}`, 'vendor/anotoki/lib/backend/testing/stand-in-iam.php'], {
    name: 'stand-in-iam',
    cwd: backend,
    env: { ...process.env, STAND_IN_DIR: iamDir, STAND_IN_ISSUER: `http://127.0.0.1:${IAM}` },
  });
  start(php, ['-S', `127.0.0.1:${SITE}`, 'router.php'], { name: 'site', cwd: backend, env: { ...process.env, PIANO_TEST_CONFIG: config } });
  await waitForUrl(`http://127.0.0.1:${IAM}/.well-known/openid-configuration`, 'The stand-in IAM');
  await waitForUrl(`http://127.0.0.1:${SITE}/api/health`, 'The app');

  const shots = join(work, 'shots');
  mkdirSync(shots, { recursive: true });
  console.log(`Screenshots: ${shots}\n`);
  const flow = spawn(process.execPath, [join(here, 'flow.mjs'), `http://127.0.0.1:${SITE}`, `http://127.0.0.1:${IAM}`, work, ...(args.has('--measure') ? ['--measure'] : [])], {
    stdio: 'inherit',
    env: { ...process.env, PW_DIR: pw },
  });
  code = await new Promise((done) => flow.on('exit', (exitCode) => done(exitCode ?? 1)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  stopAll();
  // Only what this run made: a port that was taken before is somebody else's.
  if (started) {
    try {
      execFileSync(php, ['tests/tools/testdb.php', 'drop', DATABASE], { cwd: backend, stdio: 'ignore' });
    } catch {
      console.error(`Could not drop the throwaway database: php tests/tools/testdb.php drop ${DATABASE}`);
    }
    await new Promise((done) => setTimeout(done, 300));
    for (const port of [SITE, IAM]) {
      if (!(await portFree(port))) {
        console.error(`Port ${port} still answers after the check - look at what holds it.`);
      }
    }
  }
  if (args.has('--keep')) {
    console.log(`\nKept: ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }
  process.exit(code);
}
