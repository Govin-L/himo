// Pure settings/queue sanitation so persisted JSON can never widen the IPC contract.
/** @type {import('../shared/types').AppSettings} */
export const DEFAULT_SETTINGS = Object.freeze({
  closeBehavior: 'quit',
  quality: 'standard',
  volume: 0.85,
  repeatMode: 'off',
  shuffle: false,
  syncHistory: true,
});

import { isSafeResourceUrl } from '../safe-media-url.mjs';
const CLOSE_BEHAVIORS = new Set(['quit', 'tray']);
const QUALITIES = new Set(['standard', 'lossless']);
const REPEAT_MODES = new Set(['off', 'all', 'one']);

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
  if (typeof raw.volume === 'number' && Number.isFinite(raw.volume)) {
    next.volume = Math.min(1, Math.max(0, raw.volume));
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
