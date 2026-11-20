// Contact-sheet shots of a low-poly cryptid on the game's own test stages (Playwright, software GL):
//   node tools/blender/lowpoly/sheet.cjs <who> <port> <out dir>
// hodag (and the other procedural cryptids): creatures.html via window.__creatures.pose;
// splintercat (and the other mixer cryptids): tools/blender/cryptids4/preview via window.__c4.shot.
// Writes <out>/<who>_<shot>.png and prints the console errors; sheet.py tiles them.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [who = 'hodag', port = '5225', out = '.'] = process.argv.slice(2);
const V = {
  hodag: { page: `creatures.html?who=hodag&clean=1`, api: 'creatures', h: 0.55, head: [0, 0.62, 0.85], len: 2.9,
    clips: ['idle', 'walk', 'run', 'back', 'bellow', 'paw', 'snap', 'gore', 'sniff', 'eat', 'happy', 'sleep'] },
  splintercat: { page: `tools/blender/cryptids4/preview/index.html?who=splintercat&w=640&h=480`, api: 'c4', h: 0.5, head: [0, 0.7, 0.4], len: 1.2,
    clips: ['idle', 'idle2', 'walk', 'run', 'eat', 'sleep'] },
}[who];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push('error: ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  p.setDefaultTimeout(300000);
  await p.goto(`http://localhost:${port}/${V.page}`);
  const api = V.api === 'creatures' ? '__creatures' : '__c4';
  await p.waitForFunction((a) => window[a] && window[a].ready, api, { timeout: 300000 });
  const L = V.len, h = V.h, H = V.head;
  const views = {
    front: { cam: [0.15 * L, h + 0.35, 1.45 * L], target: [0, h, 0] },
    q34: { cam: [1.05 * L, h + 0.55 * L * 0.45, 1.05 * L], target: [0, h, -0.05 * L] },
    side: { cam: [1.55 * L, h + 0.25, -0.05 * L], target: [0, h, -0.05 * L] },
    head: { cam: [H[0] + 0.32 * L, H[1] + 0.1 * L, H[2] + 0.42 * L], target: H },
  };
  async function shot(name, o) {
    const r = await p.evaluate(([a, o]) => (a === '__creatures' ? window.__creatures.pose(o) : window.__c4.shot(o)), [api, o]);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}/${who}_${name}.png` });
    return r;
  }
  const idle = V.clips[0];
  for (const light of ['day', 'night']) for (const [k, v] of Object.entries(views)) {
    console.log(light, k, await shot(`${light}_${k}`, { who, clip: idle, t: 1.2, heading: 0, light, cam: v.cam, target: v.target }));
  }
  console.log('walk', await shot('walk', { who, clip: 'walk', t: 0.45, heading: 0, light: 'day', cam: views.side.cam, target: views.side.target }));
  for (const c of V.clips) console.log('clip', c, await shot(`clip_${c}`, { who, clip: c, t: c === 'bellow' ? 1.4 : c === 'happy' ? 2.2 : c === 'gore' ? 0.5 : c === 'snap' ? 0.3 : 1.0, heading: 0, light: 'day', cam: views.q34.cam, target: views.q34.target }));
  console.log('ERRORS', logs.length ? '\n' + logs.slice(0, 20).join('\n') : 'none');
  await b.close();
})();
