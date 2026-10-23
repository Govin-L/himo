import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Disc3, ListMusic, Mic2, Moon, Play, RotateCcw, Search as SearchIcon, Sun, Trash2 } from 'lucide-react';
import { Cover, PlaylistGrid, TrackTable, type TrackActions } from './components';
import { desktopLyricsStyle, LyricsPlate, LyricText } from './DesktopLyricsWindow';
import { mergeFavoritesPage } from './favorites-pagination.mjs';
import type {
  AccentName, AlbumDetail, AppearanceSettings, ArtistDetail, AppSettings, DesktopLyricsPreferencePatch, DesktopLyricsPreferences,
  FontChoice, LyricsCacheInfo, Playlist, Result, SavedQueue, Track,
} from '../shared/types';
import { formatBytes } from '../shared/format.mjs';
import { APP_DISPLAY_NAME } from '../shared/app-name.mjs';

export type LibraryContext = TrackActions & {
  busy: boolean;
  setBusy(value: boolean): void;
  notice(text: string): void;
  run<T>(action: () => Promise<Result<T>>, failure: string): Promise<T | undefined>;
  setFavoriteState(trackId: string, favorite: boolean): void;
  openPlaylist(playlist: Playlist): void;
  closePlaylist(): void;
  setCloseBehavior(value: AppSettings['closeBehavior']): void;
  updateSettings(patch: Partial<AppSettings>): Promise<boolean>;
  settings: AppSettings | null;
  queue: SavedQueue | null;
  localHistory: Track[];
  favoriteChange: { trackId: string; favorite: boolean; revision: number } | null;
};

const PAGE = 50;

// Swatch colours mirror the runtime accent map in App.tsx; only the label/swatch is used here.
const ACCENT_SWATCHES: Record<Exclude<AccentName, 'custom'>, { label: string; swatch: string }> = {
  red: { label: '绯红', swatch: '#c8202e' },
  blue: { label: '靛蓝', swatch: '#2563eb' },
  green: { label: '松绿', swatch: '#15803d' },
  amber: { label: '琥珀', swatch: '#b45309' },
  violet: { label: '紫罗兰', swatch: '#6d28d9' },
};



export function PlaylistsPage({ ctx }: { ctx: LibraryContext }) {
  const requestId = useRef(0);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  function setCached(cached: boolean, savedAt?: number) {
    setCachedAt(cached && savedAt ? savedAt : null);
  }

  async function load(refresh = false) {
    const id = ++requestId.current;
    ctx.setBusy(true);
    const result = await ctx.run(() => window.desktop.music.playlists({ refresh }), '读取歌单失败，请重试。');
    if (id !== requestId.current) return;
    if (result) {
      setPlaylists(result.playlists);
      setTruncated(result.truncated);
      setCached(result.cached === true, result.cachedAt);
      setLoaded(true);
      if (result.cacheHint) ctx.notice(result.cacheHint);
    }
    ctx.setBusy(false);
  }

  useEffect(() => { void load(); return () => { requestId.current++; ctx.setBusy(false); }; }, []);

  async function create() {
    const trackIds = [...new Set((ctx.queue?.tracks ?? []).map(track => track.id))];
    if (!trackIds.length) { ctx.notice('请先建立播放队列，首版创建歌单至少需要一首歌曲。'); return; }
    if (ctx.busy) return;
    ctx.setBusy(true);
    const result = await ctx.run(() => window.desktop.music.createPlaylist({ name, trackIds }), '创建结果待确认，请刷新歌单核对，不要重复创建。');
    ctx.setBusy(false);
    if (!result) return;
    ctx.notice(`已创建歌单「${name}」，包含 ${trackIds.length} 首歌曲。`);
    setName('');
    setCreating(false);
    await load(true);
  }

  return <section className="library">
    <div className="library-head">
      <span>{loaded ? `${playlists.length} 个歌单${truncated ? ' · 仅显示部分' : ''}${cachedAt ? ' · 缓存' : ''}` : '歌单尚未读取'}</span>
      <div className="head-actions">
        <button className="ghost" onClick={() => setCreating(value => !value)} disabled={ctx.busy}>新建歌单</button>
        {cachedAt && <span className="hint">显示本地缓存（{new Date(cachedAt).toLocaleTimeString('zh-CN')}）</span>}
        <button className="ghost" onClick={() => void load(true)} disabled={ctx.busy}>刷新</button>
      </div>
    </div>
    {creating && <div className="inline-form">
      <input aria-label="歌单名称" value={name} maxLength={60} placeholder="歌单名称" onChange={event => setName(event.target.value)} />
      <span className="hint">首版使用当前播放队列（{ctx.queue?.tracks.length ?? 0} 首）作为初始歌曲。</span>
      <button className="primary" onClick={() => void create()} disabled={ctx.busy || !name.trim()}>确认创建</button>
      <button className="ghost" onClick={() => setCreating(false)}>取消</button>
    </div>}
    <PlaylistGrid playlists={playlists} onOpen={playlist => ctx.openPlaylist(playlist)} />
  </section>;
}

export function PlaylistDetailPage({ ctx, playlist }: { ctx: LibraryContext; playlist: Playlist }) {
  const [detail, setDetail] = useState<{ playlist: Playlist; tracks: Track[]; hasMore: boolean } | null>(null);
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nextStart = useRef(0);

  const requestId = useRef(0);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  async function load(start = 0, append = false, refresh = false) {
    if (playlist.kind === 'chart') return;
    const request = ++requestId.current;
    ctx.setBusy(true);
    const result = await ctx.run(() => window.desktop.music.playlistDetail({ id: playlist.id, kind: playlist.kind, start, limit: PAGE, refresh }), '读取歌单失败；已有内容可能不是最新，请重试。');
    if (request !== requestId.current) return;
    if (result) {
      setDetail(previous => {
        const merged = append ? mergeFavoritesPage(previous?.tracks ?? [], result) : result;
        return { playlist: result.playlist, tracks: merged.tracks, hasMore: merged.hasMore };
      });
      if (result.cacheHint) ctx.notice(result.cacheHint);
      setCachedAt(result.cached === true && result.cachedAt ? result.cachedAt : null);
      if (!append) setDescription(result.playlist.description ?? '');
      nextStart.current = result.nextStart;
    }
    ctx.setBusy(false);
  }

  useEffect(() => { setDetail(null); void load(); return () => { requestId.current++; ctx.setBusy(false); }; }, [playlist.id]);

  async function saveDescription() {
    if (ctx.busy) return;
    ctx.setBusy(true);
    const result = await ctx.run(() => window.desktop.music.updatePlaylistDescription({ id: playlist.id, description }), '简介结果待确认，请刷新详情核对。');
    ctx.setBusy(false);
    if (!result) return;
    ctx.notice('已保存歌单简介。');
    await load(0, false, true);
  }

  async function remove() {
    if (ctx.busy) return;
    ctx.setBusy(true);
    const result = await ctx.run(() => window.desktop.music.deletePlaylist({ id: playlist.id }), '删除结果待确认，请刷新歌单核对。');
    ctx.setBusy(false);
    if (!result) return;
    ctx.notice(`已删除歌单「${playlist.title}」。`);
    ctx.closePlaylist();
  }

  return <section className="library detail-page">
    <header className="detail-hero">
      <span className="detail-art">
        <Cover src={(detail?.playlist ?? playlist).coverUrl} icon={<ListMusic size={34} />} />
      </span>
      <div className="detail-info">
        <p className="detail-kind">{playlist.kind === 'owned' ? '自建歌单' : playlist.kind === 'collected' ? '收藏歌单' : '榜单'}</p>
        <h2>{playlist.title}</h2>
        <p className="detail-meta">
          {detail ? `${detail.tracks.length} 首${detail.hasMore ? '以上' : ''}` : '读取中…'}
          {cachedAt ? ' · 缓存' : ''}
        </p>
        <div className="detail-actions">
          {detail?.tracks.length
            ? <button className="primary" onClick={() => ctx.play(detail.tracks, 0)}><Play size={13} fill="currentColor" />{detail.hasMore ? `播放已加载 ${detail.tracks.length} 首` : '播放全部'}</button>
            : null}
          <button className="ghost" onClick={() => void load(0, false, true)} disabled={ctx.busy}>刷新</button>
          {playlist.kind === 'owned' && <button className="ghost danger" onClick={() => setConfirmDelete(true)} disabled={ctx.busy}><Trash2 size={13} />删除</button>}
        </div>
      </div>
    </header>
    {confirmDelete && <div className="inline-form danger">
      <span>确认删除自建歌单「{playlist.title}」？此操作会同时移除歌单内的曲目集合，但不会删除歌曲本身。</span>
      <button className="ghost danger" onClick={() => void remove()} disabled={ctx.busy}>确认删除</button>
      <button className="ghost" onClick={() => setConfirmDelete(false)}>取消</button>
    </div>}
    {playlist.kind === 'chart'
      ? <div className="list-empty"><p>暂不支持该类型的歌单详情。</p></div>
      : <>
        {playlist.kind === 'owned' && <div className="inline-form">
          <input aria-label="歌单简介" value={description} maxLength={200} placeholder="歌单简介" onChange={event => setDescription(event.target.value)} />
          <button className="ghost" onClick={() => void saveDescription()} disabled={ctx.busy}>保存简介</button>
        </div>}
        <TrackTable tracks={detail?.tracks ?? []} actions={ctx} busy={ctx.busy} hasMore={detail?.hasMore}
          onLoadMore={() => void load(nextStart.current, true)} emptyText={ctx.busy ? '正在读取歌单…' : detail ? '该歌单暂无歌曲。' : '歌单未能读取，请刷新重试。'} />
      </>}
  </section>;
}

export function SearchPage({ ctx }: { ctx: LibraryContext }) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const nextStart = useRef(0);
  const requestId = useRef(0);

  async function run(start: number, append: boolean) {
    if (!query.trim()) return;
    const id = ++requestId.current;
    ctx.setBusy(true);
    const page = await ctx.run(() => window.desktop.music.search({ query, start, limit: 20 }), '搜索失败，请重试。');
    if (id !== requestId.current) return;
    if (page) {
      const existing = append ? new Set(tracks.map(track => track.id)) : new Set<string>();
      const merged = append ? [...tracks, ...page.tracks.filter(track => !existing.has(track.id))] : page.tracks;
      setTracks(merged);
      nextStart.current = page.nextStart;
      setHasMore(page.hasMore);
      setSearched(true);
      if (!page.tracks.length && !append) ctx.notice('没有找到匹配的歌曲。');
    }
    ctx.setBusy(false);
  }

  return <section className="library">
    <form className="search-bar" onSubmit={event => { event.preventDefault(); void run(0, false); }}>
      <SearchIcon size={16} />
      <input aria-label="搜索歌曲" value={query} maxLength={80} placeholder="搜索歌曲名称或艺人" onChange={event => setQuery(event.target.value)} />
      <button className="primary" type="submit" disabled={ctx.busy || !query.trim()}>搜索</button>
    </form>
    <TrackTable tracks={tracks} actions={ctx} onLoadMore={() => void run(nextStart.current, true)} hasMore={hasMore} busy={ctx.busy}
      loadMoreLabel="加载更多结果" emptyText={searched ? '没有找到匹配的歌曲。' : '输入关键词后开始搜索。'} />
  </section>;
}

export function AlbumPage({ ctx, albumId }: { ctx: LibraryContext; albumId: string }) {
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const requestId = useRef(0);
  const nextStart = useRef(0);
  async function load(start = 0, append = false) {
    const id = ++requestId.current;
    ctx.setBusy(true);
    const result = await ctx.run(() => window.desktop.music.album({ id: albumId, start, limit: PAGE }), '读取专辑失败，请重试。');
    if (id !== requestId.current) return;
    if (result) {
      nextStart.current = result.nextStart;
      setDetail(previous => append ? { ...result, ...mergeFavoritesPage(previous?.tracks ?? [], result) } : result);
    }
    ctx.setBusy(false);
  }
  useEffect(() => { setDetail(null); void load(); return () => { requestId.current++; ctx.setBusy(false); }; }, [albumId]);
  return <section className="library detail-page">
    <header className="detail-hero">
      <span className="detail-art">
        <Cover src={detail?.album.coverUrl} icon={<Disc3 size={34} />} />
      </span>
      <div className="detail-info">
        <p className="detail-kind">专辑</p>
        <h2>{detail?.album.title ?? '专辑详情'}</h2>
        <p className="detail-meta">
          {detail ? `${detail.album.artists.map(artist => artist.name).join(' / ') || '未知艺人'} · ${detail.tracks.length} 首${detail.hasMore ? '以上' : ''}` : '读取中…'}
        </p>
        <div className="detail-actions">
          {detail?.tracks.length
            ? <button className="primary" onClick={() => ctx.play(detail.tracks, 0)}><Play size={13} fill="currentColor" />{detail.hasMore ? `播放已加载 ${detail.tracks.length} 首` : '播放全部'}</button>
            : null}
        </div>
      </div>
    </header>
    <TrackTable tracks={detail?.tracks ?? []} actions={ctx} busy={ctx.busy} hasMore={detail?.hasMore}
      onLoadMore={() => void load(nextStart.current, true)} emptyText={ctx.busy ? '正在读取专辑…' : detail ? '专辑暂无曲目。' : '专辑未能读取，请重试。'} />
  </section>;
}

export function ArtistPage({ ctx, artistId }: { ctx: LibraryContext; artistId: string }) {
  const [detail, setDetail] = useState<ArtistDetail | null>(null);
  useEffect(() => {
    void (async () => {
      ctx.setBusy(true);
      const result = await ctx.run(() => window.desktop.music.artist({ id: artistId }), '读取歌手失败，请重试。');
      if (result) setDetail(result);
      ctx.setBusy(false);
    })();
  }, [artistId]);
  return <section className="library detail-page">
    <header className="detail-hero">
      <span className="detail-art">
        <Cover src={detail?.artist.coverUrl} icon={<Mic2 size={34} />} />
      </span>
      <div className="detail-info">
        <p className="detail-kind">歌手</p>
        <h2>{detail?.artist.name ?? '歌手详情'}</h2>
        <p className="detail-meta">{detail ? `${detail.tracks.length} 首歌曲样本${detail.albums.length ? ` · ${detail.albums.length} 张专辑` : ''}` : '读取中…'}</p>
        <div className="detail-actions">
          {detail?.tracks.length ? <button className="primary" onClick={() => ctx.play(detail.tracks, 0)}><Play size={13} fill="currentColor" />播放全部</button> : null}
        </div>
      </div>
    </header>
    <TrackTable tracks={detail?.tracks ?? []} actions={ctx} emptyText="歌手信息读取中或没有曲目。" />
    {!!detail?.albums.length && <>
      <div className="library-head"><span>专辑</span></div>
      <PlaylistGrid playlists={detail.albums.map(album => ({ id: album.id, title: album.title, coverUrl: album.coverUrl, count: album.count, kind: 'unknown' as const }))}
        onOpen={playlist => ctx.openAlbum(playlist.id)} />
    </>}
  </section>;
}

export function HistoryPage({ ctx }: { ctx: LibraryContext }) {
  const [tab, setTab] = useState<'local' | 'remote'>('local');
  const [remote, setRemote] = useState<Track[]>([]);
  const [loadedRemote, setLoadedRemote] = useState(false);

  useEffect(() => {
    if (tab !== 'remote' || loadedRemote) return;
    void (async () => {
      ctx.setBusy(true);
      const result = await ctx.run(() => window.desktop.music.history(), '读取华为历史失败，请重试。');
      if (result) { setRemote(result.tracks); setLoadedRemote(true); }
      ctx.setBusy(false);
    })();
  }, [tab, loadedRemote]);

  return <section className="library">
    <div className="library-head">
      <div className="tabs">
        <button className={tab === 'local' ? 'tab active' : 'tab'} onClick={() => setTab('local')}>本机最近播放</button>
        <button className={tab === 'remote' ? 'tab active' : 'tab'} onClick={() => setTab('remote')}>华为历史（只读）</button>
      </div>
      <span className="hint">{tab === 'local' ? '仅记录本机播放，不会同步回华为。' : '来自华为账号的服务端最近播放。'}</span>
    </div>
    {tab === 'local'
      ? <TrackTable tracks={ctx.localHistory} actions={ctx} emptyText="本机还没有播放记录。" />
      : <TrackTable tracks={remote} actions={ctx} emptyText="华为历史读取中或为空。" />}
  </section>;
}

export type SettingsTab = 'playback' | 'appearance' | 'desktopLyrics' | 'about';

type LyricColors = Pick<DesktopLyricsPreferences, 'color' | 'colorEnd' | 'playedColor' | 'playedColorEnd' | 'strokeColor'>;
// The first scheme is the default look; `light` schemes are meant for bright wallpapers.
const LYRIC_PRESETS: { name: string; light?: boolean; colors: LyricColors }[] = [
  { name: '暖金', colors: { color: '#fff1b8', colorEnd: null, playedColor: '#ffd65c', playedColorEnd: null, strokeColor: '#000000' } },
  { name: '月白', colors: { color: '#ffffff', colorEnd: '#e2e8f0', playedColor: '#8fe3ff', playedColorEnd: '#3fa7ff', strokeColor: '#0b1220' } },
  { name: '天青', colors: { color: '#e9f7ff', colorEnd: '#bfe3ff', playedColor: '#6fd3ff', playedColorEnd: '#2f86ff', strokeColor: '#0a1f35' } },
  { name: '樱粉', colors: { color: '#fff1f6', colorEnd: '#ffd3e4', playedColor: '#ff9ac8', playedColorEnd: '#ff4f93', strokeColor: '#3b0d21' } },
  { name: '落日', colors: { color: '#fff4e8', colorEnd: '#ffd8b5', playedColor: '#ffbe5c', playedColorEnd: '#ff6a3d', strokeColor: '#2b1206' } },
  { name: '墨黑', light: true, colors: { color: '#3a3f47', colorEnd: '#1f2329', playedColor: '#f0454a', playedColorEnd: '#c81f32', strokeColor: '#ffffff' } },
];
// Mirrors the style defaults in main/settings.mjs; the window position and lock are not style.
const LYRIC_STYLE_DEFAULTS: DesktopLyricsPreferencePatch = {
  fontSize: 36, opacity: 1, dimWhenPaused: false, background: 'none', backgroundOpacity: 0.4,
  ...LYRIC_PRESETS[0].colors, stroke: 'medium', fontFamily: '', fontWeight: 'bold', secondaryScale: 0.64,
};
const LYRIC_SAMPLE = [...'夜航的人不说再见'];
const LYRIC_SAMPLE_TRANSLATION = 'No goodbyes on night flights';
const percentOf = (value: number, min: number, max: number) => `${Math.round(((value - min) / (max - min)) * 100)}%`;

// A visible second stop for a new gradient: darker for light colours, lighter for dark ones.
function gradientSeed(hex: string): string {
  const channels = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  const light = channels.reduce((sum, value) => sum + value, 0) / 3 > 128;
  return `#${channels.map(value => Math.round(light ? value * 0.78 : value + (255 - value) * 0.3).toString(16).padStart(2, '0')).join('')}`;
}

function ColorDot({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label className="color-dot" style={{ background: value }} title={label}>
    <input type="color" aria-label={label} value={value} onChange={event => onChange(event.target.value)} />
  </label>;
}

function GradientColor({ label, start, end, onChange }: {
  label: string; start: string; end: string | null; onChange(start: string, end: string | null): void;
}) {
  return <div className="lyric-setting-row">
    <span>{label}</span>
    <div className="color-pair">
      <ColorDot label={`${label}颜色`} value={start} onChange={next => onChange(next, end)} />
      {end !== null && <>
        <span className="color-ramp" style={{ background: `linear-gradient(to right, ${start}, ${end})` }} />
        <ColorDot label={`${label}渐变终点色`} value={end} onChange={next => onChange(start, next)} />
      </>}
      <label className="inline-toggle">
        <input type="checkbox" aria-label={`${label}使用渐变`} checked={end !== null}
          onChange={event => onChange(start, event.target.checked ? gradientSeed(start) : null)} />
        渐变
      </label>
    </div>
  </div>;
}

// The preview sings along slowly so the played colour is visible; it stays still for reduced motion.
// The ticking state lives here so only the preview re-renders, not the whole settings tab.
function LyricPreview({ preferences, backdrop, onBackdrop }: {
  preferences: DesktopLyricsPreferences; backdrop: 'dark' | 'light'; onBackdrop(value: 'dark' | 'light'): void;
}) {
  const [played, setPlayed] = useState(4);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setPlayed(count => (count + 1) % (LYRIC_SAMPLE.length + 4)), 420);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="lyric-preview" data-backdrop={backdrop} style={desktopLyricsStyle(preferences)}>
    <div className="lyric-preview-bar">
      <span className="lyric-preview-label">实时预览</span>
      <div className="segmented" role="group" aria-label="预览背景">
        <button className={backdrop === 'dark' ? 'active' : ''} aria-pressed={backdrop === 'dark'} onClick={() => onBackdrop('dark')}>
          <Moon size={12} />深色桌面
        </button>
        <button className={backdrop === 'light' ? 'active' : ''} aria-pressed={backdrop === 'light'} onClick={() => onBackdrop('light')}>
          <Sun size={12} />浅色桌面
        </button>
      </div>
    </div>
    <LyricsPlate progress={0} opacity={preferences.opacity} currentText={LYRIC_SAMPLE.join('')} secondary={LYRIC_SAMPLE_TRANSLATION}
      current={LYRIC_SAMPLE.map((character, at) => <span key={at} className={at < played ? 'passed' : ''}>{character}</span>)} />
  </div>;
}

function DesktopLyricsSettings({ fonts, fontError, onLoadFonts, notice }: {
  fonts: string[]; fontError: string; onLoadFonts(): Promise<void>; notice(text: string): void;
}) {
  const [preferences, setPreferences] = useState<DesktopLyricsPreferences | null>(null);
  // While patches are in flight, broadcasts of older states must not overwrite the optimistic copy.
  const pending = useRef(0);
  const [backdrop, setBackdrop] = useState<'dark' | 'light'>('dark');
  const [fontPicker, setFontPicker] = useState(false);
  const [fontQuery, setFontQuery] = useState('');
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.desktop.desktopLyrics.onPreferences(next => { if (!pending.current) setPreferences(next); });
    void window.desktop.desktopLyrics.getPreferences().then(next => {
      if (cancelled) return;
      setPreferences(next);
      if (LYRIC_PRESETS.some(preset => preset.light && preset.colors.color === next.color)) setBackdrop('light');
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);
  if (!preferences) return <div className="settings-form"><p className="hint">正在读取桌面歌词设置…</p></div>;
  const shown = preferences;

  function update(patch: DesktopLyricsPreferencePatch) {
    setPreferences(current => current && { ...current, ...patch });
    pending.current += 1;
    void window.desktop.desktopLyrics.updatePreferences(patch)
      .then(next => { if (pending.current === 1) setPreferences(next); })
      .catch(() => {
        notice('桌面歌词设置保存失败，请重试。');
        void window.desktop.desktopLyrics.getPreferences().then(setPreferences);
      })
      .finally(() => { pending.current -= 1; });
  }
  const preset = LYRIC_PRESETS.find(item => (Object.keys(item.colors) as (keyof LyricColors)[])
    .every(key => item.colors[key] === shown[key]));
  const visibleFonts = fontQuery.trim()
    ? fonts.filter(name => name.toLowerCase().includes(fontQuery.trim().toLowerCase()))
    : fonts;

  return <div className="settings-form appearance-form lyric-settings">
    <LyricPreview preferences={shown} backdrop={backdrop} onBackdrop={setBackdrop} />

    <h3 className="settings-section-title">配色</h3>
    <div className="lyric-presets" role="group" aria-label="歌词配色">
      {LYRIC_PRESETS.map(item => <button key={item.name} className={`lyric-preset ${preset === item ? 'active' : ''}`}
        aria-label={`歌词配色 ${item.name}`} aria-pressed={preset === item}
        onClick={() => { update(item.colors); setBackdrop(item.light ? 'light' : 'dark'); }}>
        <span className={`lyric-preset-sample ${item.light ? 'light' : ''}`} style={desktopLyricsStyle({ ...shown, ...item.colors, fontSize: 22 })}>
          <LyricText text="歌词"><span className="passed">歌</span>词</LyricText>
        </span>
        <span className="lyric-preset-name">{item.name}</span>
      </button>)}
    </div>
    <GradientColor label="未播放" start={shown.color} end={shown.colorEnd}
      onChange={(color, colorEnd) => update({ color, colorEnd })} />
    <GradientColor label="已播放" start={shown.playedColor} end={shown.playedColorEnd}
      onChange={(playedColor, playedColorEnd) => update({ playedColor, playedColorEnd })} />
    <div className="lyric-setting-row">
      <span>描边</span>
      <div className="color-pair">
        <ColorDot label="描边颜色" value={shown.strokeColor} onChange={strokeColor => update({ strokeColor })} />
        <div className="segmented" role="group" aria-label="描边粗细">
          {([['none', '无'], ['thin', '细'], ['medium', '中'], ['thick', '粗']] as [DesktopLyricsPreferences['stroke'], string][]).map(([key, label]) =>
            <button key={key} className={shown.stroke === key ? 'active' : ''} aria-pressed={shown.stroke === key}
              onClick={() => update({ stroke: key })}>{label}</button>)}
        </div>
      </div>
    </div>

    <h3 className="settings-section-title">透明度</h3>
    <label className="appearance-slider">
      <span>歌词不透明度<small>{Math.round(shown.opacity * 100)}%</small></span>
      <input type="range" aria-label="歌词不透明度" min="0.2" max="1" step="0.05" value={shown.opacity}
        style={{ '--pct': percentOf(shown.opacity, 0.2, 1) } as CSSProperties}
        onChange={event => update({ opacity: Number(event.target.value) })} />
    </label>
    <label>
      <span>暂停时变淡</span>
      <input type="checkbox" aria-label="暂停时变淡" checked={shown.dimWhenPaused}
        onChange={event => update({ dimWhenPaused: event.target.checked })} />
    </label>
    <div className="lyric-setting-row">
      <span>背景<small>颜色跟随描边</small></span>
      <div className="segmented" role="group" aria-label="歌词背景">
        {([['none', '透明字幕'], ['bar', '半透明背景条']] as [DesktopLyricsPreferences['background'], string][]).map(([key, label]) =>
          <button key={key} className={shown.background === key ? 'active' : ''} aria-pressed={shown.background === key}
            onClick={() => update({ background: key })}>{label}</button>)}
      </div>
    </div>
    <label className="appearance-slider">
      <span>背景不透明度<small>{Math.round(shown.backgroundOpacity * 100)}%</small></span>
      <input type="range" aria-label="背景不透明度" min="0.1" max="0.9" step="0.05" value={shown.backgroundOpacity}
        disabled={shown.background !== 'bar'}
        style={{ '--pct': percentOf(shown.backgroundOpacity, 0.1, 0.9) } as CSSProperties}
        onChange={event => update({ backgroundOpacity: Number(event.target.value) })} />
    </label>

    <h3 className="settings-section-title">字体</h3>
    <div className="appearance-field">
      <div className="appearance-label">
        <span>字体</span>
        <span className="hint">{shown.fontFamily ? <>当前：<strong>{shown.fontFamily}</strong></> : '跟随界面字体'}</span>
      </div>
      <div className="segmented" role="group" aria-label="歌词字体">
        <button className={!shown.fontFamily ? 'active' : ''} aria-pressed={!shown.fontFamily}
          onClick={() => { setFontPicker(false); update({ fontFamily: '' }); }}>跟随界面</button>
        <button className={shown.fontFamily ? 'active' : ''} aria-pressed={!!shown.fontFamily}
          onClick={() => { setFontPicker(true); if (!fonts.length) void onLoadFonts(); }}>系统字体…</button>
      </div>
      {fontPicker && fontError && <p className="hint">{fontError}</p>}
      {fontPicker && fonts.length > 0 && <div className="font-picker">
        <input aria-label="搜索歌词字体" placeholder={`搜索已安装字体（${fonts.length} 个）`} value={fontQuery}
          onChange={event => setFontQuery(event.target.value)} />
        <div className="font-list" role="listbox" aria-label="歌词可用字体">
          {visibleFonts.length
            ? visibleFonts.map(name => <button key={name} role="option" aria-selected={shown.fontFamily === name}
              className={shown.fontFamily === name ? 'active' : ''} style={{ fontFamily: `"${name}"` }}
              onClick={() => update({ fontFamily: name })}>{name}</button>)
            : <p className="font-list-empty">没有匹配的字体。</p>}
        </div>
      </div>}
    </div>
    <div className="lyric-setting-row">
      <span>字重</span>
      <div className="segmented" role="group" aria-label="歌词字重">
        {([['regular', '常规'], ['medium', '中等'], ['bold', '粗']] as [DesktopLyricsPreferences['fontWeight'], string][]).map(([key, label]) =>
          <button key={key} className={shown.fontWeight === key ? 'active' : ''} aria-pressed={shown.fontWeight === key}
            onClick={() => update({ fontWeight: key })}>{label}</button>)}
      </div>
    </div>
    <label className="appearance-slider">
      <span>字号<small>{shown.fontSize}px</small></span>
      <input type="range" aria-label="歌词字号" min="18" max="64" step="2" value={shown.fontSize}
        style={{ '--pct': percentOf(shown.fontSize, 18, 64) } as CSSProperties}
        onChange={event => update({ fontSize: Number(event.target.value) })} />
    </label>
    <label className="appearance-slider">
      <span>第二行字号<small>{Math.round(shown.secondaryScale * 100)}%</small></span>
      <input type="range" aria-label="第二行字号" min="0.5" max="1" step="0.02" value={shown.secondaryScale}
        style={{ '--pct': percentOf(shown.secondaryScale, 0.5, 1) } as CSSProperties}
        onChange={event => update({ secondaryScale: Number(event.target.value) })} />
    </label>
    <button className="ghost" onClick={() => { update(LYRIC_STYLE_DEFAULTS); setBackdrop('dark'); }}>
      <RotateCcw size={13} />恢复默认样式
    </button>
  </div>;
}

export function SettingsPage({ ctx, initialTab }: { ctx: LibraryContext; initialTab?: SettingsTab }) {
  const settings = ctx.settings;
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'playback');
  const appearance = settings?.appearance;
  // Optimistic local copy: dragging a slider must repaint immediately instead of waiting for the
  // IPC round-trip, otherwise fast keyboard repeats read a stale value and drop steps.
  const [draft, setDraft] = useState<AppearanceSettings | undefined>(appearance);
  useEffect(() => { setDraft(appearance); }, [appearance?.accent, appearance?.panelOpacity, appearance?.cornerRadius, appearance?.fontScale, appearance?.fontFamily]);
  const shown = draft ?? appearance ?? {
    accent: 'red' as const, panelOpacity: 1, cornerRadius: 11, fontScale: 1, fontFamily: 'sans' as const,
    customAccent: '#c8202e', customFont: '',
  };
  const accent = shown.accent;
  const opacity = shown.panelOpacity;
  const radius = shown.cornerRadius;
  const fontScale = shown.fontScale;
  const fontFamily = shown.fontFamily;
  const customAccent = shown.customAccent;
  const customFont = shown.customFont;

  // Reading installed fonts needs a user gesture and the Electron font-access permission.
  const [lyricsCache, setLyricsCache] = useState<LyricsCacheInfo | null>(null);
  useEffect(() => { void window.desktop.lyrics.cacheInfo().then(result => { if (result.ok) setLyricsCache(result.data); }); }, []);
  async function clearLyricsCache(local: boolean) {
    const result = await window.desktop.lyrics.clearCache({ local }).catch(() => null);
    if (result?.ok) {
      setLyricsCache(result.data);
      ctx.notice(local ? '已清除本地导入与网络歌词缓存。' : '已清除网络歌词缓存。');
    } else ctx.notice('清除歌词缓存失败，请重试。');
  }

  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontQuery, setFontQuery] = useState('');
  const [fontError, setFontError] = useState('');
  async function loadSystemFonts() {
    setFontError('');
    async function attempt(): Promise<string[]> {
      const result = await window.desktop.fonts.list().catch(() => null);
      return result?.ok ? result.data.families : [];
    }
    let families = await attempt();
    if (!families.length) families = await attempt();
    setSystemFonts(families);
    setFontError(families.length ? '' : '没有读到系统字体；可先使用内置字体方案。');
  }
  const visibleFonts = fontQuery.trim()
    ? systemFonts.filter(name => name.toLowerCase().includes(fontQuery.trim().toLowerCase()))
    : systemFonts;

  function updateAppearance(patch: Partial<AppearanceSettings>) {
    const next = { ...shown, ...patch };
    setDraft(next);
    void ctx.updateSettings({ appearance: next }).then(ok => { if (!ok) setDraft(undefined); });
  }

  const tabs: { key: typeof tab; label: string; name?: string }[] = [
    { key: 'playback', label: '播放' },
    { key: 'appearance', label: '外观' },
    // Named apart from the player bar's 桌面歌词 switch so both stay unambiguous.
    { key: 'desktopLyrics', label: '桌面歌词', name: '桌面歌词设置' },
    { key: 'about', label: '关于' },
  ];

  return <section className="library settings-page">
    <nav className="settings-nav" aria-label="设置分类">
      {tabs.map(item => <button key={item.key}
        className={`settings-nav-item ${tab === item.key ? 'active' : ''}`}
        aria-current={tab === item.key ? 'page' : undefined} aria-label={item.name}
        onClick={() => setTab(item.key)}>{item.label}</button>)}
    </nav>
    <div className="settings-panel">
      {tab === 'playback' && <div className="settings-form">
        <label>
          <span>关闭窗口时</span>
          <select aria-label="关闭窗口时行为" value={settings?.closeBehavior ?? 'quit'} onChange={event => ctx.setCloseBehavior(event.target.value as AppSettings['closeBehavior'])}>
            <option value="quit">退出程序</option>
            <option value="tray">最小化到托盘</option>
          </select>
        </label>
        <label>
          <span>默认音质</span>
          <select aria-label="默认音质" value={settings?.quality ?? 'standard'} onChange={event => void ctx.updateSettings({ quality: event.target.value as AppSettings['quality'] })}>
            <option value="standard">标准</option>
            <option value="lossless">无损</option>
          </select>
        </label>
        <label>
          <span>播放模式</span>
          <select aria-label="播放模式" value={settings?.shuffle ? 'shuffle' : settings?.repeatMode ?? 'off'}
            onChange={event => {
              const value = event.target.value;
              if (value === 'shuffle') void ctx.updateSettings({ shuffle: true, repeatMode: 'off' });
              else void ctx.updateSettings({ shuffle: false, repeatMode: value as AppSettings['repeatMode'] });
            }}>
            <option value="off">顺序播放</option>
            <option value="all">列表循环</option>
            <option value="one">单曲循环</option>
            <option value="shuffle">随机播放（打乱队列顺序）</option>
          </select>
        </label>
        <label>
          <span>同步播放到华为历史</span>
          <input type="checkbox" aria-label="同步播放到华为历史" checked={settings?.syncHistory ?? true}
            onChange={event => void ctx.updateSettings({ syncHistory: event.target.checked })} />
        </label>
        <p className="hint">开启后，实际听到一定时长才会上报；快速跳过的曲目不记入华为历史，也不上报播放器未真实播放的秒数。接口形态来自公开 H5 资源，尚未用真实账号验证，失败不影响播放。</p>
        <label>
          <span>第三方歌词匹配</span>
          <input type="checkbox" aria-label="第三方歌词匹配" checked={settings?.thirdPartyLyrics ?? true}
            onChange={event => void ctx.updateSettings({ thirdPartyLyrics: event.target.checked })} />
        </label>
        <p className="hint">华为接口没有返回歌词时，用「歌名 + 艺人 + 时长」在酷狗音乐和 LRCLIB 严格匹配；匹配不准则保持无歌词，不会显示别的歌。只请求歌词文本，不涉及音源，也不会上传账号信息。</p>
        <div className="cache-block">
          <div className="cache-text">
            <span>歌词缓存</span>
            <span className="hint">
              {lyricsCache
                ? `${formatBytes(lyricsCache.bytes)} · 网络 ${lyricsCache.entries} 首 · 本地导入 ${lyricsCache.localEntries} 首`
                : '正在读取缓存信息…'}
            </span>
          </div>
          <div className="cache-actions">
            <button className="ghost" onClick={() => void clearLyricsCache(false)} disabled={!lyricsCache?.entries}>清除网络缓存</button>
            <button className="ghost danger" onClick={() => void clearLyricsCache(true)} disabled={!lyricsCache?.entries && !lyricsCache?.localEntries}>清除本地导入</button>
          </div>
        </div>
        <p className="hint">歌词按曲目缓存在本机 90 天，重启或切换账号后仍可用；本地导入的 LRC 优先级最高，可在歌词面板里移除。</p>
      </div>}

      {tab === 'appearance' && <div className="settings-form appearance-form">
        <div className="appearance-field">
          <div className="appearance-label">
            <span>主题色</span>
            <span className="hint">播放按钮、当前曲目、高亮选中项</span>
          </div>
          <div className="accent-swatches" role="group" aria-label="主题色">
            {(Object.keys(ACCENT_SWATCHES) as Exclude<AccentName, 'custom'>[]).map(name => <button key={name}
              className={`accent-swatch ${accent === name ? 'active' : ''}`}
              style={{ background: ACCENT_SWATCHES[name].swatch, color: ACCENT_SWATCHES[name].swatch }}
              aria-label={`主题色 ${ACCENT_SWATCHES[name].label}`}
              aria-pressed={accent === name}
              onClick={() => updateAppearance({ accent: name })} />)}
            <label className={`accent-swatch accent-swatch-custom ${accent === 'custom' ? 'active' : ''}`}
              style={{ background: customAccent, color: customAccent }} title="自定义主题色">
              <input type="color" aria-label="自定义主题色" value={customAccent}
                onChange={event => updateAppearance({ accent: 'custom', customAccent: event.target.value })} />
            </label>
          </div>
        </div>
        <label className="appearance-slider">
          <span>面板透明度<small>{Math.round(opacity * 100)}%</small></span>
          <input type="range" aria-label="面板透明度" min="0.55" max="1" step="0.05" value={opacity}
            style={{ '--pct': `${Math.round(((opacity - 0.55) / 0.45) * 100)}%` } as CSSProperties}
            onChange={event => updateAppearance({ panelOpacity: Number(event.target.value) })} />
        </label>
        <label className="appearance-slider">
          <span>圆角<small>{radius}px</small></span>
          <input type="range" aria-label="圆角" min="0" max="18" step="1" value={radius}
            style={{ '--pct': `${Math.round((radius / 18) * 100)}%` } as CSSProperties}
            onChange={event => updateAppearance({ cornerRadius: Number(event.target.value) })} />
        </label>
        <label className="appearance-slider">
          <span>字体大小<small>{Math.round(fontScale * 100)}%</small></span>
          <input type="range" aria-label="字体大小" min="0.85" max="1.2" step="0.05" value={fontScale}
            style={{ '--pct': `${Math.round(((fontScale - 0.85) / 0.35) * 100)}%` } as CSSProperties}
            onChange={event => updateAppearance({ fontScale: Number(event.target.value) })} />
        </label>
        <div className="appearance-field">
          <div className="appearance-label">
            <span>字体</span>
            <span className="hint">界面与歌词正文</span>
          </div>
          <div className="segmented" role="group" aria-label="字体">
            {([['sans', '无衬线'], ['serif', '衬线'], ['mono', '等宽']] as [FontChoice, string][]).map(([key, label]) =>
              <button key={key} className={fontFamily === key ? 'active' : ''} aria-pressed={fontFamily === key}
                onClick={() => updateAppearance({ fontFamily: key })}>{label}</button>)}
            <button className={fontFamily === 'custom' ? 'active' : ''} aria-pressed={fontFamily === 'custom'}
              onClick={() => void loadSystemFonts()}>系统字体…</button>
          </div>
          {fontFamily === 'custom' && customFont && <p className="hint">当前字体：<strong>{customFont}</strong></p>}
          {fontError && <p className="hint">{fontError}</p>}
          {systemFonts.length > 0 && <div className="font-picker">
            <input aria-label="搜索系统字体" placeholder={`搜索已安装字体（${systemFonts.length} 个）`} value={fontQuery}
              onChange={event => setFontQuery(event.target.value)} />
            <div className="font-list" role="listbox" aria-label="已安装字体">
              {visibleFonts.length
                ? visibleFonts.map(name => <button key={name} role="option" aria-selected={customFont === name}
                  className={customFont === name ? 'active' : ''} style={{ fontFamily: `"${name}"` }}
                  onClick={() => updateAppearance({ fontFamily: 'custom', customFont: name })}>{name}</button>)
                : <p className="font-list-empty">没有匹配的字体。</p>}
            </div>
          </div>}
        </div>
        <button className="ghost" onClick={() => updateAppearance({ accent: 'red', panelOpacity: 1, cornerRadius: 11, fontScale: 1, fontFamily: 'sans' })}>恢复默认外观</button>
      </div>}

      {tab === 'desktopLyrics' && <DesktopLyricsSettings fonts={systemFonts} fontError={fontError}
        onLoadFonts={loadSystemFonts} notice={ctx.notice} />}

      {tab === 'about' && <div className="settings-form">
        <p className="hint">
          本项目与华为无隶属或合作关系，未获官方授权，仅供学习研究。凭证由系统安全存储保存；
          系统安全存储不可用时退出后需重新登录。首版不提供自动更新。
        </p>
        <button className="ghost danger" onClick={() => void window.desktop.app.quit()}>退出程序</button>
      </div>}

      <p className="settings-version">当前版本 {__APP_VERSION__} · {APP_DISPLAY_NAME}</p>
    </div>
  </section>;
}
