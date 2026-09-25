import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFigure } from './figures.mjs';
import { renderPathways } from './pathways.mjs';
import {
  escapeHtml,
  localDownloadHref,
  renderCitationLinks,
  renderDownloads,
  renderPhotoCredits,
  renderRegistry,
  safeExternalUrl,
} from './registry.mjs';

export { escapeHtml, renderCitationLinks } from './registry.mjs';

const sourceProjectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const NAV_LABELS = Object.freeze({
  '00': 'Opening',
  '01': 'Infrastructure',
  '02': 'Distribution',
  '03': 'Evidence',
  '04': 'Propositions',
  '05': 'Pathways',
  '06': 'Methods',
  '07': 'Rights',
  '08': 'Sources',
});

export function renderDocument({ research, chapters, images, styles, interactions, rootDir = sourceProjectRoot }) {
  assertRenderInputs(research, chapters, images, styles, interactions);
  if (typeof rootDir !== 'string' || rootDir.length === 0) throw new TypeError('rootDir must be a non-empty string');
  const renderRoot = resolve(rootDir);
  const sourceIndex = new Map(research.allSources.map((source) => [source.sourceId, source]));
  const imageIndex = new Map(images.map((image) => [image.id, image]));
  const navigation = chapters.map((chapter, index) => {
    const shortLabel = NAV_LABELS[chapter.number];
    if (!shortLabel) throw new TypeError(`chapter ${chapter.number} has no navigation label`);
    return `<li><a href="#chapter-${escapeHtml(chapter.number)}" data-chapter-link="${escapeHtml(chapter.number)}" aria-label="Chapter ${escapeHtml(chapter.number)}: ${escapeHtml(chapter.title)}"${index === 0 ? ' aria-current="step"' : ''}><span class="chapter-nav__number" aria-hidden="true">${escapeHtml(chapter.number)}</span><span class="chapter-nav__label" aria-hidden="true">${escapeHtml(shortLabel)}</span></a></li>`;
  }).join('\n');
  const renderedChapters = chapters.map((chapter) => chapter.number === '00'
    ? renderOpening(chapter, imageIndex, sourceIndex, renderRoot)
    : renderChapter(chapter, research, images, sourceIndex)).join('\n');
  const styleTag = styles ? `<style>\n${styles}\n</style>` : '';
  const scriptTag = interactions ? `\n<script type="module">\n${interactions}\n</script>` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A source-backed editorial investigation of distribution, visibility, rights, and livelihood in Pakistan’s changing music economy.">
  <title>Virality Without an Industry? — HipHop Pakistan</title>
  ${styleTag}
</head>
<body>
  <a class="skip-link" href="#report">Skip to the report</a>
  <button class="theme-toggle" type="button" data-theme-toggle data-enhancement-control hidden aria-pressed="false" aria-label="Switch color theme">Dark</button>
  <nav class="chapter-nav" aria-label="Report chapters">
    <a class="nav-mark" href="#chapter-00" aria-label="Return to Prelude">Living Liner Notes</a>
    <p class="chapter-nav__group" data-current-group>Prelude</p>
    <ol>${navigation}</ol>
    <span class="signal-path" data-signal-path aria-hidden="true"></span>
  </nav>
  <main id="report">
${renderedChapters}
  </main>
  <footer>
    <p><strong>HipHop Pakistan · Living Liner Notes</strong></p>
    <p>This locally generated research publication uses package-local images and documents. It loads no external runtime assets, analytics, or trackers.</p>
    <p>Prepared 23 August 2026 · Quantitative window 2014–2025 · 2026 epilogue only · Mixed methods</p>
  </footer>${scriptTag}
</body>
</html>`;
}

function renderOpening(chapter, imageIndex, sourceIndex, rootDir) {
  const number = escapeHtml(chapter.number);
  const contactSheetBlock = chapter.blocks.find(({ kind }) => kind === 'contact-sheet');
  const paragraphs = chapter.blocks.filter(({ kind }) => kind === 'paragraph');
  const [lead, ...analysis] = paragraphs;
  return `    <section class="chapter chapter--opening hero-grid" id="chapter-${number}" data-chapter="${number}" aria-labelledby="chapter-${number}-title">
      <header class="hero-copy">
        <p class="kicker">Research design and evidence map</p>
        <p class="side-label">${escapeHtml(chapter.group)}</p>
        <h1>${escapeHtml(chapter.headline)}</h1>
        <p class="deck">${escapeHtml(chapter.deck)}</p>
        <p class="framing-line">A research design, not a victory lap.</p>
      </header>
      <div class="opening-analysis opening-analysis--lead">
        <h2 id="chapter-${number}-title"><span>${number}</span> ${escapeHtml(chapter.title)}</h2>
        ${renderParagraph(lead, sourceIndex)}
      </div>
      ${renderContactSheet(contactSheetBlock.imageIds, imageIndex, rootDir)}
      <aside class="field-note" aria-label="Opening field notes">
        <p class="eyebrow">Field notes</p>
        <p>Attention is easier to observe than livelihoods.</p>
        <p>Findings require full data collection and analysis.</p>
        <p class="note-date">23 Aug 2026</p>
      </aside>
      <div class="opening-analysis opening-analysis--body chapter-body">
        ${analysis.map((block) => renderParagraph(block, sourceIndex)).join('\n')}
        ${renderConclusion(chapter, sourceIndex)}
      </div>
    </section>`;
}

function renderChapter(chapter, research, images, sourceIndex) {
  const number = escapeHtml(chapter.number);
  const body = chapter.blocks.map((block) => renderBlock(block, research, images, sourceIndex)).join('\n');
  return `    <section class="chapter" id="chapter-${number}" data-chapter="${number}" aria-labelledby="chapter-${number}-title">
      <div class="chapter-heading">
        <p class="side-label">${escapeHtml(chapter.group)}</p>
        <h2 id="chapter-${number}-title"><span>${number}</span> ${escapeHtml(chapter.title)}</h2>
      </div>
      <div class="chapter-layout">
        <div class="chapter-body">
${body}
          ${renderConclusion(chapter, sourceIndex)}
        </div>
        <aside class="field-note" aria-label="Chapter ${number} evidence note">
          <p class="eyebrow">Field note ${number}</p>
          <p>${escapeHtml(chapter.unknown)}</p>
        </aside>
      </div>
    </section>`;
}

function renderBlock(block, research, images, sourceIndex) {
  switch (block.kind) {
    case 'paragraph':
      return renderParagraph(block, sourceIndex);
    case 'figure':
      return renderFigure(block.figureId, research);
    case 'case-pathways':
      return renderPathways(research.cases, sourceIndex);
    case 'methods':
      return renderFigure(block.moduleId, research);
    case 'registry':
      return `${renderRegistryControls()}\n${renderRegistry(research.allSources)}`;
    case 'downloads':
      return `${renderDownloads()}\n${renderPhotoCredits(images)}`;
    case 'contact-sheet':
      throw new Error('contact-sheet blocks are only supported in Chapter 00');
    default:
      throw new Error(`unknown chapter block kind: ${block.kind}`);
  }
}

function renderParagraph(block, sourceIndex) {
  const citations = renderCitationLinks(block.sourceIds, sourceIndex);
  const localRefs = (block.localRefs ?? []).map((filename) => {
    const href = localDownloadHref(filename);
    return `<a class="local-reference" href="${escapeHtml(href)}">${escapeHtml(filename)}</a>`;
  }).join(' ');
  const notes = [citations, localRefs].filter(Boolean).join(' ');
  return `<div class="prose-block"${block.caseId ? ` data-case-prose="${escapeHtml(block.caseId)}"` : ''}>
  <p>${escapeHtml(block.text)}</p>
  ${notes ? `<p class="source-note"><span>${block.claimMode === 'context' ? 'Package references' : 'Sources'}</span> ${notes}</p>` : ''}
</div>`;
}

function renderConclusion(chapter, sourceIndex) {
  const sourceIds = [...new Set(chapter.blocks.flatMap(({ sourceIds = [] }) => sourceIds))];
  const citations = renderCitationLinks(sourceIds, sourceIndex);
  return `<div class="chapter-conclusion" data-reveal>
  <div><h3>What this establishes</h3><p>${escapeHtml(chapter.establishes)}</p></div>
  <div><h3>What remains unknown</h3><p>${escapeHtml(chapter.unknown)}</p></div>
  ${citations ? `<p class="conclusion-sources"><span>Chapter sources</span> ${citations}</p>` : ''}
</div>`;
}

function renderContactSheet(imageIds, imageIndex, rootDir) {
  const frames = imageIds.map((imageId, index) => {
    const image = imageIndex.get(imageId);
    if (!image) throw new Error(`unknown image ID: ${imageId}`);
    const small = image.variants?.['960'];
    const large = image.variants?.['1800'];
    const present = small && large
      && existsSync(resolve(rootDir, small.path))
      && existsSync(resolve(rootDir, large.path));
    const media = present ? `<picture>
  <source srcset="${escapeHtml(small.path)} ${escapeHtml(small.width)}w, ${escapeHtml(large.path)} ${escapeHtml(large.width)}w" sizes="(min-width: 1180px) 20vw, (min-width: 700px) 31vw, 100vw">
  <img src="${escapeHtml(small.path)}" width="${escapeHtml(large.width)}" height="${escapeHtml(large.height)}" alt="${escapeHtml(image.alt)}"${index > 0 ? ' loading="lazy"' : ''} decoding="async">
</picture>` : '<div class="image-fallback" role="img" aria-label="Image unavailable">Image unavailable</div>';
    const filePage = safeExternalUrl(image.filePage, `${image.id} file page`);
    const licenseUrl = safeExternalUrl(image.licenseUrl, `${image.id} license URL`);
    return `<figure class="contact-frame" data-image="${escapeHtml(image.id)}" data-reveal>
  <span class="frame-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
  ${media}
  <figcaption>
    <strong>${escapeHtml(image.alt)}</strong>
    <span>${escapeHtml(image.status)} · ${escapeHtml(image.creator)} · ${escapeHtml(image.date)}</span>
    <span><a href="${escapeHtml(filePage)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> · <a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(image.license)}</a></span>
    <span>${escapeHtml(image.modifications)} · Rights checked ${escapeHtml(image.rightsCheckedOn)}</span>
  </figcaption>
</figure>`;
  }).join('\n');
  return `<div class="contact-sheet" aria-label="Opening photographic contact sheet">${frames}</div>`;
}

function renderRegistryControls() {
  return `<form class="registry-controls" data-registry-controls data-enhancement-control hidden>
  <div>
    <label for="source-query">Search sources</label>
    <input id="source-query" type="search" data-source-query autocomplete="off">
  </div>
  <div>
    <label for="source-origin">Registry origin</label>
    <select id="source-origin" data-source-origin>
      <option value="All sources">All sources</option>
      <option value="Starter archive">Starter archive</option>
      <option value="Live research expansion">Live research expansion</option>
    </select>
  </div>
  <button type="button" data-source-reset>Reset filters</button>
</form>`;
}

function assertRenderInputs(research, chapters, images, styles, interactions) {
  if (!research || !Array.isArray(research.allSources) || !Array.isArray(research.cases)) {
    throw new TypeError('research must be a normalized ResearchModel');
  }
  if (!Array.isArray(chapters) || chapters.length !== 9) throw new TypeError('chapters must contain the nine ordered chapters');
  const expectedChapterNumbers = ['00', '01', '02', '03', '04', '05', '06', '07', '08'];
  if (chapters.some((chapter, index) => chapter.number !== expectedChapterNumbers[index])) {
    throw new TypeError('chapters must use ordered chapter numbers 00 through 08');
  }
  if (!Array.isArray(images)) throw new TypeError('images must be an image manifest array');
  for (const image of images) validateImageRecord(image);
  if (typeof styles !== 'string' || typeof interactions !== 'string') throw new TypeError('styles and interactions must be strings');
}

function validateImageRecord(image) {
  const dimensionRecords = [image, image.variants?.['960'], image.variants?.['1800']];
  for (const record of dimensionRecords) {
    if (!record || !Number.isFinite(record.width) || !Number.isInteger(record.width) || record.width <= 0
      || !Number.isFinite(record.height) || !Number.isInteger(record.height) || record.height <= 0) {
      throw new TypeError('manifest must contain finite positive integer image dimensions');
    }
  }
  for (const size of ['960', '1800']) {
    const safePath = new RegExp(`^assets/hiphop-pakistan/[a-z0-9]+(?:-[a-z0-9]+)*-${size}\\.jpg$`, 'u');
    if (!safePath.test(image.variants[size].path)) {
      throw new TypeError(`manifest must use a safe project-local image path ending in -${size}.jpg`);
    }
  }
}
