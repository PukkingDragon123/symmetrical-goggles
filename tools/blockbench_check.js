// Open a .bbmodel in the real Blockbench (web app, headless Chromium via Playwright), report what loaded,
// optionally play a clip to time t and print bone world positions, and save a screenshot.
//   node tools/blockbench_check.js out/x/model.bbmodel [clip] [t] ['["bone1","bone2"]']
// Needs network access to web.blockbench.net and the Node "playwright" package.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [file, clip = '', t = '0', bonesJson = '[]'] = process.argv.slice(2);
  const bones = JSON.parse(bonesJson);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('https://web.blockbench.net/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadModelFile === 'function', null, { timeout: 60000 });
  const text = fs.readFileSync(file, 'utf8');
  const res = await page.evaluate(async ({ text, name, clip, t, bones }) => {
    loadModelFile({ path: name, name: name, content: text });
    await new Promise(r => setTimeout(r, 2500));
    const out = { groups: Group.all.length, anims: Animation.all.map(a => a.name) };
    const a = Animation.all.find(a => a.name === clip);
    if (!a) return out;
    Modes.options.animate.select();
    a.select();
    Timeline.setTime(parseFloat(t));
    Animator.preview();
    await new Promise(r => setTimeout(r, 300));
    out.pos = {};
    for (const b of bones) {
      const g = Group.all.find(g => g.name === b);
      const v = new THREE.Vector3(); g.mesh.updateMatrixWorld(true); g.mesh.getWorldPosition(v);
      // probe a point 4 units along +x from the bone origin too (catches rotation sign errors)
      const p = new THREE.Vector3(g.origin[0] + 4, g.origin[1], g.origin[2]);
      const local = g.mesh.worldToLocal ? null : null;
      out.pos[b] = [v.x, v.y, v.z];
    }
    return out;
  }, { text, name: file.split('/').pop(), clip, t, bones });
  console.log(JSON.stringify(res));
  await page.screenshot({ path: file.replace(/\.bbmodel$/, '_blockbench.png') });
  await browser.close();
})();
