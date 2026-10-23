import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '../shared/channels';
import type { DesktopApi, DesktopLyricsOverlayApi, DesktopLyricsPreferences, DesktopLyricsState } from '../shared/types';

const api: DesktopApi = {
  auth: {
    status: () => ipcRenderer.invoke(channels.authStatus),
    login: () => ipcRenderer.invoke(channels.authLogin),
    logout: () => ipcRenderer.invoke(channels.authLogout),
    cancelLogin: () => ipcRenderer.invoke(channels.authCancelLogin),
    onProgress: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
      ipcRenderer.on('auth:progress', wrapped);
      return () => ipcRenderer.removeListener('auth:progress', wrapped);
    },
  },
  music: {
    favorites: input => ipcRenderer.invoke(channels.musicFavorites, input),
    favoritesSummary: () => ipcRenderer.invoke(channels.musicFavoritesSummary),
    playlists: input => ipcRenderer.invoke(channels.musicPlaylists, input),
    playlistDetail: input => ipcRenderer.invoke(channels.musicPlaylistDetail, input),
    search: input => ipcRenderer.invoke(channels.musicSearch, input),
    history: () => ipcRenderer.invoke(channels.musicHistory),
    album: input => ipcRenderer.invoke(channels.musicAlbum, input),
    artist: input => ipcRenderer.invoke(channels.musicArtist, input),
    lyrics: input => ipcRenderer.invoke(channels.musicLyrics, input),
    resolvePlayback: input => ipcRenderer.invoke(channels.musicResolvePlayback, input),
    reportPlayback: input => ipcRenderer.invoke(channels.musicReportPlayback, input),
    favoriteState: input => ipcRenderer.invoke(channels.musicFavoriteState, input),
    setFavorite: input => ipcRenderer.invoke(channels.musicSetFavorite, input),
    createPlaylist: input => ipcRenderer.invoke(channels.musicCreatePlaylist, input),
    updatePlaylistDescription: input => ipcRenderer.invoke(channels.musicUpdatePlaylistDescription, input),
    deletePlaylist: input => ipcRenderer.invoke(channels.musicDeletePlaylist, input),
  },
  settings: {
    get: () => ipcRenderer.invoke(channels.settingsGet),
    update: input => ipcRenderer.invoke(channels.settingsUpdate, input),
  },
  queue: {
    load: () => ipcRenderer.invoke(channels.queueLoad),
    save: input => ipcRenderer.invoke(channels.queueSave, input),
  },
  fonts: {
    list: () => ipcRenderer.invoke(channels.fontsList),
  },
  lyrics: {
    importLocal: trackId => ipcRenderer.invoke(channels.lyricsImport, { trackId }),
    removeLocal: trackId => ipcRenderer.invoke(channels.lyricsRemoveLocal, { trackId }),
    cacheInfo: () => ipcRenderer.invoke(channels.lyricsCacheInfo),
    clearCache: input => ipcRenderer.invoke(channels.lyricsClearCache, input ?? {}),
  },
  window: {
    minimize: () => ipcRenderer.invoke(channels.windowMinimize),
    setCloseBehavior: input => ipcRenderer.invoke(channels.windowSetCloseBehavior, input),
    syncGlassControls: layout => ipcRenderer.invoke(channels.windowSyncGlassControls, layout),
  },
  app: { quit: () => ipcRenderer.invoke(channels.appQuit) },
  desktopLyrics: {
    setVisible: visible => ipcRenderer.invoke(channels.desktopLyricsSetVisible, visible),
    getVisible: () => ipcRenderer.invoke(channels.desktopLyricsGetVisible),
    getPreferences: () => ipcRenderer.invoke(channels.desktopLyricsGetPreferences),
    updatePreferences: input => ipcRenderer.invoke(channels.desktopLyricsUpdatePreferences, input),
    onPreferences: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, preferences: DesktopLyricsPreferences) => listener(preferences);
      ipcRenderer.on(channels.desktopLyricsPreferences, wrapped);
      return () => ipcRenderer.removeListener(channels.desktopLyricsPreferences, wrapped);
    },
    publish: state => ipcRenderer.invoke(channels.desktopLyricsPublish, state),
    onVisibility: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, visible: boolean) => listener(visible);
      ipcRenderer.on(channels.desktopLyricsVisibility, wrapped);
      return () => ipcRenderer.removeListener(channels.desktopLyricsVisibility, wrapped);
    },
    onShowSettings: listener => {
      const wrapped = () => listener();
      ipcRenderer.on(channels.desktopLyricsShowSettings, wrapped);
      return () => ipcRenderer.removeListener(channels.desktopLyricsShowSettings, wrapped);
    },
  },
  player: {
    onCommand: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, command: 'play-pause' | 'next' | 'previous') => listener(command);
      ipcRenderer.on(channels.playerCommand, wrapped);
      return () => ipcRenderer.removeListener(channels.playerCommand, wrapped);
    },
  },
  onNotice: listener => {
    const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
    ipcRenderer.on(channels.appNotice, wrapped);
    return () => ipcRenderer.removeListener(channels.appNotice, wrapped);
  },
};

if (process.argv.includes('--desktop-lyrics-overlay')) {
  const overlay: DesktopLyricsOverlayApi = {
    getState: () => ipcRenderer.invoke(channels.desktopLyricsReadState),
    getPreferences: () => ipcRenderer.invoke(channels.desktopLyricsGetPreferences),
    updatePreferences: input => ipcRenderer.invoke(channels.desktopLyricsUpdatePreferences, input),
    onPreferences: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, preferences: DesktopLyricsPreferences) => listener(preferences);
      ipcRenderer.on(channels.desktopLyricsPreferences, wrapped);
      return () => ipcRenderer.removeListener(channels.desktopLyricsPreferences, wrapped);
    },
    onState: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopLyricsState) => listener(state);
      ipcRenderer.on(channels.desktopLyricsState, wrapped);
      return () => ipcRenderer.removeListener(channels.desktopLyricsState, wrapped);
    },
    close: () => ipcRenderer.invoke(channels.desktopLyricsClose),
    move: position => ipcRenderer.invoke(channels.desktopLyricsMove, position),
    openSettings: () => ipcRenderer.invoke(channels.desktopLyricsOpenSettings),
  };
  contextBridge.exposeInMainWorld('desktopLyricsOverlay', overlay);
} else {
  contextBridge.exposeInMainWorld('desktop', api);
}
