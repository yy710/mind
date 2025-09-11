#!/usr/bin/env node
/*
 Unified server:
 - Builds the frontend (apps/web) with VITE_UPLOAD_ENDPOINT=/upload (and optional VITE_UPLOAD_DIR, VITE_UPLOAD_TOKEN)
 - Serves the built static assets on a single Express server
 - Exposes compatible API routes: POST /upload, GET /files, GET /file?path=
 - Config:
   PORT (default 8080)
   UPLOAD_BASE_DIR (default .uploads)
   UPLOAD_TOKEN (optional; if set, require Authorization: Bearer <UPLOAD_TOKEN>)
   FORCE_BUILD=true to always rebuild
*/

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { spawnSync } = require('child_process');

const express = require('express');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT, 'dist/apps/web');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const BASE_DIR = process.env.UPLOAD_BASE_DIR || path.resolve(ROOT, '.uploads');
const REQ_TOKEN = process.env.UPLOAD_TOKEN || '';
const FORCE_BUILD = String(process.env.FORCE_BUILD || '').toLowerCase() === 'true';

function log(...args) {
  console.log('[unified-server]', ...args);
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isPathInside(parent, child) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function buildFrontendIfNeeded() {
  const needBuild = FORCE_BUILD || !fs.existsSync(INDEX_HTML);
  if (!needBuild) {
    log('Frontend already built at', DIST_DIR);
    return;
  }
  log('Building frontend with /upload endpoint ...');
  const env = {
    ...process.env,
    VITE_UPLOAD_ENDPOINT: '/upload',
  };
  // Pass through optional vars so client can include them (if desired)
  if (process.env.UPLOAD_TOKEN) env.VITE_UPLOAD_TOKEN = process.env.UPLOAD_TOKEN;
  if (process.env.UPLOAD_DIR) env.VITE_UPLOAD_DIR = process.env.UPLOAD_DIR;

  const res = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:web'], {
    cwd: ROOT,
    stdio: 'inherit',
    env,
  });
  if (res.status !== 0) {
    console.error('Build failed');
    process.exit(res.status || 1);
  }
}

async function listDrawnixFiles(dir, base) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const nested = await listDrawnixFiles(abs, base);
      results.push(...nested);
    } else if (ent.isFile() && ent.name.endsWith('.drawnix')) {
      const stat = await fsp.stat(abs);
      const rel = path.relative(base, abs);
      results.push({
        name: ent.name,
        relativePath: rel,
        dir: path.dirname(rel) === '.' ? '' : path.dirname(rel),
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    }
  }
  return results;
}

function authCheck(req, res) {
  if (!REQ_TOKEN) return true;
  const auth = req.get('authorization') || '';
  const ok = auth === `Bearer ${REQ_TOKEN}`;
  if (!ok) res.status(401).json({ ok: false, error: 'Unauthorized' });
  return ok;
}

async function main() {
  ensureDirSync(BASE_DIR);
  buildFrontendIfNeeded();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API routes
  app.post('/upload', async (req, res) => {
    if (!authCheck(req, res)) return;
    const body = req.body || {};
    const filename = body.filename || '';
    const content = body.content || '';
    const dir = body.dir || '';

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ ok: false, error: 'filename required' });
    }

    const safeName = path.basename(filename);
    const targetDir = path.resolve(BASE_DIR, dir ? String(dir) : '');
    const targetPath = path.resolve(targetDir, safeName);
    if (!isPathInside(BASE_DIR, targetPath)) {
      return res.status(400).json({ ok: false, error: 'Invalid path' });
    }

    try {
      await ensureDir(targetDir);
      await fsp.writeFile(targetPath, String(content), 'utf8');
      return res.json({ ok: true, path: targetPath, size: Buffer.byteLength(String(content), 'utf8') });
    } catch (e) {
      console.error('Write error:', e);
      return res.status(500).json({ ok: false, error: 'Write failed' });
    }
  });

  app.get('/files', async (req, res) => {
    if (!authCheck(req, res)) return;
    try {
      await ensureDir(BASE_DIR);
      const files = await listDrawnixFiles(BASE_DIR, BASE_DIR);
      return res.json({ ok: true, files });
    } catch (e) {
      console.error('List error:', e);
      return res.status(500).json({ ok: false, error: 'List failed' });
    }
  });

  app.get('/file', async (req, res) => {
    if (!authCheck(req, res)) return;
    const rel = String(req.query.path || '').replace(/^\/+/, '');
    if (!rel) return res.status(400).json({ ok: false, error: 'path required' });
    const abs = path.resolve(BASE_DIR, rel);
    if (!isPathInside(BASE_DIR, abs)) return res.status(400).json({ ok: false, error: 'Invalid path' });
    try {
      const content = await fsp.readFile(abs, 'utf8');
      return res.json({ ok: true, name: path.basename(abs), relativePath: rel, content });
    } catch (e) {
      console.error('Read error:', e);
      return res.status(404).json({ ok: false, error: 'Not Found' });
    }
  });

  // Static frontend
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1y', extensions: ['html'] }));
  app.get('*', (req, res) => {
    res.sendFile(INDEX_HTML);
  });

  app.listen(PORT, () => {
    log(`Server listening on http://localhost:${PORT}`);
    log(`Static files served from ${DIST_DIR}`);
    log(`Uploads directory: ${BASE_DIR}`);
    if (REQ_TOKEN) log('Auth required: Bearer ' + REQ_TOKEN);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});