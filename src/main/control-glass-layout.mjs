/**
 * Only the player, tab bar and header search rectangles cross the bridge. Convert CSS pixels to window points,
 * never physical display pixels, and reject geometry outside the owner window.
 * @returns {import('../shared/types').ControlGlassLayout | null}
 */
export function normalizeControlGlassLayout(input, contentSize, zoom) {
  if (!input || typeof input !== 'object' || !Number.isFinite(zoom) || zoom <= 0) return null;
  const rectangle = value => {
    if (value === null) return null;
    if (!value || typeof value !== 'object') return undefined;
    const { x, y, width, height } = value;
    if (![x, y, width, height].every(number => typeof number === 'number' && Number.isFinite(number))
      || x < 0 || y < 0 || width <= 0 || height <= 0
      || (x + width) * zoom > contentSize[0] + 1 || (y + height) * zoom > contentSize[1] + 1) return undefined;
    return { x: x * zoom, y: y * zoom, width: width * zoom, height: height * zoom };
  };
  const player = rectangle(input.player);
  const tabs = rectangle(input.tabs);
  const search = rectangle(input.search);
  return player === undefined || tabs === undefined || search === undefined ? null : { player, tabs, search };
}
