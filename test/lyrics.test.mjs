import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics, activeLyricIndex } from '../src/lyrics.mjs';

test('multi timestamp lines expand and sort by time', () => {
  const result = parseLyrics('[00:12.00]副歌\n[00:01.50]开场\n[00:05.00][00:20.00]重复');
  assert.equal(result.synced, true);
  assert.deepEqual(result.lines.map(line => [line.timeMs, line.text]), [
    [1500, '开场'],
    [5000, '重复'],
    [12000, '副歌'],
    [20000, '重复'],
  ]);
});

test('offset shifts every timestamp and is not emitted as a lyric line', () => {
  const result = parseLyrics('[offset:-500]\n[00:02.000]歌词');
  assert.deepEqual(result.lines, [{ timeMs: 1500, text: '歌词' }]);
});

test('centisecond precision is read as hundredths, not milliseconds', () => {
  const result = parseLyrics('[00:03.25]两位小数');
  assert.equal(result.lines[0].timeMs, 3250);
});

test('plain text lyrics stay unsynced and keep their order', () => {
  const result = parseLyrics('第一行\n第二行\n');
  assert.equal(result.synced, false);
  assert.deepEqual(result.lines.map(line => line.text), ['第一行', '第二行']);
  assert.ok(result.lines.every(line => line.timeMs === null));
});

test('empty and non string payloads return an empty unsynced document', () => {
  assert.deepEqual(parseLyrics(''), { synced: false, lines: [] });
  assert.deepEqual(parseLyrics(undefined), { synced: false, lines: [] });
});

test('active lyric index tracks playback position and boundaries', () => {
  const { lines } = parseLyrics('[00:01.00]a\n[00:02.00]b\n[00:03.00]c');
  assert.equal(activeLyricIndex(lines, 0), -1);
  assert.equal(activeLyricIndex(lines, 1000), 0);
  assert.equal(activeLyricIndex(lines, 2999), 1);
  assert.equal(activeLyricIndex(lines, 99_000), 2);
  assert.equal(activeLyricIndex([], 5000), -1);
});
