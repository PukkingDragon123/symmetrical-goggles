// Build the game and wrap it as a desktop app.  node tools/package-desktop.mjs [win32|linux|darwin] [x64|arm64]
// Output: release/BUSHED-<platform>-<arch>/ and release/BUSHED-<platform>-<arch>.zip
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { packager } from '@electron/packager';

const platform = process.argv[2] ?? 'win32';
const arch = process.argv[3] ?? 'x64';
const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const stage = path.join(here, 'release', 'stage');
const out = path.join(here, 'release');

execSync('npx vite build --outDir release/dist --emptyOutDir', { cwd: here, stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of ['main.cjs', 'package.json', 'icon.png', 'icon.ico']) if (existsSync(path.join(here, 'desktop', f))) cpSync(path.join(here, 'desktop', f), path.join(stage, f));
cpSync(path.join(here, 'release', 'dist'), path.join(stage, 'game'), { recursive: true });
cpSync(path.join(here, 'CREDITS.md'), path.join(stage, 'game', 'CREDITS.md'));

const [dir] = await packager({
  dir: stage, out, platform, arch, overwrite: true, asar: true, prune: false,
  electronVersion: '38.8.6', name: 'BUSHED', appCopyright: 'BUSHED',
  ignore: [/\.map$/],
  // the app icon: packager picks the platform's format from this base name (icon.ico is written into BUSHED.exe
  // with resedit, no Wine needed; Linux uses the window icon from main.cjs; macOS would need an icon.icns)
  icon: path.join(here, 'desktop', 'icon'),
  win32metadata: { CompanyName: 'BUSHED', FileDescription: 'BUSHED', ProductName: 'BUSHED', InternalName: 'BUSHED', OriginalFilename: 'BUSHED.exe' },
  // a pre-downloaded, checksum-verified Electron zip (set ELECTRON_ZIP_DIR) avoids flaky large downloads
  ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {}),
});
console.log('packaged', dir);
const zip = `${dir}.zip`;
rmSync(zip, { force: true });
execSync(`zip -qr -9 "${path.basename(zip)}" "${path.basename(dir)}"`, { cwd: out, stdio: 'inherit' });
console.log('zipped', zip);
