import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import manifest from '../assets/hiphop-pakistan/manifest.json' with { type: 'json' };
import { assetDefinitions, fetchAllAssets, fetchCommonsAsset } from '../tools/fetch-assets.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const allowedLicense = /^(CC0|CC BY-SA (3\.0|4\.0)|FAL)$/;
const expectedAssets = [
  ['mizraab-coke-studio', 'File:Mizraab-cokestudio.jpg', 'https://commons.wikimedia.org/wiki/File:Mizraab-cokestudio.jpg', 'Documentary photograph', 'Musicians performing on the Coke Studio set in 2011.'],
  ['arooj-aftab-le-poisson-rouge', 'File:Arooj_aftab_at_le_poisson_rouge.jpg', 'https://commons.wikimedia.org/wiki/File:Arooj_aftab_at_le_poisson_rouge.jpg', 'Documentary photograph', 'Arooj Aftab performing at Le Poisson Rouge in New York City in 2014.'],
  ['saif-samejo-music-mela', 'File:Saif_Samejo,_Music_Mela.jpg', 'https://commons.wikimedia.org/wiki/File:Saif_Samejo,_Music_Mela.jpg', 'Documentary photograph', 'Saif Samejo performing at Music Mela in 2015.'],
  ['shafqat-amanat-arts-council', 'File:Shafqat_Amanat_Ali_performing_in_Karachi_(2024).jpg', 'https://commons.wikimedia.org/wiki/File:Shafqat_Amanat_Ali_performing_in_Karachi_(2024).jpg', 'Documentary photograph', 'Shafqat Amanat Ali performing in Karachi in 2024.'],
  ['radio-pakistan-building', 'File:Radio_Pakistan_Building.jpg', 'https://commons.wikimedia.org/wiki/File:Radio_Pakistan_Building.jpg', 'Context photograph', 'The Radio Pakistan Building in Islamabad.'],
  ['alhamra-art-centre', 'File:Alhamra_Art_Centre.JPG', 'https://commons.wikimedia.org/wiki/File:Alhamra_Art_Centre.JPG', 'Context photograph', 'The exterior of Alhamra Art Centre in Lahore.'],
  ['cell-towers-punjab', 'File:Cell_Towers.jpg', 'https://commons.wikimedia.org/wiki/File:Cell_Towers.jpg', 'Context photograph', 'Cell towers in Punjab.'],
  ['lyari-river-karachi', 'File:PK_Karachi_asv2020-02_img50_Lyari_River.jpg', 'https://commons.wikimedia.org/wiki/File:PK_Karachi_asv2020-02_img50_Lyari_River.jpg', 'Context photograph', 'The Lyari River running through Karachi.'],
  ['cholistan-musicians', 'File:Musicians_of_Cholistan_desert_performing_in_Derawar_Fort.jpg', 'https://commons.wikimedia.org/wiki/File:Musicians_of_Cholistan_desert_performing_in_Derawar_Fort.jpg', 'Context photograph', 'Musicians performing at Derawar Fort in the Cholistan Desert.'],
  ['bhitt-shah-music', 'File:Bhitt_Shah_sindh_pakistan.jpg', 'https://commons.wikimedia.org/wiki/File:Bhitt_Shah_sindh_pakistan.jpg', 'Context photograph', 'Musicians performing at Bhitt Shah in Sindh.'],
];

function jpegDimensions(bytes) {
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    offset += length + 2;
  }
  throw new Error('JPEG dimensions unavailable');
}

function response({ json, bytes = new Uint8Array(), url = 'https://upload.wikimedia.org/example.jpg', contentType = 'image/jpeg', ok = true, status = 200 }) {
  const payload = {
    ok,
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    json: async () => json,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
  return payload;
}

function metadataPayload(definition, overrides = {}) {
  const entry = manifest.find(({ id }) => id === definition.id);
  const payload = {
    query: { pages: { 1: { imageinfo: [{
      url: entry.sourceUrl,
      descriptionurl: `https://commons.wikimedia.org/wiki/${definition.commonsTitle}`,
      width: entry.width,
      height: entry.height,
      thumburl: entry.variants['960'].sourceUrl,
      extmetadata: {
        Artist: { value: entry.creator },
        DateTimeOriginal: { value: entry.date },
        LicenseShortName: { value: entry.license },
        LicenseUrl: { value: entry.licenseUrl },
      },
      ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'extmetadata')),
    }] } } },
  };
  if (overrides.extmetadata) Object.assign(payload.query.pages[1].imageinfo[0].extmetadata, overrides.extmetadata);
  return payload;
}

function metadataFetch(overrides = {}) {
  return async (url) => {
    const parsed = new URL(url);
    const definition = assetDefinitions.find(({ commonsTitle }) => commonsTitle === parsed.searchParams.get('titles'));
    if (!definition) throw new Error(`unexpected URL ${url}`);
    const payload = metadataPayload(definition, overrides);
    const width = parsed.searchParams.get('iiurlwidth');
    payload.query.pages[1].imageinfo[0].thumburl = manifest.find(({ id }) => id === definition.id).variants[width].sourceUrl;
    if (overrides.thumburl) payload.query.pages[1].imageinfo[0].thumburl = overrides.thumburl;
    return response({ json: payload, url: 'https://commons.wikimedia.org/w/api.php' });
  };
}

test('locks the exact approved Commons title, file page, status, and factual alt mapping', () => {
  assert.deepEqual(
    assetDefinitions.map(({ id, commonsTitle, status, alt }) => [id, commonsTitle, `https://commons.wikimedia.org/wiki/${commonsTitle}`, status, alt]),
    expectedAssets,
  );
  assert.deepEqual(
    manifest.map(({ id, filePage, status, alt }) => [id, filePage, status, alt]),
    expectedAssets.map(([id, , filePage, status, alt]) => [id, filePage, status, alt]),
  );
});

test('records complete provenance, parsed local JPEG dimensions, bytes, and aspect ratios', async () => {
  assert.equal(manifest.length, expectedAssets.length);
  for (const image of manifest) {
    for (const field of ['id', 'creator', 'filePage', 'sourceUrl', 'date', 'license', 'licenseUrl', 'modifications', 'rightsCheckedOn', 'status', 'alt', 'width', 'height', 'variants']) assert.ok(image[field], `${image.id}: ${field}`);
    assert.match(image.license, allowedLicense);
    assert.equal(image.modifications, 'Commons thumbnail resize only; no crop or color grade');
    assert.equal(image.rightsCheckedOn, '2026-08-23');
    for (const requestedWidth of [960, 1800]) {
      const variant = image.variants[String(requestedWidth)];
      assert.equal(variant.requestedWidth, requestedWidth);
      assert.equal(variant.path, `assets/hiphop-pakistan/${image.id}-${requestedWidth}.jpg`);
      const bytes = new Uint8Array(await readFile(path.join(projectRoot, variant.path)));
      assert.equal((await stat(path.join(projectRoot, variant.path))).size, variant.bytes);
      assert.deepEqual(jpegDimensions(bytes), { width: variant.width, height: variant.height });
      assert.ok(Math.abs((variant.width / variant.height) - (image.width / image.height)) < 0.01, `${image.id}: aspect ratio`);
    }
  }
});

test('context photographs identify only the visible place or activity', () => {
  for (const image of manifest.filter(({ status }) => status === 'Context photograph')) assert.doesNotMatch(image.alt.toLowerCase(), /\b(artist|concert|music mela|coke studio|arooj|saif|shafqat)\b/);
});

test('does not include unlicensed contemporary artist portraits', () => {
  const serialized = JSON.stringify(manifest).toLowerCase();
  for (const prohibited of ['talha anjum', 'young stunners', 'hasan raheem', 'eva b']) assert.equal(serialized.includes(prohibited), false);
});

test('rejects every required Commons metadata omission before byte download', async () => {
  const definition = assetDefinitions[0];
  for (const [field, mutate] of [
    ['creator', (info) => { info.extmetadata.Artist.value = ''; }],
    ['date', (info) => { delete info.extmetadata.DateTimeOriginal; }],
    ['license', (info) => { info.extmetadata.LicenseShortName.value = ''; }],
    ['license URL', (info) => { info.extmetadata.LicenseUrl.value = ''; }],
    ['file page', (info) => { info.descriptionurl = ''; }],
    ['source URL', (info) => { info.url = ''; }],
    ['width', (info) => { info.width = 0; }],
    ['height', (info) => { info.height = 0; }],
  ]) {
    let byteRequests = 0;
    const fetchImpl = async (url) => {
      if (!url.includes('/w/api.php')) byteRequests += 1;
      const payload = metadataPayload(definition);
      mutate(payload.query.pages[1].imageinfo[0]);
      return response({ json: payload, bytes: new Uint8Array([1]) });
    };
    await assert.rejects(() => fetchCommonsAsset(definition, fetchImpl), /file page/i.test(field) ? /filePage/i : field === 'license URL' ? /licenseUrl/i : field === 'source URL' ? /sourceUrl/i : new RegExp(field, 'i'));
    assert.equal(byteRequests, 0, `${field}: byte requests`);
  }
});

test('rejects an unapproved or traversal definition before fetch or filesystem work', async () => {
  let fetches = 0;
  await assert.rejects(() => fetchCommonsAsset({ ...assetDefinitions[0], id: '../../outside' }, async () => { fetches += 1; throw new Error('must not fetch'); }), /approved definition|safe slug/i);
  assert.equal(fetches, 0);
});

test('rejects a license URL that does not match the declared license family', async () => {
  const definition = assetDefinitions[0];
  const fetchImpl = metadataFetch({ extmetadata: { LicenseUrl: { value: 'https://artlibre.org/licence/lal/' } } });
  await assert.rejects(() => fetchCommonsAsset(definition, fetchImpl), /license URL/i);
});

test('accepts each current exact Commons license name and URL pair', async () => {
  for (const [id, license, licenseUrl] of [
    ['radio-pakistan-building', 'CC0', 'http://creativecommons.org/publicdomain/zero/1.0/deed.en'],
    ['mizraab-coke-studio', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0'],
    ['arooj-aftab-le-poisson-rouge', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0'],
    ['lyari-river-karachi', 'FAL', 'http://artlibre.org/licence/lal/en'],
  ]) {
    const definition = assetDefinitions.find((asset) => asset.id === id);
    const entry = await fetchCommonsAsset(definition, metadataFetch({ extmetadata: { LicenseShortName: { value: license }, LicenseUrl: { value: licenseUrl } } }));
    assert.equal(entry.license, license);
    assert.equal(entry.licenseUrl, licenseUrl);
  }
});

test('rejects same-host license lookalikes and wrong license versions', async () => {
  for (const [id, licenseUrl] of [
    ['radio-pakistan-building', 'http://creativecommons.org/publicdomain/zero/1.0evil/deed.en'],
    ['radio-pakistan-building', 'http://creativecommons.org/publicdomain/zero/2.0/deed.en'],
    ['mizraab-coke-studio', 'https://creativecommons.org/licenses/by-sa/3.0evil/deed'],
    ['mizraab-coke-studio', 'https://creativecommons.org/licenses/by-sa/4.0/deed'],
    ['arooj-aftab-le-poisson-rouge', 'https://creativecommons.org/licenses/by-sa/4.0evil/deed'],
    ['arooj-aftab-le-poisson-rouge', 'https://creativecommons.org/licenses/by-sa/3.0/deed'],
    ['lyari-river-karachi', 'http://artlibre.org/licence/lalicious/en'],
  ]) {
    const definition = assetDefinitions.find((asset) => asset.id === id);
    await assert.rejects(() => fetchCommonsAsset(definition, metadataFetch({ extmetadata: { LicenseUrl: { value: licenseUrl } } })), /license URL/i, `${id}: ${licenseUrl}`);
  }
});

test('rejects non-HTTPS thumbnail URLs before any local reuse or write', async () => {
  const definition = assetDefinitions[0];
  const fetchImpl = metadataFetch({ thumburl: 'http://upload.wikimedia.org/example.jpg' });
  await assert.rejects(() => fetchCommonsAsset(definition, fetchImpl), /approved HTTPS hosts/i);
});

test('rejects redirected thumbnail responses outside approved HTTPS hosts', async () => {
  const definition = assetDefinitions[0];
  const localPath = path.join(projectRoot, manifest[0].variants['960'].path);
  const backupPath = `${localPath}.test-backup`;
  let apiCalls = 0;
  const fetchImpl = async (url) => {
    if (url.includes('/w/api.php')) {
      apiCalls += 1;
      const payload = metadataPayload(definition);
      payload.query.pages[1].imageinfo[0].thumburl = 'https://upload.wikimedia.org/example.png';
      return response({ json: payload, url: 'https://commons.wikimedia.org/w/api.php' });
    }
    return response({ bytes: new Uint8Array(), url: 'https://evil.example/redirected.png' });
  };
  await rename(localPath, backupPath);
  try {
    await assert.rejects(() => fetchCommonsAsset(definition, fetchImpl), /approved HTTPS hosts/i);
    assert.equal(apiCalls, 2);
  } finally {
    await rename(backupPath, localPath);
  }
});

test('rebuilds a corrupted resumed manifest from validated metadata and stable paths', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'hiphop-assets-manifest-'));
  const fixtureManifestPath = path.join(fixtureRoot, 'manifest.json');
  try {
    const corrupted = structuredClone(manifest);
    corrupted[0].id = '../../tools/fetch-assets';
    corrupted[0].variants['960'].path = '../../tools/fetch-assets.mjs';
    await writeFile(fixtureManifestPath, `${JSON.stringify(corrupted, null, 2)}\n`);
    let metadataCalls = 0;
    const fetchImpl = async (url) => {
      if (!url.includes('/w/api.php')) throw new Error(`unexpected byte request ${url}`);
      metadataCalls += 1;
      const parsed = new URL(url);
      const definition = assetDefinitions.find(({ commonsTitle }) => commonsTitle === parsed.searchParams.get('titles'));
      const payload = metadataPayload(definition);
      payload.query.pages[1].imageinfo[0].thumburl = manifest.find(({ id }) => id === definition.id).variants[parsed.searchParams.get('iiurlwidth')].sourceUrl;
      return response({ json: payload, url: 'https://commons.wikimedia.org/w/api.php' });
    };
    const rebuilt = await fetchAllAssets(fetchImpl, { manifestPath: fixtureManifestPath });
    assert.equal(metadataCalls, 20);
    assert.deepEqual(rebuilt.map(({ id }) => id), expectedAssets.map(([id]) => id));
    assert.equal(rebuilt[0].variants['960'].path, 'assets/hiphop-pakistan/mizraab-coke-studio-960.jpg');
    assert.deepEqual(JSON.parse(await readFile(fixtureManifestPath, 'utf8')), rebuilt);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
