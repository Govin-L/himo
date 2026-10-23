import { ipcMain, type BrowserWindow } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { isAllowedSender } from './auth-manager';
import { normalizeControlGlassLayout } from './control-glass-layout.mjs';
import { channels } from '../shared/channels';
import { ok } from '../shared/result';
import type { ControlGlassLayout } from '../shared/types';

type NativeControls = {
  create(handle: Buffer): unknown;
  update(controller: unknown, layout: ControlGlassLayout): boolean;
  destroy(controller: unknown): void;
};

export function registerNativeControlGlass(owner: BrowserWindow): void {
  let native: NativeControls | undefined;
  let controller: unknown;
  if (process.platform === 'darwin' && Number(process.getSystemVersion().split('.')[0]) >= 26) {
    try {
      native = createRequire(import.meta.url)(join(__dirname, 'native-control-glass.node'));
      controller = native!.create(owner.getNativeWindowHandle());
    } catch {
      native = undefined;
      console.warn('局部原生玻璃不可用，保留现有控件背景。');
    }
  }
  const hide = () => { native?.update(controller, { player: null, tabs: null, search: null }); };
  ipcMain.handle(channels.windowSyncGlassControls, (event, input: unknown) => {
    if (!isAllowedSender(owner, event)) throw new Error('IPC 来源不受信任');
    const layout = normalizeControlGlassLayout(input, owner.getContentSize(), owner.webContents.getZoomFactor());
    if (!layout) throw new Error('控件玻璃边界无效');
    return ok({ active: native?.update(controller, layout) ?? false });
  });
  owner.webContents.on('did-start-loading', hide);
  owner.webContents.on('render-process-gone', hide);
  owner.once('closed', () => {
    ipcMain.removeHandler(channels.windowSyncGlassControls);
    native?.destroy(controller);
    native = undefined;
  });
}
