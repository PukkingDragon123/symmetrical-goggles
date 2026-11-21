// The inventory model: five slots on the belt (keys 1-5, the wheel), a wallet for money and papers, and the stash
// crate in the cabin. Pure data: no DOM, no three.js, so saves and tests can use it headless.
//
//   slots      five stacks; the selected one is what the hands hold. Stackables (food, ammo, kindling, splits)
//              stack up to stackMax(id); tools and big things (isTwoHand: bundles, coal sacks, the toolbox) take a
//              slot each. Logs and rounds carried in both hands also take a slot (the UI tracks that, not this).
//   wallet     papers that never take a slot: the hunting licence and tags, the SD card, unknown ids
//   stash      the crate at the cabin. Counts as owned while `reach` is on (the player is at the cabin), so the
//              kitchen, the stove and the woodbox can use what is in it.
//
// `items` is a Map<id, count> view the rest of the game reads and writes as before (get / set / entries / size):
// reads see slots + wallet (+ stash in reach), set() gives or takes the difference, so `inv.items.set('matches', 0)`
// still empties the matches. Units that do not fit go to onOverflow (the UI drops them in a sack or the stash).
import { ITEMS } from '../../game/items';

export const SLOTS = 5;
export interface Stack { id: string; n: number }
export interface InvSave { v: 2; slots: ([string, number] | null)[]; sel: number; stash: [string, number][]; wallet: [string, number][] }

/** max units in one slot (anything not listed: see stackMax) */
export const STACK: Record<string, number> = {
  ammo_762: 60, ammo_box_762: 5, matches: 5, firestarter: 6, batteries: 6,
  kindling: 12, firewood: 4, charcoal: 3, nails: 10, iron_hooks: 10,
  jerky: 10, cryptid_jerky: 10, beer: 6, berries: 12, chanterelle: 12, wild_onion: 12, nuts: 8, cookies: 4,
  fish: 3, venison: 4, moose_meat: 2, deer_liver: 4, bread: 4, beans: 6, eggs: 4, bacon: 4, syrup: 3, coffee: 4,
};
/** held in both hands (the arms carry them like a log) */
export const TWO_HAND = new Set(['bundle', 'sleeping_bag', 'coal', 'moose_hide', 'antlers_moose', 'toolbox', 'jerrycan', 'spare_tire']);
/** never take a slot */
const WALLET = new Set(['licence', 'tag_deer', 'tag_moose', 'sd_card']);

export function isWallet(id: string): boolean {
  const d = ITEMS[id];
  return !d || WALLET.has(id) || !!d.tags?.includes('paper');
}
export function isTwoHand(id: string): boolean {
  const d = ITEMS[id];
  return TWO_HAND.has(id) || !!d?.tags?.includes('two_hand') || (!!d && !d.tool && d.mass >= 8);
}
export function stackMax(id: string): number {
  const t = STACK[id];
  if (t) return t;
  const d = ITEMS[id];
  if (!d || d.tool || isTwoHand(id)) return 1;
  const edible = !!d.food || !!d.tags?.some((t) => t === 'ingredient' || t === 'meal' || t === 'meat');
  if (!edible) return 1;
  return d.mass < 0.2 ? 12 : d.mass < 0.6 ? 6 : d.mass < 1.2 ? 4 : d.mass < 3 ? 2 : 1;
}

export type SoundMat = 'metal' | 'tool' | 'glass' | 'tin' | 'paper' | 'food' | 'cloth' | 'wood';
export function soundMat(id: string): SoundMat {
  const d = ITEMS[id];
  if (!d) return 'cloth';
  if (d.tool || d.tags?.includes('weapon')) return 'tool';
  if (/beer|syrup|milk|oil|bottle/.test(id)) return 'glass';
  if (/beans|coffee|cookies|tomatoes|tin|can|pot|pan|lantern|first_aid/.test(id)) return 'tin';
  if (/kindling|firewood|bundle|handle|split/.test(id)) return 'wood';
  if (/file|knife|nails|hooks|dogs|wedge|steel|iron|batter|ammo|flashlight/.test(id)) return 'metal';
  if (d.food || d.tags?.includes('ingredient')) return 'food';
  if (/matches|paper|log$|card/.test(id)) return 'paper';
  return 'cloth';
}

/** the Map view the game reads (see the header). Mirrors the model after every change. */
class CountView extends Map<string, number> {
  inv: SlotInventory | null = null;
  override set(id: string, n: number): this {
    if (!this.inv) return super.set(id, n);
    this.inv.setCount(id, n);
    return this;
  }
  override delete(id: string): boolean {
    if (!this.inv) return super.delete(id);
    const had = this.inv.count(id) > 0;
    this.inv.setCount(id, 0);
    return had;
  }
  override clear(): void {
    if (!this.inv) { super.clear(); return; }
    this.inv.clearAll();
  }
  /** rebuild the mirrored entries (called by the model) */
  mirror(src: Iterable<[string, number]>): void {
    super.clear();
    for (const [k, v] of src) if (v > 0) super.set(k, (super.get(k) ?? 0) + v);
  }
}

export class SlotInventory {
  readonly slots: (Stack | null)[] = new Array(SLOTS).fill(null);
  readonly stash = new Map<string, number>();
  readonly wallet = new Map<string, number>();
  /** the selected slot (what the hands hold) */
  sel = 0;
  /** a slot taken by something carried in both hands (a log, a round, goods for the counter): nothing goes in it */
  reserved = -1;
  money: number;
  /** bumps on every change (the UI redraws when it moves) */
  version = 0;
  /** units that did not fit anywhere (given while every slot was full) */
  onOverflow: ((id: string, n: number) => void) | null = null;
  readonly items: Map<string, number>;
  private view = new CountView();
  private reach_ = false;

  constructor(start: [string, number][] = [], money = 0) {
    this.money = money;
    this.items = this.view;
    for (const [id, n] of start) this.put(id, n);
    this.view.inv = this;
    this.changed();
  }

  /** the stash counts as owned (the player is at the cabin) */
  get reach(): boolean { return this.reach_; }
  set reach(v: boolean) { if (v !== this.reach_) { this.reach_ = v; this.changed(); } }

  // ------------------------------------------------------------------------------------------------ counts
  /** units in the slots */
  carried(id: string): number { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.n; return n; }
  /** units owned: slots + wallet (+ stash in reach) */
  count(id: string): number { return this.carried(id) + (this.wallet.get(id) ?? 0) + (this.reach_ ? this.stash.get(id) ?? 0 : 0); }
  stashed(id: string): number { return this.stash.get(id) ?? 0; }
  firstFree(): number { for (let i = 0; i < SLOTS; i++) if (!this.slots[i] && i !== this.reserved) return i; return -1; }
  freeSlots(): number { let n = 0; for (let i = 0; i < SLOTS; i++) if (!this.slots[i] && i !== this.reserved) n++; return n; }
  /** the slot holding an id (the selected one first) or -1 */
  slotOf(id: string): number {
    if (this.slots[this.sel]?.id === id) return this.sel;
    return this.slots.findIndex((s) => s?.id === id);
  }
  /** how many more of an id the slots can take */
  room(id: string): number {
    if (isWallet(id)) return Infinity;
    const max = stackMax(id);
    let r = 0;
    this.slots.forEach((s, i) => { r += !s ? (i === this.reserved ? 0 : max) : s.id === id ? Math.max(0, max - s.n) : 0; });
    return r;
  }
  /** the slot n units of id would land in (prefer: the selected slot if it can take them), or -1 */
  landing(id: string, prefer = this.sel): number {
    const max = stackMax(id), p = this.slots[prefer];
    if (prefer >= 0 && prefer !== this.reserved && (!p || (p.id === id && p.n < max))) return prefer;
    const same = this.slots.findIndex((s) => s?.id === id && s.n < max);
    return same >= 0 ? same : this.firstFree();
  }

  // ------------------------------------------------------------------------------------------------ changes
  /** put n units into the slots (same stacks first, the preferred slot first). Returns how many did NOT fit. */
  put(id: string, n: number, prefer = -1): number {
    n = Math.floor(n);
    if (n <= 0) return 0;
    if (isWallet(id)) { this.wallet.set(id, (this.wallet.get(id) ?? 0) + n); this.changed(); return 0; }
    const max = stackMax(id);
    const order = [...Array(SLOTS).keys()];
    if (prefer >= 0) { order.splice(order.indexOf(prefer), 1); order.unshift(prefer); }
    for (const i of order) {
      const s = this.slots[i];
      if (n <= 0) break;
      if (!s || s.id !== id || s.n >= max) continue;
      const k = Math.min(n, max - s.n); s.n += k; n -= k;
    }
    for (const i of order) {
      if (n <= 0) break;
      if (this.slots[i] || i === this.reserved) continue;
      const k = Math.min(n, max); this.slots[i] = { id, n: k }; n -= k;
    }
    this.changed();
    return n;
  }

  /** give n units; what does not fit goes to onOverflow */
  give(id: string, n = 1, prefer = -1): void {
    const left = this.put(id, n, prefer);
    if (left > 0) this.onOverflow?.(id, left);
  }

  /**
   * take n units (all or nothing). held: the hands hold this id, so its slot goes first; otherwise the stash goes
   * first when in reach (the kitchen uses the cupboard before your pockets), then the other slots, the selected last.
   */
  take(id: string, n = 1, held = false): boolean {
    n = Math.floor(n);
    if (n <= 0) return true;
    if (this.count(id) < n) return false;
    const w = this.wallet.get(id) ?? 0;
    if (w > 0) { const k = Math.min(w, n); this.setMap(this.wallet, id, w - k); n -= k; }
    const fromStash = () => { if (!this.reach_ || n <= 0) return; const s = this.stash.get(id) ?? 0, k = Math.min(s, n); if (k) { this.setMap(this.stash, id, s - k); n -= k; } };
    const fromSlot = (i: number) => { const s = this.slots[i]; if (!s || s.id !== id || n <= 0) return; const k = Math.min(s.n, n); s.n -= k; n -= k; if (s.n <= 0) this.slots[i] = null; };
    if (held) fromSlot(this.sel);
    else fromStash();
    for (let i = SLOTS - 1; i >= 0; i--) if (i !== this.sel) fromSlot(i);
    fromSlot(this.sel);
    fromStash();
    this.changed();
    return n <= 0;
  }

  /** take up to n units out of one slot; returns the id and how many came out */
  takeFrom(slot: number, n = 1): Stack | null {
    const s = this.slots[slot];
    if (!s) return null;
    const k = Math.min(s.n, Math.max(1, Math.floor(n)));
    s.n -= k;
    if (s.n <= 0) this.slots[slot] = null;
    this.changed();
    return { id: s.id, n: k };
  }

  /** make the owned count of an id exactly n (the Map view's set) */
  setCount(id: string, n: number): void {
    const have = this.count(id);
    n = Math.max(0, Math.floor(n));
    if (n > have) this.give(id, n - have);
    else if (n < have) this.take(id, have - n);
  }

  clearAll(): void {
    this.slots.fill(null); this.wallet.clear(); if (this.reach_) this.stash.clear();
    this.changed();
  }

  stashPut(id: string, n: number): void { if (n > 0) { this.stash.set(id, (this.stash.get(id) ?? 0) + n); this.changed(); } }
  /** take up to n of an id out of the stash; returns how many came out */
  stashTake(id: string, n: number): number {
    const s = this.stash.get(id) ?? 0, k = Math.min(s, n);
    if (k > 0) { this.setMap(this.stash, id, s - k); this.changed(); }
    return k;
  }

  private setMap(m: Map<string, number>, id: string, n: number): void { if (n > 0) m.set(id, n); else m.delete(id); }

  /** call after changing slots by hand */
  changed(): void {
    this.version++;
    const v = this.view;
    const all: [string, number][] = [];
    for (const s of this.slots) if (s) all.push([s.id, s.n]);
    for (const e of this.wallet) all.push(e);
    if (this.reach_) for (const e of this.stash) all.push(e);
    v.mirror(all);
  }

  // ------------------------------------------------------------------------------------------------ saves
  serialize(): InvSave {
    return { v: 2, slots: this.slots.map((s) => (s ? [s.id, s.n] : null)), sel: this.sel, stash: [...this.stash], wallet: [...this.wallet] };
  }

  deserialize(d: InvSave): void {
    this.slots.fill(null); this.stash.clear(); this.wallet.clear();
    d.slots.forEach((s, i) => { if (s && i < SLOTS && ITEMS[s[0]] && s[1] > 0) this.slots[i] = { id: s[0], n: Math.min(s[1], stackMax(s[0])) }; });
    // a stack past its limit (or of a thing the catalogue does not know today): the extra waits in the stash
    d.slots.forEach((s) => { if (s && s[1] > 0) { const keep = ITEMS[s[0]] ? stackMax(s[0]) : 0; if (s[1] > keep) this.stash.set(s[0], (this.stash.get(s[0]) ?? 0) + s[1] - keep); } });
    for (const [id, n] of d.stash) if (n > 0) this.stash.set(id, (this.stash.get(id) ?? 0) + n);
    for (const [id, n] of d.wallet) if (n > 0) this.wallet.set(id, n);
    this.sel = Math.max(0, Math.min(SLOTS - 1, d.sel | 0));
    this.changed();
  }

  /**
   * An old save (a count per item, no slots): the most useful things go on the belt (the best axe, the rifle, the
   * flashlight, matches, then food), the papers into the wallet and everything else into the stash crate.
   */
  migrate(counts: Iterable<[string, number]>): void {
    this.slots.fill(null); this.stash.clear(); this.wallet.clear();
    const left = new Map<string, number>();
    for (const [id, n] of counts) if (n > 0) left.set(id, (left.get(id) ?? 0) + n);
    for (const [id, n] of [...left]) if (isWallet(id)) { this.wallet.set(id, n); left.delete(id); }
    const axes = ['axe_felling', 'axe_old', 'lachance_axe', 'axe_splitting', 'maul', 'hatchet'].filter((id) => left.has(id));
    const food = [...left.keys()].filter((id) => ITEMS[id]?.food && !ITEMS[id]?.food?.raw).sort((a, b) => (ITEMS[b]?.food?.kcal ?? 0) * (left.get(b) ?? 0) - (ITEMS[a]?.food?.kcal ?? 0) * (left.get(a) ?? 0));
    const want = [axes[0], 'rifle', 'flashlight', 'matches', 'ammo_762', food[0], 'kindling', food[1]].filter((id): id is string => !!id && left.has(id));
    for (const id of want) {
      if (this.firstFree() < 0) break;
      const n = left.get(id)!, k = Math.min(n, stackMax(id));
      this.slots[this.firstFree()] = { id, n: k };
      if (n - k > 0) left.set(id, n - k); else left.delete(id);
    }
    for (const [id, n] of left) this.stash.set(id, n);
    this.sel = 0;
    this.changed();
  }
}
