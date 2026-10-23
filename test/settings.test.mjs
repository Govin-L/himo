import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, DESKTOP_LYRIC_PATCH_KEYS, sanitizeAppearance, sanitizeDesktopLyrics, sanitizeQueue, sanitizeSettings,
} from '../src/main/settings.mjs';

test('settings keep only known enum values and clamp volume', () => {
  assert.deepEqual(sanitizeSettings({ closeBehavior: 'tray', quality: 'lossless', volume: 5, repeatMode: 'one', shuffle: true, syncHistory: false }), {
    closeBehavior: 'tray', quality: 'lossless', volume: 1, repeatMode: 'one', shuffle: true, syncHistory: false,
    thirdPartyLyrics: true,
    desktopLyrics: DEFAULT_SETTINGS.desktopLyrics,
    appearance: DEFAULT_SETTINGS.appearance,
  });
  assert.deepEqual(sanitizeSettings({ closeBehavior: 'evil', quality: 'hires', volume: -3, repeatMode: 'loop', shuffle: 'yes', syncHistory: 'yes' }), {
    ...DEFAULT_SETTINGS, volume: 0,
  });
  assert.equal(DEFAULT_SETTINGS.syncHistory, true, 'history sync is on by default');
  assert.equal(sanitizeSettings({ syncHistory: false }).syncHistory, false);
  assert.deepEqual(sanitizeSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(sanitizeSettings({ volume: Number.NaN }).volume, DEFAULT_SETTINGS.volume);
});

test('queue sanitation drops malformed rows and clamps the index', () => {
  const queue = sanitizeQueue({ tracks: [
    { id: 'a', title: 'A', artists: [{ name: '甲' }, { name: '' }, { id: 'x' }], album: { id: 'al', title: 'AL' }, durationSeconds: 12 },
    { title: '无 ID' },
    null,
  ], index: 9, positionSeconds: 12.5 });
  assert.equal(queue.tracks.length, 1);
  assert.deepEqual(queue.tracks[0].artists, [{ name: '甲' }]);
  assert.deepEqual(queue.tracks[0].album, { id: 'al', title: 'AL' });
  assert.equal(queue.index, 0);
  assert.equal(queue.positionSeconds, 12.5);
});

test('queue sanitation rejects empty or non object payloads', () => {
  assert.equal(sanitizeQueue(null), null);
  assert.equal(sanitizeQueue({ tracks: [] }), null);
  assert.equal(sanitizeQueue({ tracks: [{ title: 'no id' }] }), null);
});

test('queue sanitation caps the number of persisted tracks', () => {
  const tracks = Array.from({ length: 10001 }, (_, index) => ({ id: `id-${index}`, title: `t${index}` }));
  assert.equal(sanitizeQueue({ tracks, index: 0, positionSeconds: 0 }).tracks.length, 10000);
  assert.equal(sanitizeQueue({ tracks: tracks.slice(0, 965), index: 964, positionSeconds: 0 }).index, 964);
});

test('saved queue never persists playback urls', () => {
  const queue = sanitizeQueue({ tracks: [{ id: 'a', title: 'A', url: 'https://x.dbankcdn.cn/secret.mp3', fileURL: 'https://x.dbankcdn.cn/secret.mp3' }], index: 0, positionSeconds: 0 });
  assert.equal(JSON.stringify(queue).includes('dbankcdn'), false);
  assert.equal(JSON.stringify(queue).includes('secret.mp3'), false);
});

test('appearance settings clamp ranges and reject unknown values', () => {
  assert.deepEqual(sanitizeAppearance({ accent: 'blue', panelOpacity: 0.7, cornerRadius: 18, fontScale: 1.15, fontFamily: 'serif' }),
    { accent: 'blue', panelOpacity: 0.7, cornerRadius: 18, fontScale: 1.15, fontFamily: 'serif', customAccent: '#c8202e', customFont: '' });
  assert.deepEqual(sanitizeAppearance({ accent: 'pink', panelOpacity: 9, cornerRadius: -4, fontScale: 0.1, fontFamily: 'comic' }),
    { accent: 'red', panelOpacity: 1, cornerRadius: 0, fontScale: 0.85, fontFamily: 'sans', customAccent: '#c8202e', customFont: '' });
  // A partial patch keeps every other stored field.
  assert.deepEqual(sanitizeAppearance({ accent: 'green' }, { accent: 'blue', panelOpacity: 0.8, cornerRadius: 4, fontScale: 1.1, fontFamily: 'mono' }),
    { accent: 'green', panelOpacity: 0.8, cornerRadius: 4, fontScale: 1.1, fontFamily: 'mono', customAccent: '#c8202e', customFont: '' });
  assert.deepEqual(sanitizeAppearance(null), DEFAULT_SETTINGS.appearance);
});

test('a partial appearance patch never resets unrelated settings', () => {
  const next = sanitizeSettings({ appearance: { fontScale: 1.2 } }, sanitizeSettings({ quality: 'lossless' }));
  assert.equal(next.quality, 'lossless');
  assert.equal(next.appearance.fontScale, 1.2);
  assert.equal(next.appearance.accent, 'red');
});

test('a custom accent colour and font family are validated, not trusted', () => {
  assert.equal(sanitizeAppearance({ accent: 'custom', customAccent: '#AbC123' }).customAccent, '#abc123');
  assert.equal(sanitizeAppearance({ accent: 'custom', customAccent: 'javascript:alert(1)' }).customAccent, '#c8202e');
  assert.equal(sanitizeAppearance({ accent: 'custom', customAccent: 'rgb(1,2,3)' }).customAccent, '#c8202e');
  assert.equal(sanitizeAppearance({ fontFamily: 'custom', customFont: 'Source Han Sans SC' }).customFont, 'Source Han Sans SC');
  // Quotes/braces are stripped so the family can only ever be a quoted CSS identifier.
  const cleaned = sanitizeAppearance({ fontFamily: 'custom', customFont: 'Bad"; } body { color: red' }).customFont;
  assert.equal(/["'\\;{}<>]/.test(cleaned), false);
  assert.match(cleaned, /^Bad/);
  assert.equal(sanitizeAppearance({ fontFamily: 'custom', customFont: 'x'.repeat(200) }).customFont.length, 80);
});

test('desktop lyric preferences preserve position and unrelated settings across partial patches', () => {
  const original = sanitizeSettings({ quality: 'lossless', desktopLyrics: { position: { x: -600, y: 90 }, fontSize: 38, locked: true } });
  const next = sanitizeSettings({ desktopLyrics: { fontSize: 42 } }, original);
  assert.deepEqual(next.desktopLyrics, { ...DEFAULT_SETTINGS.desktopLyrics, position: { x: -600, y: 90 }, fontSize: 42, locked: true });
  assert.equal(next.quality, 'lossless');
  assert.deepEqual(sanitizeSettings({ volume: 0.5 }).desktopLyrics, DEFAULT_SETTINGS.desktopLyrics);
});

test('desktop lyric settings reject invalid saved positions and constrain text size', () => {
  const saved = sanitizeSettings({ desktopLyrics: { position: { x: 50, y: 60 }, fontSize: 38, locked: true } });
  assert.deepEqual(sanitizeSettings({ desktopLyrics: { position: { x: Infinity, y: 2 }, fontSize: -99, locked: 'yes' } }, saved).desktopLyrics,
    { ...DEFAULT_SETTINGS.desktopLyrics, position: { x: 50, y: 60 }, fontSize: 18, locked: true });
  assert.equal(sanitizeSettings({ desktopLyrics: { fontSize: 999 } }).desktopLyrics.fontSize, 64);
  assert.equal(sanitizeSettings({ desktopLyrics: { position: null } }, saved).desktopLyrics.position, null);
});

test('desktop lyric styles keep valid colours, gradients, ranges and safe font names', () => {
  const saved = sanitizeSettings({ desktopLyrics: { color: '#AABBCC', colorEnd: '#112233', playedColorEnd: '#445566' } });
  assert.deepEqual([saved.desktopLyrics.color, saved.desktopLyrics.colorEnd], ['#aabbcc', '#112233']);
  const next = sanitizeSettings({ desktopLyrics: {
    color: 'red', colorEnd: null, playedColorEnd: '#zzzzzz', opacity: 0.05, backgroundOpacity: 2, secondaryScale: 0.333,
    background: 'blur', stroke: 'thick', fontWeight: 'heavy', fontFamily: 'Kaiti";}', dimWhenPaused: 'yes',
  } }, saved).desktopLyrics;
  assert.deepEqual({ ...next, position: undefined }, {
    ...DEFAULT_SETTINGS.desktopLyrics, position: undefined,
    color: '#aabbcc', colorEnd: null, playedColorEnd: '#445566', opacity: 0.2, backgroundOpacity: 0.9, secondaryScale: 0.5,
    stroke: 'thick', fontFamily: 'Kaiti',
  });
  // The lyrics IPC accepts a patch only when sanitising leaves it unchanged, so valid values must round-trip.
  const patch = { opacity: 0.85, backgroundOpacity: 0.35, secondaryScale: 0.64, playedColorEnd: null, fontFamily: 'PingFang SC' };
  const clean = sanitizeDesktopLyrics(patch, DEFAULT_SETTINGS.desktopLyrics);
  assert.deepEqual(Object.keys(patch).filter(key => clean[key] !== patch[key]), []);
  assert.equal(DESKTOP_LYRIC_PATCH_KEYS.includes('position'), false);
  assert.equal(DESKTOP_LYRIC_PATCH_KEYS.includes('opacity'), true);
});
