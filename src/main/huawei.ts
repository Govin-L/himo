import { randomBytes } from 'node:crypto';
import { session as electronSession } from 'electron';
import { electronBypassRules, proxyRules, readProxySettings } from './proxy.mjs';
import { createAttempt, exchangeCode, exchangeMusicSession, isAllowedLoginUrl, isCallback } from '../auth.mjs';
import { MusicClient } from '../music.mjs';
import { isSafeMediaUrl, isSafeResourceUrl } from '../safe-media-url.mjs';
import { confirmedPlaybackQuality } from './track-quality.mjs';
import { createDevToolsCallbackObserver, createLoginCallback, prepareLoginPage, waitForLoginPage } from '../login-callback.mjs';
import {
  albumFrom, artistFrom, contentTypeOf, historyFrom, playlistsFromLibraryEntries, searchPageFrom,
  tracksFrom, tracksFromPlaylistDetail, tracksFromPublicPlaylist,
} from './library.mjs';
import { parseLyrics } from '../lyrics.mjs';
import { lyricAddressFrom, readBoundedText } from './lyric-resource.mjs';
import { fetch as httpFetch } from 'undici';
import type {
  AlbumDetail, ArtistDetail, FavoritesPage, HistoryPage, LyricsDoc, Playback, Playlist, PlaylistDetail,
  PlaylistList, Quality, SearchPage, Track,
} from '../shared/types';

type Session = { token: string; snsUserID?: string; expireTime?: string };
const id = (value: unknown) => typeof value === 'string' && value ? value : undefined;
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
const PAGE_LIMIT = 50;
const DISCOVERY_PAGE_LIMIT = 200;
const DISCOVERY_PAGE_CAP = 10;

export function tracksFromFavorites(response: any): Track[] {
  return tracksFrom(response?.favoriteInfos) as Track[];
}

export async function openLogin(onProgress: (message: string) => void): Promise<Session> {
  const { BrowserWindow } = await import('electron');
  const attempt = createAttempt();
  const partition = `login-${randomBytes(18).toString('hex')}`;
  const proxy = readProxySettings();
  let loginSession: Electron.Session | undefined;
  let loginWindow: Electron.BrowserWindow | undefined;
  let loginContents: Electron.WebContents | undefined;
  let loginCallback: ReturnType<typeof createLoginCallback> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let debuggerAttached = false;
  let inspectNavigation: ((_event: Electron.Event, url: string) => void) | undefined;
  let rejectUnknownNavigation: ((_event: Electron.Event, url: string) => void) | undefined;
  let debuggerMessage: ((event: Electron.Event, method: string, params: unknown) => void) | undefined;
  let rejectOnClose: (() => void) | undefined;
  let loginWindowClosed = false;
  loginCallback = createLoginCallback(attempt);
  const callback = loginCallback.promise;
  void callback.catch(() => undefined);
  const denyPermissionRequest = (_webContents: Electron.WebContents, _permission: string, callback: (granted: boolean) => void) => callback(false);
  const denyPermissionCheck = () => false;
  const denyDownload = (event: Electron.Event) => event.preventDefault();
  try {
    const activeSession = electronSession.fromPartition(partition);
    loginSession = activeSession;
    const activeWindow = new BrowserWindow({
      show: false,
      width: 460, height: 720, minWidth: 400, minHeight: 600, title: '登录华为音乐',
      webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
    });
    loginWindow = activeWindow;
    const activeContents = activeWindow.webContents;
    loginContents = activeContents;
    inspectNavigation = (_event: Electron.Event, url: string) => {
      if (!isCallback(url, attempt)) return;
      _event.preventDefault(); loginCallback?.accept(url);
    };
    rejectUnknownNavigation = (_event: Electron.Event, url: string) => {
      if (!isCallback(url, attempt) && !isAllowedLoginUrl(url)) _event.preventDefault();
    };
    activeContents.on('will-navigate', inspectNavigation);
    activeContents.on('will-redirect', inspectNavigation);
    activeContents.on('will-navigate', rejectUnknownNavigation);
    activeContents.on('will-redirect', rejectUnknownNavigation);
    activeContents.setWindowOpenHandler(({ url }) => {
      if (isCallback(url, attempt)) loginCallback?.accept(url);
      return { action: isAllowedLoginUrl(url) ? 'allow' : 'deny' };
    });
    // Chromium may reject the custom scheme before will-redirect is emitted.
    // Observe only this temporary login window; do not register a system protocol handler.
    try {
      activeContents.debugger.attach('1.3');
      debuggerAttached = true;
      debuggerMessage = createDevToolsCallbackObserver({ accept: (url: string) => loginCallback?.accept(url) });
      activeContents.debugger.on('message', debuggerMessage);
      void activeContents.debugger.sendCommand('Page.enable').catch(() => undefined);
    } catch { /* The normal navigation hooks remain active. */ }
    rejectOnClose = () => {
      loginWindowClosed = true;
      loginCallback?.reject(new Error('登录窗口已关闭'));
    };
    activeWindow.on('closed', rejectOnClose);
    timer = setTimeout(() => loginCallback?.reject(new Error('登录等待超时，请重新发起')), 10 * 60_000);
    activeSession.setPermissionRequestHandler(denyPermissionRequest);
    activeSession.setPermissionCheckHandler(denyPermissionCheck);
    activeSession.on('will-download', denyDownload);
    const rules = proxyRules(proxy);
    const earlyCode = await waitForLoginPage(() => prepareLoginPage(async () => {
      if (rules) {
        try {
          await activeSession.setProxy({ mode: 'fixed_servers', proxyRules: rules, proxyBypassRules: electronBypassRules(proxy.bypass) });
        } catch {
          throw new Error('无法应用登录网络代理，请检查代理配置后重试。');
        }
      }
    }, () => activeWindow.show(), async () => {
      onProgress('正在打开华为官方登录页面…');
      try { await activeWindow.loadURL(attempt.authorizeUrl); }
      catch (error) {
        if (loginWindowClosed || activeWindow.isDestroyed()) throw new Error('登录窗口已关闭');
        throw error;
      }
    }, loginCallback), loginCallback);
    if (earlyCode === undefined) onProgress('请在官方页面完成扫码和授权。');
    const code = earlyCode ?? await callback;
    onProgress('授权成功，正在换取音乐会话…');
    const tokens = await exchangeCode(code, attempt) as { access_token: string };
    return await exchangeMusicSession(tokens.access_token) as Session;
  } finally {
    loginCallback?.reject(new Error('登录流程已结束'));
    if (timer) clearTimeout(timer);
    let cleanupHadError = false;
    const cleanup = (action: () => void) => {
      try { action(); } catch { cleanupHadError = true; }
    };
    const contentsToCleanup = loginContents;
    if (contentsToCleanup && !contentsToCleanup.isDestroyed()) {
      if (debuggerAttached) {
        if (debuggerMessage) cleanup(() => contentsToCleanup.debugger.off('message', debuggerMessage!));
        cleanup(() => contentsToCleanup.debugger.detach());
      }
      if (inspectNavigation) {
        cleanup(() => contentsToCleanup.off('will-navigate', inspectNavigation!));
        cleanup(() => contentsToCleanup.off('will-redirect', inspectNavigation!));
      }
      if (rejectUnknownNavigation) {
        cleanup(() => contentsToCleanup.off('will-navigate', rejectUnknownNavigation!));
        cleanup(() => contentsToCleanup.off('will-redirect', rejectUnknownNavigation!));
      }
    }
    if (loginWindow && rejectOnClose) cleanup(() => loginWindow!.off('closed', rejectOnClose!));
    if (loginSession) {
      cleanup(() => loginSession!.setPermissionRequestHandler(null));
      cleanup(() => loginSession!.setPermissionCheckHandler(null));
      cleanup(() => loginSession!.off('will-download', denyDownload));
    }
    if (loginWindow && !loginWindow.isDestroyed()) cleanup(() => loginWindow!.close());
    if (loginSession) {
      try {
        await loginSession.clearStorageData();
      } catch {
        throw new Error('无法清理临时登录会话；为保护账号信息，本次登录未完成。');
      }
    }
    if (cleanupHadError) throw new Error('无法完整关闭临时登录窗口；为保护账号信息，本次登录未完成。');
  }
}

export function clientFor(session: Session): MusicClient { return new MusicClient({ session } as any); }

export async function favorites(session: Session): Promise<Track[]> {
  return (await favoritesPage(session, 0, PAGE_LIMIT)).tracks;
}

export async function favoritesPage(session: Session, start = 0, limit = PAGE_LIMIT): Promise<FavoritesPage & { entryIds: string[] }> {
  const response = await clientFor(session).favorites({ start, limit });
  const tracks = tracksFromFavorites(response);
  const itemCount = Array.isArray(response?.favoriteInfos) ? response.favoriteInfos.length : 0;
  const entryIds = (response?.favoriteInfos ?? []).map((entry: any) => id(entry?.contentID)).filter((value: any): value is string => !!value);
  return { tracks, entryIds, nextStart: start + limit, hasMore: itemCount === limit };
}

// Playlist discovery mixes songs and playlists in one paged list, so we page until a short
// page, a stalled page, or the conservative cap, then keep only the playlist entries.
export async function playlists(session: Session): Promise<PlaylistList> {
  const client = clientFor(session);
  const entries: any[] = [];
  const seenEntryIds = new Set<string>();
  let start = 0;
  let truncated = true;
  for (let page = 0; page < DISCOVERY_PAGE_CAP; page += 1) {
    const response = await client.library({ start, limit: DISCOVERY_PAGE_LIMIT });
    const items = Array.isArray(response?.favoriteInfos) ? response.favoriteInfos : [];
    let fresh = 0;
    for (const item of items) {
      const key = `${contentTypeOf(item) ?? ''}:${String(item?.contentID ?? '')}`;
      if (!key.endsWith(':') && !seenEntryIds.has(key)) { seenEntryIds.add(key); fresh += 1; entries.push(item); }
    }
    start += DISCOVERY_PAGE_LIMIT;
    if (items.length < DISCOVERY_PAGE_LIMIT || fresh === 0) { truncated = false; break; }
  }
  return { playlists: playlistsFromLibraryEntries(entries) as Playlist[], truncated };
}

export async function playlistDetail(
  session: Session, playlistId: string, kind: Playlist['kind'], start = 0, limit = PAGE_LIMIT,
): Promise<PlaylistDetail> {
  const client = clientFor(session);
  let tracks: Track[];
  let playlist: Playlist | null;
  let itemCount: number;
  if (kind === 'owned') {
    ({ tracks, playlist, itemCount } = tracksFromPlaylistDetail(await client.playlistDetail(playlistId, { start, limit })) as {
      playlist: Playlist | null; tracks: Track[]; itemCount: number;
    });
  } else if (kind === 'collected') {
    ({ tracks, playlist, itemCount } = tracksFromPublicPlaylist(await client.publicPlaylist(playlistId, { start, limit })) as {
      playlist: Playlist | null; tracks: Track[]; itemCount: number;
    });
  } else {
    throw new Error('暂不支持该类型的歌单详情');
  }
  if (!playlist) throw new Error('歌单信息不完整，无法显示');
  return { playlist: { ...playlist, kind }, tracks, nextStart: start + limit, hasMore: itemCount === limit };
}

export async function search(session: Session, query: string, start = 0, limit = 20): Promise<SearchPage> {
  const page = searchPageFrom(await clientFor(session).search(query, { start, limit })) as {
    tracks: Track[]; itemCount: number; total?: number; hasNext: boolean;
  };
  return { tracks: page.tracks, total: page.total, nextStart: start + limit, hasMore: page.hasNext };
}

export async function history(session: Session): Promise<HistoryPage> {
  return { tracks: historyFrom(await clientFor(session).recent()) as Track[] };
}

export async function album(session: Session, albumId: string, start = 0, limit = PAGE_LIMIT): Promise<AlbumDetail> {
  const parsed = albumFrom(await clientFor(session).album(albumId, { start, limit })) as {
    album: AlbumDetail['album']; tracks: Track[]; itemCount: number;
  };
  return { album: parsed.album, tracks: parsed.tracks, nextStart: start + limit, hasMore: parsed.itemCount === limit };
}

export async function artist(session: Session, artistId: string): Promise<ArtistDetail> {
  const parsed = artistFrom(await clientFor(session).artist(artistId)) as {
    artist: ArtistDetail['artist']; tracks: Track[]; albums: ArtistDetail['albums'];
  };
  return { artist: parsed.artist, tracks: parsed.tracks, albums: parsed.albums };
}

export async function lyrics(session: Session, trackId: string): Promise<LyricsDoc> {
  const response = await clientFor(session).resolvePlayback(trackId, 'standard');
  const address = lyricAddressFrom(response);
  if (!address || !isSafeResourceUrl(address)) return { synced: false, lines: [] };
  let text: string;
  try {
    const response = await httpFetch(address, { signal: AbortSignal.timeout(20_000), redirect: 'error', headers: { accept: 'text/plain,*/*' } });
    if (!response.ok) return { synced: false, lines: [] };
    text = await readBoundedText(response);
  } catch { return { synced: false, lines: [] }; }
  return parseLyrics(text) as LyricsDoc;
}

export async function favoriteExist(session: Session, trackId: string): Promise<boolean> {
  const response = await clientFor(session).favoriteExist(trackId);
  if (!['0', '1'].includes(String(response?.exist))) throw new Error('服务端未确认收藏状态');
  return String(response.exist) === '1';
}

export async function setFavorite(session: Session, trackId: string, favorite: boolean): Promise<void> {
  await clientFor(session).setFavorite(trackId, favorite);
}

export async function createPlaylist(session: Session, name: string, trackIds: string[]): Promise<string | undefined> {
  const now = new Date();
  const createTime = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`
    + `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const response = await clientFor(session).createPlaylist({ name, songCodes: trackIds, createTime });
  return id(response?.playListID) ?? id(response?.playlistID);
}

export async function updatePlaylistDescription(session: Session, playlistId: string, description: string): Promise<void> {
  await clientFor(session).updatePlaylistDescription(playlistId, description);
}

export async function deletePlaylist(session: Session, playlistId: string): Promise<void> {
  await clientFor(session).deletePlaylist(playlistId);
}

export async function resolvePlayback(session: Session, trackId: string, quality: Quality): Promise<Playback> {
  const response = await clientFor(session).resolvePlayback(trackId, quality);
  const url = id(response?.fileURL);
  if (!url || !isSafeMediaUrl(url)) throw new Error('服务端未返回安全的音频地址');
  const actual = confirmedPlaybackQuality(response?.playQuality ?? response?.qualityType, response?.type);
  return { url, actualQuality: actual, contentType: id(response?.type), durationSeconds: number(response?.songInfo?.duration) };
}
