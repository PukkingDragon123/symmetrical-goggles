// Test-page support for the six cryptids (creatures.html, src/dev/creatures.ts): how to make each one for the
// turntable, where to put the camera, what the stand-in player does in the AI demo, and headless AI sims that return
// a state / event log (window.__creatures.sim({ who: 'hodag', script: 'bacon', seconds: 40 })).
import * as THREE from 'three';
import type { CreatureCtx, GroundItem, PlayerView } from '../types';
import { Cryptid } from './base';
import { Hodag } from './hodag';
import { Squonk } from './squonk';
import { Hidebehind } from './hidebehind';
import { Agropelter } from './agropelter';
import { Teakettler } from './teakettler';
import { SnowWasset } from './wasset';

export interface CryptidDev { label: string; make: () => Cryptid; cam: [number, number, number]; target: [number, number, number]; scripts: string[] }
export const CRYPTID_DEV: Record<string, CryptidDev> = {
  hodag: { label: 'Hodag', make: () => new Hodag({ pos: new THREE.Vector3() }), cam: [3.4, 1.5, 3.4], target: [0, 0.6, 0], scripts: ['walk_in', 'bacon', 'axe', 'feed_twice', 'sleep'] },
  squonk: { label: 'Squonk', make: () => new Squonk({ pos: new THREE.Vector3() }), cam: [1.1, 0.6, 1.3], target: [0, 0.27, 0.05], scripts: ['approach', 'crouch_berries', 'chase', 'flash', 'feed'] },
  hidebehind: { label: 'Hidebehind', make: () => { const h = new Hidebehind({ pos: new THREE.Vector3() }); h.deep = true; return h; }, cam: [3.6, 1.7, 3.8], target: [0, 1.4, 0], scripts: ['turn_back', 'look_around', 'lantern', 'jerky', 'day'] },
  agropelter: { label: 'Agropelter', make: () => new Agropelter({ pos: new THREE.Vector3(), heading: 0 }), cam: [3.2, 3.4, 4.6], target: [0, 2.6, 0], scripts: ['walk_under', 'leave_syrup', 'offer_syrup', 'friend'] },
  teakettler: { label: 'Teakettler', make: () => new Teakettler({ pos: new THREE.Vector3() }), cam: [0.75, 0.42, 0.9], target: [0, 0.25, 0.02], scripts: ['approach', 'crouch', 'coffee', 'leave_coffee', 'night'] },
  wasset: { label: 'Snow Wasset', make: () => new SnowWasset({ pos: new THREE.Vector3() }), cam: [1.3, 0.6, 1.5], target: [0, 0.2, 0], scripts: ['stand_still', 'swing', 'trout', 'leave_trout', 'night'] },
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
  if (who === 'hodag') {
    switch (script) {
      case 'walk_in': if (T > 3) walk(1.3, toC, dt, 1); if (T > 30) walk(3, new THREE.Vector3(0, 1.7, 60), dt); break;
      case 'bacon': pl.held = T > 4 ? 'bacon' : 'none'; if (T > 4) walk(1.2, toC, dt, 2); if (T > 6) offer('bacon'); break;
      case 'axe': if (T > 3) walk(1.3, toC, dt, 1.5); if (Math.hypot(toC.x - pl.pos.x, toC.z - pl.pos.z) < 3) pl.action = 'swing'; break;
      case 'feed_twice': pl.held = 'bacon'; if (T > 2) walk(1.3, toC, dt, 2); offer('bacon'); break;
      case 'sleep': if (T > 5) walk(0.6, toC, dt, 1.5); break;
    }
  }
  if (who === 'hidebehind') {
    const back = (a: number) => pl.dir.set(Math.sin(a), 0, Math.cos(a));
    switch (script) {
      // the player walks slowly north (+z), never looking back
      case 'turn_back': pl.pos.z += 0.6 * dt; pl.speed = 0.6; back(0); break;
      // the same walk, but turning right round every few seconds
      case 'look_around': pl.pos.z += 0.6 * dt; pl.speed = 0.6; back(Math.floor(T / 4) % 2 ? Math.PI : 0); break;
      case 'lantern': pl.held = 'lantern'; pl.pos.z += 0.6 * dt; pl.speed = 0.6; back(0); break;
      case 'jerky': if (T > 5 && T < 5.1 && !items.length) items.push({ id: 'j1', kind: 'jerky', pos: pl.pos.clone().setY(0) }); if (T > 5) { pl.pos.z += 1.0 * dt; pl.speed = 1; } back(0); break;
      case 'day': pl.pos.z += 0.6 * dt; back(0); break;
    }
  }
  if (who === 'agropelter') {
    // the tree is at the origin, its hollow facing +z; a path runs past it at x = 0
    switch (script) {
      case 'walk_under': pl.pos.set(-20 + T * 1.3, 1.7, 5); pl.speed = 1.3; pl.dir.set(1, 0, 0); break;
      case 'leave_syrup': if (T < 0.02) pl.pos.set(0, 1.7, 3); if (T > 1 && T < 1.05 && !items.length) items.push({ id: 's1', kind: 'syrup', pos: new THREE.Vector3(0.3, 0, 1.2) }); if (T > 1) walk(1.4, new THREE.Vector3(0, 1.7, 14), dt); break;
      case 'offer_syrup': pl.held = 'syrup'; if (T < 0.02) pl.pos.set(-12, 1.7, 2); walk(1.2, new THREE.Vector3(0, 1.7, 1.6), dt); offer('syrup'); if (T > 25) pl.pos.set(-20 + (T - 25) * 1.3, 1.7, 5); break;
      case 'friend': (c as Agropelter).trust = 1; pl.pos.set(-12 + Math.min(T, 14) * 0.9, 1.7, 2.5); break;
    }
  }
  if (who === 'teakettler') {
    switch (script) {
      case 'approach': if (T > 2) walk(1.3, toC, dt, 1); break;
      case 'crouch': pl.crouch = true; if (T > 2) walk(0.7, toC, dt, 1); break;
      case 'coffee': pl.held = 'coffee'; if (T < 0.02) pl.pos.set(0, 1.7, 9); offer('coffee'); if (T > 12) { pl.pos.x += 1.2 * dt; pl.speed = 1.2; } break;
      case 'leave_coffee': if (T < 0.02) pl.pos.set(0, 1.7, 9); if (T > 1 && !items.length && T < 2) items.push({ id: 'c1', kind: 'coffee', pos: new THREE.Vector3(1, 0, 6) }); break;
      case 'night': if (T > 6) walk(0.4, toC, dt, 2.5); break;
    }
  }
  if (who === 'wasset') {
    switch (script) {
      case 'stand_still': if (T < 0.02) pl.pos.set(0, 1.7, 20); break;
      case 'swing': if (T < 0.02) pl.pos.set(0, 1.7, 20); if (c.state === 'surface' || c.state === 'nip') { walk(2, toC, dt, 1.2); if (Math.hypot(toC.x - pl.pos.x, toC.z - pl.pos.z) < 3) pl.action = 'swing'; } break;
      case 'trout': if (T < 0.02) pl.pos.set(0, 1.7, 20); pl.held = T > 8 ? 'fish' : 'none'; if (T > 8) offer('fish'); break;
      case 'leave_trout': if (T < 0.02) pl.pos.set(0, 1.7, 20); if (T > 1 && T < 1.05 && !items.length) items.push({ id: 'f1', kind: 'fish', pos: new THREE.Vector3(6, 0, 10) }); break;
      case 'night': if (T < 0.02) pl.pos.set(0, 1.7, 20); break;
    }
  }
  if (who === 'squonk') {
    switch (script) {
      case 'approach': if (T > 2) walk(1.2, toC, dt, 2); break;
      case 'crouch_berries': pl.crouch = true; pl.held = 'berries'; if (T > 2) walk(0.6, toC, dt, 1.4); offer('berries'); break;
      case 'chase': if (T > 2) walk(T > 8 ? 3.5 : 1.3, toC, dt, 0.3); break;
      case 'flash': pl.light = T > 3; if (T > 3) walk(0.8, toC, dt, 4); pl.dir.copy(toC).sub(pl.pos).normalize(); break;
      case 'feed': pl.crouch = true; pl.held = 'berries'; if (T > 2) walk(0.6, toC, dt, 1.4); offer('berries'); break;
    }
  }
}
