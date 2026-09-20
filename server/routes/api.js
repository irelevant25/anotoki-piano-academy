import { Router } from 'express';
import { readJson, writeJson, withFileLock } from '../lib/storage.js';

const PROGRESS_FILE = 'progress.json';
const SESSIONS_FILE = 'sessions.json';
const PATH_FILE = 'path.json';

export const apiRouter = Router();

// Everything the frontend needs to boot: per-note SRS state, session history,
// and learning-path progress (which path steps were passed, best scores).
apiRouter.get('/state', async (req, res, next) => {
  try {
    const [progress, sessions, path] = await Promise.all([
      readJson(PROGRESS_FILE, {}),
      readJson(SESSIONS_FILE, []),
      readJson(PATH_FILE, { steps: {} }),
    ]);
    res.json({ progress, sessions, path });
  } catch (err) {
    next(err);
  }
});

// The frontend computes SRS updates itself (shared/srs.js runs in both
// places) and PUTs the resulting note-state map back for persistence.
apiRouter.put('/progress', async (req, res, next) => {
  try {
    const progress = req.body;
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
      return res.status(400).json({ error: 'Body must be a JSON object keyed by MIDI note number.' });
    }
    await withFileLock(PROGRESS_FILE, () => writeJson(PROGRESS_FILE, progress));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Learning-path progress, computed in the browser via shared/path.js and
// persisted whole, same as /progress.
apiRouter.put('/path', async (req, res, next) => {
  try {
    const path = req.body;
    if (!path || typeof path !== 'object' || !path.steps || typeof path.steps !== 'object' || Array.isArray(path.steps)) {
      return res.status(400).json({ error: 'Body must be an object with a "steps" object keyed by "unitId/stepId".' });
    }
    await withFileLock(PATH_FILE, () => writeJson(PATH_FILE, path));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Append one completed-session summary (note trainer run, sheet, song, or path lesson step).
apiRouter.post('/sessions', async (req, res, next) => {
  try {
    const session = req.body;
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      return res.status(400).json({ error: 'Body must be a session object.' });
    }
    const stamped = { ...session, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, recordedAt: new Date().toISOString() };
    await withFileLock(SESSIONS_FILE, async () => {
      const sessions = await readJson(SESSIONS_FILE, []);
      sessions.push(stamped);
      await writeJson(SESSIONS_FILE, sessions);
    });
    res.status(201).json(stamped);
  } catch (err) {
    next(err);
  }
});
