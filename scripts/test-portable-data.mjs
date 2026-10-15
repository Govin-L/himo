// Re-extraction regression using a real Linux AppImage. No Windows binary execution, account,
// or saved credentials. This verifies that application paths and persistent data are independent.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { _electron as playwright } from 'playwright-core';

if (process.platform !== 'linux') throw new Error('This re-extraction regression requires the Linux AppImage.');
const artifact = resolve(process.argv[2] ?? 'release/linux-x64/huawei-music-desktop-0.0.1-linux-x86_64-internal.AppImage');
const root = await mkdtemp(join(tmpdir(), 'huawei-reextract-'));
const env = { ...process.env, HOME: join(root, 'home'), XDG_CONFIG_HOME: join(root, 'config'),
  XDG_CACHE_HOME: join(root, 'cache'), XDG_DATA_HOME: join(root, 'data'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
let instance;
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (!path.startsWith('..') && !isAbsolute(path)); };
async function launch(directory) {
  await mkdir(directory, { recursive: true });
  execFileSync(artifact, ['--appimage-extract'], { cwd: directory, env, stdio: 'ignore' });
  instance = await playwright.launch({ executablePath: join(directory, 'squashfs-root', 'huawei-music-desktop'),
    args: process.getuid?.() === 0 ? ['--no-sandbox'] : [], env });
  const page = await instance.firstWindow();
  await page.getByRole('button', { name: '打开官方登录' }).waitFor();
  const paths = await instance.evaluate(({ app }) => ({ application: app.getAppPath(), userData: app.getPath('userData') }));
  assert.equal(inside(directory, paths.application), true);
  assert.equal(inside(root, paths.userData), true, 'test accessed a non-isolated user directory');
  assert.equal(inside(directory, paths.userData), false, 'user data is inside the disposable extraction directory');
  return { page, paths };
}
try {
  await mkdir(env.HOME, { recursive: true });
  const firstDirectory = join(root, 'extract-first');
  const first = await launch(firstDirectory);
  const written = await first.page.evaluate(async () => {
    const settings = await window.desktop.settings.update({ quality: 'lossless', volume: 0.37 });
    const queue = await window.desktop.queue.save({ tracks: [{ id: 'synthetic-only', title: 'Re-extraction test', artists: [], available: true }], index: 0, positionSeconds: 42 });
    localStorage.setItem('synthetic-reextract-marker', 'PERSISTENT-TEST-ONLY');
    return settings.ok && queue.ok;
  });
  assert.equal(written, true);
  await instance.close(); instance = undefined;
  // Ensure the next launch cannot fall back to the previous program files.
  await rm(firstDirectory, { recursive: true, force: true });
  const secondDirectory = join(root, 'extract-second');
  const second = await launch(secondDirectory);
  assert.notEqual(first.paths.application, second.paths.application);
  assert.equal(first.paths.userData, second.paths.userData, 'data path changed with the extraction path');
  const restored = await second.page.evaluate(async () => ({ settings: await window.desktop.settings.get(),
    queue: await window.desktop.queue.load(), marker: localStorage.getItem('synthetic-reextract-marker') }));
  assert.equal(restored.settings.data.quality, 'lossless');
  assert.equal(restored.settings.data.volume, 0.37);
  assert.equal(restored.queue.data.tracks[0].id, 'synthetic-only');
  assert.equal(restored.queue.data.positionSeconds, 42);
  assert.equal(restored.marker, 'PERSISTENT-TEST-ONLY');
  await readFile(join(second.paths.userData, 'session.enc')).then(() => assert.fail('unexpected credential file'), error => assert.equal(error.code, 'ENOENT'));
  console.log(JSON.stringify({ platform: 'linux', actualPackagedElectron: true, programReextractedToDifferentPath: true,
    oldProgramFilesDeleted: true, userDataPathUnchanged: true, settingsAndQueueRestored: true,
    chromiumLocalStorageRestored: true, accountAccessed: false, windowsCredentialRestore: 'not-tested' }));
} finally {
  if (instance) await instance.close().catch(() => undefined);
  await rm(root, { recursive: true, force: true });
}
