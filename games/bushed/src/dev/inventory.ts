// inventory.html: every item's pixel-art icon (the hotbar and the stash draw these), at ?scale=3 by default.
// The hotbar itself lives in the game (src/ui/inventory/hotbar.ts): try it at /?play (1-5, wheel, Q, E).
import { ITEMS } from '../game/items';
import { loadFonts } from '../ui/paper';
import { itemIcon, allIconsReady } from '../ui/inventory/icons';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[] };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));

async function main(): Promise<void> {
  await loadFonts();
  const sheet = document.getElementById('sheet')!;
  sheet.style.display = 'block';
  const scale = Number(q.get('scale') ?? 3);
  for (const id of Object.keys(ITEMS)) {
    const d = document.createElement('div');
    d.className = 'cell';
    const c = itemIcon(id);
    c.style.width = c.style.height = `${48 * scale}px`;
    d.append(c, document.createTextNode(id));
    sheet.appendChild(d);
  }
  await allIconsReady();
  W.__ready = true;
}

main().catch((e) => { W.__errors!.push(String(e?.stack ?? e)); W.__ready = true; });
