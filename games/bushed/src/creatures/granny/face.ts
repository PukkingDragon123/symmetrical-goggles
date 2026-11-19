// GRANNY TAMARACK: the sculpted head. An old woman's face carved as a relief over a cranium, in head-centre space
// (x left, h up, z forward; the head centre is GT.hg): a long skull, hollow temples, the brow's soft ridge with the skin
// under it sagging over heavy upper lids, deep sockets with bags and tear troughs under them, crow's feet, high
// cheekbones over sunken cheeks, a long thin nose with a slight hook, a bulbous drooping tip and carved nostrils, the
// nasolabial folds, a sunken toothless mouth with thin lips and a tight kind smile, marionette lines down to soft
// jowls, a pointed jutting chin. The head is sampled as horizontal rings (dense where the face is), columns at fixed
// angles round the head (dense across the face), so the mesh carries the features themselves: the painter only has
// to colour them.
import type { V3 } from '../anatomy';

const G = (v: number, c: number, w: number) => Math.exp(-((v - c) * (v - c)) / (w * w));
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** base cranium by height (head-centre metres): half width, back depth, front depth, centre z */
const BASE: [number, number, number, number, number][] = [
  [0.176, 0.006, 0.006, 0.006, -0.03],
  [0.17, 0.034, 0.04, 0.034, -0.026],
  [0.158, 0.056, 0.064, 0.056, -0.022],
  [0.135, 0.073, 0.086, 0.075, -0.016],
  [0.105, 0.082, 0.099, 0.09, -0.011],
  [0.075, 0.085, 0.103, 0.099, -0.007],
  [0.045, 0.083, 0.103, 0.103, -0.004],
  [0.02, 0.081, 0.1, 0.1, -0.002],
  [-0.01, 0.082, 0.095, 0.098, 0.0],
  [-0.035, 0.078, 0.087, 0.098, 0.004],
  [-0.06, 0.072, 0.074, 0.097, 0.008],
  [-0.085, 0.067, 0.06, 0.095, 0.012],
  [-0.105, 0.062, 0.048, 0.092, 0.016],
  [-0.125, 0.05, 0.04, 0.086, 0.02],
  [-0.14, 0.036, 0.034, 0.075, 0.024],
  [-0.152, 0.02, 0.026, 0.055, 0.028],
  [-0.159, 0.004, 0.01, 0.022, 0.03],
];
function base(h: number): [number, number, number, number] {
  for (let i = 0; i + 1 < BASE.length; i++) {
    const a = BASE[i], b = BASE[i + 1];
    if (h <= a[0] && h >= b[0]) { const t = (a[0] - h) / (a[0] - b[0]), s = t * t * (3 - 2 * t), k = lerp(t, s, 0.5); return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k), lerp(a[4], b[4], k)]; }
  }
  const e = h > BASE[0][0] ? BASE[0] : BASE[BASE.length - 1];
  return [e[1], e[2], e[3], e[4]];
}
export const HEAD_TOP = BASE[0][0], HEAD_BOT = BASE[BASE.length - 1][0];

/** the eye (left): centre in head space and the look axis; radius */
export const EYE = { x: 0.037, h: 0.011, r: 0.0162 };
/** the lip line (head space h) at |x| */
export const lipY = (x: number) => -0.0835 + 0.0026 * Math.min(1, (x / 0.027) ** 2);
/** the nasolabial fold: from the nose wing down past the mouth corner */
const NL = { a: [0.019, -0.042], b: [0.038, -0.104] };
/** the marionette line: from the mouth corner down toward the jaw */
const MR = { a: [0.029, -0.088], b: [0.043, -0.13] };
/** signed distance to a segment (positive on its lateral side, +x) and t along it */
function seg(X: number, h: number, s: { a: number[]; b: number[] }): [number, number] {
  const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy;
  const t = ((X - s.a[0]) * dx + (h - s.a[1]) * dy) / L2, tc = Math.max(0, Math.min(1, t));
  const px = s.a[0] + dx * tc, py = s.a[1] + dy * tc, L = Math.sqrt(L2);
  // the normal pointing lateral (+x side of the line)
  const nx = -dy / L, ny = dx / L, sgn = nx >= 0 ? 1 : -1;
  return [((X - px) * nx + (h - py) * ny) * sgn, t];
}
/** the nose's forward reach along its midline and its half width, by height */
function noseAt(h: number): [number, number] {
  let p = 0;
  if (h > 0.034) p = 0;
  else if (h > 0.02) p = lerp(0, 0.006, ss(0.034, 0.02, h));
  else if (h > -0.008) p = lerp(0.006, 0.027, (0.02 - h) / 0.028) + 0.0028 * G(h, -0.003, 0.006);
  else if (h > -0.034) p = lerp(0.027, 0.047, Math.sin(((-0.008 - h) / 0.026) * Math.PI * 0.5));
  else if (h > -0.046) p = lerp(0.047, 0.031, ss(-0.034, -0.046, h));
  else if (h > -0.053) p = lerp(0.031, 0.006, ss(-0.046, -0.053, h));
  else if (h > -0.06) p = lerp(0.006, 0, (-0.053 - h) / 0.007);
  const w = h > 0.02 ? 0.0075 : h > -0.012 ? lerp(0.0065, 0.0082, (0.02 - h) / 0.032) : h > -0.036 ? lerp(0.0082, 0.0125, (-0.012 - h) / 0.024) : 0.0125;
  return [p, w];
}

/** a point of the head at height h (head space) and angle th round it, from the back (0) to the middle of the face
 *  (pi): [x (>= 0), z] */
export function headSurf(h: number, th: number): [number, number] {
  const [W, Db, Df, zc] = base(h);
  const s = Math.sin(th), c = -Math.cos(th);
  // the face is flatter than the skull: a squarer front
  const faceK = ss(0.13, 0.04, h) * ss(-0.165, -0.12, h);
  const q = lerp(1, 0.72, faceK);
  let X = W * s, z = zc + (c > 0 ? Df * Math.pow(c, q) : Db * c);
  const fw = ss(0.12, 0.55, c); // on the face
  const side = G(c, 0.25, 0.3); // the sides of the head
  // ---- the planes of the side: hollow temples, the cheekbones out, the hollow cheeks under them, the jowls
  X -= 0.0075 * G(h, 0.048, 0.022) * side;
  X += 0.0055 * G(h, -0.008, 0.017) * G(c, 0.42, 0.25);
  X -= 0.0105 * G(h, -0.06, 0.022) * G(c, 0.36, 0.24);
  X += 0.0055 * G(h, -0.118, 0.014) * G(c, 0.45, 0.22);
  const x0 = X, ax = x0;
  let dz = 0;
  if (fw > 0.001) {
    // ---- the brow and the eyes
    const ex = ax - EYE.x, ey = h - EYE.h;
    // the sockets: a bowl, sharper under the brow, deepest at the inner corner
    const ed = Math.hypot(ex / (ex < 0 ? 0.021 : 0.026), ey / (ey > 0 ? 0.0165 : 0.021));
    if (ed < 1.25) dz -= 0.021 * Math.pow(Math.max(0, 1 - ed * ed / 1.5625), 1.6) * (1 + 0.25 * G(ex, -0.014, 0.006));
    // the brow: a soft ridge, its skin sagging into a heavy hood over the outer upper lid
    dz += 0.0065 * G(h, 0.035, 0.0085) * G(ax, 0.034, 0.03);
    dz += 0.0052 * G(h, 0.0245, 0.0042) * G(ax, 0.05, 0.012);
    // the glabella and its frown lines
    dz += 0.0022 * G(h, 0.03, 0.008) * G(ax, 0, 0.008);
    dz -= 0.0009 * G(h, 0.029, 0.006) * G(ax, 0.0055, 0.0018);
    // the nasion: the bridge sinks between the eyes
    dz -= 0.0045 * G(h, 0.021, 0.008) * G(ax, 0, 0.012);
    // bags under the eyes, the tear trough below them, crow's feet fanning from the outer corners
    dz += 0.0042 * G(h, -0.0085, 0.0042) * G(ax, 0.038, 0.012);
    dz -= 0.0028 * G(h, -0.0165, 0.0032) * G(ax, 0.033, 0.013);
    const cfx = ax - 0.057, cfy = h - 0.008;
    if (cfx > 0) { const a = Math.atan2(cfy, cfx), r = Math.hypot(cfx, cfy); dz -= 0.0008 * Math.pow(Math.abs(Math.cos(a * 4.5)), 6) * G(r, 0.009, 0.006); }
    // ---- the forehead: a gentle swell, three lines across it
    dz += 0.003 * G(h, 0.07, 0.025) * G(ax, 0.025, 0.03);
    for (const k of [0.058, 0.071, 0.086]) dz -= 0.0009 * G(h, k + 0.0025 * Math.cos(ax * 90), 0.0022) * G(ax, 0, 0.04);
    // ---- the nose: a narrow bridge with a slight hook, a bulbous drooping tip, the wings and the nostrils
    const [np, nw] = noseAt(h);
    if (np > 0) {
      const u = ax / nw;
      dz += np * (u < 1.6 ? Math.pow(Math.max(0, 1 - (u / 1.6) ** 2), 1.35) : 0) * (h > -0.012 ? 1 : 1 + 0.08 * G(u, 0, 0.5));
    }
    dz += 0.0145 * G(h, -0.0435, 0.0058) * G(ax, 0.0148, 0.0058); // the alae
    { const r = Math.hypot((ax - 0.0148) / 1.0, (h + 0.0435) / 1.08); if (ax > 0.012) dz -= 0.0034 * G(r, 0.0098, 0.0017); } // the alar crease
    dz -= 0.0095 * G(h, -0.0478, 0.0026) * G(ax, 0.0075, 0.0034); // the nostrils (seen from below and in front)
    // the philtrum: two soft ridges, a groove
    const ph = ss(-0.052, -0.058, h) * ss(lipY(0) + 0.002, lipY(0) + 0.008, h);
    dz += ph * (0.0013 * G(ax, 0.0062, 0.0022) - 0.0009 * G(ax, 0, 0.0025));
    // ---- the mouth: sunken over the gums, thin lips closed in a tight smile, dimples at the corners
    const ly = lipY(ax), dl = h - ly;
    dz -= 0.0075 * G(h, -0.084, 0.021) * G(ax, 0, 0.034);
    dz += 0.0042 * G(dl, 0.0032, 0.0024) * G(ax, 0, 0.022); // the upper lip
    dz += 0.0052 * G(dl, -0.0036, 0.0028) * G(ax, 0, 0.019); // the lower lip
    dz -= 0.0055 * G(dl, 0, 0.0012) * G(ax, 0, 0.029); // the line between them
    dz -= 0.003 * G(ax, 0.0285, 0.0038) * G(dl, 0, 0.0045); // the corners
    // ---- the folds: nasolabial (the cheek mass lies over it), marionette lines, the jowls
    { const [d, t] = seg(ax, h, NL), on = ss(-0.15, 0.05, t) * ss(1.2, 0.85, t); dz += on * (0.0058 * ss(0, 0.01, d) * G(d, 0.011, 0.012) - 0.0042 * G(d, 0, 0.0021)); }
    { const [d, t] = seg(ax, h, MR), on = ss(-0.1, 0.1, t) * ss(1.15, 0.8, t); dz += on * (0.0035 * ss(0, 0.008, d) * G(d, 0.01, 0.01) - 0.0026 * G(d, 0, 0.0019)); }
    // the apples of the cheeks lifted by the smile, the cheekbones
    dz += 0.0048 * G(h, -0.022, 0.012) * G(ax, 0.045, 0.012);
    dz += 0.004 * G(h, -0.008, 0.012) * G(ax, 0.06, 0.01);
    dz -= 0.0065 * G(h, -0.062, 0.02) * G(ax, 0.054, 0.015);
    // ---- the chin: pointed and jutting, the crease over it, the jaw line
    dz += 0.0155 * G(h, -0.127, 0.0135) * G(ax, 0, 0.0175);
    dz -= 0.0045 * G(h, -0.1015, 0.0038) * G(ax, 0, 0.019);
    dz += 0.004 * G(h, -0.112, 0.01) * G(ax, 0.045, 0.012); // the jowls hang
    dz *= fw;
  }
  z += dz;
  return [Math.max(0, X), z];
}

/** columns round the half head: angles from the back (0) to the face's midline (pi), dense across the face */
export const HEAD_COLS: number[] = (() => {
  const back = [0, 0.4, 0.8, 1.15, 1.42];
  // across the face: by x on a nominal half width, finest at the midline (the nose) and through the eyes
  const xs = [0.083, 0.078, 0.072, 0.066, 0.06, 0.054, 0.0485, 0.043, 0.0378, 0.033, 0.0285, 0.0244, 0.0207, 0.0172, 0.014, 0.011, 0.0082, 0.0055, 0.0028, 0];
  const front = xs.map((x) => Math.PI - Math.asin(Math.min(0.999, x / 0.0845)));
  return [...back, ...front];
})();
/** rings up the head: fine through the face (finest at the lips, the nose's underside, the eyes), coarse over the crown */
export const HEAD_ROWS: number[] = (() => {
  const out: number[] = [];
  const sp = (h: number) => {
    const s0 = h < 0.04 ? 0.0044 : h < 0.1 ? 0.0062 : 0.013;
    let k = 1;
    k = Math.min(k, 1 - 0.5 * G(h, lipY(0), 0.009));
    k = Math.min(k, 1 - 0.42 * G(h, -0.047, 0.007));
    k = Math.min(k, 1 - 0.3 * G(h, EYE.h, 0.018));
    k = Math.min(k, 1 - 0.25 * G(h, -0.127, 0.016));
    return s0 * k;
  };
  for (let h = HEAD_BOT; h < HEAD_TOP - 0.006; h += sp(h)) out.push(h);
  out.push(HEAD_TOP);
  return out;
})();

/** the eye's centre (head space, left) and look axis, from the sculpted socket */
export function eyeLocal(): { c: V3; ax: V3; r: number } {
  // the socket floor in front of the eye, at the eye's height: find the column through the eye's x
  let best = Math.PI, bd = 1;
  for (let k = 0; k <= 600; k++) { const th = Math.PI * (0.55 + 0.45 * k / 600), [x] = headSurf(EYE.h, th), d = Math.abs(x - EYE.x); if (d < bd) { bd = d; best = th; } }
  const [, z] = headSurf(EYE.h, best);
  const ax: V3 = [0.17, -0.06, 1], l = Math.hypot(ax[0], ax[1], ax[2]);
  return { c: [EYE.x, EYE.h, z + EYE.r * 0.12], ax: [ax[0] / l, ax[1] / l, ax[2] / l], r: EYE.r };
}
