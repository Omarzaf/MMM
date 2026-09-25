import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startPreviewServer } from './serve-preview.mjs';

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REQUIRED_CHAPTERS = Object.freeze(['00', '01', '02', '03', '04', '05', '06', '07', '08']);
export const REQUIRED_GROUPS = Object.freeze([
  'Prelude',
  'Side A — Circulation',
  'Side B — Value',
  'Liner Notes',
]);
export const REQUIRED_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 1000 }),
  Object.freeze({ width: 820, height: 1024 }),
  Object.freeze({ width: 390, height: 844 }),
]);

export function screenshotPathFor(width, height) {
  if (!REQUIRED_VIEWPORTS.some((viewport) => viewport.width === width && viewport.height === height)) {
    throw new Error(`unsupported viewport: ${width}x${height}`);
  }
  return `artifacts/qa/living-liner-notes-${width}x${height}.png`;
}

export function isRenderedBoxVisible({ display, visibility, opacity, width, height }) {
  return display !== 'none' && visibility !== 'hidden' && Number(opacity) !== 0
    && width > 0 && height > 0;
}

export function summarizeControlSnapshots(controls) {
  if (!Array.isArray(controls) || controls.length === 0) {
    return {
      hiddenCriticalControls: ['No critical controls found'],
      unreachableCriticalControls: ['No critical controls found'],
      minimumControlHeight: 0,
    };
  }
  const hiddenCriticalControls = controls.filter((control) => !isRenderedBoxVisible(control))
    .map(({ label }) => label);
  const unreachableCriticalControls = controls.filter((control) => control.disabled
    || (control.tabIndex < 0 && !(control.role === 'tab' && control.tablistHasTabStop)))
    .map(({ label }) => label);
  const visibleHeights = controls.filter(isRenderedBoxVisible).map(({ height }) => height);
  return {
    hiddenCriticalControls,
    unreachableCriticalControls,
    minimumControlHeight: visibleHeights.length ? Math.min(...visibleHeights) : 0,
  };
}

export function validateBrowserReport(report) {
  const issues = [];
  if (!report || typeof report !== 'object') throw new TypeError('browser report must be an object');
  if (!String(report.chromeVersion ?? '').includes('Chrome')) issues.push('Chrome version is missing');

  if (!Array.isArray(report.viewports) || report.viewports.length !== REQUIRED_VIEWPORTS.length) {
    issues.push('expected exactly the three required viewport reports');
  } else {
    REQUIRED_VIEWPORTS.forEach(({ width, height }, index) => {
      const viewport = report.viewports[index] ?? {};
      const label = `${width}x${height}`;
      if (viewport.width !== width || viewport.height !== height) {
        issues.push(`${label}: viewport order or dimensions drifted`);
      }
      if (viewport.screenshotPath !== screenshotPathFor(width, height)) {
        issues.push(`${label}: screenshot path drifted`);
      }
      if (!(viewport.screenshotBytes > 0)) issues.push(`${label}: screenshot is empty`);
      if (viewport.screenshotWidth !== width || viewport.screenshotHeight !== height) {
        issues.push(`${label}: screenshot dimensions drifted`);
      }
      if (viewport.enhanced !== true) issues.push(`${label}: data-enhanced is not true`);
      if (!sameArray(viewport.chapters, REQUIRED_CHAPTERS)) {
        issues.push(`${label}: expected chapters 00 through 08`);
      }
      if (!sameArray(viewport.groups, REQUIRED_GROUPS)) {
        issues.push(`${label}: expected the four grouping labels`);
      }
      if (viewport.sourceCount !== 76 || viewport.sourceCountText !== 'Showing all 76 sources') {
        issues.push(`${label}: expected the live count for 76 source rows`);
      }
      if (viewport.consoleErrors?.length) issues.push(`${label}: console errors: ${viewport.consoleErrors.join(' | ')}`);
      if (viewport.runtimeErrors?.length) issues.push(`${label}: runtime errors: ${viewport.runtimeErrors.join(' | ')}`);
      if (viewport.horizontalOverflow) issues.push(`${label}: document-level horizontal overflow`);
      if (viewport.heroContactOverlapPixels > 1) {
        issues.push(`${label}: contact sheet overlaps the hero headline by ${viewport.heroContactOverlapPixels}px`);
      }
      if (viewport.heroHeadlineOverflowPixels > 1) {
        issues.push(`${label}: hero headline overflows its column by ${viewport.heroHeadlineOverflowPixels}px`);
      }
      if (width === 1440 && viewport.heroFirstRowImbalancePixels > 48) {
        issues.push(`${label}: hero first row leaves a ${viewport.heroFirstRowImbalancePixels}px dead zone below the contact sheet`);
      }
      if (width === 1440 && viewport.chapterNavOverflowing) {
        issues.push(`${label}: desktop chapter navigation is clipped`);
      }
      if (width === 1440 && viewport.heroHeadlineLineCount !== 3) {
        issues.push(`${label}: headline must use three lines in the desktop editorial grid`);
      }
      if (viewport.hiddenCriticalControls?.length) {
        issues.push(`${label}: hidden critical controls: ${viewport.hiddenCriticalControls.join(', ')}`);
      }
      if (viewport.unreachableCriticalControls?.length) {
        issues.push(`${label}: unreachable critical controls: ${viewport.unreachableCriticalControls.join(', ')}`);
      }
      if (!viewport.focusIndicatorVisible) issues.push(`${label}: visible focus indicator is missing`);
      if (!viewport.keyboardCaseTabWorks) issues.push(`${label}: keyboard case tabs do not work`);
      if (!viewport.keyboardSourceFilterWorks) issues.push(`${label}: keyboard source filter does not work`);
      if (width === 390 && viewport.minimumControlHeight < 44) {
        issues.push(`${label}: critical mobile controls must be at least 44 CSS px high`);
      }
      if (width === 820 && viewport.minimumControlHeight < 44) {
        issues.push(`${label}: critical tablet controls must be at least 44 CSS px high`);
      }
      if (width === 390 && viewport.stickyNavHeightRatio > 0.15) {
        issues.push(`${label}: sticky navigation exceeds 15% of viewport height`);
      }
    });
  }

  const reduced = report.reducedMotion ?? {};
  if (!reduced.enhanced || !reduced.reducedMotion) issues.push('reduced motion: enhancement flags are missing');
  if (reduced.unrevealedCount !== 0) issues.push('reduced motion: final reveal state is incomplete');
  if (reduced.animationCount !== 0) issues.push('reduced motion: active animations remain');
  if (reduced.stagedTransitionCount !== 0) issues.push('reduced motion: staged transitions remain');
  if (reduced.signalTransitionSeconds !== 0) issues.push('reduced motion: signal travel remains');
  appendStateErrors(issues, 'reduced motion', reduced);

  const noJavaScript = report.noJavaScript ?? {};
  if (noJavaScript.enhanced !== false) issues.push('no JavaScript: document unexpectedly enhanced');
  if (noJavaScript.chapters !== 9) issues.push('no JavaScript: expected nine chapters');
  if (noJavaScript.cases !== 7) issues.push('no JavaScript: expected seven case pathways');
  if (noJavaScript.caseViews !== 21 || noJavaScript.hiddenCaseViews !== 0) {
    issues.push('no JavaScript: expected 21 visible case views');
  }
  if (noJavaScript.figureSummaries !== 13 || noJavaScript.hiddenFigureSummaries !== 0) {
    issues.push('no JavaScript: expected 13 visible figure summaries');
  }
  if (noJavaScript.sourceRows !== 76 || noJavaScript.hiddenSourceRows !== 0) {
    issues.push('no JavaScript: expected 76 visible source rows');
  }
  if (noJavaScript.downloads !== 11 || noJavaScript.hiddenDownloads !== 0) {
    issues.push('no JavaScript: expected 11 visible downloads');
  }
  appendStateErrors(issues, 'no JavaScript', noJavaScript);

  const print = report.print ?? {};
  if (print.numberedHeadings !== 9 || print.hiddenNumberedHeadings !== 0) {
    issues.push('print: expected nine visible numbered headings');
  }
  if (print.captions !== 16 || print.hiddenCaptions !== 0) issues.push('print: expected 16 visible captions');
  if (print.sourceIds !== 76) issues.push('print: expected 76 visible source IDs');
  if (print.evidenceNotes !== 9) issues.push('print: expected nine visible evidence notes');
  if (print.externalLinks < 1 || print.printableExternalLinks !== print.externalLinks) {
    issues.push('print: expected printable URLs for every external link');
  }
  if (print.interactiveControlsVisible !== 0) issues.push('print: expected interactive controls omitted');
  if (print.hiddenCaseViews !== 0) issues.push('print: expected every case view visible');
  if (!(print.pdfBytes > 100)) issues.push('print: generated PDF is empty');
  appendStateErrors(issues, 'print', print);

  if (issues.length) throw new Error(`BROWSER_SMOKE_FAILED:\n- ${issues.join('\n- ')}`);
  return report;
}

export async function runBrowserSmoke({ rootDir = process.cwd(), chromeBin = process.env.CHROME_BIN } = {}) {
  const projectRoot = resolve(rootDir);
  const browserPath = resolveChrome(chromeBin);
  const versionResult = spawnSync(browserPath, ['--version'], { encoding: 'utf8' });
  if (versionResult.status !== 0) throw new Error(`Chrome version check failed: ${versionResult.stderr.trim()}`);
  const chromeVersion = versionResult.stdout.trim();
  const { server, url } = await startPreviewServer({ rootDir: projectRoot, host: '127.0.0.1', port: 0 });
  let chrome;
  try {
    chrome = await launchChrome(browserPath);
    const cdp = chrome.cdp;
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('DOM.enable'),
    ]);
    const browserErrors = collectBrowserErrors(cdp);
    mkdirSync(resolve(projectRoot, 'artifacts/qa'), { recursive: true });

    const viewports = [];
    for (const viewport of REQUIRED_VIEWPORTS) {
      browserErrors.clear();
      await setViewport(cdp, viewport);
      await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] });
      await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
      await navigate(cdp, url);
      await waitFor(cdp, 'document.documentElement.dataset.enhanced === "true" && Array.from(document.images).every((image) => image.complete)');
      await delay(450);
      const snapshot = await evaluate(cdp, viewportSnapshotExpression());
      const controlSummary = summarizeControlSnapshots(snapshot.controlSnapshots);
      delete snapshot.controlSnapshots;
      const screenshotPath = screenshotPathFor(viewport.width, viewport.height);
      const absoluteScreenshotPath = resolve(projectRoot, screenshotPath);
      const screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 1 },
      });
      writeFileSync(absoluteScreenshotPath, Buffer.from(screenshot.data, 'base64'));
      const dimensions = readPngDimensions(absoluteScreenshotPath);
      const interactions = await verifyKeyboardInteractions(cdp);
      viewports.push({
        ...viewport,
        screenshotPath,
        screenshotBytes: statSync(absoluteScreenshotPath).size,
        screenshotWidth: dimensions.width,
        screenshotHeight: dimensions.height,
        ...snapshot,
        ...controlSummary,
        ...browserErrors.snapshot(),
        ...interactions,
      });
    }

    browserErrors.clear();
    await setViewport(cdp, REQUIRED_VIEWPORTS[0]);
    await cdp.send('Emulation.setEmulatedMedia', {
      media: '',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
    await navigate(cdp, url);
    await waitFor(cdp, 'document.documentElement.dataset.reducedMotion === "true"');
    await delay(100);
    const reducedMotion = {
      ...await evaluate(cdp, reducedMotionExpression()),
      ...browserErrors.snapshot(),
    };

    browserErrors.clear();
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] });
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
    await navigate(cdp, url);
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
    const noJavaScript = {
      ...await evaluate(cdp, noJavaScriptExpression()),
      ...browserErrors.snapshot(),
    };

    browserErrors.clear();
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print', features: [] });
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
    await navigate(cdp, url);
    await waitFor(cdp, 'document.documentElement.dataset.enhanced === "true"');
    const printState = await evaluate(cdp, printExpression());
    const pdf = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
    });
    const print = {
      ...printState,
      pdfBytes: Buffer.from(pdf.data, 'base64').length,
      ...browserErrors.snapshot(),
    };

    const report = validateBrowserReport({
      chromeVersion,
      viewports,
      reducedMotion,
      noJavaScript,
      print,
    });
    return report;
  } finally {
    await stopChrome(chrome);
    server.closeAllConnections?.();
    await new Promise((resolveClose) => server.close(() => resolveClose()));
  }
}

function resolveChrome(chromeBin) {
  const candidate = chromeBin ? resolve(chromeBin) : DEFAULT_CHROME;
  if (!existsSync(candidate)) throw new Error(`Chrome executable not found: ${candidate}`);
  return candidate;
}

async function launchChrome(browserPath) {
  const profileDir = mkdtempSync(join(tmpdir(), 'hiphop-browser-smoke-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-proxy-server',
    '--force-color-profile=srgb',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
  const processHandle = spawn(browserPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  processHandle.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-16_384);
  });
  try {
    const port = await waitForDevToolsPort(profileDir, processHandle);
    const targets = await waitForTargetList(port);
    const target = targets.find(({ type }) => type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a page target');
    const cdp = await CdpSession.connect(target.webSocketDebuggerUrl);
    return { processHandle, profileDir, cdp };
  } catch (error) {
    processHandle.kill('SIGTERM');
    rmSync(profileDir, { recursive: true, force: true });
    throw new Error(`${error instanceof Error ? error.message : String(error)}${stderr ? `\n${stderr}` : ''}`);
  }
}

async function stopChrome(chrome) {
  if (!chrome) return;
  try { chrome.cdp.close(); } catch { /* The browser may already have closed the socket. */ }
  if (chrome.processHandle.exitCode === null && !chrome.processHandle.killed) {
    chrome.processHandle.kill('SIGTERM');
  }
  await Promise.race([
    new Promise((resolveExit) => chrome.processHandle.once('exit', resolveExit)),
    delay(2000),
  ]);
  if (chrome.processHandle.exitCode === null) chrome.processHandle.kill('SIGKILL');
  rmSync(chrome.profileDir, { recursive: true, force: true });
}

async function waitForDevToolsPort(profileDir, processHandle) {
  const activePortFile = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error(`Chrome exited before DevTools started (${processHandle.exitCode})`);
    if (existsSync(activePortFile)) {
      const [port] = readFileSync(activePortFile, 'utf8').trim().split('\n');
      if (/^\d+$/u.test(port)) return Number(port);
    }
    await delay(50);
  }
  throw new Error('Timed out waiting for Chrome DevTools');
}

async function waitForTargetList(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        if (Array.isArray(targets) && targets.length) return targets;
      }
    } catch { /* Chrome can expose the port before the JSON endpoint is ready. */ }
    await delay(50);
  }
  throw new Error('Timed out waiting for a Chrome page target');
}

class CdpSession {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    return new CdpSession(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', ({ data }) => this.#receive(JSON.parse(data)));
    socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  once(method, timeoutMs = 10_000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timeout = setTimeout(() => {
        cleanup();
        rejectEvent(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const cleanup = this.on(method, (params) => {
        clearTimeout(timeout);
        cleanup();
        resolveEvent(params);
      });
    });
  }

  close() {
    this.socket.close();
  }

  #receive(message) {
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
      else pending.resolve(message.result ?? {});
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }
}

function collectBrowserErrors(cdp) {
  let consoleErrors = [];
  let runtimeErrors = [];
  cdp.on('Runtime.consoleAPICalled', ({ type, args = [] }) => {
    if (type !== 'error' && type !== 'assert') return;
    consoleErrors.push(args.map(({ value, description }) => String(value ?? description ?? '')).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? 'Runtime exception');
  });
  cdp.on('Inspector.targetCrashed', () => runtimeErrors.push('Chrome target crashed'));
  return {
    clear() {
      consoleErrors = [];
      runtimeErrors = [];
    },
    snapshot() {
      return { consoleErrors: [...consoleErrors], runtimeErrors: [...runtimeErrors] };
    },
  };
}

async function setViewport(cdp, { width, height }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    screenWidth: width,
    screenHeight: height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function navigate(cdp, url) {
  const loaded = cdp.once('Page.loadEventFired');
  const result = await cdp.send('Page.navigate', { url });
  if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
  await loaded;
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitFor(cdp, condition, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${condition})`)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for browser condition: ${condition}`);
}

async function verifyKeyboardInteractions(cdp) {
  await evaluate(cdp, `(() => {
    window.scrollTo(0, 0);
    document.activeElement?.blur();
    return true;
  })()`);
  await dispatchKey(cdp, 'Tab', 'Tab', 9);
  const focusIndicatorVisible = await evaluate(cdp, `(() => {
    const element = document.activeElement;
    if (!element?.classList.contains('skip-link') || !element.matches(':focus-visible')) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 && rect.top >= 0;
  })()`);

  await evaluate(cdp, `(() => {
    const first = document.querySelector('.case-tabs [role="tab"]');
    first?.focus();
    return Boolean(first);
  })()`);
  await dispatchKey(cdp, 'ArrowRight', 'ArrowRight', 39);
  const keyboardCaseTabWorks = await evaluate(cdp, `(() => {
    const active = document.activeElement;
    return active?.matches('.case-tabs [role="tab"]')
      && active.dataset.caseTab === 'rights'
      && active.getAttribute('aria-selected') === 'true';
  })()`);

  await evaluate(cdp, `(() => {
    const query = document.querySelector('[data-source-query]');
    query.value = '';
    query.focus();
    return true;
  })()`);
  await cdp.send('Input.insertText', { text: 'Spotify' });
  await delay(50);
  const keyboardSourceFilterWorks = await evaluate(cdp, `(() => {
    const visible = Array.from(document.querySelectorAll('[data-source-id]')).filter((entry) => !entry.hidden).length;
    const count = document.querySelector('[data-registry-count]')?.textContent.trim() ?? '';
    return document.activeElement?.matches('[data-source-query]') && visible > 0 && visible < 76
      && count === 'Showing ' + visible + ' of 76 sources';
  })()`);
  return { focusIndicatorVisible, keyboardCaseTabWorks, keyboardSourceFilterWorks };
}

async function dispatchKey(cdp, key, code, windowsVirtualKeyCode) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

function viewportSnapshotExpression() {
  return `(() => {
    const controls = Array.from(document.querySelectorAll(
      '.chapter-nav [data-chapter-link], .case-tabs button, [data-source-query], [data-source-origin], [data-source-reset]'
    ));
    const label = (element) => element.getAttribute('aria-label') || element.textContent.trim() || element.id || element.tagName;
    const controlSnapshots = controls.map((element) => {
      const style = getComputedStyle(element);
      const ownRect = element.getBoundingClientRect();
      const descendantRects = Array.from(element.children, (child) => child.getBoundingClientRect());
      return {
        label: label(element),
        hidden: element.hidden,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        width: Math.max(ownRect.width, ...descendantRects.map(({ width }) => width), 0),
        height: Math.max(ownRect.height, ...descendantRects.map(({ height }) => height), 0),
        tabIndex: element.tabIndex,
        disabled: Boolean(element.disabled),
        role: element.getAttribute('role') ?? '',
        tablistHasTabStop: Boolean(element.closest('[role="tablist"]')?.querySelector('[role="tab"][tabindex="0"]')),
      };
    });
    const sourceCountText = document.querySelector('[data-registry-count]')?.textContent.trim() ?? '';
    const nav = document.querySelector('.chapter-nav')?.getBoundingClientRect();
    const navList = document.querySelector('.chapter-nav ol');
    const headlineElement = document.querySelector('.hero-copy h1');
    const heroCopy = document.querySelector('.hero-copy')?.getBoundingClientRect();
    const headline = headlineElement?.getBoundingClientRect();
    const contactSheet = document.querySelector('.contact-sheet')?.getBoundingClientRect();
    const headlineRange = document.createRange();
    if (headlineElement) headlineRange.selectNodeContents(headlineElement);
    const headlineLineCount = headlineElement
      ? new Set(Array.from(headlineRange.getClientRects(), ({ top }) => Math.round(top))).size
      : 0;
    const verticalOverlap = headline && contactSheet
      ? Math.max(0, Math.min(headline.bottom, contactSheet.bottom) - Math.max(headline.top, contactSheet.top))
      : 0;
    const horizontalOverlap = verticalOverlap > 0
      ? Math.max(0, Math.min(headline.right, contactSheet.right) - Math.max(headline.left, contactSheet.left))
      : 0;
    return {
      enhanced: document.documentElement.dataset.enhanced === 'true',
      chapters: Array.from(document.querySelectorAll('[data-chapter]'), (element) => element.dataset.chapter),
      groups: Array.from(new Set(Array.from(document.querySelectorAll('.side-label'), (element) => element.textContent.trim()))),
      sourceCount: document.querySelectorAll('[data-source-id]').length,
      sourceCountText,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || document.body.scrollWidth > document.body.clientWidth + 1,
      controlSnapshots,
      stickyNavHeightRatio: nav ? nav.height / window.innerHeight : 1,
      heroContactOverlapPixels: Math.ceil(horizontalOverlap),
      heroHeadlineOverflowPixels: headline
        ? Math.ceil(Math.max(0, headlineElement.scrollWidth - headlineElement.clientWidth))
        : 0,
      heroFirstRowImbalancePixels: heroCopy && contactSheet
        ? Math.ceil(Math.max(0, heroCopy.bottom - contactSheet.bottom))
        : 0,
      chapterNavOverflowing: navList ? navList.scrollWidth > navList.clientWidth + 1 : true,
      heroHeadlineLineCount: headlineLineCount,
    };
  })()`;
}

function reducedMotionExpression() {
  return `(() => {
    const revealTargets = Array.from(document.querySelectorAll('[data-reveal], .evidence-figure, .case-pathway'));
    const seconds = (value) => value.split(',').reduce((max, item) => {
      const text = item.trim();
      const numeric = parseFloat(text) || 0;
      return Math.max(max, text.endsWith('ms') ? numeric / 1000 : numeric);
    }, 0);
    const signal = document.querySelector('[data-signal-path]');
    return {
      enhanced: document.documentElement.dataset.enhanced === 'true',
      reducedMotion: document.documentElement.dataset.reducedMotion === 'true',
      unrevealedCount: revealTargets.filter((target) => !target.classList.contains('is-revealed')).length,
      animationCount: document.getAnimations().filter((animation) => animation.playState !== 'finished').length,
      stagedTransitionCount: revealTargets.filter((target) => seconds(getComputedStyle(target).transitionDuration) > 0).length,
      signalTransitionSeconds: signal ? seconds(getComputedStyle(signal, '::before').transitionDuration) : -1,
    };
  })()`;
}

function noJavaScriptExpression() {
  return `(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const caseViews = Array.from(document.querySelectorAll('[data-case-view]'));
    const summaries = Array.from(document.querySelectorAll('.evidence-figure figcaption > p'));
    const sources = Array.from(document.querySelectorAll('[data-source-id]'));
    const downloads = Array.from(document.querySelectorAll('[data-download]'));
    return {
      enhanced: document.documentElement.dataset.enhanced === 'true',
      chapters: document.querySelectorAll('[data-chapter]').length,
      cases: document.querySelectorAll('[data-case]').length,
      caseViews: caseViews.length,
      hiddenCaseViews: caseViews.filter((element) => !visible(element)).length,
      figureSummaries: summaries.length,
      hiddenFigureSummaries: summaries.filter((element) => !visible(element)).length,
      sourceRows: sources.length,
      hiddenSourceRows: sources.filter((element) => !visible(element)).length,
      downloads: downloads.length,
      hiddenDownloads: downloads.filter((element) => !visible(element)).length,
    };
  })()`;
}

function printExpression() {
  return `(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const headings = Array.from(document.querySelectorAll('.chapter--opening h2[id$="-title"], .chapter-heading h2[id$="-title"]'));
    const captions = Array.from(document.querySelectorAll('.contact-frame figcaption, .evidence-figure figcaption'));
    const sourceIds = Array.from(document.querySelectorAll('.source-id')).filter(visible);
    const notes = Array.from(document.querySelectorAll('.field-note')).filter(visible);
    const externalLinks = Array.from(document.querySelectorAll('a[href^="http"]'));
    const printableExternalLinks = externalLinks.filter((link) => {
      const content = getComputedStyle(link, '::after').content;
      return content && content !== 'none' && content.includes(link.href);
    });
    const controls = Array.from(document.querySelectorAll('.skip-link, .chapter-nav, .case-tabs, [data-enhancement-control]'));
    const caseViews = Array.from(document.querySelectorAll('[data-case-view]'));
    return {
      numberedHeadings: headings.length,
      hiddenNumberedHeadings: headings.filter((element) => !visible(element)).length,
      captions: captions.length,
      hiddenCaptions: captions.filter((element) => !visible(element)).length,
      sourceIds: sourceIds.length,
      evidenceNotes: notes.length,
      externalLinks: externalLinks.length,
      printableExternalLinks: printableExternalLinks.length,
      interactiveControlsVisible: controls.filter(visible).length,
      hiddenCaseViews: caseViews.filter((element) => !visible(element)).length,
    };
  })()`;
}

function readPngDimensions(path) {
  const header = readFileSync(path).subarray(0, 24);
  if (header.length < 24 || header.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new Error(`invalid PNG screenshot: ${path}`);
  }
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function appendStateErrors(issues, label, state) {
  if (state.consoleErrors?.length) issues.push(`${label}: console errors: ${state.consoleErrors.join(' | ')}`);
  if (state.runtimeErrors?.length) issues.push(`${label}: runtime errors: ${state.runtimeErrors.join(' | ')}`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isDirectRun() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  try {
    const report = await runBrowserSmoke();
    process.stdout.write(`Browser smoke PASS · ${report.chromeVersion}\n`);
    for (const viewport of report.viewports) {
      process.stdout.write(`PASS ${viewport.width}x${viewport.height} · ${viewport.screenshotBytes} bytes · ${viewport.screenshotPath}\n`);
    }
    process.stdout.write(`PASS reduced-motion · no-JavaScript · print (${report.print.pdfBytes} PDF bytes)\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
