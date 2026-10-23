// Rebuild and restart from production files, keeping normal CSP/navigation/IPC checks.
// Type checking belongs to npm run check; the edit loop only compiles.
import { spawn, spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import electron from 'electron';

const mock = process.argv.includes('--mock');
const require = createRequire(import.meta.url);
const electronVite = join(dirname(require.resolve('electron-vite/package.json')), 'bin/electron-vite.js');
const profile = join(tmpdir(), 'huawei-music-desktop-dev' + (mock ? '-mock' : ''));
const entry = mock ? 'scripts/preview-mock.mjs' : 'out/main/index.js';
const ignored = /(^|[\\/])\.|~$|\.swp$/;

let app = null;
let compiler = null;
let restarting = false;
let building = false;
let queued = false;
let quitting = false;
let timer;

function build() {
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [electronVite, 'build'], { stdio: ['ignore', 'pipe', 'pipe'] });
    compiler = child;
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { output += error.message; });
    child.once('close', code => {
      compiler = null;
      if (!quitting) {
        if (code === 0) console.log('[dev] built in ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
        else console.error('[dev] build failed; fix the error and save again.\n' + output);
      }
      resolve(code === 0);
    });
  });
}

function launch() {
  const args = [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--user-data-dir=' + profile, entry];
  app = spawn(electron, args, { stdio: 'inherit' });
  app.once('spawn', () => console.log('[dev] app started (pid ' + app.pid + ')'));
  app.once('error', error => { console.error(error.message); });
  app.once('close', code => {
    app = null;
    if (!restarting && !quitting) void shutdown(code ?? 1);
  });
}

function stop(running) {
  if (!running || running.exitCode !== null || running.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    running.once('close', resolve);
    // Windows signals do not stop a process tree; scope taskkill to this child only.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(running.pid), '/t', '/f'], { stdio: 'ignore' });
    else running.kill('SIGTERM');
  });
}

async function shutdown(code = 0) {
  if (quitting) return;
  quitting = true;
  clearTimeout(timer);
  watcher.close();
  await Promise.all([stop(app), stop(compiler)]);
  process.exit(code);
}

async function rebuild() {
  if (quitting) return;
  if (building) { queued = true; return; }
  building = true;
  do {
    queued = false;
    const built = await build();
    if (quitting) break;
    if (built) {
      restarting = true;
      await stop(app);
      restarting = false;
      if (!quitting) launch();
    } else if (!app) {
      await shutdown(1);
    }
  } while (queued && !quitting);
  building = false;
}

const watcher = watch('src', { recursive: true }, (_event, file) => {
  if (file && ignored.test(file)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log('[dev] ' + (file ?? 'src') + ' changed, rebuilding…');
    void rebuild();
  }, 200);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void shutdown(); });
}
console.log('[dev] ' + (mock ? 'offline preview (synthetic data)' : 'real app') + '; profile: ' + profile);
console.log('[dev] watching src/ — save to rebuild and restart, Ctrl+C to stop');
await rebuild();
