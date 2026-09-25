import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import manifest from '../assets/hiphop-pakistan/manifest.json' with { type: 'json' };
import { chapters } from '../site/content/chapters/index.mjs';
import { DOWNLOADS } from '../site/render/registry.mjs';
import { buildSite } from '../tools/build-site.mjs';
import {
  extractMarkdownUrls,
  findForbiddenClaims,
  verifyPackageData,
  verifySite,
} from '../tools/verify-site.mjs';
import { startPreviewServer } from '../tools/serve-preview.mjs';
import { parseCsv } from '../tools/lib/csv.mjs';
import { loadResearchModel } from '../tools/lib/research-model.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const canonicalName = 'pakistan_music_research_package.html';
const mirrorName = 'pakistan_music_research_package (1).html';
const briefPath = join(projectRoot, 'docs', 'superpowers', 'specs', '2026-08-23-hiphop-pakistan-live-research-brief.md');
const forbiddenPhrases = [
  "Pakistan's music industry is worth",
  'streams equal artist income',
  'the National Music Policy is fully implemented',
  "Eva B is Pakistan's first female rapper",
  'the 360-track dataset shows',
  'the artist dataset proves',
];
const activeTempRoots = new Set();

after(() => {
  for (const rootDir of activeTempRoots) removeTempRoot(rootDir);
});

function packageData(overrides = {}) {
  const research = structuredClone(overrides.research ?? loadResearchModel(projectRoot));
  const chapterData = structuredClone(overrides.chapters ?? chapters);
  const images = structuredClone(overrides.images ?? manifest);
  const html = overrides.html ?? readFileSync(join(projectRoot, canonicalName));
  const mirrorHtml = overrides.mirrorHtml ?? readFileSync(join(projectRoot, mirrorName));
  return {
    rootDir: overrides.rootDir ?? projectRoot,
    research,
    chapters: chapterData,
    images,
    html,
    mirrorHtml,
    briefMarkdown: overrides.briefMarkdown ?? readFileSync(briefPath, 'utf8'),
    authoritativePropositions: overrides.authoritativePropositions
      ?? parseCsv(readFileSync(join(projectRoot, 'proposition_matrix.csv'), 'utf8')),
  };
}

function errorCodes(errors) {
  return errors.map((error) => error.split(':', 1)[0]);
}

function assertCode(errors, code) {
  assert.ok(errorCodes(errors).includes(code), `${code}\n${errors.join('\n')}`);
}

function createFixture() {
  const rootDir = mkdtempSync(join(projectRoot, 'tests', '.task9-fixture-'));
  activeTempRoots.add(rootDir);
  try {
    for (const filename of DOWNLOADS) copyFileSync(join(projectRoot, filename), join(rootDir, filename));
    const fixtureAssetRoot = join(rootDir, 'assets', 'hiphop-pakistan');
    mkdirSync(fixtureAssetRoot, { recursive: true });
    const images = syntheticFixtureManifest();
    writeFileSync(join(fixtureAssetRoot, 'manifest.json'), `${JSON.stringify(images, null, 2)}\n`);
    for (const image of images) {
      for (const variant of Object.values(image.variants)) {
        writeFileSync(join(rootDir, variant.path), syntheticJpeg(variant.width, variant.height));
      }
    }
    mkdirSync(join(rootDir, 'site'), { recursive: true });
    copyFileSync(join(projectRoot, 'site', 'styles.css'), join(rootDir, 'site', 'styles.css'));
    copyFileSync(join(projectRoot, 'site', 'interactions.mjs'), join(rootDir, 'site', 'interactions.mjs'));
    copyFileSync(join(projectRoot, 'site', 'fonts.css'), join(rootDir, 'site', 'fonts.css'));
    // fonts.css points at package-local font files, so the fixture needs them too.
    const fontRoot = join(projectRoot, 'assets', 'hiphop-pakistan', 'fonts');
    mkdirSync(join(fixtureAssetRoot, 'fonts'), { recursive: true });
    for (const font of readdirSync(fontRoot)) copyFileSync(join(fontRoot, font), join(fixtureAssetRoot, 'fonts', font));
    mkdirSync(join(rootDir, 'docs', 'superpowers', 'specs'), { recursive: true });
    copyFileSync(briefPath, join(rootDir, 'docs', 'superpowers', 'specs', '2026-08-23-hiphop-pakistan-live-research-brief.md'));
    return rootDir;
  } catch (error) {
    removeFixture(rootDir);
    throw error;
  }
}

function removeFixture(rootDir) {
  removeTempRoot(rootDir);
}

function createOutsideRoot() {
  const rootDir = mkdtempSync(join(projectRoot, 'tests', '.task9-outside-'));
  activeTempRoots.add(rootDir);
  return rootDir;
}

function removeTempRoot(rootDir) {
  const allowedPrefixes = [
    join(projectRoot, 'tests', '.task9-fixture-'),
    join(projectRoot, 'tests', '.task9-outside-'),
  ];
  assert.ok(allowedPrefixes.some((prefix) => rootDir.startsWith(prefix)));
  try {
    rmSync(rootDir, { recursive: true, force: true });
  } finally {
    activeTempRoots.delete(rootDir);
  }
}

function syntheticFixtureManifest() {
  return structuredClone(manifest).map((image) => ({
    ...image,
    width: 1800,
    height: 1200,
    variants: {
      '960': {
        ...image.variants['960'],
        path: `assets/hiphop-pakistan/${image.id}-960.jpg`,
        requestedWidth: 960,
        width: 960,
        height: 640,
        bytes: 13,
      },
      '1800': {
        ...image.variants['1800'],
        path: `assets/hiphop-pakistan/${image.id}-1800.jpg`,
        requestedWidth: 1800,
        width: 1800,
        height: 1200,
        bytes: 13,
      },
    },
  }));
}

function syntheticJpeg(width, height) {
  const bytes = Buffer.alloc(13);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x09, 0x08]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}

function replaceHtml(data, mutate) {
  data.html = Buffer.from(mutate(data.html.toString('utf8')));
  data.mirrorHtml = Buffer.from(data.html);
  return data;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('builds deterministic byte-identical portable outputs without leaking machine state', () => {
  const rootDir = createFixture();
  try {
    const first = buildSite(rootDir);
    const canonical = readFileSync(join(rootDir, canonicalName));
    const mirror = readFileSync(join(rootDir, mirrorName));
    assert.deepEqual(first, {
      canonicalPath: join(rootDir, canonicalName),
      mirrorPath: join(rootDir, mirrorName),
      bytes: canonical.length,
    });
    assert.deepEqual(mirror, canonical);
    assert.equal(canonical.includes(13), false, 'generated output must contain LF newlines only');
    const before = Buffer.from(canonical);
    assert.deepEqual(buildSite(rootDir), first);
    assert.deepEqual(readFileSync(join(rootDir, canonicalName)), before);
    assert.doesNotMatch(canonical.toString('utf8'), /file:\/\/|\/Users\/|\.task9-fixture-|Math\.random|randomUUID/i);
    assert.deepEqual(verifySite(rootDir), []);
  } finally {
    removeFixture(rootDir);
  }
});

test('build output depends only on the supplied rootDir, never the caller working directory', () => {
  const rootDir = createFixture();
  try {
    const first = buildSite(rootDir);
    const firstHtml = readFileSync(first.canonicalPath);
    const alternateCwd = join(rootDir, 'unrelated-cwd');
    mkdirSync(alternateCwd);
    const buildUrl = pathToFileURL(join(projectRoot, 'tools', 'build-site.mjs')).href;
    const script = `
      const { readFileSync } = await import('node:fs');
      const { createHash } = await import('node:crypto');
      const { buildSite } = await import(${JSON.stringify(buildUrl)});
      const result = buildSite(${JSON.stringify(rootDir)});
      const html = readFileSync(result.canonicalPath);
      process.stdout.write(JSON.stringify({ hash: createHash('sha256').update(html).digest('hex'), pictures: (html.toString('utf8').match(/<picture>/g) ?? []).length }));
    `;
    const second = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: alternateCwd,
      encoding: 'utf8',
    });
    assert.equal(second.status, 0, second.stderr);
    const built = JSON.parse(second.stdout);
    assert.equal(built.hash, hash(firstHtml));
    assert.equal((firstHtml.toString('utf8').match(/<picture>/g) ?? []).length, 3);
    assert.equal(built.pictures, 3);
  } finally {
    removeFixture(rootDir);
  }
});

test('build refuses symlinked output paths before writing through them', () => {
  for (const filename of [canonicalName, mirrorName]) {
    const rootDir = createFixture();
    try {
      buildSite(rootDir);
      const outputPath = join(rootDir, filename);
      const privatePath = join(rootDir, `private-${filename.replaceAll(/[^a-z0-9.]+/giu, '-')}`);
      writeFileSync(privatePath, 'PRIVATE\n');
      rmSync(outputPath);
      symlinkSync(privatePath, outputPath);
      assert.throws(() => buildSite(rootDir), /output.*symlink|symlink.*output/i);
      assert.equal(readFileSync(privatePath, 'utf8'), 'PRIVATE\n');
    } finally {
      removeFixture(rootDir);
    }
  }
});

test('normalizes CRLF and bare CR source text before writing one deterministic Buffer', () => {
  const rootDir = createFixture();
  try {
    const stylesPath = join(rootDir, 'site', 'styles.css');
    const interactionsPath = join(rootDir, 'site', 'interactions.mjs');
    writeFileSync(stylesPath, readFileSync(stylesPath, 'utf8').replaceAll('\n', '\r\n'));
    writeFileSync(interactionsPath, readFileSync(interactionsPath, 'utf8').replaceAll('\n', '\r'));
    const result = buildSite(rootDir);
    const canonical = readFileSync(result.canonicalPath);
    assert.equal(canonical.includes(13), false);
    assert.deepEqual(canonical, readFileSync(result.mirrorPath));
    assert.equal(result.bytes, canonical.length);
  } finally {
    removeFixture(rootDir);
  }
});

test('imports build and verifier modules without direct-run side effects', () => {
  const rootDir = createFixture();
  try {
    const buildUrl = pathToFileURL(join(projectRoot, 'tools', 'build-site.mjs')).href;
    const verifyUrl = pathToFileURL(join(projectRoot, 'tools', 'verify-site.mjs')).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(buildUrl)}); await import(${JSON.stringify(verifyUrl)});`], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(rootDir, canonicalName)), false);
    assert.equal(existsSync(join(rootDir, mirrorName)), false);
  } finally {
    removeFixture(rootDir);
  }
});

test('reports forbidden claims by the exact case-insensitive ordered phrase list', () => {
  const text = [
    'THE ARTIST DATASET PROVES a conclusion.',
    'Streams Equal Artist Income.',
    "Pakistan's Music Industry Is Worth one billion dollars.",
    'The 360-track dataset shows a trend.',
    "Eva B is Pakistan's first female rapper.",
    'The National Music Policy is fully implemented.',
    'streams equal artist income again.',
  ].join(' ');
  assert.deepEqual(findForbiddenClaims(text), forbiddenPhrases);
  assert.deepEqual(findForbiddenClaims('Stream counts do not equal artist payment.'), []);
});

test('fails closed with stable named errors for source totals and duplicate identities', () => {
  for (const [code, mutate] of [
    ['STARTER_SOURCE_TOTAL', (data) => { data.research.starterSources.pop(); }],
    ['SOURCE_FAMILY_TOTAL', (data) => { data.research.sourceFamilyCounts.Scholarship -= 1; }],
    ['EXPANDED_SOURCE_TOTAL', (data) => { data.research.allSources.pop(); }],
    ['DUPLICATE_SOURCE_ID', (data) => { data.research.allSources[1].sourceId = data.research.allSources[0].sourceId; }],
    ['DUPLICATE_SOURCE_URL', (data) => { data.research.allSources[1].url = `${data.research.allSources[0].url}/#duplicate`; }],
  ]) {
    const data = packageData();
    mutate(data);
    assert.doesNotThrow(() => verifyPackageData(data), code);
    assertCode(verifyPackageData(data), code);
  }
});

test('recomputes starter families and binds all 76 rendered registry rows one-to-one', () => {
  const familyDrift = packageData();
  familyDrift.research.starterSources[0].evidenceFamily = 'Journalism';
  assertCode(verifyPackageData(familyDrift), 'SOURCE_FAMILY_TOTAL');

  const duplicateId = packageData();
  replaceHtml(duplicateId, (html) => html.replace('data-source-id="S002"', 'data-source-id="S001"'));
  assertCode(verifyPackageData(duplicateId), 'RENDERED_SOURCE_BINDING');

  const duplicateDomId = packageData();
  replaceHtml(duplicateDomId, (html) => html.replace('id="source-S002"', 'id="source-S001"'));
  assertCode(verifyPackageData(duplicateDomId), 'RENDERED_SOURCE_BINDING');

  const duplicateUrl = packageData();
  const firstUrl = new URL(duplicateUrl.research.allSources[0].url).href.replaceAll('&', '&amp;');
  const secondUrl = new URL(duplicateUrl.research.allSources[1].url).href.replaceAll('&', '&amp;');
  replaceHtml(duplicateUrl, (html) => html.replace(secondUrl, firstUrl));
  assertCode(verifyPackageData(duplicateUrl), 'RENDERED_SOURCE_BINDING');
});

test('detects proposition drift against the authoritative CSV in both data and rendered HTML', () => {
  const dataDrift = packageData();
  dataDrift.research.propositions[0].proposition = 'A rewritten proposition';
  assertCode(verifyPackageData(dataDrift), 'PROPOSITION_TEXT_DRIFT');

  const htmlDrift = packageData();
  const proposition = htmlDrift.authoritativePropositions[0].proposition;
  htmlDrift.html = Buffer.from(htmlDrift.html.toString('utf8').replace(proposition, 'A rewritten proposition'));
  htmlDrift.mirrorHtml = Buffer.from(htmlDrift.html);
  assertCode(verifyPackageData(htmlDrift), 'PROPOSITION_TEXT_DRIFT');

  const duplicateRow = packageData();
  const firstProposition = duplicateRow.authoritativePropositions[0];
  replaceHtml(duplicateRow, (html) => `${html}\n<details class="proposition" data-proposition="P01"><summary><strong>${firstProposition.proposition}</strong></summary></details>`);
  assertCode(verifyPackageData(duplicateRow), 'PROPOSITION_TEXT_DRIFT');
});

test('requires every UNESCO/BNU warning and the exact Spotify limitation in rendered output', () => {
  for (const warning of ['Purposive sample', 'n=50 music respondents', 'all respondents male', 'not nationally representative']) {
    const data = packageData();
    data.html = Buffer.from(data.html.toString('utf8').replaceAll(warning, 'warning removed'));
    data.mirrorHtml = Buffer.from(data.html);
    assertCode(verifyPackageData(data), 'MISSING_UNESCO_WARNING');
  }
  const spotify = packageData();
  spotify.html = Buffer.from(spotify.html.toString('utf8').replaceAll('Spotify-reported activity; no absolute denominators; not industry revenue.', 'limitation removed'));
  spotify.mirrorHtml = Buffer.from(spotify.html);
  assertCode(verifyPackageData(spotify), 'MISSING_SPOTIFY_LIMITATION');
});

test('requires corroboration for synthesis and explicit claim modes for single-source primary prose', () => {
  const synthesis = packageData();
  const synthesisBlock = synthesis.chapters.flatMap(({ blocks }) => blocks).find(({ kind, claimMode, sourceIds }) => kind === 'paragraph' && claimMode === 'synthesis' && sourceIds.length > 1);
  synthesisBlock.sourceIds = synthesisBlock.sourceIds.slice(0, 1);
  assertCode(verifyPackageData(synthesis), 'SYNTHESIS_SOURCE_COUNT');

  const attributed = packageData();
  const attributedBlock = attributed.chapters.flatMap(({ blocks }) => blocks).find(({ kind, claimMode }) => kind === 'paragraph' && claimMode === 'first-party-attributed');
  delete attributedBlock.claimMode;
  assertCode(verifyPackageData(attributed), 'EXPLICIT_CLAIM_MODE');

  const relabeledFirstParty = packageData();
  const firstPartyBlock = relabeledFirstParty.chapters.flatMap(({ blocks }) => blocks)
    .find(({ kind, sourceIds }) => kind === 'paragraph' && sourceIds?.length === 1 && sourceIds[0] === 'L019');
  firstPartyBlock.claimMode = 'context';
  assertCode(verifyPackageData(relabeledFirstParty), 'EXPLICIT_CLAIM_MODE');

  const relabeledPrimary = packageData();
  const primaryBlock = relabeledPrimary.chapters.flatMap(({ blocks }) => blocks)
    .find(({ kind, sourceIds }) => kind === 'paragraph' && sourceIds?.length === 1 && sourceIds[0] === 'L002');
  primaryBlock.claimMode = 'context';
  assertCode(verifyPackageData(relabeledPrimary), 'EXPLICIT_CLAIM_MODE');
});

test('parses balanced Markdown link destinations and requires every unique brief URL in sources or image file pages', () => {
  const markdown = '[one](https://example.com/a_(b)) [two](https://example.com/x_(y_(z))/tail) [repeat](https://example.com/a_(b))';
  assert.deepEqual(extractMarkdownUrls(markdown), [
    'https://example.com/a_(b)',
    'https://example.com/x_(y_(z))/tail',
  ]);
  const data = packageData({ briefMarkdown: `${readFileSync(briefPath, 'utf8')}\n[Missing](https://example.com/a_(b))\n` });
  assertCode(verifyPackageData(data), 'UNREPRESENTED_BRIEF_URL');
});

test('rejects unsafe source links and external runtime scripts, styles, fonts, images, or media', () => {
  const unsafeSource = packageData();
  unsafeSource.research.allSources[0].url = 'javascript:alert(1)';
  assertCode(verifyPackageData(unsafeSource), 'UNSAFE_EXTERNAL_URL');

  for (const markup of [
    '<script src="https://example.com/app.js"></script>',
    '<script href="https://example.com/svg-script.js"></script>',
    '<link rel="stylesheet" href="https://example.com/app.css">',
    '<link rel="preload" as="font" href="https://example.com/font.woff2">',
    '<img src="https://example.com/image.jpg" alt="">',
    '<video src="https://example.com/video.mp4"></video>',
    '<audio><source src="//example.com/audio.mp3"></audio>',
    '<style>.bad{background:url(https://example.com/paper.png)}</style>',
    '<style>@import "https://example.com/external.css";</style>',
    '<img src=https://evil.example/a.jpg alt="">',
    '<ImG SrC = //evil.example/mixed.jpg>',
    '<img src="data:image/svg+xml,x" alt="">',
    '<img src="mailto:leak@example.com" alt="">',
    '<img src="java&#10;script:alert(1)" alt="">',
    '<object data=https://evil.example/payload></object>',
    '<iframe src=https://evil.example/frame></iframe>',
    '<embed src=https://evil.example/embed>',
    '<track src=https://evil.example/captions.vtt>',
    '<input type=image src=https://evil.example/button.png>',
    '<svg><image href="https://evil.example/vector.png"></image></svg>',
    '<svg><use xlink:href="https://evil.example/icons.svg#mark"></use></svg>',
    '<form action="https://evil.example/submit"></form>',
    '<button formaction="https://evil.example/submit">Send</button>',
    '<a href="https://example.com/research" ping="https://evil.example/track">Research</a>',
    '<html manifest="https://evil.example/cache.appcache"></html>',
    '<body background="https://evil.example/paper.png"></body>',
    '<meta http-equiv=" refresh " content="0 ; URL = https://evil.example/">',
    '<base href="https://evil.example/">',
    '<style>@import "data:text/css,body{}";</style>',
    '<style>@import/**/url(https://evil.example/commented.css);</style>',
    '<style>.bad{background:url(data:image/svg+xml,x)}</style>',
    '<img src="assets/hiphop-pakistan/mizraab-coke-studio-960.jpg" srcset="assets/hiphop-pakistan/mizraab-coke-studio-960.jpg 1x, https://evil.example/second.jpg 2x" alt="">',
  ]) {
    const data = packageData();
    replaceHtml(data, (html) => html.replace('</body>', `${markup}\n</body>`));
    assertCode(verifyPackageData(data), 'EXTERNAL_RUNTIME_ASSET');
  }

  const safeCitation = packageData();
  replaceHtml(safeCitation, (html) => html.replace('</body>', '<a href="https://example.com/research?q=music&amp;year=2026">Research citation</a></body>'));
  const citationCodes = errorCodes(verifyPackageData(safeCitation));
  assert.equal(citationCodes.includes('EXTERNAL_RUNTIME_ASSET'), false);
  assert.equal(citationCodes.includes('UNSAFE_EXTERNAL_URL'), false);
});

test('validates all package-local href, src, and srcset targets for existence and scope', () => {
  for (const [markup, code] of [
    ['<img src="assets/hiphop-pakistan/missing.jpg" alt="">', 'MISSING_LOCAL_TARGET'],
    ['<img src="../outside.jpg" alt="">', 'OUT_OF_SCOPE_LOCAL_TARGET'],
    ['<img srcset="assets/hiphop-pakistan/missing-960.jpg 960w, assets/hiphop-pakistan/missing-1800.jpg 1800w" alt="">', 'MISSING_LOCAL_TARGET'],
    ['<a href="/docs/private.md">Private</a>', 'OUT_OF_SCOPE_LOCAL_TARGET'],
  ]) {
    const data = packageData();
    data.html = Buffer.from(`${data.html.toString('utf8')}\n${markup}`);
    data.mirrorHtml = Buffer.from(data.html);
    assertCode(verifyPackageData(data), code);
  }
});

test('requires complete image rights, provenance, dimensions, variants, and local bytes', () => {
  const emptyManifest = packageData({ images: [] });
  assertCode(verifyPackageData(emptyManifest), 'IMAGE_METADATA_INCOMPLETE');

  const requiredFields = ['id', 'creator', 'filePage', 'sourceUrl', 'date', 'license', 'licenseUrl', 'modifications', 'rightsCheckedOn', 'status', 'alt', 'width', 'height', 'variants'];
  for (const field of requiredFields) {
    const data = packageData();
    delete data.images[0][field];
    assertCode(verifyPackageData(data), 'IMAGE_METADATA_INCOMPLETE');
  }
  for (const [variant, field] of [['960', 'path'], ['960', 'requestedWidth'], ['960', 'width'], ['960', 'height'], ['960', 'sourceUrl'], ['960', 'bytes'], ['1800', 'path']]) {
    const data = packageData();
    delete data.images[0].variants[variant][field];
    assertCode(verifyPackageData(data), 'IMAGE_METADATA_INCOMPLETE');
  }
  const dimensions = packageData();
  dimensions.images[0].variants['960'].width = 0;
  assertCode(verifyPackageData(dimensions), 'IMAGE_METADATA_INCOMPLETE');
  const wrongBytes = packageData();
  wrongBytes.images[0].variants['960'].bytes += 1;
  assertCode(verifyPackageData(wrongBytes), 'IMAGE_METADATA_INCOMPLETE');

  const unsupportedLicense = packageData();
  unsupportedLicense.images[0].license = 'All rights reserved';
  assertCode(verifyPackageData(unsupportedLicense), 'IMAGE_RIGHTS_INVALID');

  const mismatchedLicenseUrl = packageData();
  mismatchedLicenseUrl.images[0].licenseUrl = 'https://creativecommons.org/licenses/by-sa/4.0';
  assertCode(verifyPackageData(mismatchedLicenseUrl), 'IMAGE_RIGHTS_INVALID');

  const renamedIdentity = packageData();
  renamedIdentity.images[0].id = 'renamed-image';
  assertCode(verifyPackageData(renamedIdentity), 'IMAGE_IDENTITY_DRIFT');
});

test('binds chapter image identities and rendered variants one-to-one', () => {
  const removedPicture = packageData();
  replaceHtml(removedPicture, (html) => html.replace(/(<figure class="contact-frame" data-image="mizraab-coke-studio"[\s\S]*?)<picture>[\s\S]*?<\/picture>/u, '$1'));
  assertCode(verifyPackageData(removedPicture), 'IMAGE_RENDER_BINDING');

  const duplicateRenderedId = packageData();
  replaceHtml(duplicateRenderedId, (html) => html.replace('data-image="radio-pakistan-building"', 'data-image="mizraab-coke-studio"'));
  assertCode(verifyPackageData(duplicateRenderedId), 'IMAGE_RENDER_BINDING');

  const variantDrift = packageData();
  replaceHtml(variantDrift, (html) => html.replace(
    'assets/hiphop-pakistan/mizraab-coke-studio-1800.jpg',
    'assets/hiphop-pakistan/radio-pakistan-building-1800.jpg',
  ));
  assertCode(verifyPackageData(variantDrift), 'IMAGE_RENDER_BINDING');

  const missingCredit = packageData();
  replaceHtml(missingCredit, (html) => html.replace('data-photo-credit="mizraab-coke-studio"', 'data-photo-credit="removed"'));
  assertCode(verifyPackageData(missingCredit), 'IMAGE_RENDER_BINDING');
});

test('binds every manifest variant path to its approved image identity and size', () => {
  const rootDir = createFixture();
  try {
    buildSite(rootDir);
    const images = JSON.parse(readFileSync(join(rootDir, 'assets', 'hiphop-pakistan', 'manifest.json'), 'utf8'));
    const first = images[3].variants['960'];
    images[3].variants['960'] = images[8].variants['960'];
    images[8].variants['960'] = first;
    const data = packageData({
      rootDir,
      images,
      html: readFileSync(join(rootDir, canonicalName)),
      mirrorHtml: readFileSync(join(rootDir, mirrorName)),
    });
    assertCode(verifyPackageData(data), 'IMAGE_VARIANT_BINDING');
  } finally {
    removeFixture(rootDir);
  }
});

test('rejects banned unlicensed portrait subjects only in depicted-subject metadata', () => {
  for (const name of ['Talha Anjum', 'Young Stunners', 'Hasan Raheem', 'Eva B']) {
    const data = packageData();
    data.images[0].alt = `Portrait of ${name}`;
    assertCode(verifyPackageData(data), 'UNLICENSED_IMAGE_SUBJECT');
  }

  const neutralDisclaimer = packageData();
  neutralDisclaimer.images[0].modifications = 'This context photograph does not portray Eva B';
  assert.equal(errorCodes(verifyPackageData(neutralDisclaimer)).includes('UNLICENSED_IMAGE_SUBJECT'), false);
});

test('requires nine ordered chapters, nine paired conclusions, and every 7 by 3 static case view', () => {
  const chapterData = packageData();
  chapterData.chapters.splice(4, 1);
  assertCode(verifyPackageData(chapterData), 'MISSING_CHAPTER');

  for (const field of ['establishes', 'unknown']) {
    const conclusionData = packageData();
    conclusionData.chapters[0][field] = '';
    assertCode(verifyPackageData(conclusionData), 'MISSING_CHAPTER_CONCLUSION');
  }

  const caseData = packageData();
  delete caseData.research.cases[0].views.rights;
  assertCode(verifyPackageData(caseData), 'MISSING_STATIC_CASE_VIEW');

  const caseHtml = packageData();
  caseHtml.html = Buffer.from(caseHtml.html.toString('utf8').replace('data-case-view="rights"', 'data-case-view="removed"'));
  caseHtml.mirrorHtml = Buffer.from(caseHtml.html);
  assertCode(verifyPackageData(caseHtml), 'MISSING_STATIC_CASE_VIEW');

  const relabeledCase = packageData();
  relabeledCase.research.cases[0].id = 'invented-case';
  replaceHtml(relabeledCase, (html) => html.replace('data-case="lyari-underground"', 'data-case="invented-case"'));
  assertCode(verifyPackageData(relabeledCase), 'MISSING_STATIC_CASE_VIEW');
});

test('reports forbidden output phrases and non-identical generated bytes without throwing', () => {
  const forbidden = packageData();
  forbidden.html = Buffer.from(`${forbidden.html.toString('utf8')}\n<p>THE ARTIST DATASET PROVES everything.</p>`);
  forbidden.mirrorHtml = Buffer.from(forbidden.html);
  assertCode(verifyPackageData(forbidden), 'FORBIDDEN_CLAIM');

  const entityObscured = packageData();
  replaceHtml(entityObscured, (html) => html.replace('</body>', '<p>streams&#32;equal artist income</p></body>'));
  assertCode(verifyPackageData(entityObscured), 'FORBIDDEN_CLAIM');
  assert.deepEqual(findForbiddenClaims('<script>streams equal artist income</script><style>/* the artist dataset proves */</style>'), []);
  assert.deepEqual(findForbiddenClaims('<!-- streams equal artist income --><p>Safe visible prose.</p>'), []);

  const mismatch = packageData();
  mismatch.mirrorHtml = Buffer.concat([mismatch.mirrorHtml, Buffer.from('\n')]);
  assert.doesNotThrow(() => verifyPackageData(mismatch));
  assertCode(verifyPackageData(mismatch), 'HTML_OUTPUT_MISMATCH');
});

test('verifySite returns named I/O errors for ordinary broken fixtures instead of throwing', () => {
  const rootDir = createFixture();
  try {
    assert.doesNotThrow(() => verifySite(rootDir));
    assertCode(verifySite(rootDir), 'VERIFICATION_IO_ERROR');
  } finally {
    removeFixture(rootDir);
  }
});

test('verifier rejects symlinked outputs, downloads, asset components, variants, and asset roots', () => {
  for (const filename of [canonicalName, mirrorName, DOWNLOADS[0]]) {
    const rootDir = createFixture();
    try {
      buildSite(rootDir);
      const publicPath = join(rootDir, filename);
      const privatePath = join(rootDir, `private-${filename.replaceAll(/[^a-z0-9.]+/giu, '-')}`);
      writeFileSync(privatePath, readFileSync(publicPath));
      rmSync(publicPath);
      symlinkSync(privatePath, publicPath);
      assertCode(verifySite(rootDir), 'SYMLINKED_LOCAL_TARGET');
    } finally {
      removeFixture(rootDir);
    }
  }

  const componentRoot = createFixture();
  try {
    buildSite(componentRoot);
    const assetRoot = join(componentRoot, 'assets', 'hiphop-pakistan');
    const realDirectory = join(assetRoot, 'real-directory');
    mkdirSync(realDirectory);
    writeFileSync(join(realDirectory, 'probe.jpg'), syntheticJpeg(960, 640));
    symlinkSync(realDirectory, join(assetRoot, 'linked-directory'));
    const data = packageData({ rootDir: componentRoot });
    replaceHtml(data, (html) => html.replace('</body>', '<img src="assets/hiphop-pakistan/linked-directory/probe.jpg" alt=""></body>'));
    assertCode(verifyPackageData(data), 'SYMLINKED_LOCAL_TARGET');
  } finally {
    removeFixture(componentRoot);
  }

  const variantRoot = createFixture();
  try {
    buildSite(variantRoot);
    const fixtureManifest = JSON.parse(readFileSync(join(variantRoot, 'assets', 'hiphop-pakistan', 'manifest.json'), 'utf8'));
    const variantPath = join(variantRoot, fixtureManifest[0].variants['960'].path);
    rmSync(variantPath);
    symlinkSync(join(variantRoot, fixtureManifest[1].variants['960'].path), variantPath);
    assertCode(verifySite(variantRoot), 'SYMLINKED_IMAGE_VARIANT');
  } finally {
    removeFixture(variantRoot);
  }

  const rootDir = createFixture();
  const outsideRoot = createOutsideRoot();
  try {
    buildSite(rootDir);
    const assetRoot = join(rootDir, 'assets', 'hiphop-pakistan');
    const outsideAssets = join(outsideRoot, 'hiphop-pakistan');
    renameSync(assetRoot, outsideAssets);
    symlinkSync(outsideAssets, assetRoot);
    assertCode(verifySite(rootDir), 'UNSAFE_ASSET_ROOT');
  } finally {
    removeFixture(rootDir);
    removeTempRoot(outsideRoot);
  }
});

test('verifier CLI prints PASS only for an empty error list and exits nonzero otherwise', () => {
  const verifier = join(projectRoot, 'tools', 'verify-site.mjs');
  const rootDir = createFixture();
  try {
    buildSite(rootDir);
    const pass = spawnSync(process.execPath, [verifier], { cwd: rootDir, encoding: 'utf8' });
    assert.equal(pass.status, 0, pass.stderr);
    assert.equal(pass.stdout.trim(), 'PASS');

    writeFileSync(join(rootDir, mirrorName), 'not identical\n');
    const fail = spawnSync(process.execPath, [verifier], { cwd: rootDir, encoding: 'utf8' });
    assert.notEqual(fail.status, 0);
    assert.doesNotMatch(fail.stdout, /^PASS$/m);
    assert.match(`${fail.stdout}\n${fail.stderr}`, /HTML_OUTPUT_MISMATCH/);
  } finally {
    removeFixture(rootDir);
  }
});

test('preview validates the exact loopback host and integer port contract', async () => {
  for (const options of [
    { rootDir: projectRoot, host: 'localhost', port: 0 },
    { rootDir: projectRoot, host: '0.0.0.0', port: 0 },
    { rootDir: projectRoot, host: '127.0.0.1', port: '0' },
    { rootDir: projectRoot, host: '127.0.0.1', port: -1 },
    { rootDir: projectRoot, host: '127.0.0.1', port: 65536 },
  ]) {
    await assert.rejects(() => startPreviewServer(options), /127\.0\.0\.1|port must be an integer/i);
  }
});

test('preview serves only canonical, eleven downloads, and contained asset files with correct GET and HEAD metadata', async () => {
  const rootDir = createFixture();
  let server;
  try {
    buildSite(rootDir);
    const assetRoot = join(rootDir, 'assets', 'hiphop-pakistan');
    writeFileSync(join(assetRoot, 'probe.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const started = await startPreviewServer({ rootDir, host: '127.0.0.1', port: 0 });
    ({ server } = started);

    for (const [pathname, contentType] of [
      ['/', 'text/html; charset=utf-8'],
      [`/${canonicalName}`, 'text/html; charset=utf-8'],
      ['/source_map.csv', 'text/csv; charset=utf-8'],
      ['/analysis_plan.md', 'text/markdown; charset=utf-8'],
      ['/assets/hiphop-pakistan/mizraab-coke-studio-960.jpg', 'image/jpeg'],
      ['/assets/hiphop-pakistan/probe.png', 'image/png'],
      ['/assets/hiphop-pakistan/manifest.json', 'application/json; charset=utf-8'],
    ]) {
      const get = await httpRequest(started.url, pathname);
      assert.equal(get.statusCode, 200, pathname);
      assert.equal(get.headers['content-type'], contentType, pathname);
      assert.equal(get.headers['x-content-type-options'], 'nosniff', pathname);
      assert.ok(get.body.length > 0, pathname);
      const head = await httpRequest(started.url, pathname, 'HEAD');
      assert.equal(head.statusCode, 200, `HEAD ${pathname}`);
      assert.equal(head.headers['content-type'], contentType, `HEAD ${pathname}`);
      assert.equal(Number(head.headers['content-length']), get.body.length, `HEAD length ${pathname}`);
      assert.equal(head.body.length, 0, `HEAD body ${pathname}`);
    }
    for (const filename of DOWNLOADS) assert.equal((await httpRequest(started.url, `/${filename}`, 'HEAD')).statusCode, 200, filename);
  } finally {
    if (server) await closeServer(server);
    removeFixture(rootDir);
  }
});

test('preview returns 404 for well-formed disallowed, missing, directory, temporary, and scope-escaping symlink paths', async () => {
  const rootDir = createFixture();
  let server;
  try {
    buildSite(rootDir);
    writeFileSync(join(rootDir, 'package.json'), '{}\n');
    writeFileSync(join(rootDir, '.hidden'), 'hidden\n');
    writeFileSync(join(rootDir, 'temporary.tmp'), 'temporary\n');
    symlinkSync(join(rootDir, 'package.json'), join(rootDir, 'assets', 'hiphop-pakistan', 'outside-link.json'));
    assert.equal(lstatSync(join(rootDir, 'assets', 'hiphop-pakistan', 'outside-link.json')).isSymbolicLink(), true);
    const started = await startPreviewServer({ rootDir, host: '127.0.0.1', port: 0 });
    ({ server } = started);
    for (const pathname of [
      `/${encodeURIComponent(mirrorName)}`,
      '/package.json',
      '/docs/superpowers/specs/2026-08-23-hiphop-pakistan-editorial-redesign-design.md',
      '/tests/package.test.mjs',
      '/tools/build-site.mjs',
      '/.hidden',
      '/temporary.tmp',
      '/assets/hiphop-pakistan/',
      '/assets/hiphop-pakistan/missing.jpg',
      '/assets/hiphop-pakistan/outside-link.json',
    ]) assert.equal((await httpRequest(started.url, pathname)).statusCode, 404, pathname);
  } finally {
    if (server) await closeServer(server);
    removeFixture(rootDir);
  }
});

test('preview rejects symlinked public files, symlinked components, and temporary path segments', async () => {
  const rootDir = createFixture();
  let server;
  try {
    buildSite(rootDir);
    const assetRoot = join(rootDir, 'assets', 'hiphop-pakistan');
    const started = await startPreviewServer({ rootDir, host: '127.0.0.1', port: 0 });
    ({ server } = started);

    const privateHtml = join(rootDir, 'private.html');
    writeFileSync(privateHtml, readFileSync(join(rootDir, canonicalName)));
    rmSync(join(rootDir, canonicalName));
    symlinkSync(privateHtml, join(rootDir, canonicalName));

    const privateDownload = join(rootDir, 'private-download.txt');
    writeFileSync(privateDownload, 'PRIVATE');
    rmSync(join(rootDir, DOWNLOADS[0]));
    symlinkSync(privateDownload, join(rootDir, DOWNLOADS[0]));

    symlinkSync(join(assetRoot, 'mizraab-coke-studio-960.jpg'), join(assetRoot, 'linked-file.jpg'));
    const realDirectory = join(assetRoot, 'real-directory');
    mkdirSync(realDirectory);
    writeFileSync(join(realDirectory, 'probe.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    symlinkSync(realDirectory, join(assetRoot, 'linked-directory'));
    const stagingDirectory = join(assetRoot, 'staging.tmp');
    mkdirSync(stagingDirectory);
    writeFileSync(join(stagingDirectory, 'probe.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    for (const pathname of [
      '/',
      `/${DOWNLOADS[0]}`,
      '/assets/hiphop-pakistan/linked-file.jpg',
      '/assets/hiphop-pakistan/linked-directory/probe.png',
      '/assets/hiphop-pakistan/staging.tmp/probe.png',
    ]) assert.equal((await httpRequest(started.url, pathname)).statusCode, 404, pathname);
  } finally {
    if (server) await closeServer(server);
    removeFixture(rootDir);
  }
});

test('preview refuses an asset root whose symlink resolves outside the real project root', async () => {
  const rootDir = createFixture();
  const outsideRoot = createOutsideRoot();
  let unexpectedServer;
  try {
    buildSite(rootDir);
    const assetRoot = join(rootDir, 'assets', 'hiphop-pakistan');
    const outsideAssets = join(outsideRoot, 'hiphop-pakistan');
    renameSync(assetRoot, outsideAssets);
    symlinkSync(outsideAssets, assetRoot);
    await assert.rejects(
      async () => {
        const started = await startPreviewServer({ rootDir, host: '127.0.0.1', port: 0 });
        unexpectedServer = started.server;
      },
      /asset root|symlink|project root/i,
    );
  } finally {
    if (unexpectedServer) await closeServer(unexpectedServer);
    removeFixture(rootDir);
    removeTempRoot(outsideRoot);
  }
});

test('preview returns 403 for malformed encoding, NUL, separators, dot segments, and double-encoded traversal', async () => {
  const rootDir = createFixture();
  let server;
  try {
    buildSite(rootDir);
    const started = await startPreviewServer({ rootDir, host: '127.0.0.1', port: 0 });
    ({ server } = started);
    for (const pathname of [
      '/%',
      '/%00',
      '/assets%2fhiphop-pakistan%2fmanifest.json',
      '/assets%252fhiphop-pakistan%252fmanifest.json',
      '/assets\\hiphop-pakistan\\manifest.json',
      '/assets%5chip-hop.json',
      '/assets%255chip-hop.json',
      '/../package.json',
      '/./package.json',
      '/%2e%2e/package.json',
      '/.%2e/package.json',
      '/%252e%252e%252fpackage.json',
      '/assets/hiphop-pakistan/%2e%2e/package.json',
    ]) assert.equal((await httpRequest(started.url, pathname)).statusCode, 403, pathname);
  } finally {
    if (server) await closeServer(server);
    removeFixture(rootDir);
  }
});

test('preview rejects methods other than GET and HEAD with an Allow header', async () => {
  const rootDir = createFixture();
  let server;
  try {
    buildSite(rootDir);
    const started = await startPreviewServer({ rootDir, host: '127.0.0.1', port: 0 });
    ({ server } = started);
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await httpRequest(started.url, '/', method);
      assert.equal(response.statusCode, 405, method);
      assert.equal(response.headers.allow, 'GET, HEAD', method);
    }
  } finally {
    if (server) await closeServer(server);
    removeFixture(rootDir);
  }
});

function httpRequest(baseUrl, pathname, method = 'GET') {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolveResponse, reject) => {
    const req = request({ hostname, port, method, path: pathname }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveResponse({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
