// THE RIFLE: a surplus bolt-action 7.62x54R with a little scope (Poly Haven bolt_action_rifle_7_62, CC0, converted
// with lowpix: src/game/hunting/tools/convert_rifle.py), held in both of the player's FP arms.
//
//   const rifle = new Rifle(game); await rifle.load();
//   game.updaters.push((dt) => rifle.update(dt));     // runs between the hands and the arms each frame
//   rifle.onShot = (origin, dir) => ballistics.fire(origin, dir)
//
// The hold: the right hand on the wrist of the stock, finger by the trigger; the left hand under the forend. FPArms
// has no rifle pose of its own, so patchArms() teaches the arms instance one: setHeld('rifle') builds the hold from
// the rifle's grip points, and after the arms' own update the hands are put back exactly on the rifle (no spring lag
// off the stock while it kicks). The integrator may fold this into src/player/arms.ts later.
//
// Controls while the rifle is in hand:
//   RMB (hold)       up to the scope: the world zooms 3.5x through a PU-style reticle; breathing, being winded and
//                    the cold all show as sway (move the mouse less: the sensitivity follows the zoom)
//   Shift (aimed)    hold your breath: steady for ~4 s, then it gets worse until you breathe again
//   LMB              fire (a live round chambered); with a spent case in the chamber, click to cycle the bolt
//   R                cycle the bolt; with the magazine empty (or not full), load loose rounds one by one, then close
// Every shot: recoil kick, muzzle flash light, a smoke puff, the case flying out on the next cycle, the crack and its
// rolling echo, and a 'gunshot' event (game.events) the forest's creatures can react to.
import * as THREE from 'three';
import type { Game } from '../game';
import { input } from '../../core/input';
import { loadProp } from '../../places/props';
import { setGrip } from '../../humans/anim';
import { puffs } from '../../gfx/particles';
import { audio } from '../../audio/audio';
import { hud } from '../../ui/hud';
import { heightAt } from '../../world/layout';

// ------------------------------------------------------------------------------------------------ the model's numbers
// measured from the converted glb (prop space: +x toward the muzzle, +y up, +z the rifle's right side, metres)
const P = {
  /** the scope's ocular, on its optical axis */
  sight: new THREE.Vector3(-0.245, 0.1945, 0.002),
  muzzle: new THREE.Vector3(0.616, 0.166, 0.002),
  /** the bore axis height under the scope */
  boreY: 0.162,
  /** the wrist of the stock (right hand), the forend (left hand), the ejection port */
  grip: new THREE.Vector3(-0.372, 0.104, 0.0),
  forend: new THREE.Vector3(0.035, 0.124, 0.0),
  port: new THREE.Vector3(-0.19, 0.172, 0.02),
  /** where the bolt turns (on the bore axis) and how far it runs back */
  boltPivot: new THREE.Vector3(-0.22, 0.152, 0.0),
  boltTravel: 0.088,
};
/** the gun frame: +x right, +y up, -z toward the muzzle, origin on the scope's axis at the ocular */
function gunFromProp(v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 { return out.set(v.z - P.sight.z, v.y - P.sight.y, -(v.x - P.sight.x)); }

const EYE_RELIEF = 0.085;
const ZOOM = 3.5;
const BASE_FOV = 68, BASE_VFOV = 58;
const RIFLE_ITEM = 'rifle', AMMO = 'ammo_762';

const sm = (t: number) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };
const cl = (t: number, a = 0, b = 1) => (t < a ? a : t > b ? b : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
/** the arms' tool frame (handle +Y toward the head, the knuckles +Z), as in src/player/arms.ts */
function toolQ(Y: THREE.Vector3, Z: THREE.Vector3, out = new THREE.Quaternion()) {
  _y.copy(Y).normalize();
  _z.copy(Z).addScaledVector(_y, -Z.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

type Chamber = 'empty' | 'live' | 'spent';
interface HandT { p: THREE.Vector3; q: THREE.Quaternion; grip: number[] }
const G_STOCK = [0.86, 0.38, 0.8, 0, 0.05];   // the trigger finger lies along the guard
const G_TRIGGER = [0.86, 0.72, 0.8, 0, 0.05];
const G_FORE = [0.62, 0.55, 0.5, 0.05, 0.25];
const G_KNOB = [0.75, 0.75, 0.82, 0, 0];
const G_ROUND = [0.55, 0.85, 0.85, 0, 0];

/** ejected brass: a little ballistic body that rattles to rest on the ground */
interface Shell { obj: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; t: number; rest: boolean; bounced: number }

export class Rifle {
  readonly gun = new THREE.Group();          // the view-space root (origin at the eye's sight point)
  private model = new THREE.Group();          // prop space under the gun frame
  private boltPivot = new THREE.Group();
  private bolt: THREE.Object3D | null = null;
  private roundProto: THREE.Object3D | null = null;
  private handRound: THREE.Object3D | null = null;
  private flash: THREE.Mesh;
  private flashLight = new THREE.PointLight(0xffc27a, 0, 18, 2);
  private scope: THREE.Group;
  private scopeMat: THREE.MeshBasicMaterial;
  loaded = false;
  /** rounds in the box magazine, what is in the chamber */
  mag = 0; chamber: Chamber = 'empty';
  /** 0 at the hip .. 1 at the eye; 0..1 the scope picture */
  aimK = 0; scopeK = 0;
  /** what the rifle is doing: '' idle, 'cycle', 'reload' */
  action: '' | 'cycle' | 'reload' = ''; actionT = 0;
  private reloadPhase: 'open' | 'load' | 'close' = 'open'; private loadT = 0;
  private recoilT = 9; private recoilK = 0;
  private sway = new THREE.Vector2(); private swayApplied = new THREE.Vector2(); private kickApplied = new THREE.Vector2(); private kick = new THREE.Vector2();
  private breathHeld = 0; private breathLock = 0; private t = 0;
  private baseSens = 0; private wasScoped = false;
  private flashT = 9;
  private shells: Shell[] = [];
  private targets: { L: HandT; R: HandT } = { L: { p: new THREE.Vector3(), q: new THREE.Quaternion(), grip: G_FORE.slice() }, R: { p: new THREE.Vector3(), q: new THREE.Quaternion(), grip: G_STOCK.slice() } };
  private patched = false;
  private lowerK = 0;
  /** the rifle fired: eye position, aim direction (world), whether it was through the scope */
  onShot: (origin: THREE.Vector3, dir: THREE.Vector3, scoped: boolean) => void = () => {};
  /** the hunt can veto firing (e.g. while dressing a carcass) */
  blocked: () => boolean = () => false;

  constructor(private game: Game) {
    this.gun.name = 'RifleViewmodel';
    this.gun.visible = false;
    this.model.add(this.boltPivot);
    this.gun.add(this.model);
    // prop space -> gun frame: +x(muzzle) -> -z, +z(right) -> +x, origin at the sight point
    this.model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    this.model.position.copy(P.sight).applyQuaternion(this.model.quaternion).negate();
    this.boltPivot.position.copy(P.boltPivot);
    // the muzzle flash: a pixel-art star card at the muzzle, and a light in the world
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.flash.position.copy(P.muzzle).add(new THREE.Vector3(0.09, 0, 0));
    this.flash.rotation.y = Math.PI / 2;
    this.flash.visible = false;
    this.flash.renderOrder = 5;
    this.model.add(this.flash);
    // the scope picture: the world seen through the tube, the reticle, black all round
    const sc = scopePicture();
    this.scope = sc.group; this.scopeMat = sc.mat;
    this.scope.visible = false;
  }

  async load(): Promise<void> {
    const [body, bolt, round, meta] = await Promise.all([
      loadProp('bolt_action_rifle_7_62'), loadProp('bolt_action_rifle_7_62_bolt'), loadProp('bolt_action_rifle_7_62_round'),
      fetch('assets/models/bolt_action_rifle_7_62.json').then((r) => r.json()).catch(() => null),
    ]);
    const off = (meta?.offsets ?? {}) as Record<string, number[]>;
    const prep = (o: THREE.Object3D) => o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
    prep(body); prep(bolt); prep(round);
    this.model.add(body);
    // the bolt hangs from its pivot on the bore axis
    const bo = off.bolt_action_rifle_7_62_bolt ?? [-0.218, 0.124, 0.018];
    bolt.position.set(bo[0], bo[1], bo[2]).sub(P.boltPivot);
    this.boltPivot.add(bolt);
    this.bolt = bolt;
    // the cartridge: its own origin at the centre of its length (the round prop's origin is at its x/z centre)
    const rp = new THREE.Group(); rp.add(round); round.position.set(0, -0.0073, 0);
    this.roundProto = rp;
    this.handRound = rp.clone(); this.handRound.visible = false;
    this.game.view.add(this.gun);
    this.game.viewCam.add(this.scope);
    if (!this.game.viewCam.parent) this.game.view.add(this.game.viewCam);
    this.game.scene.add(this.flashLight);
    this.fitScope();
    this.loaded = true;
  }
  /** a fresh cartridge model (loose rounds on the counter, in the hand) */
  roundModel(): THREE.Object3D | null { return this.roundProto ? this.roundProto.clone() : null; }

  get held(): boolean { return this.loaded && this.game.hands?.heldItem === RIFLE_ITEM; }
  get scoped(): boolean { return this.scopeK > 0.95; }
  get ammo(): number { return this.game.inv.items.get(AMMO) ?? 0; }

  // ------------------------------------------------------------------------------------------------ the arms
  /** teach the FP arms a 'rifle' hold (see the header) */
  patchArms(): void {
    const arms = this.game.arms as unknown as Record<string, any> | null;
    if (!arms || this.patched || arms.__rifle) return;
    this.patched = true; arms.__rifle = true;
    const rifle = this;
    const build = arms.buildHeldPose as (p: any) => void;
    arms.buildHeldPose = function (this: any, p: any) {
      if (this.held !== 'rifle') return build.call(this, p);
      p.clavL = 0.1; p.clavR = 0.02; p.vis = 1;
      for (const s of ['L', 'R'] as const) { p[s].p.copy(rifle.targets[s].p); p[s].q.copy(rifle.targets[s].q); p[s].grip = rifle.targets[s].grip.slice(); }
    };
    const update = arms.update as (dt: number, s: unknown) => void;
    arms.update = function (this: any, dt: number, s: unknown) {
      update.call(this, dt, s);
      if (this.held !== 'rifle' || this.action || this.heldBlend < 1) return;
      // the hands exactly on the rifle: IK again from the hold's targets, the springs kept in step
      const b = this.bones;
      for (const sd of ['L', 'R'] as const) {
        const T = rifle.targets[sd], sock = this.sockets[sd];
        this.sp[sd].copy(T.p); this.sq[sd].copy(T.q); this.sv[sd].set(0, 0, 0); this.sgrip[sd] = T.grip.slice();
        const hq = _q.copy(T.q).multiply(_q2.copy(sock.quaternion).invert());
        const wrist = _v.copy(T.p).sub(_x.copy(sock.position).applyQuaternion(hq));
        this.ik.armIK(sd, wrist, hq, 1);
        setGrip(b, sd, T.grip[0], T.grip[1], T.grip[2], T.grip[3], T.grip[4]);
      }
      this.mesh.updateMatrixWorld(true);
    };
  }
  /** view-space point / direction -> the arms' body space (around the eye; see FPArms) */
  private toBody(v: THREE.Vector3, eye: THREE.Vector3, out: THREE.Vector3) { return out.set(-v.x + eye.x, v.y + eye.y, -v.z + eye.z); }
  private dirBody(v: THREE.Vector3, out: THREE.Vector3) { return out.set(-v.x, v.y, -v.z); }
  private setHand(side: 'L' | 'R', gunPt: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3, grip: number[]) {
    const arms = this.game.arms as unknown as { eye: THREE.Vector3 } | null;
    if (!arms) return;
    const T = this.targets[side];
    const p = _v.copy(gunPt).applyMatrix4(this.gun.matrix);
    this.toBody(p, arms.eye, T.p);
    const yv = this.dirBody(Y.clone().applyQuaternion(this.gun.quaternion), new THREE.Vector3());
    const zv = this.dirBody(Z.clone().applyQuaternion(this.gun.quaternion), new THREE.Vector3());
    toolQ(yv, zv, T.q);
    T.grip = grip.slice();
  }

  // ------------------------------------------------------------------------------------------------ per frame
  update(dt: number): void {
    if (!this.loaded) return;
    const g = this.game;
    this.t += dt;
    this.updateShells(dt);
    this.flashT += dt;
    this.flashLight.intensity = this.flashT < 0.07 ? 55 * (1 - this.flashT / 0.07) : 0;
    this.flash.visible = this.flashT < 0.05 && !this.scoped;
    if (this.flash.visible) { this.flash.rotation.x = this.t * 37; const s = 0.7 + Math.random() * 0.6; this.flash.scale.set(s, s, s); }
    const held = this.held && g.mode === 'walk';
    const arms = g.arms as unknown as { held: string; setHeld(k: string, o?: THREE.Object3D): void; object: THREE.Object3D } | null;
    if (!held) {
      if (this.gun.visible) this.stow();
      return;
    }
    this.patchArms();
    if (arms && arms.held !== 'rifle') arms.setHeld('rifle');
    this.gun.visible = true;
    const busy = !!g.journal?.open || !!g.pack?.open || this.blocked();

    // ---- input
    const sprint = g.player.sprinting;
    const wantAim = input.held('Mouse2') && !sprint && !busy && !g.hands.busy;
    const cycling = this.action !== '';
    const aimCap = this.action === 'cycle' ? 0.55 : this.action === 'reload' ? 0.0 : 1;
    const aimTo = wantAim ? aimCap : 0;
    this.aimK = this.aimK < aimTo ? Math.min(aimTo, this.aimK + dt / 0.32) : Math.max(aimTo, this.aimK - dt / 0.22);
    this.lowerK = lerp(this.lowerK, sprint ? 1 : 0, cl(dt * 6));
    this.scopeK = sm((this.aimK - 0.82) / 0.16);
    if (!busy && !cycling) {
      if (input.pressed('Mouse0') && !g.hands.focus) this.trigger();
      if (input.pressed('KeyR')) this.reloadOrCycle();
    }
    if (this.action === 'reload' && (input.pressed('Mouse0') || input.pressed('Mouse2')) && this.reloadPhase === 'load') this.reloadPhase = 'close', this.loadT = 0;
    this.advanceAction(dt);

    // ---- breathing, sway, holding the breath
    const sv = g.survival;
    const holding = this.scoped && input.held('ShiftLeft') && !input.held('KeyW') && this.breathLock <= 0 && sv.stamina > 0.05;
    if (holding) { this.breathHeld += dt; sv.spend(dt * 0.012); if (this.breathHeld > 5.5) { this.breathLock = 2.8; this.breathHeld = 0; g.sound('breath_heavy', undefined, 0.5); } }
    else { if (this.breathHeld > 0.3) g.sound('breath_cold', undefined, 0.35); this.breathHeld = 0; this.breathLock = Math.max(0, this.breathLock - dt); }
    const steady = holding ? (this.breathHeld < 4 ? 0.16 : 0.16 + (this.breathHeld - 4) * 0.9) : this.breathLock > 0 ? 1.7 : 1;
    const winded = sv.winded, shiver = sv.shiver, moving = Math.min(1, g.player.speed / 2.5);
    const amp = (0.0032 + winded * 0.011 + moving * 0.006) * (g.player.crouch ? 0.6 : 1) * steady;
    const br = 1.1 + winded * 2.4;   // breaths per... radians per second
    const T = this.t;
    let sx = Math.sin(T * br * 0.5) * amp * 0.6 + Math.sin(T * 0.37) * amp * 0.5 + Math.sin(T * 0.83 + 1) * amp * 0.3;
    let sy = Math.sin(T * br) * amp + Math.sin(T * 0.51 + 2) * amp * 0.35;
    // the cold: a fast irregular tremor; the heartbeat: a twitch on every beat
    const trem = shiver * 0.0028 * (holding ? 0.5 : 1);
    sx += (Math.sin(T * 37) * 0.6 + Math.sin(T * 53 + 1) * 0.4) * trem; sy += (Math.sin(T * 41 + 2) * 0.6 + Math.sin(T * 61) * 0.4) * trem;
    const hb = 1.1 + winded * 1.2, beat = Math.max(0, Math.sin(T * hb * Math.PI * 2)) ** 12;
    sy += beat * 0.0012 * (1 + winded * 2);
    this.sway.set(sx, sy);

    // ---- recoil: a fast kick up, then it settles most of the way back
    this.recoilT += dt;
    const rt = this.recoilT, rk = rt < 0.05 ? sm(rt / 0.05) : Math.exp(-(rt - 0.05) / 0.16) * 0.8 + 0.2 * Math.exp(-(rt - 0.05) / 1.2);
    const kickNow = _v.set(this.kick.x * rk, this.kick.y * rk, 0);
    // camera: sway only through the scope, the recoil always (applied as deltas so the player keeps control)
    const camSwayK = this.scopeK;
    const wantYaw = this.sway.x * camSwayK + kickNow.x, wantPitch = this.sway.y * camSwayK + kickNow.y;
    g.player.yaw += wantYaw - (this.swayApplied.x + this.kickApplied.x);
    g.player.pitch += wantPitch - (this.swayApplied.y + this.kickApplied.y);
    this.swayApplied.set(this.sway.x * camSwayK, this.sway.y * camSwayK); this.kickApplied.set(kickNow.x, kickNow.y);

    // ---- the rifle's place in view
    const a = sm(this.aimK);
    const ready = { p: new THREE.Vector3(0.115, -0.125, -0.23), r: new THREE.Euler(0.03, 0.06, 0.07) };
    const aim = { p: new THREE.Vector3(0, 0, -EYE_RELIEF), r: new THREE.Euler(0, 0, 0) };
    const low = { p: new THREE.Vector3(0.16, -0.24, -0.2), r: new THREE.Euler(-0.5, 0.55, 0.25) };
    const pos = ready.p.clone().lerp(aim.p, a).lerp(low.p, this.lowerK);
    const rx = lerp(lerp(ready.r.x, aim.r.x, a), low.r.x, this.lowerK), ry = lerp(lerp(ready.r.y, aim.r.y, a), low.r.y, this.lowerK), rz = lerp(lerp(ready.r.z, aim.r.z, a), low.r.z, this.lowerK);
    // procedural life: sway at the hip, walk bob, the cycling roll, recoil push
    const hip = 1 - a;
    const bob = Math.min(1, g.player.speed / 2.5) * hip, ph = T * (g.player.sprinting ? 11 : 7.5);
    pos.x += Math.sin(ph * 0.5) * 0.012 * bob + this.sway.x * 2.5 * hip;
    pos.y += -Math.abs(Math.cos(ph * 0.5)) * 0.012 * bob + this.sway.y * 2.5 * hip;
    const cyc = this.action !== '' ? this.cycleLean() : 0;
    const rec = rt < 0.04 ? sm(rt / 0.04) : Math.exp(-(rt - 0.04) / 0.09);
    pos.z += rec * 0.055 * this.recoilK; pos.y += rec * 0.012 * this.recoilK - cyc * 0.03; pos.x -= cyc * 0.02;
    this.gun.position.copy(pos);
    this.gun.quaternion.setFromEuler(new THREE.Euler(rx + rec * 0.09 * this.recoilK + cyc * 0.08, ry + this.sway.x * 3 * hip, rz - cyc * 0.32 + this.sway.x * 2 * hip, 'YXZ'));
    this.gun.updateMatrix();

    // ---- the bolt, the hands
    this.poseBolt();
    this.poseHands();

    // ---- the scope picture and the zoom
    const scoped = this.scopeK > 0.01;
    this.scope.visible = scoped;
    this.scopeMat.opacity = 1;
    (this.scope.userData.fade as THREE.MeshBasicMaterial).opacity = 1 - sm(this.scopeK * 1.4);
    this.scope.userData.flashMat.opacity = this.flashT < 0.08 ? 0.5 * (1 - this.flashT / 0.08) : 0;
    this.model.visible = this.scopeK < 0.98;
    const am = arms?.object;
    if (am) am.scale.setScalar(this.scopeK > 0.98 ? 1e-4 : 1);
    const fov = lerp(BASE_FOV, BASE_FOV / ZOOM, this.scopeK), vfov = lerp(BASE_VFOV, 50, a);
    if (Math.abs(g.camera.fov - fov) > 1e-3) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
    if (Math.abs(g.viewCam.fov - vfov) > 1e-3) { g.viewCam.fov = vfov; g.viewCam.updateProjectionMatrix(); this.fitScope(); }
    // mouse sensitivity follows the zoom; aiming slows the feet
    if (this.scopeK > 0.01 && !this.wasScoped) { this.baseSens = input.sensitivity; this.wasScoped = true; }
    if (this.wasScoped) input.sensitivity = this.baseSens * lerp(1, 1 / ZOOM, this.scopeK);
    if (this.wasScoped && this.scopeK <= 0.01) { input.sensitivity = this.baseSens; this.wasScoped = false; }
    g.player.burden = Math.max(g.hands.busy ? g.player.burden : 0, a * 0.5);
  }

  /** the rifle left the hands: put the view back the way it was */
  private stow() {
    const g = this.game;
    this.gun.visible = false; this.scope.visible = false;
    this.aimK = 0; this.scopeK = 0; this.action = '';
    if (this.wasScoped) { input.sensitivity = this.baseSens; this.wasScoped = false; }
    g.camera.fov = BASE_FOV; g.camera.updateProjectionMatrix();
    g.viewCam.fov = BASE_VFOV; g.viewCam.updateProjectionMatrix();
    g.player.yaw -= this.swayApplied.x + this.kickApplied.x; g.player.pitch -= this.swayApplied.y + this.kickApplied.y;
    this.swayApplied.set(0, 0); this.kickApplied.set(0, 0);
    const arms = g.arms as unknown as { object: THREE.Object3D; held: string; setHeld(k: string): void } | null;
    if (arms) { arms.object.scale.setScalar(1); if (arms.held === 'rifle') arms.setHeld('none'); }
    if (!g.hands.busy && g.player.burden <= 0.5) g.player.burden = 0;
  }

  // ------------------------------------------------------------------------------------------------ firing
  private trigger() {
    const g = this.game;
    if (this.chamber === 'live') return this.fire();
    if (this.chamber === 'spent' || (this.chamber === 'empty' && this.mag > 0)) return this.startCycle();
    // nothing: the dry click
    audio.play('rifle_dry', { vol: 0.9 });
    if (this.ammo > 0) hud.say('<i>Empty. R to load.</i>', 1.8);
    else hud.say('<i>Click. No rounds left.</i>', 1.8);
    void g;
  }

  private fire() {
    const g = this.game, cam = g.camera;
    this.chamber = 'spent';
    // the aim: through the scope it is the reticle (the camera's centre); at the hip the barrel's line, loosely held
    cam.updateMatrixWorld();
    const origin = cam.getWorldPosition(new THREE.Vector3());
    let dir: THREE.Vector3;
    if (this.scopeK > 0.9) dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    else {
      const m = this.muzzleView(), bore = new THREE.Vector3(0, 0, -1).applyQuaternion(this.gun.quaternion);
      origin.copy(m).applyMatrix4(cam.matrixWorld);
      dir = bore.transformDirection(cam.matrixWorld);
      const spread = 0.022 * (1 - this.aimK) + 0.004;
      dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize();
    }
    // recoil
    this.recoilT = 0; this.recoilK = 1;
    this.kick.set((Math.random() - 0.5) * 0.024, 0.05 + Math.random() * 0.012);
    g.player.addShake(this.scoped ? 0.25 : 0.4);
    // light, flash, smoke
    this.flashT = 0;
    const mw = this.muzzleWorld();
    this.flashLight.position.copy(mw);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    puffs.emit(mw.clone().addScaledVector(fwd, 0.15), fwd.clone().multiplyScalar(1.4).add(new THREE.Vector3(0, 0.15, 0)), { size: 0.18, grow: 5, life: 2.6, color: new THREE.Color(0.72, 0.7, 0.66), alpha: 0.32, rise: 0.25, n: 7, spread: 0.12 });
    puffs.emit(mw, fwd.clone().multiplyScalar(0.3), { size: 0.12, grow: 3, life: 1.4, color: new THREE.Color(0.6, 0.58, 0.55), alpha: 0.25, rise: 0.3, n: 3, spread: 0.05 });
    // sound: the crack, then the bush throwing it back
    audio.play('rifle_shot', { vol: 1 });
    audio.play('rifle_echo', { vol: 0.9, delay: 0.22 + Math.random() * 0.15 });
    (g as unknown as { lastShotAt: number }).lastShotAt = performance.now();
    g.events.emit('gunshot', { pos: origin.clone(), dir: dir.clone(), loud: 1 });
    this.onShot(origin, dir, this.scopeK > 0.9);
  }

  /** the muzzle, view space */
  private muzzleView(): THREE.Vector3 { return gunFromProp(P.muzzle).applyMatrix4(this.gun.matrix); }
  /** the muzzle, world space */
  muzzleWorld(): THREE.Vector3 { return this.muzzleView().applyMatrix4(this.game.camera.matrixWorld); }

  // ------------------------------------------------------------------------------------------------ the bolt
  private startCycle() { this.action = 'cycle'; this.actionT = 0; audio.play('rifle_bolt_open', { vol: 0.9 }); }
  private reloadOrCycle() {
    const full = this.mag >= 5;
    if (!full && this.ammo > 0) { this.action = 'reload'; this.actionT = 0; this.reloadPhase = 'open'; this.loadT = 0; audio.play('rifle_bolt_open', { vol: 0.9 }); return; }
    if (this.chamber !== 'live' && this.mag > 0) return this.startCycle();
    if (this.chamber === 'live') { this.startCycle(); return; }
    audio.play('rifle_dry', { vol: 0.7 });
    hud.say(this.ammo > 0 ? '<i>Full.</i>' : '<i>No rounds. Odile sells them by the box.</i>', 2);
  }
  /** bolt timeline (seconds): lift 0-.12, back .12-.32, ejection at .27, forward .42-.6, chamber at .52, down .6-.72 */
  private boltAt(t: number): { rot: number; back: number } {
    const rot = t < 0.12 ? sm(t / 0.12) : t < 0.6 ? 1 : 1 - sm((t - 0.6) / 0.12);
    const back = t < 0.12 ? 0 : t < 0.32 ? sm((t - 0.12) / 0.2) : t < 0.42 ? 1 : 1 - sm((t - 0.42) / 0.18);
    return { rot, back };
  }
  private boltState = { rot: 0, back: 0 };
  private advanceAction(dt: number) {
    if (this.action === 'cycle') {
      const t0 = this.actionT; this.actionT += dt; const t1 = this.actionT;
      const at = (x: number) => t0 < x && t1 >= x;
      if (at(0.27)) this.eject();
      if (at(0.47)) audio.play('rifle_bolt_close', { vol: 0.9 });
      if (at(0.52)) this.chamberRound();
      this.boltState = this.boltAt(Math.min(t1, 0.85));
      if (t1 >= 0.85) this.action = '';
    } else if (this.action === 'reload') {
      this.actionT += dt;
      if (this.reloadPhase === 'open') {
        this.boltState = this.boltAt(Math.min(this.actionT, 0.36));
        if (this.actionT >= 0.27 && this.chamber !== 'empty') this.eject();
        if (this.actionT >= 0.4) { this.reloadPhase = 'load'; this.loadT = 0; }
      } else if (this.reloadPhase === 'load') {
        this.boltState = { rot: 1, back: 1 };
        const t0 = this.loadT; this.loadT += dt;
        if (t0 < 0.3 && this.loadT >= 0.3) {
          if (this.ammo > 0 && this.mag < 5) { this.game.take(AMMO, 1); this.mag++; audio.play('rifle_load', { vol: 0.9 }); }
        }
        if (this.loadT >= 0.5) { this.loadT = 0; if (this.mag >= 5 || this.ammo <= 0) { this.reloadPhase = 'close'; this.actionT = 0; } }
      } else {
        const t = 0.42 + this.loadT;
        const t0 = this.loadT; this.loadT += dt;
        if (t0 < 0.05 && this.loadT >= 0.05) audio.play('rifle_bolt_close', { vol: 0.9 });
        if (t0 < 0.1 && this.loadT >= 0.1) this.chamberRound();
        this.boltState = this.boltAt(Math.min(t, 0.85));
        if (t >= 0.85) {
          this.action = '';
          hud.say(`<i>${this.mag} in the box${this.chamber === 'live' ? ', one up the spout' : ''}. ${this.ammo} in the pocket.</i>`, 2.5);
        }
      }
    } else this.boltState = { rot: 0, back: 0 };
  }
  /** the right hand's lean of the rifle while it works the bolt (0..1) */
  private cycleLean(): number {
    if (this.action === 'cycle') return sm(this.actionT / 0.1) * (1 - sm((this.actionT - 0.7) / 0.15));
    if (this.action === 'reload') return this.reloadPhase === 'close' ? 1 - sm((this.loadT - 0.25) / 0.2) : sm(this.actionT / 0.12);
    return 0;
  }
  private chamberRound() {
    if (this.chamber !== 'empty') return;
    if (this.mag > 0) { this.mag--; this.chamber = 'live'; }
  }
  /** out of the port: a spent case (or a live round, which goes back in the pocket) */
  private eject() {
    if (this.chamber === 'empty') return;
    const live = this.chamber === 'live';
    this.chamber = 'empty';
    if (live) this.game.give(AMMO, 1);
    const proto = this.roundProto;
    if (!proto) return;
    const s = proto.clone();
    if (!live) s.scale.set(0.82, 1, 1);
    const cam = this.game.camera;
    const pv = gunFromProp(P.port).applyMatrix4(this.gun.matrix);
    s.position.copy(pv).applyMatrix4(cam.matrixWorld);
    s.quaternion.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    this.game.scene.add(s);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0);
    const v = right.multiplyScalar(2.2 + Math.random()).addScaledVector(up, 1.6 + Math.random() * 0.8).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), -0.3);
    this.shells.push({ obj: s, v, w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30), t: 0, rest: false, bounced: 0 });
    if (this.shells.length > 24) { const o = this.shells.shift(); o?.obj.removeFromParent(); }
  }
  private updateShells(dt: number) {
    for (const s of this.shells) {
      s.t += dt;
      if (s.rest) continue;
      s.v.y -= 9.81 * dt;
      s.obj.position.addScaledVector(s.v, dt);
      s.obj.rotation.x += s.w.x * dt; s.obj.rotation.y += s.w.y * dt; s.obj.rotation.z += s.w.z * dt;
      const gy = heightAt(s.obj.position.x, s.obj.position.z) + 0.006;
      if (s.obj.position.y < gy) {
        s.obj.position.y = gy;
        if (s.bounced === 0) this.game.sound('shell_drop', s.obj.position.clone(), 0.6);
        s.bounced++;
        s.v.y = Math.abs(s.v.y) * 0.3; s.v.x *= 0.4; s.v.z *= 0.4; s.w.multiplyScalar(0.4);
        if (s.v.length() < 0.4 || s.bounced > 3) { s.rest = true; s.obj.rotation.set(0, s.obj.rotation.y, Math.PI / 2); s.obj.position.y = gy - 0.002; }
      }
    }
  }
  private poseBolt() {
    const b = this.boltState;
    this.boltPivot.position.copy(P.boltPivot).add(_v.set(-b.back * P.boltTravel, 0, 0));
    this.boltPivot.rotation.set(-b.rot * 1.35, 0, 0);
  }

  // ------------------------------------------------------------------------------------------------ the hands
  private poseHands() {
    const fwd = new THREE.Vector3(0, 0, -1);
    // right hand: the wrist of the stock, the finger on the trigger when aimed; on the bolt knob while cycling
    const grip = gunFromProp(P.grip);
    const YR = new THREE.Vector3(0, 0.3, -1), ZR = new THREE.Vector3(-0.3, -1, 0.05);
    let kR = 0;
    if (this.action === 'cycle') kR = sm(this.actionT / 0.1) * (1 - sm((this.actionT - 0.7) / 0.14));
    else if (this.action === 'reload') kR = this.reloadPhase === 'close' ? 1 - sm((this.loadT - 0.3) / 0.14) : sm(this.actionT / 0.1);
    // the knob: the bolt handle's ball, on the right of the receiver, turning up with the bolt
    const knobProp = new THREE.Vector3(-0.284 + 0.0, 0.135, 0.046);
    const knob = new THREE.Vector3().copy(knobProp).sub(P.boltPivot).applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.boltState.rot * 1.35).add(P.boltPivot).add(new THREE.Vector3(-this.boltState.back * P.boltTravel, 0, 0));
    const knobG = gunFromProp(knob).add(new THREE.Vector3(0.03, 0.005, 0.012));
    const pR = grip.clone().lerp(knobG, kR);
    const yR = YR.clone().lerp(new THREE.Vector3(-0.1, 0.15, -1), kR), zR = ZR.clone().lerp(new THREE.Vector3(0.35, -1, 0.3), kR);
    const gR = (this.scopeK > 0.5 && this.chamber === 'live' ? G_TRIGGER : G_STOCK).map((v, i) => lerp(v, G_KNOB[i], kR));
    this.setHand('R', pR, yR, zR, gR);
    // left hand: under the forend; to the port with a round while loading
    const fore = gunFromProp(P.forend).add(new THREE.Vector3(-0.012, -0.022, 0));
    let kL = 0;
    if (this.action === 'reload' && this.reloadPhase === 'load') kL = Math.sin(cl(this.loadT / 0.5) * Math.PI);
    const port = gunFromProp(P.port).add(new THREE.Vector3(-0.02, 0.05, 0.02));
    const pL = fore.clone().lerp(port, sm(kL));
    const yL = new THREE.Vector3(0, 0.05, -1).lerp(new THREE.Vector3(0.2, -0.5, -0.8), kL), zL = new THREE.Vector3(1, 0.45, 0).lerp(new THREE.Vector3(-0.2, -1, 0.3), kL);
    this.setHand('L', pL, yL, zL, G_FORE.map((v, i) => lerp(v, G_ROUND[i], kL)));
    // the round in the left hand while loading
    const arms = this.game.arms;
    if (arms && this.handRound) {
      if (!this.handRound.parent) { arms.socket('L').add(this.handRound); this.handRound.rotation.set(0, 0, Math.PI / 2); }
      this.handRound.visible = kL > 0.15 && this.loadT < 0.32;
    }
    void fwd;
  }

  // ------------------------------------------------------------------------------------------------ the scope picture
  private fitScope() {
    // the picture sits just in front of the view camera, filling its height
    const cam = this.game.viewCam, d = 0.03;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    this.scope.position.set(0, 0, -d);
    this.scope.scale.set(h, h, 1);
  }
  /** state for saves and the test page */
  status() { return { mag: this.mag, chamber: this.chamber, ammo: this.ammo, aim: this.aimK, scoped: this.scoped, action: this.action }; }
}

// ------------------------------------------------------------------------------------------------ textures
/** the muzzle flash: a hard-edged pixel star (white-yellow core, orange spikes) */
function flashTexture(): THREE.Texture {
  const N = 32, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - N / 2 + 0.5, dy = y - N / 2 + 0.5, r = Math.hypot(dx, dy) / (N / 2), a = Math.atan2(dy, dx);
    const spikes = Math.pow(Math.abs(Math.cos(a * 3.5)), 6) * 0.75 + 0.25;
    const v = r < 0.18 ? 1 : r < spikes ? 1 - (r - 0.18) / Math.max(0.01, spikes - 0.18) : 0;
    const i = (y * N + x) * 4;
    const q = v > 0.75 ? [255, 246, 214] : v > 0.4 ? [255, 190, 90] : v > 0.08 ? [196, 92, 34] : [0, 0, 0];
    img.data[i] = q[0]; img.data[i + 1] = q[1]; img.data[i + 2] = q[2]; img.data[i + 3] = v > 0.08 ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** the view through the scope: a pixel-art PU reticle (a chevron on a post, two side posts) in a black tube, a dark
 *  lens edge with a little chromatic fringe, and black wings to the screen's sides. One unit high, centred. */
function scopePicture(): { group: THREE.Group; mat: THREE.MeshBasicMaterial } {
  const N = 384, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N), D = img.data;
  const R = N * 0.47;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - N / 2 + 0.5, dy = y - N / 2 + 0.5, r = Math.hypot(dx, dy), i = (y * N + x) * 4;
    let col = [0, 0, 0], a = 255;
    if (r < R) {
      a = 0;
      // the lens edge: a soft dark ring (dithered), a cold fringe inside it
      const e = (r - R * 0.86) / (R * 0.14);
      if (e > 0) { const d = ((x * 7 + y * 13) % 5) / 5; if (e > d * 0.9 + 0.1) { a = 255; col = e > 0.7 ? [0, 0, 0] : [10, 14, 18]; } else if (e > 0.25 && e < 0.45) { a = 60; col = [40, 70, 90]; } }
      // the reticle (thin lines one texel wide; the posts three)
      const ax = Math.abs(dx), u = dy; // u > 0 is below the centre
      const post = ax < 1.6 && u > 2 && u < R;                                                    // the post from below
      const chevron = u >= -1 && u <= 9 && Math.abs(ax - u * 0.85) < 1.1 && ax < 8;                // the chevron's tip at the centre
      const side = Math.abs(dy) < 1.4 && ax > R * 0.32 && ax < R;                                   // the side posts
      const ticks = Math.abs(dy) < 1 && ax < R * 0.32 && ax > 12 && ((ax | 0) % 24 === 0);        // range ticks on the line
      if (post || chevron || side || ticks) { a = 255; col = [6, 6, 8]; }
    }
    D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const group = new THREE.Group();
  group.renderOrder = 100;
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); sq.renderOrder = 100;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false, fog: false });
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), black); wl.position.x = -2.5; wl.renderOrder = 100;
  const wr = wl.clone(); wr.position.x = 2.5;
  // a black fade in as the eye comes to the tube, and the white kick of the shot
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
  const fade = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), fadeMat); fade.renderOrder = 101; fade.position.z = 0.001;
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMat); fl.renderOrder = 99; fl.position.z = -0.001;
  group.add(sq, wl, wr, fade, fl);
  group.userData.fade = fadeMat; group.userData.flashMat = flashMat;
  return { group, mat };
}
