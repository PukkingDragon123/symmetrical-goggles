// Headless chopping test: a synthetic test tree (dev only), scripted strikes, physics, screenshots by stage.
import * as THREE from 'three';
import { Game } from '../game/game';
import { hud } from '../ui/hud';
import { SPOTS, heightAt } from '../world/layout';
import type { TreeLike, TreeRefLike } from '../chop/types';
import { ITEMS } from '../game/items';

function testTree(): TreeLike {
  const H = 12, R0 = 0.17;
  const trunk = Array.from({ length: 13 }, (_, i) => ({ y: (i / 12) * H, r: R0 * (1 - (i / 12) * 0.85) + (i === 0 ? 0.04 : 0), x: 0, z: 0 }));
  const radiusAt = (y: number) => { const t = Math.min(1, Math.max(0, y / H)); return R0 * (1 - t * 0.85); };
  const branches = Array.from({ length: 10 }, (_, i) => {
    const y = 3 + i * 0.8, a = i * 2.4;
    return { id: i, base: new THREE.Vector3(Math.cos(a) * radiusAt(y), y, Math.sin(a) * radiusAt(y)), dir: new THREE.Vector3(Math.cos(a), -0.2, Math.sin(a)).normalize(), len: 2.2 - i * 0.15, r: 0.03, mass: 6 };
  });
  return {
    species: 'spruce', seed: 1, height: H, dbh: R0 * 2, mass: 320, crownMass: 120, crownCenter: new THREE.Vector3(0, 7, 0), lean: new THREE.Vector2(0.01, 0),
    trunk, radiusAt, centerAt: () => [0, 0], branches,
    object() {
      const g = new THREE.Group();
      const pts = trunk.map((s) => new THREE.Vector2(s.r, s.y));
      const lathe = new THREE.LatheGeometry(pts, 24);
      const trunkMesh = new THREE.Mesh(lathe, new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }));
      trunkMesh.name = 'trunk'; trunkMesh.castShadow = true;
      g.add(trunkMesh);
      for (const b of branches) {
        const o = new THREE.Group(); o.name = `branch_${b.id}`;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.01, b.r, b.len, 5), new THREE.MeshStandardMaterial({ color: 0x3d5a2a }));
        m.position.copy(b.base).addScaledVector(b.dir, b.len / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.dir);
        o.add(m); g.add(o);
      }
      return g;
    },
  };
}

async function main() {
  hud.mount(document.getElementById('ui')!);
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  await game.init();
  game.hour = 14;
  const tx = SPOTS.cabin.x - 14, tz = SPOTS.cabin.z + 10;
  const model = testTree();
  const ref: TreeRefLike & { model(): TreeLike } = { id: 9001, species: 'spruce', x: tx, y: heightAt(tx, tz), z: tz, rotY: 0, scale: 1, model: () => model };
  let detached = false;
  game.setForest({
    update() {},
    raycastTrunk(o, d, max) {
      if (detached) return null;
      // ray vs vertical cylinder
      const ox = o.x - tx, oz = o.z - tz;
      const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - 0.17 * 0.17;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > max) return null;
      const p = o.clone().addScaledVector(d, t);
      return { ref, point: p, normal: new THREE.Vector3(p.x - tx, 0, p.z - tz).normalize(), h: p.y - ref.y };
    },
    detach() { detached = true; return { object: model.object(), model }; },
    remove() {},
  });
  game.player.teleport(tx - 1.1, null, tz, Math.PI / 2);
  game.terrain.prime(new THREE.Vector3(tx, 0, tz));
  game.mode = 'walk';
  const W = window as any;
  W.__game = game;
  W.stage = 'start';
  const tool = { ...ITEMS.axe_felling.tool! };
  const cam = game.camera;
  const strike = (dy: number, side: number) => {
    const o = new THREE.Vector3(tx - 1.1, ref.y + 1.0 + dy, tz + side * 0.05);
    const d = new THREE.Vector3(1, 0, side * 0.05).normalize();
    return game.chop.swing(o, d, 2, new THREE.Vector3(1, -0.3, 0).normalize(), tool, 1, 1);
  };
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
    if (W.ff > 0) { for (let k = 0; k < 20 && W.ff > 0; k++) { game.update(1 / 60); W.ff--; } } else game.update(dt);
    game.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
  await wait(2);
  for (let i = 0; i < 40; i++) {
    const r = strike(i % 2 === 0 ? 0.08 : 0, i % 4 < 2 ? -1 : 1);
    await wait(0.15);
    if ((r as any).felled) { W.stage = 'felled@' + i; break; }
    if (i === 7) { W.stage = 'notched'; cam.position.set(tx - 0.9, ref.y + 1.2, tz + 0.5); cam.lookAt(tx, ref.y + 1, tz); game.mode = 'cutscene'; await wait(3); W.shot1 = true; await wait(3); }
  }
  W.notchInfo = [...game.chop.trees.values()].map((t) => ({ state: t.state, frac: t.notches.map((n) => n.removedFraction()) }));
  cam.position.set(tx - 6, ref.y + 3, tz + 8); cam.lookAt(tx + 4, ref.y + 1, tz);
  W.ff = 60 * 9;
  await new Promise<void>((r) => { const c = () => (W.ff > 0 ? setTimeout(c, 100) : r()); c(); });
  W.after = [...game.chop.trees.values()].map((t) => ({ state: t.state, sections: t.sections.length }));
  // limb everything and buck it in three places
  const t = [...game.chop.trees.values()][0];
  if (t && t.state === 'fallen') {
    const sec = t.sections[0];
    for (const id of [...sec.branches.keys()]) { for (let k = 0; k < 6; k++) t.strikeBranch(sec, id, 0.05, sec.root.position.clone()); }
    for (const yy of [3.2, 6.4]) {
      const s2 = t.sections.find((q) => q.y0 < yy && q.y1 > yy);
      if (!s2) continue;
      const c = new THREE.Vector3(0, yy, 0); s2.object.localToWorld(c);
      for (let k = 0; k < 30 && t.sections.includes(s2); k++) t.strikeBuck(s2, c.clone().add(new THREE.Vector3(0, 0.15, 0)), 0.04, k % 2 === 0);
    }
    W.ff = 60 * 4;
    await new Promise<void>((r) => { const c = () => (W.ff > 0 ? setTimeout(c, 100) : r()); c(); });
  }
  W.after2 = { pieces: game.chop.pieces.size, sections: t?.sections.length, slash: t?.slash.length };
  // splitting: a spruce round on end, struck from above with the maul
  const { WoodPiece } = await import('../chop/wood');
  const rx = tx + 1.5, rz = tz + 4;
  const round = new WoodPiece({ species: 'spruce', stem: [{ y: 0, r: 0.15, x: 0, z: 0 }, { y: 2, r: 0.14, x: 0, z: 0 }], y0: 0, y1: 0.42, seed: 5 });
  round.spawn(new THREE.Vector3(rx, heightAt(rx, rz) + 0.25, rz), new THREE.Quaternion());
  game.chop.addPiece(round);
  W.ff = 60; await new Promise<void>((r) => { const c = () => (W.ff > 0 ? setTimeout(c, 100) : r()); c(); });
  const maul = { ...ITEMS.maul.tool! };
  const results: string[] = [];
  for (let k = 0; k < 8; k++) {
    let target: any = null;
    for (const p of game.chop.pieces) if (p.kind === 'round' || p.kind === 'half') { if (p.mesh.position.distanceTo(new THREE.Vector3(rx, p.mesh.position.y, rz)) < 1.2) target = p; }
    if (!target) break;
    const top = target.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    const r = game.chop.swing(top, new THREE.Vector3(0.02, -1, 0.01).normalize(), 1.5, new THREE.Vector3(0, -1, 0), maul, 1, 1);
    results.push(r.kind + ((r as any).done ? '!' : ''));
    W.ff = 50; await new Promise<void>((res) => { const c = () => (W.ff > 0 ? setTimeout(c, 100) : res()); c(); });
  }
  W.split = { results, kinds: [...game.chop.pieces].map((p) => p.kind) };
  cam.position.set(rx - 1.2, heightAt(rx, rz) + 1.3, rz + 1.2); cam.lookAt(rx, heightAt(rx, rz), rz);
  cam.position.set(tx + 2, ref.y + 2.5, tz + 6); cam.lookAt(tx + 5, ref.y, tz);
  await wait(3);
  W.shot2 = true;
}
main();
