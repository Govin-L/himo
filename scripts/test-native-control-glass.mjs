// macOS 26+ only. Synthetic data, real Cocoa geometry, no automated UI clicks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

if (process.platform !== 'darwin') throw new Error('局部原生玻璃检查需要 macOS 26+。');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(join(tmpdir(), 'himo-control-glass-check-'));
const qa = join(repo, 'release/qa');
await mkdir(qa, { recursive: true });
const entry = join(root, 'entry.mjs');
await writeFile(entry, `
import {pathToFileURL} from 'node:url';
globalThis.__controlGlassInstances=[];
const dlopen=process.dlopen;
process.dlopen=function(module,path,...rest){
  const loaded=dlopen.call(this,module,path,...rest);
  if(path.endsWith('/native-control-glass.node')){
    const native=module.exports;
    module.exports={
      create(handle){
        const controller=native.create(handle);
        globalThis.__controlGlassInstances.push({native,controller});
        return controller;
      },
      update:native.update,destroy:native.destroy,describe:native.describe,
    };
  }
  return loaded;
};
await import(pathToFileURL(${JSON.stringify(join(repo, 'scripts/preview-mock.mjs'))}).href);
`);

let app;
const errors = [];
const evidence = [];
try {
  app = await electron.launch({ args: ['--user-data-dir=' + join(root, 'profile'), entry] });
  let page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.favorites-library .track-row').first().waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('native-control-glass'));
  const snapshot = async () => ({
    native: await app.evaluate(({ BrowserWindow }) => {
      const instance = globalThis.__controlGlassInstances.at(-1);
      const owner = BrowserWindow.getAllWindows()[0];
      return { ...instance.native.describe(instance.controller), instances: globalThis.__controlGlassInstances.length,
        zoom: owner.webContents.getZoomFactor(), visible: owner.isVisible() };
    }),
    dom: await page.evaluate(() => {
      const read = selector => {
        const node = document.querySelector(selector);
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          background: style.backgroundColor, image: style.backgroundImage, blur: style.backdropFilter };
      };
      return { player: read('.player'), tabs: read('.bottom-nav'), search: read('.global-search'), dpr: devicePixelRatio,
        boundary: { process: typeof process, require: typeof require } };
    }),
  });
  const controls = ['player', 'tabs', 'search'];
  const aligned = async label => {
    const deadline = Date.now() + 4000;
    let state;
    while (Date.now() < deadline) {
      state = await snapshot();
      const matches = controls.every(key => !state.native[key].hidden &&
        ['x', 'y', 'width', 'height'].every(field => Math.abs(state.native[key][field] - state.dom[key][field] * state.native.zoom) < 0.6));
      if (matches) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(state.native.viewCount, 3, label);
    assert.equal(state.native.belowWebContent, true, `${label}: glass must stay below Chromium's compositor`);
    for (const key of controls) {
      assert.equal(state.native[key].nativeGlass, true, label);
      assert.equal(state.native[key].attached, true, label);
      assert.equal(state.native[key].hidden, false, label);
      assert.equal(state.native[key].passesMouseEvents, true, label);
      for (const field of ['x', 'y', 'width', 'height'])
        assert.ok(Math.abs(state.native[key][field] - state.dom[key][field] * state.native.zoom) < 0.6, `${label}: ${key}.${field}`);
      assert.equal(state.dom[key].background, 'rgba(0, 0, 0, 0)', label);
      assert.equal(state.dom[key].image, 'none', label);
      assert.equal(state.dom[key].blur, 'none', label);
    }
    assert.deepEqual(state.dom.boundary, { process: 'undefined', require: 'undefined' });
    evidence.push({ label, ...state });
    return state;
  };
  const expanded = await aligned('initial');

  // Scrolling folds the tabs into a bubble beside the player and the search into a circle.
  const main = page.locator('.main-content');
  const scrollTo = target => main.evaluate(async (element, end) => {
    const step = end > element.scrollTop ? 40 : -40;
    for (let y = element.scrollTop; step > 0 ? y < end : y > end; y += step) { element.scrollTop = y; await new Promise(requestAnimationFrame); }
    element.scrollTop = end;
  }, target);
  const settled = () => page.waitForFunction(() => !document.getAnimations().some(animation =>
    animation.playState === 'running' && animation.effect?.target?.closest('.dock, .global-search')), null, { timeout: 8000 });
  await scrollTo(240);
  await page.waitForFunction(() => document.querySelector('.app-shell').classList.contains('controls-collapsed'));
  await settled();
  const folded = await aligned('folded');
  for (const key of ['tabs', 'search']) {
    assert.ok(Math.abs(folded.native[key].width - folded.native[key].height) < 0.6, `${key} folds into a circle`);
    assert.ok(Math.abs(folded.native[key].cornerRadius - folded.native[key].height / 2) < 0.6, `${key} circle radius`);
  }
  assert.ok(Math.abs(folded.native.tabs.y - folded.native.player.y) < 0.6, 'bubble shares the player row');
  const icon = await page.evaluate(() => {
    const glyph = document.querySelector('.global-search svg').getBoundingClientRect();
    const circle = document.querySelector('.global-search').getBoundingClientRect();
    return { width: glyph.width, inside: glyph.left >= circle.left && glyph.right <= circle.right };
  });
  assert.ok(icon.width >= 16 && icon.inside, `folded search keeps its icon inside the circle (${JSON.stringify(icon)})`);
  assert.ok(folded.native.player.y > expanded.native.player.y + 60, 'player dropped into the tab row');

  // Slowed unfold: each native frame must track the moving DOM, not stall where observers last fired.
  await page.evaluate(() => document.querySelector('.app-shell').style.setProperty('--fold-time', '3s'));
  await scrollTo(200);
  await page.waitForFunction(() => !document.querySelector('.app-shell').classList.contains('controls-collapsed'));
  const describe = () => app.evaluate(() => {
    const instance = globalThis.__controlGlassInstances.at(-1);
    return instance.native.describe(instance.controller);
  });
  const tracked = [];
  let elapsed = 0;
  for (const at of [600, 900, 1300]) {
    await page.waitForTimeout(at - elapsed);
    elapsed = at;
    const before = await describe();
    const dom = (await snapshot()).dom;
    const after = await describe();
    for (const [key, field] of [['player', 'y'], ['tabs', 'x'], ['tabs', 'width'], ['search', 'width']]) {
      const low = Math.min(before[key][field], after[key][field]) - 1;
      const high = Math.max(before[key][field], after[key][field]) + 1;
      assert.ok(dom[key][field] >= low && dom[key][field] <= high, `mid-unfold ${key}.${field}: DOM ${dom[key][field]} outside native ${low}..${high}`);
    }
    tracked.push({ at, playerY: dom.player.y, tabsX: dom.tabs.x, nativePlayerY: after.player.y, nativeTabsX: after.tabs.x });
  }
  const midway = tracked[1];
  assert.ok(midway.playerY < folded.dom.player.y - 5 && midway.playerY > expanded.dom.player.y + 5, 'sample was taken mid-animation');
  evidence.push({ label: 'slowed-unfold-tracking', tracked });
  await settled();
  await page.evaluate(() => document.querySelector('.app-shell').style.removeProperty('--fold-time'));
  await scrollTo(0);
  await aligned('unfolded');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(960, 640));
  await page.waitForFunction(() => innerWidth === 960 && innerHeight === 640);
  await aligned('minimum-window');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(0.9));
  await aligned('renderer-zoom');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await aligned('zoom-restored');
  await page.evaluate(() => document.documentElement.style.setProperty('--fs-scale', '1.2'));
  await aligned('font-scale');
  await page.evaluate(() => document.documentElement.style.setProperty('--fs-scale', '1'));
  await page.evaluate(() => { document.querySelector('.player').hidden = true; });
  await page.waitForFunction(() => document.querySelector('.player').getBoundingClientRect().height === 0);
  const hiddenDeadline = Date.now() + 4000;
  let hidden;
  do {
    hidden = await app.evaluate(() => {
      const instance = globalThis.__controlGlassInstances.at(-1);
      return instance.native.describe(instance.controller);
    });
    if (hidden.player.hidden) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() < hiddenDeadline);
  assert.equal(hidden.player.hidden, true);
  assert.equal(hidden.tabs.hidden, false);
  assert.equal(hidden.search.hidden, false);
  evidence.push({ label: 'player-hidden', native: hidden });
  await page.evaluate(() => { document.querySelector('.player').hidden = false; });
  await aligned('player-restored');
  const invalid = await page.evaluate(async () => {
    try { await window.desktop.window.syncGlassControls({ player: { x: NaN, y: 0, width: 100, height: 30 }, tabs: null, search: null }); }
    catch { return true; }
    return false;
  });
  assert.equal(invalid, true, 'invalid geometry reached the native addon');
  await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const entered = new Promise(resolve => window.once('enter-full-screen', resolve));
    window.setFullScreen(true); await entered;
  });
  await aligned('fullscreen');
  await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const left = new Promise(resolve => window.once('leave-full-screen', resolve));
    window.setFullScreen(false); await left;
    window.setContentSize(1180, 760);
  });
  await aligned('fullscreen-restored');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains('native-control-glass'));
  assert.equal((await aligned('reload')).native.instances, 1);
  const nextWindow = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow, app }) => { BrowserWindow.getAllWindows()[0].destroy(); app.emit('activate'); });
  page = await nextWindow;
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.documentElement.classList.contains('native-control-glass'));
  assert.equal((await aligned('reopen')).native.instances, 2);
  const previous = await app.evaluate(() => {
    const instance = globalThis.__controlGlassInstances[0];
    return instance.native.describe(instance.controller);
  });
  assert.equal(previous.viewCount, 0);
  assert.equal(previous.player.attached, false);
  assert.equal(previous.tabs.attached, false);
  assert.equal(previous.search.attached, false);
  assert.deepEqual(errors, []);
  const swift = join(root, 'window.swift');
  await writeFile(swift, `import CoreGraphics\nimport Foundation\nlet pid=Int(CommandLine.arguments[1])!\nlet rows=CGWindowListCopyWindowInfo([.optionAll,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []\nlet found=rows.first { ($0[kCGWindowOwnerPID as String] as? Int)==pid && ($0[kCGWindowName as String] as? String)=="himo" }!\nprint(found[kCGWindowNumber as String]!)\n`);
  const id = execFileSync('swift', ['-module-cache-path', join(root, 'swift-cache'), swift, String(app.process().pid)], { encoding: 'utf8' }).trim();
  const screenshot = join(qa, 'macOS-native-control-glass.png');
  execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', id, screenshot]);
  await writeFile(join(qa, 'macOS-native-control-glass.json'), JSON.stringify({ evidence, previous, errors, screenshot }, null, 2));
  console.log(JSON.stringify({ nativeControls: 3, checks: evidence.map(item => item.label), disposedViews: previous.viewCount,
    geometryMatchesDOM: true, foldTracksAnimation: true, cssBlurRemoved: true, mouseEventsPassThrough: true, errors, screenshot }));
} finally { await app?.close(); }
