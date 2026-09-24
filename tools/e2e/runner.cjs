'use strict';

/**
 * Harness entry point: build, serve, run the requested tests, tear down.
 *
 *   node tools/e2e/runner.cjs                  # content + flow + timing + layout
 *   node tools/e2e/runner.cjs timing           # just one
 *   node tools/e2e/runner.cjs --no-build flow  # reuse the dist/ already built
 *
 * Exits non-zero as soon as anything fails, with a summary of every test.
 */

const { build, startPreview, stopPreview } = require('./server.cjs');
const { green, red } = require('./common.cjs');

const TESTS = {
  content: { file: './content.cjs', browser: false, what: 'datos de src/content/countries.ts' },
  flow: { file: './flow.cjs', browser: true, what: 'recorrido de menús hasta resultados' },
  timing: { file: './timing.cjs', browser: true, what: 'tambores en su beat con CPU x4' },
  layout: { file: './layout.cjs', browser: true, what: 'textos que no desbordan su caja' },
};
const DEFAULT_ORDER = ['content', 'flow', 'timing', 'layout'];

function parseArgs(argv) {
  const names = [];
  let noBuild = false;
  for (const a of argv) {
    if (a === '--no-build') noBuild = true;
    else if (a.startsWith('--')) throw new Error(`opción desconocida: ${a}`);
    else if (TESTS[a]) names.push(a);
    else throw new Error(`prueba desconocida: ${a} (disponibles: ${Object.keys(TESTS).join(', ')})`);
  }
  return { names: names.length ? names : DEFAULT_ORDER, noBuild: noBuild || !!process.env.E2E_NO_BUILD };
}

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

async function main() {
  const { names, noBuild } = parseArgs(process.argv.slice(2));
  const needsBrowser = names.some((n) => TESTS[n].browser);
  const results = [];
  let server = null;
  const t0 = Date.now();

  try {
    if (needsBrowser) {
      if (!noBuild) {
        console.log(`\n▸ build`);
        build();
      }
      console.log(`\n▸ vite preview`);
      server = await startPreview();
      process.env.E2E_BASE_URL = server.url;
      console.log(`  sirviendo dist/ en ${server.url}`);
    }

    for (const name of names) {
      const t = TESTS[name];
      console.log(`\n▸ ${name} — ${t.what}`);
      const started = Date.now();
      try {
        await require(t.file).run();
        results.push({ name, ok: true, ms: Date.now() - started });
      } catch (e) {
        results.push({ name, ok: false, ms: Date.now() - started, error: e.message });
      }
    }
  } finally {
    stopPreview(server);
  }

  console.log(`\n${'─'.repeat(56)}`);
  for (const r of results) {
    console.log(`${r.ok ? green('PASA') : red('FALLA')}  ${r.name.padEnd(8)} ${secs(r.ms).padStart(8)}${r.ok ? '' : `  ${r.error}`}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`${'─'.repeat(56)}`);
  console.log(`${failed.length ? red(`${failed.length} prueba(s) con fallos`) : green('todo en verde')} · ${secs(Date.now() - t0)} en total\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n${red('ERROR')} ${e.message}`);
  process.exit(1);
});
