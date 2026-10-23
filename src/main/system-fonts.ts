// Installed font enumeration for the appearance settings.
//
// Chromium's queryLocalFonts() is unavailable on file:// documents, so the list is produced in
// the main process: PowerShell/.NET on Windows, AppKit on macOS (fontconfig is rarely installed
// there and stays the fallback), fontconfig on Linux.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseFcList, parseMacFontFamilies, parseWindowsFontList } from './fonts.mjs';

const run = promisify(execFile);

export async function listSystemFonts(): Promise<string[]> {
  if (process.platform === 'win32') {
    // System.Drawing exposes the same font families the system UI uses; no extra tooling needed.
    const script = "Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }";
    try {
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        timeout: 15_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
      });
      return parseWindowsFontList(stdout);
    } catch { return []; }
  }
  if (process.platform === 'darwin') {
    // osascript ships with macOS; JXA reads the same family list the system font panel shows.
    const script = 'ObjC.import("AppKit"); $.NSFontManager.sharedFontManager.availableFontFamilies.js.map(name => name.js).join("\\n")';
    try {
      const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 8_000, maxBuffer: 4 * 1024 * 1024 });
      const families = parseMacFontFamilies(stdout);
      if (families.length) return families;
    } catch { /* Fall back to fontconfig below. */ }
  }
  try {
    const { stdout } = await run('fc-list', [':', 'family'], { timeout: 8_000, maxBuffer: 4 * 1024 * 1024 });
    return parseFcList(stdout);
  } catch { return []; }
}
