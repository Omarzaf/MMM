import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirectory = path.resolve(projectRoot, 'assets', 'hiphop-pakistan');
const tempDirectory = path.resolve(assetDirectory, '.tmp');
const defaultManifestPath = path.resolve(assetDirectory, 'manifest.json');
const apiEndpoint = 'https://commons.wikimedia.org/w/api.php';
const assetHosts = new Set(['commons.wikimedia.org', 'upload.wikimedia.org']);
const modifications = 'Commons thumbnail resize only; no crop or color grade';
const rightsCheckedOn = '2026-08-23';
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const assetDefinitions = [
  ['mizraab-coke-studio', 'File:Mizraab-cokestudio.jpg', 'Documentary photograph', 'Musicians performing on the Coke Studio set in 2011.'],
  ['arooj-aftab-le-poisson-rouge', 'File:Arooj_aftab_at_le_poisson_rouge.jpg', 'Documentary photograph', 'Arooj Aftab performing at Le Poisson Rouge in New York City in 2014.'],
  ['saif-samejo-music-mela', 'File:Saif_Samejo,_Music_Mela.jpg', 'Documentary photograph', 'Saif Samejo performing at Music Mela in 2015.'],
  ['shafqat-amanat-arts-council', 'File:Shafqat_Amanat_Ali_performing_in_Karachi_(2024).jpg', 'Documentary photograph', 'Shafqat Amanat Ali performing in Karachi in 2024.'],
  ['radio-pakistan-building', 'File:Radio_Pakistan_Building.jpg', 'Context photograph', 'The Radio Pakistan Building in Islamabad.'],
  ['alhamra-art-centre', 'File:Alhamra_Art_Centre.JPG', 'Context photograph', 'The exterior of Alhamra Art Centre in Lahore.'],
  ['cell-towers-punjab', 'File:Cell_Towers.jpg', 'Context photograph', 'Cell towers in Punjab.'],
  ['lyari-river-karachi', 'File:PK_Karachi_asv2020-02_img50_Lyari_River.jpg', 'Context photograph', 'The Lyari River running through Karachi.'],
  ['cholistan-musicians', 'File:Musicians_of_Cholistan_desert_performing_in_Derawar_Fort.jpg', 'Context photograph', 'Musicians performing at Derawar Fort in the Cholistan Desert.'],
  ['bhitt-shah-music', 'File:Bhitt_Shah_sindh_pakistan.jpg', 'Context photograph', 'Musicians performing at Bhitt Shah in Sindh.'],
].map(([id, commonsTitle, status, alt]) => ({ id, commonsTitle, status, alt }));

function textValue(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function containedPath(base, target, label) {
  const resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`${label} escapes its approved directory`);
  return resolved;
}

function validateDefinition(definition) {
  if (!definition || !safeSlug.test(definition.id ?? '')) throw new Error('definition ID must be a safe slug');
  const approved = assetDefinitions.find(({ id, commonsTitle, status }) => id === definition.id && commonsTitle === definition.commonsTitle && status === definition.status);
  if (!approved) throw new Error('definition is not an approved definition');
  return approved;
}

function stablePaths(definition, width) {
  const filename = `${definition.id}-${width}.jpg`;
  return {
    path: path.posix.join('assets', 'hiphop-pakistan', filename),
    finalPath: containedPath(assetDirectory, path.join(assetDirectory, filename), 'final asset path'),
    temporaryPath: containedPath(tempDirectory, path.join(tempDirectory, filename), 'temporary asset path'),
  };
}

function approvedHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an approved HTTPS URL`);
  }
  if (parsed.protocol !== 'https:' || !assetHosts.has(parsed.hostname)) throw new Error(`${label} must use approved HTTPS hosts`);
  return parsed;
}

function metadataValue(metadata, field) {
  return textValue(metadata?.[field]?.value);
}

function imageInfoFromPayload(payload) {
  const page = Object.values(payload?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0];
}

function apiUrl(title, width) {
  const parameters = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: String(width),
    titles: title,
  });
  return `${apiEndpoint}?${parameters}`;
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const commonsFetch = async (url, options = {}) => {
  for (const delay of [1000, 2000, 4000, 8000, 12000]) {
    await pause(delay);
    const response = await fetch(url, {
      ...options,
      redirect: 'manual',
      headers: { 'user-agent': 'HipHopPakistanEditorialAssetArchive/1.0 (local rights archive)', ...options.headers },
    });
    if (response.status !== 429) return response;
  }
  return fetch(url, {
    ...options,
    redirect: 'manual',
    headers: { 'user-agent': 'HipHopPakistanEditorialAssetArchive/1.0 (local rights archive)', ...options.headers },
  });
};

async function requestMetadata(definition, width, fetchImpl) {
  const requestedUrl = apiUrl(definition.commonsTitle, width);
  const response = await fetchImpl(requestedUrl, { redirect: 'manual' });
  if (!response.ok) throw new Error(`${definition.id}: Commons metadata request failed (${response.status})`);
  approvedHttpsUrl(response.url || requestedUrl, 'Commons metadata response URL');
  const info = imageInfoFromPayload(await response.json());
  if (!info) throw new Error(`${definition.id}: Commons returned no image metadata`);
  return info;
}

function expectedFilePage(definition) {
  return `https://commons.wikimedia.org/wiki/${definition.commonsTitle}`;
}

export function licenseUrlMatches(license, licenseUrl) {
  let parsed;
  try {
    parsed = new URL(licenseUrl);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (license === 'CC0') return parsed.hostname === 'creativecommons.org' && /^\/publicdomain\/zero\/1\.0(?:\/|$)/.test(parsed.pathname);
  const match = /^CC BY-SA (3\.0|4\.0)$/.exec(license);
  if (match) return parsed.hostname === 'creativecommons.org' && new RegExp(`^/licenses/by-sa/${match[1].replace('.', '\\.')}(?:/|$)`).test(parsed.pathname);
  return license === 'FAL' && ['artlibre.org', 'www.artlibre.org'].includes(parsed.hostname) && /^\/licence\/lal(?:\/|$)/.test(parsed.pathname);
}

function assertCompleteMetadata(definition, info) {
  const metadata = info.extmetadata;
  const entry = {
    creator: metadataValue(metadata, 'Artist'),
    date: metadataValue(metadata, 'DateTimeOriginal') || metadataValue(metadata, 'DateTime'),
    license: metadataValue(metadata, 'LicenseShortName'),
    licenseUrl: metadataValue(metadata, 'LicenseUrl'),
    filePage: textValue(info.descriptionurl) || metadataValue(metadata, 'DescriptionUrl'),
    sourceUrl: textValue(info.url),
    width: Number(info.width),
    height: Number(info.height),
  };
  for (const [field, value] of Object.entries(entry)) {
    if (!value || (typeof value === 'number' && value <= 0)) throw new Error(`${definition.id}: missing ${field} in Commons metadata`);
  }
  if (!['CC0', 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'FAL'].includes(entry.license)) throw new Error(`${definition.id}: unsupported Commons license ${entry.license}`);
  if (!licenseUrlMatches(entry.license, entry.licenseUrl)) throw new Error(`${definition.id}: license URL does not match declared license`);
  if (entry.filePage !== expectedFilePage(definition)) throw new Error(`${definition.id}: Commons file page does not match the approved title`);
  approvedHttpsUrl(entry.sourceUrl, 'Commons source URL');
  return entry;
}

function thumbnailUrl(info) {
  return approvedHttpsUrl(textValue(info.thumburl), 'Commons thumbnail URL').href;
}

function imageDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('downloaded image is not a JPEG');
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const segmentLength = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    if (segmentLength < 2) break;
    offset += segmentLength + 2;
  }
  throw new Error('downloaded JPEG has no dimensions');
}

function hasConsistentAspectRatio(dimensions, original) {
  return Math.abs((dimensions.width / dimensions.height) - (original.width / original.height)) < 0.01;
}

async function existingVariant(paths, width, original, sourceUrl) {
  const file = await stat(paths.finalPath).catch(() => null);
  if (!file?.size) return null;
  const bytes = new Uint8Array(await readFile(paths.finalPath));
  if (bytes.byteLength !== file.size) throw new Error(`${paths.path}: inconsistent local byte count`);
  const dimensions = imageDimensions(bytes);
  if (!hasConsistentAspectRatio(dimensions, original)) throw new Error(`${paths.path}: local aspect ratio does not match Commons metadata`);
  return { path: paths.path, requestedWidth: width, width: dimensions.width, height: dimensions.height, sourceUrl, bytes: file.size };
}

async function downloadThumbnail(definition, width, info, original, fetchImpl) {
  const sourceUrl = thumbnailUrl(info);
  const paths = stablePaths(definition, width);
  const existing = await existingVariant(paths, width, original, sourceUrl);
  if (existing) return existing;

  const response = await fetchImpl(sourceUrl, { redirect: 'manual' });
  if (!response.ok) throw new Error(`${definition.id}: ${width}px download failed (${response.status})`);
  approvedHttpsUrl(response.url || sourceUrl, 'Commons thumbnail response URL');
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`${definition.id}: ${width}px is not an image response`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error(`${definition.id}: ${width}px image has no bytes`);
  const dimensions = imageDimensions(bytes);
  if (!hasConsistentAspectRatio(dimensions, original)) throw new Error(`${definition.id}: ${width}px image aspect ratio does not match Commons metadata`);
  await writeFile(paths.temporaryPath, bytes);
  await rename(paths.temporaryPath, paths.finalPath);
  return { path: paths.path, requestedWidth: width, width: dimensions.width, height: dimensions.height, sourceUrl, bytes: bytes.byteLength };
}

async function duplicateThumbnail(definition, width, info, original, fromVariant) {
  const sourceUrl = thumbnailUrl(info);
  const paths = stablePaths(definition, width);
  const existing = await existingVariant(paths, width, original, sourceUrl);
  if (existing) return existing;
  const sourcePath = containedPath(assetDirectory, path.join(projectRoot, fromVariant.path), 'source variant path');
  await copyFile(sourcePath, paths.temporaryPath);
  await rename(paths.temporaryPath, paths.finalPath);
  return existingVariant(paths, width, original, sourceUrl);
}

/** Fetch, validate, and locally archive one exact approved Wikimedia Commons image. */
export async function fetchCommonsAsset(definition, fetchImpl = commonsFetch) {
  const approved = validateDefinition(definition);
  const info1800 = await requestMetadata(approved, 1800, fetchImpl);
  const provenance = assertCompleteMetadata(approved, info1800);
  const info960 = await requestMetadata(approved, 960, fetchImpl);
  await mkdir(tempDirectory, { recursive: true });
  const original = { width: provenance.width, height: provenance.height };
  const variants = {};
  variants['960'] = await downloadThumbnail(approved, 960, info960, original, fetchImpl);
  variants['1800'] = thumbnailUrl(info960) === thumbnailUrl(info1800)
    ? await duplicateThumbnail(approved, 1800, info1800, original, variants['960'])
    : await downloadThumbnail(approved, 1800, info1800, original, fetchImpl);
  return {
    id: approved.id,
    creator: provenance.creator,
    filePage: provenance.filePage,
    sourceUrl: provenance.sourceUrl,
    date: provenance.date,
    license: provenance.license,
    licenseUrl: provenance.licenseUrl,
    modifications,
    rightsCheckedOn,
    status: approved.status,
    alt: approved.alt,
    width: provenance.width,
    height: provenance.height,
    variants,
  };
}

export async function fetchAllAssets(fetchImpl = commonsFetch, { manifestPath = defaultManifestPath } = {}) {
  if (typeof manifestPath !== 'string' || path.basename(manifestPath) !== 'manifest.json') {
    throw new TypeError('manifestPath must target a manifest.json file');
  }
  const manifest = [];
  for (const definition of assetDefinitions) {
    console.log(`Fetching ${definition.id}`);
    manifest.push(await fetchCommonsAsset(definition, fetchImpl));
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(tempDirectory, { recursive: true, force: true });
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await fetchAllAssets();
  console.log(`Archived ${manifest.length} Commons images in ${assetDirectory}`);
}
