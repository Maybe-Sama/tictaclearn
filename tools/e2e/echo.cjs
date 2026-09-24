'use strict';

/**
 * Llamada y respuesta (ECO): a mitad de concierto el planeta toca un patrón y
 * el jugador lo repite. Dos cosas tienen que cumplirse siempre:
 *
 *   1. el eco aparece (frase `echo-call` + `echo-answer`) y el planeta se anima
 *      durante la llamada y se vuelve a estar quieto después;
 *   2. la ronda cuenta como ronda aunque el jugador no toque, y solo cuenta
 *      como limpia si acierta todos los golpes.
 *
 * El punto 2 es el que se perdió dos veces al reaplicar ediciones: sin él las
 * estadísticas de resultados mienten y el eco es invisible para el director de
 * dificultad.
 */

const { Report, VIEWPORTS, launchBrowser, openGame, state } = require('./common.cjs');

const SEED = 4242;
const ROUND_TIMEOUT = 120000;

/** Arranca el primer concierto del tour sin pasar por los menús. */
const startFirstConcert = (page) =>
  page.evaluate(() => {
    const g = window.__wb;
    g.startConcert(g.tour()[0].concerts[0]);
  });

/**
 * Juega hasta que se hayan contado `rounds` ecos (o hasta resultados) y devuelve
 * lo que se vio por el camino.
 */
async function watchConcert(page, wanted) {
  const seen = { call: 0, answer: 0, calling: 0, samples: 0 };
  const deadline = Date.now() + ROUND_TIMEOUT;
  let stats = { rounds: 0, clean: 0 };

  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const g = window.__wb;
      const log = g.engine ? g.engine.phraseLog || [] : [];
      const dj = document.querySelector('.dj');
      return {
        st: g.fsm.state,
        calls: log.filter((l) => l.startsWith('echo-call')).length,
        answers: log.filter((l) => l.startsWith('echo-answer')).length,
        calling: !!dj && dj.classList.contains('calling'),
        rounds: g.stats.echoRounds,
        clean: g.stats.echoClean,
      };
    });
    seen.call = snap.calls;
    seen.answer = snap.answers;
    seen.samples++;
    if (snap.calling) seen.calling++;
    stats = { rounds: snap.rounds, clean: snap.clean };
    if (snap.st === 'Results') break;
    if (stats.rounds >= wanted && seen.calling > 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ...seen, ...stats };
}

async function run() {
  const browser = await launchBrowser();
  const rep = new Report('echo');

  try {
    // --- el bot perfecto: el eco sale y se cuenta como limpio ---------------
    console.log(`\n  bot "good" · semilla ${SEED}`);
    const page = await openGame(browser, { viewport: VIEWPORTS.desktop, query: `autoplay=good&seed=${SEED}` });
    let good;
    try {
      await startFirstConcert(page);
      good = await watchConcert(page, 2);
      rep.check(good.call >= 2 && good.answer >= 2, `el concierto incluye llamada y respuesta (${good.call} llamadas / ${good.answer} respuestas)`, [
        'el descanso del setlist debería producir dos rondas de eco',
      ]);
      rep.check(good.rounds >= 2, `las rondas de eco se cuentan (${good.rounds})`, [
        'Game.onResolved no está sumando stats.echoRounds para c.spec.echo',
      ]);
      rep.check(good.clean >= 1, `un bot que acierta todo hace rondas limpias (${good.clean}/${good.rounds})`);
      rep.check(good.calling > 0, `el planeta se anima mientras toca la llamada (${good.calling} muestreos)`, [
        "falta el case 'call' en Game.onVisual o Stage.setCalling",
      ]);
      rep.check(good.calling < good.samples, 'el planeta vuelve a estarse quieto (la animación no se queda pegada)', [
        `animado en ${good.calling} de ${good.samples} muestreos`,
      ]);
      const errs = page.__errors.filter((e) => !/favicon/i.test(e));
      rep.check(errs.length === 0, 'sin errores de consola', errs.slice(0, 5));
    } finally {
      await page.close();
    }

    // --- el jugador que no toca: ronda sí, limpia no ------------------------
    console.log(`\n  sin tocar nada · semilla ${SEED}`);
    const idlePage = await openGame(browser, { viewport: VIEWPORTS.desktop, query: `seed=${SEED}` });
    try {
      await startFirstConcert(idlePage);
      const idle = await watchConcert(idlePage, 2);
      rep.check(idle.rounds >= 2, `las rondas cuentan aunque no se toque (${idle.rounds})`, [`estado final: ${await state(idlePage)}`]);
      rep.check(idle.clean === 0, `ninguna ronda sale limpia sin tocar (${idle.clean})`, [
        'echoClean no está mirando el estado de cada golpe',
      ]);
    } finally {
      await idlePage.close();
    }
  } finally {
    await browser.close();
  }

  rep.finish();
}

module.exports = { run };
