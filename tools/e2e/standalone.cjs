'use strict';

/**
 * Lets any single test run on its own (`node tools/e2e/timing.cjs`): it builds,
 * starts the preview server, runs the test and shuts everything down.
 * Set E2E_BASE_URL to reuse a server that is already up.
 */

const { build, startPreview, stopPreview } = require('./server.cjs');
const { red } = require('./common.cjs');

async function main(run) {
  const reuse = !!process.env.E2E_BASE_URL;
  let server = null;
  let code = 0;
  try {
    if (!reuse) {
      if (!process.env.E2E_NO_BUILD) build();
      server = await startPreview();
      process.env.E2E_BASE_URL = server.url;
    }
    await run();
  } catch (e) {
    console.error(`\n${red('ERROR')} ${e.message}`);
    code = 1;
  } finally {
    stopPreview(server);
  }
  process.exit(code);
}

module.exports = { main };
