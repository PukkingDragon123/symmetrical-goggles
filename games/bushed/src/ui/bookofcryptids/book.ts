// The Book of Cryptids: Uncle Ray's living field guide, a drop-in replacement for the Journal (src/ui/journal.ts).
//
//   const book = new BookOfCryptids();          // book.object goes into the viewmodel scene
//   book.toggle(); book.turn(+1);               // Tab, A / D (as the journal)
//   book.learn('hound', 'jerky');               // a rule: the Book licks the page and inks it in
//   book.observe('gumberoo', { dist: 9 });      // tasted: the Book paints the plate and writes the entry itself
//   book.sawCritter('hidebehind');              // seen, not tasted
//   book.update(dt);                            // every frame
//   install(game);                              // optional: hands, speech anchor, tasting critters in view, day
//
// Journal API kept: object, open, page, contracts, learn, sawCritter, knows, rebuild, dump, restore, toggle,
// turn, update. Save data keeps the journal's shape ([critter, rules[]][]) with extra '@' rows for the rest.
import * as THREE from 'three';
import { GrimoireModel, restPose, PAGE, type BookPose } from './model';
import { entries, canonical, ruleId, adoptInto, type Entry, type Adoptable } from './bestiary';
import { layout, paintPage, PAGE_W, PAGE_H, type BookView, type PageKind, type Painted, type Region } from './pages';
import { Pix } from './pix';
import type { Contract } from '../../game/contracts';
import { floatText } from '../float';
import { audio } from '../../audio/audio';
import { loadFonts } from '../paper';
import { hash2 } from '../../core/rng';
import { Noise } from '../../core/noise';

export const SPEAKER = 'The Book';

export interface ObserveData {
  /** how far away it was (m) */
  dist?: number;
  /** a rule learnt in the same moment */
  rule?: string;
  /** what the Book says instead of its usual remark */
  remark?: string;
  /** record it without the show (loading, cutscenes) */
  silent?: boolean;
}

const LINES = {
  open: ['Mm. You again.', 'Careful. I bruise.', 'Hrm. What now?', 'Wipe your hands first.', 'Ugh. Daylight.', 'Ah. The kid.'],
  grumble: ['Hrrmmm.', 'Your thumbs are cold.', 'Stop breathing on me.', 'I smell jerky. You are holding out on me.', 'Do not dog-ear me.', 'Something is watching us. Not you. Something.', 'Ray turned my pages gentler than this.', 'I could eat.', 'My spine aches when it rains.'],
  fast: ['Slow DOWN.', 'Ow. Ow. Ow.', 'One at a time!'],
  learn: ['Ooh. Noted.', 'Hm! Writing that down.', 'Mmh. Yes. Yes yes.', 'Tasty. That one goes in.', 'Knew it. Well. Suspected.'],
  sniff: ['*sniff* ...what is that?', 'Hold still. Hold me STILL.', 'Closer. I want a taste.', 'Mmm. Something new.'],
  again: ['Had that one. Chewy.', 'Seen it. Tasted it. Moving on.', 'Old news. Point me at something new.'],
  shut: ['Mmf!', 'Mmmf mf!', '*muffled grumbling*'],
  far: ['Too far. I am a book, not a telescope.'],
};

type Anim = { kind: 'yawn' | 'snap' | 'lick' | 'taste' | 'grumble' | 'chomp'; t: number; dur: number };

interface Writing { index: number; before: Pix; after: Painted; keys: Set<string>; t: number; dur: number; order: { r: Region; t0: number; t1: number }[] }

const NZ = new Noise(55);

export class BookOfCryptids {
  /** goes into the viewmodel scene (camera at the origin looking down -Z) */
  readonly object = new THREE.Group();
  readonly model = new GrimoireModel();
  /** the left page index of the open spread (even) */
  page = 2;
  contracts: Contract[] = [];
  /** the game day (install() keeps it current); recorded with each tasting */
  day = 0;
  /** where the Book's speech floats from (a child of the main camera once attached) */
  readonly anchor = new THREE.Object3D();
  /** fired when the book starts opening (true) or shuts (false) */
  onOpenChange: ((open: boolean) => void) | null = null;

  private openFlag = false;
  private o = 0;              // animated openness 0..1 (the jaw)
  private oVel = 0;
  private r = 0;              // raised 0 (put away) .. 1 (held up)
  private holdUp = 0;
  private yawnDue = false;
  private list: Entry[] = entries();
  private known = new Map<string, Set<string>>();
  private seen = new Set<string>();
  private tasted = new Map<string, number>();
  private pages: PageKind[] = [];
  private cache = new Map<number, { ver: number; p: Painted }>();
  private ver = 1;
  private shown: { L: number; R: number; F: number; B: number } = { L: -1, R: -1, F: -1, B: -1 };
  private turnT: number | null = null;
  private turnDir = 0;
  private turnQueue: number[] = [];
  private turnTimes: number[] = [];
  private anims: Anim[] = [];
  private pose: BookPose = restPose();
  private t = 0;
  private grumbleIn = 25;
  private speakT = 0;
  private blinkIn = 2;
  private blinkT = 0;
  private pendingWrites: { id: string; keys: string[]; line?: string; before: (v: BookView) => BookView }[] = [];
  private writing: Writing[] = [];
  private lookAt: THREE.Vector3 | null = null;
  private lookHold = 0;
  private cam: { camera: THREE.PerspectiveCamera; viewCam: THREE.PerspectiveCamera } | null = null;
  /** hand targets for the FP arms (view space), refreshed every frame */
  readonly hands = { L: new THREE.Vector3(), R: new THREE.Vector3(), xL: new THREE.Vector3(), xR: new THREE.Vector3(), nL: new THREE.Vector3(), nR: new THREE.Vector3(), z: new THREE.Vector3() };
  private handF = { L: { p: new THREE.Vector3(), x: new THREE.Vector3(), n: new THREE.Vector3() }, R: { p: new THREE.Vector3(), x: new THREE.Vector3(), n: new THREE.Vector3() } };
  /** fired once the book has been lowered out of sight after shutting (give the hands back) */
  onPutAway: (() => void) | null = null;

  constructor() {
    this.object.name = 'BookOfCryptids';
    this.object.add(this.model.object);
    this.object.visible = false;
    for (const e of this.list) this.known.set(e.id, new Set());
    this.anchor.userData.__headH = 0;
    this.rebuild();
    loadFonts().then(() => this.invalidate());
  }

  // ------------------------------------------------------------------------------------------------ journal API
  get open(): boolean { return this.openFlag; }

  learn(critter: string, rule: string | number, o: { silent?: boolean } = {}): boolean {
    const id = canonical(this.list, critter) ?? critter;
    rule = ruleId(this.list.find((x) => x.id === id), rule);
    let s = this.known.get(id);
    if (!s) { s = new Set(); this.known.set(id, s); }
    if (s.has(rule)) return false;
    s.add(rule);
    this.seen.add(id);
    const e = this.list.find((x) => x.id === id);
    if (e && e.rules.some((r) => r.id === rule) && !o.silent) {
      this.pendingWrites.push({
        id, keys: [`rule:${id}:${rule}`],
        before: (v) => ({ ...v, known: new Map([...v.known].map(([k, ss]) => [k, k === id ? new Set([...ss].filter((x) => x !== rule)) : ss])) }),
      });
      if (!this.openFlag) this.say(pick(LINES.shut), 2);
    }
    this.invalidate();
    return true;
  }

  sawCritter(id: string): void {
    const c = canonical(this.list, id) ?? id;
    if (this.seen.has(c)) return;
    this.seen.add(c);
    this.invalidate();
  }

  knows(critter: string, rule: string | number): boolean {
    const id = canonical(this.list, critter) ?? critter;
    return this.known.get(id)?.has(ruleId(this.list.find((x) => x.id === id), rule)) ?? false;
  }

  /** take a live creature's own rules and favourite food (src/creatures/cryptids instances); install() does this */
  adopt(c: Adoptable): void {
    const id = canonical(this.list, c.id) ?? c.id;
    this.adopted.set(id, c);
    const e = this.list.find((x) => x.id === id);
    if (e) { adoptInto(e, c); this.pages = []; this.rebuild(); }
  }
  private adopted = new Map<string, Adoptable>();

  /** has the Book tasted it (a full entry with portrait)? */
  tastedIt(id: string): boolean { return this.tasted.has(canonical(this.list, id) ?? id); }

  /** the Book tastes a cryptid: records the sighting, paints the plate, writes the entry, says its piece */
  observe(id: string, data: ObserveData = {}): boolean {
    const c = canonical(this.list, id);
    if (!c) return false;
    if (data.rule) this.learn(c, data.rule);
    this.seen.add(c);
    if (this.tasted.has(c)) { if (!data.silent && this.openFlag) this.say(pick(LINES.again), 2.5); return false; }
    this.tasted.set(c, this.day);
    const e = this.list.find((x) => x.id === c)!;
    if (!data.silent) {
      this.pendingWrites.unshift({
        id: c, line: data.remark ?? e.taste,
        keys: ['plate', 'caption', 'habitat', 'active', 'size', 'danger', 'food', 'foodname', 'taste'].map((k) => `${k}:${c}`).concat(['count']),
        before: (v) => ({ ...v, tasted: new Map([...v.tasted].filter(([k]) => k !== c)) }),
      });
      this.play('taste', 1.5);
    }
    this.invalidate();
    return true;
  }

  dump(): [string, string[]][] {
    const out: [string, string[]][] = [...this.known.entries()].map(([k, v]) => [k, [...v]]);
    out.push(['@seen', [...this.seen]]);
    out.push(['@tasted', [...this.tasted].map(([k, d]) => `${k}:${d}`)]);
    out.push(['@page', [String(this.page)]]);
    return out;
  }

  restore(d: [string, string[]][]): void {
    for (const [k, v] of d) {
      if (k === '@seen') { for (const s of v) this.seen.add(s); continue; }
      if (k === '@tasted') { for (const s of v) { const [id, day] = s.split(':'); this.tasted.set(id, Number(day) || 0); } continue; }
      if (k === '@page') { this.page = Math.max(0, Number(v[0]) || 2) & ~1; continue; }
      this.known.set(canonical(this.list, k) ?? k, new Set(v));
    }
    this.pendingWrites = [];
    this.rebuild();
  }

  /** re-read the cryptid list, contracts and state; repaint */
  rebuild(): void {
    this.list = entries();
    for (const [id, c] of this.adopted) { const e = this.list.find((x) => x.id === id); if (e) adoptInto(e, c); }
    for (const e of this.list) if (!this.known.has(e.id)) this.known.set(e.id, new Set());
    this.pages = layout(this.view());
    this.page = Math.min(this.page, Math.max(0, this.pages.length - 2)) & ~1;
    this.invalidate();
  }

  toggle(): void {
    this.openFlag = !this.openFlag;
    if (this.openFlag) {
      this.rebuild();
      this.yawnDue = true;
      this.sfx('page_turn', 0.5, 0.7);
      // something new to write: go straight there
      if (this.pendingWrites.length) this.page = this.spreadOf(this.pendingWrites[0].id);
      else if (Math.random() < 0.35) this.say(pick(LINES.open), 2.4);
      this.grumbleIn = 14 + Math.random() * 20;
    } else {
      this.play('snap', 0.22);
      this.holdUp = 0.42;
      this.turnT = null; this.turnQueue = [];
      this.writing = [];
    }
    this.onOpenChange?.(this.openFlag);
  }

  turn(d: number): void {
    if (!this.openFlag) return;
    const now = this.t;
    this.turnTimes = this.turnTimes.filter((x) => now - x < 1.6);
    this.turnTimes.push(now);
    if (this.turnTimes.length >= 5 && Math.random() < 0.6) { this.say(pick(LINES.fast), 1.8); this.play('grumble', 0.6); this.turnTimes = []; }
    this.turnQueue.push(Math.sign(d));
  }

  /** go to a spread (no animation) */
  goto(page: number): void { this.page = Math.max(0, Math.min(this.pages.length - 2, page)) & ~1; this.shown.L = this.shown.R = -1; }

  /** the first page of a cryptid's spread */
  spreadOf(id: string): number { const i = this.pages.findIndex((p) => p.k === 'plate' && p.id === id); return i < 0 ? this.page : i & ~1; }

  /** make the Book speak (its line floats above it) */
  say(text: string, dur?: number): void {
    const d = dur ?? Math.min(7, 1.8 + text.split(/\s+/).length * 0.3);
    this.speakT = d;
    if (this.cam) floatText.say(text, { who: SPEAKER, kind: 'speech', at: this.anchor, lift: 0.035, dur: d });
    else floatText.say(text, { kind: 'thought', dur: d, color: '#e6b48a' });
    this.sfx('hound_chew', 0.12, 1.7);
  }

  /** the main camera and the viewmodel camera (for the speech anchor and looking at critters) */
  attach(o: { camera: THREE.PerspectiveCamera; viewCam: THREE.PerspectiveCamera }): void {
    this.cam = o;
    o.camera.add(this.anchor);
    floatText.speakers.set(SPEAKER, this.anchor);
  }

  /** point the eyes (and the tasting tongue) at something: a view-space point, held for a moment */
  look(viewPoint: THREE.Vector3 | null, hold = 0.3): void {
    if (!viewPoint) { this.lookAt = null; return; }
    this.lookAt = (this.lookAt ?? new THREE.Vector3()).copy(viewPoint);
    this.lookHold = hold;
  }

  /** tasting progress 0..1 for a critter in view (install() drives this): the tongue flicks as it builds */
  tasting = 0;

  // ------------------------------------------------------------------------------------------------ state
  private view(): BookView {
    return {
      entries: this.list, known: this.known, seen: this.seen, tasted: this.tasted, contracts: this.contracts,
      pageOf: (id) => this.spreadOf(id),
    };
  }
  private invalidate(): void { this.ver++; this.shown = { L: -1, R: -1, F: -1, B: -1 }; }

  private paint(i: number, v = this.view(), ver = this.ver): Painted {
    const c = this.cache.get(i);
    if (c && c.ver === ver && v === undefined) return c.p;
    if (c && c.ver === ver) return c.p;
    const kind = this.pages[i] ?? { k: 'blank' as const };
    const p = paintPage(kind, i % 2 ? 'R' : 'L', v, i, () => { if (this.cache.get(i)?.p.pending) { this.cache.delete(i); this.shown = { L: -1, R: -1, F: -1, B: -1 }; } });
    this.cache.set(i, { ver, p });
    if (this.cache.size > 14) { const k = [...this.cache.keys()].find((x) => Math.abs(x - this.page) > 4); if (k !== undefined) this.cache.delete(k); }
    return p;
  }

  private show(slot: 'L' | 'R' | 'F' | 'B', i: number): void {
    if (this.shown[slot] === i) return;
    this.shown[slot] = i;
    const w = this.writing.find((x) => x.index === i);
    const pix = w ? this.compose(w) : this.paint(i).pix;
    pix.toCanvas(this.model.canvases[slot]);
    this.model.refresh([slot]);
  }

  // ------------------------------------------------------------------------------------------------ writing
  /** start writing the next pending entry if its spread is open */
  private startWriting(): void {
    if (this.writing.length || !this.pendingWrites.length || this.turnT !== null || this.o < 0.95) return;
    const pw = this.pendingWrites[0];
    const sp = this.spreadOf(pw.id);
    if (sp !== this.page) { this.turnQueue = [Math.sign(sp - this.page)]; this.flipTo = sp; return; }
    this.pendingWrites.shift();
    const v = this.view(), before = pw.before(v);
    const keys = new Set(pw.keys);
    for (const i of [this.page, this.page + 1]) {
      const after = this.paint(i);
      if (!after.pix || !after.regions.some((r) => keys.has(r.key))) continue;
      const b = paintPage(this.pages[i], i % 2 ? 'R' : 'L', before, i, () => undefined).pix;
      const regs = after.regions.filter((r) => keys.has(r.key)).sort((a, c) => (a.kind === 'plate' ? -1 : 0) - (c.kind === 'plate' ? -1 : 0) || a.y - c.y || a.x - c.x);
      let t = 0;
      const order = regs.map((r) => { const len = r.kind === 'plate' ? 1.6 : 0.25 + (r.w * Math.max(1, Math.round(r.h / 18))) / 900; const o = { r, t0: t, t1: t + len }; t += len * 0.8; return o; });
      this.writing.push({ index: i, before: b, after, keys, t: -0.9, dur: t + 0.3, order });
    }
    // the lick first, then the ink
    this.play('lick', 0.9);
    this.sfx('hound_chew', 0.3, 0.8);
    this.later(0.9, () => this.sfx('pencil_scribble', 0.4, 0.9));
    const line = pw.line;
    if (line) this.later(1.3, () => this.say(line, 4.5));
    else this.later(1.1, () => this.say(pick(LINES.learn), 2.2));
    this.shown.L = this.shown.R = -1;
  }
  private flipTo: number | null = null;
  private events: { at: number; f: () => void }[] = [];
  /** run f after s seconds of book time */
  private later(s: number, f: () => void): void { this.events.push({ at: this.t + s, f }); }

  /** the page mid-write: ink appears region by region, row by row, with a ragged wet edge */
  private compose(w: Writing): Pix {
    const out = w.before.clone();
    const A = w.after.pix;
    for (const { r, t0, t1 } of w.order) {
      const k = (w.t - t0) / (t1 - t0);
      if (k <= 0) continue;
      const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(PAGE_W, Math.ceil(r.x + r.w)), y1 = Math.min(PAGE_H, Math.ceil(r.y + r.h));
      const rows = Math.max(1, Math.round(r.h / 18));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        let show: boolean;
        if (r.kind === 'plate') {
          // ink soaking in from blots
          const n = 0.55 * (NZ.n2(x / 26, y / 26) * 0.5 + 0.5) + 0.45 * hash2(x >> 1, y >> 1, 9);
          show = n < k * 1.15 - 0.05;
        } else {
          const row = Math.min(rows - 1, Math.floor(((y - r.y) / r.h) * rows));
          const front = (k * rows - row) * r.w + r.x + (hash2(y, row, 3) - 0.5) * 4;
          show = x < front;
        }
        if (!show) continue;
        const o = (y * PAGE_W + x) * 4;
        out.d[o] = A.d[o]; out.d[o + 1] = A.d[o + 1]; out.d[o + 2] = A.d[o + 2];
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ animation
  private play(kind: Anim['kind'], dur: number): void { this.anims = this.anims.filter((a) => a.kind !== kind); this.anims.push({ kind, t: 0, dur }); }
  private animK(kind: Anim['kind']): number { const a = this.anims.find((x) => x.kind === kind); return a ? Math.min(1, a.t / a.dur) : 0; }
  private sfx(id: string, vol: number, rate = 1): void { try { audio.play(id, { vol, rate }); } catch { /* audio not ready */ } }

  update(dt: number): void {
    dt = Math.min(0.1, Math.max(0, dt));
    this.t += dt;
    for (const a of this.anims) a.t += dt;
    if (this.events.length) { const due = this.events.filter((e) => e.at <= this.t); this.events = this.events.filter((e) => e.at > this.t); for (const e of due) e.f(); }
    this.anims = this.anims.filter((a) => a.t < a.dur);
    // raising: the book comes up shut, cover toward you; after it shuts it stays up a moment (the bite), then drops
    const wantUp = this.openFlag || this.holdUp > 0;
    this.holdUp = Math.max(0, this.holdUp - dt);
    this.r += ((wantUp ? 1 : 0) - this.r) * Math.min(1, dt * (wantUp ? 9 : 6));
    if (this.openFlag && this.r > 0.78 && this.yawnDue) { this.yawnDue = false; this.play('yawn', 0.6); this.sfx('hound_growl', 0.18, 1.9); }
    // openness (the jaw): a spring with a hitch (the yawn) when opening, a fast snap with a bounce when shutting
    const yawn = this.animK('yawn');
    if (this.openFlag) {
      const goal = this.yawnDue ? 0 : yawn > 0 && yawn < 0.5 ? 0.38 : 1;
      this.oVel += ((goal - this.o) * 110 - this.oVel * 14) * dt;
    } else {
      this.oVel += ((0 - this.o) * 520 - this.oVel * 24) * dt;
    }
    this.o += this.oVel * dt;
    if (this.o < 0) {
      if (this.oVel < -1.5 && !this.openFlag) { this.sfx('door_shut', 0.35, 2.4); this.sfx('eat_crunch', 0.35, 1.3); this.play('chomp', 0.35); }
      this.o = 0; this.oVel = Math.abs(this.oVel) * 0.22;
    }
    if (this.o > 1) { this.o = 1; this.oVel = 0; }
    const vis = this.r > 0.01;
    if (!vis && this.object.visible && !this.openFlag) this.onPutAway?.();
    this.object.visible = vis;
    this.place(dt);
    if (!vis) return;
    // turning pages
    if (this.turnT === null && this.turnQueue.length && this.o > 0.9) {
      const d = this.turnQueue.shift()!;
      const np = Math.max(0, Math.min(this.pages.length - 2, this.page + d * 2));
      if (np !== this.page) {
        this.turnDir = d; this.turnT = 0;
        this.sfx('page_turn', 0.45, 0.9 + Math.random() * 0.2);
        if (this.flipTo !== null && this.flipTo !== np) this.turnQueue.unshift(d);
        if (this.flipTo === np) this.flipTo = null;
      } else this.flipTo = null;
    }
    const q = this.pose;
    q.time = this.t;
    q.open = this.o;
    if (this.turnT !== null) {
      const fast = this.flipTo !== null ? 2.6 : this.turnQueue.length ? 1.9 : 1;
      this.turnT += dt * fast / 0.6;
      const d = this.turnDir;
      // forward: the right page lifts and lands on the left; back: the reverse
      const leafRight = d > 0 ? this.page + 1 : this.page - 1, leafLeft = d > 0 ? this.page + 2 : this.page;
      this.show('F', leafRight); this.show('B', leafLeft);
      if (d > 0) { this.show('L', this.page); this.show('R', this.page + 3); }
      else { this.show('L', this.page - 2); this.show('R', this.page + 1); }
      q.turn = d > 0 ? this.turnT : 1 - this.turnT;
      if (this.turnT >= 1) { this.page += d * 2; this.turnT = null; q.turn = null; this.shown.L = this.shown.R = -1; }
    } else {
      q.turn = null;
      this.startWriting();
      this.show('L', this.page); this.show('R', this.page + 1);
    }
    q.through = this.pages.length > 2 ? Math.min(1, Math.max(0, (this.page + (q.turn ?? 0) * 2 * (this.turnDir || 1) * 0) / (this.pages.length - 2))) : 0.5;
    // ink being written
    for (const w of this.writing) {
      w.t += dt;
      if (w.t > 0) { this.shown[w.index === this.page ? 'L' : 'R'] = -1; }
    }
    if (this.writing.length && this.writing.every((w) => w.t > w.dur)) { this.writing = []; this.shown.L = this.shown.R = -1; }
    // the living bits
    q.breath = this.o > 0.9 ? 0.5 + 0.5 * Math.sin(this.t * 1.35) : 0;
    const chomp = this.animK('chomp');
    const grum = this.animK('grumble');
    const talk = this.speakT > 0 ? 1 : 0;
    this.speakT = Math.max(0, this.speakT - dt);
    q.jaw = talk * 0.045 * Math.max(0, Math.sin(this.t * 13) * Math.sin(this.t * 3.1 + 1)) + grum * 0.02 * Math.sin(this.t * 40) + (yawn > 0 && yawn < 0.6 ? 0.02 * Math.sin(this.t * 30) : 0);
    q.wag = talk;
    q.snarl = Math.max(grum > 0 ? Math.sin(grum * Math.PI) : 0, chomp > 0 ? 1 - chomp : 0, yawn > 0 ? Math.sin(yawn * Math.PI) * 0.6 : 0);
    const lick = this.animK('lick'), taste = this.animK('taste');
    q.lick = lick > 0 ? lick : 0;
    q.taste = taste > 0 ? taste : this.tasting > 0.05 ? (this.t * 0.6) % 1 : 0;
    // eyes: blinks, squints when grumbling, follow what it is looking at
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blinkT = 0.16; this.blinkIn = 2 + Math.random() * 4.5; }
    this.blinkT = Math.max(0, this.blinkT - dt);
    q.blink = this.blinkT > 0 ? Math.sin((1 - this.blinkT / 0.16) * Math.PI) : 0;
    q.squint = Math.max(grum, this.writing.length ? 0.35 : 0, lick > 0 ? 0.6 : 0);
    this.lookHold -= dt;
    if (this.lookHold <= 0) this.lookAt = null;
    q.look = this.lookAt ? this.object.worldToLocal(this.lookAt.clone()) : null;
    // grumbling when left alone too long
    if (this.openFlag && this.o > 0.95) {
      this.grumbleIn -= dt;
      if (this.grumbleIn <= 0) {
        this.grumbleIn = 22 + Math.random() * 30;
        this.play('grumble', 0.9);
        this.sfx('hound_growl', 0.22, 1.6);
        if (Math.random() < 0.7) this.say(pick(LINES.grumble), 3);
      }
    }
    this.model.update(q);
  }

  /** 0 reading (held up to the face, filling the view) .. 1 aiming (lowered, pointed at something to taste) */
  aim = 0;
  private aimK = 0;

  /** viewmodel placement: shut and low when put away; open, either held up to read or lowered toward a critter */
  private place(dt: number): void {
    const o = this.o;
    const rise = THREE.MathUtils.smoothstep(this.r, 0, 1);
    const chomp = this.animK('chomp');
    const bob = Math.sin(this.t * 1.35) * 0.0015 * rise;
    this.aimK += ((this.tasting > 0.02 || this.animK('taste') > 0 ? 1 : this.aim) - this.aimK) * Math.min(1, dt * 4);
    const a = THREE.MathUtils.smoothstep(this.aimK, 0, 1);
    // read: the spread fills most of the view, tipped back a little; aim: lower, flatter, the world above it
    const ry = THREE.MathUtils.lerp(-0.006, -0.2, a), rz = THREE.MathUtils.lerp(-0.268, -0.36, a), rx = THREE.MathUtils.lerp(1.34, 0.8, a);
    const y = THREE.MathUtils.lerp(-0.5, ry, rise) + bob + chomp * 0.015 * Math.sin(chomp * Math.PI * 3);
    this.object.position.set(0, y - (1 - THREE.MathUtils.smoothstep(o, 0, 1)) * 0.02, THREE.MathUtils.lerp(-0.34, rz, rise) - (1 - o) * 0.04);
    // when shut, it lies front cover up in the hands
    this.object.rotation.set(THREE.MathUtils.lerp(0.55, rx, rise) + this.animK('grumble') * 0.01 * Math.sin(this.t * 37), 0, 0);
    // centre the spread: the book's x = 0 is the spine; when shut, slide so the cover is centred
    this.model.object.position.x = -(1 - THREE.MathUtils.smoothstep(o, 0, 0.7)) * (PAGE.w * 0.58);
    this.object.updateMatrixWorld(true);
    // hand targets: under the fore-edge of each board, following the covers as they swing
    const m = this.object.matrixWorld;
    this.model.object.updateMatrixWorld(true);
    const mm = this.model.object.matrixWorld;
    for (const side of ['L', 'R'] as const) {
      const f = this.handF[side];
      this.model.handFrame(side, f, o);
      this.hands[side].copy(f.p).applyMatrix4(mm);
      this.hands[side === 'L' ? 'xL' : 'xR'].copy(f.x).transformDirection(mm);
      this.hands[side === 'L' ? 'nL' : 'nR'].copy(f.n).transformDirection(mm);
    }
    this.hands.z.set(0, 0, 1).transformDirection(m);
    // the speech anchor: above the head of the book, as seen through the main camera
    if (this.cam) {
      const top = new THREE.Vector3(0, 0.01, -PAGE.h / 2 - 0.01).applyMatrix4(m);
      if (!this.object.visible) top.set(0, -0.3, -0.5);
      const fv = THREE.MathUtils.degToRad(this.cam.viewCam.fov) / 2, fm = THREE.MathUtils.degToRad(this.cam.camera.fov) / 2;
      const nx = top.x / -top.z / Math.tan(fv), ny = Math.min(0.58, top.y / -top.z / Math.tan(fv));
      this.anchor.position.set(nx * Math.tan(fm), ny * Math.tan(fm), -1);
    }
  }
}

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
