export type ErrorKind = 'auth' | 'permission' | 'network' | 'unsupported' | 'invalid' | 'unknown';
export type AppError = { kind: ErrorKind; message: string; retryable: boolean; code?: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export type AuthStatus = {
  authenticated: boolean;
  displayName?: string;
  musicExpireTime?: string;
  persistence: 'secure' | 'memory-only' | 'unavailable';
  notice?: string;
};

export type Track = {
  id: string;
  title: string;
  artists: { id?: string; name: string }[];
  album?: { id: string; title: string };
  coverUrl?: string;
  durationSeconds?: number;
  available: boolean;
};

export type FavoritesPage = {
  total?: number;
  cacheHint?: string;
  tracks: Track[];
  nextStart: number;
  hasMore: boolean;
};

export type Playlist = {
  id: string;
  title: string;
  coverUrl?: string;
  count?: number;
  kind: 'owned' | 'collected' | 'chart' | 'unknown';
  description?: string;
};

export type PlaylistList = { playlists: Playlist[]; truncated: boolean; cacheHint?: string; cached?: boolean; cachedAt?: number };
export type PlaylistDetail = { playlist: Playlist; tracks: Track[]; nextStart: number; hasMore: boolean; cacheHint?: string; cached?: boolean; cachedAt?: number };
export type SearchPage = { tracks: Track[]; nextStart: number; hasMore: boolean; total?: number };
export type HistoryPage = { tracks: Track[] };
export type LyricSegment = { timeMs: number | null; text: string };
export type LyricsLine = {
  timeMs: number | null;
  text: string;
  // Second line sharing this exact timestamp (bilingual LRC layout).
  translation?: string;
  // Word level marks from <mm:ss.xx> tags, when the source provides them.
  segments?: LyricSegment[];
};
export type LyricsSource = 'huawei' | 'kugou' | 'lrclib' | 'local';
export type LyricsDoc = {
  synced: boolean;
  lines: LyricsLine[];
  // Which library answered, and what it matched, so the UI can be honest about third-party lyrics.
  source?: LyricsSource;
  matchedTitle?: string;
  matchedArtist?: string;
};
export type LyricsCacheInfo = { bytes: number; entries: number; localBytes: number; localEntries: number };
export type DesktopLyricsStroke = 'none' | 'thin' | 'medium' | 'thick';
export type DesktopLyricsFontWeight = 'regular' | 'medium' | 'bold';
export type DesktopLyricsPreferences = {
  position: { x: number; y: number } | null;
  fontSize: number;
  locked: boolean;
  /** Lyric text opacity, 0.2–1; the toolbar is never faded. */
  opacity: number;
  dimWhenPaused: boolean;
  /** 'bar' draws a translucent plate behind the lines; 'none' keeps bare outlined subtitles. */
  background: 'none' | 'bar';
  backgroundOpacity: number;
  /** #rrggbb colours; an `End` colour turns the fill into a top-to-bottom gradient. */
  color: string;
  colorEnd: string | null;
  playedColor: string;
  playedColorEnd: string | null;
  strokeColor: string;
  stroke: DesktopLyricsStroke;
  /** Installed font family; empty follows the app font. */
  fontFamily: string;
  fontWeight: DesktopLyricsFontWeight;
  /** Second line size relative to the current line, 0.5–1. */
  secondaryScale: number;
};
/** Everything but the position, which only the main process records. */
export type DesktopLyricsPreferencePatch = Partial<Omit<DesktopLyricsPreferences, 'position'>>;
export type DesktopLyricsState = {
  track: { id: string; title: string; artist: string } | null;
  lyrics: LyricsDoc | null;
  loading: boolean;
  playing: boolean;
  buffering: boolean;
  positionSeconds: number;
  offsetSeconds: number;
  durationSeconds: number;
};
export type DesktopLyricsOverlayApi = {
  getState(): Promise<DesktopLyricsState | null>;
  onState(listener: (state: DesktopLyricsState) => void): () => void;
  close(): Promise<void>;
  /** Moves the overlay to a screen position; dragging is done in the page, not by an OS drag region. */
  move(position: { x: number; y: number }): Promise<void>;
  /** Brings the main window forward on the desktop lyrics settings. */
  openSettings(): Promise<void>;
  getPreferences(): Promise<DesktopLyricsPreferences>;
  updatePreferences(input: DesktopLyricsPreferencePatch): Promise<DesktopLyricsPreferences>;
  onPreferences(listener: (preferences: DesktopLyricsPreferences) => void): () => void;
};
export type AlbumDetail = {
  album: { id: string; title: string; coverUrl?: string; count?: number; artists: { id?: string; name: string }[] };
  tracks: Track[];
  nextStart: number;
  hasMore: boolean;
};
export type ArtistDetail = {
  artist: { id: string; name: string; coverUrl?: string };
  tracks: Track[];
  albums: { id: string; title: string; coverUrl?: string; count?: number }[];
};

export type Playback = {
  url: string;
  actualQuality: 'standard' | 'lossless' | 'unknown';
  contentType?: string;
  durationSeconds?: number;
  expiresAt?: string;
};

export type RepeatMode = 'off' | 'all' | 'one';
export type Quality = 'standard' | 'lossless';
export type AccentName = 'red' | 'blue' | 'green' | 'amber' | 'violet' | 'custom';
export type FontChoice = 'sans' | 'serif' | 'mono' | 'custom';

export type AppearanceSettings = {
  accent: AccentName;
  /** 0.55 – 1: how solid the floating glass panels are. */
  panelOpacity: number;
  /** Base corner radius in px; every component radius derives from it. */
  cornerRadius: number;
  /** 0.85 – 1.2 multiplier applied to all text sizes. */
  fontScale: number;
  fontFamily: FontChoice;
  /** Used when accent === 'custom'; sanitized to #rrggbb. */
  customAccent: string;
  /** Used when fontFamily === 'custom'; an installed family name picked from queryLocalFonts(). */
  customFont: string;
};

export type AppSettings = {
  closeBehavior: 'quit' | 'tray';
  quality: Quality;
  volume: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  appearance: AppearanceSettings;
  desktopLyrics: DesktopLyricsPreferences;
  // Report real playback to Huawei history. Endpoint shape comes from the public H5 bundle;
  // real-account acceptance is still pending, so failures stay silent and are never retried.
  syncHistory: boolean;
  // Match lyrics from public third-party libraries when the provider returns none.
  thirdPartyLyrics: boolean;
};

export type SavedQueue = {
  tracks: Track[];
  index: number;
  positionSeconds: number;
};

export type ControlGlassRect = { x: number; y: number; width: number; height: number };
export type ControlGlassLayout = { player: ControlGlassRect | null; tabs: ControlGlassRect | null; search: ControlGlassRect | null };

export type DesktopApi = {
  auth: {
    status(): Promise<Result<AuthStatus>>;
    login(): Promise<Result<AuthStatus>>;
    logout(): Promise<Result<void>>;
    cancelLogin(): Promise<Result<void>>;
    onProgress(listener: (message: string) => void): () => void;
  };
  music: {
    favorites(input?: { start?: number; limit?: number; refresh?: boolean }): Promise<Result<FavoritesPage>>;
    favoritesSummary(): Promise<Result<{ total: number }>>;
    playlists(input?: { refresh?: boolean }): Promise<Result<PlaylistList>>;
    playlistDetail(input: { id: string; kind: Playlist['kind']; start?: number; limit?: number; refresh?: boolean }): Promise<Result<PlaylistDetail>>;
    search(input: { query: string; start?: number; limit?: number }): Promise<Result<SearchPage>>;
    history(): Promise<Result<HistoryPage>>;
    album(input: { id: string; start?: number; limit?: number }): Promise<Result<AlbumDetail>>;
    artist(input: { id: string }): Promise<Result<ArtistDetail>>;
    lyrics(input: {
      trackId: string;
      title?: string;
      artist?: string;
      album?: string;
      durationSeconds?: number;
    }): Promise<Result<LyricsDoc>>;
    resolvePlayback(input: { trackId: string; quality: 'standard' | 'lossless' }): Promise<Result<Playback>>;
    reportPlayback(input: { trackId: string; title: string; listenedSeconds: number; songDurationSeconds?: number }): Promise<Result<void>>;
    favoriteState(input: { trackId: string }): Promise<Result<{ favorite: boolean }>>;
    setFavorite(input: { trackId: string; favorite: boolean }): Promise<Result<{ favorite: boolean }>>;
    createPlaylist(input: { name: string; trackIds: string[] }): Promise<Result<{ id?: string }>>;
    updatePlaylistDescription(input: { id: string; description: string }): Promise<Result<{ id: string }>>;
    deletePlaylist(input: { id: string }): Promise<Result<{ id: string }>>;
  };
  settings: {
    get(): Promise<Result<AppSettings>>;
    update(input: Partial<AppSettings>): Promise<Result<AppSettings>>;
  };
  queue: {
    load(): Promise<Result<SavedQueue | null>>;
    save(input: SavedQueue): Promise<Result<void>>;
  };
  window: {
    minimize(): Promise<void>;
    setCloseBehavior(input: 'quit' | 'tray'): Promise<Result<AppSettings>>;
    syncGlassControls(layout: ControlGlassLayout): Promise<Result<{ active: boolean }>>;
  };
  fonts: { list(): Promise<Result<{ families: string[] }>> };
  lyrics: {
    /** Opens a picker; resolves null when the user cancels. */
    importLocal(trackId: string): Promise<Result<LyricsDoc | null>>;
    removeLocal(trackId: string): Promise<Result<{ removed: boolean }>>;
    cacheInfo(): Promise<Result<LyricsCacheInfo>>;
    clearCache(input?: { local?: boolean }): Promise<Result<LyricsCacheInfo>>;
  };
  app: { quit(): Promise<void> };
  desktopLyrics: {
    setVisible(visible: boolean): Promise<boolean>;
    getVisible(): Promise<boolean>;
    publish(state: DesktopLyricsState): Promise<void>;
    getPreferences(): Promise<DesktopLyricsPreferences>;
    updatePreferences(input: DesktopLyricsPreferencePatch): Promise<DesktopLyricsPreferences>;
    onPreferences(listener: (preferences: DesktopLyricsPreferences) => void): () => void;
    onVisibility(listener: (visible: boolean) => void): () => void;
    /** The overlay's settings button asked for the desktop lyrics settings page. */
    onShowSettings(listener: () => void): () => void;
  };
  player: { onCommand(listener: (command: 'play-pause' | 'next' | 'previous') => void): () => void };
  onNotice(listener: (message: string) => void): () => void;
};

declare global { interface Window { desktop: DesktopApi; desktopLyricsOverlay: DesktopLyricsOverlayApi } }
