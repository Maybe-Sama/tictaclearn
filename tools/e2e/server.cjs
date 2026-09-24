'use strict';

/**
 * Build + `vite preview` lifecycle for the harness. Works the same locally and
 * in CI: no globally installed tools, only the repo's own devDependencies.
 */

const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.E2E_PORT || 4317);
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
/** The repo's local Vite binary (never `npx`, which may hit the network in CI). */
const VITE_BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function build() {
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error('npm run build falló');
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Starts `vite preview` and resolves once it answers 200. */
async function startPreview() {
  const child = spawn(VITE_BIN, ['preview', '--port', String(PORT), '--strictPort', '--host', HOST], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  let exited = false;
  child.on('exit', () => (exited = true));

  for (let i = 0; i < 120; i++) {
    if (exited) throw new Error(`vite preview terminó antes de tiempo:\n${log}`);
    if (await ping(`${BASE_URL}/`)) return { child, url: BASE_URL };
    await sleep(250);
  }
  child.kill('SIGKILL');
  throw new Error(`vite preview no respondió en ${BASE_URL}:\n${log}`);
}

function stopPreview(server) {
  if (!server || !server.child || server.child.killed) return;
  server.child.kill('SIGTERM');
  // The preview server can ignore SIGTERM while a request is in flight.
  setTimeout(() => server.child.kill('SIGKILL'), 2000).unref();
}

module.exports = { BASE_URL, PORT, ROOT, build, startPreview, stopPreview };
