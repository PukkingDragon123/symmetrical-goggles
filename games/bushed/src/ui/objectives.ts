// What to do next, and where: drives the objective line (src/ui/objective.ts). A scripted beat (the intro) can set
// the objective directly; otherwise it follows the first source that has one (the story registers its chapter
// to-do list). Each objective can carry a target in the world; the line then says how far it is and which way to
// turn, and a small pin marks it. Ported from the author's own game หลอนยันปลายทาง
// (effective-octo-train/src/game/systems/Objectives.js).
//
//   installObjectives(game)                       once, after the stories (idempotent)
//   setObjective({ id, text, target?, steps? })   a scripted objective (null hands back to the story)
//   tickObjective(stepId) · completeObjective()   check a step / strike the line
import * as THREE from 'three';
import type { Game } from '../game/game';
import { objectiveUI, type ObjectiveStep } from './objective';
import { cineUI } from '../game/cinematic/overlay';

export type Target = THREE.Vector3 | THREE.Object3D | (() => THREE.Vector3 | null) | null;
export interface Objective {
  id: string;
  text: string;
  /** small line above (the chapter) */
  kicker?: string;
  steps?: ObjectiveStep[];
  target?: Target;
  /** within this distance (m) the hint and the pin go away: you're there */
  reach?: number;
}

/** where objectives come from when nothing is scripted, first one with an answer wins (the story adds its own) */
export const objectiveSources: ((g: Game) => Objective | null)[] = [];

let game: Game | null = null;
let scripted: Objective | null = null;
let shown: Objective | null = null;
let pendingT = 0;
let slowT = 0;
let hintT = 0;

/** a scripted objective (the intro's), or null to hand the line back to the story */
export function setObjective(o: Objective | null): void {
  scripted = o;
  slowT = 0;
}
/** the scripted objective is done: struck through, then the next one (or the story's) */
export function completeObjective(): void {
  if (shown) { objectiveUI.done(); shown = null; pendingT = 1.5; }
  scripted = null;
}
export function tickObjective(stepId: string): void {
  const st = scripted?.steps?.find((s) => s.id === stepId);
  if (st) st.done = true;
  objectiveUI.tick(stepId);
}
export function currentObjective(): Objective | null { return shown; }

const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _f = new THREE.Vector3();

function targetPos(t: Target | undefined, out: THREE.Vector3): THREE.Vector3 | null {
  if (!t) return null;
  if (typeof t === 'function') { const v = t(); return v ? out.copy(v) : null; }
  if ((t as THREE.Vector3).isVector3) return out.copy(t as THREE.Vector3);
  return (t as THREE.Object3D).getWorldPosition(out);
}

function distWords(d: number): string {
  if (d >= 1000) return `${(d / 1000).toFixed(1)} km`;
  if (d >= 100) return `${Math.round(d / 10) * 10} m`;
  return `${Math.max(1, Math.round(d / 5) * 5)} m`;
}
/** which way, from the angle off the view direction (+ = right) */
function wayWords(a: number): string {
  const s = a > 0 ? 'right' : 'left', aa = Math.abs(a);
  if (aa < 0.32) return 'ahead';
  if (aa < 1.15) return `ahead, on the ${s}`;
  if (aa < 2.0) return `to your ${s}`;
  if (aa < 2.75) return `behind you, ${s}`;
  return 'behind you';
}

function hiddenNow(g: Game): boolean {
  const gg = g as unknown as { reading?: unknown; journal: { open?: boolean }; pack: { open?: boolean } };
  return (g.mode !== 'walk' && g.mode !== 'drive') || cineUI.boxed || !!gg.journal?.open || !!gg.pack?.open || !!gg.reading;
}

const same = (a: Objective | null, b: Objective | null): boolean => !!a && !!b && a.id === b.id && a.text === b.text && a.kicker === b.kicker;

function pick(g: Game): Objective | null {
  if (scripted) return scripted;
  for (const s of objectiveSources) {
    try { const o = s(g); if (o) return o; } catch (e) { console.warn('[objectives] source', e); }
  }
  return null;
}

function update(dt: number): void {
  const g = game;
  if (!g) return;
  const hide = hiddenNow(g);
  objectiveUI.setHidden(hide);
  // a struck-through line finishes its animation before the next one comes in
  if (pendingT > 0) { pendingT -= dt; if (pendingT > 0) return; }
  slowT -= dt;
  if (slowT <= 0) {
    slowT = 0.25;
    const want = pick(g);
    if (!same(want, shown)) {
      // the story moved on (its steps only ever go forward): strike the old line first
      if (shown && want && shown.id !== want.id && !scripted) {
        objectiveUI.done(); shown = null; pendingT = 1.5; return;
      }
      shown = want;
      objectiveUI.set(want ? { id: want.id, text: want.text, kicker: want.kicker, steps: want.steps } : null);
    } else if (shown && want && want.steps) {
      for (const s of want.steps) if (s.done) objectiveUI.tick(s.id);
      shown.target = want.target;
    }
    if (shown) shown.target = want?.target ?? shown.target;
  }
  // where: the hint under the line, and the pin
  const o = shown;
  if (!o || hide) { objectiveUI.marker(null); return; }
  const p = targetPos(o.target, _p);
  const cam = g.camera;
  if (!p) { objectiveUI.hint(null); objectiveUI.marker(null); return; }
  const from = g.mode === 'drive' ? cam.position : g.player.pos;
  const dx = p.x - from.x, dz = p.z - from.z, dist = Math.hypot(dx, dz);
  if (dist < (o.reach ?? 3)) { objectiveUI.hint(null); objectiveUI.marker(null); return; }
  hintT -= dt;
  if (hintT <= 0) {
    hintT = 0.25;
    cam.getWorldDirection(_f);
    const fl = Math.hypot(_f.x, _f.z) || 1, fx = _f.x / fl, fz = _f.z / fl;
    const a = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    objectiveUI.hint(`${distWords(dist)}, ${wayWords(a)}`, a);
  }
  // the pin: on the target when it's in view, an arrow on the edge when it isn't
  _c.copy(p).project(cam);
  const W = window.innerWidth, H = window.innerHeight;
  const behind = _c.z > 1;
  let x = _c.x, y = _c.y;
  if (behind) { x = -x; y = -y; }
  if (!behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.86) {
    objectiveUI.marker({ x: (x * 0.5 + 0.5) * W, y: (-y * 0.5 + 0.5) * H - 14, dist: cam.position.distanceTo(p), off: false, angle: 0 });
    return;
  }
  // only point at it from the edge while it's well off to the side (subtle: no arrow nagging when it's just off-frame)
  const ang = Math.atan2(-y, x);
  const k = 1 / Math.max(Math.abs(Math.cos(ang)) / 0.9, Math.abs(Math.sin(ang)) / 0.82);
  objectiveUI.marker({ x: (Math.cos(ang) * k * 0.5 + 0.5) * W, y: (Math.sin(ang) * k * 0.5 + 0.5) * H, dist, off: true, angle: ang + Math.PI / 2 });
}

/** mount the objective line and start following the story (once) */
export function installObjectives(g: Game): void {
  if (game === g) return;
  game = g;
  g.lateUpdaters.push(update);
}
