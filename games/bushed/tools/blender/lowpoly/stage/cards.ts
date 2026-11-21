// The five cryptid recipe cards (src/game/cooking/cryptid_recipes.ts) painted as the recipe box shows them: each
// front (two with a few steps ticked, as if pinned at the stove), and one locked back with its hint.
import { paintCard } from '../../../../src/game/cooking/cards';
import { CRYPTID_RECIPES } from '../../../../src/game/cooking/cryptid_recipes';
import { loadFonts } from '../../../../src/ui/paper';

const root = document.getElementById('c')!;
async function go() {
  try { await loadFonts(); await document.fonts.ready; } catch { /* */ }
  CRYPTID_RECIPES.forEach((r, i) => {
    const cv = paintCard(r, { unlocked: true, best: i % 2 ? 'good' : 'perfect', ticks: r.steps.map((_, k) => i < 2 && k < 3), pinned: i === 0, fresh: false, from: r.from });
    root.appendChild(cv);
  });
  root.appendChild(paintCard(CRYPTID_RECIPES[4], { unlocked: false, best: null, ticks: [], pinned: false, fresh: false, from: null }));
  (window as unknown as { __cards: boolean }).__cards = true;
}
go();
