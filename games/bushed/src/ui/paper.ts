// Paper: every piece of written information in the game is a sheet painted on a canvas (handwritten notes,
// contracts on the noticeboard, the field journal's pages, receipts, store signs), shown as a real object.
// Pages are painted at a modest resolution and drawn with nearest filtering, so they read as crisp pixel art.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { canvasTex } from '../gfx/tex';

let fontsReady: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  const faces: [string, string][] = [
    ['Caveat', 'assets/fonts/Caveat.ttf'], ['SpecialElite', 'assets/fonts/SpecialElite.ttf'],
    ['IMFell', 'assets/fonts/IMFellEnglish.ttf'], ['HomemadeApple', 'assets/fonts/HomemadeApple.ttf'], ['PatrickHand', 'assets/fonts/PatrickHand.ttf'],
  ];
  fontsReady = Promise.all(faces.map(async ([n, u]) => {
    try { const f = new FontFace(n, `url(${u})`); await f.load(); (document as any).fonts.add(f); } catch { /* fall back to serif */ }
  })).then(() => undefined);
  return fontsReady;
}

export type PaperStyle = 'notebook' | 'notice' | 'receipt' | 'journal' | 'card' | 'kraft';

export interface Block {
  /** 'h' heading, 'p' paragraph, 'sig' signature, 'line' rule, 'sketch' callback drawing, 'gap' */
  t: 'h' | 'p' | 'sig' | 'line' | 'gap' | 'sketch' | 'small' | 'price';
  text?: string;
  draw?: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
  h?: number;
  /** handwriting or type */
  hand?: 'caveat' | 'apple' | 'patrick' | 'type' | 'fell';
  color?: string;
  struck?: boolean;
}

const INK = ['#1d2433', '#22283a', '#2a2b33'];

export function paintPaper(blocks: Block[], o: { style?: PaperStyle; w?: number; h?: number; seed?: number; title?: string } = {}): HTMLCanvasElement {
  const W = o.w ?? 384, H = o.h ?? 512;
  const r = new Rng(o.seed ?? 7);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const style = o.style ?? 'notebook';
  // paper base
  const base = style === 'kraft' ? [176, 140, 98] : style === 'receipt' ? [236, 232, 220] : style === 'journal' ? [222, 206, 170] : style === 'notice' ? [230, 220, 192] : [232, 226, 206];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, W, H);
  // fibres, mottling, foxing
  const img = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o4 = (y * W + x) * 4;
    const n = (Math.sin(x * 0.11 + y * 0.07) + Math.sin(x * 0.031 - y * 0.05) * 1.6) * 3 + (r.next() - 0.5) * 7;
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    const age = edge < 14 ? (14 - edge) * 1.6 : 0;
    img.data[o4] = Math.max(0, img.data[o4] + n - age); img.data[o4 + 1] = Math.max(0, img.data[o4 + 1] + n - age * 1.2); img.data[o4 + 2] = Math.max(0, img.data[o4 + 2] + n - age * 1.8);
  }
  g.putImageData(img, 0, 0);
  // stains
  for (let k = 0; k < r.int(0, 2); k++) {
    const x = r.range(40, W - 40), y = r.range(60, H - 40), rr = r.range(18, 40);
    g.strokeStyle = 'rgba(120,80,40,0.18)'; g.lineWidth = r.range(2, 5);
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(140,100,50,0.06)'; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  // folds
  g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, H / 2 + r.range(-6, 6)); g.lineTo(W, H / 2 + r.range(-6, 6)); g.stroke();
  // rules
  const left = style === 'notice' || style === 'card' ? 26 : 44;
  if (style === 'notebook' || style === 'journal') {
    g.strokeStyle = style === 'journal' ? 'rgba(120,100,70,0.25)' : 'rgba(80,110,160,0.35)';
    g.lineWidth = 1;
    for (let y = 70; y < H - 10; y += 22) { g.beginPath(); g.moveTo(8, y); g.lineTo(W - 8, y); g.stroke(); }
    if (style === 'notebook') { g.strokeStyle = 'rgba(190,60,60,0.45)'; g.beginPath(); g.moveTo(left - 8, 0); g.lineTo(left - 8, H); g.stroke(); }
  }
  if (style === 'notice') {
    // a thumbtack hole and torn top
    g.fillStyle = 'rgba(40,30,20,0.6)'; g.beginPath(); g.arc(W / 2, 14, 3, 0, 7); g.fill();
  }
  // text
  let y = style === 'notebook' || style === 'journal' ? 64 : 44;
  const fontOf = (b: Block) => {
    const hnd = b.hand ?? (style === 'receipt' ? 'type' : 'caveat');
    if (hnd === 'type') return b.t === 'h' ? 'bold 22px SpecialElite, monospace' : '15px SpecialElite, monospace';
    if (hnd === 'fell') return b.t === 'h' ? '26px IMFell, serif' : '17px IMFell, serif';
    if (hnd === 'apple') return b.t === 'h' ? '22px HomemadeApple, cursive' : '14px HomemadeApple, cursive';
    if (hnd === 'patrick') return b.t === 'h' ? '28px PatrickHand, cursive' : b.t === 'small' ? '17px PatrickHand, cursive' : '20px PatrickHand, cursive';
    return b.t === 'h' ? 'bold 30px Caveat, cursive' : b.t === 'small' ? '18px Caveat, cursive' : b.t === 'sig' ? '26px Caveat, cursive' : '22px Caveat, cursive';
  };
  const lh = (b: Block) => (b.t === 'h' ? 32 : b.hand === 'type' ? 19 : 22);
  for (const b of blocks) {
    if (b.t === 'gap') { y += b.h ?? 14; continue; }
    if (b.t === 'line') { g.strokeStyle = 'rgba(30,30,40,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(left, y - 8); g.lineTo(W - left, y - 6); g.stroke(); y += 10; continue; }
    if (b.t === 'sketch' && b.draw) { const h = b.h ?? 120; b.draw(g, left, y, W - left * 2, h); y += h + 8; continue; }
    g.font = fontOf(b);
    g.fillStyle = b.color ?? INK[r.int(0, INK.length - 1)];
    const words = (b.text ?? '').split(' ');
    let line = '';
    const maxW = W - left - 22;
    const flush = (ln: string) => {
      // hand jitter: every line slightly rotated and offset
      g.save();
      g.translate(left + (b.t === 'sig' ? maxW * 0.45 : 0) + r.range(-1.5, 1.5), y);
      g.rotate(r.range(-0.012, 0.012));
      if (b.t === 'price') { g.textAlign = 'right'; g.fillText(ln, maxW, 0); } else g.fillText(ln, 0, 0);
      if (b.struck) { const w = g.measureText(ln).width; g.strokeStyle = g.fillStyle as string; g.lineWidth = 2; g.beginPath(); g.moveTo(-2, -6); g.lineTo(w + 2, -8); g.stroke(); }
      g.restore();
      y += lh(b);
    };
    for (const w of words) {
      if (w === '\n') { flush(line); line = ''; continue; }
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { flush(line); line = w; } else line = t;
    }
    if (line) flush(line);
    if (b.t === 'h') y += 4;
  }
  // quantise lightly for the pixel look
  const q = g.getImageData(0, 0, W, H);
  for (let i = 0; i < q.data.length; i += 4) for (let k = 0; k < 3; k++) q.data[i + k] = Math.round(q.data[i + k] / 6) * 6;
  g.putImageData(q, 0, 0);
  return c;
}

/** a sheet of paper as a mesh (slight curl), front = canvas */
export function paperMesh(canvas: HTMLCanvasElement, widthM = 0.216): THREE.Mesh {
  const hM = (widthM * canvas.height) / canvas.width;
  const geo = new THREE.PlaneGeometry(widthM, hM, 8, 10);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -0.006 * Math.cos((x / widthM) * Math.PI) - 0.004 * (y / hM) * (y / hM));
  }
  geo.computeVertexNormals();
  const tex = canvasTex(canvas);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
