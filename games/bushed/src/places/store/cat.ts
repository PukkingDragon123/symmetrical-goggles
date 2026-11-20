// Odile's orange cat, asleep in a curl on the counter: a fat curved body, head tucked on the forepaws, ears, the
// tail wrapped round the nose; slow breathing and the odd ear twitch. A pixel tabby coat on a tiny canvas.
import * as THREE from 'three';
import { Mesher, V, tube, lathe, defineMat, hasMat } from '../kit';
import { canvasTex } from '../../gfx/tex';

function ensureCatMat(): void {
  if (hasMat('cat_fur')) return;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c8823a'; g.fillRect(0, 0, 32, 16);
  // belly and chest paler along the bottom of the "around" axis
  g.fillStyle = '#e2b47a'; g.fillRect(0, 11, 32, 5);
  // mackerel stripes across the length, broken and irregular
  g.fillStyle = '#8e4f1e';
  for (let x = 1; x < 32; x += 4) {
    for (let y = 0; y < 11; y++) if (((x * 7 + y * 3) % 11) > 1) g.fillRect(x + (y % 5 === 0 ? 1 : 0), y, y % 3 === 0 ? 1 : 2, 1);
  }
  g.fillStyle = '#d99a52';
  for (let i = 0; i < 24; i++) g.fillRect((i * 13) % 32, (i * 7) % 11, 1, 1);
  const t = canvasTex(c, { repeat: true, srgb: true });
  t.repeat.set(1 / 0.13, 1 / 0.32);
  defineMat('cat_fur', new THREE.MeshStandardMaterial({ name: 'place_cat_fur', map: t, roughness: 1 }));
}

/** the cat, origin on the surface it sleeps on, curled around +Y; returns the group and its tick */
export function sleepingCat(seed = 1): { group: THREE.Group; tick(dt: number): void } {
  ensureCatMat();
  const ms = new Mesher();
  const R = 0.105, y0 = 0.068;
  // body: an arc of ~260 degrees, hips (start) fatter than the shoulders (end)
  const a0 = -0.5, a1 = 4.0;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = a0 + (a1 - a0) * (i / 10);
    const rr = R * (1 - 0.12 * (i / 10));
    pts.push(V(Math.cos(a) * rr, y0 - 0.012 * (i / 10), Math.sin(a) * rr));
  }
  tube(ms, 'cat_fur', pts, 0.074, 10, { rEnd: 0.058, samples: 16 });
  // round off the hips
  const hips = new THREE.SphereGeometry(0.074, 10, 8);
  ms.geom('cat_fur', hips, new THREE.Matrix4().makeTranslation(pts[0].x, pts[0].y, pts[0].z), 0.3);
  hips.dispose();
  // head tucked down at the end of the arc, chin on the paws
  const end = pts[pts.length - 1];
  const ha = a1 + 0.35;
  const head = new THREE.Vector3(Math.cos(ha) * R * 0.9, y0 - 0.018, Math.sin(ha) * R * 0.9);
  const hg = new THREE.SphereGeometry(0.056, 10, 8);
  hg.scale(1.08, 0.86, 1);
  ms.geom('cat_fur', hg, new THREE.Matrix4().makeTranslation(head.x, head.y, head.z), 0.3);
  hg.dispose();
  // muzzle
  const mz = new THREE.SphereGeometry(0.026, 8, 6);
  const md = new THREE.Vector3(-Math.sin(ha), 0, Math.cos(ha));
  ms.geom('cat_fur', mz, new THREE.Matrix4().makeTranslation(head.x + md.x * 0.045, head.y - 0.012, head.z + md.z * 0.045), 0.3);
  mz.dispose();
  // ears: little cones leaning back from the top of the head
  const side = new THREE.Vector3(Math.cos(ha), 0, Math.sin(ha));
  const ears = new THREE.Group();
  for (const s of [-1, 1]) {
    const em = new Mesher();
    em.pushT(0, 0, 0);
    lathe(em, 'cat_fur', [[0.02, 0], [0.012, 0.022], [0.001, 0.036]], 4);
    em.pop();
    const ear = em.build({ name: 'cat_ear' });
    ear.position.set(head.x + side.x * s * 0.03 - md.x * 0.01, head.y + 0.034, head.z + side.z * s * 0.03 - md.z * 0.01);
    ear.rotation.set(-0.35 * Math.sign(md.z || 1), 0, s * 0.3);
    ears.add(ear);
  }
  // tail: from under the hips round the outside to the nose
  const tp: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = a0 - 0.2 - (i / 8) * 2.3;
    const rr = R + 0.06 + 0.01 * Math.sin(i);
    tp.push(V(Math.cos(a) * rr, 0.02, Math.sin(a) * rr));
  }
  tube(ms, 'cat_fur', tp, 0.022, 7, { rEnd: 0.016, samples: 14 });
  void end;
  const body = ms.build({ name: 'cat_body' });
  const group = new THREE.Group();
  group.name = 'cat';
  const breathe = new THREE.Group();
  breathe.add(body, ears);
  group.add(breathe);
  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  let t = seed * 3.1, twitch = 4 + seed;
  return {
    group,
    tick(dt: number) {
      t += dt;
      const b = Math.sin(t * 1.6);
      breathe.scale.set(1 + 0.012 * b, 1 + 0.035 * b, 1 + 0.012 * b);
      twitch -= dt;
      const ear = ears.children[0];
      if (twitch < 0) { twitch = 5 + ((t * 37) % 9); }
      if (ear) ear.rotation.y = twitch < 0.25 ? Math.sin(twitch * 60) * 0.4 : 0;
    },
  };
}
