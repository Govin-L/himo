import { app, BrowserWindow, ipcMain, screen, session } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { channels } from '../shared/channels';
import type { DesktopLyricsPreferencePatch, DesktopLyricsState } from '../shared/types';
import { isAllowedSender } from './auth-manager';
import { DESKTOP_LYRIC_PATCH_KEYS, sanitizeDesktopLyrics } from './settings.mjs';
import { loadSettings, updateSettings } from './storage';
import { APP_DISPLAY_NAME } from '../shared/app-name.mjs';

// Playback stays in the main renderer; this window receives only a display projection.
export async function registerDesktopLyrics(owner: BrowserWindow): Promise<void> {
  let preferences = (await loadSettings()).desktopLyrics;
  if (owner.isDestroyed()) return;
  let window: BrowserWindow | null = null;
  let state: DesktopLyricsState | null = null;
  let positionTimer: ReturnType<typeof setTimeout> | undefined;
  let closing: Promise<void> | null = null;
  let quitting = false;
  const rendererPath = join(__dirname, '../renderer/index.html');
  const rendererUrl = `${pathToFileURL(rendererPath).href}#desktop-lyrics`;
  const ownChannels = [
    channels.desktopLyricsSetVisible, channels.desktopLyricsGetVisible, channels.desktopLyricsPublish,
    channels.desktopLyricsReadState, channels.desktopLyricsClose, channels.desktopLyricsMove, channels.desktopLyricsOpenSettings,
    channels.desktopLyricsGetPreferences, channels.desktopLyricsUpdatePreferences,
  ];
  const visible = () => !!window && !window.isDestroyed();
  const notifyVisibility = () => {
    if (!owner.isDestroyed()) owner.webContents.send(channels.desktopLyricsVisibility, visible());
  };
  const notifyPreferences = () => {
    if (!owner.isDestroyed()) owner.webContents.send(channels.desktopLyricsPreferences, preferences);
    if (visible()) window!.webContents.send(channels.desktopLyricsPreferences, preferences);
  };
  const guardOwner = (event: Electron.IpcMainInvokeEvent) => {
    if (!isAllowedSender(owner, event)) throw new Error('IPC 来源不受信任');
  };
  const guardOverlay = (event: Electron.IpcMainInvokeEvent) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.url !== rendererUrl) throw new Error('IPC 来源不受信任');
  };
  const guardControls = (event: Electron.IpcMainInvokeEvent) => {
    if (!isAllowedSender(owner, event)) guardOverlay(event);
  };
  const fitBounds = (position = preferences.position) => {
    // Toolbar and padding, both lines at line-height 1.35 plus room for the optional background plate.
    const height = Math.round(preferences.fontSize * 1.4 * (1 + preferences.secondaryScale) + 84);
    const area = screen.getDisplayMatching(position ? { ...position, width: 760, height } : owner.getBounds()).workArea;
    const width = Math.min(760, area.width - 24);
    return {
      width, height,
      x: Math.round(Math.max(area.x, Math.min(position?.x ?? area.x + (area.width - width) / 2, area.x + area.width - width))),
      y: Math.round(Math.max(area.y, Math.min(position?.y ?? area.y + area.height - height - 24, area.y + area.height - height))),
    };
  };
  const positionOf = (target: BrowserWindow) => {
    const { x, y } = target.getBounds();
    return { x, y };
  };
  const rememberPosition = async (target: BrowserWindow) => {
    clearTimeout(positionTimer);
    if (target.isDestroyed()) return;
    preferences = (await updateSettings({ desktopLyrics: { position: positionOf(target) } })).desktopLyrics;
    notifyPreferences();
  };
  const saveFailed = () => {
    if (!owner.isDestroyed()) owner.webContents.send(channels.appNotice, '桌面歌词位置保存失败，本次位置可能无法恢复。');
  };
  const close = (): Promise<void> => {
    if (closing) return closing;
    const target = window;
    if (!target || target.isDestroyed()) return Promise.resolve();
    closing = rememberPosition(target).catch(saveFailed).finally(() => {
      if (!target.isDestroyed()) target.destroy();
      closing = null;
    });
    return closing;
  };
  const applyPreferences = () => {
    if (!visible()) return;
    const target = window!;
    target.setBounds(fitBounds(positionOf(target)));
    target.setFocusable(!preferences.locked);
    target.setIgnoreMouseEvents(preferences.locked, { forward: true });
  };
  const beforeQuit = (event: Electron.Event) => {
    if (!visible() || quitting) return;
    event.preventDefault();
    quitting = true;
    void close().finally(() => app.quit());
  };
  app.on('before-quit', beforeQuit);

  ipcMain.handle(channels.desktopLyricsGetPreferences, event => { guardControls(event); return preferences; });
  ipcMain.handle(channels.desktopLyricsUpdatePreferences, async (event, input: DesktopLyricsPreferencePatch) => {
    guardControls(event);
    // The settings sanitiser is the only rule set: a patch is accepted when it survives it unchanged.
    const patch = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const clean: Record<string, unknown> = sanitizeDesktopLyrics(patch, preferences);
    const keys = Object.keys(patch);
    if (!keys.length || keys.some(key => !DESKTOP_LYRIC_PATCH_KEYS.includes(key) || clean[key] !== patch[key])) {
      throw new Error('歌词设置无效');
    }
    preferences = (await updateSettings({ desktopLyrics: {
      ...input, ...(visible() ? { position: positionOf(window!) } : {}),
    } })).desktopLyrics;
    applyPreferences();
    notifyPreferences();
    return preferences;
  });
  ipcMain.handle(channels.desktopLyricsGetVisible, event => { guardOwner(event); return visible(); });
  ipcMain.handle(channels.desktopLyricsSetVisible, async (event, show: boolean) => {
    guardOwner(event);
    if (typeof show !== 'boolean') throw new Error('歌词窗口参数无效');
    if (!show) { await close(); return false; }
    if (closing) await closing;
    if (visible()) return true;
    const isolated = session.fromPartition('desktop-lyrics');
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      callback({ cancel: !details.url.startsWith('file:') });
    });
    const overlay = new BrowserWindow({
      ...fitBounds(), title: `${APP_DISPLAY_NAME} · 桌面歌词`,
      frame: false, transparent: true, backgroundColor: '#00000000', resizable: false,
      alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false,
      minimizable: false, maximizable: false, fullscreenable: false,
      // The overlay is shown inactive; on macOS the first click would otherwise only focus it.
      acceptFirstMouse: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        partition: 'desktop-lyrics', additionalArguments: ['--desktop-lyrics-overlay'],
        contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      },
    });
    window = overlay;
    state = null;
    applyPreferences();
    owner.webContents.setBackgroundThrottling(false);
    overlay.setMenu(null);
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const blockNavigation = (navigation: Electron.Event, url: string) => {
      if (url !== rendererUrl) navigation.preventDefault();
    };
    overlay.webContents.on('will-navigate', blockNavigation);
    overlay.webContents.on('will-redirect', blockNavigation);
    overlay.on('move', () => {
      clearTimeout(positionTimer);
      positionTimer = setTimeout(() => { void rememberPosition(overlay).catch(saveFailed); }, 160);
    });
    overlay.on('close', event => { event.preventDefault(); void close(); });
    overlay.once('closed', () => {
      clearTimeout(positionTimer);
      if (window === overlay) {
        window = null; state = null;
        if (!owner.isDestroyed()) owner.webContents.setBackgroundThrottling(true);
        notifyVisibility();
      }
    });
    overlay.once('ready-to-show', () => { if (!overlay.isDestroyed()) overlay.showInactive(); });
    notifyVisibility();
    try {
      await overlay.loadFile(rendererPath, { hash: 'desktop-lyrics' });
      return visible();
    } catch {
      await close();
      throw new Error('无法打开桌面歌词，请重试。');
    }
  });
  ipcMain.handle(channels.desktopLyricsPublish, (event, next: DesktopLyricsState) => {
    guardOwner(event);
    if (!visible()) return;
    if (!next || !Number.isFinite(next.positionSeconds) || !Number.isFinite(next.offsetSeconds)
      || !Number.isFinite(next.durationSeconds) || typeof next.playing !== 'boolean'
      || typeof next.loading !== 'boolean' || typeof next.buffering !== 'boolean') throw new Error('歌词状态无效');
    state = {
      track: next.track ? { id: next.track.id, title: next.track.title, artist: next.track.artist } : null,
      lyrics: next.lyrics, loading: next.loading, playing: next.playing, buffering: next.buffering,
      positionSeconds: next.positionSeconds, offsetSeconds: next.offsetSeconds, durationSeconds: next.durationSeconds,
    };
    window!.webContents.send(channels.desktopLyricsState, state);
  });
  ipcMain.handle(channels.desktopLyricsReadState, event => { guardOverlay(event); return state; });
  ipcMain.handle(channels.desktopLyricsClose, event => { guardOverlay(event); return close(); });
  // The page drags the window itself: an OS drag region (-webkit-app-region) swallows mouse moves
  // on macOS, so hovering could never keep the toolbar open. The 'move' listener persists the result.
  ipcMain.handle(channels.desktopLyricsMove, (event, position: { x: number; y: number }) => {
    guardOverlay(event);
    const valid = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000;
    if (!position || !valid(position.x) || !valid(position.y)) throw new Error('歌词位置无效');
    window!.setPosition(Math.round(position.x), Math.round(position.y));
  });
  ipcMain.handle(channels.desktopLyricsOpenSettings, event => {
    guardOverlay(event);
    if (owner.isDestroyed()) return;
    if (owner.isMinimized()) owner.restore();
    owner.show();
    owner.focus();
    owner.webContents.send(channels.desktopLyricsShowSettings);
  });
  owner.webContents.on('render-process-gone', () => { void close(); });
  owner.once('closed', () => {
    void close();
    app.removeListener('before-quit', beforeQuit);
    for (const channel of ownChannels) ipcMain.removeHandler(channel);
  });
}
