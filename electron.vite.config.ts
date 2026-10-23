import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ include: ['electron-liquid-glass'] }), {
      name: 'native-control-glass',
      closeBundle() { execFileSync(process.execPath, [resolve(__dirname, 'scripts/build-native-control-glass.mjs')], { stdio: 'inherit' }); },
    }],
    build: { outDir: 'out/main' },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/preload', rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: { outDir: resolve(__dirname, 'out/renderer') },
  },
});
