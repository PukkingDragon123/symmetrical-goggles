// Putting tame cryptids to work. One key and a look:
//   G (tap)    whistle and send: whatever is under the crosshair picks the helper. A log or a round -> the roperite
//              drags it to your truck; a standing tree -> the hugag leans it over (away from you), or the wapaloosie
//              climbs it to scout; the lake -> the billdad fetches a trout; open ground -> the wapaloosie scouts from
//              the tallest tree there; the sky (or nothing anyone can do) -> every friend comes to you.
//   G (hold)   a small radial of your friends: flick the mouse toward one and let go to send that one (or to call
//              it over, if what you look at is nothing it can do).
//   E (near)   follow / stay (helper.ts `interact`).
// Also: the roperite's haul (the log is pulled along on its rope: Rapier velocities toward the muzzle), the
// wapaloosie's scout (marks.ts tags on caches and cryptids, game.events 'map_mark'), the 'uncanny' buff speeding
// trust, and a first-time hint. installCompanions(game, hooks) is called by critters.ts after the cryptids spawn.
import * as THREE from 'three';
import type { Game } from '../../game/game';
import { input } from '../../core/input';
import { hud } from '../../ui/hud';
import { floatText } from '../../ui/float';
import { WORLD, heightAt, SPOTS } from '../../world/layout';
import { HelperCryptid, type TargetKind } from './helper';
import { Roperite, type HaulRef } from './roperite';
import { Hugag } from './hugag';
import { Wapaloosie } from './wapaloosie';
import { marks } from './marks';
import { placeCaches, type Cache } from './caches';
import { installTreats, type CryptidHooks } from './treats';
import type { NewCryptid } from './base';

interface Piece { id: number; kind: string; r: number; len: number; mass: number; stacked: boolean; burned: boolean; body: { translation(): { x: number; y: number; z: number }; linvel(): { x: number; y: number; z: number }; setLinvel(v: { x: number; y: number; z: number }, wake: boolean): void; wakeUp(): void; isSleeping?(): boolean } | null }
interface Target { kind: TargetKind | 'sky'; at: THREE.Vector3; dir: THREE.Vector3; ref?: unknown; r?: number; label: string }

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _h = new THREE.Vector3();
const HOLD = 0.32;

export interface Companions { caches: Cache[]; friends(): HelperCryptid[]; send(c: HelperCryptid, t: Target): boolean; pick(): Target }

export function installCompanions(g: Game, cryptids: NewCryptid[], hooks: CryptidHooks): Companions {
  const helpers = cryptids.filter((c): c is HelperCryptid => c instanceof HelperCryptid);
  const caches = placeCaches(g).list;
  const treatTick = installTreats(g, cryptids, hooks);
  const friends = () => helpers.filter((c) => c.trust >= 1);
  const now = () => (g.day ?? 0) * 24 + g.hour;
  let pressT = -1, held: Target | null = null, flick = new THREE.Vector2(), hinted = (g.flags as Set<string>).has('hint:whistle');
  const radial = makeRadial();

  // ---------------------------------------------------------------------------------------------- what am I pointing at
  function pick(): Target {
    const cam = g.camera;
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    const out: Target = { kind: 'sky', at: new THREE.Vector3(), dir: new THREE.Vector3(_d.x, 0, _d.z).normalize(), label: '' };
    let best = 60;
    // a log, a round, a split lying about
    for (const p of (g.chop?.pieces ?? []) as Iterable<Piece>) {
      if (!p.body || p.stacked || p.burned) continue;
      const t = p.body.translation();
      _p.set(t.x - _o.x, t.y - _o.y, t.z - _o.z);
      const along = _p.dot(_d);
      if (along < 0 || along > best) continue;
      const off = _q.copy(_d).multiplyScalar(along).sub(_p).length();
      if (off < Math.max(0.55, p.r + 0.35)) { best = along; out.kind = 'log'; out.at.set(t.x, t.y, t.z); out.ref = p; out.label = p.kind === 'log' ? 'that log' : 'that piece'; }
    }
    // a standing tree
    const hit = g.forest?.raycastTrunk?.(_o, _d, Math.min(best, 45));
    if (hit && hit.point.distanceTo(_o) < best) {
      best = hit.point.distanceTo(_o);
      const tc = (g.forest as unknown as { trunkColliders(x: number, z: number, r: number): { x: number; z: number; r: number }[] }).trunkColliders(hit.point.x, hit.point.z, 1.5)
        .sort((a, b) => Math.hypot(a.x - hit.point.x, a.z - hit.point.z) - Math.hypot(b.x - hit.point.x, b.z - hit.point.z))[0];
      out.kind = 'tree'; out.at.set(tc?.x ?? hit.ref.x, hit.ref.y, tc?.z ?? hit.ref.z); out.r = tc?.r ?? 0.3; out.ref = hit.ref; out.label = 'that tree';
    }
    // the ground or the water (march the ray)
    if (out.kind === 'sky') {
      for (let s = 1; s < 140; s += 0.75) {
        _p.copy(_o).addScaledVector(_d, s);
        const h = heightAt(_p.x, _p.z);
        if (_p.y < WORLD.waterY && h < WORLD.waterY - 0.15) { out.kind = 'water'; out.at.set(_p.x, WORLD.waterY, _p.z); out.label = 'the water'; break; }
        if (_p.y < h) { out.kind = 'ground'; out.at.set(_p.x, h, _p.z); out.label = 'there'; break; }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------- sending
  /** the roperite's haul: where to take the log (the truck's tailgate, the woodyard, or where you stood) */
  function dropPoint(log: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const v = ((g as unknown as { truck?: { root: THREE.Object3D } }).truck ?? g.jeep) as { root: THREE.Object3D } | null;
    if (v?.root) {
      const r = v.root.position;
      if (Math.hypot(r.x - log.x, r.z - log.z) < 400) {
        _q.set(0, 0, 1).applyQuaternion(v.root.quaternion).setY(0).normalize();
        return out.set(r.x - _q.x * 4, 0, r.z - _q.z * 4);
      }
    }
    const w = SPOTS.woodyard;
    if (Math.hypot(w.x - log.x, w.z - log.z) < 220) return out.set(w.x + 3, 0, w.z + 3);
    return out.set(g.player.pos.x, 0, g.player.pos.z);
  }
  function send(c: HelperCryptid, t: Target): boolean {
    if (t.kind === 'sky') return c.call(g.player.pos);
    if (t.kind === 'log') {
      const p = t.ref as Piece;
      const ref: HaulRef = { pos: t.at.clone(), to: dropPoint(t.at, new THREE.Vector3()), mass: p.mass, piece: p };
      return c.command('log', t.at, { ref });
    }
    if (t.kind === 'tree') {
      // it falls away from you
      const dir = new THREE.Vector3(t.at.x - g.player.pos.x, 0, t.at.z - g.player.pos.z).normalize();
      return c.command('tree', t.at, { dir, r: t.r, ref: t.ref });
    }
    return c.command(t.kind, t.at, { dir: t.dir });
  }
  /** the best friend for a target: skilled ones, the hugag before the wapaloosie for trees, nearest first */
  function route(t: Target): boolean {
    const fs = friends();
    if (!fs.length) { hooks.think('I whistle. Nothing answers. Yet.'); return false; }
    if (t.kind !== 'sky') {
      const able = fs.filter((c) => c.skills.includes(t.kind as TargetKind) && c.pos.distanceTo(g.player.pos) < 160)
        .sort((a, b) => (a instanceof Hugag ? -1 : 0) - (b instanceof Hugag ? -1 : 0) || a.pos.distanceTo(t.at) - b.pos.distanceTo(t.at));
      for (const c of able) if (send(c, t)) return true;
    }
    let any = false;
    for (const c of fs) any = c.call(g.player.pos) || any;
    if (t.kind !== 'sky' && t.kind !== 'ground') hooks.think(t.kind === 'log' ? 'Nobody here can haul that. A roperite could.' : t.kind === 'water' ? 'Nobody here fishes. A billdad would.' : 'Nobody here pushes trees.');
    return any;
  }

  // ---------------------------------------------------------------------------------------------- the whistle
  function whistle(): void {
    const a = (g as unknown as { sound(id: string, p?: THREE.Vector3, v?: number, rate?: number): void });
    // two notes of a lumberjack's whistle, from the kettle's whistle pitched about
    a.sound('kettle_whistle', undefined, 0.18, 1.6);
    setTimeout(() => a.sound('kettle_whistle', undefined, 0.15, 2.1), 160);
  }

  // ---------------------------------------------------------------------------------------------- per frame
  let wasTow = new Map<Roperite, HaulRef>();
  const tick = (dt: number) => {
    HelperCryptid.trustK = ((g as unknown as { cooking?: { buffs?: { has(k: string): number } } }).cooking?.buffs?.has('uncanny') ?? 0) > 0 ? 1.6 : 1;
    const free = !g.journal?.open && !(g as unknown as { reading?: unknown }).reading && g.mode !== 'drive' && !(g as unknown as { cooking?: { active?: boolean } }).cooking?.active;
    // G: tap to send, hold for the radial
    if (free && input.pressed('KeyG')) { pressT = 0; held = pick(); flick.set(0, 0); }
    if (pressT >= 0) {
      pressT += dt;
      if (input.held('KeyG')) {
        flick.x += input.mouseDX; flick.y += input.mouseDY;
        if (pressT > HOLD) radial.show(friends(), flick, held!);
      }
      if (!input.held('KeyG')) {
        const t = held!;
        const sel = pressT > HOLD ? radial.chosen(friends(), flick) : null;
        radial.hide();
        whistle();
        if (sel) { if (!send(sel, t)) { sel.call(g.player.pos); } } else route(t);
        pressT = -1; held = null;
      }
    }
    // the roperites' hauls: pull each roped log along behind the muzzle
    for (const r of helpers) {
      if (!(r instanceof Roperite)) continue;
      const j = r.job, ref = j?.ref as HaulRef | undefined;
      if (ref) {
        const p = ref.piece as Piece;
        if (!p.body || p.stacked || p.burned) { r.job = null; continue; }
        const t = p.body.translation();
        ref.pos.set(t.x, t.y, t.z);
        dropPoint(ref.pos, ref.to);
        if (r.towing) {
          r.hitch(_h);
          _p.set(_h.x - t.x, 0, _h.z - t.z);
          const d = _p.length(), L = 3 + p.len * 0.5;
          if (d > L) {
            const v = p.body.linvel();
            const k = Math.min(3.2, (d - L) * 2.6) / d;
            const vx = _p.x * k, vz = _p.z * k;
            p.body.setLinvel({ x: v.x + (vx - v.x) * 0.25, y: v.y, z: v.z + (vz - v.z) * 0.25 }, true);
          }
          wasTow.set(r, ref);
        }
      }
      // just delivered: load it if the truck knows how, else it lies at the tailgate
      const was = wasTow.get(r);
      if (was && !r.towing) {
        wasTow.delete(r);
        // (only a method made for it: a vehicle's load() is its model loader)
        const veh = ((g as unknown as { truck?: unknown }).truck ?? g.jeep) as { loadLog?(p: unknown): boolean } | null;
        try { veh?.loadLog?.(was.piece); } catch { /* the truck has its own ideas */ }
        g.events.emit('cryptid_haul', { piece: was.piece, by: 'roperite' });
        // brittle: every log lying near the first, one after another
        if (r.boosted && !r.job) {
          const next = ([...((g.chop?.pieces ?? []) as Iterable<Piece>)]).filter((q) => q.body && !q.stacked && q !== was.piece && (q.kind === 'log' || q.kind === 'round'))
            .map((q) => { const t = q.body!.translation(); return { q, at: new THREE.Vector3(t.x, t.y, t.z) }; })
            .filter((x) => Math.hypot(x.at.x - was.to.x, x.at.z - was.to.z) > 6 && x.at.distanceTo(r.pos) < 40)
            .sort((a, b) => a.at.distanceTo(r.pos) - b.at.distanceTo(r.pos))[0];
          if (next) send(r, { kind: 'log', at: next.at, dir: new THREE.Vector3(), ref: next.q, label: '' });
        }
      }
    }
    marks.update(g.camera, g.player.pos, now());
    treatTick(dt);
    // a first-time hint, once something is tame and near
    if (!hinted) {
      const f = friends().find((c) => c.pos.distanceTo(g.player.pos) < 12);
      if (f) { hinted = true; (g.flags as Set<string>).add('hint:whistle'); hud.say(`<i>The ${f.name.toLowerCase()} trusts me. G whistles: point at what I want done. E by it: follow or stay.</i>`, 6); }
    }
  };
  g.updaters.push(tick);
  return { caches, friends, send, pick };
}

/** the wapaloosie's report from the top of its tree: every cache and cryptid within r gets a tag */
export function scoutReport(g: Game, from: THREE.Vector3, r: number, long: boolean, caches: Cache[], all: { id: string; name?: string; object: THREE.Object3D; pos?: THREE.Vector3 }[]): number {
  const until = (g.day ?? 0) * 24 + g.hour + (long ? 12 : 3);
  let n = 0;
  for (const c of caches) {
    if (c.opened || Math.hypot(c.pos.x - from.x, c.pos.z - from.z) > r) continue;
    marks.add({ id: 'cache:' + c.id, kind: 'cache', label: c.label, pos: c.pos, until }); n++;
    g.events.emit('map_mark', { id: 'cache:' + c.id, kind: 'cache', label: c.label, pos: c.pos.clone() });
  }
  for (const c of all) {
    if (c.id === 'wapaloosie') continue;
    const p = c.pos ?? c.object.position;
    if (Math.hypot(p.x - from.x, p.z - from.z) > r) continue;
    const label = c.name ?? c.id;
    marks.add({ id: 'cryptid:' + c.id, kind: 'cryptid', label, pos: p, until }); n++;
    g.events.emit('map_mark', { id: 'cryptid:' + c.id, kind: 'cryptid', label, pos: p.clone() });
    g.journal?.sawCritter?.(c.id);
  }
  return n;
}

// ------------------------------------------------------------------------------------------------ the radial
function makeRadial() {
  let root: HTMLDivElement | null = null;
  const slots: HTMLDivElement[] = [];
  const POS = [[0, -62], [74, 0], [0, 62], [-74, 0]];
  const mount = () => {
    if (root || typeof document === 'undefined') return;
    root = document.createElement('div');
    Object.assign(root.style, { position: 'fixed', left: '50%', top: '50%', width: '0', height: '0', pointerEvents: 'none', zIndex: '21', display: 'none', font: '15px PatrickHand,Caveat,cursive', color: '#f2e6c8', textShadow: '0 1px 3px #000' });
    for (let k = 0; k < 4; k++) {
      const s = document.createElement('div');
      Object.assign(s.style, { position: 'absolute', transform: `translate(-50%,-50%) translate(${POS[k][0]}px,${POS[k][1]}px)`, padding: '4px 9px', borderRadius: '12px', background: 'rgba(20,16,12,0.55)', border: '1px solid rgba(240,220,180,0.25)', whiteSpace: 'nowrap' });
      root.appendChild(s); slots.push(s);
    }
    document.body.appendChild(root);
  };
  const index = (n: number, f: THREE.Vector2) => {
    if (n === 0 || f.length() < 25) return -1;
    const a = Math.atan2(f.y, f.x); // screen: x right, y down
    const k = Math.round(((a + Math.PI / 2) / (Math.PI / 2) + 4) % 4) % 4; // 0 up, 1 right, 2 down, 3 left
    return k < n ? k : -1;
  };
  return {
    show(fs: HelperCryptid[], f: THREE.Vector2, t: Target) {
      mount(); if (!root) return;
      root.style.display = 'block';
      const sel = index(fs.length, f);
      for (let k = 0; k < 4; k++) {
        const c = fs[k];
        slots[k].style.display = c ? 'block' : 'none';
        if (!c) continue;
        const can = t.kind === 'sky' || c.skills.includes(t.kind as TargetKind);
        const verb = t.kind === 'sky' ? 'come here' : can ? `${t.kind === 'log' ? 'haul' : t.kind === 'water' ? 'fish' : t.kind === 'tree' ? (c instanceof Wapaloosie ? 'scout' : 'push') : 'scout'} ${t.label}` : 'come here';
        slots[k].textContent = `${c.name}: ${verb}`;
        slots[k].style.background = k === sel ? 'rgba(120,90,40,0.75)' : 'rgba(20,16,12,0.55)';
      }
    },
    chosen(fs: HelperCryptid[], f: THREE.Vector2): HelperCryptid | null { const k = index(fs.length, f); return k >= 0 ? fs[k] : null; },
    hide() { if (root) root.style.display = 'none'; },
  };
}

export { floatText };
