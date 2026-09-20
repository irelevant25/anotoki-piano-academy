import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { apiRouter } from './routes/api.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = require('../package.json');

const HOST = pkg.config?.host || '127.0.0.1';
const PORT = process.env.PORT || pkg.config?.port || 3000;

const app = express();

app.use(express.json());
app.use('/api', apiRouter);

// Shared theory/SRS/song logic used identically by the server and the browser.
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

// VexFlow's ESM build, served as-is so the browser can import it directly
// without a bundler (keeps sheet-music rendering working fully offline).
app.use('/vendor/vexflow', express.static(path.join(__dirname, '..', 'node_modules', 'vexflow', 'build', 'esm')));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Bad request body (malformed JSON, too large) - the client's fault, not a crash.
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Piano Learning app running at http://${HOST}:${PORT}`);
});
