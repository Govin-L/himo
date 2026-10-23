// Real Electron windows with an isolated profile and synthetic PCM audio; no account or ffmpeg.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as playwright } from 'playwright-core';

process.umask(0o077);
const profile = await mkdtemp(join(tmpdir(), 'huawei-desktop-lyrics-'));
// A ten-second, silent mono WAV keeps the test independent of external codecs and audio files.
const pcm = Buffer.alloc(44 + 8000 * 10 * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28); pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(pcm.length - 44, 40);
let app;
try {
  // Let Playwright load its Electron startup coordinator before the production entrypoint.
  app = await playwright.launch({
    args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), `--user-data-dir=${profile}`, 'out/main/index.js'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ ipcMain }) => {
    const tracks = ['a', 'b'].map(id => ({
      id: `desktop-${id}`, title: `桌面歌词测试 ${id.toUpperCase()}`,
      artists: [{ name: '离线合成数据' }], durationSeconds: 10, available: true,
    }));
    const handlers = {
      'auth:status': () => ({ authenticated: true, persistence: 'memory-only' }),
      'music:favorites': () => ({ tracks, total: 2, nextStart: 2, hasMore: false }),
      'music:favorites-summary': () => ({ total: 2 }),
      'music:favorite-state': () => ({ favorite: true }),
      'music:report-playback': () => undefined,
      'music:lyrics': (_event, input) => ({ synced: true, lines: [
        { timeMs: 0, text: input.trackId === 'desktop-a' ? '第一句歌词' : '另一首第一句', translation: 'First line',
          segments: input.trackId === 'desktop-a' ? [{ timeMs: 0, text: '第一' }, { timeMs: 1000, text: '句歌词' }] : undefined },
        { timeMs: 2000, text: '第二句歌词' },
        { timeMs: 4500, text: '' },
        { timeMs: 5000, text: '长句歌词随着播放进度平移，暂停后保持当前位置。'.repeat(5) },
      ] }),
    };
    for (const [channel, handler] of Object.entries(handlers)) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (...args) => ({ ok: true, data: handler(...args) }));
    }
  });
  await page.addInitScript(bytes => {
    const NativeAudio = window.Audio;
    window.__testAudioInstances = [];
    window.Audio = new Proxy(NativeAudio, {
      construct(target, args) {
        const audio = Reflect.construct(target, args);
        audio.muted = true;
        window.__testAudioInstances.push(audio);
        return audio;
      },
    });
    const data = Uint8Array.from(atob(bytes), character => character.charCodeAt(0));
    window.__lyricFixtureUrl = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
  }, pcm.toString('base64'));
  await page.reload();
  const audioUrl = await page.evaluate(() => window.__lyricFixtureUrl);
  await app.evaluate(({ ipcMain }, url) => {
    ipcMain.removeHandler('music:resolve-playback');
    ipcMain.handle('music:resolve-playback', () => ({ ok: true, data: { url, actualQuality: 'standard' } }));
  }, audioUrl);
  const firstRow = page.getByRole('button', { name: /^桌面歌词测试 A/ });
  await firstRow.waitFor();
  await firstRow.press('Enter');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.evaluate(() => {
    localStorage.setItem('desktop-lyrics-owner-only', 'main-window');
    window.__testAudioInstances[0].currentTime = 0;
  });
  const opening = app.waitForEvent('window');
  await page.getByRole('button', { name: '桌面歌词', exact: true }).click();
  const overlay = await opening;
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '第一句歌词' }).waitFor();
  const playback = value => document.querySelector('.desktop-lyrics-window')?.dataset.state === value;
  await overlay.waitForFunction(playback, 'paused');
  assert.equal(await overlay.locator('.desktop-lyrics-secondary').innerText(), 'First line');
  const boundary = await overlay.evaluate(() => ({
    api: Object.keys(window.desktopLyricsOverlay).sort(), business: typeof window.desktop,
    node: typeof process, localHistory: localStorage.getItem('desktop-lyrics-owner-only'),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  assert.deepEqual(boundary, {
    api: ['close', 'getPreferences', 'getState', 'move', 'onPreferences', 'onState', 'openSettings', 'updatePreferences'],
    business: 'undefined', node: 'undefined',
    localHistory: null, background: 'rgba(0, 0, 0, 0)',
  });
  const nativeWindow = await app.evaluate(({ BrowserWindow }) => {
    const overlay = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#desktop-lyrics'));
    return { top: overlay.isAlwaysOnTop(), independent: overlay.getParentWindow() === null,
      sandbox: overlay.webContents.getLastWebPreferences().sandbox };
  });
  assert.deepEqual(nativeWindow, { top: true, independent: true, sandbox: true });
  // Page-driven dragging, font controls, click-through lock and main-window recovery. An OS drag
  // region would swallow real mouse moves on macOS, so hovering could never keep the toolbar open.
  assert.equal(await overlay.locator('.desktop-lyrics-window').evaluate(node => getComputedStyle(node).webkitAppRegion), 'none');
  assert.equal(await overlay.locator('.desktop-lyrics-window').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
  const lyricPosition = () => app.evaluate(({ BrowserWindow }) => {
    const { x, y } = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#desktop-lyrics')).getBounds();
    return { x, y };
  });
  const beforeDrag = await lyricPosition();
  const lyricBox = await overlay.locator('.desktop-lyrics-lines').boundingBox();
  await overlay.mouse.move(lyricBox.x + 40, lyricBox.y + 10);
  await overlay.mouse.down();
  await overlay.mouse.move(lyricBox.x + 70, lyricBox.y + 30);
  await overlay.mouse.up();
  let afterDrag = beforeDrag;
  for (let attempt = 0; attempt < 40 && afterDrag.x === beforeDrag.x && afterDrag.y === beforeDrag.y; attempt++) {
    await overlay.waitForTimeout(50);
    afterDrag = await lyricPosition();
  }
  assert.deepEqual(afterDrag, { x: beforeDrag.x + 30, y: beforeDrag.y + 20 }, 'dragging the lyrics did not move the window by the pointer delta');
  await overlay.locator('.desktop-lyrics-window').hover();
  await overlay.getByRole('button', { name: '增大歌词字号' }).click();
  await overlay.waitForFunction(async () => (await window.desktopLyricsOverlay.getPreferences()).fontSize === 38);
  // Toolbar opacity fades only the lyric text; its settings button opens the style page in the main window.
  await overlay.getByRole('button', { name: '降低歌词不透明度' }).click();
  await overlay.waitForFunction(() => getComputedStyle(document.querySelector('.desktop-lyrics-current')).opacity === '0.9');
  await overlay.getByRole('button', { name: '歌词设置' }).click();
  await page.getByText('实时预览').waitFor();
  await page.getByRole('button', { name: '歌词配色 天青', exact: true }).click();
  await overlay.waitForFunction(() => getComputedStyle(document.querySelector('.desktop-lyrics-window'))
    .getPropertyValue('--lyric-played').trim() === '#6fd3ff');
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await overlay.locator('.desktop-lyrics-window').hover();
  await mkdir('release/qa', { recursive: true });
  await overlay.screenshot({ path: 'release/qa/macos-desktop-lyrics-toolbar-synthetic.png', omitBackground: true });
  const moved = await app.evaluate(({ BrowserWindow, screen }) => {
    const lyric = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#desktop-lyrics'));
    const area = screen.getDisplayMatching(lyric.getBounds()).workArea;
    lyric.setPosition(area.x + 40, area.y + 90);
    const original = lyric.setIgnoreMouseEvents.bind(lyric);
    globalThis.__lyricIgnoreCalls = [];
    lyric.setIgnoreMouseEvents = (ignore, options) => {
      globalThis.__lyricIgnoreCalls.push(ignore);
      original(ignore, options);
    };
    const { x, y } = lyric.getBounds();
    return { x, y };
  });
  await page.waitForFunction(async expected => {
    const preferences = await window.desktop.desktopLyrics.getPreferences();
    return preferences.position?.x === expected.x && preferences.position?.y === expected.y;
  }, moved);
  await overlay.locator('.desktop-lyrics-window').hover();
  await overlay.getByRole('button', { name: '锁定桌面歌词' }).click();
  await page.getByRole('button', { name: '解锁桌面歌词', exact: true }).waitFor();
  await overlay.waitForFunction(() => document.querySelector('.desktop-lyrics-window').classList.contains('locked'));
  // The toolbar fades out over 160 ms; locked lyrics must end up exposing no controls.
  await overlay.locator('.desktop-lyrics-header').waitFor({ state: 'hidden', timeout: 2000 });
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => {
    const lyric = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#desktop-lyrics'));
    return { ignore: globalThis.__lyricIgnoreCalls.at(-1), focusable: lyric.isFocusable() };
  }), { ignore: true, focusable: false });
  await page.getByRole('button', { name: '解锁桌面歌词', exact: true }).click();
  await page.getByRole('button', { name: '锁定桌面歌词', exact: true }).waitFor();
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => {
    const lyric = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#desktop-lyrics'));
    return { ignore: globalThis.__lyricIgnoreCalls.at(-1), focusable: lyric.isFocusable() };
  }), { ignore: false, focusable: true });

  await page.evaluate(() => Promise.all([
    window.desktop.desktopLyrics.setVisible(true), window.desktop.desktopLyrics.setVisible(true),
  ]));
  assert.equal(app.windows().length, 2, 'duplicate opens created multiple lyric windows');
  await page.evaluate(() => { window.__testAudioInstances[0].currentTime = 7.5; });
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '长句歌词随着播放进度平移' }).waitFor();
  await overlay.waitForFunction(() => {
    const line = document.querySelector('.desktop-lyrics-current .desktop-lyrics-text');
    return new DOMMatrixReadOnly(getComputedStyle(line).transform).m41 < -40;
  });
  assert.equal(await overlay.evaluate(async () => {
    const line = document.querySelector('.desktop-lyrics-current .desktop-lyrics-text');
    const target = line.style.transform;
    for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
    return line.style.transform === target;
  }), true, 'paused lyrics kept scrolling');
  await page.evaluate(() => { window.__testAudioInstances[0].currentTime = 2.5; });
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '第二句歌词' }).waitFor();
  // A timed blank line is an interlude: preview the next sung line instead of "no lyrics".
  await page.evaluate(() => { window.__testAudioInstances[0].currentTime = 4.7; });
  await overlay.locator('.desktop-lyrics-lines.waiting .desktop-lyrics-secondary').filter({ hasText: '间奏' }).waitFor();
  assert.match(await overlay.locator('.desktop-lyrics-current').innerText(), /^长句歌词随着播放进度平移/);
  await page.evaluate(() => { window.__testAudioInstances[0].currentTime = 1.6; });
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '第一句歌词' }).waitFor();
  await page.getByRole('button', { name: '歌词', exact: true }).click();
  await page.getByRole('button', { name: '沉浸歌词', exact: true }).click();
  // 提前 adds +0.5 s, so the line due at 2 s is already current at 1.6 s; 延后 takes it back.
  await page.getByRole('button', { name: '歌词提前', exact: true }).click();
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '第二句歌词' }).waitFor();
  await page.getByRole('button', { name: '歌词延后', exact: true }).click();
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '第一句歌词' }).waitFor();
  await page.getByRole('button', { name: '退出歌词页', exact: true }).click();
  await page.evaluate(() => { window.__testAudioInstances[0].currentTime = 0; });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await overlay.waitForFunction(playback, 'playing');
  await page.evaluate(() => { window.__testAudioInstances[0].dispatchEvent(new Event('waiting')); });
  await overlay.waitForFunction(playback, 'buffering');
  await page.evaluate(() => { window.__testAudioInstances[0].dispatchEvent(new Event('playing')); });
  await overlay.waitForFunction(playback, 'playing');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().endsWith('#desktop-lyrics')).hide();
  });
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '第二句歌词' }).waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().endsWith('#desktop-lyrics')).show();
  });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await overlay.waitForFunction(playback, 'paused');
  await page.getByRole('button', { name: '下一首', exact: true }).click();
  await overlay.locator('.desktop-lyrics-current').filter({ hasText: '另一首第一句' }).waitFor();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__testAudioInstances.length), 1, 'the overlay created another player');
  await overlay.locator('.desktop-lyrics-window').hover();
  const closed = overlay.waitForEvent('close');
  await overlay.getByRole('button', { name: '关闭桌面歌词' }).click();
  await closed;
  await page.waitForFunction(() => document.querySelector('[aria-label="桌面歌词"]').getAttribute('aria-pressed') === 'false');
  const reopening = app.waitForEvent('window');
  await page.getByRole('button', { name: '桌面歌词', exact: true }).click();
  const reopened = await reopening;
  await reopened.locator('.desktop-lyrics-current').filter({ hasText: '另一首第一句' }).waitFor();
  await reopened.waitForFunction(playback, 'paused');
  const closedAgain = reopened.waitForEvent('close');
  await page.getByRole('button', { name: '桌面歌词', exact: true }).click();
  await closedAgain;
  assert.equal(app.windows().length, 1, 'closing the overlay also closed the player');
  const finalOpening = app.waitForEvent('window');
  await page.getByRole('button', { name: '桌面歌词', exact: true }).click();
  const finalOverlay = await finalOpening;
  await finalOverlay.locator('.desktop-lyrics-current').filter({ hasText: '另一首第一句' }).waitFor();
  await page.getByRole('button', { name: '锁定桌面歌词', exact: true }).click();
  await finalOverlay.waitForFunction(() => document.querySelector('.desktop-lyrics-window').classList.contains('locked'));
  await finalOverlay.screenshot({ path: 'release/qa/macos-desktop-lyrics-synthetic.png', omitBackground: true });
  const ownerClosedLyrics = finalOverlay.waitForEvent('close');
  await page.close();
  await ownerClosedLyrics;
  assert.equal(app.windows().length, 0, 'closing the player left an orphan lyric window');

  // A fresh process must restore saved position/font/lock, not just a renderer cache.
  await app.close();
  app = await playwright.launch({
    args: [`--user-data-dir=${profile}`, 'out/main/index.js'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
  const restoredPage = await app.firstWindow();
  await restoredPage.waitForLoadState('domcontentloaded');
  const saved = await restoredPage.evaluate(async () => (await window.desktop.settings.get()).data.desktopLyrics);
  assert.equal(saved.fontSize, 38);
  assert.equal(saved.locked, true);
  assert.deepEqual(saved.position, moved);
  assert.deepEqual([saved.opacity, saved.playedColor], [0.9, '#6fd3ff']);
  const restoring = app.waitForEvent('window');
  await restoredPage.getByRole('button', { name: '桌面歌词', exact: true }).click();
  const restoredOverlay = await restoring;
  // Polled from the window's first document, before React has rendered the lyrics root.
  await restoredOverlay.waitForFunction(() => document.querySelector('.desktop-lyrics-window')?.classList.contains('locked'));
  const restoredBounds = await app.evaluate(({ BrowserWindow }) => {
    const { x, y } = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#desktop-lyrics')).getBounds();
    return { x, y };
  });
  assert.deepEqual(restoredBounds, moved);
  await restoredPage.getByRole('button', { name: '解锁桌面歌词', exact: true }).click();
  await restoredOverlay.waitForFunction(() => !document.querySelector('.desktop-lyrics-window').classList.contains('locked'));
  const restoringClosed = restoredOverlay.waitForEvent('close');
  await restoredPage.getByRole('button', { name: '桌面歌词', exact: true }).click();
  await restoringClosed;
  await restoredPage.evaluate(() => window.desktop.settings.update({ desktopLyrics: { position: { x: 99999, y: 99999 } } }));
  await app.close();
  app = await playwright.launch({
    args: [`--user-data-dir=${profile}`, 'out/main/index.js'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
  const recoveredPage = await app.firstWindow();
  await recoveredPage.waitForLoadState('domcontentloaded');
  const recovering = app.waitForEvent('window');
  await recoveredPage.getByRole('button', { name: '桌面歌词', exact: true }).click();
  await recovering;
  assert.equal(await app.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#desktop-lyrics')).getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    return bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width
      && bounds.y + bounds.height <= area.y + area.height;
  }), true, 'a disconnected display left the lyrics off screen');

  console.log('Desktop lyrics passed: transparent subtitles, native click-through lock/unlock, font/position/lock process persistence, screen recovery, single player and playback sync.');
} finally {
  if (app) await app.close();
  // Keep the isolated profile on this developer run; it contains only synthetic fixtures.
}
