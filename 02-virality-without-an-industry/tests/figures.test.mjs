import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import manifest from '../assets/hiphop-pakistan/manifest.json' with { type: 'json' };
import { chapters } from '../site/content/chapters/index.mjs';
import { renderDocument } from '../site/render/document.mjs';
import { renderFigure } from '../site/render/figures.mjs';
import { escapeHtml } from '../site/render/registry.mjs';
import { loadResearchModel } from '../tools/lib/research-model.mjs';

const model = loadResearchModel(process.cwd());
const styles = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
const referencedFigureIds = chapters.flatMap(({ blocks }) => blocks
  .filter(({ kind }) => kind === 'figure')
  .map(({ figureId }) => figureId));
const quantitativeFigureIds = [
  'broadband',
  'traffic',
  'source-family',
  'quality-tier',
  'evidence-matrix',
  'livelihood-snapshot',
];

const count = (pattern, value) => value.match(pattern)?.length ?? 0;

function figureMarkup(figureId) {
  return renderFigure(figureId, model);
}

test('renders every chapter figure ID and fails closed for unknown IDs', () => {
  assert.equal(referencedFigureIds.length, 13);
  assert.equal(new Set(referencedFigureIds).size, 13);
  for (const figureId of referencedFigureIds) {
    const html = figureMarkup(figureId);
    assert.match(html, new RegExp(`data-figure="${figureId}"`), figureId);
    assert.doesNotMatch(html, /\b(?:NaN|undefined)\b/, figureId);
    assert.doesNotMatch(html, /(?:src|srcset|href)=["']https?:/i, `${figureId}: external runtime asset`);
  }
  assert.throws(() => renderFigure('not-a-figure', model), /unknown figure ID: not-a-figure/);
});

test('renders exact broadband panels, endpoints, provenance, and mandatory caveat', () => {
  const html = figureMarkup('broadband');
  assert.equal(count(/class="chart-panel"/g, html), 2);
  assert.match(html, />16,885,518</);
  assert.match(html, />102,699,967</);
  assert.match(html, />119 million</);
  assert.match(html, />161 million</);
  assert.match(html, />51\.0%</);
  assert.match(html, />64\.2%</);
  assert.match(html, /2021–22 survey edition/);
  assert.match(html, /2025–26 survey edition/);
  assert.match(html, /Broadband subscriptions, not unique people or music listeners\./);
  assert.match(html, /href="#source-L001"/);
  assert.match(html, /href="#source-L002"/);
});

test('uses one disclosed 0–170 million broadband domain and model-derived geometry in both panels', () => {
  const html = figureMarkup('broadband');
  assert.equal(count(/data-domain-min="0"/g, html), 2);
  assert.equal(count(/data-domain-max="170"/g, html), 2);
  assert.equal(count(/data-unit="million subscriptions"/g, html), 2);
  assert.equal(count(/Shared scale: 0–170 million subscriptions/g, html), 2);
  for (const tick of ['0m', '85m', '170m']) assert.equal(count(new RegExp(`>${tick}<`, 'g'), html), 2, tick);

  const expectedPanels = [
    model.figures.broadband.historical.map(({ subscriptions }) => subscriptions / 1_000_000),
    model.figures.broadband.current.map(({ subscriptionsMillions }) => subscriptionsMillions),
  ];
  const paths = [...html.matchAll(/<path class="chart-line" d="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  expectedPanels.forEach((values, panelIndex) => {
    const points = [...paths[panelIndex].matchAll(/[ML] ([\d.]+) ([\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
    assert.equal(points.length, values.length);
    values.forEach((value, index) => {
      const expectedX = 42 + index / (values.length - 1) * 268;
      const expectedY = 18 + 115 - value / 170 * 115;
      assert.ok(Math.abs(points[index][0] - expectedX) <= 0.011, `panel ${panelIndex + 1} x ${index}`);
      assert.ok(Math.abs(points[index][1] - expectedY) <= 0.011, `panel ${panelIndex + 1} y ${index}`);
    });
  });
});

test('renders exact traffic components and preserves the official one-PB discrepancy', () => {
  const html = figureMarkup('traffic');
  for (const value of ['8,970', '7,280', '16,250', '15,851', '14,931', '30,783']) {
    assert.match(html, new RegExp(`>${value}<`), value);
  }
  assert.match(html, /components sum to 30,782 PB/i);
  assert.match(html, /official total is 30,783 PB/i);
  assert.match(html, /one-petabyte discrepancy/i);
  assert.match(html, /Total telecom data traffic is not music traffic\./);
  assert.match(html, /href="#source-L002"/);
});

test('maps mobile and fixed traffic labels to exact segments with non-color cues', () => {
  const html = figureMarkup('traffic');
  assert.match(html, /class="chart-legend"[^>]*aria-label="Traffic series legend"/);
  assert.match(html, /data-legend-series="mobile"[\s\S]*>M<[\s\S]*Mobile traffic[\s\S]*left segment · solid/i);
  assert.match(html, /data-legend-series="fixed"[\s\S]*>F<[\s\S]*Fixed traffic[\s\S]*right segment · outlined/i);
  assert.equal(count(/data-series="mobile"/g, html), model.figures.traffic.length);
  assert.equal(count(/data-series="fixed"/g, html), model.figures.traffic.length);
  assert.equal(count(/class="traffic-segment-cue"[^>]*>M</g, html), model.figures.traffic.length);
  assert.equal(count(/class="traffic-segment-cue"[^>]*>F</g, html), model.figures.traffic.length);

  const first = model.figures.traffic[0];
  const mobile = html.match(/<rect[^>]+data-series="mobile"[^>]+width="([\d.]+)"/);
  const fixed = html.match(/<rect[^>]+data-series="fixed"[^>]+width="([\d.]+)"/);
  assert.ok(mobile && fixed);
  assert.ok(Math.abs(Number(mobile[1]) - first.mobilePb / 32_000 * 520) <= 0.011);
  assert.ok(Math.abs(Number(fixed[1]) - first.fixedPb / 32_000 * 520) <= 0.011);
});

test('renders all livelihood values and all four warnings inside the figure body', () => {
  const html = figureMarkup('livelihood-snapshot');
  for (const region of ['KP, Balochistan, and Gilgit-Baltistan', 'Sindh', 'Punjab']) {
    assert.match(html, new RegExp(escapeRegExp(region)));
  }
  for (const value of ['73%', '70%', '10%', '60%', '50%', '80%', '40%', '20%']) {
    assert.match(html, new RegExp(`>${escapeRegExp(value)}<`), value);
  }
  const body = html.slice(html.indexOf('class="figure-body"'), html.indexOf('</figure>'));
  for (const warning of ['Purposive sample', 'n=50 music respondents', 'all respondents male', 'not nationally representative']) {
    assert.match(body, new RegExp(warning, 'i'), warning);
  }
  assert.match(body, /coverage limitation, not evidence that women are absent from music work/i);
  assert.match(html, /href="#source-L022"/);
  assert.match(html, /href="#source-L023"/);
});

test('gives every quantitative SVG an accessible description, visible unit, sources, limitation, and adjacent table', () => {
  for (const figureId of quantitativeFigureIds) {
    const html = figureMarkup(figureId);
    assert.equal(count(/<svg\b/g, html), figureId === 'broadband' ? 2 : 1, `${figureId}: SVG count`);
    assert.equal(count(/<title\b/g, html), figureId === 'broadband' ? 2 : 1, `${figureId}: title count`);
    assert.equal(count(/<desc\b/g, html), figureId === 'broadband' ? 2 : 1, `${figureId}: desc count`);
    assert.match(html, /class="figure-unit"/, `${figureId}: visible unit`);
    assert.match(html, /class="evidence-tag"/, `${figureId}: evidence badge`);
    assert.match(html, /class="figure-sources"[\s\S]*href=/, `${figureId}: source anchor`);
    assert.match(html, /class="figure-limitation"/, `${figureId}: limitation`);
    assert.match(html, /class="figure-values"[\s\S]*<table/, `${figureId}: adjacent value table`);
    assert.match(html, /<caption>/, `${figureId}: table caption`);
    assert.match(html, /<th[^>]+scope="col"/, `${figureId}: column headers`);
    assert.equal(count(/class="chart-viewport"/g, html), count(/<svg\b/g, html), `${figureId}: chart viewport count`);
    assert.equal(count(/class="chart-viewport"[^>]*tabindex="0"/g, html), count(/<svg\b/g, html), `${figureId}: focusable chart viewport`);
  }
});

test('renders starter source-family and quality-tier values without changing their meaning', () => {
  const families = figureMarkup('source-family');
  for (const [label, value] of [
    ['Scholarship', 13],
    ['Platform / industry first-party', 12],
    ['Journalism', 8],
    ['Official / primary', 8],
    ['Civil society / monitoring', 1],
  ]) {
    assert.match(families, new RegExp(`${escapeRegExp(label)}[\\s\\S]*>${value}<`), label);
  }
  assert.match(families, /42-source starter archive/);
  assert.match(families, /archive composition, not a measure of the music economy/i);

  const tiers = figureMarkup('quality-tier');
  for (const [label, value] of [['Tier 1', 10], ['Tier 2', 30], ['Tier 3', 2]]) {
    assert.match(tiers, new RegExp(`${label}[\\s\\S]*>${value}<`), label);
  }
  assert.match(tiers, /researcher-coded evidentiary roles, not independent source scores/i);
});

test('renders the exact evidence-coverage matrix as evidence availability, not performance', () => {
  const html = figureMarkup('evidence-matrix');
  const { columns, rows } = model.figures.evidenceMatrix;
  for (const column of columns) assert.match(html, new RegExp(escapeRegExp(column)), column);
  for (const { dimension, scores } of rows) {
    const cells = [dimension, ...scores].map((cell) => `(?:<[^>]+>)*${escapeRegExp(cell)}(?:<\\/[^>]+>)*`).join('[\\s\\S]*');
    assert.match(html, new RegExp(cells), dimension);
  }
  assert.match(html, /Coverage of available evidence — not industry performance\./);
  assert.match(html, /Scores describe public source availability, not industry performance\./);
});

test('keeps every 11px evidence-matrix score above WCAG AA contrast', () => {
  for (const score of [1, 2, 3, 4]) {
    const fill = cssColor(`matrix-${score}`);
    const text = cssColor(`matrix-text-${score}`);
    assert.ok(contrastRatio(fill, text) >= 4.5, `score ${score}: ${text} on ${fill}`);
  }
});

test('renders Spotify measures as five separate unscaled metric cards', () => {
  const html = figureMarkup('spotify-pulse');
  assert.equal(count(/data-metric-card=/g, html), 5);
  assert.doesNotMatch(html, /<svg\b|data-scale|role="meter"/);
  for (const value of ['&gt;750%', '&gt;7×', 'nearly +75%', '&gt;15 million', '&gt;140']) {
    assert.match(html, new RegExp(`>${escapeRegExp(value)}<`), value);
  }
  assert.match(html, /Spotify-reported activity; no absolute denominators; not industry revenue\./);
  assert.match(html, /href="#source-L019"/);
});

test('renders the ordered 2014–2026 chronology with source and active-state hooks', () => {
  const html = figureMarkup('timeline');
  assert.match(html, /<ol[^>]+class="research-chronology"/);
  const labels = ['2014', '2015', '2016', '2017–19', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
  let cursor = -1;
  for (const label of labels) {
    const next = html.indexOf(`data-timeline-period="${label}"`);
    assert.ok(next > cursor, `${label}: chronology order`);
    cursor = next;
  }
  assert.equal(count(/data-timeline-event=/g, html), 11);
  assert.match(html, /data-timeline-active/);
  for (const sourceId of ['S002', 'S015', 'S016', 'S004', 'S017', 'S018', 'S005', 'S006', 'S011', 'S013', 'S014', 'S009', 'S010', 'S035', 'L019', 'L020', 'L021']) {
    assert.match(html, new RegExp(`href="#source-${sourceId}"`), sourceId);
  }
  assert.match(html, /Incomplete-year epilogue/);
  assert.match(html, /never a closed trend endpoint/i);

  const instability = timelineEvent(html, '2017–19');
  assert.match(instability, /Local-platform instability and intermediary dependence/);
  assert.deepEqual([...instability.matchAll(/href="#source-([A-Z]\d+)"/g)].map((match) => match[1]), ['S017', 'S018']);
  assert.doesNotMatch(instability, /Branded and platformed mainstream/);

  const periodBreak = timelineEvent(html, '2020');
  assert.match(periodBreak, /Methodological period break/);
  assert.match(periodBreak, /not an independently sourced event claim/i);
  assert.doesNotMatch(periodBreak, /Production shock/);
  assert.equal(count(/href="#source-/g, periodBreak), 0);
});

test('uses only the canonical five-class evidence taxonomy for top figure badges', () => {
  const allowed = new Set(['Official series', 'Platform-reported', 'Purposive sample', 'Case evidence', 'Research target']);
  for (const figureId of referencedFigureIds) {
    const html = figureMarkup(figureId);
    const badge = html.match(/<span class="evidence-tag">([^<]+)<\/span>/)?.[1];
    assert.ok(allowed.has(badge), `${figureId}: ${badge}`);
  }
  assert.match(figureMarkup('timeline'), /class="evidence-subtype">Mixed evidence classes</);
  assert.match(figureMarkup('missing-ledger'), /class="evidence-subtype">Missing evidence</);
});

test('renders equal-stage distribution nodes and design-target research architecture', () => {
  const stages = figureMarkup('distribution-stage');
  assert.equal(count(/data-distribution-stage=/g, stages), 4);
  for (const label of ['Local production', 'Platform or branded amplification', 'Global circulation', 'Unresolved rights and income']) {
    assert.match(stages, new RegExp(escapeRegExp(label)));
  }
  assert.match(stages, /equal-width stages/i);
  assert.doesNotMatch(stages, /<svg\b/);

  const architecture = figureMarkup('research-architecture');
  for (const [value, label] of [
    ['42', 'starter sources'],
    ['360', 'track sample target'],
    ['93', 'track variables'],
    ['51', 'artist variables'],
  ]) {
    assert.match(architecture, new RegExp(`>${value}<[\\s\\S]*${label}`), label);
  }
  assert.match(architecture, /Research design targets, not completed findings\./);
  assert.doesNotMatch(architecture, /<svg\b/);
});

test('renders P01–P07 directly from the normalized proposition matrix', () => {
  const html = figureMarkup('proposition-ledger');
  assert.equal(count(/data-proposition=/g, html), 7);
  assert.equal(count(/<details\b/g, html), 7);
  for (const proposition of model.propositions) {
    const start = html.indexOf(`data-proposition="${proposition.proposition_id}"`);
    const end = html.indexOf('</details>', start);
    const row = html.slice(start, end);
    for (const field of ['proposition', 'mechanism', 'primary_measures', 'supporting_evidence_needed', 'falsification_or_revision_rule', 'status_before_fieldwork']) {
      assert.ok(row.includes(escapeHtml(proposition[field])), `${proposition.proposition_id}: ${field}`);
    }
  }
});

test('renders methods as expandable semantic sections with explicit targets and twelve decision gates', () => {
  const html = figureMarkup('methods-architecture');
  assert.match(html, /data-module="methods-architecture"/);
  assert.equal(count(/<details\b/g, html), 7);
  for (const label of ['Sampling and fieldwork targets', 'Cultural production', 'Audience attention', 'Economic sustainability', 'Institutional maturity', 'Social inclusion', 'Internationalization']) {
    assert.match(html, new RegExp(escapeRegExp(label)), label);
  }
  for (const target of ['360-track sample target', '80–100 artist target', '120-item content sample target', '38-interview target', '12-week decision-gate schedule']) {
    assert.match(html, new RegExp(escapeRegExp(target)), target);
  }
  assert.match(html, /2026 epilogue; descriptive only/i);
  assert.equal(count(/data-fieldwork-week=/g, html), model.fieldworkSchedule.length);
  for (const row of model.fieldworkSchedule) {
    const start = html.indexOf(`data-fieldwork-week="${row.week}"`);
    const end = html.indexOf('</li>', start);
    const rendered = html.slice(start, end);
    assert.ok(rendered.includes(escapeHtml(row.workstream)), `week ${row.week}: workstream`);
    assert.ok(rendered.includes(escapeHtml(row.decision_gate)), `week ${row.week}: decision gate`);
  }
});

test('escapes all figure-model strings and rejects invalid numeric shapes before rendering', () => {
  const stringMutations = [
    ['broadband', (copy, payload) => { copy.figures.broadband.historical[0].period = payload; }],
    ['traffic', (copy, payload) => { copy.figures.traffic[0].period = payload; }],
    ['livelihood-snapshot', (copy, payload) => { copy.figures.livelihood[0].region = payload; }],
    ['spotify-pulse', (copy, payload) => { copy.figures.spotifyPulse[0].label = payload; }],
    ['evidence-matrix', (copy, payload) => { copy.figures.evidenceMatrix.rows[0].dimension = payload; }],
    ['proposition-ledger', (copy, payload) => { copy.propositions[0].proposition = payload; }],
    ['methods-architecture', (copy, payload) => { copy.fieldworkSchedule[0].workstream = payload; }],
  ];
  const payload = '\"><img src=x onerror="alert(1)">';
  for (const [figureId, mutate] of stringMutations) {
    const copy = structuredClone(model);
    mutate(copy, payload);
    const html = renderFigure(figureId, copy);
    assert.doesNotMatch(html, /<img\b|\sonerror="/i, figureId);
    assert.match(html, /&lt;img/, figureId);
  }

  const numericMutations = [
    (copy) => { copy.figures.broadband.historical[0].subscriptions = Number.NaN; },
    (copy) => { copy.figures.broadband.current[0].penetrationPercent = 101; },
    (copy) => { copy.figures.traffic[0].mobilePb = Number.POSITIVE_INFINITY; },
    (copy) => { copy.figures.traffic[0].fixedPb = -1; },
    (copy) => { copy.figures.livelihood[0].sample = '<script>alert(1)</script>'; },
    (copy) => { copy.figures.livelihood[0].projectPaidPercent = 101; },
    (copy) => { copy.figures.evidenceMatrix.rows[0].scores[0] = 0; },
    (copy) => { copy.figures.evidenceMatrix.rows[0].scores.push(4); },
  ];
  for (const mutate of numericMutations) {
    const copy = structuredClone(model);
    mutate(copy);
    assert.throws(() => renderFigure('livelihood-snapshot', copy), /ResearchModel invariant failed/);
  }

  const wrongCount = structuredClone(model);
  wrongCount.figures.livelihood.pop();
  assert.throws(() => renderFigure('livelihood-snapshot', wrongCount), /ResearchModel invariant failed/);
});

test('renders policy annotations in document order and keeps implementation unverified', () => {
  const html = figureMarkup('policy-spread');
  const annotations = [
    'Weak copyright enforcement',
    'Fragmented royalty collection',
    'Missing archives',
    'Limited infrastructure',
    'Registration',
    'Licensing',
    'Welfare',
    'Education',
    'Archive',
    'Enforcement',
  ];
  let cursor = -1;
  for (const annotation of annotations) {
    const next = html.indexOf(`>${annotation}<`);
    assert.ok(next > cursor, `${annotation}: document order`);
    cursor = next;
  }
  assert.match(html, /Government-hosted final draft/);
  assert.match(html, /Commencement, implementation timetable, budget, enforcement, and outcomes remain unverified\./);
  for (const sourceId of ['L016', 'L017', 'L018']) assert.match(html, new RegExp(`href="#source-${sourceId}"`));
});

test('renders missing evidence as labeled blank ruled entries, never zero bars', () => {
  const html = figureMarkup('missing-ledger');
  assert.equal(count(/class="missing-ledger__entry"/g, html), 8);
  for (const label of ['Recorded-music revenue', 'Artist royalty payments', 'Music employment', 'Contract prevalence', 'Venue counts', 'Payment delays', 'Publishing collection', 'Master ownership shares']) {
    assert.match(html, new RegExp(escapeRegExp(label)), label);
  }
  assert.equal(count(/No public national series located as of 23 August 2026\./g, html), 8);
  assert.doesNotMatch(html, /data-value="0"|<svg\b|zero bar|pseudo-bar/i);
});

test('integrates real figures and expandable methods into the complete no-JavaScript document', () => {
  const html = renderDocument({ research: model, chapters, images: manifest, styles: '', interactions: '' });
  for (const figureId of referencedFigureIds) {
    assert.match(html, new RegExp(`data-figure="${figureId}"`), figureId);
  }
  assert.equal(count(/data-figure="/g, html), 13);
  assert.doesNotMatch(html, /class="figure-hook"|Accessible values and the visual rendering share this verified figure record\./);
  assert.match(html, /data-module="methods-architecture"[\s\S]*<details/);
  assert.doesNotMatch(html, /data-pathway-tab|role="tab"/);
  assert.match(html, /<form[^>]+data-enhancement-control[^>]+hidden/);
  assert.doesNotMatch(html, /\b(?:NaN|undefined)\b/);

  const unknown = structuredClone(chapters);
  unknown[1].blocks.find(({ kind }) => kind === 'figure').figureId = 'unknown-figure';
  assert.throws(
    () => renderDocument({ research: model, chapters: unknown, images: manifest, styles: '', interactions: '' }),
    /unknown figure ID: unknown-figure/,
  );
});

test('includes responsive semantic figure styling without interaction behavior', () => {
  for (const selector of ['.figure-grid', '.figure-values', '.research-chronology', '.distribution-stages', '.proposition-ledger', '.policy-spread', '.missing-ledger']) {
    assert.ok(styles.includes(selector), selector);
  }
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*\.figure-grid/);
  assert.match(styles, /overflow-x:\s*auto/);
  assert.doesNotMatch(styles, /\.bar[^}]*transition|\.chart-mark[^}]*animation/);
  assert.doesNotMatch(styles, /counter\(method/, 'explicit week labels must not receive a second generated number');
  assert.match(styles, /\.chart-viewport\s*{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*\.chart-viewport \.quant-chart\s*{[^}]*min-width:\s*(?:40|42)rem/s);
  assert.match(styles, /@media print[\s\S]*\.chart-legend\s*{[^}]*display:\s*flex\s*!important/s);
  assert.doesNotMatch(styles, /@media \(max-width: 699px\)[\s\S]*body\s*{[^}]*overflow-x:\s*(?:auto|scroll)/s);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function timelineEvent(html, period) {
  const start = html.indexOf(`data-timeline-period="${period}"`);
  return html.slice(start, html.indexOf('</li>', start));
}

function cssColor(name) {
  const value = styles.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  assert.ok(value, `CSS color token --${name}`);
  return value;
}

function contrastRatio(first, second) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
