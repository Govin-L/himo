import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, sanitizeQueue, sanitizeSettings } from '../src/main/settings.mjs';

test('settings keep only known enum values and clamp volume', () => {
  assert.deepEqual(sanitizeSettings({ closeBehavior: 'tray', quality: 'lossless', volume: 5, repeatMode: 'one', shuffle: true }), {
    closeBehavior: 'tray', quality: 'lossless', volume: 1, repeatMode: 'one', shuffle: true,
  });
  assert.deepEqual(sanitizeSettings({ closeBehavior: 'evil', quality: 'hires', volume: -3, repeatMode: 'loop', shuffle: 'yes' }), {
    ...DEFAULT_SETTINGS, volume: 0,
  });
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
