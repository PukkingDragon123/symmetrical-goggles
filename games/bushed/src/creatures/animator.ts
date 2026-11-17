// Procedural clip animator. A clip writes a POSE: a local Euler rotation per bone, a root offset, and for every leg
// a foot target (an offset from the foot's rest position, model space) with an IK weight. Clips are functions of
// time (and of shared parameters such as the gait phase, so walk -> trot -> run cross-fade in step); the animator
// keeps a stack of fading layers and blends their poses. The creature applies the blended pose: spine and head by
// FK, legs by two-bone IK to their targets, so feet plant instead of skating.
export interface Pose {
  /** local Euler XYZ per bone (radians) */
  r: Float32Array;
  /** root offset (m, creature space) and root rotation (Euler XYZ) */
  t: Float32Array; rr: Float32Array;
  /** per leg: dx, dy, dz offset of the foot from rest (model space), IK weight, foot pitch (rad) */
  f: Float32Array;
  /** free channels a clip may drive (jaw, blink, eye shine, ...) */
  c: Float32Array;
}
export const FOOT = 5;
export function newPose(nb: number, nf: number, nc = 8): Pose {
  return { r: new Float32Array(nb * 3), t: new Float32Array(3), rr: new Float32Array(3), f: new Float32Array(nf * FOOT), c: new Float32Array(nc) };
}
function zero(p: Pose) { p.r.fill(0); p.t.fill(0); p.rr.fill(0); p.f.fill(0); for (let k = 3; k < p.f.length; k += FOOT) p.f[k] = 1; p.c.fill(0); }
function addScaled(o: Pose, p: Pose, w: number) {
  for (let i = 0; i < o.r.length; i++) o.r[i] += p.r[i] * w;
  for (let i = 0; i < 3; i++) { o.t[i] += p.t[i] * w; o.rr[i] += p.rr[i] * w; }
  for (let i = 0; i < o.f.length; i++) o.f[i] += p.f[i] * w;
  for (let i = 0; i < o.c.length; i++) o.c[i] += p.c[i] * w;
}
function scale(o: Pose, k: number) {
  for (let i = 0; i < o.r.length; i++) o.r[i] *= k;
  for (let i = 0; i < 3; i++) { o.t[i] *= k; o.rr[i] *= k; }
  for (let i = 0; i < o.f.length; i++) o.f[i] *= k;
  for (let i = 0; i < o.c.length; i++) o.c[i] *= k;
}

export interface AnimParams {
  /** ground speed m/s */
  speed: number;
  /** gait phase 0..1, advanced by the creature from its speed and stride */
  phase: number;
  /** look target relative to the head: yaw (+ left), pitch (+ up) */
  lookYaw: number; lookPitch: number;
  /** free inputs (excitement, fear, ...) */
  [k: string]: number;
}
export interface Clip {
  /** looping clips run forever; one-shots run `dur` seconds then hand over to `next` (or hold their last frame) */
  loop: boolean; dur: number;
  fn: (p: Pose, t: number, a: AnimParams) => void;
  next?: string;
  /** default cross-fade time into this clip */
  fade?: number;
}
interface Layer { name: string; clip: Clip; t: number; w: number; target: number; rate: number; pose: Pose }

export class Animator {
  readonly clips: Record<string, Clip>;
  private layers: Layer[] = [];
  readonly out: Pose;
  /** the clip that is fading in (or playing) now */
  current = '';
  /** seconds the current clip has played */
  time = 0;
  constructor(clips: Record<string, Clip>, private nb: number, private nf: number, private nc = 8) {
    this.clips = clips;
    this.out = newPose(nb, nf, nc);
  }
  /** start a clip (no-op if it is already the current one, unless restart) */
  play(name: string, o: { fade?: number; restart?: boolean } = {}) {
    const clip = this.clips[name];
    if (!clip) throw new Error('no clip ' + name);
    if (name === this.current && !o.restart) return;
    const fade = Math.max(0.01, o.fade ?? clip.fade ?? 0.3);
    for (const l of this.layers) { l.target = 0; l.rate = 1 / fade; }
    const reuse = !o.restart ? this.layers.find((l) => l.name === name) : undefined;
    if (reuse) { reuse.target = 1; reuse.rate = 1 / fade; this.layers.splice(this.layers.indexOf(reuse), 1); this.layers.push(reuse); }
    else this.layers.push({ name, clip, t: 0, w: this.layers.length ? 0 : 1, target: 1, rate: 1 / fade, pose: newPose(this.nb, this.nf, this.nc) });
    this.current = name; this.time = reuse ? reuse.t : 0;
  }
  /** a one-shot finished and is holding (or handed over) */
  get done(): boolean { const l = this.layers[this.layers.length - 1]; return !!l && !l.clip.loop && l.t >= l.clip.dur; }
  update(dt: number, a: AnimParams): Pose {
    const top = this.layers[this.layers.length - 1];
    if (top && !top.clip.loop && top.t >= top.clip.dur && top.clip.next) this.play(top.clip.next);
    for (const l of this.layers) {
      l.t += dt;
      const d = l.target - l.w, s = l.rate * dt;
      l.w = Math.abs(d) <= s ? l.target : l.w + Math.sign(d) * s;
    }
    this.layers = this.layers.filter((l) => l.w > 0 || l.target > 0);
    zero(this.out);
    scale(this.out, 0);
    let tot = 0;
    for (const l of this.layers) {
      if (l.w <= 0) continue;
      zero(l.pose);
      const t = l.clip.loop ? l.t : Math.min(l.t, l.clip.dur);
      l.clip.fn(l.pose, t, a);
      // smootherstep weights: cross-fades ease in and out
      const w = l.w * l.w * (3 - 2 * l.w);
      addScaled(this.out, l.pose, w); tot += w;
    }
    if (tot > 0) scale(this.out, 1 / tot);
    this.time = top ? top.t : 0;
    return this.out;
  }
}

// ------------------------------------------------------------------------------------------------ clip helpers
export const TAU = Math.PI * 2;
export const sin = Math.sin, cos = Math.cos;
/** 0..1 ease in-out */
export const ease = (x: number) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
/** a pulse that rises over [a, b] and falls over [c, d] (seconds) */
export const env = (t: number, a: number, b: number, c: number, d: number) => (t < a ? 0 : t < b ? ease((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - ease((t - c) / (d - c)) : 0);
/** smooth pseudo-random wander in -1..1 (sum of incommensurate sines) */
export const wander = (t: number, s = 0) => (sin(t * 0.73 + s) * 0.5 + sin(t * 1.31 + s * 2.1) * 0.3 + sin(t * 2.17 + s * 0.7) * 0.2);
/** a step foot cycle: stance (the foot slides back on the ground) then swing (lifted forward on an arc).
 *  Returns [dz (-1 back .. +1 front), lift 0..1] for a phase 0..1 and duty factor */
export function footCycle(ph: number, duty: number): [number, number] {
  ph = ((ph % 1) + 1) % 1;
  if (ph < duty) { const s = ph / duty; return [1 - 2 * s, 0]; }
  const s = (ph - duty) / (1 - duty), e = s * s * (3 - 2 * s);
  return [-1 + 2 * e, Math.sin(Math.PI * s) * (1 - 0.25 * s)];
}
