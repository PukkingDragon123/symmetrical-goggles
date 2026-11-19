// The Book of Cryptids (public API). See book.ts for the class, bestiary.ts for the data, portrait.ts for plates.
//
//   import { BookOfCryptids, install } from '../ui/bookofcryptids';
//   readonly journal = new BookOfCryptids();     // drop-in for Journal
//   install(game);                               // once the arms and critters exist (see install below)
import * as THREE from 'three';
import { BookOfCryptids } from './book';
import { setPortraitRenderer } from './portrait';
import { canonical, entries } from './bestiary';
import './sources';

export { BookOfCryptids, SPEAKER, type ObserveData } from './book';
export { registerPortraitModel, setPortraitRenderer } from './portrait';
export { FIELD, entries, type FieldEntry, type Entry } from './bestiary';

/** how near (m) a cryptid must be for the Book to taste it, by id (default 24) */
export const TASTE_RANGE: Record<string, number> = { bigfoot: 45, granny: 30, hidebehind: 30, agropelter: 30, dingbat: 16 };

interface ArmsInternals {
  held: string;
  eye: THREE.Vector3;
  setHeld(kind: string, obj?: THREE.Object3D): void;
  buildHeldPose(p: unknown): void;
  free(p: unknown, side: 'L' | 'R', pos: THREE.Vector3, f: THREE.Vector3, n: THREE.Vector3, grip: number[]): void;
  __bookPose?: boolean;
}

/**
 * Hook the book into a running game (call once, after the arms and critters exist; safe to call again):
 *  - its speech floats above it (a speaker named "The Book" anchored to the main camera)
 *  - plate portraits render through the game's renderer; tastings are dated with the game day
 *  - while open, the FP arms hold it by both covers (a 'book' held pose patched onto FPArms), and the previous
 *    held item comes back when it shuts
 *  - while open, a cryptid in front of you and in range is tasted (observe) after a moment of holding it there
 * Returns a function that removes the per-frame hook.
 */
export function install(game: any, book: BookOfCryptids = game.journal): () => void {
  if (!(book instanceof BookOfCryptids)) return () => undefined;
  book.attach({ camera: game.camera, viewCam: game.viewCam });
  if (game.R?.gl) setPortraitRenderer(game.R.gl);
  bookPose(game.arms, book);
  let prevHeld: string | null = null, holding = false;
  book.onOpenChange = (open) => {
    const arms = game.arms as ArmsInternals | null;
    if (!arms || game.hands?.busy) return;
    if (open) { prevHeld = game.hands?.heldItem || null; holding = true; arms.setHeld('book'); }
    else if (holding) { holding = false; try { game.hands?.equip(prevHeld); } catch { arms.setHeld('none'); } }
  };
  const tasteT = new Map<string, number>();
  const list = () => entries();
  const v = new THREE.Vector3(), fwd = new THREE.Vector3();
  const tick = (dt: number) => {
    book.day = game.day ?? 0;
    if (!book.open || !game.critters) { book.tasting = 0; return; }
    const cam = game.camera as THREE.PerspectiveCamera;
    cam.getWorldDirection(fwd);
    let best: { id: string; obj: THREE.Object3D; ang: number; d: number } | null = null;
    const L = list();
    for (const [key, val] of Object.entries(game.critters as Record<string, unknown>)) {
      const c = val as { object?: THREE.Object3D; fade?: { value: number } } | null;
      const obj = c?.object;
      if (!obj || !(obj instanceof THREE.Object3D)) continue;
      const id = canonical(L, key) ?? canonical(L, key.replace(/s$/, ''));
      if (!id) continue;
      if (!visibleInWorld(obj) || (c.fade && c.fade.value < 0.3)) continue;
      obj.getWorldPosition(v); v.y += 0.6;
      const d = v.distanceTo(cam.position);
      if (d > (TASTE_RANGE[id] ?? 24)) continue;
      const ang = fwd.angleTo(v.clone().sub(cam.position));
      if (ang > 0.3) continue;
      if (!best || ang < best.ang) best = { id, obj, ang, d };
    }
    if (!best) { book.tasting = Math.max(0, book.tasting - dt * 2); tasteT.clear(); return; }
    // the eyes go to it, the tongue tastes the air; after a moment it is in the book
    const vp = best.obj.getWorldPosition(new THREE.Vector3()).applyMatrix4(cam.matrixWorldInverse);
    book.look(vp, 0.4);
    if (book.tastedIt(best.id)) { book.tasting = 0; return; }
    const t = (tasteT.get(best.id) ?? 0) + dt;
    tasteT.set(best.id, t);
    book.tasting = Math.min(1, t / 1.4);
    if (t > 1.4) { tasteT.delete(best.id); book.observe(best.id, { dist: best.d }); }
  };
  game.updaters?.push(tick);
  return () => { const i = game.updaters?.indexOf(tick) ?? -1; if (i >= 0) game.updaters.splice(i, 1); };
}

function visibleInWorld(o: THREE.Object3D): boolean { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; }

/**
 * Teach FPArms a 'book' held pose: both hands under the outer edges of the boards, thumbs over the pages,
 * following the book as it breathes and moves (the book publishes its hand targets every frame). Patched at
 * runtime so src/player/arms.ts stays untouched; the integrator may fold this into arms.ts as a real case.
 */
export function bookPose(arms: unknown, book?: BookOfCryptids): void {
  const a = arms as ArmsInternals | null;
  if (!a || a.__bookPose || typeof a.buildHeldPose !== 'function' || typeof a.free !== 'function') return;
  a.__bookPose = true;
  if (book) current = book;
  const orig = a.buildHeldPose.bind(a);
  const toBody = (p: THREE.Vector3) => new THREE.Vector3(-p.x, p.y, -p.z).add(a.eye);
  const dirBody = (d: THREE.Vector3) => new THREE.Vector3(-d.x, d.y, -d.z).normalize();
  const GRIP = [0.3, 0.26, 0.62, 0.06, 0.25];
  a.buildHeldPose = (p: unknown) => {
    orig(p);
    if (a.held !== 'book') return;
    const b = book ?? current;
    if (!b) return;
    const H = b.hands;
    // left hand: fingers in under the board, pointing in and up the page; palm against the back of the board
    const fL = H.x.clone().multiplyScalar(0.75).addScaledVector(H.z, -0.45).addScaledVector(H.n, -0.2);
    const fR = H.x.clone().multiplyScalar(-0.75).addScaledVector(H.z, -0.45).addScaledVector(H.n, -0.2);
    a.free(p, 'L', toBody(H.L), dirBody(fL), dirBody(H.n.clone().addScaledVector(H.x, 0.35)), GRIP);
    a.free(p, 'R', toBody(H.R), dirBody(fR), dirBody(H.n.clone().addScaledVector(H.x, -0.35)), GRIP);
  };
}

let current: BookOfCryptids | null = null;
