import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'intermediate/research_dataset.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(root, 'intermediate/audit_summary.json'), 'utf8'));
const parseCsv = text => { const rows=[]; let row=[],cell='',quoted=false; for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='\"'&&quoted&&n==='\"'){cell+='\"';i++;}else if(c==='\"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell);rows.push(row);}const [head,...body]=rows;return body.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]||''])));};
const briefings = parseCsv(fs.readFileSync(path.join(root, 'intermediate/briefing_units.csv'), 'utf8'));
const pagePath = path.join(root, 'index.html');
const aliasPath = path.join(root, 'pakistan-ai-policy-observatory.html');

const esc = (v = '') => String(v).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const slug = v => String(v || 'uncategorized').toLowerCase().replace(/_/g, '-');
const label = v => String(v || 'Uncategorised').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
/* Reader-facing names for the dataset's category codes; any code not listed
   falls back to a sentence-cased rendering of the code itself. */
const DOMAIN_NAMES = {
  COMPUTE_CLOUD_DATACENTRE: 'Compute, cloud and data centres',
  FUNDING_INVESTMENT_PARTNERSHIP: 'Funding, investment and partnerships',
  DIGITAL_IDENTITY_DPI: 'Digital identity and public infrastructure',
  DATA_PROTECTION_GOVERNANCE: 'Data protection and governance',
  CYBERSECURITY: 'Cybersecurity',
  PLATFORM_TELECOM: 'Platforms and telecom',
  PROCUREMENT_PROGRAM_DELIVERY: 'Procurement and programme delivery',
  AI_GOVERNANCE: 'AI governance',
  WORKFORCE_RESEARCH_EDUCATION: 'Workforce, research and education',
  GOOGLE_CORPORATE_PRESENCE: 'Google’s corporate presence',
  CONNECTIVITY_ENERGY_RESILIENCE: 'Connectivity, energy and resilience',
};
const domainName = v => DOMAIN_NAMES[v] || String(v || 'Uncategorised').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
const utcDate = value => { const parsed = new Date(value); if (Number.isNaN(parsed.valueOf())) throw new Error(`Invalid UTC date: ${value}`); return parsed; };
const month = value => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][value.getUTCMonth()];
const dayMonth = value => `${value.getUTCDate()} ${month(value)}`;
const start = utcDate(data.report.observed_period_start_utc);
const end = utcDate(data.report.observed_period_end_utc);
const cutoff = utcDate(data.report.search_cutoff_utc);
const periodLabel = `${dayMonth(start)}–${dayMonth(end)} ${end.getUTCFullYear()}`;
const cutoffLabel = `${String(cutoff.getUTCDate()).padStart(2,'0')} ${month(cutoff)} ${cutoff.getUTCFullYear()} · ${String(cutoff.getUTCHours()).padStart(2,'0')}:${String(cutoff.getUTCMinutes()).padStart(2,'0')} UTC`;
const cutoffLong = `${dayMonth(cutoff)} ${cutoff.getUTCFullYear()}`;
const number = value => Number(value).toLocaleString('en-US');

if (JSON.stringify(data.audit) !== JSON.stringify(audit)) throw new Error('research_dataset.json audit does not match audit_summary.json');

const sourceMap = new Map(data.sources.map(s => [s.source_id, s]));
const records = [...data.events.map(x => ({...x, recordType:'Event'})), ...data.baselines.map(x => ({...x, recordType:'Baseline'}))];

/* ---------------------------------------------------------------------------
   Derived reading: the maturity rung each record's own stated status places it
   on. Rules are ordered, first match wins, and read only from `status_stage` —
   no judgement is added beyond the keyword rule. Every record carries its rung
   and its verbatim status side by side in the ledger so the rule is checkable.
--------------------------------------------------------------------------- */
const RUNG_RULES = [
  ['operating', /inaugurat|operational footprint|authority-reported operation|reported digitisation|claimed launch|launch\/integration/i],
  ['published', /notified and effective|final issued circular|published framework|published advisory|approved policy|Cabinet-approved/i],
  ['procuring', /tender|rfp|bids|evaluation|pre-award|procurement/i],
  ['committed', /signed|contract|agreement|referred to committee|recommendation|in-principle|designation|assigned/i],
  ['signalled', /.*/],
];
const RUNGS = [
  { key:'signalled', name:'Signalled',        note:'Meeting, intention, announcement or draft. No operative artefact yet.' },
  { key:'committed', name:'Committed',        note:'An instrument is signed or approved, but nothing is bound or delivered.' },
  { key:'procuring', name:'In procurement',   note:'Tender, evaluation or pre-award. No award verified in the window.' },
  { key:'published', name:'Published rule',   note:'The instrument exists and operates: notified, final, or published.' },
  { key:'operating', name:'Reported running', note:'A facility or system is claimed to be operating. None independently verified.' },
];
const rungOf = record => RUNG_RULES.find(([, expression]) => expression.test(record.status_stage))[0];
const CONFIDENCE = ['High', 'Medium', 'Low'];
const rungRows = RUNGS.map(rung => {
  const members = records.filter(record => rungOf(record) === rung.key);
  return {
    ...rung,
    members,
    total: members.length,
    byConfidence: Object.fromEntries(CONFIDENCE.map(c => [c, members.filter(m => m.confidence === c).length])),
  };
});
const spell = value => ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'][value] ?? String(value);
const barrenRungs = rungRows.filter(rung => rung.total > 0 && rung.byConfidence.High === 0);
const pureRungs = rungRows.filter(rung => rung.total > 0 && CONFIDENCE.filter(c => rung.byConfidence[c] > 0).length === 1);
const dominant = rung => CONFIDENCE.find(c => rung.byConfidence[c] === rung.total);
const procuringRung = rungRows.find(r => r.key === 'procuring');
const maxRung = Math.max(...rungRows.map(r => r.total));
const operatingRung = rungRows.find(r => r.key === 'operating');
const publishedRung = rungRows.find(r => r.key === 'published');

/* Timeline: first ISO date found in each record's stated event date. */
const isoOf = record => (String(record.event_date).match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null;
const windowStart = data.report.observed_period_start_utc.slice(0, 10);
const windowEnd = data.report.observed_period_end_utc.slice(0, 10);
const days = [];
for (let cursor = new Date(`${windowStart}T00:00:00Z`); cursor <= new Date(`${windowEnd}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
  days.push(cursor.toISOString().slice(0, 10));
}
const dayRecords = new Map(days.map(day => [day, []]));
let carriedIn = 0;
for (const record of records) {
  const day = isoOf(record);
  if (day && dayRecords.has(day)) dayRecords.get(day).push(record);
  else carriedIn++;
}
const dayCounts = new Map(days.map(day => [day, dayRecords.get(day).length]));
const datedInWindow = [...dayCounts.values()].reduce((a, b) => a + b, 0);
const emptyDays = days.filter(day => dayCounts.get(day) === 0);

const categories = [...new Set(records.map(x => x.category))];
const categoryCounts = categories.map(category => ({category, count: records.filter(x => x.category === category).length})).sort((a,b)=>b.count-a.count);
const maxCategory = Math.max(...categoryCounts.map(x=>x.count));

/* ---------------------------------------------------------------------------
   Marks. Line geometry only: circles, rules, ticks, single points.
--------------------------------------------------------------------------- */
const confidenceMark = confidence => {
  if (confidence === 'High') return '<svg class="cmark" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="var(--ink-3)"/></svg>';
  if (confidence === 'Medium') return '<svg class="cmark" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="var(--ink-5)" stroke-width="1.1"/></svg>';
  return '<svg class="cmark" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="var(--ink-5)" stroke-width="1.1" stroke-dasharray="1.6 1.6"/></svg>';
};
const dotFor = (confidence, cx, cy, r = 3.4) => {
  if (confidence === 'High') return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--ink-3)"/>`;
  if (confidence === 'Medium') return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ink-5)" stroke-width="1"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ink-5)" stroke-width="1" stroke-dasharray="1.6 1.6"/>`;
};

/* Shared drawing helpers for the figures below. Every figure keeps to the
   series' line geometry: rings, rules, ticks and single points. */
const r1 = value => Number(value.toFixed(1));
const polar = (cx, cy, radius, degrees) => [cx + radius * Math.cos(degrees * Math.PI / 180), cy + radius * Math.sin(degrees * Math.PI / 180)];
const HALO = ' paint-order="stroke" stroke="var(--surface-page)" stroke-width="4" stroke-linejoin="round"';
const monoText = (x, y, text, { size = 9, anchor = '', fill = 'var(--ink-4)', track = '0.1em', extra = '' } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}"${anchor ? ` text-anchor="${anchor}"` : ''} font-family="IBM Plex Mono,monospace" font-size="${size}" letter-spacing="${track}" fill="${fill}"${extra}>${text}</text>`;
const serifText = (x, y, text, { size = 14, anchor = '', fill = 'var(--ink-2)', extra = '' } = {}) =>
  `<text x="${r1(x)}" y="${r1(y)}"${anchor ? ` text-anchor="${anchor}"` : ''} font-family="Newsreader,Georgia,serif" font-size="${size}" fill="${fill}"${extra}>${text}</text>`;
const recordAnchor = record => `rec-${record.event_id}`;
/* A mono label set on a ring, with a paper-coloured plate so the ring breaks
   around it instead of striking through the letter-spacing. */
const ringLabel = (x, y, text, size = 8.5) => {
  const width = text.length * size * 0.72 + 8;
  return `<rect x="${r1(x - width / 2)}" y="${r1(y - size / 2 - 3)}" width="${r1(width)}" height="${r1(size + 6)}" fill="var(--surface-page)"/>${monoText(x, y + size * 0.36, text, { size, anchor: 'middle' })}`;
};
const RUNG_NAME = Object.fromEntries(RUNGS.map(r => [r.key, r.name]));
const pointFor = (record, cx, cy, r = 3.4) =>
  `<a class="pt" href="#${recordAnchor(record)}" data-category="${slug(record.category)}"><title>${esc(record.normalized_event_title)}</title>${dotFor(record.confidence, r1(cx), r1(cy), r)}</a>`;

/* Fig. 02 — the maturity ladder, each record one point, grouped by confidence.
   Each rung is a link that carries its rung into the ledger filter. */
const ladderTop = 34, ladderPitch = 52, dotPitch = 15, dotsX = 214;
const ladderFigure = `<svg viewBox="0 0 700 ${ladderTop + RUNGS.length * ladderPitch + 34}" width="100%" role="group" aria-labelledby="fig1t fig1d">
<title id="fig1t">Where the ${records.length} records actually sit, and how well each rung is evidenced</title>
<desc id="fig1d">${rungRows.map(r => `${r.name}: ${r.total} records, ${r.byConfidence.High} high confidence, ${r.byConfidence.Medium} medium, ${r.byConfidence.Low} low.`).join(' ')}</desc>
${rungRows.map((rung, index) => {
  const y = ladderTop + index * ladderPitch;
  const ordered = CONFIDENCE.flatMap(c => rung.members.filter(m => m.confidence === c).map(() => c));
  const dots = ordered.map((confidence, i) => dotFor(confidence, dotsX + i * dotPitch, y)).join('');
  const barren = rung.byConfidence.High === 0;
  return `<a class="rung-link" href="#sec-5" data-rung-filter="${rung.key}" aria-label="Show the ${rung.total} ${rung.name.toLowerCase()} record${rung.total === 1 ? '' : 's'} in the ledger"><rect class="rung-hit" x="0" y="${y - 22}" width="700" height="${ladderPitch - 3}"/>
<line x1="0" y1="${y + 26}" x2="700" y2="${y + 26}" stroke="var(--rule-hairline)" stroke-width="1"/>
<text x="0" y="${y - 4}" font-family="IBM Plex Mono,monospace" font-size="9.5" letter-spacing="0.12em" fill="var(--ink-4)">${String(index + 1).padStart(2, '0')} — ${rung.name.toUpperCase()}</text>
<text x="0" y="${y + 14}" font-family="Newsreader,Georgia,serif" font-size="12.5" fill="var(--ink-4)">${rung.total} record${rung.total === 1 ? '' : 's'}</text>
${dots}
${barren ? `<circle cx="${dotsX - 22}" cy="${y}" r="3" fill="var(--copper)"/><text x="${dotsX + ordered.length * dotPitch + 6}" y="${y + 4}" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--copper)">NO HIGH-CONFIDENCE RECORD</text>` : ''}
${monoText(700, y + 4, 'LEDGER →', { anchor: 'end', extra: ' class="rung-cue"' })}</a>`;
}).join('\n')}
<g transform="translate(0 ${ladderTop + RUNGS.length * ladderPitch + 14})">
<circle cx="4" cy="-4" r="3.4" fill="var(--ink-3)"/><text x="14" y="0" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--ink-4)">HIGH</text>
<circle cx="72" cy="-4" r="3.4" fill="none" stroke="var(--ink-5)" stroke-width="1"/><text x="82" y="0" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--ink-4)">MEDIUM</text>
<circle cx="158" cy="-4" r="3.4" fill="none" stroke="var(--ink-5)" stroke-width="1" stroke-dasharray="1.6 1.6"/><text x="168" y="0" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--ink-4)">LOW</text>
</g></svg>`;

/* Fig. 02 — the observed window: records per day above the axis, briefing units as ticks below. */
const coverageShare = audit.observed_strict_window_share_of_span_percent;
const dayPitch = 660 / (days.length - 1);
const dayZero = new Date(`${windowStart}T00:00:00Z`).getTime();
const atTime = value => {
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return null;
  return Math.min(680, Math.max(20, 20 + (stamp - dayZero) / 86400000 * dayPitch));
};
const timelineFigure = `<svg viewBox="0 0 700 252" width="100%" role="group" aria-labelledby="fig2t fig2d">
<title id="fig2t">Dated records per day across the observed window, against monitoring coverage</title>
<desc id="fig2d">${datedInWindow} records carry a date inside the ${days.length}-day window; ${carriedIn} are carry-in baselines or undated. ${emptyDays.length} day${emptyDays.length === 1 ? ' records' : 's record'} nothing at all. ${briefings.length} briefing units were supplied against ${number(audit.nominal_expected_briefings_for_exactly_15_days_at_15_minute_cadence)} nominal intervals.</desc>
<line x1="20" y1="130" x2="680" y2="130" stroke="var(--ink-5)" stroke-width="1"/>
${days.map((day, index) => {
  const x = 20 + index * dayPitch;
  const onDay = dayRecords.get(day);
  const count = onDay.length;
  const stack = CONFIDENCE.flatMap(c => onDay.filter(r => r.confidence === c))
    .map((record, i) => pointFor(record, x, 118 - i * 12))
    .join('');
  const dayNumber = Number(day.slice(8, 10));
  const showLabel = index === 0 || index === days.length - 1 || dayNumber % 3 === 0;
  return `${stack}<line x1="${x.toFixed(1)}" y1="130" x2="${x.toFixed(1)}" y2="${count ? 135 : 139}" stroke="${count ? 'var(--ink-7)' : 'var(--copper)'}" stroke-width="${count ? 1 : 1.2}"/>${showLabel ? `<text x="${x.toFixed(1)}" y="152" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="8.5" letter-spacing="0.06em" fill="var(--ink-4)">${String(dayNumber).padStart(2, '0')}</text>` : ''}`;
}).join('')}
<text x="20" y="172" font-family="IBM Plex Mono,monospace" font-size="8.5" letter-spacing="0.1em" fill="var(--ink-4)">AUG</text>
<text x="680" y="172" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="8.5" letter-spacing="0.1em" fill="var(--ink-4)">SEP</text>
<text x="20" y="22" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--ink-4)">${datedInWindow} DATED RECORDS IN WINDOW · ${carriedIn} CARRY-IN OR UNDATED</text>
<text x="20" y="194" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--ink-4)">${emptyDays.length} DAYS RECORD NOTHING</text>
<line x1="20" y1="214" x2="680" y2="214" stroke="var(--ink-5)" stroke-width="1"/>
${briefings.map(unit => atTime(unit.window_start_utc)).filter(x => x !== null).map(x => `<line x1="${x.toFixed(1)}" y1="208" x2="${x.toFixed(1)}" y2="220" stroke="var(--ink-4)" stroke-width="1.2"/>`).join('')}
<text x="20" y="240" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--ink-4)">${briefings.length} BRIEFING WINDOWS — ${coverageShare.toFixed(2)}% OF THE SPAN</text>
</svg>`;

/* ---------------------------------------------------------------------------
   Content blocks
--------------------------------------------------------------------------- */
const refs = ids => (ids || []).map(id => { const s=sourceMap.get(id); return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.publisher)}: ${esc(s.document_title)}">${esc(id)}</a>` : `<span>${esc(id)}</span>`; }).join('');
const field = (name, value) => value ? `<div class="dossier-field"><dt>${name}</dt><dd>${esc(value)}</dd></div>` : '';

const exclusionRows = data.exclusions.map(x=>`<details class="ledger-item"><summary aria-label="Exclusion ${esc(x.item_id)} — ${esc(x.item)}"><span class="mono sm">${esc(x.item_id)}</span><span class="ledger-title">${esc(x.item)}</span></summary><p class="mono sm">${esc(x.type)}</p><p>${esc(x.reason)}</p><p class="mono sm">${esc(x.disposition)}</p></details>`).join('');

const briefingRows = briefings.map(b=>`<tr><td>${esc(b.briefing_id)}</td><td><strong>${esc(b.nominal_date)}</strong><span>${esc(b.source_subunit)}</span></td><td>${esc(b.window_start_utc)}<br>${esc(b.window_end_utc)}</td><td>${esc(b.timing_issues)}</td></tr>`).join('');

const rubricRows = Object.entries(data.confidence_rubric).map(([key, value]) => `<div class="rubric-row">${confidenceMark(key)}<div><span class="mono sm">${esc(key)}</span><p>${esc(value)}</p></div></div>`).join('');

/* ---------------------------------------------------------------------------
   How the work was done. Authorship is encoded in the series' own glyph
   vocabulary rather than a new visual language:
     single ring            — a deterministic script; re-running reproduces it
     two intersecting rings — human and AI agent working the same judgement
     ring + copper point    — a decision only the human made
     dashed connector       — a step whose method the record does not retain
   Every stage below is grounded in tools/, REPRODUCIBILITY.md or Git history.
--------------------------------------------------------------------------- */
const DRIVERS = {
  script: { name: 'Script', note: 'Deterministic. Re-running the tool reproduces the output exactly.' },
  paired: { name: 'Human + agent', note: 'Judgement applied together. The record does not attribute individual calls.' },
  human:  { name: 'Human only', note: 'A decision no script or agent made.' },
};
const driverGlyph = (driver, size = 22) => {
  const open = `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">`;
  if (driver === 'script') return `${open}<ellipse cx="12" cy="12" rx="10" ry="3.6" fill="none" stroke="var(--ink-5)" stroke-width="1"/></svg>`;
  if (driver === 'paired') return `${open}<ellipse cx="12" cy="12" rx="10" ry="3.6" fill="none" stroke="var(--ink-5)" stroke-width="1" transform="rotate(-28 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="3.6" fill="none" stroke="var(--ink-4)" stroke-width="1" transform="rotate(28 12 12)"/></svg>`;
  return `${open}<ellipse cx="12" cy="12" rx="10" ry="3.6" fill="none" stroke="var(--ink-5)" stroke-width="1"/><circle cx="22" cy="12" r="2" fill="var(--copper)"/></svg>`;
};


const stages = [
  { n:'01', name:'Supplied corpus',        driver:'script', tool:'audit_dataset.mjs',
    what:`13 top-level files inventoried. 12 briefing files resolve to ${briefings.length} units; one unrelated HTML is excluded from the corpus.` },
  { n:'02', name:'Audit',                  driver:'script', tool:'audit_dataset.mjs',
    what:'File type, byte count, SHA-256 and OOXML integrity. Internal UTC/PKT windows are treated as authoritative; filenames and filesystem times are discovery metadata only.' },
  { n:'03', name:'Normalise',              driver:'script', tool:'prepare_briefings.mjs', bridge:true,
    what:'Split, NFKC-normalised, hashed and URL-indexed, with duplicate comparison across units. The command that produced the extracted Markdown was not retained.' },
  { n:'04', name:'Independent verification', driver:'paired', tool:'no script',
    what:`${data.sources.length} external sources opened and assessed. Operative law, gazettes and official registers were sought before reporting. Per-source visit times were not logged.` },
  { n:'05', name:'Classify and curate',    driver:'paired', tool:'no script',
    what:'Verified fact, source claim and interpretation kept in separate fields; lifecycle, confidence and conflicts assigned per record. Repeated handouts were not counted as corroboration.' },
  { n:'06', name:'Canonical model',        driver:'script', tool:'build_research_dataset.mjs',
    what:`Every reference resolved and the evidence, source, exclusion and watchlist tables regenerated: ${data.events.length} events and ${data.baselines.length} baselines, ${data.exclusions.length} exclusions, ${data.watchlist.length} watch items.` },
];
const outputs = [
  { name:'Interactive HTML', tool:'build_html_report.mjs', what:'This page. All data embedded at build time.' },
  { name:'DOCX report',      tool:'build_report.py',       what:'Portable narrative artifact from a styled reference document.' },
  { name:'XLSX register',    tool:'build_workbook.py',     what:'Nine sheets with formulas and traceability.' },
];
const verification = JSON.parse(fs.readFileSync(path.join(root, 'intermediate/verification_summary.json'), 'utf8'));
const outputChecks = verification.checks.length;
if (!outputChecks) throw new Error('verification_summary.json reports no checks');
const gate = { checks: outputChecks };

const stageRows = stages.map(stage => `<div class="stage" data-bridge="${stage.bridge ? 'true' : 'false'}">
<div class="stage-mark">${driverGlyph(stage.driver)}</div>
<div class="stage-body"><p class="stage-head"><span class="mono sm faint">${stage.n}</span><strong>${stage.name}</strong><span class="mono sm">${esc(stage.tool)}</span></p><p>${stage.what}</p></div>
</div>`).join('');

const driverKey = Object.entries(DRIVERS).map(([key, value]) => `<div class="key-row">${driverGlyph(key, 24)}<div><strong>${value.name}</strong><p>${value.note}</p></div></div>`).join('');

/* Fig. 03 — what the stage list cannot show: one model, three artifacts, one gate. */
const modelY = 44, outY = 168, gateY = 268, outX = [130, 350, 570];
const pipelineFigure = `<svg viewBox="0 0 700 320" width="100%" role="img" aria-labelledby="fig3t fig3d">
<title id="fig3t">One canonical model generates three artifacts, which clear one release gate</title>
<desc id="fig3d">The curated evidence model generates ${outputs.map(o => o.name).join(', ')}. All three converge on an offline release gate of ${gate.checks} output checks, plus the workbook and link-health suites, after which a person decides whether to publish.</desc>
<ellipse cx="350" cy="${modelY}" rx="13" ry="5" fill="none" stroke="var(--ink-5)" stroke-width="1"/>
<text x="350" y="${modelY - 16}" text-anchor="middle" font-family="Newsreader,Georgia,serif" font-size="15" fill="var(--ink-2)">Canonical evidence model</text>
<text x="350" y="${modelY + 24}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="10" letter-spacing="0.08em" fill="var(--ink-4)">${records.length} RECORDS · ${data.sources.length} SOURCES</text>
<path d="M350,${modelY + 34} L350,${outY - 62} L${outX[0]},${outY - 62} M350,${outY - 62} L${outX[2]},${outY - 62}" fill="none" stroke="var(--ink-5)" stroke-width="1"/>
${outX.map(x => `<line x1="${x}" y1="${outY - 62}" x2="${x}" y2="${outY - 12}" stroke="var(--ink-5)" stroke-width="1"/>`).join('')}
${outputs.map((output, i) => `<ellipse cx="${outX[i]}" cy="${outY}" rx="11" ry="4.4" fill="none" stroke="var(--ink-5)" stroke-width="1"/><text x="${outX[i]}" y="${outY + 26}" text-anchor="middle" font-family="Newsreader,Georgia,serif" font-size="14" fill="var(--ink-2)">${output.name}</text><text x="${outX[i]}" y="${outY + 44}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.08em" fill="var(--ink-4)">${esc(output.tool).toUpperCase()}</text>`).join('')}
${outX.map(x => `<path d="M${x},${outY + 54} L${x},${gateY - 46} L350,${gateY - 46}" fill="none" stroke="var(--ink-5)" stroke-width="1"/>`).join('')}
<line x1="350" y1="${gateY - 46}" x2="350" y2="${gateY - 8}" stroke="var(--ink-5)" stroke-width="1"/>
<ellipse cx="350" cy="${gateY}" rx="13" ry="5" fill="none" stroke="var(--ink-5)" stroke-width="1"/><circle cx="363" cy="${gateY}" r="2.4" fill="var(--copper)"/>
<text x="350" y="${gateY + 26}" text-anchor="middle" font-family="Newsreader,Georgia,serif" font-size="15" fill="var(--ink-2)">Release gate — ${gate.checks} output checks, then a person</text>
</svg>`;

/* Fig. 05 — the release clock. Evenly spaced sequence with real elapsed time
   annotated on each link, so the overnight gap is stated rather than drawn to
   scale. Times are local EDT, from filesystem mtimes and Git history. */
const milestones = [
  ['2026-09-02T22:51:00-04:00', '2 Sep 22:51', 'Source corpus lands locally', false],
  ['2026-09-02T23:11:00-04:00', '2 Sep 23:11', 'Extracted Markdown present — method unrecorded', true],
  ['2026-09-03T00:15:00-04:00', '3 Sep 00:15', 'Verification snapshot cutoff', false],
  ['2026-09-03T12:31:49-04:00', '3 Sep 12:31', 'Repository initialised', false],
  ['2026-09-03T12:40:11-04:00', '3 Sep 12:40', 'Evidence package merged (PR #1)', false],
  ['2026-09-03T14:50:39-04:00', '3 Sep 14:50', 'Observatory committed', false],
  ['2026-09-03T16:16:29-04:00', '3 Sep 16:16', 'Release hardening committed', false],
  ['2026-09-03T16:56:20-04:00', '3 Sep 16:56', 'Restyle committed', false],
];
const gapLabel = (a, b) => {
  const minutes = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
};
const totalSpan = gapLabel(milestones[0][0], milestones[milestones.length - 1][0]);
const clockX = 112, clockY = i => 34 + i * 58;
const releaseFigure = `<svg viewBox="0 0 700 ${clockY(milestones.length - 1) + 46}" width="100%" role="img" aria-labelledby="fig4t fig4d">
<title id="fig4t">Local assembly and Git release milestones</title>
<desc id="fig4d">${milestones.map(m => `${m[1]}: ${m[2]}.`).join(' ')} First local file to latest commit spans ${totalSpan} of wall clock, which is not research labour time.</desc>
${milestones.map(([iso, when, what, unrecorded], i) => {
  const y = clockY(i);
  const link = i === milestones.length - 1 ? '' : (() => {
    const gap = gapLabel(iso, milestones[i + 1][0]);
    const long = (new Date(milestones[i + 1][0]).getTime() - new Date(iso).getTime()) > 6 * 3600 * 1000;
    return `<line x1="${clockX}" y1="${y + 9}" x2="${clockX}" y2="${clockY(i + 1) - 9}" stroke="${long ? 'var(--ink-5)' : 'var(--ink-7)'}" stroke-width="1"${long ? ' stroke-dasharray="3 4"' : ''}/>
<text x="${clockX + 10}" y="${y + 35}" font-family="IBM Plex Mono,monospace" font-size="8.5" letter-spacing="0.08em" fill="${long ? 'var(--ink-4)' : 'var(--ink-5)'}">${gap}${long ? ' · NO RECORDED ACTIVITY' : ''}</text>`;
  })();
  const dot = unrecorded
    ? `<circle cx="${clockX}" cy="${y}" r="4" fill="none" stroke="var(--copper)" stroke-width="1.2" stroke-dasharray="1.8 1.8"/>`
    : `<circle cx="${clockX}" cy="${y}" r="3.4" fill="var(--ink-4)"/>`;
  return `${link}${dot}<text x="${clockX - 14}" y="${y + 4}" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.08em" fill="var(--ink-4)">${when.toUpperCase()}</text><text x="${clockX + 16}" y="${y + 4}" font-family="Newsreader,Georgia,serif" font-size="14" fill="${unrecorded ? 'var(--copper)' : 'var(--ink-2)'}">${what}</text>`;
}).join('\n')}
<text x="${clockX + 16}" y="${clockY(milestones.length - 1) + 38}" font-family="IBM Plex Mono,monospace" font-size="9" letter-spacing="0.1em" fill="var(--ink-4)">${totalSpan.toUpperCase()} WALL CLOCK — NOT LABOUR TIME</text>
</svg>`;

/* ---------------------------------------------------------------------------
   Fig. 01 — the orrery. Every record is one point. Its orbit is its rung —
   intentions on the outside, reported operation nearest the centre — and its
   sector is its policy domain. The centre is the one place no record reaches:
   independently verified operation. The outer tick ring is the series mark's
   and drifts once every 180 seconds.
--------------------------------------------------------------------------- */
const ORBIT = { operating: 66, published: 112, procuring: 158, committed: 204, signalled: 250 };
const ORBIT_LABEL = { signalled: 'SIGNALLED', committed: 'COMMITTED', procuring: 'PROCURING', published: 'PUBLISHED', operating: 'RUNNING' };
const orbC = 320, orbWedge = 22;
const sectorSpan = (360 - orbWedge) / categoryCounts.length;
const sectorStart = index => -90 + orbWedge / 2 + index * sectorSpan;
const byConfidence = (a, b) => CONFIDENCE.indexOf(a.confidence) - CONFIDENCE.indexOf(b.confidence);
const orreryDividers = categoryCounts.map((_, index) => {
  const [x1, y1] = polar(orbC, orbC, 44, sectorStart(index));
  const [x2, y2] = polar(orbC, orbC, 270, sectorStart(index));
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="var(--ink-7)" stroke-width=".6" stroke-dasharray="1 3"/>`;
}).join('') + (() => {
  const [x1, y1] = polar(orbC, orbC, 44, sectorStart(categoryCounts.length));
  const [x2, y2] = polar(orbC, orbC, 270, sectorStart(categoryCounts.length));
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="var(--ink-7)" stroke-width=".6" stroke-dasharray="1 3"/>`;
})();
const orreryNumbers = categoryCounts.map((_, index) => {
  const [x, y] = polar(orbC, orbC, 272, sectorStart(index) + sectorSpan / 2);
  return monoText(x, y + 3, String(index + 1).padStart(2, '0'), { size: 9, anchor: 'middle', extra: HALO });
}).join('');
const orreryPoints = categoryCounts.map(({ category }, index) => RUNGS.map(rung => {
  const members = records.filter(r => r.category === category && rungOf(r) === rung.key).sort(byConfidence);
  return members.map((record, j) => {
    const [x, y] = polar(orbC, orbC, ORBIT[rung.key], sectorStart(index) + sectorSpan * (j + 1) / (members.length + 1));
    return `<g class="orb-pt" data-category="${slug(category)}">${pointFor(record, x, y, 4)}</g>`;
  }).join('');
}).join('')).join('');
const driftTicks = Array.from({ length: 72 }, (_, i) => {
  const long = i % 6 === 0;
  const [x1, y1] = polar(orbC, orbC, long ? 290 : 294, i * 5);
  const [x2, y2] = polar(orbC, orbC, 300, i * 5);
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="var(--ink-7)" stroke-width="${long ? 1 : .75}"/>`;
}).join('');
const orreryFigure = `<svg class="orrery" viewBox="0 0 640 640" width="100%" role="group" aria-labelledby="fig0t fig0d">
<title id="fig0t">All ${records.length} records as one system: rungs as orbits, policy domains as sectors</title>
<desc id="fig0d">${RUNGS.slice().reverse().map(r => `${r.name}, orbit ${Object.keys(ORBIT).indexOf(r.key) + 1} from the centre: ${rungRows.find(x => x.key === r.key).total} records.`).join(' ')} Sectors, clockwise from the top: ${categoryCounts.map((c, i) => `${String(i + 1).padStart(2, '0')} ${domainName(c.category)} (${c.count})`).join(', ')}. No record sits at the centre, which stands for independently verified operation.</desc>
<g class="drift">${driftTicks}</g>
<circle cx="${orbC}" cy="${orbC}" r="282" fill="none" stroke="var(--ink-7)" stroke-width=".75"/>
${Object.entries(ORBIT).map(([key, r]) => `<circle cx="${orbC}" cy="${orbC}" r="${r}" fill="none" stroke="${key === 'operating' ? 'var(--ink-5)' : 'var(--ink-7)'}" stroke-width="${key === 'operating' ? 1 : .75}"/>`).join('')}
${orreryDividers}
${orreryNumbers}
${orreryPoints}
${Object.entries(ORBIT).map(([key, r]) => ringLabel(orbC, orbC - r, ORBIT_LABEL[key])).join('')}
<circle cx="${orbC}" cy="${orbC}" r="3" fill="var(--copper)"/>
${monoText(orbC, orbC + 20, 'VERIFIED', { size: 8, anchor: 'middle', fill: 'var(--copper)' })}${monoText(orbC, orbC + 31, 'IN USE — 0', { size: 8, anchor: 'middle', fill: 'var(--copper)' })}
</svg>`;
const orreryKey = categoryCounts.map((c, i) => `<li><button type="button" data-orb-category="${slug(c.category)}" aria-pressed="false"><span class="mono sm">${String(i + 1).padStart(2, '0')}</span><span class="k">${domainName(c.category)}</span><span class="mono sm">${c.count}</span></button></li>`).join('');

/* ---------------------------------------------------------------------------
   Fig. 03 — what each rung stands on. A record is placed on the ring of the
   strongest primary source the ledger cites for it. Source tiers are read from
   the register's own `source_type` field by ordered keyword rules, first match
   wins, so the tier of every source is checkable against the register.
--------------------------------------------------------------------------- */
const SOURCE_TIERS = [
  { key: 1, name: 'Operative record', note: 'The instrument itself: gazettes, registers, procurement and parliamentary records, policy and budget texts.', expression: /gazett|policy text|framework text|instrument|procurement|parliamentary|budget|planning document|planning portfolio|register|regulation/i },
  { key: 3, name: 'Reporting', note: 'Press, trade and specialist coverage, and advertorial.', expression: /advertorial|reputable|news report|trade|specialist/i },
  { key: 2, name: 'Official voice', note: 'What an authority or company says about itself: releases, broadcasts, news agencies, directories.', expression: /.*/ },
];
const TIER = Object.fromEntries(SOURCE_TIERS.map(t => [t.key, t]));
const tierOf = source => SOURCE_TIERS.find(t => t.expression.test(source.source_type)).key;
const groundOf = record => {
  const tiers = (record.primary_source_ids || []).map(id => sourceMap.get(id)).filter(Boolean).map(tierOf);
  return tiers.length ? Math.min(...tiers) : 4;
};
const GROUND_RADIUS = { 1: 26, 2: 52, 3: 78, 4: 96 };
const groundPanels = rungRows.map((rung, index) => {
  const c = 105;
  const rings = [1, 2, 3].map(t => `<circle cx="${c}" cy="${c}" r="${GROUND_RADIUS[t]}" fill="none" stroke="var(--ink-7)" stroke-width=".75"/>`).join('')
    + `<circle cx="${c}" cy="${c}" r="${GROUND_RADIUS[4]}" fill="none" stroke="var(--ink-7)" stroke-width=".75" stroke-dasharray="1.5 3.5"/>`;
  const points = [1, 2, 3, 4].map(t => {
    const members = rung.members.filter(m => groundOf(m) === t).sort(byConfidence);
    return members.map((record, j) => {
      const [x, y] = polar(c, c, GROUND_RADIUS[t], -90 + t * 23 + j * 360 / members.length);
      return pointFor(record, x, y);
    }).join('');
  }).join('');
  const operative = rung.members.filter(m => groundOf(m) === 1).length;
  const centre = rung.key === 'operating'
    ? `<circle cx="${c}" cy="${c}" r="2.6" fill="var(--copper)"/>`
    : `<circle cx="${c}" cy="${c}" r="1.6" fill="var(--ink-5)"/>`;
  return `<div class="ground-panel"><svg viewBox="0 0 210 210" width="100%" role="group" aria-label="${esc(`${rung.name}: ${operative} of ${rung.total} records rest on an operative record`)}">${rings}${centre}${points}</svg>
<p class="mono sm">${String(index + 1).padStart(2, '0')} — ${rung.name}</p><p class="ground-stat">${operative === rung.total ? `All ${rung.total}` : operative === 0 ? 'None' : `${operative} of ${rung.total}`} on an operative record</p></div>`;
}).join('');
const groundKey = `<ul class="ground-key">${[1, 2, 3].map(t => `<li><svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">${[1, 2, 3].map(k => `<circle cx="13" cy="13" r="${k * 4 + 1}" fill="none" stroke="${k === t ? 'var(--ink-3)' : 'var(--ink-7)'}" stroke-width="${k === t ? 1.2 : .75}"/>`).join('')}</svg><span><strong>${TIER[t].name}</strong> ${TIER[t].note}</span></li>`).join('')}<li><svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="none" stroke="var(--ink-4)" stroke-width="1" stroke-dasharray="1.5 2.5"/></svg><span><strong>No primary source</strong> The ledger cites corroboration only.</span></li></ul>`;
const tierCounts = [1, 2, 3].map(t => data.sources.filter(s => tierOf(s) === t).length);
const operatingGround = operatingRung.members.map(groundOf);
const publishedGround = publishedRung.members.map(groundOf);

/* ---------------------------------------------------------------------------
   Fig. 04 — the procurement corridor. The procuring rung, split by the stage
   each record's stated status names. Ordered rules, first match wins.
--------------------------------------------------------------------------- */
const TENDER_STAGES = [
  ['evaluating', /final evaluation|technical to final/i],
  ['open', /open rfp|remains open/i],
  ['closed', /.*/],
];
const tenderStageOf = record => TENDER_STAGES.find(([, expression]) => expression.test(record.status_stage))[0];
const CORRIDOR = [
  { key: 'open', name: 'Open' },
  { key: 'closed', name: 'Closed' },
  { key: 'evaluating', name: 'Evaluation' },
  { key: 'award', name: 'Award' },
  { key: 'contract', name: 'Contract' },
  { key: 'delivery', name: 'Delivery' },
  { key: 'acceptance', name: 'Acceptance' },
];
const corridorMembers = Object.fromEntries(CORRIDOR.map(s => [s.key, procuringRung.members.filter(m => tenderStageOf(m) === s.key).sort(byConfidence)]));
const pastGate = CORRIDOR.slice(3).reduce((sum, s) => sum + corridorMembers[s.key].length, 0);
const corridorX = i => 70 + i * 160, corridorY = 176, gateX = (corridorX(2) + corridorX(3)) / 2;
const corridorFigure = `<svg viewBox="0 0 1100 250" width="100%" role="group" aria-labelledby="fig4t fig4d">
<title id="fig4t">The procurement corridor: where the ${procuringRung.total} procurement records stand</title>
<desc id="fig4d">${CORRIDOR.map(s => `${s.name}: ${corridorMembers[s.key].length}.`).join(' ')} No record has passed evaluation to award inside the window.</desc>
${monoText(corridorX(0), 28, `${procuringRung.total} PROCUREMENT RECORDS · ${pastGate} PAST EVALUATION`, { size: 9 })}
<line x1="${corridorX(0)}" y1="${corridorY}" x2="${gateX}" y2="${corridorY}" stroke="var(--ink-5)" stroke-width="1"/>
<line x1="${gateX}" y1="${corridorY}" x2="${corridorX(6)}" y2="${corridorY}" stroke="var(--ink-7)" stroke-width="1" stroke-dasharray="3 5"/>
<line x1="${gateX}" y1="${corridorY - 26}" x2="${gateX}" y2="${corridorY + 26}" stroke="var(--ink-3)" stroke-width="1.2"/>
<line x1="${gateX + 5}" y1="${corridorY - 26}" x2="${gateX + 5}" y2="${corridorY + 26}" stroke="var(--ink-3)" stroke-width="1.2"/>
<circle cx="${r1(gateX + 2.5)}" cy="${corridorY - 36}" r="3" fill="var(--copper)"/>
${monoText(gateX + 12, corridorY - 33, 'NO AWARD VERIFIED IN THE WINDOW', { fill: 'var(--copper)' })}
${CORRIDOR.map((station, i) => {
  const x = corridorX(i), members = corridorMembers[station.key], empty = members.length === 0;
  const stack = members.map((record, j) => pointFor(record, x, corridorY - 20 - j * 13)).join('');
  return `<circle cx="${x}" cy="${corridorY}" r="5" fill="var(--surface-page)" stroke="${empty ? 'var(--ink-7)' : 'var(--ink-5)'}" stroke-width="1"${empty ? ' stroke-dasharray="1.6 1.6"' : ''}/>${stack}
${monoText(x, corridorY + 26, station.name.toUpperCase(), { anchor: 'middle', fill: empty ? 'var(--ink-6)' : 'var(--ink-4)' })}${serifText(x, corridorY + 46, empty ? '—' : `${members.length} record${members.length === 1 ? '' : 's'}`, { size: 13, anchor: 'middle', fill: empty ? 'var(--ink-6)' : 'var(--ink-3)' })}`;
}).join('\n')}
</svg>`;

/* ---------------------------------------------------------------------------
   Fig. 05 — the field of view. Seventeen UTC days wound into a spiral, one
   turn per day, midnight at the top, running clockwise and outward. The
   fourteen briefing windows are drawn on it at their true times.
--------------------------------------------------------------------------- */
const spiralZero = new Date(`${windowStart}T00:00:00Z`).getTime();
const spiralTurns = days.length, spiralR0 = 58, spiralR1 = 262, spiralC = 320;
const spiralAt = stamp => {
  const t = Math.min(spiralTurns, Math.max(0, (stamp - spiralZero) / 86400000));
  return polar(spiralC, spiralC, spiralR0 + (spiralR1 - spiralR0) * t / spiralTurns, -90 + 360 * (t % 1));
};
const spiralPath = () => {
  const segments = spiralTurns * 16, step = 86400000 / 16;
  return Array.from({ length: segments + 1 }, (_, i) => {
    const [x, y] = spiralAt(spiralZero + i * step);
    if (!i) return `M${r1(x)} ${r1(y)}`;
    const radius = spiralR0 + (spiralR1 - spiralR0) * (i - .5) / 16 / spiralTurns;
    return `A${r1(radius)} ${r1(radius)} 0 0 1 ${r1(x)} ${r1(y)}`;
  }).join('');
};
const hourOfDay = value => { const d = new Date(value); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const briefingArcs = briefings.map(unit => {
  const a = new Date(unit.window_start_utc).getTime(), b = new Date(unit.window_end_utc).getTime();
  const steps = Math.max(2, Math.round((b - a) / 60000));
  const path = Array.from({ length: steps + 1 }, (_, i) => { const [x, y] = spiralAt(a + (b - a) * i / steps); return `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`; }).join('');
  return `<path d="${path}" fill="none" stroke="var(--ink-2)" stroke-width="4.2" stroke-linecap="butt"><title>${esc(unit.briefing_id)} — ${esc(unit.window_start_utc.slice(0, 16).replace('T', ' '))} to ${esc(unit.window_end_utc.slice(11, 16))} UTC</title></path>`;
}).join('');
const beamStart = 13.5, beamEnd = 15.5;
const inBeam = briefings.filter(unit => { const h = hourOfDay(unit.window_start_utc); return h >= beamStart && h < beamEnd; }).length;
const spiralFigure = `<svg viewBox="0 0 640 640" width="100%" role="img" aria-labelledby="fig5t fig5d">
<title id="fig5t">${briefings.length} briefing windows on a ${spiralTurns}-day clock</title>
<desc id="fig5d">Each turn of the spiral is one UTC day, midnight at the top, from ${dayMonth(start)} at the centre to ${dayMonth(end)} at the rim. ${inBeam} of the ${briefings.length} windows open between 13:30 and 15:30 UTC. Together they cover ${coverageShare.toFixed(2)}% of the observed span.</desc>
<circle cx="${spiralC}" cy="${spiralC}" r="282" fill="none" stroke="var(--ink-7)" stroke-width=".75"/>
${Array.from({ length: 96 }, (_, i) => { const long = i % 4 === 0; const [x1, y1] = polar(spiralC, spiralC, 282, -90 + i * 3.75); const [x2, y2] = polar(spiralC, spiralC, long ? 290 : 286, -90 + i * 3.75); return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="var(--ink-7)" stroke-width="${long ? 1 : .6}"/>`; }).join('')}
${[0, 6, 12, 18].map(h => { const [x, y] = polar(spiralC, spiralC, 304, -90 + h * 15); return monoText(x, y + 3, `${String(h).padStart(2, '0')}:00${h === 0 ? ' UTC' : ''}`, { anchor: 'middle' }); }).join('')}
<path d="${spiralPath()}" fill="none" stroke="var(--ink-7)" stroke-width=".8"/>
<line x1="${spiralC}" y1="${spiralC - spiralR0 + 4}" x2="${spiralC}" y2="${spiralC - spiralR1 - 6}" stroke="var(--ink-7)" stroke-width=".6" stroke-dasharray="1 2.5"/>
${days.map((day, i) => { const n = Number(day.slice(8, 10)); if (!(i === 0 || i === days.length - 1 || n % 3 === 0)) return ''; const r = spiralR0 + (spiralR1 - spiralR0) * i / spiralTurns; return monoText(spiralC - 6, spiralC - r + 3, `${String(n).padStart(2, '0')} ${month(new Date(`${day}T00:00:00Z`)).toUpperCase()}`, { size: 7.5, anchor: 'end', extra: HALO }); }).join('')}
${briefingArcs}
${(() => { const [x1, y1] = polar(spiralC, spiralC, spiralR1 + 8, -90 + beamStart * 15); const [x2, y2] = polar(spiralC, spiralC, spiralR1 + 8, -90 + beamEnd * 15); return `<path d="M${r1(x1)} ${r1(y1)} A${spiralR1 + 8} ${spiralR1 + 8} 0 0 1 ${r1(x2)} ${r1(y2)}" fill="none" stroke="var(--ink-3)" stroke-width="1.2"/>`; })()}
${(() => { const [x, y] = polar(spiralC, spiralC, spiralR1 + 36, -90 + (beamStart + beamEnd) / 2 * 15); return monoText(x, y, `${inBeam} OF ${briefings.length} WINDOWS`, { anchor: 'end' }) + monoText(x, y + 12, '13:30–15:30 UTC', { anchor: 'end' }); })()}
<circle cx="${spiralC}" cy="${spiralC}" r="2" fill="var(--ink-5)"/>
</svg>`;

/* ---------------------------------------------------------------------------
   Fig. 07 — the verification calendar. Watch items with a stated date on a
   day axis from the search cutoff; undated items held on their own orbit.
--------------------------------------------------------------------------- */
const watchDate = item => (String(item.date_or_trigger).match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null;
const watchNumbered = data.watchlist.map((item, index) => ({ ...item, n: String(index + 1).padStart(2, '0'), iso: watchDate(item) }));
const dated = watchNumbered.filter(w => w.iso), undated = watchNumbered.filter(w => !w.iso);
const calStart = new Date(`${data.report.search_cutoff_utc.slice(0, 10)}T00:00:00Z`).getTime();
const calEnd = Math.max(...dated.map(w => new Date(`${w.iso}T00:00:00Z`).getTime())) + 86400000;
const calDays = Math.round((calEnd - calStart) / 86400000);
const calX = stamp => 50 + (stamp - calStart) / 86400000 * (700 / calDays);
const calY = 150;
const watchLink = (w, inner) => `<a class="pt" href="#watch-${w.n}" aria-label="${esc(`${w.n} — ${w.topic}, ${w.date_or_trigger}`)}"><title>${esc(`${w.n} — ${w.topic}`)}</title>${inner}</a>`;
const datedByDay = new Map();
for (const w of dated) datedByDay.set(w.iso, [...(datedByDay.get(w.iso) || []), w]);
const undatedC = [940, 118], undatedR = 50;
const calendarFigure = `<svg viewBox="0 0 1100 240" width="100%" role="group" aria-labelledby="fig7t fig7d">
<title id="fig7t">When the ${data.watchlist.length} named triggers fall due</title>
<desc id="fig7d">${dated.length} triggers carry a date between ${dayMonth(new Date(calStart))} and ${dayMonth(new Date(calEnd - 86400000))}: ${dated.map(w => `${w.n} ${w.topic} on ${w.date_or_trigger}`).join('; ')}. ${undated.length} carry no date and wait on the next disclosure: ${undated.map(w => `${w.n} ${w.topic}`).join('; ')}.</desc>
<line x1="${calX(calStart)}" y1="${calY}" x2="${r1(calX(calEnd))}" y2="${calY}" stroke="var(--ink-5)" stroke-width="1"/>
${Array.from({ length: calDays + 1 }, (_, i) => { const stamp = calStart + i * 86400000, x = calX(stamp), d = new Date(stamp); const mark = i % 7 === 0; return `<line x1="${r1(x)}" y1="${calY}" x2="${r1(x)}" y2="${calY + (mark ? 8 : 4)}" stroke="var(--ink-7)" stroke-width="1"/>${mark ? monoText(x, calY + 24, `${d.getUTCDate()} ${month(d).toUpperCase()}`, { size: 8.5, anchor: 'middle' }) : ''}`; }).join('')}
<circle cx="${calX(calStart)}" cy="${calY}" r="3" fill="var(--copper)"/>
${monoText(calX(calStart), calY + 42, 'SEARCH CUTOFF', { size: 8.5, fill: 'var(--copper)' })}
${[...datedByDay.entries()].map(([iso, items]) => { const x = calX(new Date(`${iso}T00:00:00Z`).getTime() + 43200000); return items.map((w, j) => { const y = calY - 22 - j * 30; return `<line x1="${r1(x)}" y1="${calY}" x2="${r1(x)}" y2="${y + 5}" stroke="var(--ink-7)" stroke-width="1"/>${watchLink(w, `<circle cx="${r1(x)}" cy="${y}" r="5" fill="var(--surface-page)" stroke="var(--ink-4)" stroke-width="1.1"/>`)}${monoText(x, y - 12, w.n, { size: 9, anchor: 'middle', fill: 'var(--ink-3)' })}`; }).join(''); }).join('')}
${monoText(50, 30, `${dated.length} DATED TRIGGERS`, { size: 9 })}
<circle cx="${undatedC[0]}" cy="${undatedC[1]}" r="${undatedR}" fill="none" stroke="var(--ink-7)" stroke-width=".75" stroke-dasharray="1.5 3.5"/>
<circle cx="${undatedC[0]}" cy="${undatedC[1]}" r="1.6" fill="var(--ink-5)"/>
${undated.map((w, i) => { const a = -90 + i * 360 / undated.length; const [x, y] = polar(undatedC[0], undatedC[1], undatedR, a); const [lx, ly] = polar(undatedC[0], undatedC[1], undatedR + 16, a); return `${watchLink(w, `<circle cx="${r1(x)}" cy="${r1(y)}" r="5" fill="var(--surface-page)" stroke="var(--ink-5)" stroke-width="1" stroke-dasharray="1.6 1.6"/>`)}${monoText(lx, ly + 3, w.n, { size: 9, anchor: 'middle', fill: 'var(--ink-3)' })}`; }).join('')}
${monoText(undatedC[0], 30, `${undated.length} UNDATED`, { size: 9, anchor: 'middle' })}
${monoText(undatedC[0], 218, 'WAITING ON THE NEXT DISCLOSURE', { size: 8.5, anchor: 'middle' })}
</svg>`;

/* ---------------------------------------------------------------------------
   Fig. 08 — the source hierarchy. All assessed sources on three orbits by
   tier, nearest the claim first. Each point opens its row in the register.
--------------------------------------------------------------------------- */
const HIER_RADIUS = { 1: 78, 2: 132, 3: 186 }, hierC = 220, hierWedge = 34;
const hierarchyFigure = `<svg viewBox="0 0 440 440" width="100%" role="group" aria-labelledby="fig8t fig8d">
<title id="fig8t">${data.sources.length} assessed sources by distance from the claim</title>
<desc id="fig8d">${[1, 2, 3].map((t, i) => `${TIER[t].name}: ${tierCounts[i]} sources.`).join(' ')}</desc>
${[1, 2, 3].map(t => `<circle cx="${hierC}" cy="${hierC}" r="${HIER_RADIUS[t]}" fill="none" stroke="var(--ink-7)" stroke-width=".75"/>`).join('')}
<circle cx="${hierC}" cy="${hierC}" r="2.4" fill="var(--ink-3)"/>
${monoText(hierC, hierC + 18, 'THE CLAIM', { size: 8, anchor: 'middle' })}
${[1, 2, 3].map(t => { const members = data.sources.filter(s => tierOf(s) === t); return members.map((s, j) => { const [x, y] = polar(hierC, hierC, HIER_RADIUS[t], -90 + hierWedge / 2 + (360 - hierWedge) * (j + .5) / members.length); return `<a class="pt" href="#src-${esc(s.source_id)}"><title>${esc(`${s.source_id} — ${s.publisher}: ${s.document_title}`)}</title><circle cx="${r1(x)}" cy="${r1(y)}" r="3" fill="${t === 1 ? 'var(--ink-3)' : 'none'}" stroke="var(--ink-5)" stroke-width="${t === 1 ? 0 : 1}"${t === 3 ? ' stroke-dasharray="1.6 1.6"' : ''}/></a>`; }).join(''); }).join('')}
${[1, 2, 3].map((t, i) => ringLabel(hierC, hierC - HIER_RADIUS[t], `${TIER[t].name.toUpperCase()} · ${tierCounts[i]}`)).join('')}
</svg>`;

/* Rung track: the five rungs as stops on a rule, the record's own stop marked. */
const rungTrackBase = `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><g id="rung-base"><line x1="5" y1="7" x2="95" y2="7" stroke="var(--ink-7)" stroke-width="1"/>${RUNGS.map((_, i) => `<circle cx="${5 + i * 22.5}" cy="7" r="1.5" fill="var(--ink-7)"/>`).join('')}</g></defs></svg>`;
const rungTrack = (rungKey, confidence) => {
  const x = 5 + RUNGS.findIndex(r => r.key === rungKey) * 22.5;
  const mark = confidence ? dotFor(confidence, x, 7, 3.8) : `<circle cx="${x}" cy="7" r="3.8" fill="var(--surface-page)" stroke="var(--ink-3)" stroke-width="1.1"/>`;
  return `<svg class="rung-track" width="100" height="14" viewBox="0 0 100 14" aria-hidden="true"><use href="#rung-base"/>${mark}</svg>`;
};

/* Domain × rung matrix for Section IV: each domain's records laid out by rung. */
const matrixCell = members => members.length
  ? `<svg width="${members.length * 11 + 2}" height="12" viewBox="0 0 ${members.length * 11 + 2} 12" aria-hidden="true">${members.sort(byConfidence).map((m, i) => dotFor(m.confidence, 6 + i * 11, 6, 3.4)).join('')}</svg>`
  : '<span class="matrix-empty" aria-hidden="true"></span>';

const recordRows = records.map((record, index) => {
  const rung = RUNGS.find(r => r.key === rungOf(record));
  return `<article class="record" data-record data-type="${record.recordType.toLowerCase()}" data-confidence="${slug(record.confidence)}" data-category="${slug(record.category)}" data-rung="${rung.key}" data-search="${esc([record.event_id,record.normalized_event_title,record.institution,record.geography,record.verified_facts,record.status_stage].join(' ').toLowerCase())}" id="${recordAnchor(record)}">
<div class="record-index"><span class="mono sm faint">${String(index + 1).padStart(2, '0')}</span></div>
<div class="record-body">
  <p class="record-kicker">${esc(record.event_date)} — ${esc(record.institution)}</p>
  <h3>${esc(record.normalized_event_title)}</h3>
  <p class="record-status">${esc(record.status_stage)}</p>
  <p class="record-change">${esc(record.what_changed)}</p>
  <details><summary aria-label="Evidence dossier — ${esc(record.normalized_event_title)}"><span>Evidence dossier</span></summary><dl>
    ${field('Verified facts',record.verified_facts)}${field('Source claim',record.source_claims)}${field('Why it matters',record.significance)}${field('Analysis',record.analytical_interpretation)}${field('What to verify next',record.forward_implications)}${field('Unresolved',record.unresolved_issues)}${field('Confidence basis',record.confidence_reason)}
  </dl><p class="source-links"><span class="mono sm">Evidence</span>${refs([...(record.primary_source_ids||[]),...(record.corroborating_source_ids||[])])}</p>
  <p class="mono sm machine-id">${esc(record.event_id)} · ${label(record.category)} · ${label(record.lifecycle)}</p></details>
</div>
<div class="record-marks">
  ${rungTrack(rung.key, record.confidence)}
  <span class="mono sm rung-name">${esc(rung.name)}</span>
  <span class="mark-row">${confidenceMark(record.confidence)}<span class="mono sm">${esc(record.confidence)}</span></span>
  <span class="mono sm">${record.recordType}</span>
</div>
</article>`;
}).join('');

const sourceRows = data.sources.map(s => `<tr data-source data-search="${esc([s.source_id,s.publisher,s.document_title,s.source_type,s.publication_date,s.availability].join(' ').toLowerCase())}" id="src-${esc(s.source_id)}"><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.source_id)}</a></td><td><strong>${esc(s.publisher)}</strong><span>${esc(s.document_title)}</span></td><td>${esc(s.source_type)}</td><td>${esc(s.publication_date)}</td><td>${esc(s.availability)}</td><td>${esc(s.limitations)}</td></tr>`).join('');

const watches = data.watchlist.map((w,i)=>`<article class="watch"><span class="mono sm faint">${String(i+1).padStart(2,'0')}</span><div id="watch-${String(i+1).padStart(2,'0')}"><p class="record-kicker">${esc(w.date_or_trigger)}</p><h3>${esc(w.topic)}</h3><p>${esc(w.what_to_verify)}</p>${w.source_url ? `<a class="watch-link" href="${esc(w.source_url)}" target="_blank" rel="noopener noreferrer">Track via ${esc(w.source_id || 'source register')} →</a>` : '<span class="mono sm watch-pending">No source URL assigned</span>'}</div></article>`).join('');

const matrixHead = `<div class="matrix-head" aria-hidden="true"><span class="mono sm">Domain</span>${RUNGS.map(r => `<span class="mono sm">${r.name}</span>`).join('')}<span class="mono sm">All</span></div>`;
const categoryBars = categoryCounts.map(x => {
  const byRung = RUNGS.map(r => records.filter(m => m.category === x.category && rungOf(m) === r.key));
  return `<button class="category-bar" type="button" data-category-button="${slug(x.category)}" aria-pressed="false"><span class="mono sm cat-name">${domainName(x.category)}</span>${byRung.map((members, i) => `<span class="cell" data-rung-cell="${RUNGS[i].key}">${matrixCell(members)}</span>`).join('')}<b class="mono sm">${x.count}</b><span class="skip">: ${RUNGS.map((r, i) => `${r.name} ${byRung[i].length}`).join(', ')}</span></button>`;
}).join('');

const gapStatement = audit.all_interbrief_gaps_exceed_30_minutes
  ? 'Every inter-briefing gap exceeded 30 minutes.'
  : 'Not every inter-briefing gap exceeded 30 minutes; inspect the coverage ledger.';

const contents = [
  ['sec-1', 'I', 'What actually moved'],
  ['sec-2', 'II', 'How far anything got'],
  ['sec-3', 'III', 'The window we could see'],
  ['sec-4', 'IV', 'Where the state is concentrating'],
  ['sec-5', 'V', 'The evidence ledger'],
  ['sec-6', 'VI', 'What would change the story'],
  ['sec-7', 'VII', 'Method and limits'],
  ['sec-8', 'VIII', 'How this was made'],
  ['sec-9', 'IX', 'What was not counted'],
  ['sec-10', 'X', 'Source register'],
];
const contentsNav = contents.map(([id, numeral, title]) => `<a href="#${id}"><span class="mono sm">${numeral}</span><span class="t">${title}</span></a>`).join('');

/* Each signal points at the ledger record it rests on, or — for a pattern
   rather than a single record — at the rung it describes. */
const signals = [
  ['Binding change', 'Virtual-asset rules crossed into force.', 'PVARA notified concrete cyber, cloud, algorithm, record-retention and incident-reporting duties on 21 August.', 'EVT-REG-20260821-PVARA'],
  ['Process change', 'Investor onboarding acquired deadlines.', 'SECP Circular 19/2026 is final, though its commencement still requires clarification.', 'EVT-SECP-20260827-C19'],
  ['Evidence split', 'Google’s presence is real and still unresolved.', 'A ceremony and corporate language are verified. A staffed office, local hosting and premises details are not.', 'EVT-GOOG-20260818-OFFICE'],
  ['Upstream capacity', 'Most of it sits before commissioning.', 'Tenders, evaluations and plans dominate. Sky47’s July inauguration is a physical baseline, not proof of usable AI capacity.', 'procuring'],
  ['Missingness', 'The corpus missed a consequential cyber MoU.', 'The 1 September Saudi–Pakistan agreement shows why an absent briefing cannot mean an absent event.', 'EVT-INTL-20260901-SAUDI-NCA-CYBER-MOU'],
];
const signalRows = signals.map(([kicker, claim, detail, anchor], index) => {
  const record = records.find(r => r.event_id === anchor);
  if (!record && !RUNG_NAME[anchor]) throw new Error(`Signal ${index + 1} points at an unknown record or rung: ${anchor}`);
  const rungKey = record ? rungOf(record) : anchor;
  const marks = record
    ? `${rungTrack(rungKey, record.confidence)}<span class="mono sm rung-name">${RUNG_NAME[rungKey]} · ${record.confidence}</span><a class="signal-link mono sm" href="#${recordAnchor(record)}">Open record ${String(records.indexOf(record) + 1).padStart(2, '0')} →</a>`
    : `${rungTrack(rungKey)}<span class="mono sm rung-name">${RUNG_NAME[rungKey]} · ${procuringRung.total} records</span><a class="signal-link mono sm" href="#fig-corridor">See the corridor →</a>`;
  return `<article class="signal"><span class="mono sm faint">${String(index + 1).padStart(2, '0')}</span><div class="signal-body"><span class="mono sm">${kicker}</span><h3>${claim}</h3><p>${detail}</p></div><div class="signal-marks">${marks}</div></article>`;
}).join('');

const methodItems = [
  ['Lifecycle before language', 'Proposal is not approval; tender is not award; MoU is not commissioning; inauguration is not verified load or use.'],
  ['Source hierarchy', 'Operative law and official records lead, then direct institutional publications, then credible reporting. Repeated handouts are not independent corroboration.'],
  ['Confidence is scoped', 'High, Medium and Low attach to the stated event and lifecycle claim — not to future execution, impact or completeness.'],
  ['Coverage is sparse', `${briefings.length} units against ${number(audit.nominal_expected_briefings_for_exactly_15_days_at_15_minute_cadence)} nominal intervals. Missing intervals were documented and never imputed as “no change.”`],
  ['Contradictions stay visible', 'Mutable dates, inaccessible instruments and conflicting trackers remain unresolved rather than silently harmonised.'],
  ['Publication boundary', 'Derived report content and data are licensed CC BY 4.0; repository code is MIT-licensed. Linked third-party material remains under its original rights and is not redistributed here.'],
];
const methodRows = methodItems.map(([title, body]) => `<div class="method-item"><h3>${title}</h3><p>${body}</p></div>`).join('');

const note = (tag, body) => `<aside class="margin-note"><p class="margin-thought"><span class="mono sm tag">${tag}</span>${body}</p></aside>`;

/* ---------------------------------------------------------------------------
   Page
--------------------------------------------------------------------------- */
const cap = value => value.replace(/^./, c => c.toUpperCase());
const groundInner = rung => rung.members.filter(m => groundOf(m) === 1).length;
const tenderCounts = Object.fromEntries(['open', 'closed', 'evaluating'].map(k => [k, corridorMembers[k].length]));
const readoutRows = [
  [String(records.length), `verified records, ${esc(periodLabel)}`],
  [String(publishedRung.total), `published rules — ${dominant(publishedRung) ? `all ${dominant(publishedRung).toLowerCase()} confidence` : `${publishedRung.byConfidence.High} high confidence`}`],
  [String(operatingRung.total), `claims that something is running — ${operatingRung.byConfidence.High === 0 ? 'none high confidence' : `${operatingRung.byConfidence.High} high confidence`}`],
  [`${coverageShare.toFixed(2)}%`, 'of the observed window was actually watched'],
];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="author" content="Muhammad Umar Zafar"><meta name="description" content="A source-bounded interactive edition of Pakistan's verified AI policy and digital infrastructure monitoring report, ${esc(periodLabel)}."><title>Pakistan AI Policy Observatory — ${esc(periodLabel)}</title>
<script>(function(){var t=null;try{t=localStorage.getItem('mmm-theme');}catch(e){}if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);})();</script>
<style>
@import url("https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap");
:root{
--paper-1:#f4f1ea;--paper-2:#eee9df;--paper-3:#e5e0d3;--paper-4:#ddd7c8;
--ink-1:#2e2b27;--ink-2:#3f3b35;--ink-3:#5c584f;--ink-4:#726c5e;--ink-5:#8c8578;--ink-6:#a39a86;--ink-7:#c0b8a5;
--copper:#8a5a3b;
--surface-page:var(--paper-1);--surface-hover:var(--paper-2);--rule-hairline:var(--paper-3);--rule-structural:var(--paper-4);
--text-display:var(--ink-1);--text-body:var(--ink-2);--text-lead:var(--ink-3);--text-support:var(--ink-4);--text-label:var(--ink-4);--text-faint:var(--ink-4);--mark-stroke:var(--ink-5);--mark-stroke-faint:var(--ink-7);
--link-hover:var(--copper);
--font-display:"Newsreader",Georgia,serif;--font-body:"Newsreader",Georgia,serif;--font-mono:"IBM Plex Mono",ui-monospace,monospace;
--type-entry-size:46px;--type-entry-line:1.18;--type-h2-size:30px;--type-h2-line:1.28;--type-h3-size:21px;--type-h3-line:1.35;
--type-lead-size:21px;--type-lead-line:1.6;--type-body-size:18px;--type-body-line:1.78;
--measure-prose:64ch;--measure-lead:60ch;
--type-label-size:11px;--type-label-track:0.14em;--type-label-size-sm:10px;--type-label-track-sm:0.1em;--type-label-track-lg:0.18em;
--type-support-size:14px;--type-support-line:1.5;--type-marginalia-size:16px;--type-marginalia-line:1.6;--measure-marginalia:34ch;
--space-1:5px;--space-2:12px;--space-3:20px;--space-4:28px;--space-5:40px;--space-6:56px;--space-7:76px;--space-8:104px;
--radius-image:2px;--page-max:1120px;--contents-max:760px;--rail-width:300px;--rail-left-width:200px;--gutter-column:76px;--gutter-left:48px;
--rail-span:calc(var(--rail-width) + var(--gutter-left));--page-pad:var(--space-5);
--gap-heading-body:var(--space-2);--gap-paragraph:var(--space-3);--gap-block:var(--space-4);--gap-section:var(--space-6);--gap-page:var(--space-5);
--ease-standard:ease;--dur-hover:160ms;
}
:root[data-theme="dark"]{--paper-1:#1c1815;--paper-2:#241f1a;--paper-3:#332c25;--paper-4:#443a30;--ink-1:#f3ede1;--ink-2:#ddd5c5;--ink-3:#c2b8a3;--ink-4:#a89c85;--ink-5:#8f8368;--ink-6:#756a54;--ink-7:#4c4335;--copper:#c07f52}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper-1:#1c1815;--paper-2:#241f1a;--paper-3:#332c25;--paper-4:#443a30;--ink-1:#f3ede1;--ink-2:#ddd5c5;--ink-3:#c2b8a3;--ink-4:#a89c85;--ink-5:#8f8368;--ink-6:#756a54;--ink-7:#4c4335;--copper:#c07f52}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;max-width:100%;overflow-x:clip}
html{scroll-behavior:smooth;scroll-padding-top:var(--space-5)}
body{background:var(--surface-page);color:var(--text-body);font-family:var(--font-body);font-size:var(--type-body-size);line-height:var(--type-body-line);transition:background var(--dur-hover) var(--ease-standard),color var(--dur-hover) var(--ease-standard)}
a{color:inherit}a:hover{color:var(--link-hover)}
:focus-visible{outline:2px solid var(--copper);outline-offset:3px}
h1,h2,h3{font-family:var(--font-display);font-weight:400;color:var(--text-display)}
.skip{position:absolute;left:-9999px}.skip:focus{left:var(--space-3);top:var(--space-3);z-index:20;background:var(--surface-page);padding:var(--space-2) var(--space-3);border:1px solid var(--rule-structural)}
.mono{font-family:var(--font-mono);text-transform:uppercase;letter-spacing:var(--type-label-track);font-size:var(--type-label-size);color:var(--text-label)}
.mono.sm{font-size:var(--type-label-size-sm);letter-spacing:var(--type-label-track-sm)}
.mono.lg{letter-spacing:var(--type-label-track-lg)}
.mono.faint{color:var(--text-faint)}
/* frame — contents rail, text column, margin rail. Notes, captions and marks
   sit in the margin rail; wide figures and ledgers run across it. */
.page{max-width:calc(var(--rail-left-width) + 2 * var(--gutter-left) + var(--contents-max) + var(--rail-width) + 2 * var(--page-pad));margin:0 auto;padding:var(--space-7) var(--page-pad) var(--space-8)}
.frame{display:grid;grid-template-columns:var(--rail-left-width) minmax(0,1fr);column-gap:var(--gutter-left)}
.leftnav-inner{position:sticky;top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-2)}
.leftnav-inner>.mono{margin-bottom:var(--space-1)}
.leftnav a{display:flex;gap:var(--space-2);align-items:baseline;text-decoration:none;color:var(--text-support);transition:color var(--dur-hover) var(--ease-standard)}
.leftnav a:hover{color:var(--text-display)}
.leftnav a .t{font-family:var(--font-body);font-size:14px;line-height:1.4}
.leftnav a.start-link{margin-bottom:var(--space-2);padding-bottom:var(--space-2);border-bottom:1px solid var(--rule-hairline);color:var(--text-display)}
.leftnav a.start-link .mono{color:var(--copper)}
.leftnav a.is-active{color:var(--text-display)}
.leftnav a.is-active .mono{color:var(--copper)}
.content{min-width:0}
.hero,.tldr,.content>section:not(.student-guide){padding-right:var(--rail-span);display:flow-root}
.content h2{font-size:var(--type-h2-size);line-height:var(--type-h2-line);margin:0 0 var(--gap-heading-body)}
.content h3{font-size:var(--type-h3-size);line-height:var(--type-h3-line);font-weight:500;margin:var(--gap-block) 0 var(--gap-heading-body)}
.content p{margin:0 0 var(--gap-paragraph);max-width:var(--measure-prose)}
.content>section{padding-top:var(--gap-section);padding-bottom:var(--space-3);border-top:1px solid var(--rule-structural)}
.content>section:first-of-type{border-top:none;padding-top:0}
.content .num{display:block;margin-bottom:var(--space-1)}
.content h3.sub{font-weight:400;font-size:24px;line-height:1.3;margin:var(--gap-section) 0 var(--gap-heading-body)}
/* hero */
.hero{margin:0 0 var(--gap-page)}
.hero-eyebrow{display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4)}
.hero-glyph{flex-shrink:0;opacity:.9}
.hero h1{font-size:var(--type-entry-size);line-height:var(--type-entry-line);margin:0 0 var(--space-3);max-width:var(--measure-lead)}
.hero .thesis{font-style:italic;font-size:var(--type-lead-size);line-height:var(--type-lead-line);color:var(--text-lead);margin:0 0 var(--space-4);max-width:var(--measure-lead)}
.hero .lead{margin:0 0 var(--space-4);max-width:var(--measure-prose)}
.hero .meta-row{display:flex;gap:var(--space-2) var(--space-4);flex-wrap:wrap;padding-top:var(--space-3);border-top:1px solid var(--rule-hairline);clear:left}
.hero-readout{float:right;width:var(--rail-width);margin:0 calc(-1 * var(--rail-span)) var(--space-4) 0;border-top:1px solid var(--rule-structural)}
.readout-row{padding:var(--space-3) 0 var(--space-2);border-bottom:1px solid var(--rule-hairline)}
.readout-row b{display:block;font-family:var(--font-display);font-weight:400;font-size:38px;line-height:1.05;color:var(--text-display);letter-spacing:-0.01em}
.readout-row span{display:block;margin-top:var(--space-1);font-size:15px;line-height:1.45;color:var(--text-support)}
/* tldr */
.tldr{margin:0 0 var(--gap-page);border-top:1px solid var(--rule-structural);border-bottom:1px solid var(--rule-structural);padding:var(--gap-block) var(--rail-span) var(--gap-block) 0}
.tldr ul{margin:var(--gap-heading-body) 0 0;padding-left:1.1em;max-width:var(--measure-prose)}
.tldr li{margin-bottom:var(--space-2)}.tldr li:last-child{margin-bottom:0}
/* student guide */
.student-guide{margin:0 0 var(--gap-page);padding:var(--gap-block) 0;border-bottom:1px solid var(--rule-structural);scroll-margin-top:var(--space-4)}
.student-guide-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-2);margin-bottom:var(--space-2)}
.student-guide-head .mono:last-child{margin-left:auto}
.student-guide h2{font-size:var(--type-h2-size);line-height:var(--type-h2-line);margin:0 0 var(--gap-heading-body)}
.student-guide>p{margin:0;max-width:var(--measure-prose)}
.student-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 var(--space-5);margin-top:var(--gap-block)}
.student-guide-card{min-width:0;padding:var(--space-3) 0;border-top:1px solid var(--rule-hairline)}
.student-guide-card h3{margin:var(--space-1) 0 var(--space-1);font-size:18px;line-height:1.35;font-weight:500}
.student-guide-card p{margin:0;max-width:none;font-size:15px;line-height:1.62;color:var(--text-support)}
.student-guide-card a{color:var(--text-label);text-decoration:none;border-bottom:1px solid var(--rule-hairline);overflow-wrap:anywhere}
.student-guide-card a:hover,.student-guide-card a:focus-visible{color:var(--copper);border-bottom-color:var(--copper)}
/* margin notes live in the rail beside the passage they gloss */
.margin-note{float:right;clear:right;width:var(--rail-width);margin:var(--space-1) calc(-1 * var(--rail-span)) var(--space-4) 0;padding-top:var(--space-2);border-top:1px solid var(--rule-structural)}
.margin-thought{font-style:italic;font-size:var(--type-marginalia-size);line-height:var(--type-marginalia-line);color:var(--text-lead);margin:0}
.margin-thought .tag{display:block;margin-bottom:var(--space-2);font-style:normal}
/* figures — the drawing in the text column, its caption in the rail */
.figure-block{clear:right;margin:var(--gap-block) calc(-1 * var(--rail-span)) var(--gap-section) 0;display:grid;grid-template-columns:minmax(0,1fr) var(--rail-width);column-gap:var(--gutter-left);align-items:end}
.figure-block svg{display:block;max-width:100%;height:auto}
.figure-block figcaption{min-width:0;font-size:var(--type-support-size);line-height:var(--type-support-line);color:var(--text-support);padding-top:var(--space-2);border-top:1px solid var(--rule-hairline)}
.figure-block figcaption .fig-no{display:block;margin-bottom:var(--space-1)}
.figure-block figcaption p{font-size:inherit;line-height:inherit;margin:0 0 var(--space-2)}
.figure-block.top{align-items:start}
.figure-block.top>svg{width:100%;max-width:620px;margin:0 auto}
.figure-block.full{grid-template-columns:minmax(0,1fr)}
.figure-block.full figcaption{max-width:var(--measure-prose);margin-top:var(--space-3)}
.scroll-x{min-width:0;overflow-x:auto;overscroll-behavior-x:contain}
.fig-body{min-width:0}
/* shared point interaction: every record point is a link into the ledger */
.pt{cursor:pointer}
.pt circle{transition:transform var(--dur-hover) var(--ease-standard);transform-box:fill-box;transform-origin:center}
.pt:hover circle,.pt:focus-visible circle{transform:scale(1.7)}
.pt:focus-visible{outline:none}
.pt:focus-visible circle{stroke:var(--copper);stroke-width:1.4}
.rung-hit{fill:transparent;transition:fill var(--dur-hover) var(--ease-standard)}
.rung-link:hover .rung-hit,.rung-link:focus-visible .rung-hit{fill:var(--surface-hover)}
.rung-link:focus-visible{outline:none}
.rung-cue{opacity:0;transition:opacity var(--dur-hover) var(--ease-standard)}
.rung-link:hover .rung-cue,.rung-link:focus-visible .rung-cue{opacity:1}
/* the orrery */
.orrery-block{align-items:start}
.content>.figure-block{margin-right:0}
.orrery{margin:0 auto;max-width:700px}
.drift{transform-origin:320px 320px;animation:drift 180s linear infinite}
@keyframes drift{to{transform:rotate(360deg)}}
.orb-pt{transition:opacity var(--dur-hover) var(--ease-standard)}
.orrery.is-focus .orb-pt{opacity:.14}
.orrery.is-focus .orb-pt.on{opacity:1}
.orb-key{list-style:none;margin:var(--space-3) 0;padding:0;border-top:1px solid var(--rule-hairline)}
.orb-key button{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:var(--space-2);align-items:baseline;width:100%;padding:6px 0;background:none;border:0;border-bottom:1px solid var(--rule-hairline);font:inherit;color:var(--text-support);text-align:left;cursor:pointer;transition:color var(--dur-hover) var(--ease-standard)}
.orb-key .k{font-size:14px;line-height:1.35}
.orb-key button:hover,.orb-key button:focus-visible,.orb-key button[aria-pressed=true]{color:var(--text-display)}
.orb-key button[aria-pressed=true] .mono:first-child{color:var(--copper)}
.orb-readout{min-height:5.4em;margin:0;padding-top:var(--space-2);border-top:1px solid var(--rule-structural)}
.orb-readout .mono{display:block;margin-bottom:var(--space-1)}
.orb-readout .t{display:block;font-size:16px;line-height:1.4;color:var(--text-display)}
/* callout */
.callout{border-top:1px solid var(--rule-structural);border-bottom:1px solid var(--rule-structural);padding:var(--gap-block) 0;margin:var(--gap-block) 0;max-width:var(--measure-prose)}
.callout>.mono{display:block;margin-bottom:var(--space-2)}
.callout p:last-child{margin-bottom:0}
/* rung track — five stops, the record's own stop marked */
.rung-track{display:block;flex-shrink:0}
.defs{position:absolute;width:0;height:0;overflow:hidden}
/* signals */
.signal-head,.signal{display:grid;grid-template-columns:44px minmax(0,1fr) var(--rail-width);column-gap:var(--space-3);margin-right:calc(-1 * var(--rail-span))}
.signal-head{clear:right;margin-top:var(--gap-block);padding-bottom:var(--space-2);border-bottom:1px solid var(--rule-structural)}
.signal-head .mono:last-child{grid-column:3}
.signal{padding:var(--space-4) 0;border-bottom:1px solid var(--rule-hairline)}
.signal:last-of-type{border-bottom:none}
.signal-body{padding-right:calc(var(--gutter-left) - var(--space-3))}
.signal h3{margin:var(--space-1) 0 var(--space-1);font-size:var(--type-h3-size);line-height:var(--type-h3-line)}
.signal p{margin:0;color:var(--text-support);font-size:16px;line-height:1.62}
.signal-marks,.record-marks{display:flex;flex-direction:column;gap:var(--space-1);align-items:flex-start;padding-top:6px}
.signal-link{text-decoration:none;color:var(--text-label);border-bottom:1px solid var(--rule-hairline);margin-top:var(--space-1)}
.signal-link:hover,.signal-link:focus-visible{color:var(--copper);border-bottom-color:var(--copper)}
/* grounding panels */
.ground-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--space-4) var(--space-3)}
.ground-panel{min-width:0;border-top:1px solid var(--rule-hairline);padding-top:var(--space-2)}
.ground-panel svg{max-width:210px;margin:0 auto var(--space-2)}
.ground-panel .mono{margin:0}
.content .ground-panel p.ground-stat{margin:var(--space-1) 0 0;font-size:15px;line-height:1.4;color:var(--text-support)}
.ground-key{list-style:none;margin:var(--space-3) 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2) var(--space-4)}
.ground-key li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:var(--space-2);align-items:start}
.ground-key strong{font-weight:500;color:var(--text-display)}
/* category matrix */
.category-bars{margin:var(--gap-block) calc(-1 * var(--rail-span)) var(--gap-block) 0;clear:right}
.matrix-head,.category-bar{display:grid;grid-template-columns:minmax(0,240px) repeat(5,minmax(0,1fr)) 40px;column-gap:var(--space-3);align-items:center}
.matrix-head{padding:0 0 var(--space-2);border-bottom:1px solid var(--rule-structural)}
.matrix-head span:last-child{text-align:right}
.category-bar{position:relative;width:100%;background:none;border:0;border-bottom:1px solid var(--rule-hairline);padding:var(--space-2) 0;text-align:left;cursor:pointer;color:inherit;font:inherit;transition:background var(--dur-hover) var(--ease-standard)}
.category-bar:hover{background:var(--surface-hover)}
.category-bar:last-child{border-bottom:none}
.category-bar .cell{display:flex;align-items:center;min-height:14px;min-width:0}
.category-bar .cell svg{display:block}
.matrix-empty{display:block;width:8px;border-top:1px solid var(--ink-7)}
.category-bar b{text-align:right;color:var(--text-support);font-weight:400}
.category-bar:hover .cat-name,.category-bar:hover b{color:var(--text-display)}
.category-bar[aria-pressed=true] .cat-name,.category-bar[aria-pressed=true] b{color:var(--text-display)}
.category-bar[aria-pressed=true]:before{content:'';position:absolute;left:-14px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:var(--copper)}
/* explorer */
.controls{display:grid;grid-template-columns:minmax(0,2fr) repeat(3,minmax(0,1fr));gap:var(--space-3);margin:var(--gap-block) 0;padding-bottom:var(--gap-block);border-bottom:1px solid var(--rule-structural)}
.controls input,.controls select{width:100%;font-family:var(--font-body);font-size:15px;color:var(--text-body);background:transparent;border:0;border-bottom:1px solid var(--rule-structural);padding:var(--space-2) 0;border-radius:0}
.controls input::placeholder{color:var(--text-support)}
input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}
.explorer-count{display:block;margin-top:var(--space-2)}
.empty-state{margin:var(--gap-block) 0;padding:var(--space-4) 0;border-top:1px solid var(--rule-structural);border-bottom:1px solid var(--rule-structural);color:var(--text-support);max-width:var(--measure-prose)}
.empty-state button{font:inherit;background:none;border:0;padding:0;color:var(--copper);border-bottom:1px solid var(--rule-hairline);cursor:pointer}
.empty-state button:hover{border-bottom-color:var(--copper)}
.records{clear:right;margin-right:calc(-1 * var(--rail-span))}
.record{display:grid;grid-template-columns:40px minmax(0,1fr) var(--rail-width);column-gap:var(--space-3);padding:var(--space-4) 0;border-bottom:1px solid var(--rule-hairline);scroll-margin-top:var(--space-5)}
.record[hidden]{display:none}
.record.is-target .record-index .mono{color:var(--copper)}
.record.is-target h3{color:var(--copper)}
.record-body{min-width:0;padding-right:calc(var(--gutter-left) - var(--space-3))}
.record-kicker{margin:0 0 var(--space-1);font-size:14px;line-height:1.45;color:var(--text-support)}
.record-body h3{margin:0 0 var(--space-2);font-size:20px;line-height:1.32;font-weight:500;transition:color var(--dur-hover) var(--ease-standard)}
.record-status{margin:0 0 var(--space-2);font-style:italic;color:var(--text-lead);font-size:16px;line-height:1.55}
.record-change{margin:0;color:var(--text-support);font-size:16px;line-height:1.62}
.mark-row{display:inline-flex;align-items:center;gap:6px}
.rung-name{color:var(--text-display)}
.cmark{flex-shrink:0}
.record details,.ledger-item{margin-top:var(--space-3)}
.record summary,.ledger-item summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:var(--type-label-track-sm);font-size:var(--type-label-size-sm);color:var(--text-label);padding:var(--space-2) 0;border-top:1px solid var(--rule-hairline)}
.record summary::-webkit-details-marker,.ledger-item summary::-webkit-details-marker{display:none}
.record summary:after,.ledger-item summary:after{content:'+';font-family:var(--font-mono);color:var(--text-faint);margin-left:auto}
.record details[open] summary:after,.ledger-item[open] summary:after{content:'\\2212'}
.record summary:hover,.ledger-item summary:hover{color:var(--text-display)}
.record details[open] summary,.ledger-item[open] summary{color:var(--text-display)}
.record dl{margin:var(--space-2) 0 0;display:flex;flex-direction:column;gap:var(--space-4)}
.dossier-field dt{font-family:var(--font-mono);text-transform:uppercase;letter-spacing:var(--type-label-track-sm);font-size:var(--type-label-size-sm);color:var(--text-label);margin-bottom:var(--space-1)}
.dossier-field dd{margin:0;font-size:16px;line-height:1.62;color:var(--text-support);max-width:var(--measure-prose)}
.source-links{margin:var(--space-3) 0 var(--space-1);display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center}
.source-links a{font-family:var(--font-mono);font-size:var(--type-label-size-sm);letter-spacing:var(--type-label-track-sm);text-decoration:none;color:var(--text-label);border-bottom:1px solid var(--rule-hairline)}
.source-links a:hover,.source-links a:focus-visible{color:var(--copper);border-bottom-color:var(--copper)}
.machine-id{margin:0;overflow-wrap:anywhere}
/* watch */
.watch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 var(--space-5);margin-right:calc(-1 * var(--rail-span));clear:right}
.watch{display:grid;grid-template-columns:40px minmax(0,1fr);gap:var(--space-2);padding:var(--space-4) 0;border-bottom:1px solid var(--rule-hairline);min-width:0}
.watch>div{min-width:0;scroll-margin-top:var(--space-6)}
.watch h3{margin:0 0 var(--space-1);font-size:18px;line-height:1.3;font-weight:500}
.watch p{margin:0 0 var(--space-2);color:var(--text-support);font-size:15px;line-height:1.55;overflow-wrap:anywhere}
.watch-link{font-family:var(--font-mono);font-size:var(--type-label-size-sm);letter-spacing:var(--type-label-track-sm);text-transform:uppercase;text-decoration:none;color:var(--text-label);overflow-wrap:anywhere}
.watch-link:hover,.watch-link:focus-visible{color:var(--copper)}
.watch-pending{color:var(--text-faint)}
/* rubric + method */
.rubric-row{display:grid;grid-template-columns:16px minmax(0,1fr);gap:var(--space-2);padding:var(--space-3) 0;border-bottom:1px solid var(--rule-hairline);max-width:var(--measure-prose)}
.rubric-row .cmark{margin-top:6px}
.rubric-row p{margin:var(--space-1) 0 0;font-size:16px;line-height:1.6;color:var(--text-support)}
.method-item{padding:var(--space-3) 0;border-bottom:1px solid var(--rule-hairline);max-width:var(--measure-prose)}
.method-item h3{margin:0 0 var(--space-1);font-size:18px;font-weight:500}
.content .method-item p{margin:0;font-size:16px;line-height:1.62;color:var(--text-support)}
/* provenance */
.key{float:right;clear:right;width:var(--rail-width);margin:var(--space-1) calc(-1 * var(--rail-span)) var(--space-4) 0;border-top:1px solid var(--rule-structural);border-bottom:1px solid var(--rule-structural)}
.key-row{display:grid;grid-template-columns:30px minmax(0,1fr);gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--rule-hairline)}
.key-row:last-child{border-bottom:none}
.key-row strong{font-weight:500;color:var(--text-display)}
.key-row p{margin:2px 0 0;font-size:15px;line-height:1.55;color:var(--text-support)}
.glyph{display:block;flex-shrink:0}
.stages{margin:var(--gap-block) 0;max-width:var(--measure-prose)}
.stage{display:grid;grid-template-columns:30px minmax(0,1fr);gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--rule-hairline)}
.stage[data-bridge=true] .stage-mark{border-left:1px dashed var(--ink-5);margin-left:-8px;padding-left:7px}
.stage-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-2);margin:0 0 var(--space-1)}
.stage-head strong{font-weight:500;color:var(--text-display)}
.content .stage-body p:last-child{margin:0;font-size:15px;line-height:1.6;color:var(--text-support)}
/* ledger */
.ledger{max-width:var(--measure-prose)}
.ledger-item{margin:0;border-bottom:1px solid var(--rule-hairline)}
.ledger-item summary{border-top:none}
.ledger-item .ledger-title{flex:1;font-family:var(--font-body);text-transform:none;letter-spacing:0;font-size:16px;color:var(--text-body);overflow-wrap:anywhere}
.ledger-item p{margin:0 0 var(--space-2);font-size:15px;line-height:1.6;color:var(--text-support)}
.ledger-item p:last-child{margin-bottom:var(--space-3)}
/* tables */
.wide{width:100%;margin-top:var(--gap-section);padding-top:var(--gap-section);border-top:1px solid var(--rule-structural)}
.wide h2{font-family:var(--font-display);font-weight:400;font-size:var(--type-h2-size);line-height:var(--type-h2-line);color:var(--text-display);margin:0 0 var(--gap-heading-body)}
.wide>p{max-width:var(--measure-prose)}
.sources-wrap{max-width:100%;min-width:0;overflow-x:auto}
table.data{width:100%;border-collapse:collapse;margin:var(--gap-block) 0;font-family:var(--font-body);font-size:15px;line-height:1.5}
table.data th,table.data td{text-align:left;padding:var(--space-2) var(--space-3) var(--space-2) 0;border-bottom:1px solid var(--rule-hairline);vertical-align:top}
table.data th{font-family:var(--font-mono);text-transform:uppercase;letter-spacing:var(--type-label-track-sm);font-size:var(--type-label-size-sm);color:var(--text-label);font-weight:400;border-bottom:1px solid var(--rule-structural);white-space:nowrap;position:sticky;top:0;background:var(--surface-page);z-index:1}
table.data td strong{display:block;font-weight:500;color:var(--text-display)}
table.data td span{display:block;color:var(--text-support);font-size:14px}
table.data td a{font-family:var(--font-mono);font-size:var(--type-label-size-sm);letter-spacing:var(--type-label-track-sm);color:var(--text-label);text-decoration:none}
table.data td a:hover,table.data td a:focus-visible{color:var(--copper)}
table.data tr.is-target td{background:var(--surface-hover)}
table.data tr{scroll-margin-top:var(--space-7)}
.source-search{width:100%;max-width:var(--measure-prose);font-family:var(--font-body);font-size:15px;color:var(--text-body);background:transparent;border:0;border-bottom:1px solid var(--rule-structural);padding:var(--space-2) 0;border-radius:0}
/* closing */
.closing{max-width:var(--contents-max);margin:var(--gap-section) 0 0 calc(var(--rail-left-width) + var(--gutter-left));padding-top:var(--gap-section);border-top:1px solid var(--rule-structural)}
.closing h2{font-size:var(--type-h2-size);line-height:var(--type-h2-line);margin:0 0 var(--gap-heading-body)}
.closing p{max-width:var(--measure-prose)}
.colophon{width:100%;margin-top:var(--gap-section);padding-top:var(--gap-block);border-top:1px solid var(--rule-hairline);display:flex;gap:var(--space-4);flex-wrap:wrap}
/* theme toggle */
.theme-toggle{position:fixed;bottom:var(--space-4);right:var(--space-4);display:inline-flex;align-items:center;gap:var(--space-1);background:var(--surface-page);border:1px solid var(--rule-hairline);cursor:pointer;padding:var(--space-2) var(--space-3);color:var(--text-label);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:var(--type-label-track-sm);font-size:var(--type-label-size-sm);z-index:10}
.theme-toggle:hover{color:var(--text-display)}
@media(min-width:1240px){
.watch-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:1399px){
:root{--rail-width:260px;--gutter-left:40px;--page-pad:var(--space-4)}
}
@media(max-width:1239px){
:root{--rail-span:0px}
.hero{display:flex;flex-direction:column}
.hero-readout{order:9;float:none;width:auto;margin:var(--space-4) 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:var(--space-4);border-top:0}
.readout-row{border-top:1px solid var(--rule-hairline);border-bottom:0}
.margin-note{float:none;width:auto;max-width:var(--measure-prose);margin:var(--gap-block) 0;padding:var(--space-3) 0 var(--space-3) var(--space-4);border-top:0;border-left:1px solid var(--rule-structural)}
.key{float:none;width:auto;max-width:var(--measure-prose);margin:var(--gap-block) 0}
.figure-block{display:block;margin-right:0}
.figure-block figcaption{margin-top:var(--space-3);max-width:var(--measure-prose)}
.orrery-block figcaption{max-width:none}
.orb-key{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:var(--space-4)}
.signal-head{display:none}
.signal{grid-template-columns:44px minmax(0,1fr)}
.signal-body{padding-right:0}
.signal-marks{grid-column:2;flex-direction:row;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-3);margin-top:var(--space-3)}
.signal-link{margin-top:0}
.record{grid-template-columns:40px minmax(0,1fr) 132px}
.record-body{padding-right:0}
.ground-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.matrix-head,.category-bar{grid-template-columns:minmax(0,190px) repeat(5,minmax(0,1fr)) 30px}
}
@media(max-width:980px){
.frame{grid-template-columns:minmax(0,1fr)}
.leftnav{display:none}
.closing{margin-left:0}
.wide,.colophon{width:100%}
}
@media(max-width:760px){
.figure-block .scroll-x svg{max-width:none;width:760px}
.scroll-x{margin-right:calc(-1 * var(--page-pad));padding-right:var(--page-pad)}
}
@media(max-width:640px){
:root{--type-entry-size:34px;--type-h2-size:25px;--type-body-size:17px;--page-pad:var(--space-3)}
.page{padding:var(--space-5) var(--page-pad) var(--space-7)}
.theme-toggle{position:absolute;top:var(--space-2);right:var(--space-2);bottom:auto}
.readout-row b{font-size:30px}
.student-guide-head .mono:last-child{width:100%;margin-left:0}
.student-guide-grid{grid-template-columns:minmax(0,1fr)}
.orb-key{grid-template-columns:minmax(0,1fr)}
.controls{grid-template-columns:minmax(0,1fr)}
.record{grid-template-columns:minmax(0,1fr)}
.record-index{display:none}
.record-marks{flex-direction:row;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-3);margin:0 0 var(--space-2);order:-1}
.watch-grid{grid-template-columns:minmax(0,1fr)}
.ground-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.ground-key{grid-template-columns:minmax(0,1fr)}
.matrix-head,.category-bar{grid-template-columns:repeat(5,minmax(0,1fr)) 26px;column-gap:var(--space-1)}
.matrix-head span:first-child{display:none}
.matrix-head .mono{font-size:8.5px;letter-spacing:.04em;line-height:1.3}
.category-bar .cat-name{grid-column:1/-1;margin-bottom:var(--space-1)}
.signal,.watch{grid-template-columns:minmax(0,1fr)}
.signal-marks{grid-column:auto}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation:none!important;transition:none!important}}
@media print{
.theme-toggle,.leftnav,.controls{display:none!important}
body{background:#fff;color:#000}
.frame{grid-template-columns:1fr}
.record,.watch,.signal{break-inside:avoid}
.record details,.ledger-item{display:block}
.record details>*,.ledger-item>*{display:block}
.sources-wrap{overflow:visible}
a[href^=http]:after{content:' [' attr(href) ']';font-size:8px;word-break:break-all}
}
</style></head><body data-event-count="${data.events.length}" data-baseline-count="${data.baselines.length}" data-record-count="${records.length}" data-source-count="${data.sources.length}" data-watch-count="${data.watchlist.length}" data-briefing-count="${briefings.length}">
<a class="skip" href="#main">Skip to report</a>
${rungTrackBase}
<button class="theme-toggle" id="themeToggle" type="button" aria-label="Toggle dark mode" aria-pressed="false">Dark</button>
<main id="main" tabindex="-1"><div class="page">

<div class="frame">
<nav class="leftnav" aria-label="Contents">
  <div class="leftnav-inner"><span class="mono sm faint">Contents</span><a class="start-link" href="#student-guide"><span class="mono sm">Start</span><span class="t">For students</span></a>${contentsNav}</div>
</nav>

<div class="content">

<header class="hero">
  <div class="hero-eyebrow">
    <svg class="hero-glyph" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--ink-5)" stroke-width="1"/><ellipse cx="12" cy="12" rx="11" ry="4.5" fill="none" stroke="var(--ink-7)" stroke-width=".9"/><circle cx="23" cy="12" r="1.6" fill="var(--copper)"/></svg>
    <span class="mono">Project — Pakistan AI Policy Observatory — September 2026</span>
  </div>
  <aside class="hero-readout" aria-label="The record at a glance">${readoutRows.map(([value, text]) => `<div class="readout-row"><b>${value}</b><span>${text}</span></div>`).join('')}</aside>
  <h1>Pakistan’s AI policy is becoming infrastructure. Almost none of it can be shown to run.</h1>
  <p class="thesis">Fifteen days of verified record produced ${records.length} entries. ${publishedRung.total} are published rules. ${operatingRung.total} claim something is operating — and ${operatingRung.byConfidence.High === 0 ? `not one of those ${operatingRung.total} carries high confidence` : `only ${spell(operatingRung.byConfidence.High)} of those ${operatingRung.total} carries high confidence`}.</p>
  <p class="lead">This is a source-bounded reading of what Pakistan’s state actually did on AI, data and digital infrastructure between ${dayMonth(start)} and ${dayMonth(end)} ${end.getUTCFullYear()}. Every record is placed on the rung its own stated status puts it on, scored for evidence quality, and shown next to the source that supports it. Where the evidence stops, the record stops.</p>
  <div class="meta-row">
    <span class="mono">Observed period — ${esc(periodLabel)} UTC</span>
    <span class="mono">Search cutoff — ${esc(cutoffLabel)}</span>
    <span class="mono">Status — source-bounded, not a census</span>
  </div>
</header>

<div class="tldr">
  <span class="mono lg">The short version</span>
  <ul>
    <li>Of ${records.length} verified records, only <strong>${publishedRung.total}</strong> are published, operative instruments. <strong>${rungRows.find(r=>r.key==='signalled').total}</strong> are still announcements, drafts or meetings.</li>
    <li><strong>${procuringRung.total}</strong> procurements are in flight. <strong>No award</strong> was verified inside the window.</li>
    <li>${dominant(operatingRung) ? `Every one of the <strong>${operatingRung.total}</strong> records claiming something is running is ${dominant(operatingRung)} confidence.` : `Only <strong>${operatingRung.byConfidence.High}</strong> of the ${operatingRung.total} records claiming something is running is High confidence.`} ${dominant(publishedRung) ? `Every one of the <strong>${publishedRung.total}</strong> published rules is ${dominant(publishedRung)}.` : `<strong>${publishedRung.byConfidence.High}</strong> of the ${publishedRung.total} published rules are High.`}</li>
    <li>Monitoring coverage was <strong>${coverageShare.toFixed(2)}%</strong> of the observed span — ${briefings.length} briefing units against ${number(audit.nominal_expected_briefings_for_exactly_15_days_at_15_minute_cadence)} nominal intervals.</li>
    <li>Absence is not evidence: a consequential 1 September cyber MoU was missed by the corpus entirely and recovered only by verification search.</li>
  </ul>
</div>

<figure class="figure-block orrery-block" id="fig-orrery">${orreryFigure}
  <figcaption><span class="mono sm fig-no">Fig. 01 — The whole record</span><p>Each point is one record. Its orbit is the rung its own stated status reaches — intentions on the outside, reported operation nearest the centre — and its sector is its domain. Filled points are high confidence, hollow medium, dashed low.</p><p>The centre stands for independently verified operation. No record reaches it.</p>
    <ol class="orb-key" aria-label="Domains, clockwise from the top">${orreryKey}</ol>
    <p class="orb-readout" id="orb-readout"><span class="mono sm">Reading a point</span><span class="t">Point at a record to read it. Select it to open its dossier in the ledger.</span></p>
  </figcaption>
</figure>

<section class="student-guide" id="student-guide" aria-labelledby="student-guide-title">
  <div class="student-guide-head">
    <span class="mono lg">For students</span>
    <span class="mono sm faint">Read · test · reuse</span>
  </div>
  <h2 id="student-guide-title">A field guide to the observatory</h2>
  <p>Use this as an evidence observatory, not a news feed. No code is required: begin with one claim, follow it to the underlying source, and move into the repository only when you need the data, method or citation record.</p>

  <div class="student-guide-grid">
    <article class="student-guide-card">
      <span class="mono sm">01 · Use the report</span>
      <h3>Move from the argument to the evidence.</h3>
      <p>Read the <a href="#sec-2">lifecycle ladder</a>, then search or filter the <a href="#sec-5">evidence ledger</a>. Expand an evidence dossier to compare verified facts, source claims, confidence and unresolved issues, then follow its source IDs into the <a href="#sec-10">source register</a>.</p>
    </article>

    <article class="student-guide-card">
      <span class="mono sm">02 · Navigate GitHub</span>
      <h3>Each folder has a different job.</h3>
      <p>Start at the <a href="https://github.com/Omarzaf/PDP-2026">GitHub repository</a> and its <a href="./README.md">README</a>. <span class="mono sm">intermediate/</span> holds the reviewed data, <span class="mono sm">tools/</span> holds reproducible builders and checks, and <span class="mono sm">outputs/</span> holds reader-ready artifacts. The <a href="./intermediate/REPRODUCIBILITY.md">reproducibility note</a> explains the refresh sequence.</p>
    </article>

    <article class="student-guide-card">
      <span class="mono sm">03 · Access the data</span>
      <h3>Choose the file that matches the question.</h3>
      <p>Use the <a href="./intermediate/research_dataset.json">canonical JSON model</a> for nested, machine-readable records; the <a href="./intermediate/evidence_register.csv">evidence CSV</a> for event-level analysis; the <a href="./intermediate/source_register.csv">source CSV</a> for provenance; and the <a href="./intermediate/briefing_units.csv">briefing</a> plus <a href="./intermediate/coverage_gaps.csv">coverage</a> tables for missingness. The <a href="./intermediate/watchlist.csv">watchlist</a> records what to verify next, while the <a href="./outputs/01a0653c-96d7-7c92-918b-3975d6716164/Pakistan_AI_Policy_Monitor_Evidence_Register_and_Coverage_Log_2026-08-18_to_2026-09-03.xlsx">XLSX workbook</a> is the navigable audit layer.</p>
    </article>

    <article class="student-guide-card">
      <span class="mono sm">04 · License and cite</span>
      <h3>Reuse the work without erasing its boundaries.</h3>
      <p>The <a href="./LICENSE">CC BY 4.0 license</a> applies to original report and observatory content and the derived dataset structure; original code in <span class="mono sm">tools/</span> uses the <a href="./tools/LICENSE">MIT license</a>. Linked source pages, documents and trademarks remain under their upstream terms. Use <a href="./CITATION.cff">CITATION.cff</a> for pre-release citation metadata, and do not describe it as a frozen public release until one is approved.</p>
    </article>
  </div>
</section>

<section id="sec-1">
  <span class="mono num">I.</span>
  <h2>What actually moved</h2>
  <p>Not a feed of announcements — the lifecycle changes that survived verification. The track beside each one marks the rung it reached, from signalled on the left to reported running on the right.</p>
  <div class="signal-head" aria-hidden="true"><span></span><span class="mono sm">Signal</span><span class="mono sm">Rung reached · confidence</span></div>
  ${signalRows}
</section>

<section id="sec-2">
  <span class="mono num">II.</span>
  <h2>How far anything got</h2>
  <p>Every record sits somewhere between an intention and a working system. Placing all ${records.length} on the same ladder makes the shape of the period visible at once: the field is wide at the bottom and thin at the top, and the evidence thins in the opposite direction to the claims.</p>

  <figure class="figure-block"><div class="fig-body scroll-x">${ladderFigure}</div>
    <figcaption><span class="mono sm fig-no">Fig. 02 — The ladder</span>Each point is one record, placed by the rung its own stated status describes. Filled points are high confidence, hollow medium, dashed low. ${barrenRungs.length === 1 ? 'The copper marker flags the one rung with no high-confidence record on it.' : `Copper markers flag the ${spell(barrenRungs.length)} rungs with no high-confidence record on them.`} Select a rung to carry it into the ledger.</figcaption>
  </figure>

  ${note('On the word “operating”', `${cap(spell(operatingRung.total))} records claim a facility or system is running. Not one of them carries a high-confidence rating. That gap is the finding, not a footnote to it.`)}

  <div class="callout">
    <span class="mono">The inversion</span>
    <p>${dominant(publishedRung) ? `The ${publishedRung.total} published rules are <em>all</em> ${dominant(publishedRung).toLowerCase()} confidence` : `${publishedRung.byConfidence.High} of the ${publishedRung.total} published rules are high confidence`}: a notified regulation is a document you can open. ${dominant(operatingRung) ? `The ${operatingRung.total} records claiming a facility or system is running are <em>all</em> ${dominant(operatingRung).toLowerCase()}` : `Of the ${operatingRung.total} records claiming a facility or system is running, ${operatingRung.byConfidence.High} are high confidence`}: an inauguration, a launch claim or an authority’s own report of operation is not premises-level, load-level or assurance-level evidence. The strongest claims rest on the weakest record.</p>
  </div>

  <p>This is not an accusation of overstatement. It is a measurement problem. Rules publish themselves; operation does not. Until utilisation, accepted load, staffing or independent assurance is disclosed, the top rung stays medium no matter how many ribbons are cut.</p>

  <h3 class="sub">What each rung stands on</h3>
  <p>The inversion has a mechanism, and the source register shows it. A rule is its own evidence: the gazette or register that notifies it is the record. A claim of operation arrives as a statement — a release, a broadcast, a company report — and nothing in the ledger sits beneath it. Place each record on the ring of the strongest primary source it cites, and the rungs come apart.</p>

  <figure class="figure-block full" id="fig-ground"><div class="fig-body"><div class="ground-grid">${groundPanels}</div></div>
    <figcaption><span class="mono sm fig-no">Fig. 03 — What each rung stands on</span>Each small orrery is one rung. The claim sits at the centre; rings count outward by how directly the strongest cited primary source speaks to it. ${cap(groundInner(publishedRung) === publishedRung.total ? `all ${publishedRung.total}` : `${groundInner(publishedRung)} of ${publishedRung.total}`)} published rules rest on an operative record. ${groundInner(operatingRung) === 0 ? `None of the ${operatingRung.total} running claims does` : `${groundInner(operatingRung)} of the ${operatingRung.total} running claims do`}: every one rests on what an authority or company said about itself, which is why the copper centre is bare.${groundKey}</figcaption>
  </figure>

  <h3 class="sub">${cap(spell(procuringRung.total))} procurements, ${pastGate === 0 ? 'none' : spell(pastGate)} past evaluation</h3>
  <p>Procurement is the busiest route from a policy to a working system, and in this window it stops at one gate. ${cap(spell(tenderCounts.open))} ${tenderCounts.open === 1 ? 'procedure is' : 'procedures are'} still open, ${spell(tenderCounts.closed)} have closed to bids and ${spell(tenderCounts.evaluating)} ${tenderCounts.evaluating === 1 ? 'is' : 'are'} in evaluation. ${pastGate === 0 ? 'Not one reached award.' : `${cap(spell(pastGate))} reached award.`} Everything a reader might picture as capacity — contracts, deliveries, accepted systems — lies on the far side.</p>

  <figure class="figure-block full" id="fig-corridor"><div class="fig-body scroll-x">${corridorFigure}</div>
    <figcaption><span class="mono sm fig-no">Fig. 04 — The procurement corridor</span>The ${spell(procuringRung.total)} records on the procurement rung, placed at the stage their stated status names. The double rule is award. The stations beyond it are drawn but empty: no award, contract, delivery or acceptance was verified inside the window. The ${spell(operatingRung.total)} records on the top rung describe other systems; none is the far end of these procedures.</figcaption>
  </figure>
</section>

<section id="sec-3">
  <span class="mono num">III.</span>
  <h2>The window we could see</h2>
  <p>The evidence base is extensive; the monitoring cadence is not. Both facts have to travel together, because the second one bounds every claim the first one can support.</p>

  <figure class="figure-block"><div class="fig-body scroll-x">${timelineFigure}</div>
    <figcaption><span class="mono sm fig-no">Fig. 05 — The observed window</span>Dated records per day across the observed window (${days.length} calendar days), using the same confidence marks as Fig. 02. The lower rule carries the ${briefings.length} briefing windows in real time — the monitoring, not the events. Copper ticks mark days on which the record shows nothing: ${emptyDays.map(d => dayMonth(new Date(`${d}T00:00:00Z`))).join(', ')}. A further ${carriedIn} records are carry-in baselines or carry no single resolvable date.</figcaption>
  </figure>

  ${note('On absence', `The corpus covers ${coverageShare.toFixed(2)}% of the observed span, in ${briefings.length} bounded windows. ${gapStatement} A quiet day in the briefings is not a quiet day in the country.`)}

  <p>A timeline shows when things happened. It cannot show when anyone was looking. Wound into a clock — one turn per day, midnight at the top — the ${spell(briefings.length)} briefing windows collapse into a narrow beam: ${inBeam} of them opened between 13:30 and 15:30 UTC, early evening in Pakistan. Anything that happened outside that beam reached this record only through the later verification search, which is how the 1 September cyber MoU was found.</p>

  <figure class="figure-block top">${spiralFigure}
    <figcaption><span class="mono sm fig-no">Fig. 06 — The field of view</span>Seventeen UTC days wound into a spiral: one turn per day, midnight at the top, running clockwise and outward from ${dayMonth(start)} at the centre to ${dayMonth(end)} at the rim. The heavy strokes are the ${briefings.length} briefing windows at their true times and lengths. The bracket on the rim marks 13:30–15:30 UTC. Together the windows cover ${coverageShare.toFixed(2)}% of the span; the rest of the spiral is unobserved, not quiet.</figcaption>
  </figure>
</section>

<section id="sec-4">
  <span class="mono num">IV.</span>
  <h2>Where the state is concentrating</h2>
  ${note('Why counts are not progress', `${cap(spell(procuringRung.total))} procurement records is ${spell(procuringRung.total)} procedures underway, not ${spell(procuringRung.total)} capabilities delivered. No award was verified inside the window.`)}
  <p>Counts include events and baselines. Activity is not equivalent to implementation — a domain can be busy and deliver nothing. Read across a row to see how far a domain’s records got, and select a domain to carry it into the ledger below.</p>
  <div class="category-bars">${matrixHead}${categoryBars}</div>
</section>

<section id="sec-5">
  <span class="mono num">V.</span>
  <h2>The evidence ledger</h2>
  <p>All ${records.length} records, unflattened. Each carries its stated status, its rung, its confidence and the sources behind it.</p>
  ${note('A note on reading this', 'Every record carries the rung its own stated status places it on, next to that status verbatim. Disagree with a placement and the evidence to argue with is in the same row.')}
  <noscript><p class="mono sm">Filtering is unavailable without JavaScript; all ${records.length} records remain readable below.</p></noscript>
  <div class="controls">
    <label><span class="skip">Search records</span><input class="search" id="record-search" type="search" placeholder="Search title, institution, place, fact…"></label>
    <label><span class="skip">Filter by rung</span><select class="select" id="rung-filter"><option value="all">All rungs</option>${RUNGS.map(r => `<option value="${r.key}">${r.name}</option>`).join('')}</select></label>
    <label><span class="skip">Filter by type</span><select class="select" id="type-filter"><option value="all">All records</option><option value="event">Events</option><option value="baseline">Baselines</option></select></label>
    <label><span class="skip">Filter by confidence</span><select class="select" id="confidence-filter"><option value="all">All confidence</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
  </div>
  <p class="explorer-count mono sm" aria-live="polite"><span id="record-count">${records.length}</span> of ${records.length} records shown</p>
  <p class="empty-state" id="record-empty" hidden>No record matches the current filters. <button type="button" id="record-reset">Clear filters</button></p>
  <div class="records">${recordRows}</div>
</section>

<section id="sec-6">
  <span class="mono num">VI.</span>
  <h2>What would change the story</h2>
  <p>${data.watchlist.length} named triggers that turn uncertainty into a research agenda rather than a hedge. ${cap(spell(dated.length))} carry a date inside the next month. The other ${spell(undated.length)} wait on a disclosure nobody has scheduled.</p>
  <figure class="figure-block full" id="fig-calendar"><div class="fig-body scroll-x">${calendarFigure}</div>
    <figcaption><span class="mono sm fig-no">Fig. 07 — The verification calendar</span>Dated triggers on a day axis from the search cutoff; undated triggers held on their own orbit. Numbers match the cards below — select one to jump to it.</figcaption>
  </figure>
  <div class="watch-grid">${watches}</div>
</section>

<section id="sec-7">
  <span class="mono num">VII.</span>
  <h2>Method and limits</h2>
  <p>The briefing corpus was a discovery index, never independent corroboration. Confidence attaches to the stated claim, not to eventual delivery.</p>
  ${rubricRows}
  <figure class="figure-block top" id="fig-hierarchy">${hierarchyFigure}
    <figcaption><span class="mono sm fig-no">Fig. 08 — The source hierarchy</span>All ${data.sources.length} assessed sources, by how directly each can speak to a claim. ${tierCounts[0]} are operative records — the instrument itself. ${tierCounts[1]} are an authority or company speaking about itself. ${tierCounts[2]} are reporting. Tiers are read from the register’s own source-type field; select a point to open its row.</figcaption>
  </figure>
  ${methodRows}
</section>

<section id="sec-8">
  <span class="mono num">VIII.</span>
  <h2>How this was made</h2>
  <p>The report asks what the state can show. It is only fair to ask the same of the report. These are the six stages the evidence passed through, marked by who drove each one: a script, a human and an AI agent working together, or a person alone. One stage carries a mark for something else — a method the record does not retain.</p>

  <div class="key">${driverKey}</div>

  <div class="stages">${stageRows}</div>

  <figure class="figure-block"><div class="fig-body scroll-x">${pipelineFigure}</div>
    <figcaption><span class="mono sm fig-no">Fig. 09 — One model, three artifacts</span>What happens after stage 06. One curated model generates all three artifacts — each by the script named beneath it — and all three clear the same offline checks. The copper point marks the last step, which is the only one no script performs.</figcaption>
  </figure>

  <div class="callout">
    <span class="mono">Where the agent stopped</span>
    <p>An agent can open ${data.sources.length} sources, hold a lifecycle vocabulary steady across ${records.length} records and refuse to let a handout count twice. It did not decide what was in scope, it did not recalculate the workbook in native Excel, and it did not decide to publish. Those stayed with the author, which is why the release gate ends in a person rather than a check.</p>
  </div>

  <h3 class="sub">The release clock</h3>
  <p>Git and the filesystem record when files were packaged, not how long the work took. The distinction matters: the span below is wall clock, and most of it is not research.</p>

  <figure class="figure-block"><div class="fig-body scroll-x">${releaseFigure}</div>
    <figcaption><span class="mono sm fig-no">Fig. 10 — The release clock</span>Local assembly and Git milestones in EDT, evenly spaced as a sequence — elapsed time is annotated rather than drawn to scale. The copper mark is the extracted Markdown, present at 23:11 with no record of the command that produced it.</figcaption>
  </figure>

  <p>Idle time, source-review labour and per-URL request times cannot be recovered from this record. Stating that is cheaper than implying a number.</p>
</section>

<section id="sec-9">
  <span class="mono num">IX.</span>
  <h2>What was not counted</h2>
  <p>Exclusion is an explicit research decision, not disappearance. All ${data.exclusions.length} material exclusions remain inspectable.</p>
  <div class="ledger">${exclusionRows}</div>
</section>

</div>

</div>

<section class="wide" id="sec-10">
  <span class="mono num">X.</span>
  <h2>Source register — ${data.sources.length} assessed records</h2>
  <p>External links are inert until selected. Availability and limitations reflect the ${cutoffLong} verification cutoff.</p>
  <input id="source-search" class="source-search" type="search" placeholder="Filter publisher, document, type, availability or source ID…" aria-label="Filter source register">
  <div class="sources-wrap"><table class="data"><caption class="skip">Assessed sources, availability, and evidentiary limitations</caption><thead><tr><th scope="col">ID</th><th scope="col">Publisher / document</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Availability</th><th scope="col">Limitation</th></tr></thead><tbody>${sourceRows}</tbody></table></div>
</section>

<section class="wide">
  <h2>Briefing provenance — ${briefings.length} observed units</h2>
  <p>Exact internal windows outrank filenames and filesystem timestamps. ${gapStatement}</p>
  <div class="sources-wrap"><table class="data"><caption class="skip">Observed briefing units and their verified UTC windows</caption><thead><tr><th scope="col">ID</th><th scope="col">Nominal date / unit</th><th scope="col">UTC window</th><th scope="col">Timing issue</th></tr></thead><tbody>${briefingRows}</tbody></table></div>
</section>

<section class="closing">
  <h2>The policy state is assembling itself in public.</h2>
  <p>The question is no longer whether Pakistan has an AI and digital-infrastructure agenda. It is whether the expanding architecture of rules, procurement, identity, data and partnerships can acquire the budgets, controls, transparency, interoperability and independent evidence required to become accountable capacity.</p>
  <p>On this record, the rules are arriving faster than the proof that anything built under them works.</p>
</section>

<div class="colophon">
  <span class="mono sm">Verified 15-Day Monitoring Report — ${esc(periodLabel)} UTC</span>
  <span class="mono sm">Comprehensive within supplied files</span>
  <span class="mono sm faint">MMXXVI</span>
</div>

</div></main>
<script>
(function(){
var root=document.documentElement,btn=document.getElementById('themeToggle');
function apply(theme){root.setAttribute('data-theme',theme);btn.textContent=theme==='dark'?'Light':'Dark';btn.setAttribute('aria-pressed',String(theme==='dark'));}
apply(root.getAttribute('data-theme')==='dark'?'dark':'light');
btn.addEventListener('click',function(){var next=root.getAttribute('data-theme')==='dark'?'light':'dark';apply(next);try{localStorage.setItem('mmm-theme',next);}catch(e){}});
})();
(function(){
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function each(selector,fn){[].slice.call(document.querySelectorAll(selector)).forEach(fn);}
function go(el){if(el)el.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});}
var cards=[].slice.call(document.querySelectorAll('[data-record]')),count=document.querySelector('#record-count'),q=document.querySelector('#record-search'),rung=document.querySelector('#rung-filter'),type=document.querySelector('#type-filter'),conf=document.querySelector('#confidence-filter'),category='all';
var empty=document.querySelector('#record-empty'),reset=document.querySelector('#record-reset'),ledger=document.querySelector('#sec-5');
var orrery=document.querySelector('.orrery'),readout=document.querySelector('#orb-readout'),readoutDefault=readout?readout.innerHTML:'';
function filter(){var term=q.value.trim().toLowerCase(),shown=0;cards.forEach(function(card){var yes=(!term||card.dataset.search.indexOf(term)>-1)&&(rung.value==='all'||card.dataset.rung===rung.value)&&(type.value==='all'||card.dataset.type===type.value)&&(conf.value==='all'||card.dataset.confidence===conf.value)&&(category==='all'||card.dataset.category===category);card.hidden=!yes;if(yes)shown++;});count.textContent=shown;empty.hidden=shown!==0;}
function highlight(cat){if(!orrery)return;orrery.classList.toggle('is-focus',cat!=='all');each('.orb-pt',function(p){p.classList.toggle('on',p.dataset.category===cat);});}
function syncCategory(){each('[data-category-button]',function(x){x.setAttribute('aria-pressed',String(x.dataset.categoryButton===category));});each('[data-orb-category]',function(x){x.setAttribute('aria-pressed',String(x.dataset.orbCategory===category));});highlight(category);}
function setCategory(next){category=category===next?'all':next;syncCategory();filter();}
function resetFilters(){q.value='';rung.value='all';type.value='all';conf.value='all';category='all';syncCategory();filter();}
reset.addEventListener('click',function(){resetFilters();q.focus();});
[q,rung,type,conf].forEach(function(el){el.addEventListener(el===q?'input':'change',filter);});
each('[data-category-button]',function(b){b.addEventListener('click',function(){setCategory(b.dataset.categoryButton);go(ledger);});});
each('[data-orb-category]',function(b){
  b.addEventListener('click',function(){setCategory(b.dataset.orbCategory);});
  ['mouseenter','focus'].forEach(function(ev){b.addEventListener(ev,function(){highlight(b.dataset.orbCategory);});});
  ['mouseleave','blur'].forEach(function(ev){b.addEventListener(ev,function(){highlight(category);});});
});
each('[data-rung-filter]',function(a){a.addEventListener('click',function(e){e.preventDefault();rung.value=a.dataset.rungFilter;filter();go(ledger);});});
function show(point){var card=document.getElementById(point.getAttribute('href').slice(1));if(!readout||!card)return;var key=document.querySelector('[data-orb-category="'+card.dataset.category+'"] .k');readout.textContent='';var m=document.createElement('span');m.className='mono sm';m.textContent=[card.querySelector('.rung-name').textContent,card.dataset.confidence+' confidence',key?key.textContent:''].join(' · ');var t=document.createElement('span');t.className='t';t.textContent=card.querySelector('h3').textContent;readout.appendChild(m);readout.appendChild(t);}
if(orrery){each('.orrery .pt',function(p){['mouseenter','focus'].forEach(function(ev){p.addEventListener(ev,function(){show(p);});});});orrery.addEventListener('mouseleave',function(){readout.innerHTML=readoutDefault;});}
var lastTarget=null;
function reveal(id,scroll){var el=id&&document.getElementById(id);if(!el)return false;
  if(el.matches('[data-record]')){if(el.hidden)resetFilters();var d=el.querySelector('details');if(d)d.open=true;}
  if(el.matches('[data-source]')&&el.hidden){var sq=document.querySelector('#source-search');sq.value='';sq.dispatchEvent(new Event('input'));}
  if(lastTarget)lastTarget.classList.remove('is-target');lastTarget=el.matches('[data-record],[data-source]')?el:null;if(lastTarget)lastTarget.classList.add('is-target');
  if(scroll)go(el);return true;}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#rec-"],a[href^="#src-"],a[href^="#watch-"]');if(!a)return;var id=a.getAttribute('href').slice(1);if(reveal(id,true)){e.preventDefault();try{history.pushState(null,'','#'+id);}catch(err){}}});
window.addEventListener('hashchange',function(){reveal(decodeURIComponent(location.hash.slice(1)),true);});
if(location.hash)reveal(decodeURIComponent(location.hash.slice(1)),true);
var sq=document.querySelector('#source-search'),rows=[].slice.call(document.querySelectorAll('[data-source]'));
sq.addEventListener('input',function(){var t=sq.value.trim().toLowerCase();rows.forEach(function(r){r.hidden=!!t&&r.dataset.search.indexOf(t)===-1;});});
if('IntersectionObserver' in window){var links={};each('.leftnav a',function(a){links[a.getAttribute('href').slice(1)]=a;});
  var io=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting&&links[en.target.id]){each('.leftnav a',function(a){a.classList.remove('is-active');});links[en.target.id].classList.add('is-active');}});},{rootMargin:'-25% 0px -70% 0px'});
  Object.keys(links).forEach(function(id){var s=document.getElementById(id);if(s)io.observe(s);});}
})();
</script>
</body></html>`;

fs.writeFileSync(pagePath, html);

// The named path is kept working for anyone holding that link, but as a stub
// rather than a byte-for-byte second copy of a 320 KB document.
const alias = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Pakistan AI Policy Observatory — ${esc(periodLabel)}</title>
<link rel="canonical" href="index.html">
<meta http-equiv="refresh" content="0; url=index.html">
<meta name="robots" content="noindex">
</head><body>
<p>This report now lives at <a href="index.html">index.html</a>.</p>
<script>location.replace('index.html');</script>
</body></html>
`;
fs.writeFileSync(aliasPath, alias);
console.log(`Wrote ${path.relative(root, pagePath)} (${Buffer.byteLength(html).toLocaleString()} bytes; ${records.length} records; ${data.sources.length} sources; ${data.watchlist.length} watch items; ${data.exclusions.length} exclusions; ${briefings.length} briefings) and ${path.relative(root, aliasPath)} (${Buffer.byteLength(alias).toLocaleString()}-byte redirect)`);
console.log(`Rungs: ${rungRows.map(r => `${r.name} ${r.total}`).join(' · ')}`);
