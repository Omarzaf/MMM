import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCsv } from '../tools/lib/csv.mjs';
import { loadResearchModel } from '../tools/lib/research-model.mjs';

const model = loadResearchModel(process.cwd());
const expectedCaseIds = [
  'lyari-underground',
  'eva-b',
  'abid-brohi',
  'shae-gill',
  'young-stunners',
  'abdullah-siddiqui',
  'arooj-aftab',
];
const expectedLiveSourceIds = [
  'L001', 'L002', 'L003', 'L004', 'L005', 'L006', 'L007', 'L008', 'L009',
  'L010', 'L011', 'L012', 'L013', 'L014', 'L015', 'L016', 'L017', 'L018',
  'L019', 'L020', 'L021', 'L022', 'L023', 'L024', 'L025', 'L026', 'L027',
  'L028', 'L029', 'L030', 'L031', 'L032', 'L033', 'L034',
];

test('preserves the starter registry invariants', () => {
  assert.equal(model.starterSources.length, 42);
  assert.equal(model.liveSources.length, 34);
  assert.equal(model.allSources.length, 76);
  assert.deepEqual(model.liveSources.map((source) => source.sourceId), expectedLiveSourceIds);
  assert.equal(model.starterSources.filter((source) => /spotify/i.test(JSON.stringify(source))).length, 5);
  assert.deepEqual(model.sourceFamilyCounts, {
    Scholarship: 13,
    'Platform / industry first-party': 12,
    Journalism: 8,
    'Official / primary': 8,
    'Civil society / monitoring': 1,
  });
  assert.deepEqual(model.qualityTierCounts, { '1': 10, '2': 30, '3': 2 });
});

test('preserves quantitative caveats and the official traffic discrepancy', () => {
  assert.equal(model.figures.broadband.current.at(-1).subscriptionsMillions, 161);
  assert.equal(model.figures.broadband.current.at(-1).penetrationPercent, 64.2);
  assert.equal(model.figures.traffic.at(-1).mobilePb + model.figures.traffic.at(-1).fixedPb, 30782);
  assert.equal(model.figures.traffic.at(-1).officialTotalPb, 30783);
  assert.equal(model.figures.livelihood.reduce((sum, row) => sum + row.sample, 0), 50);
  assert.equal(model.figures.evidenceMatrix.columns.length, 5);
  assert.equal(model.figures.evidenceMatrix.rows.length, 6);
  for (const row of model.figures.evidenceMatrix.rows) {
    assert.equal(row.scores.length, model.figures.evidenceMatrix.columns.length);
    for (const score of row.scores) assert.ok(Number.isInteger(score) && score >= 1 && score <= 4);
  }
});

test('normalizes the exact canonical fieldwork schedule', () => {
  const canonicalRows = parseCsv(readFileSync(new URL('../fieldwork_schedule.csv', import.meta.url), 'utf8'));
  assert.deepEqual(model.fieldworkSchedule, canonicalRows);
  assert.equal(model.fieldworkSchedule.length, 12);
});

test('contains seven sourced case pathways', () => {
  assert.equal(model.cases.length, 7);
  assert.deepEqual(model.cases.map((caseStudy) => caseStudy.id), expectedCaseIds);
  for (const caseStudy of model.cases) {
    assert.ok(caseStudy.sourceIds.length >= 2, caseStudy.id);
    assert.ok(caseStudy.overclaimRisk.length > 20, caseStudy.id);
    assert.deepEqual(Object.keys(caseStudy.views), ['circulation', 'rights', 'missingEvidence']);
  }
});
