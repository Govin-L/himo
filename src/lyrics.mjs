// LRC parsing kept pure so it can be regression tested without network access.
export function parseLyrics(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { synced: false, lines: [] };
  let offset = 0;
  const timed = [];
  const plain = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const offsetMatch = /^\[offset:\s*(-?\d+)\s*\]$/i.exec(line);
    if (offsetMatch) {
      const value = Number(offsetMatch[1]);
      if (Number.isFinite(value)) offset = value;
      continue;
    }
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) {
      plain.push({ timeMs: null, text: line });
      continue;
    }
    const last = stamps[stamps.length - 1];
    const text = line.slice(last.index + last[0].length).trim();
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) continue;
      const fraction = (stamp[3] ?? '').padEnd(3, '0');
      const ms = Number(fraction || '0');
      timed.push({ timeMs: Math.max(0, minutes * 60_000 + seconds * 1_000 + ms + offset), text });
    }
  }
  if (!timed.length) return { synced: false, lines: plain };
  timed.sort((a, b) => a.timeMs - b.timeMs);
  return { synced: true, lines: timed };
}

export function activeLyricIndex(lines, positionMs) {
  if (!Array.isArray(lines) || !lines.length || !Number.isFinite(positionMs)) return -1;
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const time = lines[i]?.timeMs;
    if (typeof time !== 'number') continue;
    if (time <= positionMs) index = i;
    else break;
  }
  return index;
}
