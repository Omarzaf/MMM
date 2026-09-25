export const DOWNLOADS = Object.freeze([
  'source_map.csv',
  'annotated_bibliography.csv',
  'proposition_matrix.csv',
  'analysis_plan.md',
  'data_collection_protocol.md',
  'interview_guide.md',
  'content_analysis_codebook.md',
  'research_ethics_protocol.md',
  'fieldwork_schedule.csv',
  'track_dataset_codebook.csv',
  'artist_dataset_codebook.csv',
]);

const DOWNLOAD_LABELS = Object.freeze({
  'source_map.csv': 'Source map',
  'annotated_bibliography.csv': 'Annotated bibliography',
  'proposition_matrix.csv': 'Proposition matrix',
  'analysis_plan.md': 'Analysis plan',
  'data_collection_protocol.md': 'Data collection protocol',
  'interview_guide.md': 'Interview guide',
  'content_analysis_codebook.md': 'Content analysis codebook',
  'research_ethics_protocol.md': 'Research ethics protocol',
  'fieldwork_schedule.csv': 'Fieldwork schedule',
  'track_dataset_codebook.csv': 'Track dataset codebook',
  'artist_dataset_codebook.csv': 'Artist dataset codebook',
});

export const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function renderCitationLinks(sourceIds, sourceIndex) {
  return sourceIds.map((id) => {
    const source = sourceIndex.get(id);
    if (!source) throw new Error(`unknown source ID: ${id}`);
    return `<a class="citation" href="#source-${escapeHtml(id)}" aria-label="Source ${escapeHtml(id)}">${escapeHtml(id)}</a>`;
  }).join(' ');
}

export function renderRegistry(sources) {
  const rows = sources.map((source) => {
    const href = safeExternalUrl(source.url, `${source.sourceId} source URL`);
    const searchText = [
      source.title,
      source.organization,
      source.claimScope,
      source.limitation,
    ].filter(Boolean).join(' ').toLocaleLowerCase('en');

    return `<article class="source-entry" id="source-${escapeHtml(source.sourceId)}" data-source-id="${escapeHtml(source.sourceId)}" data-origin="${escapeHtml(source.origin)}" data-family="${escapeHtml(source.evidenceFamily)}" data-verified-on="${escapeHtml(source.verifiedOn)}" data-search="${escapeHtml(searchText)}">
  <div class="source-entry__identity">
    <span class="source-id">${escapeHtml(source.sourceId)}</span>
    <span class="source-origin">${escapeHtml(source.origin)}</span>
  </div>
  <h3>${escapeHtml(source.title)}</h3>
  <p class="source-byline">${escapeHtml(source.organization)}${source.publicationDate ? ` · ${escapeHtml(source.publicationDate)}` : ''}</p>
  <p class="source-verified">${escapeHtml(`Verified ${source.verifiedOn}`)}</p>
  <p><span class="evidence-tag">${escapeHtml(source.evidenceClass)}</span> ${escapeHtml(source.evidenceFamily)} · Tier ${escapeHtml(source.qualityTier)}</p>
  <p>${escapeHtml(source.claimScope)}</p>
  <p class="source-limitation"><strong>Limitation.</strong> ${escapeHtml(source.limitation)}</p>
  <p><a class="external-source" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Open original source <span aria-hidden="true">↗</span></a></p>
</article>`;
  }).join('\n');

  return `<div class="registry" data-module="source-registry">
  <div class="registry-intro">
    <p class="eyebrow">Source registry</p>
    <h3>Public record, with its limits attached</h3>
    <p><strong>${sources.length} sources.</strong> Every row retains its archive origin, evidence family, claim scope, and limitation. Search and origin filters may progressively enhance this complete list; the unenhanced document keeps every entry visible.</p>
    <p class="registry-count" data-registry-count aria-live="polite">Showing all ${sources.length} sources</p>
  </div>
  <div class="source-list">${rows}</div>
</div>`;
}

export function renderDownloads() {
  const links = DOWNLOADS.map((filename, index) => `<li>
  <a data-download="${escapeHtml(filename)}" href="/${escapeHtml(filename)}">
    <span class="download-number">${String(index + 1).padStart(2, '0')}</span>
    <span>${escapeHtml(DOWNLOAD_LABELS[filename])}</span>
    <span class="download-type">${escapeHtml(filename.split('.').at(-1).toUpperCase())}</span>
  </a>
</li>`).join('\n');

  return `<div class="download-shelf" data-module="downloads">
  <p class="eyebrow">Research instruments</p>
  <h3>Download the working file</h3>
  <p>Eleven package-root documents expose the source map, coding decisions, propositions, fieldwork design, and ethical safeguards behind this publication.</p>
  <ol>${links}</ol>
</div>`;
}

export function renderPhotoCredits(images) {
  const credits = images.map((image) => {
    const filePage = safeExternalUrl(image.filePage, `${image.id} file page`);
    const licenseUrl = safeExternalUrl(image.licenseUrl, `${image.id} license URL`);
    return `<li data-photo-credit="${escapeHtml(image.id)}">
  <strong>${escapeHtml(image.alt)}</strong>
  <span>${escapeHtml(image.status)} · ${escapeHtml(image.creator)} · ${escapeHtml(image.date)} · <a href="${escapeHtml(filePage)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons file page</a> · <a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(image.license)}</a>.</span>
  <span>${escapeHtml(image.modifications)}. Rights checked ${escapeHtml(image.rightsCheckedOn)}.</span>
</li>`;
  }).join('\n');

  return `<div class="photo-register">
  <p class="eyebrow">Image license register</p>
  <h3>Credits and permitted reuse</h3>
  <ol>${credits}</ol>
</div>`;
}

export function localDownloadHref(filename) {
  if (!DOWNLOADS.includes(filename)) throw new Error(`unsafe or unavailable local reference: ${filename}`);
  return `/${filename}`;
}

export function safeExternalUrl(value, label = 'external URL') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  return url.href;
}
