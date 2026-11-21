// The logging truck: an old 70s/80s pickup on a lift with a flatbed, log bunks and stakes, a headache rack, a winch
// bumper and a roof light bar. Replaces the Jeep and keeps its API (src/vehicles/jeep.ts re-exports this class as
// Jeep), so main.ts, game.ts, flow.ts, the ground cover and the hunting noises work unchanged.
//
// Driving is the author's own taxi model ported from หลอนยันปลายทาง (TruckPhysics: kinematic, deterministic, tuned for
// a heavy truck) on BUSHED's terrain; the truck is a kinematic Rapier body, so it shoves logs and props around and
// collides with trees, rocks and buildings through shape queries (dents, cracked glass, flat tyres: TruckDamage).
// Logs ride asleep in the bed and spill on a hard crash (TruckCargo). Lights, engine sound (TruckAudio), dust, mud,
// exhaust, steam and tyre tracks are driven from here.
//
// Scripted drives (the intro): truck.autopilot({ road: 'highway', to: 900, speed: 14 }) -> Promise, plus camera
// mounts for cinematic shots: truck.mounts.<name> (Object3Ds looking along their local -Z) or truck.mountPose().
// Model: public/assets/vehicles/truck.glb + truck.json, built by tools/blender/truck/build_truck.py.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { applyPixelTex, canvasTex } from '../gfx/tex';
import { marks } from '../world/marks';
import { debris, puffs } from '../gfx/particles';
import { registerInteractable, type InteractCtx } from '../game/interact';
import { TruckPhysics, type AutopilotSpec } from './truckphysics';
import { TruckAudio } from './truckaudio';
import { TruckDamage } from './truckdamage';
import { TruckCargo } from './truckcargo';
import type { WoodPiece } from '../chop/wood';

export interface TruckMeta {
  wheelRadius: number; wheelWidth: number; wheelbase: number; track: number; axleFront: number; axleRear: number; lift: number;
  size: [number, number, number];
  bed: { x: number; z0: number; z1: number; deckY: number; bunkY: number; bunks: number[]; stakeX: number; stakeTop: number };
  anchors: Record<string, [number, number, number]>;
  pivots: Record<string, { pos: [number, number, number]; axis: [number, number, number] }>;
}
/** kept for code written against the Jeep */
export interface JeepMeta {
  wheels: { name: string; pos: [number, number, number]; radius: number; front: boolean; left: boolean }[];
  steeringWheel?: string;
  seat?: [number, number, number];
  size?: [number, number, number];
  doors?: string[];
}
export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }

export type MountName = 'driver' | 'hood' | 'bumper' | 'wheel_fl' | 'wheel_rr' | 'side_l' | 'side_r' | 'bed' | 'rear' | 'chase' | 'front' | 'top' | 'low_front';

const WHEELS = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] as const;
const SPR = new THREE.Vector3(0, 0.95, -0.3); // the sprung body pitches and rolls about here (near its centre of mass)
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _e = new THREE.Euler(), _c = new THREE.Color(), _n = new THREE.Vector3();
const _cf = new THREE.Vector3(), _cl = new THREE.Vector3(), _cc = new THREE.Vector3(), _hp = new THREE.Vector3(), _hn = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

function beamMesh(len: number, rTop: number, rBot: number): THREE.Mesh {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, 16, 1, true);
  g.translate(0, -len / 2, 0);
  g.rotateX(-Math.PI / 2); // along +Z
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uI: { value: 0 }, uLen: { value: len } },
    vertexShader: 'uniform float uLen; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ = position.z / uLen; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uI; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float face = abs(dot(vN, vV)); float soft = smoothstep(0.2, 0.9, face) * smoothstep(0.0, 0.12, vZ) * (1.0 - vZ) * (1.0 - vZ); gl_FragColor = vec4(vec3(1.0,0.93,0.78) * uI * soft * 0.008, 1.0); }',
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

function plateTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9d4c4'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#2b3a63'; g.lineWidth = 3; g.strokeRect(3, 3, 122, 58);
  g.fillStyle = '#2b3a63'; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.fillText('BKT 471', 64, 42);
  g.font = 'bold 9px monospace'; g.fillText('KETTLE LAKE', 64, 15); g.fillText('BUSH  TRUCK', 64, 57);
  // grime and rust bleeding from the bolts
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${70 + Math.random() * 40},${50 + Math.random() * 20},30,${Math.random() * 0.25})`; g.fillRect(Math.random() * 128, 40 + Math.random() * 24, 2, 2); }
  for (const x of [14, 114]) { g.fillStyle = 'rgba(110,60,25,0.5)'; g.fillRect(x - 2, 8, 4, 18); }
  return canvasTex(c);
}

export class Truck {
  readonly root = new THREE.Group();
  readonly sprung = new THREE.Group();
  readonly chassisG = new THREE.Group();
  model: THREE.Object3D | null = null;
  body!: RAPIER.RigidBody;
  tmeta!: TruckMeta;
  meta!: JeepMeta;
  readonly phys: TruckPhysics;
  readonly sound = new TruckAudio();
  damage!: TruckDamage;
  cargo!: TruckCargo;
  readonly nodes: Record<string, THREE.Object3D> = {};
  private wheelRest: { o: THREE.Object3D; base: THREE.Vector3; front: boolean }[] = [];
  private steerWheel: THREE.Object3D | null = null;
  private steerAxis = new THREE.Vector3(0, 0.66, -0.75);
  private needles: { o: THREE.Object3D; axis: THREE.Vector3; k: (t: Truck) => number }[] = [];
  readonly lights: THREE.SpotLight[] = [];
  private headSpot!: THREE.SpotLight;
  private auxSpot!: THREE.SpotLight;
  private beams: THREE.Mesh[] = [];
  private lens: Record<string, THREE.MeshStandardMaterial[]> = {};
  private pools: { tail: THREE.Mesh; head: THREE.Mesh } | null = null;
  readonly seat = new THREE.Object3D();
  readonly mounts = {} as Record<MountName, THREE.Object3D>;
  readonly hitch = new THREE.Vector3(0, 0.62, -3.33);
  // state (Jeep API)
  speed = 0;
  steer = 0;
  occupied = false;
  headlights = false;
  lightBar = false;
  workLights = false;
  /** quality preset 'low': no volumetric beams, fewer particles (set before load(); src/game/quality.ts) */
  lowQuality = false;
  /** the drive camera (installTruck) follows the seat; turn it off for authored shots while driving */
  cameraEnabled = true;
  onEnter: () => void = () => {};
  onCollision: ((c: { point: THREE.Vector3; speed: number; normal: THREE.Vector3 }) => void) | null = null;
  private inp = { thr: 0, brk: 0, steer: 0, rev: 0, fwd: 0 };
  private headLevel = 0;
  private trackT = 0;
  private fxT = 0;
  private hitCool = 0;
  private bumpAcc = 0;
  private autoResolve: (() => void) | null = null;
  private colShapes: { shape: RAPIER.Cuboid; off: THREE.Vector3 }[] = [];
  private doorAnim = { l: 0, lT: 0 };
  private lastHandbrake = false;
  private splashT = 0;
  private aHood = new THREE.Vector3(0, 1.2, 1.6);
  private aExhaust: THREE.Vector3 | null = null;

  constructor() {
    this.phys = new TruckPhysics({ axleF: 1.31, axleR: -1.8, track: 1.48, wheelR: 0.37 });
    this.root.name = 'truck_root';
    this.root.add(this.chassisG, this.sprung);
    this.sprung.position.copy(SPR);
  }

  get rpm(): number { return this.phys.rpm; }
  get gear(): number { return this.phys.gear === 'R' ? 0 : this.phys.autoGear; }
  get running(): boolean { return this.phys.engineOn; }
  set running(v: boolean) {
    if (v === this.phys.engineOn) return;
    this.phys.engineOn = v;
    this.sound.setOn(v, { instant: !this.occupied });
  }
  get forward(): THREE.Vector3 { return new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion); }
  get mass(): number { return this.phys.mass; }
  get loaded(): number { return this.phys.cargoKg; }

  /** put a bucked log (a WoodPiece) on the bed: winched aboard if there is room, false when the bed is full */
  loadLog(piece: WoodPiece): boolean { return this.cargo?.loadLog(piece) ?? false; }

  async load(): Promise<void> {
    const meta = (this.tmeta = (await (await fetch('assets/vehicles/truck.json')).json()) as TruckMeta);
    const S = meta.size;
    this.meta = {
      wheels: WHEELS.map((n) => ({ name: n, pos: meta.pivots[n].pos, radius: meta.wheelRadius, front: n.includes('f'), left: n.endsWith('l') })),
      size: [S[0], S[1], -2 * this.hitch.z - 0.24], seat: meta.anchors.driverEye, steeringWheel: 'steering_wheel', doors: ['door_l', 'door_r'],
    };
    this.phys.geom.axleF = meta.axleFront; this.phys.geom.axleR = meta.axleRear;
    this.phys.geom.track = meta.track; this.phys.geom.wheelR = meta.wheelRadius;
    const gltf = await new GLTFLoader().loadAsync('assets/vehicles/truck.glb');
    const m = gltf.scene;
    m.traverse((o) => { if (o.name) this.nodes[o.name] = o; });
    const plate = plateTexture();
    const lensMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = mats.map((mt) => {
        const sm = mt as THREE.MeshStandardMaterial;
        if (sm.map) applyPixelTex(sm.map);
        if (sm.name === 'glass') {
          sm.transparent = true; sm.opacity = 0.2; sm.depthWrite = false; sm.roughness = 0.15; sm.metalness = 0;
          sm.color.setRGB(0.55, 0.62, 0.6); sm.side = THREE.DoubleSide; mesh.castShadow = false;
          return sm;
        }
        if (sm.name === 'display') {
          if (o.name === 'plate_rear') { const p = sm.clone(); p.map = plate; p.color.setRGB(1, 1, 1); p.roughness = 0.9; return p; }
          sm.color.setRGB(0.05, 0.05, 0.045);
          return sm;
        }
        if (sm.name === 'paint') { sm.color.setRGB(0.84, 0.82, 0.78); return sm; } // a shade dirtier in the bush light
        if (sm.name === 'mirror') { sm.color.setRGB(0.32, 0.34, 0.36); sm.roughness = 0.35; sm.metalness = 0.4; return sm; }
        if (sm.name === 'lens' && /^light_/.test(o.name)) {
          // every lamp gets its own glowing copy of the painted lens
          const k = o.name;
          const c = sm.clone();
          c.transparent = false; c.opacity = 1;
          c.emissive = new THREE.Color(/tail|brake/.test(k) ? 0xff2008 : /ind/.test(k) ? 0xff8a10 : 0xfff1d6);
          c.emissiveIntensity = 0;
          (this.lens[k] ??= []).push(c);
          lensMats.set(sm, c);
          return c;
        }
        return sm;
      });
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    });
    void lensMats;
    this.model = m;
    // hierarchy: root (ground pose) > chassis (wheels, axles) + sprung > body
    const truckNode = this.nodes.truck ?? m;
    const body = this.nodes.body;
    const off = new THREE.Group();
    off.position.copy(SPR).negate();
    this.sprung.add(off);
    off.add(body);
    for (const n of [...WHEELS, 'chassis']) { const o = this.nodes[n]; if (o) this.chassisG.add(o); }
    void truckNode;
    for (const n of WHEELS) {
      const o = this.nodes[n];
      if (o) this.wheelRest.push({ o, base: o.position.clone(), front: n.includes('_f') });
    }
    this.steerWheel = this.nodes.steering_wheel ?? null;
    for (const n of ['interior', 'steering_wheel', 'needle_speedo', 'needle_tacho', 'needle_fuel', 'needle_temp', 'winch_drum']) if (this.nodes[n]) this.nearOnly.push(this.nodes[n]);
    // the hands' focus ray tests every triangle under it: keep it off the cab interior and the running gear
    const noRay = () => {};
    for (const n of ['interior', 'chassis', 'winch_drum', 'steering_wheel', 'glass', 'glass_door_l', 'glass_door_r']) this.nodes[n]?.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.raycast = noRay; });
    const sa = meta.pivots.steering_wheel?.axis;
    if (sa) this.steerAxis.set(sa[0], sa[1], sa[2]).normalize();
    const needle = (n: string, k: (t: Truck) => number) => {
      const o = this.nodes[n], p = meta.pivots[n];
      if (o && p) this.needles.push({ o, axis: new THREE.Vector3(...p.axis).normalize(), k });
    };
    needle('needle_speedo', (t) => clamp(Math.abs(t.speed) * 3.6 / 160, 0, 1) * 4.5);
    needle('needle_tacho', (t) => clamp(t.rpm / 6000, 0, 1) * 4.5);
    needle('needle_fuel', () => 0.55);
    needle('needle_temp', (t) => 0.5 + (1 - t.phys.damage.engine) * 0.7);
    // the driver's eye and camera mounts ride on the sprung body
    const a = meta.anchors;
    if (a.hood) this.aHood.set(...a.hood);
    if (a.exhaust) this.aExhaust = new THREE.Vector3(...a.exhaust);
    this.seat.position.set(...a.driverEye).sub(SPR);
    this.sprung.add(this.seat);
    this.makeMounts();
    this.makeLights();
    this.damage = new TruckDamage(this);
    this.cargo = new TruckCargo(this);
    // interactions: the cab drives, the bed loads, damaged parts repair (labels decide at look time)
    // the cab always drives (E); dents are hammered out with the alt action (right click) at a workshop
    registerInteractable(body, {
      kind: 'vehicle', reach: 3.2,
      label: () => (this.occupied ? '' : 'Drive'),
      use: () => this.onEnter(),
      altLabel: (ctx) => this.damage.label(body, ctx),
      alt: (ctx) => { this.damage.use(body, ctx); },
    });
    for (const n of ['hood', 'bumper_front', 'glass_windshield', 'light_head_l', 'light_head_r', ...WHEELS]) {
      const o = this.nodes[n];
      if (!o) continue;
      registerInteractable(o, {
        kind: 'vehicle', reach: 3,
        label: (ctx) => this.damage.label(o, ctx) || (this.occupied ? '' : 'Drive'),
        use: (ctx) => { if (!this.damage.use(o, ctx)) this.onEnter(); },
        altLabel: (ctx) => this.damage.label(body, ctx),
        alt: (ctx) => { this.damage.use(body, ctx); },
      });
    }
    const bed = this.nodes.bed;
    if (bed) registerInteractable(bed, {
      kind: 'vehicle', reach: 3.5,
      label: (ctx) => this.cargo.label(ctx),
      use: (ctx) => { this.cargo.use(ctx); },
      alt: (ctx) => this.cargo.alt(ctx), altLabel: (ctx) => this.cargo.altLabel(ctx),
    });
    this.root.traverse((o) => { o.userData.truck = this; });
    // other code finds the truck as game.truck (game.jeep keeps working: main.ts sets it)
    const g = (globalThis as unknown as { __game?: { truck?: unknown } }).__game;
    if (g && !g.truck) g.truck = this;
  }

  private makeMounts(): void {
    const eye = new THREE.Vector3(...this.tmeta.anchors.driverEye);
    const defs: Record<MountName, [number[], number[]]> = {
      driver: [eye.toArray(), [eye.x * 0.6, eye.y - 0.25, 20]],
      hood: [[0.15, 1.42, 1.75], [eye.x, eye.y - 0.05, eye.z]],
      bumper: [[1.25, 0.48, 2.75], [0.5, 1.0, -2.5]],
      low_front: [[0.0, 0.35, 3.4], [0, 1.1, 0]],
      wheel_fl: [[1.45, 0.42, 2.15], [0.9, 0.55, -1.5]],
      wheel_rr: [[-1.4, 0.45, -2.6], [-0.8, 0.8, 2.5]],
      side_l: [[1.55, 1.55, 0.9], [eye.x, eye.y, eye.z]],
      side_r: [[-1.6, 1.6, 0.6], [eye.x, eye.y - 0.1, eye.z]],
      bed: [[0.35, 2.15, -1.0], [0.2, 1.4, 12]],
      rear: [[0.6, 2.6, -6.5], [0, 1.2, 2]],
      chase: [[0.0, 2.9, -9.5], [0, 1.3, 3]],
      front: [[1.2, 1.7, 9.0], [0, 1.0, 0]],
      top: [[3.5, 7.5, -1.0], [0, 0.8, 0.5]],
    };
    for (const [k, [p, t]] of Object.entries(defs) as [MountName, [number[], number[]]][]) {
      const o = new THREE.Object3D();
      o.name = 'mount_' + k;
      const pos = new THREE.Vector3(p[0], p[1], p[2]), tgt = new THREE.Vector3(t[0], t[1], t[2]);
      o.position.copy(pos).sub(SPR);
      o.quaternion.setFromRotationMatrix(_m.lookAt(pos, tgt, Y));
      this.sprung.add(o);
      this.mounts[k] = o;
    }
  }

  /** world pose of a camera mount (a camera placed there looks where the shot is framed) */
  mountPose(name: MountName, pos: THREE.Vector3, quat: THREE.Quaternion): void {
    const o = this.mounts[name] ?? this.mounts.chase;
    o.updateWorldMatrix(true, false);
    o.matrixWorld.decompose(pos, quat, _v);
  }

  private makeLights(): void {
    const a = this.tmeta.anchors;
    const hl = new THREE.Vector3(...a.headlightL), hr = new THREE.Vector3(...a.headlightR);
    const mid = hl.clone().add(hr).multiplyScalar(0.5);
    const spot = new THREE.SpotLight(0xfff0d0, 0, 75, 0.52, 0.55, 1.4);
    spot.position.copy(mid).add(new THREE.Vector3(0, 0.02, 0.15)).sub(SPR);
    spot.target.position.copy(spot.position).add(new THREE.Vector3(0, -0.9, 16));
    spot.castShadow = true; spot.userData.wantsShadow = true;
    spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 50;
    this.sprung.add(spot, spot.target);
    const aux = new THREE.SpotLight(0xfff6e4, 0, 70, 0.75, 0.6, 1.5);
    aux.castShadow = false; aux.userData.wantsShadow = false;
    this.sprung.add(aux, aux.target);
    this.headSpot = spot; this.auxSpot = aux;
    this.lights.push(spot, aux);
    for (const p of [hl, hr]) {
      if (this.lowQuality) break;
      const b = beamMesh(16, 0.07, 2.6);
      b.position.copy(p).add(new THREE.Vector3(0, 0, 0.05)).sub(SPR);
      b.rotation.x = 0.06;
      b.visible = false;
      this.sprung.add(b);
      this.beams.push(b);
    }
    // soft glow pools on the ground: red behind the tail lamps, warm in front of the lamps
    const poolTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d')!, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const pool = (col: number, w: number, l: number, z: number) => {
      const mm = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      mm.position.set(0, 0.04, z); mm.renderOrder = 2;
      this.chassisG.add(mm);
      return mm;
    };
    this.pools = { tail: pool(0xff2010, 2.8, 2.2, -3.9), head: pool(0xffd8a0, 3.6, 6, 5.2) };
  }

  spawn(x: number, z: number, heading: number): void {
    this.phys.place(x, z, heading);
    this.phys.v = 0;
    this.syncPose(0);
    if (!this.body) {
      this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(this.root.position.x, this.root.position.y, this.root.position.z)
        .setRotation({ x: this.root.quaternion.x, y: this.root.quaternion.y, z: this.root.quaternion.z, w: this.root.quaternion.w }));
      const b = this.tmeta.bed;
      const col = (hx: number, hy: number, hz: number, x0: number, y0: number, z0: number, fr = 0.8) => {
        const c = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x0, y0, z0).setFriction(fr)
          .setCollisionGroups(groups(GROUP.VEHICLE, 0xffff & ~GROUP.PLAYER)), this.body);
        physics.owner.set(c.handle, this);
        return c;
      };
      const zc = (b.z0 + b.z1) / 2, hz = (b.z1 - b.z0) / 2;
      col(0.86, 0.38, 0.9, 0, 0.95, 1.45);            // hood + engine
      col(0.84, 0.58, 0.6, 0, 1.15, 0.05);            // cab
      col(b.x, 0.05, hz, 0, b.deckY - 0.05, zc, 0.95); // deck
      col(0.5, 0.18, hz, 0, b.deckY - 0.28, zc);      // frame under the deck
      col(0.86, 0.43, 0.04, 0, b.deckY + 0.43, b.z1 - 0.05); // headache rack
      for (const bz of b.bunks) {
        col(b.x - 0.03, 0.05, 0.055, 0, b.bunkY - 0.05, bz, 1.0);
        for (const sx of [-1, 1]) col(0.045, (b.stakeTop - b.bunkY) / 2, 0.045, sx * b.stakeX, (b.stakeTop + b.bunkY) / 2, bz, 0.9);
      }
      this.colShapes = [
        { shape: new RAPIER.Cuboid(0.9, 0.5, 1.5), off: new THREE.Vector3(0, 1.05, 0.85) },
        { shape: new RAPIER.Cuboid(b.x + 0.02, 0.32, hz + 0.05), off: new THREE.Vector3(0, 0.8, zc) },
      ];
    } else {
      this.body.setTranslation(this.root.position, true);
      this.body.setRotation(this.root.quaternion, true);
    }
    this.cargo?.settleAll();
  }

  /** world position of the driver's eyes */
  eye(out = new THREE.Vector3()): THREE.Vector3 { return this.seat.getWorldPosition(out); }

  /** suspension bump strength (camera shake, creaks) */
  bump(): number { return this.bumpAcc; }

  // ------------------------------------------------------------------------------------------- scripted driving
  /** drive along a road on the autopilot (the player's inputs are ignored); resolves at the stop */
  autopilot(spec: AutopilotSpec): Promise<void> {
    this.autoResolve?.();
    this.running = true;
    this.phys.handbrake = false;
    this.phys.setAutopilot(spec);
    return new Promise((res) => { this.autoResolve = res; });
  }
  /** several legs in a row, e.g. the intro: [{ road: 'highway', from: 540, to: 738, through: true }, { road: 'cabin_road', from: 2, to: 640 }] */
  async driveRoute(legs: AutopilotSpec[]): Promise<void> {
    for (const leg of legs) {
      if (!this.autoAlive && leg !== legs[0]) return;
      this.autoAlive = true;
      await this.autopilot(leg);
    }
  }
  private autoAlive = true;
  stopAutopilot(): void {
    if (this.phys.auto && !this.phys.auto.done) this.autoAlive = false; this.phys.setAutopilot(null); const r = this.autoResolve; this.autoResolve = null; r?.(); }
  get autopiloting(): boolean { return !!this.phys.auto && !this.phys.auto.done; }

  // ------------------------------------------------------------------------------------------- per physics step
  update(dt: number, inp: DriveInput): void {
    if (!this.body) return;
    const P = this.phys;
    if (P.auto) {
      if (P.auto.done) {
        const through = !!P.auto.through;
        if (!through) P.handbrake = true;
        P.setAutopilot(null);
        const r = this.autoResolve; this.autoResolve = null; r?.();
      }
    } else this.driverInput(dt, inp);
    if (this.damage.stalled(dt)) { this.sound.setOn(false, { stall: true }); }
    P.step(dt);
    this.collide(dt);
    this.syncPose(dt);
    this.speed = P.v;
    this.steer = P.wheelAngle;
    this.body.setNextKinematicTranslation(this.root.position);
    this.body.setNextKinematicRotation(this.root.quaternion);
    this.cargo.update(dt);
    this.damage.update(dt);
    this.visuals(dt);
  }

  /** pedals and wheel, smoothed (the taxi's _driverInput): keys ramp in, reverse by holding the brake when stopped */
  private driverInput(dt: number, raw: DriveInput): void {
    const P = this.phys, I = this.inp;
    const stopped = Math.abs(P.v) < 0.35;
    let thr = this.running ? raw.throttle : 0, brk = raw.brake;
    if (this.running && !raw.handbrake) {
      if (P.gear !== 'R') {
        I.rev = stopped && brk > 0.4 && thr < 0.05 ? I.rev + dt : 0;
        if (I.rev > 0.45) { P.gear = 'R'; I.rev = 0; this.sound.gear = 0; }
      } else {
        const t = thr; thr = brk; brk = t;
        I.fwd = stopped && raw.throttle > 0.4 && raw.brake < 0.05 ? I.fwd + dt : 0;
        if (I.fwd > 0.15) { P.gear = 'D'; I.fwd = 0; }
      }
    }
    if (!this.occupied) { thr = 0; brk = Math.max(brk, 0.2); }
    const step = (cur: number, to: number, up: number, down: number) => cur + clamp(to - cur, -down * dt, up * dt);
    I.thr = step(I.thr, thr, 1.8, 4.5);
    I.brk = step(I.brk, brk, 2.8, 6);
    const back = Math.abs(raw.steer) < Math.abs(I.steer) || Math.sign(raw.steer) !== Math.sign(I.steer);
    const sr = (back ? 3.2 : 2.0) / (1 + this.cargo.kg / 4000);
    I.steer = step(I.steer, raw.steer, sr, sr);
    P.input.throttle = Math.pow(I.thr, 1.3);
    P.input.brake = Math.pow(I.brk, 1.2);
    P.input.steer = clamp(I.steer * (0.6 + 0.4 * Math.abs(I.steer)), -1, 1);
    if (raw.handbrake !== this.lastHandbrake && this.occupied) audio2(raw.handbrake ? 'veh_handbrake_on' : 'veh_handbrake_off', this.root.position, 0.6);
    this.lastHandbrake = raw.handbrake;
    P.handbrake = raw.handbrake || (!this.occupied && stopped);
  }

  /** trees, rocks, buildings: push out of their colliders, lose the speed into them, report the hit */
  private collide(dt: number): void {
    const P = this.phys;
    this.hitCool = Math.max(0, this.hitCool - dt);
    const fw = P.forward(_cf), lf = P.left(_cl);
    _q.setFromEuler(_e.set(-P.groundPitch, P.yaw, P.groundRoll, 'YXZ'));
    let hitSpeed = 0;
    const hitPt = _hp, hitN = _hn;
    for (const cs of this.colShapes) {
      const c = _cc.copy(cs.off).applyQuaternion(_q).add(P.pos);
      physics.world.intersectionsWithShape(c, _q, cs.shape, (col) => {
        const ct = col.contactShape(cs.shape, c, _q, 0.0);
        if (!ct || ct.distance >= 0) return true;
        const n = _v.set(ct.normal1.x, 0, ct.normal1.z);
        if (n.lengthSq() < 1e-6) return true;
        n.normalize();
        const depth = Math.min(0.5, -ct.distance);
        P.pos.addScaledVector(n, depth);
        // velocity into the obstacle goes away (a little bounce); the off-centre part turns the truck
        const vx = fw.x * P.v + lf.x * P.vLat, vz = fw.z * P.v + lf.z * P.vLat;
        const vn = vx * n.x + vz * n.z;
        if (vn < 0) {
          const nvx = vx - n.x * vn * 1.25, nvz = vz - n.z * vn * 1.25;
          P.v = nvx * fw.x + nvz * fw.z;
          P.vLat = (nvx * lf.x + nvz * lf.z) * 0.6;
          const rx = ct.point2.x - P.pos.x, rz = ct.point2.z - P.pos.z;
          P.yawRate += clamp((rz * n.x - rx * n.z) * -vn * 0.06, -1.2, 1.2);
          if (-vn > hitSpeed) { hitSpeed = -vn; hitPt.set(ct.point2.x, ct.point2.y, ct.point2.z); hitN.copy(n); }
        }
        return true;
      }, undefined, groups(0xffff, GROUP.STATIC), undefined, this.body);
    }
    if (hitSpeed > 1.0 && this.hitCool <= 0) {
      this.hitCool = 0.5;
      const hp = hitPt.clone(), hn = hitN.clone();
      this.damage.hit({ point: hp, speed: hitSpeed, normal: hn });
      this.sound.impact(hp, hitSpeed);
      this.cargo.jolt(hitSpeed, hn);
      this.onCollision?.({ point: hp, speed: hitSpeed, normal: hn });
      this.root.userData.lastHit = performance.now();
    }
  }

  private syncPose(dt: number): void {
    const P = this.phys, s = P.susp;
    this.root.position.copy(P.pos);
    this.root.rotation.set(-P.groundPitch, P.yaw, P.groundRoll, 'YXZ');
    this.sprung.rotation.set(-s.pitch, 0, s.roll);
    this.sprung.position.set(SPR.x, SPR.y + s.heave, SPR.z);
    for (let i = 0; i < this.wheelRest.length; i++) {
      const w = this.wheelRest[i];
      const flat = this.phys.damage.flat === i ? -0.055 : 0;
      w.o.position.set(w.base.x, w.base.y + P.wheelDrop[i] + flat, w.base.z);
      _q.setFromAxisAngle(X, P.wheelSpin[i]);
      if (w.front) w.o.quaternion.setFromAxisAngle(Y, P.wheelAngle).multiply(_q);
      else w.o.quaternion.copy(_q);
      if (flat) w.o.scale.set(1, 0.93, 1); else w.o.scale.set(1, 1, 1);
    }
    if (this.steerWheel) this.steerWheel.quaternion.setFromAxisAngle(this.steerAxis, P.wheelAngle * 6.2);
    for (const n of this.needles) n.o.quaternion.setFromAxisAngle(n.axis, -n.k(this));
    // the driver's door swings open while getting in or out
    this.doorAnim.l = damp(this.doorAnim.l, this.doorAnim.lT, 5, dt);
    if (this.doorAnim.lT > 0 && this.doorAnim.l > 0.95) this.doorAnim.lT = 0;
    const dl = this.nodes.door_l;
    if (dl) dl.quaternion.setFromAxisAngle(Y, -1.0 * this.doorAnim.l);
    this.root.updateMatrixWorld();
  }

  /** swing the driver's door open and shut (getting in or out) */
  swingDoor(): void { this.doorAnim.lT = 1; }

  private visuals(dt: number): void {
    const P = this.phys;
    const sp = Math.abs(P.v);
    this.bumpAcc = Math.max(P.bump, this.bumpAcc - dt * 3);
    // ---- lights ----
    const dmg = this.damage.headlights();
    const elec = this.running ? 1 : 0.4;
    const target = this.headlights ? elec * dmg : 0;
    this.headLevel = damp(this.headLevel, target, 14, dt);
    this.headSpot.intensity = this.headLevel * 110;
    for (const b of this.beams) { b.visible = !this.lowQuality && this.headLevel > 0.02; (b.material as THREE.ShaderMaterial).uniforms.uI.value = this.headLevel; }
    const lensI = this.lensI;
    lensI('light_head_l', this.headLevel * 1.3 * this.damage.lampLevel('l'));
    lensI('light_head_r', this.headLevel * 1.3 * this.damage.lampLevel('r'));
    const braking = P.input.brake > 0.05 && this.running;
    const tail = (this.headlights ? 0.8 : 0) + (braking ? 2.4 : 0);
    lensI('light_tail_l', tail); lensI('light_tail_r', tail);
    lensI('light_reverse', P.gear === 'R' && this.running ? 2 : 0);
    const blink = this.damage.hazards && Math.floor(performance.now() / 380) % 2 === 0 ? 3 : 0;
    for (const k of ['light_ind_fl', 'light_ind_fr', 'light_ind_rl', 'light_ind_rr']) lensI(k, blink);
    lensI('light_bar', this.lightBar && this.running ? 2.2 : 0);
    lensI('light_work', this.workLights ? 3 : 0);
    if (this.pools) {
      (this.pools.tail.material as THREE.MeshBasicMaterial).opacity = clamp(tail * 0.07, 0, 0.3);
      (this.pools.head.material as THREE.MeshBasicMaterial).opacity = this.headLevel * 0.045;
    }
    const aux = this.auxSpot;
    if (this.lightBar && this.running) {
      aux.intensity = 110; aux.angle = 0.62; aux.distance = 90;
      aux.position.set(0, 1.8 - SPR.y, 0.35 - SPR.z); aux.target.position.set(0, 0.2 - SPR.y, 25 - SPR.z);
    } else if (this.workLights) {
      aux.intensity = 70; aux.angle = 0.95; aux.distance = 14;
      aux.position.set(0, 1.95 - SPR.y, -0.85 - SPR.z); aux.target.position.set(0, 0.6 - SPR.y, -3.4 - SPR.z);
    } else aux.intensity = 0;
    // ---- sound state ----
    const snd = this.sound;
    this.sprung.localToWorld(snd.pos.copy(this.aHood).sub(SPR));
    snd.bodyPos.copy(this.root.position).y += 0.6;
    snd.rpm = P.rpm; snd.load = P.engineLoad; snd.gear = P.gear === 'R' ? 0 : P.autoGear; snd.speed = sp; snd.surface = P.surface;
    snd.scraping = P.surface === 'bush' ? clamp(sp / 7, 0, 1) * 0.7 : 0;
    snd.inside = this.occupied;
    snd.steam = this.damage.steamLevel();
    snd.winch = this.cargo.winching;
    // ---- dust, mud, splashes, tyre tracks ----
    this.fxT += dt;
    if (this.fxT > (this.lowQuality ? 0.12 : 0.05)) {
      const ft = this.fxT; this.fxT = 0;
      const surf = P.surface;
      for (let i = 0; i < 4; i++) {
        const w = this.wheelRest[i];
        if (!w) continue;
        w.o.getWorldPosition(_v);
        _v.y -= this.tmeta.wheelRadius - 0.05;
        if (surf === 'water' && sp > 1.5 && Math.random() < ft * 8) puffs.emit(_v, _w.set((Math.random() - 0.5) * 2, 1.6 + sp * 0.15, (Math.random() - 0.5) * 2), { size: 0.3, grow: 1.5, life: 0.8, color: _c.setRGB(0.75, 0.8, 0.82), alpha: 0.4, n: 2, spread: 0.3 });
        else if ((surf === 'gravel' || surf === 'dirt') && sp > 5 && i >= 2 && Math.random() < ft * 6) puffs.emit(_v, _w.set(0, 0.5, 0), { size: 0.7, grow: 3.4, life: 2.4, color: _c.setRGB(0.55, 0.49, 0.4), alpha: 0.22 * Math.min(1, sp / 14), rise: 0.2 });
        if ((surf === 'dirt' || surf === 'bush') && sp > 3 && Math.random() < ft * 4) debris.emit('sawdust', _v, P.forward(_w).clone().multiplyScalar(-1.4).add(_n.set(0, 1.1, 0)), 2, { color: _c.setRGB(0.3, 0.24, 0.17), size: 1.4 });
      }
      if (surf === 'water' && sp > 2 && (this.splashT -= ft) <= 0) { this.splashT = 0.7; audio2('truck_splash', this.root.position, 0.4 + Math.min(0.5, sp / 12)); }
      // exhaust: a blue-grey cough on start and under load, black when the engine is hurt
      if (this.running && this.aExhaust) {
        const ex = this.sprung.localToWorld(_v.copy(this.aExhaust).sub(SPR));
        const k = 0.3 + P.engineLoad * 1.2 + (1 - P.damage.engine) * 1.5;
        if (Math.random() < ft * 4 * k) {
          const h = this.phys.damage.engine;
          puffs.emit(ex, _w.set(-1.1, 0.25, -0.3).applyQuaternion(this.root.quaternion), { size: 0.12, grow: 2.4, life: 1.6, color: _c.setRGB(0.4 * h + 0.12, 0.42 * h + 0.12, 0.45 * h + 0.13), alpha: 0.2 + P.engineLoad * 0.15, rise: 0.4 });
        }
      }
    }
    this.trackT += sp * dt;
    if (this.trackT > 0.45 && P.surface !== 'asphalt') {
      this.trackT = 0;
      const ang = P.yaw;
      for (let i = 0; i < this.wheelRest.length; i++) {
        this.wheelRest[i].o.getWorldPosition(_v);
        marks.stamp(1, _v.x, _v.z, 0.18, 0.32, ang, P.surface === 'bush' ? 0.08 : 0.06);
      }
    }
  }

  private lensI = (k: string, v: number): void => { const l = this.lens[k]; if (l) for (const m of l) m.emissiveIntensity = v; };

  /** the audio + headlamp glow need a per-frame tick too (installTruck calls it) */
  frame(dt: number, cam?: THREE.Camera): void {
    this.sound.update(dt);
    if (cam && this.model) {
      // the cab interior and the small parts only matter up close (about 20k triangles)
      const d = cam.position.distanceTo(this.root.position);
      const near = d < 26 || this.occupied;
      for (const n of this.nearOnly) n.visible = near;
    }
  }
  private nearOnly: THREE.Object3D[] = [];
}

// a tiny bridge so this file stays free of the game object
import { audio } from '../audio/audio';
function audio2(id: string, pos: THREE.Vector3, vol: number): void { audio.play(id, { pos, vol }); }
void _q2;
