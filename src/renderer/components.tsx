import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart, Headphones, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import type { LyricsDoc, Playlist, Track } from '../shared/types';

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export type TrackActions = {
  currentTrackId: string | null;
  playing: boolean;
  favoriteOf(trackId: string): boolean | undefined;
  play(tracks: Track[], index: number): void;
  toggleFavorite(track: Track, favorite: boolean): void;
  openAlbum(id: string): void;
  openArtist(id: string): void;
};

type TrackTableProps = {
  tracks: Track[];
  actions: TrackActions;
  onLoadMore?: () => void;
  hasMore?: boolean;
  busy?: boolean;
  loadMoreLabel?: string;
  emptyText?: string;
};

export function TrackTable({ tracks, actions, onLoadMore, hasMore, busy, loadMoreLabel = '加载更多', emptyText }: TrackTableProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!tracks.length) return <div className="list-empty"><p>{emptyText ?? '这里还没有内容。'}</p></div>;
  return <>
    <div className="track-list">
      {tracks.map((track, index) => {
        const favorite = actions.favoriteOf(track.id);
        const current = actions.currentTrackId === track.id;
        return <div
          key={`${track.id}-${index}`}
          className={`track-row ${current ? 'is-current' : ''} ${selected === `${track.id}-${index}` ? 'is-selected' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`${track.title}，${track.artists.map(artist => artist.name).join('、') || '未知艺人'}`}
          onClick={() => setSelected(`${track.id}-${index}`)}
          onDoubleClick={() => actions.play(tracks, index)}
          onKeyDown={event => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); actions.play(tracks, index); }
          }}
        >
          <span className="track-index">{current && actions.playing ? '♫' : String(index + 1).padStart(2, '0')}</span>
          <span className="track-title" title={track.title}>
            <span className="track-name">{track.title}</span>
            <small>
              {track.artists.map(artist => artist.id
                ? <button key={artist.id} className="link" onClick={event => { event.stopPropagation(); actions.openArtist(artist.id!); }}>{artist.name}</button>
                : <span key={artist.name}>{artist.name}</span>)
                .reduce<ReactNode[]>((nodes, node, at) => (at === 0 ? [node] : [...nodes, ' / ', node]), [])}
              {!track.artists.length && '未知艺人'}
            </small>
          </span>
          <span className="track-album">
            {track.album?.id
              ? <button className="link" onClick={event => { event.stopPropagation(); actions.openAlbum(track.album!.id); }}>{track.album.title}</button>
              : track.album?.title ?? '—'}
          </span>
          <span className="track-duration">{formatDuration(track.durationSeconds)}</span>
          <button
            className={`favorite-toggle ${favorite ? 'on' : ''}`}
            aria-label={favorite === undefined ? `切换收藏 ${track.title}` : favorite ? `取消收藏 ${track.title}` : `收藏 ${track.title}`}
            aria-pressed={!!favorite}
            title={favorite === undefined ? '先核对服务端收藏状态，再切换' : undefined}
            onClick={event => { event.stopPropagation(); actions.toggleFavorite(track, !favorite); }}
          >
            <Heart size={14} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        </div>;
      })}
    </div>
    {hasMore && onLoadMore && <button className="ghost load-more" onClick={onLoadMore} disabled={busy}>{busy ? '正在读取…' : loadMoreLabel}</button>}
  </>;
}

type PlaylistsProps = { playlists: Playlist[]; onOpen(playlist: Playlist): void };

export function PlaylistGrid({ playlists, onOpen }: PlaylistsProps) {
  if (!playlists.length) return <div className="list-empty"><p>没有找到歌单。收藏歌单、自建歌单和榜单会显示在这里。</p></div>;
  return <div className="playlist-grid">
    {playlists.map(playlist => <button key={`${playlist.kind}-${playlist.id}`} className="playlist-card" onClick={() => onOpen(playlist)}>
      <span className="playlist-art">{playlist.coverUrl ? <img src={playlist.coverUrl} alt="" loading="lazy" /> : <ListMusic size={20} />}</span>
      <strong>{playlist.title}</strong>
      <small>{playlist.kind === 'owned' ? '自建歌单' : playlist.kind === 'collected' ? '收藏歌单' : playlist.kind === 'chart' ? '榜单' : '未知类型'}{playlist.count !== undefined ? ` · ${playlist.count} 首` : ''}</small>
    </button>)}
  </div>;
}

type PlayerBarProps = {
  track?: Track;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  volume: number;
  quality: 'standard' | 'lossless';
  actualQuality: 'standard' | 'lossless' | 'unknown';
  repeatMode: 'off' | 'all' | 'one';
  shuffle: boolean;
  disabled: boolean;
  onToggle(): void;
  onPrevious(): void;
  onNext(): void;
  onSeekPreview(value: number): void;
  onSeekCommit(): void;
  onVolume(value: number): void;
  onToggleQuality(): void;
  onToggleRepeat(): void;
  onToggleShuffle(): void;
  onToggleLyrics(): void;
  onToggleQueue(): void;
  lyricsOpen: boolean;
  queueOpen: boolean;
  queueCount: number;
  favorite: boolean | undefined;
  onToggleFavorite(): void;
};

export function PlayerBar(props: PlayerBarProps) {
  const { track, playing, buffering, position, duration, volume } = props;
  const repeatLabel = props.repeatMode === 'one' ? '单曲循环' : props.repeatMode === 'all' ? '列表循环' : '顺序播放';
  return <footer className="player">
    <div className="now-playing">
      <div className="cover">{track?.coverUrl ? <img src={track.coverUrl} alt="" /> : <Headphones size={18} />}</div>
      <div className="now-playing-text">
        <strong>{track?.title ?? '尚未选择歌曲'}</strong>
        <span>
          {buffering ? '正在缓冲…' : playing ? '正在播放' : track ? track.artists.map(artist => artist.name).join(' / ') || '未知艺人' : '选择一首歌开始播放'}
          {props.actualQuality !== 'unknown' ? ` · ${props.actualQuality === 'lossless' ? '无损' : '标准'}` : ''}
        </span>
      </div>
      <button className={`favorite-toggle ${props.favorite ? 'on' : ''}`} aria-label="收藏当前歌曲" aria-pressed={!!props.favorite}
        disabled={!track} onClick={props.onToggleFavorite}>
        <Heart size={15} fill={props.favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
    <div className="player-controls">
      <div className="buttons">
        <button aria-label="随机播放" aria-pressed={props.shuffle} className={props.shuffle ? 'active' : ''} onClick={props.onToggleShuffle} disabled={props.disabled}>
          <ListMusic size={16} />
        </button>
        <button aria-label="上一首" onClick={props.onPrevious} disabled={props.disabled}><SkipBack size={17} /></button>
        <button className="play-button" aria-label={playing ? '暂停' : '播放'} onClick={props.onToggle} disabled={props.disabled}>
          {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
        </button>
        <button aria-label="下一首" onClick={props.onNext} disabled={props.disabled}><SkipForward size={17} /></button>
        <button aria-label={repeatLabel} aria-pressed={props.repeatMode !== 'off'} className={props.repeatMode !== 'off' ? 'active' : ''} onClick={props.onToggleRepeat} disabled={props.disabled}>
          {props.repeatMode === 'one' ? '①' : '↻'}
        </button>
      </div>
      <div className="progress">
        <span>{formatDuration(position)}</span>
        <input aria-label="播放进度" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(position, duration || 1)}
          disabled={!duration} onChange={event => props.onSeekPreview(Number(event.target.value))}
          onPointerUp={props.onSeekCommit} onKeyUp={props.onSeekCommit} onBlur={props.onSeekCommit} />
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
    <div className="volume">
      <button className="quality-button" onClick={props.onToggleQuality} disabled={!track}>{props.quality === 'lossless' ? '无损' : '标准'}</button>
      <button className="text-button" aria-label="歌词" aria-pressed={props.lyricsOpen} onClick={props.onToggleLyrics} disabled={!track}>词</button>
      <button className="text-button" aria-label="播放队列" aria-pressed={props.queueOpen} onClick={props.onToggleQueue} disabled={!props.queueCount}>队列 {props.queueCount}</button>
      <Volume2 size={17} />
      <input aria-label="音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => props.onVolume(Number(event.target.value))} />
    </div>
  </footer>;
}

export function LyricsPanel({ doc, positionSeconds, onClose }: { doc: LyricsDoc | null; positionSeconds: number; onClose(): void }) {
  const [following, setFollowing] = useState(true);
  const container = useRef<HTMLDivElement | null>(null);
  const lines = doc?.lines ?? [];
  const activeIndex = doc?.synced
    ? lines.reduce((found, line, index) => (line.timeMs !== null && line.timeMs <= positionSeconds * 1000 ? index : found), -1)
    : -1;
  useEffect(() => { setFollowing(true); }, [doc]);
  useEffect(() => {
    if (following && activeIndex >= 0) container.current?.querySelector('.active')?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [activeIndex, following]);
  return <aside className="side-panel" aria-label="歌词">
    <div className="panel-head"><strong>歌词</strong><button className="text-button" onClick={onClose}>关闭</button></div>
    {!doc || !lines.length
      ? <p className="panel-empty">暂无歌词。</p>
      : <><div ref={container} className={`lyrics ${doc.synced ? 'synced' : ''}`}
          onWheel={() => setFollowing(false)} onTouchMove={() => setFollowing(false)} tabIndex={0}
          onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) setFollowing(false); }}>
        {lines.map((line, index) => <p key={`${index}-${line.text}`} className={index === activeIndex ? 'active' : ''}>{line.text || '♪'}</p>)}
      </div>{doc.synced && !following && <button className="ghost" onClick={() => setFollowing(true)}>跟随播放</button>}</>}
  </aside>;
}

export function QueuePanel({ tracks, currentId, onSelect, onClose }: { tracks: Track[]; currentId: string | null; onSelect(index: number): void; onClose(): void }) {
  return <aside className="side-panel" aria-label="播放队列">
    <div className="panel-head"><strong>播放队列</strong><button className="text-button" onClick={onClose}>关闭</button></div>
    {!tracks.length
      ? <p className="panel-empty">队列为空。</p>
      : <ol className="queue-list">
        {tracks.map((track, index) => <li key={`${track.id}-${index}`}>
          <button className={`queue-item ${track.id === currentId ? 'active' : ''}`} onClick={() => onSelect(index)}>
            <span>{track.title}</span><small>{track.artists.map(artist => artist.name).join(' / ') || '未知艺人'}</small>
          </button>
        </li>)}
      </ol>}
  </aside>;
}
