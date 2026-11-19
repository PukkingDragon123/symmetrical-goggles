// BUSHED desktop shell (Electron). Serves the built game from an app:// origin so fetch, IndexedDB caches,
// pointer lock and Web Audio all behave like the web version, fully offline.
const { app, BrowserWindow, protocol, net, Menu, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// prefer the discrete GPU on laptops and never fall back to software just because a driver is old
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const root = path.join(__dirname, 'game');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#000000', title: 'BUSHED', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { backgroundThrottling: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  // F11 / Alt+Enter toggle fullscreen; F12 opens devtools for bug reports
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://bushed/index.html' + (process.env.BUSHED_QUERY ?? ''));
  // automated smoke test: BUSHED_SHOT=out.png captures the window after BUSHED_SHOT_DELAY seconds and quits
  if (process.env.BUSHED_SHOT) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.level ?? '', e.message ?? ''));
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require('node:fs').writeFileSync(process.env.BUSHED_SHOT, img.toPNG());
      const info = await win.webContents.executeJavaScript('JSON.stringify({ mode: window.__game && window.__game.mode, gl: (() => { const g = document.createElement("canvas").getContext("webgl2"); const d = g && g.getExtension("WEBGL_debug_renderer_info"); return g ? g.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : g.RENDERER) : "none"; })() })');
      console.log('[smoke]', info);
      app.quit();
    }, Number(process.env.BUSHED_SHOT_DELAY ?? 60) * 1000);
  }
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
