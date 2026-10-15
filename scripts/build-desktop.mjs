// Explicit local builds only. No publishing and no fabricated maintainer/signing identity.
import { spawnSync } from 'node:child_process';
import { build, Platform, Arch } from 'electron-builder';

const target = process.argv[2] ?? ({ win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform]);
const architecture = process.argv[3] ?? (target === 'mac' ? process.arch : 'x64');
if (!['win', 'mac', 'linux'].includes(target) || !['x64', 'arm64'].includes(architecture)) {
  throw new Error('Usage: npm run dist -- <win|linux|mac> <x64|arm64>');
}
const nativePlatform = { win: 'win32', mac: 'darwin', linux: 'linux' }[target];
if (process.platform !== nativePlatform) throw new Error(`Build ${target} on its native OS. Use the Linux build to validate shared API/UI/player logic here.`);
if (target !== 'mac' && architecture !== 'x64') throw new Error('The first release only targets Windows/Linux x64.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) process.exit(result.status ?? 1);
const config = { directories: { output: `release/${target}-${architecture}` } };
const names = target === 'win' ? ['nsis'] : target === 'mac' ? ['dmg'] : ['AppImage'];
if (target === 'linux') {
  const homepage = process.env.DESKTOP_BUILD_HOMEPAGE;
  const maintainer = process.env.DESKTOP_BUILD_MAINTAINER;
  if (homepage && maintainer) {
    if (!/^https:\/\//.test(homepage) || !/^[^<>]+ <[^<>@\s]+@[^<>@\s]+>$/.test(maintainer)) {
      throw new Error('Supply a real HTTPS DESKTOP_BUILD_HOMEPAGE and DESKTOP_BUILD_MAINTAINER="Name <email>".');
    }
    config.extraMetadata = { homepage };
    config.linux = { maintainer };
    names.push('deb');
  } else console.log('DEB not built: real homepage and maintainer identity are required; AppImage is still built.');
}
const platform = target === 'win' ? Platform.WINDOWS : target === 'mac' ? Platform.MAC : Platform.LINUX;
await build({ targets: platform.createTarget(names, architecture === 'arm64' ? Arch.arm64 : Arch.x64), config, publish: 'never' });
console.log(`${target}/${architecture} INTERNAL build complete. Signing, installation and account/media acceptance must be recorded separately.`);
