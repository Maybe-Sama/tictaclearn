'use strict';

/**
 * Content validation for `src/content/countries.ts`, with no browser involved.
 * The module has no imports, so it is transpiled in memory with esbuild (already
 * a Vite dependency) and evaluated: the checks run against the real exported
 * data, not against a parsed copy of the file.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const { Report } = require('./common.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'src', 'content', 'countries.ts');
const FLAG_DIR = path.join(ROOT, 'node_modules', 'flag-icons', 'flags', '4x3');
/** Above this the label stops fitting comfortably on a token; a warning, not a failure. */
const LABEL_WARN_CHARS = 26;

function loadCountries() {
  const ts = fs.readFileSync(SOURCE, 'utf8');
  const { code } = esbuild.transformSync(ts, { loader: 'ts', format: 'cjs', target: 'es2020' });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require });
  return module.exports;
}

const isClean = (s) => typeof s === 'string' && s === s.trim() && !/\s{2,}/.test(s);

function run() {
  const rep = new Report('content');
  const mod = loadCountries();
  const { COUNTRIES, CONTINENTS, FLAG_CLUSTERS, CAPITAL_CLUSTERS } = mod;

  rep.check(Array.isArray(COUNTRIES) && COUNTRIES.length > 150, `el catálogo carga (${COUNTRIES.length} países)`);

  // --- unique ids -----------------------------------------------------------
  const seen = new Map();
  const dupes = [];
  for (const c of COUNTRIES) {
    if (seen.has(c.id)) dupes.push(`${c.id} (${seen.get(c.id)} / ${c.name})`);
    else seen.set(c.id, c.name);
  }
  rep.check(dupes.length === 0, 'los ids son únicos', dupes);

  // --- every id has artwork -------------------------------------------------
  const flags = new Set(fs.readdirSync(FLAG_DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)));
  const missing = COUNTRIES.filter((c) => !flags.has(c.id)).map((c) => `${c.id} (${c.name})`);
  rep.check(missing.length === 0, `todos los ids tienen SVG en flag-icons/flags/4x3 (${flags.size} disponibles)`, missing);

  // --- continents / difficulty ---------------------------------------------
  const contIds = new Set(CONTINENTS.map((c) => c.id));
  const badCont = COUNTRIES.filter((c) => !contIds.has(c.continent)).map((c) => `${c.id} → ${c.continent}`);
  rep.check(badCont.length === 0, 'todos los países pertenecen a un continente conocido', badCont);
  const badDiff = COUNTRIES.filter((c) => ![1, 2, 3].includes(c.difficulty)).map((c) => `${c.id} → ${c.difficulty}`);
  rep.check(badDiff.length === 0, 'la dificultad es siempre 1, 2 o 3', badDiff);

  // --- capitals present for everything that enters Capitales ----------------
  const inCapitals = COUNTRIES.filter((c) => c.capital !== null);
  const emptyCapital = inCapitals.filter((c) => typeof c.capital !== 'string' || c.capital.trim() === '').map((c) => `${c.id} (${c.name})`);
  rep.check(emptyCapital.length === 0, `ningún país de Capitales se queda sin capital (${inCapitals.length} jugables)`, emptyCapital);

  // --- whitespace hygiene ---------------------------------------------------
  const dirty = [];
  for (const c of COUNTRIES) {
    if (!isClean(c.name)) dirty.push(`nombre ${JSON.stringify(c.name)} (${c.id})`);
    if (c.capital !== null && !isClean(c.capital)) dirty.push(`capital ${JSON.stringify(c.capital)} (${c.id})`);
    for (const d of c.decoys || []) if (!isClean(d)) dirty.push(`señuelo ${JSON.stringify(d)} (${c.id})`);
  }
  rep.check(dirty.length === 0, 'nombres, capitales y señuelos sin espacios sobrantes', dirty);

  // --- decoys must never be a real capital ----------------------------------
  // A decoy that is somebody's capital would punish a correct answer elsewhere.
  const capitalOwner = new Map();
  for (const c of inCapitals) capitalOwner.set(c.capital, c.id);
  const badDecoys = [];
  for (const c of COUNTRIES) {
    for (const d of c.decoys || []) {
      const owner = capitalOwner.get(d);
      if (owner) badDecoys.push(`${c.id}: «${d}» es la capital real de ${owner}`);
    }
  }
  rep.check(badDecoys.length === 0, 'ningún señuelo coincide con una capital real', badDecoys);

  // --- clusters point at real countries -------------------------------------
  const ids = new Set(COUNTRIES.map((c) => c.id));
  const badCluster = [];
  for (const [label, list] of [['FLAG_CLUSTERS', FLAG_CLUSTERS], ['CAPITAL_CLUSTERS', CAPITAL_CLUSTERS]]) {
    for (const cl of list) for (const id of cl.ids) if (!ids.has(id)) badCluster.push(`${label} «${cl.name}» → ${id}`);
  }
  rep.check(badCluster.length === 0, 'los grupos de parecidos solo citan países existentes', badCluster);
  // A Capitales cluster entry without a capital is dead weight: it can never be
  // picked as a distractor. Worth knowing, not worth blocking a release.
  const byIdMap = new Map(COUNTRIES.map((c) => [c.id, c]));
  const clusterNoCapital = CAPITAL_CLUSTERS.flatMap((cl) => cl.ids.filter((id) => ids.has(id) && byIdMap.get(id).capital === null).map((id) => `${cl.name} → ${id}`));
  if (clusterNoCapital.length) {
    rep.warn(`${clusterNoCapital.length} entrada(s) de CAPITAL_CLUSTERS sin capital (nunca se usarán)`);
    for (const l of clusterNoCapital) console.log(`      ${l}`);
  } else {
    rep.ok('los grupos de Capitales solo citan países con capital');
  }

  // --- label length ---------------------------------------------------------
  const long = [];
  for (const c of COUNTRIES) {
    if (c.name.length > LABEL_WARN_CHARS) long.push(`Banderas «${c.name}» (${c.name.length})`);
    if (c.capital && c.capital.length > LABEL_WARN_CHARS) long.push(`Capitales «${c.capital}» (${c.capital.length})`);
  }
  if (long.length) {
    rep.warn(`${long.length} etiqueta(s) por encima de ${LABEL_WARN_CHARS} caracteres`);
    for (const l of long) console.log(`      ${l}`);
  } else {
    rep.ok(`ninguna etiqueta supera ${LABEL_WARN_CHARS} caracteres`);
  }

  rep.finish();
}

module.exports = { run };

if (require.main === module) {
  try {
    run();
    console.log('\ncontent: OK');
  } catch (e) {
    console.error(`\n${e.message}`);
    process.exit(1);
  }
}
