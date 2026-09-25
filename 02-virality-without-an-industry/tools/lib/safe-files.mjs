import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function resolveRegularProjectRoot(rootDir) {
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw new TypeError('rootDir must be a non-empty string');
  }
  const requestedRoot = resolve(rootDir);
  const entry = lstatSync(requestedRoot);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new TypeError('project root must be a regular non-symlink directory');
  }
  return realpathSync(requestedRoot);
}

export function inspectContainedPath(projectRoot, relativePath, finalType = 'file') {
  const normalized = String(relativePath).replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (!normalized || isAbsolute(normalized) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return { ok: false, reason: 'scope' };
  }

  let candidate = projectRoot;
  try {
    for (const [index, segment] of segments.entries()) {
      candidate = join(candidate, segment);
      const entry = lstatSync(candidate);
      if (entry.isSymbolicLink()) return { ok: false, reason: 'symlink', path: candidate };
      const expectedType = index === segments.length - 1 ? finalType : 'directory';
      if (expectedType === 'directory' ? !entry.isDirectory() : !entry.isFile()) {
        return { ok: false, reason: 'type', path: candidate };
      }
    }
    const realPath = realpathSync(candidate);
    if (!isContained(projectRoot, realPath)) return { ok: false, reason: 'scope', path: candidate };
    return { ok: true, path: candidate, realPath };
  } catch (error) {
    return { ok: false, reason: error?.code === 'ENOENT' ? 'missing' : 'io', path: candidate };
  }
}

export function isContained(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
