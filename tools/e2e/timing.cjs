'use strict';

/**
 * Drum timing under load.
 *
 * `AudioEngine.drumHit(t, ...)` is wrapped before the game boots, and every
 * call is compared against the scheduled time of the nearest drum token.
 * Both paths must land on the beat:
 *   - `pre`  : pre-scheduled on the exact beat while the player is in the groove
 *              (full volume) or right after a miss (soft volume).
 *   - `input`: played from the press itself, when the pre-schedule was skipped.
 *
 * The run uses the `wrong` bot (it stamps wrong countries on purpose, so combos
 * break and the soft post-miss path is exercised) and CPU throttling x4.
 */

const { Report, VIEWPORTS, launchBrowser, openGame, sleep, waitAudioRunning, walkToConcert } = require('./common.cjs');

/** A drum is considered off its beat above this. Measured by hand at < 1 ms. */
const MAX_DEVIATION_MS = 1;
const CPU_THROTTLE_RATE = 4;
const PLAY_MS = 25000;

/**
 * Installed with `evaluateOnNewDocument`, so no drum can slip through before
 * the hook is in place: it intercepts the assignment of `window.__wb` and then
 * the assignment of the game's `audio` field.
 */
function installProbe() {
  const samples = [];
  window.__e2eDrums = samples;

  const wrap = (audio, game) => {
    if (audio.__e2eWrapped) return;
    audio.__e2eWrapped = true;
    const original = audio.drumHit.bind(audio);
    audio.drumHit = function (t, offbeat, bell, v) {
      // Nearest scheduled drum token, resolved at call time: the challenge that
      // owns it is still alive (it is pruned 5 s after its last option).
      let best = null;
      let bestDelta = Infinity;
      const engine = game.engine;
      if (engine) {
        for (const c of engine.challenges) {
          for (const o of c.options) {
            if (o.kind !== 'drum') continue;
            const d = Math.abs(t - o.time);
            if (d < bestDelta) {
              bestDelta = d;
              best = o;
            }
          }
        }
      }
      samples.push({
        t,
        ctxTime: audio.ctx.currentTime,
        offbeat: !!offbeat,
        bell: !!bell,
        v: v === undefined ? 1 : v,
        beat: best ? best.time : null,
        deltaMs: best ? (t - best.time) * 1000 : null,
        // `prePlayed` is set just before the pre-scheduled call; a press-driven
        // drum only ever sounds when the pre-schedule did not happen.
        path: best && best.prePlayed ? 'pre' : 'input',
        state: best ? best.state : null,
      });
      return original(t, offbeat, bell, v);
    };
  };

  let game = null;
  Object.defineProperty(window, '__wb', {
    configurable: true,
    get: () => game,
    set: (g) => {
      game = g;
      let audio = g.audio;
      if (audio) wrap(audio, g);
      Object.defineProperty(g, 'audio', {
        configurable: true,
        get: () => audio,
        set: (a) => {
          audio = a;
          if (a) wrap(a, g);
        },
      });
    },
  });
}

async function run() {
  const rep = new Report('timing');
  const browser = await launchBrowser();
  try {
    console.log(`\n  ${VIEWPORTS.desktop.label} · bot "wrong" · CPU x${CPU_THROTTLE_RATE}`);
    const page = await openGame(browser, {
      viewport: VIEWPORTS.desktop,
      query: 'autoplay=wrong',
      beforeLoad: installProbe,
    });
    try {
      const cdp = await page.createCDPSession();
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
      rep.ok(`CPU emulada al ${Math.round(100 / CPU_THROTTLE_RATE)} % (rate ${CPU_THROTTLE_RATE})`);

      await walkToConcert(page);
      await waitAudioRunning(page);
      await sleep(PLAY_MS);

      const data = await page.evaluate(() => ({
        drums: window.__e2eDrums,
        lateNotes: window.__wb.engine ? window.__wb.engine.lateNotes : -1,
        maxLateMs: window.__wb.engine ? window.__wb.engine.maxLateMs : -1,
        misses: window.__wb.stats.miss !== undefined ? window.__wb.stats.miss : null,
        combo: window.__wb.stats.combo,
      }));

      const matched = data.drums.filter((d) => d.deltaMs !== null);
      const orphans = data.drums.length - matched.length;

      rep.check(matched.length >= 20, `se midieron suficientes tambores (${matched.length})`, [
        `muestras totales: ${data.drums.length}, sin ficha cercana: ${orphans}`,
        'si son 0, el bot o el generador de retos no está produciendo tambores',
      ]);

      const worst = matched.reduce((a, b) => (Math.abs(b.deltaMs) > Math.abs(a.deltaMs) ? b : a), { deltaMs: 0 });
      const maxDev = Math.abs(worst.deltaMs);
      const offenders = matched.filter((d) => Math.abs(d.deltaMs) > MAX_DEVIATION_MS);
      rep.check(
        offenders.length === 0,
        `todo tambor suena en su beat (peor desviación ${maxDev.toFixed(4)} ms < ${MAX_DEVIATION_MS} ms)`,
        offenders.slice(0, 8).map((d) => `${d.path} v=${d.v} · programado ${d.t.toFixed(4)} s vs beat ${d.beat.toFixed(4)} s → ${d.deltaMs.toFixed(3)} ms`),
      );

      rep.check(data.lateNotes === 0, `el planificador no dejó notas tardías (lateNotes ${data.lateNotes})`, [
        `maxLateMs ${Number(data.maxLateMs).toFixed(2)}`,
        'una nota tardía significa que el bucle de audio no llegó a su horizonte de 120 ms',
      ]);

      // Both drum flavours must appear: full volume while grooving and the soft
      // one right after a miss. That is the "suena bien incluso tras fallar" case.
      const loud = matched.filter((d) => d.path === 'pre' && d.v >= 0.9).length;
      const soft = matched.filter((d) => d.path === 'pre' && d.v > 0 && d.v < 0.9).length;
      const input = matched.filter((d) => d.path === 'input').length;
      console.log(`      caminos: pre/en-groove ${loud} · pre/tras-fallo ${soft} · desde la pulsación ${input}`);
      rep.check(loud > 0, `se ejercita el tambor pre-programado en groove (${loud})`);
      rep.check(soft > 0, `se ejercita el tambor tras fallo (${soft})`, [
        'el bot "wrong" debería romper el combo y bajar el volumen del tambor a 0.4',
      ]);

      const errs = page.__errors.filter((e) => !/favicon/i.test(e));
      rep.check(errs.length === 0, 'sin errores de consola', errs.slice(0, 5));
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
  rep.finish();
}

module.exports = { run };

if (require.main === module) {
  require('./standalone.cjs').main(run);
}
