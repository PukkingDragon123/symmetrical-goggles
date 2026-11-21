// Recipe cards: ruled index cards in a tin recipe box on the counter, painted on a canvas (handwriting, a red top
// rule, blue lines, gravy stains). Each shows the ingredients, the numbered steps with a tick box (ticked live
// while you cook the pinned card), who gave it, the best grade you've made it at and what it does for you. A
// locked card is the back of the card with a hint. The viewer holds the card up in front of the eye; a small copy
// of the pinned card rides in the corner of the view while you work.
import * as THREE from 'three';
import { canvasTex } from '../../gfx/tex';
import { Mesher, V, lathe, boxAt, box } from '../../places/kit';
import { ensureCookMats } from './cookware';
import { RECIPES, GRADE_STARS, type Recipe, type Grade } from './recipes';

const CW = 480, CH = 300;

function hash(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

export interface CardState { unlocked: boolean; best: Grade | null; ticks: boolean[]; pinned: boolean; fresh: boolean; /** who gave the card (null: nobody yet) */ from: string | null }

/** paint a recipe card (front) or its back (locked) */
export function paintCard(r: Recipe, st: CardState, c?: HTMLCanvasElement): HTMLCanvasElement {
  const cv = c ?? document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d')!;
  const seed = r.id.length * 13 + r.id.charCodeAt(0);
  // card stock, a little yellowed, darker at the edges
  g.fillStyle = st.unlocked ? '#efe6cf' : '#e6dcc2';
  g.fillRect(0, 0, CW, CH);
  const img = g.getImageData(0, 0, CW, CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const o = (y * CW + x) * 4;
    const e = Math.min(x, y, CW - 1 - x, CH - 1 - y);
    const age = e < 10 ? (10 - e) * 2.2 : 0;
    const n = (hash(x * 0.37 + y * 1.71 + seed) - 0.5) * 8 + Math.sin(x * 0.05 + seed) * 2;
    img.data[o] = Math.max(0, img.data[o] + n - age); img.data[o + 1] = Math.max(0, img.data[o + 1] + n - age * 1.2); img.data[o + 2] = Math.max(0, img.data[o + 2] + n - age * 1.8);
  }
  g.putImageData(img, 0, 0);
  // a grease or coffee ring
  if (hash(seed) > 0.35) {
    g.strokeStyle = 'rgba(130,90,40,0.16)'; g.lineWidth = 3;
    g.beginPath(); g.arc(60 + hash(seed + 1) * 360, 80 + hash(seed + 2) * 160, 22 + hash(seed + 3) * 16, 0, Math.PI * 2); g.stroke();
  }
  const ink = '#1e2638', red = '#a8382c', blue = 'rgba(70,110,170,0.35)';
  if (!st.unlocked) {
    g.strokeStyle = blue; g.lineWidth = 1;
    for (let y = 60; y < CH - 10; y += 22) { g.beginPath(); g.moveTo(10, y); g.lineTo(CW - 10, y); g.stroke(); }
    g.fillStyle = ink; g.font = '30px Alagard, serif'; g.textAlign = 'center';
    g.fillText('?', CW / 2, 130);
    g.font = '20px PatrickHand, Caveat, cursive';
    g.fillText('A blank card in the box...', CW / 2, 175);
    g.font = '17px PatrickHand, Caveat, cursive';
    g.fillStyle = '#4a3a2a';
    if (r.hint) {
      // a cryptid card: where to look for it
      const ls = wrap(g, r.hint, CW - 80);
      ls.forEach((ln, i) => g.fillText(ln, CW / 2, 205 + i * 22));
    } else {
      g.fillText(st.from ? `${st.from} knows this one.` : 'Somebody around here knows this one.', CW / 2, 205);
      g.fillText('Or work it out yourself at the stove.', CW / 2, 230);
    }
    g.textAlign = 'left';
    quant(g);
    return cv;
  }
  // the red top rule and blue lines
  g.strokeStyle = 'rgba(180,50,40,0.7)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(8, 48); g.lineTo(CW - 8, 48); g.stroke();
  g.strokeStyle = blue; g.lineWidth = 1;
  for (let y = 70; y < CH - 6; y += 19) { g.beginPath(); g.moveTo(8, y); g.lineTo(CW - 8, y); g.stroke(); }
  // title, who gave it, stars
  g.fillStyle = ink; g.font = '26px Alagard, serif';
  g.fillText(r.name, 16, 36);
  g.font = '15px PatrickHand, Caveat, cursive'; g.fillStyle = '#5a4a3a';
  const giver = st.from ?? r.from;
  const fromTxt = /^(Ray's card|a card|what you)/.test(giver) ? giver : `from ${giver}`;
  const fromW = g.measureText(fromTxt).width;
  g.fillText(fromTxt, CW - 16 - fromW, 18);
  const stars = st.best ? GRADE_STARS[st.best] : -1;
  for (let i = 0; i < 3; i++) star(g, CW - 70 + i * 20, 36, 7, i < stars ? '#c88a1c' : 'rgba(80,70,60,0.3)');
  if (st.pinned) { g.fillStyle = red; g.font = '13px Alagard, serif'; g.fillText('PINNED', CW - 150, 40); }
  // ingredients (left), steps (right)
  g.font = '15px PatrickHand, Caveat, cursive'; g.fillStyle = ink;
  let y = 66;
  for (const line of r.ingredients) {
    for (const ln of wrap(g, line, 150)) { g.fillText(ln, 14, y); y += 19; }
  }
  g.strokeStyle = 'rgba(180,50,40,0.35)'; g.beginPath(); g.moveTo(172, 52); g.lineTo(172, CH - 30); g.stroke();
  y = 66;
  r.steps.forEach((s, i) => {
    const tick = st.ticks[i];
    g.strokeStyle = ink; g.lineWidth = 1.2; g.strokeRect(180, y - 11, 11, 11);
    if (tick) { g.strokeStyle = red; g.lineWidth = 2.4; g.beginPath(); g.moveTo(181, y - 5); g.lineTo(185, y); g.lineTo(194, y - 14); g.stroke(); }
    g.fillStyle = tick ? '#5a6070' : ink;
    const lines = wrap(g, `${i + 1}. ${s.t}`, CW - 214);
    for (const ln of lines) { g.fillText(ln, 198, y); y += 19; }
  });
  // what it does for you
  g.font = '14px PatrickHand, Caveat, cursive'; g.fillStyle = '#6a3a28';
  const b = r.buff;
  const bits = [b.warm ? 'keeps the cold out' : '', b.hearty ? 'puts back your strength' : '', b.alert ? 'wakes you up' : '', b.sweet ? 'a sugar glow' : '', b.uncanny ? 'an uncanny calm' : ''].filter(Boolean);
  g.fillText(`${bits.join(', ')} (${b.hours} h)`, 14, CH - 12);
  if (r.loved) {
    // the cryptid cards: who goes mad for it, in red pencil up the margin
    g.save(); g.font = '15px PatrickHand, Caveat, cursive'; g.fillStyle = red;
    g.fillText(`Loved by: ${r.loved}`, 14, CH - 33);
    g.restore();
  }
  quant(g);
  return cv;
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.fill();
}
function wrap(g: CanvasRenderingContext2D, s: string, w: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function quant(g: CanvasRenderingContext2D): void {
  const q = g.getImageData(0, 0, CW, CH);
  for (let i = 0; i < q.data.length; i += 4) for (let k = 0; k < 3; k++) q.data[i + k] = Math.round(q.data[i + k] / 6) * 6;
  g.putImageData(q, 0, 0);
}

// ---------------------------------------------------------------------------------------------- a card as a mesh
export class CardMesh {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.Texture;
  readonly mesh: THREE.Mesh;
  key = '';
  constructor(w: number) {
    this.canvas.width = CW; this.canvas.height = CH;
    this.tex = canvasTex(this.canvas, { nearest: false });
    const h = w * CH / CW;
    const geo = new THREE.PlaneGeometry(w, h, 6, 4);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, -0.004 * Math.cos((p.getX(i) / w) * Math.PI));
    geo.computeVertexNormals();
    // drawn last, over steam and smoke (transparent queue, highest order), never fogged
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, fog: false }));
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
  }
  show(r: Recipe, st: CardState): void {
    const key = `${r.id}|${st.unlocked}|${st.best}|${st.ticks.join('')}|${st.pinned}|${st.from}`;
    if (key === this.key) return;
    this.key = key;
    paintCard(r, st, this.canvas);
    this.tex.needsUpdate = true;
  }
}

/** the recipe box: a tin box with the cards standing in it (frame: bottom centre, front +Z) */
export function buildRecipeBox(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  // a dented tin box, lid hinged open at the back
  ms.pushT(0, 0.035, 0);
  box(ms, 'enamel_blue', 0.135, 0.07, 0.09, { uv: [0.1, 0.2] });
  ms.pop();
  ms.pushT(0, 0.07, -0.05, 0, -1.9);
  boxAt(ms, 'enamel_blue', 0, 0.045, 0, 0.137, 0.09, 0.006);
  ms.pop();
  // the cards standing up, a few tabs
  for (let i = 0; i < 9; i++) boxAt(ms, i % 3 ? 'paper' : 'ticking', 0, 0.07 + (i % 2) * 0.004, -0.035 + i * 0.008, 0.124, 0.05, 0.0015, 0, {}, -0.12);
  lathe(ms, 'galv', [[0, 0], [0.006, 0], [0.006, 0.004], [0, 0.004]], 6);
  void V;
  return ms.build({ name: 'recipe_box' });
}

export const CARD_W = CW, CARD_H = CH;
export { RECIPES };
