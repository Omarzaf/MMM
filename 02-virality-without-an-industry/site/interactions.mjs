export const CHAPTER_GROUPS = Object.freeze({
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

const CASE_VIEWS = Object.freeze(['circulation', 'rights', 'missingEvidence']);
const ALL_SOURCES = 'All sources';
const ACTIVE_INTERACTIONS = new WeakMap();

export function getChapterGroup(number) {
  if (!Object.hasOwn(CHAPTER_GROUPS, number)) throw new Error(`unknown chapter: ${number}`);
  return CHAPTER_GROUPS[number];
}

export function filterSources(sources, query, origin) {
  if (!Array.isArray(sources)) throw new TypeError('sources must be an array');
  const needle = String(query ?? '').trim().toLocaleLowerCase('en');
  return sources.filter((source) => {
    const matchesOrigin = origin === ALL_SOURCES || source.origin === origin;
    const searchable = [source.title, source.organization, source.claimScope, source.limitation]
      .map((value) => String(value ?? '').toLocaleLowerCase('en'))
      .join(' ');
    return matchesOrigin && searchable.includes(needle);
  });
}

export function normalizeCaseView(value) {
  if (!CASE_VIEWS.includes(value)) throw new Error(`unknown case view: ${value}`);
  return value;
}

export function initializeInteractions(root, environment = globalThis) {
  const html = root?.documentElement;
  if (!html) return false;

  const previousTeardown = ACTIVE_INTERACTIONS.get(root);
  if (previousTeardown) previousTeardown();
  delete html.dataset.enhanced;
  delete html.dataset.reducedMotion;
  const cleanups = [];
  const observers = [];

  try {
    const hooks = collectHooks(root);
    const mediaQuery = typeof environment.matchMedia === 'function'
      ? environment.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const reducedMotion = Boolean(mediaQuery?.matches);

    if (reducedMotion) html.dataset.reducedMotion = 'true';
    setupCaseTabs(root, hooks.cases, cleanups);
    setupRegistry(hooks, cleanups);
    setupThemeToggle(root, environment, cleanups);
    setCurrentChapter(hooks, hooks.currentLink.dataset.chapterLink);

    const revealTargets = Array.from(root.querySelectorAll(
      '[data-reveal], .evidence-figure, .case-pathway',
    ));
    setupObservers({
      environment,
      hooks,
      revealTargets,
      reducedMotion,
      observers,
    });

    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
      const handleMotionChange = ({ matches }) => {
        if (matches) {
          html.dataset.reducedMotion = 'true';
          revealTargets.forEach((target) => target.classList.add('is-revealed'));
        } else {
          delete html.dataset.reducedMotion;
        }
      };
      mediaQuery.addEventListener('change', handleMotionChange);
      cleanups.push(() => mediaQuery.removeEventListener('change', handleMotionChange));
    }

    hooks.registryControls.hidden = false;
    html.dataset.enhanced = 'true';
    let active = true;
    const teardown = () => {
      if (!active) return;
      active = false;
      teardownState(root, html, cleanups, observers);
      if (ACTIVE_INTERACTIONS.get(root) === teardown) ACTIVE_INTERACTIONS.delete(root);
    };
    ACTIVE_INTERACTIONS.set(root, teardown);
    return true;
  } catch {
    teardownState(root, html, cleanups, observers);
    return false;
  }
}

function teardownState(root, html, cleanups, observers) {
  delete html.dataset.enhanced;
  delete html.dataset.reducedMotion;
  observers.forEach((observer) => {
    try { observer.disconnect(); } catch { /* Continue tearing down remaining observers. */ }
  });
  [...cleanups].reverse().forEach((cleanup) => {
    try { cleanup(); } catch { /* Continue restoring the remaining static state. */ }
  });
  try { restoreStaticState(root); } catch { /* Enhancement flags are already removed. */ }
}

function setupThemeToggle(root, environment, cleanups) {
  const button = root.querySelector('[data-theme-toggle]');
  if (!button) return;
  const html = root.documentElement;
  const storageKey = 'lln-theme';
  const media = typeof environment.matchMedia === 'function'
    ? environment.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const readStored = () => {
    try {
      const value = environment.localStorage?.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch { return null; }
  };
  const writeStored = (value) => {
    try { environment.localStorage?.setItem(storageKey, value); } catch { /* storage unavailable */ }
  };
  const systemTheme = () => (media?.matches ? 'dark' : 'light');
  const effectiveTheme = () => (html.dataset.theme === 'light' || html.dataset.theme === 'dark'
    ? html.dataset.theme
    : systemTheme());
  const reflect = (theme) => {
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.textContent = theme === 'dark' ? 'Light' : 'Dark';
  };
  const apply = (theme) => {
    html.dataset.theme = theme;
    reflect(theme);
  };
  const stored = readStored();
  if (stored) apply(stored);
  else reflect(systemTheme());
  button.hidden = false;
  const handleClick = () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    apply(next);
    writeStored(next);
  };
  button.addEventListener('click', handleClick);
  cleanups.push(() => {
    button.removeEventListener('click', handleClick);
    button.hidden = true;
  });
  if (media && typeof media.addEventListener === 'function') {
    const handleSystem = () => { if (!readStored()) reflect(systemTheme()); };
    media.addEventListener('change', handleSystem);
    cleanups.push(() => media.removeEventListener('change', handleSystem));
  }
}

function collectHooks(root) {
  const chapterNav = root.querySelector('.chapter-nav');
  const currentGroup = root.querySelector('[data-current-group]');
  const signalPath = root.querySelector('[data-signal-path]');
  const chapterLinks = Array.from(root.querySelectorAll('[data-chapter-link]'));
  const chapters = Array.from(root.querySelectorAll('[data-chapter]'));
  const timelineEvents = Array.from(root.querySelectorAll('[data-timeline-event]'));
  const cases = Array.from(root.querySelectorAll('[data-case]'));
  const registryControls = root.querySelector('[data-registry-controls]');
  const sourceQuery = root.querySelector('[data-source-query]');
  const sourceOrigin = root.querySelector('[data-source-origin]');
  const sourceReset = root.querySelector('[data-source-reset]');
  const registryCount = root.querySelector('[data-registry-count]');
  const sourceEntries = Array.from(root.querySelectorAll('[data-source-id]'));
  const currentLink = chapterLinks.find((link) => link.getAttribute('aria-current') === 'step')
    ?? chapterLinks[0];

  if (!chapterNav || !currentGroup || !signalPath || !registryControls || !sourceQuery
    || !sourceOrigin || !sourceReset || !registryCount || !currentLink
    || chapterLinks.length !== 9 || chapters.length !== 9 || timelineEvents.length === 0
    || cases.length !== 7 || sourceEntries.length === 0) {
    throw new Error('required interaction hooks are missing');
  }

  const chapterNumbers = chapters.map(({ dataset }) => dataset.chapter);
  const linkNumbers = chapterLinks.map(({ dataset }) => dataset.chapterLink);
  if (chapterNumbers.some((number, index) => number !== String(index).padStart(2, '0'))
    || linkNumbers.some((number, index) => number !== chapterNumbers[index])) {
    throw new Error('chapter interaction hooks are out of order');
  }

  for (const caseElement of cases) {
    const views = Array.from(caseElement.querySelectorAll('[data-case-view]'));
    if (views.length !== CASE_VIEWS.length
      || views.some((view, index) => view.dataset.caseView !== CASE_VIEWS[index])) {
      throw new Error('case views must retain their canonical order');
    }
  }

  return {
    chapterNav,
    currentGroup,
    signalPath,
    chapterLinks,
    chapters,
    timelineEvents,
    cases,
    registryControls,
    sourceQuery,
    sourceOrigin,
    sourceReset,
    registryCount,
    sourceEntries,
    currentLink,
  };
}

function setupCaseTabs(root, cases, cleanups) {
  for (const caseElement of cases) {
    const caseId = caseElement.dataset.case;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(caseId)) throw new Error('case ID cannot form safe tab IDs');
    const viewsContainer = caseElement.querySelector('.case-views');
    const views = Array.from(caseElement.querySelectorAll('[data-case-view]'));
    const caseHeading = caseElement.querySelector('h3');
    if (!viewsContainer || !caseHeading) throw new Error('case tab hooks are incomplete');

    const tablist = root.createElement('div');
    tablist.className = 'case-tabs';
    tablist.dataset.caseTabs = caseId;
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', `${caseHeading.textContent.trim()} views`);
    const tabs = [];

    views.forEach((panel, index) => {
      const view = normalizeCaseView(panel.dataset.caseView);
      const label = panel.querySelector('h4');
      if (!label?.textContent.trim()) throw new Error('case view label is missing');
      const tabId = `case-${caseId}-${view}-tab`;
      const panelId = `case-${caseId}-${view}-panel`;
      const tab = root.createElement('button');
      tab.type = 'button';
      tab.id = tabId;
      tab.dataset.caseTab = view;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.textContent = label.textContent.trim();
      tablist.append(tab);

      panel.id = panelId;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.tabIndex = 0;
      label.setAttribute('aria-hidden', 'true');
      tabs.push(tab);
      setSelectedState(tab, panel, index === 0);
    });

    viewsContainer.parentNode.insertBefore(tablist, viewsContainer);
    const activate = (view) => {
      const normalized = normalizeCaseView(view);
      caseElement.dataset.caseActiveView = normalized;
      views.forEach((panel, index) => setSelectedState(
        tabs[index],
        panel,
        panel.dataset.caseView === normalized,
      ));
    };
    activate(CASE_VIEWS[0]);

    tabs.forEach((tab, index) => {
      const handleClick = () => activate(tab.dataset.caseTab);
      const handleKeydown = (event) => {
        const nextIndex = keyboardTabIndex(index, event.key, tabs.length);
        if (nextIndex === null) return;
        event.preventDefault();
        activate(tabs[nextIndex].dataset.caseTab);
        tabs[nextIndex].focus();
      };
      tab.addEventListener('click', handleClick);
      tab.addEventListener('keydown', handleKeydown);
      cleanups.push(() => {
        tab.removeEventListener('click', handleClick);
        tab.removeEventListener('keydown', handleKeydown);
      });
    });

    cleanups.push(() => {
      tablist.remove();
      delete caseElement.dataset.caseActiveView;
      views.forEach((panel) => {
        panel.hidden = false;
        panel.removeAttribute('id');
        panel.removeAttribute('role');
        panel.removeAttribute('aria-labelledby');
        panel.removeAttribute('tabindex');
        panel.querySelector('h4')?.removeAttribute('aria-hidden');
      });
    });
  }
}

function setSelectedState(tab, panel, selected) {
  tab.setAttribute('aria-selected', String(selected));
  tab.tabIndex = selected ? 0 : -1;
  panel.hidden = !selected;
}

function keyboardTabIndex(index, key, length) {
  if (key === 'ArrowRight') return (index + 1) % length;
  if (key === 'ArrowLeft') return (index - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

function setupRegistry(hooks, cleanups) {
  const applyFilters = () => {
    const query = hooks.sourceQuery.value.trim().toLocaleLowerCase('en');
    const origin = hooks.sourceOrigin.value;
    let visible = 0;
    for (const entry of hooks.sourceEntries) {
      const matchesQuery = entry.dataset.search.includes(query);
      const matchesOrigin = origin === ALL_SOURCES || entry.dataset.origin === origin;
      entry.hidden = !(matchesQuery && matchesOrigin);
      if (!entry.hidden) visible += 1;
    }
    hooks.registryCount.textContent = visible === hooks.sourceEntries.length
      ? `Showing all ${visible} sources`
      : visible === 0
        ? `No matching sources · Showing 0 of ${hooks.sourceEntries.length} sources`
        : `Showing ${visible} of ${hooks.sourceEntries.length} sources`;
  };
  const resetFilters = () => {
    hooks.sourceQuery.value = '';
    hooks.sourceOrigin.value = ALL_SOURCES;
    applyFilters();
    hooks.sourceQuery.focus();
  };
  const submitFilters = (event) => {
    event.preventDefault();
    applyFilters();
    hooks.sourceQuery.focus();
  };

  hooks.sourceQuery.addEventListener('input', applyFilters);
  hooks.sourceOrigin.addEventListener('change', applyFilters);
  hooks.sourceReset.addEventListener('click', resetFilters);
  hooks.registryControls.addEventListener('submit', submitFilters);
  cleanups.push(() => {
    hooks.sourceQuery.removeEventListener('input', applyFilters);
    hooks.sourceOrigin.removeEventListener('change', applyFilters);
    hooks.sourceReset.removeEventListener('click', resetFilters);
    hooks.registryControls.removeEventListener('submit', submitFilters);
  });
  applyFilters();
}

function setupObservers({ environment, hooks, revealTargets, reducedMotion, observers }) {
  const Observer = environment.IntersectionObserver;
  if (typeof Observer !== 'function') {
    revealTargets.forEach((target) => target.classList.add('is-revealed'));
    return;
  }

  const chapterObserver = focusObserver(Observer, environment, (chapter) => {
    setCurrentChapter(hooks, chapter.dataset.chapter);
  }, '-18% 0px -64% 0px');
  hooks.chapters.forEach((chapter) => chapterObserver.observe(chapter));
  observers.push(chapterObserver);

  const timelineObserver = focusObserver(Observer, environment, (event) => {
    hooks.timelineEvents.forEach((item) => {
      if (item === event) item.dataset.timelineActive = 'true';
      else delete item.dataset.timelineActive;
    });
  }, '-25% 0px -55% 0px');
  hooks.timelineEvents.forEach((event) => timelineObserver.observe(event));
  observers.push(timelineObserver);

  if (reducedMotion) {
    revealTargets.forEach((target) => target.classList.add('is-revealed'));
    return;
  }

  const revealObserver = new Observer((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  revealTargets.filter((target) => !target.classList.contains('is-revealed'))
    .forEach((target) => revealObserver.observe(target));
  observers.push(revealObserver);
}

function focusObserver(Observer, environment, onActive, rootMargin) {
  const states = new Map();
  return new Observer((entries) => {
    entries.forEach((entry) => states.set(entry.target, entry));
    const readingLine = (environment.innerHeight ?? 800) * 0.3;
    const visible = Array.from(states.values()).filter(({ isIntersecting }) => isIntersecting);
    visible.sort((left, right) => {
      const distance = Math.abs(left.boundingClientRect.top - readingLine)
        - Math.abs(right.boundingClientRect.top - readingLine);
      return distance || right.intersectionRatio - left.intersectionRatio;
    });
    if (visible[0]) onActive(visible[0].target);
  }, { rootMargin, threshold: [0, 0.15, 0.35, 0.65] });
}

function setCurrentChapter(hooks, number) {
  const link = hooks.chapterLinks.find((candidate) => candidate.dataset.chapterLink === number)
    ?? hooks.chapterLinks[0];
  hooks.chapterLinks.forEach((candidate) => candidate.removeAttribute('aria-current'));
  link.setAttribute('aria-current', 'step');
  hooks.currentGroup.textContent = getChapterGroup(link.dataset.chapterLink);
  const index = hooks.chapterLinks.indexOf(link);
  hooks.chapterNav.style.setProperty('--signal-progress', String((index + 1) / hooks.chapterLinks.length));
}

function restoreStaticState(root) {
  const html = root.documentElement;
  delete html.dataset.enhanced;
  delete html.dataset.reducedMotion;
  root.querySelectorAll('[data-case-tabs]').forEach((tablist) => tablist.remove());
  root.querySelectorAll('[data-case]').forEach((caseElement) => delete caseElement.dataset.caseActiveView);
  root.querySelectorAll('[data-case-view]').forEach((panel) => {
    panel.hidden = false;
    panel.removeAttribute('id');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-labelledby');
    panel.removeAttribute('tabindex');
    panel.querySelector('h4')?.removeAttribute('aria-hidden');
  });
  root.querySelectorAll('[data-source-id]').forEach((entry) => { entry.hidden = false; });
  const controls = root.querySelector('[data-registry-controls]');
  if (controls) controls.hidden = true;
  const entries = root.querySelectorAll('[data-source-id]');
  const count = root.querySelector('[data-registry-count]');
  if (count) count.textContent = `Showing all ${entries.length} sources`;
  const links = Array.from(root.querySelectorAll('[data-chapter-link]'));
  links.forEach((link) => link.removeAttribute('aria-current'));
  links[0]?.setAttribute('aria-current', 'step');
  const timelineEvents = Array.from(root.querySelectorAll('[data-timeline-event]'));
  timelineEvents.forEach((event) => delete event.dataset.timelineActive);
  if (timelineEvents[0]) timelineEvents[0].dataset.timelineActive = 'true';
  root.querySelectorAll('.is-revealed').forEach((target) => target.classList.remove('is-revealed'));
  root.querySelector('.chapter-nav')?.style.removeProperty('--signal-progress');
}

if (typeof document !== 'undefined') {
  const start = () => initializeInteractions(document, globalThis);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
