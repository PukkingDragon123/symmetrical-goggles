// DINGBAT: the sculpted head, in head-centre space (DB.hc; x left, h up, z forward). A bat-owl: a broad domed skull
// over a concave owl's dish of a face ringed by a raised ruff, the big eyes set deep in sockets under heavy brow
// ridges that slant down to the nose (a scowl), between and under them a short pug bat's muzzle with an upturned
// nose pad, flared nostrils and a split upper lip that rolls over the rim of the frog-wide gape; puffy cheeks. The
// bottom of the head is the flat palate (the gape's roof). Sampled as horizontal rings, dense across the face.

const G = (v: number, c: number, w: number) => Math.exp(-((v - c) * (v - c)) / (w * w));
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** h: half width, back depth, front depth, centre z */
const BASE: [number, number, number, number, number][] = [
  [0.049, 0.004, 0.004, 0.004, -0.006],
  [0.046, 0.024, 0.024, 0.022, -0.004],
  [0.041, 0.036, 0.034, 0.031, -0.002],
  [0.032, 0.045, 0.04, 0.037, 0.0],
  [0.018, 0.05, 0.043, 0.041, 0.0],
  [0.0, 0.051, 0.043, 0.042, 0.0],
  [-0.012, 0.05, 0.04, 0.042, 0.0],
  [-0.019, 0.048, 0.034, 0.04, 0.001],
  [-0.0216, 0.046, 0.03, 0.038, 0.002],
];
function base(h: number): [number, number, number, number] {
  for (let i = 0; i + 1 < BASE.length; i++) {
    const a = BASE[i], b = BASE[i + 1];
    if (h <= a[0] && h >= b[0]) { const t = (a[0] - h) / (a[0] - b[0]); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t), lerp(a[4], b[4], t)]; }
  }
  const e = h > BASE[0][0] ? BASE[0] : BASE[BASE.length - 1];
  return [e[1], e[2], e[3], e[4]];
}
export const DB_TOP = BASE[0][0], DB_BOT = BASE[BASE.length - 1][0];
/** the eye in head space (left), its radius */
export const DB_EYE = { x: 0.021, h: 0.008, r: 0.0135 };
/** the nose pad's centre (head space) */
export const DB_NOSE = { h: -0.0075, z: 0.0 };

/** a point of the head at height h, angle th from the back (0) round the +x side to the face's midline (pi): [x, z] */
export function dbHeadSurf(h: number, th: number): [number, number] {
  const [W, Db, Df, zc] = base(h);
  const s = Math.sin(th), c = -Math.cos(th);
  const q = 0.78;
  const X = W * s;
  let z = zc + (c > 0 ? Df * Math.pow(c, q) : Db * c);
  const fw = ss(0.15, 0.5, c);
  const ax = X;
  let dz = 0;
  if (fw > 0.001) {
    // the dish: a concave oval of a face, its rim raised into a ruff
    const dx = ax / 0.043, dy = (h - 0.004) / 0.03, rd = Math.hypot(dx, dy);
    dz -= 0.0065 * Math.pow(Math.max(0, 1 - rd * rd), 0.8);
    dz += 0.0042 * G(rd, 1.0, 0.13) * (dy < -0.6 ? 0.4 : 1);
    // the sockets: deep bowls round the eyes
    const ex = ax - DB_EYE.x, ey = h - DB_EYE.h, ed = Math.hypot(ex / 0.017, ey / (ey > 0 ? 0.0145 : 0.017));
    if (ed < 1.3) dz -= 0.0075 * Math.pow(Math.max(0, 1 - ed * ed / 1.69), 1.5);
    // the brows: heavy ridges slanting down from the outer top to the nose, overhanging the eyes (a scowl)
    const by = h - (0.0175 + (ax - 0.008) * 0.42);
    dz += 0.0068 * G(by, 0, 0.0034) * ss(0.002, 0.008, ax) * ss(0.044, 0.034, ax);
    dz += 0.0024 * G(by, -0.003, 0.0022) * ss(0.012, 0.02, ax) * ss(0.04, 0.03, ax); // the hood under the ridge
    // the muzzle: a short pug snout between and under the eyes, an upturned nose pad, a split upper lip
    const mw = h > -0.002 ? lerp(0.0065, 0.009, ss(0.012, -0.002, h)) : lerp(0.009, 0.0125, ss(-0.002, -0.017, h));
    const mp = (h > 0.012 ? 0 : h > -0.002 ? lerp(0, 0.0075, ss(0.012, -0.002, h)) : h > -0.0135 ? lerp(0.0075, 0.0105, ss(-0.002, -0.0095, h)) : lerp(0.0105, 0.006, ss(-0.0135, -0.0216, h)));
    dz += mp * Math.pow(Math.max(0, 1 - (ax / (mw * 1.5)) ** 2), 1.1);
    // the nose pad's flat front and its flared nostrils (open forward and up)
    dz += 0.0022 * G(h, DB_NOSE.h, 0.0035) * G(ax, 0.0055, 0.004);
    dz -= 0.0042 * G(h, DB_NOSE.h + 0.0005, 0.0018) * G(ax, 0.0042, 0.0018);
    // the split lip: a groove down the middle of the upper lip; the lip rolls over the gape's rim
    dz -= 0.0018 * G(ax, 0, 0.0013) * ss(-0.011, -0.016, h);
    dz += 0.0022 * G(h, -0.019, 0.0022) * ss(0.03, 0.018, ax);
    // puffy cheeks under the eyes, beside the muzzle
    dz += 0.004 * G(h, -0.01, 0.006) * G(ax, 0.026, 0.009);
    dz *= fw;
  }
  // the back of the skull: a little ridge down the middle, the domed crown
  const crest = 0.0016 * G(s, 0, 0.12) * ss(0.0, 0.03, h) * (c < 0 ? 1 : 0);
  z += dz - crest;
  return [Math.max(0, X * (1 + 0.04 * G(h, -0.008, 0.01) * G(c, 0.3, 0.3))), z];
}
export const DB_COLS: number[] = (() => {
  const back = [0, 0.45, 0.9, 1.25, 1.48];
  const xs = [0.048, 0.044, 0.04, 0.036, 0.032, 0.0285, 0.025, 0.0215, 0.0182, 0.015, 0.012, 0.0092, 0.0066, 0.0042, 0.002, 0];
  return [...back, ...xs.map((x) => Math.PI - Math.asin(Math.min(0.999, x / 0.0495)))];
})();
export const DB_ROWS: number[] = (() => {
  const out: number[] = [];
  for (let h = DB_BOT; h < DB_TOP - 0.002; ) { out.push(h); h += h < 0.026 ? (h < -0.012 ? 0.0016 : 0.0022) : h < 0.04 ? 0.003 : 0.0045; }
  out.push(DB_TOP);
  return out;
})();
