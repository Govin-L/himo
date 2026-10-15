import test from 'node:test';
import assert from 'node:assert/strict';
import { autosaveDelay, buildShuffleOrder, onEndedAction, orderWithActiveFirst, stepCursor } from '../src/renderer/player.mjs';

test('sequential stepping stops at the edges when repeat is off', () => {
  assert.deepEqual(stepCursor(0, 3, 1, 'off'), { cursor: 1, stopped: false });
  assert.deepEqual(stepCursor(2, 3, 1, 'off'), { cursor: 2, stopped: true });
  assert.deepEqual(stepCursor(0, 3, -1, 'off'), { cursor: 0, stopped: true });
});

test('repeat all wraps in both directions', () => {
  assert.deepEqual(stepCursor(2, 3, 1, 'all'), { cursor: 0, stopped: false });
  assert.deepEqual(stepCursor(0, 3, -1, 'all'), { cursor: 2, stopped: false });
});

test('repeat one replays the same track and never stops', () => {
  assert.deepEqual(onEndedAction(1, 3, 'one'), { cursor: 1, stopped: false });
  assert.deepEqual(onEndedAction(2, 3, 'off'), { cursor: 2, stopped: true });
  assert.deepEqual(onEndedAction(0, 3, 'all'), { cursor: 1, stopped: false });
});

test('an empty queue never reports a playable position', () => {
  assert.deepEqual(stepCursor(0, 0, 1, 'all'), { cursor: 0, stopped: true });
  assert.deepEqual(onEndedAction(0, 0, 'one'), { cursor: 0, stopped: true });
  assert.deepEqual(buildShuffleOrder(0), []);
});

test('shuffle order keeps every index exactly once and starts on the active track', () => {
  const order = buildShuffleOrder(10, 4, () => 0.5);
  assert.equal(order.length, 10);
  assert.equal(order[0], 4);
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 10 }, (_, index) => index));
});

test('shuffle order survives a start index at the edges', () => {
  assert.equal(buildShuffleOrder(5, 99, () => 0)[0], 4);
  assert.equal(buildShuffleOrder(5, -3, () => 0)[0], 0);
});

test('recalculating the order keeps the active track first', () => {
  const order = orderWithActiveFirst(6, 3, () => 0.9);
  assert.equal(order[0], 3);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(orderWithActiveFirst(0, 2), []);
});

test('queue autosave settles when idle but still writes during continuous playback', () => {
  const last = 1000;
  assert.equal(autosaveDelay(last, last), 1500, 'a fresh edit waits for the settle window');
  // A long-playback stream of edits reschedules every 1500ms; the capped wait guarantees a write.
  assert.equal(autosaveDelay(last + 4000, last), 1000, 'wait is capped by the remaining interval');
  assert.equal(autosaveDelay(last + 5000, last), 0, 'a stale save writes immediately');
  assert.equal(autosaveDelay(last + 60_000, last), 0);
  assert.equal(autosaveDelay(last - 5000, last), 1500, 'a future timestamp cannot go negative');
});
