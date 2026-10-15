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
export type LyricsLine = { timeMs: number | null; text: string };
export type LyricsDoc = { synced: boolean; lines: LyricsLine[] };
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

export type AppSettings = {
  closeBehavior: 'quit' | 'tray';
  quality: Quality;
  volume: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  // Report real playback to Huawei history. Endpoint shape comes from the public H5 bundle;
  // real-account acceptance is still pending, so failures stay silent and are never retried.
  syncHistory: boolean;
};

export type SavedQueue = {
  tracks: Track[];
  index: number;
  positionSeconds: number;
};

export type DesktopApi = {
  auth: {
    status(): Promise<Result<AuthStatus>>;
    login(): Promise<Result<AuthStatus>>;
    logout(): Promise<Result<void>>;
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
    lyrics(input: { trackId: string }): Promise<Result<LyricsDoc>>;
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
  window: { minimize(): Promise<void>; setCloseBehavior(input: 'quit' | 'tray'): Promise<Result<AppSettings>> };
  app: { quit(): Promise<void> };
  player: { onCommand(listener: (command: 'play-pause' | 'next' | 'previous') => void): () => void };
  onNotice(listener: (message: string) => void): () => void;
};

declare global { interface Window { desktop: DesktopApi } }
