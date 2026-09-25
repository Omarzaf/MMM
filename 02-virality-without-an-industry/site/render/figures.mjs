import {
  escapeHtml,
  localDownloadHref,
  renderCitationLinks,
} from './registry.mjs';
import { assertResearchModel } from '../../tools/lib/research-model.mjs';

const TIMELINE = Object.freeze([
  ['2014', 'Mobile broadband transition', ['S002']],
  ['2015', 'Local streaming experiments', ['S015', 'S016']],
  ['2016', 'YouTube restored', ['S004']],
  ['2017–19', 'Local-platform instability and intermediary dependence', ['S017', 'S018']],
  ['2020', 'Methodological period break', []],
  ['2021', 'Spotify entry', ['S005']],
  ['2022', 'Global breakthrough cases', ['S006', 'S011']],
  ['2023', 'Policy and institutional claims', ['S013', 'S014']],
  ['2024', 'Global-label connection', ['S009', 'S010']],
  ['2025', 'Platform-regulation context', ['S035']],
  ['2026', 'Incomplete-year epilogue', ['L019', 'L020', 'L021']],
]);

const POLICY_PROBLEMS = Object.freeze([
  'Weak copyright enforcement',
  'Fragmented royalty collection',
  'Missing archives',
  'Limited infrastructure',
]);

const POLICY_PROPOSALS = Object.freeze([
  'Registration',
  'Licensing',
  'Welfare',
  'Education',
  'Archive',
  'Enforcement',
]);

const MISSING_SERIES = Object.freeze([
  'Recorded-music revenue',
  'Artist royalty payments',
  'Music employment',
  'Contract prevalence',
  'Venue counts',
  'Payment delays',
  'Publishing collection',
  'Master ownership shares',
]);

const MEASUREMENT_DIMENSIONS = Object.freeze([
  ['Cultural production', 'Candidate-universe releases, genre and language diversity, collaboration, entry route, and producer-network breadth.'],
  ['Audience attention', 'Platform-specific observations, chart entry, duration, search interest, short-form reuse, and persistence—kept separate by platform.'],
  ['Economic sustainability', 'Music-income share, revenue diversity, payment delays, unpaid work, fees or royalties, outside support, and career continuity.'],
  ['Institutional maturity', 'Contracts, ownership, metadata, intermediaries, rights administration, venues, finance, and dispute pathways.'],
  ['Social inclusion', 'Representation by gender, language, region, city, and class access, followed by ownership, payment, credit, and decision power.'],
  ['Internationalization', 'Foreign chart entry, audience geography, diaspora collaboration, touring, international intermediaries, awards, placements, and revenue geography.'],
]);

const DISTRIBUTION_STAGES = Object.freeze([
  ['01', 'Local production', 'Peer crews, rooms, neighborhood studios, and independent releases create the work.'],
  ['02', 'Platform or branded amplification', 'Local services, video platforms, playlists, and sponsored programmes select and amplify some releases.'],
  ['03', 'Global circulation', 'Diaspora networks, global platforms, media, awards, and rights-holder partnerships move selected work farther.'],
  ['04', 'Unresolved rights and income', 'Public sources rarely disclose ownership, settlement, payment timing, or durable livelihood.'],
]);

const RENDERERS = Object.freeze({
  broadband: renderBroadband,
  traffic: renderTraffic,
  timeline: renderTimeline,
  'spotify-pulse': renderSpotifyPulse,
  'distribution-stage': renderDistributionStages,
  'research-architecture': renderResearchArchitecture,
  'source-family': renderSourceFamilies,
  'quality-tier': renderQualityTiers,
  'evidence-matrix': renderEvidenceMatrix,
  'livelihood-snapshot': renderLivelihood,
  'proposition-ledger': renderPropositions,
  'methods-architecture': renderMethods,
  'policy-spread': renderPolicySpread,
  'missing-ledger': renderMissingLedger,
});

export function renderFigure(figureId, model) {
  const renderer = RENDERERS[figureId];
  if (!renderer) throw new Error(`unknown figure ID: ${figureId}`);
  assertResearchModel(model);
  return renderer(model);
}

function renderBroadband(model) {
  const { broadband } = model.figures;
  const historicalValues = broadband.historical.map(({ subscriptions }) => subscriptions / 1_000_000);
  const currentValues = broadband.current.map(({ subscriptionsMillions }) => subscriptionsMillions);
  const panels = [
    renderLinePanel({
      id: 'broadband-historical',
      title: 'Historical broadband subscriptions, 2014–15 to 2020–21',
      desc: 'Official subscription counts from the Pakistan Economic Survey 2021–22 edition. The series rises from 16,885,518 to 102,699,967 subscriptions.',
      labels: broadband.historical.map(({ period }) => period),
      values: historicalValues,
    }),
    renderLinePanel({
      id: 'broadband-current',
      title: 'Current broadband subscriptions, 2021–22 to March 2026',
      desc: 'Official subscription totals in millions from the Pakistan Economic Survey 2025–26 edition. Penetration is listed in the adjacent value table.',
      labels: broadband.current.map(({ period }) => period),
      values: currentValues,
    }),
  ].map((svg, index) => `<div class="chart-panel">
  <p class="chart-panel__edition">${index === 0 ? '2021–22 survey edition' : '2025–26 survey edition'}</p>
  <p class="chart-panel__scale">Shared scale: 0–170 million subscriptions</p>
  ${svg}
</div>`).join('\n');

  const rows = [
    ...broadband.historical.map(({ period, subscriptions }) => [period, formatInteger(subscriptions), '—', '2021–22 edition']),
    ...broadband.current.map(({ period, subscriptionsMillions, penetrationPercent }) => [period, `${formatInteger(subscriptionsMillions)} million`, `${penetrationPercent.toFixed(1)}%`, '2025–26 edition']),
  ];

  return figureShell({
    model,
    id: 'broadband',
    evidenceClass: broadband.evidenceClass,
    title: 'National distribution infrastructure',
    summary: 'Two official panels preserve separate survey editions while using one declared vertical scale for honest visual comparison.',
    unit: 'Millions of subscriptions on a shared 0–170 million scale; current-series penetration is percent',
    body: `<div class="figure-grid figure-grid--two">${panels}</div>`,
    values: valueTable('Broadband values by named survey edition', ['Period', 'Subscriptions', 'Penetration', 'Series provenance'], rows),
    sourceIds: ['L001', 'L002'],
    limitation: broadband.mandatoryCaption,
  });
}

function renderTraffic(model) {
  const { traffic } = model.figures;
  const rows = traffic.map(({ period, mobilePb, fixedPb, officialTotalPb }) => [
    period,
    formatInteger(mobilePb),
    formatInteger(fixedPb),
    formatInteger(officialTotalPb),
  ]);
  const max = 32_000;
  const bars = traffic.map(({ period, mobilePb, fixedPb, officialTotalPb }, index) => {
    const y = 30 + index * 42;
    const mobileWidth = mobilePb / max * 520;
    const fixedWidth = fixedPb / max * 520;
    return `<g class="chart-mark" data-period="${escapeHtml(period)}">
  <text x="0" y="${y + 14}">${escapeHtml(period)}</text>
  <rect class="chart-bar chart-bar--primary" data-series="mobile" x="155" y="${y}" width="${round(mobileWidth)}" height="18"></rect>
  <text class="traffic-segment-cue" x="${round(155 + mobileWidth / 2)}" y="${y + 13}" text-anchor="middle">M</text>
  <rect class="chart-bar chart-bar--secondary" data-series="fixed" x="${round(155 + mobileWidth)}" y="${y}" width="${round(fixedWidth)}" height="18"></rect>
  <text class="traffic-segment-cue" x="${round(155 + mobileWidth + fixedWidth / 2)}" y="${y + 13}" text-anchor="middle">F</text>
  <text x="690" y="${y + 14}" text-anchor="end">${formatInteger(officialTotalPb)} PB</text>
</g>`;
  }).join('\n');
  const last = traffic.at(-1);
  const componentTotal = last.mobilePb + last.fixedPb;
  const discrepancy = last.officialTotalPb - componentTotal;
  const svg = `<svg class="quant-chart" viewBox="0 0 700 245" role="img" aria-labelledby="traffic-title traffic-desc">
  <title id="traffic-title">Mobile and fixed telecom data traffic, 2021–22 to the 2025–26 estimate</title>
  <desc id="traffic-desc">Five stacked bars show official mobile and fixed petabyte components. The final components sum to ${formatInteger(componentTotal)} petabytes while the official total is ${formatInteger(last.officialTotalPb)}.</desc>
  ${bars}
</svg>`;

  return figureShell({
    model,
    id: 'traffic',
    evidenceClass: 'Official series',
    title: 'Total telecom data traffic',
    summary: 'Official mobile and fixed components are stacked while the stated official total remains visible in the table.',
    unit: 'Petabytes (PB)',
    body: `<ul class="chart-legend" aria-label="Traffic series legend">
  <li data-legend-series="mobile"><span class="chart-legend__key chart-legend__key--mobile">M</span><strong>Mobile traffic</strong><small>left segment · solid</small></li>
  <li data-legend-series="fixed"><span class="chart-legend__key chart-legend__key--fixed">F</span><strong>Fixed traffic</strong><small>right segment · outlined</small></li>
</ul>
${chartViewport(svg, 'Mobile and fixed telecom data traffic', 'traffic')}
<p class="figure-discrepancy"><strong>Table note.</strong> In 2025–26, the components sum to ${formatInteger(componentTotal)} PB; the official total is ${formatInteger(last.officialTotalPb)} PB, a ${numberWord(discrepancy)}-petabyte discrepancy preserved from the source.</p>`,
    values: valueTable('Official traffic components and totals', ['Period', 'Mobile PB', 'Fixed PB', 'Official total PB'], rows),
    sourceIds: ['L002'],
    limitation: 'Total telecom data traffic is not music traffic.',
  });
}

function renderLivelihood(model) {
  const rows = model.figures.livelihood.map(({ region, sample, projectPaidPercent, around35000Percent, above100000Percent }) => [
    region,
    String(sample),
    `${projectPaidPercent}%`,
    `${around35000Percent}%`,
    `${above100000Percent}%`,
  ]);
  const groups = model.figures.livelihood.map((record, groupIndex) => {
    const x = groupIndex * 240;
    const marks = [
      ['Project-paid', record.projectPaidPercent],
      ['Around PKR 35,000/month', record.around35000Percent],
      ['Above PKR 100,000/month', record.above100000Percent],
    ].map(([label, value], rowIndex) => {
      const y = 50 + rowIndex * 46;
      return `<text x="${x}" y="${y}">${escapeHtml(label)}</text>
<rect class="chart-bar" x="${x}" y="${y + 10}" width="${round(value * 1.8)}" height="13"></rect>
<text x="${x + 188}" y="${y + 22}" text-anchor="end">${value}%</text>`;
    }).join('\n');
    return `<g class="small-multiple" data-region="${escapeHtml(record.region)}">
  <text class="small-multiple__title" x="${x}" y="18">${escapeHtml(shortRegion(record.region))}</text>
  <text x="${x}" y="35">n=${record.sample}</text>
  ${marks}
</g>`;
  }).join('\n');
  const svg = `<svg class="quant-chart" viewBox="0 0 720 205" role="img" aria-labelledby="livelihood-title livelihood-desc">
  <title id="livelihood-title">Three regional music-livelihood sample snapshots</title>
  <desc id="livelihood-desc">Purposive subsamples of 30, 10, and 10 respondents compare project-paid work and two monthly-income bands. These are not population estimates.</desc>
  ${groups}
</svg>`;

  return figureShell({
    model,
    id: 'livelihood-snapshot',
    evidenceClass: 'Purposive sample',
    title: 'Music-livelihood sample snapshots',
    summary: 'Three regional small multiples reproduce the report’s music subsamples without turning them into national estimates.',
    unit: 'Percent of each regional music subsample; sample size shown as n',
    body: `<div class="sample-warning" role="note">
  <strong>Purposive sample</strong>
  <span>n=50 music respondents</span>
  <span>all respondents male</span>
  <span>not nationally representative</span>
  <p>The all-male pool is a coverage limitation, not evidence that women are absent from music work.</p>
</div>
${chartViewport(svg, 'Three regional music-livelihood sample snapshots', 'livelihood')}`,
    values: valueTable('Reported livelihood observations by purposive regional music subsample', ['Region', 'Music sample', 'Project-paid', 'Around PKR 35,000/month', 'Above PKR 100,000/month'], rows),
    sourceIds: ['L022', 'L023'],
    limitation: 'Purposive sample; n=50 music respondents; all respondents male; not nationally representative.',
  });
}

function renderSourceFamilies(model) {
  const order = ['Scholarship', 'Platform / industry first-party', 'Journalism', 'Official / primary', 'Civil society / monitoring'];
  const rows = order.map((label) => [label, String(model.sourceFamilyCounts[label])]);
  return barFigure({
    id: 'source-family',
    evidenceClass: 'Research target',
    evidenceSubtype: 'Archive composition',
    title: 'Starter-source families',
    summary: 'The verified 42-source starter archive, grouped by evidence family.',
    unit: 'Starter-registry sources',
    rows,
    max: 14,
    sourceIds: [],
    localRefs: ['source_map.csv'],
    limitation: 'These counts describe archive composition, not a measure of the music economy.',
  });
}

function renderQualityTiers(model) {
  const rows = ['1', '2', '3'].map((tier) => [`Tier ${tier}`, String(model.qualityTierCounts[tier])]);
  return barFigure({
    id: 'quality-tier',
    evidenceClass: 'Research target',
    evidenceSubtype: 'Archive composition',
    title: 'Researcher-coded source tiers',
    summary: 'The verified starter registry grouped by its assigned evidentiary role.',
    unit: 'Starter-registry sources',
    rows,
    max: 30,
    sourceIds: [],
    localRefs: ['source_map.csv'],
    limitation: 'These are researcher-coded evidentiary roles, not independent source scores.',
  });
}

function renderEvidenceMatrix(model) {
  const { columns, rows: matrixRows } = model.figures.evidenceMatrix;
  const cellWidth = 86;
  const rowHeight = 38;
  const cells = matrixRows.flatMap(({ scores }, rowIndex) => scores.map((value, columnIndex) => {
    const x = 200 + columnIndex * cellWidth;
    const y = 76 + rowIndex * rowHeight;
    return `<rect class="matrix-cell matrix-cell--${value}" x="${x}" y="${y}" width="${cellWidth - 4}" height="${rowHeight - 4}"></rect>
<text class="matrix-score matrix-score--${value}" x="${x + (cellWidth - 4) / 2}" y="${y + 23}" text-anchor="middle">${value}</text>`;
  })).join('\n');
  const rowLabels = matrixRows.map(({ dimension }, index) => `<text x="0" y="${99 + index * rowHeight}">${escapeHtml(dimension)}</text>`).join('\n');
  const columnLabels = columns.map((label, index) => `<text x="${240 + index * cellWidth}" y="60" text-anchor="end" transform="rotate(-35 ${240 + index * cellWidth} 60)">${escapeHtml(label)}</text>`).join('\n');
  const rows = matrixRows.map(({ dimension, scores }) => [dimension, ...scores.map(String)]);
  const svg = `<svg class="quant-chart" viewBox="0 0 650 315" role="img" aria-labelledby="matrix-title matrix-desc">
  <title id="matrix-title">Evidence-coverage matrix across six measurement dimensions</title>
  <desc id="matrix-desc">Scores from one to four describe public source availability across administrative, platform-public, industry-document, interview, and content evidence.</desc>
  ${columnLabels}
  ${rowLabels}
  ${cells}
</svg>`;

  return figureShell({
    model,
    id: 'evidence-matrix',
    evidenceClass: 'Research target',
    evidenceSubtype: 'Evidence availability',
    title: 'Coverage of available evidence',
    summary: 'Coverage of available evidence — not industry performance.',
    unit: 'Methodological availability score, 1–4',
    body: chartViewport(svg, 'Evidence-coverage matrix', 'matrix'),
    values: valueTable('Evidence-availability scores', ['Dimension', ...columns], rows),
    sourceIds: ['S028', 'S030', 'S031', 'S038', 'S039'],
    localRefs: ['analysis_plan.md'],
    limitation: 'Scores describe public source availability, not industry performance.',
  });
}

function renderSpotifyPulse(model) {
  const cards = model.figures.spotifyPulse.map(({ label, value, evidenceClass }, index) => `<article class="metric-card" data-metric-card="${index + 1}">
  <p class="metric-card__class">${escapeHtml(evidenceClass)}</p>
  <p class="metric-card__value">${escapeHtml(value)}</p>
  <h4>${escapeHtml(label)}</h4>
</article>`).join('\n');
  return semanticFigure({
    model,
    id: 'spotify-pulse',
    evidenceClass: 'Platform-reported',
    title: 'Spotify’s five-year Pakistan pulse',
    summary: 'Five incomparable platform-reported measures remain separate, with no shared scale.',
    body: `<div class="metric-cards">${cards}</div>`,
    sourceIds: ['L019'],
    limitation: 'Spotify-reported activity; no absolute denominators; not industry revenue.',
  });
}

function renderTimeline(model) {
  const events = TIMELINE.map(([period, label, sourceIds], index) => `<li data-timeline-event="${index + 1}" data-timeline-period="${escapeHtml(period)}"${index === 0 ? ' data-timeline-active="true"' : ''}>
  <p class="timeline-period">${escapeHtml(period)}</p>
  <h4>${escapeHtml(label)}</h4>
  ${period === '2020' ? '<p class="timeline-status">Methodological marker; not an independently sourced event claim.</p>' : ''}
  ${period === '2026' ? '<p class="timeline-status">Incomplete-year epilogue; never a closed trend endpoint.</p>' : ''}
  ${sourceIds.length ? `<p class="timeline-sources">${citations(sourceIds, model)}</p>` : ''}
</li>`).join('\n');
  return semanticFigure({
    model,
    id: 'timeline',
    evidenceClass: 'Case evidence',
    evidenceSubtype: 'Mixed evidence classes',
    title: 'Research chronology, 2014–2026',
    summary: 'Established infrastructure, platform, policy, and case anchors appear in order; sequence does not establish causation.',
    body: `<ol class="research-chronology">${events}</ol>`,
    sourceIds: [],
    limitation: 'The 2026 item is an incomplete-year epilogue, not a complete annual observation or closed trend endpoint.',
  });
}

function renderDistributionStages(model) {
  const stages = DISTRIBUTION_STAGES.map(([number, title, text]) => `<li data-distribution-stage="${number}">
  <span>${number}</span>
  <h4>${escapeHtml(title)}</h4>
  <p>${escapeHtml(text)}</p>
</li>`).join('\n');
  return semanticFigure({
    model,
    id: 'distribution-stage',
    evidenceClass: 'Case evidence',
    evidenceSubtype: 'Qualitative synthesis',
    title: 'Distribution in stages',
    summary: 'Four equal-width stages describe documented circulation without encoding unobserved value.',
    body: `<ol class="distribution-stages" aria-label="Four equal-width stages">${stages}</ol>`,
    sourceIds: ['S017', 'S025', 'S027', 'S028', 'L019', 'L030'],
    limitation: 'The sequence is qualitative. Node width and connecting rules do not encode magnitude, equality, or causation.',
  });
}

function renderResearchArchitecture() {
  const records = [
    ['42', 'starter sources', 'Registry quantity'],
    ['360', 'track sample target', 'Research design target'],
    ['93', 'track variables', 'Research design quantity'],
    ['51', 'artist variables', 'Research design quantity'],
  ];
  const items = records.map(([value, label, status]) => `<li>
  <span class="architecture-value">${value}</span>
  <strong>${label}</strong>
  <small>${status}</small>
</li>`).join('\n');
  return semanticFigure({
    id: 'research-architecture',
    evidenceClass: 'Research target',
    title: 'Research architecture',
    summary: 'Research design targets, not completed findings.',
    body: `<ul class="research-architecture">${items}</ul>`,
    sourceIds: [],
    localRefs: ['source_map.csv', 'track_dataset_codebook.csv', 'artist_dataset_codebook.csv', 'analysis_plan.md'],
    limitation: 'The 360-track sample, artist dataset, interviews, contracts, and income observations have not been completed in this package.',
  });
}

function renderPropositions(model) {
  const rows = model.propositions.map((proposition) => `<details class="proposition" data-proposition="${escapeHtml(proposition.proposition_id)}">
  <summary><span>${escapeHtml(proposition.proposition_id)}</span><strong>${escapeHtml(proposition.proposition)}</strong><em>${escapeHtml(proposition.status_before_fieldwork)}</em></summary>
  <div class="proposition__details">
    <p><strong>Mechanism.</strong> ${escapeHtml(proposition.mechanism)}</p>
    <p><strong>Primary measures.</strong> ${escapeHtml(proposition.primary_measures)}</p>
    <p><strong>Supporting evidence needed.</strong> ${escapeHtml(proposition.supporting_evidence_needed)}</p>
    <p><strong>Falsification or revision rule.</strong> ${escapeHtml(proposition.falsification_or_revision_rule)}</p>
    <p><strong>Status before fieldwork.</strong> ${escapeHtml(proposition.status_before_fieldwork)}</p>
  </div>
</details>`).join('\n');
  return semanticFigure({
    id: 'proposition-ledger',
    evidenceClass: 'Research target',
    title: 'Seven-proposition evidence ledger',
    summary: 'Exact working propositions, measures, evidence needs, revision rules, and pre-fieldwork statuses from the package CSV.',
    body: `<div class="proposition-ledger">${rows}</div>`,
    sourceIds: [],
    localRefs: ['proposition_matrix.csv', 'analysis_plan.md'],
    limitation: 'These are working propositions, not findings. Their pre-fieldwork statuses remain provisional.',
  });
}

function renderMethods(model) {
  const targetBlock = `<details open>
  <summary>Sampling and fieldwork targets</summary>
  <div class="method-targets">
    <p><strong>360-track sample target</strong> · 30 tracks per complete year, 2014–2025.</p>
    <p><strong>80–100 artist target</strong> · linked acts plus purposive negative and comparison cases.</p>
    <p><strong>120-item content sample target</strong> · tracks and official visual materials.</p>
    <p><strong>38-interview target</strong> · artists, production, intermediation, platforms or brands, live work, rights, journalism, and audiences.</p>
    <p><strong>12-week decision-gate schedule</strong> · gates are conditions for proceeding, not results.</p>
    <p><strong>2026 epilogue; descriptive only.</strong> January–August developments are not pooled into complete-year trends.</p>
  </div>
</details>`;
  const dimensions = MEASUREMENT_DIMENSIONS.map(([title, text]) => `<details>
  <summary>${escapeHtml(title)}</summary>
  <p>${escapeHtml(text)}</p>
</details>`).join('\n');
  const gates = model.fieldworkSchedule.map(({ week, workstream, decision_gate: decisionGate }) => `<li data-fieldwork-week="${escapeHtml(week)}">
  <span>Week ${escapeHtml(week.padStart(2, '0'))}</span>
  <strong>${escapeHtml(workstream)}</strong>
  <p>${escapeHtml(decisionGate)}</p>
</li>`).join('\n');
  return `<section class="methods-architecture" data-module="methods-architecture" aria-labelledby="methods-architecture-title">
  <p class="eyebrow">Research target</p>
  <h3 id="methods-architecture-title">Methods architecture</h3>
  <p>The planned design keeps six measurement dimensions distinct and exposes collection gates before analysis.</p>
  <div class="methods-details">${targetBlock}${dimensions}</div>
  <h4>Twelve decision gates</h4>
  <ol class="decision-gates">${gates}</ol>
  ${figureSources([], ['analysis_plan.md', 'data_collection_protocol.md', 'interview_guide.md', 'content_analysis_codebook.md', 'research_ethics_protocol.md', 'fieldwork_schedule.csv'])}
</section>`;
}

function renderPolicySpread(model) {
  const problems = POLICY_PROBLEMS.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const proposals = POLICY_PROPOSALS.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return semanticFigure({
    model,
    id: 'policy-spread',
    evidenceClass: 'Case evidence',
    evidenceSubtype: 'Official and policy record',
    title: 'Policy is not implementation',
    summary: 'Annotations preserve the government-hosted document’s order: stated problems, proposed mechanisms, then unresolved implementation status.',
    body: `<div class="policy-spread">
  <div class="policy-spread__header">
    <p class="policy-document-status">Government-hosted final draft</p>
    <h4>National Music Policy</h4>
    <p>2024 PDF metadata · no clear commencement date</p>
  </div>
  <section aria-labelledby="policy-problems"><h5 id="policy-problems">Problems identified</h5><ol>${problems}</ol></section>
  <section aria-labelledby="policy-proposals"><h5 id="policy-proposals">Mechanisms proposed</h5><ol>${proposals}</ol></section>
  <aside><strong>Unverified status.</strong> Commencement, implementation timetable, budget, enforcement, and outcomes remain unverified.</aside>
</div>`,
    sourceIds: ['L016', 'L017', 'L018'],
    limitation: 'A final draft and policy announcements establish recognition and proposals; they do not establish implementation or artist outcomes.',
  });
}

function renderMissingLedger(model) {
  const entries = MISSING_SERIES.map((label) => `<li class="missing-ledger__entry">
  <strong>${escapeHtml(label)}</strong>
  <span>No public national series located as of 23 August 2026.</span>
</li>`).join('\n');
  return semanticFigure({
    model,
    id: 'missing-ledger',
    evidenceClass: 'Research target',
    evidenceSubtype: 'Missing evidence',
    title: 'The national statistics that are not public',
    summary: 'Blank ruled entries preserve absence as absence rather than converting it into zero or an imported estimate.',
    body: `<ul class="missing-ledger">${entries}</ul>`,
    sourceIds: ['S033', 'S034', 'S037', 'L016', 'L018', 'L022', 'L023'],
    limitation: 'Missing public evidence is not evidence of a zero value. Global estimates and purposive samples cannot substitute for a national series.',
  });
}

function barFigure({ id, evidenceClass, evidenceSubtype, title, summary, unit, rows, max, sourceIds, localRefs, limitation }) {
  const marks = rows.map(([label, rawValue], index) => {
    const value = Number(rawValue);
    const y = 24 + index * 42;
    return `<g class="chart-mark">
  <text x="0" y="${y + 14}">${escapeHtml(label)}</text>
  <rect class="chart-bar" x="220" y="${y}" width="${round(value / max * 400)}" height="18"></rect>
  <text x="630" y="${y + 14}" text-anchor="end">${value}</text>
</g>`;
  }).join('\n');
  const svg = `<svg class="quant-chart" viewBox="0 0 640 ${Math.max(150, 45 + rows.length * 42)}" role="img" aria-labelledby="${id}-title ${id}-desc">
  <title id="${id}-title">${escapeHtml(title)}</title>
  <desc id="${id}-desc">${escapeHtml(summary)} Exact values appear in the adjacent table.</desc>
  ${marks}
</svg>`;
  return figureShell({
    id,
    evidenceClass,
    evidenceSubtype,
    title,
    summary,
    unit,
    body: chartViewport(svg, title, 'bars'),
    values: valueTable(`${title} values`, ['Category', 'Count'], rows),
    sourceIds,
    localRefs,
    limitation,
  });
}

function figureShell({ model, id, evidenceClass, evidenceSubtype, title, summary, unit, body, values, sourceIds = [], localRefs = [], limitation }) {
  return `<figure class="evidence-figure evidence-figure--quantitative" data-figure="${escapeHtml(id)}">
  ${figureCaption(evidenceClass, evidenceSubtype, title, summary)}
  <div class="figure-body">
    <p class="figure-unit"><strong>Unit.</strong> ${escapeHtml(unit)}</p>
    ${body}
    ${values}
    ${figureSources(sourceIds, localRefs, model)}
    <p class="figure-limitation"><strong>Limitation.</strong> ${escapeHtml(limitation)}</p>
  </div>
</figure>`;
}

function semanticFigure({ model, id, evidenceClass, evidenceSubtype, title, summary, body, sourceIds = [], localRefs = [], limitation }) {
  return `<figure class="evidence-figure evidence-figure--semantic" data-figure="${escapeHtml(id)}">
  ${figureCaption(evidenceClass, evidenceSubtype, title, summary)}
  <div class="figure-body">
    ${body}
    ${figureSources(sourceIds, localRefs, model)}
    <p class="figure-limitation"><strong>Limitation.</strong> ${escapeHtml(limitation)}</p>
  </div>
</figure>`;
}

function figureCaption(evidenceClass, evidenceSubtype, title, summary) {
  return `<figcaption>
  <span class="evidence-tag">${escapeHtml(evidenceClass)}</span>
  ${evidenceSubtype ? `<span class="evidence-subtype">${escapeHtml(evidenceSubtype)}</span>` : ''}
  <h3>${escapeHtml(title)}</h3>
  <p>${escapeHtml(summary)}</p>
</figcaption>`;
}

function figureSources(sourceIds, localRefs = [], model) {
  const sourceLinks = model && sourceIds.length ? citations(sourceIds, model) : '';
  const localLinks = localRefs.map((filename) => `<a class="local-reference" href="${escapeHtml(localDownloadHref(filename))}">${escapeHtml(filename)}</a>`).join(' ');
  const links = [sourceLinks, localLinks].filter(Boolean).join(' ');
  return links ? `<p class="figure-sources"><strong>Sources.</strong> ${links}</p>` : '';
}

function citations(sourceIds, model) {
  return renderCitationLinks(sourceIds, new Map(model.allSources.map((source) => [source.sourceId, source])));
}

function valueTable(caption, headers, rows) {
  const headings = headers.map((header, index) => `<th scope="col"${index === 0 ? ' class="figure-values__stub"' : ''}>${escapeHtml(header)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell, index) => index === 0
    ? `<th scope="row">${escapeHtml(cell)}</th>`
    : `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="figure-values" tabindex="0" role="region" aria-label="${escapeHtml(caption)}">
  <table>
    <caption>${escapeHtml(caption)}</caption>
    <thead><tr>${headings}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</div>`;
}

function renderLinePanel({ id, title, desc, labels, values }) {
  const width = 330;
  const height = 170;
  const left = 42;
  const top = 18;
  const plotWidth = 268;
  const plotHeight = 115;
  const max = 170;
  const points = values.map((value, index) => {
    const x = left + (labels.length === 1 ? 0 : index / (labels.length - 1) * plotWidth);
    const y = top + plotHeight - value / max * plotHeight;
    return [round(x), round(y), value, labels[index]];
  });
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const marks = points.map(([x, y]) => `<circle class="chart-point" cx="${x}" cy="${y}" r="3"></circle>`).join('\n');
  const ticks = [0, 85, 170].map((value) => {
    const y = round(top + plotHeight - value / max * plotHeight);
    return `<g class="chart-scale-tick"><line class="chart-gridline" x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}"></line><text x="${left - 7}" y="${y + 4}" text-anchor="end">${value}m</text></g>`;
  }).join('\n');
  const svg = `<svg class="quant-chart" viewBox="0 0 ${width} ${height}" data-domain-min="0" data-domain-max="170" data-unit="million subscriptions" role="img" aria-labelledby="${id}-title ${id}-desc">
  <title id="${id}-title">${escapeHtml(title)}</title>
  <desc id="${id}-desc">${escapeHtml(desc)}</desc>
  ${ticks}
  <line class="chart-axis" x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}"></line>
  <path class="chart-line" d="${path}"></path>
  ${marks}
  <text x="${left}" y="158">${escapeHtml(labels[0])}</text>
  <text x="${left + plotWidth}" y="158" text-anchor="end">${escapeHtml(labels.at(-1))}</text>
</svg>`;
  return chartViewport(svg, title, 'broadband');
}

function chartViewport(svg, label, modifier) {
  return `<div class="chart-viewport" data-chart-kind="${escapeHtml(modifier)}" tabindex="0" role="region" aria-label="Scrollable chart: ${escapeHtml(label)}">${svg}</div>`;
}

function numberWord(value) {
  return value === 1 ? 'one' : String(value);
}

function shortRegion(region) {
  return region === 'KP, Balochistan, and Gilgit-Baltistan' ? 'KP, Balochistan & GB' : region;
}

function formatInteger(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
