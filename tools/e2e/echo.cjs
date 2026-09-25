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
 *
 * Y la regla inversa, que es la que le da sentido a la insignia del mapa: un
 * concierto que NO es de eco no emite ni una ronda. Mientras el eco salía en
 * todos, la insignia ECO prometía algo que hacía el concierto de al lado.
 */

const { Report, VIEWPORTS, launchBrowser, openGame, state } = require('./common.cjs');

const SEED = 4242;
const ROUND_TIMEOUT = 120000;

/**
 * Arranca, sin pasar por los menús, el primer concierto del tour que cumpla el
 * predicado (por arquetipo, no por posición: el reparto puede moverse).
 */
const startConcertWhere = (page, echo) =>
  page.evaluate((wantEcho) => {
    const g = window.__wb;
    const all = g.tour().flatMap((s) => s.concerts);
    const c = all.find((x) => !!x.params.echo === wantEcho);
    if (!c) throw new Error(`no hay ningún concierto con echo=${wantEcho}`);
    g.startConcert(c);
    return { id: c.id, archetype: c.params.archetype };
  }, echo);

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

/** Drena un concierto entero hasta resultados, contando lo mismo que `watchConcert`. */
async function watchToResults(page) {
  const deadline = Date.now() + ROUND_TIMEOUT;
  let last = { call: 0, answer: 0, rounds: 0 };
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => {
      const g = window.__wb;
      const log = g.engine ? g.engine.phraseLog || [] : [];
      return {
        st: g.fsm.state,
        call: log.filter((l) => l.startsWith('echo-call')).length,
        answer: log.filter((l) => l.startsWith('echo-answer')).length,
        rounds: g.stats.echoRounds,
      };
    });
    last = { call: snap.call, answer: snap.answer, rounds: snap.rounds };
    if (snap.st === 'Results') break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return last;
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
      const where = await startConcertWhere(page, true);
      console.log(`  concierto ${where.id} (${where.archetype})`);
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
      await startConcertWhere(idlePage, true);
      const idle = await watchConcert(idlePage, 2);
      rep.check(idle.rounds >= 2, `las rondas cuentan aunque no se toque (${idle.rounds})`, [`estado final: ${await state(idlePage)}`]);
      rep.check(idle.clean === 0, `ninguna ronda sale limpia sin tocar (${idle.clean})`, [
        'echoClean no está mirando el estado de cada golpe',
      ]);
    } finally {
      await idlePage.close();
    }

    // --- y el concierto que no es de eco: ni una ronda ----------------------
    console.log(`\n  un concierto que no es de ECO · semilla ${SEED}`);
    const plainPage = await openGame(browser, { viewport: VIEWPORTS.desktop, query: `autoplay=good&seed=${SEED}` });
    try {
      const where = await startConcertWhere(plainPage, false);
      const plain = await watchToResults(plainPage);
      rep.check(
        plain.call === 0 && plain.answer === 0,
        `${where.id} (${where.archetype}) no emite ninguna frase de eco (${plain.call}/${plain.answer})`,
        ['el eco solo lo emiten los conciertos con params.echo: si no, la insignia ECO no promete nada'],
      );
      rep.check(plain.rounds === 0, `tampoco cuenta rondas (${plain.rounds})`);
    } finally {
      await plainPage.close();
    }
  } finally {
    await browser.close();
  }

  rep.finish();
}

module.exports = { run };
