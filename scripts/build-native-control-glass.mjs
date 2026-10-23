// Build only this app's two native control backgrounds; no downloads or npm rebuilds.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'darwin') {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const headers = resolve(dirname(realpathSync(process.execPath)), '../include/node');
  if (!existsSync(join(headers, 'node_api.h'))) throw new Error('当前 Node.js 安装缺少 include/node/node_api.h，无法构建原生玻璃。');
  const sdk = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { encoding: 'utf8' }).trim();
  const output = join(root, 'out/main/native-control-glass.node');
  mkdirSync(dirname(output), { recursive: true });
  execFileSync('xcrun', ['--sdk', 'macosx', 'clang++', '-std=c++17', '-fobjc-arc', '-fmodules',
    '-fmodules-cache-path=' + join(tmpdir(), 'himo-control-glass-module-cache'),
    '-DNAPI_VERSION=8', '-mmacosx-version-min=26.0', '-arch', 'arm64', '-arch', 'x86_64',
    '-bundle', '-undefined', 'dynamic_lookup', '-isysroot', sdk, '-I', headers,
    '-framework', 'AppKit', join(root, 'src/main/native/control-glass.mm'), '-o', output], { stdio: 'inherit' });
  console.log('Native control glass built (arm64 + x86_64).');
}
