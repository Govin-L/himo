// Offline preview of the real built app with a synthetic library, timed lyrics and silent audio, so
// the player and desktop lyrics can be checked without signing in. Only account/library IPC is
// replaced, inside this preview process: no Huawei network, credentials or personal data. scripts/
// is not packaged. The fixed temp profile keeps lyric window position, size and lock between runs.
//
//   npm run build && node scripts/preview-mock.mjs
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Original lyrics written for this preview. `line` is seconds per sung line; a number in `order` is
// an instrumental break, encoded as in LRC by a timed blank line.
const SONGS = [
  {
    id: 'mock-night-flight', title: '夜航', artist: '林屿', album: '夜色练习册', hue: 222,
    karaoke: true, intro: 8, line: 4.5,
    order: ['verse', 'pre', 'chorus', 8, 'verse2', 'pre', 'chorus', 'bridge', 'chorus', 6],
    sections: {
      verse: [
        ['凌晨的航班穿过云层', 'The red-eye flight cuts through the clouds'],
        ['舷窗外城市缩成光点', 'Outside the window the city shrinks to points of light'],
        ['我把没说完的那句话', 'The sentence I never finished'],
        ['折进登机牌的背面', 'I fold into the back of my boarding pass'],
      ],
      pre: [
        ['如果风向刚好向北', 'If the wind happens to blow north'],
        ['会不会吹到你身边', 'Will it carry me to you'],
      ],
      chorus: [
        ['夜航的人不说再见', 'People on night flights never say goodbye'],
        ['只把思念调成静音', 'They just set their longing to silent'],
        ['在一万英尺的高空', 'Ten thousand feet above the ground'],
        ['我离你更近了一点', "I'm a little closer to you"],
      ],
      verse2: [
        ['空乘推着餐车走过', 'A flight attendant wheels the cart past'],
        ['递来一杯温热的清晨', 'Handing me a cup of warm morning'],
        ['耳机里循环着那首歌', 'That song keeps looping in my earphones'],
        ['副歌总停在同一秒', 'The chorus always stops at the same second'],
      ],
      bridge: [
        ['当跑道的灯一盏盏亮起', 'When the runway lights come on one by one'],
        ['我会先听见你的声音', "I'll hear your voice first"],
      ],
    },
  },
  {
    id: 'mock-after-sunset', title: '落日之后', artist: '南岸乐队', album: '海边旅馆', hue: 18,
    intro: 6, line: 4.5,
    order: ['verse', 'chorus', 8, 'verse2', 'chorus', 'chorus', 6],
    sections: {
      verse: [
        ['海风把白天吹凉', 'The sea breeze cools the day'],
        ['影子被拉得很长', 'Our shadows stretch out long'],
        ['我们坐在防波堤上', 'We sit on the breakwater'],
        ['数着归港的船', 'Counting the boats coming home'],
      ],
      chorus: [
        ['落日之后 别急着走', "After sunset, don't hurry off"],
        ['夜色会替我们挽留', 'The night will ask us to stay'],
        ['把今天折成纸飞机', 'Fold today into a paper plane'],
        ['飞过你我的路口', 'And fly it past our crossroads'],
      ],
      verse2: [
        ['路灯一盏一盏醒来', 'Streetlights wake one by one'],
        ['潮水退回海的怀里', "The tide slips back into the sea's arms"],
        ['你说明天还会晴朗', 'You say tomorrow will be clear'],
        ['我说那就明天见', 'I say then see you tomorrow'],
      ],
    },
  },
  {
    id: 'mock-letter-north', title: '北方来信', artist: '陈述', album: '慢速生活', hue: 196,
    intro: 7, line: 4.5,
    order: ['verse', 'verse2', 'chorus', 8, 'verse2', 'chorus', 6],
    sections: {
      verse: ['收到你从北方寄来的信', '邮戳上写着第一场雪', '你说那里的冬天很长', '长到足够想念一个人'],
      verse2: ['我把信纸铺在窗台上', '让南方的阳光读一遍', '风吹过来又吹过去', '字迹还是那么倔强'],
      chorus: ['等春天沿着铁轨回来', '我就去车站接你', '带上一整个夏天的话', '慢慢说给你听'],
    },
  },
  {
    id: 'mock-rain-curtain', title: '雨幕', artist: '白噪', album: '无人区', hue: 250,
    intro: 6, line: 6,
    order: ['verse', 'chorus', 6, 'bridge', 'chorus', 6],
    sections: {
      verse: [
        '雨从傍晚一直下到深夜，整条街的霓虹都在积水里慢慢晕开',
        '我撑着那把你忘在门口的旧伞，沿着我们走过很多次的路往回走',
        '便利店的灯还亮着，收银台旁的收音机刚好放到我们第一次一起听的那首歌',
      ],
      chorus: ['雨幕', '把世界隔成两半', '一半是你', '一半是还没说出口的话'],
      bridge: ['如果雨停的时候你刚好经过这里，请替我看一眼天边那道很淡很淡的彩虹'],
    },
  },
  {
    id: 'mock-migrant-birds', title: '候鸟', artist: '南岸乐队', album: '回声', hue: 140,
    karaoke: true, intro: 6, line: 4.5,
    order: ['verse', 'chorus', 8, 'verse', 'chorus', 6],
    sections: {
      verse: ['候鸟又经过这座城市', '在电线上停了一会儿', '它们不问季节的名字', '只记得回去的方向'],
      chorus: ['我也有想回去的地方', '在一首歌的第二段', '那里的人还很年轻', '那里的风还很慢'],
    },
  },
  { id: 'mock-silent-mode', title: '静音模式', artist: '梁小满', album: '慢速生活', hue: 40, duration: 96 },
];

const cover = (hue, label) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 52% 62%)"/><stop offset="1" stop-color="hsl(${hue + 28} 46% 30%)"/></linearGradient></defs><rect width="360" height="360" fill="url(#g)"/><text x="180" y="214" font-size="104" font-family="PingFang SC, sans-serif" font-weight="600" fill="rgba(255,255,255,0.9)" text-anchor="middle">${label}</text></svg>`)}`;

function timeline(song) {
  if (!song.order) return { lines: [], durationSeconds: song.duration };
  const lines = [];
  let at = song.intro;
  for (const part of song.order) {
    if (typeof part === 'number') { lines.push({ timeMs: Math.round(at * 1000), text: '' }); at += part; continue; }
    for (const entry of song.sections[part]) {
      const [text, translation] = [entry].flat();
      const timeMs = Math.round(at * 1000);
      // Word marks spread over most of the line, leaving a breath before the next one.
      const marks = song.karaoke && text.match(/\S\s*/gu);
      lines.push({
        timeMs, text, ...(translation && { translation }),
        ...(marks && { segments: marks.map((mark, index) => ({ timeMs: Math.round(timeMs + index * song.line * 800 / marks.length), text: mark })) }),
      });
      at += song.line;
    }
  }
  return { lines, durationSeconds: Math.ceil(at) };
}

// A silent 8 kHz PCM WAV built inside the page: a blob URL is the renderer's own media, so it needs no
// network, codec or file access. One URL per duration, reused across plays.
const silentAudio = seconds => `(() => {
  const urls = (window.__mockPreviewAudio ??= new Map());
  if (!urls.has(${seconds})) {
    const bytes = 8000 * ${seconds} * 2;
    const view = new DataView(new ArrayBuffer(44 + bytes));
    const ascii = (at, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i)); };
    ascii(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, bytes, true);
    urls.set(${seconds}, URL.createObjectURL(new Blob([view], { type: 'audio/wav' })));
  }
  return urls.get(${seconds});
})()`;

function mockHandlers() {
  const ok = data => ({ ok: true, data });
  const missing = message => ({ ok: false, error: { kind: 'invalid', message, retryable: false } });
  const docs = new Map(SONGS.map(song => [song.id, timeline(song)]));
  const tracks = SONGS.map(song => ({
    id: song.id, title: song.title,
    artists: [{ id: `mock-artist-${song.artist}`, name: song.artist }],
    album: { id: `mock-album-${song.album}`, title: song.album },
    coverUrl: cover(song.hue, song.title[0]),
    durationSeconds: docs.get(song.id).durationSeconds,
    available: true,
  }));
  const byId = new Map(tracks.map(track => [track.id, track]));
  const favorites = new Set(byId.keys());
  let playlists = [
    { id: 'mock-playlist-night', title: '夜里听的歌', kind: 'owned', description: '离线预览用的合成歌单。',
      ids: ['mock-night-flight', 'mock-rain-curtain', 'mock-letter-north', 'mock-silent-mode'] },
    { id: 'mock-playlist-sea', title: '海边', kind: 'collected', ids: ['mock-after-sunset', 'mock-migrant-birds'] },
  ];
  const playlistOf = list => ({ id: list.id, title: list.title, kind: list.kind, description: list.description,
    coverUrl: byId.get(list.ids[0])?.coverUrl, count: list.ids.length });
  let signedIn = true;
  const status = () => (signedIn
    ? { authenticated: true, persistence: 'memory-only', notice: '离线预览：曲库、歌词和音频均为合成数据' }
    : { authenticated: false, persistence: 'unavailable' });
  return {
    'auth:status': () => ok(status()),
    'auth:login': () => { signedIn = true; return ok(status()); },
    'auth:logout': () => { signedIn = false; return ok(undefined); },
    'auth:cancel-login': () => ok(undefined),
    'music:favorites': (_event, input = {}) => {
      const rows = tracks.filter(track => favorites.has(track.id));
      const start = input.start ?? 0;
      const page = rows.slice(start, start + (input.limit ?? 50));
      return ok({ tracks: page, total: rows.length, nextStart: start + page.length, hasMore: start + page.length < rows.length });
    },
    'music:favorites-summary': () => ok({ total: favorites.size }),
    'music:favorite-state': (_event, input) => ok({ favorite: favorites.has(input.trackId) }),
    'music:set-favorite': (_event, input) => {
      if (input.favorite) favorites.add(input.trackId); else favorites.delete(input.trackId);
      return ok({ favorite: input.favorite });
    },
    'music:playlists': () => ok({ playlists: playlists.map(playlistOf), truncated: false }),
    'music:playlist-detail': (_event, input) => {
      const list = playlists.find(item => item.id === input.id);
      if (!list) return missing('歌单不存在。');
      const rows = list.ids.map(id => byId.get(id)).filter(Boolean);
      return ok({ playlist: playlistOf(list), tracks: rows, nextStart: rows.length, hasMore: false });
    },
    'music:create-playlist': (_event, input) => {
      const id = `mock-playlist-${Date.now()}`;
      playlists.push({ id, title: input.name, kind: 'owned', ids: input.trackIds });
      return ok({ id });
    },
    'music:update-playlist-description': (_event, input) => {
      const list = playlists.find(item => item.id === input.id);
      if (list) list.description = input.description;
      return ok({ id: input.id });
    },
    'music:delete-playlist': (_event, input) => {
      playlists = playlists.filter(item => item.id !== input.id);
      return ok({ id: input.id });
    },
    'music:search': (_event, input) => {
      const query = String(input.query).trim().toLowerCase();
      const rows = tracks.filter(track => [track.title, track.album.title, ...track.artists.map(artist => artist.name)]
        .some(value => value.toLowerCase().includes(query)));
      return ok({ tracks: rows, nextStart: rows.length, hasMore: false, total: rows.length });
    },
    'music:history': () => ok({ tracks: ['mock-migrant-birds', 'mock-night-flight', 'mock-rain-curtain'].map(id => byId.get(id)) }),
    'music:album': (_event, input) => {
      const rows = tracks.filter(track => track.album.id === input.id);
      if (!rows.length) return missing('专辑不存在。');
      return ok({ album: { ...rows[0].album, coverUrl: rows[0].coverUrl, count: rows.length, artists: rows[0].artists },
        tracks: rows, nextStart: rows.length, hasMore: false });
    },
    'music:artist': (_event, input) => {
      const rows = tracks.filter(track => track.artists.some(artist => artist.id === input.id));
      if (!rows.length) return missing('歌手不存在。');
      const albums = [...new Map(rows.map(track => [track.album.id, { ...track.album, coverUrl: track.coverUrl }])).values()];
      return ok({ artist: { ...rows[0].artists[0], coverUrl: rows[0].coverUrl }, tracks: rows, albums });
    },
    'music:lyrics': (_event, input) => {
      const lines = docs.get(input.trackId)?.lines ?? [];
      return ok({ synced: lines.length > 0, lines });
    },
    'music:resolve-playback': async (event, input) => {
      const seconds = byId.get(input.trackId)?.durationSeconds;
      if (!seconds) return missing('这首歌不在离线预览曲库中。');
      const url = await event.sender.executeJavaScript(silentAudio(seconds));
      return ok({ url, actualQuality: input.quality, contentType: 'audio/wav', durationSeconds: seconds });
    },
    'music:report-playback': () => ok(undefined),
  };
}

if (!process.versions.electron) {
  // Under Node, `electron` is the binary path: relaunch this file as the Electron main entry.
  const { spawn } = await import('node:child_process');
  const { default: electron } = await import('electron');
  const profile = join(tmpdir(), 'huawei-music-desktop-mock-preview');
  const args = [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), `--user-data-dir=${profile}`, import.meta.filename];
  const child = spawn(electron, args, { stdio: 'inherit' });
  child.once('error', error => { console.error(error.message); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
} else {
  const { ipcMain } = await import('electron');
  const mocks = mockHandlers();
  const handle = ipcMain.handle.bind(ipcMain);
  // The app registers every channel itself; only the account and library ones are substituted.
  ipcMain.handle = (channel, listener) => handle(channel, mocks[channel] ?? listener);
  await import('../out/main/index.js');
}
