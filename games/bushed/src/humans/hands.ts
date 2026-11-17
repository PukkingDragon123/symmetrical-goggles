// Hands: a cupped palm with the heel and thenar pads and a knuckle ridge, four fingers of three phalanges each
// (joint bulges and creases at the knuckles, blunt pads at the tips) and an opposable thumb, all skinned to their
// own bones so first-person hands can wrap a real handle. Leather work gloves add thickness and a flared
// gauntlet cuff over the shirt cuff.
//
// Ported from Limbophobia's hand() (src/limbo/entities/humanModel.ts: palm loft, square finger tubes, thumb on a
// diagonal axis) and rebuilt with per-finger bones and rounder sections for close-up viewing.
//
// Hand space (bind pose): the hand hangs along -y, the back of the hand faces +k*x (k = +1 left, -1 right), the
// palm faces -k*x, the thumb / index side is +z, the pinky side -z.
import type { V3, Wt } from './loft';
import type { Loft } from './loft';
import { usFor, norm, cross, add, scale } from './loft';
import type { Dims } from './rig';
import { BI, FING, FINGERS, PHAL, THUMB, tdir, ellRing, clamp01 } from './rig';
import type { HumanLook } from './looks';
import type { Shape } from './shape';
import { R, subR } from './page';
import type { RegKey } from './page';
import { ARM_ROWS } from './profiles';
import { sampleRows } from './rig';

/** HAND region sub-layout: the palm block on top, one column per digit below (thumb, index, middle, ring, pinky) */
export const HAND_UV = {
  palm: [0, 0.56, 1, 1] as const,
  digit: (i: number) => [i * 0.2, 0, (i + 1) * 0.2, 0.54] as const,
};

export function buildHand(B: Loft, L: HumanLook, d: Dims, side: 'L' | 'R', k: number, sh: Shape) {
  const H = BI['hand' + side], Tw = BI['ftw' + side];
  const hp = d.rest['hand' + side];
  const reg = R(('HAND_' + side) as RegKey);
  const gl = sh.glove ? 0.0032 : 0;
  const hs = d.hand;
  const tr = (p: V3): V3 => [hp[0] + p[0], hp[1] + p[1], hp[2] + p[2]];
  const [pu0, pv0, pu1, pv1] = HAND_UV.palm;
  const palmReg = subR(reg, pu0, pv0, pu1, pv1);

  // ---------------- palm: a 12-sided loft, broadest across the knuckles
  const prow = [
    { y: 0.012, rx: 0.019, rf: 0.026, rb: 0.024, cz: 0.001, w: [Tw, 0.55, H, 0.45] },
    { y: -0.008, rx: 0.021, rf: 0.035, rb: 0.031, cz: 0.002, w: [Tw, 0.15, H, 0.85] },
    { y: -0.028, rx: 0.022, rf: 0.043, rb: 0.037, cz: 0.002, w: [H, 1] },
    { y: -0.05, rx: 0.021, rf: 0.046, rb: 0.041, cz: 0.002, w: [H, 1] },
    { y: -0.068, rx: 0.019, rf: 0.047, rb: 0.043, cz: 0.002, w: [H, 1] },
    { y: -0.08, rx: 0.017, rf: 0.046, rb: 0.042, cz: 0.002, w: [H, 0.85, BI['md1' + side], 0.15] },
  ];
  const NP = 12;
  const palmBump = (y: number, th: number) => {
    // th: 0 thumb side, +pi/2 back of the hand, -pi/2 palm
    const back = Math.max(0, Math.sin(th)), palm = Math.max(0, -Math.sin(th));
    let b = 0;
    // knuckle ridge across the back at the last rows, tendons fanning down the back of the hand
    b += back * (y < -0.07 ? 0.08 : 0.02 * Math.max(0, Math.sin(th * 7)));
    // cupped palm: hollow in the middle, the heel and thenar pads raised
    b -= palm * 0.12 * Math.exp(-((y + 0.05) ** 2) / 0.0004) * Math.exp(-((th + Math.PI / 2) ** 2) / 0.3);
    b += palm * 0.1 * Math.exp(-((y + 0.012) ** 2) / 0.0003);
    b += 0.14 * Math.exp(-((y + 0.022) ** 2) / 0.0005) * Math.exp(-((th + 0.5) ** 2) / 0.25);   // thenar (thumb ball)
    b += palm * 0.06 * Math.exp(-((y + 0.074) ** 2) / 0.0001);                                  // pads under the knuckles
    return b;
  };
  const rings = prow.map((r) => ({
    pts: ellRing(r.y * hs, 0, r.cz * hs, (r.rx + gl) * hs, (r.rf + gl) * hs, (r.rb + gl) * hs, NP, 2.5, k, (th) => palmBump(r.y, th)).map(tr),
    v: clamp01((r.y - -0.09) / 0.102), w: r.w as Wt,
  }));
  B.loft(rings, usFor(NP), palmReg, 40 + (k > 0 ? 0 : 1), { end: tr([0, -0.088 * hs, 0.002 * hs]), endW: [H, 0.6, BI['md1' + side], 0.4], alt: true });

  // ---------------- fingers
  FINGERS.forEach((f, fi) => {
    const F = FING[f];
    const b1 = BI[f + '1' + side], b2 = BI[f + '2' + side], b3 = BI[f + '3' + side];
    const Lf = F.len * hs, r = (F.r + gl * 0.7) * hs;
    const P0 = Lf * PHAL[0], P1 = Lf * PHAL[1];
    const base: V3 = [0, F.y * hs, F.z * hs];
    const [du0, dv0, du1, dv1] = HAND_UV.digit(fi + 1);
    const freg = subR(reg, du0, dv0, du1, dv1);
    const rows: { y: number; k: number; w: Wt }[] = [
      { y: 0.008 * hs, k: 1.12, w: [H, 0.7, b1, 0.3] },
      { y: -0.003 * hs, k: 1.1, w: [H, 0.15, b1, 0.85] },
      { y: -P0 * 0.5, k: 0.97, w: [b1, 1] },
      { y: -P0 + 0.0045 * hs, k: 1.03, w: [b1, 0.7, b2, 0.3] },
      { y: -P0 - 0.0035 * hs, k: 1.02, w: [b1, 0.25, b2, 0.75] },
      { y: -P0 - P1 * 0.5, k: 0.91, w: [b2, 1] },
      { y: -P0 - P1 + 0.003 * hs, k: 0.93, w: [b2, 0.7, b3, 0.3] },
      { y: -P0 - P1 - 0.003 * hs, k: 0.92, w: [b2, 0.25, b3, 0.75] },
      { y: -Lf + 0.009 * hs, k: 0.87, w: [b3, 1] },
      { y: -Lf + 0.004 * hs, k: 0.72, w: [b3, 1] },
    ];
    const NF = 8;
    const fr = rows.map((row) => {
      // finger pads on the palm side, a flatter nail side
      const pad = (th: number) => (Math.sin(th) < 0 ? 0.08 * -Math.sin(th) : -0.04 * Math.sin(th));
      return {
        pts: ellRing(base[1] + row.y, base[0], base[2], r * row.k * 0.92, r * row.k, r * row.k, NF, 2.15, k, pad).map(tr),
        v: clamp01((Lf + row.y) / (Lf + 0.008 * hs)), w: row.w,
      };
    });
    // the tip: slightly toward the pad
    const tip = tr([-k * 0.0015 * hs, base[1] - Lf, base[2]]);
    B.loft(fr, usFor(NF), freg, 42 + fi * 2 + (k > 0 ? 0 : 1), { end: tip, endW: [b3, 1], endV: 0, alt: true });
  });

  // ---------------- thumb: rings along its diagonal axis from the heel of the palm
  {
    const t1 = BI['th1' + side], t2 = BI['th2' + side], t3 = BI['th3' + side];
    const dir = tdir(k);
    const side2 = norm(cross(dir, [k, 0, 0]));
    const up = norm(cross(side2, dir));
    // the nail faces out and forward, rotated from the fingernails
    const nailA = 0.9;
    const base: V3 = [k * THUMB.base[0] * hs, THUMB.base[1] * hs, THUMB.base[2] * hs];
    const [s0, s1, s2] = THUMB.seg.map((v) => v * hs);
    const r = (THUMB.r + gl * 0.7) * hs;
    const ring = (t: number, rr: number, flat: number): V3[] => {
      const c = add(base, scale(dir, t));
      const out: V3[] = [];
      const ns = 8;
      for (let i = 0; i <= ns; i++) {
        const a = -Math.PI + (Math.PI * 2 * i) / ns;
        // pad side (opposite the nail) fuller
        const aa = a - nailA;
        const kk = 1 + (Math.cos(aa) < 0 ? 0.08 * -Math.cos(aa) : -flat * Math.cos(aa));
        const v = add(scale(up, Math.cos(a) * rr * kk), scale(side2, Math.sin(a) * rr * kk));
        out.push(tr(add(c, v)));
      }
      return out;
    };
    const total = s0 + s1 + s2;
    const rows: { t: number; k: number; w: Wt; flat: number }[] = [
      { t: -0.004 * hs, k: 1.55, w: [H, 0.75, t1, 0.25], flat: 0 },
      { t: s0 * 0.35, k: 1.42, w: [H, 0.3, t1, 0.7], flat: 0 },
      { t: s0 * 0.72, k: 1.2, w: [t1, 1], flat: 0.02 },
      { t: s0 - 0.003 * hs, k: 1.08, w: [t1, 0.65, t2, 0.35], flat: 0.04 },
      { t: s0 + 0.004 * hs, k: 1.04, w: [t1, 0.25, t2, 0.75], flat: 0.04 },
      { t: s0 + s1 * 0.55, k: 0.98, w: [t2, 1], flat: 0.05 },
      { t: s0 + s1 - 0.002 * hs, k: 0.99, w: [t2, 0.65, t3, 0.35], flat: 0.05 },
      { t: s0 + s1 + 0.004 * hs, k: 0.98, w: [t2, 0.25, t3, 0.75], flat: 0.06 },
      { t: total - 0.009 * hs, k: 0.88, w: [t3, 1], flat: 0.08 },
      { t: total - 0.004 * hs, k: 0.72, w: [t3, 1], flat: 0.05 },
    ];
    const [du0, dv0, du1, dv1] = HAND_UV.digit(0);
    const freg = subR(reg, du0, dv0, du1, dv1);
    const rr = rows.map((row) => ({ pts: ring(row.t, r * row.k, row.flat), v: clamp01((total - row.t) / (total + 0.004 * hs)), w: row.w }));
    const tip = tr(add(base, scale(dir, total)));
    B.loft(rr, usFor(8), freg, 50 + (k > 0 ? 0 : 1), { end: tip, endW: [t3, 1], endV: 0, alt: true });
  }

  // ---------------- the glove's gauntlet: a stiff leather cuff flaring over the shirt sleeve
  if (sh.glove) {
    const U = d.rest['uarm' + side];
    const al = L.build.armLen, s = d.s;
    const fm = (1 - L.build.fem * 0.14) * (0.62 + 0.38 * L.build.mass);
    const ys = [-0.528, -0.515, -0.5, -0.48, -0.462, -0.448];
    const rr = ys.map((y, i) => {
      const r0 = sampleRows(ARM_ROWS, y);
      const t = sh.armThick + 0.0045 + (i / (ys.length - 1)) * 0.009 + (y < -0.51 ? -0.002 : 0);
      const pts = ellRing(U[1] + y * al * s, 0, U[2], (r0.rx * fm + t) * s, (r0.rf * fm + t) * s, (r0.rb * fm + t) * s, 14, 2, k, (th) => 0.03 * Math.sin(th * 3 + 0.5) * (i / ys.length)).map((p): V3 => [p[0] + U[0], p[1], p[2]]);
      const tw = clamp01((y + 0.32) / -0.18);
      const w: Wt = y < -0.5 ? [Tw, 0.6, H, 0.4] : [BI['farm' + side], 1 - tw * 0.85, Tw, tw * 0.85];
      return { pts, v: i / (ys.length - 1), w };
    });
    const creg = subR(R('CUFF'), k > 0 ? 0 : 0.5, 0, k > 0 ? 0.5 : 1, 1);
    B.loft(rr, usFor(14), creg, 55 + (k > 0 ? 0 : 1), { alt: true });
    B.loft(rr.map((r) => ({ ...r, c: 0.45 })), usFor(14), creg, 57 + (k > 0 ? 0 : 1), { flip: true });
  }
}
