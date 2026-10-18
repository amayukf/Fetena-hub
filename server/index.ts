/**
 * ExamVault production server.
 *
 * The API previously only ran inside Vite's dev/preview middleware, so a
 * production deployment shipped static assets with no backend at all. This is
 * the real entrypoint: it serves the built SPA and every /api/* route from one
 * process, with security headers, SPA fallback, and graceful shutdown.
 *
 *   npm run build
 *   npm start            # NODE_ENV defaults to production here
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A real deployment must behave like production: this flips secure cookies on,
// disables actor impersonation, and enforces the strict SESSION_SECRET checks.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import { handleApiRequest, prisma } from './apiHandler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'dist');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

function applySecurityHeaders(res: ServerResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

/** Resolve a request path to a file inside dist, or null if it escapes. */
function safeResolve(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, '');
  const resolved = path.resolve(distDir, normalized);
  const relative = path.relative(distDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const method = req.method?.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return true;
  }

  const resolved = safeResolve(req.url || '/');
  if (!resolved) {
    res.writeHead(400);
    res.end('Bad request');
    return true;
  }

  let filePath = resolved;
  let stat: Awaited<ReturnType<typeof fsp.stat>> | null = null;
  try {
    stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fsp.stat(filePath);
    }
  } catch {
    stat = null;
  }

  // SPA fallback: unknown non-asset paths render the app shell.
  if (!stat) {
    const isAsset = /\.(js|mjs|css|png|jpe?g|webp|gif|ico|svg|woff2?|ttf|txt|map|pdf)$/i.test(filePath);
    if (isAsset) return false;
    filePath = path.join(distDir, 'index.html');
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return false;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader(
    'Cache-Control',
    isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
  );

  if (method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return true;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
  return true;
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  try {
    if (req.url?.startsWith('/api')) {
      await handleApiRequest(req, res);
      return;
    }

    if (await serveStatic(req, res)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error('[server] Unhandled request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    } else {
      res.end();
    }
  }
});

// Health/readiness plus a sane keep-alive/header timeout for slow networks.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(port, host, () => {
  console.log(`[server] ExamVault listening on http://${host}:${port} (NODE_ENV=${process.env.NODE_ENV})`);
  if (!fs.existsSync(distDir)) {
    console.warn('[server] WARNING: dist/ not found — run "npm run build" before starting.');
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — shutting down gracefully.`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('[server] Error disconnecting Prisma:', err);
    }
    process.exit(0);
  });
  // Do not hang forever on lingering connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
