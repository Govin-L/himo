import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { AArrowDown, AArrowUp, Lock, Settings, Sun, SunDim, X } from 'lucide-react';
import { activeLyricIndex } from '../lyrics.mjs';
import type { DesktopLyricsPreferencePatch, DesktopLyricsPreferences, DesktopLyricsState } from '../shared/types';
import './desktop-lyrics.css';

const STROKE_WIDTH = { none: 0, thin: 1, medium: 1.5, thick: 2.5 } as const;
const FONT_WEIGHT = { regular: 400, medium: 600, bold: 700 } as const;

/** CSS variables for a lyric style; shared by the overlay, the settings preview and its preset tiles. */
export function desktopLyricsStyle(preferences: DesktopLyricsPreferences): CSSProperties {
  return {
    '--desktop-lyrics-size': `${preferences.fontSize}px`,
    '--lyric-color': preferences.color,
    '--lyric-color-end': preferences.colorEnd ?? preferences.color,
    '--lyric-played': preferences.playedColor,
    '--lyric-played-end': preferences.playedColorEnd ?? preferences.playedColor,
    '--lyric-stroke-color': preferences.strokeColor,
    // Doubled: the fill covers the inner half, so only a crisp outer outline remains.
    '--lyric-stroke': `${STROKE_WIDTH[preferences.stroke] * 2}px`,
    '--lyric-font': preferences.fontFamily ? `"${preferences.fontFamily}", var(--font-ui)` : 'var(--font-ui)',
    '--lyric-weight': FONT_WEIGHT[preferences.fontWeight],
    '--lyric-secondary-scale': preferences.secondaryScale,
    '--lyric-plate-opacity': preferences.background === 'bar' ? preferences.backgroundOpacity : 0,
  } as CSSProperties;
}

/** Outlined text: the plain string feeds the outline layer drawn under the (possibly segmented) fill. */
export function LyricText({ text, children }: { text: string; children?: ReactNode }) {
  return <span className="desktop-lyrics-text" data-text={text}>
    <span className="desktop-lyrics-fill">{children ?? text}</span>
  </span>;
}

function SubtitleLine({ children, text, progress, className }: { children: ReactNode; text: string; progress: number; className: string }) {
  const viewport = useRef<HTMLParagraphElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setOverflow(Math.max(0, content.current!.scrollWidth - viewport.current!.clientWidth));
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current!); observer.observe(content.current!); measure();
    return () => observer.disconnect();
  }, []);
  return <p ref={viewport} className={className}>
    <span ref={content} className="desktop-lyrics-text" data-text={text} style={{ transform: `translateX(-${overflow * progress}px)` }}>
      <span className="desktop-lyrics-fill">{children}</span>
    </span>
  </p>;
}

/** The current and second line on the optional background plate. */
export function LyricsPlate({ current, currentText, secondary, progress, opacity, waiting }: {
  current: ReactNode; currentText: string; secondary: string; progress: number; opacity: number; waiting?: boolean;
}) {
  return <div className={waiting ? 'desktop-lyrics-lines waiting' : 'desktop-lyrics-lines'}>
    <div className="desktop-lyrics-plate" style={{ '--lyric-text-opacity': opacity } as CSSProperties}>
      <SubtitleLine className="desktop-lyrics-current" text={currentText} progress={progress}>{current}</SubtitleLine>
      <SubtitleLine className="desktop-lyrics-secondary" text={secondary} progress={progress}>{secondary}</SubtitleLine>
    </div>
  </div>;
}

// Opacity steps are rounded the same way the settings sanitiser rounds them.
const stepOpacity = (value: number, delta: number) => Math.round(Math.min(1, Math.max(0.2, value + delta)) * 100) / 100;

export function DesktopLyricsWindow() {
  const [state, setState] = useState<DesktopLyricsState | null>(null);
  const [preferences, setPreferences] = useState<DesktopLyricsPreferences | null>(null);
  const [error, setError] = useState('');
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  useEffect(() => {
    let received = false;
    let cancelled = false;
    const unsubscribe = window.desktopLyricsOverlay.onState(next => { received = true; setState(next); });
    const unsubscribePreferences = window.desktopLyricsOverlay.onPreferences(setPreferences);
    void window.desktopLyricsOverlay.getState().then(initial => {
      if (!cancelled && !received) setState(initial);
    });
    void window.desktopLyricsOverlay.getPreferences().then(next => { if (!cancelled) setPreferences(next); });
    return () => { cancelled = true; unsubscribe(); unsubscribePreferences(); };
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 2600);
    return () => window.clearTimeout(timer);
  }, [error]);
  const fontSize = preferences?.fontSize ?? 36;
  const opacity = preferences?.opacity ?? 1;
  const lines = state?.lyrics?.lines ?? [];
  const timeMs = ((state?.positionSeconds ?? 0) + (state?.offsetSeconds ?? 0)) * 1000;
  const index = state?.lyrics?.synced ? activeLyricIndex(lines, timeMs) : -1;
  // A timed blank line marks an interlude (♪ in the lyric panel). Like the intro, preview the next
  // sung line; after the last one only ♪ remains.
  const interlude = index >= 0 && !lines[index].text.trim();
  const line = interlude ? lines.find((next, at) => at > index && next.text.trim()) : lines[Math.max(0, index)];
  const waiting = !!state?.lyrics?.synced && (index < 0 || interlude);
  const start = line?.timeMs ?? 0;
  const end = lines[index + 1]?.timeMs ?? (state?.durationSeconds ?? 0) * 1000;
  const progress = index < 0 || interlude ? 0 : Math.min(1, Math.max(0, (timeMs - start) / Math.max(1, end - start)));
  const empty = !state?.track ? '选择一首歌开始播放' : state.loading ? '正在读取歌词…' : interlude ? '♪' : '暂无歌词';
  const segments = line?.segments?.length ? line.segments : null;
  const secondary = line?.translation || (interlude ? (line ? '间奏' : '') : index >= 0 ? lines[index + 1]?.text : waiting ? '前奏' : '') || '\u00a0';
  const dimmed = !!preferences?.dimWhenPaused && !!state?.track && !state.playing;
  const update = (patch: DesktopLyricsPreferencePatch) => {
    setError('');
    void window.desktopLyricsOverlay.updatePreferences(patch).catch(() => setError('设置保存失败，请重试'));
  };
  // Window position plus the pointer's screen offset since the press, so the moving window never feeds back.
  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: window.screenX - event.screenX, y: window.screenY - event.screenY };
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const origin = drag.current;
    if (origin?.pointerId !== event.pointerId) return;
    void window.desktopLyricsOverlay.move({ x: origin.x + event.screenX, y: origin.y + event.screenY }).catch(() => {});
  };
  return <section className={`desktop-lyrics-window${preferences?.locked ? ' locked' : ''}`} aria-label="桌面歌词"
    data-state={state?.buffering ? 'buffering' : state?.playing ? 'playing' : 'paused'}
    style={preferences ? desktopLyricsStyle(preferences) : undefined}
    onPointerDown={startDrag} onPointerMove={moveDrag}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <header className="desktop-lyrics-header" aria-label="桌面歌词工具栏">
      <div className="desktop-lyrics-toolbar">
        <button aria-label="减小歌词字号" title={`缩小歌词（当前 ${fontSize}px）`} disabled={fontSize <= 18}
          onClick={() => update({ fontSize: Math.max(18, fontSize - 2) })}><AArrowDown size={17} /></button>
        <button aria-label="增大歌词字号" title={`放大歌词（当前 ${fontSize}px）`} disabled={fontSize >= 64}
          onClick={() => update({ fontSize: Math.min(64, fontSize + 2) })}><AArrowUp size={17} /></button>
        <span className="desktop-lyrics-divider" />
        <button aria-label="降低歌词不透明度" title={`更透明（当前 ${Math.round(opacity * 100)}%）`} disabled={opacity <= 0.2}
          onClick={() => update({ opacity: stepOpacity(opacity, -0.1) })}><SunDim size={17} /></button>
        <button aria-label="提高歌词不透明度" title={`更清晰（当前 ${Math.round(opacity * 100)}%）`} disabled={opacity >= 1}
          onClick={() => update({ opacity: stepOpacity(opacity, 0.1) })}><Sun size={17} /></button>
        <span className="desktop-lyrics-divider" />
        <button aria-label="歌词设置" title="字体、颜色与透明度"
          onClick={() => { void window.desktopLyricsOverlay.openSettings().catch(() => setError('无法打开设置，请重试')); }}><Settings size={16} /></button>
        <button aria-label="锁定桌面歌词" title="锁定并穿透鼠标，可在主窗口解锁" onClick={() => update({ locked: true })}><Lock size={16} /></button>
        <button aria-label="关闭桌面歌词" title="关闭桌面歌词"
          onClick={() => { void window.desktopLyricsOverlay.close().catch(() => {}); }}><X size={17} /></button>
      </div>
      {error && <span className="desktop-lyrics-toast" role="status">{error}</span>}
    </header>
    <LyricsPlate waiting={waiting} progress={progress} secondary={secondary}
      opacity={opacity * (waiting ? 0.75 : 1) * (dimmed ? 0.45 : 1)}
      currentText={segments ? segments.map(segment => segment.text).join('') : line?.text || empty}
      current={segments
        ? segments.map((segment, at) => <span key={at}
          className={index >= 0 && segment.timeMs !== null && timeMs >= segment.timeMs ? 'passed' : ''}>{segment.text}</span>)
        : line?.text || empty} />
  </section>;
}
