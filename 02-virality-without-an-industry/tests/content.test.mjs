import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { chapters, countNarrativeWords } from '../site/content/chapters/index.mjs';
import { cases } from '../site/data/cases.mjs';
import { loadResearchModel } from '../tools/lib/research-model.mjs';

const rootDir = process.cwd();
const validSourceIds = new Set(loadResearchModel(rootDir).allSources.map(({ sourceId }) => sourceId));
const validClaimModes = ['synthesis', 'single-primary', 'first-party-attributed', 'context'];
const publicLocalRefs = new Set([
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
const expectedCaseIds = [
  'lyari-underground',
  'eva-b',
  'abid-brohi',
  'shae-gill',
  'young-stunners',
  'abdullah-siddiqui',
  'arooj-aftab',
];
const caseSourceIds = new Map(cases.map(({ id, sourceIds }) => [id, new Set(sourceIds)]));
const expectedFigureIds = new Map([
  ['01', ['broadband', 'traffic', 'timeline']],
  ['02', ['spotify-pulse', 'distribution-stage']],
  ['03', ['research-architecture', 'source-family', 'quality-tier', 'evidence-matrix', 'livelihood-snapshot']],
]);
const expectedOpening = {
  headline: 'Virality Without an Industry?',
  deck: "The Political Economy of Pakistan's Music Revival, 2014–2026",
  contactSheet: ['mizraab-coke-studio', 'radio-pakistan-building', 'cell-towers-punjab'],
};
const internalCountPattern = /\b(42 starter|360-track|93 track|51 artist|13 scholarship|12 platform|8 journalism|8 official|1 civil-society|10 Tier 1|30 Tier 2|2 Tier 3)\b/i;

test('orders the Prelude and Side A chapters', () => {
  const sideA = chapters.slice(0, 4);
  assert.deepEqual(sideA.map(({ number }) => number), ['00', '01', '02', '03']);
  assert.deepEqual(sideA.map(({ group }) => group), [
    'Prelude',
    'Side A — Circulation',
    'Side A — Circulation',
    'Side A — Circulation',
  ]);
});

test('orders all nine chapters and stays within the full narrative budget', () => {
  assert.deepEqual(chapters.map(({ number }) => number), ['00', '01', '02', '03', '04', '05', '06', '07', '08']);
  assert.deepEqual(chapters.map(({ group }) => group), [
    'Prelude',
    'Side A — Circulation',
    'Side A — Circulation',
    'Side A — Circulation',
    'Side B — Value',
    'Side B — Value',
    'Side B — Value',
    'Side B — Value',
    'Liner Notes',
  ]);
  const words = countNarrativeWords(chapters);
  assert.ok(words >= 5000 && words <= 7000, `narrative words: ${words}`);
});

test('keeps implementation instructions out of reader-visible chapter prose', () => {
  const readerCopy = chapters.flatMap(({ blocks }) => blocks)
    .filter(({ kind }) => kind === 'paragraph')
    .map(({ text }) => text)
    .join('\n');
  for (const phrase of [
    'The figure introduction must say',
    'The download shelf should contain',
    'It should advertise',
  ]) {
    assert.doesNotMatch(readerCopy, new RegExp(phrase, 'u'), phrase);
  }
});

test('includes every approved evidence module', () => {
  const moduleIds = chapters.flatMap(({ blocks }) => blocks.map(({ figureId, moduleId }) => figureId ?? moduleId).filter(Boolean));
  for (const required of ['proposition-ledger', 'case-pathways', 'methods-architecture', 'policy-spread', 'missing-ledger', 'source-registry', 'downloads']) {
    assert.ok(moduleIds.includes(required), required);
  }
});

test('restricts Chapter 05 case prose to assigned case source IDs', () => {
  const pathways = chapters.find(({ id }) => id === 'comparative-pathways');
  assert.ok(pathways, 'comparative-pathways');
  const taggedCaseBlocks = pathways.blocks.filter(({ kind, caseId }) => kind === 'paragraph' && caseId);
  assert.deepEqual(taggedCaseBlocks.map(({ caseId }) => caseId), expectedCaseIds);
  for (const block of taggedCaseBlocks) {
    const allowedSources = caseSourceIds.get(block.caseId);
    assert.ok(allowedSources, `unknown caseId ${block.caseId}`);
    for (const sourceId of block.sourceIds) {
      assert.ok(allowedSources.has(sourceId), `${block.caseId}: sourceId ${sourceId} is not assigned to this case`);
    }
  }
});

test('ends Chapter 05 with a real overclaim warning after all case prose', () => {
  const pathways = chapters.find(({ id }) => id === 'comparative-pathways');
  assert.ok(pathways, 'comparative-pathways');
  const taggedCaseIndexes = pathways.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind === 'paragraph' && block.caseId);
  assert.deepEqual(taggedCaseIndexes.map(({ block }) => block.caseId), expectedCaseIds);
  const finalCaseIndex = taggedCaseIndexes.at(-1).index;
  const finalProseIndex = pathways.blocks.findLastIndex(({ kind }) => kind === 'paragraph');
  assert.ok(finalProseIndex > finalCaseIndex, 'closing overclaim warning must follow all seven tagged cases');
  const finalText = pathways.blocks[finalProseIndex].text;
  assert.match(finalText, /contract terms without contracts/i);
  assert.match(finalText, /income without accounts/i);
  assert.match(finalText, /community (?:benefit|evidence).*community evidence/i);
  assert.match(finalText, /national claim/i);
});

test('preserves the approved opening headline, deck, and contact sheet', () => {
  const opening = chapters.find(({ number }) => number === '00');
  assert.equal(opening.headline, expectedOpening.headline);
  assert.equal(opening.deck, expectedOpening.deck);
  const contactSheet = opening.blocks.find(({ kind }) => kind === 'contact-sheet');
  assert.deepEqual(contactSheet.imageIds, expectedOpening.contactSheet);
});

test('preserves the required Side A figure sequence', () => {
  for (const [number, figureIds] of expectedFigureIds) {
    const chapter = chapters.find((item) => item.number === number);
    assert.deepEqual(chapter.blocks.filter(({ kind }) => kind === 'figure').map(({ figureId }) => figureId), figureIds, number);
  }
});

test('exposes the chapter object contract', () => {
  for (const chapter of chapters) {
    for (const field of ['id', 'number', 'group', 'title', 'wordBudget', 'blocks', 'establishes', 'unknown']) {
      assert.ok(Object.hasOwn(chapter, field), `${chapter.id ?? 'unknown'}: missing ${field}`);
    }
    assertWordBudget(chapter);
    assert.ok(Array.isArray(chapter.blocks), `${chapter.id}: blocks`);
    for (const block of chapter.blocks) {
      assertBlockShape(chapter, block);
    }
  }
});

test('requires citations and explicit evidence posture on consequential prose', () => {
  for (const chapter of chapters) {
    assert.ok(chapter.establishes.length >= 40, chapter.id);
    assert.ok(chapter.unknown.length >= 40, chapter.id);
    for (const block of chapter.blocks.filter(({ kind, text }) => kind === 'paragraph' && /\d|platform|policy|income|royalt|launch|award/i.test(text))) {
      assert.ok(block.sourceIds.length > 0 || (block.claimMode === 'context' && block.localRefs?.length > 0), `${chapter.id}: ${block.text.slice(0, 40)}`);
      assert.ok(validClaimModes.includes(block.claimMode), chapter.id);
      if (block.claimMode === 'synthesis') assert.ok(block.sourceIds.length >= 2, `${chapter.id}: synthesis requires corroboration`);
      if (block.claimMode === 'single-primary' || block.claimMode === 'first-party-attributed') assert.equal(block.sourceIds.length, 1, chapter.id);
    }
  }
});

test('resolves every external source ID and local package reference', () => {
  for (const chapter of chapters) {
    for (const block of chapter.blocks.filter(({ kind }) => kind === 'paragraph')) {
      for (const sourceId of block.sourceIds) {
        assert.ok(validSourceIds.has(sourceId), `${chapter.id}: unresolved sourceId ${sourceId}`);
      }
      for (const localRef of block.localRefs ?? []) {
        assert.ok(existsSync(join(rootDir, localRef)), `${chapter.id}: unresolved localRef ${localRef}`);
        assert.ok(publicLocalRefs.has(localRef), `${chapter.id}: localRef ${localRef} is not in the public package allowlist`);
      }
      if (block.localRefs !== undefined) {
        assert.equal(block.claimMode, 'context', `${chapter.id}: localRefs are only allowed on context paragraphs`);
      }
    }
  }
});

test('uses package-local references for Chapter 03 internal architecture counts', () => {
  const evidence = chapters.find(({ number }) => number === '03');
  const internalCountBlocks = evidence.blocks.filter(({ kind, text }) => kind === 'paragraph' && internalCountPattern.test(text));
  assert.equal(internalCountBlocks.length, 2);
  assert.deepEqual(internalCountBlocks[0].sourceIds, []);
  assert.deepEqual(internalCountBlocks[0].localRefs, [
    'source_map.csv',
    'track_dataset_codebook.csv',
    'artist_dataset_codebook.csv',
    'analysis_plan.md',
  ]);
  assert.equal(internalCountBlocks[0].claimMode, 'context');
  assert.deepEqual(internalCountBlocks[1].sourceIds, []);
  assert.deepEqual(internalCountBlocks[1].localRefs, ['source_map.csv']);
  assert.equal(internalCountBlocks[1].claimMode, 'context');
});

test('keeps Prelude and Side A prose within their combined budgets', () => {
  const words = countNarrativeWords(chapters.slice(0, 4));
  assert.ok(words >= 2150 && words <= 2900, `Prelude and Side A words: ${words}`);
});

test('keeps Chapters 04–08 within their individual narrative budgets', () => {
  for (const chapter of chapters.slice(4)) {
    const [minimum, maximum] = chapter.wordBudget;
    const words = countNarrativeWords([chapter]);
    assert.ok(words >= minimum && words <= maximum, `${chapter.number} ${chapter.id} words: ${words}`);
  }
});

function assertWordBudget(chapter) {
  assert.ok(Array.isArray(chapter.wordBudget), `${chapter.id}: wordBudget`);
  assert.equal(chapter.wordBudget.length, 2, `${chapter.id}: wordBudget tuple length`);
  const [minimum, maximum] = chapter.wordBudget;
  assert.ok(Number.isInteger(minimum), `${chapter.id}: wordBudget minimum`);
  assert.ok(Number.isInteger(maximum), `${chapter.id}: wordBudget maximum`);
  assert.ok(minimum < maximum, `${chapter.id}: wordBudget ascending`);
}

function assertBlockShape(chapter, block) {
  if (block.kind === 'paragraph') {
    assert.equal(typeof block.text, 'string', `${chapter.id}: paragraph text`);
    assert.ok(block.text.length > 0, `${chapter.id}: paragraph text content`);
    assert.ok(Array.isArray(block.sourceIds), `${chapter.id}: paragraph sourceIds`);
    assert.ok(validClaimModes.includes(block.claimMode), `${chapter.id}: paragraph claimMode`);
    if (block.caseId !== undefined) assert.equal(typeof block.caseId, 'string', `${chapter.id}: paragraph caseId`);
    if (block.localRefs !== undefined) assert.ok(Array.isArray(block.localRefs), `${chapter.id}: paragraph localRefs`);
    return;
  }
  if (block.kind === 'figure') {
    assert.equal(typeof block.figureId, 'string', `${chapter.id}: figureId`);
    assert.ok(block.figureId.length > 0, `${chapter.id}: figureId content`);
    return;
  }
  if (block.kind === 'contact-sheet') {
    assert.ok(Array.isArray(block.imageIds), `${chapter.id}: contact-sheet imageIds`);
    assert.ok(block.imageIds.every((imageId) => typeof imageId === 'string' && imageId.length > 0), `${chapter.id}: contact-sheet imageIds content`);
    return;
  }
  if (['case-pathways', 'methods', 'registry', 'downloads'].includes(block.kind)) {
    assert.equal(typeof block.moduleId, 'string', `${chapter.id}: moduleId`);
    assert.ok(block.moduleId.length > 0, `${chapter.id}: moduleId content`);
    return;
  }
  assert.fail(`${chapter.id}: unknown block kind ${block.kind}`);
}
