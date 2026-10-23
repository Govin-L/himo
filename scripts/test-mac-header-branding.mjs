// Real macOS startup with synthetic data. Launch in the background; never click or capture UI.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

assert.equal(process.platform, 'darwin', 'This check requires macOS.');
const mode = process.argv[2] ?? 'all';
assert.ok(['all', 'layout', 'branding'].includes(mode));
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(join(tmpdir(), 'himo-header-branding-'));
const evidencePath = join(root, 'evidence.json');
const pidPath = join(root, 'pid');
const entry = join(root, 'entry.mjs');
const measure = () => {
  const rect = selector => {
    const box = document.querySelector(selector).getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
  };
  return { width: innerWidth, height: innerHeight, header: rect('.app-header'), mark: rect('.brand-mark'),
    brand: rect('.brand'), title: rect('.topbar h1'), subtitle: rect('.page-sub'),
    notice: rect('.notice'), card: rect('.overview-card'), search: rect('.global-search'), accounts: rect('.account-actions') };
};
await writeFile(entry, `
import { app, BrowserWindow, nativeImage, Tray } from 'electron';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const evidencePath = ${JSON.stringify(evidencePath)};
await writeFile(${JSON.stringify(pidPath)}, String(process.pid));
const trayBytes = await readFile(${JSON.stringify(join(repo, 'build/tray.png'))});
const iconBytes = await readFile(${JSON.stringify(join(repo, 'build/icon.png'))});
const hash = image => createHash('sha256').update(image.toBitmap()).digest('hex');
let dock = null, trayImage = null, tray = null;
const setIcon = app.dock.setIcon.bind(app.dock);
app.dock.setIcon = image => {
  const decoded = typeof image === 'string' ? nativeImage.createFromPath(image) : image;
  dock = { size: decoded.getSize(), matchesArtwork: hash(decoded) === hash(nativeImage.createFromBuffer(iconBytes)) };
  setIcon(image);
};
const fromBuffer = nativeImage.createFromBuffer;
nativeImage.createFromBuffer = (buffer, options) => {
  const image = fromBuffer(buffer, options);
  if (buffer.equals(trayBytes)) trayImage = image;
  return image;
};
const tooltip = Tray.prototype.setToolTip;
Tray.prototype.setToolTip = function(text) { tray = this; return tooltip.call(this, text); };
// macOS open -g and showInactive keep the user's current application in front.
BrowserWindow.prototype.show = function() { this.showInactive(); };
BrowserWindow.prototype.focus = function() {};
app.focus = function() {};
const guard = setTimeout(() => app.exit(2), 45000);
const capture = async () => {
  let window;
  for (let tries = 0; tries < 200; tries++) {
    window = BrowserWindow.getAllWindows().find(candidate => candidate.getTitle() === 'himo');
    if (window && !window.webContents.isLoadingMainFrame()
      && await window.webContents.executeJavaScript('!!document.querySelector(".library-overview")').catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!window) throw new Error('The preview did not create its window.');
  window.webContents.setBackgroundThrottling(false);
  const layouts = [];
  for (const [width, height, font] of [[1180, 760, 1], [960, 640, 1], [1440, 900, 1], [960, 640, 1.2]]) {
    window.setContentSize(width, height);
    await window.webContents.executeJavaScript('document.documentElement.style.setProperty("--fs-scale", "' + font + '")');
    await new Promise(resolve => setTimeout(resolve, 200));
    layouts.push(await window.webContents.executeJavaScript(${JSON.stringify(`(${measure.toString()})()`)}));
  }
  await writeFile(evidencePath, JSON.stringify({ pid: process.pid, packaged: app.isPackaged, dock,
    tray: trayImage && { size: trayImage.getSize(), template: trayImage.isTemplateImage(),
      matchesArtwork: hash(trayImage) === hash(fromBuffer(trayBytes, { scaleFactor: 2 })) },
    trayAlive: !!tray && !tray.isDestroyed(), layouts, trafficLights: window.getWindowButtonPosition(), focused: window.isFocused() }));
};
await import(pathToFileURL(${JSON.stringify(join(repo, 'scripts/preview-mock.mjs'))}).href);
app.whenReady().then(capture).catch(async error => {
  await writeFile(evidencePath, JSON.stringify({ pid: process.pid, error: error.stack }));
});
`);

let pid;
try {
  execFileSync('/usr/bin/open', ['-g', '-n', '-a', resolve(dirname(electron), '../..'), '--args', '--user-data-dir=' + join(root, 'profile'), entry]);
  let evidence;
  for (let tries = 0; tries < 350; tries++) {
    if (!pid) pid = await readFile(pidPath, 'utf8').then(Number, () => undefined);
    const bytes = await readFile(evidencePath, 'utf8').catch(() => null);
    if (bytes) { evidence = JSON.parse(bytes); break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(evidence, 'Background preview did not provide evidence in time.');
  assert.equal(evidence.error, undefined, evidence.error);
  const frontProbe = join(root, 'front.swift');
  await writeFile(frontProbe, 'import AppKit\nprint(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0)\n');
  const frontPid = Number(execFileSync('swift', ['-module-cache-path', join(root, 'swift-cache'), frontProbe], { encoding: 'utf8' }).trim());
  assert.notEqual(frontPid, pid, 'The check must not take the foreground.');
  assert.equal(evidence.focused, false);
  assert.equal(evidence.packaged, false);
  if (mode !== 'branding') {
    for (const layout of evidence.layouts) {
      // User feedback rejects the previous two-row chrome; branding belongs to the window toolbar.
      const center = box => box.y + box.height / 2;
      assert.ok(Math.abs(center(layout.brand) - evidence.trafficLights.y - 7) < 0.6,
        `Window controls and brand must share one row (${center(layout.brand)} vs ${evidence.trafficLights.y + 7}).`);
      assert.ok(layout.header.y <= 10 && layout.header.height <= 56, 'The toolbar must stay compact.');
      assert.ok(layout.brand.x >= evidence.trafficLights.x + 70 && layout.brand.x <= 108, 'Brand must sit beside the window controls.');
      assert.ok(layout.mark.width <= 22 && layout.brand.height <= 24, 'Window branding must be smaller than the page heading.');
      for (const key of ['subtitle', 'notice', 'card'])
        assert.ok(Math.abs(layout.title.x - layout[key].x) < 0.6,
          `${layout.width}x${layout.height}: title x=${layout.title.x}, ${key} x=${layout[key].x}`);
      assert.ok(layout.title.y >= layout.header.bottom + 12, 'Page heading must remain separate from window chrome.');
      assert.ok(Math.abs(layout.search.y + layout.search.height / 2 - layout.brand.y - layout.brand.height / 2) < 0.6);
      assert.ok(Math.abs(center(layout.accounts) - center(layout.brand)) < 0.6);
      assert.ok(layout.search.right < layout.accounts.x, 'Search must not overlap the account buttons.');
    }
  }
  if (mode !== 'layout') {
    assert.ok(evidence.dock?.matchesArtwork, 'Development Dock must receive the himo artwork.');
    assert.deepEqual(evidence.dock.size, { width: 512, height: 512 });
    assert.equal(evidence.trayAlive, true);
    assert.ok(evidence.tray?.matchesArtwork, 'Menu bar must use the same himo artwork.');
    assert.deepEqual(evidence.tray.size, { width: 16, height: 16 });
    assert.equal(evidence.tray.template, false, 'The colored himo artwork must not be converted into a template.');
  }
  console.log(JSON.stringify({ mode, layoutsChecked: evidence.layouts.length, background: true,
    dock: evidence.dock, tray: evidence.tray, evidencePath }));
} finally {
  if (pid) { try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
}
