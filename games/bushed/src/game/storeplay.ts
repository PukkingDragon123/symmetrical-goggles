// Pruneau's General Store as gameplay: goods are real objects you carry to the counter; the register prints a
// receipt and bags what you bought; timber left on the log deck is scaled and paid; mushrooms are weighed; jobs
// are sheets on the board. Contract goals are checked against the world (wood really in the campground box).
import * as THREE from 'three';
import type { Game } from './game';
import type { InteractCtx } from './interact';
import { registerInteractable, unregisterInteractable } from './interact';
import { ITEMS } from './items';
import { ringUp, scaleTimber, weighForage } from './economy';
import { contractPaper, type Contract } from './contracts';
import { paintPaper, paperMesh, type Block } from '../ui/paper';
import { hud } from '../ui/hud';
import { line, speak, ODILE, DOUG } from './dialogue';
import { makePhysical, propsNear, removeProp } from './physprops';
import { Zones } from './zones';
import { WoodPiece } from '../chop/wood';
import { SPOTS, heightAt, roadPointAt, ROADS } from '../world/layout';
import { anchorPos } from './flow';
import { Rng } from '../core/rng';

const GERARD = 'Gérard';
const say = (t: string, s = 5) => hud.say(speak(GERARD, t), s);
const think = (t: string, s = 3) => hud.say(`<i>${t}</i>`, s);

export class StorePlay {
  readonly zones = new Zones();
  private t = 0;
  private deadfall: WoodPiece[] = [];
  private deadfallAt = new THREE.Vector3();

  constructor(private g: Game, private cabinAction: (n: string, c: InteractCtx) => void) {
    const prev = g.placeAction;
    g.placeAction = (name, ctx) => {
      if (['pickup', 'register', 'scale', 'noticeboard'].includes(name)) this.act(name, ctx as InteractCtx & { itemId?: string; object?: THREE.Object3D });
      else prev(name, ctx);
    };
    void this.cabinAction;
    g.updaters.push((dt) => this.update(dt));
  }

  /** after the store exists: zones, contract sheets, the deadfall, the lost axe, mushrooms */
  attach(): void {
    const g = this.g;
    const deck = anchorPos(g, 'log_deck', new THREE.Vector3(SPOTS.store.x + 14, heightAt(SPOTS.store.x + 14, SPOTS.store.z), SPOTS.store.z));
    this.zones.add('log_deck', deck.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(4.5, 1.6, 4.5));
    const porch = anchorPos(g, 'porch_bench', new THREE.Vector3(SPOTS.store.x, heightAt(SPOTS.store.x, SPOTS.store.z - 8), SPOTS.store.z - 8));
    this.zones.add('store_porch', porch.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(3.5, 1.2, 2.5));
    const cs = SPOTS.campsite;
    this.zones.add('campsite', new THREE.Vector3(cs.x + 3.2, heightAt(cs.x + 3.2, cs.z - 2) + 0.4, cs.z - 2), new THREE.Vector3(1.4, 0.8, 1.4));
    this.pinContracts();
    this.spawnDeadfall();
    this.spawnLostAxe();
    this.spawnChanterelles();
  }

  // ---------------------------------------------------------------------------------------------- board
  private papers = new Map<string, THREE.Object3D>();
  private pinContracts(): void {
    const g = this.g;
    const pins = (g.store?.pins ?? []) as THREE.Object3D[];
    let i = 0;
    for (const c of g.contracts) {
      if (c.state !== 'posted' || i >= pins.length) continue;
      const m = paperMesh(paintPaper(contractPaper(c), { style: c.hand === 'type' ? 'notice' : 'notebook', seed: c.paperSeed, w: 256, h: 340 }), 0.17);
      m.rotation.z = (new Rng(c.paperSeed).next() - 0.5) * 0.12;
      pins[i++].add(m);
      this.papers.set(c.id, m);
      registerInteractable(m, {
        kind: 'paper', label: () => `Read: ${c.title}`, altLabel: () => 'Take the job',
        use: () => g.readPaper(contractPaper(c), c.paperSeed),
        alt: () => this.take(c),
      });
    }
  }

  private take(c: Contract): void {
    const g = this.g;
    c.state = 'taken';
    const m = this.papers.get(c.id);
    if (m) { unregisterInteractable(m); m.removeFromParent(); }
    g.journal.contracts = g.contracts;
    g.journal.rebuild();
    g.sound('paper_rustle', undefined, 0.8);
    think(`Folded into the journal: ${c.title.toLowerCase()}.`, 3);
    if (c.id === 'lost_axe') say("Madame Lachance. Her husband was a good man. Bring it to me, I'll see she gets it.");
  }

  // ---------------------------------------------------------------------------------------------- buying
  private act(name: string, ctx: InteractCtx & { itemId?: string; object?: THREE.Object3D }): void {
    const g = this.g;
    if (name === 'pickup' && ctx.object && ctx.itemId) {
      if (g.hands.busy) return;
      const obj = ctx.object, id = ctx.itemId, def = ITEMS[id];
      // lift it off the shelf into world space, then into the hands
      const wp = obj.getWorldPosition(new THREE.Vector3()), wq = obj.getWorldQuaternion(new THREE.Quaternion());
      unregisterInteractable(obj);
      obj.removeFromParent();
      g.scene.add(obj);
      obj.position.copy(wp); obj.quaternion.copy(wq);
      obj.userData.unpaid = true;
      obj.userData.itemId = id;
      const mass = Math.max(0.1, def?.mass ?? 1);
      // it becomes a physical prop the first time it leaves the hands
      obj.userData.onRelease = (pp: THREE.Vector3, qq: THREE.Quaternion, v: THREE.Vector3) => {
        obj.userData.onRelease = undefined;
        obj.position.copy(pp); obj.quaternion.copy(qq);
        const prop = makePhysical(obj, { mass, itemId: id, asleep: false });
        prop.body?.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      };
      g.hands.grab(obj, undefined, mass);
      return;
    }
    if (name === 'register') return this.register();
    if (name === 'scale') return this.weigh();
    if (name === 'noticeboard') think('Jobs, lost dogs, a fiddle for sale. Take a sheet off the board.', 3);
  }

  private register(): void {
    const g = this.g;
    const at = anchorPos(g, 'register', g.player.pos);
    // unpaid goods: in the hands, or set down on the counter
    const goods: { id: string; obj: THREE.Object3D }[] = [];
    const h = g.hands.held;
    if (h.kind === 'carry' && h.obj.userData.unpaid) goods.push({ id: h.obj.userData.itemId, obj: h.obj });
    for (const p of propsNear(at, 1.8)) if (p.obj.userData.unpaid && p.itemId) goods.push({ id: p.itemId, obj: p.obj });
    // timber on the deck and contract deliveries are settled here too
    const settled = this.settleContracts();
    const deck = [...(this.zones.get('log_deck')?.inside ?? [])].filter((p) => !p.stacked);
    if (deck.length) {
      const sale = scaleTimber(deck);
      g.inv.money += sale.total;
      for (const p of deck) g.chop.removePiece(p);
      g.readPaper(receipt('LOG SCALE / MESURAGE', sale.lines, `Paid  $${sale.total.toFixed(2)}`), 900 + g.day);
      say(sale.remark || line(ODILE.buy, 'buy'));
      g.sound('cash_register', at, 0.9); g.sound('coins', at, 0.7);
      return;
    }
    if (!goods.length) {
      if (!settled) say(line([...ODILE.browse, ...ODILE.contract], 'reg'));
      return;
    }
    const sale = ringUp(goods.map((x) => x.id));
    if (g.inv.money < sale.total) { say(line(ODILE.poor, 'poor')); return; }
    g.inv.money -= sale.total;
    g.sound('cash_register', at, 0.9);
    g.sound('bag_rustle', at, 0.8);
    // everything goes into a kraft bag on the counter
    for (const x of goods) {
      if (h.kind === 'carry' && h.obj === x.obj) g.hands.consumeCarried();
      const pp = x.obj.userData.physProp; if (pp) removeProp(pp); else x.obj.removeFromParent();
    }
    this.bag(at, goods.map((x) => x.id));
    g.readPaper(receipt('PRUNEAU — MAGASIN GÉNÉRAL', sale.lines, `Total  $${sale.total.toFixed(2)}`), 700 + g.day);
    say(sale.remark);
  }

  /** a kraft paper bag with your purchases; take it to put everything in your pack */
  private bag(at: THREE.Vector3, ids: string[]): void {
    const g = this.g;
    const prof = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.13, 0), new THREE.Vector2(0.135, 0.28), new THREE.Vector2(0.12, 0.33), new THREE.Vector2(0.1, 0.34)];
    const geo = new THREE.LatheGeometry(prof, 4, Math.PI / 4);
    geo.scale(1, 1, 0.62);
    const c = paintPaper([{ t: 'gap', h: 120 }, { t: 'h', text: 'PRUNEAU', hand: 'type' }, { t: 'small', text: 'Kettle Lake · since 1951', hand: 'type' }], { style: 'kraft', w: 128, h: 192, seed: 3 });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const bag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
    bag.position.copy(at).add(new THREE.Vector3(0.35, -0.12, 0));
    bag.castShadow = true;
    g.scene.add(bag);
    registerInteractable(bag, {
      kind: 'pickup', label: () => `Take the bag (${ids.length})`,
      use: () => {
        for (const id of ids) g.give(id);
        bag.removeFromParent();
        g.sound('bag_rustle', bag.position, 0.7);
        think('Into the pack.', 1.5);
        g.journal.rebuild();
      },
    });
  }

  private weigh(): void {
    const g = this.g;
    const forage = ['chanterelle', 'berries', 'fish'].flatMap((id) => Array.from({ length: g.inv.items.get(id) ?? 0 }, () => id));
    if (!forage.length) { say(line(ODILE.sellMushrooms, 'mush0').replace(/^.*$/, 'Bring me something to weigh. Chanterelles, berries, a nice trout.')); return; }
    const sale = weighForage(forage);
    for (const id of forage) g.take(id);
    g.inv.money += sale.total;
    g.readPaper(receipt('BALANCE / SCALE', sale.lines, `Paid  $${sale.total.toFixed(2)}`), 800 + g.day);
    g.sound('coins', undefined, 0.7);
    say(sale.remark);
  }

  // ---------------------------------------------------------------------------------------------- contracts
  /** pay finished contracts at the counter; returns true if anything was paid */
  private settleContracts(): boolean {
    const g = this.g;
    let paid = false;
    for (const c of g.contracts) {
      if (c.state !== 'done' || c.id === 'camp_wood') continue;
      if (c.id === 'birch_logs' || c.id === 'store_cord') {
        // the delivered wood becomes the store's
        const zone = this.zones.get(c.goal.where);
        for (const p of [...(zone?.inside ?? [])]) if (this.counts(c, p)) g.chop.removePiece(p);
      }
      if (c.id === 'lost_axe') g.take('lachance_axe');
      c.state = 'paid';
      g.inv.money += c.pay;
      paid = true;
      g.readPaper(receipt('CONTRACT PAID', [`${c.title}`, `— ${c.from}`], `$${c.pay.toFixed(2)}`), 600 + c.paperSeed);
      say(c.id === 'lost_axe' ? "That's his. That's really his. ...Thank you. Here. She would want you to have this." : `${c.title}? Done properly, I hear. Here.`);
      g.sound('coins', undefined, 0.8);
    }
    g.journal.rebuild();
    return paid;
  }

  private counts(c: Contract, p: WoodPiece): boolean {
    if (c.goal.kind === 'splits') return (p.kind === 'split' || p.kind === 'half') && (c.id !== 'store_cord' || p.spec.species !== 'cedar');
    if (c.goal.kind === 'logs') return p.kind === 'log' && (!c.goal.species || p.spec.species === c.goal.species) && p.len >= (c.goal.minLen ?? 0);
    return false;
  }

  private update(dt: number): void {
    const g = this.g;
    this.zones.update(dt, g.chop.pieces);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    for (const c of g.contracts) {
      if (c.state !== 'taken') continue;
      if (c.goal.kind === 'splits' || c.goal.kind === 'logs') c.progress = this.zones.count(c.goal.where, (p) => this.counts(c, p));
      if (c.goal.kind === 'clear_road') c.progress = this.roadClear() ? 1 : 0;
      if (c.goal.kind === 'item') c.progress = g.owns('lachance_axe') ? 1 : 0;
      if (c.goal.count > 0 && c.progress >= c.goal.count) {
        c.state = 'done';
        hud.say(`<i>${c.title}: done. ${c.id === 'camp_wood' ? 'Doug will want to see that.' : 'Back to Pruneau\'s to get paid.'}</i>`, 3.5);
        if (c.id === 'camp_wood') {
          c.state = 'paid'; g.inv.money += c.pay;
          hud.say(speak('Doug', line(DOUG.paid, 'dougpaid')), 5);
          g.sound('coins', undefined, 0.8);
        }
        g.journal.rebuild();
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- world jobs
  private spawnDeadfall(): void {
    // a big spruce blown down across the highway east of the store
    const st = ROADS.find((r) => r.id === 'highway')!;
    let storeT = 0, acc = 0;
    for (let i = 1; i < st.pts.length; i++) { acc += Math.hypot(st.pts[i].x - st.pts[i - 1].x, st.pts[i].z - st.pts[i - 1].z); if (Math.hypot(st.pts[i].x - SPOTS.store.x, st.pts[i].z - SPOTS.store.z) < 40) storeT = acc; }
    const rp = roadPointAt('highway', storeT + 320);
    this.deadfallAt.set(rp.x, rp.h, rp.z);
    const stem = [{ y: 0, r: 0.27, x: 0, z: 0 }, { y: 4, r: 0.22, x: 0, z: 0 }, { y: 9, r: 0.14, x: 0, z: 0 }];
    const p = new WoodPiece({ species: 'spruce', stem, y0: 0.5, y1: 8.5, seed: 4242, quality: 0.8 });
    const across = rp.dir + Math.PI / 2 + 0.25;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, across, 0, 'YXZ'));
    p.spawn(new THREE.Vector3(rp.x, heightAt(rp.x, rp.z) + 0.35, rp.z), q);
    this.g.chop.addPiece(p);
    this.deadfall = [p];
  }

  private roadClear(): boolean {
    const a = this.deadfallAt;
    for (const p of this.g.chop.pieces) {
      if (p.mesh.position.distanceTo(a) > 7) continue;
      // anything big still lying on the travelled lane blocks it
      if (p.mass > 15) {
        const s = ROADS.find((r) => r.id === 'highway')!;
        let near = 1e9;
        for (const q of s.pts) near = Math.min(near, Math.hypot(q.x - p.mesh.position.x, q.z - p.mesh.position.z));
        if (near < 3.2) return false;
      }
    }
    return true;
  }

  private spawnLostAxe(): void {
    const g = this.g;
    const r = new Rng(77);
    const a = r.range(0, Math.PI * 2), d = r.range(30, 70);
    const x = SPOTS.hollow.x + Math.cos(a) * d, z = SPOTS.hollow.z + Math.sin(a) * d;
    const m = g.toolModel('axe_felling') ?? g.toolModel('axe_old');
    if (!m) return;
    // a red-painted handle
    m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.material = (mm.material as THREE.MeshStandardMaterial).clone(); (mm.material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(1.25, 0.55, 0.5)); } });
    m.position.set(x, heightAt(x, z) + 0.05, z);
    m.rotation.set(Math.PI / 2 - 0.1, 0, r.range(0, 6));
    g.scene.add(m);
    registerInteractable(m, {
      kind: 'pickup', label: () => 'An old axe with a red handle',
      use: () => { m.removeFromParent(); g.give('lachance_axe'); hud.say('<i>"J.L." burned into the handle. Somebody missed this.</i>', 4); g.sound('pickup', undefined, 0.6); },
    });
  }

  private spawnChanterelles(): void {
    const g = this.g;
    const r = new Rng(31);
    const base = g.toolModel('chanterelle');
    if (!base) return;
    for (let i = 0; i < 26; i++) {
      // under the old spruce: the hollow's edges and the wet ground by the lake
      const c = i % 2 ? SPOTS.hollow : SPOTS.lake;
      const a = r.range(0, Math.PI * 2), d = r.range(c.r * 0.6, c.r * 1.3);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (heightAt(x, z) < 2.4) continue;
      const m = base.clone();
      m.position.set(x, heightAt(x, z), z);
      m.rotation.y = r.range(0, 6);
      g.scene.add(m);
      registerInteractable(m, { kind: 'pickup', label: () => 'Chanterelles', use: () => { m.removeFromParent(); g.give('chanterelle'); g.sound('foliage_rustle', m.position, 0.5); } });
    }
  }
}

function receipt(title: string, lines: string[], total: string): Block[] {
  return [
    { t: 'h', text: title, hand: 'type' },
    { t: 'line' },
    ...lines.map((l): Block => ({ t: 'p', text: l, hand: 'type' })),
    { t: 'line' },
    { t: 'p', text: total, hand: 'type' },
    { t: 'gap', h: 10 },
    { t: 'small', text: 'Merci! Come back alive.', hand: 'type' },
  ];
}
