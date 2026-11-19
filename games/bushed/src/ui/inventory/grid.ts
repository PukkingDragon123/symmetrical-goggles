// The backpack grid: a 6 x 6 board of cells stitched onto the stiff panel inside the rucksack. Pure data and placement
// logic (no three.js, no DOM), so saves, the store and tests can use it headless.
//
//   FOOTPRINTS            per-item footprint table: cells wide x tall, max stack, packable, sound material
//   PackGrid              placements on the board: canPlace / findFree / add / remove / move / autoArrange / serialise
//   PackInventory         keeps a PackGrid in step with the game's item counts (game.inv.items)
//
// Source of truth: game.inv.items (Map<id, count>) stays canonical for HOW MANY of each thing you own, because the
// whole game reads and writes it (give / take / owns, flow.ts, saves). The grid owns WHERE packed things sit. Every
// change to the counts is reconciled into the grid by diff (PackInventory.reconcile): increases are auto-placed,
// decreases come out of the loose list first, then the preferred stack, then the smallest stack. Units that cannot
// be placed stay "loose": owned but outside the pack (big tools or the chainsaw that never go in, or overflow when
// the pack is full; the UI says "No room in the pack." and drops overflow at your feet).
import { ITEMS } from '../../game/items';

export type SoundMat = 'metal' | 'tool' | 'glass' | 'tin' | 'paper' | 'food' | 'cloth' | 'wood';

export interface Footprint {
  /** cells across (columns) in the default orientation */
  w: number;
  /** cells down (rows) in the default orientation */
  h: number;
  /** max units in one stack (1 = never stacks) */
  stack: number;
  /** false: never goes in the pack (carried, strapped or worn) */
  pack: boolean;
  /** what it sounds like when it is picked up and set down */
  snd: SoundMat;
}

/**
 * Footprints, edit freely. w x h in cells (a cell is about a hand's width: 11-12 cm); R rotates while dragging.
 * Long tools lie along a column, heads overhanging a little. Unknown items (addItems from other modules) get a
 * footprint from their model's size or mass (see footprint()).
 */
export const FOOTPRINTS: Record<string, Partial<Footprint>> = {
  // tools
  axe_old: { w: 1, h: 4, snd: 'tool' },
  axe_felling: { w: 1, h: 4, snd: 'tool' },
  axe_splitting: { w: 1, h: 4, snd: 'tool' },
  lachance_axe: { w: 1, h: 4, snd: 'tool' },
  maul: { w: 1, h: 5, snd: 'tool' },
  hatchet: { w: 1, h: 3, snd: 'tool' },
  bucksaw: { w: 1, h: 4, snd: 'tool' },
  chainsaw: { w: 2, h: 4, pack: false, snd: 'tool' },
  file: { w: 1, h: 2, snd: 'metal' },
  log_tongs: { w: 2, h: 3, snd: 'metal' },
  knife: { w: 1, h: 2, snd: 'metal' },
  // light and fire
  flashlight: { w: 1, h: 2, snd: 'metal' },
  batteries: { w: 1, h: 1, stack: 4, snd: 'metal' },
  lantern: { w: 1, h: 3, snd: 'glass' },
  matches: { w: 1, h: 1, stack: 4, snd: 'paper' },
  firestarter: { w: 1, h: 2, stack: 3, snd: 'wood' },
  // food
  jerky: { w: 1, h: 1, stack: 5, snd: 'paper' },
  beer: { w: 1, h: 2, snd: 'glass' },
  coffee: { w: 1, h: 1, snd: 'tin' },
  beans: { w: 1, h: 1, stack: 2, snd: 'tin' },
  bread: { w: 2, h: 1, snd: 'food' },
  eggs: { w: 2, h: 1, snd: 'paper' },
  bacon: { w: 2, h: 1, stack: 2, snd: 'paper' },
  syrup: { w: 1, h: 2, snd: 'glass' },
  cookies: { w: 2, h: 2, snd: 'tin' },
  berries: { w: 1, h: 1, stack: 4, snd: 'food' },
  chanterelle: { w: 1, h: 1, stack: 4, snd: 'food' },
  fish: { w: 1, h: 3, snd: 'food' },
  // camp and kit
  rope: { w: 2, h: 2, snd: 'cloth' },
  first_aid: { w: 2, h: 2, snd: 'tin' },
  gloves: { w: 1, h: 2, snd: 'cloth' },
  pot: { w: 2, h: 2, snd: 'metal' },
  pan: { w: 2, h: 3, snd: 'metal' },
  sleeping_bag: { w: 2, h: 4, snd: 'cloth' },
  backpack_big: { w: 3, h: 4, pack: false, snd: 'cloth' },
  // wood
  kindling: { w: 1, h: 3, stack: 3, snd: 'wood' },
  firewood: { w: 1, h: 3, snd: 'wood' },
  bundle: { w: 3, h: 4, pack: false, snd: 'wood' },
};

/** metres per cell, used to derive footprints for items that are not in the table */
export const CELL_M = 0.115;

/** optional model size lookup for derived footprints ([x, y, z] metres); set by the UI when it knows */
let sizeOf: ((id: string) => [number, number, number] | null) | null = null;
export function setFootprintSizer(f: ((id: string) => [number, number, number] | null) | null): void { sizeOf = f; fpCache.clear(); }

const fpCache = new Map<string, Footprint>();

/** the footprint of an item: the table entry, or one derived from its model size / mass */
export function footprint(id: string): Footprint {
  let f = fpCache.get(id);
  if (f) return f;
  const t = FOOTPRINTS[id];
  const def = ITEMS[id];
  const mass = def?.mass ?? 0.5;
  let w = t?.w, h = t?.h;
  if (w === undefined || h === undefined) {
    const s = sizeOf?.(id);
    if (s) {
      const d = [...s].sort((a, b) => b - a);
      h = clampI(Math.round(d[0] / CELL_M), 1, 5);
      w = clampI(Math.round(d[1] / CELL_M), 1, 3);
    } else if (mass < 0.35) { w = 1; h = 1; } else if (mass < 1) { w = 1; h = 2; } else if (mass < 2.5) { w = 2; h = 2; } else { w = 2; h = 3; }
  }
  f = {
    w, h,
    stack: t?.stack ?? (w * h === 1 && mass < 0.35 ? 3 : 1),
    pack: t?.pack ?? (def ? def.pocket || mass < 5 : true),
    snd: t?.snd ?? (def?.tool ? 'tool' : def?.food ? 'food' : 'cloth'),
  };
  fpCache.set(id, f);
  return f;
}

function clampI(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, Math.round(v))); }

export interface Placement {
  /** stable id for the UI (survives moves, merges keep the target's uid) */
  uid: number;
  id: string;
  /** top-left cell */
  x: number;
  y: number;
  /** 1 = turned 90 degrees (w and h swapped) */
  rot: 0 | 1;
  /** units in this stack */
  n: number;
}

export interface PackSave { v: 1; w: number; h: number; items: [string, number, number, 0 | 1, number][] }

export type FitResult = 'ok' | 'merge' | 'swap' | 'blocked' | 'out';

/** cells covered by an item at a rotation */
export function dimsOf(id: string, rot: 0 | 1): { w: number; h: number } {
  const f = footprint(id);
  return rot ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
}

export class PackGrid {
  readonly items: Placement[] = [];
  /** bumps on every change (the UI rebuilds what it shows when this moves) */
  version = 0;
  private nextUid = 1;

  constructor(readonly w = 6, readonly h = 6) {}

  dims(p: Placement): { w: number; h: number } { return dimsOf(p.id, p.rot); }

  /** the placement covering a cell (or null) */
  at(x: number, y: number): Placement | null {
    for (const p of this.items) {
      const d = this.dims(p);
      if (x >= p.x && x < p.x + d.w && y >= p.y && y < p.y + d.h) return p;
    }
    return null;
  }

  byUid(uid: number): Placement | null { return this.items.find((p) => p.uid === uid) ?? null; }

  /** occupancy, ignoring some placements */
  private occ(ignore: readonly Placement[] = []): Int32Array {
    const o = new Int32Array(this.w * this.h);
    for (const p of this.items) {
      if (ignore.includes(p)) continue;
      const d = this.dims(p);
      for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
        const x = p.x + i, y = p.y + j;
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) o[y * this.w + x] = p.uid;
      }
    }
    return o;
  }

  /** would `id` at (x, y, rot) fit, ignoring `ignore`? */
  canPlace(id: string, x: number, y: number, rot: 0 | 1, ignore: readonly Placement[] = []): boolean {
    const d = dimsOf(id, rot);
    if (x < 0 || y < 0 || x + d.w > this.w || y + d.h > this.h) return false;
    const o = this.occ(ignore);
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (o[(y + j) * this.w + x + i]) return false;
    return true;
  }

  /**
   * What dropping a dragged placement at (x, y, rot) would do: 'ok' (empty cells), 'merge' (onto a stack of the same
   * thing with room), 'swap' (exactly one other item underneath and it fits where the dragged one came from),
   * 'blocked', or 'out' (off the board).
   */
  fit(p: Placement, x: number, y: number, rot: 0 | 1): { r: FitResult; other?: Placement } {
    const d = dimsOf(p.id, rot);
    if (x < 0 || y < 0 || x + d.w > this.w || y + d.h > this.h) return { r: 'out' };
    const under = new Set<Placement>();
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const q = this.at(x + i, y + j); if (q && q !== p) under.add(q); }
    if (under.size === 0) return { r: 'ok' };
    if (under.size === 1) {
      const q = [...under][0];
      if (q.id === p.id && q.n < footprint(q.id).stack) return { r: 'merge', other: q };
      // swap: q goes to where p was (p's old cells), if it fits there with p in its new spot
      const qd = this.dims(q);
      const tx = p.x, ty = p.y;
      if (this.canPlaceWith(q.id, tx, ty, q.rot, [p, q], { id: p.id, x, y, rot }) && qd) return { r: 'swap', other: q };
    }
    return { r: 'blocked' };
  }

  private canPlaceWith(id: string, x: number, y: number, rot: 0 | 1, ignore: Placement[], extra: { id: string; x: number; y: number; rot: 0 | 1 }): boolean {
    if (!this.canPlace(id, x, y, rot, ignore)) return false;
    const a = dimsOf(id, rot), b = dimsOf(extra.id, extra.rot);
    return x + a.w <= extra.x || extra.x + b.w <= x || y + a.h <= extra.y || extra.y + b.h <= y;
  }

  /**
   * A free spot for an item: every valid (x, y, rot) is scored by how much of its rim touches walls or other items
   * (tidy packing that keeps the open space in one piece), ties go top-left. prefer: rotation to try first.
   */
  findFree(id: string, prefer: 0 | 1 = 0, ignore: readonly Placement[] = []): { x: number; y: number; rot: 0 | 1 } | null {
    const o = this.occ(ignore);
    const f = footprint(id);
    const rots: (0 | 1)[] = f.w === f.h ? [0] : prefer ? [1, 0] : [0, 1];
    let best: { x: number; y: number; rot: 0 | 1 } | null = null, bestS = -1;
    const solid = (x: number, y: number) => x < 0 || y < 0 || x >= this.w || y >= this.h || o[y * this.w + x] !== 0;
    for (const rot of rots) {
      const d = dimsOf(id, rot);
      for (let y = 0; y + d.h <= this.h; y++) for (let x = 0; x + d.w <= this.w; x++) {
        let free = true;
        for (let j = 0; j < d.h && free; j++) for (let i = 0; i < d.w; i++) if (o[(y + j) * this.w + x + i]) { free = false; break; }
        if (!free) continue;
        let s = 0;
        for (let i = 0; i < d.w; i++) { if (solid(x + i, y - 1)) s++; if (solid(x + i, y + d.h)) s++; }
        for (let j = 0; j < d.h; j++) { if (solid(x - 1, y + j)) s++; if (solid(x + d.w, y + j)) s++; }
        // the preferred rotation wins ties; earlier rows win, then earlier columns
        const score = s * 1000 - y * 20 - x + (rot === rots[0] ? 0.5 : 0);
        if (score > bestS) { bestS = score; best = { x, y, rot }; }
      }
    }
    return best;
  }

  count(id: string): number { let n = 0; for (const p of this.items) if (p.id === id) n += p.n; return n; }

  counts(): Map<string, number> {
    const m = new Map<string, number>();
    for (const p of this.items) m.set(p.id, (m.get(p.id) ?? 0) + p.n);
    return m;
  }

  /** kilograms in the pack */
  weight(): number { let kg = 0; for (const p of this.items) kg += (ITEMS[p.id]?.mass ?? 0) * p.n; return kg; }

  usedCells(): number { let c = 0; for (const p of this.items) { const d = this.dims(p); c += d.w * d.h; } return c; }

  /** put n of an item in: tops up existing stacks, then new spots. Returns how many did NOT fit. */
  add(id: string, n = 1): number {
    const f = footprint(id);
    if (!f.pack) return n;
    for (const p of this.items) {
      if (n <= 0) break;
      if (p.id !== id || p.n >= f.stack) continue;
      const k = Math.min(n, f.stack - p.n);
      p.n += k; n -= k;
    }
    while (n > 0) {
      const s = this.findFree(id, f.h > f.w ? 0 : 0);
      if (!s) break;
      const k = Math.min(n, f.stack);
      this.items.push({ uid: this.nextUid++, id, x: s.x, y: s.y, rot: s.rot, n: k });
      n -= k;
    }
    this.version++;
    return n;
  }

  /** put a stack at an exact spot (no checks beyond bounds/overlap); returns the placement or null */
  put(id: string, x: number, y: number, rot: 0 | 1, n: number): Placement | null {
    if (!this.canPlace(id, x, y, rot)) return null;
    const p: Placement = { uid: this.nextUid++, id, x, y, rot, n };
    this.items.push(p);
    this.version++;
    return p;
  }

  /** take n of an item out: the preferred stack first, then the smallest stacks. Returns how many came out. */
  remove(id: string, n = 1, preferUid?: number): number {
    let got = 0;
    const order = this.items.filter((p) => p.id === id).sort((a, b) => (a.uid === preferUid ? -1 : b.uid === preferUid ? 1 : a.n - b.n || b.uid - a.uid));
    for (const p of order) {
      if (got >= n) break;
      const k = Math.min(p.n, n - got);
      p.n -= k; got += k;
      if (p.n <= 0) this.items.splice(this.items.indexOf(p), 1);
    }
    if (got) this.version++;
    return got;
  }

  /** take n from one placement */
  removeFrom(uid: number, n = 1): number {
    const p = this.byUid(uid);
    if (!p) return 0;
    const k = Math.min(p.n, n);
    p.n -= k;
    if (p.n <= 0) this.items.splice(this.items.indexOf(p), 1);
    this.version++;
    return k;
  }

  /**
   * Move a placement (drag and drop). Handles merging onto a stack of the same item (overflow stays behind) and
   * swapping with a single item underneath. Returns what happened, or null if it could not go there.
   */
  move(uid: number, x: number, y: number, rot: 0 | 1): FitResult | null {
    const p = this.byUid(uid);
    if (!p) return null;
    const f = this.fit(p, x, y, rot);
    if (f.r === 'ok') { p.x = x; p.y = y; p.rot = rot; this.version++; return 'ok'; }
    if (f.r === 'merge' && f.other) {
      const q = f.other, room = footprint(q.id).stack - q.n, k = Math.min(room, p.n);
      q.n += k; p.n -= k;
      if (p.n <= 0) this.items.splice(this.items.indexOf(p), 1);
      this.version++;
      return 'merge';
    }
    if (f.r === 'swap' && f.other) {
      const q = f.other;
      q.x = p.x; q.y = p.y;
      p.x = x; p.y = y; p.rot = rot;
      this.version++;
      return 'swap';
    }
    return null;
  }

  /** split a stack: k units of a placement into a free spot. Returns the new placement. */
  split(uid: number, k: number): Placement | null {
    const p = this.byUid(uid);
    if (!p || p.n <= 1) return null;
    k = Math.min(k, p.n - 1);
    const s = this.findFree(p.id, p.rot);
    if (!s) return null;
    p.n -= k;
    const q: Placement = { uid: this.nextUid++, id: p.id, x: s.x, y: s.y, rot: s.rot, n: k };
    this.items.push(q);
    this.version++;
    return q;
  }

  /** move a placement to the best free spot elsewhere (shift-click quick move); merges into stacks first */
  quickMove(uid: number): boolean {
    const p = this.byUid(uid);
    if (!p) return false;
    const f = footprint(p.id);
    for (const q of this.items) if (q !== p && q.id === p.id && q.n < f.stack) {
      const k = Math.min(f.stack - q.n, p.n);
      q.n += k; p.n -= k;
      if (p.n <= 0) this.items.splice(this.items.indexOf(p), 1);
      this.version++;
      return true;
    }
    const s = this.findFree(p.id, p.rot, [p]);
    if (!s || (s.x === p.x && s.y === p.y && s.rot === p.rot)) return false;
    p.x = s.x; p.y = s.y; p.rot = s.rot;
    this.version++;
    return true;
  }

  /**
   * Re-pack everything tidily: merge partial stacks, then try a few orderings (largest first, longest first,
   * heaviest first) with the touching-rim heuristic and keep the layout with the biggest open rectangle.
   * Returns false (and changes nothing) if no ordering fits everything.
   */
  autoArrange(): boolean {
    // merge stacks
    const totals = this.counts();
    const units: { id: string; n: number; uid: number; rot: 0 | 1 }[] = [];
    const seen = new Map<string, Placement[]>();
    for (const p of this.items) { const l = seen.get(p.id) ?? []; l.push(p); seen.set(p.id, l); }
    for (const [id, n] of totals) {
      const st = footprint(id).stack;
      const olds = seen.get(id)!;
      let left = n, k = 0;
      while (left > 0) { const take = Math.min(st, left); units.push({ id, n: take, uid: olds[k]?.uid ?? -1, rot: olds[k]?.rot ?? 0 }); left -= take; k++; }
    }
    const area = (u: { id: string }) => { const f = footprint(u.id); return f.w * f.h; };
    const long = (u: { id: string }) => { const f = footprint(u.id); return Math.max(f.w, f.h); };
    const mass = (u: { id: string; n: number }) => (ITEMS[u.id]?.mass ?? 0) * u.n;
    const orders = [
      [...units].sort((a, b) => area(b) - area(a) || long(b) - long(a) || a.id.localeCompare(b.id)),
      [...units].sort((a, b) => long(b) - long(a) || area(b) - area(a) || a.id.localeCompare(b.id)),
      [...units].sort((a, b) => mass(b) - mass(a) || area(b) - area(a)),
    ];
    let best: Placement[] | null = null, bestS = -1;
    for (const ord of orders) for (const pref of [0, 1] as const) {
      const g = new PackGrid(this.w, this.h);
      g.nextUid = this.nextUid;
      let ok = true;
      for (const u of ord) {
        const s = g.findFree(u.id, pref);
        if (!s) { ok = false; break; }
        g.items.push({ uid: u.uid > 0 ? u.uid : g.nextUid++, id: u.id, x: s.x, y: s.y, rot: s.rot, n: u.n });
      }
      if (!ok) continue;
      const sc = g.largestFreeRect();
      if (sc > bestS) { bestS = sc; best = g.items; this.nextUid = Math.max(this.nextUid, g.nextUid); }
    }
    if (!best) return false;
    // keep uids unique (merged stacks may have produced duplicates of -1 -> new)
    const used = new Set<number>();
    for (const p of best) { if (used.has(p.uid)) p.uid = this.nextUid++; used.add(p.uid); }
    this.items.length = 0;
    this.items.push(...best);
    this.version++;
    return true;
  }

  /** area of the largest empty rectangle (how usable the free space is) */
  largestFreeRect(): number {
    const o = this.occ();
    let best = 0;
    for (let y0 = 0; y0 < this.h; y0++) for (let x0 = 0; x0 < this.w; x0++) {
      let maxW = this.w - x0;
      for (let y = y0; y < this.h; y++) {
        let w = 0;
        while (w < maxW && !o[y * this.w + x0 + w]) w++;
        maxW = w;
        if (!w) break;
        best = Math.max(best, w * (y - y0 + 1));
      }
    }
    return best;
  }

  clear(): void { this.items.length = 0; this.version++; }

  serialize(): PackSave {
    return { v: 1, w: this.w, h: this.h, items: this.items.map((p) => [p.id, p.x, p.y, p.rot, p.n]) };
  }

  /** restore a saved layout (entries that no longer fit are dropped; reconcile re-adds them by count) */
  deserialize(s: PackSave | null | undefined): void {
    this.items.length = 0;
    if (s && s.v === 1) for (const [id, x, y, rot, n] of s.items) {
      if (!ITEMS[id] || !footprint(id).pack || n <= 0) continue;
      if (this.canPlace(id, x, y, rot)) this.items.push({ uid: this.nextUid++, id, x, y, rot, n: Math.min(n, footprint(id).stack) });
    }
    this.version++;
  }
}

export interface ReconcileResult { added: [string, number][]; removed: [string, number][]; overflow: [string, number][] }

/**
 * Keeps a PackGrid in step with a count map (the game's inv.items). Owned units that are not in the grid are
 * "loose": items that never go in the pack (footprint.pack false: chainsaw, firewood bundle) and overflow.
 */
export class PackInventory {
  readonly grid: PackGrid;
  /** owned but not in the pack */
  readonly loose = new Map<string, number>();
  /** stack to take from first on the next decrease (the UI sets it before dropping / eating a specific stack) */
  preferUid: number | undefined;
  /** called when units of a packable item could not be placed (the UI tells the player and drops them) */
  onOverflow: ((id: string, n: number) => void) | null = null;

  constructor(w = 6, h = 6) { this.grid = new PackGrid(w, h); }

  owned(id: string): number { return this.grid.count(id) + (this.loose.get(id) ?? 0); }

  /** room for n more of an item (stacks + free cells), without changing anything */
  canFit(id: string, n = 1): boolean {
    const f = footprint(id);
    if (!f.pack) return true;
    const g = new PackGrid(this.grid.w, this.grid.h);
    for (const p of this.grid.items) g.items.push({ ...p });
    return g.add(id, n) === 0;
  }

  /** bring the grid in line with a count map. Call after anything may have changed the counts. */
  reconcile(target: Map<string, number>): ReconcileResult {
    const res: ReconcileResult = { added: [], removed: [], overflow: [] };
    const ids = new Set<string>([...target.keys(), ...this.grid.counts().keys(), ...this.loose.keys()]);
    for (const id of ids) {
      const want = Math.max(0, Math.floor(target.get(id) ?? 0));
      let have = this.owned(id);
      if (want < have) {
        let d = have - want;
        res.removed.push([id, d]);
        const l = this.loose.get(id) ?? 0;
        const fromLoose = Math.min(l, d);
        if (fromLoose) { this.setLoose(id, l - fromLoose); d -= fromLoose; }
        if (d > 0) this.grid.remove(id, d, this.preferUid);
        have = want;
      } else if (want > have) {
        const d = want - have;
        res.added.push([id, d]);
        const f = footprint(id);
        if (!f.pack) { this.setLoose(id, (this.loose.get(id) ?? 0) + d); continue; }
        const left = this.grid.add(id, d);
        if (left > 0) { this.setLoose(id, (this.loose.get(id) ?? 0) + left); res.overflow.push([id, left]); }
      }
    }
    // loose packables slide into the pack when room opens up
    for (const [id, n] of [...this.loose]) {
      if (!n || !footprint(id).pack) continue;
      const left = this.grid.add(id, n);
      this.setLoose(id, left);
    }
    this.preferUid = undefined;
    for (const [id, n] of res.overflow) this.onOverflow?.(id, n);
    return res;
  }

  private setLoose(id: string, n: number): void { if (n > 0) this.loose.set(id, n); else this.loose.delete(id); }

  /** packable units waiting outside the pack */
  overflowCount(): number { let n = 0; for (const [id, k] of this.loose) if (footprint(id).pack) n += k; return n; }

  serialize(): PackSave { return this.grid.serialize(); }

  /** restore a saved layout, then reconcile against the counts (so a stale layout can never invent items) */
  deserialize(s: PackSave | null | undefined, counts: Map<string, number>): void {
    this.grid.deserialize(s);
    // trim saved stacks to what is actually owned
    for (const [id, n] of this.grid.counts()) {
      const want = counts.get(id) ?? 0;
      if (n > want) this.grid.remove(id, n - want);
    }
    this.loose.clear();
    const keep = this.onOverflow;
    this.onOverflow = null;
    this.reconcile(counts);
    this.onOverflow = keep;
  }
}
