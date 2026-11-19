// book.html: the Book of Cryptids test page. Modes:
//   (default)      the book in first person, held in the FP arms over a dusk clearing with a cryptid in view
//   ?sheet=sdf     the procedural plate portraits, raw and enlarged
//   ?sheet=pages   every page of the book laid out flat
// Playwright hooks: window.__book (the BookOfCryptids), window.__ready.
import { renderSdf } from '../ui/bookofcryptids/sdf';
import { SDF_SPECS } from '../ui/bookofcryptids/specs';
import { outline } from '../ui/bookofcryptids/pix';
import { loadFonts } from '../ui/paper';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[] };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));
if (q.has('shot')) document.body.classList.add('shot');

async function sheetSdf() {
  document.body.classList.add('sheet');
  const host = document.getElementById('sheet')!;
  const only = q.get('who');
  for (const [id, mk] of Object.entries(SDF_SPECS)) {
    if (only && only !== id) continue;
    const t0 = performance.now();
    const r = await renderSdf(mk(), 320, 232);
    outline(r.pix);
    const c = r.pix.toCanvas();
    c.style.width = `${c.width * Number(q.get('zoom') ?? 2)}px`;
    c.style.background = '#cdb68a';
    c.title = `${id} ${(performance.now() - t0).toFixed(0)} ms`;
    host.appendChild(c);
  }
  W.__ready = true;
}

async function main() {
  await loadFonts();
  const sheet = q.get('sheet');
  if (sheet === 'sdf') return sheetSdf();
}
main();
