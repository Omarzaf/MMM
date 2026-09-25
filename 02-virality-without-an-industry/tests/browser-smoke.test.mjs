import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_GROUPS,
  REQUIRED_VIEWPORTS,
  isRenderedBoxVisible,
  screenshotPathFor,
  summarizeControlSnapshots,
  validateBrowserReport,
} from '../tools/browser-smoke.mjs';

function validReport() {
  return {
    chromeVersion: 'Google Chrome 151.0.7922.170',
    viewports: REQUIRED_VIEWPORTS.map(({ width, height }) => ({
      width,
      height,
      screenshotPath: screenshotPathFor(width, height),
      screenshotBytes: 100,
      screenshotWidth: width,
      screenshotHeight: height,
      enhanced: true,
      chapters: ['00', '01', '02', '03', '04', '05', '06', '07', '08'],
      groups: [...REQUIRED_GROUPS],
      sourceCount: 76,
      sourceCountText: 'Showing all 76 sources',
      consoleErrors: [],
      runtimeErrors: [],
      horizontalOverflow: false,
      hiddenCriticalControls: [],
      unreachableCriticalControls: [],
      focusIndicatorVisible: true,
      keyboardCaseTabWorks: true,
      keyboardSourceFilterWorks: true,
      minimumControlHeight: 44,
      stickyNavHeightRatio: height === 844 ? 0.08 : 0.07,
      heroContactOverlapPixels: 0,
      heroHeadlineOverflowPixels: 0,
      heroFirstRowImbalancePixels: 0,
      chapterNavOverflowing: width !== 1440,
      heroHeadlineLineCount: width === 1440 ? 3 : 4,
    })),
    reducedMotion: {
      enhanced: true,
      reducedMotion: true,
      unrevealedCount: 0,
      animationCount: 0,
      stagedTransitionCount: 0,
      signalTransitionSeconds: 0,
      consoleErrors: [],
      runtimeErrors: [],
    },
    noJavaScript: {
      enhanced: false,
      chapters: 9,
      cases: 7,
      caseViews: 21,
      hiddenCaseViews: 0,
      figureSummaries: 13,
      hiddenFigureSummaries: 0,
      sourceRows: 76,
      hiddenSourceRows: 0,
      downloads: 11,
      hiddenDownloads: 0,
      consoleErrors: [],
      runtimeErrors: [],
    },
    print: {
      numberedHeadings: 9,
      hiddenNumberedHeadings: 0,
      captions: 16,
      hiddenCaptions: 0,
      sourceIds: 76,
      evidenceNotes: 9,
      externalLinks: 100,
      printableExternalLinks: 100,
      interactiveControlsVisible: 0,
      hiddenCaseViews: 0,
      pdfBytes: 1000,
      consoleErrors: [],
      runtimeErrors: [],
    },
  };
}

test('screenshotPathFor names only the three required viewport artifacts', () => {
  assert.equal(
    screenshotPathFor(1440, 1000),
    'artifacts/qa/living-liner-notes-1440x1000.png',
  );
  assert.throws(() => screenshotPathFor(1280, 720), /unsupported viewport/u);
});

test('validateBrowserReport accepts a complete browser QA report', () => {
  const report = validReport();
  assert.deepEqual(validateBrowserReport(report), report);
});

test('validateBrowserReport rejects missing enhanced DOM invariants', () => {
  const report = validReport();
  report.viewports[0].chapters.pop();
  report.viewports[0].groups = ['Prelude', 'Side A — Circulation'];
  report.viewports[0].sourceCount = 75;
  assert.throws(
    () => validateBrowserReport(report),
    /1440x1000: expected chapters 00 through 08.*four grouping labels.*76 source rows/us,
  );
});

test('validateBrowserReport rejects browser errors and document overflow', () => {
  const report = validReport();
  report.viewports[1].consoleErrors.push('Uncaught TypeError');
  report.viewports[1].horizontalOverflow = true;
  assert.throws(
    () => validateBrowserReport(report),
    /820x1024: console errors.*document-level horizontal overflow/us,
  );
});

test('validateBrowserReport rejects controls that keyboard users cannot perceive or operate', () => {
  const report = validReport();
  report.viewports[2].hiddenCriticalControls.push('[data-source-reset]');
  report.viewports[2].focusIndicatorVisible = false;
  report.viewports[2].keyboardCaseTabWorks = false;
  report.viewports[2].minimumControlHeight = 39;
  report.viewports[2].stickyNavHeightRatio = 0.2;
  assert.throws(
    () => validateBrowserReport(report),
    /390x844: hidden critical controls.*focus indicator.*case tabs.*44 CSS px.*15%/us,
  );
});

test('validateBrowserReport rejects undersized tablet controls', () => {
  const report = validReport();
  report.viewports[1].minimumControlHeight = 39;
  assert.throws(
    () => validateBrowserReport(report),
    /820x1024: critical tablet controls must be at least 44 CSS px high/u,
  );
});

test('validateBrowserReport rejects staged reduced-motion state', () => {
  const report = validReport();
  report.reducedMotion.unrevealedCount = 1;
  report.reducedMotion.animationCount = 1;
  report.reducedMotion.signalTransitionSeconds = 0.24;
  assert.throws(
    () => validateBrowserReport(report),
    /reduced motion: final reveal state.*active animations.*signal travel/us,
  );
});

test('validateBrowserReport rejects console or runtime errors in resilience states', () => {
  const report = validReport();
  report.reducedMotion.consoleErrors.push('motion branch failed');
  report.print.runtimeErrors.push('print branch failed');
  assert.throws(
    () => validateBrowserReport(report),
    /reduced motion: console errors.*print: runtime errors/us,
  );
});

test('validateBrowserReport rejects incomplete no-JavaScript content', () => {
  const report = validReport();
  report.noJavaScript.hiddenCaseViews = 14;
  report.noJavaScript.sourceRows = 75;
  report.noJavaScript.downloads = 10;
  assert.throws(
    () => validateBrowserReport(report),
    /no JavaScript: expected 21 visible case views.*76 visible source rows.*11 visible downloads/us,
  );
});

test('validateBrowserReport rejects print output that loses evidence or exposes controls', () => {
  const report = validReport();
  report.print.hiddenNumberedHeadings = 1;
  report.print.hiddenCaptions = 1;
  report.print.printableExternalLinks = 99;
  report.print.interactiveControlsVisible = 1;
  assert.throws(
    () => validateBrowserReport(report),
    /print: expected nine visible numbered headings.*visible captions.*printable URLs.*interactive controls omitted/us,
  );
});

test('validateBrowserReport rejects missing or dimension-drifted screenshots', () => {
  const report = validReport();
  report.viewports[0].screenshotBytes = 0;
  report.viewports[1].screenshotWidth = 819;
  assert.throws(
    () => validateBrowserReport(report),
    /1440x1000: screenshot is empty.*820x1024: screenshot dimensions drifted/us,
  );
});

test('validateBrowserReport rejects contact-sheet overlap with the hero headline', () => {
  const report = validReport();
  report.viewports[0].heroContactOverlapPixels = 91;
  assert.throws(
    () => validateBrowserReport(report),
    /1440x1000: contact sheet overlaps the hero headline by 91px/u,
  );
});

test('validateBrowserReport rejects headline glyph overflow beyond its editorial column', () => {
  const report = validReport();
  report.viewports[0].heroHeadlineOverflowPixels = 87;
  assert.throws(
    () => validateBrowserReport(report),
    /1440x1000: hero headline overflows its column by 87px/u,
  );
});

test('validateBrowserReport rejects clipped desktop navigation and loose headline wrapping', () => {
  const report = validReport();
  report.viewports[0].chapterNavOverflowing = true;
  report.viewports[0].heroHeadlineLineCount = 4;
  assert.throws(
    () => validateBrowserReport(report),
    /1440x1000: desktop chapter navigation is clipped.*headline must use three lines/us,
  );
});

test('validateBrowserReport rejects a desktop hero row with a large dead zone', () => {
  const report = validReport();
  report.viewports[0].heroFirstRowImbalancePixels = 264;
  assert.throws(
    () => validateBrowserReport(report),
    /1440x1000: hero first row leaves a 264px dead zone below the contact sheet/u,
  );
});

test('summarizeControlSnapshots treats roving tabs as keyboard-reachable', () => {
  const summary = summarizeControlSnapshots([
    { label: 'Circulation', display: 'block', visibility: 'visible', opacity: 1, width: 100, height: 44, tabIndex: 0, disabled: false, role: 'tab', tablistHasTabStop: true },
    { label: 'Rights', display: 'block', visibility: 'visible', opacity: 1, width: 80, height: 44, tabIndex: -1, disabled: false, role: 'tab', tablistHasTabStop: true },
  ]);
  assert.deepEqual(summary.unreachableCriticalControls, []);
  assert.equal(summary.minimumControlHeight, 44);
});

test('isRenderedBoxVisible honors print display when CSS overrides a hidden attribute', () => {
  assert.equal(isRenderedBoxVisible({
    hidden: true,
    display: 'block',
    visibility: 'visible',
    opacity: 1,
    width: 200,
    height: 80,
  }), true);
});
