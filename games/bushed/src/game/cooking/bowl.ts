// The mixing bowl on the pantry table. Dry goods go in by the measuring cup (¼ cup at a time) or the measuring
// spoon (a teaspoon), eggs crack into it, milk and water pour in, butter and lard go in as pats, salt by the
// shaker, berries by the handful. Stir it (drag circles) and it comes together into whatever the proportions make:
//   dough    flour with a little liquid (about a third of a cup per cup of flour): bannock, dumplings, pastry
//            (pastry: a lot of fat and very little water)
//   batter   flour with about as much liquid as flour: flapjacks (with egg), pouding chomeur
// Tip the bowl over the board (dough), the skillet (flapjacks: one round per pour), or the pot (dumplings,
// pouding batter on the syrup).
import * as THREE from 'three';
import { liquidMat, type LiquidMat } from './food';

export type Mixture = 'empty' | 'dry' | 'crumbly' | 'dough' | 'pastry' | 'dumpling' | 'batter' | 'runny' | 'wet';

/** contents in kitchen units: cups for flour, sugar, oats, milk, water; tsp for baking powder; tbsp for fats and syrup; pinches of salt */
export class Bowl {
  readonly c = new Map<string, number>();
  /** stirred together 0..1 */
  mix = 0;
  readonly surface: THREE.Mesh;
  readonly mat: LiquidMat;
  private mound: THREE.Mesh;
  private moundMat: THREE.MeshStandardMaterial;
  calls = new Set<string>();
  constructor(readonly obj: THREE.Object3D, readonly inner: number, readonly depth: number) {
    this.mat = liquidMat('mix');
    const g = new THREE.CircleGeometry(1, 22);
    g.rotateX(-Math.PI / 2);
    this.surface = new THREE.Mesh(g, this.mat);
    this.surface.visible = false;
    obj.add(this.surface);
    // a heap of unmixed dry goods
    const mg = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.moundMat = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.95 });
    this.mound = new THREE.Mesh(mg, this.moundMat);
    this.mound.visible = false;
    obj.add(this.mound);
  }
  get(k: string): number { return this.c.get(k) ?? 0; }
  add(k: string, q: number): void { this.c.set(k, this.get(k) + q); if (['milk', 'water', 'egg', 'syrup'].includes(k)) this.mix *= 0.6; else this.mix *= 0.8; this.draw(); }
  get empty(): boolean { return this.c.size === 0; }
  get flour(): number { return this.get('flour') + this.get('oats') * 0.5; }
  /** liquid in cups (an egg is about ¼ cup) */
  get wet(): number { return this.get('milk') + this.get('water') + this.get('egg') * 0.22 + this.get('syrup') / 16 + this.get('butter_melt') / 16; }
  get fatTbsp(): number { return this.get('butter') + this.get('lard') + this.get('oil'); }
  get volume(): number { return this.flour + this.get('sugar') + this.wet + this.fatTbsp / 16 + this.get('berries') * 0.25; }

  /** what the proportions make (once stirred) */
  get kind(): Mixture {
    if (this.empty) return 'empty';
    const f = this.flour, w = this.wet;
    if (f < 0.2) return w > 0 ? 'wet' : 'dry';
    const r = w / f;
    if (this.mix < 0.6) return r < 0.12 ? 'dry' : 'crumbly';
    if (r < 0.18) return 'crumbly';
    if (r < 0.55) {
      if (this.fatTbsp >= f * 3 && r < 0.4) return 'pastry';
      if (this.get('sugar') > 0.05 && (this.get('milk') > 0 || this.get('butter') > 0)) return 'dumpling';
      return 'dough';
    }
    if (r <= 1.7) return 'batter';
    return 'runny';
  }

  /** baking powder per cup of flour, and how well that suits (1 = right) */
  get lift(): number { const f = Math.max(0.01, this.flour); const k = this.get('bp') / f; return k < 0.4 ? k / 0.4 * 0.6 : k <= 2.6 ? 1 : Math.max(0.3, 1 - (k - 2.6) * 0.35); }

  /** stir it (amount of motion) */
  stir(k: number): void { if (this.empty) return; this.mix = Math.min(1, this.mix + k / Math.max(0.6, this.volume * 0.8)); this.draw(); }

  /** take out q cups (a ladle of batter, the dough) */
  take(q: number): Map<string, number> {
    const v = Math.max(1e-3, this.volume), k = Math.min(1, q / v);
    const out = new Map<string, number>();
    for (const [key, val] of this.c) { out.set(key, val * k); const rest = val * (1 - k); if (rest < 1e-3) this.c.delete(key); else this.c.set(key, rest); }
    if (this.volume < 0.02) this.c.clear();
    this.draw();
    return out;
  }
  clear(): void { this.c.clear(); this.mix = 0; this.calls.clear(); this.draw(); }

  /** the look: a heap of dry goods until stirred, then a smooth surface the colour of the mix */
  draw(): void {
    const v = this.volume, kind = this.kind;
    const fill = Math.min(1, v / 4);
    const y = 0.008 + fill * this.depth * 0.85;
    const r = this.inner * (0.55 + 0.45 * Math.min(1, fill * 1.8));
    const dryShare = v > 0 ? (this.flour + this.get('sugar')) / v : 0;
    this.mound.visible = v > 0.05 && (this.mix < 0.5 || kind === 'dry' || kind === 'crumbly') && dryShare > 0.3;
    if (this.mound.visible) {
      const k = Math.min(1, (this.flour + this.get('sugar')) / 3);
      this.mound.scale.set(this.inner * (0.45 + 0.4 * k), 0.012 + 0.04 * k, this.inner * (0.45 + 0.4 * k));
      this.mound.position.y = 0.006;
      this.moundMat.color.setRGB(0.95, 0.93 - this.get('oats') * 0.05, 0.88 - this.get('oats') * 0.08);
    }
    this.surface.visible = v > 0.05 && (!this.mound.visible || this.wet > 0.05);
    if (this.surface.visible) {
      this.surface.position.y = y;
      this.surface.scale.set(r, 1, r);
      const c = this.mat.color;
      const egg = Math.min(1, this.get('egg') * 0.25), berry = Math.min(1, this.get('berries') * 0.15);
      if (kind === 'dough' || kind === 'pastry' || kind === 'dumpling' || kind === 'crumbly') c.setRGB(0.93, 0.86, 0.7);
      else if (kind === 'batter' || kind === 'runny') c.setRGB(0.96, 0.88 - egg * 0.04, 0.66 - egg * 0.12);
      else if (this.get('milk') > this.get('water')) c.setRGB(0.98, 0.97, 0.94);
      else c.setRGB(0.55, 0.62, 0.66);
      if (this.get('syrup') > 2) c.lerp(new THREE.Color(0.7, 0.42, 0.16), 0.3);
      if (berry > 0) c.lerp(new THREE.Color(0.32, 0.22, 0.44), berry * 0.5);
      this.mat.userData.uBumps.value = kind === 'dough' || kind === 'crumbly' || kind === 'pastry' || kind === 'dumpling' ? 1 : this.mix < 0.5 ? 0.6 : 0.1;
      this.mat.userData.uSpin.value += 0;
    }
  }
}
