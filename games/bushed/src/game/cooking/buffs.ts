// What a good meal does for you, for a few game hours: the effects ride on the survival model (no meters):
//   warm    stew, chili, soup, tea: warmth keeps creeping back up, the cold takes longer to get in
//   hearty  big breakfasts, bannock, pies: stamina comes back faster (swinging the axe, hauling)
//   alert   coffee: stamina back faster and the heavy breathing settles quicker
//   sweet   syrup and berries: a little of both, and a sugar glow
//   uncanny the cryptid recipes (cryptid_recipes.ts): no meter of its own; while it lasts the cryptids trust you
//           faster (src/creatures/cryptids/companions.ts reads has('uncanny'))
// Strength and length scale with how well it was cooked (the grade). Eating the same kind again refreshes it.
import type { Game } from '../game';
import { hud } from '../../ui/hud';
import type { BuffSpec } from './recipes';

interface Active { kind: 'warm' | 'hearty' | 'alert' | 'sweet' | 'uncanny'; k: number; left: number; from: string }

const WORDS: Record<Active['kind'], [string, string]> = {
  warm: ['Warm to the boots', 'The warmth from the meal wears off.'],
  hearty: ['Full of beans', 'The big meal has worn off.'],
  alert: ['Wide awake', 'The coffee buzz fades.'],
  sweet: ['Sugar glow', 'The sugar glow fades.'],
  uncanny: ['An uncanny calm', 'The uncanny calm wears off. The woods feel ordinary again.'],
};

export class Buffs {
  list: Active[] = [];
  constructor(private g: Game) {
    g.updaters.push((dt) => this.update(dt));
  }

  /** apply a dish's buff (mult from the grade) */
  apply(spec: BuffSpec | null, mult: number, from: string): string {
    if (!spec) return '';
    const said: string[] = [];
    for (const kind of ['warm', 'hearty', 'alert', 'sweet', 'uncanny'] as const) {
      const k = spec[kind];
      if (!k) continue;
      const secs = spec.hours * 3600 * (0.6 + 0.4 * mult);
      const cur = this.list.find((b) => b.kind === kind);
      if (cur) { cur.k = Math.max(cur.k, k * mult); cur.left = Math.max(cur.left, secs); cur.from = from; }
      else this.list.push({ kind, k: k * mult, left: secs, from });
      said.push(WORDS[kind][0]);
    }
    return said.join(', ');
  }

  has(kind: Active['kind']): number { return this.list.find((b) => b.kind === kind)?.k ?? 0; }

  private update(dt: number): void {
    if (!this.list.length) return;
    const g = this.g, s = g.survival;
    const dtGame = dt * (g.timeScale ?? 60);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.left -= dtGame;
      if (b.left <= 0) { this.list.splice(i, 1); hud.say(`<i>${WORDS[b.kind][1]}</i>`, 2.5); continue; }
      switch (b.kind) {
        case 'warm': s.warmth = Math.min(1, s.warmth + dt * 0.0016 * b.k * (s.warmth < 0.6 ? 1.6 : 1)); break;
        case 'hearty': s.stamina = Math.min(1, s.stamina + dt * 0.022 * b.k); break;
        case 'alert': s.stamina = Math.min(1, s.stamina + dt * 0.016 * b.k); s.winded = Math.max(0, s.winded - dt * 0.08 * b.k); break;
        case 'sweet': s.stamina = Math.min(1, s.stamina + dt * 0.01 * b.k); s.warmth = Math.min(1, s.warmth + dt * 0.0006 * b.k); break;
      }
    }
  }
}
