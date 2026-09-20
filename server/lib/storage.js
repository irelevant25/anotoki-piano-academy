// Minimal local JSON file storage. No database: each collection is one JSON
// file under server/data/, read/written whole (this app has a single local
// user; withFileLock below is enough to keep overlapping requests apart).
// Writes are atomic (write to a temp file, then rename) so a crash mid-write
// can't corrupt data.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PIANO_DATA_DIR lets a test run use a throwaway directory instead of the learner's real progress.
export const DATA_DIR = process.env.PIANO_DATA_DIR
  ? path.resolve(process.env.PIANO_DATA_DIR)
  : path.join(__dirname, '..', 'data');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(fileName, fallback) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(fileName, data) {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// One queue per file, so two requests for the same file never share the
// .tmp path or interleave a read-modify-write (e.g. two sessions POSTed at once).
const queues = new Map();

/** Runs `task` after every earlier task for the same file has finished. */
export function withFileLock(fileName, task) {
  const run = (queues.get(fileName) || Promise.resolve()).then(task, task);
  queues.set(fileName, run.catch(() => {}));
  return run;
}
