// GOOFUS BIRD (lumber-camp story, Tryon 1939: "it flies backwards because it doesn't care where it's going, only
// where it's been"). A real crow: it nests upside down in a big pine by the cabin road, and by day it follows your old
// footprints a little way behind you, flying tail first, looking back along the way you came.
//   - whatever you leave lying on your trail, it picks up and brings back, and drops at your feet;
//   - it cannot see what is ahead of it: now and then it flies smack into a tree;
//   - hold out bannock and it lands, backwards, and takes it; feed it twice and it brings you little things it finds;
//   - lost? a tame one knows where you have been: it flies back along your trail (facing you), toward home.
// Events: caw, trail, fetch, drop (give), bonk, eat, befriended, guide, roost.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { RealCryptid, clamp, damp } from './real';
import { daylight } from './base';

export type GoofusState = 'roost' | 'takeoff' | 'trail' | 'fetch' | 'carry' | 'bonk' | 'beg' | 'eat' | 'guide' | 'home';

export const GOOFUS_SOUND: Record<string, string | undefined> = {
  caw: 'bird_raven', trail: 'dingbat_flutter', fetch: 'dingbat_flutter', drop: 'foliage_rustle', bonk: 'log_thud',
  eat: 'eat_crunch', befriended: 'bird_raven', guide: 'bird_raven', roost: undefined,
};

const N = 160;
const TRINKETS = ['matches', 'batteries', 'firestarter', 'kindling'];
const _a = new THREE.Vector3();

export class GoofusBird extends RealCryptid {
  readonly id = 'goofus';
  readonly name = 'Goofus Bird';
  readonly favoriteFood = 'bread';
  readonly rules = [
    'It flies backwards. It does not care where it is going, only where it has been.',
    'It follows your old footprints, a little way behind you, tail first.',
    'Anything you leave lying on your trail, it picks up and brings back, and drops at your feet.',
    'It cannot see what is in front of it. Now and then it flies smack into a tree.',
    'Hold out bannock and it lands, backwards, and takes it. Feed it twice and it brings you little things it finds.',
    'Lost? A tame one knows where you have been: it flies back along your trail toward home. Follow it.',
  ] as const;
  readonly sounds = GOOFUS_SOUND;
  declare state: GoofusState;
  /** the player's trail: x, z every 2 m, and when */
  private trail = new Float32Array(N * 2); private trailT = new Float32Array(N);
  private head = 0; private count = 0;
  /** the trail point it is flying to, as a count of points since the start (wraps in the ring) */
  private idx = 0;
  /** height above the ground (m) */
  private alt = 0;
  private nest = new THREE.Vector3(); private nestSet = false;
  private carry: string | null = null;
  private cawT = 8; private giftT = 200; private bonkCd = 0;
  private wobble = Math.random() * 10;
  private guided = false;

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('goofus', o);
    this.state = 'roost';
    this.tiltLen = 0; this.tiltWid = 0;
    this.turnK = 3;
    this.shineK = 0; // birds have no eye shine
    this.nest.copy(this.home).add(new THREE.Vector3(0, 5.2, 0));
  }

  offer(item: string): boolean {
    if (item !== this.favoriteFood || this.dist > 3.5 || this.alt > 0.6) return false;
    this.go('eat'); this.anim('peck', { once: true, fade: 0.2 });
    this.emit('eat');
    if (this.gainTrust(0.5)) this.emit('befriended');
    return true;
  }

  /** the trail point `i` (count since start) as x, z */
  private tp(i: number, out: THREE.Vector3) {
    const k = ((i % N) + N) % N;
    return out.set(this.trail[k * 2], 0, this.trail[k * 2 + 1]);
  }
  private get oldest() { return Math.max(0, this.count - N + 1); }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    const friend = this.trust >= 1;
    const day = daylight(ctx.hour) > 0.45;
    // record the player's footprints every 2 m
    const last = this.count ? this.tp(this.count - 1, _a) : null;
    if (!last || Math.hypot(P.pos.x - last.x, P.pos.z - last.z) > 2) {
      const k = this.count % N; this.trail[k * 2] = P.pos.x; this.trail[k * 2 + 1] = P.pos.z; this.trailT[k] = ctx.time; this.count++;
    }
    if (!this.nestSet && ctx.trunks) {
      // the nest hangs from a branch of the nearest big tree
      const t = ctx.trunks(this.home.x, this.home.z, 8).sort((a, b) => b.r - a.r)[0];
      if (t) this.nest.set(t.x + t.r + 0.55, ctx.heightAt(t.x, t.z) + 5.2, t.z);
      this.nestSet = true;
      if (this.state === 'roost') { this.pos.set(this.nest.x, ctx.heightAt(this.nest.x, this.nest.z), this.nest.z); }
    }
    this.cawT -= dt; this.bonkCd = Math.max(0, this.bonkCd - dt);
    const flying = this.state === 'trail' || this.state === 'fetch' || this.state === 'carry' || this.state === 'guide' || this.state === 'home' || this.state === 'takeoff';
    if (flying && this.cawT < 0) { this.cawT = 14 + Math.random() * 20; this.emit('caw'); }
    const ground = ctx.heightAt(this.pos.x, this.pos.z);
    switch (this.state) {
      case 'roost': {
        // hanging upside down under its nest; it wakes for someone on the road by day
        this.want = 0; this.alt = this.nest.y - ground; this.anim('idle', { fade: 0.5 });
        if (day && this.dist < 45) { this.go('takeoff'); this.anim('takeoff', { once: true, fade: 0.2 }); this.idx = this.nearestTrail(this.pos); this.emit('trail'); }
        break;
      }
      case 'takeoff':
        this.want = 0;
        if (this.st > 0.9) this.go('trail');
        break;
      case 'trail': {
        if (!day) { this.go('home'); break; }
        if (P.held === this.favoriteFood && this.dist < 12) { this.go('beg'); break; }
        if (friend && ctx.lost && !this.guided) { this.guided = true; this.go('guide'); this.emit('guide'); break; }
        if (!ctx.lost) this.guided = false;
        if (this.dist > 140) { this.go('home'); break; }
        // along the footprints, never closer than a few paces to the walker, never newer than a few seconds
        const lag = friend ? 4 : 10, keep = friend ? 4.5 : 8;
        this.idx = Math.max(this.idx, this.oldest);
        let p = this.tp(this.idx, _a);
        while (this.idx < this.count - 1 && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1.6) {
          const k = (this.idx + 1) % N;
          if (ctx.time - this.trailT[k] < lag || Math.hypot(this.trail[k * 2] - P.pos.x, this.trail[k * 2 + 1] - P.pos.z) < keep) break;
          this.idx++; p = this.tp(this.idx, _a);
        }
        this.flyTo(p, this.count - this.idx > 25 ? 9 : 5.5, dt);
        // something lying on the trail behind the walker: it goes for it
        const it = (ctx.items ?? []).find((x) => x.kind !== 'axe' && Math.hypot(x.pos.x - this.pos.x, x.pos.z - this.pos.z) < 6 && Math.hypot(x.pos.x - P.pos.x, x.pos.z - P.pos.z) > 25);
        if (it && !this.carry) { this.carry = it.id; this.target.copy(it.pos); this.go('fetch'); this.emit('fetch'); break; }
        // a tame one brings little things now and then
        if (friend) {
          this.giftT -= dt;
          if (this.giftT < 0) { this.giftT = 150 + Math.random() * 120; this.carry = 'gift:' + TRINKETS[Math.floor(Math.random() * TRINKETS.length)]; this.go('carry'); }
        }
        break;
      }
      case 'fetch': {
        const it = (ctx.items ?? []).find((x) => x.id === this.carry);
        if (!it) { this.carry = null; this.go('trail'); break; }
        this.flyTo(it.pos, 5, dt, 0.2);
        if (Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) < 0.6 && this.alt < 0.5) {
          this.anim('peck', { once: true, fade: 0.15 });
          if (ctx.takeItem?.(it.id)) { this.carry = 'item:' + it.kind; this.go('carry'); } else { this.carry = null; this.go('trail'); }
        }
        if (this.st > 30) { this.carry = null; this.go('trail'); }
        break;
      }
      case 'carry': {
        // back to the walker, tail first, and down at their feet
        this.flyTo(P.pos, 7, dt, this.dist < 6 ? 1.2 : 3);
        if (this.dist < 2.2) {
          const item = (this.carry ?? '').replace(/^(gift|item):/, '');
          if (item) this.emit('drop', { give: { item, n: 1, at: P.pos.clone().add(_a.set(P.dir.x * 0.8, 0, P.dir.z * 0.8)) } });
          this.carry = null; this.go('trail'); this.idx = this.nearestTrail(this.pos);
        }
        if (this.st > 60) this.go('trail');
        break;
      }
      case 'guide': {
        // back along the trail (older and older), staying ahead of the walker and waiting for them
        if (!ctx.lost || !day) { this.go('trail'); this.idx = this.nearestTrail(this.pos); break; }
        const pi = this.nearestTrail(P.pos);
        const want = Math.max(this.oldest, pi - 6);
        if (this.idx > want || this.dist > 16) this.idx = Math.min(this.idx, want);
        const p = this.tp(this.idx, _a);
        this.flyTo(p, this.dist > 14 ? 1.5 : 5, dt);
        if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1.5 && this.dist < 12 && this.idx > this.oldest) this.idx--;
        break;
      }
      case 'bonk':
        // smack: down it goes, drops whatever it had, shakes its head
        this.want = 0; this.reverse = false;
        this.alt = Math.max(0, this.alt - dt * 6);
        if (this.alt <= 0 && this.clip !== 'land' && this.clip !== 'look') this.anim('land', { once: true, fade: 0.1 });
        if (this.st > 1.2 && this.clip === 'land') this.anim('look', { fade: 0.3 });
        if (this.st > 3.2) { this.go('takeoff'); this.anim('takeoff', { once: true, fade: 0.2 }); }
        break;
      case 'beg': {
        // lands a couple of paces off, back to them, and waits for bread
        if (P.held !== this.favoriteFood || this.dist > 16) { this.go('takeoff'); this.anim('takeoff', { once: true, fade: 0.2 }); break; }
        const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
        this.flyTo(_a.set(P.pos.x + Math.sin(a) * 2.2, 0, P.pos.z + Math.cos(a) * 2.2), 4, dt, 0);
        if (this.alt < 0.05 && this.speed < 0.3) { this.reverse = false; this.faceToward(P.pos); this.anim(this.st % 6 < 3 ? 'idle' : 'look', { fade: 0.4 }); }
        break;
      }
      case 'eat':
        this.want = 0; this.reverse = false;
        if (this.st > 2.2) this.go('trail');
        break;
      case 'home': {
        if (day && this.dist < 45) { this.go('trail'); break; }
        this.flyTo(this.nest, 6, dt, this.nest.y - ctx.heightAt(this.nest.x, this.nest.z));
        if (Math.hypot(this.nest.x - this.pos.x, this.nest.z - this.pos.z) < 0.5) { this.go('roost'); this.emit('roost'); }
        break;
      }
    }
    // it cannot see where it is going: trees
    if (flying && this.bonkCd <= 0 && this.alt > 0.8 && this.speed > 1.5 && ctx.trunks) {
      for (const t of ctx.trunks(this.pos.x, this.pos.z, 1.2)) {
        if (Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < t.r + 0.22) {
          this.bonkCd = 10; this.emit('bonk');
          if (this.carry) {
            const item = this.carry.replace(/^(gift|item):/, '');
            this.emit('drop', { give: { item, n: 1, at: this.pos.clone() } }); this.carry = null;
          }
          this.go('bonk'); this.anim('glide', { fade: 0.1 }); this.speed = 0;
          break;
        }
      }
    }
    // hanging upside down at the nest; flying it rolls a little into its turns
    const upside = this.state === 'roost' ? Math.PI : 0;
    this.roll = damp(this.roll, upside, this.state === 'roost' ? 3 : 6, dt);
    this.tilt.position.y = this.alt;
  }

  /** fly toward a point at speed v, at `height` m over the ground there (default 2.6-3.4), tail first */
  private flyTo(p: THREE.Vector3, v: number, dt: number, height?: number) {
    this.wobble += dt;
    const side = Math.sin(this.wobble * 0.7) * 0.9;
    const hx = p.x - this.pos.x, hz = p.z - this.pos.z, d = Math.hypot(hx, hz) || 1;
    this.target.set(p.x + (hz / d) * side, 0, p.z - (hx / d) * side);
    this.want = d > 0.4 ? v : 0; this.arrive = 0.3;
    this.reverse = true;
    const h = height ?? 2.9 + Math.sin(this.wobble * 0.5) * 0.4;
    this.alt = damp(this.alt, h, 1.6, dt);
    if (this.alt > 0.3) { if (this.clip !== 'takeoff' || this.clipDone) this.anim(this.speed > 3.5 || Math.abs(h - this.alt) > 0.4 ? 'fly' : 'glide', { fade: 0.35 }); }
    else if (this.speed < 0.3) this.anim('idle', { fade: 0.3 });
    if (this.clip === 'fly') this.rate(clamp(0.8 + this.speed / 12, 0.8, 1.5));
  }

  private nearestTrail(at: THREE.Vector3) {
    let best = this.count - 1, bd = Infinity;
    for (let i = this.oldest; i < this.count; i++) { const p = this.tp(i, _a); const d = Math.hypot(p.x - at.x, p.z - at.z); if (d < bd) { bd = d; best = i; } }
    return Math.max(0, best);
  }

  protected pose(ctx: CreatureCtx) {
    // on the ground near you it watches you (backwards in the air it watches where it has been)
    if (this.alt < 0.3 && this.dist < 10 && this.state !== 'bonk') this.turnBone('Head', ctx.player.pos, 0.7, 1.2, 0.5);
  }
}
