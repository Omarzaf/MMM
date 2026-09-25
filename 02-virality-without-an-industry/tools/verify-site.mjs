import {
  readFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chapters } from '../site/content/chapters/index.mjs';
import { cases } from '../site/data/cases.mjs';
import { figures } from '../site/data/figures.mjs';
import { liveSources } from '../site/data/research-additions.mjs';
import { DOWNLOADS, escapeHtml } from '../site/render/registry.mjs';
import { assetDefinitions, licenseUrlMatches } from './fetch-assets.mjs';
import { parseCsv } from './lib/csv.mjs';
import { elementRanges, tokenizeHtml, visibleHtmlText } from './lib/html-tokenizer.mjs';
import { countBy, loadResearchModel, normalizeStarterSource } from './lib/research-model.mjs';
import { inspectContainedPath, resolveRegularProjectRoot } from './lib/safe-files.mjs';

const CANONICAL_NAME = 'pakistan_music_research_package.html';
const MIRROR_NAME = 'pakistan_music_research_package (1).html';
const BRIEF_PATH = join('docs', 'superpowers', 'specs', '2026-08-23-hiphop-pakistan-live-research-brief.md');
const EXPECTED_CHAPTERS = Object.freeze(['00', '01', '02', '03', '04', '05', '06', '07', '08']);
const EXPECTED_CASE_VIEWS = Object.freeze(['circulation', 'rights', 'missingEvidence']);
const UNESCO_WARNINGS = Object.freeze([
  'Purposive sample',
  'n=50 music respondents',
  'all respondents male',
  'not nationally representative',
]);
const SPOTIFY_LIMITATION = 'Spotify-reported activity; no absolute denominators; not industry revenue.';
const EXPECTED_SOURCE_FAMILIES = Object.freeze({
  Scholarship: 13,
  'Platform / industry first-party': 12,
  Journalism: 8,
  'Official / primary': 8,
  'Civil society / monitoring': 1,
});
const IMAGE_FIELDS = Object.freeze([
  'id',
  'creator',
  'filePage',
  'sourceUrl',
  'date',
  'license',
  'licenseUrl',
  'modifications',
  'rightsCheckedOn',
  'status',
  'alt',
  'width',
  'height',
  'variants',
]);
const VARIANT_FIELDS = Object.freeze(['path', 'requestedWidth', 'width', 'height', 'sourceUrl', 'bytes']);
const BANNED_IMAGE_SUBJECTS = Object.freeze(['Talha Anjum', 'Young Stunners', 'Hasan Raheem', 'Eva B']);
const EXPECTED_CASE_IDS = Object.freeze([
  'lyari-underground',
  'eva-b',
  'abid-brohi',
  'shae-gill',
  'young-stunners',
  'abdullah-siddiqui',
  'arooj-aftab',
]);
const EXPECTED_CONTACT_IMAGE_IDS = Object.freeze([
  'mizraab-coke-studio',
  'radio-pakistan-building',
  'cell-towers-punjab',
]);
const APPROVED_MODIFICATIONS = 'Commons thumbnail resize only; no crop or color grade';
const APPROVED_RIGHTS_DATE = '2026-08-23';
const RUNTIME_ATTRIBUTES = Object.freeze({
  html: ['manifest'],
  body: ['background'],
  script: ['src', 'href', 'xlink:href'],
  link: ['href'],
  a: ['ping'],
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  iframe: ['src'],
  frame: ['src'],
  embed: ['src'],
  object: ['data'],
  input: ['src', 'formaction'],
  button: ['formaction'],
  form: ['action'],
  table: ['background'],
  td: ['background'],
  th: ['background'],
  bgsound: ['src'],
  applet: ['archive', 'code', 'codebase', 'object'],
  image: ['href', 'xlink:href'],
  use: ['href', 'xlink:href'],
  feimage: ['href', 'xlink:href'],
});

export const FORBIDDEN_PHRASES = Object.freeze([
  "Pakistan's music industry is worth",
  'streams equal artist income',
  'the National Music Policy is fully implemented',
  "Eva B is Pakistan's first female rapper",
  'the 360-track dataset shows',
  'the artist dataset proves',
]);

export function findForbiddenClaims(html) {
  const haystack = visibleHtmlText(html).toLocaleLowerCase('en');
  return FORBIDDEN_PHRASES.filter((phrase) => haystack.includes(phrase.toLocaleLowerCase('en')));
}

export function extractMarkdownUrls(markdown) {
  const text = String(markdown);
  const urls = [];
  const seen = new Set();
  let cursor = 0;

  while (cursor < text.length) {
    const opener = text.indexOf('](', cursor);
    if (opener < 0) break;
    let index = opener + 2;
    while (/\s/u.test(text[index] ?? '')) index += 1;
    let destination = '';

    if (text[index] === '<') {
      index += 1;
      while (index < text.length && text[index] !== '>') destination += text[index++];
      cursor = index + 1;
    } else {
      let depth = 0;
      let escaped = false;
      for (; index < text.length; index += 1) {
        const character = text[index];
        if (escaped) {
          destination += character;
          escaped = false;
          continue;
        }
        if (character === '\\') {
          escaped = true;
          continue;
        }
        if (character === '(') {
          depth += 1;
          destination += character;
          continue;
        }
        if (character === ')') {
          if (depth === 0) break;
          depth -= 1;
          destination += character;
          continue;
        }
        if (/\s/u.test(character) && depth === 0) break;
        destination += character;
      }
      cursor = index + 1;
    }

    if (/^https?:\/\//iu.test(destination) && !seen.has(destination)) {
      seen.add(destination);
      urls.push(destination);
    }
  }

  return urls;
}

export function verifySite(rootDir) {
  try {
    const projectRoot = resolveRoot(rootDir);
    const research = loadVerificationResearch(projectRoot);
    const images = JSON.parse(readFileSync(join(projectRoot, 'assets', 'hiphop-pakistan', 'manifest.json'), 'utf8'));
    const authoritativePropositions = parseCsv(readFileSync(join(projectRoot, 'proposition_matrix.csv'), 'utf8'));
    return verifyPackageData({
      rootDir: projectRoot,
      research,
      chapters,
      images,
      html: readFileSync(join(projectRoot, CANONICAL_NAME)),
      mirrorHtml: readFileSync(join(projectRoot, MIRROR_NAME)),
      briefMarkdown: readFileSync(join(projectRoot, BRIEF_PATH), 'utf8'),
      authoritativePropositions,
    });
  } catch (error) {
    return [namedError('VERIFICATION_IO_ERROR', errorMessage(error))];
  }
}

export function verifyPackageData(input) {
  const errors = [];
  try {
    const rootDir = resolveRoot(input?.rootDir);
    const research = input?.research ?? {};
    const chapterRecords = Array.isArray(input?.chapters) ? input.chapters : [];
    const images = Array.isArray(input?.images) ? input.images : [];
    const htmlBuffer = toBuffer(input?.html);
    const mirrorBuffer = toBuffer(input?.mirrorHtml);
    const html = htmlBuffer.toString('utf8');
    const tokens = tokenizeHtml(html);
    const authoritativePropositions = Array.isArray(input?.authoritativePropositions)
      ? input.authoritativePropositions
      : [];

    verifyPackageFiles(rootDir, errors);
    verifySourceTotals(research, html, tokens, errors);
    verifySourceIdentityAndUrls(research, errors);
    verifyPropositions(research, authoritativePropositions, html, tokens, errors);
    verifyEvidenceWarnings(html, errors);
    verifyParagraphEvidence(chapterRecords, research, errors);
    verifyBriefCoverage(input?.briefMarkdown, research, images, errors);
    verifyHtmlLinks(rootDir, html, tokens, errors);
    verifyImages(rootDir, images, chapterRecords, html, tokens, errors);
    verifyChapters(chapterRecords, html, errors);
    verifyCases(research.cases, html, tokens, errors);

    for (const phrase of findForbiddenClaims(html)) {
      errors.push(namedError('FORBIDDEN_CLAIM', phrase));
    }
    if (!htmlBuffer.equals(mirrorBuffer)) {
      errors.push(namedError('HTML_OUTPUT_MISMATCH', 'canonical and mirror bytes differ'));
    }
  } catch (error) {
    errors.push(namedError('VERIFICATION_INTERNAL_ERROR', errorMessage(error)));
  }
  return errors;
}

function loadVerificationResearch(rootDir) {
  try {
    return loadResearchModel(rootDir);
  } catch {
    const starterSources = parseCsv(readFileSync(join(rootDir, 'source_map.csv'), 'utf8')).map(normalizeStarterSource);
    const propositions = parseCsv(readFileSync(join(rootDir, 'proposition_matrix.csv'), 'utf8'));
    const fieldworkSchedule = parseCsv(readFileSync(join(rootDir, 'fieldwork_schedule.csv'), 'utf8'));
    return {
      starterSources,
      liveSources,
      allSources: [...starterSources, ...liveSources],
      propositions,
      fieldworkSchedule,
      figures,
      cases,
      sourceFamilyCounts: countBy(starterSources, 'evidenceFamily'),
      qualityTierCounts: countBy(starterSources, 'qualityTier'),
    };
  }
}

function verifyPackageFiles(rootDir, errors) {
  let projectRoot;
  try {
    projectRoot = resolveRegularProjectRoot(rootDir);
  } catch (error) {
    errors.push(namedError('SYMLINKED_LOCAL_TARGET', errorMessage(error)));
    return;
  }
  const assetRoot = inspectContainedPath(projectRoot, 'assets/hiphop-pakistan', 'directory');
  if (!assetRoot.ok) {
    errors.push(namedError('UNSAFE_ASSET_ROOT', assetRoot.reason));
  }
  for (const relativePath of [CANONICAL_NAME, MIRROR_NAME, ...DOWNLOADS]) {
    const inspection = inspectContainedPath(projectRoot, relativePath, 'file');
    if (!inspection.ok) {
      const code = inspection.reason === 'symlink' ? 'SYMLINKED_LOCAL_TARGET' : 'MISSING_LOCAL_TARGET';
      errors.push(namedError(code, relativePath));
    }
  }
}

function verifySourceTotals(research, html, tokens, errors) {
  const starterSources = Array.isArray(research.starterSources) ? research.starterSources : [];
  const allSources = Array.isArray(research.allSources) ? research.allSources : [];
  if (starterSources.length !== 42) {
    errors.push(namedError('STARTER_SOURCE_TOTAL', `expected 42; received ${starterSources.length}`));
  }

  const familyCounts = countBy(starterSources, 'evidenceFamily');
  const cachedCounts = research.sourceFamilyCounts && typeof research.sourceFamilyCounts === 'object'
    ? research.sourceFamilyCounts
    : {};
  const familyTotal = Object.values(familyCounts).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const exactFamilies = Object.entries(EXPECTED_SOURCE_FAMILIES)
    .every(([family, expected]) => familyCounts[family] === expected);
  const cachedMatches = Object.keys(EXPECTED_SOURCE_FAMILIES).length === Object.keys(cachedCounts).length
    && Object.entries(familyCounts).every(([family, total]) => cachedCounts[family] === total);
  if (familyTotal !== 42 || !exactFamilies || !cachedMatches) {
    errors.push(namedError('SOURCE_FAMILY_TOTAL', `expected approved families totaling 42; received ${familyTotal}`));
  }

  const renderedSources = renderedSourceRows(html, tokens);
  if (allSources.length !== 76 || renderedSources.length !== 76) {
    errors.push(namedError('EXPANDED_SOURCE_TOTAL', `expected 76 model and rendered sources; received ${allSources.length} and ${renderedSources.length}`));
  }
  const renderedIds = renderedSources.map((row) => row.sourceId);
  const renderedDomIds = renderedSources.map((row) => row.domId);
  const renderedUrls = renderedSources.map((row) => row.url).filter(Boolean);
  const unique = new Set(renderedIds).size === renderedSources.length
    && new Set(renderedDomIds).size === renderedSources.length
    && new Set(renderedUrls).size === renderedSources.length;
  const bound = renderedSources.length === allSources.length && renderedSources.every((row, index) => {
    const source = allSources[index];
    return row.sourceId === source?.sourceId
      && row.domId === `source-${source?.sourceId}`
      && row.url === safeCanonicalUrl(source?.url);
  });
  if (!unique || !bound) {
    errors.push(namedError('RENDERED_SOURCE_BINDING', 'rendered source IDs, DOM IDs, and URLs must uniquely match model order'));
  }
}

function verifySourceIdentityAndUrls(research, errors) {
  const sources = Array.isArray(research.allSources) ? research.allSources : [];
  const ids = new Set();
  const urls = new Set();
  for (const source of sources) {
    const sourceId = source?.sourceId;
    if (typeof sourceId !== 'string' || sourceId.length === 0 || ids.has(sourceId)) {
      errors.push(namedError('DUPLICATE_SOURCE_ID', String(sourceId ?? 'missing')));
    } else {
      ids.add(sourceId);
    }

    const canonical = safeCanonicalUrl(source?.url);
    if (!canonical) {
      errors.push(namedError('UNSAFE_EXTERNAL_URL', `${sourceId ?? 'unknown'} source URL`));
    } else if (urls.has(canonical)) {
      errors.push(namedError('DUPLICATE_SOURCE_URL', canonical));
    } else {
      urls.add(canonical);
    }
  }
}

function renderedSourceRows(html, tokens) {
  return elementRanges(html, tokens, 'article', ({ attrs }) => hasClass(attrs.class, 'source-entry')).map((range) => {
    const sourceLink = tokens.find((token) => token.type === 'start'
      && token.tag === 'a'
      && token.start > range.startToken.end
      && token.end < range.endToken.start
      && hasClass(token.attrs.class, 'external-source'));
    return {
      sourceId: range.startToken.attrs['data-source-id'] ?? '',
      domId: range.startToken.attrs.id ?? '',
      url: safeCanonicalUrl(sourceLink?.attrs.href),
    };
  });
}

function verifyPropositions(research, authoritative, html, tokens, errors) {
  const propositions = Array.isArray(research.propositions) ? research.propositions : [];
  const rendered = elementRanges(html, tokens, 'details', ({ attrs }) => hasClass(attrs.class, 'proposition'));
  if (authoritative.length !== 7 || propositions.length !== 7 || rendered.length !== 7) {
    errors.push(namedError('PROPOSITION_TEXT_DRIFT', `expected seven authoritative, model, and rendered propositions; received ${authoritative.length}, ${propositions.length}, and ${rendered.length}`));
    return;
  }
  authoritative.forEach((expected, index) => {
    const actual = propositions[index];
    const exact = actual?.proposition_id === expected.proposition_id
      && actual?.proposition === expected.proposition;
    const row = rendered[index];
    const rowTokens = tokenizeHtml(row?.html ?? '');
    const strong = elementRanges(row?.html ?? '', rowTokens, 'strong')[0];
    const renderedText = strong ? visibleHtmlText(strong.html) : '';
    if (!exact || row?.startToken.attrs['data-proposition'] !== expected.proposition_id || renderedText !== expected.proposition) {
      errors.push(namedError('PROPOSITION_TEXT_DRIFT', expected.proposition_id));
    }
  });
}

function verifyEvidenceWarnings(html, errors) {
  const livelihood = figureMarkup(html, 'livelihood-snapshot').toLocaleLowerCase('en');
  for (const warning of UNESCO_WARNINGS) {
    if (!livelihood.includes(warning.toLocaleLowerCase('en'))) {
      errors.push(namedError('MISSING_UNESCO_WARNING', warning));
    }
  }
  const spotify = figureMarkup(html, 'spotify-pulse').toLocaleLowerCase('en');
  if (!spotify.includes(SPOTIFY_LIMITATION.toLocaleLowerCase('en'))) {
    errors.push(namedError('MISSING_SPOTIFY_LIMITATION', SPOTIFY_LIMITATION));
  }
}

function figureMarkup(html, figureId) {
  const marker = `data-figure="${figureId}"`;
  const markerIndex = html.indexOf(marker);
  const start = markerIndex < 0 ? -1 : html.lastIndexOf('<figure', markerIndex);
  const end = markerIndex < 0 ? -1 : html.indexOf('</figure>', markerIndex);
  return start >= 0 && end > markerIndex ? html.slice(start, end) : '';
}

function verifyParagraphEvidence(chapterRecords, research, errors) {
  const sourceIndex = new Map((Array.isArray(research.allSources) ? research.allSources : [])
    .map((source) => [source.sourceId, source]));
  for (const chapter of chapterRecords) {
    const blocks = Array.isArray(chapter?.blocks) ? chapter.blocks : [];
    for (const [index, block] of blocks.entries()) {
      if (block?.kind !== 'paragraph') continue;
      const label = `${chapter.number ?? '??'} paragraph ${index + 1}`;
      const sourceIds = Array.isArray(block.sourceIds) ? block.sourceIds : [];
      if (block.claimMode === 'synthesis' && sourceIds.length < 2) {
        errors.push(namedError('SYNTHESIS_SOURCE_COUNT', label));
      }
      if (typeof block.claimMode !== 'string' || block.claimMode.length === 0) {
        errors.push(namedError('EXPLICIT_CLAIM_MODE', label));
        continue;
      }
      if (sourceIds.length >= 2 && block.claimMode !== 'synthesis') {
        errors.push(namedError('EXPLICIT_CLAIM_MODE', `${label} must declare synthesis for multiple sources`));
      }
      if (sourceIds.length === 1) {
        const source = sourceIndex.get(sourceIds[0]);
        if (!source) {
          errors.push(namedError('EXPLICIT_CLAIM_MODE', `${label} cites unknown source ${sourceIds[0]}`));
          continue;
        }
        const expectedMode = source.evidenceFamily === 'Official / primary'
          ? 'single-primary'
          : source.evidenceFamily === 'Platform / industry first-party'
            ? 'first-party-attributed'
            : null;
        if (expectedMode && block.claimMode !== expectedMode) {
          errors.push(namedError('EXPLICIT_CLAIM_MODE', `${label} must declare ${expectedMode} for ${sourceIds[0]}`));
        }
        if (['single-primary', 'first-party-attributed'].includes(block.claimMode) && block.claimMode !== expectedMode) {
          errors.push(namedError('EXPLICIT_CLAIM_MODE', `${label} claim mode does not match ${sourceIds[0]} metadata`));
        }
      } else if (['single-primary', 'first-party-attributed'].includes(block.claimMode)) {
        errors.push(namedError('EXPLICIT_CLAIM_MODE', `${label} must cite exactly one source`));
      }
    }
  }
}

function verifyBriefCoverage(briefMarkdown, research, images, errors) {
  const represented = new Set();
  for (const source of Array.isArray(research.allSources) ? research.allSources : []) {
    const canonical = safeCanonicalUrl(source?.url);
    if (canonical) represented.add(canonical);
  }
  for (const image of images) {
    const canonical = safeCanonicalUrl(image?.filePage);
    if (canonical) represented.add(canonical);
  }

  for (const url of extractMarkdownUrls(briefMarkdown ?? '')) {
    const canonical = safeCanonicalUrl(url);
    if (!canonical) {
      errors.push(namedError('UNSAFE_EXTERNAL_URL', `research brief URL ${url}`));
    } else if (!represented.has(canonical)) {
      errors.push(namedError('UNREPRESENTED_BRIEF_URL', url));
    }
  }
}

function verifyHtmlLinks(rootDir, html, tokens, errors) {
  const localTargets = [];

  for (const token of tokens.filter(({ type }) => type === 'start')) {
    if (token.tag === 'base') {
      errors.push(namedError('EXTERNAL_RUNTIME_ASSET', 'base element'));
    }
    if (token.tag === 'meta'
      && String(token.attrs['http-equiv'] ?? '').trim().toLocaleLowerCase('en') === 'refresh') {
      errors.push(namedError('EXTERNAL_RUNTIME_ASSET', 'meta refresh'));
    }

    const runtimeNames = new Set(RUNTIME_ATTRIBUTES[token.tag] ?? []);
    for (const name of runtimeNames) {
      if (!Object.hasOwn(token.attrs, name)) continue;
      const values = name === 'srcset' ? parseSrcset(token.attrs[name]) : [token.attrs[name]];
      for (const candidate of values) auditRuntimeReference(candidate, `${token.tag} ${name}`, localTargets, errors);
    }

    for (const name of ['href', 'src', 'srcset', 'poster', 'data']) {
      if (runtimeNames.has(name) || !Object.hasOwn(token.attrs, name)) continue;
      const values = name === 'srcset' ? parseSrcset(token.attrs[name]) : [token.attrs[name]];
      for (const candidate of values) auditDocumentReference(candidate, `${token.tag} ${name}`, localTargets, errors);
    }
  }

  for (const range of elementRanges(html, tokens, 'style')) {
    auditCss(html.slice(range.startToken.end, range.endToken.start), localTargets, errors);
  }
  for (const token of tokens.filter(({ type, attrs }) => type === 'start' && Object.hasOwn(attrs, 'style'))) {
    auditCss(token.attrs.style, localTargets, errors);
  }

  for (const target of localTargets) verifyLocalTarget(rootDir, target, errors);

  const renderedDownloads = tokens
    .filter(({ type, tag, attrs }) => type === 'start' && tag === 'a' && Object.hasOwn(attrs, 'data-download'))
    .map(({ attrs }) => [attrs['data-download'], String(attrs.href ?? '').replace(/^\//u, '')]);
  const exactDownloadSet = renderedDownloads.length === DOWNLOADS.length
    && DOWNLOADS.every((filename) => renderedDownloads.some(([declared, href]) => declared === filename && href === filename));
  if (!exactDownloadSet) {
    errors.push(namedError('LOCAL_DOWNLOAD_SET', `expected exactly ${DOWNLOADS.length} root downloads`));
  }
}

function verifyLocalTarget(rootDir, rawTarget, errors) {
  const normalized = normalizeLocalReference(rawTarget);
  if (!normalized || !isAllowedLocalTarget(normalized)) {
    errors.push(namedError('OUT_OF_SCOPE_LOCAL_TARGET', rawTarget));
    return;
  }
  const inspection = inspectContainedPath(resolve(rootDir), normalized, 'file');
  if (!inspection.ok) {
    if (inspection.reason === 'symlink') errors.push(namedError('SYMLINKED_LOCAL_TARGET', normalized));
    else if (inspection.reason === 'missing') errors.push(namedError('MISSING_LOCAL_TARGET', normalized));
    else errors.push(namedError('OUT_OF_SCOPE_LOCAL_TARGET', normalized));
  }
}

function auditRuntimeReference(rawValue, label, localTargets, errors) {
  const candidate = String(rawValue).trim();
  if (!candidate || candidate.startsWith('#')) return;
  const classified = uriClassificationValue(candidate);
  if (isExternalReference(classified) || hasNonHttpScheme(classified)) {
    errors.push(namedError('EXTERNAL_RUNTIME_ASSET', label));
    return;
  }
  localTargets.push(candidate);
}

function auditDocumentReference(rawValue, label, localTargets, errors) {
  const candidate = String(rawValue).trim();
  if (!candidate || candidate.startsWith('#')) return;
  const classified = uriClassificationValue(candidate);
  if (isExternalReference(classified)) {
    const absolute = classified.startsWith('//') ? `https:${classified}` : classified;
    if (!safeCanonicalUrl(absolute)) {
      errors.push(namedError('UNSAFE_EXTERNAL_URL', label));
    }
    return;
  }
  if (hasNonHttpScheme(classified)) {
    if (!/^(?:data|mailto|tel):/iu.test(classified)) errors.push(namedError('UNSAFE_EXTERNAL_URL', label));
    return;
  }
  localTargets.push(candidate);
}

function auditCss(css, localTargets, errors) {
  const normalized = String(css).replace(/\/\*[\s\S]*?\*\//gu, ' ');
  if (/@import\b/iu.test(normalized)) {
    errors.push(namedError('EXTERNAL_RUNTIME_ASSET', 'CSS @import'));
  }
  for (const match of normalized.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/giu)) {
    const candidate = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!candidate || candidate.startsWith('#')) continue;
    const classified = uriClassificationValue(candidate);
    if (isExternalReference(classified) || hasNonHttpScheme(classified)) {
      errors.push(namedError('EXTERNAL_RUNTIME_ASSET', 'CSS url()'));
    } else {
      localTargets.push(candidate);
    }
  }
}

function uriClassificationValue(value) {
  return String(value).replace(/[\u0000-\u0020\u007f]+/gu, '');
}

function parseSrcset(value) {
  const source = String(value);
  const urls = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (cursor < source.length && /[\s,]/u.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;
    const start = cursor;
    const dataUrl = source.slice(cursor).toLocaleLowerCase('en').startsWith('data:');
    while (cursor < source.length && !/\s/u.test(source[cursor]) && (dataUrl || source[cursor] !== ',')) cursor += 1;
    const candidate = source.slice(start, cursor).replace(/,+$/u, '');
    if (candidate) urls.push(candidate);
    while (cursor < source.length && source[cursor] !== ',') cursor += 1;
    if (cursor < source.length) cursor += 1;
  }
  return urls;
}

function normalizeLocalReference(value) {
  const raw = String(value).trim().split(/[?#]/u, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  decoded = decoded.replace(/^\/+/, '');
  const segments = decoded.split('/');
  if (!decoded || decoded.includes('\\') || decoded.includes('\0') || segments.some((segment) => segment === '.' || segment === '..')) return null;
  return decoded;
}

function verifyImages(rootDir, images, chapterRecords, html, tokens, errors) {
  if (images.length !== 10) {
    errors.push(namedError('IMAGE_METADATA_INCOMPLETE', `expected 10 manifest records; received ${images.length}`));
  }

  const imageIds = new Set();
  const variantPaths = new Set();
  for (const [index, image] of images.entries()) {
    const label = image?.id ?? `image ${index + 1}`;
    const approved = assetDefinitions[index];
    const identityValid = Boolean(approved)
      && image?.id === approved.id
      && image?.filePage === `https://commons.wikimedia.org/wiki/${approved.commonsTitle}`
      && image?.status === approved.status
      && image?.alt === approved.alt;
    if (!identityValid) errors.push(namedError('IMAGE_IDENTITY_DRIFT', label));
    const rightsValid = licenseUrlMatches(image?.license, image?.licenseUrl)
      && image?.modifications === APPROVED_MODIFICATIONS
      && image?.rightsCheckedOn === APPROVED_RIGHTS_DATE
      && isApprovedCommonsSourceUrl(image?.sourceUrl);
    if (!rightsValid) errors.push(namedError('IMAGE_RIGHTS_INVALID', label));
    for (const subject of BANNED_IMAGE_SUBJECTS) {
      if (String(image?.alt ?? '').toLocaleLowerCase('en').includes(subject.toLocaleLowerCase('en'))) {
        errors.push(namedError('UNLICENSED_IMAGE_SUBJECT', subject));
      }
    }

    let complete = Boolean(image) && IMAGE_FIELDS.every((field) => hasValue(image[field]));
    let variantsBound = true;
    complete &&= !imageIds.has(image.id);
    if (typeof image?.id === 'string') imageIds.add(image.id);
    complete &&= isPositiveInteger(image.width) && isPositiveInteger(image.height);
    complete &&= Boolean(safeCanonicalUrl(image.filePage));
    complete &&= Boolean(safeCanonicalUrl(image.sourceUrl));
    complete &&= Boolean(safeCanonicalUrl(image.licenseUrl));
    const variantKeys = image?.variants && typeof image.variants === 'object'
      ? Object.keys(image.variants).sort()
      : [];
    complete &&= variantKeys.length === 2 && variantKeys[0] === '1800' && variantKeys[1] === '960';

    for (const size of ['960', '1800']) {
      const variant = image?.variants?.[size];
      complete &&= Boolean(variant) && VARIANT_FIELDS.every((field) => hasValue(variant?.[field]));
      complete &&= variant?.requestedWidth === Number(size);
      complete &&= isPositiveInteger(variant?.width) && isPositiveInteger(variant?.height);
      complete &&= isPositiveInteger(variant?.bytes);
      complete &&= isApprovedCommonsSourceUrl(variant?.sourceUrl);
      complete &&= typeof variant?.path === 'string'
        && new RegExp(`^assets/hiphop-pakistan/[a-z0-9]+(?:-[a-z0-9]+)*-${size}\\.(?:jpe?g|png)$`, 'u').test(variant.path);
      variantsBound &&= variant?.path === `assets/hiphop-pakistan/${image?.id}-${size}.jpg`;
      complete &&= !variantPaths.has(variant?.path);
      if (typeof variant?.path === 'string') variantPaths.add(variant.path);
      if (isPositiveInteger(image?.width) && isPositiveInteger(image?.height)
        && isPositiveInteger(variant?.width) && isPositiveInteger(variant?.height)) {
        complete &&= Math.abs((variant.width / variant.height) - (image.width / image.height)) < 0.01;
      }
      if (typeof variant?.path === 'string') {
        const inspection = inspectContainedPath(resolve(rootDir), variant.path, 'file');
        if (!inspection.ok) {
          complete = false;
          if (inspection.reason === 'symlink') {
            errors.push(namedError('SYMLINKED_IMAGE_VARIANT', variant.path));
          }
        } else {
          try {
            const bytes = readFileSync(inspection.realPath);
          const dimensions = readImageDimensions(bytes);
            complete &&= bytes.length === variant.bytes;
            complete &&= dimensions.width === variant.width && dimensions.height === variant.height;
          } catch {
            complete = false;
          }
        }
      }
    }

    if (!variantsBound) errors.push(namedError('IMAGE_VARIANT_BINDING', label));
    if (!complete) errors.push(namedError('IMAGE_METADATA_INCOMPLETE', label));
  }
  verifyImageRenderBinding(images, chapterRecords, html, tokens, errors);
}

function verifyImageRenderBinding(images, chapterRecords, html, tokens, errors) {
  const chapterImageIds = chapterRecords.flatMap((chapter) => (Array.isArray(chapter?.blocks) ? chapter.blocks : []))
    .filter((block) => block?.kind === 'contact-sheet')
    .flatMap((block) => Array.isArray(block.imageIds) ? block.imageIds : []);
  const frames = elementRanges(html, tokens, 'figure', ({ attrs }) => hasClass(attrs.class, 'contact-frame'));
  const renderedImageTokens = tokens.filter(({ type, attrs }) => type === 'start' && Object.hasOwn(attrs, 'data-image'));
  const renderedImageIds = frames.map(({ startToken }) => startToken.attrs['data-image'] ?? '');
  const manifestIndex = new Map(images.map((image) => [image?.id, image]));
  let complete = arrayEquals(chapterImageIds, EXPECTED_CONTACT_IMAGE_IDS)
    && arrayEquals(renderedImageIds, chapterImageIds)
    && renderedImageTokens.length === frames.length
    && new Set(chapterImageIds).size === chapterImageIds.length;

  for (const [index, frame] of frames.entries()) {
    const image = manifestIndex.get(chapterImageIds[index]);
    if (!image) {
      complete = false;
      continue;
    }
    const frameTokens = tokens.filter((token) => token.type === 'start'
      && token.start > frame.startToken.end
      && token.end < frame.endToken.start);
    const sources = frameTokens.filter(({ tag }) => tag === 'source');
    const imageTags = frameTokens.filter(({ tag }) => tag === 'img');
    const srcset = sources.length === 1 ? parseSrcset(sources[0].attrs.srcset ?? '') : [];
    complete &&= imageTags.length === 1
      && imageTags[0].attrs.src === image.variants?.['960']?.path
      && arrayEquals(srcset, [image.variants?.['960']?.path, image.variants?.['1800']?.path]);
  }

  const credits = tokens
    .filter(({ type, attrs }) => type === 'start' && Object.hasOwn(attrs, 'data-photo-credit'))
    .map(({ attrs }) => attrs['data-photo-credit']);
  complete &&= arrayEquals(credits, images.map((image) => image?.id));
  if (!complete) {
    errors.push(namedError('IMAGE_RENDER_BINDING', 'manifest, chapter image IDs, rendered frames, variants, and credits must match one-to-one'));
  }
}

function isApprovedCommonsSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['commons.wikimedia.org', 'upload.wikimedia.org'].includes(url.hostname);
  } catch {
    return false;
  }
}

function verifyChapters(chapterRecords, html, errors) {
  const numbers = chapterRecords.map((chapter) => chapter?.number);
  const renderedNumbers = [...html.matchAll(/\bdata-chapter="(0[0-8])"/gu)].map((match) => match[1]);
  if (!arrayEquals(numbers, EXPECTED_CHAPTERS) || !arrayEquals(renderedNumbers, EXPECTED_CHAPTERS)) {
    errors.push(namedError('MISSING_CHAPTER', `expected ${EXPECTED_CHAPTERS.join(', ')}`));
  }

  const conclusionCount = countMatches(html, /class="chapter-conclusion"/gu);
  const establishesCount = countMatches(html, /<h3>What this establishes<\/h3>/gu);
  const unknownCount = countMatches(html, /<h3>What remains unknown<\/h3>/gu);
  let complete = conclusionCount === 9 && establishesCount === 9 && unknownCount === 9;
  for (const chapter of chapterRecords) {
    complete &&= typeof chapter?.establishes === 'string' && chapter.establishes.trim().length > 0;
    complete &&= typeof chapter?.unknown === 'string' && chapter.unknown.trim().length > 0;
    if (typeof chapter?.establishes === 'string') complete &&= html.includes(escapeHtml(chapter.establishes));
    if (typeof chapter?.unknown === 'string') complete &&= html.includes(escapeHtml(chapter.unknown));
  }
  if (!complete) errors.push(namedError('MISSING_CHAPTER_CONCLUSION', 'expected nine establishes/unknown conclusion pairs'));
}

function verifyCases(caseRecords, html, tokens, errors) {
  const records = Array.isArray(caseRecords) ? caseRecords : [];
  const renderedCases = elementRanges(html, tokens, 'article', ({ attrs }) => hasClass(attrs.class, 'case-pathway'));
  const recordIds = records.map((caseStudy) => caseStudy?.id);
  const renderedIds = renderedCases.map(({ startToken }) => startToken.attrs['data-case']);
  let complete = arrayEquals(recordIds, EXPECTED_CASE_IDS)
    && arrayEquals(renderedIds, EXPECTED_CASE_IDS)
    && new Set(recordIds).size === EXPECTED_CASE_IDS.length;
  for (const [index, caseStudy] of records.entries()) {
    const keys = caseStudy?.views && typeof caseStudy.views === 'object' ? Object.keys(caseStudy.views) : [];
    complete &&= arrayEquals(keys, EXPECTED_CASE_VIEWS);
    const article = renderedCases[index];
    const articleTokens = article
      ? tokens.filter((token) => token.type === 'start' && token.start > article.startToken.end && token.end < article.endToken.start)
      : [];
    for (const view of EXPECTED_CASE_VIEWS) {
      complete &&= articleTokens.filter(({ attrs }) => attrs['data-case-view'] === view).length === 1;
    }
  }
  if (!complete) errors.push(namedError('MISSING_STATIC_CASE_VIEW', 'expected seven cases with circulation, rights, and missingEvidence views'));
}

function isExternalReference(value) {
  return /^(?:https?:)?\/\//iu.test(String(value).trim());
}

function hasNonHttpScheme(value) {
  return /^[a-z][a-z0-9+.-]*:/iu.test(String(value).trim());
}

function isAllowedLocalTarget(target) {
  return DOWNLOADS.includes(target) || target.startsWith('assets/hiphop-pakistan/');
}

function safeCanonicalUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, '');
    return url.href;
  } catch {
    return null;
  }
}

function readImageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }
  throw new Error('unsupported or malformed image bytes');
}

function hasValue(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function countMatches(value, pattern) {
  return String(value).match(pattern)?.length ?? 0;
}

function arrayEquals(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasClass(value, className) {
  return String(value ?? '').split(/\s+/u).includes(className);
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value ?? ''), 'utf8');
}

function namedError(code, detail) {
  return `${code}: ${detail}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function resolveRoot(rootDir) {
  if (typeof rootDir !== 'string' || rootDir.length === 0) throw new TypeError('rootDir must be a non-empty string');
  return resolve(rootDir);
}

function isDirectRun() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const errors = verifySite(process.cwd());
  if (errors.length === 0) {
    process.stdout.write('PASS\n');
  } else {
    errors.forEach((error) => process.stderr.write(`${error}\n`));
    process.exitCode = 1;
  }
}
