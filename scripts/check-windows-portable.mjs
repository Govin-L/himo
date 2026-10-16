// Static inspection on Linux. Never executes the Windows binary or claims Windows acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const supplied = process.argv[2];
if (!supplied || !supplied.endsWith('.exe')) throw new Error('Pass the single-file portable EXE path.');
const artifact = resolve(supplied);
const root = await mkdtemp(join(tmpdir(), 'huawei-portable-inspect-'));
const sevenZip = await getPath7za();
const forbidden = /(^|\/)(\.local|research|docs|test|scripts|src|design-previews|\.git)(\/|$)/;

// Minimal ICO + PNG reader so the packaged icon can be checked as artwork, not just as a file.
function readIcoEntries(ico) {
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const start = ico.readUInt32LE(offset + 12);
    const bytes = ico.readUInt32LE(offset + 8);
    return { width: ico[offset] === 0 ? 256 : ico[offset], png: ico.subarray(start, start + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), data: ico.subarray(start, start + bytes) };
  });
}

function decodePng(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const depth = png[24];
  const colorType = png[25];
  assert.equal(depth, 8, 'icon PNG must be 8-bit');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  assert.ok(channels, `unsupported icon PNG color type ${colorType}`);
  const chunks = [];
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString();
    if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    const source = raw.subarray(row * (stride + 1) + 1, row * (stride + 1) + 1 + stride);
    const target = pixels.subarray(row * stride, (row + 1) * stride);
    const previous = row === 0 ? Buffer.alloc(stride) : pixels.subarray((row - 1) * stride, row * stride);
    for (let index = 0; index < stride; index++) {
      const left = index >= channels ? target[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      const value = source[index];
      target[index] = filter === 0 ? value
        : filter === 1 ? (value + left) & 0xff
        : filter === 2 ? (value + up) & 0xff
        : filter === 3 ? (value + ((left + up) >> 1)) & 0xff
        : (value + (() => { const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft); return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; })()) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function walkFiles(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(full, base));
    else files.push(relative(base, full).replaceAll('\\', '/'));
  }
  return files;
}
async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}
function extract(archive, destination) {
  // Keep 7-Zip's output so a platform-specific failure is diagnosable from the CI log.
  return execFileSync(sevenZip, ['x', '-y', `-o${destination}`, archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}
// 7-Zip's -slt listing layout differs between platforms, so locate the embedded payload by
// unpacking the wrapper instead of parsing its file table.
async function findEmbeddedPayload(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findEmbeddedPayload(full));
    else if (/\.(7z|zip)$/i.test(entry.name)) found.push(full);
  }
  return found;
}
function peHeader(bytes) {
  assert.equal(bytes.subarray(0, 2).toString(), 'MZ');
  const offset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.readUInt32LE(offset), 0x4550, 'invalid PE header');
  const magic = bytes.readUInt16LE(offset + 24);
  assert.ok(magic === 0x10b || magic === 0x20b);
  const certificateDirectory = offset + 24 + (magic === 0x20b ? 112 : 96) + 4 * 8;
  return { machine: bytes.readUInt16LE(offset + 4), signed: bytes.readUInt32LE(certificateDirectory) !== 0 };
}
try {
  // 7-Zip flattens this NSIS portable payload on Windows while Linux keeps $PLUGINSDIR/app-64.7z,
  // so locate the application files whichever layout the extractor produced.
  const outerLog = extract(artifact, join(root, 'wrapper'));
  const wrapperListing = await readdir(join(root, 'wrapper'));
  let appRoot = join(root, 'wrapper');
  if (!(await exists(join(appRoot, 'resources', 'app.asar')))) {
    const embeddedFiles = await findEmbeddedPayload(appRoot);
    assert.equal(embeddedFiles.length, 1,
      `expected exactly one embedded payload, got ${JSON.stringify(embeddedFiles)}; wrapper=${JSON.stringify(wrapperListing.slice(0, 20))}; 7z=${outerLog.slice(-300)}`);
    const embedded = embeddedFiles[0];
    assert.match(basename(embedded), /^app-64\.(7z|zip)$/i, `embedded payload is not the x64 application: ${basename(embedded)}`);
    extract(embedded, join(root, 'app'));
    appRoot = join(root, 'app');
  }
  const payload = await walkFiles(appRoot);
  assert.equal(payload.some(path => /uninstall/i.test(path)), false, 'portable unexpectedly contains an uninstaller');
  // The executable name follows build.productName, so discover it instead of hardcoding it.
  const appExe = payload.find(path => !path.includes('/') && /\.exe$/i.test(path));
  assert.ok(appExe, `no top-level application executable in payload: ${JSON.stringify(payload.slice(0, 5))}`);
  assert.ok(payload.includes('resources/app.asar'));
  assert.deepEqual(payload.filter(path => /(^|\/)(session\.enc|session\.json|settings\.json|queue\.json|cache\.json|history\.json)$/.test(path)), [], 'user data in portable');
  const archive = join(appRoot, 'resources', 'app.asar');
  const unpackedArchive = join(dirname(artifact), 'win-unpacked', 'resources', 'app.asar');
  assert.equal(hash(await readFile(archive)), hash(await readFile(unpackedArchive)), 'embedded app differs from the unpacked build');
  // electron-builder stores asar entry names with backslashes on Windows, so keep the raw name
  // for extraction and use the normalised form only for prefix/path checks.
  const rawEntries = asar.listPackage(archive);
  const entries = rawEntries.map(path => path.replaceAll('\\', '/'));
  assert.deepEqual(entries.filter(path => forbidden.test(path)), [], 'private paths in app.asar');
  for (const raw of rawEntries) {
    const normalized = raw.replaceAll('\\', '/');
    if (!normalized.startsWith('/out/') || asar.statFile(archive, raw).files) continue;
    assert.equal(hash(asar.extractFile(archive, raw)), hash(await readFile(normalized.slice(1))), `outdated bundled output: ${normalized}`);
  }
  const appBytes = await readFile(join(appRoot, appExe));
  const appPe = peHeader(appBytes);
  const outerBytes = await readFile(artifact);
  const wrapperPe = peHeader(outerBytes);
  assert.equal(appPe.machine, 0x8664, 'application is not Windows x64');
  // The icon must be our own artwork: a brand-green rounded square with a light glyph.
  // <out>/win-unpacked/resources/app.asar -> <out>/.icon-ico/icon.ico (written by electron-builder).
  const ico = readIcoEntries(await readFile(join(unpackedArchive, '..', '..', '..', '.icon-ico', 'icon.ico')));
  assert.ok(ico.length >= 6, `expected a full icon size set, got ${ico.length}`);
  const largest = ico.filter(entry => entry.png).sort((a, b) => b.width - a.width)[0];
  assert.ok(largest && largest.width >= 256, 'icon is missing a 256px PNG entry');
  const art = decodePng(largest.data);
  const pixel = (x, y) => {
    const at = (y * art.width + x) * art.channels;
    return [...art.pixels.subarray(at, at + 3), art.channels === 4 ? art.pixels[at + 3] : 255];
  };
  const near = (value, target, tolerance = 26) => value.every((channel, index) => Math.abs(channel - target[index]) <= tolerance);
  // Rounded corners are transparent, so judge the artwork by coverage: a mostly brand-green
  // field with a light glyph on top. The stock Electron icon fails both ratios.
  let brand = 0, light = 0, sampled = 0;
  for (let y = 0; y < art.height; y += 2) for (let x = 0; x < art.width; x += 2) {
    const [r, g, b, a] = pixel(x, y);
    if (a < 8) continue;
    sampled++;
    if (near([r, g, b], [27, 64, 55])) brand++;
    if (near([r, g, b], [242, 251, 240], 60)) light++;
  }
  const brandRatio = brand / sampled;
  const lightRatio = light / sampled;
  assert.ok(brandRatio > 0.3, `icon background is not the brand colour (${brandRatio.toFixed(3)})`);
  assert.ok(lightRatio > 0.01 && lightRatio < 0.6, `unexpected glyph coverage ${lightRatio.toFixed(3)}`);
  const iconCoverage = { brand: Number(brandRatio.toFixed(3)), glyph: Number(lightRatio.toFixed(3)) };
  assert.equal(appPe.signed, false, 'expected an explicitly unsigned internal build');
  assert.equal(wrapperPe.signed, false);
  assert.ok(appBytes.includes(Buffer.from('asInvoker')), 'application execution manifest must not request elevation');
  console.log(JSON.stringify({ artifact: basename(artifact), applicationExecutable: appExe, bytes: (await stat(artifact)).size,
    sha256: hash(outerBytes), singleFileWithEmbeddedApp: true, appArchitecture: 'x64',
    wrapperArchitecture: wrapperPe.machine === 0x14c ? 'x86 NSIS launcher (starts x64 app)' : 'other',
    unsigned: true, noPrivateDataOrSources: true, matchesCurrentBuild: true,
    iconSizes: ico.map(entry => entry.width).sort((a, b) => a - b), iconArtworkVerified: true, iconCoverage,
    windowsRuntimeTested: false, launchSpeedAndCredentialRestore: 'not-tested' }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
