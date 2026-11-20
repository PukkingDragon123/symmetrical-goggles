// NPC animation on the Gacha Garage human: GG's procedural body does the work (speed-driven walk with IK-planted
// feet, idle breathing / weight shifts / glances / fidgets, look-at, painted expressions with blinks, eye darts and a
// talking mouth, blended arm-IK gestures); this layer maps BUSHED's NPC clips onto it.
//
// Clips: idle, walk (gait from the root's real speed, so the feet never slide), talk (GG talking gestures), point,
// wave, lean (on a counter), count (money), flinch (startled, one-shot, then idle), sit (on a log), chop (an axe in
// the fist, emits 'impact'), warm (hands at a fire). Talking (anim.talking = true) moves the mouth and nods while any
// clip plays; standing idle it also talks with the hands.
import * as THREE from 'three';
import type { Human } from './gg/Human';
import { CHOP_T, CHOP_IMPACT } from './gg/poses';

export type NpcAnim = 'idle' | 'walk' | 'talk' | 'point' | 'wave' | 'lean' | 'count' | 'flinch' | 'sit' | 'chop' | 'warm';
export const NPC_ANIMS: NpcAnim[] = ['idle', 'walk', 'talk', 'point', 'wave', 'lean', 'count', 'flinch', 'sit', 'chop', 'warm'];
export type NpcEvent = 'impact' | 'flinch_end';

/** the GG gesture each held clip plays (null: none) */
const GESTURE: Record<NpcAnim, string | null> = {
  idle: null, walk: null, talk: 'talk', point: 'point', wave: 'wave', lean: 'lean', count: 'count', flinch: 'flinch', sit: 'sit', chop: 'chop', warm: 'warm',
};

export class NpcAnimator {
  /** the clip playing */
  state: NpcAnim = 'idle';
  /** mouth moves and the head nods (any clip); idle it talks with the hands too */
  talking = false;
  /** walking speed (m/s) used when 'walk' plays but the root is not moving (preview pages) */
  walkSpeed = 1.25;
  private target = new THREE.Vector3();
  private hasTarget = false;
  private listeners: ((ev: NpcEvent) => void)[] = [];
  private prev = new THREE.Vector3();
  private hasPrev = false;
  private speed = 0;
  private chopPrev = 0;
  private talkT = 0;
  private time = 0;

  constructor(readonly human: Human) {}

  /** gait phase 0..1 (left heel strike at 0, right at 0.5) */
  get phase(): number { return this.human.phase; }
  set phase(v: number) { this.human.phase = ((v % 1) + 1) % 1; }

  /** play a clip (crossfaded by GG's gesture springs); replaying the current one does nothing */
  play(name: NpcAnim, opts: { fade?: number; restart?: boolean } = {}) {
    if (name === this.state && !opts.restart) return;
    this.state = name;
    const h = this.human, g = GESTURE[name];
    h.clearGesture();
    if (g) h.gesture(g, name === 'flinch' ? {} : { hold: true });
    if (name === 'flinch') h.setExpression('surprised', 1.4);
  }

  /** turn the head and eyes toward a world point (null: look about freely) */
  lookAt(p: THREE.Vector3 | null) {
    if (p) { this.target.copy(p); this.hasTarget = true; } else this.hasTarget = false;
  }

  /** a face: 'neutral', 'smile', 'happy', 'surprised', 'sad', 'angry', 'sleepy', 'grin', 'cool', 'wince' (hold 0 = until changed) */
  expression(name: string, hold = 0) { this.human.setExpression(name, hold); }

  onEvent(cb: (ev: NpcEvent) => void) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((l) => l !== cb); }; }
  private emit(ev: NpcEvent) { for (const l of this.listeners) l(ev); }

  update(dt: number) {
    const h = this.human, root = h.root;
    this.time += dt;
    // the root's real horizontal speed drives the gait (no foot sliding); in place, the nominal walk speed
    if (dt > 0) {
      if (this.hasPrev) {
        const d = Math.hypot(root.position.x - this.prev.x, root.position.z - this.prev.z) / dt;
        this.speed += (Math.min(d, 6) - this.speed) * Math.min(1, dt * 10);
      }
      this.prev.copy(root.position); this.hasPrev = true;
    }
    const walking = this.state === 'walk';
    const speed = walking ? (this.speed > 0.15 ? this.speed : this.walkSpeed) : 0;
    // talking with the hands while standing around
    if (this.talking && this.state === 'idle') {
      this.talkT -= dt;
      if (this.talkT <= 0) { this.talkT = 2.4 + Math.random() * 2; h.gesture(Math.random() < 0.7 ? 'talk' : 'explain', { dur: 2.2 }); }
    } else this.talkT = 0.4;
    h.update(dt, { speed, lookAt: this.hasTarget ? this.target : null, talking: this.talking });
    // events
    if (this.state === 'chop' || this.state === 'flinch') {
      let g = null;
      for (const x of h.gestures) if (x.name === this.state && !x.out) g = x;
      if (this.state === 'chop' && g) { const u = g.t % CHOP_T; if (this.chopPrev < CHOP_IMPACT && u >= CHOP_IMPACT) this.emit('impact'); this.chopPrev = u; }
      if (this.state === 'flinch' && !g) { this.state = 'idle'; this.emit('flinch_end'); }
    }
  }
}
