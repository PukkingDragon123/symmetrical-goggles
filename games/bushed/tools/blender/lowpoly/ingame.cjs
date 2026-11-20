// The low-poly cryptids in the real game (/?play): find each one, stand a few metres off it facing it, by day and
// at night with the flashlight, screenshot, and report console errors.
//   node tools/blender/lowpoly/ingame.cjs <port> <out dir> hodag splintercat
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [port = '5225', out = '.', ...who] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push('error: ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  p.setDefaultTimeout(600000);
  await p.goto(`http://localhost:${port}/?play`);
  await p.waitForFunction(() => window.__game && window.__game.critters && window.__game.critters.extra && window.__game.critters.extra.length > 0, null, { timeout: 600000 });
  await p.waitForTimeout(3000);
  for (const w of who) {
    for (const [light, hour, dist] of [['day', 13, w === 'hodag' ? 8 : 3.2], ['night', 22.8, w === 'hodag' ? 6 : 3.0]]) {
      const r = await p.evaluate(([w, hour, dist]) => {
        const g = window.__game, c = g.critters.extra.find((x) => x.id === w);
        if (!c) return 'missing ' + w;
        g.hour = hour;
        if (hour > 20) { g.flashOn = true; }
        if (w === 'hodag') {
          // its swamp is thick with alders: bring it out onto the open ground ahead of the player instead
          const P = g.player.pos, f = g.player.forward();
          c.pos.set(P.x + f.x * 7, P.y, P.z + f.z * 7); c.home.copy(c.pos); c.heading = Math.atan2(-f.x, -f.z);
          c.update({ dt: 0.016, time: performance.now() / 1000, hour, player: { pos: P.clone(), dir: f, held: 'none', crouch: false, noise: 0, light: false, speed: 0 }, heightAt: (x, z) => g.player.pos.y, emit: () => {} });
          return `${w} placed at ${c.pos.x.toFixed(1)},${c.pos.z.toFixed(1)} state=${c.state}`;
        }
        const o = c.object.position, h = c.heading ?? 0;
        // stand off its front-left quarter, looking at it
        const a = h + 0.8, x = o.x + Math.sin(a) * dist, z = o.z + Math.cos(a) * dist;
        g.player.teleport(x, null, z, Math.atan2(-(o.x - x), -(o.z - z)));
        g.player.pitch = w === 'hodag' ? -0.12 : -0.22;
        return `${w} at ${o.x.toFixed(1)},${o.y.toFixed(1)},${o.z.toFixed(1)} state=${c.state}`;
      }, [w, hour, dist]);
      await p.waitForTimeout(4000);
      // re-aim (it may have moved)
      await p.evaluate(([w]) => { const g = window.__game, c = g.critters.extra.find((x) => x.id === w); const o = c.object.position, P = g.player.pos; g.player.yaw = Math.atan2(-(o.x - P.x), -(o.z - P.z)); g.player.pitch = -0.12; }, [w]);
      await p.waitForTimeout(800);
      await p.screenshot({ path: `${out}/game_${w}_${light}.png` });
      console.log(light, r);
    }
  }
  console.log('ERRORS', logs.length ? '\n' + logs.slice(0, 25).join('\n') : 'none');
  await b.close();
})();
