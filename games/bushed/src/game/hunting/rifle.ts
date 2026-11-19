// THE RIFLE: a surplus bolt-action 7.62x54R with a little scope (Poly Haven bolt_action_rifle_7_62, CC0, converted
// with lowpix: src/game/hunting/tools/convert_rifle.py), held in both of the player's FP arms.
//
//   const rifle = new Rifle(game); await rifle.load();
//   game.updaters.push((dt) => rifle.update(dt));     // runs between the hands and the arms each frame
//   rifle.onShot = (eye, dir) => ballistics.fire(eye, dir)
//
// The hold is FPArms' own 'rifle' kind (right hand on the wrist of the stock, left under the forend, low ready or up
// to the eye with ArmsInput.aim, the 'fire' kick and the 'bolt' hand): the rifle model (stock and barrel, the bolt on
// its own pivot) is handed to arms.setHeld('rifle', model) and the arms own its transform. The rifle feeds the arms
// its aim (until game.ts passes ArmsInput.aim itself, a thin wrapper on arms.update adds it), works the bolt on the
// arms' 'bolt' timeline, and draws the scope picture.
//
// Controls while the rifle is in hand:
//   RMB (hold)       up to the scope: the world zooms 3.5x through a PU-style reticle; breathing, being winded and
//                    the cold all show as sway (the mouse sensitivity follows the zoom)
//   Shift (aimed)    hold your breath: steady for ~4 s, then it gets worse until you breathe again
//   LMB              fire (a live round chambered); with a spent case in the chamber, click to cycle the bolt
//   R                cycle the bolt; with the magazine not full and rounds in the pocket, load them one by one
// Every shot: recoil kick, muzzle flash light, a smoke puff, the case flying out on the next cycle, the crack and its
// rolling echo, and a 'gunshot' event (game.events) the forest's creatures can react to.
import * as THREE from 'three';
import type { Game } from '../game';
import { input } from '../../core/input';
import { loadProp } from '../../places/props';
import { puffs } from '../../gfx/particles';
import { audio } from '../../audio/audio';
import { hud } from '../../ui/hud';
import { heightAt } from '../../world/layout';

// ------------------------------------------------------------------------------------------------ the model's numbers
// measured from the converted glb (prop space: +x toward the muzzle, +y up, +z the rifle's right side, metres)
const P = {
  muzzle: new THREE.Vector3(0.616, 0.166, 0.002),
  /** the ejection port, where the bolt opens */
  port: new THREE.Vector3(-0.19, 0.172, 0.02),
  /** where the bolt turns (on the bore axis) and how far it runs back */
  boltPivot: new THREE.Vector3(-0.22, 0.152, 0.0),
  boltTravel: 0.088,
  /** where the converter's bolt prop sits in the rifle's frame (convert_rifle.py prints these offsets) */
  boltAt: new THREE.Vector3(-0.21803, 0.12383, 0.01779),
};
const ZOOM = 3.5;
const BASE_FOV = 68, BASE_VFOV = 58;
const RIFLE_ITEM = 'rifle', AMMO = 'ammo_762';
/** the arms' bolt action (FPArms ACTIONS.bolt): the hand lifts, draws back, pushes forward, turns down */
const BOLT_DUR = 0.95;

const sm = (t: number) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };
const cl = (t: number, a = 0, b = 1) => (t < a ? a : t > b ? b : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function track(t: number, keys: number[][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) { const [t0, v0] = keys[i], [t1, v1] = keys[i + 1]; if (t <= t1) return lerp(v0, v1, sm((t - t0) / (t1 - t0 || 1))); }
  return keys[keys.length - 1][1];
}

type Chamber = 'empty' | 'live' | 'spent';
interface ArmsRifle {
  object: THREE.Object3D; held: string; action: string | null;
  setHeld(k: string, o?: THREE.Object3D, opts?: { instant?: boolean }): void;
  play(a: string, o?: Record<string, unknown>): void;
  update(dt: number, s: Record<string, unknown>): void;
  socket(h: 'L' | 'R'): THREE.Object3D;
}
/** ejected brass: a little ballistic body that rattles to rest on the ground */
interface Shell { obj: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; t: number; rest: boolean; bounced: number }

export class Rifle {
  /** the rifle in prop space: stock and barrel, the bolt on its pivot (the arms hold and place it) */
  readonly model = new THREE.Group();
  private boltPivot = new THREE.Group();
  private roundProto: THREE.Object3D | null = null;
  private flash: THREE.Mesh;
  private flashLight = new THREE.PointLight(0xffc27a, 0, 18, 2);
  private scope: THREE.Group;
  loaded = false;
  /** rounds in the box magazine, what is in the chamber */
  mag = 0; chamber: Chamber = 'empty';
  /** 0 at the hip .. 1 at the eye; 0..1 the scope picture */
  aimK = 0; scopeK = 0;
  /** what the rifle is doing: '' idle, 'cycle', 'reload' */
  action: '' | 'cycle' | 'reload' = ''; actionT = 0;
  private reloadPhase: 'open' | 'load' | 'close' = 'open'; private loadT = 0;
  private recoilT = 9;
  private sway = new THREE.Vector2(); private swayApplied = new THREE.Vector2(); private kickApplied = new THREE.Vector2(); private kick = new THREE.Vector2();
  private breathHeld = 0; private breathLock = 0; private t = 0;
  private baseSens = 0; private wasScoped = false;
  private flashT = 9;
  private shells: Shell[] = [];
  private bolt = { rot: 0, back: 0 };
  private shown = false;
  /** the rifle fired: eye position, aim direction (world), whether it was through the scope */
  onShot: (origin: THREE.Vector3, dir: THREE.Vector3, scoped: boolean) => void = () => {};
  /** the hunt can veto the rifle (dressing a carcass, dragging one) */
  blocked: () => boolean = () => false;

  constructor(private game: Game) {
    this.model.name = 'rifle';
    this.boltPivot.position.copy(P.boltPivot);
    this.model.add(this.boltPivot);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    this.flash.visible = false; this.flash.renderOrder = 6;
    this.scope = scopePicture(); this.scope.visible = false;
  }

  async load(): Promise<void> {
    const [body, bolt, round] = await Promise.all([loadProp('bolt_action_rifle_7_62'), loadProp('bolt_action_rifle_7_62_bolt'), loadProp('bolt_action_rifle_7_62_round')]);
    const prep = (o: THREE.Object3D) => o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
    prep(body); prep(bolt); prep(round);
    this.model.add(body);
    bolt.position.copy(P.boltAt).sub(P.boltPivot);
    this.boltPivot.add(bolt);
    // the cartridge: its origin at the middle of its length
    const rp = new THREE.Group(); rp.add(round); round.position.set(0, -0.0073, 0);
    this.roundProto = rp;
    this.game.view.add(this.flash);
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
  private get arms(): ArmsRifle | null { return this.game.arms as unknown as ArmsRifle | null; }

  /** feed the arms the aim (ArmsInput.aim) until game.ts does it itself */
  private hookArms() {
    const arms = this.arms as (ArmsRifle & { __rifleHooked?: boolean }) | null;
    if (!arms || arms.__rifleHooked) return;
    arms.__rifleHooked = true;
    const rifle = this;
    const upd = arms.update;
    arms.update = function (this: ArmsRifle, dt: number, s: Record<string, unknown>) {
      return upd.call(this, dt, this.held === 'rifle' && s.aim === undefined ? { ...s, aim: rifle.aimK } : s);
    };
  }

  // ------------------------------------------------------------------------------------------------ per frame
  update(dt: number): void {
    if (!this.loaded) return;
    const g = this.game;
    this.t += dt;
    this.updateShells(dt);
    this.flashT += dt;
    this.flashLight.intensity = this.flashT < 0.07 ? 55 * (1 - this.flashT / 0.07) : 0;
    const held = this.held && g.mode === 'walk';
    const arms = this.arms;
    if (!held) { if (this.shown) this.stow(); return; }
    this.hookArms();
    if (arms && arms.held !== 'rifle') arms.setHeld('rifle', this.model);
    this.shown = true;
    const busy = !!g.journal?.open || !!g.pack?.open || this.blocked();

    // ---- input
    const sprint = g.player.sprinting;
    const wantAim = input.held('Mouse2') && !sprint && !busy && !g.hands.busy;
    const aimCap = this.action === 'cycle' ? 0.5 : this.action === 'reload' ? 0 : 1;
    const aimTo = wantAim ? aimCap : 0;
    this.aimK = this.aimK < aimTo ? Math.min(aimTo, this.aimK + dt / 0.32) : Math.max(aimTo, this.aimK - dt / 0.22);
    this.scopeK = sm((this.aimK - 0.8) / 0.18);
    if (!busy && this.action === '') {
      if (input.pressed('Mouse0') && !g.hands.focus) this.trigger();
      if (input.pressed('KeyR')) this.reloadOrCycle();
    }
    if (this.action === 'reload' && this.reloadPhase === 'load' && (input.pressed('Mouse0') || input.pressed('Mouse2'))) { this.reloadPhase = 'close'; this.loadT = 0; this.arms?.play('bolt'); }
    this.advanceAction(dt);
    this.poseBolt();

    // ---- breathing, sway, holding the breath (through the scope the world sways; at the hip the arms do it)
    const sv = g.survival;
    const holding = this.scoped && input.held('ShiftLeft') && !input.held('KeyW') && this.breathLock <= 0 && sv.stamina > 0.05;
    if (holding) { this.breathHeld += dt; sv.spend(dt * 0.012); if (this.breathHeld > 5.5) { this.breathLock = 2.8; this.breathHeld = 0; g.sound('breath_heavy', undefined, 0.5); } }
    else { if (this.breathHeld > 0.3) g.sound('breath_cold', undefined, 0.35); this.breathHeld = 0; this.breathLock = Math.max(0, this.breathLock - dt); }
    const steady = holding ? (this.breathHeld < 4 ? 0.16 : 0.16 + (this.breathHeld - 4) * 0.9) : this.breathLock > 0 ? 1.7 : 1;
    const winded = sv.winded, shiver = sv.shiver, moving = Math.min(1, g.player.speed / 2.5);
    const amp = (0.0032 + winded * 0.011 + moving * 0.006) * (g.player.crouch ? 0.6 : 1) * steady;
    const br = 1.1 + winded * 2.4, T = this.t;
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
    const kx = this.kick.x * rk, ky = this.kick.y * rk;
    // applied to the view as deltas, so the player's own aim is untouched
    const k = this.scopeK;
    g.player.yaw += sx * k + kx - (this.swayApplied.x + this.kickApplied.x);
    g.player.pitch += sy * k + ky - (this.swayApplied.y + this.kickApplied.y);
    this.swayApplied.set(sx * k, sy * k); this.kickApplied.set(kx, ky);

    // ---- the muzzle flash card and the light
    this.model.updateWorldMatrix(true, false);
    const mv = this.model.localToWorld(P.muzzle.clone().add(new THREE.Vector3(0.08, 0, 0)));
    this.flash.position.copy(mv);
    this.flash.visible = this.flashT < 0.05 && !this.scoped;
    if (this.flash.visible) { this.flash.rotation.z = this.t * 37; const s = 0.7 + Math.random() * 0.7; this.flash.scale.set(s, s, s); }

    // ---- the scope picture and the zoom
    this.scope.visible = this.scopeK > 0.01;
    (this.scope.userData.fade as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * cl(this.scopeK * 1.3)) * 0.9;
    (this.scope.userData.flash as THREE.MeshBasicMaterial).opacity = this.flashT < 0.06 ? 0.22 * (1 - this.flashT / 0.06) : 0;
    this.model.visible = this.scopeK < 0.98;
    if (arms) arms.object.scale.setScalar(this.scopeK > 0.98 ? 1e-4 : 1);
    const fov = lerp(BASE_FOV, BASE_FOV / ZOOM, this.scopeK), vfov = lerp(BASE_VFOV, 50, sm(this.aimK));
    if (Math.abs(g.camera.fov - fov) > 1e-3) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
    if (Math.abs(g.viewCam.fov - vfov) > 1e-3) { g.viewCam.fov = vfov; g.viewCam.updateProjectionMatrix(); this.fitScope(); }
    // mouse sensitivity follows the zoom; aiming slows the feet
    if (this.scopeK > 0.01 && !this.wasScoped) { this.baseSens = input.sensitivity; this.wasScoped = true; }
    if (this.wasScoped) input.sensitivity = this.baseSens * lerp(1, 1 / ZOOM, this.scopeK);
    if (this.wasScoped && this.scopeK <= 0.01) { input.sensitivity = this.baseSens; this.wasScoped = false; }
    if (!g.hands.busy) g.player.burden = sm(this.aimK) * 0.5;
  }

  /** the rifle left the hands: put the view back the way it was */
  private stow() {
    const g = this.game;
    this.shown = false;
    this.scope.visible = false; this.flash.visible = false; this.model.visible = true;
    this.aimK = 0; this.scopeK = 0;
    if (this.action) { this.action = ''; this.bolt = { rot: 0, back: 0 }; this.poseBolt(); }
    if (this.wasScoped) { input.sensitivity = this.baseSens; this.wasScoped = false; }
    g.camera.fov = BASE_FOV; g.camera.updateProjectionMatrix();
    g.viewCam.fov = BASE_VFOV; g.viewCam.updateProjectionMatrix(); this.fitScope();
    g.player.yaw -= this.swayApplied.x + this.kickApplied.x; g.player.pitch -= this.swayApplied.y + this.kickApplied.y;
    this.swayApplied.set(0, 0); this.kickApplied.set(0, 0); this.kick.set(0, 0);
    const arms = this.arms;
    if (arms) arms.object.scale.setScalar(1);
    if (!g.hands.busy && g.player.burden <= 0.5) g.player.burden = 0;
  }

  // ------------------------------------------------------------------------------------------------ firing
  private trigger() {
    if (this.chamber === 'live') return this.fire();
    if (this.chamber === 'spent' || (this.chamber === 'empty' && this.mag > 0)) return this.startCycle();
    audio.play('rifle_dry', { vol: 0.9 });
    hud.say(this.ammo > 0 ? '<i>Empty. R to load.</i>' : '<i>Click. No rounds left.</i>', 1.8);
  }

  private fire() {
    const g = this.game, cam = g.camera;
    this.chamber = 'spent';
    cam.updateMatrixWorld();
    const origin = cam.getWorldPosition(new THREE.Vector3());
    let dir: THREE.Vector3;
    if (this.scopeK > 0.9) dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    else {
      // from the hip: down the barrel as the arms hold it, a little loose
      this.model.updateWorldMatrix(true, false);
      origin.copy(this.model.localToWorld(P.muzzle.clone())).applyMatrix4(cam.matrixWorld);
      dir = new THREE.Vector3(1, 0, 0).transformDirection(this.model.matrixWorld).transformDirection(cam.matrixWorld);
      const spread = 0.02 * (1 - this.aimK) + 0.004;
      dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread; dir.normalize();
    }
    this.recoilT = 0;
    this.kick.set((Math.random() - 0.5) * 0.024, 0.05 + Math.random() * 0.012);
    g.player.addShake(this.scoped ? 0.25 : 0.4);
    this.arms?.play('fire');
    this.flashT = 0;
    const mw = this.muzzleWorld();
    this.flashLight.position.copy(mw);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    puffs.emit(mw.clone().addScaledVector(fwd, 0.15), fwd.clone().multiplyScalar(1.4).add(new THREE.Vector3(0, 0.15, 0)), { size: 0.18, grow: 5, life: 2.6, color: new THREE.Color(0.72, 0.7, 0.66), alpha: 0.32, rise: 0.25, n: 7, spread: 0.12 });
    puffs.emit(mw, fwd.clone().multiplyScalar(0.3), { size: 0.12, grow: 3, life: 1.4, color: new THREE.Color(0.6, 0.58, 0.55), alpha: 0.25, rise: 0.3, n: 3, spread: 0.05 });
    // the crack, then the bush throwing it back
    audio.play('rifle_shot', { vol: 1 });
    audio.play('rifle_echo', { vol: 0.9, delay: 0.22 + Math.random() * 0.15 });
    (g as unknown as { lastShotAt: number }).lastShotAt = performance.now();
    g.events.emit('gunshot', { pos: origin.clone(), dir: dir.clone(), loud: 1 });
    this.onShot(origin, dir, this.scopeK > 0.9);
  }

  /** the muzzle, world space */
  muzzleWorld(): THREE.Vector3 {
    this.model.updateWorldMatrix(true, false);
    return this.model.localToWorld(P.muzzle.clone()).applyMatrix4(this.game.camera.matrixWorld);
  }

  // ------------------------------------------------------------------------------------------------ the bolt
  private startCycle() { this.action = 'cycle'; this.actionT = 0; this.arms?.play('bolt'); }
  private reloadOrCycle() {
    if (this.mag < 5 && this.ammo > 0) { this.action = 'reload'; this.actionT = 0; this.reloadPhase = 'open'; this.loadT = 0; this.arms?.play('bolt'); return; }
    if (this.mag > 0 || this.chamber !== 'empty') return this.startCycle();
    audio.play('rifle_dry', { vol: 0.7 });
    hud.say(this.ammo > 0 ? '<i>Full.</i>' : '<i>No rounds. Odile sells them by the box.</i>', 2);
  }
  /** the bolt on the arms' timeline: the handle up (0-.22), back (.25-.42), forward (.52-.66), down (.78-.95) */
  private boltAt(t: number) {
    return { rot: track(t, [[0, 0], [0.22, 1], [0.78, 1], [0.95, 0]]), back: track(t, [[0, 0], [0.25, 0], [0.42, 1], [0.52, 1], [0.66, 0], [0.95, 0]]) };
  }
  private advanceAction(dt: number) {
    if (this.action === 'cycle') {
      const t0 = this.actionT; this.actionT += dt; const t1 = this.actionT;
      const at = (x: number) => t0 < x && t1 >= x;
      if (at(0.08)) audio.play('rifle_bolt_open', { vol: 0.9 });
      if (at(0.4)) this.eject();
      if (at(0.6)) { audio.play('rifle_bolt_close', { vol: 0.9 }); this.chamberRound(); }
      this.bolt = this.boltAt(Math.min(t1, BOLT_DUR));
      if (t1 >= BOLT_DUR) { this.action = ''; this.bolt = { rot: 0, back: 0 }; }
    } else if (this.action === 'reload') {
      this.actionT += dt;
      if (this.reloadPhase === 'open') {
        if (this.actionT - dt < 0.08 && this.actionT >= 0.08) audio.play('rifle_bolt_open', { vol: 0.9 });
        this.bolt = this.boltAt(Math.min(this.actionT, 0.45));
        if (this.actionT >= 0.4 && this.chamber !== 'empty') this.eject();
        if (this.actionT >= 0.48) { this.reloadPhase = 'load'; this.loadT = 0; }
      } else if (this.reloadPhase === 'load') {
        this.bolt = { rot: 1, back: 1 };
        const t0 = this.loadT; this.loadT += dt;
        // a round pressed down into the box: the left hand reaches to the open action
        if (t0 === 0) this.arms?.play('press', { target: this.portView(), space: 'view', hand: 'L', style: 'press' });
        if (t0 < 0.32 && this.loadT >= 0.32 && this.ammo > 0 && this.mag < 5) { this.game.take(AMMO, 1); this.mag++; audio.play('rifle_load', { vol: 0.9 }); }
        if (this.loadT >= 0.62) {
          this.loadT = 0;
          if (this.mag >= 5 || this.ammo <= 0) { this.reloadPhase = 'close'; this.arms?.play('bolt'); }
        }
      } else {
        // closing: the bolt from its forward stroke
        const t0 = this.loadT; this.loadT += dt;
        const t = 0.45 + this.loadT;
        if (t0 < 0.15 && this.loadT >= 0.15) { audio.play('rifle_bolt_close', { vol: 0.9 }); this.chamberRound(); }
        this.bolt = this.boltAt(Math.min(t, BOLT_DUR));
        if (t >= BOLT_DUR) {
          this.action = ''; this.bolt = { rot: 0, back: 0 };
          hud.say(`<i>${this.mag} in the box${this.chamber === 'live' ? ', one up the spout' : ''}. ${this.ammo} in the pocket.</i>`, 2.5);
        }
      }
    }
  }
  private portView(): THREE.Vector3 { this.model.updateWorldMatrix(true, false); return this.model.localToWorld(P.port.clone()); }
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
    s.position.copy(this.portView()).applyMatrix4(cam.matrixWorld);
    s.quaternion.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    this.game.scene.add(s);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const v = right.multiplyScalar(2.2 + Math.random()).add(new THREE.Vector3(0, 1.6 + Math.random() * 0.8, 0)).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), -0.3);
    this.shells.push({ obj: s, v, w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30), t: 0, rest: false, bounced: 0 });
    if (this.shells.length > 24) this.shells.shift()?.obj.removeFromParent();
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
    this.boltPivot.position.copy(P.boltPivot).add(new THREE.Vector3(-this.bolt.back * P.boltTravel, 0, 0));
    this.boltPivot.rotation.set(-this.bolt.rot * 1.35, 0, 0);
  }

  // ------------------------------------------------------------------------------------------------ the scope picture
  private fitScope() {
    const cam = this.game.viewCam, d = 0.03;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    this.scope.position.set(0, 0, -d);
    this.scope.scale.set(h, h, 1);
  }
  /** state for saves and the test page */
  status() { return { mag: this.mag, chamber: this.chamber, ammo: this.ammo, aim: +this.aimK.toFixed(2), scoped: this.scoped, action: this.action }; }
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
 *  lens edge with a little cold fringe, black wings to the screen's sides, a black dip as the eye comes to the tube
 *  and the white kick of the shot. One unit high, centred, drawn last over the viewmodel. */
function scopePicture(): THREE.Group {
  const N = 384, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N), D = img.data;
  const R = N * 0.47;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - N / 2 + 0.5, dy = y - N / 2 + 0.5, r = Math.hypot(dx, dy), i = (y * N + x) * 4;
    let col = [0, 0, 0], a = 255;
    if (r < R) {
      a = 0;
      const e = (r - R * 0.86) / (R * 0.14);
      if (e > 0) { const d = ((x * 7 + y * 13) % 5) / 5; if (e > d * 0.9 + 0.1) { a = 255; col = e > 0.7 ? [0, 0, 0] : [10, 14, 18]; } else if (e > 0.25 && e < 0.45) { a = 60; col = [40, 70, 90]; } }
      const ax = Math.abs(dx), u = dy;
      const post = ax < 1.6 && u > 2 && u < R;
      const chevron = u >= -1 && u <= 9 && Math.abs(ax - u * 0.85) < 1.1 && ax < 8;
      const side = Math.abs(dy) < 1.4 && ax > R * 0.32 && ax < R;
      const ticks = Math.abs(dy) < 1 && ax < R * 0.32 && ax > 12 && ((ax | 0) % 24 === 0);
      if (post || chevron || side || ticks) { a = 255; col = [6, 6, 8]; }
    }
    D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const group = new THREE.Group();
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); sq.renderOrder = 100;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false, fog: false });
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), black); wl.position.x = -2.5; wl.renderOrder = 100;
  const wr = wl.clone(); wr.position.x = 2.5;
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
  const fade = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), fadeMat); fade.renderOrder = 101; fade.position.z = 0.001;
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMat); fl.renderOrder = 99; fl.position.z = -0.001;
  group.add(sq, wl, wr, fade, fl);
  group.userData.fade = fadeMat; group.userData.flash = flashMat;
  return group;
}
