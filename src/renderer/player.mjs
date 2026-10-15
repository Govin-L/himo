// Pure queue math so repeat/shuffle/ended behaviour can be regression tested without Electron.
export function stepCursor(cursor, count, delta, repeatMode) {
  if (count <= 0) return { cursor: 0, stopped: true };
  const next = cursor + delta;
  if (next >= 0 && next < count) return { cursor: next, stopped: false };
  if (repeatMode === 'off') return { cursor, stopped: true };
  return { cursor: ((next % count) + count) % count, stopped: false };
}

// 'one' repeats the finished track; every other mode advances through the order.
export function onEndedAction(cursor, count, repeatMode, delta = 1) {
  if (count <= 0) return { cursor: 0, stopped: true };
  if (repeatMode === 'one') return { cursor, stopped: false };
  return stepCursor(cursor, count, delta, repeatMode);
}

export function buildShuffleOrder(count, startIndex = 0, random = Math.random) {
  const order = Array.from({ length: Math.max(0, count) }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (count > 0) {
    const start = Math.min(Math.max(0, startIndex), count - 1);
    const at = order.indexOf(start);
    if (at > 0) [order[0], order[at]] = [order[at], order[0]];
  }
  return order;
}

// Keeps the active track first when the queue order is recalculated (shuffle toggled).
export function orderWithActiveFirst(count, activeIndex, random = Math.random) {
  if (count <= 0) return [];
  const order = buildShuffleOrder(count, activeIndex, random);
  if (activeIndex < 0 || activeIndex >= count) return order;
  const at = order.indexOf(activeIndex);
  if (at > 0) [order[0], order[at]] = [order[at], order[0]];
  return order;
}

// Queue autosave must not be a pure debounce: `timeupdate` keeps firing while a track plays, so a
// debounce never settles and the queue would never reach disk during continuous playback. Wait for
// the edits to settle, but never let more than `intervalMs` pass between two writes.
export function autosaveDelay(nowMs, lastSaveMs, settleMs = 1500, intervalMs = 5000) {
  const elapsed = Math.max(0, nowMs - lastSaveMs);
  if (elapsed >= intervalMs) return 0;
  return Math.min(settleMs, intervalMs - elapsed);
}
