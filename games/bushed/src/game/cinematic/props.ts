// The opening's set dressing: the will and Pépère's letter on the passenger seat (with the notary's envelope),
// the KETTLE LAKE township sign by the highway (built once, it stays in the world), and somebody at the wheel for
// the shots from outside and from the back seat.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Block } from '../../ui/paper';
import { paintPaper, paperMesh } from '../../ui/paper';
import { canvasTex } from '../../gfx/tex';
import { Mesher, logAB, extrude, V } from '../../places/kit';
import { heightAt, roadPointAt } from '../../world/layout';
import { solidBox } from '../stories/kit';
import { WILL } from '../stories/text';
import { buildHuman, makeLook, type HumanModel } from '../../humans';
import type { VehicleLike } from './pilot';

// ---------------------------------------------------------------------------------------------- the will
const LETTER_FACE: Block[] = [
  { t: 'h', text: 'Kid —', hand: 'caveat' },
  { t: 'p', text: 'If the notary found you, I\'m gone, and the old place is yours.', hand: 'caveat' },
  { t: 'p', text: 'Go see my friends at Pruneau\'s.', hand: 'caveat' },
  { t: 'sig', text: '— Pépère', hand: 'caveat' },
];

/** the frame the seat lives in (the truck's sprung cab, which rolls and pitches; the Jeep's root) */
export const cabOf = (v: VehicleLike): THREE.Object3D => v.seat?.parent ?? v.root;

let seatProps: THREE.Group | null = null;
/** the will, the letter and the notary's envelope, lying on the passenger seat (cab-local) */
export function willOnSeat(v: VehicleLike): THREE.Group {
  if (seatProps) { cabOf(v).add(seatProps); return seatProps; }
  const g = new THREE.Group();
  g.name = 'will_on_seat';
  const env = paperMesh(paintPaper([{ t: 'gap', h: 120 }, { t: 'p', text: 'Me Lucie Gagné, notaire', hand: 'type' }, { t: 'small', text: '8, rue Front, Hearst ON', hand: 'type' }], { style: 'kraft', w: 256, h: 180, seed: 901 }), 0.24);
  env.rotation.set(-Math.PI / 2, 0, 0.22); env.position.set(0.02, 0.0, 0.03);
  const will = paperMesh(paintPaper(WILL, { style: 'notice', seed: 902 }), 0.2);
  will.rotation.set(-Math.PI / 2, 0, -0.12); will.position.set(-0.01, 0.006, -0.02);
  const letter = paperMesh(paintPaper(LETTER_FACE, { style: 'notebook', w: 256, h: 300, seed: 903 }), 0.15);
  letter.rotation.set(-Math.PI / 2, 0, 0.35); letter.position.set(0.06, 0.012, 0.06);
  g.add(env, will, letter);
  // the passenger seat: the driver's seat mirrored across the cab, a little below the driver's eye line
  const seat = v.seat?.position ?? new THREE.Vector3(0.33, 1.5, -0.35);
  g.position.set(-seat.x * 1.05, seat.y - 0.66, seat.z + 0.02);
  g.rotation.y = Math.PI;   // reads from the driver's side
  cabOf(v).add(g);
  seatProps = g;
  return g;
}
export function removeWill(): void { seatProps?.removeFromParent(); }
/** where the will lies, cab-local (for framing the insert) */
export function willLocal(v: VehicleLike, out = new THREE.Vector3()): THREE.Vector3 {
  const seat = v.seat?.position ?? new THREE.Vector3(0.33, 1.5, -0.35);
  return out.set(-seat.x * 1.05, seat.y - 0.66, seat.z + 0.02);
}

// ---------------------------------------------------------------------------------------------- the driver
let driver: HumanModel | null = null;
/** you, at the wheel (for the shots that see the cab from outside or from behind): sat on the driver's seat */
export function driverIn(v: VehicleLike): HumanModel | null {
  try {
    if (!driver) {
      driver = buildHuman(makeLook('player'), { lazy: false });
      driver.anim.play('sit');
      driver.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    }
    const seat = v.seat?.position ?? new THREE.Vector3(0.33, 1.5, -0.35);
    // eyes ~0.72 m over the hips, hips 0.47 m over the feet in the sit pose
    driver.root.position.set(seat.x, seat.y - 1.2, seat.z - 0.1);
    driver.root.rotation.set(0, 0, 0);
    cabOf(v).add(driver.root);
    driver.root.visible = true;
    return driver;
  } catch (e) { console.warn('[cine] driver', e); return null; }
}
export function tickDriver(dt: number): void { if (driver?.root.parent) driver.anim.update(dt); }
export function removeDriver(): void { driver?.root.removeFromParent(); }
/** hide the driver while the camera sits in his head */
export function setDriverVisible(v: boolean): void { if (driver) driver.root.visible = v; }

// ---------------------------------------------------------------------------------------------- the sign
/** a routed township sign, painted: cream letters cut into dark stained boards, lichen, two old bullet holes */
function signFace(): HTMLCanvasElement {
  const W = 512, H = 200;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // stained boards, three planks with grain and seams
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let p = 0; p < 3; p++) {
    const y0 = Math.round((p * H) / 3), y1 = Math.round(((p + 1) * H) / 3);
    const base = [62 + p * 4, 54 + p * 3, 40 + p * 2];
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x += 2) {
      const grain = Math.sin(x * 0.045 + Math.sin(y * 0.21 + p * 3) * 2.2 + p) * 7 + Math.sin(x * 0.31 + y * 0.9) * 2;
      const n = grain + (rnd() - 0.5) * 9;
      g.fillStyle = `rgb(${base[0] + n | 0},${base[1] + n * 0.9 | 0},${base[2] + n * 0.7 | 0})`;
      g.fillRect(x, y, 2, 1);
    }
    g.fillStyle = 'rgba(12,8,4,0.85)'; g.fillRect(0, y1 - 2, W, 2);
  }
  // weathering: the sun-bleached top, a darker drip line under the lettering
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(210,190,150,0.16)'); grad.addColorStop(0.5, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // routed letters: a dark cut shadow, then the cream paint, chipped
  const routed = (text: string, x: number, y: number, size: number, spacing: number) => {
    g.font = `${size}px Alagard, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
    g.fillStyle = 'rgba(14,9,5,0.95)'; g.fillText(text, x + 2, y + 2);
    g.fillStyle = '#e9dcb6'; g.fillText(text, x, y);
  };
  routed('TOWNSHIP OF  •  CANTON DE', W / 2, 30, 20, 3);
  routed('KETTLE LAKE', W / 2, 98, 74, 6);
  routed('POP. 41', W / 2, 166, 22, 4);
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
  // chips in the paint, lichen on the bottom edge, two bullet holes (it's the north)
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${40 + rnd() * 30 | 0},${32 + rnd() * 20 | 0},${22 + rnd() * 12 | 0},${0.5 + rnd() * 0.4})`; g.fillRect(rnd() * W | 0, rnd() * H | 0, 1 + (rnd() * 3 | 0), 1 + (rnd() * 2 | 0)); }
  for (let i = 0; i < 90; i++) { const x = rnd() * W, y = H - rnd() * rnd() * 46; g.fillStyle = `rgba(${150 + rnd() * 40 | 0},${160 + rnd() * 30 | 0},${100 + rnd() * 30 | 0},${0.35 + rnd() * 0.4})`; g.fillRect(x | 0, y | 0, 2 + (rnd() * 4 | 0), 2 + (rnd() * 3 | 0)); }
  for (const [hx, hy] of [[392, 70], [404, 140]]) {
    g.fillStyle = 'rgba(200,180,140,0.55)'; g.beginPath(); g.arc(hx, hy, 6, 0, 7); g.fill();
    g.fillStyle = '#0b0805'; g.beginPath(); g.arc(hx, hy, 3.4, 0, 7); g.fill();
  }
  return c;
}

let sign: { group: THREE.Group; pos: THREE.Vector3; face: THREE.Vector3; t: number } | null = null;
/** the KETTLE LAKE sign on the right shoulder of the highway, facing the traffic coming east (built once) */
export function kettleSign(g: Game): { group: THREE.Group; pos: THREE.Vector3; face: THREE.Vector3; t: number } {
  if (sign) return sign;
  const t = 620;
  const rp = roadPointAt('highway', t);
  const dx = Math.sin(rp.dir), dz = Math.cos(rp.dir);
  // right of travel is (-dz, dx) rotated: with +X east and +Z south, right of (dx, dz) is (-dz, dx)
  const rx = -dz, rz = dx;
  const x = rp.x + rx * 6.4, z = rp.z + rz * 6.4;
  const y = heightAt(x, z);
  const grp = new THREE.Group();
  grp.name = 'kettle_sign';
  grp.position.set(x, y, z);
  // the board faces back down the road, turned a little toward it
  const yaw = rp.dir + Math.PI - 0.38;
  grp.rotation.y = yaw;
  const ms = new Mesher();
  const w = 2.5, h = 0.98, base = 1.05;
  for (const sx of [-1, 1]) logAB(ms, V(sx * (w / 2 - 0.28), -0.4, -0.07), V(sx * (w / 2 - 0.28) + sx * 0.01, base + h + 0.16, -0.07), 0.085, { seed: 71 + sx, capB: 1 });
  // the board: a slab with chamfered corners and a slightly crooked top, routed face in front
  const sh = new THREE.Shape();
  const c = 0.06;
  sh.moveTo(-w / 2 + c, 0); sh.lineTo(w / 2 - c, 0); sh.lineTo(w / 2, c); sh.lineTo(w / 2, h - c - 0.01); sh.lineTo(w / 2 - c, h - 0.01);
  sh.lineTo(0.3, h + 0.008); sh.lineTo(-w / 2 + c, h); sh.lineTo(-w / 2, h - c); sh.lineTo(-w / 2, c); sh.closePath();
  ms.pushT(0, base, -0.045);
  extrude(ms, 'board_dark', sh, 0.045, { bevel: 0.006, sideMat: 'board_dark' });
  ms.pop();
  // a little roof plank over it, as township signs have
  ms.pushT(0, base + h + 0.05, -0.03, 0, 0.22);
  extrude(ms, 'board_grey', (() => { const r = new THREE.Shape(); r.moveTo(-w / 2 - 0.12, -0.02); r.lineTo(w / 2 + 0.12, -0.02); r.lineTo(w / 2 + 0.1, 0.02); r.lineTo(-w / 2 - 0.1, 0.02); r.closePath(); return r; })(), 0.2, { bevel: 0.004 });
  ms.pop();
  grp.add(ms.build({ name: 'kettle_sign_wood' }));
  const faceGeo = new THREE.ShapeGeometry(sh, 6);
  const uv = faceGeo.getAttribute('uv') as THREE.BufferAttribute, pp = faceGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + w / 2) / w, pp.getY(i) / h);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: canvasTex(signFace()), roughness: 0.88 }));
  face.position.set(0, base, 0.008);
  face.castShadow = face.receiveShadow = true;
  grp.add(face);
  grp.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.scene.add(grp);
  // posts are solid (the truck stops, it doesn't ghost through)
  for (const sx of [-1, 1]) {
    const p = new THREE.Vector3(sx * (w / 2 - 0.28), 0, -0.07).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(grp.position);
    solidBox(new THREE.Vector3(p.x, y + 0.9, p.z), [0.09, 0.9, 0.09], yaw);
  }
  const centre = new THREE.Vector3(x, y + base + h / 2, z);
  const facing = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  sign = { group: grp, pos: centre, face: facing, t };
  return sign;
}
