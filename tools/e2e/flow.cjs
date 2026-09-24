'use strict';

/**
 * Menu walk: inicio → Beat Tour → asignatura → zona → concierto → jugar → resultados.
 * Runs on a portrait phone and on a desktop viewport, with the `good` bot
 * playing, so a broken button or a dead transition fails the build.
 */

const { Report, VIEWPORTS, launchBrowser, openGame, rushToResults, state, waitAudioRunning, walkToConcert } = require('./common.cjs');

const VARIANTS = [
  { key: 'mobile', viewport: VIEWPORTS.mobile },
  { key: 'desktop', viewport: VIEWPORTS.desktop },
];

async function runVariant(browser, rep, variant) {
  console.log(`\n  ${variant.viewport.label}`);
  const page = await openGame(browser, { viewport: variant.viewport, query: 'autoplay=good' });
  try {
    const visited = await walkToConcert(page);
    rep.check(visited[0] === 'Menu', `[${variant.key}] arranca en el menú`, [`estados: ${visited.join(' → ')}`]);
    rep.check(visited.includes('Subject'), `[${variant.key}] la pantalla de asignatura aparece`);
    rep.check(visited.includes('Tour'), `[${variant.key}] el mapa de zonas aparece`);
    rep.check(visited.includes('Zona'), `[${variant.key}] la lista de conciertos aparece`);

    await waitAudioRunning(page);
    rep.ok(`[${variant.key}] el concierto arranca (estado ${visited[visited.length - 1]}, audio en marcha)`);

    const scored = await page.evaluate(async () => {
      // Let the bot actually play a few bars before we rush to the results.
      await new Promise((r) => setTimeout(r, 6000));
      const e = window.__wb.engine;
      return { combo: window.__wb.stats.combo, score: window.__wb.stats.score, phrases: (e.phraseLog || e.phrases).length };
    });
    rep.check(scored.phrases > 0, `[${variant.key}] el setlist produce frases (${scored.phrases})`);
    rep.check(scored.score > 0, `[${variant.key}] el bot puntúa (${scored.score} pts, combo ${scored.combo})`, ['el bot `good` no acertó nada: ¿juicio o generador de retos roto?']);

    const reached = await rushToResults(page);
    rep.check(reached, `[${variant.key}] se llega a RESULTADOS`, [`estado final: ${await state(page)}`]);
    if (reached) {
      const res = await page.evaluate(() => {
        const root = document.querySelector('.results');
        return {
          visible: !!root && !root.classList.contains('hidden'),
          title: (root && root.querySelector('.rs-title') && root.querySelector('.rs-title').textContent) || '',
          buttons: root ? root.querySelectorAll('.rs-buttons [data-act]').length : 0,
        };
      });
      rep.check(res.visible, `[${variant.key}] la pantalla de resultados es visible`);
      rep.check(res.buttons > 0, `[${variant.key}] los resultados ofrecen botones (${res.buttons})`);
      rep.check(/BEATCOMPLETE/.test(res.title.replace(/\s+/g, '')), `[${variant.key}] el título de resultados se pinta`, [`título: ${JSON.stringify(res.title)}`]);
    }

    const errs = page.__errors.filter((e) => !/favicon/i.test(e));
    rep.check(errs.length === 0, `[${variant.key}] sin errores de consola`, errs.slice(0, 5));
  } finally {
    await page.close();
  }
}

async function run() {
  const rep = new Report('flow');
  const browser = await launchBrowser();
  try {
    for (const v of VARIANTS) await runVariant(browser, rep, v);
  } finally {
    await browser.close();
  }
  rep.finish();
}

module.exports = { run };

if (require.main === module) {
  require('./standalone.cjs').main(run);
}
