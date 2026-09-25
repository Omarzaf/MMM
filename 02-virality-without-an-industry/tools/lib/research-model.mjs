import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cases } from '../../site/data/cases.mjs';
import { figures } from '../../site/data/figures.mjs';
import { liveSources } from '../../site/data/research-additions.mjs';
import { parseCsv } from './csv.mjs';

const SOURCE_FIELDS = [
  'sourceId',
  'title',
  'organization',
  'publicationDate',
  'url',
  'evidenceClass',
  'evidenceFamily',
  'qualityTier',
  'origin',
  'claimScope',
  'limitation',
  'verifiedOn',
];

const PROPOSITION_FIELDS = [
  'proposition_id',
  'proposition',
  'mechanism',
  'primary_measures',
  'supporting_evidence_needed',
  'falsification_or_revision_rule',
  'status_before_fieldwork',
];

const FIELDWORK_FIELDS = ['week', 'workstream', 'activities', 'output', 'decision_gate'];

export function loadResearchModel(rootDir) {
  const rawStarterSources = parseCsv(readFileSync(join(rootDir, 'source_map.csv'), 'utf8'));
  const starterSources = rawStarterSources.map(normalizeStarterSource);
  const propositions = parseCsv(readFileSync(join(rootDir, 'proposition_matrix.csv'), 'utf8'));
  const fieldworkSchedule = parseCsv(readFileSync(join(rootDir, 'fieldwork_schedule.csv'), 'utf8'));
  const allSources = [...starterSources, ...liveSources];

  assertEqual(starterSources.length, 42, 'starter source count');
  assertEqual(liveSources.length, 34, 'live source count');
  assertEqual(propositions.length, 7, 'proposition count');
  assertUnique(allSources.map((source) => source.sourceId), 'source IDs');
  assertUnique(allSources.map((source) => source.url), 'source URLs');
  assertSourceShapes(allSources);
  assertCaseSources(cases, new Set(allSources.map((source) => source.sourceId)));

  const model = {
    starterSources,
    liveSources,
    allSources,
    propositions,
    fieldworkSchedule,
    figures,
    cases,
    sourceFamilyCounts: countBy(starterSources, 'evidenceFamily'),
    qualityTierCounts: countBy(starterSources, 'qualityTier'),
  };
  assertResearchModel(model);
  return model;
}

export function assertResearchModel(model) {
  assertModel(Boolean(model) && typeof model === 'object', 'model must be an object');
  assertModelArray(model.starterSources, 42, 'starterSources');
  assertModelArray(model.liveSources, 34, 'liveSources');
  assertModelArray(model.allSources, 76, 'allSources');
  assertModelArray(model.propositions, 7, 'propositions');
  assertModelArray(model.fieldworkSchedule, 12, 'fieldworkSchedule');
  assertModelArray(model.cases, 7, 'cases');
  assertModel(Boolean(model.figures) && typeof model.figures === 'object', 'figures must be an object');
  assertSourceShapes(model.allSources);
  assertUnique(model.allSources.map((source) => source.sourceId), 'source IDs');
  assertCaseSources(model.cases, new Set(model.allSources.map((source) => source.sourceId)));
  assertPropositions(model.propositions);
  assertFieldworkSchedule(model.fieldworkSchedule);
  assertFigureShapes(model.figures);
  assertCountMap(model.sourceFamilyCounts, ['Scholarship', 'Platform / industry first-party', 'Journalism', 'Official / primary', 'Civil society / monitoring'], 42, 'sourceFamilyCounts');
  assertCountMap(model.qualityTierCounts, ['1', '2', '3'], 42, 'qualityTierCounts');
}

export function normalizeStarterSource(rawSource) {
  const claimScope = [rawSource.research_use, rawSource.claim_supported]
    .filter(Boolean)
    .join(' — ');

  return {
    sourceId: rawSource.source_id,
    title: rawSource.title,
    organization: rawSource.author_or_org,
    publicationDate: rawSource.publication_date,
    url: rawSource.url,
    evidenceClass: rawSource.source_type,
    evidenceFamily: rawSource.evidence_family,
    qualityTier: rawSource.quality_tier,
    origin: 'Starter archive',
    claimScope,
    limitation: rawSource.limitation,
    verifiedOn: '2026-08-23',
  };
}

export function assertEqual(actual, expected, invariant) {
  if (actual !== expected) {
    throw new Error(`${invariant} invariant failed: expected ${expected}; received ${actual}`);
  }
}

export function assertUnique(values, invariant) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${invariant} invariant failed: duplicate value ${duplicates[0]}`);
  }
}

export function assertCaseSources(caseStudies, sourceIds) {
  for (const caseStudy of caseStudies) {
    for (const sourceId of caseStudy.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(`case source invariant failed: ${caseStudy.id} references missing source ID ${sourceId}`);
      }
    }
  }
}

export function countBy(records, property) {
  return records.reduce((counts, record) => {
    const value = record[property];
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function assertSourceShapes(sources) {
  sources.forEach((source, index) => {
    assertModelFields(source, SOURCE_FIELDS, `allSources[${index}]`);
    SOURCE_FIELDS.forEach((field) => assertModelString(source[field], `allSources[${index}].${field}`));
  });
}

function assertPropositions(propositions) {
  propositions.forEach((proposition, index) => {
    assertModelFields(proposition, PROPOSITION_FIELDS, `propositions[${index}]`);
    PROPOSITION_FIELDS.forEach((field) => assertModelString(proposition[field], `propositions[${index}].${field}`));
    assertModel(proposition.proposition_id === `P${String(index + 1).padStart(2, '0')}`, `propositions[${index}].proposition_id must preserve P01–P07 order`);
  });
}

function assertFieldworkSchedule(schedule) {
  schedule.forEach((row, index) => {
    assertModelFields(row, FIELDWORK_FIELDS, `fieldworkSchedule[${index}]`);
    FIELDWORK_FIELDS.forEach((field) => assertModelString(row[field], `fieldworkSchedule[${index}].${field}`));
    assertModel(row.week === String(index + 1), `fieldworkSchedule[${index}].week must preserve weeks 1–12`);
  });
}

function assertFigureShapes(figureData) {
  assertModelFields(figureData, ['broadband', 'traffic', 'livelihood', 'spotifyPulse', 'evidenceMatrix'], 'figures');
  assertModelFields(figureData.broadband, ['evidenceClass', 'mandatoryCaption', 'historical', 'current'], 'figures.broadband');
  assertModelString(figureData.broadband.evidenceClass, 'figures.broadband.evidenceClass');
  assertModelString(figureData.broadband.mandatoryCaption, 'figures.broadband.mandatoryCaption');
  assertModelArray(figureData.broadband.historical, 7, 'figures.broadband.historical');
  figureData.broadband.historical.forEach((row, index) => {
    assertModelFields(row, ['period', 'subscriptions'], `figures.broadband.historical[${index}]`);
    assertModelString(row.period, `figures.broadband.historical[${index}].period`);
    assertModelNumber(row.subscriptions, { min: 1, max: 170_000_000, integer: true }, `figures.broadband.historical[${index}].subscriptions`);
  });
  assertModelArray(figureData.broadband.current, 5, 'figures.broadband.current');
  figureData.broadband.current.forEach((row, index) => {
    assertModelFields(row, ['period', 'subscriptionsMillions', 'penetrationPercent'], `figures.broadband.current[${index}]`);
    assertModelString(row.period, `figures.broadband.current[${index}].period`);
    assertModelNumber(row.subscriptionsMillions, { min: 0, max: 170 }, `figures.broadband.current[${index}].subscriptionsMillions`);
    assertModelNumber(row.penetrationPercent, { min: 0, max: 100 }, `figures.broadband.current[${index}].penetrationPercent`);
  });

  assertModelArray(figureData.traffic, 5, 'figures.traffic');
  figureData.traffic.forEach((row, index) => {
    assertModelFields(row, ['period', 'mobilePb', 'fixedPb', 'officialTotalPb', 'estimated'], `figures.traffic[${index}]`);
    assertModelString(row.period, `figures.traffic[${index}].period`);
    for (const field of ['mobilePb', 'fixedPb', 'officialTotalPb']) {
      assertModelNumber(row[field], { min: 0, max: 32_000, integer: true }, `figures.traffic[${index}].${field}`);
    }
    assertModel(typeof row.estimated === 'boolean', `figures.traffic[${index}].estimated must be boolean`);
  });

  assertModelArray(figureData.livelihood, 3, 'figures.livelihood');
  figureData.livelihood.forEach((row, index) => {
    assertModelFields(row, ['region', 'sample', 'projectPaidPercent', 'around35000Percent', 'above100000Percent'], `figures.livelihood[${index}]`);
    assertModelString(row.region, `figures.livelihood[${index}].region`);
    assertModelNumber(row.sample, { min: 1, max: 50, integer: true }, `figures.livelihood[${index}].sample`);
    for (const field of ['projectPaidPercent', 'around35000Percent', 'above100000Percent']) {
      assertModelNumber(row[field], { min: 0, max: 100 }, `figures.livelihood[${index}].${field}`);
    }
  });
  assertModel(figureData.livelihood.reduce((sum, row) => sum + row.sample, 0) === 50, 'figures.livelihood samples must total 50');

  assertModelArray(figureData.spotifyPulse, 5, 'figures.spotifyPulse');
  figureData.spotifyPulse.forEach((row, index) => {
    assertModelFields(row, ['label', 'value', 'evidenceClass'], `figures.spotifyPulse[${index}]`);
    for (const field of ['label', 'value', 'evidenceClass']) assertModelString(row[field], `figures.spotifyPulse[${index}].${field}`);
  });

  assertModelFields(figureData.evidenceMatrix, ['columns', 'rows'], 'figures.evidenceMatrix');
  assertModelArray(figureData.evidenceMatrix.columns, 5, 'figures.evidenceMatrix.columns');
  figureData.evidenceMatrix.columns.forEach((column, index) => assertModelString(column, `figures.evidenceMatrix.columns[${index}]`));
  assertModelArray(figureData.evidenceMatrix.rows, 6, 'figures.evidenceMatrix.rows');
  figureData.evidenceMatrix.rows.forEach((row, rowIndex) => {
    assertModelFields(row, ['dimension', 'scores'], `figures.evidenceMatrix.rows[${rowIndex}]`);
    assertModelString(row.dimension, `figures.evidenceMatrix.rows[${rowIndex}].dimension`);
    assertModelArray(row.scores, 5, `figures.evidenceMatrix.rows[${rowIndex}].scores`);
    row.scores.forEach((score, columnIndex) => assertModelNumber(score, { min: 1, max: 4, integer: true }, `figures.evidenceMatrix.rows[${rowIndex}].scores[${columnIndex}]`));
  });
}

function assertCountMap(counts, keys, total, invariant) {
  assertModel(Boolean(counts) && typeof counts === 'object' && !Array.isArray(counts), `${invariant} must be an object`);
  assertModel(Object.keys(counts).length === keys.length && keys.every((key) => Object.hasOwn(counts, key)), `${invariant} must contain the exact expected keys`);
  keys.forEach((key) => assertModelNumber(counts[key], { min: 0, integer: true }, `${invariant}.${key}`));
  assertModel(keys.reduce((sum, key) => sum + counts[key], 0) === total, `${invariant} must total ${total}`);
}

function assertModelFields(record, fields, invariant) {
  assertModel(Boolean(record) && typeof record === 'object' && !Array.isArray(record), `${invariant} must be an object`);
  const keys = Object.keys(record);
  assertModel(keys.length === fields.length && fields.every((field) => keys.includes(field)), `${invariant} must contain exactly ${fields.join(', ')}`);
}

function assertModelArray(value, length, invariant) {
  assertModel(Array.isArray(value) && value.length === length, `${invariant} must contain exactly ${length} records`);
}

function assertModelString(value, invariant) {
  assertModel(typeof value === 'string' && value.trim().length > 0, `${invariant} must be a non-empty string`);
}

function assertModelNumber(value, { min, max = Number.POSITIVE_INFINITY, integer = false }, invariant) {
  assertModel(typeof value === 'number' && Number.isFinite(value), `${invariant} must be finite`);
  assertModel(value >= min && value <= max, `${invariant} must be between ${min} and ${max}`);
  if (integer) assertModel(Number.isInteger(value), `${invariant} must be an integer`);
}

function assertModel(condition, message) {
  if (!condition) throw new TypeError(`ResearchModel invariant failed: ${message}`);
}
