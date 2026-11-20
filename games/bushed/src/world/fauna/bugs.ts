// BUGS: the small life of the BUSHED forest, all of it in ONE instanced draw (plus a glow pass and the webs).
// Every insect is a sprite of a real insect model seen from above (public/assets/models/bugs/bugs_atlas.png, made by
// tools/blender/birds_bugs/bug_views.py + bugs_atlas.py from CC-BY Sketchfab models; credits in CREDITS.md), on a
// quad split down the body so a vertex shader folds the two wings about it (flap rate, depth and rest angle per
// insect); it is lit by the scene like everything else (the flashlight and the fires light the moths).
//   fireflies     summer-warm nights over the open ground: drifting, flashing in slowly synchronising waves
//   moths         at night round every fire and lantern, and in the flashlight beam: spiralling, bumping the light
//   mosquitoes    dusk and dawn by the water: they find you and whine round your head (a synthesised whine,
//                 louder at the ear); click to swat them (the slap kills the ones in front of your face)
//   midges        dancing columns over the shore at dusk
//   butterflies   monarchs and tiger swallowtails over sunny verges, the burn and clearings by day; they land
//   bees          zig-zagging low over the same flowers by day
//   dragonflies   blue darners patrolling the lake shore: dart, hover, dart
//   ants, beetles trails over logs and stumps; a fresh stump draws a crowd within the minute
//   spider webs   orb webs between trunks, beaded with dew in the morning; walk into one and it breaks on your face
// Cheap: pooled agents in place, no per-frame allocation, everything culled by distance, hour and season.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export type BugKind = 'firefly' | 'moth' | 'mosquito' | 'midge' | 'butterfly' | 'bee' | 'dragonfly' | 'ant' | 'beetle' | 'spider';
/** atlas cells (see bugs_atlas.py) */
const CELL = { monarch: 0, swallowtail: 1, moth: 2, darner: 3, bee: 4, ant: 5, beetle: 6, firefly: 7, mosquito: 8, midge: 9, spider: 10, glow: 11, dew: 12 };
/** wingspan (or body length for the walkers), m */
const SIZE: Record<BugKind, number> = { firefly: 0.014, moth: 0.042, mosquito: 0.011, midge: 0.006, butterfly: 0.095, bee: 0.022, dragonfly: 0.1, ant: 0.012, beetle: 0.028, spider: 0.018 };

export interface BugWorld {
  dt: number; time: number; hour: number;
  player: { pos: THREE.Vector3; eye: THREE.Vector3; dir: THREE.Vector3; speed: number };
  heightAt(x: number, z: number): number;
  waterY: number; lake: { x: number; z: number; r: number };
  /** lights moths come to: fires, lanterns */
  lights: THREE.Vector3[];
  /** the flashlight beam when on */
  flash: { pos: THREE.Vector3; dir: THREE.Vector3 } | null;
  stands(x: number, z: number, r: number): { x: number; y: number; z: number; r: number; h: number; dead: boolean }[];
  solids(x: number, z: number, r: number): { kind: string; x: number; y: number; z: number; r: number; h: number; x2?: number; y2?: number; z2?: number }[];
  /** 0..1 open ground (meadow, verge, burn) at a point */
  open(x: number, z: number): number;
  /** 0..1 how warm the season still is */
  warmth: number;
  rain: number;
  /** the player clicked (swat) this frame */
  swat: boolean;
  say(key: string, text: string): void;
  /** the slap landed: n mosquitoes */
  swatted(n: number): void;
}

const MAX = 700;
interface Agent {
  kind: BugKind; cell: number; size: number;
  pos: THREE.Vector3; vel: THREE.Vector3; home: THREE.Vector3; heading: number; pitch: number; roll: number;
  t: number; st: number; next: number; phase: number; state: number;
  flap: [number, number, number]; glow: number;
  /** a crawler's surface: a log (a -> b, r) or a stump (centre, r) */
  surf: { a: THREE.Vector3; b: THREE.Vector3; r: number; stump: boolean } | null;
  u: number; lane: number; alive: boolean; owner: number;
}
interface Web { c: THREE.Vector3; n: THREE.Vector3; r: number; alive: boolean; obj: THREE.Object3D; spider: Agent | null; dew: THREE.Points; t: number }

function wingQuad(): THREE.BufferGeometry {
  // body along +z (head at +z), wings +-x; three columns so the halves fold about x = 0
  const g = new THREE.BufferGeometry();
  const P: number[] = [], U: number[] = [], N: number[] = [];
  for (const z of [-1, 1]) for (const x of [-1, 0, 1]) { P.push(x * 0.5, 0, z * 0.5); U.push((x + 1) / 2, (z + 1) / 2); N.push(0, 1, 0); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
  return g;
}

export class Bugs {
  readonly object = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private aCell: THREE.InstancedBufferAttribute; private aFlap: THREE.InstancedBufferAttribute; private aGlow: THREE.InstancedBufferAttribute;
  private uTime = { value: 0 };
  private agents: Agent[] = [];
  private glowPts: THREE.Points; private glowPos: Float32Array; private glowCol: Float32Array;
  private webs: Web[] = [];
  private webMat: THREE.LineBasicMaterial; private dewMat: THREE.PointsMaterial;
  private atlas: THREE.Texture;
  /** atlas clones (the points sample single cells) re-uploaded once the image is in */
  private clones: THREE.Texture[] = [];
  private ownerSeq = 1;
  private lightSlots = new Map<string, number>();
  private stumps: { x: number; y: number; z: number; r: number; t: number }[] = [];
  private spawnT = 0; private time = 0;
  private swarm: { c: THREE.Vector3; until: number } | null = null;
  /** mosquitoes within reach of the face (drives the whine) */
  nearEar = 0;
  /** test pages: force kinds on regardless of hour and season */
  forced: Partial<Record<BugKind, number>> | null = null;
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _e = new THREE.Euler(0, 0, 0, 'YXZ'); private _s = new THREE.Vector3(); private _v = new THREE.Vector3(); private _w = new THREE.Vector3();
  private lastPlayer = new THREE.Vector3(1e9, 0, 0);

  constructor() {
    this.object.name = 'Bugs';
    this.atlas = new THREE.TextureLoader().load('assets/models/bugs/bugs_atlas.png', () => { for (const c of this.clones) c.needsUpdate = true; });
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.magFilter = THREE.NearestFilter; this.atlas.minFilter = THREE.LinearMipmapLinearFilter;
    const geo = wingQuad();
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.aFlap = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.aGlow = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    for (const a of [this.aCell, this.aFlap, this.aGlow]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCell', this.aCell); geo.setAttribute('aFlap', this.aFlap); geo.setAttribute('aGlow', this.aGlow);
    const mat = new THREE.MeshStandardMaterial({ map: this.atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime; attribute vec4 aCell; attribute vec4 aFlap; attribute float aGlow; varying float vGlow; varying vec2 vLoc;`)
        .replace('#include <beginnormal_vertex>', `
          float fAng = aFlap.z + aFlap.y * sin(uTime * aFlap.x * 6.2831853 + aFlap.w);
          float fSx = sign(position.x), fAx = abs(position.x);
          vec3 objectNormal = vec3(-fSx * sin(fAng), cos(fAng), 0.0);`)
        .replace('#include <begin_vertex>', `
          vec3 transformed = vec3(fSx * fAx * cos(fAng), fAx * sin(fAng), position.z);
          vGlow = aGlow; vLoc = uv;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = aCell.xy + uv * aCell.zw;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vGlow; varying vec2 vLoc;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // the firefly's lantern: the pale segments near the tail
          float lantern = smoothstep(0.42, 0.36, vLoc.y) * smoothstep(0.14, 0.22, vLoc.y);
          totalEmissiveRadiance += vGlow * lantern * vec3(1.6, 2.2, 0.5);`);
    };
    mat.customProgramCacheKey = () => 'bushed-bugs';
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.mesh.name = 'bugs';
    this.object.add(this.mesh);
    // glow: additive points for the fireflies' light (and a hint round moths at the lamp)
    const gg = new THREE.BufferGeometry();
    this.glowPos = new Float32Array(MAX * 3); this.glowCol = new Float32Array(MAX * 3);
    gg.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    gg.setAttribute('color', new THREE.BufferAttribute(this.glowCol, 3).setUsage(THREE.DynamicDrawUsage));
    const glowTex = this.cellTexture(CELL.glow);
    this.glowPts = new THREE.Points(gg, new THREE.PointsMaterial({ size: 0.11, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false, toneMapped: false }));
    this.glowPts.frustumCulled = false; this.glowPts.renderOrder = 2;
    this.object.add(this.glowPts);
    this.webMat = new THREE.LineBasicMaterial({ color: 0xdfe6ea, transparent: true, opacity: 0.32, depthWrite: false });
    this.dewMat = new THREE.PointsMaterial({ size: 0.012, map: this.cellTexture(CELL.dew), transparent: true, depthWrite: false, color: 0xffffff, sizeAttenuation: true, opacity: 0 });
  }

  /** a texture that samples one atlas cell (for the points) */
  private cellTexture(i: number): THREE.Texture {
    const t = this.atlas.clone();
    t.repeat.set(0.25, 0.25); t.offset.set((i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 4);
    t.magFilter = THREE.LinearFilter;
    if ((this.atlas.image as HTMLImageElement | undefined)?.complete) t.needsUpdate = true;
    this.clones.push(t);
    return t;
  }

  // ------------------------------------------------------------------ agents
  private add(kind: BugKind, x: number, y: number, z: number, owner = 0): Agent | null {
    if (this.agents.length >= MAX) return null;
    const cell = kind === 'butterfly' ? (Math.random() < 0.55 ? CELL.monarch : CELL.swallowtail) : kind === 'dragonfly' ? CELL.darner : CELL[kind as keyof typeof CELL] as number;
    const a: Agent = {
      kind, cell, size: SIZE[kind] * rnd(0.85, 1.15), pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), home: new THREE.Vector3(x, y, z),
      heading: rnd(0, TAU), pitch: 0, roll: 0, t: rnd(0, 10), st: 0, next: rnd(0.2, 2), phase: Math.random(), state: 0,
      flap: [0, 0, 0], glow: 0, surf: null, u: 0, lane: 0, alive: true, owner,
    };
    this.agents.push(a);
    return a;
  }
  private count(kind: BugKind): number { let n = 0; for (const a of this.agents) if (a.kind === kind) n++; return n; }

  /** a tree came down here: ants and beetles come to the fresh stump */
  freshStump(x: number, y: number, z: number, r: number): void {
    this.stumps.push({ x, y, z, r: Math.max(0.12, r), t: this.time });
    if (this.stumps.length > 6) this.stumps.shift();
  }

  // ------------------------------------------------------------------ the update
  update(w: BugWorld): void {
    const dt = Math.min(0.1, Math.max(0, w.dt));
    this.time += dt; this.uTime.value = this.time;
    const P = w.player.pos, h = ((w.hour % 24) + 24) % 24, F = this.forced;
    const night = h > 20.7 || h < 4.6, dusk = (h > 18.6 && h < 22.2) || (h > 4.3 && h < 7.4), day = h > 9 && h < 17.8;
    const warm = w.warmth, dry = w.rain < 0.2;
    const lakeD = Math.hypot(P.x - w.lake.x, P.z - w.lake.z) - w.lake.r;
    // ---- populations (spawn a few per tick)
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.25;
      const want = (k: BugKind, n: number) => (F ? F[k] ?? 0 : n);
      this.fill('firefly', want('firefly', night && dry && warm > 0.2 ? Math.round(70 * Math.min(1, warm * 1.4)) : 0), w, (a) => this.placeOpen(a, w, 4, 32, 0.3, 2.4));
      this.fill('butterfly', want('butterfly', day && dry && warm > 0.3 ? 8 : 0), w, (a) => this.placeOpen(a, w, 6, 30, 0.4, 1.6));
      this.fill('bee', want('bee', day && dry && warm > 0.3 ? 10 : 0), w, (a) => this.placeOpen(a, w, 4, 22, 0.2, 0.7));
      this.fill('dragonfly', want('dragonfly', day && dry && warm > 0.25 && lakeD < 70 ? 5 : 0), w, (a) => this.placeShore(a, w));
      const wet = lakeD < 45;
      this.fill('mosquito', want('mosquito', (dusk || night) && warm > 0.12 && wet ? 12 : dusk && warm > 0.2 ? 3 : 0), w, (a) => { a.pos.set(P.x + rnd(-14, 14), 0, P.z + rnd(-14, 14)); a.pos.y = w.heightAt(a.pos.x, a.pos.z) + rnd(0.5, 1.8); });
      if (((dusk && warm > 0.15 && wet) || (F?.midge ?? 0) > 0) && (!this.swarm || this.swarm.until < this.time || this.swarm.c.distanceTo(P) > 45)) {
        // a midge column over the shore near you
        for (let i = 0; i < 10; i++) {
          const a = rnd(0, TAU), d = rnd(6, 20), x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d, gy = w.heightAt(x, z);
          if (Math.abs(gy - w.waterY) < 1.2) { this.swarm = { c: new THREE.Vector3(x, Math.max(gy, w.waterY) + rnd(1.4, 2.6), z), until: this.time + 120 }; break; }
        }
      }
      this.fill('midge', want('midge', this.swarm && this.swarm.until > this.time ? 36 : 0), w, (a) => { if (this.swarm) a.home.copy(this.swarm.c), a.pos.copy(this.swarm.c).add(this._v.set(rnd(-0.4, 0.4), rnd(-0.6, 0.6), rnd(-0.4, 0.4))); });
      this.moths(w, F ? (F.moth ?? 0) > 0 : night || h > 19.8);
      this.crawlers(w, F ? (F.ant ?? 0) > 0 : warm > 0.08);
      this.spiders(w);
    }
    // ---- move everyone
    let near = 0, killed = 0;
    const swatAt = this._w.copy(w.player.eye).addScaledVector(w.player.dir, 0.45);
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      a.t += dt; a.st += dt;
      if (Math.hypot(a.pos.x - P.x, a.pos.z - P.z) > (a.kind === 'dragonfly' ? 90 : 55) || !a.alive) { this.agents.splice(i, 1); continue; }
      switch (a.kind) {
        case 'firefly': this.firefly(a, w, dt); break;
        case 'moth': this.moth(a, w, dt); break;
        case 'mosquito': {
          this.mosquito(a, w, dt);
          const de = a.pos.distanceTo(w.player.eye);
          if (de < 1.2) near += 1 - de / 1.2;
          if (w.swat && a.pos.distanceTo(swatAt) < 0.55) { a.alive = false; killed++; }
          break;
        }
        case 'midge': this.midge(a, dt); break;
        case 'butterfly': this.butterfly(a, w, dt); break;
        case 'bee': this.bee(a, w, dt); break;
        case 'dragonfly': this.dragonfly(a, w, dt); break;
        case 'ant': case 'beetle': this.crawl(a, dt); break;
        case 'spider': break;
      }
      // the season's or the hour's end: they fade out of the pool
      if ((a.kind === 'firefly' && !(F || night)) || (a.kind === 'butterfly' && !(F || day)) || (a.kind === 'bee' && !(F || day))) if (Math.random() < dt * 0.3) a.alive = false;
    }
    if (killed) w.swatted(killed);
    this.nearEar = near;
    this.webUpdate(w, dt);
    this.lastPlayer.copy(P);
    this.write();
  }

  private fill(k: BugKind, n: number, w: BugWorld, place: (a: Agent) => void): void {
    let have = this.count(k);
    let tries = 0;
    while (have < n && tries++ < 8) {
      const a = this.add(k, 0, 0, 0);
      if (!a) return;
      place(a);
      if (!Number.isFinite(a.pos.y) || a.pos.y < -1e5) { a.alive = false; continue; }
      if (k !== 'midge') a.home.copy(a.pos);
      have++;
    }
    // too many (the hour turned): let some go
    if (have > n + 2) for (const a of this.agents) if (a.kind === k && Math.random() < 0.05) a.alive = false;
    void w;
  }
  /** somewhere open (meadow, verge, burn) round the player */
  private placeOpen(a: Agent, w: BugWorld, r0: number, r1: number, y0: number, y1: number): void {
    const P = w.player.pos;
    let best = -1, bx = P.x, bz = P.z;
    for (let i = 0; i < 6; i++) {
      const ang = rnd(0, TAU), d = rnd(r0, r1), x = P.x + Math.sin(ang) * d, z = P.z + Math.cos(ang) * d;
      if (w.heightAt(x, z) < w.waterY + 0.2) continue;
      const o = w.open(x, z) + Math.random() * 0.25;
      if (o > best) { best = o; bx = x; bz = z; }
    }
    if (best < 0.3 && !this.forced) { a.pos.y = -1e6; return; }
    a.pos.set(bx, w.heightAt(bx, bz) + rnd(y0, y1), bz);
  }
  private placeShore(a: Agent, w: BugWorld): void {
    const L = w.lake, P = w.player.pos;
    const ang = Math.atan2(P.x - L.x, P.z - L.z) + rnd(-0.5, 0.5), d = L.r * rnd(0.75, 1.0);
    a.pos.set(L.x + Math.sin(ang) * d, 0, L.z + Math.cos(ang) * d);
    a.pos.y = Math.max(w.waterY, w.heightAt(a.pos.x, a.pos.z)) + rnd(0.4, 1.4);
  }

  /** moths: up to six round each light; a few in the flashlight beam */
  private moths(w: BugWorld, on: boolean): void {
    if (!on) { for (const a of this.agents) if (a.kind === 'moth' && Math.random() < 0.1) a.alive = false; return; }
    const srcs: THREE.Vector3[] = [];
    for (const l of w.lights) if (l.distanceTo(w.player.pos) < 40) srcs.push(l);
    const need = new Map<number, number>();
    srcs.forEach((_, i) => need.set(i + 1, 6));
    if (w.flash) need.set(-1, 5);
    const have = new Map<number, number>();
    for (const a of this.agents) if (a.kind === 'moth') have.set(a.owner, (have.get(a.owner) ?? 0) + 1);
    for (const [k, n] of need) {
      const c = k === -1 ? this._v.copy(w.flash!.pos).addScaledVector(w.flash!.dir, 2) : srcs[k - 1];
      for (let i = have.get(k) ?? 0; i < n; i++) {
        const a = this.add('moth', c.x + rnd(-3, 3), c.y + rnd(-0.5, 1.5), c.z + rnd(-3, 3), k);
        if (!a) break;
        a.home.copy(c); a.u = rnd(0.25, 1.0); a.lane = rnd(0.6, 1.6) * (Math.random() < 0.5 ? -1 : 1);
      }
    }
    // moths whose light went out drift off
    for (const a of this.agents) if (a.kind === 'moth' && !need.has(a.owner) && Math.random() < 0.02) a.alive = false;
    // keep their lights' positions current (fires do not move; the flashlight does)
    for (const a of this.agents) if (a.kind === 'moth') { if (a.owner === -1 && w.flash) a.home.copy(w.flash.pos).addScaledVector(w.flash.dir, 1.7); else if (a.owner > 0 && srcs[a.owner - 1]) a.home.copy(srcs[a.owner - 1]); }
  }

  /** ants and beetles on the logs and stumps round the player; fresh stumps get a crowd */
  private crawlers(w: BugWorld, on: boolean): void {
    if (!on) return;
    const P = w.player.pos;
    const surfs: { key: number; a: THREE.Vector3; b: THREE.Vector3; r: number; stump: boolean; ants: number; beetles: number }[] = [];
    let key = 1000;
    for (const s of w.solids(P.x, P.z, 14)) {
      if (s.kind === 'log' || s.kind === 'deadfall') surfs.push({ key: key++, a: new THREE.Vector3(s.x, s.y, s.z), b: new THREE.Vector3(s.x2 ?? s.x, s.y2 ?? s.y, s.z2 ?? s.z), r: s.r, stump: false, ants: 6, beetles: 1 });
      else if (s.kind === 'stump') surfs.push({ key: key++, a: new THREE.Vector3(s.x, s.y + s.h, s.z), b: new THREE.Vector3(s.x, s.y + s.h, s.z), r: s.r * 0.9, stump: true, ants: 4, beetles: Math.random() < 0.5 ? 1 : 0 });
      if (surfs.length > 6) break;
    }
    for (const st of this.stumps) if (Math.hypot(st.x - P.x, st.z - P.z) < 25) {
      const fresh = Math.min(1, (this.time - st.t) / 40);
      surfs.push({ key: 1 + this.stumps.indexOf(st), a: new THREE.Vector3(st.x, st.y, st.z), b: new THREE.Vector3(st.x, st.y, st.z), r: st.r, stump: true, ants: Math.round(4 + 18 * fresh), beetles: Math.round(1 + 3 * fresh) });
    }
    // the surfaces are re-found every tick: key them by position so agents keep theirs
    for (const s of surfs) {
      const id = Math.round(s.a.x * 7.13 + s.a.z * 3.71) | 0;
      let nA = 0, nB = 0;
      for (const a of this.agents) if (a.owner === id) { if (a.kind === 'ant') nA++; else if (a.kind === 'beetle') nB++; }
      for (let i = nA; i < s.ants; i++) this.addCrawler('ant', s, id);
      for (let i = nB; i < s.beetles; i++) this.addCrawler('beetle', s, id);
    }
  }
  private addCrawler(k: 'ant' | 'beetle', s: { a: THREE.Vector3; b: THREE.Vector3; r: number; stump: boolean }, id: number): void {
    const a = this.add(k, s.a.x, s.a.y, s.a.z, id);
    if (!a) return;
    a.surf = { a: s.a.clone(), b: s.b.clone(), r: s.r, stump: s.stump };
    a.u = Math.random(); a.lane = rnd(-0.6, 0.6); a.heading = rnd(0, TAU); a.state = Math.random() < 0.5 ? 1 : -1;
  }

  // ------------------------------------------------------------------ behaviours
  private firefly(a: Agent, w: BugWorld, dt: number): void {
    // drift; the flash comes every ~5.5 s (a J-shaped climb while it glows); neighbours pull each other into step
    if (a.st > a.next) { a.next = a.st + rnd(1, 3); a.vel.set(rnd(-0.3, 0.3), rnd(-0.08, 0.08), rnd(-0.3, 0.3)); }
    const period = 4.5 + (a.size * 1000 % 2.5);
    a.phase = (a.phase + dt / period) % 1;
    const pull = Math.sin((this.time / period) * TAU - a.phase * TAU) * 0.004 * dt * 10;
    a.phase = (a.phase + pull + 1) % 1;
    const fl = a.phase < 0.16 ? Math.pow(Math.sin((a.phase / 0.16) * Math.PI), 0.7) : 0;
    a.glow = fl;
    a.pos.addScaledVector(a.vel, dt); a.pos.y += fl * dt * 0.25;
    const gy = w.heightAt(a.pos.x, a.pos.z);
    if (a.pos.y < gy + 0.25) a.pos.y = gy + 0.25; if (a.pos.y > gy + 3) a.vel.y = -0.05;
    a.heading = Math.atan2(a.vel.x, a.vel.z); a.pitch = 0.2;
    a.flap = [fl > 0 ? 0 : 9, 0.5, 0.25];
  }
  private moth(a: Agent, w: BugWorld, dt: number): void {
    // a lopsided spiral round the light, a dart in to bump it now and then
    const c = a.home;
    a.u += dt * a.lane * 2.2;
    const r = (a.state === 1 ? 0.12 : 0.35 + 0.5 * Math.abs(Math.sin(a.t * 0.37 + a.phase * 9))) * (a.owner === -1 ? 0.6 : 1);
    if (a.st > a.next) { a.next = a.st + rnd(0.6, 2.5); a.state = Math.random() < 0.3 ? 1 : 0; }
    this._v.set(c.x + Math.cos(a.u) * r, c.y + Math.sin(a.u * 1.7 + a.phase * 5) * 0.25 + 0.1, c.z + Math.sin(a.u) * r);
    a.vel.subVectors(this._v, a.pos).multiplyScalar(4);
    a.pos.addScaledVector(a.vel, dt);
    a.pos.x += rnd(-1, 1) * dt * 0.6; a.pos.y += rnd(-1, 1) * dt * 0.6; a.pos.z += rnd(-1, 1) * dt * 0.6;
    a.heading = Math.atan2(a.vel.x, a.vel.z); a.pitch = -0.3; a.roll = Math.sin(a.t * 7) * 0.4;
    a.flap = [11, 0.75, 0.35];
    void w;
  }
  private mosquito(a: Agent, w: BugWorld, dt: number): void {
    // home on the head, hang about it, dodge in and out (the whine comes and goes)
    const E = w.player.eye;
    if (a.st > a.next) { a.next = a.st + rnd(0.3, 1.2); a.home.set(rnd(-0.6, 0.6), rnd(-0.35, 0.3), rnd(-0.6, 0.6)); }
    const d = a.pos.distanceTo(E);
    this._v.copy(E).add(a.home);
    if (d > 16) this._v.set(a.pos.x + rnd(-1, 1), a.pos.y, a.pos.z + rnd(-1, 1));
    a.vel.lerp(this._v.sub(a.pos).clampLength(0, 1.6), 1 - Math.exp(-3 * dt));
    a.pos.addScaledVector(a.vel, dt);
    a.pos.x += rnd(-1, 1) * dt * 0.5; a.pos.y += rnd(-1, 1) * dt * 0.5; a.pos.z += rnd(-1, 1) * dt * 0.5;
    a.heading = Math.atan2(a.vel.x, a.vel.z); a.pitch = 0;
    a.flap = [30, 0.6, 0.2];
  }
  private midge(a: Agent, dt: number): void {
    // the dancing column: up and down through the swarm's centre
    this._v.set(a.home.x + Math.sin(a.t * 2.1 + a.phase * 9) * 0.35, a.home.y + Math.sin(a.t * (1.1 + a.phase) + a.phase * 20) * 0.7, a.home.z + Math.cos(a.t * 1.7 + a.phase * 7) * 0.35);
    a.pos.lerp(this._v, 1 - Math.exp(-4 * dt));
    a.flap = [40, 0.5, 0.3];
  }
  private butterfly(a: Agent, w: BugWorld, dt: number): void {
    if (a.state === 1) {
      // landed on a flower: wings slowly open and close
      a.flap = [0.4, 0.5, 0.9];
      if (a.st > a.next) { a.state = 0; a.st = 0; a.next = rnd(3, 8); }
      return;
    }
    if (a.st > a.next) {
      a.st = 0; a.next = rnd(2, 6);
      if (Math.random() < 0.35) { a.state = 1; a.next = rnd(2, 6); a.pos.y = w.heightAt(a.pos.x, a.pos.z) + rnd(0.25, 0.6); a.pitch = 0; a.roll = 0; return; }
      const ang = Math.atan2(a.home.x - a.pos.x, a.home.z - a.pos.z) * 0.5 + rnd(-1.5, 1.5);
      a.vel.set(Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(rnd(0.6, 1.4));
    }
    a.pos.addScaledVector(a.vel, dt);
    const gy = w.heightAt(a.pos.x, a.pos.z);
    a.pos.y = gy + 0.8 + Math.sin(a.t * 3.1 + a.phase * 7) * 0.35 + Math.sin(a.t * 7.3) * 0.08;
    a.heading = Math.atan2(a.vel.x, a.vel.z); a.pitch = 0.15; a.roll = Math.sin(a.t * 2) * 0.2;
    a.flap = [5.5, 0.85, 0.4];
  }
  private bee(a: Agent, w: BugWorld, dt: number): void {
    if (a.st > a.next) {
      a.st = 0; a.next = rnd(0.4, 1.6);
      // zig-zag to the next flower
      a.home.set(a.pos.x + rnd(-1.8, 1.8), 0, a.pos.z + rnd(-1.8, 1.8));
      a.home.y = w.heightAt(a.home.x, a.home.z) + rnd(0.2, 0.7);
    }
    this._v.subVectors(a.home, a.pos);
    a.vel.lerp(this._v.clampLength(0, 2.2), 1 - Math.exp(-5 * dt));
    a.pos.addScaledVector(a.vel, dt);
    a.pos.y += Math.sin(a.t * 13) * dt * 0.2;
    if (a.vel.lengthSq() > 0.01) a.heading = Math.atan2(a.vel.x, a.vel.z);
    a.flap = [45, 0.45, 0.15];
  }
  private dragonfly(a: Agent, w: BugWorld, dt: number): void {
    // dart, hover, dart: along the shore, low over the water
    if (a.st > a.next) {
      a.st = 0;
      if (a.state === 0) {
        a.state = 1; a.next = rnd(0.4, 1.2);
        const L = w.lake, ang = Math.atan2(a.pos.x - L.x, a.pos.z - L.z) + rnd(-0.12, 0.12);
        const d = L.r * rnd(0.72, 1.02);
        a.home.set(L.x + Math.sin(ang) * d, 0, L.z + Math.cos(ang) * d);
        a.home.y = Math.max(w.waterY, w.heightAt(a.home.x, a.home.z)) + rnd(0.4, 1.5);
      } else { a.state = 0; a.next = rnd(0.5, 2.2); }
    }
    if (a.state === 1) {
      this._v.subVectors(a.home, a.pos);
      a.vel.lerp(this._v.clampLength(0, 7), 1 - Math.exp(-8 * dt));
      if (a.vel.lengthSq() > 0.5) a.heading = Math.atan2(a.vel.x, a.vel.z);
    } else a.vel.multiplyScalar(Math.exp(-10 * dt));
    a.pos.addScaledVector(a.vel, dt);
    a.pos.y += Math.sin(a.t * 6) * dt * 0.05;
    a.pitch = 0; a.roll = 0;
    a.flap = [28, 0.12, 0.05];
  }
  private crawl(a: Agent, dt: number): void {
    const s = a.surf!;
    const speed = a.kind === 'ant' ? 0.05 : 0.012;
    if (a.kind === 'beetle' && a.st > a.next) { a.st = 0; a.next = rnd(1, 4); a.state = Math.random() < 0.4 ? 0 : (Math.random() < 0.5 ? 1 : -1); }
    if (s.stump) {
      // wander over the cut face
      a.heading += rnd(-3, 3) * dt;
      const sp = a.state === 0 ? 0 : speed;
      a.pos.x += Math.sin(a.heading) * sp * dt; a.pos.z += Math.cos(a.heading) * sp * dt;
      const dx = a.pos.x - s.a.x, dz = a.pos.z - s.a.z, d = Math.hypot(dx, dz);
      if (d > s.r * 0.92) { a.heading = Math.atan2(-dx, -dz) + rnd(-0.6, 0.6); a.pos.x = s.a.x + dx / d * s.r * 0.9; a.pos.z = s.a.z + dz / d * s.r * 0.9; }
      a.pos.y = s.a.y + 0.002;
      a.pitch = 0; a.roll = 0;
    } else {
      // up and down the log's top, a little either side
      const L = s.a.distanceTo(s.b) || 1;
      a.u += (a.state === 0 ? 0 : a.state) * speed * dt / L;
      if (a.u > 1 || a.u < 0) { a.state = -a.state || 1; a.u = Math.min(1, Math.max(0, a.u)); }
      a.lane += rnd(-1, 1) * dt * 0.4; a.lane = Math.max(-0.7, Math.min(0.7, a.lane));
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, dy = s.b.y - s.a.y;
      const yaw = Math.atan2(dx, dz), side = a.lane;
      a.pos.set(s.a.x + dx * a.u + Math.cos(yaw) * side * s.r, s.a.y + dy * a.u + s.r * Math.cos(side * 1.1) + 0.002, s.a.z + dz * a.u - Math.sin(yaw) * side * s.r);
      a.heading = yaw + (a.state < 0 ? Math.PI : 0) + Math.sin(a.t * 9) * 0.15;
      a.roll = side * 1.1 * (a.state < 0 ? -1 : 1); a.pitch = -Math.atan2(dy, Math.hypot(dx, dz)) * (a.state < 0 ? -1 : 1);
    }
    a.flap = [0, 0, 0];
  }

  // ------------------------------------------------------------------ spider webs
  private spiders(w: BugWorld): void {
    const P = w.player.pos;
    for (const web of this.webs) if (web.alive && web.c.distanceTo(P) > 45) { web.alive = false; web.obj.removeFromParent(); if (web.spider) web.spider.alive = false; }
    this.webs = this.webs.filter((wb) => wb.alive);
    if (this.webs.length >= 3 || Math.random() > 0.15) return;
    // two trunks a stride apart, out of the player's face
    const st = w.stands(P.x + w.player.dir.x * 10, P.z + w.player.dir.z * 10, 14);
    for (let i = 0; i < 6; i++) {
      const A = st[(Math.random() * st.length) | 0], B = st[(Math.random() * st.length) | 0];
      if (!A || !B || A === B) continue;
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      if (d < 1.2 || d > 3.2) continue;
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      if (Math.hypot(mx - P.x, mz - P.z) < 4) continue;
      this.makeWeb(w, A, B);
      return;
    }
  }
  private makeWeb(w: BugWorld, A: { x: number; z: number; r: number }, B: { x: number; z: number; r: number }): void {
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, gy = w.heightAt(mx, mz);
    const c = new THREE.Vector3(mx, gy + rnd(0.9, 1.7), mz);
    const ax = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
    const n = new THREE.Vector3(-ax.z, 0, ax.x);
    const half = Math.hypot(A.x - B.x, A.z - B.z) / 2;
    const r = Math.min(0.55, half - 0.2);
    const pts: number[] = [], dew: number[] = [];
    const P = (u: number, v: number) => [c.x + ax.x * u, c.y + v, c.z + ax.z * u];
    // anchor threads to the two trunks and up and down
    const spokes = 22;
    const edge = (ang: number) => [Math.cos(ang) * r, Math.sin(ang) * r * 1.1];
    for (let i = 0; i < spokes; i++) {
      const ang = (i / spokes) * TAU + rnd(-0.05, 0.05), [u, v] = edge(ang);
      pts.push(...P(0, 0), ...P(u, v));
    }
    pts.push(...P(-r, 0), ...P(-(half - A.r), 0.05), ...P(r, 0.05), ...P(half - B.r, 0.1), ...P(0, r * 1.1), ...P(rnd(-0.2, 0.2), r * 1.1 + 0.6));
    // the capture spiral
    let prev: number[] | null = null;
    for (let k = 0; k < spokes * 11; k++) {
      const ang = (k / spokes) * TAU, rr = r * (0.12 + 0.86 * (k / (spokes * 11)));
      const p = P(Math.cos(ang) * rr, Math.sin(ang) * rr * 1.1);
      if (prev) pts.push(...prev, ...p);
      prev = p;
      if (k % 3 === 0) dew.push(...p);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, this.webMat);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dew, 3));
    const dewPts = new THREE.Points(dg, this.dewMat);
    const obj = new THREE.Group(); obj.add(lines, dewPts); obj.name = 'web';
    lines.frustumCulled = false; dewPts.frustumCulled = false;
    this.object.add(obj);
    const sp = this.add('spider', c.x, c.y, c.z, -2);
    if (sp) { sp.flap = [0, 0, 0]; sp.heading = Math.atan2(n.x, n.z); }
    this.webs.push({ c, n, r, alive: true, obj, spider: sp, dew: dewPts, t: 0 });
  }
  private webUpdate(w: BugWorld, dt: number): void {
    const h = ((w.hour % 24) + 24) % 24;
    // dew in the morning, gone by mid-day
    this.dewMat.opacity = h > 4.5 && h < 10 ? Math.min(1, (10 - h) / 2) * 0.9 : 0;
    const P = w.player.pos, L = this.lastPlayer;
    for (const web of this.webs) {
      if (!web.alive) continue;
      web.t += dt;
      // walked through it? (the segment last -> now crosses its plane within the web, at face height)
      const a = (L.x - web.c.x) * web.n.x + (L.z - web.c.z) * web.n.z, b = (P.x - web.c.x) * web.n.x + (P.z - web.c.z) * web.n.z;
      if (L.x < 1e8 && a * b <= 0 && Math.hypot(P.x - web.c.x, P.z - web.c.z) < web.r + 0.35 && web.c.y > P.y + 0.4 && web.c.y < P.y + 2.0) {
        web.alive = false; web.obj.removeFromParent();
        if (web.spider) web.spider.alive = false;
        w.say('web', 'Pah! Cobweb, right across my face. Something just ran down my collar.');
      }
    }
  }

  // ------------------------------------------------------------------ write the instances
  private write(): void {
    const m = this._m, q = this._q, e = this._e, s = this._s;
    const C = this.aCell.array as Float32Array, Fl = this.aFlap.array as Float32Array, Gl = this.aGlow.array as Float32Array;
    let n = 0, g = 0;
    for (const a of this.agents) {
      if (!a.alive || n >= MAX) continue;
      e.set(a.pitch, a.heading, a.roll, 'YXZ');
      q.setFromEuler(e);
      if (a.kind === 'spider') {
        // hanging head-down in the middle of its web, facing out of it
        e.set(Math.PI / 2, a.heading, 0, 'YXZ'); q.setFromEuler(e);
      }
      s.setScalar(a.size);
      m.compose(a.pos, q, s);
      this.mesh.setMatrixAt(n, m);
      const cx = a.cell % 4, cy = Math.floor(a.cell / 4);
      C[n * 4] = cx / 4; C[n * 4 + 1] = 1 - (cy + 1) / 4; C[n * 4 + 2] = 0.25; C[n * 4 + 3] = 0.25;
      Fl[n * 4] = a.flap[0]; Fl[n * 4 + 1] = a.flap[1]; Fl[n * 4 + 2] = a.flap[2]; Fl[n * 4 + 3] = a.phase * TAU;
      Gl[n] = a.glow;
      n++;
      if (a.kind === 'firefly' && a.glow > 0.02 && g < MAX) {
        this.glowPos[g * 3] = a.pos.x; this.glowPos[g * 3 + 1] = a.pos.y; this.glowPos[g * 3 + 2] = a.pos.z;
        const k = a.glow;
        this.glowCol[g * 3] = 0.9 * k; this.glowCol[g * 3 + 1] = 1.2 * k; this.glowCol[g * 3 + 2] = 0.3 * k;
        g++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aCell.needsUpdate = true; this.aFlap.needsUpdate = true; this.aGlow.needsUpdate = true;
    const gg = this.glowPts.geometry;
    gg.setDrawRange(0, g);
    (gg.attributes.position as THREE.BufferAttribute).needsUpdate = true; (gg.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  get active(): number { return this.mesh.count; }
  /** where the first live one of a kind is (test pages) */
  find(kind: BugKind, i = 0): THREE.Vector3 | null { let n = 0; for (const a of this.agents) if (a.kind === kind && a.alive && n++ === i) return a.pos; return null; }
  /** how many of each kind are out (test pages) */
  census(): Record<string, number> { const o: Record<string, number> = {}; for (const a of this.agents) o[a.kind] = (o[a.kind] ?? 0) + 1; return o; }
  dispose(): void { this.object.removeFromParent(); this.mesh.geometry.dispose(); }
}
