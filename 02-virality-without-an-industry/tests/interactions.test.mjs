import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import manifest from '../assets/hiphop-pakistan/manifest.json' with { type: 'json' };
import {
  CHAPTER_GROUPS,
  filterSources,
  getChapterGroup,
  initializeInteractions,
  normalizeCaseView,
} from '../site/interactions.mjs';
import { chapters } from '../site/content/chapters/index.mjs';
import { escapeHtml, renderDocument } from '../site/render/document.mjs';
import { renderRegistry } from '../site/render/registry.mjs';
import { loadResearchModel } from '../tools/lib/research-model.mjs';

const research = loadResearchModel(process.cwd());
const styles = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
const interactions = readFileSync(new URL('../site/interactions.mjs', import.meta.url), 'utf8');
const html = renderDocument({ research, chapters, images: manifest, styles: '', interactions: '' });

const count = (pattern, value = html) => value.match(pattern)?.length ?? 0;

test('uses one frozen exact supplemental group map for chapters 00 through 08', () => {
  assert.equal(Object.isFrozen(CHAPTER_GROUPS), true);
  assert.deepEqual(CHAPTER_GROUPS, {
    '00': 'Prelude',
    '01': 'Side A — Circulation',
    '02': 'Side A — Circulation',
    '03': 'Side A — Circulation',
    '04': 'Side B — Value',
    '05': 'Side B — Value',
    '06': 'Side B — Value',
    '07': 'Side B — Value',
    '08': 'Liner Notes',
  });
  for (const [number, group] of Object.entries(CHAPTER_GROUPS)) {
    assert.equal(getChapterGroup(number), group);
  }
  assert.throws(() => getChapterGroup('09'), /unknown chapter/);
});

test('filters only the declared source fields case-insensitively and applies exact/all origins without mutation', () => {
  const sources = [
    { sourceId: 'forbidden-id', title: 'Spotify launch', organization: 'Platform desk', publicationDate: 'forbidden-published', evidenceClass: 'forbidden-class', evidenceFamily: 'forbidden-family', qualityTier: 'forbidden-tier', claimScope: 'Pakistan entry', limitation: 'No revenue', origin: 'Starter archive', verifiedOn: 'forbidden-verified' },
    { title: 'Economic Survey', organization: 'Finance Division', claimScope: 'Broadband totals', limitation: 'Not music traffic', origin: 'Live research expansion' },
    { title: 'Rights note', organization: 'Policy Lab', claimScope: 'COLLECTION systems', limitation: 'Implementation UNKNOWN', origin: 'Starter archive' },
  ];
  const before = structuredClone(sources);

  assert.deepEqual(filterSources(sources, 'SPOTIFY', 'Starter archive'), [sources[0]]);
  assert.deepEqual(filterSources(sources, 'finance division', 'All sources'), [sources[1]]);
  assert.deepEqual(filterSources(sources, 'collection', 'All sources'), [sources[2]]);
  assert.deepEqual(filterSources(sources, 'unknown', 'Starter archive'), [sources[2]]);
  assert.deepEqual(filterSources(sources, '', 'Live research expansion'), [sources[1]]);
  assert.deepEqual(filterSources(sources, '', 'starter archive'), []);
  for (const forbidden of ['forbidden-id', 'forbidden-published', 'forbidden-class', 'forbidden-family', 'forbidden-tier', 'starter archive', 'forbidden-verified']) {
    assert.deepEqual(filterSources(sources, forbidden, 'All sources'), [], forbidden);
  }
  assert.deepEqual(sources, before);
  assert.notEqual(filterSources(sources, '', 'All sources'), sources);
});

test('renders exactly the four canonical query fields while keeping origin and provenance separate', () => {
  const source = {
    sourceId: 'forbidden-id',
    title: 'Allowed title',
    organization: 'Allowed organization',
    publicationDate: 'forbidden-published',
    evidenceClass: 'forbidden-class',
    evidenceFamily: 'forbidden-family',
    qualityTier: 'forbidden-tier',
    origin: 'forbidden-origin',
    claimScope: 'Allowed claim',
    limitation: 'Allowed limitation',
    verifiedOn: 'forbidden-verified',
    url: 'https://example.com/source',
  };
  const registry = renderRegistry([source]);
  const expected = 'allowed title allowed organization allowed claim allowed limitation';
  assert.match(registry, new RegExp(`data-search="${escapeHtml(expected)}"`));
  const searchValue = registry.match(/data-search="([^"]*)"/)?.[1];
  for (const forbidden of ['forbidden-id', 'forbidden-published', 'forbidden-class', 'forbidden-family', 'forbidden-tier', 'forbidden-origin', 'forbidden-verified']) {
    assert.doesNotMatch(searchValue, new RegExp(forbidden), forbidden);
  }
  assert.match(registry, /data-origin="forbidden-origin"/);
  assert.match(registry, /data-verified-on="forbidden-verified"/);
  assert.match(registry, />Verified forbidden-verified</);
});

test('normalizes only the three exact case-view values', () => {
  for (const view of ['circulation', 'rights', 'missingEvidence']) {
    assert.equal(normalizeCaseView(view), view);
  }
  for (const invalid of ['money', 'Rights', 'missing-evidence', '', null]) {
    assert.throws(() => normalizeCaseView(invalid), /unknown case view/);
  }
});

test('renders all required enhancement hooks while preserving complete static fallbacks', () => {
  assert.equal(count(/data-chapter-link="0[0-8]"/g), 9);
  assert.equal(count(/aria-current="step"/g), 1);
  assert.match(html, /data-current-group[^>]*>Prelude</);
  assert.match(html, /data-signal-path/);

  assert.match(html, /<form[^>]+data-registry-controls[^>]+hidden/);
  assert.match(html, /<label[^>]+for="source-query"[^>]*>[^<]*Search sources/);
  assert.match(html, /<input[^>]+id="source-query"[^>]+type="search"[^>]+data-source-query/);
  assert.match(html, /<label[^>]+for="source-origin"[^>]*>[^<]*Registry origin/);
  assert.match(html, /<select[^>]+id="source-origin"[^>]+data-source-origin/);
  for (const origin of ['All sources', 'Starter archive', 'Live research expansion']) {
    assert.match(html, new RegExp(`<option value="${origin}">${origin}<\\/option>`));
  }
  assert.match(html, /data-registry-count aria-live="polite"/);
  assert.equal(count(/class="source-entry"/g), 76);
  assert.doesNotMatch(html, /class="source-entry"[^>]* hidden/);

  assert.equal(count(/data-case-view="circulation"/g), 7);
  assert.equal(count(/data-case-view="rights"/g), 7);
  assert.equal(count(/data-case-view="missingEvidence"/g), 7);
  assert.doesNotMatch(html, /role="tab(?:list|panel)?"|data-case-tab|class="case-view"[^>]* hidden/);
  assert.equal(count(/data-reveal/g), 12); // Three opening frames plus nine chapter conclusions.
});

test('fails closed when required DOM hooks are absent', () => {
  const documentElement = { dataset: { enhanced: 'true', reducedMotion: 'true' } };
  const incompleteDocument = {
    documentElement,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  assert.equal(initializeInteractions(incompleteDocument, {}), false);
  assert.equal('enhanced' in documentElement.dataset, false);
  assert.equal('reducedMotion' in documentElement.dataset, false);
});

test('keeps motion finite, short, compositor-safe, and reduced-motion final', () => {
  assert.doesNotMatch(interactions, /requestAnimationFrame|setInterval/);
  assert.doesNotMatch(styles, /animation-iteration-count\s*:\s*infinite/i);
  assert.doesNotMatch(styles, /@media\s*\(prefers-reduced-motion:[^}]+scroll-behavior/is);
  assert.match(styles, /html\[data-reduced-motion=['"]true['"]\][\s\S]*\.is-revealed/);

  const declarations = [...styles.matchAll(/transition\s*:\s*([^;]+);/gi)]
    .flatMap(([, declaration]) => declaration.split(','))
    .filter((declaration) => !/^\s*none\b/i.test(declaration));
  assert.ok(declarations.length >= 3, 'expected authored interaction transitions');
  for (const declaration of declarations) {
    const match = declaration.trim().match(/^(opacity|clip-path|transform)\s+(\d+)ms\b/i);
    assert.ok(match, `unsafe transition: ${declaration.trim()}`);
    const duration = Number(match[2]);
    assert.ok(duration >= 160 && duration <= 420, `transition duration ${duration}ms`);
  }
});

test('successfully wires tabs, filters, submit handling, observers, and dynamic reduced motion', () => {
  const fixture = createDomFixture();
  assert.equal(initializeInteractions(fixture.document, fixture.environment), true);
  assert.equal(fixture.document.documentElement.dataset.enhanced, 'true');
  assert.equal(fixture.registryControls.hidden, false);

  const tablists = fixture.document.querySelectorAll('[data-case-tabs]');
  const tabs = fixture.document.querySelectorAll('[data-case-tab]');
  const panels = fixture.document.querySelectorAll('[role="tabpanel"]');
  assert.equal(tablists.length, 7);
  assert.equal(tabs.length, 21);
  assert.equal(panels.length, 21);
  const ids = [...tabs, ...panels].map(({ id }) => id);
  assert.equal(new Set(ids).size, 42);

  const firstCase = fixture.cases[0];
  const firstTabs = firstCase.querySelectorAll('[data-case-tab]');
  const firstPanels = firstCase.querySelectorAll('[role="tabpanel"]');
  assert.deepEqual(firstTabs.map((tab) => tab.textContent), ['Circulation', 'Rights', 'Missing evidence']);
  assert.equal(firstTabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(firstTabs[0].tabIndex, 0);
  assert.equal(firstPanels[0].hidden, false);
  assert.equal(firstPanels[1].hidden, true);
  for (let index = 0; index < firstTabs.length; index += 1) {
    assert.equal(firstTabs[index].getAttribute('aria-controls'), firstPanels[index].id);
    assert.equal(firstPanels[index].getAttribute('aria-labelledby'), firstTabs[index].id);
  }

  firstTabs[1].dispatchEvent(new FakeEvent('click'));
  assert.equal(firstTabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(firstPanels[1].hidden, false);
  const right = new FakeEvent('keydown', { key: 'ArrowRight' });
  firstTabs[1].dispatchEvent(right);
  assert.equal(right.defaultPrevented, true);
  assert.equal(fixture.document.activeElement, firstTabs[2]);
  assert.equal(firstTabs[2].getAttribute('aria-selected'), 'true');
  const left = new FakeEvent('keydown', { key: 'ArrowLeft' });
  firstTabs[2].dispatchEvent(left);
  assert.equal(left.defaultPrevented, true);
  assert.equal(fixture.document.activeElement, firstTabs[1]);
  const home = new FakeEvent('keydown', { key: 'Home' });
  firstTabs[1].dispatchEvent(home);
  assert.equal(fixture.document.activeElement, firstTabs[0]);
  const end = new FakeEvent('keydown', { key: 'End' });
  firstTabs[0].dispatchEvent(end);
  assert.equal(fixture.document.activeElement, firstTabs[2]);
  const unhandled = new FakeEvent('keydown', { key: 'ArrowDown' });
  firstTabs[2].dispatchEvent(unhandled);
  assert.equal(unhandled.defaultPrevented, false);
  assert.equal(firstTabs[2].getAttribute('aria-selected'), 'true');

  fixture.sourceQuery.value = 'spotify';
  fixture.sourceQuery.dispatchEvent(new FakeEvent('input'));
  assert.deepEqual(fixture.sources.map(({ hidden }) => hidden), [false, true, true]);
  assert.equal(fixture.registryCount.textContent, 'Showing 1 of 3 sources');
  fixture.sourceQuery.value = '';
  fixture.sourceOrigin.value = 'Live research expansion';
  fixture.sourceOrigin.dispatchEvent(new FakeEvent('change'));
  assert.deepEqual(fixture.sources.map(({ hidden }) => hidden), [true, false, true]);
  fixture.sourceReset.dispatchEvent(new FakeEvent('click'));
  assert.deepEqual(fixture.sources.map(({ hidden }) => hidden), [false, false, false]);
  assert.equal(fixture.registryCount.textContent, 'Showing all 3 sources');
  assert.equal(fixture.document.activeElement, fixture.sourceQuery);

  fixture.sourceQuery.value = 'economic';
  const submit = new FakeEvent('submit');
  fixture.registryControls.dispatchEvent(submit);
  assert.equal(submit.defaultPrevented, true);
  assert.deepEqual(fixture.sources.map(({ hidden }) => hidden), [true, false, true]);
  assert.equal(fixture.document.activeElement, fixture.sourceQuery);

  assert.equal(fixture.Observer.instances.length, 3);
  fixture.Observer.instances[0].trigger(fixture.chapters[4], { top: 120 });
  assert.equal(fixture.chapterLinks.filter((link) => link.getAttribute('aria-current') === 'step').length, 1);
  assert.equal(fixture.chapterLinks[4].getAttribute('aria-current'), 'step');
  assert.equal(fixture.currentGroup.textContent, 'Side B — Value');
  fixture.Observer.instances[1].trigger(fixture.timelineEvents[2], { top: 120 });
  assert.equal(fixture.timelineEvents.filter(({ dataset }) => dataset.timelineActive === 'true').length, 1);
  assert.equal(fixture.timelineEvents[2].dataset.timelineActive, 'true');
  const revealTarget = fixture.revealTargets[0];
  fixture.Observer.instances[2].trigger(revealTarget);
  assert.equal(revealTarget.classList.contains('is-revealed'), true);
  assert.equal(fixture.Observer.instances[2].observed.has(revealTarget), false);

  fixture.mediaQuery.emit(true);
  assert.equal(fixture.document.documentElement.dataset.reducedMotion, 'true');
  assert.equal(fixture.revealTargets.every((target) => target.classList.contains('is-revealed')), true);
  fixture.mediaQuery.emit(false);
  assert.equal('reducedMotion' in fixture.document.documentElement.dataset, false);
});

test('uses complete final reveal states without IntersectionObserver and with initial reduced motion', () => {
  const noObserver = createDomFixture({ withObserver: false });
  assert.equal(initializeInteractions(noObserver.document, noObserver.environment), true);
  assert.equal(noObserver.revealTargets.every((target) => target.classList.contains('is-revealed')), true);

  const reduced = createDomFixture({ reducedMotion: true });
  assert.equal(initializeInteractions(reduced.document, reduced.environment), true);
  assert.equal(reduced.document.documentElement.dataset.reducedMotion, 'true');
  assert.equal(reduced.revealTargets.every((target) => target.classList.contains('is-revealed')), true);
  assert.equal(reduced.Observer.instances.length, 2);
});

test('rolls back partial initialization to the full static fallback', () => {
  const fixture = createDomFixture();
  fixture.caseViews[8].querySelector('h4').remove();
  assert.equal(initializeInteractions(fixture.document, fixture.environment), false);
  assertStaticFallback(fixture);
});

test('tears down a previous success before success-success reinitialization', () => {
  const fixture = createDomFixture();
  assert.equal(initializeInteractions(fixture.document, fixture.environment), true);
  const firstObservers = [...fixture.Observer.instances];
  firstObservers[0].throwOnDisconnect = true;
  assert.equal(initializeInteractions(fixture.document, fixture.environment), true);

  assert.equal(fixture.document.querySelectorAll('[data-case-tabs]').length, 7);
  const ids = fixture.document.querySelectorAll('[id]').map(({ id }) => id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(fixture.sourceQuery.listenerCount('input'), 1);
  assert.equal(fixture.registryControls.listenerCount('submit'), 1);
  assert.equal(fixture.mediaQuery.listenerCount('change'), 1);
  assert.equal(firstObservers.slice(1).every(({ disconnected }) => disconnected), true);
});

test('tears down a previous success before a failed reinitialization', () => {
  const fixture = createDomFixture();
  assert.equal(initializeInteractions(fixture.document, fixture.environment), true);
  const firstObservers = [...fixture.Observer.instances];
  fixture.sourceReset.remove();
  assert.equal(initializeInteractions(fixture.document, fixture.environment), false);
  assertStaticFallback(fixture);
  assert.equal(fixture.sourceQuery.listenerCount('input'), 0);
  assert.equal(fixture.registryControls.listenerCount('submit'), 0);
  assert.equal(fixture.mediaQuery.listenerCount('change'), 0);
  assert.equal(firstObservers.every(({ disconnected }) => disconnected), true);
});

test('forces every reveal target into a complete printable state', () => {
  const print = styles.slice(styles.indexOf('@media print'));
  const rule = print.match(/\.contact-frame,\s*\n\s*\.evidence-figure,\s*\n\s*\.case-pathway,\s*\n\s*\.chapter-conclusion\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(rule, /opacity:\s*1\s*!important/);
  assert.match(rule, /clip-path:\s*inset\(0\)\s*!important/);
  assert.match(rule, /transform:\s*none\s*!important/);
  assert.match(rule, /transition:\s*none\s*!important/);
  assert.match(print, /\.case-view\[hidden\]\s*\{[^}]*display:\s*block\s*!important/s);
});

function assertStaticFallback(fixture) {
  assert.equal('enhanced' in fixture.document.documentElement.dataset, false);
  assert.equal('reducedMotion' in fixture.document.documentElement.dataset, false);
  assert.equal(fixture.document.querySelectorAll('[data-case-tabs]').length, 0);
  assert.equal(fixture.caseViews.every((panel) => !panel.hidden), true);
  assert.equal(fixture.caseViews.every((panel) => panel.getAttribute('role') === null), true);
  assert.equal(fixture.sources.every((source) => !source.hidden), true);
  assert.equal(fixture.registryControls.hidden, true);
  assert.equal(fixture.chapterLinks.filter((link) => link.getAttribute('aria-current') === 'step').length, 1);
  assert.equal(fixture.timelineEvents.filter(({ dataset }) => dataset.timelineActive === 'true').length, 1);
}

class FakeEvent {
  constructor(type, { key } = {}) {
    this.type = type;
    this.key = key;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  setFrom(value) {
    this.values = new Set(String(value).split(/\s+/u).filter(Boolean));
  }

  toString() {
    return [...this.values].join(' ');
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.type = '';
    this._id = '';
    this._tabIndex = -1;
  }

  get className() {
    return this.classList.toString();
  }

  set className(value) {
    this.classList.setFrom(value);
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value);
    if (this._id) this.attributes.set('id', this._id);
    else this.attributes.delete('id');
  }

  get tabIndex() {
    return this._tabIndex;
  }

  set tabIndex(value) {
    this._tabIndex = Number(value);
    this.attributes.set('tabindex', String(value));
  }

  append(...children) {
    children.forEach((child) => {
      child.parentNode = this;
      this.children.push(child);
    });
  }

  insertBefore(child, reference) {
    const index = this.children.indexOf(reference);
    if (index < 0) throw new Error('reference node is not a child');
    child.parentNode = this;
    this.children.splice(index, 0, child);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'id') this._id = normalized;
    if (name === 'tabindex') this._tabIndex = Number(normalized);
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = normalized;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this._id = '';
    if (name === 'tabindex') this._tabIndex = -1;
    if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener.call(this, event);
    return !event.defaultPrevented;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const descendants = [];
    const visit = (element) => {
      element.children.forEach((child) => {
        descendants.push(child);
        visit(child);
      });
    };
    visit(this);
    return descendants.filter((element) => selector.split(',').some((part) => matchesSelector(element, part.trim())));
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this);
    this.activeElement = null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }
}

class FakeMediaQuery {
  constructor(matches) {
    this.matches = matches;
    this.listeners = new Set();
  }

  addEventListener(type, listener) {
    if (type === 'change') this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === 'change') this.listeners.delete(listener);
  }

  listenerCount(type) {
    return type === 'change' ? this.listeners.size : 0;
  }

  emit(matches) {
    this.matches = matches;
    [...this.listeners].forEach((listener) => listener({ matches }));
  }
}

function makeObserverClass() {
  return class FakeIntersectionObserver {
    static instances = [];

    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = new Set();
      this.disconnected = false;
      this.throwOnDisconnect = false;
      this.constructor.instances.push(this);
    }

    observe(target) {
      this.observed.add(target);
    }

    unobserve(target) {
      this.observed.delete(target);
    }

    disconnect() {
      if (this.throwOnDisconnect) throw new Error('synthetic disconnect failure');
      this.disconnected = true;
      this.observed.clear();
    }

    trigger(target, { isIntersecting = true, top = 0, ratio = 1 } = {}) {
      this.callback([{ target, isIntersecting, boundingClientRect: { top }, intersectionRatio: ratio }], this);
    }
  };
}

function createDomFixture({ withObserver = true, reducedMotion = false } = {}) {
  const document = new FakeDocument();
  const body = document.createElement('body');
  document.documentElement.append(body);
  const chapterNav = add(body, document, 'nav', { className: 'chapter-nav' });
  const currentGroup = add(chapterNav, document, 'p', { dataset: { currentGroup: '' }, textContent: 'Prelude' });
  add(chapterNav, document, 'span', { dataset: { signalPath: '' } });
  const chapterLinks = [];
  const chapters = [];
  for (let index = 0; index < 9; index += 1) {
    const number = String(index).padStart(2, '0');
    const link = add(chapterNav, document, 'a', { dataset: { chapterLink: number } });
    if (index === 0) link.setAttribute('aria-current', 'step');
    chapterLinks.push(link);
    chapters.push(add(body, document, 'section', { dataset: { chapter: number } }));
  }

  const timelineEvents = [];
  for (let index = 0; index < 3; index += 1) {
    const event = add(body, document, 'li', { dataset: { timelineEvent: String(index + 1) } });
    if (index === 0) event.dataset.timelineActive = 'true';
    timelineEvents.push(event);
  }

  const cases = [];
  const caseViews = [];
  for (let caseIndex = 0; caseIndex < 7; caseIndex += 1) {
    const caseElement = add(body, document, 'article', { className: 'case-pathway', dataset: { case: `case-${caseIndex + 1}` } });
    add(caseElement, document, 'h3', { textContent: `Case ${caseIndex + 1}` });
    const views = add(caseElement, document, 'div', { className: 'case-views' });
    [['circulation', 'Circulation'], ['rights', 'Rights'], ['missingEvidence', 'Missing evidence']].forEach(([view, label]) => {
      const panel = add(views, document, 'div', { className: 'case-view', dataset: { caseView: view } });
      add(panel, document, 'h4', { textContent: label });
      caseViews.push(panel);
    });
    cases.push(caseElement);
  }

  const registryControls = add(body, document, 'form', { dataset: { registryControls: '' }, hidden: true });
  const sourceQuery = add(registryControls, document, 'input', { dataset: { sourceQuery: '' }, value: '' });
  const sourceOrigin = add(registryControls, document, 'select', { dataset: { sourceOrigin: '' }, value: 'All sources' });
  const sourceReset = add(registryControls, document, 'button', { dataset: { sourceReset: '' } });
  const registryCount = add(body, document, 'p', { dataset: { registryCount: '' }, textContent: 'Showing all 3 sources' });
  const sourceRecords = [
    { sourceId: 'S001', origin: 'Starter archive', search: 'spotify launch platform desk pakistan entry no revenue' },
    { sourceId: 'L001', origin: 'Live research expansion', search: 'economic survey finance division broadband totals not music traffic' },
    { sourceId: 'S002', origin: 'Starter archive', search: 'rights note policy lab collection systems implementation unknown' },
  ];
  const sources = sourceRecords.map((record) => add(body, document, 'article', {
    className: 'source-entry',
    dataset: record,
  }));
  const contact = add(body, document, 'figure', { className: 'contact-frame', dataset: { reveal: '' } });
  const evidence = add(body, document, 'figure', { className: 'evidence-figure' });
  const conclusion = add(body, document, 'div', { className: 'chapter-conclusion', dataset: { reveal: '' } });
  const revealTargets = [contact, ...cases, evidence, conclusion];

  const mediaQuery = new FakeMediaQuery(reducedMotion);
  const Observer = makeObserverClass();
  const environment = {
    innerHeight: 800,
    matchMedia: () => mediaQuery,
    ...(withObserver ? { IntersectionObserver: Observer } : {}),
  };
  return {
    document,
    environment,
    Observer,
    mediaQuery,
    chapterLinks,
    chapters,
    currentGroup,
    timelineEvents,
    cases,
    caseViews,
    registryControls,
    sourceQuery,
    sourceOrigin,
    sourceReset,
    registryCount,
    sources,
    revealTargets,
  };
}

function add(parent, document, tagName, properties = {}) {
  const element = document.createElement(tagName);
  if (properties.className) element.className = properties.className;
  if (properties.dataset) Object.assign(element.dataset, properties.dataset);
  if ('textContent' in properties) element.textContent = properties.textContent;
  if ('value' in properties) element.value = properties.value;
  if ('hidden' in properties) element.hidden = properties.hidden;
  parent.append(element);
  return element;
}

function matchesSelector(element, selector) {
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  const attribute = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/u);
  if (attribute) {
    const [, name, expected] = attribute;
    const actual = name.startsWith('data-') ? element.dataset[dataKey(name)] : element.getAttribute(name);
    return actual !== undefined && actual !== null && (expected === undefined || actual === expected);
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function dataKey(attributeName) {
  return attributeName.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}
