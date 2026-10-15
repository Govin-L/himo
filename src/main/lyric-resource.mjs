import { isSafeResourceUrl } from '../safe-media-url.mjs';

export function lyricAddressFrom(response) {
  let extra = response?.contentExInfo;
  if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch { extra = null; } }
  const values = [response?.lyricAddress, response?.lyricAddres, extra?.lyricAddress, extra?.lyricAddres,
    extra?.lyrics?.lyricAddress, extra?.lyrics?.lineByLineLyric, response?.lyrics?.lineByLineLyric];
  return values.find(value => typeof value === 'string' && isSafeResourceUrl(value));
}

export async function readBoundedText(response, maxBytes = 512 * 1024) {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > maxBytes) { await response.body?.cancel(); throw new Error('歌词资源过大'); }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('歌词资源过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
