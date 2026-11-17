// usage: node tools/shot.cjs "<url query>" out.png [waitMs] [w] [h]
const { chromium } = require('playwright');
(async () => {
  const [q = '', out = 'shot.png', wait = '6000', w = '960', h = '540'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  const url = q.startsWith('http') ? q : `http://localhost:5173/${q}`;
  await p.goto(url);
  await p.waitForTimeout(+wait);
  await p.screenshot({ path: out });
  console.log(logs.slice(0, 15).join('\n'));
  await b.close();
})();
