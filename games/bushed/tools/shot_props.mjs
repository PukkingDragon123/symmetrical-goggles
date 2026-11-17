// Screenshot props.html with headless chromium (SwiftShader WebGL).
//   npx vite --port 5185 &            (in games/bushed)
//   node tools/shot_props.mjs out_dir "cat=tool" "id=wooden_axe&labels=0" "tex=1" ...
// Each query string becomes <out_dir>/<sanitised query>.png. Errors from the page are printed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const [outDir, ...queries] = process.argv.slice(2);
const base = process.env.PROPS_URL ?? 'http://localhost:5185/props.html';
fs.mkdirSync(outDir, { recursive: true });
const browser = await playwright.chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const W = Number(process.env.W ?? 1600), H = Number(process.env.H ?? 1000);
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const q of queries.length ? queries : ['']) {
  await page.goto(`${base}?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window).__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
  const errs = await page.evaluate(() => (window).__errors ?? []);
  if (errs.length) console.log(q, 'errors:', errs);
  const name = (q || 'all').replace(/[^a-z0-9_,.=-]+/gi, '_').slice(0, 120);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
