import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Disc3, Heart, ListMusic, Play } from 'lucide-react';
import { Cover, TrackTable } from './components';
import { mergeFavoritesPage } from './favorites-pagination.mjs';
import type { LibraryContext } from './pages';
import type { Track } from '../shared/types';

const PAGE = 50;

// Kept mounted for the current account: navigation must not reset pagination or scroll position.
export function FavoritesPage({ ctx, active, currentTrack, onOpenPlaylists, onContinue }: {
  ctx: LibraryContext;
  active: boolean;
  currentTrack?: Track;
  onOpenPlaylists(): void;
  onContinue(): void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState(false);
  const [error, setError] = useState('');
  const [cacheHint, setCacheHint] = useState('');
  const [filling, setFilling] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const container = useRef<HTMLElement | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const data = useRef({ tracks: [] as Track[], hasMore: false, nextStart: 0 });
  const requestId = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const fillingRef = useRef(false);
  const scrollPosition = useRef(0);
  const refreshPending = useRef(false);
  const retryAction = useRef({ refresh: false, append: false });
  const seenChange = useRef(ctx.favoriteChange?.revision ?? 0);

  async function count(epoch = requestId.current) {
    setCounting(true); setCountError(false);
    try {
      const result = await window.desktop.music.favoritesSummary();
      if (!mounted.current || epoch !== requestId.current) return;
      if (result.ok) setTotal(result.data.total);
      else setCountError(true);
    } catch { if (mounted.current && epoch === requestId.current) setCountError(true); }
    finally { if (mounted.current && epoch === requestId.current) setCounting(false); }
  }

  async function load(refresh = false, append = false): Promise<boolean> {
    if (pending.current || (append && !data.current.hasMore)) return false;
    const epoch = refresh ? ++requestId.current : requestId.current;
    pending.current = true; setLoading(true); setError('');
    retryAction.current = { refresh, append };
    if (refresh) { setTotal(null); setCountError(false); }
    try {
      const result = await window.desktop.music.favorites({ start: append ? data.current.nextStart : 0, limit: PAGE, refresh });
      if (!mounted.current || epoch !== requestId.current) return false;
      if (!result.ok) { setError(result.error.message); return false; }
      const page = result.data;
      const next = mergeFavoritesPage(append ? data.current.tracks : [], page);
      data.current = next;
      setTracks(next.tracks); setHasMore(next.hasMore); setLoaded(true); setCacheHint(page.cacheHint ?? '');
      for (const track of page.tracks) ctxRef.current.setFavoriteState(track.id, true);
      if (page.total !== undefined) setTotal(page.total);
      // A terminal unique page is also count evidence, but a stalled/repeated page is not.
      if (!page.hasMore) setTotal(page.total ?? next.tracks.length);
      else if (append && !next.hasMore) {
        retryAction.current = { refresh: true, append: false };
        setError('服务端没有返回新的收藏，已暂停加载；请刷新核对。');
        return false;
      }
      if (!append && page.hasMore && !page.cacheHint) void count(epoch);
      return true;
    } catch {
      if (mounted.current && epoch === requestId.current) setError('读取收藏失败；已加载内容保留，请重试。');
      return false;
    } finally {
      if (mounted.current && epoch === requestId.current) {
        pending.current = false; setLoading(false);
        if (refreshPending.current) { refreshPending.current = false; void load(true); }
      }
    }
  }

  useEffect(() => {
    const revision = ctx.favoriteChange?.revision ?? 0;
    if (revision === seenChange.current) return;
    seenChange.current = revision;
    fillingRef.current = false; setFilling(false);
    if (pending.current) refreshPending.current = true;
    else void load(true);
  }, [ctx.favoriteChange]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; requestId.current++; pending.current = false; fillingRef.current = false; };
  }, []);

  useLayoutEffect(() => {
    const scrollRoot = container.current?.closest<HTMLElement>('.main-content');
    if (!scrollRoot || !active) return;
    scrollRoot.scrollTop = scrollPosition.current;
    const remember = () => { scrollPosition.current = scrollRoot.scrollTop; };
    scrollRoot.addEventListener('scroll', remember, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', remember);
  }, [active]);

  useEffect(() => {
    if (!active || !sentinel.current || !hasMore || loading || error || filling || cacheHint) return;
    const root = container.current?.closest('.main-content');
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load(false, true);
    }, { root, rootMargin: '0px 0px 320px 0px', threshold: 0 });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [active, hasMore, loading, error, filling, cacheHint]);

  async function playAll() {
    if (pending.current || fillingRef.current) return;
    fillingRef.current = true; setFilling(true);
    const epoch = requestId.current;
    try {
      while (data.current.hasMore && fillingRef.current && mounted.current && epoch === requestId.current) {
        if (!await load(false, true)) return;
      }
      if (fillingRef.current && mounted.current && epoch === requestId.current && data.current.tracks.length) {
        ctxRef.current.play(data.current.tracks, 0);
      }
    } finally { fillingRef.current = false; if (mounted.current) setFilling(false); }
  }

  return <section ref={container} className="library favorites-library" aria-label="收藏歌曲" hidden={!active}>
    <div className="library-overview">
      <button className="overview-card collection-card" onClick={() => void playAll()} disabled={!tracks.length || loading || filling}
        aria-label="播放收藏歌曲">
        <span className="overview-kind"><Heart size={15} />我的收藏</span>
        <span className="overview-art"><Cover src={tracks[0]?.coverUrl} icon={<Heart size={52} />} /></span>
        <span className="overview-copy"><strong>{total === null ? '收藏的声音' : `${total.toLocaleString('zh-CN')} 首心动`}</strong>
          <small>{filling ? `正在准备 ${tracks.length} 首…` : '把喜欢的声音，留在身边'}</small></span>
        <span className="overview-play"><Play size={16} fill="currentColor" /></span>
      </button>
      <button className="overview-card continue-card" disabled={!currentTrack} onClick={onContinue}>
        <span className="overview-kind"><Disc3 size={15} />接着听</span>
        <span className="overview-art"><Cover src={currentTrack?.coverUrl} icon={<Disc3 size={58} />} /></span>
        <span className="overview-copy"><strong>{currentTrack?.title ?? '此刻，听点什么'}</strong>
          <small>{currentTrack?.artists.map(artist => artist.name).join(' / ') || '选择一首歌，开始聆听'}</small></span>
        <span className="overview-play"><Play size={16} fill="currentColor" /></span>
      </button>
      <button className="overview-card playlists-card" onClick={onOpenPlaylists} aria-label="浏览歌单">
        <span className="overview-kind"><ListMusic size={15} />我的歌单</span>
        <span className="overview-orbit"><ListMusic size={46} /></span>
        <span className="overview-copy"><strong>每种心情，都有回声</strong><small>自建与收藏的歌单</small></span>
      </button>
    </div>
    <div className="library-head">
      <div className="collection-count" aria-live="polite">
        <strong>{total === null ? '我的收藏' : `共 ${total.toLocaleString('zh-CN')} 首收藏`}</strong>
        <span>{loaded ? `已加载 ${tracks.length.toLocaleString('zh-CN')} 首` : loading ? '正在读取首批歌曲…' : '尚未读取'}{counting ? ' · 正在统计总数…' : ''}</span>
        {countError && <button className="text-button" onClick={() => void count()}>总数统计失败，重试</button>}
      </div>
      <div className="head-actions">
        {tracks.length > 0 && <button className="text-button" onClick={() => void playAll()} disabled={loading || filling}>
          {filling ? `正在准备 ${data.current.tracks.length} 首…` : '播放全部'}
        </button>}
        {filling && <button className="ghost" onClick={() => { fillingRef.current = false; setFilling(false); }}>取消准备</button>}
        <button className="ghost" disabled={loading || filling} onClick={() => void load(true)}>刷新收藏</button>
      </div>
    </div>
    {cacheHint && <p className="collection-warning" role="status">{cacheHint}</p>}
    {error && <div className="collection-error" role="alert"><span>{error}</span><button className="ghost" onClick={() => void load(retryAction.current.refresh, retryAction.current.append)}>重试加载收藏</button></div>}
    <TrackTable tracks={tracks} actions={ctx} emptyText={loaded ? '还没有收藏歌曲，可以搜索后添加收藏。' : loading ? '正在读取收藏…' : '收藏未能读取，请重试。'} />
    <div ref={sentinel} className="collection-end" aria-live="polite">
      {hasMore ? <>
        <span>{loading ? '正在加载下一批歌曲…' : error ? '加载已暂停' : cacheHint ? '离线缓存，仅显示已有内容' : '继续向下滚动以加载下一批'}</span>
        <button className="ghost" disabled={loading || filling} onClick={() => void load(false, true)}>加载更多收藏</button>
      </> : loaded && tracks.length > 0 ? <span>已加载全部收藏</span> : null}
    </div>
  </section>;
}
