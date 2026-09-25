import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOWNLOADS } from '../site/render/registry.mjs';
import { inspectContainedPath, isContained, resolveRegularProjectRoot } from './lib/safe-files.mjs';

const CANONICAL_NAME = 'pakistan_music_research_package.html';
const ASSET_PREFIX = 'assets/hiphop-pakistan/';
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
});

export async function startPreviewServer({ rootDir, host, port }) {
  if (host !== '127.0.0.1') throw new TypeError('host must be exactly 127.0.0.1');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError('port must be an integer from 0 through 65535');
  }
  const projectRoot = resolveRegularProjectRoot(rootDir);
  const assetInspection = inspectContainedPath(projectRoot, 'assets/hiphop-pakistan', 'directory');
  if (!assetInspection.ok || !isContained(projectRoot, assetInspection.realPath)) {
    throw new TypeError(`asset root must be a regular non-symlink directory inside the project root (${assetInspection.reason})`);
  }
  const assetRoot = assetInspection.realPath;
  const server = createServer((request, response) => {
    handleRequest({ request, response, projectRoot, assetRoot });
  });

  await new Promise((resolveListen, rejectListen) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      rejectListen(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolveListen();
    };
    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen({ host, port });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('preview server did not expose a TCP address');
  }
  return { server, url: `http://${host}:${address.port}/` };
}

function handleRequest({ request, response, projectRoot, assetRoot }) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.setHeader('Allow', 'GET, HEAD');
    sendStatus(response, 405, request.method === 'HEAD');
    return;
  }

  const rawPath = String(request.url ?? '/').split('?', 1)[0];
  const decoded = decodeRequestPath(rawPath);
  if (!decoded.ok) {
    sendStatus(response, 403, request.method === 'HEAD');
    return;
  }

  const relativePath = decoded.path === '/' ? CANONICAL_NAME : decoded.path.slice(1);
  const classification = classifyPath(relativePath);
  if (!classification.allowed) {
    sendStatus(response, 404, request.method === 'HEAD');
    return;
  }

  try {
    const inspection = inspectContainedPath(projectRoot, relativePath, 'file');
    if (!inspection.ok) {
      sendStatus(response, 404, request.method === 'HEAD');
      return;
    }
    const realTarget = inspection.realPath;
    const allowedRoot = classification.asset ? assetRoot : projectRoot;
    if (!isContained(allowedRoot, realTarget)) {
      sendStatus(response, 404, request.method === 'HEAD');
      return;
    }
    const body = readFileSync(realTarget);
    response.statusCode = 200;
    response.setHeader('Content-Type', CONTENT_TYPES[extname(relativePath).toLocaleLowerCase('en')] ?? 'application/octet-stream');
    response.setHeader('Content-Length', String(body.length));
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    sendStatus(response, 404, request.method === 'HEAD');
  }
}

function decodeRequestPath(rawPath) {
  if (!rawPath.startsWith('/') || rawPath.includes('\\') || rawPath.includes('\0')) return { ok: false };
  let layer = rawPath;
  for (let depth = 0; depth < 4; depth += 1) {
    if (/%(?![0-9a-f]{2})/iu.test(layer) || /%(?:00|2f|5c)/iu.test(layer)) return { ok: false };
    let decoded;
    try {
      decoded = decodeURIComponent(layer);
    } catch {
      return { ok: false };
    }
    if (decoded === layer) break;
    layer = decoded;
  }
  if (/%[0-9a-f]{2}/iu.test(layer) || /[\u0000-\u001f\u007f]/u.test(layer) || layer.includes('\\')) return { ok: false };
  const segments = layer.split('/');
  if (segments.some((segment, index) => index > 0 && (segment === '.' || segment === '..'))) return { ok: false };
  return { ok: true, path: layer };
}

function classifyPath(relativePath) {
  if (relativePath === CANONICAL_NAME || DOWNLOADS.includes(relativePath)) return { allowed: true, asset: false };
  if (!relativePath.startsWith(ASSET_PREFIX)) return { allowed: false, asset: false };
  const assetRelative = relativePath.slice(ASSET_PREFIX.length);
  const segments = assetRelative.split('/');
  const hidden = !assetRelative || segments.some((segment) => !segment || segment.startsWith('.'));
  const temporary = segments.some((segment) => /(?:\.tmp|\.temp|\.part|\.bak|\.swp|~)$/iu.test(segment));
  return { allowed: !hidden && !temporary, asset: true };
}

function sendStatus(response, statusCode, headOnly = false) {
  const body = Buffer.from(`${statusCode}\n`, 'utf8');
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Content-Length', String(body.length));
  if (headOnly) response.end();
  else response.end(body);
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function isDirectRun() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  try {
    const { url } = await startPreviewServer({ rootDir: process.cwd(), host: '127.0.0.1', port: 8766 });
    process.stdout.write(`Preview: ${url}\n`);
  } catch (error) {
    process.stderr.write(`PREVIEW_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
