// The story's small tools: state kept in game.flags (so it saves with everything else), floating words,
// recipe cards, pages pasted into Ray's book, and the world bits the story leaves around: orange flagging tape on
// trees, static colliders, props, readable paper, a synthesized steel triangle.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Block } from '../../ui/paper';
import { paintPaper, paperMesh } from '../../ui/paper';
import { hud } from '../../ui/hud';
import { audio } from '../../audio/audio';
import { heightAt } from '../../world/layout';
import { physics, RAPIER, GROUP, groups } from '../../physics/physics';
import { loadProp } from '../../places/props';
import { registerInteractable } from '../interact';
import { NOTES } from '../story';

// ---------------------------------------------------------------------------------------------- state
const ST = 'st:';
export const has = (g: Game, f: string): boolean => g.flags.has(ST + f);
/** set a story flag; true the first time */
export function set(g: Game, f: string): boolean { if (g.flags.has(ST + f)) return false; g.flags.add(ST + f); return true; }
export function clear(g: Game, f: string): void { g.flags.delete(ST + f); }
/** how many story flags start with prefix */
export function count(g: Game, prefix: string): number { let n = 0; for (const f of g.flags) if (f.startsWith(ST + prefix)) n++; return n; }
/** a number kept as a flag (`key=value`) */
export function num(g: Game, key: string): number | null {
  for (const f of g.flags) if (f.startsWith(`${ST}${key}=`)) return Number(f.slice(ST.length + key.length + 1));
  return null;
}
export function setNum(g: Game, key: string, v: number): void {
  for (const f of [...g.flags]) if (f.startsWith(`${ST}${key}=`)) g.flags.delete(f);
  g.flags.add(`${ST}${key}=${v}`);
}

// ---------------------------------------------------------------------------------------------- words
export const think = (t: string, s = 3.5): void => hud.say(`<i>${t}</i>`, s);
/** the journal got something new (Gacha Garage's "to-do list updated", in this game's voice) */
export function noted(g: Game, what: string): void {
  hud.say(`<i>${what}</i>`, 3.2);
  g.sound('pencil_scribble', undefined, 0.35);
  storyDirty = true;
}
export let storyDirty = false;
export function cleanStory(): void { storyDirty = false; }

export const RECIPE_NAMES: Record<string, string> = {
  bannock: 'Bannock', flapjacks: 'Flapjacks', venison_stew: 'Venison stew (mojakka)', moose_chili: 'Moose chili', tourtiere: 'Tourtière',
  pouding_chomeur: 'Pouding chômeur', blueberry_grunt: 'Blueberry grunt', pea_soup: 'Soupe aux pois', hunters_breakfast: "Hunter's breakfast",
};
/** hand over a recipe card: the cooking module listens for 'recipe'; the flag st:recipe:<id> records it too */
export function giveRecipe(g: Game, id: string, from: string): void {
  if (!set(g, `recipe:${id}`)) return;
  g.events.emit('recipe', { id, from });
  g.sound('paper_rustle', undefined, 0.7);
  hud.say(`<i>A recipe card: ${RECIPE_NAMES[id] ?? id}, in ${from}'s hand.</i>`, 4);
}
export function pay(g: Game, dollars: number): void {
  g.inv.money += dollars;
  g.sound('coins', undefined, 0.7);
  hud.say(`<i>$${dollars}.</i>`, 2);
}
/** one of Ray's pages (or somebody's) goes back into the book */
export function foundPage(g: Game, id: string, title: string): void {
  if (!set(g, `page:${id}`)) return;
  noted(g, `Pasted into the book: ${title}.`);
}
/** items in the pack that count as a cooked meal (the cooking module tags them 'meal') */
export function mealsHeld(g: Game, items: Record<string, { name: string; tags?: string[] }>): string[] {
  const out: string[] = [];
  for (const [id, n] of g.inv.items) if (n > 0 && items[id]?.tags?.includes('meal') && !/burnt/.test(id)) out.push(id);
  return out;
}

// ---------------------------------------------------------------------------------------------- the book
const BASE_NOTES = [...NOTES];
/** rewrite NOTES (what the Book pastes in after the field guide) from the story's pages, then repaint */
export function setBookPages(g: Game, pages: Block[][]): void {
  NOTES.length = 0;
  NOTES.push(...pages, ...BASE_NOTES);
  g.journal.rebuild();
}

/** a sheet of paper lying in the world that can be read (and optionally taken) */
export function paperOn(g: Game, blocks: Block[], seed: number, at: THREE.Vector3, rotY: number, o: { width?: number; style?: 'notebook' | 'kraft' | 'card' | 'notice'; label?: string; take?: () => void; flat?: boolean } = {}): THREE.Mesh {
  const m = paperMesh(paintPaper(blocks, { style: o.style ?? 'notebook', seed, w: 192, h: 256 }), o.width ?? 0.16);
  m.position.copy(at);
  if (o.flat !== false) m.rotation.set(-Math.PI / 2 + 0.04, rotY, 0, 'YXZ'); else m.rotation.set(0, rotY, 0);
  g.scene.add(m);
  registerInteractable(m, {
    kind: 'paper', label: () => o.label ?? 'Read', use: () => { g.readPaper(blocks, seed); o.take?.(); },
  });
  return m;
}

// ---------------------------------------------------------------------------------------------- world
export const ground = (x: number, z: number, dy = 0): THREE.Vector3 => new THREE.Vector3(x, heightAt(x, z) + dy, z);

/** a fixed box collider (centre, half extents, yaw) */
export function solidBox(c: THREE.Vector3, half: [number, number, number], rotY = 0): void {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(half[0], half[1], half[2]).setCollisionGroups(groups(GROUP.STATIC, 0xffff)).setFriction(0.8), body);
}

/** a Poly Haven prop placed in a parent (local coordinates); resolves to the object (or null if missing) */
export function propIn(parent: THREE.Object3D, id: string, x: number, y: number, z: number, ry = 0, s = 1, tilt?: [number, number]): Promise<THREE.Object3D | null> {
  return loadProp(id).then((o) => {
    o.position.set(x, y, z); o.rotation.set(tilt?.[0] ?? 0, ry, tilt?.[1] ?? 0, 'YXZ'); o.scale.setScalar(s);
    parent.add(o);
    return o;
  }).catch(() => null);
}

/** standing trees near a point (nearest first), as trunk colliders: { id, x, z, r, h } */
export function treesNear(g: Game, x: number, z: number, r: number): { id: number; x: number; z: number; r: number; h: number }[] {
  const f = g.forest as unknown as { trunkColliders?(x: number, z: number, r: number): { id: number; x: number; z: number; r: number; h: number }[] } | null;
  const out = f?.trunkColliders?.(x, z, r) ?? [];
  return out.filter((t) => t.r > 0.09).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
}

/** take the standing trees out of a clearing (the old camp, the dock) */
export function clearTrees(g: Game, x: number, z: number, r: number): void {
  const f = g.forest as unknown as { trunkColliders?(x: number, z: number, r: number): { id: number }[]; remove?(id: number): void } | null;
  for (const t of f?.trunkColliders?.(x, z, r) ?? []) f?.remove?.(t.id as number);
}

// orange flagging tape: one shared material and geometry for every ribbon
let tapeMat: THREE.MeshStandardMaterial | null = null;
let tailGeo: THREE.BufferGeometry | null = null;
const tapes: { g: THREE.Group; tails: THREE.Mesh[]; ph: number }[] = [];
/** a strip of blaze-orange flagging tape tied round a trunk at chest height, two tails fluttering */
export function tapeOn(g: Game, tree: { x: number; z: number; r: number }, seed = 1): THREE.Group {
  tapeMat ??= new THREE.MeshStandardMaterial({ color: 0xff5a12, emissive: 0x3a1000, roughness: 0.55, side: THREE.DoubleSide });
  if (!tailGeo) { tailGeo = new THREE.PlaneGeometry(0.035, 0.32, 1, 4); tailGeo.translate(0, -0.16, 0); }
  const grp = new THREE.Group();
  const y = heightAt(tree.x, tree.z) + 1.55 + (seed % 3) * 0.06;
  grp.position.set(tree.x, y, tree.z);
  const r = tree.r * 0.93 + 0.012;
  // the wrap: a narrow band that follows the trunk (slightly loose and tilted, as tape is tied)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, 0.04, 14, 1, true), tapeMat);
  band.rotation.z = 0.08; band.rotation.x = 0.05;
  grp.add(band);
  const tails: THREE.Mesh[] = [];
  const a = seed * 2.1;
  for (let i = 0; i < 2; i++) {
    const t = new THREE.Mesh(tailGeo, tapeMat);
    t.position.set(Math.cos(a) * (r + 0.01), 0, Math.sin(a) * (r + 0.01));
    t.rotation.y = -a + Math.PI / 2 + i * 0.4;
    grp.add(t); tails.push(t);
  }
  g.scene.add(grp);
  tapes.push({ g: grp, tails, ph: seed });
  return grp;
}
/** the tails flutter in the wind (only near the player) */
export function updateTapes(g: Game, t: number): void {
  const px = g.player.pos.x, pz = g.player.pos.z;
  for (const tp of tapes) {
    if (Math.abs(tp.g.position.x - px) > 45 || Math.abs(tp.g.position.z - pz) > 45) continue;
    for (let i = 0; i < tp.tails.length; i++) {
      tp.tails[i].rotation.x = 0.25 + 0.22 * Math.sin(t * 3.1 + tp.ph + i * 1.7) + 0.08 * Math.sin(t * 7.3 + i);
      tp.tails[i].rotation.z = 0.12 * Math.sin(t * 2.3 + tp.ph * 3 + i);
    }
  }
}

// ---------------------------------------------------------------------------------------------- the gut hammer's voice
/** a steel triangle struck with a rod: inharmonic partials ringing down (there's no recording of Délima's) */
export function clang(at: THREE.Vector3, vol = 1, when = 0): void {
  const ctx = audio.ctx;
  if (!ctx || !audio.master) return;
  const t0 = ctx.currentTime + when + 0.02;
  const out = ctx.createGain();
  out.gain.value = vol * 0.22;
  const pan = ctx.createPanner();
  pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 4; pan.rolloffFactor = 0.6;
  pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z;
  out.connect(pan).connect(audio.master);
  if (audio.reverbIn) out.connect(audio.reverbIn);
  const base = 742;
  for (const [ratio, amp, decay] of [[1, 1, 2.6], [2.76, 0.55, 1.6], [5.4, 0.32, 1.0], [8.93, 0.18, 0.6], [1.003, 0.6, 2.4], [13.3, 0.08, 0.25]] as [number, number, number][]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * ratio;
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, t0);
    gg.gain.linearRampToValueAtTime(amp, t0 + 0.003);
    gg.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(gg).connect(out);
    o.start(t0); o.stop(t0 + decay + 0.05);
  }
  // the strike itself: a click of noise
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const ns = ctx.createBufferSource(); ns.buffer = nb;
  const ng = ctx.createGain(); ng.gain.value = 0.5;
  ns.connect(ng).connect(out); ns.start(t0);
}
