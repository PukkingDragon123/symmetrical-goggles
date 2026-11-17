// Body geometry: one skinned lofted mesh per person, built from superellipse cross-section rings: an
// anatomical torso, neck and collar, garment shells over it (chore jacket, quilted / blaze vests, cardigan,
// shop apron), arms that bend smoothly at shoulders, elbows and wrists, legs with knees and real boot shapes
// (tall lug-soled logger boots, hikers, work boots, shoes), plus the hands (hands.ts) and head (head.ts).
//
// Ported from Limbophobia's buildBody (src/limbo/entities/humanModel.ts) and Blobfish's cleanup
// (src/humans/body.ts): realistic adult profiles, cloth breaks as doubled rings (hems step), fold fields shared
// with the painter (folds.ts), clavicle / forearm-twist weights for clean overhead and wrist poses.
import * as THREE from 'three';
import type { V3, Wt } from './loft';
import { Loft, usFor } from './loft';
import type { Dims, Row } from './rig';
import { BI, superPt, sampleRows, ringYs, gauss, angd, vOf, clamp01, withW } from './rig';
import type { HumanLook } from './looks';
import type { Shape } from './shape';
import { shapeOf } from './shape';
import { R, VMAP, subR } from './page';
import type { RegKey } from './page';
import { torsoFold, armFold, legFold } from './folds';
import { TORSO_ROWS, ARM_ROWS, LEG_ROWS } from './profiles';
import { buildHand } from './hands';
import { buildHead, headShape } from './head';
import type { HeadShape } from './head';

export { TORSO_ROWS, ARM_ROWS, LEG_ROWS };

export interface BodyBuild {
  geometry: THREE.BufferGeometry;
  head: HeadShape | null;
  shape: Shape;
  /** sole thickness (m): the skeleton stands this far up so the soles touch y = 0 */
  sole: number;
}

/** a ring of n segments (+ seam point) on a superellipse with relative (rel) and absolute radial (abs) offsets */
function ringPts(n: number, y: number, cx: number, cz: number, rx: number, rf: number, rb: number, sq: number, mirror: number,
  rel?: (th: number) => number, abs?: (th: number) => number, th0 = -Math.PI): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const th = th0 + (Math.PI * 2 * i) / n;
    const p = superPt(th, cx, cz, rx, rf, rb, sq, mirror, 1 + (rel ? rel(th) : 0), y);
    if (abs) {
      const o = abs(th);
      if (o) {
        const dx = p[0] - mirror * cx, dz = p[2] - cz, l = Math.hypot(dx, dz) || 1;
        p[0] += (dx / l) * o; p[2] += (dz / l) * o;
      }
    }
    pts.push(p);
  }
  return pts;
}

export interface BuildOpts { arms?: boolean /* arms + hands only (first-person viewmodel) */ }

// ------------------------------------------------------------------ main build
export function buildBody(L: HumanLook, d: Dims, o: BuildOpts = {}): BodyBuild {
  const B = new Loft();
  const sh = shapeOf(L);
  const s = d.s, b = L.build, fem = b.fem, mass = b.mass, bw = b.bw;
  const Rs = d.rest;
  const ty = d.ty;

  // ---------------- torso
  const thick = (y: number) => {
    let t = 0;
    if (y <= sh.waist && (sh.tuck || y < sh.topHem)) t += sh.legThick * 0.8;
    if (y >= sh.topHem || sh.tuck) t += sh.topThick;
    if (sh.tuck && y <= sh.waist + 0.004 && y > sh.waist - 0.05) t += 0.004;   // waistband
    return t;
  };
  const bump = (th: number, y: number) => {
    let k = 0;
    const coat = sh.outer !== 'none' ? 0.5 : 1;
    k += gauss(y, 1.255, 0.05) * gauss(Math.abs(angd(th, 0)), 0.48, 0.36) * (fem * 0.2 + (1 - fem) * (0.05 + 0.06 * b.chest) * mass) * coat;
    k -= gauss(y, 1.185, 0.02) * gauss(Math.abs(th), 0.48, 0.35) * fem * 0.05;
    k += gauss(y, 0.915, 0.05) * gauss(Math.abs(angd(th, Math.PI)), 0.45, 0.4) * (0.05 + fem * 0.06);
    k += gauss(y, 1.31, 0.05) * gauss(Math.abs(angd(th, Math.PI)), 0.6, 0.3) * 0.035;
    k -= gauss(y, 1.15, 0.2) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.14) * 0.03;
    k += gauss(y, 1.05, 0.075) * gauss(th, 0, 0.9) * (b.belly * 0.32 + Math.max(0, mass - 1) * 0.28);
    k += gauss(y, 1.27, 0.09) * gauss(Math.abs(th), 0.3, 0.9) * b.chest * 0.06;
    return k;
  };
  const femX = (y: number) => 1 + fem * (-0.14 * gauss(y, 1.1, 0.07) - 0.08 * gauss(y, 1.33, 0.08) + 0.11 * gauss(y, 0.93, 0.05) + 0.05 * gauss(y, 0.86, 0.04));
  const bellyW = (y: number, th: number) => gauss(y, 1.05, 0.08) * gauss(th, 0, 0.9) * Math.min(1, b.belly + Math.max(0, mass - 1)) * 0.85;
  const wOf = (y: number, th = 0): Wt => {
    let w: Wt;
    if (y < 0.98) w = [BI.hips, 1];
    else if (y < 1.03) { const t = (y - 0.98) / 0.05; w = [BI.hips, 1 - t, BI.spine, t]; }
    else if (y < 1.13) w = [BI.spine, 1];
    else if (y < 1.22) { const t = (y - 1.13) / 0.09; w = [BI.spine, 1 - t, BI.chest, t]; }
    else if (y < 1.47) w = [BI.chest, 1];
    else w = [BI.chest, 0.6, BI.neck, 0.4];
    const bk = bellyW(y, th);
    if (bk > 0.02) w = withW(w, BI.belly, bk);
    // the shoulder girdle: the top of the shoulders rides the clavicle, the edge a little of the upper arm
    const x = Math.sin(th), sd = x > 0 ? 'L' : 'R';
    const side = clamp01((Math.abs(x) - 0.35) / 0.45);
    const cl = clamp01((y - 1.3) / 0.1) * side * 0.75;
    if (cl > 0.01) w = withW(w, BI['clav' + sd], cl);
    const ar = clamp01((y - 1.27) / 0.1) * clamp01((Math.abs(x) - 0.78) / 0.2) * 0.3;
    if (ar > 0.01) w = withW(w, BI['uarm' + sd], ar);
    return w;
  };
  const torsoSurf = (y: number, deg: number, off: number): V3 => {
    const r = sampleRows(TORSO_ROWS, y);
    const t = thick(y) + off, fx = femX(y);
    const th = (deg * Math.PI) / 180;
    const p = superPt(th, 0, (r.cz ?? 0) * s, (r.rx * bw * fx + t) * s, (r.rf * mass + t) * s, (r.rb * mass + t) * s, r.sq ?? 2.2, 1, 1 + bump(th, y), ty(y));
    return p;
  };
  if (!o.arms) {
    const breaks: number[] = [];
    if (!sh.tuck && sh.topHem > 0.82) breaks.push(sh.topHem);
    breaks.push(sh.waist);
    const extra = [0.96, 1.0, 1.04, 1.1, 1.13, 1.2, 1.29, 1.345, sh.waist + 0.02, sh.waist + 0.04, sh.waist + 0.06];
    const ys = ringYs(TORSO_ROWS, breaks, extra);
    const n = 28;
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(TORSO_ROWS, y);
      const t = thick(y + eps * 0.003);
      const fx = femX(y);
      const pts = ringPts(n, ty(y), 0, (r.cz ?? 0) * s, (r.rx * bw * fx + t) * s, (r.rf * mass + t) * s, (r.rb * mass + t) * s, r.sq ?? 2.2, 1,
        (th) => bump(th, y), (th) => torsoFold(th, y, sh, L) * s * (y + eps * 0.003 >= sh.waist || sh.topKind === 'coveralls' ? 1 : 0.3));
      return { pts, v: vOf(VMAP.TORSO, y), w: (_p: V3, j: number) => wOf(y, -Math.PI + (Math.PI * 2 * j) / n) };
    });
    B.loft(rings, usFor(n), R('TORSO'), 1, { start: [0, ty(0.8), -0.005 * s], end: [0, ty(1.5), -0.006 * s], startW: [BI.hips, 1], endW: [BI.chest, 0.5, BI.neck, 0.5], alt: true });

    if (sh.outer !== 'none') buildOuter(B, L, d, sh, torsoSurf, wOf);
    if (L.apron) buildApron(B, L, d, sh, torsoSurf, wOf);

    // ---------------- neck + collar
    const nr = 0.052 * (0.8 + 0.2 * mass) * (1 - fem * 0.14) * (1 + b.chest * 0.08);
    {
      const ys = [1.44, 1.47, 1.5, 1.53, 1.56, 1.6, 1.63];
      const n = 14;
      const hy = Rs.head[1];
      const rings = ys.map((y) => {
        const yy = Rs.neck[1] + (y - 1.48) * s * b.neckLen;
        const r = nr * (y < 1.47 ? 1.18 : y > 1.58 ? 0.97 : 1);
        const neckK = (th: number) => gauss(y, 1.52, 0.015) * gauss(th, 0, 0.3) * 0.14 * (1 - fem)
          + gauss(Math.abs(th), 0.75 - (y - 1.45) * 4, 0.22) * 0.07 * (1 - fem * 0.5)
          + gauss(Math.abs(angd(th, Math.PI)), 0.55, 0.3) * gauss(y, 1.47, 0.03) * 0.12;
        return {
          pts: ringPts(n, yy, 0, -0.008 * s, r * s, r * 1.04 * s, r * 1.02 * s, 2.1, 1, neckK), v: vOf(VMAP.NECK, y),
          w: (yy < hy - 0.02 ? [BI.chest, y < 1.47 ? 0.7 : 0.15, BI.neck, y < 1.47 ? 0.3 : 0.85] : [BI.neck, 0.4, BI.head, 0.6]) as Wt,
        };
      });
      B.loft(rings, usFor(n), R('NECK'), 2, { alt: true });
      buildCollar(B, L, d, sh, nr);
    }
  }

  // ---------------- arms + hands
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    const C = BI['clav' + side], U = BI['uarm' + side], Fm = BI['farm' + side], Tw = BI['ftw' + side], Hn = BI['hand' + side];
    const ua = Rs['uarm' + side];
    const al = b.armLen;
    const breaks: number[] = [];
    if (sh.sleeveY > -0.53) breaks.push(sh.sleeveY);
    const extra = [-0.01, -0.035, -0.09, -0.16, -0.23, -0.27, -0.285, -0.31, -0.37, -0.43, -0.475, -0.52];
    if (sh.rolled) extra.push(sh.sleeveY + 0.006, sh.sleeveY + 0.012, sh.sleeveY + 0.02, sh.sleeveY + 0.028, sh.sleeveY + 0.036);
    if (sh.sleeveY < -0.45) extra.push(sh.sleeveY + 0.012, sh.sleeveY + 0.028, sh.sleeveY + 0.042);
    const ys = ringYs(ARM_ROWS, breaks, extra);
    const fm = (1 - fem * 0.14) * (0.62 + 0.38 * mass) * (1 + b.chest * 0.06);
    const wOfA = (y: number): Wt => {
      if (y > 0.0) return [U, 0.6, C, 0.4];
      if (y > -0.25) return [U, 1];
      if (y > -0.32) { const t = (y + 0.25) / -0.07; return [U, 1 - t, Fm, t]; }
      if (y > -0.5) { const t = clamp01((y + 0.32) / -0.18); return [Fm, 1 - t * 0.85, Tw, t * 0.85]; }
      const t = clamp01((y + 0.5) / -0.035); return [Fm, 0.15 * (1 - t), Tw, 0.85 * (1 - t) + 0.3 * t, Hn, 0.7 * t];
    };
    const tOf = (yy: number) => {
      let t = 0;
      if (yy > sh.sleeveY) t += sh.armThick * (1 - clamp01((yy - 0.0) / 0.045) * 0.7);
      return t;
    };
    const NA = 14;
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(ARM_ROWS, y);
      const yy = y + eps * 0.0005;
      const t = tOf(yy);
      const cloth = yy > sh.sleeveY;
      // bare skin: deltoid, biceps and the forearm's muscle belly
      const muscle = (th: number) => (gauss(y, -0.03, 0.04) * gauss(Math.abs(th), 1.4, 0.7) * 0.07 + gauss(y, -0.13, 0.05) * gauss(th, 0.1, 0.6) * 0.06
        - gauss(y, -0.28, 0.03) * gauss(th, 0, 0.5) * 0.04 + gauss(y, -0.35, 0.04) * gauss(th, 0.6, 0.6) * 0.05) * (cloth ? 0.35 : 1) * (0.6 + 0.4 * mass);
      // the cuff band of a long sleeve stands proud of the sleeve
      const cuff = sh.sleeveY < -0.45 && cloth && yy < sh.sleeveY + 0.05 ? 0.0025 : 0;
      const pts = ringPts(NA, ua[1] + y * al * s, 0, ua[2], (r.rx * fm + t + cuff) * s, (r.rf * fm + t + cuff) * s, (r.rb * fm + t + cuff) * s, 2, k, muscle,
        (th) => (cloth ? armFold(th, y, sh) * s : 0));
      for (const p of pts) p[0] += ua[0];
      return { pts, v: vOf(VMAP.ARM, y), w: wOfA(y) };
    });
    B.loft(rings, usFor(NA), R(('ARM_' + side) as RegKey), 10 + (k > 0 ? 0 : 1), {
      start: [ua[0] - k * 0.024 * s, ua[1] + 0.034 * s, ua[2]], startW: [U, 0.45, C, 0.55], alt: true,
    });
    buildHand(B, L, d, side, k, sh);
  }
  if (o.arms) {
    const geometry = B.build();
    return { geometry, head: null, shape: sh, sole: 0 };
  }

  // ---------------- legs + boots
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    const T = BI['thigh' + side], S = BI['shin' + side], Ft = BI['foot' + side];
    const thp = Rs['thigh' + side];
    const ll = b.legLen;
    const breaks: number[] = [];
    if (sh.legHem > -0.86) breaks.push(sh.legHem);
    if (sh.bootTop > -0.86) breaks.push(sh.bootTop);
    const extra = [-0.05, -0.16, -0.28, -0.38, -0.43, -0.47, -0.52, -0.62, -0.72, -0.8];
    if (sh.bootTop > -0.86) extra.push(sh.bootTop + 0.012, sh.bootTop + 0.024, sh.bootTop - 0.012);
    if (sh.stagged) extra.push(sh.legHem + 0.015, sh.legHem + 0.03);
    const ys = ringYs(LEG_ROWS, breaks, extra);
    const fm = (0.72 + 0.28 * mass) * (1 + b.chest * 0.03);
    const femLeg = (y: number) => 1 + fem * (0.09 * gauss(y, -0.08, 0.12) - 0.05 * gauss(y, -0.6, 0.1));
    const wOfL = (y: number): Wt => {
      if (y > 0.02) return [BI.hips, 0.5, T, 0.5];
      if (y > -0.05) { const t = (0.02 - y) / 0.07; return [BI.hips, 0.5 - t * 0.4, T, 0.5 + t * 0.4]; }
      if (y > -0.39) return [BI.hips, y > -0.12 ? 0.1 * (1 - (-0.05 - y) / 0.07) : 0, T, 1];
      if (y > -0.48) { const t = (y + 0.39) / -0.09; return [T, 1 - t, S, t]; }
      if (y > -0.8) return [S, 1];
      const t = clamp01((y + 0.8) / -0.06); return [S, 1 - t * 0.6, Ft, t * 0.6];
    };
    const NL = 16;
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(LEG_ROWS, y);
      const yy = y + eps * 0.0005;
      let t = 0;
      const cov = yy > sh.legHem;
      if (cov) {
        t += sh.legThick;
        if (!sh.stagged) t += Math.max(0, (-0.43 - y) / 0.42) * 0.012;   // straight-leg trousers hang wider at the shin
      }
      // the boot shaft (thick leather) and the wool sock rolled over its top (stagged trousers show it)
      if (yy < sh.bootTop) t += sh.bootThick + (cov ? 0.012 : 0.002);
      if (sh.stagged && yy > sh.bootTop && yy < sh.legHem) t += 0.006 + 0.004 * gauss(yy, sh.bootTop + 0.012, 0.008);
      const fl = femLeg(y);
      const pts = ringPts(NL, thp[1] + y * ll * s, 0, thp[2], (r.rx * fm * fl + t) * s, (r.rf * fm * fl + t) * s, (r.rb * fm * fl + t) * s, 2, k,
        (th) => (cov ? 0 : -gauss(y, -0.47, 0.02) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.5) * 0.05),
        (th) => (cov ? legFold(th, y, sh) * s : 0));
      for (const p of pts) p[0] += thp[0];
      return { pts, v: vOf(VMAP.LEG, y), w: wOfL(y) };
    });
    B.loft(rings, usFor(NL), R(('LEG_' + side) as RegKey), 20 + (k > 0 ? 0 : 1),
      { start: [thp[0], thp[1] + 0.07 * s, thp[2]], end: [thp[0], thp[1] - 0.875 * ll * s, thp[2] + 0.004], startW: [BI.hips, 0.6, T, 0.4], endW: [Ft, 1], alt: true });
    buildFoot(B, L, d, side, k, sh);
  }

  // ---------------- head, face, hair, hat, glasses
  const head = headShape(L, d);
  buildHead(B, head, sh);

  const geometry = B.build();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, d.hipY, 0), 1.6 * s);
  return { geometry, head, shape: sh, sole: (sh.soleH + 0.004) * s };
}

// ------------------------------------------------------------------ outer garments
function buildOuter(B: Loft, L: HumanLook, d: Dims, sh: Shape, torsoSurf: (y: number, deg: number, off: number) => V3, wOf: (y: number, th?: number) => Wt) {
  const top = 1.462, hem = sh.outerHem;
  const kind = sh.outer;
  const t0 = sh.outerThick;
  const n = 32;
  const ys: number[] = [];
  const nr = Math.max(8, Math.round((top - hem) / 0.025));
  for (let i = 0; i <= nr; i++) ys.push(top - ((top - hem) * i) / nr);
  if (kind === 'quiltVest') { /* rings on the quilt channel lines so the puffs read in the silhouette */
    for (let y = hem + 0.035; y < top - 0.03; y += 0.07) { ys.push(y - 0.003, y + 0.003); }
    ys.sort((a, b) => b - a);
  }
  // the open front: a V for cardigans, a narrow slot for an open jacket, closed for vests
  const gap = (y: number) => {
    if (!sh.open) return 0;
    if (kind === 'cardigan') return 7 + 30 * clamp01((y - 1.02) / 0.4) ** 1.2;
    return 6 + 16 * clamp01((y - 1.28) / 0.17) + 4 * clamp01((1.0 - y) / 0.15);
  };
  const quilt = kind === 'quiltVest';
  const offAt = (y: number, deg: number) => {
    let o = t0;
    if (quilt) o += (Math.abs(Math.sin(((y - hem) / 0.07) * Math.PI)) - 0.5) * 0.008;
    // the coat hangs off the belly and chest instead of clinging under them, flaring a little at the hem
    if (y < 1.05) o += 0.007 * clamp01((1.05 - y) / 0.12);
    if (kind === 'chore') o += Math.sin(deg * 0.09 + y * 24) * 0.0016 + gauss(y, hem + 0.02, 0.03) * 0.004;
    if (kind === 'cardigan') o += gauss(y, hem + 0.02, 0.025) * 0.003; // the ribbed hem band
    // vests: the armholes are cut deep, so the shell sits off the shoulder edge
    return o;
  };
  const vest = kind === 'quiltVest' || kind === 'blazeVest';
  const h = n / 2;
  const colAt = (j: number, gp: number) => (j <= h ? -180 + (180 - gp) * (j / h) : gp + (180 - gp) * ((j - h - 1) / h));
  const rings = ys.map((y) => {
    const gp = gap(y);
    const pts: V3[] = [];
    for (let j = 0; j <= n + 1; j++) {
      const deg = colAt(j, gp);
      let p = torsoSurf(y, deg, offAt(y, deg));
      // vest armholes: pull the shell in toward the neck at the shoulder edge
      if (vest && y > 1.33) {
        const sx = Math.abs(Math.sin((deg * Math.PI) / 180));
        const k = clamp01((y - 1.33) / 0.1) * clamp01((sx - 0.75) / 0.25) * 0.22;
        p = [p[0] * (1 - k), p[1], p[2]];
      }
      pts.push(p);
    }
    return { pts, v: vOf(VMAP.TORSO, y), w: (_p: V3, j: number) => wOf(y, (colAt(j, gp) * Math.PI) / 180) };
  });
  const gp0 = gap(hem);
  const us = Array.from({ length: n + 2 }, (_, j) => 0.5 + colAt(j, gp0) / 360);
  const skip = (j: number) => j === h;
  B.loft(rings, us, R('OUTER'), 5, { skip, alt: true });
  B.loft(rings.map((r) => ({ ...r, c: 0.8 })), us, R('TAILS'), 6, { skip, flip: true });   // the lining has its own cloth
  // the hem edge: a thin band joining the shell to its lining so the cloth has thickness
  const last = rings[rings.length - 1];
  const inner = last.pts.map((p): V3 => { const l = Math.hypot(p[0], p[2] - 0.0) || 1; const k = 1 - (t0 * 0.8 * d.s) / l; return [p[0] * k, p[1] + 0.002, p[2] * k]; });
  B.loft([last, { ...last, pts: inner, c: 0.6 }], us, subR(R('OUTER'), 0, 0, 1, 0.02), 7, { skip });
  // the collar: corduroy on the chore jacket, a stand-up collar on the vests, the cardigan's shawl band
  const s = d.s;
  const nr0 = 0.052 * (0.8 + 0.2 * L.build.mass) * (1 + L.build.chest * 0.08);
  const ny = (y: number) => d.rest.neck[1] + (y - 1.48) * s * L.build.neckLen;
  const reg = subR(R('COLLAR'), 0, 0.5, 1, 1);
  if (kind === 'chore') {
    const cr = nr0 + 0.03;
    const rr = [
      { pts: ringPts(16, ny(1.445), 0, -0.016 * s, (cr + 0.05) * s, (cr + 0.044) * s, (cr + 0.022) * s, 2, 1), v: 0.0, w: [BI.chest, 1] as Wt },
      { pts: ringPts(16, ny(1.475), 0, -0.02 * s, (cr + 0.022) * s, (cr + 0.024) * s, (cr + 0.016) * s, 2, 1), v: 0.55, w: [BI.chest, 1] as Wt },
      { pts: ringPts(16, ny(1.515), 0, -0.022 * s, (cr + 0.006) * s, (cr + 0.004) * s, (cr + 0.008) * s, 2, 1), v: 1.0, w: [BI.chest, 0.6, BI.neck, 0.4] as Wt },
    ];
    const sk = (j: number) => j === 7 || j === 8;
    B.loft(rr, usFor(16), reg, 8, { skip: sk });
    B.loft(rr.map((r) => ({ ...r, c: 0.55 })), usFor(16), reg, 9, { skip: sk, flip: true });
  } else if (vest) {
    const cr = nr0 + 0.02 + t0;
    const rr = [1.44, 1.47, 1.5].map((y, i) => ({ pts: ringPts(16, ny(y), 0, -0.01 * s, (cr + 0.012 - i * 0.004) * s, (cr + 0.016 - i * 0.006) * s, (cr + 0.006) * s, 2, 1), v: i / 2, w: (i ? [BI.chest, 0.7, BI.neck, 0.3] : [BI.chest, 1]) as Wt }));
    B.loft(rr, usFor(16), reg, 8, {});
    B.loft(rr.map((r) => ({ ...r, c: 0.5 })), usFor(16), reg, 9, { flip: true });
  }
}

/** the storekeeper's canvas shop apron: a bib on a neck strap, wrapped at the waist, hanging to the knees */
function buildApron(B: Loft, L: HumanLook, d: Dims, sh: Shape, torsoSurf: (y: number, deg: number, off: number) => V3, wOf: (y: number, th?: number) => Wt) {
  const s = d.s, b = L.build;
  const top = 1.33, bot = 0.5;
  const ys: number[] = [];
  for (let y = top; y > bot - 1e-6; y -= 0.04) ys.push(y);
  if (ys[ys.length - 1] > bot + 0.01) ys.push(bot);
  const n = 18;
  const half = (y: number) => (y > 1.06 ? 34 - (y - 1.06) * 25 : y > 0.94 ? 34 + (1.06 - y) * 380 : 80);
  const over = (sh.outer === 'cardigan' ? sh.outerThick + 0.004 : 0) + 0.006;
  const rings = ys.map((y) => {
    const hA = half(y);
    const pts: V3[] = [];
    for (let j = 0; j <= n; j++) {
      const deg = -hA + (2 * hA * j) / n;
      let p: V3;
      if (y >= 0.9) p = torsoSurf(y, deg, over + 0.002 + 0.01 * clamp01((1.06 - y) / 0.1) * clamp01((0.98 - y + 0.12) / 0.12));
      else {
        // below the hips the apron hangs straight down from the widest part, a little forward over the thighs
        const q = torsoSurf(0.9, deg, over + 0.012);
        const drop = 0.9 - y;
        p = [q[0] * (1 + drop * 0.05), d.ty(y), q[2] + drop * 0.05 * s + 0.004 * s];
      }
      // a few soft vertical folds
      p[2] += Math.sin(deg * 0.14 + 1.3) * 0.004 * s * clamp01((1.0 - y) / 0.3);
      pts.push(p);
    }
    const kk = clamp01((0.93 - y) / 0.35);
    return {
      pts, v: vOf(VMAP.APRON, y),
      w: (p: V3, j: number): Wt => {
        const base = wOf(Math.max(y, 0.86), ((-hA + (2 * hA * j) / n) * Math.PI) / 180);
        if (kk <= 0) return base;
        const l = clamp01(0.5 + p[0] / (0.24 * s * b.bw));
        return [BI.hips, 1 - kk * 0.7, BI.thighL, kk * 0.7 * l, BI.thighR, kk * 0.7 * (1 - l)];
      },
    };
  });
  // u by angle across +-80 deg so pockets and the bib place by angle
  const us = Array.from({ length: n + 1 }, (_, j) => j / n);
  B.loft(rings, us, R('APRON'), 12, { alt: true });
  B.loft(rings.map((r) => ({ ...r, c: 0.55 })), us, R('APRON'), 13, { flip: true });
  // the neck strap: from the bib's top corners round the back of the neck
  const ny = d.rest.neck[1] + 0.04 * s;
  const L0 = torsoSurf(top, half(top), over + 0.004), R0 = torsoSurf(top, -half(top), over + 0.004);
  const nr = 0.06 * s * (0.8 + 0.2 * b.mass);
  // left corner -> up the side of the neck -> behind it -> down to the right corner
  const strap: V3[] = [L0, [L0[0] * 0.8, ny - 0.03 * s, 0.03 * s], [nr * 0.95, ny, 0.0], [nr * 0.75, ny + 0.005 * s, -nr * 0.7], [0, ny + 0.008 * s, -nr * 1.02], [-nr * 0.75, ny + 0.005 * s, -nr * 0.7], [-nr * 0.95, ny, 0.0], [R0[0] * 0.8, ny - 0.03 * s, 0.03 * s], R0];
  B.tube(strap, () => 0.0045 * s, 5, subR(R('APRON'), 0.0, 0.97, 0.06, 1), 14, { w: (t) => (t > 0.15 && t < 0.85 ? [BI.neck, 0.5, BI.chest, 0.5] : [BI.chest, 1]) });
}

function buildCollar(B: Loft, L: HumanLook, d: Dims, sh: Shape, nr: number) {
  const s = d.s;
  const reg = subR(R('COLLAR'), 0, 0, 1, 0.5);
  const ny = (y: number) => d.rest.neck[1] + (y - 1.48) * s * L.build.neckLen;
  if (sh.collar === 'shirt' || sh.collar === 'coverall') {
    // a folded collar: a flared fall open at the front over a stand
    const big = sh.collar === 'coverall' ? 0.008 : 0;
    const cr = nr + 0.012 + big;
    const rr = [
      { pts: ringPts(14, ny(1.448), 0, -0.012 * s, (cr + 0.03 + big) * s, (cr + 0.034 + big) * s, (cr + 0.012) * s, 2, 1), v: 0.0, w: [BI.chest, 1] as Wt },
      { pts: ringPts(14, ny(1.474), 0, -0.014 * s, (cr + 0.011) * s, (cr + 0.014) * s, (cr + 0.007) * s, 2, 1), v: 0.62, w: [BI.chest, 0.75, BI.neck, 0.25] as Wt },
      { pts: ringPts(14, ny(1.497), 0, -0.016 * s, (cr + 0.002) * s, (cr + 0.002) * s, (cr + 0.003) * s, 2, 1), v: 1.0, w: [BI.chest, 0.55, BI.neck, 0.45] as Wt },
    ];
    const sk = (j: number) => j === 6 || j === 7;
    B.loft(rr, usFor(14), reg, 3, { skip: sk });
    B.loft(rr.map((r) => ({ ...r, c: 0.6 })), usFor(14), reg, 4, { skip: sk, flip: true });
  } else if (sh.collar === 'henley' || sh.collar === 'crew') {
    const rr = [1.443, 1.462].map((y, i) => ({ pts: ringPts(14, ny(y), 0, -0.008 * s, (nr + 0.011 - i * 0.004) * s, (nr + 0.013 - i * 0.004) * s, (nr + 0.011 - i * 0.004) * s, 2.1, 1), v: i, w: [BI.chest, 0.8, BI.neck, 0.2] as Wt }));
    B.loft(rr, usFor(14), subR(reg, 0, 0, 1, 0.3), 3, {});
  }
}

// ------------------------------------------------------------------ feet & boots
interface FootRow { z: number; rx: number; top: number }
function shoeRows(kind: Shape['feet']): FootRow[] {
  switch (kind) {
    case 'logger': return [
      { z: -0.074, rx: 0.035, top: 0.03 }, { z: -0.06, rx: 0.041, top: 0.05 }, { z: -0.03, rx: 0.046, top: 0.055 }, { z: 0.0, rx: 0.049, top: 0.04 },
      { z: 0.04, rx: 0.052, top: 0.012 }, { z: 0.085, rx: 0.055, top: -0.01 }, { z: 0.125, rx: 0.058, top: -0.028 }, { z: 0.16, rx: 0.055, top: -0.036 },
      { z: 0.185, rx: 0.045, top: -0.042 }, { z: 0.2, rx: 0.028, top: -0.047 }];
    case 'hiker': case 'work': return [
      { z: -0.072, rx: 0.034, top: 0.02 }, { z: -0.058, rx: 0.04, top: 0.04 }, { z: -0.025, rx: 0.045, top: 0.048 }, { z: 0.0, rx: 0.048, top: 0.035 },
      { z: 0.04, rx: 0.051, top: 0.008 }, { z: 0.085, rx: 0.054, top: -0.014 }, { z: 0.125, rx: 0.056, top: -0.03 }, { z: 0.16, rx: 0.053, top: -0.038 },
      { z: 0.183, rx: 0.043, top: -0.045 }, { z: 0.197, rx: 0.026, top: -0.049 }];
    default: return [
      { z: -0.068, rx: 0.028, top: -0.015 }, { z: -0.054, rx: 0.034, top: 0.008 }, { z: -0.02, rx: 0.038, top: 0.02 }, { z: 0.02, rx: 0.042, top: 0.006 },
      { z: 0.06, rx: 0.045, top: -0.015 }, { z: 0.1, rx: 0.047, top: -0.03 }, { z: 0.14, rx: 0.045, top: -0.042 }, { z: 0.172, rx: 0.037, top: -0.049 },
      { z: 0.192, rx: 0.022, top: -0.054 }];
  }
}

function buildFoot(B: Loft, L: HumanLook, d: Dims, side: 'L' | 'R', k: number, sh: Shape) {
  const s = d.s;
  const Ft = BI['foot' + side], Te = BI['toe' + side];
  const fp = d.rest['foot' + side];
  const reg = R(('FOOT_' + side) as RegKey);
  const rows = shoeRows(sh.feet);
  const fs = s * L.build.footS * (1 - L.build.fem * 0.08);
  const ground = -d.L.ankle - sh.soleH * s;
  const AN = [-180, -150, -125, -100, -91, -89, -60, -30, 0, 30, 60, 89, 91, 100, 125, 150, 180];
  const us = AN.map((a) => 0.5 + a / 360);
  const lip = sh.feet === 'logger' ? 0.007 : sh.feet === 'shoe' ? 0.003 : 0.006;
  const toeZ = 0.13;
  const wOfZ = (z: number): Wt => (z < toeZ - 0.02 ? [Ft, 1] : z < toeZ + 0.02 ? [Ft, 1 - (z - toeZ + 0.02) / 0.04, Te, (z - toeZ + 0.02) / 0.04] : [Te, 1]);
  const rings = rows.map((r, i) => {
    const toeLift = r.z > 0.15 ? (r.z - 0.15) * 0.28 : 0;
    const yb = ground + toeLift * s;
    // the heel block: logger boots stand on a tall stacked heel
    const heel = r.z < -0.005 ? sh.heelH : r.z < 0.03 ? sh.heelH * clamp01((0.03 - r.z) / 0.035) * 0.4 : 0;
    const ym = yb + (sh.soleH + heel * 0.5) * fs;
    const yt = Math.max(ym + 0.014 * s, r.top * fs);
    const rx = r.rx * fs, rl = rx + lip * fs;
    const pts: V3[] = AN.map((a) => {
      const t = (a * Math.PI) / 180;
      if (Math.abs(a) < 90) {
        const sx = Math.sin(t), cy = Math.cos(t);
        return [k * Math.sign(sx) * Math.pow(Math.abs(sx), 0.85) * rx, ym + Math.pow(Math.max(0, cy), 0.8) * (yt - ym), r.z * fs];
      }
      const sx = Math.sin(t), cy = -Math.cos(t);
      return [k * Math.sign(sx) * Math.pow(Math.abs(sx), 0.3) * rl, ym - Math.pow(Math.max(0, cy), 0.25) * (ym - yb), r.z * fs];
    });
    for (const p of pts) { p[0] += fp[0]; p[1] += fp[1]; p[2] += fp[2]; }
    return { pts, v: 0.04 + 0.66 * (i / (rows.length - 1)), w: wOfZ(r.z) };
  });
  const last = rows[rows.length - 1];
  B.loft(rings, us, reg, 60 + (k > 0 ? 0 : 1), {
    start: [fp[0], fp[1] + ground + 0.035 * s, fp[2] + (rows[0].z - 0.006) * fs],
    end: [fp[0], fp[1] + ground + (sh.soleH + 0.012) * fs, fp[2] + (last.z + 0.008) * fs], endV: 0.72, startV: 0.0, alt: true, startW: [Ft, 1], endW: [Te, 1],
  });
  // laces across the instep (boxes), the tongue standing proud above them
  if (sh.feet !== 'shoe') {
    const topAt = (z: number) => {
      let i = 0; while (i < rows.length - 2 && rows[i + 1].z < z) i++;
      const a = rows[i], bb = rows[i + 1], f = clamp01((z - a.z) / (bb.z - a.z || 1));
      return { top: (a.top + (bb.top - a.top) * f) * fs, rx: (a.rx + (bb.rx - a.rx) * f) * fs };
    };
    const n = 4;
    const z0 = 0.0, z1 = 0.1;
    const lace = subR(reg, 0.9, 0.9, 1, 1);
    for (let i = 0; i < n; i++) {
      const z = z0 + ((z1 - z0) * i) / Math.max(1, n - 1);
      const h0 = topAt(z - 0.012), h1 = topAt(z + 0.012);
      const slope = Math.atan2(h0.top - h1.top, 0.024 * fs);
      const c: V3 = [fp[0], fp[1] + topAt(z).top + 0.0032 * s, fp[2] + z * fs];
      const m = new THREE.Matrix4().makeRotationX(slope).multiply(new THREE.Matrix4().makeRotationY(i & 1 ? 0.2 : -0.2));
      B.box(c, [topAt(z).rx * 0.62, 0.004 * s, 0.006 * s], lace, [Ft, 1], m);
    }
  }
}
