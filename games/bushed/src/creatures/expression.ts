// EXPRESSIONS: a small face system shared by BUSHED's creatures. A creature sets a mood from its AI state (happy,
// joy, angry, scared, curious, pleading, sad, sleepy, eating); the Expression blends the moods' face presets with
// smooth cross-fades, blinks on its own (faster when scared, slow and heavy when sleepy), adds the little life a face
// has (ear twitches, a brow flicker when the mood changes, a curious head tilt that drifts side to side) and
// returns face channels the creature maps onto its own bones (lids, brows, ears, lips, jaw, tongue, head tilt).
// A Dangle is secondary motion for a hanging part (floppy ears, a shawl's corner, jowls): an angular spring that
// lags the part's root and hangs toward the ground.
//   const face = new Expression({ seed: 3 });
//   face.set(this.state === 'companion' ? 'happy' : 'neutral');
//   const f = face.update(dt);           // f.blink, f.lid, f.squint, f.brow, f.browIn, f.ear, f.lip, f.smile, f.jaw, f.tongue, f.tilt
import * as THREE from 'three';

export type Mood = 'neutral' | 'happy' | 'joy' | 'angry' | 'scared' | 'curious' | 'pleading' | 'sad' | 'sleepy' | 'eating';
export const MOODS: Mood[] = ['neutral', 'happy', 'joy', 'angry', 'scared', 'curious', 'pleading', 'sad', 'sleepy', 'eating'];
export interface Face {
  /** 0 open .. 1 shut: the automatic blink (lids add it to `lid`) */
  blink: number;
  /** upper lids lowered 0..1 (sleepy, smug, a happy squint's top half) */
  lid: number;
  /** lower lids / cheeks pushed up 0..1 (the happy squint) */
  squint: number;
  /** brows -1 lowered (a scowl) .. +1 raised (surprise) */
  brow: number;
  /** brows' inner ends: +1 up (worried, pleading puppy eyes) .. -1 down (anger) */
  browIn: number;
  /** ears -1 pinned back flat .. 0 rest .. +1 perked forward */
  ear: number;
  /** a snarl: lips curled off the teeth 0..1 */
  lip: number;
  /** mouth corners up 0..1 */
  smile: number;
  /** jaw open 0..1 (a pant, a gape) */
  jaw: number;
  /** tongue out 0..1 */
  tongue: number;
  /** head tilt -1..1 (curious) */
  tilt: number;
  /** pupils 0 pinned .. 1 wide (night, joy, fear) */
  pupil: number;
}
const ZERO: Face = { blink: 0, lid: 0, squint: 0, brow: 0, browIn: 0, ear: 0, lip: 0, smile: 0, jaw: 0, tongue: 0, tilt: 0, pupil: 0.5 };
const KEYS = Object.keys(ZERO) as (keyof Face)[];
/** the face of each mood (channels left out stay at rest) */
export const PRESETS: Record<Mood, Partial<Face>> = {
  neutral: {},
  happy: { lid: 0.12, squint: 0.35, brow: 0.25, browIn: 0.1, ear: 0.15, smile: 0.8, jaw: 0.3, tongue: 0.75, pupil: 0.7 },
  joy: { lid: 0.3, squint: 0.85, brow: 0.55, browIn: 0.2, ear: 0.45, smile: 1, jaw: 0.45, tongue: 1, pupil: 0.9 },
  angry: { lid: 0.32, squint: 0.15, brow: -1, browIn: -1, ear: -0.85, lip: 1, jaw: 0.18, pupil: 0.15 },
  scared: { brow: 0.85, browIn: 0.85, ear: -1, lip: 0.15, jaw: 0.05, pupil: 1 },
  curious: { brow: 0.65, browIn: 0.15, ear: 0.9, tilt: 0.55, pupil: 0.8 },
  pleading: { brow: 0.45, browIn: 1, ear: -0.25, tilt: 0.35, pupil: 1, smile: 0.2 },
  sad: { lid: 0.35, brow: 0.05, browIn: 0.9, ear: -0.65, pupil: 0.6 },
  sleepy: { lid: 0.85, squint: 0.2, brow: -0.15, ear: -0.35, pupil: 0.3 },
  eating: { lid: 0.2, squint: 0.55, brow: 0.3, browIn: 0.1, ear: 0.2, smile: 0.5, pupil: 0.7 },
};

export class Expression {
  /** the mood being blended toward */
  mood: Mood = 'neutral';
  /** the face after update() */
  readonly face: Face = { ...ZERO };
  /** blend weights per mood */
  readonly w: Record<Mood, number>;
  /** cross-fade rate (1/s) */
  rate: number;
  private k = 1; private t = 0; private blinkT: number; private blinkDur = 0.16; private blinkA = 0;
  private twitchT = 0; private twitch = 0; private flick = 0; private seed: number; private tiltSide = 1; private tiltT = 0;
  private hold: Partial<Face> = {}; private holdT = 0;
  constructor(o: { seed?: number; rate?: number; mood?: Mood } = {}) {
    this.seed = o.seed ?? 1; this.rate = o.rate ?? 5;
    this.w = Object.fromEntries(MOODS.map((m) => [m, m === (o.mood ?? 'neutral') ? 1 : 0])) as Record<Mood, number>;
    this.mood = o.mood ?? 'neutral';
    this.blinkT = 1 + rnd(this.seed) * 3;
  }
  /** blend toward a mood (intensity 0..1) */
  set(mood: Mood, k = 1) {
    if (mood !== this.mood) { this.flick = 1; if (mood === 'curious') this.tiltSide = rnd(this.seed + this.t) < 0.5 ? 1 : -1; }
    this.mood = mood; this.k = Math.max(0, Math.min(1, k));
  }
  /** hold some channels for a while on top of the mood (a yawn, a lick, a bark's gape) */
  pulse(f: Partial<Face>, seconds: number) { this.hold = f; this.holdT = seconds; }
  /** a blink now */
  blinkNow() { this.blinkA = this.blinkDur; }
  update(dt: number): Face {
    this.t += dt;
    const a = 1 - Math.exp(-this.rate * dt);
    let tot = 0;
    for (const m of MOODS) { const tgt = m === this.mood ? this.k : 0; this.w[m] += (tgt - this.w[m]) * a; tot += this.w[m]; }
    const f = this.face;
    for (const key of KEYS) {
      // the rest of the weight (intensity < 1) sits at rest
      let v = ZERO[key] * Math.max(0, 1 - tot);
      for (const m of MOODS) if (this.w[m] > 1e-4) v += (PRESETS[m][key] ?? ZERO[key]) * this.w[m];
      f[key] = v;
    }
    // held channels
    if (this.holdT > 0) { this.holdT -= dt; const e = Math.min(1, this.holdT * 4); for (const key of Object.keys(this.hold) as (keyof Face)[]) f[key] += (this.hold[key]! - f[key]) * e; }
    // blinking: every few seconds (scared: often; sleepy: slow and heavy), now and then a double blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      const scared = this.w.scared, sleepy = this.w.sleepy;
      this.blinkDur = 0.14 + sleepy * 0.35;
      this.blinkA = this.blinkDur;
      // now and then a double blink
      this.blinkT = rnd(this.t * 3.1 + this.seed) < 0.16 ? 0.32 : (2.2 + rnd(this.seed * 7 + this.t) * 3.8) * (1 - scared * 0.6);
    }
    this.blinkA = Math.max(0, this.blinkA - dt);
    f.blink = this.blinkA > 0 ? Math.sin((1 - this.blinkA / this.blinkDur) * Math.PI) : 0;
    // ears twitch now and then (a fly, a sound)
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitchT = 2 + rnd(this.seed * 13 + this.t) * 6; this.twitch = 1; }
    this.twitch = Math.max(0, this.twitch - dt * 5);
    f.ear += this.twitch * Math.sin(this.twitch * 18) * 0.25;
    // a brow flicker as a new mood comes on
    this.flick = Math.max(0, this.flick - dt * 3);
    f.brow += this.flick * 0.25 * (this.mood === 'angry' ? -1 : 1);
    // the curious tilt drifts to one side, then the other
    this.tiltT += dt;
    if (this.tiltT > 2.5 + rnd(this.seed + Math.floor(this.t)) * 2.5) { this.tiltT = 0; this.tiltSide = -this.tiltSide; }
    f.tilt *= this.tiltSide;
    return f;
  }
}

/** secondary motion for a hanging part: pitch (about x, + swings the tip back) and roll (about z, + swings it to +x)
 *  that lag the root's acceleration and hang toward the ground, on an angular spring */
export class Dangle {
  pitch = 0; roll = 0;
  private vp = 0; private vr = 0; private prev = new THREE.Vector3(); private vel = new THREE.Vector3(); private acc = new THREE.Vector3(); private init = false;
  /** hz: spring rate; zeta: damping ratio; k: radians per m/s^2; hang: 0 stiff .. 1 hangs fully to gravity; max: radians */
  constructor(public hz = 2.6, public zeta = 0.22, public k = 0.05, public hang = 0.6, public max = 1.1) {}
  /** worldPos: the root's world position now; parentQ: the world rotation of the frame the part hangs in */
  update(dt: number, worldPos: THREE.Vector3, parentQ: THREE.Quaternion): [number, number] {
    if (dt <= 0) return [this.pitch, this.roll];
    if (!this.init) { this.prev.copy(worldPos); this.init = true; return [this.pitch, this.roll]; }
    const v = _a.copy(worldPos).sub(this.prev).multiplyScalar(1 / dt);
    const acc = _b.copy(v).sub(this.vel).multiplyScalar(1 / dt);
    if (acc.lengthSq() > 3600) acc.setLength(60);
    this.acc.lerp(acc, 1 - Math.exp(-20 * dt));
    this.vel.copy(v); this.prev.copy(worldPos);
    _q.copy(parentQ).invert();
    const al = _b.copy(this.acc).applyQuaternion(_q), g = _c.set(0, -1, 0).applyQuaternion(_q);
    // hang toward the ground, thrown by the acceleration
    const tp = Math.atan2(-g.z, -g.y) * this.hang + al.z * this.k, tr = Math.atan2(g.x, -g.y) * this.hang - al.x * this.k;
    const w = Math.PI * 2 * this.hz, w2 = w * w;
    this.vp += (w2 * (tp - this.pitch) - 2 * this.zeta * w * this.vp) * dt; this.pitch += this.vp * dt;
    this.vr += (w2 * (tr - this.roll) - 2 * this.zeta * w * this.vr) * dt; this.roll += this.vr * dt;
    this.pitch = Math.max(-this.max, Math.min(this.max, this.pitch)); this.roll = Math.max(-this.max, Math.min(this.max, this.roll));
    return [this.pitch, this.roll];
  }
  /** a flick (a head shake): angular velocity in rad/s */
  kick(p: number, r: number) { this.vp += p; this.vr += r; }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
function rnd(x: number) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
