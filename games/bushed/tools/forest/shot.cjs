// Screenshot the trees test page with headless chromium (SwiftShader WebGL).
//   node tools/forest/shot.cjs "<query>" out.png [width] [height] [waitFrames] [timeoutSec]
const { chromium } = require('playwright');
(async () => {
  const [q = '', out = 'shot.png', w = '640', h = '400', frames = '6', tmo = '240'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:5181/trees.html?${q}&stop=${frames}`, { waitUntil: 'load', timeout: +tmo * 1000 });
  try {
    await page.waitForFunction((n) => (window.__frame || 0) >= n, +frames, { timeout: +tmo * 1000, polling: 500 });
  } catch (e) { logs.push('timeout waiting for frames'); }
  await page.screenshot({ path: out, timeout: +tmo * 1000 });
  const hud = await page.evaluate(() => window.__hud || '');
  console.log(hud);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const l of logs.filter((l) => !l.includes('no image data') && !l.includes('[vite]')).slice(0, 30)) console.log(l);
  await browser.close();
})();
