'use strict';

/**
 * Text overflow during a real game. Every 100 ms the page is sampled and any
 * element whose content is wider than its box (scrollWidth > clientWidth) is
 * reported: country/capital tokens, the flag label and the prompt caption.
 * Runs in portrait and in landscape, because the stage swaps composition.
 */

const { Report, VIEWPORTS, launchBrowser, openGame, sleep, waitAudioRunning, walkToConcert } = require('./common.cjs');

/** Sub-pixel rounding tolerance, same slack the in-app `fitText` uses. */
const SLACK_PX = 1;
const SAMPLE_MS = 100;
const PLAY_MS = 22000;

const SELECTORS = ['.tk:not(.drum)', '.flag-label.show', '.prompt-caption'];

/** Installed in the page: a sampler that keeps only the worst case per element kind. */
function installSampler(cfg) {
  const overflows = [];
  const seen = new Set();
  let samples = 0;
  window.__e2eLayout = { overflows, stats: () => ({ samples, checked: window.__e2eChecked || 0 }) };
  window.__e2eChecked = 0;

  const scan = () => {
    samples++;
    for (const sel of cfg.selectors) {
      for (const el of document.querySelectorAll(sel)) {
        // Skip anything not laid out (hidden screens, detached tokens).
        if (!el.isConnected || el.offsetParent === null) continue;
        if (!el.clientWidth) continue;
        window.__e2eChecked++;
        const overW = el.scrollWidth - el.clientWidth;
        const overH = el.scrollHeight - el.clientHeight;
        if (overW <= cfg.slack && overH <= cfg.slack) continue;
        const text = (el.textContent || '').trim().slice(0, 60);
        const key = `${sel}|${text}|${overW > cfg.slack ? 'w' : 'h'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        overflows.push({
          selector: sel,
          text,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overW,
          overH,
          fontSize: getComputedStyle(el).fontSize,
        });
      }
    }
  };
  window.__e2eTimer = setInterval(scan, cfg.everyMs);
  scan();
}

async function runVariant(browser, rep, key, viewport) {
  console.log(`\n  ${viewport.label}`);
  const page = await openGame(browser, {
    viewport,
    query: 'autoplay=good',
    beforeLoad: installSampler,
    beforeLoadArg: { selectors: SELECTORS, slack: SLACK_PX, everyMs: SAMPLE_MS },
  });
  try {
    await walkToConcert(page);
    await waitAudioRunning(page);
    await sleep(PLAY_MS);

    const out = await page.evaluate(() => {
      clearInterval(window.__e2eTimer);
      return { overflows: window.__e2eLayout.overflows, stats: window.__e2eLayout.stats() };
    });

    rep.check(out.stats.checked > 50, `[${key}] se inspeccionaron textos de sobra (${out.stats.checked} en ${out.stats.samples} muestreos)`, [
      'con tan pocos elementos la prueba no demuestra nada: ¿arrancó la partida?',
    ]);
    rep.check(
      out.overflows.length === 0,
      `[${key}] ningún texto desborda su caja`,
      out.overflows.slice(0, 10).map((o) => `${o.selector} «${o.text}» ${o.scrollWidth}x${o.scrollHeight} en ${o.clientWidth}x${o.clientHeight} (sobra ${Math.max(o.overW, o.overH)} px, ${o.fontSize})`),
    );
  } finally {
    await page.close();
  }
}

async function run() {
  const rep = new Report('layout');
  const browser = await launchBrowser();
  try {
    await runVariant(browser, rep, 'vertical', VIEWPORTS.mobile);
    await runVariant(browser, rep, 'horizontal', VIEWPORTS.mobileLandscape);
  } finally {
    await browser.close();
  }
  rep.finish();
}

module.exports = { run };

if (require.main === module) {
  require('./standalone.cjs').main(run);
}
