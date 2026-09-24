'use strict';

/**
 * Shared helpers for the end-to-end harness: browser launch, viewport presets,
 * menu navigation and a tiny assertion/reporting layer.
 *
 * Everything here is plain CommonJS on purpose: the harness must run with a
 * bare `node tools/e2e/<script>.cjs`, with no build step of its own.
 */

const puppeteer = require('puppeteer');

/** Read late: the runner sets E2E_BASE_URL only once the preview server is up. */
const baseUrl = () => process.env.E2E_BASE_URL || 'http://127.0.0.1:4317';
/** Debug build hooks: `window.__wb` plus the deterministic autoplay bot. */
const DEBUG_QUERY = 'debug=1';

/** Viewports under test. `isMobile`/`hasTouch` make the app pick its touch layout. */
const VIEWPORTS = {
  mobile: { label: 'móvil vertical 390x844', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  mobileLandscape: { label: 'móvil horizontal 844x390', width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { label: 'escritorio 1366x768', width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- reporting

const C = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (C ? `\u001b[${code}m${s}\u001b[0m` : s);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const yellow = (s) => paint('33', s);
const dim = (s) => paint('2', s);

/** Collects failures so one run reports every problem, not just the first. */
class Report {
  constructor(name) {
    this.name = name;
    this.failures = [];
    this.warnings = [];
    this.checks = 0;
  }

  ok(msg) {
    this.checks++;
    console.log(`  ${green('✓')} ${msg}`);
  }

  fail(msg, details) {
    this.checks++;
    this.failures.push(msg);
    console.log(`  ${red('✗')} ${msg}`);
    for (const d of details || []) console.log(`      ${dim(d)}`);
  }

  warn(msg) {
    this.warnings.push(msg);
    console.log(`  ${yellow('!')} ${msg}`);
  }

  /** Asserts `cond`; either way the check is recorded. */
  check(cond, msg, details) {
    if (cond) this.ok(msg);
    else this.fail(msg, details);
    return cond;
  }

  finish() {
    if (this.failures.length) {
      const err = new Error(`${this.name}: ${this.failures.length} fallo(s)`);
      err.failures = this.failures;
      throw err;
    }
  }
}

// ---------------------------------------------------------------- browser

async function launchBrowser() {
  return puppeteer.launch({
    headless: process.env.E2E_HEADFUL ? false : true,
    args: [
      // The game creates its AudioContext inside a click, but a bot-driven run
      // must never be blocked by the autoplay heuristics.
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      // CI machines have no sound card; keep a real-time null sink instead.
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
}

/**
 * Opens the game with the debug hooks on. `beforeLoad` runs in the page before
 * any app code (used to instrument the audio engine).
 */
async function openGame(browser, { viewport, query = '', beforeLoad = null, beforeLoadArg = null }) {
  const page = await browser.newPage();
  const { label, ...vp } = viewport;
  void label;
  await page.setViewport(vp);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  if (beforeLoad) await page.evaluateOnNewDocument(beforeLoad, beforeLoadArg);
  const q = query ? `${DEBUG_QUERY}&${query}` : DEBUG_QUERY;
  await page.goto(`${baseUrl()}/?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__wb, { timeout: 15000 });
  page.__errors = errors;
  return page;
}

/** Waits until the state machine reports `state`. */
function waitState(page, state, timeout = 20000) {
  return page.waitForFunction((s) => window.__wb && window.__wb.fsm.state === s, { timeout, polling: 50 }, state);
}

function state(page) {
  return page.evaluate(() => window.__wb.fsm.state);
}

/** Clicks the first visible match, failing loudly if it never shows up. */
async function clickVisible(page, selector, timeout = 15000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

/**
 * Menu walk shared by every browser test:
 * inicio → Beat Tour → asignatura → zona → concierto → jugando.
 * `concert` picks which stop to open: the first one teaches new countries,
 * `.stop.final` drops straight into the groove (denser for timing/layout).
 * Returns the ordered list of states visited, so `flow.cjs` can assert it.
 */
async function walkToConcert(page, { subject = 'flags', concert = '.stop' } = {}) {
  const visited = [await state(page)];
  await page.waitForSelector('.menu:not(.hidden) .btn-tour', { visible: true, timeout: 15000 });

  await clickVisible(page, '.menu:not(.hidden) .btn-tour');
  await waitState(page, 'Subject');
  visited.push('Subject');

  await clickVisible(page, `.choice:not(.hidden) .choice-card[data-id="${subject}"]`);
  await waitState(page, 'Tour');
  visited.push('Tour');

  await page.waitForSelector('.hub.tour:not(.hidden) .world-card', { visible: true, timeout: 15000 });
  await clickVisible(page, '.hub.tour:not(.hidden) .world-card');

  await page.waitForSelector(`.hub.tour:not(.hidden) ${concert}`, { visible: true, timeout: 15000 });
  visited.push('Zona');
  await clickVisible(page, `.hub.tour:not(.hidden) ${concert}`);

  await page.waitForFunction(
    () => {
      const s = window.__wb.fsm.state;
      return s !== 'Tour' && s !== 'Menu' && s !== 'Subject';
    },
    { timeout: 20000, polling: 50 },
  );
  visited.push(await state(page));
  return visited;
}

/** Waits until the AudioContext clock is actually running and moving. */
async function waitAudioRunning(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const g = window.__wb;
      return !!(g && g.audio && g.audio.ctx.state === 'running' && g.audio.ctx.currentTime > 0);
    },
    { timeout, polling: 50 },
  );
}

/** Presses N (debug: skip section) so a concert reaches its results quickly. */
async function skipSection(page) {
  await page.keyboard.press('KeyN');
}

/** Drives the song to the results screen without waiting for the full set. */
async function rushToResults(page, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await state(page)) === 'Results') return true;
    await skipSection(page);
    await sleep(500);
  }
  return (await state(page)) === 'Results';
}

module.exports = {
  baseUrl,
  VIEWPORTS,
  Report,
  clickVisible,
  dim,
  green,
  launchBrowser,
  openGame,
  red,
  rushToResults,
  skipSection,
  sleep,
  state,
  waitAudioRunning,
  waitState,
  walkToConcert,
  yellow,
};
