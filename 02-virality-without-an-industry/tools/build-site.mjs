import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chapters } from '../site/content/chapters/index.mjs';
import { renderDocument } from '../site/render/document.mjs';
import { loadResearchModel } from './lib/research-model.mjs';
import { resolveRegularProjectRoot } from './lib/safe-files.mjs';

const CANONICAL_NAME = 'pakistan_music_research_package.html';
const MIRROR_NAME = 'pakistan_music_research_package (1).html';

export function buildSite(rootDir) {
  const projectRoot = resolveRegularProjectRoot(rootDir);
  const research = loadResearchModel(projectRoot);
  const images = JSON.parse(readFileSync(join(projectRoot, 'assets', 'hiphop-pakistan', 'manifest.json'), 'utf8'));
  const fonts = normalizeNewlines(readFileSync(join(projectRoot, 'site', 'fonts.css'), 'utf8'));
  const styles = `${fonts}\n${normalizeNewlines(readFileSync(join(projectRoot, 'site', 'styles.css'), 'utf8'))}`;
  const interactions = normalizeNewlines(readFileSync(join(projectRoot, 'site', 'interactions.mjs'), 'utf8'));
  const rendered = renderDocument({ research, chapters, images, styles, interactions, rootDir: projectRoot });
  const output = Buffer.from(normalizeNewlines(rendered), 'utf8');
  const canonicalPath = join(projectRoot, CANONICAL_NAME);
  const mirrorPath = join(projectRoot, MIRROR_NAME);

  assertWritableOutput(canonicalPath);
  assertWritableOutput(mirrorPath);
  writeFileSync(canonicalPath, output);
  writeFileSync(mirrorPath, output);

  return { canonicalPath, mirrorPath, bytes: output.length };
}

function assertWritableOutput(outputPath) {
  try {
    const entry = lstatSync(outputPath);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new TypeError(`output path must be a regular non-symlink file: ${outputPath}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function normalizeNewlines(value) {
  return String(value).replace(/\r\n?/gu, '\n');
}

function isDirectRun() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  try {
    const result = buildSite(process.cwd());
    process.stdout.write(`Built ${result.bytes} bytes\n`);
  } catch (error) {
    process.stderr.write(`BUILD_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
