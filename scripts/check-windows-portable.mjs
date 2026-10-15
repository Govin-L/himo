// Static inspection on Linux. Never executes the Windows binary or claims Windows acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const supplied = process.argv[2];
if (!supplied || !supplied.endsWith('.exe')) throw new Error('Pass the single-file portable EXE path.');
const artifact = resolve(supplied);
const root = await mkdtemp(join(tmpdir(), 'huawei-portable-inspect-'));
const sevenZip = await getPath7za();
const forbidden = /(^|\/)(\.local|research|docs|test|scripts|src|design-previews|\.git)(\/|$)/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function list(archive) {
  const output = execFileSync(sevenZip, ['l', '-slt', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const entries = output.split('----------')[1]?.split('\n').filter(line => line.startsWith('Path = ')).map(line => line.slice(7).trim().replaceAll('\\', '/'));
  assert.ok(entries?.length, 'archive entries unavailable');
  assert.deepEqual(entries.filter(path => path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')), [], 'unsafe archive entry');
  assert.deepEqual(entries.filter(path => forbidden.test(path)), [], 'private or source path in payload');
  return entries;
}
function extract(archive, destination) {
  execFileSync(sevenZip, ['x', '-y', `-o${destination}`, archive], { stdio: 'ignore' });
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
  const outer = list(artifact);
  assert.ok(outer.includes('$PLUGINSDIR/app-64.7z'), 'EXE is missing its embedded x64 application');
  assert.equal(outer.some(path => /uninstall/i.test(path)), false, 'portable unexpectedly contains an uninstaller');
  extract(artifact, join(root, 'wrapper'));
  const embedded = join(root, 'wrapper', '$PLUGINSDIR', 'app-64.7z');
  const payload = list(embedded);
  assert.ok(payload.includes('Huawei Music Desktop.exe'));
  assert.ok(payload.includes('resources/app.asar'));
  assert.deepEqual(payload.filter(path => /(^|\/)(session\.enc|session\.json|settings\.json|queue\.json|cache\.json|history\.json)$/.test(path)), [], 'user data in portable');
  extract(embedded, join(root, 'app'));
  const archive = join(root, 'app', 'resources', 'app.asar');
  const unpackedArchive = join(dirname(artifact), 'win-unpacked', 'resources', 'app.asar');
  assert.equal(hash(await readFile(archive)), hash(await readFile(unpackedArchive)), 'embedded app differs from the unpacked build');
  const entries = asar.listPackage(archive).map(path => path.replaceAll('\\', '/'));
  assert.deepEqual(entries.filter(path => forbidden.test(path)), [], 'private paths in app.asar');
  for (const entry of entries.filter(path => path.startsWith('/out/') && !asar.statFile(archive, path.slice(1)).files)) {
    assert.equal(hash(asar.extractFile(archive, entry.slice(1))), hash(await readFile(entry.slice(1))), `outdated bundled output: ${entry}`);
  }
  const appBytes = await readFile(join(root, 'app', 'Huawei Music Desktop.exe'));
  const appPe = peHeader(appBytes);
  const outerBytes = await readFile(artifact);
  const wrapperPe = peHeader(outerBytes);
  assert.equal(appPe.machine, 0x8664, 'application is not Windows x64');
  assert.equal(appPe.signed, false, 'expected an explicitly unsigned internal build');
  assert.equal(wrapperPe.signed, false);
  assert.ok(appBytes.includes(Buffer.from('asInvoker')), 'application execution manifest must not request elevation');
  console.log(JSON.stringify({ artifact: basename(artifact), bytes: (await stat(artifact)).size,
    sha256: hash(outerBytes), singleFileWithEmbeddedApp: true, appArchitecture: 'x64',
    wrapperArchitecture: wrapperPe.machine === 0x14c ? 'x86 NSIS launcher (starts x64 app)' : 'other',
    unsigned: true, noPrivateDataOrSources: true, matchesCurrentBuild: true,
    windowsRuntimeTested: false, launchSpeedAndCredentialRestore: 'not-tested' }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
