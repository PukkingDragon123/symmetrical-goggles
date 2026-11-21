// Light budget: three.js bakes the NUMBER of lights of each kind (point, spot, with and without shadows) into every
// lit shader. A place, creature or story prop that brings its own lamp after the first frame would make every
// material in the world recompile (seconds of freeze on Windows/ANGLE). So the boot precompiles the world with the
// final light counts already present: invisible, zero-intensity placeholder lights fill in for the lamps that are
// still on their way, and each frame (while things stream in) as many placeholders are switched off as real lights
// have appeared. The counts are learned: the most a session ever needed is kept in localStorage.
import * as THREE from 'three';

type Kind = 'P' | 'Ps' | 'S' | 'Ss';
const KINDS: Kind[] = ['P', 'Ps', 'S', 'Ss'];
const KEY = 'bushed.lightBudget.v1.';
/** measured on a full boot with lamp shadows on (cabin, store, forge, stories, NPCs, creatures and the porch menu's
 *  campfire, which stays lit), used until a session learns better. Presets without lamp shadows fold the shadowed
 *  kinds into the plain ones. Never guess high: every extra light, a shadowed one above all, costs every lit pixel;
 *  when a new lamp ships, the first session that meets it learns it (one recompile) and keeps it from then on. */
const DEFAULT: Record<Kind, number> = { P: 14, Ps: 7, S: 4, Ss: 2 };

function kindOf(o: THREE.Object3D): Kind | null {
  const l = o as THREE.Light;
  if ((l as THREE.PointLight).isPointLight) return l.castShadow ? 'Ps' : 'P';
  if ((l as THREE.SpotLight).isSpotLight) return l.castShadow ? 'Ss' : 'S';
  return null;
}

export class LightBudget {
  readonly target: Record<Kind, number> = { ...DEFAULT };
  private readonly group = new THREE.Group();
  private readonly pool: Record<Kind, THREE.Light[]> = { P: [], Ps: [], S: [], Ss: [] };
  private readonly real: Record<Kind, number> = { P: 0, Ps: 0, S: 0, Ss: 0 };
  private seen = new WeakSet<THREE.Object3D>();
  /** a real light the budget has not seen before turned up (the caller re-applies quality shadow rules) */
  onNewLight: (() => void) | null = null;
  grew = 0;

  private readonly key: string;
  /** quality: the preset's name (counts are kept per preset); lampShadows: whether lamps cast shadows in it */
  constructor(private readonly scene: THREE.Scene, quality = 'high', lampShadows = true) {
    this.key = KEY + quality;
    if (!lampShadows) { this.target.P += this.target.Ps; this.target.S += this.target.Ss; this.target.Ps = 0; this.target.Ss = 0; }
    try {
      const s = JSON.parse(localStorage.getItem(this.key) ?? 'null') as Partial<Record<Kind, number>> | null;
      if (s) for (const k of KINDS) if (typeof s[k] === 'number') this.target[k] = Math.max(0, Math.min(64, s[k]!));
    } catch { /* private mode */ }
    this.group.name = 'boot:light-placeholders';
    this.group.position.set(0, -2000, 0);
    scene.add(this.group);
  }

  private make(k: Kind): THREE.Light {
    const l: THREE.PointLight | THREE.SpotLight = k[0] === 'P' ? new THREE.PointLight(0x000000, 0, 0.01) : new THREE.SpotLight(0x000000, 0, 0.01);
    if ((l as THREE.SpotLight).isSpotLight) { (l as THREE.SpotLight).target = this.group; }
    l.name = 'boot:placeholder';
    l.userData.placeholder = true;
    l.userData.wantsShadow = k.endsWith('s');
    l.castShadow = k.endsWith('s');
    l.shadow.mapSize.set(16, 16);
    l.shadow.autoUpdate = false; l.shadow.needsUpdate = false;
    l.visible = false;
    this.group.add(l);
    return l;
  }

  /** count the real lights a render would see (visible path, camera layer 0) */
  private count(): boolean {
    let fresh = false;
    for (const k of KINDS) this.real[k] = 0;
    const g = this.group;
    const walk = (o: THREE.Object3D): void => {
      if (!o.visible || o === g) return;
      const k = kindOf(o);
      if (k && o.layers.test(this.scene.layers)) {
        this.real[k]++;
        if (!this.seen.has(o)) { this.seen.add(o); if (o.userData.wantsShadow === undefined) fresh = true; }
      }
      const ch = o.children;
      for (let i = 0; i < ch.length; i++) walk(ch[i]);
    };
    walk(this.scene);
    return fresh;
  }

  /** switch placeholders on or off so each kind's total stays at its target; returns true when a target grew */
  balance(): boolean {
    if (this.count() && this.onNewLight) { this.onNewLight(); this.count(); }
    let grew = false;
    for (const k of KINDS) {
      if (this.real[k] > this.target[k]) { this.target[k] = this.real[k]; grew = true; }
      const need = this.target[k] - this.real[k];
      const pool = this.pool[k];
      while (pool.length < need) pool.push(this.make(k));
      for (let i = 0; i < pool.length; i++) { const on = i < need; if (pool[i].visible !== on) pool[i].visible = on; }
    }
    if (grew) { this.grew++; this.save(); }
    return grew;
  }

  /** remember the counts this session needed (called once everything has loaded) */
  save(): void {
    try { localStorage.setItem(this.key, JSON.stringify(this.target)); } catch { /* private mode */ }
  }

  stats(): string { return KINDS.map((k) => `${k} ${this.real[k]}/${this.target[k]}`).join(', '); }
}
