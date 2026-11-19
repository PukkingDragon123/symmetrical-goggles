// Plate portraits painted from signed-distance shapes (sdf.ts) for the cryptids without a 3D model. Each is
// posed for its plate: creature space is metres, facing +Z, ground at y = 0, and the camera sits at a 3/4 view.
// A creature module that ships a real model can replace one of these with registerPortraitModel() (portrait.ts).
import { ramp, hex, type RGB, type Pix } from './pix';
import { PAT, both, chain, cone, ell, type Mat, type Prim, type SdfSpec, type V3 } from './sdf';
import { hash2 } from '../../core/rng';

const EYE_GLOW = ramp('#3a0a04', '#7a1a08', '#c04010', '#f08a20', '#ffd060', '#fff4c0');
const BONE = ramp('#241e1a', '#4a4036', '#756a56', '#a3967a', '#cbbf9e', '#ebe2c4');
const MOUTH = ramp('#12040a', '#2c0a10', '#521418', '#7c2622', '#a03c2c');
const CLAW = ramp('#0e0a0a', '#221c1a', '#3e3530', '#5e5246', '#7e7060');

function droplet(p: Pix, x: number, y: number, len: number, cols: RGB[]): void {
  // a falling tear / drip: a dark rim, light core, a highlight pixel
  for (let i = 0; i < len; i++) { p.set(x, y + i, cols[1]); if (i > len * 0.5) { p.set(x - 1, y + i, cols[0]); p.set(x + 1, y + i, cols[0]); } }
  p.set(x, y + len, cols[0]); p.set(x, y + len - 1, cols[2]); p.set(x, y + Math.floor(len * 0.6), cols[3]);
}
function puff(p: Pix, cx: number, cy: number, r: number, cols: RGB[], seed: number): void {
  // a steam puff: three overlapping lumps, lit from the upper left, dithered rim
  const lumps: [number, number, number][] = [[0, 0, r], [-r * 0.7, r * 0.3, r * 0.7], [r * 0.7, r * 0.25, r * 0.75], [0.1 * r, -r * 0.55, r * 0.6]];
  for (let y = Math.floor(cy - r * 2); y <= cy + r * 2; y++) for (let x = Math.floor(cx - r * 2); x <= cx + r * 2; x++) {
    let best = -1, lx = 0, ly = 0;
    for (const [ox, oy, rr] of lumps) { const dx = (x - cx - ox) / rr, dy = (y - cy - oy) / rr, d = 1 - (dx * dx + dy * dy); if (d > best) { best = d; lx = dx; ly = dy; } }
    if (best < 0) continue;
    const lit = -lx * 0.5 - ly * 0.7;
    const edge = best < 0.25;
    if (edge && hash2(x, y, seed) < 0.45) continue;
    const k = edge ? 1 : lit > 0.35 ? 3 : lit > -0.1 ? 2 : 1;
    p.set(x, y, cols[k]);
  }
}

// ------------------------------------------------------------------------------------------------ Hodag
function hodag(): SdfSpec {
  const HIDE = ramp('#121216', '#1c221e', '#283222', '#384628', '#4f5c30', '#6b733a', '#8c884a', '#ada060');
  const BELLY = ramp('#22180e', '#3e2c1a', '#5c4224', '#7c5c30', '#9c7a40', '#bc9a58');
  const mats: Mat[] = [
    { ramp: HIDE, pat: PAT.sum(PAT.scales(26, 0.9), PAT.mottle(6, 0.6)) },
    { ramp: BELLY, pat: PAT.bands(1, 60, 0.6) },
    { ramp: BONE, pat: PAT.bands(1, 90, 0.5), gloss: 0.6 },
    { ramp: EYE_GLOW, glow: true },
    { ramp: MOUTH },
    { ramp: CLAW, gloss: 0.4 },
  ];
  const P: Prim[] = [];
  // body: a deep barrel with a hump over the shoulders, belly slung low
  P.push(ell([0, 0.62, -0.05], [0.46, 0.4, 0.78], 0));
  P.push(ell([0, 0.78, 0.38], [0.44, 0.38, 0.42], 0, 0.18));
  P.push(ell([0, 0.42, 0.05], [0.36, 0.22, 0.6], 1, 0.12));
  // legs: short, thick, bowed, with splayed clawed feet
  for (const [x, z, f] of [[0.34, 0.5, 1], [0.36, -0.42, 0]] as const) {
    P.push(...both([cone([x, 0.55, z], [x + 0.06, 0.28, z + 0.04 * f], 0.17, 0.13, 0, 0.1), cone([x + 0.06, 0.28, z + 0.04 * f], [x + 0.04, 0.07, z + 0.08], 0.13, 0.1, 0, 0.06)]));
    P.push(...both([ell([x + 0.04, 0.05, z + 0.12], [0.12, 0.06, 0.13], 0, 0.05)]));
    for (const c of [-0.06, 0, 0.06]) P.push(...both([cone([x + 0.04 + c, 0.05, z + 0.2], [x + 0.04 + c * 1.4, 0.01, z + 0.3], 0.025, 0.006, 5)]));
  }
  // head: a broad frog skull on a short neck
  P.push(cone([0, 0.82, 0.62], [0, 0.78, 0.92], 0.28, 0.25, 0, 0.12));
  P.push(ell([0, 0.78, 1.06], [0.38, 0.24, 0.3], 0, 0.1));
  P.push(ell([0, 0.66, 1.1], [0.33, 0.13, 0.26], 1, 0.06));            // jaw / throat
  // the grin: carved right across the face, with the dark mouth inside
  P.push({ ...ell([0, 0.71, 1.3], [0.34, 0.055, 0.16], 4), sub: true, s: 0.02 });
  P.push(ell([0, 0.71, 1.22], [0.3, 0.05, 0.1], 4));
  // teeth along both lips, two big tusks curling up from the corners
  for (let i = -6; i <= 6; i++) {
    const x = i * 0.042, z = 1.31 - Math.abs(i) * Math.abs(i) * 0.004;
    P.push(cone([x, 0.755, z], [x, 0.71, z + 0.01], 0.016, 0.003, 2));
    if (i % 2 === 0) P.push(cone([x + 0.02, 0.665, z - 0.01], [x + 0.02, 0.705, z], 0.014, 0.003, 2));
  }
  P.push(...both([...chain([[0.3, 0.7, 1.2], [0.38, 0.8, 1.3], [0.36, 0.95, 1.33]], [0.035, 0.026, 0.006], 2, 0.01)]));
  // bulging frog eyes on top of the skull, glowing
  P.push(...both([ell([0.2, 0.95, 1.1], [0.09, 0.08, 0.08], 0, 0.05), ell([0.22, 0.97, 1.15], [0.055, 0.05, 0.045], 3)]));
  // horns: thick at the root, sweeping back and up
  P.push(...both(chain([[0.18, 0.98, 0.92], [0.3, 1.14, 0.82], [0.34, 1.32, 0.62], [0.28, 1.42, 0.46]], [0.07, 0.055, 0.035, 0.008], 2, 0.03)));
  // spikes down the spine to the tail
  const spine: V3[] = [];
  for (let i = 0; i < 12; i++) {
    const z = 0.7 - i * 0.16;
    const y = (i < 3 ? 1.12 - i * 0.02 : 1.06 - (i - 3) * 0.05) - (z < -0.75 ? (-0.75 - z) * 0.45 : 0);
    spine.push([0, y, z]);
    const hgt = 0.2 - Math.abs(i - 3) * 0.012;
    P.push(cone([0, y - 0.04, z], [0, y + hgt, z - 0.08], 0.05, 0.004, 2, 0.02));
  }
  // tail, ending in a spear
  P.push(...chain([[0, 0.66, -0.7], [0, 0.6, -1.1], [0.06, 0.48, -1.42], [0.12, 0.36, -1.66]], [0.18, 0.12, 0.08, 0.05], 0, 0.1, 0.15));
  P.push(cone([0.12, 0.36, -1.66], [0.16, 0.3, -1.92], 0.07, 0.004, 2, 0.02));
  return { prims: P, mats, yaw: 1.05, pitch: 0.2, center: [0.02, 0.72, -0.2], scale: 102 };
}

// ------------------------------------------------------------------------------------------------ Squonk
function squonk(): SdfSpec {
  const SKIN = ramp('#1a1216', '#2e2026', '#463036', '#5e4244', '#7a5852', '#967066', '#b08a7a', '#c8a694', '#dcc0ac');
  const EYE = ramp('#06060a', '#141824', '#283448', '#4c6688', '#90b4d8', '#e4f2ff');
  const NOSE = ramp('#24121a', '#462430', '#683840', '#8c5052', '#ac6c68');
  const mats: Mat[] = [
    { ramp: SKIN, pat: PAT.warts(34, 1) },
    { ramp: EYE, glow: true },
    { ramp: NOSE, pat: PAT.mottle(40, 0.5) },
    { ramp: CLAW },
  ];
  const P: Prim[] = [];
  // a sack of a body, the skin hanging off it in folds
  P.push(ell([0, 0.36, -0.02], [0.3, 0.27, 0.42], 0));
  P.push(...both([ell([0.2, 0.24, 0.02], [0.15, 0.18, 0.34], 0, 0.1), ell([0.18, 0.16, -0.18], [0.12, 0.12, 0.2], 0, 0.08), ell([0.22, 0.2, 0.22], [0.1, 0.14, 0.12], 0, 0.06)]));
  P.push(ell([0, 0.52, -0.12], [0.2, 0.12, 0.26], 0, 0.12));   // the slumped back
  // stumpy legs, mostly hidden by the hanging skin
  for (const [x, z] of [[0.17, 0.26], [0.17, -0.25]]) P.push(...both([cone([x, 0.2, z], [x, 0.03, z + 0.02], 0.07, 0.06, 0, 0.05), ell([x, 0.025, z + 0.05], [0.07, 0.03, 0.08], 3, 0.02)]));
  // head hung low and forward, jowls and a wattle sagging under it
  P.push(ell([0, 0.36, 0.46], [0.19, 0.18, 0.18], 0, 0.1));
  P.push(...both([ell([0.12, 0.25, 0.48], [0.09, 0.11, 0.1], 0, 0.06)]));
  P.push(ell([0, 0.19, 0.42], [0.1, 0.09, 0.08], 0, 0.06));
  // a pig snout, pink and wet
  P.push(cone([0, 0.33, 0.58], [0, 0.31, 0.7], 0.085, 0.075, 2, 0.05));
  P.push(...both([{ ...ell([0.032, 0.31, 0.745], [0.018, 0.022, 0.02], 2), sub: true, s: 0.008 }]));
  // drooping ears
  P.push(...both(chain([[0.13, 0.48, 0.4], [0.22, 0.46, 0.38], [0.27, 0.36, 0.42]], [0.05, 0.045, 0.02], 0, 0.02)));
  // big sorrowful eyes under heavy lids
  P.push(...both([ell([0.095, 0.415, 0.6], [0.04, 0.042, 0.03], 1), ell([0.1, 0.45, 0.6], [0.06, 0.03, 0.045], 0, 0.02)]));
  const TEAR = ramp('#3a5680', '#7aa0cc', '#bcdaf4', '#f2faff');
  return {
    prims: P, mats, yaw: 0.85, pitch: 0.18, center: [0.02, 0.3, 0.12], scale: 245,
    post: (p, at) => {
      // tears running down, and a puddle forming under the chin
      for (const sx of [-1, 1]) {
        const [x, y] = at([sx * 0.1, 0.39, 0.63]);
        droplet(p, Math.round(x), Math.round(y) + 2, 9, TEAR);
        droplet(p, Math.round(x) + sx * 3, Math.round(y) + 16, 6, TEAR);
      }
      const [px, py] = at([0, 0.0, 0.58]);
      for (let y = -3; y <= 3; y++) for (let x = -26; x <= 26; x++) {
        if ((x * x) / 676 + (y * y) / 9 > 1) continue;
        if (p.alpha(Math.round(px + x), Math.round(py + y)) > 128) continue;
        p.set(Math.round(px + x), Math.round(py + y), y < -1 ? TEAR[2] : (x + y * 3) % 7 === 0 ? TEAR[3] : TEAR[1]);
      }
    },
  };
}

// ------------------------------------------------------------------------------------------------ Hidebehind
function hidebehind(): SdfSpec {
  const BIRCH = ramp('#24201e', '#48423e', '#78706a', '#a69e94', '#cbc4b6', '#e8e2d2', '#f6f2e6');
  const DARK = ramp('#040306', '#0a0810', '#120e18', '#1c1622', '#28202e', '#382a3a');
  const EYE = ramp('#2a2a10', '#6a6420', '#b8ac40', '#eee07a', '#fffbd8');
  const birchPat = (p: V3) => {
    // black lenticel dashes across, and the odd dark knot
    const band = Math.abs(Math.sin(p[1] * 31 + Math.sin(p[1] * 7) * 2));
    const dash = band > 0.93 && hash2(Math.floor(Math.atan2(p[2], p[0]) * 6), Math.floor(p[1] * 31 / Math.PI), 4) < 0.6;
    const knot = hash2(Math.floor(Math.atan2(p[2], p[0]) * 2.5), Math.floor(p[1] * 3), 9) < 0.18 && band > 0.7;
    return knot ? -4 : dash ? -3 : 0;
  };
  const mats: Mat[] = [
    { ramp: BIRCH, pat: birchPat, bias: 0.4 },
    { ramp: DARK, pat: PAT.fur(90, [0, -1, 0], 0.6) },
    { ramp: EYE, glow: true },
    { ramp: ramp('#1a1210', '#2e2218', '#463424', '#5e4a34', '#786248'), pat: PAT.mottle(20, 0.8) },
  ];
  const P: Prim[] = [];
  // the trunk: a big old birch, flaring at the root
  P.push(cone([0, -0.2, 0], [0, 2.4, 0.04], 0.3, 0.25, 0));
  P.push(ell([0, 0.06, 0], [0.42, 0.18, 0.42], 0, 0.15));
  P.push(...chain([[0.25, 0.05, 0.2], [0.5, -0.02, 0.4]], [0.09, 0.04], 0, 0.08));
  P.push(...chain([[-0.28, 0.05, 0.12], [-0.55, -0.02, 0.18]], [0.09, 0.04], 0, 0.08));
  // forest floor
  P.push(ell([0, -0.06, 0], [1.4, 0.08, 1.4], 3, 0.1));
  // the thing behind it: a long head peeking round the right side, one eye
  P.push(ell([0.24, 1.62, -0.1], [0.1, 0.17, 0.12], 1));
  P.push(ell([0.27, 1.5, -0.05], [0.07, 0.1, 0.08], 1, 0.05));
  P.push(ell([0.315, 1.66, 0.0], [0.03, 0.022, 0.02], 2));
  // its shoulder, and one long arm reaching round the trunk at chest height, fingers splayed over the bark
  P.push(ell([0.26, 1.3, -0.2], [0.12, 0.16, 0.1], 1, 0.06));
  const R = 0.3;
  const around = (a: number, y: number, out = 0): V3 => [Math.sin(a) * (R + out), y, Math.cos(a) * (R + out)];
  for (let f = 0; f < 4; f++) {
    const y0 = 1.27 - f * 0.055, a0 = 1.65, a1 = 0.95 - f * 0.12 + (f === 3 ? 0.35 : 0);
    const pts: V3[] = [];
    for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(around(a0 + (a1 - a0) * t, y0 - t * 0.04 * (f - 1.5), 0.012)); }
    P.push(...chain(pts, [0.02, 0.018, 0.016, 0.014, 0.012, 0.008], 1, 0.008, 0.02));
    // a long hooked nail at each fingertip
    const tip = pts[pts.length - 1], dir = around(a1 - 0.15, tip[1] - 0.02, 0.0);
    P.push(cone(tip, dir, 0.008, 0.002, 3));
  }
  P.push(cone(around(1.75, 1.24, 0.02), [0.3, 1.27, -0.12], 0.035, 0.06, 1, 0.04));
  return { prims: P, mats, yaw: 0.45, pitch: 0.06, center: [0.08, 1.15, 0], scale: 96 };
}

// ------------------------------------------------------------------------------------------------ Agropelter
function agropelter(): SdfSpec {
  const SNAG = ramp('#16130f', '#28231d', '#3c352b', '#544a3c', '#6e624e', '#8a7d64', '#a69a7e');
  const SKIN = ramp('#0c0a0c', '#1a1517', '#2a2122', '#3c2f2c', '#523f38', '#6a5244', '#846852');
  const BRANCH = ramp('#1e1610', '#36281c', '#523c28', '#6e5236', '#8c6a46');
  const mats: Mat[] = [
    { ramp: SNAG, pat: PAT.bark(14) },
    { ramp: SKIN, pat: PAT.sum(PAT.fur(110, [0, -1, 0.2], 0.7), PAT.mottle(18, 0.5)) },
    { ramp: EYE_GLOW, glow: true },
    { ramp: BRANCH, pat: PAT.bark(30) },
    { ramp: ramp('#06040a', '#0e0a10', '#18121a'), bias: -1 },
    { ramp: BONE, gloss: 0.5 },
  ];
  const P: Prim[] = [];
  // a dead snag, broken off jagged at the top, with a black hollow
  P.push(cone([0, -0.1, 0], [0.04, 1.9, 0], 0.26, 0.19, 0));
  P.push(ell([0, 0.05, 0], [0.38, 0.14, 0.38], 0, 0.14));
  for (const [x, z, h] of [[0.08, 0.06, 2.22], [-0.08, 0.02, 2.06], [0.02, -0.1, 2.12], [0.12, -0.04, 1.98]]) P.push(cone([x * 0.8, 1.85, z * 0.8], [x, h, z], 0.07, 0.01, 0, 0.03));
  P.push(...chain([[0.05, 1.5, 0.1], [0.42, 1.68, 0.2], [0.62, 1.66, 0.24]], [0.06, 0.035, 0.012], 0, 0.04));
  P.push({ ...ell([0.02, 1.12, 0.2], [0.13, 0.22, 0.12], 4), sub: true, s: 0.03 });
  P.push(ell([0.02, 1.1, 0.12], [0.12, 0.2, 0.08], 4));
  // the agropelter leaning out of the hollow: narrow head, beetling brow, jailbird scowl
  P.push(ell([0.04, 1.2, 0.2], [0.075, 0.1, 0.085], 1, 0.02));
  P.push(cone([0.04, 1.17, 0.24], [0.05, 1.11, 0.3], 0.05, 0.022, 1, 0.03));        // snout
  P.push(cone([-0.03, 1.245, 0.27], [0.11, 1.245, 0.27], 0.02, 0.02, 1, 0.02));     // brow ridge
  P.push(...both([ell([0.03, 1.215, 0.28], [0.017, 0.009, 0.01], 2)]).map((p) => ({ ...p, a: [p.a[0] + 0.04, p.a[1], p.a[2]] as V3 })));
  P.push(...both([cone([0.06, 1.28, 0.18], [0.12, 1.36, 0.12], 0.02, 0.004, 1, 0.01)]).map((p) => ({ ...p, a: [p.a[0] + 0.04, p.a[1], p.a[2]] as V3, b: [p.b![0] + 0.04, p.b![1], p.b![2]] as V3 })));
  for (const x of [0.02, 0.05, 0.08]) P.push(cone([x, 1.115, 0.3], [x, 1.095, 0.305], 0.006, 0.002, 5));   // snaggle teeth
  // shoulders, then a whip of an arm cocked back over its head with a branch to throw
  P.push(ell([0.1, 1.06, 0.18], [0.09, 0.07, 0.07], 1, 0.03));
  P.push(...chain([[0.15, 1.06, 0.2], [0.34, 1.2, 0.28], [0.42, 1.46, 0.22], [0.36, 1.66, 0.12]], [0.03, 0.022, 0.018, 0.015], 1, 0.01, 0.02));
  P.push(...chain([[0.36, 1.66, 0.12], [0.28, 1.75, -0.02]], [0.024, 0.018], 1, 0.01));
  P.push(cone([0.2, 1.52, 0.3], [0.48, 1.92, -0.18], 0.028, 0.02, 3, 0.0));       // the branch
  P.push(cone([0.36, 1.74, 0.03], [0.42, 1.84, 0.14], 0.012, 0.004, 3));
  P.push(cone([0.28, 1.62, 0.2], [0.2, 1.72, 0.26], 0.01, 0.003, 3));
  // the other arm draped over the lip of the hollow, long fingers hooked on the bark
  P.push(...chain([[-0.04, 1.04, 0.2], [-0.12, 0.96, 0.26], [-0.1, 0.9, 0.3]], [0.025, 0.02, 0.014], 1, 0.01, 0.02));
  for (const dx of [-0.02, 0, 0.02]) P.push(cone([-0.1 + dx, 0.9, 0.3], [-0.1 + dx * 1.6, 0.84, 0.27], 0.008, 0.004, 1));
  return { prims: P, mats, yaw: 0.6, pitch: 0.02, center: [0.12, 1.28, 0.05], scale: 168 };
}

// ------------------------------------------------------------------------------------------------ Teakettler
function teakettler(): SdfSpec {
  const FUR = ramp('#1a0e0a', '#32180e', '#502612', '#723818', '#985020', '#bc6e30', '#d89450', '#ecbe80');
  const CREAM = ramp('#3a2a1e', '#6a5038', '#987858', '#c0a07a', '#ddc49e', '#f0e0c0');
  const COPPER = ramp('#1e0c08', '#3e1a0e', '#6a2c14', '#9a4820', '#c86e34', '#e8a060', '#fcdcaa');
  const mats: Mat[] = [
    { ramp: FUR, pat: PAT.fur(140, [0, -0.4, -1], 0.8) },
    { ramp: CREAM, pat: PAT.fur(160, [0, -1, 0], 0.5) },
    { ramp: ramp('#040404', '#14121a', '#2e2c3a', '#8a8aa0', '#f0f0ff'), glow: true },
    { ramp: COPPER, gloss: 1.2 },
    { ramp: CLAW },
  ];
  const P: Prim[] = [];
  // a round kettle of a body on short legs, waddling away from us (it walks backwards: its face is at the rear)
  P.push(ell([0, 0.17, 0], [0.12, 0.11, 0.16], 0));
  P.push(ell([0, 0.13, 0.02], [0.09, 0.07, 0.12], 1, 0.06));
  for (const [x, z] of [[0.07, 0.09], [0.07, -0.09]]) P.push(...both([cone([x, 0.1, z], [x, 0.02, z], 0.035, 0.03, 0, 0.03), ell([x, 0.015, z + 0.012], [0.03, 0.016, 0.035], 4, 0.01)]));
  // the tail curls up over the back like a kettle handle
  P.push(...chain([[0, 0.24, 0.12], [0, 0.33, 0.1], [0, 0.37, 0.02], [0, 0.34, -0.07], [0, 0.27, -0.1]], [0.022, 0.02, 0.02, 0.019, 0.018], 3, 0.01, 0.02));
  // head at the rear end, turned to look at us over its shoulder
  P.push(ell([0.02, 0.25, -0.15], [0.085, 0.08, 0.075], 0, 0.06));
  P.push(ell([0.04, 0.22, -0.18], [0.06, 0.045, 0.05], 1, 0.03));
  // the spout: a long copper snout with flared nostrils
  P.push(cone([0.05, 0.24, -0.2], [0.11, 0.27, -0.27], 0.03, 0.018, 3, 0.02));
  P.push(ell([0.115, 0.274, -0.275], [0.02, 0.016, 0.016], 3, 0.01));
  // ears like kettle-lid knobs, eyes beady and bright
  P.push(...both([ell([0.055, 0.33, -0.13], [0.03, 0.035, 0.02], 3, 0.02)]).map((p) => ({ ...p, a: [p.a[0] + 0.01, p.a[1], p.a[2]] as V3 })));
  P.push(ell([0.075, 0.27, -0.205], [0.014, 0.016, 0.012], 2));
  P.push(ell([-0.03, 0.275, -0.2], [0.012, 0.015, 0.011], 2));
  const STEAM = ramp('#7a7e88', '#a6aab4', '#d0d4dc', '#f2f4f8');
  return {
    prims: P, mats, yaw: 0.95, pitch: 0.14, center: [0.02, 0.2, -0.05], scale: 520,
    post: (p, at) => {
      const [x, y] = at([0.13, 0.285, -0.29]);
      puff(p, Math.round(x + 10), Math.round(y - 12), 6, STEAM, 1);
      puff(p, Math.round(x + 26), Math.round(y - 30), 8, STEAM, 2);
      puff(p, Math.round(x + 34), Math.round(y - 54), 10, STEAM, 3);
    },
  };
}

// ------------------------------------------------------------------------------------------------ Snow Wasset
function wasset(): SdfSpec {
  const FUR = ramp('#1e2434', '#343e54', '#525e78', '#7a869e', '#a2acc0', '#c8d0dc', '#e6eaf0', '#fafcfe');
  const SNOW = ramp('#283652', '#405272', '#627696', '#8c9eb8', '#b6c4d6', '#dae2ec', '#f4f8fc');
  const mats: Mat[] = [
    { ramp: FUR, pat: PAT.fur(120, [0, -0.3, -1], 0.6) },
    { ramp: SNOW, pat: PAT.mottle(10, 0.5), bias: 0.4 },
    { ramp: ramp('#020206', '#0a0c16', '#1e2236', '#6a7290', '#e8eeff'), glow: true, gloss: 2 },
    { ramp: ramp('#0a0a10', '#1a1a24', '#2c2c3a', '#40404e'), pat: PAT.fur(150, [0, 0, -1], 0.5) },
    { ramp: BONE },
    { ramp: MOUTH },
  ];
  const P: Prim[] = [];
  // a drift of snow it is swimming through
  P.push(ell([0, -0.1, -0.3], [1.5, 0.22, 1.6], 1));
  P.push(ell([0.25, 0.04, 0.2], [0.34, 0.12, 0.3], 1, 0.12));
  P.push(ell([-0.2, 0.06, -0.85], [0.3, 0.12, 0.28], 1, 0.12));
  // the long body: up out of the snow in an arch, head raised to look
  P.push(...chain([[0, -0.05, -0.38], [0, 0.18, -0.2], [0, 0.36, 0.05], [0.02, 0.5, 0.26], [0.04, 0.56, 0.4]], [0.12, 0.125, 0.115, 0.095, 0.08], 0, 0.06, 0.08));
  // a second loop further back, and the black-tipped tail
  P.push(...chain([[-0.1, 0.0, -0.7], [-0.14, 0.2, -0.88], [-0.16, 0.24, -1.02], [-0.18, 0.06, -1.18]], [0.1, 0.1, 0.095, 0.09], 0, 0.06, 0.08));
  P.push(...chain([[-0.2, 0.04, -1.42], [-0.22, 0.2, -1.5], [-0.2, 0.36, -1.5]], [0.06, 0.05, 0.03], 0, 0.04, 0.05));
  P.push(...chain([[-0.2, 0.36, -1.5], [-0.17, 0.46, -1.46]], [0.032, 0.012], 3, 0.01));
  // head: a long wedge of a weasel skull, round ears, black bead eyes, a little snarl
  P.push(ell([0.05, 0.6, 0.47], [0.09, 0.08, 0.11], 0, 0.05));
  P.push(cone([0.05, 0.585, 0.53], [0.06, 0.56, 0.64], 0.06, 0.03, 0, 0.03));
  P.push(ell([0.06, 0.565, 0.655], [0.022, 0.018, 0.016], 2));
  P.push(...both([ell([0.07, 0.68, 0.42], [0.032, 0.03, 0.016], 0, 0.015)]).map((p) => ({ ...p, a: [p.a[0] + 0.05, p.a[1], p.a[2]] as V3 })));
  P.push(...both([ell([0.052, 0.625, 0.56], [0.017, 0.016, 0.012], 2)]).map((p) => ({ ...p, a: [p.a[0] + 0.05, p.a[1], p.a[2]] as V3 })));
  P.push(ell([0.06, 0.545, 0.62], [0.035, 0.012, 0.03], 5));
  for (const x of [0.04, 0.08]) P.push(cone([x, 0.556, 0.635], [x, 0.535, 0.64], 0.006, 0.0015, 4));
  // forepaws on the crust
  P.push(...chain([[0.08, 0.38, 0.22], [0.14, 0.2, 0.3], [0.15, 0.1, 0.36]], [0.035, 0.03, 0.025], 0, 0.02, 0.04));
  return { prims: P, mats, yaw: 0.95, pitch: 0.22, center: [-0.06, 0.28, -0.45], scale: 118 };
}

export const SDF_SPECS: Record<string, () => SdfSpec> = { hodag, squonk, hidebehind, agropelter, teakettler, wasset };
export { hex };
