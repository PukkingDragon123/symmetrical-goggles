// Zoom-in forging at Ray's lean-to beside the woodshed. Step up to the forge (E on the hearth, the anvil or the
// slate) and the camera eases into the work; the hands do it:
//   slate      click a chalked job: sharpen an axe, re-hang a chewed handle, forge a new felling bit, S-hooks,
//              nails, log dogs, a splitting wedge (each needs its stock: bar, high-carbon steel, a hickory handle)
//   fire       the stock goes in the coals in the tongs (right hand); hold LMB on the bellows handle (or Space)
//              and the left hand pumps: the coals flare, the steel climbs dull red -> cherry -> orange -> yellow
//              -> white (burning!). RMB takes it to the anvil (or the slack tub for a quench). RMB on the coals
//              shovels on charcoal / coal from the pack
//   anvil      tongs in the left hand, hammer in the right; aim with the cursor along the glowing work and click
//              as the ring closes (the hammer at the top of its swing): good heat + good timing + on the chalk
//              mark moves the metal. Sparks, ringing, scale flakes on the face. Too cold and it only rings (and
//              cracks); too hot and it sparkles and burns. Bends happen over the horn. RMB: back to the fire
//   slack tub  click to plunge: at cherry red it hardens; too hot it cracks, too cold it stays soft
//   grindstone hold LMB to treadle the wheel and grind; cursor up/down sets the bevel angle, left/right walks
//              the edge across the stone, RMB turns the axe over for the other bevel. The edge brightens where
//              it's ground
// Outputs are real: axe sharpness (ToolStats.sharp), a chewed handle rehung, a felling-bit upgrade (flags, see
// ./items.ts), iron hooks, nails, log dogs and a wedge (items with tool effects / store value). Fuel: lump
// charcoal (store, or the retort outside: load it with splits, light it, come back in a few hours) or coal.
import * as THREE from 'three';
import type { Game } from '../game';
import { ITEMS } from '../items';
import { audio, type Voice } from '../../audio/audio';
import { debris, puffs } from '../../gfx/particles';
import { registerInteractable } from '../interact';
import { Station, Bits } from '../cooking/station';
import { GRIP, StationHands } from '../cooking/hands';
import { Pix } from '../cooking/paint';
import { buildForge, FORGE, type ForgePlace } from '../../places/forge';
import { buildTongs, buildHammer } from '../../places/forge_parts';
import { Workpiece, STOCK, heatColor, heatName, type Op } from './work';
import { registerForgeItems, axeIds, maxSharp, setBit, applyToolMods, bitQuality } from './items';

export { chewHandle, applyToolMods, registerForgeItems } from './items';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;

type ViewName = 'slate' | 'fire' | 'anvil' | 'quench' | 'grind';
type JobId = 'sharpen' | 'rehang' | 'bit' | 'hooks' | 'nails' | 'dogs' | 'wedge';
interface Step { kind: 'forge' | 'quench' | 'grind' | 'drive'; op?: Op; zone?: [number, number]; label: string; horn?: boolean; strikes?: number }
interface JobDef { name: string; stock?: keyof typeof STOCK; mat?: string; matN?: number; steps: Step[]; needsAxe?: boolean; out?: [string, number] }

const JOBS: Record<JobId, JobDef> = {
  sharpen: { name: 'Sharpen an axe', needsAxe: true, steps: [{ kind: 'grind', label: 'Grind both bevels' }] },
  rehang: { name: 'Re-hang a handle', needsAxe: true, mat: 'axe_handle', steps: [{ kind: 'drive', label: 'Drive the head home', strikes: 5 }, { kind: 'drive', label: 'Drive the wedge', strikes: 3 }] },
  bit: { name: 'New felling bit', needsAxe: true, stock: 'flat', mat: 'tool_steel', steps: [{ kind: 'forge', op: 'taper', zone: [0.45, 1], label: 'Draw out the bit' }, { kind: 'quench', label: 'Harden it at cherry red' }, { kind: 'grind', label: 'Grind the new edge' }] },
  hooks: { name: 'S-hooks', stock: 'bar', mat: 'iron_stock', out: ['iron_hooks', 1], steps: [{ kind: 'forge', op: 'point', zone: [0.72, 1], label: 'Draw a point' }, { kind: 'forge', op: 'bend', zone: [0.62, 1], label: 'Curl it over the horn', horn: true }] },
  nails: { name: 'Nails', stock: 'bar', mat: 'iron_stock', out: ['nails', 1], steps: [{ kind: 'forge', op: 'point', zone: [0.7, 1], label: 'Draw the points' }, { kind: 'forge', op: 'head', zone: [0.44, 0.56], label: 'Upset the heads' }] },
  dogs: { name: 'Log dogs', stock: 'bar', mat: 'iron_stock', matN: 2, out: ['log_dogs', 1], steps: [{ kind: 'forge', op: 'point', zone: [0.74, 1], label: 'Draw the points' }, { kind: 'forge', op: 'bend90', zone: [0.66, 0.8], label: 'Bend the leg over the edge', horn: true }] },
  wedge: { name: 'Splitting wedge', stock: 'block', mat: 'iron_stock', matN: 2, out: ['wedge', 1], steps: [{ kind: 'forge', op: 'taper', zone: [0.4, 1], label: 'Forge the taper' }, { kind: 'quench', label: 'Harden it at cherry red' }] },
};
const JOB_ORDER: JobId[] = ['sharpen', 'rehang', 'bit', 'hooks', 'nails', 'dogs', 'wedge'];

const VIEWS: Record<ViewName, { pos: THREE.Vector3; look: THREE.Vector3; fov: number }> = {
  slate: { pos: V3(0.9, 1.5, -0.62), look: V3(0.9, 1.43, -1.4), fov: 50 },
  fire: { pos: V3(-0.9, 1.42, 0.14), look: V3(-0.93, 0.82, -0.78), fov: 56 },
  anvil: { pos: V3(0.26, 1.36, 0.74), look: V3(0.32, 0.8, 0.08), fov: 54 },
  quench: { pos: V3(0.02, 1.25, -0.3), look: V3(0.05, 0.42, -1.0), fov: 54 },
  grind: { pos: V3(1.86, 1.06, 1.18), look: V3(1.44, 0.72, 0.7), fov: 48 },
};

export class ForgeStation extends Station {
  readonly place: ForgePlace;
  private viewName: ViewName = 'slate';
  private bits = new Bits(500);
  private bed = { fuel: 1.6, air: 0.15, T: 520, coal: 0 };
  private job: { id: JobId; i: number; axe: string | null; q: number; cold: number; burnt: number; quench: number; drive: number; started: boolean } | null = null;
  private piece: Workpiece | null = null;
  private pieceAt: 'fire' | 'anvil' | 'tub' | 'none' = 'none';
  private tongs: THREE.Group;
  private hammer: THREE.Group;
  private pump = { k: 0, t: 0, holding: false };
  private ring: THREE.Mesh;
  private ringT = 0;
  private strikeK = 1;
  private strikeAt = new THREE.Vector3();
  private lastStrike = -1;
  private slateTex: THREE.CanvasTexture;
  private slateRows: { id: JobId; ok: boolean; why: string; y0: number; y1: number }[] = [];
  private grind = { L: new Float32Array(8), R: new Float32Array(8), side: 1 as 1 | -1, speed: 0, angle: 0.5, pos: 0.5, axe: null as THREE.Object3D | null, strip: null as THREE.Mesh | null, stripTex: null as THREE.DataTexture | null, edge: [0, 0, 0] as [number, number, number], spin: 0 };
  private voices: { fire: Voice | null; grind: Voice | null } = { fire: null, grind: null };
  private retort = { load: 0, burn: 0, done: 0 };
  private modT = 0;
  private hover: { text: string; at: THREE.Vector3 } | null = null;
  private time = 0;
  private flakes = 0;
  /** game-time timers (the work waits on the simulation, not the wall clock) */
  private timers: { t: number; f: () => void }[] = [];
  private pieceLight = new THREE.PointLight(0xff8a40, 0, 1.4, 1.8);
  private later(sec: number, f: () => void): void { this.timers.push({ t: sec, f }); }

  constructor(g: Game, place: ForgePlace) {
    super(g);
    this.place = place;
    g.scene.add(this.bits.mesh);
    this.bits.setCamera(g.camera);
    this.tongs = buildTongs(0.0);
    this.hammer = buildHammer('cross');
    // the timing ring: a chalk-white ring that closes on the strike point
    const rg = new THREE.RingGeometry(0.85, 1, 24);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }));
    this.ring.renderOrder = 9;
    this.ring.visible = false;
    g.scene.add(this.ring);
    // the slate's chalk canvas
    const c = document.createElement('canvas');
    c.width = 448; c.height = 336;
    this.slateTex = new THREE.CanvasTexture(c);
    this.slateTex.colorSpace = THREE.SRGBColorSpace;
    this.slateTex.magFilter = THREE.NearestFilter;
    const sm = place.parts.slate.material as THREE.MeshStandardMaterial;
    sm.map = this.slateTex; sm.color.set(0xffffff); sm.needsUpdate = true;
    this.paintSlate();
    // ---- walking-around interactables
    const H = place.hits;
    registerInteractable(H.fire, { kind: 'custom', label: () => (this.job ? 'Back to the forge' : 'Work at the forge'), use: () => this.walkUp(this.job ? this.jobView() : 'slate') });
    registerInteractable(H.anvil, { kind: 'custom', label: () => (this.job ? 'Back to the anvil' : 'Work at the forge'), use: () => this.walkUp(this.job ? this.jobView() : 'slate') });
    registerInteractable(H.lever, { kind: 'custom', label: () => 'Work at the forge', use: () => this.walkUp(this.job ? this.jobView() : 'slate') });
    registerInteractable(H.slate, { kind: 'custom', label: () => 'Smithing jobs', use: () => this.walkUp('slate') });
    registerInteractable(H.grind, { kind: 'custom', label: () => 'Grindstone (sharpen an axe)', use: () => { if (!this.job && axeIds(g).length) this.startJob('sharpen'); this.walkUp(this.job ? this.jobView() : 'slate'); } });
    registerInteractable(H.bin, { kind: 'custom', label: () => (g.owns('charcoal') || g.owns('coal') ? 'Shovel fuel onto the forge' : 'Charcoal bin (empty)'), use: () => this.addFuel() });
    registerInteractable(H.retort, { kind: 'custom', label: () => this.retortLabel(), use: () => this.retortUse() });
    this.setView(this.worldView('slate'));
    this.parallax = 0.025;
    this.fillLevel = 0.85;
    // hot steel lights the anvil and the tongs
    this.pieceLight.position.set(0, 0, 0);
    g.scene.add(this.pieceLight);
  }

  private W(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 { return this.place.group.localToWorld(out.copy(p)); }
  private L(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 { return this.place.group.worldToLocal(out.copy(p)); }
  private dirW(d: THREE.Vector3): THREE.Vector3 { return d.clone().applyQuaternion(this.place.group.getWorldQuaternion(new THREE.Quaternion())).normalize(); }
  private worldView(n: ViewName) { const v = VIEWS[n]; return { pos: this.W(v.pos), look: this.W(v.look), fov: v.fov }; }

  protected standSpot(): { x: number; z: number; yaw: number } {
    const p = this.W(V3(-0.1, 0, 1.0)), f = this.W(V3(-0.1, 0, 0)).sub(p);
    return { x: p.x, z: p.z, yaw: Math.atan2(-f.x, -f.z) };
  }

  private walkUp(v: ViewName): void {
    if (this.enter()) this.goView(v);
  }

  private goView(n: ViewName): void {
    this.viewName = n;
    this.setView(this.worldView(n));
    if (this.script) { this.script.x = 0; this.script.y = 0; }
  }

  private jobView(): ViewName {
    const s = this.step();
    if (!s) return 'slate';
    if (s.kind === 'grind') return 'grind';
    if (s.kind === 'drive') return 'anvil';
    if (s.kind === 'quench') return this.pieceAt === 'tub' ? 'quench' : 'fire';
    return this.pieceAt === 'anvil' ? 'anvil' : 'fire';
  }

  protected onEnter(): void {
    this.goView(this.job ? this.jobView() : 'slate');
    this.paintSlate();
  }
  protected onExit(): void {
    this.ring.visible = false;
    this.restTools();
    this.voices.grind?.stop(0.3); this.voices.grind = null;
    // the work stays where it is: in the coals it keeps soaking, on the anvil it cools
  }

  private step(): Step | null { return this.job ? JOBS[this.job.id].steps[this.job.i] ?? null : null; }

  // ------------------------------------------------------------------------------------------ jobs
  private chooseAxe(): string | null {
    const ids = axeIds(this.g);
    if (!ids.length) return null;
    const prev = (this as unknown as { prevHeld: string | null }).prevHeld;
    if (prev && ids.includes(prev)) return prev;
    return ids.slice().sort((a, b) => (ITEMS[a].tool!.sharp - ITEMS[b].tool!.sharp))[0];
  }

  private canStart(id: JobId): { ok: boolean; why: string } {
    const g = this.g, d = JOBS[id];
    if (d.needsAxe && !axeIds(g).length) return { ok: false, why: 'no axe' };
    if (id === 'rehang') {
      if (!g.owns('axe_handle')) return { ok: false, why: 'need a hickory handle' };
    }
    if (d.mat && !g.owns(d.mat)) return { ok: false, why: `need ${ITEMS[d.mat]?.name.toLowerCase() ?? d.mat}` };
    if (d.mat && d.matN && (g.inv.items.get(d.mat) ?? 0) < d.matN) return { ok: false, why: `need ${d.matN} ${ITEMS[d.mat]?.name.toLowerCase()}` };
    if (d.stock && this.bed.fuel < 0.15 && !g.owns('charcoal') && !g.owns('coal')) return { ok: false, why: 'no fuel' };
    if (id === 'sharpen') { const a = this.chooseAxe(); if (a && ITEMS[a].tool!.sharp >= maxSharp(g, a) - 0.01) return { ok: true, why: 'already keen' }; }
    return { ok: true, why: '' };
  }

  private startJob(id: JobId): void {
    const g = this.g, d = JOBS[id];
    const c = this.canStart(id);
    if (!c.ok) { this.say(`Can't: ${c.why}.`, 2.5); return; }
    if (d.mat) g.take(d.mat, d.matN ?? 1);
    this.job = { id, i: 0, axe: d.needsAxe ? this.chooseAxe() : null, q: 1, cold: 0, burnt: 0, quench: 1, drive: 0, started: true };
    if (d.stock) {
      this.piece = new Workpiece(STOCK[d.stock]);
      this.piece.T = 20;
      this.pieceAt = 'fire';
      this.say(`${d.name}. Into the coals. Pump the bellows.`, 3);
    } else this.say(`${d.name}.`, 2);
    if (id === 'sharpen' || id === 'bit') this.resetGrind();
    if (id === 'rehang') this.job.drive = 0;
    g.sound('pickup', undefined, 0.5);
    this.paintSlate();
    this.goView(this.jobView());
  }

  private nextStep(): void {
    const j = this.job!;
    j.i++;
    const s = this.step();
    if (!s) { this.finishJob(); return; }
    this.pop(s.label, this.W(VIEWS[this.jobView()].look).add(V3(0, 0.15, 0)), '#ffe08a');
    if (s.kind === 'grind') { this.resetGrind(); this.goView('grind'); }
  }

  private finishJob(): void {
    const g = this.g, j = this.job!, d = JOBS[j.id];
    const piece = this.piece;
    let q = j.q;
    if (piece) {
      const s0 = d.steps.find((s) => s.kind === 'forge');
      if (s0?.op && s0.zone) q *= 0.5 + 0.5 * piece.shapeQuality(s0.op, s0.zone);
    }
    q *= Math.max(0.3, 1 - j.cold * 0.08 - j.burnt * 0.06) * j.quench;
    q = clamp(q, 0, 1);
    const grade = q > 0.85 ? 'Fine work.' : q > 0.6 ? 'Good enough.' : 'Rough, but it\'ll do.';
    if (j.id === 'sharpen' || j.id === 'bit') {
      const id = j.axe!;
      if (j.id === 'bit') setBit(g, id, clamp(q, 0.3, 1));
      const sharp = this.grindResult(id);
      ITEMS[id].tool!.sharp = Math.max(ITEMS[id].tool!.sharp, sharp);
      applyToolMods(g);
      this.say(j.id === 'bit' ? `A new bit steeled onto ${ITEMS[id].name.toLowerCase()}. It bites like it means it. ${grade}` : `Edge at ${Math.round(sharp * 100)}%. ${sharp > 0.85 ? 'Shaving sharp.' : 'Keen enough.'}`, 4);
    } else if (j.id === 'rehang') {
      g.flags.delete(`chewed:${j.axe}`);
      applyToolMods(g);
      this.say('New hickory, head driven home, wedge in. Tight as a drum.', 3.5);
    } else if (d.out) {
      const [id, n] = d.out;
      g.give(id, n);
      this.say(`${ITEMS[id].name}. ${grade}`, 3);
    }
    g.sound('sigh_satisfied', undefined, 0.4);
    if (this.piece) { this.piece.mesh.removeFromParent(); this.piece = null; }
    this.pieceAt = 'none';
    this.job = null;
    this.restTools();
    this.paintSlate();
    this.goView('slate');
  }

  // ------------------------------------------------------------------------------------------ the slate
  private paintSlate(): void {
    const c = this.slateTex.image as HTMLCanvasElement;
    const x = c.getContext('2d')!;
    // slate: blue-black with chalk smudges (pixel noise), wooden frame drawn by the place
    const p = new Pix(112, 84);
    p.each((i, j) => { const n = ((i * 7 + j * 13) % 11) / 11, s = Math.sin(i * 0.3) * Math.cos(j * 0.4); const v = 34 + n * 6 + s * 5; return [v * 0.9, v, v * 1.08]; });
    x.imageSmoothingEnabled = false;
    x.drawImage(p.done(), 0, 0, 448, 336);
    x.fillStyle = 'rgba(230,226,210,0.06)';
    for (let k = 0; k < 6; k++) x.fillRect(20 + k * 70, 30 + (k % 3) * 90, 90, 40);
    x.fillStyle = '#e8e4d4';
    x.font = '32px Alagard, serif';
    x.textBaseline = 'top';
    x.fillText('JOBS', 18, 10);
    x.font = '16px Alagard, serif';
    x.fillStyle = '#bdb8a8';
    const fuel = `fuel: ${this.bed.fuel.toFixed(1)} kg in the forge`;
    x.fillText(fuel, 200, 22);
    this.slateRows = [];
    let y = 58;
    for (const id of JOB_ORDER) {
      const st = this.canStart(id);
      const active = this.job?.id === id;
      x.fillStyle = active ? '#ffd890' : st.ok ? '#ece8d8' : '#7c786c';
      let name = JOBS[id].name;
      if (JOBS[id].needsAxe) { const a = this.job?.axe ?? this.chooseAxe(); if (a) name += `: ${ITEMS[a].name.replace(/^Grandpa's /, '')}${id === 'sharpen' ? ` ${Math.round(ITEMS[a].tool!.sharp * 100)}%` : ''}`; }
      x.fillText((active ? '> ' : '') + name, 18, y);
      if (!st.ok || st.why) { x.fillStyle = '#8c887a'; x.fillText(st.why, 300, y); }
      // chalk underline
      x.fillStyle = 'rgba(230,226,210,0.25)';
      x.fillRect(18, y + 19, Math.min(260, name.length * 8), 1);
      this.slateRows.push({ id, ok: st.ok, why: st.why, y0: y - 4, y1: y + 22 });
      y += 36;
    }
    this.slateTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------------------ simulation
  protected simulate(dt: number): void {
    const g = this.g;
    this.time += dt;
    for (const t of this.timers.slice()) { t.t -= dt; if (t.t <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.f(); } }
    const B = this.bed;
    // the coal bed: air from the bellows feeds it, fuel burns faster in the blast
    B.air = Math.max(0, B.air - dt * 0.11);
    const fuelK = Math.min(1, B.fuel / 0.6);
    const target = B.fuel > 0.02 ? 420 + (B.air * 950 + 60) * fuelK + (B.coal > 0 ? 70 : 0) : 20;
    B.T += (target - B.T) * Math.min(1, dt / 2.2);
    B.fuel = Math.max(0, B.fuel - dt * (0.0006 + B.air * 0.0035));
    B.coal = Math.max(0, B.coal - dt * 0.0012);
    this.place.setHeat(clamp((B.T - 400) / 900, 0, 1));
    this.place.parts.coal.fuel(clamp(B.fuel / 1.5, 0.15, 1));
    // the fire's roar follows the blast
    const near = this.place.group.getWorldPosition(new THREE.Vector3()).distanceTo(g.camera.position) < 14;
    const roar = near ? clamp((B.T - 450) / 900, 0, 1) : 0;
    if (roar > 0.02) {
      if (!this.voices.fire) this.voices.fire = audio.play('fire_camp', { pos: this.W(V3(FORGE.pot.x, 1, FORGE.pot.z)), loop: true, vol: 0, fadeIn: 0.5 });
      this.voices.fire?.setVol(0.2 + roar * 0.6, 0.2); this.voices.fire?.setRate(0.9 + B.air * 0.35, 0.2);
    } else if (this.voices.fire) { this.voices.fire.stop(0.6); this.voices.fire = null; }
    // sparks and smoke from the stack when the blast is up
    if (B.air > 0.35 && Math.random() < dt * 8 * B.air) debris.emit('ember', this.W(V3(FORGE.pot.x + (Math.random() - 0.5) * 0.1, 0.86, FORGE.pot.z)), this.dirW(V3(0, 1, 0)).multiplyScalar(0.8 + B.air), 1, { spread: 0.4, color: new THREE.Color(1, 0.55, 0.15) });
    // the work: soaking in the coals or cooling in the air
    const p = this.piece;
    if (!p) this.pieceLight.intensity = 0;
    if (p) {
      if (this.pieceAt === 'fire') p.T += (B.T - p.T) * Math.min(1, dt / 5.5);
      else if (this.pieceAt === 'tub') p.T += (20 - p.T) * Math.min(1, dt * 2.5);
      else p.T += (20 - p.T) * Math.min(1, dt * 0.045);
      p.paintHeat();
      this.pieceLight.intensity = this.pieceAt === 'fire' || this.pieceAt === 'tub' ? 0 : clamp((p.T - 520) / 600, 0, 1) * 2.2;
      heatColor(Math.max(700, p.T), this.pieceLight.color);
      if (p.mesh.parent) p.at(0.8, this.pieceLight.position).add(V3(0, 0.05, 0));
      if (p.T > 1260 && this.pieceAt === 'fire' && Math.random() < dt * 12) {
        // burning: the steel throws white starry sparks
        debris.emit('spark', p.at(0.95), this.dirW(V3(0, 1.4, 0)), 2, { spread: 1.2, color: new THREE.Color(1, 0.95, 0.8) });
        if (this.job && Math.random() < dt * 2) this.job.burnt += 0.25;
      }
      if (!p.mesh.parent) this.attachPiece();
    }
    this.animateBellows(dt);
    this.animateGrind(dt);
    this.bits.update(dt);
    // the retort smoulders for hours
    const R = this.retort;
    if (R.burn > 0) {
      R.burn = Math.max(0, R.burn - dt * g.timeScale / 3600);
      this.place.parts.retortGlow.emissiveIntensity = 1.2 + Math.sin(this.time * 3) * 0.3;
      if (Math.random() < dt * 3) puffs.emit(this.place.parts.retort.localToWorld(V3(0.12, 1.58, 0.1)), V3(0, 0.6, 0), { size: 0.12, grow: 4, life: 3, color: new THREE.Color(0.55, 0.54, 0.52), alpha: 0.35, rise: 0.4 });
      if (R.burn === 0) { R.done = Math.max(1, Math.round(R.load / 7)); R.load = 0; }
    } else this.place.parts.retortGlow.emissiveIntensity = 0;
    if ((this.modT -= dt) <= 0) { this.modT = 1; applyToolMods(g); }
    // the timing ring follows the strike cycle
    if (this.phase !== 'on' || this.viewName !== 'anvil') this.ring.visible = false;
  }

  private animateBellows(dt: number): void {
    const P = this.pump;
    const want = P.holding ? 0.5 - 0.5 * Math.cos(P.t * Math.PI * 2 / 0.75) : 0;
    if (P.holding) {
      const before = P.t % 0.75;
      P.t += dt;
      // a stroke lands at the bottom of each cycle
      if (before < 0.375 && P.t % 0.75 >= 0.375) {
        this.bed.air = Math.min(1, this.bed.air + 0.2);
        audio.play('fire_ignite', { pos: this.W(V3(FORGE.pot.x, 0.9, FORGE.pot.z)), vol: 0.22, rate: 1.4 + Math.random() * 0.2 });
        audio.play('breath_cold', { pos: this.W(V3(FORGE.bellows.x, 0.7, -0.6)), vol: 0.3, rate: 0.6 });
        if (this.bed.T > 600) debris.emit('spark', this.W(V3(FORGE.pot.x, 0.84, FORGE.pot.z)), this.dirW(V3(0, 1.6, 0)), 5, { spread: 0.9, color: new THREE.Color(1, 0.6, 0.2) });
      }
    } else P.t = 0;
    P.k += (want - P.k) * Math.min(1, dt * 12);
    const parts = this.place.parts;
    // the lever pitches down at the handle, the bellows' top board drops as it exhales
    parts.lever.rotation.x = P.k * 0.32;
    parts.bellows.setOpen(0.17 - P.k * 0.11 + Math.sin(this.time * 0.7) * 0.003);
    // the connecting rod between a point on the lever and the top board
    const a = parts.lever.localToWorld(V3(0, -0.02, 0.32));
    const b = parts.bellows.top.localToWorld(V3(0.12, 0.03, 0.25));
    const rod = parts.rod;
    const la = this.L(a), lb = this.L(b);
    rod.position.copy(la);
    const dir = lb.clone().sub(la);
    rod.scale.set(1, dir.length(), 1);
    rod.quaternion.setFromUnitVectors(V3(0, -1, 0), dir.normalize());
  }

  private animateGrind(dt: number): void {
    const G = this.grind, gs = this.place.parts.grind;
    G.speed *= Math.exp(-dt * 0.6);
    G.spin += G.speed * dt * 7;
    gs.wheel.rotation.x = -G.spin;
    gs.crank.rotation.x = -G.spin;
    // crank pin -> pitman -> treadle (rocks about its back pivot)
    const pin = V3(0.29, gs.axleY - 0.12 * Math.cos(G.spin), 0.12 * Math.sin(G.spin));
    const tread = V3(0.29, 0.06 + 0.07 * (0.5 - 0.5 * Math.cos(G.spin)), 0.25);
    gs.treadle.rotation.x = -0.14 * (0.5 - 0.5 * Math.cos(G.spin)) + 0.05;
    gs.pitman.position.copy(pin);
    const d = tread.clone().sub(pin);
    gs.pitman.scale.set(1, d.length() / 0.5, 1);
    gs.pitman.quaternion.setFromUnitVectors(V3(0, -1, 0), d.normalize());
    const v = this.voices;
    if (G.speed > 0.05 && this.phase !== 'off') {
      if (!v.grind) v.grind = audio.play('saw_hand', { pos: this.W(V3(FORGE.grind.x, 0.7, FORGE.grind.z)), loop: true, vol: 0, rate: 1.6 });
      v.grind?.setVol(Math.min(0.5, G.speed * 0.35) * (this.ptr.down ? 1 : 0.35), 0.1); v.grind?.setRate(1.3 + G.speed * 0.25, 0.1);
    } else if (v.grind) { v.grind.stop(0.3); v.grind = null; }
  }

  // ------------------------------------------------------------------------------------------ work
  protected work(dt: number): void {
    this.hover = null;
    switch (this.viewName) {
      case 'slate': this.workSlate(); break;
      case 'fire': this.workFire(dt); break;
      case 'anvil': this.workAnvil(dt); break;
      case 'quench': this.workQuench(dt); break;
      case 'grind': this.workGrind(dt); break;
    }
    // the slate is one click away from anywhere: look up and left
    if (this.viewName !== 'slate' && this.ptr.y > 0.9 && this.ptr.pressed) this.goView('slate');
    this.label = this.hover;
    this.poseHands(dt);
  }

  private workSlate(): void {
    const sl = this.place.parts.slate;
    const h = this.pick([sl]);
    if (!h || !h.uv) { if (this.job) this.hover = { text: 'Back to work: RMB', at: this.W(V3(0.9, 1.25, -1.35)) }; if (this.job && this.ptr.rpressed) this.goView(this.jobView()); return; }
    const py = (1 - h.uv.y) * 336;
    const row = this.slateRows.find((r) => py >= r.y0 && py <= r.y1);
    if (!row) { this.hover = this.job ? { text: 'RMB: back to work', at: h.point } : null; if (this.job && this.ptr.rpressed) this.goView(this.jobView()); return; }
    const active = this.job?.id === row.id;
    this.hover = { text: active ? 'Carry on' : this.job ? `Finish the ${JOBS[this.job.id].name.toLowerCase()} first (RMB: back)` : row.ok ? `Start: ${JOBS[row.id].name}` : row.why, at: h.point };
    if (this.ptr.pressed) {
      if (active) this.goView(this.jobView());
      else if (!this.job) this.startJob(row.id);
    }
    if (this.job && this.ptr.rpressed) this.goView(this.jobView());
  }

  private workFire(_dt: number): void {
    const p = this.piece, s = this.step(), g = this.g;
    const parts = this.place.parts;
    const h = this.pick([this.place.hits.lever, this.place.hits.fire, parts.lever]);
    const onLever = !!h && (h.object === this.place.hits.lever || h.object.parent === parts.lever || h.object === parts.lever);
    this.pump.holding = (this.ptr.down && onLever) || g.mode === 'cutscene' && (this as unknown as { spaceHeld?: boolean }).spaceHeld === true;
    this.pump.holding = this.pump.holding || (this.ptr.down && this.pump.holding) || inputSpace();
    const heat = p ? `${heatName(p.T)}` : '';
    if (onLever) this.hover = { text: this.pump.holding ? 'Pumping…' : 'Pump the bellows (hold)', at: h!.point };
    else if (h) this.hover = { text: p ? `${heat}  ·  RMB: ${s?.kind === 'quench' ? 'to the slack tub' : 'to the anvil'}` : (g.owns('charcoal') || g.owns('coal') ? 'RMB: shovel on fuel' : `Coals: ${heatName(this.bed.T)}`), at: h.point };
    if (h && !onLever && this.ptr.rpressed) {
      if (p && s) { if (s.kind === 'quench') this.toTub(); else this.toAnvil(); }
      else this.addFuel();
    } else if (!h && this.ptr.rpressed && p && s) { if (s.kind === 'quench') this.toTub(); else this.toAnvil(); }
    if (p && s && s.kind === 'forge' && p.T > 1180 && !this.job!.started) { /* noop */ }
    if (p && !p.mesh.userData.calledHeat) p.mesh.userData.calledHeat = '';
    if (p) {
      const name = heatName(p.T);
      if (name !== p.mesh.userData.calledHeat) {
        p.mesh.userData.calledHeat = name;
        const good = s?.kind === 'quench' ? name === 'cherry red' : name === 'orange' || name === 'yellow-orange' || name === 'yellow';
        if (p.T > 480) this.pop(name, p.at(0.9).add(V3(0, 0.06, 0)), good ? '#ffd070' : name.startsWith('white') ? '#ffffff' : '#e0a080');
      }
    }
    if (this.bed.fuel < 0.25 && !this.calledFuel) { this.calledFuel = true; this.say(g.owns('charcoal') || g.owns('coal') ? 'The fire\'s running low. Shovel on some fuel (RMB on the coals).' : 'Nearly out of fuel. Charcoal from the store, or burn some in the retort.', 3.5); }
    if (this.bed.fuel > 0.4) this.calledFuel = false;
  }
  private calledFuel = false;

  private toAnvil(): void {
    if (!this.piece) return;
    this.pieceAt = 'anvil';
    this.goView('anvil');
    this.ringT = 0;
    this.g.sound('pickup', undefined, 0.3, 0.7);
  }
  private toFire(): void {
    if (!this.piece) return;
    this.pieceAt = 'fire';
    this.goView('fire');
    this.ring.visible = false;
  }
  private toTub(): void {
    if (!this.piece) return;
    this.pieceAt = 'none';
    this.goView('quench');
  }

  private workAnvil(dt: number): void {
    const s = this.step(), p = this.piece, j = this.job;
    if (!s || !j) { this.ring.visible = false; this.hover = { text: 'Pick a job on the slate (look up)', at: this.W(VIEWS.anvil.look) }; return; }
    if (s.kind === 'drive') { this.workDrive(dt, s); return; }
    if (!p || s.kind !== 'forge') { this.ring.visible = false; if (this.ptr.rpressed) this.toFire(); return; }
    // the cursor along the work: aim the blow
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.dirW(V3(0, 1, 0)), this.W(V3(0, FORGE.anvil.stump + this.place.parts.anvil.faceY + 0.012, 0)));
    const hit = this.pointerOn(plane);
    const zone = s.zone!;
    let u = 0.85;
    if (hit) u = clamp(p.uAt(hit), 0.02, 1);
    const at = p.at(u);
    this.strikeAt.copy(at);
    // the ring closes over the cycle; the hammer climbs with it
    const cycle = 0.85;
    this.ringT += dt;
    if (this.ringT > cycle + 0.25) this.ringT = 0;
    const k = clamp(this.ringT / cycle, 0, 1.3);
    const sc = 0.012 + 0.05 * Math.max(0, 1 - k);
    this.ring.visible = true;
    this.ring.position.copy(at).add(this.dirW(V3(0, 0.012, 0)));
    this.ring.quaternion.copy(this.place.group.getWorldQuaternion(new THREE.Quaternion()));
    this.ring.scale.setScalar(sc);
    const inZone = u >= zone[0] - 0.04 && u <= zone[1] + 0.04;
    (this.ring.material as THREE.MeshBasicMaterial).color.set(inZone ? (Math.abs(k - 1) < 0.12 ? 0xfff6d0 : 0xffd890) : 0x9a8a7a);
    this.hover = { text: `${s.label}  ·  ${heatName(p.T)}${p.T < 720 ? ' (too cold: RMB to the fire)' : p.T > 1250 ? ' (burning!)' : ''}`, at: at.clone().add(V3(0, 0.05, 0)) };
    if (this.ptr.pressed && this.strikeK > 0.6) this.strike(p, s, u, k);
    if (this.ptr.rpressed) this.toFire();
    this.strikeK = Math.min(1, this.strikeK + dt * 5);
  }

  private strike(p: Workpiece, s: Step, u: number, k: number): void {
    const j = this.job!, g = this.g;
    const timing = Math.abs(k - 1);
    const tq = timing < 0.1 ? 1 : timing < 0.22 ? 0.7 : 0.4;
    const T = p.T;
    const hq = T < 650 ? 0.08 : T < 760 ? 0.45 : T < 1180 ? 1 : T < 1260 ? 0.9 : 0.7;
    const r = p.strike(s.op!, u, tq * hq, s.zone!);
    this.strikeK = 0;
    this.ringT = 0;
    this.lastStrike = this.time;
    p.T = Math.max(20, p.T - 9);
    const at = this.strikeAt.clone();
    // sound: a dull bite in hot steel, a bright ring off the anvil when it's cold or misses
    const hot = T > 760;
    audio.play('hound_ting', { pos: at, vol: hot ? 0.45 : 0.9, rate: hot ? 1.0 : 1.25 });
    audio.play('axe_chop_hard', { pos: at, vol: hot ? 0.35 : 0.15, rate: 1.9 });
    this.g.player.addShake(0.05);
    if (T > 900) debris.emit('spark', at, this.dirW(V3(0, 1.2, 0)), Math.round(4 + (T - 900) / 40), { spread: 2.2, color: heatColor(T + 120) });
    // mill scale flakes off and settles on the face
    if (T > 700) {
      const face = this.place.parts.anvil;
      const fy = this.W(V3(0, FORGE.anvil.stump + face.faceY, 0)).y;
      const o = this.place.parts.anvil.origin;
      this.bits.emit(at.clone().add(V3(0, 0.01, 0)), V3(0, 0.6, 0), { color: new THREE.Color(0.11, 0.1, 0.1), size: 0.006, life: 1.4, stay: 18, spread: 1.4, n: 3 + Math.floor(Math.random() * 3), flat: true,
        floor: (q) => { const l = this.L(q).sub(o); return l.x > face.faceX0 && l.x < face.faceX1 && Math.abs(l.z) < 0.06 ? fy : this.W(V3(0, 0, 0)).y; } });
      this.flakes++;
    }
    if (T < 650) { j.cold++; if (j.cold === 2) this.say('Too cold. It just rings. Back in the fire before it cracks.', 3); }
    if (T > 1260) j.burnt++;
    const msg = !r.inZone ? 'Off the mark' : tq === 1 && hq >= 0.9 ? 'Clean blow' : hq < 0.5 ? 'Cold' : tq < 0.5 ? 'Glancing' : '';
    if (msg) this.pop(msg, at.clone().add(V3(0, 0.08, 0)), r.inZone && tq === 1 ? '#ffe08a' : '#e0b090');
    if (!r.inZone) j.q *= 0.97;
    if (p.amount(s.op!, s.zone![0], s.zone![1]) >= 0.9) {
      this.pop('Done', at.clone().add(V3(0, 0.12, 0)), '#ffe08a');
      this.ring.visible = false;
      this.later(0.5, () => this.nextStep());
    }
    void g;
  }

  /** re-hanging: the axe stands on the anvil, blows seat the head and drive the wedge */
  private workDrive(dt: number, s: Step): void {
    const j = this.job!;
    const axe = this.grind.axe ?? this.axeModel();
    if (!axe) return;
    const top = this.W(V3(FORGE.anvil.x + 0.12, FORGE.anvil.stump + this.place.parts.anvil.faceY + 0.36, FORGE.anvil.z));
    this.strikeAt.copy(top);
    const cycle = 0.8;
    this.ringT += dt; if (this.ringT > cycle + 0.25) this.ringT = 0;
    const k = clamp(this.ringT / cycle, 0, 1.3);
    this.ring.visible = true;
    this.ring.position.copy(top).add(this.dirW(V3(0, 0.01, 0)));
    this.ring.scale.setScalar(0.012 + 0.05 * Math.max(0, 1 - k));
    this.hover = { text: `${s.label} (${j.drive}/${s.strikes})`, at: top.clone().add(V3(0, 0.05, 0)) };
    if (this.ptr.pressed && this.strikeK > 0.6) {
      const tq = Math.abs(k - 1) < 0.12 ? 1 : 0.5;
      this.strikeK = 0; this.ringT = 0;
      j.drive += tq >= 1 ? 1 : 0.5;
      if (tq < 1) j.q *= 0.97;
      audio.play('axe_chop_hard', { pos: top, vol: 0.6, rate: 1.2 });
      audio.play('hound_ting', { pos: top, vol: 0.25, rate: 0.8 });
      this.g.player.addShake(0.05);
      this.pop(tq >= 1 ? 'Solid' : 'Glancing', top.clone().add(V3(0, 0.06, 0)), tq >= 1 ? '#ffe08a' : '#e0b090');
      if (j.drive >= (s.strikes ?? 4)) { j.drive = 0; this.ring.visible = false; this.later(0.4, () => this.nextStep()); }
    }
    this.strikeK = Math.min(1, this.strikeK + dt * 5);
  }

  private workQuench(_dt: number): void {
    const p = this.piece, s = this.step();
    if (!p || !s) return;
    const water = this.place.parts.tub.water;
    const h = this.pick([water, this.place.hits.tub]);
    this.hover = { text: `${heatName(p.T)}  ·  ${p.T > 900 ? 'too hot: it will crack' : p.T < 700 ? 'too cold to harden' : 'cherry: plunge it now'}  ·  RMB: back to the fire`, at: (h?.point ?? this.W(V3(FORGE.tub.x, 0.6, FORGE.tub.z))).clone().add(V3(0, 0.05, 0)) };
    if (this.ptr.pressed && this.pieceAt !== 'tub') this.quench(p);
    if (this.ptr.rpressed && this.pieceAt !== 'tub') this.toFire();
  }

  private quench(p: Workpiece): void {
    const j = this.job!, T = p.T;
    this.pieceAt = 'tub';
    const at = this.W(V3(FORGE.tub.x, this.place.parts.tub.waterY + 0.02, FORGE.tub.z));
    audio.play('pan_fry', { pos: at, vol: 0.95, rate: 0.75 });
    audio.play('pot_boil', { pos: at, vol: 0.6, rate: 1.4 });
    for (let i = 0; i < 14; i++) this.later(i * 0.07, () => puffs.emit(at.clone().add(V3((Math.random() - 0.5) * 0.12, 0.03, (Math.random() - 0.5) * 0.12)), V3(0, 0.5, 0), { size: 0.045, grow: 3, life: 1.8, color: new THREE.Color(0.92, 0.92, 0.92), alpha: 0.4 * clamp(T / 900, 0.2, 1), rise: 0.4, n: 2 }));
    this.bits.emit(at, V3(0, 0.9, 0), { color: new THREE.Color(0.5, 0.6, 0.65), size: 0.005, life: 0.8, spread: 1.5, n: 18, floor: () => at.y - 0.02 });
    let msg: string;
    if (T > 900) { j.quench = 0.55; msg = 'Too hot. A hairline crack.'; }
    else if (T >= 730) { j.quench = 1; msg = 'Cherry red. Glass hard.'; }
    else if (T >= 620) { j.quench = 0.8; msg = 'A touch cold. Hard enough.'; }
    else { j.quench = 0.5; msg = 'Too cold. It stayed soft.'; }
    this.say(msg, 2.6);
    this.later(1.8, () => { if (this.job === j) { this.pieceAt = 'none'; this.nextStep(); } });
  }

  // ------------------------------------------------------------------------------------------ grindstone
  private axeModel(): THREE.Object3D | null {
    const j = this.job;
    if (!j?.axe) return null;
    if (this.grind.axe && this.grind.axe.userData.id === j.axe) return this.grind.axe;
    const m = this.g.toolModel(j.axe);
    if (!m) return null;
    m.userData.id = j.axe;
    this.grind.axe = m;
    this.edgeStrip(m);
    return m;
  }

  /** a thin bright band along the axe's edge, coloured per segment as it is ground */
  private edgeStrip(axe: THREE.Object3D): void {
    axe.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(axe.matrixWorld).invert();
    let zmax = -1e9, ymin = 1e9, ymax = -1e9;
    const pts: THREE.Vector3[] = [];
    axe.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m === this.grind.strip) return;
      const pa = m.geometry.attributes.position;
      const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      for (let i = 0; i < pa.count; i += Math.max(1, Math.floor(pa.count / 3000))) pts.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(M));
    });
    for (const p of pts) zmax = Math.max(zmax, p.z);
    for (const p of pts) if (p.z > zmax - 0.012) { ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
    if (!isFinite(ymin)) { ymin = 0.3; ymax = 0.42; zmax = 0.1; }
    const data = new Uint8Array(8 * 4);
    const tex = new THREE.DataTexture(data, 8, 1);
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(0.008, ymax - ymin);
    geo.rotateY(Math.PI / 2);
    const strip = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide }));
    // UVs along y: the plane's v runs along its height
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), 0.5);
    strip.position.set(0, (ymin + ymax) / 2, zmax - 0.002);
    axe.add(strip);
    this.grind.strip = strip; this.grind.stripTex = tex; this.grind.edge = [ymin, ymax, zmax];
    this.paintEdge();
  }

  private paintEdge(): void {
    const G = this.grind, t = G.stripTex;
    if (!t) return;
    const d = t.image.data as Uint8Array;
    for (let i = 0; i < 8; i++) {
      const k = Math.min(G.L[i], G.R[i]);
      const c = new THREE.Color().setRGB(0.18, 0.15, 0.13).lerp(new THREE.Color(0.85, 0.86, 0.88), k);
      d[i * 4] = c.r * 255; d[i * 4 + 1] = c.g * 255; d[i * 4 + 2] = c.b * 255; d[i * 4 + 3] = 255;
    }
    t.needsUpdate = true;
  }

  private resetGrind(): void {
    const G = this.grind;
    G.L.fill(0); G.R.fill(0); G.side = 1; G.speed = 0;
    const id = this.job?.axe;
    if (id) { const s = ITEMS[id].tool!.sharp; G.L.fill(s * 0.4); G.R.fill(s * 0.4); }
    if (G.axe) { G.axe.removeFromParent(); G.axe = null; }
    this.paintEdge();
  }

  private grindResult(id: string): number {
    const G = this.grind;
    let s = 0;
    for (let i = 0; i < 8; i++) s += Math.min(1, Math.min(G.L[i], G.R[i]));
    return clamp(0.3 + 0.7 * (s / 8), 0.3, maxSharp(this.g, id));
  }

  private workGrind(dt: number): void {
    const G = this.grind, s = this.step();
    if (!s || s.kind !== 'grind') { if (this.ptr.rpressed || this.ptr.pressed) this.goView('slate'); this.hover = { text: 'Grindstone', at: this.W(V3(FORGE.grind.x, 0.95, FORGE.grind.z)) }; return; }
    const axe = this.axeModel();
    if (!axe) return;
    // cursor: x walks the edge across the stone, y sets the bevel angle (ideal around the middle)
    G.pos = clamp(0.5 + this.ptr.x * 0.65, 0, 1);
    G.angle = clamp(0.5 + this.ptr.y * 0.9, 0, 1);
    if (this.ptr.down) G.speed = Math.min(3, G.speed + dt * 3.2);
    if (this.ptr.rpressed) { G.side = (G.side === 1 ? -1 : 1); audio.play('pot_lid', { pos: this.W(V3(FORGE.grind.x, 0.8, FORGE.grind.z + 0.4)), vol: 0.2, rate: 0.6 }); }
    const aq = 1 - Math.min(1, Math.abs(G.angle - 0.5) * 2.4);
    const contact = this.ptr.down && G.speed > 0.4;
    if (contact) {
      const seg = Math.min(7, Math.floor(G.pos * 8));
      const arr = G.side === 1 ? G.R : G.L;
      for (let i = 0; i < 8; i++) {
        const w = Math.max(0, 1 - Math.abs(i - G.pos * 8 + 0.5) / 1.4);
        arr[i] = Math.min(1.1, arr[i] + dt * 0.22 * G.speed * w * (0.25 + 0.75 * aq));
      }
      void seg;
      this.paintEdge();
      // sparks streaming off the stone and a little water thrown
      const cp = this.contactPoint();
      if (Math.random() < dt * 30) debris.emit('spark', cp, this.dirW(V3(0, -0.6, 1.4)).multiplyScalar(1.3), 2, { spread: 0.8, color: new THREE.Color(1, 0.62, 0.25) });
      if (Math.random() < dt * 6) this.bits.emit(cp, this.dirW(V3(0, 0.3, 0.6)), { color: new THREE.Color(0.45, 0.5, 0.52), size: 0.004, life: 0.6, spread: 0.6, n: 2 });
    }
    const L = G.L.reduce((a, b) => a + Math.min(1, b), 0) / 8, R = G.R.reduce((a, b) => a + Math.min(1, b), 0) / 8;
    const ang = G.angle < 0.3 ? 'too flat' : G.angle > 0.7 ? 'too steep' : 'good bevel';
    this.hover = { text: `${G.side === 1 ? 'Right' : 'Left'} bevel ${Math.round((G.side === 1 ? R : L) * 100)}%  ·  ${ang}  ·  RMB: turn it over  ·  ${Math.min(L, R) > 0.92 ? 'LMB done? S to finish' : 'hold LMB'}`, at: this.contactPoint().add(V3(0, 0.08, 0)) };
    if (Math.min(L, R) > 0.97 && !this.grindDoneCalled) { this.grindDoneCalled = true; this.pop('Shaving sharp', this.contactPoint().add(V3(0, 0.12, 0)), '#ffe08a'); this.later(0.9, () => { this.grindDoneCalled = false; if (this.step()?.kind === 'grind') this.nextStep(); }); }
  }
  private grindDoneCalled = false;

  private contactPoint(): THREE.Vector3 {
    const gs = this.place.parts.grind;
    return this.W(V3(FORGE.grind.x - 0.01, gs.axleY + 0.05, FORGE.grind.z + gs.radius + 0.004));
  }

  /** stepping back mid-grind still keeps what you ground */
  exit(): void {
    if (this.job && (this.job.id === 'sharpen') && this.step()?.kind === 'grind') {
      const id = this.job.axe!;
      const sharp = this.grindResult(id);
      if (sharp > ITEMS[id].tool!.sharp + 0.02) { ITEMS[id].tool!.sharp = sharp; this.say(`Edge at ${Math.round(sharp * 100)}%.`, 2.5); }
      this.job = null;
      this.paintSlate();
    }
    super.exit();
  }

  // ------------------------------------------------------------------------------------------ hands and tools
  private attachPiece(): void {
    const p = this.piece;
    if (!p) return;
    this.tongs.add(p.mesh);
    p.mesh.position.set(0, 0.405, 0);
    p.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0, 0, 1), V3(1, 0, 0)));
  }

  private restTools(): void {
    // tongs back on the wall when there's no work in them; with work in the fire they stay in the coals
    const g = this.g;
    if (!this.piece) { this.tongs.removeFromParent(); }
    else {
      // tongs lie on the hearth with the work in the fire
      this.place.group.add(this.tongs);
      const d = V3(0.05, -0.35, -1).normalize();
      const end = V3(FORGE.pot.x, FORGE.hearth.top + 0.02, FORGE.pot.z + 0.02);
      const pos = end.clone().addScaledVector(d, -(0.4 + this.piece.len * 0.8));
      this.tongs.position.copy(pos);
      this.tongs.quaternion.copy(StationHands.toolQ(d, V3(0, 1, 0)));
      if (this.pieceAt !== 'fire') this.pieceAt = 'fire';
    }
    this.hammer.removeFromParent();
    this.place.parts.tongsRest.visible = !this.piece;
    this.place.parts.hammerRest.visible = true;
    if (this.grind.axe) { this.grind.axe.removeFromParent(); }
    void g;
  }

  private hold(o: THREE.Object3D, side: 'L' | 'R'): void {
    const s = this.hands.socket(side);
    if (o.parent !== s) { s.add(o); o.position.set(0, 0, 0); o.quaternion.identity(); }
  }

  private poseHands(dt: number): void {
    const H = this.hands, cam = this.g.camera, p = this.piece;
    const fwd = V3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    const side = V3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
    const up = V3(0, 1, 0);
    H.stiff.L = 22; H.stiff.R = 24;
    this.place.parts.tongsRest.visible = !(this.tongs.parent && this.tongs.parent !== this.place.group) && !p;
    this.place.parts.hammerRest.visible = !(this.hammer.parent && this.hammer.parent !== null && this.hammer.parent !== this.place.group);
    if (this.viewName !== 'grind' && this.grind.axe) this.grind.axe.removeFromParent();
    switch (this.viewName) {
      case 'slate': {
        const h = this.pick([this.place.parts.slate]);
        if (h) H.set('R', { pos: h.point.clone().addScaledVector(this.dirW(V3(0, 0, 1)), 0.06).add(V3(0, -0.03, 0)), q: H.freeQ('R', this.dirW(V3(0, 0.3, -1)), this.dirW(V3(0, 0, -1))), grip: [0.9, 0.05, 0.75, 0, 0] });
        else H.rest('R');
        H.rest('L');
        this.hammer.removeFromParent();
        if (p) this.restTools(); else this.tongs.removeFromParent();
        break;
      }
      case 'fire': {
        this.hammer.removeFromParent();
        // right hand: tongs, the work buried in the coals
        if (p) {
          this.hold(this.tongs, 'R');
          const end = this.W(V3(FORGE.pot.x + Math.sin(this.time * 0.8) * 0.01, FORGE.hearth.top - 0.015, FORGE.pot.z));
          const d = end.clone().sub(cam.position.clone().add(side.clone().multiplyScalar(0.25)).add(V3(0, -0.45, 0))).normalize();
          d.y = Math.max(-0.5, Math.min(-0.15, d.y)); d.normalize();
          const grip = end.clone().addScaledVector(d, -(0.405 + p.len * 0.85));
          H.set('R', { pos: grip, q: StationHands.toolQ(d, up), grip: GRIP.handle });
        } else H.rest('R');
        // left hand: the bellows handle, riding the lever down and up
        const handle = this.place.parts.lever.localToWorld(V3(0, -0.2, FORGE.lever.len));
        H.set('L', { pos: handle, q: StationHands.toolQ(side.clone().negate(), fwd.clone().negate()), grip: GRIP.handle });
        H.stiff.L = 30;
        break;
      }
      case 'anvil': {
        const s = this.step();
        const anv = this.place.parts.anvil;
        const faceC = this.W(V3(FORGE.anvil.x + 0.1, FORGE.anvil.stump + anv.faceY + 0.008, FORGE.anvil.z));
        if (s?.kind === 'drive') {
          // the axe stands on the face, head up; the left hand steadies the handle
          const axe = this.axeModel();
          if (axe) {
            this.hold(axe, 'L');
            const grip = faceC.clone().add(V3(0, 0.12, 0)).addScaledVector(fwd, -0.02);
            H.set('L', { pos: grip, q: StationHands.toolQ(up, fwd.clone().negate()), grip: GRIP.handle });
          }
          this.tongs.removeFromParent();
        } else if (p) {
          // left hand: tongs, the work across the face (over the horn for bends)
          this.hold(this.tongs, 'L');
          const horn = s?.horn;
          const d = horn ? this.dirW(V3(0.35, -0.02, -1)).normalize() : this.dirW(V3(0.9, -0.04, -0.6)).normalize();
          const target = horn ? this.W(V3(FORGE.anvil.x + anv.hornX + 0.08, FORGE.anvil.stump + anv.faceY - 0.035, FORGE.anvil.z)) : faceC.clone().add(V3(0, 0.006, 0));
          const zone = s?.zone ?? [0.6, 1];
          const uMid = (zone[0] + zone[1]) / 2;
          const grip = target.clone().addScaledVector(d, -(0.405 + p.len * uMid));
          H.set('L', { pos: grip, q: StationHands.toolQ(d, up), grip: GRIP.handle });
        } else { this.tongs.removeFromParent(); H.rest('L'); }
        // right hand: the hammer, rising through the cycle, dropping on the click
        if (s && (s.kind === 'forge' || s.kind === 'drive')) {
          this.hold(this.hammer, 'R');
          const k = clamp(this.ringT / 0.85, 0, 1);
          const raise = this.strikeK < 1 ? Math.min(1, this.strikeK * 1.2) * Math.min(1, k * 1.6) : Math.min(1, k * 1.2);
          const strike = this.strikeAt.clone();
          // at impact: the face points down onto the work, the handle runs back toward the cook
          const handleDir = side.clone().multiplyScalar(-0.55).addScaledVector(fwd, 0.85).normalize();
          const aImp = handleDir.clone().add(V3(0, 0.15, 0)).normalize();
          const aUp = handleDir.clone().add(V3(0, 1.6, 0)).normalize();
          const Y = aImp.clone().lerp(aUp, raise).normalize();
          const head = strike.clone().add(V3(0, 0.025 + raise * 0.22, 0)).addScaledVector(fwd, -raise * 0.06);
          const faceDir = V3(0, -1, 0).lerp(fwd, raise * 0.7).normalize();
          H.set('R', { pos: head.clone().addScaledVector(Y, -0.23), q: StationHands.toolQ(Y, faceDir), grip: GRIP.handle });
          H.stiff.R = this.strikeK < 0.4 ? 70 : 30;
        } else { this.hammer.removeFromParent(); H.rest('R'); }
        break;
      }
      case 'quench': {
        this.hammer.removeFromParent();
        if (p) {
          this.hold(this.tongs, 'L');
          const water = this.W(V3(FORGE.tub.x, this.place.parts.tub.waterY, FORGE.tub.z));
          const dip = this.pieceAt === 'tub' ? -0.12 : 0.06;
          const d = this.dirW(V3(0.05, -1, -0.35)).normalize();
          const end = water.clone().add(V3(0, dip, 0));
          H.set('L', { pos: end.clone().addScaledVector(d, -(0.405 + p.len)), q: StationHands.toolQ(d, fwd.clone().negate()), grip: GRIP.handle });
          if (this.pieceAt === 'tub' && Math.random() < dt * 20) puffs.emit(water.clone().add(V3((Math.random() - 0.5) * 0.1, 0.02, (Math.random() - 0.5) * 0.1)), V3(0, 0.4, 0), { size: 0.03, grow: 3, life: 1.4, color: new THREE.Color(0.9, 0.9, 0.9), alpha: 0.25 * clamp(p.T / 500, 0, 1), rise: 0.3 });
        } else H.rest('L');
        H.rest('R');
        break;
      }
      case 'grind': {
        this.hammer.removeFromParent(); this.tongs.removeFromParent();
        const axe = this.axeModel();
        const G = this.grind;
        if (axe) {
          this.hold(axe, 'R');
          const [y0, y1, zE] = G.edge;
          // the edge (+Z of the axe) against the stone's face; the handle back toward the cook
          const cp = this.contactPoint();
          const tilt = (G.angle - 0.5) * 0.7 * G.side;
          const Y = this.dirW(V3(-0.35 * G.side, 0.25 + tilt, 0.9)).normalize();
          const Z = this.dirW(V3(0, -0.15, -1)).normalize();
          const yEdge = y0 + (y1 - y0) * (G.side === 1 ? G.pos : 1 - G.pos);
          // socket at the grip: the contact point minus the head's offset along the handle and the edge's reach
          const q = StationHands.toolQ(Y, Z);
          const off = V3(0, yEdge, zE).applyQuaternion(q);
          const grip = cp.clone().sub(off);
          H.set('R', { pos: grip, q, grip: GRIP.handle });
          H.set('L', { pos: grip.clone().addScaledVector(Y, 0.24).add(V3(0, 0.03, 0)), q: H.freeQ('L', Y.clone().cross(up).normalize().multiplyScalar(-G.side).add(V3(0, -0.4, 0)), up.clone().negate()), grip: GRIP.cup });
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------ fuel and the retort
  private addFuel(): void {
    const g = this.g;
    const id = g.owns('coal') ? 'coal' : g.owns('charcoal') ? 'charcoal' : null;
    if (!id) { this.say('No charcoal or coal. The store has sacks, or burn your own in the retort outside.', 3.5); return; }
    g.take(id);
    this.bed.fuel = Math.min(4, this.bed.fuel + (id === 'coal' ? 3 : 2.2));
    if (id === 'coal') this.bed.coal = 1;
    audio.play('log_drag', { pos: this.W(V3(FORGE.pot.x, 0.9, FORGE.pot.z)), vol: 0.4, rate: 1.6 });
    puffs.emit(this.W(V3(FORGE.pot.x, 0.9, FORGE.pot.z)), V3(0, 0.4, 0), { size: 0.1, grow: 3, life: 1.8, color: new THREE.Color(0.3, 0.29, 0.28), alpha: 0.4, rise: 0.4, n: 4 });
    this.say(`${ITEMS[id].name} on the fire.`, 2);
    this.paintSlate();
  }

  private retortLabel(): string {
    const R = this.retort, g = this.g;
    if (R.done) return `Take the charcoal (${R.done} sack${R.done > 1 ? 's' : ''})`;
    if (R.burn > 0) return `Charcoal cooking… ${Math.ceil(R.burn)} h`;
    const carrying = (g.hands.held as { kind: string; piece?: unknown }).kind === 'carry' && (g.hands.held as { piece?: unknown }).piece;
    if (carrying) return 'Load the wood into the retort';
    if (R.load > 0) return g.owns('matches') ? `Light the retort (${R.load.toFixed(0)} kg of wood)` : 'Needs a match';
    return g.owns('firewood') ? 'Load firewood into the retort' : 'Charcoal retort (load it with splits)';
  }

  private retortUse(): void {
    const g = this.g, R = this.retort;
    if (R.done) { g.give('charcoal', R.done); this.say(`${R.done} sack${R.done > 1 ? 's' : ''} of charcoal.`, 2.5); R.done = 0; g.sound('bag_rustle', undefined, 0.6); return; }
    if (R.burn > 0) { this.say('Smouldering away. Leave it be.', 2); return; }
    const piece = g.hands.consumeCarried();
    if (piece) { R.load += piece.mass; g.chop.removePiece(piece); g.sound('place_wood', undefined, 0.7); return; }
    if (g.owns('firewood')) { const n = g.inv.items.get('firewood') ?? 0; g.take('firewood', n); R.load += n * 2.5; g.sound('place_wood', undefined, 0.7); return; }
    if (R.load > 0 && g.owns('matches')) {
      g.sound('match', undefined, 0.8);
      R.burn = 2.5;
      this.say('The retort catches. A few hours, and it\'ll be charcoal.', 3);
      return;
    }
    this.say('Load it with split wood first.', 2);
  }

  // ------------------------------------------------------------------------------------------ dev / tests
  debug(): Record<string, unknown> {
    const p = this.piece;
    return {
      phase: this.phase, view: this.viewName, job: this.job ? { ...this.job, step: this.step()?.label } : null,
      bed: { fuel: +this.bed.fuel.toFixed(2), air: +this.bed.air.toFixed(2), T: Math.round(this.bed.T) },
      piece: p ? { T: Math.round(p.T), at: this.pieceAt } : null, grind: { L: [...this.grind.L].map((v) => +v.toFixed(2)), R: [...this.grind.R].map((v) => +v.toFixed(2)), speed: +this.grind.speed.toFixed(2) },
      retort: this.retort,
    };
  }
  /** dev: jump into a job at a moment */
  devJob(id: JobId, at: 'fire' | 'anvil' | 'quench' | 'grind'): void {
    const g = this.g;
    const d0 = JOBS[id]; if (d0.mat && (g.inv.items.get(d0.mat) ?? 0) < (d0.matN ?? 1)) g.give(d0.mat, d0.matN ?? 1);
    if (!axeIds(g).length) g.give('axe_old');
    this.startJob(id);
    const p = this.piece;
    this.bed.fuel = 2; this.bed.air = 0.8; this.bed.T = 1100;
    if (at === 'fire') { if (p) p.T = 900; this.goView('fire'); this.pump.holding = true; }
    if (at === 'anvil' && p) { p.T = 1080; const s = this.step(); if (s?.op && s.zone) for (let i = 0; i < 4; i++) p.strike(s.op, (s.zone[0] + s.zone[1]) / 2 + (i - 1.5) * 0.06, 0.6, s.zone); this.toAnvil(); }
    if (at === 'quench' && p) { while (this.step() && this.step()!.kind !== 'quench') this.job!.i++; p.T = 790; const s0 = JOBS[id].steps[0]; if (s0.op && s0.zone) for (let i = 0; i < 6; i++) p.strike(s0.op, (s0.zone[0] + s0.zone[1]) / 2 + (i - 2.5) * 0.06, 1, s0.zone); this.toTub(); this.quench(p); }
    if (at === 'grind') { while (this.step() && this.step()!.kind !== 'grind') this.job!.i++; this.resetGrind(); this.goView('grind'); this.grind.speed = 2.4; for (let i = 0; i < 5; i++) { this.grind.R[i] = 0.9; this.grind.L[i] = 0.6; } this.paintEdge(); }
  }
  devStrike(): void { const p = this.piece, s = this.step(); if (p && s?.op) this.strike(p, s, (s.zone![0] + s.zone![1]) / 2, 1); this.strikeK = 0.05; }
}

let spaceDown = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.code === 'Space') spaceDown = true; });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
}
function inputSpace(): boolean { return spaceDown; }

/**
 * Build the forge lean-to beside the woodshed, add it to the world (colliders, update) and install the station.
 * Call after the cabin exists (it uses the same woodyard frame). Returns the station.
 */
export async function installForge(g: Game): Promise<ForgeStation | null> {
  registerForgeItems();
  let place: ForgePlace;
  try { place = await buildForge(); } catch (e) { console.warn('[forge] build failed', e); return null; }
  g.addPlace(place);
  const st = new ForgeStation(g, place);
  (g as unknown as { forge?: ForgeStation }).forge = st;
  applyToolMods(g);
  void bitQuality;
  return st;
}
