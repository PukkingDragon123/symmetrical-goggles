// Tears as a small fluid system on any skinned creature (THREE.SkinnedMesh, e.g. the squonk, or a glb): drops well up
// at the tear sources (named anchors at the inner corners of the eyes), swell, and let go; run down the actual skinned skin under gravity and friction, leaving a wet
// film that glistens and dries; run together when they meet; hang from the jowls and the chin until they are heavy
// enough to drip (sooner at the drip edges: anchors at the chin and the jowls); fly off when the head shakes; fall through the air with drag; splash into a few droplets on the
// ground; and gather into puddles that spread, run a little downhill and soak in. When the creature dissolves its body
// runs off it and becomes a sheet of water on the ground (Puddles' sheet), which draws back in when it re-forms.
//
// Physics (SI units, water): a drop of radius r is held on the skin by surface tension against a pull away from it of
// at most K_HOLD / r^2 (m/s^2; a 3.2 mm drop just hangs from a ceiling), and pinned against sliding by contact-angle
// hysteresis up to K_PIN / r^2 (a 2.1 mm drop sticks to a vertical cheek); sliding, it feels kinetic pinning and a
// viscous drag, and loses volume to the film it leaves. The pull is gravity minus the acceleration of the skin under it,
// taken from the head bone's motion (a frame two steps back, one step back, now), so a head shake throws drops off.
// In the air: gravity and quadratic drag. On the ground: Weber number decides the splash.
//
// Cost: one instanced draw for every drop (cap `maxDrops`), one for the puddles; no allocation per frame; the owner
// skips update() (calls idle()) when nobody is near enough to see.
//
// Mesh-agnostic: everything comes from the SkinnedMesh (its geometry, skeleton, bind matrices and material) and the
// anchors, in the mesh's bind-pose space. Swap the body for another model and give it the same named anchors:
//   const t = new TearFluid({ mesh, ...TearFluid.anchorsFrom(mesh, { sources: ['tear_L', 'tear_R'], drips: ['drip_chin', 'drip_jowl_L', 'drip_jowl_R'] }) });
//   t.addTo(scene); every frame (after the pose): t.rate = ...; t.melt = ...; t.update({ dt, heightAt });
import * as THREE from 'three';
import { SkinPatch, type SurfPt } from './surface';
import { WetMap, patchSkin, meltPoint, type MeltShape } from './wetmap';
import { Puddles } from './puddles';
import { dropMaterial } from './water';

const G = 9.81, RHO_AIR = 1.2, GAMMA = 0.072, RHO = 1000;
const K_HOLD = 1.0e-4, K_PIN = 4.5e-5, KINETIC = 0.55, VISC = 22, FILM = 3e-5;
/** the lid margin holds a welling drop harder than open skin */
const CORNER = 2.2;
/** smallest drop worth keeping (m3): about a 0.6 mm bead */
const V_MIN = 1e-9;
/** evaporation of a resting bead: dV/dt = -K_EVAP r */
const K_EVAP = 3.5e-7;
/** drawn a touch larger than life so they read at a distance */
const VIS = 1.15;
const FREE = 0, WELL = 1, SURF = 2, FALL = 3, SPRAY = 4;

export interface TearAnchors {
  /** tear sources: where the tears well up (the inner corners of the eyes); bind-pose positions in the mesh's space */
  sources: THREE.Vector3[];
  /** drip edges: where hanging drops let go (the chin, the jowls); they also bound the face the tears run over */
  drips?: THREE.Vector3[];
}
export interface TearOpts extends TearAnchors {
  /** the creature: tears run on its skin, its material (and shadow material) show the wet film and the melt */
  mesh: THREE.SkinnedMesh;
  /** the bone whose motion flings the drops (name or index); by default the bone that carries most of the face */
  head?: string | number;
  /** how far round the anchors the face reaches (m); by default 60% of the anchors' spread */
  margin?: number;
  /** aReg region tags that hold the face and the body that runs off as it melts (only if the geometry has aReg) */
  regs?: number[]; bodyRegs?: number[];
  /** the body for the melt (mesh-local): centre x, z, radius, ground y; by default from the geometry's bounds */
  melt?: MeltShape;
  /** draw the wet film and the melt into the mesh's material (default true) */
  skin?: boolean;
  maxDrops?: number;
  /** water in the whole body (m3): the sheet it melts into */
  bodyVolume?: number;
}
export interface TearFrame {
  dt: number;
  heightAt(x: number, z: number): number;
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _f = new THREE.Vector3();
const _rp = new THREE.Vector3(), _rn = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _hq = new THREE.Quaternion(), _sp: SurfPt = { t: 0, b1: 0, b2: 0 }, _sc = new THREE.Vector3(), _inv = new THREE.Matrix4();

export class TearFluid {
  readonly drops: THREE.InstancedMesh;
  readonly puddles: Puddles;
  readonly wet: WetMap;
  readonly patch: SkinPatch;
  /** tear production per eye (m3/s); the owner sets it from the mood every frame */
  rate = 0;
  /** 0 solid .. 1 melted; the owner sets it every frame */
  melt = 0;
  /** what happened (tests and debugging) */
  readonly stats = { released: 0, merged: 0, dripped: 0, flung: 0, splashed: 0, spray: 0, landed: 0, live: 0, onFace: 0, falling: 0 };
  private now = 0;
  private readonly max: number;
  private kind: Uint8Array; private eye: Int8Array;
  private tri: Int32Array; private b1: Float32Array; private b2: Float32Array;
  /** world position, velocity (relative to the skin while on it), the skin normal, the last painted rest point */
  private P: Float32Array; private Vl: Float32Array; private N: Float32Array; private RP: Float32Array;
  private vol: Float32Array; private age: Float32Array;
  private anchors: SurfPt[];
  private well: Int32Array; private cool: Float32Array;
  private drips: Float32Array; private dripR: number;
  readonly mesh: THREE.SkinnedMesh; readonly head: number;
  readonly meltShape: MeltShape;
  /** the head's world frame now, a step back, two steps back */
  private hp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private hq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  private hdt = [0, 0]; private hn = 0;
  private body: SkinPatch | null = null; private bodyRegs: number[] | undefined;
  private meltWas = 0; private sheetOn = false; private bodyVolume: number;
  private sweepT = 0;
  constructor(o: TearOpts) {
    this.max = o.maxDrops ?? 64;
    this.mesh = o.mesh; this.bodyRegs = o.bodyRegs;
    this.bodyVolume = o.bodyVolume ?? 3.5e-3;
    // the face: the surface round the sources and the drip edges
    const all = [...o.sources, ...(o.drips ?? [])], ab = new THREE.Box3().setFromPoints(all), spread = ab.getSize(new THREE.Vector3());
    const m = o.margin ?? Math.max(0.02, 0.6 * Math.max(spread.x, spread.y, spread.z));
    ab.expandByScalar(m);
    this.patch = SkinPatch.from(o.mesh, { regs: o.regs, box: { min: ab.min.toArray(), max: ab.max.toArray() }, seeds: all, seedR: Math.max(0.006, m * 0.12) });
    this.anchors = o.sources.map((a) => this.patch.closestRest(a, { t: 0, b1: 0, b2: 0 }));
    this.well = new Int32Array(this.anchors.length).fill(-1); this.cool = new Float32Array(this.anchors.length);
    this.drips = new Float32Array((o.drips ?? []).flatMap((d) => [d.x, d.y, d.z])); this.dripR = Math.max(0.01, m * 0.25);
    // the head: named, or the bone carrying most of the face
    const bones = o.mesh.skeleton.bones;
    if (typeof o.head === 'number') this.head = o.head;
    else if (typeof o.head === 'string') this.head = Math.max(0, bones.findIndex((b) => b.name === o.head));
    else { let bi = 0; this.patch.boneWeight.forEach((w, i) => { if (w > this.patch.boneWeight[bi]) bi = i; }); this.head = this.patch.usedBones[bi] ?? 0; }
    // the melt's body, from the geometry's bounds unless given
    if (!o.mesh.geometry.boundingBox) o.mesh.geometry.computeBoundingBox();
    const gb = o.mesh.geometry.boundingBox!, gc = gb.getCenter(new THREE.Vector3()), gs = gb.getSize(new THREE.Vector3());
    this.meltShape = o.melt ?? { x: gc.x, z: gc.z, r: Math.max(gs.x, gs.z) * 0.5, ground: gb.min.y };
    const n = this.max;
    this.kind = new Uint8Array(n); this.eye = new Int8Array(n);
    this.tri = new Int32Array(n); this.b1 = new Float32Array(n); this.b2 = new Float32Array(n);
    this.P = new Float32Array(n * 3); this.Vl = new Float32Array(n * 3); this.N = new Float32Array(n * 3); this.RP = new Float32Array(n * 3);
    this.vol = new Float32Array(n); this.age = new Float32Array(n);
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), dropMaterial(), n);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.count = 0; this.drops.frustumCulled = false; this.drops.name = 'tearDrops'; this.drops.renderOrder = 2;
    this.puddles = new Puddles();
    this.wet = new WetMap(this.patch.bounds().expandByScalar(0.004), this.meltShape);
    if (o.skin !== false) {
      const mats = Array.isArray(o.mesh.material) ? o.mesh.material : [o.mesh.material];
      for (const mt of mats) patchSkin(mt, o.mesh.customDepthMaterial ?? null, this.wet.uniforms);
    }
  }
  /** anchors from named nodes under the mesh's root (empties parented to the head, say), in the mesh's bind space;
   *  call it while the model is in its bind pose */
  static anchorsFrom(mesh: THREE.SkinnedMesh, names: { sources: string[]; drips?: string[] }): TearAnchors {
    let root: THREE.Object3D = mesh; while (root.parent) root = root.parent;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const at = (n: string) => { const ob = root.getObjectByName(n); if (!ob) throw new Error('no tear anchor ' + n); return ob.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv); };
    return { sources: names.sources.map(at), drips: (names.drips ?? []).map(at) };
  }
  /** add the drops and the puddles to a scene (or any parent) */
  addTo(parent: THREE.Object3D) { if (this.drops.parent !== parent) { parent.add(this.drops); parent.add(this.puddles.mesh); } }
  get time() { return this.now; }

  // ---------------------------------------------------------------------------------------------- the frame
  /** nobody near: no drops, but the clocks keep running (the puddles and the films still soak in and dry), and a
   *  melt still slumps the body and fills or empties the sheet */
  idle(f: TearFrame) {
    const dt = Math.min(0.1, Math.max(0, f.dt));
    this.now += dt; this.hn = 0;
    this.wet.uniforms.uMelt.value = this.melt;
    this.sheet(f);
    this.wet.flush(this.now, dt); this.puddles.uNow.value = this.now; this.puddles.flush();
    this.drops.visible = false;
    this.housekeeping(dt);
  }
  /** a tear spot laid without simulating the drop (the trail while nobody is near enough to watch) */
  spot(x: number, z: number, vol: number, heightAt: (x: number, z: number) => number) {
    this.puddles.add(x, z, vol, this.now, heightAt, true); this.puddles.flush();
  }

  update(f: TearFrame) {
    const dt = Math.min(0.1, Math.max(0, f.dt));
    this.now += dt;
    this.drops.visible = true;
    this.patch.begin(this.mesh);
    this.headFrame(dt);
    for (let e = 0; e < this.cool.length; e++) this.cool[e] = Math.max(0, this.cool[e] - dt);
    this.wet.uniforms.uMelt.value = this.melt;
    const sub = dt > 1 / 40 ? 2 : 1, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.welling(h);
      this.onSkin(h);
    }
    this.mergeOnSkin();
    this.inAir(dt, f.heightAt);
    this.dissolve(f);
    this.puddles.update(dt, this.now, f.heightAt);
    this.puddles.flush();
    this.wet.flush(this.now, dt);
    this.housekeeping(dt);
    this.draw();
  }
  private housekeeping(dt: number) { this.sweepT += dt; if (this.sweepT > 4) { this.sweepT = 0; this.puddles.sweep(this.now); this.puddles.flush(); } }

  /** the head's world frame history (for the acceleration of the skin under a drop); the patch brought the bones'
   *  world matrices up to date */
  private headFrame(dt: number) {
    this.mesh.skeleton.bones[this.head].matrixWorld.decompose(_p, _hq, _sc);
    const p = _p;
    // a jump (the creature put somewhere new) starts the history afresh
    if (this.hn > 0 && (p.distanceToSquared(this.hp[0]) > 0.09 || dt <= 0)) this.hn = 0;
    this.hp[2].copy(this.hp[1]); this.hp[1].copy(this.hp[0]); this.hp[0].copy(p);
    this.hq[2].copy(this.hq[1]); this.hq[1].copy(this.hq[0]); this.hq[0].copy(_hq);
    this.hdt[1] = this.hdt[0]; this.hdt[0] = dt;
    this.hn = Math.min(3, this.hn + 1);
  }
  /** acceleration (and velocity) of the head's frame at world point p */
  private frameAcc(p: THREE.Vector3, acc: THREE.Vector3, vel: THREE.Vector3) {
    if (this.hn < 3 || this.hdt[0] <= 0 || this.hdt[1] <= 0) { acc.set(0, 0, 0); vel.set(0, 0, 0); return; }
    // the point in the head's frame now, carried back to where that frame was one and two steps ago
    _q.copy(p).sub(this.hp[0]).applyQuaternion(_hq.copy(this.hq[0]).invert());
    _x.copy(_q).applyQuaternion(this.hq[1]).add(this.hp[1]);
    _z.copy(_q).applyQuaternion(this.hq[2]).add(this.hp[2]);
    const d0 = this.hdt[0], d1 = this.hdt[1];
    vel.copy(p).sub(_x).divideScalar(d0);
    acc.copy(_x).sub(_z).divideScalar(d1).negate().add(vel).divideScalar((d0 + d1) * 0.5);
    const l = acc.length(); if (l > 400) acc.multiplyScalar(400 / l);
  }

  // ---------------------------------------------------------------------------------------------- drops
  private alloc(): number { for (let i = 0; i < this.max; i++) if (this.kind[i] === FREE) return i; return -1; }
  private free(i: number) { this.kind[i] = FREE; for (let e = 0; e < this.well.length; e++) if (this.well[e] === i) this.well[e] = -1; }
  private radius(i: number) { return Math.cbrt((3 * this.vol[i]) / (4 * Math.PI)); }
  private setP(i: number, v: THREE.Vector3) { this.P[i * 3] = v.x; this.P[i * 3 + 1] = v.y; this.P[i * 3 + 2] = v.z; }
  private getV(i: number, out: THREE.Vector3) { return out.set(this.Vl[i * 3], this.Vl[i * 3 + 1], this.Vl[i * 3 + 2]); }
  private setV(i: number, v: THREE.Vector3) { this.Vl[i * 3] = v.x; this.Vl[i * 3 + 1] = v.y; this.Vl[i * 3 + 2] = v.z; }

  /** tears well up at the anchors: a drop swells in each inner corner until it is too heavy to hold */
  private welling(dt: number) {
    const make = this.rate > 0 && this.melt < 0.25;
    for (let e = 0; e < this.anchors.length; e++) {
      let i = this.well[e];
      if (i < 0) {
        if (!make || this.cool[e] > 0) continue;
        i = this.alloc(); if (i < 0) continue;
        const A = this.anchors[e];
        this.kind[i] = WELL; this.eye[i] = e; this.well[e] = i;
        this.tri[i] = A.t; this.b1[i] = A.b1; this.b2[i] = A.b2; this.vol[i] = 2e-9; this.age[i] = 0;
        this.Vl[i * 3] = this.Vl[i * 3 + 1] = this.Vl[i * 3 + 2] = 0;
        this.patch.restPoint(A.t, A.b1, A.b2, _rp); this.RP[i * 3] = _rp.x; this.RP[i * 3 + 1] = _rp.y; this.RP[i * 3 + 2] = _rp.z;
      }
      // the two eyes do not keep step
      if (make) this.vol[i] += this.rate * dt * (e ? 0.93 : 1.07);
    }
  }

  /** the drops on the skin: held, pinned, sliding, flung off; a film painted behind each */
  private onSkin(dt: number) {
    const P = this.patch;
    for (let i = 0; i < this.max; i++) {
      const k = this.kind[i]; if (k !== WELL && k !== SURF) continue;
      this.age[i] += dt;
      const t = this.tri[i], r = this.radius(i);
      const p = P.point(t, this.b1[i], this.b2[i], _p), n = P.faceNormal(t, _n);
      this.frameAcc(p, _a, _f);
      // the pull in the skin's frame: gravity less the acceleration of the skin
      const gx = -_a.x, gy = -G - _a.y, gz = -_a.z;
      const off = gx * n.x + gy * n.y + gz * n.z;
      // a drip edge (the chin, a jowl) lets a hanging drop go sooner
      let hold = (K_HOLD / (r * r)) * (k === WELL ? CORNER : 1);
      if (k === SURF && this.drips.length && off > 0) { P.restPoint(t, this.b1[i], this.b2[i], _rp); if (this.nearDrip(_rp)) hold *= 0.5; }
      if (off > hold && r > 0.0009) { this.detach(i, p, n, _f, off > G + 1 ? 1 : 0); continue; }
      const tx = gx - off * n.x, ty = gy - off * n.y, tz = gz - off * n.z, gt = Math.hypot(tx, ty, tz);
      const pin = (K_PIN / (r * r)) * (k === WELL ? CORNER : 1);
      const v = this.getV(i, _v);
      if (k === WELL) {
        // the corner wets as it swells; it lets go when the slope's pull beats the lid margin's hold
        P.restPoint(t, this.b1[i], this.b2[i], _rp, _rn); this.wet.paint(_rp, _rn, r * 0.9, 0.9, this.now);
        if (gt > pin) {
          // it lets go; the corner starts a fresh one a moment later, when this one has run clear
          this.kind[i] = SURF; this.well[this.eye[i]] = -1; this.cool[this.eye[i]] = 0.3; this.age[i] = 0; this.stats.released++;
          v.set(0, 0, 0); this.setV(i, v);
        }
        continue;
      }
      v.addScaledVector(n, -v.dot(n));
      const sp = v.length();
      if (sp < 1e-4 && gt <= pin) {
        // a resting bead: it sits, and slowly dries away
        v.set(0, 0, 0); this.setV(i, v);
        this.vol[i] -= K_EVAP * r * dt;
        if (this.vol[i] < V_MIN) this.free(i);
        continue;
      }
      // sliding: the tangential pull, kinetic pinning against the motion, viscous drag
      _q.set(tx, ty, tz);
      if (sp > 1e-4) _q.addScaledVector(v, -(pin * KINETIC) / sp); else if (gt > 0) _q.multiplyScalar(1 - (pin * KINETIC) / gt);
      _q.addScaledVector(v, -VISC);
      const before = sp;
      v.addScaledVector(_q, dt);
      // it stops rather than turning round where the pull no longer beats the pinning
      if (before > 1e-4 && v.dot(_x.copy(v).addScaledVector(_q, -dt)) < 0 && gt <= pin) v.set(0, 0, 0);
      const ds = v.length() * dt;
      _sp.t = t; _sp.b1 = this.b1[i]; _sp.b2 = this.b2[i];
      _z.copy(v).multiplyScalar(dt);
      const on = P.walk(_sp, _z, v);
      this.tri[i] = _sp.t; this.b1[i] = _sp.b1; this.b2[i] = _sp.b2; this.setV(i, v);
      // the film it leaves behind (volume, and painted onto the skin along the way)
      this.vol[i] -= FILM * 1.4 * r * ds;
      this.film(i, r);
      if (!on) { P.point(_sp.t, _sp.b1, _sp.b2, _p); P.faceNormal(_sp.t, _n); this.detach(i, _p, _n, _f, 0); continue; }
      if (this.vol[i] < V_MIN) this.free(i);
    }
  }
  private nearDrip(p: THREE.Vector3) {
    const D = this.drips, r2 = this.dripR * this.dripR;
    for (let k = 0; k < D.length; k += 3) if ((p.x - D[k]) ** 2 + (p.y - D[k + 1]) ** 2 + (p.z - D[k + 2]) ** 2 < r2) return true;
    return false;
  }
  /** paint the film from the last painted point to where the drop is now */
  private film(i: number, r: number) {
    this.patch.restPoint(this.tri[i], this.b1[i], this.b2[i], _rp, _rn);
    const ox = this.RP[i * 3], oy = this.RP[i * 3 + 1], oz = this.RP[i * 3 + 2];
    const d = Math.hypot(_rp.x - ox, _rp.y - oy, _rp.z - oz), steps = Math.min(12, Math.ceil(d / 0.0012));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      _q.set(ox + (_rp.x - ox) * u, oy + (_rp.y - oy) * u, oz + (_rp.z - oz) * u);
      this.wet.paint(_q, _rn, r * 0.75, 1, this.now);
    }
    if (steps > 0) { this.RP[i * 3] = _rp.x; this.RP[i * 3 + 1] = _rp.y; this.RP[i * 3 + 2] = _rp.z; }
  }
  /** off the skin and into the air: with the skin's own velocity and its slip */
  private detach(i: number, p: THREE.Vector3, n: THREE.Vector3, skinVel: THREE.Vector3, flung: number) {
    const r = this.radius(i);
    if (this.kind[i] === WELL) this.well[this.eye[i]] = -1;
    this.kind[i] = FALL;
    _v.set(this.Vl[i * 3], this.Vl[i * 3 + 1], this.Vl[i * 3 + 2]).add(skinVel).addScaledVector(n, 0.03);
    this.setV(i, _v);
    _q.copy(p).addScaledVector(n, r * 0.6); this.setP(i, _q);
    if (flung) this.stats.flung++; else this.stats.dripped++;
  }
  /** drops that meet on the skin run together (a welling drop keeps its corner) */
  private mergeOnSkin() {
    const P = this.patch;
    for (let i = 0; i < this.max; i++) {
      const ki = this.kind[i]; if (ki !== WELL && ki !== SURF) continue;
      P.point(this.tri[i], this.b1[i], this.b2[i], _p); this.setP(i, _p);
    }
    for (let i = 0; i < this.max; i++) {
      const ki = this.kind[i]; if (ki !== WELL && ki !== SURF) continue;
      const ri = this.radius(i);
      for (let j = i + 1; j < this.max; j++) {
        const kj = this.kind[j]; if (kj !== WELL && kj !== SURF) continue;
        if (ki === WELL && kj === WELL) continue;
        // a drop just let go is not swallowed back by the corner
        if ((ki === WELL && this.age[j] < 0.5) || (kj === WELL && this.age[i] < 0.5)) continue;
        const dx = this.P[i * 3] - this.P[j * 3], dy = this.P[i * 3 + 1] - this.P[j * 3 + 1], dz = this.P[i * 3 + 2] - this.P[j * 3 + 2];
        const rr = (ri + this.radius(j)) * 0.85;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        // into the welling one, else the bigger; momentum kept
        const keep = kj === WELL || (ki !== WELL && this.vol[j] > this.vol[i]) ? j : i, gone = keep === i ? j : i;
        const vk = this.vol[keep], vg = this.vol[gone], s = vk + vg;
        for (let c = 0; c < 3; c++) this.Vl[keep * 3 + c] = (this.Vl[keep * 3 + c] * vk + this.Vl[gone * 3 + c] * vg) / s;
        this.vol[keep] = s; this.free(gone); this.stats.merged++;
        if (gone === i) break;
      }
    }
  }
  /** in the air: gravity and drag; the ground: a splash and a puddle */
  private inAir(dt: number, heightAt: (x: number, z: number) => number) {
    for (let i = 0; i < this.max; i++) {
      const k = this.kind[i]; if (k !== FALL && k !== SPRAY) continue;
      this.age[i] += dt;
      const r = this.radius(i), kd = (3 * RHO_AIR * 0.47) / (8 * RHO * r);
      const v = this.getV(i, _v), s = v.length();
      v.y -= G * dt; v.multiplyScalar(1 / (1 + kd * s * dt));
      this.setV(i, v);
      const x = this.P[i * 3] + v.x * dt, y = this.P[i * 3 + 1] + v.y * dt, z = this.P[i * 3 + 2] + v.z * dt;
      this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
      const gy = heightAt(x, z);
      if (y - r * 0.5 > gy && this.age[i] < 6) continue;
      this.land(i, x, gy, z, s, k === SPRAY, heightAt);
    }
  }
  private land(i: number, x: number, gy: number, z: number, speed: number, spray: boolean, heightAt: (x: number, z: number) => number) {
    const r = this.radius(i), vol = this.vol[i];
    this.free(i); this.stats.landed++;
    // the splash: the faster and bigger the drop, the more droplets thrown (Weber number)
    const We = (RHO * speed * speed * 2 * r) / GAMMA;
    let n = spray ? 0 : Math.max(0, Math.min(4, Math.floor((We - 40) / 70)));
    let left = vol;
    if (n > 0) this.stats.splashed++;
    for (let s = 0; s < n; s++) {
      const j = this.alloc(); if (j < 0) { n = s; break; }
      const sv = vol * (0.05 + 0.04 * rnd()), a = rnd() * Math.PI * 2, out = speed * (0.12 + 0.18 * rnd()), up = speed * (0.12 + 0.16 * rnd());
      this.kind[j] = SPRAY; this.vol[j] = sv; this.age[j] = 0; left -= sv; this.stats.spray++;
      this.P[j * 3] = x + Math.cos(a) * r; this.P[j * 3 + 1] = gy + r; this.P[j * 3 + 2] = z + Math.sin(a) * r;
      this.Vl[j * 3] = Math.cos(a) * out; this.Vl[j * 3 + 1] = up; this.Vl[j * 3 + 2] = Math.sin(a) * out;
    }
    if (left > 0) this.puddles.add(x, z, left, this.now, heightAt);
  }

  // ---------------------------------------------------------------------------------------------- the dissolve
  /** the body melts: the drops on it run off, its hide runs off in streams, it becomes the sheet on the ground (and
   *  is taken back as it re-forms) */
  private dissolve(f: TearFrame) {
    const m = this.melt, dm = m - this.meltWas;
    this.meltWas = m;
    if (m > 0.12) for (let i = 0; i < this.max; i++) {
      const k = this.kind[i]; if (k !== WELL && k !== SURF) continue;
      this.patch.point(this.tri[i], this.b1[i], this.b2[i], _p); this.patch.faceNormal(this.tri[i], _n); this.frameAcc(_p, _a, _f);
      this.detach(i, _p, _n, _f, 0);
    }
    this.sheet(f);
    // the hide running off: streams of water from all over the sagging body while it melts
    if (dm > 0 && m > 0.1 && m < 0.95) {
      if (!this.body) this.body = SkinPatch.from(this.mesh, { regs: this.bodyRegs });
      const B = this.body, M = this.meltShape;
      B.begin(this.mesh);
      _inv.copy(this.mesh.matrixWorld).invert();
      let n = Math.min(6, Math.floor(dm * 180 + rnd()));
      while (n-- > 0) {
        const i = this.alloc(); if (i < 0) break;
        const t = Math.floor(rnd() * B.nt), u = rnd(), w = rnd() * (1 - u);
        B.point(t, u, w, _p); B.restPoint(t, u, w, _rp, _rn);
        // into the mesh's space, melted, and back out
        _q.copy(_p).applyMatrix4(_inv);
        if (_q.y - M.ground < 0.04 * M.r / 0.42) continue;
        meltPoint(_q, _rp, m, M);
        _p.copy(_q).applyMatrix4(this.mesh.matrixWorld); _p.y += 0.004;
        this.kind[i] = FALL; this.vol[i] = 3e-8 + rnd() * 6e-8; this.age[i] = 0; this.setP(i, _p);
        this.Vl[i * 3] = (rnd() - 0.5) * 0.15; this.Vl[i * 3 + 1] = -0.25 - rnd() * 0.3; this.Vl[i * 3 + 2] = (rnd() - 0.5) * 0.15;
      }
    }
  }

  /** the sheet the body becomes: begun under it, filled as it melts, emptied as it re-forms */
  private sheet(f: TearFrame) {
    const m = this.melt;
    if (m > 0.02 && !this.sheetOn) {
      this.mesh.parent?.updateWorldMatrix(true, false); this.mesh.updateMatrixWorld(true);
      _p.set(this.meltShape.x, this.meltShape.ground, this.meltShape.z).applyMatrix4(this.mesh.matrixWorld);
      this.puddles.sheetAt(_p.x, _p.z, this.now, f.heightAt); this.sheetOn = true;
    }
    if (!this.sheetOn) return;
    const s = Math.min(1, Math.max(0, (m - 0.12) / 0.8)), e = s * s * (3 - 2 * s);
    this.puddles.sheetVolume(this.bodyVolume * e, this.now);
    if (m <= 0.002) { this.puddles.sheetEnd(this.now); this.sheetOn = false; }
  }

  // ---------------------------------------------------------------------------------------------- drawing
  private draw() {
    const E = this.drops.instanceMatrix.array as Float32Array;
    let c = 0, face = 0, air = 0;
    for (let i = 0; i < this.max; i++) {
      const k = this.kind[i]; if (k === FREE) continue;
      const r = this.radius(i) * VIS;
      let sx = r, sy = r, sz = r;
      if (k === WELL || k === SURF) {
        face++;
        const t = this.tri[i];
        this.patch.point(t, this.b1[i], this.b2[i], _p);
        this.patch.normal(t, this.b1[i], this.b2[i], _y);
        const v = this.getV(i, _v), sp = v.length();
        // a bead sits as a squashed cap; one that hangs from an underside sags into a rounder drop; a running one
        // stretches out along its path
        const hang = Math.max(0, -_y.y);
        const cap = k === WELL ? 0.42 + 0.3 * Math.min(1, this.age[i] / 2) : 0.5 + 0.4 * hang;
        if (sp > 1e-4) _z.copy(v).multiplyScalar(1 / sp); else _z.set(0, -1, 0).addScaledVector(_y, _y.y);
        if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0).addScaledVector(_y, -_y.x);
        _z.normalize();
        sy = r * cap; sz = r * (1 + Math.min(0.9, sp * 3)); sx = r * (1 - Math.min(0.25, sp * 0.8));
        _p.addScaledVector(_y, sy * 0.3).addScaledVector(_z, -Math.min(0.9, sp * 3) * r * 0.35);
      } else {
        air++;
        _p.set(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]);
        const v = this.getV(i, _v), sp = v.length();
        if (sp > 1e-3) _y.copy(v).multiplyScalar(1 / sp); else _y.set(0, 1, 0);
        _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0).addScaledVector(_y, -_y.x);
        _z.normalize();
        sy = r * (1 + Math.min(0.35, sp * 0.07)); sx = sz = r * 0.93;
      }
      _x.crossVectors(_y, _z);
      const e = c * 16;
      E[e] = _x.x * sx; E[e + 1] = _x.y * sx; E[e + 2] = _x.z * sx; E[e + 3] = 0;
      E[e + 4] = _y.x * sy; E[e + 5] = _y.y * sy; E[e + 6] = _y.z * sy; E[e + 7] = 0;
      E[e + 8] = _z.x * sz; E[e + 9] = _z.y * sz; E[e + 10] = _z.z * sz; E[e + 11] = 0;
      E[e + 12] = _p.x; E[e + 13] = _p.y; E[e + 14] = _p.z; E[e + 15] = 1;
      c++;
    }
    this.drops.count = c; this.drops.instanceMatrix.needsUpdate = true;
    this.stats.live = c; this.stats.onFace = face; this.stats.falling = air;
  }
  /** dry everything and drop every drop (a fresh start) */
  reset() {
    this.kind.fill(FREE); this.well.fill(-1); this.cool.fill(0); this.wet.clear(); this.drops.count = 0; this.hn = 0;
  }
}
let _seed = 1234567;
/** a cheap deterministic random (no allocation, repeatable runs) */
function rnd() { _seed = (_seed * 16807) % 2147483647; return _seed / 2147483647; }
