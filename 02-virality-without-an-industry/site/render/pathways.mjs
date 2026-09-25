import { escapeHtml, renderCitationLinks } from './registry.mjs';

const CASE_TITLES = Object.freeze({
  'lyari-underground': 'Lyari Underground / LUG Sounds',
  'eva-b': 'Eva B',
  'abid-brohi': 'Abid Brohi / Patari Tabeer',
  'shae-gill': 'Shae Gill and “Pasoori”',
  'young-stunners': 'Young Stunners, Talha Anjum, and Umair',
  'abdullah-siddiqui': 'Abdullah Siddiqui',
  'arooj-aftab': 'Arooj Aftab',
});

const VIEW_LABELS = Object.freeze({
  circulation: 'Circulation',
  rights: 'Rights',
  missingEvidence: 'Missing evidence',
});

export function renderPathways(cases, providedSourceIndex) {
  const sourceIndex = providedSourceIndex ?? new Map(
    cases.flatMap(({ sourceIds }) => sourceIds).map((sourceId) => [sourceId, { sourceId }]),
  );

  const pathways = cases.map((caseStudy, index) => {
    const views = Object.keys(VIEW_LABELS).map((view) => `<div class="case-view case-view--${escapeHtml(view)}" data-case-view="${escapeHtml(view)}">
  <h4>${VIEW_LABELS[view]}</h4>
  <p>${escapeHtml(caseStudy.views[view])}</p>
</div>`).join('\n');

    return `<article class="case-pathway" data-case="${escapeHtml(caseStudy.id)}">
  <div class="case-pathway__header">
    <span class="case-number">Case ${String(index + 1).padStart(2, '0')}</span>
    <h3>${escapeHtml(CASE_TITLES[caseStudy.id] ?? caseStudy.id)}</h3>
    <p class="case-sources">Case evidence ${renderCitationLinks(caseStudy.sourceIds, sourceIndex)}</p>
  </div>
  <div class="case-views">${views}</div>
  <p class="overclaim-risk"><strong>Overclaim risk.</strong> ${escapeHtml(caseStudy.overclaimRisk)}</p>
</article>`;
  }).join('\n');

  return `<div class="pathway-comparison" data-module="case-pathways">
  <div class="pathway-key">
    <p class="eyebrow">Case evidence</p>
    <h3>Seven routes through an unfinished system</h3>
    <p>Each route keeps documented circulation, unanswered rights questions, and missing outcomes in the same source order. No line width or layout position represents money, popularity, or causal weight.</p>
  </div>
  ${pathways}
</div>`;
}
