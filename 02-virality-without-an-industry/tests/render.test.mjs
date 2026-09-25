import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import manifest from '../assets/hiphop-pakistan/manifest.json' with { type: 'json' };
import { chapters } from '../site/content/chapters/index.mjs';
import { escapeHtml, renderDocument } from '../site/render/document.mjs';
import { renderPathways } from '../site/render/pathways.mjs';
import { DOWNLOADS, renderRegistry } from '../site/render/registry.mjs';
import { loadResearchModel } from '../tools/lib/research-model.mjs';

const research = loadResearchModel(process.cwd());
const styles = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
const html = renderDocument({
  research,
  chapters,
  images: manifest,
  styles: '',
  interactions: '',
});

const count = (pattern, value = html) => value.match(pattern)?.length ?? 0;

function chapterMarkup(number, value = html) {
  const start = value.indexOf(`<section class="chapter`, value.indexOf(`data-chapter="${number}"`) - 80);
  const nextNumber = String(Number(number) + 1).padStart(2, '0');
  const end = number === '08' ? value.indexOf('</main>', start) : value.indexOf(`data-chapter="${nextNumber}"`, start);
  return value.slice(start, end);
}

test('renders one accessible document outline with all nine numbered chapters', () => {
  assert.equal(count(/<header\b/g), 1);
  assert.equal(count(/<nav\b/g), 1);
  assert.equal(count(/<main\b/g), 1);
  assert.equal(count(/<footer\b/g), 1);
  assert.equal(count(/<section\b[^>]*data-chapter="(?:0[0-8])"/g), 9);
  assert.equal(count(/<h2\b/g), 9);
  assert.match(html, /<a class="skip-link" href="#report">Skip to the report<\/a>/);
  assert.match(html, /<nav[^>]+aria-label="Report chapters"/);
  assert.match(html, /<h1[^>]*>Virality Without an Industry\?<\/h1>/);
  assert.match(html, /The Political Economy of Pakistan&#39;s Music Revival, 2014–2026/);
  for (const chapter of chapters) {
    assert.match(html, new RegExp(`data-chapter="${chapter.number}"`));
    assert.match(chapterMarkup(chapter.number), new RegExp(`<h2[^>]*>[\\s\\S]*${chapter.number}[\\s\\S]*${escapeHtml(chapter.title)}[\\s\\S]*<\\/h2>`));
  }
  assert.match(html, /<p class="side-label">Prelude<\/p>/);
  assert.match(html, /<p class="side-label">Side A — Circulation<\/p>/);
  assert.match(html, /<p class="side-label">Side B — Value<\/p>/);
  assert.match(html, /<p class="side-label">Liner Notes<\/p>/);
});

test('keeps all authored analysis, local references, and aggregated conclusion citations in static HTML', () => {
  for (const chapter of chapters) {
    const section = chapterMarkup(chapter.number);
    for (const block of chapter.blocks.filter(({ kind }) => kind === 'paragraph')) {
      assert.ok(section.includes(escapeHtml(block.text)), `${chapter.number}: missing paragraph`);
      for (const localRef of block.localRefs ?? []) {
        assert.ok(section.includes(`href="/${localRef}"`), `${chapter.number}: ${localRef}`);
      }
    }
    const conclusion = section.slice(section.indexOf('class="chapter-conclusion"'));
    assert.ok(conclusion.includes(escapeHtml(chapter.establishes)), `${chapter.number}: establishes`);
    assert.ok(conclusion.includes(escapeHtml(chapter.unknown)), `${chapter.number}: unknown`);
    const sourceIds = [...new Set(chapter.blocks.flatMap(({ sourceIds = [] }) => sourceIds))];
    for (const sourceId of sourceIds) {
      assert.ok(conclusion.includes(`href="#source-${sourceId}"`), `${chapter.number}: conclusion citation ${sourceId}`);
    }
  }
});

test('renders the complete unenhanced case pathways in source order', () => {
  const pathways = renderPathways(research.cases, new Map(research.allSources.map((source) => [source.sourceId, source])));
  assert.equal(count(/data-case="/g, pathways), 7);
  assert.equal(count(/data-case-view="circulation"/g, pathways), 7);
  assert.equal(count(/data-case-view="rights"/g, pathways), 7);
  assert.equal(count(/data-case-view="missingEvidence"/g, pathways), 7);
  for (const caseStudy of research.cases) {
    const caseStart = pathways.indexOf(`data-case="${caseStudy.id}"`);
    const circulation = pathways.indexOf('data-case-view="circulation"', caseStart);
    const rights = pathways.indexOf('data-case-view="rights"', caseStart);
    const missing = pathways.indexOf('data-case-view="missingEvidence"', caseStart);
    assert.ok(caseStart >= 0 && circulation > caseStart && rights > circulation && missing > rights, caseStudy.id);
    assert.ok(pathways.includes(escapeHtml(caseStudy.overclaimRisk)), `${caseStudy.id}: overclaim risk`);
    for (const sourceId of caseStudy.sourceIds) assert.ok(pathways.includes(`href="#source-${sourceId}"`), `${caseStudy.id}: ${sourceId}`);
  }
  assert.match(pathways, /Circulation/);
  assert.match(pathways, /Rights/);
  assert.match(pathways, /Missing evidence/);
});

test('renders all normalized sources with safe external links and searchable metadata', () => {
  const registry = renderRegistry(research.allSources);
  assert.equal(count(/data-source-id="/g, registry), 76);
  assert.equal(count(/data-verified-on="/g, registry), 76);
  for (const source of research.allSources) {
    const rowStart = registry.indexOf(`id="source-${source.sourceId}"`);
    const rowEnd = registry.indexOf('</article>', rowStart);
    const row = registry.slice(rowStart, rowEnd);
    assert.ok(registry.includes(`id="source-${source.sourceId}"`), source.sourceId);
    assert.ok(registry.includes(`data-origin="${escapeHtml(source.origin)}"`), `${source.sourceId}: origin`);
    assert.ok(registry.includes(`data-family="${escapeHtml(source.evidenceFamily)}"`), `${source.sourceId}: family`);
    assert.ok(registry.includes(escapeHtml(source.title)), `${source.sourceId}: title`);
    assert.ok(row.includes(`data-verified-on="${escapeHtml(source.verifiedOn)}"`), `${source.sourceId}: verified hook`);
    assert.ok(row.includes(escapeHtml(`Verified ${source.verifiedOn}`)), `${source.sourceId}: visible verification date`);
    const canonicalSearch = [source.title, source.organization, source.claimScope, source.limitation]
      .filter(Boolean).join(' ').toLocaleLowerCase('en');
    assert.ok(row.includes(`data-search="${escapeHtml(canonicalSearch)}"`), `${source.sourceId}: canonical search fields`);
  }
  assert.equal(count(/target="_blank"/g, registry), 76);
  assert.equal(count(/rel="noopener noreferrer"/g, registry), 76);
});

test('renders exactly the eleven real root-level downloads', () => {
  assert.equal(DOWNLOADS.length, 11);
  assert.equal(count(/data-download="/g), 11);
  for (const filename of DOWNLOADS) {
    assert.match(html, new RegExp(`href="/${filename.replaceAll('.', '\\.')}"`));
  }
  assert.doesNotMatch(html, /sampling.frame|template/i);
});

test('uses local responsive pictures with visible provenance and a non-collapsing missing-image fallback', () => {
  const opening = chapterMarkup('00');
  assert.equal(count(/<picture\b/g, opening), 3);
  assert.equal(count(/<figcaption\b/g, opening), 3);
  for (const imageId of ['mizraab-coke-studio', 'radio-pakistan-building', 'cell-towers-punjab']) {
    const item = manifest.find(({ id }) => id === imageId);
    assert.ok(opening.includes(item.variants['960'].path), imageId);
    assert.ok(opening.includes(`width="${item.variants['1800'].width}"`), `${imageId}: width`);
    assert.ok(opening.includes(`height="${item.variants['1800'].height}"`), `${imageId}: height`);
    assert.ok(opening.includes(escapeHtml(item.creator)), `${imageId}: creator`);
    assert.ok(opening.includes(escapeHtml(item.license)), `${imageId}: license`);
  }

  const missingManifest = manifest.map((image, index) => index === 0
    ? { ...image, variants: { ...image.variants, 960: { ...image.variants['960'], path: 'assets/hiphop-pakistan/not-present-960.jpg' }, 1800: { ...image.variants['1800'], path: 'assets/hiphop-pakistan/not-present-1800.jpg' } } }
    : image);
  const missingHtml = renderDocument({ research, chapters, images: missingManifest, styles: '', interactions: '' });
  assert.match(missingHtml, /data-image="mizraab-coke-studio"[\s\S]*Image unavailable[\s\S]*Dewaar[\s\S]*CC BY-SA 3\.0/);
});

test('preserves contact-image aspect ratios and manifest no-crop/no-grade provenance', () => {
  assert.doesNotMatch(styles, /\.contact-frame[^}]*aspect-ratio/s);
  assert.doesNotMatch(styles, /object-fit\s*:\s*cover/i);
  assert.doesNotMatch(styles, /filter\s*:\s*(?:saturate|contrast)/i);
});

test('keeps source blue above WCAG AA contrast on both paper surfaces', () => {
  const token = (name) => styles.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  const sourceBlue = token('source-blue');
  assert.ok(sourceBlue, 'source-blue token');
  for (const backgroundName of ['paper', 'paper-deep']) {
    const background = token(backgroundName);
    assert.ok(background, `${backgroundName} token`);
    const ratio = contrastRatio(sourceBlue, background);
    assert.ok(ratio >= 4.5, `${sourceBlue} on ${background} (${backgroundName}) has contrast ${ratio.toFixed(2)}:1`);
  }
});

test('prints exact package-root destinations for local references and downloads', () => {
  assert.match(styles, /@media print[\s\S]*\.local-reference::after,\s*\n\s*\[data-download\]::after\s*{[^}]*content:\s*' \(' attr\(href\) '\)'/);
  assert.doesNotMatch(styles, /\.local-reference::after,\s*\n\s*\.download-shelf a::after\s*{[^}]*content:\s*none/);
});

test('renders truthful Task 7 figures and methods while leaving Task 8 interactions absent', () => {
  const figureIds = chapters.flatMap(({ blocks }) => blocks.filter(({ kind }) => kind === 'figure').map(({ figureId }) => figureId));
  for (const figureId of figureIds) assert.match(html, new RegExp(`data-figure="${figureId}"`));
  assert.match(html, /data-module="methods-architecture"/);
  assert.equal(count(/<svg\b/g), 7);
  assert.equal(count(/<title\b/g), 8); // Seven SVG titles plus the document title.
  assert.equal(count(/<desc\b/g), 7);
  assert.doesNotMatch(html, /class="figure-hook"/);
  assert.doesNotMatch(html, /data-pathway-tab|role="tab"/);
});

test('contains no external runtime dependencies and only inlines supplied assets', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+(?:stylesheet|preload)/);
  assert.doesNotMatch(html, /(?:src|srcset)=["'][^"']*https?:/i);
  assert.doesNotMatch(html, /url\(["']?https?:/i);
  assert.equal(count(/<style\b/g), 0);
  assert.equal(count(/<script\b/g), 0);

  const enhanced = renderDocument({ research, chapters, images: manifest, styles, interactions: 'document.documentElement.dataset.enhanced = "true";' });
  assert.equal(count(/<style\b/g, enhanced), 1);
  assert.equal(count(/<script type="module">/g, enhanced), 1);
  assert.ok(enhanced.includes(styles));
});

test('escapes renderer-controlled text and rejects unresolved citations', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  const poisoned = structuredClone(chapters);
  poisoned[0].blocks[0].text = '<script>alert("x")</script>';
  const poisonedHtml = renderDocument({ research, chapters: poisoned, images: manifest, styles: '', interactions: '' });
  assert.doesNotMatch(poisonedHtml, /<script>alert/);
  assert.match(poisonedHtml, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);

  const unresolved = structuredClone(chapters);
  unresolved[0].blocks[0].sourceIds = ['NOT-A-SOURCE'];
  assert.throws(() => renderDocument({ research, chapters: unresolved, images: manifest, styles: '', interactions: '' }), /unknown source ID: NOT-A-SOURCE/);
});

test('rejects adversarial structured chapter and image attributes before rendering', () => {
  const chapterInjection = structuredClone(chapters);
  chapterInjection[1].number = '01" onmouseover="alert(1)';
  assert.throws(
    () => renderDocument({ research, chapters: chapterInjection, images: manifest, styles: '', interactions: '' }),
    /ordered chapter numbers 00 through 08/,
  );

  for (const dimension of ['589" onerror="alert(2)', 0, Number.NaN, 12.5]) {
    const dimensionInjection = structuredClone(manifest);
    dimensionInjection[0].variants['1800'].width = dimension;
    assert.throws(
      () => renderDocument({ research, chapters, images: dimensionInjection, styles: '', interactions: '' }),
      /finite positive integer image dimensions/,
      String(dimension),
    );
  }

  const pathInjection = structuredClone(manifest);
  pathInjection[0].variants['960'].path = 'assets/hiphop-pakistan/mizraab-coke-studio-960.jpg" onerror="alert(3)';
  assert.throws(
    () => renderDocument({ research, chapters, images: pathInjection, styles: '', interactions: '' }),
    /safe project-local image path/,
  );
});

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
