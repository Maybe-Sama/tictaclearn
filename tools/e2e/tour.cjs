'use strict';

/**
 * Beat Tour shape, with no browser involved: `buildTour()` is a pure function,
 * so it is transpiled in memory (esbuild, already a Vite dependency) and run
 * against the real country catalogue.
 *
 * What this locks down:
 *   - the archetype split of docs/DESIGN-ARCHETYPES.md §3.2 (18/10/9/9/7/7),
 *   - the variety rule of §3.3 (≥3 archetypes in any 5 consecutive concerts,
 *     no two equal in a row except the ESCUELA-ESCUELA opening),
 *   - that every mechanic is actually reachable — the old ramp let `quick` and
 *     `flash` depend on tour position alone, so neither ever fired in Europa,
 *   - and that the tempo stays inside a sane band.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const { Report } = require('./common.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

/** Expected totals over the 60 concerts of the `flags` pack (§3.2). */
const EXPECTED = { escuela: 18, carrera: 10, eco: 9, memoria: 9, desfile: 7, jefe: 7 };
const ALL = Object.keys(EXPECTED);

/** Transpiles one .ts module and evaluates it, resolving relative imports the same way. */
function loadModule(relPath, cache = new Map()) {
  const file = path.join(SRC, `${relPath}.ts`);
  if (cache.has(file)) return cache.get(file);
  const { code } = esbuild.transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2020' });
  const module = { exports: {} };
  cache.set(file, module.exports);
  const localRequire = (spec) => {
    if (!spec.startsWith('.')) return require(spec);
    return loadModule(path.relative(SRC, path.resolve(path.dirname(file), spec)), cache);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, console });
  cache.set(file, module.exports);
  return module.exports;
}

/** The slice of ContentPack that `buildTour()` actually reads. */
function fakePack(countries, clusters) {
  return { items: countries.map((c) => ({ id: c.id, continent: c.continent })), clusters };
}

function run() {
  const rep = new Report('tour');
  const { COUNTRIES, FLAG_CLUSTERS, CAPITAL_CLUSTERS } = loadModule('content/countries');
  const { buildTour, archetypeFor } = loadModule('game/Tour');

  const stages = buildTour(fakePack(COUNTRIES, FLAG_CLUSTERS));
  const linear = stages.flatMap((s) => s.concerts);

  rep.check(linear.length === 60, `el tour de banderas tiene 60 conciertos (${linear.length})`, [
    stages.map((s) => `${s.id}:${s.concerts.length}`).join(' · '),
  ]);

  // --- every concert has a known archetype ---------------------------------
  const unknown = linear.filter((c) => !ALL.includes(c.params.archetype)).map((c) => `${c.id} → ${c.params.archetype}`);
  rep.check(unknown.length === 0, 'todo concierto tiene un arquetipo conocido', unknown);

  // --- the authored split ---------------------------------------------------
  const count = {};
  for (const a of ALL) count[a] = linear.filter((c) => c.params.archetype === a).length;
  const split = ALL.map((a) => `${a} ${count[a]}`).join(' · ');
  const mismatch = ALL.filter((a) => count[a] !== EXPECTED[a]).map((a) => `${a}: ${count[a]} (esperado ${EXPECTED[a]})`);
  rep.check(mismatch.length === 0, `el reparto es el de la tabla §3.2 — ${split}`, mismatch);

  // --- one boss per stage, always last -------------------------------------
  const badBoss = stages
    .filter((s) => {
      const bosses = s.concerts.filter((c) => c.params.archetype === 'jefe');
      return bosses.length !== 1 || bosses[0] !== s.concerts[s.concerts.length - 1];
    })
    .map((s) => s.id);
  rep.check(badBoss.length === 0, 'cada etapa acaba en un JEFE y solo tiene uno', badBoss);

  // --- variety rule ---------------------------------------------------------
  const thin = [];
  for (let i = 0; i + 5 <= linear.length; i++) {
    const w = linear.slice(i, i + 5);
    const distinct = new Set(w.map((c) => c.params.archetype));
    if (distinct.size < 3) thin.push(`${w[0].id}…${w[4].id}: ${[...distinct].join('/')}`);
  }
  rep.check(thin.length === 0, 'en toda ventana de 5 conciertos hay 3 arquetipos distintos', thin);

  const repeats = [];
  for (let i = 1; i < linear.length; i++) {
    const a = linear[i - 1];
    const b = linear[i];
    if (a.params.archetype !== b.params.archetype) continue;
    // The opening pair is the one allowed repeat: the player is still learning the base contract.
    const opening = a.id === 'europa-1' && b.id === 'europa-2';
    if (!opening) repeats.push(`${a.id} → ${b.id} (${b.params.archetype})`);
  }
  rep.check(repeats.length === 0, 'no hay dos conciertos seguidos del mismo arquetipo (salvo la apertura)', repeats);

  // --- mechanics are reachable where the design says -----------------------
  const europa = stages.find((s) => s.id === 'europa').concerts;
  rep.check(
    europa.some((c) => c.params.quick),
    'las ráfagas (quick) existen ya en Europa',
    ['antes dependían solo de la posición del tour (p ≥ 0.25) y nunca se activaban en Europa'],
  );
  rep.check(
    europa.some((c) => c.params.hold),
    'los sostenes (hold) se abren ya en Europa',
  );
  const memoria = linear.filter((c) => c.params.archetype === 'memoria');
  rep.check(
    memoria.length > 0 && memoria.every((c) => c.params.flash && c.params.ghost > 0),
    'todo MEMORIA trae flash y fantasmas',
    memoria.filter((c) => !c.params.flash || !c.params.ghost).map((c) => c.id),
  );
  rep.check(
    linear.filter((c) => c.params.archetype === 'eco').every((c) => c.params.echo),
    'todo ECO puede emitir rondas de eco',
  );
  rep.check(
    linear.filter((c) => c.params.archetype === 'jefe').every((c) => c.params.echo && c.params.hold),
    'todo JEFE reúne eco y sostén',
  );
  const escuelaLoud = linear.filter((c) => c.params.archetype === 'escuela' && (c.params.quick || c.params.flash || c.params.maxTier > 1));
  rep.check(escuelaLoud.length === 0, 'ESCUELA se queda limpia: sin ráfagas, sin flash, tier ≤ 1', escuelaLoud.map((c) => c.id));

  // --- tempo band ----------------------------------------------------------
  const bpms = linear.map((c) => c.params.bpm);
  const out = linear.filter((c) => c.params.bpm < 92 || c.params.bpm > 122).map((c) => `${c.id}: ${c.params.bpm}`);
  rep.check(out.length === 0, `el tempo se queda entre 92 y 122 BPM (${Math.min(...bpms)}–${Math.max(...bpms)})`, out);

  // --- body budget --------------------------------------------------------
  const badBudget = linear.filter((c) => c.params.budget !== (c.newIds.length ? 48 : 96)).map((c) => `${c.id}: ${c.params.budget}`);
  rep.check(badBudget.length === 0, 'el cuerpo es corto (48) si hay países nuevos y largo (96) si no', badBudget);

  // --- the dispatcher is pure ---------------------------------------------
  const twice = ['europa', 'africa', 'mundo'].every((s) => archetypeFor(s, 3, false, 4) === archetypeFor(s, 3, false, 4));
  rep.check(twice, 'archetypeFor() es pura (misma entrada, misma salida)');
  rep.check(archetypeFor('europa', 0, true, 0) === 'jefe', 'un concierto final es siempre JEFE');
  rep.check(archetypeFor('europa', 0, false, 0) !== 'escuela', 'sin países nuevos nadie es ESCUELA (no habría a quién presentar)');

  // --- the capitals pack has fewer clusters: the split shifts, the rules do not
  const caps = buildTour(fakePack(COUNTRIES, CAPITAL_CLUSTERS)).flatMap((s) => s.concerts);
  rep.check(caps.length > 40, `el tour de capitales se construye (${caps.length} conciertos)`);
  const capsThin = [];
  for (let i = 0; i + 5 <= caps.length; i++) {
    const distinct = new Set(caps.slice(i, i + 5).map((c) => c.params.archetype));
    if (distinct.size < 3) capsThin.push(`${caps[i].id}…${caps[i + 4].id}: ${[...distinct].join('/')}`);
  }
  rep.check(capsThin.length === 0, 'la regla de variedad también se cumple en capitales', capsThin);
  const capsUnknown = caps.filter((c) => !ALL.includes(c.params.archetype)).map((c) => c.id);
  rep.check(capsUnknown.length === 0, 'ningún concierto de capitales se queda sin arquetipo', capsUnknown);

  rep.finish();
}

module.exports = { run };

if (require.main === module) {
  try {
    run();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
