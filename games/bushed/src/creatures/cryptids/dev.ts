// Test-page support for the six cryptids (creatures.html, src/dev/creatures.ts): how to make each one for the
// turntable, where to put the camera, what the stand-in player does in the AI demo, and headless AI sims that return
// a state / event log (window.__creatures.sim({ who: 'hodag', script: 'bacon', seconds: 40 })).
import * as THREE from 'three';
import type { CreatureCtx, GroundItem, PlayerView } from '../types';
import { Cryptid } from './base';
import { Hodag } from './hodag';

export interface CryptidDev { label: string; make: () => Cryptid; cam: [number, number, number]; target: [number, number, number]; scripts: string[] }
export const CRYPTID_DEV: Record<string, CryptidDev> = {
  hodag: { label: 'Hodag', make: () => new Hodag({ pos: new THREE.Vector3() }), cam: [3.4, 1.5, 3.4], target: [0, 0.6, 0], scripts: ['walk_in', 'bacon', 'axe', 'feed_twice', 'sleep'] },
};
export const isCryptid = (who: string) => who in CRYPTID_DEV;

/** test trunks (also the dev page's four test trunks) on a jittered 7 m grid round the origin */
export function testTrunks(x: number, z: number, r: number) {
  const out: { x: number; z: number; r: number }[] = [];
  for (const [tx, tz, tr] of [[-3.5, -4, 0.28], [4.2, -5.5, 0.35], [-6, 2, 0.4], [5.5, 3.5, 0.3]] as const) if (Math.hypot(tx - x, tz - z) < r) out.push({ x: tx, z: tz, r: tr });
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
    const tx = i * 7 + ((i * 7 + j * 3) % 3) - 1, tz = j * 7 + ((i * 5 + j * 11) % 3) - 1;
    if (Math.abs(i) < 2 && Math.abs(j) < 2) continue;
    if (Math.hypot(tx - x, tz - z) < r) out.push({ x: tx, z: tz, r: 0.22 + ((i * 13 + j * 7) & 3) * 0.04 });
  }
  return out;
}

/** the AI demo on the page: the player strolls round holding the cryptid's favourite food half the time and offers
 *  it when close */
export function cryptidDemo(c: Cryptid, player: PlayerView & { action?: string }, T: number, events: string[]) {
  player.held = Math.floor(T / 12) % 2 ? c.favoriteFood : 'none';
  if (player.held !== 'none' && Math.floor(T * 2) !== Math.floor((T - 1 / 60) * 2) && c.pos.distanceTo(new THREE.Vector3(player.pos.x, c.pos.y, player.pos.z)) < 2.6 && c.offer(player.held)) events.push('(offered)');
}

/** run a cryptid's AI headless for `seconds` at 60 Hz with a scripted stand-in player; returns the log */
export function simCryptid(who: string, script: string, seconds: number, hour = 14): string {
  const log: string[] = [];
  const items: GroundItem[] = [];
  const pl: PlayerView & { action?: string } = { pos: new THREE.Vector3(0, 1.7, 40), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0.1, light: false, speed: 0 };
  const c = CRYPTID_DEV[who].make();
  c.pos.set(0, 0, 0); c.home.set(0, 0, 0);
  let T = 0, last = '';
  const walk = (v: number, to: THREE.Vector3, dt: number, stop = 0.3) => { const d = to.clone().sub(pl.pos).setY(0); const l = d.length(); if (l > stop) { pl.pos.addScaledVector(d.normalize(), Math.min(v * dt, l - stop)); pl.speed = v; pl.dir.copy(d).setY(0).normalize(); } };
  const ctx = (dt: number): CreatureCtx => ({
    dt, time: T, hour, player: pl, heightAt: () => 0,
    emit: (e, d) => { if (e === 'step') return; const x = (d ?? {}) as Record<string, unknown>; log.push(`${T.toFixed(1)} ${e}${x.item ? ':' + x.item : ''}${x.damage ? ' dmg=' + x.damage : ''}${x.sound ? ' [' + x.sound + ']' : ''}`); },
    items, takeItem: (id) => { const k = items.findIndex((i) => i.id === id); if (k < 0) return false; items.splice(k, 1); log.push(`${T.toFixed(1)} (took ${id})`); return true; },
    dropItem: (kind, pos) => { const id = kind + items.length; items.push({ id, kind, pos: pos.clone() }); log.push(`${T.toFixed(1)} (dropped ${kind})`); return id; },
    trunks: testTrunks, fires: [], kindness: 0.5,
  });
  for (let k = 0; k < seconds * 60; k++) {
    const dt = 1 / 60; T += dt;
    pl.speed = 0; pl.action = undefined; pl.noise = 0.1;
    const toC = new THREE.Vector3(c.pos.x, 1.7, c.pos.z);
    scriptStep(who, script, T, dt, pl, c, toC, items, walk, log);
    c.update(ctx(dt));
    const st = `${c.state} trust=${c.trust.toFixed(2)} clip=${c.anim.current} d=${Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z).toFixed(1)}`;
    if (c.state + c.anim.current !== last) { log.push(`${T.toFixed(1)} ${st}`); last = c.state + c.anim.current; }
  }
  return log.join('\n');
}
type Walk = (v: number, to: THREE.Vector3, dt: number, stop?: number) => void;
function scriptStep(who: string, script: string, T: number, dt: number, pl: PlayerView & { action?: string }, c: Cryptid, toC: THREE.Vector3, items: GroundItem[], walk: Walk, log: string[]) {
  const offer = (item: string) => { if (Math.floor(T * 2) !== Math.floor((T - dt) * 2)) { const ok = c.offer(item); if (ok) log.push(`${T.toFixed(1)} offer ${item} -> taken`); return ok; } return false; };
  void items;
  if (who === 'hodag') {
    switch (script) {
      case 'walk_in': if (T > 3) walk(1.3, toC, dt, 1); if (T > 30) walk(3, new THREE.Vector3(0, 1.7, 60), dt); break;
      case 'bacon': pl.held = T > 4 ? 'bacon' : 'none'; if (T > 4) walk(1.2, toC, dt, 2); if (T > 6) offer('bacon'); break;
      case 'axe': if (T > 3) walk(1.3, toC, dt, 1.5); if (Math.hypot(toC.x - pl.pos.x, toC.z - pl.pos.z) < 3) pl.action = 'swing'; break;
      case 'feed_twice': pl.held = 'bacon'; if (T > 2) walk(1.3, toC, dt, 2); offer('bacon'); break;
      case 'sleep': if (T > 5) walk(0.6, toC, dt, 1.5); break;
    }
  }
}
