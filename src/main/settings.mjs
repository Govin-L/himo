// Pure settings/queue sanitation so persisted JSON can never widen the IPC contract.
/** @type {import('../shared/types').AppSettings} */
export const DEFAULT_SETTINGS = Object.freeze({
  closeBehavior: 'quit',
  quality: 'standard',
  volume: 0.85,
  repeatMode: 'off',
  shuffle: false,
  syncHistory: true,
  thirdPartyLyrics: true,
  desktopLyrics: Object.freeze({
    position: null, fontSize: 36, locked: false,
    opacity: 1, dimWhenPaused: false, background: 'none', backgroundOpacity: 0.4,
    color: '#fff1b8', colorEnd: null, playedColor: '#ffd65c', playedColorEnd: null,
    strokeColor: '#000000', stroke: 'medium',
    fontFamily: '', fontWeight: 'bold', secondaryScale: 0.64,
  }),
  appearance: Object.freeze({
    accent: 'red',
    panelOpacity: 1,
    cornerRadius: 11,
    fontScale: 1,
    fontFamily: 'sans',
    customAccent: '#c8202e',
    customFont: '',
  }),
});

import { isSafeResourceUrl } from '../safe-media-url.mjs';
const CLOSE_BEHAVIORS = new Set(['quit', 'tray']);
const QUALITIES = new Set(['standard', 'lossless']);
const REPEAT_MODES = new Set(['off', 'all', 'one']);
const ACCENTS = new Set(['red', 'blue', 'green', 'amber', 'violet', 'custom']);
const FONT_CHOICES = new Set(['sans', 'serif', 'mono', 'custom']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LYRIC_BACKGROUNDS = ['none', 'bar'];
const LYRIC_STROKES = ['none', 'thin', 'medium', 'thick'];
const LYRIC_FONT_WEIGHTS = ['regular', 'medium', 'bold'];

function clampNumber(value, min, max, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

// A font family name is only ever injected into a CSS font-family list, so strip anything that
// could break out of the quoted string and cap the length.
function cleanFontName(value) {
  return value.replace(/["'\\;{}<>]/g, '').trim().slice(0, 80);
}

function hexColor(value, fallback) {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

/** @returns {import('../shared/types').AppearanceSettings} */
export function sanitizeAppearance(input, fallback = DEFAULT_SETTINGS.appearance) {
  const base = { ...DEFAULT_SETTINGS.appearance, ...(fallback ?? {}) };
  if (!input || typeof input !== 'object') return base;
  const raw = /** @type {Record<string, unknown>} */ (input);
  return {
    accent: ACCENTS.has(raw.accent) ? /** @type {import('../shared/types').AccentName} */ (raw.accent) : base.accent,
    panelOpacity: clampNumber(raw.panelOpacity, 0.55, 1, base.panelOpacity),
    cornerRadius: clampNumber(raw.cornerRadius, 0, 18, base.cornerRadius),
    fontScale: clampNumber(raw.fontScale, 0.85, 1.2, base.fontScale),
    fontFamily: FONT_CHOICES.has(raw.fontFamily) ? /** @type {import('../shared/types').FontChoice} */ (raw.fontFamily) : base.fontFamily,
    customAccent: hexColor(raw.customAccent, base.customAccent),
    customFont: typeof raw.customFont === 'string' ? cleanFontName(raw.customFont) : base.customFont,
  };
}

/** Preference keys a renderer may patch; the window position is recorded by the main process only. */
export const DESKTOP_LYRIC_PATCH_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS.desktopLyrics).filter(key => key !== 'position'));

/** @returns {import('../shared/types').DesktopLyricsPreferences} */
export function sanitizeDesktopLyrics(input, fallback = DEFAULT_SETTINGS.desktopLyrics) {
  const saved = { ...DEFAULT_SETTINGS.desktopLyrics, ...(fallback ?? {}) };
  if (!input || typeof input !== 'object') return saved;
  const value = /** @type {Record<string, any>} */ (input);
  const position = value.position;
  const ratio = (raw, min, max, current) => Math.round(clampNumber(raw, min, max, current) * 100) / 100;
  // An `End` colour is optional: null turns the gradient off, undefined keeps the saved value.
  const gradientEnd = (raw, current) => raw === null ? null : hexColor(raw, current);
  const oneOf = (raw, options, current) => options.includes(raw) ? raw : current;
  return {
    fontSize: Math.round(clampNumber(value.fontSize, 18, 64, saved.fontSize)),
    locked: typeof value.locked === 'boolean' ? value.locked : saved.locked,
    position: position === null ? null : position && Number.isFinite(position.x) && Number.isFinite(position.y)
      && Math.abs(position.x) <= 100000 && Math.abs(position.y) <= 100000
      ? { x: Math.round(position.x), y: Math.round(position.y) } : saved.position,
    opacity: ratio(value.opacity, 0.2, 1, saved.opacity),
    dimWhenPaused: typeof value.dimWhenPaused === 'boolean' ? value.dimWhenPaused : saved.dimWhenPaused,
    background: oneOf(value.background, LYRIC_BACKGROUNDS, saved.background),
    backgroundOpacity: ratio(value.backgroundOpacity, 0.1, 0.9, saved.backgroundOpacity),
    color: hexColor(value.color, saved.color),
    colorEnd: gradientEnd(value.colorEnd, saved.colorEnd),
    playedColor: hexColor(value.playedColor, saved.playedColor),
    playedColorEnd: gradientEnd(value.playedColorEnd, saved.playedColorEnd),
    strokeColor: hexColor(value.strokeColor, saved.strokeColor),
    stroke: oneOf(value.stroke, LYRIC_STROKES, saved.stroke),
    fontFamily: typeof value.fontFamily === 'string' ? cleanFontName(value.fontFamily) : saved.fontFamily,
    fontWeight: oneOf(value.fontWeight, LYRIC_FONT_WEIGHTS, saved.fontWeight),
    secondaryScale: ratio(value.secondaryScale, 0.5, 1, saved.secondaryScale),
  };
}

/**
 * @template {import('../shared/types').AppSettings} T
 * @param {unknown} input
 * @param {T} [fallback]
 * @returns {T}
 */
export function sanitizeSettings(input, fallback = DEFAULT_SETTINGS) {
  const base = { ...DEFAULT_SETTINGS, ...(fallback ?? {}) };
  if (!input || typeof input !== 'object') return base;
  const raw = /** @type {Record<string, unknown>} */ (input);
  const next = { ...base };
  if (CLOSE_BEHAVIORS.has(raw.closeBehavior)) next.closeBehavior = /** @type {'quit' | 'tray'} */ (raw.closeBehavior);
  if (QUALITIES.has(raw.quality)) next.quality = /** @type {'standard' | 'lossless'} */ (raw.quality);
  if (REPEAT_MODES.has(raw.repeatMode)) next.repeatMode = /** @type {'off' | 'all' | 'one'} */ (raw.repeatMode);
  if (typeof raw.shuffle === 'boolean') next.shuffle = raw.shuffle;
  if (typeof raw.syncHistory === 'boolean') next.syncHistory = raw.syncHistory;
  if (typeof raw.thirdPartyLyrics === 'boolean') next.thirdPartyLyrics = raw.thirdPartyLyrics;
  if (typeof raw.volume === 'number' && Number.isFinite(raw.volume)) {
    next.volume = Math.min(1, Math.max(0, raw.volume));
  }
  if (raw.appearance && typeof raw.appearance === 'object') {
    next.appearance = sanitizeAppearance(raw.appearance, base.appearance);
  }
  if (raw.desktopLyrics && typeof raw.desktopLyrics === 'object') {
    next.desktopLyrics = sanitizeDesktopLyrics(raw.desktopLyrics, base.desktopLyrics);
  }
  return next;
}

const MAX_QUEUE_TRACKS = 10000;

function sanitizeTrack(value) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id : '';
  const title = typeof value.title === 'string' ? value.title : '';
  if (!id || !title || id.length > 200) return null;
  const artists = Array.isArray(value.artists)
    ? value.artists.map(artist => {
      const name = typeof artist?.name === 'string' ? artist.name : '';
      if (!name) return null;
      return typeof artist?.id === 'string' ? { id: artist.id, name } : { name };
    }).filter(artist => !!artist).slice(0, 10)
    : [];
  const album = value.album && typeof value.album.id === 'string' && typeof value.album.title === 'string'
    ? { id: value.album.id, title: value.album.title } : undefined;
  return {
    id, title, artists, album,
    coverUrl: typeof value.coverUrl === 'string' && isSafeResourceUrl(value.coverUrl) ? value.coverUrl : undefined,
    durationSeconds: typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds)
      ? value.durationSeconds : undefined,
    available: value.available !== false,
  };
}

/** @returns {import('../shared/types').SavedQueue | null} */
export function sanitizeQueue(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.tracks)) return null;
  const tracks = input.tracks.map(sanitizeTrack).filter(track => !!track).slice(0, MAX_QUEUE_TRACKS);
  if (!tracks.length) return null;
  const index = Number.isInteger(input.index) && input.index >= 0 && input.index < tracks.length ? input.index : 0;
  const positionSeconds = typeof input.positionSeconds === 'number' && Number.isFinite(input.positionSeconds) && input.positionSeconds >= 0
    ? input.positionSeconds : 0;
  return { tracks, index, positionSeconds };
}
