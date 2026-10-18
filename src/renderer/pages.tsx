import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Disc3, ListMusic, Mic2, Play, Search as SearchIcon, Trash2 } from 'lucide-react';
import { Cover, PlaylistGrid, TrackTable, type TrackActions } from './components';
import { mergeFavoritesPage } from './favorites-pagination.mjs';
import type {
  AccentName, AlbumDetail, AppearanceSettings, ArtistDetail, AppSettings, FontChoice, Playlist, Result, SavedQueue, Track,
} from '../shared/types';
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
const ACCENT_SWATCHES: Record<AccentName, { label: string; swatch: string }> = {
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

export function SettingsPage({ ctx }: { ctx: LibraryContext }) {
  const settings = ctx.settings;
  const [tab, setTab] = useState<'playback' | 'appearance' | 'about'>('playback');
  const appearance = settings?.appearance;
  // Optimistic local copy: dragging a slider must repaint immediately instead of waiting for the
  // IPC round-trip, otherwise fast keyboard repeats read a stale value and drop steps.
  const [draft, setDraft] = useState<AppearanceSettings | undefined>(appearance);
  useEffect(() => { setDraft(appearance); }, [appearance?.accent, appearance?.panelOpacity, appearance?.cornerRadius, appearance?.fontScale, appearance?.fontFamily]);
  const shown = draft ?? appearance ?? { accent: 'red' as const, panelOpacity: 1, cornerRadius: 11, fontScale: 1, fontFamily: 'sans' as const };
  const accent = shown.accent;
  const opacity = shown.panelOpacity;
  const radius = shown.cornerRadius;
  const fontScale = shown.fontScale;
  const fontFamily = shown.fontFamily;

  function updateAppearance(patch: Partial<AppearanceSettings>) {
    const next = { ...shown, ...patch };
    setDraft(next);
    void ctx.updateSettings({ appearance: next }).then(ok => { if (!ok) setDraft(undefined); });
  }

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'playback', label: '播放' },
    { key: 'appearance', label: '外观' },
    { key: 'about', label: '关于' },
  ];

  return <section className="library settings-page">
    <nav className="settings-nav" aria-label="设置分类">
      {tabs.map(item => <button key={item.key}
        className={`settings-nav-item ${tab === item.key ? 'active' : ''}`}
        aria-current={tab === item.key ? 'page' : undefined}
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
      </div>}

      {tab === 'appearance' && <div className="settings-form appearance-form">
        <div className="appearance-field">
          <div className="appearance-label">
            <span>主题色</span>
            <span className="hint">播放按钮、当前曲目、高亮选中项</span>
          </div>
          <div className="accent-swatches" role="group" aria-label="主题色">
            {(Object.keys(ACCENT_SWATCHES) as AccentName[]).map(name => <button key={name}
              className={`accent-swatch ${accent === name ? 'active' : ''}`}
              style={{ background: ACCENT_SWATCHES[name].swatch, color: ACCENT_SWATCHES[name].swatch }}
              aria-label={`主题色 ${ACCENT_SWATCHES[name].label}`}
              aria-pressed={accent === name}
              onClick={() => updateAppearance({ accent: name })} />)}
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
          </div>
        </div>
        <button className="ghost" onClick={() => updateAppearance({ accent: 'red', panelOpacity: 1, cornerRadius: 11, fontScale: 1, fontFamily: 'sans' })}>恢复默认外观</button>
      </div>}

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
