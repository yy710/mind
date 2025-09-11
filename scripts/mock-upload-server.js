/*
 Simple mock upload server
 - Endpoint: POST /upload
 - Env:
   PORT (default 8787)
   MOCK_TOKEN (optional; if set, require Authorization: Bearer <MOCK_TOKEN>)
   MOCK_BASE_DIR (default .uploads)
*/

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const BASE_DIR = process.env.MOCK_BASE_DIR || path.resolve(process.cwd(), '.uploads');
const REQ_TOKEN = process.env.MOCK_TOKEN || '';

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function isPathInside(parent, child) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function handleUpload(req, res) {
  if (REQ_TOKEN) {
    const auth = req.headers['authorization'] || '';
    const expected = `Bearer ${REQ_TOKEN}`;
    if (auth !== expected) {
      return send(res, 401, { ok: false, error: 'Unauthorized' });
    }
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    // 10MB limit
    if (raw.length > 10 * 1024 * 1024) {
      req.destroy();
    }
  });
  req.on('end', async () => {
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch (e) {
      return send(res, 400, { ok: false, error: 'Invalid JSON' });
    }
    const filename = (body && body.filename) || '';
    const content = (body && body.content) || '';
    const dir = (body && body.dir) || '';

    if (!filename || typeof filename !== 'string') {
      return send(res, 400, { ok: false, error: 'filename required' });
    }

    // sanitize filename to avoid path traversal
    const safeName = path.basename(filename);
    const targetDir = path.resolve(BASE_DIR, dir ? String(dir) : '');
    const targetPath = path.resolve(targetDir, safeName);

    if (!isPathInside(BASE_DIR, targetPath)) {
      return send(res, 400, { ok: false, error: 'Invalid path' });
    }

    try {
      await ensureDir(targetDir);
      await fsp.writeFile(targetPath, String(content), 'utf8');
      return send(res, 200, {
        ok: true,
        path: targetPath,
        size: Buffer.byteLength(String(content), 'utf8'),
      });
    } catch (e) {
      console.error('Write error:', e);
      return send(res, 500, { ok: false, error: 'Write failed' });
    }
  });
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

async function handleListFiles(req, res) {
  if (REQ_TOKEN) {
    const auth = req.headers['authorization'] || '';
    const expected = `Bearer ${REQ_TOKEN}`;
    if (auth !== expected) {
      return send(res, 401, { ok: false, error: 'Unauthorized' });
    }
  }
  try {
    await ensureDir(BASE_DIR);
    const files = await listDrawnixFiles(BASE_DIR, BASE_DIR);
    return send(res, 200, { ok: true, files });
  } catch (e) {
    console.error('List error:', e);
    return send(res, 500, { ok: false, error: 'List failed' });
  }
}

function parseQuery(url) {
  const i = url.indexOf('?');
  const query = {};
  if (i === -1) return query;
  const qs = url.slice(i + 1);
  for (const part of qs.split('&')) {
    const [k, v] = part.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return query;
}

async function handleReadFile(req, res) {
  if (REQ_TOKEN) {
    const auth = req.headers['authorization'] || '';
    const expected = `Bearer ${REQ_TOKEN}`;
    if (auth !== expected) {
      return send(res, 401, { ok: false, error: 'Unauthorized' });
    }
  }
  const q = parseQuery(req.url || '');
  const rel = (q.path || '').replace(/^\/+/, '');
  if (!rel) return send(res, 400, { ok: false, error: 'path required' });
  const abs = path.resolve(BASE_DIR, rel);
  if (!isPathInside(BASE_DIR, abs)) {
    return send(res, 400, { ok: false, error: 'Invalid path' });
  }
  try {
    const content = await fsp.readFile(abs, 'utf8');
    return send(res, 200, { ok: true, name: path.basename(abs), relativePath: rel, content });
  } catch (e) {
    console.error('Read error:', e);
    return send(res, 404, { ok: false, error: 'Not Found' });
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && req.url && req.url.startsWith('/upload')) {
    return handleUpload(req, res);
  }

  if (req.method === 'GET' && req.url && req.url.startsWith('/files')) {
    return handleListFiles(req, res);
  }

  if (req.method === 'GET' && req.url && req.url.startsWith('/file')) {
    return handleReadFile(req, res);
  }

  send(res, 404, { ok: false, error: 'Not Found' });
});

server.listen(PORT, () => {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
  console.log(`Mock upload server listening on http://localhost:${PORT}`);
  console.log(`Saving uploads to: ${BASE_DIR}`);
  if (REQ_TOKEN) {
    console.log('Auth required: Bearer ' + REQ_TOKEN);
  } else {
    console.log('Auth disabled');
  }
});