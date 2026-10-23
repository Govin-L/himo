import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeControlGlassLayout } from '../src/main/control-glass-layout.mjs';

const layout = {
  player: { x: 30, y: 560, width: 1120, height: 78 },
  tabs: { x: 450, y: 668, width: 280, height: 76 },
  search: { x: 514, y: 20, width: 360, height: 42 },
};

test('control glass uses window points, independent of Retina pixels and renderer zoom', () => {
  assert.deepEqual(normalizeControlGlassLayout(layout, [1180, 760], 1), layout);
  const zoomed = Object.fromEntries(Object.entries(layout).map(([key, rect]) =>
    [key, Object.fromEntries(Object.entries(rect).map(([field, value]) => [field, value / 2]))]));
  assert.deepEqual(normalizeControlGlassLayout(zoomed, [1180, 760], 2), layout);
});

test('any control can independently hide without removing the other views', () => {
  assert.deepEqual(normalizeControlGlassLayout({ ...layout, player: null }, [1180, 760], 1), { ...layout, player: null });
  assert.deepEqual(normalizeControlGlassLayout({ ...layout, search: null }, [1180, 760], 1), { ...layout, search: null });
  assert.deepEqual(normalizeControlGlassLayout({ player: null, tabs: null, search: null }, [1180, 760], 1), { player: null, tabs: null, search: null });
});

test('rejects malformed, nonfinite and out-of-window native geometry', () => {
  for (const input of [null, {}, { ...layout, player: undefined }, { player: layout.player, tabs: layout.tabs },
    ...[{ x: -1 }, { x: NaN }, { y: Infinity }, { width: '1120' }, { width: 0 }, { width: 2000 }, { y: 740 }]
      .map(patch => ({ ...layout, player: { ...layout.player, ...patch } }))]) {
    assert.equal(normalizeControlGlassLayout(input, [1180, 760], 1), null);
  }
  for (const zoom of [0, NaN, Infinity, -1]) assert.equal(normalizeControlGlassLayout(layout, [1180, 760], zoom), null);
});

test('only projects the named controls; native handles and arbitrary regions never pass through', () => {
  const output = normalizeControlGlassLayout({ ...layout, handle: 'untrusted', anotherView: layout.tabs }, [1180, 760], 1);
  assert.deepEqual(output, layout);
  assert.notEqual(output.player, layout.player);
});
