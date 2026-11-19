// The real creature models the plate portraits are rendered from. Each make() builds a fresh, posed instance
// (models come from the creature cache, preloaded by the game) at the origin facing +Z. New creature modules can
// register theirs the same way (registerPortraitModel in portrait.ts); until then the cryptid keeps its painted
// SDF portrait (specs.ts).
import * as THREE from 'three';
import { registerPortraitModel } from './portrait';
import type { CreatureCtx } from '../../creatures/types';

function ctx(dt: number): CreatureCtx {
  return {
    dt, time: 2, hour: 13,
    player: { pos: new THREE.Vector3(3, 1.7, 40), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0, light: false, speed: 0 },
    heightAt: () => 0, emit: () => undefined, items: [], kindness: 0.6, threats: [], fog: 0.95, lost: false, fires: [],
  };
}

interface Posable { object: THREE.Object3D; clips: string[]; play(c: string | null): void; update(c: CreatureCtx): void; pos?: THREE.Vector3; heading?: number }

/** play the first clip of a list the creature has, step it a few frames, then pin it at the origin */
function posed(inst: Posable, clips: string[], steps = 8, dt = 0.07): THREE.Object3D {
  const c = clips.find((k) => inst.clips.includes(k)) ?? inst.clips[0];
  if (c) inst.play(c);
  for (let i = 0; i < steps; i++) {
    try { inst.update(ctx(dt)); } catch { /* a creature that needs more world than we fake: keep the rest pose */ }
    inst.pos?.set(0, 0, 0);
    if (inst.heading !== undefined) inst.heading = 0;
  }
  inst.object.position.set(0, 0, 0);
  inst.object.rotation.set(0, 0, 0);
  inst.object.updateMatrixWorld(true);
  return inst.object;
}

registerPortraitModel('hound', {
  make: async () => { const { AxehandleHound } = await import('../../creatures'); return posed(new AxehandleHound({ state: 'companion', trust: 1 }) as unknown as Posable, ['alert', 'growl', 'idle', 'stand']); },
  yaw: 0.85, pitch: 0.14, fill: 0.8,
});
registerPortraitModel('bigfoot', {
  make: async () => { const { Bigfoot } = await import('../../creatures'); return posed(new Bigfoot({}) as unknown as Posable, ['watch', 'idle', 'stand']); },
  yaw: 0.6, pitch: 0.06, fill: 0.9,
});
registerPortraitModel('gumberoo', {
  make: async () => { const { Gumberoo } = await import('../../creatures'); return posed(new Gumberoo({ pos: new THREE.Vector3() }) as unknown as Posable, ['idle', 'watch']); },
  yaw: 0.7, pitch: 0.16, fill: 0.84,
});
registerPortraitModel('granny', {
  make: async () => {
    const { GrannyTamarack } = await import('../../creatures');
    const g = new GrannyTamarack({ pos: new THREE.Vector3(), present: true });
    const o = posed(g as unknown as Posable, ['idle', 'watch', 'stand']);
    g.fade.value = 1; g.object.visible = true;
    return o;
  },
  yaw: 0.55, pitch: 0.05, fill: 0.92,
});
registerPortraitModel('dingbat', {
  make: async () => {
    const { Dingbat } = await import('../../creatures');
    const b = new Dingbat() as unknown as Posable & { hangW: number; vel: THREE.Vector3; place(dt: number): void; pose(dt: number, look?: THREE.Vector3): void };
    b.play(b.clips.includes('fly') ? 'fly' : b.clips[0]);
    b.hangW = 0;
    for (let i = 0; i < 9; i++) { b.pos!.set(0, 0, 0); b.vel.set(0, 0, 0.6); b.place(0.06); b.pose(0.06, new THREE.Vector3(1.5, 0.3, 3)); }
    b.object.position.set(0, 0, 0);
    b.object.updateMatrixWorld(true);
    return b.object;
  },
  yaw: 0.5, pitch: 0.3, fill: 0.8,
});

// the lumber-camp cryptids (src/creatures/cryptids): their real models replace the painted SDF plates. Not the
// hidebehind: nobody has ever seen it, so its plate stays the Book's painting of it peering round a birch.
type CryptidMod = typeof import('../../creatures/cryptids');
const CRYPTID_VIEW: Record<string, { cls: keyof CryptidMod; clips: string[]; yaw?: number; pitch?: number; fill?: number; crop?: [number, number]; post?: (p: import('./pix').Pix) => void }> = {
  hodag: { cls: 'Hodag', clips: ['idle', 'warn'], yaw: 0.8, pitch: 0.18, fill: 0.86 },
  squonk: { cls: 'Squonk', clips: ['idle', 'weep', 'cry'], yaw: 0.75, pitch: 0.2, fill: 0.8 },
  // up its snag: frame the top of the tree where it lives
  agropelter: { cls: 'Agropelter', clips: ['idle', 'jeer', 'throw'], yaw: 0.6, pitch: 0.05, fill: 0.92, crop: [0.42, 1.0] },
  teakettler: { cls: 'Teakettler', clips: ['idle', 'look'], yaw: 0.9, pitch: 0.18, fill: 0.82 },
  wasset: { cls: 'SnowWasset', clips: ['idle', 'stand', 'stare', 'look'], yaw: 0.8, pitch: 0.2, fill: 0.84 },
};
for (const [id, v] of Object.entries(CRYPTID_VIEW)) {
  registerPortraitModel(id, {
    make: async () => {
      const M = await import('../../creatures/cryptids');
      const C = M[v.cls] as unknown as new (o: { pos?: THREE.Vector3 }) => Posable;
      return posed(new C({ pos: new THREE.Vector3() }), v.clips);
    },
    yaw: v.yaw, pitch: v.pitch, fill: v.fill, crop: v.crop, post: v.post,
  });
}
