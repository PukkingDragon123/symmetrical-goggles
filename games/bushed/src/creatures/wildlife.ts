// SMALL WILDLIFE: life round the player that reacts to them. A pooled manager spawns critters out of sight around the
// player by biome and hour, runs each one's simple rules, and despawns what wanders off.
//   red squirrel     forages on the ground; alarmed, it chatters, races to the nearest trunk (ctx.trunks) and spirals
//                    up it to scold from 3-5 m; without a trunk it bolts
//   snowshoe hare    feeds at dawn and dusk; freezes flat when the player is near; at close range bolts in zig-zags
//   raven, grey jay, black-capped chickadee   peck about on the ground; flush within ~6 m (a raven sooner) and fly
//                    off in climbing arcs
//   ruffed grouse    sits tight, freezes, then explodes up from under the player's feet and whirrs away low
//
//   const wild = new Wildlife(); scene.add(wild.object);
//   wild.update(ctx);          // every frame (CreatureCtx; uses ctx.trunks if present)
// v4: the squirrel and the hare are real animals (wildlife/mammals.ts: rigged, animated glTF models, a red squirrel and
// a snowshoe hare in its brown summer coat, built by tools/blender/fauna/small.py); the birds keep their own code below
// (the new flocks live in src/creatures/birds). Until the real models have loaded the old sculpted bodies stand in.
// Squirrels love nuts and berries: a player standing still holding them (SQUIRREL_FOODS) is approached by a brave
// squirrel that sits up and begs at arm's length; wild.offer('nuts') hands them over: it nibbles, sitting up, then
// chatters happily. Events (ctx.emit(ev, { pos, who, sound })): chatter, bolt, caw, chirp, flush, eat (item), happy.
// `sound` is a src/audio/bank.ts id.
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, dampAngle, wrapAngle } from './rig';
import { wildModel, BIRDS, WILD_FUR_LEN, type Species } from './wildlife/models';
import { addFur, type Fur } from './fur';
import { daylight } from './hound';
import { MammalBody, mammalAssetNow, isMammal } from './wildlife/mammals';
import { biome, WORLD } from '../world/layout';
import type { CreatureCtx } from './types';

const SOUND: Record<string, Partial<Record<Species, string>>> = {
  chatter: { squirrel: 'animal_red_squirrel' }, caw: { raven: 'bird_raven' }, chirp: { jay: 'bird_songbird', chickadee: 'bird_songbird' },
  eat: { squirrel: 'eat_crunch' }, chew: { squirrel: 'eat_chew' }, happy: { squirrel: 'animal_red_squirrel' },
  flush: { grouse: 'bird_grouse_drum', raven: 'bird_raven' },
};
const _e = new THREE.Euler(), _eo = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const TAU = Math.PI * 2;

type State = 'idle' | 'move' | 'alert' | 'freeze' | 'flee' | 'climb' | 'perch' | 'fly' | 'gone' | 'beg' | 'eat';
/** what a squirrel comes for (its favourites) */
export const SQUIRREL_FOODS = ['nuts', 'hazelnuts', 'acorns', 'seeds', 'berries', 'blueberries'];
export class Critter {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  /** the sculpted body's skeleton (null on a real mammal) */
  readonly skel: Skel | null;
  /** the real squirrel or hare (null: a bird, or the sculpted stand-in while the model loads) */
  readonly real: MammalBody | null = null;
  readonly bird: boolean;
  state: State = 'idle';
  pos = new THREE.Vector3(); heading = 0; speed = 0; alt = 0; t = 0; st = 0; next = 0; phase = 0;
  vel = new THREE.Vector3(); turn = 0; trunk: { x: number; z: number; r: number } | null = null; called = 0;
  private b: Record<string, number>;
  constructor(readonly kind: Species) {
    const ra = isMammal(kind) ? mammalAssetNow(kind) : null;
    if (ra) {
      this.real = new MammalBody(kind as 'squirrel' | 'hare', ra);
      this.mesh = this.real.body.mesh; this.skel = null; this.b = {};
      this.object.add(this.real.body.object); this.object.name = kind; this.bird = false;
      return;
    }
    const m = wildModel(kind);
    this.skel = new Skel(m.bones);
    const { mat, depth } = creatureMaterial(m.tex, m.sd);
    this.mesh = this.skel.mesh(m.geo, mat);
    this.mesh.castShadow = true; this.mesh.customDepthMaterial = depth; this.mesh.frustumCulled = false;
    this.object.add(this.mesh); this.object.name = kind;
    const fl = WILD_FUR_LEN[kind];
    if (m.fur && fl) this.fur = addFur(this.mesh, { length: fl, mask: m.fur, shells: 9, density: 0.9, clump: 4, clumpPull: 0.5, rootDark: 0.5, tipK: 0.5, fins: 0.4, comb: [0, -0.1, -0.5], droop: 0.12, hz: 3.5, inertia: 0.02, springs: [{ bones: ['tail0'], hz: 2.6, inertia: 2 }, { bones: ['earL', 'earR'], hz: 5 }], lod: [3, 10, 22], minShells: 3 });
    this.bird = BIRDS.includes(kind);
    this.b = this.skel.idx;
  }
  reset(x: number, z: number, h: number) {
    this.pos.set(x, h, z); this.heading = Math.random() * TAU; this.speed = 0; this.alt = 0; this.t = Math.random() * 10; this.st = 0; this.next = 1 + Math.random() * 3;
    this.state = this.bird ? 'perch' : 'idle'; this.trunk = null; this.vel.set(0, 0, 0); this.object.visible = true;
  }
  /** pose the skeleton for the current state */
  /** the coat (squirrel, hare) */
  fur: Fur | null = null;
  /** what it is eating (a squirrel given nuts) */
  food = '';
  pose(dt: number) {
    if (this.real) { this.real.pose(this, dt); return; }
    this.poseBones(dt);
    this.fur?.update(dt);
  }
  private poseBones(dt: number) {
    const S = this.skel!, B = S.bones, b = this.b, t = this.t;
    S.rest();
    const R = (n: string, x: number, y = 0, z = 0) => { const k = b[n]; if (k !== undefined) B[k].quaternion.setFromEuler(_e.set(x, y, z)); };
    if (this.bird) {
      const flying = this.state === 'fly';
      if (flying) {
        const hz = this.kind === 'raven' ? 3.2 : this.kind === 'grouse' ? 11 : this.kind === 'jay' ? 7 : 13;
        // flap in bursts; the big birds glide between them
        const glide = this.kind === 'raven' ? (Math.sin(t * 0.9) > 0.3 ? 1 : 0) : this.kind === 'grouse' && this.st > 1.2 ? (Math.sin(t * 2) > 0 ? 1 : 0) : 0;
        const a = glide ? 0.12 : Math.sin(t * hz * TAU) * 0.95;
        R('wingL', 0, 0.15, a); R('wingR', 0, -0.15, -a);
        R('legs', -1.3); R('tail', -0.1); R('head', -0.1);
      } else {
        // folded: the wings swept back along the body, a peck now and then, the head turning, the tail flicking
        const peck = Math.max(0, Math.sin(t * 1.3 + this.phase * 7)) > 0.93 ? 0.9 : 0;
        R('wingL', -0.15, 1.45, -0.25); R('wingR', -0.15, -1.45, 0.25);
        R('head', peck + (this.state === 'alert' ? -0.2 : 0), Math.sin(t * 0.7 + this.phase) * 0.8 * (Math.sin(t * 0.31) > 0 ? 1 : 0.2), 0);
        R('tail', 0.15 + Math.max(0, Math.sin(t * 3.1 + this.phase)) * (this.kind === 'chickadee' || this.kind === 'jay' ? 0.4 : 0.15));
        // a hop
        B[0].position.y += this.state === 'move' ? Math.abs(Math.sin(t * 9)) * 0.04 * (this.kind === 'raven' ? 2 : 1) : 0;
      }
      return;
    }
    // mammals: a bounding gait (hind legs together, fore legs together)
    const moving = this.speed > 0.2 || this.state === 'climb';
    if (moving) {
      const p = this.phase * TAU, sw = Math.sin(p);
      R('hL', sw * 0.9); R('hR', sw * 0.9); R('fL', -sw * 0.8); R('fR', -sw * 0.8);
      B[0].position.y += Math.max(0, Math.sin(p)) * (this.kind === 'hare' ? 0.09 : 0.03);
      B[0].quaternion.setFromEuler(_e.set(Math.cos(p) * 0.18, 0, 0));
      R('tail0', this.kind === 'squirrel' ? 0.3 + Math.cos(p) * 0.3 : 0.2);
      R('earL', -0.6); R('earR', -0.6);
    } else if (this.state === 'beg' || this.state === 'eat') {
      // sat up on its haunches, forepaws to its mouth, nibbling (begging: the paws held up, the nose working)
      const eat = this.state === 'eat', nib = Math.sin(t * (eat ? 26 : 14)) * (eat ? 0.08 : 0.04);
      B[0].quaternion.setFromEuler(_e.set(-0.85, 0, 0)); B[0].position.y += 0.035; B[0].position.z -= 0.02;
      R('head', 0.75 + nib, eat ? 0 : Math.sin(t * 1.3) * 0.3, eat ? 0 : Math.sin(t * 0.9) * 0.25);
      R('fL', -1.5 + nib * 2); R('fR', -1.5 + nib * 2); R('hL', 0.9); R('hR', 0.9);
      R('tail0', 0.9 + Math.sin(t * 2) * 0.1); R('tail1', -0.9);
      R('earL', 0.1); R('earR', 0.1);
    } else {
      const frozen = this.state === 'freeze';
      const nib = !frozen && Math.sin(t * 0.8 + this.phase * 5) > 0.4 ? Math.sin(t * 22) * 0.06 + 0.25 : 0;
      R('head', nib, frozen ? 0 : Math.sin(t * 0.6 + this.phase) * 0.5, 0);
      B[0].position.y -= frozen ? (this.kind === 'hare' ? 0.04 : 0.015) : 0;
      // the squirrel's tail flicks in jerks; the hare's ears swivel, or lie flat when it freezes
      const flick = this.kind === 'squirrel' ? (Math.sin(t * 2.3) > 0.6 ? Math.sin(t * 30) * 0.25 : 0) : 0;
      R('tail0', this.kind === 'squirrel' ? 0.35 + flick : 0.2); R('tail1', this.kind === 'squirrel' ? -0.4 - flick : 0);
      const ear = frozen ? -1.1 : Math.sin(t * 1.7 + this.phase) * 0.25;
      R('earL', ear, 0, frozen ? 0 : Math.sin(t * 1.1) * 0.2); R('earR', ear, 0, frozen ? 0 : -Math.sin(t * 1.3) * 0.2);
    }
  }
}

export interface WildlifeOpts { max?: number; radius?: [number, number]; despawn?: number; /** no spawning below this ground height (the lake) */ waterY?: number }
export class Wildlife {
  readonly object = new THREE.Group();
  readonly active: Critter[] = [];
  private pool = new Map<Species, Critter[]>();
  private spawnT = 0;
  private o: Required<WildlifeOpts>;
  /** test pages: force the population (null = by biome and hour) */
  forced: Partial<Record<Species, number>> | null = null;
  constructor(o: WildlifeOpts = {}) { this.o = { max: o.max ?? 12, radius: o.radius ?? [16, 34], despawn: o.despawn ?? 70, waterY: o.waterY ?? WORLD.waterY }; this.object.name = 'Wildlife'; }
  get count() { return this.active.length; }

  /** how many of each species the place and hour call for */
  private wants(ctx: CreatureCtx): Partial<Record<Species, number>> {
    if (this.forced) return this.forced;
    const P = ctx.player.pos, b = biome(P.x, P.z), day = daylight(ctx.hour);
    const h = ((ctx.hour % 24) + 24) % 24, dusk = Math.max(0, 1 - Math.min(Math.abs(h - 6.5), Math.abs(h - 19.5)) / 2);
    const tot = b.spruce + b.fir + b.pine + b.birch + b.cedar + 1e-6, conifer = (b.spruce + b.fir + b.pine) / tot, birch = b.birch / tot;
    return {
      squirrel: Math.round(3 * day * (0.3 + conifer) * b.density),
      hare: Math.round(0.6 + 1.6 * dusk + (1 - day) * 0.4),
      // the birds moved to src/creatures/birds (real rigged models; installFauna in src/world/fauna spawns them); the
      // sculpted bird bodies here only show on test pages that force them
      raven: 0, jay: 0, chickadee: 0, grouse: 0,
    };
    void birch;
  }
  private take(k: Species): Critter {
    const p = this.pool.get(k);
    const c = p && p.length ? p.pop()! : new Critter(k);
    this.object.add(c.object);
    return c;
  }
  private release(c: Critter) {
    this.object.remove(c.object); c.object.visible = false; c.state = 'gone';
    let p = this.pool.get(c.kind); if (!p) this.pool.set(c.kind, (p = [])); p.push(c);
  }

  update(ctx: CreatureCtx) {
    const dt = Math.min(0.1, Math.max(0, ctx.dt)), P = ctx.player.pos;
    // despawn what has wandered or flown off
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      if (c.state === 'gone' || Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > this.o.despawn) { this.active.splice(i, 1); this.release(c); }
    }
    // spawn toward the wanted population, out of sight behind or beside the player
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.2;
      const want = this.wants(ctx), have = new Map<Species, number>();
      for (const c of this.active) have.set(c.kind, (have.get(c.kind) ?? 0) + 1);
      for (const k of Object.keys(want) as Species[]) {
        if ((have.get(k) ?? 0) >= (want[k] ?? 0) || this.active.length >= this.o.max) continue;
        const back = Math.atan2(-ctx.player.dir.x, -ctx.player.dir.z), a = back + (Math.random() - 0.5) * 3.2, d = this.o.radius[0] + Math.random() * (this.o.radius[1] - this.o.radius[0]);
        let x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
        if (k === 'squirrel' && ctx.trunks) { const ts = ctx.trunks(x, z, 8); if (ts.length) { const t = ts[0], ta = Math.random() * TAU; x = t.x + Math.sin(ta) * (t.r + 0.6); z = t.z + Math.cos(ta) * (t.r + 0.6); } }
        const h = ctx.heightAt(x, z);
        if (h < this.o.waterY + 0.3) continue;
        const c = this.take(k);
        c.reset(x, z, h); c.phase = Math.random();
        this.active.push(c);
        break; // one per tick
      }
    }
    this.lastP.copy(P); this.fedT = Math.max(0, this.fedT - dt);
    if (this.pendingEat) { const e = this.pendingEat; this.pendingEat = null; ctx.emit('eat', { pos: e.c.object.position.clone(), who: 'squirrel', sound: SOUND.eat.squirrel, item: e.item }); }
    for (const c of this.active) this.think(c, ctx, dt);
  }

  /** after a squirrel has eaten, the squirrels are tamer for a while (seconds left) */
  private fedT = 0;
  private lastP = new THREE.Vector3(0, -999, 0); private pendingEat: { c: Critter; item: string } | null = null;
  /** the player holds out food: true if a begging squirrel within reach takes it (nuts, seeds or berries) */
  offer(item: string): boolean {
    if (!SQUIRREL_FOODS.includes(item)) return false;
    const c = this.active.find((k) => k.kind === 'squirrel' && k.state === 'beg' && Math.hypot(k.pos.x - this.lastP.x, k.pos.z - this.lastP.z) < 2.2);
    if (!c) return false;
    c.state = 'eat'; c.st = 0; c.food = item; this.pendingEat = { c, item };
    return true;
  }
  private emit(c: Critter, ctx: CreatureCtx, ev: string) { if (ev) ctx.emit(ev, { pos: c.object.position.clone(), who: c.kind, sound: SOUND[ev]?.[c.kind] }); }

  private think(c: Critter, ctx: CreatureCtx, dt: number) {
    c.t += dt; c.st += dt;
    const P = ctx.player, dx = c.pos.x - P.pos.x, dz = c.pos.z - P.pos.z, dist = Math.hypot(dx, dz), away = Math.atan2(dx, dz);
    const loud = P.noise > 0.6, ps = P.speed ?? 0;
    const go = (s: State) => { if (c.state !== s) { c.state = s; c.st = 0; } };
    let want = 0, wantH = c.heading;
    switch (c.kind) {
      case 'squirrel': {
        if (c.state === 'climb') {
          // spiral up the trunk to a scolding height, then sit there chattering
          const tr = c.trunk!;
          if (c.alt < 3 + (c.phase * 2)) { c.alt += dt * 1.6; c.turn += dt * 0.9; c.speed = 1; c.phase = (c.phase + dt * 4) % 1; }
          else { c.speed = 0; if (c.st > c.next) { c.next = c.st + 3 + Math.random() * 5; this.emit(c, ctx, 'chatter'); } }
          if (dist > 30 && c.st > 8) { c.state = 'gone'; }
          const ang = c.turn, nx = Math.sin(ang), nz = Math.cos(ang);
          c.pos.set(tr.x + nx * (tr.r + 0.03), ctx.heightAt(tr.x, tr.z), tr.z + nz * (tr.r + 0.03));
          this.place(c, ctx, { up: true, out: [nx, nz] });
          c.pose(dt);
          return;
        }
        // nuts held out by a still player: one brave squirrel comes to beg, and eats what it is given
        const food = SQUIRREL_FOODS.includes(P.held) && ps < 0.8 && !loud;
        if (c.state === 'eat') {
          c.speed = damp(c.speed, 0, 8, dt); wantH = Math.atan2(-dx, -dz);
          if (c.st > 5) { this.emit(c, ctx, 'happy'); this.emit(c, ctx, 'chatter'); go('idle'); this.fedT = 60; }
          else if (Math.random() < dt * 2) this.emit(c, ctx, 'chew');
          c.heading = dampAngle(c.heading, wantH, 3, dt); c.pos.y = ctx.heightAt(c.pos.x, c.pos.z); this.place(c, ctx); c.pose(dt);
          return;
        }
        if (food && (c.state === 'beg' || (dist < 14 && c.state !== 'flee' && !this.active.some((o) => o !== c && o.state === 'beg')))) {
          if (c.state !== 'beg') { go('beg'); this.emit(c, ctx, 'chatter'); }
          const stop = 0.9;
          if (dist > stop + 0.15) { wantH = Math.atan2(-dx, -dz); want = 2.2; c.state = 'beg'; }
          c.heading = dampAngle(c.heading, Math.atan2(-dx, -dz), 6, dt);
          c.speed = damp(c.speed, dist > stop + 0.15 ? want : 0, 6, dt);
          c.pos.x += Math.sin(c.heading) * c.speed * dt; c.pos.z += Math.cos(c.heading) * c.speed * dt; c.pos.y = ctx.heightAt(c.pos.x, c.pos.z);
          c.phase = (c.phase + dt * (c.speed / 0.35)) % 1;
          this.place(c, ctx); c.pose(dt);
          return;
        }
        if (c.state === 'beg') go('idle');
        if (c.state !== 'flee' && (dist < 9 || (loud && dist < 20)) && !(this.fedT > 0 && !loud && ps < 2)) {
          go('flee'); this.emit(c, ctx, 'chatter');
          const ts = ctx.trunks ? ctx.trunks(c.pos.x, c.pos.z, 12) : [];
          let best: typeof c.trunk = null, bd = Infinity;
          for (const tr of ts) { const d = Math.hypot(tr.x - c.pos.x, tr.z - c.pos.z) + Math.hypot(tr.x - P.pos.x, tr.z - P.pos.z) < dist ? 99 : 0; const dd = Math.hypot(tr.x - c.pos.x, tr.z - c.pos.z) + d; if (dd < bd) { bd = dd; best = tr; } }
          c.trunk = best;
        }
        if (c.state === 'flee') {
          if (c.trunk) {
            const tx = c.trunk.x - c.pos.x, tz = c.trunk.z - c.pos.z;
            wantH = Math.atan2(tx, tz); want = 5;
            if (Math.hypot(tx, tz) < c.trunk.r + 0.25) { go('climb'); c.turn = Math.atan2(-tx, -tz); c.alt = 0.1; }
          } else { wantH = away; want = 5; if (dist > 35) go('idle'); }
        } else this.forage(c, dt, 0.6);
        break;
      }
      case 'hare': {
        if (c.state === 'flee') {
          // zig-zags: a sharp change of line every half second or so
          if (c.st > c.next) { c.next = c.st + 0.35 + Math.random() * 0.4; c.turn = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6); }
          wantH = away + c.turn; want = 8;
          if (dist > 45) go('idle');
        } else if (dist < 6 || (dist < 12 && ps > 3)) { go('flee'); c.next = 0.3; this.emit(c, ctx, 'bolt'); }
        else if (dist < 15 || (loud && dist < 25)) { go('freeze'); }
        else { if (c.state === 'freeze' && c.st < 4) break; this.forage(c, dt, 1.2); }
        break;
      }
      default: {
        // birds
        if (c.state === 'fly') { this.fly(c, ctx, dt, dist); c.pose(dt); return; }
        const flushAt = c.kind === 'raven' ? 11 : c.kind === 'grouse' ? 3.5 : 6;
        if (dist < flushAt || (loud && dist < flushAt * 2.5) || (c.kind !== 'grouse' && ps > 4 && dist < flushAt * 2)) {
          go('fly'); this.emit(c, ctx, c.kind === 'grouse' ? 'flush' : c.kind === 'raven' ? 'caw' : 'chirp'); if (c.kind !== 'grouse') this.emit(c, ctx, 'flush');
          const side = Math.random() < 0.5 ? -1 : 1;
          c.heading = away + side * 0.3; c.turn = side * (0.25 + Math.random() * 0.35);
          const sp = c.kind === 'grouse' ? 9 : c.kind === 'raven' ? 7 : 6;
          c.vel.set(Math.sin(c.heading) * sp, c.kind === 'grouse' ? 3 : 4.5, Math.cos(c.heading) * sp);
          break;
        }
        if (c.kind === 'grouse' && dist < 14) { go('freeze'); break; }
        if (c.st > c.next) { c.next = c.st + 2 + Math.random() * 5; if (Math.random() < 0.35) this.emit(c, ctx, c.kind === 'raven' ? 'caw' : c.kind === 'grouse' ? '' : 'chirp'); }
        go(dist < flushAt * 1.6 ? 'alert' : c.state === 'alert' ? 'perch' : c.state);
        this.forage(c, dt, c.kind === 'raven' ? 0.5 : 0.35);
        break;
      }
    }
    // ground movement
    c.heading = dampAngle(c.heading, wantH, want > 0 ? 9 : 2, dt);
    if (c.state === 'flee' || c.state === 'move') c.speed = damp(c.speed, want || c.speed, 6, dt); else c.speed = damp(c.speed, 0, 8, dt);
    if (c.state !== 'flee' && c.state !== 'move') c.speed = damp(c.speed, 0, 8, dt);
    c.pos.x += Math.sin(c.heading) * c.speed * dt; c.pos.z += Math.cos(c.heading) * c.speed * dt;
    c.pos.y = ctx.heightAt(c.pos.x, c.pos.z);
    c.phase = (c.phase + dt * (c.speed / (c.kind === 'hare' ? 1.1 : 0.35))) % 1;
    this.place(c, ctx);
    c.pose(dt);
  }
  /** wander a little: short runs or hops between pauses */
  private forage(c: Critter, dt: number, sp: number) {
    if (c.st > c.next) {
      c.next = c.st + 1 + Math.random() * 3;
      if (Math.random() < 0.5) { c.state = 'move'; c.heading += (Math.random() - 0.5) * 2.5; c.speed = sp; }
      else c.state = c.bird ? 'perch' : 'idle';
    }
    if (c.state === 'move') { c.speed = sp; c.pos.x += 0; }
    void dt;
  }
  private fly(c: Critter, ctx: CreatureCtx, dt: number, dist: number) {
    // a climbing arc away from the player, curving to one side; the grouse stays low and fast
    const sp = Math.hypot(c.vel.x, c.vel.z);
    c.heading += c.turn * dt;
    const climb = c.kind === 'grouse' ? (c.alt < 1.6 ? 2 : -0.3) : c.alt < 10 + c.phase * 8 ? 3 : 0.4;
    c.vel.set(Math.sin(c.heading) * sp, damp(c.vel.y, climb, 2, dt), Math.cos(c.heading) * sp);
    c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt; c.alt = Math.max(0, c.alt + c.vel.y * dt);
    c.pos.y = ctx.heightAt(c.pos.x, c.pos.z);
    if (dist > 60 || c.st > 14) c.state = 'gone';
    this.place(c, ctx, { pitch: -Math.atan2(c.vel.y, sp) * 0.7, roll: -c.turn * 0.8 });
  }
  private place(c: Critter, _ctx: CreatureCtx, o: { up?: boolean; out?: [number, number]; pitch?: number; roll?: number } = {}) {
    c.object.position.set(c.pos.x, c.pos.y + c.alt, c.pos.z);
    if (o.up && o.out) {
      // on a trunk: head up, belly to the bark, back facing out
      _z.set(0, 1, 0); _y.set(o.out[0], 0, o.out[1]); _x.crossVectors(_y, _z);
      c.object.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    } else c.object.quaternion.setFromEuler(_eo.set(o.pitch ?? 0, c.heading, o.roll ?? 0, 'YXZ'));
    void clamp; void wrapAngle;
  }
}
