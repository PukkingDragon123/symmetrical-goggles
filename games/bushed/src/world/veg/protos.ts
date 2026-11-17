// Ground-cover prototypes: procedural geometry for grass clumps (curved blade strips), sword ferns and bracken
// (arched fronds), fireweed, bunchberry, blueberry, juniper, alder, moss mounds, mushrooms, bracket fungi, cones,
// twigs, litter, lichen, clubmoss, fractured granite boulders, fallen mossy logs and stumps.
// Every function returns MeshBuilders in local space (origin on the ground, +Y up).
import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { Noise, clamp, lerp, smoothstep } from '../../core/noise';
import { MeshBuilder, card, tube, v3, type Col, type V3 } from '../../trees/geom';
import { vegRect, type VegCell } from './atlas';
import { SPECIES, type SpeciesId } from '../../trees/species';

const UP = new THREE.Vector3(0, 1, 0);

function jitterCol(rng: Rng, c: Col, k = 0.12, h = 0.05): Col {
  const b = 1 + rng.range(-k, k), hh = rng.range(-h, h);
  return [c[0] * b * (1 + hh), c[1] * b, c[2] * b * (1 - hh)];
}

// --------------------------------------------------------------------------------------------- strips
/** a bent strip (frond / blade) along pts with a constant side vector, uv along v */
function strip(mb: MeshBuilder, pts: V3[], side: V3, widths: number[], rect: [number, number, number, number], uSpan: [number, number],
  col0: Col, col1: Col, windFn: (t: number, p: V3) => [number, number, number, number], bendN = 0.6): void {
  const [u0, v0, u1, v1] = rect;
  const ua = lerp(u0, u1, uSpan[0]), ub = lerp(u0, u1, uSpan[1]);
  let prev: [number, number] | null = null;
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const tan = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const n = side.clone().cross(tan).normalize();
    if (n.y < 0) n.negate();
    n.multiplyScalar(1 - bendN).add(UP.clone().multiplyScalar(bendN)).normalize();
    const col: Col = [lerp(col0[0], col1[0], t), lerp(col0[1], col1[1], t), lerp(col0[2], col1[2], t)];
    const w = widths[i] / 2;
    const v = lerp(v0, v1, t);
    const a = mb.vert(pts[i].clone().addScaledVector(side, -w), n, ua, v, col, windFn(t, pts[i]));
    const b = mb.vert(pts[i].clone().addScaledVector(side, w), n, ub, v, col, windFn(t, pts[i]));
    if (prev) mb.quad(prev[0], prev[1], b, a);
    prev = [a, b];
  }
}

// --------------------------------------------------------------------------------------------- plants
export function grassClump(seed: number, cells: VegCell[], n: number, h: number, spread: number, tint: Col = [1, 1, 1]): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const phase = rng.next();
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), r0 = Math.sqrt(rng.next()) * spread;
    const base = v3(Math.cos(a) * r0, -0.02, Math.sin(a) * r0);
    const la = a + rng.range(-0.8, 0.8);
    const lean = v3(Math.cos(la), 0, Math.sin(la));
    const hh = h * rng.range(0.55, 1.1);
    const lk = rng.range(0.15, 0.55) * (0.5 + r0 / Math.max(0.01, spread));
    const f = rng.range(0, Math.PI);
    const side = v3(Math.cos(f), 0, Math.sin(f));
    const pts: V3[] = [], ws: number[] = [];
    const w = rng.range(0.09, 0.14) * (h > 0.5 ? 1.25 : 1);
    for (let k = 0; k <= 2; k++) {
      const t = k / 2;
      pts.push(base.clone().addScaledVector(lean, lk * hh * t * t).addScaledVector(UP, hh * t * (1 - 0.18 * lk * t)));
      ws.push(w * (1 - 0.25 * t));
    }
    const cell = rng.pick(cells);
    const us = rng.range(0, 0.3);
    const c0 = jitterCol(rng, [0.62 * tint[0], 0.62 * tint[1], 0.6 * tint[2]], 0.1);
    const c1: Col = [c0[0] * 1.7, c0[1] * 1.7, c0[2] * 1.65];
    strip(mb, pts, side, ws, vegRect(cell), [us, us + 0.7], c0, c1, (t) => [t * t * hh * 0.35, t * t * hh, t * 0.25, phase], 0.75);
  }
  return mb;
}

export function swordFern(seed: number, cell: VegCell, n: number, len: number): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const phase = rng.next();
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const el = rng.range(0.75, 1.25);
    const L = len * rng.range(0.7, 1.1);
    const hd = v3(Math.cos(az), 0, Math.sin(az));
    const side = v3(-hd.z, 0, hd.x);
    const roll = rng.range(-0.35, 0.35);
    const sideR = side.clone().applyAxisAngle(hd, roll);
    const pts: V3[] = [];
    let p = hd.clone().multiplyScalar(0.03).setY(0.02);
    let a = el;
    const N = 6;
    for (let k = 0; k <= N; k++) {
      pts.push(p.clone());
      p = p.clone().addScaledVector(hd, Math.cos(a) * L / N).addScaledVector(UP, Math.sin(a) * L / N);
      a -= (el + rng.range(0.15, 0.55)) / N * 1.1;
    }
    const ws = pts.map(() => L * 0.24);
    const c0 = jitterCol(rng, [0.55, 0.6, 0.5], 0.12), c1 = jitterCol(rng, [1.05, 1.08, 0.98], 0.1);
    strip(mb, pts, sideR, ws, vegRect(cell), [0, 1], c0, c1, (t) => [t * t * L * 0.18, t * L * 0.5, t * 0.5, phase], 0.55);
  }
  return mb;
}

export function bracken(seed: number, n: number, hgt: number): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const phase = rng.next();
  for (let i = 0; i < n; i++) {
    const bx = rng.range(-0.25, 0.25), bz = rng.range(-0.25, 0.25);
    const hs = hgt * rng.range(0.65, 1.1);
    const az = rng.range(0, Math.PI * 2);
    const hd = v3(Math.cos(az), 0, Math.sin(az));
    const top = v3(bx, hs, bz).addScaledVector(hd, hs * 0.18);
    const stipe = [v3(bx, -0.02, bz), v3(bx, hs * 0.5, bz).addScaledVector(hd, hs * 0.04), top];
    tube(mb, stipe, [0.006, 0.005, 0.004], {
      sides: 3, tile: [0.2, 0.6], col: () => [0.45, 0.42, 0.22], wind: (_, s) => [s * s * hs * 0.2, s * hs, 0, phase],
    });
    // the blade: near-horizontal triangular card, rachis continuing from the stipe, drooping
    const L = hs * rng.range(0.7, 1.0);
    const side = v3(-hd.z, 0, hd.x);
    const pts: V3[] = [];
    const tilt = rng.range(0.15, 0.45);
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      pts.push(top.clone().addScaledVector(hd, L * t * Math.cos(tilt * (0.3 + t))).addScaledVector(UP, -L * Math.sin(tilt) * t * t + L * 0.05 * t));
    }
    const c0 = jitterCol(rng, [0.8, 0.85, 0.7], 0.12), c1 = jitterCol(rng, [1.08, 1.1, 0.9], 0.1);
    // bracken is horizontal: the side vector spans the blade's width
    const r = vegRect('bracken');
    strip(mb, pts, side, pts.map(() => L), r, [0, 1], c0, c1, (t) => [(0.6 + t) * hs * 0.12, hs + t * L * 0.3, t * 0.6, phase], 0.35);
  }
  return mb;
}

/** crossed vertical cards (fireweed, clubmoss, lichen, aster) */
export function crossed(seed: number, cell: VegCell, n: number, h: number, w: number, spread: number, planes = 2, tint: Col = [1, 1, 1], flutter = 0.4): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const phase = rng.next();
  const [u0, v0, u1, v1] = vegRect(cell);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), r0 = Math.sqrt(rng.next()) * spread;
    const bx = Math.cos(a) * r0, bz = Math.sin(a) * r0;
    const hh = h * rng.range(0.75, 1.15), ww = w * rng.range(0.85, 1.1);
    const rot0 = rng.range(0, Math.PI);
    const col = jitterCol(rng, tint, 0.1);
    const lean = v3(rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)).multiplyScalar(hh);
    for (let p = 0; p < planes; p++) {
      const f = rot0 + (p / planes) * Math.PI;
      const s = v3(Math.cos(f), 0, Math.sin(f)).multiplyScalar(ww / 2);
      const nrm = v3(-Math.sin(f), 0.6, Math.cos(f)).normalize();
      const b = v3(bx, -0.02, bz);
      const t = b.clone().add(lean).setY(hh);
      const a0 = mb.vert(b.clone().sub(s), nrm, u0, v0, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], [0, 0, 0, phase]);
      const a1 = mb.vert(b.clone().add(s), nrm, u1, v0, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], [0, 0, 0, phase]);
      const a2 = mb.vert(t.clone().add(s), nrm, u1, v1, col, [hh * 0.3, hh, flutter, phase]);
      const a3 = mb.vert(t.clone().sub(s), nrm, u0, v1, col, [hh * 0.3, hh, flutter, phase]);
      mb.quad(a0, a1, a2, a3);
    }
  }
  return mb;
}

/** low horizontal rosettes (bunchberry, litter, twigs, needles) lying on the ground */
export function flats(seed: number, cells: VegCell[], n: number, size: [number, number], spread: number, y: [number, number], tilt = 0.15, tint: Col = [1, 1, 1], aspect = 1): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const phase = rng.next();
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), r0 = Math.sqrt(rng.next()) * spread;
    const c = v3(Math.cos(a) * r0, rng.range(y[0], y[1]), Math.sin(a) * r0);
    const s = rng.range(size[0], size[1]);
    const f = rng.range(0, Math.PI * 2);
    const ax = v3(Math.cos(f), 0, Math.sin(f)), az = v3(-Math.sin(f), 0, Math.cos(f));
    const tl = v3(rng.range(-tilt, tilt), 0, rng.range(-tilt, tilt));
    const [u0, v0, u1, v1] = vegRect(rng.pick(cells));
    const col = jitterCol(rng, tint, 0.12);
    const hx = s / 2, hz = s / 2 / aspect;
    const corner = (sx: number, sz: number) => c.clone().addScaledVector(ax, sx * hx).addScaledVector(az, sz * hz).add(v3(0, (sx * tl.x + sz * tl.z) * s * 0.5, 0));
    const nrm = v3(-tl.x, 1, -tl.z).normalize();
    const w: [number, number, number, number] = [c.y * 0.3, c.y, 0.08, phase];
    const i0 = mb.vert(corner(-1, -1), nrm, u0, v0, col, w);
    const i1 = mb.vert(corner(1, -1), nrm, u1, v0, col, w);
    const i2 = mb.vert(corner(1, 1), nrm, u1, v1, col, w);
    const i3 = mb.vert(corner(-1, 1), nrm, u0, v1, col, w);
    mb.quad(i0, i1, i2, i3);
  }
  return mb;
}

/** radiating sprig cards (blueberry, juniper, young shrubs) */
export function sprigBush(seed: number, cells: VegCell[], n: number, len: [number, number], el: [number, number], tint: Col = [1, 1, 1], spread = 0.08): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const phase = rng.next();
  for (let i = 0; i < n; i++) {
    const az = rng.range(0, Math.PI * 2);
    const e = rng.range(el[0], el[1]);
    const d = v3(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e));
    const L = rng.range(len[0], len[1]);
    const p = v3(rng.range(-spread, spread), rng.range(0, 0.04), rng.range(-spread, spread));
    const nrm = UP.clone().applyAxisAngle(d, rng.range(-0.6, 0.6));
    const col = jitterCol(rng, tint, 0.12);
    const tipH = p.y + d.y * L;
    card(mb, {
      p, d, n: nrm, len: L, wid: L * 0.5, rect: vegRect(rng.pick(cells)), fold: rng.range(-0.4, 0.3),
      bend: v3(d.x, 0.8, d.z).normalize(), bendAmt: 0.6, col: [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75], colTip: col,
      windBase: [0, Math.max(0, p.y), 0.1, phase], windTip: [tipH * 0.25, Math.max(0.1, tipH), 0.6, phase], flipV: rng.chance(0.5),
    });
  }
  return mb;
}

/** alder / willow clump: several grey stems with leaf clusters on the upper half */
export function alder(seed: number, h: number): { wood: MeshBuilder; leaves: MeshBuilder } {
  const rng = new Rng(seed);
  const wood = new MeshBuilder(), leaves = new MeshBuilder();
  const phase = rng.next();
  const ns = rng.int(3, 6);
  for (let i = 0; i < ns; i++) {
    const az = rng.range(0, Math.PI * 2);
    const tilt = rng.range(0.1, 0.4);
    const hh = h * rng.range(0.65, 1.05);
    const d = v3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
    const base = v3(rng.range(-0.15, 0.15), -0.05, rng.range(-0.15, 0.15));
    const pts: V3[] = [];
    for (let k = 0; k <= 4; k++) pts.push(base.clone().addScaledVector(d, hh * k / 4).add(v3(0, 0, 0)).addScaledVector(v3(Math.cos(az), 0, Math.sin(az)), Math.pow(k / 4, 2) * hh * 0.15));
    const r0 = 0.015 + hh * 0.008;
    tube(wood, pts, pts.map((_, k) => r0 * (1 - k / 5)), {
      sides: 4, tile: [0.6, 1.2], col: () => [0.75, 0.75, 0.72], wind: (_, s) => [s * s * hh * 0.08, s * hh * 0.3, 0, phase],
    });
    for (let k = 0; k < 9; k++) {
      const t = rng.range(0.35, 1);
      const p = pts[0].clone().lerp(pts[4], t);
      const a2 = rng.range(0, Math.PI * 2);
      const dd = v3(Math.cos(a2), rng.range(-0.1, 0.6), Math.sin(a2)).normalize();
      const L = rng.range(0.35, 0.55) * clamp(h / 2.5, 0.6, 1.2);
      const col = jitterCol(rng, [1, 1, 1], 0.1);
      card(leaves, {
        p, d: dd, n: UP.clone().applyAxisAngle(dd, rng.range(-0.5, 0.5)), len: L, wid: L * 0.5, rect: vegRect('alder'), fold: rng.range(-0.3, 0.3),
        bend: v3(dd.x, 0.6, dd.z).normalize(), bendAmt: 0.6, col: [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], colTip: col,
        windBase: [t * t * hh * 0.08, t * hh * 0.3, 0.2, phase], windTip: [t * t * hh * 0.08 + 0.02, t * hh * 0.3 + 0.1, 1, phase],
      });
    }
  }
  return { wood, leaves };
}

// --------------------------------------------------------------------------------------------- lathes
function lathe(mb: MeshBuilder, prof: [number, number][], segs: number, rect: [number, number, number, number], vSpan: [number, number],
  col: Col, wind: [number, number, number, number], a0 = 0, a1 = Math.PI * 2, offset = v3(), tiltAxis?: V3, tilt = 0): void {
  const [u0, v0, u1, v1] = rect;
  const rows: number[][] = [];
  for (let i = 0; i < prof.length; i++) {
    const [r, y] = prof[i];
    const [rp, yp] = prof[Math.max(0, i - 1)], [rn, yn] = prof[Math.min(prof.length - 1, i + 1)];
    const dr = rn - rp, dy = yn - yp;
    const row: number[] = [];
    for (let j = 0; j <= segs; j++) {
      const a = a0 + (a1 - a0) * (j / segs);
      const c = Math.cos(a), s = Math.sin(a);
      const p = v3(c * r, y, s * r);
      const n = v3(c * dy, -dr, s * dy).normalize();
      if (tiltAxis) { p.applyAxisAngle(tiltAxis, tilt); n.applyAxisAngle(tiltAxis, tilt); }
      p.add(offset);
      const u = lerp(u0, u1, j / segs);
      const v = lerp(v1, v0, lerp(vSpan[0], vSpan[1], i / (prof.length - 1)));
      row.push(mb.vert(p, n, u, v, col, wind));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < segs; j++) mb.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
}

export function mushrooms(seed: number, kind: 'agaric' | 'chanterelle', n: number): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const rect = vegRect(kind);
  for (let i = 0; i < n; i++) {
    const off = v3(rng.range(-0.12, 0.12), 0, rng.range(-0.12, 0.12));
    const s = rng.range(0.6, 1.2);
    const tiltAx = v3(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize();
    const tilt = rng.range(0, 0.25);
    if (kind === 'agaric') {
      const h = 0.14 * s, r = 0.06 * s;
      const flat = rng.next(); // young (domed) .. old (flat)
      lathe(mb, [[0.012 * s, -0.02], [0.016 * s, h * 0.1], [0.011 * s, h * 0.6], [0.01 * s, h]], 6, rect, [0.78, 1], [1, 1, 1], [0, 0, 0, 0], 0, Math.PI * 2, off, tiltAx, tilt);
      const dome = lerp(0.75, 0.25, flat);
      lathe(mb, [[0.001, h + r * dome], [r * 0.5, h + r * dome * 0.86], [r * 0.85, h + r * dome * 0.45], [r, h + r * 0.05], [r * 0.95, h - r * 0.08], [0.01 * s, h - r * 0.02]], 10, rect, [0, 1], [1, 1, 1], [0, 0, 0, 0], 0, Math.PI * 2, off, tiltAx, tilt);
    } else {
      const h = 0.07 * s, r = 0.035 * s;
      lathe(mb, [[0.008 * s, -0.01], [0.01 * s, h * 0.5], [r * 0.6, h * 0.85], [r, h], [r * 1.05, h + r * 0.2], [r * 0.6, h + r * 0.12], [0.002, h + r * 0.05]], 9, rect, [1, 0], [1, 1, 1], [0, 0, 0, 0], 0, Math.PI * 2, off, tiltAx, tilt);
    }
  }
  return mb;
}

/** shelf fungus: a half-disc bracket (attach so local +Z points away from the wood) */
export function bracket(seed: number, n: number): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const rect = vegRect('bracket');
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.06, 0.16);
    const off = v3(rng.range(-0.08, 0.08), i * rng.range(0.06, 0.12), 0);
    lathe(mb, [[0.0, 0.02 * r / 0.1], [r * 0.6, 0.018 * r / 0.1], [r, 0.0], [r * 0.9, -0.012 * r / 0.1], [0.0, -0.01]], 8, rect, [0, 1], jitterCol(rng, [1, 1, 1], 0.1), [0, 0, 0, 0], 0, Math.PI, off);
  }
  return mb;
}

export function cones(seed: number, n: number, spread: number): MeshBuilder {
  const rng = new Rng(seed);
  const mb = new MeshBuilder();
  const rect = vegRect('cone');
  for (let i = 0; i < n; i++) {
    const l = rng.range(0.04, 0.08);
    const prof: [number, number][] = [[0.002, 0], [l * 0.22, l * 0.15], [l * 0.26, l * 0.45], [l * 0.18, l * 0.8], [0.002, l]];
    const off = v3(rng.range(-spread, spread), l * 0.2, rng.range(-spread, spread));
    lathe(mb, prof, 6, rect, [0, 1], jitterCol(rng, [1, 1, 1], 0.15), [0, 0, 0, 0], 0, Math.PI * 2, off, v3(Math.cos(i), 0, Math.sin(i)), Math.PI / 2 + rng.range(-0.2, 0.2));
  }
  return mb;
}

// --------------------------------------------------------------------------------------------- moss
/** a lumpy moss cushion (polar grid, irregular outline, edges tucked into the ground) */
export function mossMound(seed: number, r: number, h: number): MeshBuilder {
  const rng = new Rng(seed);
  const nz = new Noise(seed);
  const mb = new MeshBuilder();
  const R = 7, S = 14;
  const rows: number[][] = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const row: number[] = [];
    for (let j = 0; j <= S; j++) {
      const a = (j / S) * Math.PI * 2;
      const rr = r * t * (1 + 0.25 * nz.n2(Math.cos(a) * 1.3, Math.sin(a) * 1.3));
      const hh = h * Math.pow(Math.max(0, 1 - t * t), 0.7) * (1 + 0.3 * nz.n2(Math.cos(a) * 2 + t * 3, Math.sin(a) * 2)) - (t > 0.95 ? 0.04 : 0);
      const p = v3(Math.cos(a) * rr, hh, Math.sin(a) * rr);
      const n = v3(Math.cos(a) * t * 0.8, 1, Math.sin(a) * t * 0.8).normalize();
      const c = 0.75 + 0.3 * (1 - t);
      row.push(mb.vert(p, n, p.x / 1.6, p.z / 1.6, [c, c, c], [0, 0, 0, 0], 1));
    }
    rows.push(row);
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) mb.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  void rng;
  return mb;
}

// --------------------------------------------------------------------------------------------- rocks
/** fractured Canadian-Shield granite boulder: subdivided octahedron, cut by random planes, noise-displaced */
export function boulder(seed: number, size: number, flat = 0.6): MeshBuilder {
  const rng = new Rng(seed);
  const nz = new Noise(seed + 5);
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const planes: { n: V3; d: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const n = v3(rng.range(-1, 1), rng.range(-0.4, 1), rng.range(-1, 1)).normalize();
    planes.push({ n, d: rng.range(0.55, 0.85) });
  }
  const sx = rng.range(0.8, 1.3), sz = rng.range(0.8, 1.3);
  for (let i = 0; i < pos.count; i++) {
    const p = v3(pos.getX(i), pos.getY(i), pos.getZ(i));
    p.multiplyScalar(1 + 0.18 * nz.n3(p.x * 1.4, p.y * 1.4, p.z * 1.4) + 0.05 * nz.n3(p.x * 4, p.y * 4, p.z * 4));
    for (const pl of planes) {
      const d = p.dot(pl.n);
      if (d > pl.d) p.addScaledVector(pl.n, pl.d - d);
    }
    p.set(p.x * sx, p.y * flat, p.z * sz);
    if (p.y < -0.25 * flat) p.y = -0.25 * flat + (p.y + 0.25 * flat) * 0.3;
    p.multiplyScalar(size);
    pos.setXYZ(i, p.x, p.y + size * flat * 0.2, p.z);
  }
  const g2 = geo.toNonIndexed();
  g2.computeVertexNormals();
  const mb = new MeshBuilder();
  const P = g2.attributes.position as THREE.BufferAttribute, N = g2.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i += 3) {
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) {
      const p = v3(P.getX(i + k), P.getY(i + k), P.getZ(i + k));
      const n = v3(N.getX(i + k), N.getY(i + k), N.getZ(i + k));
      const ao = clamp(0.62 + 0.38 * smoothstep(-0.1 * size, 0.5 * size, p.y), 0, 1);
      ids.push(mb.vert(p, n, 0, 0, [ao, ao, ao], [0, 0, 0, 0]));
    }
    mb.tri(ids[0], ids[1], ids[2]);
  }
  geo.dispose();
  g2.dispose();
  return mb;
}

// --------------------------------------------------------------------------------------------- deadwood
export interface LogSpec { species: SpeciesId; len: number; r: number; seed: number; rot: number; moss: number }

/**
 * fallen log lying along local +X from x = 0 to len, partly sunk, with a rotten broken end and a few stubs.
 * Uses the species bark (tree bark material: aMoss -> moss on the upper surface).
 */
export function fallenLog(o: LogSpec): { wood: MeshBuilder; tufts: MeshBuilder; ends: [V3, V3] } {
  const rng = new Rng(o.seed);
  const nz = new Noise(o.seed + 17);
  const sp = SPECIES[o.species];
  const wood = new MeshBuilder();
  const tufts = new MeshBuilder();
  const N = 14, rings = Math.max(6, Math.round(o.len / 1.1));
  const tile = sp.barkTile;
  const wraps = Math.max(1, Math.round((2 * Math.PI * o.r) / tile[0]));
  const rows: number[][] = [];
  const sink = o.r * rng.range(0.2, 0.4);
  const bow = rng.range(-0.15, 0.15) * o.r;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const x = t * o.len;
    const r = o.r * (1.08 - 0.3 * t) * (1 + 0.05 * nz.n2(t * 6, 0.5));
    const cy = r - sink + Math.sin(t * Math.PI) * bow;
    const cz = 0.06 * o.len * nz.n2(t * 1.7, 3.1) * 0.3;
    const row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * Math.PI * 2;
      const m = 1 + 0.06 * Math.cos(2 * a + o.seed) + 0.05 * nz.n2(Math.cos(a) * 1.4 + t * 5, Math.sin(a) * 1.4);
      const y = cy + Math.sin(a) * r * m * 0.92, z = cz + Math.cos(a) * r * m;
      const n = v3(0, Math.sin(a), Math.cos(a));
      // missing bark patches (bleached wood) on old logs
      const bare = nz.n2(t * 4 + 11, a * 0.8) > 0.45 ? 1 : 0;
      const ao = 0.6 + 0.4 * smoothstep(-0.6, 0.6, Math.sin(a));
      const col: Col = bare ? [1.25 * ao, 1.05 * ao, 0.82 * ao] : [ao, ao, ao];
      const mossv = o.moss * (0.5 + 0.7 * Math.max(0, Math.sin(a)));
      row.push(wood.vert(v3(x, y, z), n, (j / N) * wraps, x / tile[1], col, [0, 0, 0, 0], mossv));
    }
    rows.push(row);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < N; j++) wood.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  // end caps: broken, rotten (jagged fans)
  const capEnd = (i: number, dir: number) => {
    const row = rows[i];
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < N; j++) { const p = wood.pos; cx += p[row[j] * 3]; cy += p[row[j] * 3 + 1]; cz += p[row[j] * 3 + 2]; }
    cx /= N; cy /= N; cz /= N;
    const c = wood.vert(v3(cx + dir * o.r * rng.range(0.1, 0.5), cy, cz), v3(dir, 0, 0), 0.5, 0.5, [1.3, 0.95, 0.65], [0, 0, 0, 0], 0.3);
    for (let j = 0; j < N; j++) dir > 0 ? wood.tri(row[j], row[j + 1], c) : wood.tri(row[j + 1], row[j], c);
  };
  capEnd(0, -1);
  capEnd(rings, 1);
  // branch stubs along the top half
  const nStub = Math.round(o.len / 2.5);
  for (let k = 0; k < nStub; k++) {
    const t = rng.range(0.15, 0.9);
    const a = rng.range(0.2, Math.PI - 0.2);
    const x = t * o.len;
    const r = o.r * (1.08 - 0.3 * t);
    const base = v3(x, r - sink + Math.sin(a) * r * 0.85, Math.cos(a) * r * 0.9);
    const d = v3(rng.range(-0.3, 0.6), Math.sin(a), Math.cos(a)).normalize();
    const L = rng.range(0.2, 0.7);
    tube(wood, [base, base.clone().addScaledVector(d, L * 0.5), base.clone().addScaledVector(d, L)], [r * 0.12 + 0.02, r * 0.09, 0.01], {
      sides: 4, tile, col: () => [0.85, 0.8, 0.75], wind: () => [0, 0, 0, 0], moss: () => o.moss * 0.6,
    });
  }
  // moss tufts and lichen along the top for a fuzzy silhouette
  const nT = Math.round(o.len * 2.2 * o.moss);
  const [u0, v0, u1, v1] = vegRect('moss_tuft');
  for (let k = 0; k < nT; k++) {
    const t = rng.range(0.03, 0.97);
    const a = Math.PI / 2 + rng.range(-0.9, 0.9);
    const x = t * o.len;
    const r = o.r * (1.08 - 0.3 * t);
    const c = v3(x, r - sink + Math.sin(a) * r * 0.9, Math.cos(a) * r * 0.95);
    const w = rng.range(0.25, 0.5), h = w * 0.45;
    const f = rng.range(-0.5, 0.5);
    const s = v3(Math.cos(f), 0, Math.sin(f)).multiplyScalar(w / 2);
    const nrm = v3(0, Math.sin(a), Math.cos(a));
    const up = nrm.clone().multiplyScalar(h);
    const col = jitterCol(rng, [1, 1, 1], 0.12);
    const i0 = tufts.vert(c.clone().sub(s).addScaledVector(nrm, -0.03), nrm, u0, v0, col, [0, 0, 0, 0]);
    const i1 = tufts.vert(c.clone().add(s).addScaledVector(nrm, -0.03), nrm, u1, v0, col, [0, 0, 0, 0]);
    const i2 = tufts.vert(c.clone().add(s).add(up), nrm, u1, v1, col, [0, 0.02, 0.15, 0]);
    const i3 = tufts.vert(c.clone().sub(s).add(up), nrm, u0, v1, col, [0, 0.02, 0.15, 0]);
    tufts.quad(i0, i1, i2, i3);
  }
  return { wood, tufts, ends: [v3(0, o.r - sink, 0), v3(o.len, o.r * 0.78 - sink, 0)] };
}

/** a stump: flared, lobed, cut flat (old logging) or broken and rotten; returns wood and (for cut stumps) the top disc */
export function stump(species: SpeciesId, seed: number, r: number, h: number, cut: boolean, moss: number): { wood: MeshBuilder; top: MeshBuilder | null; tufts: MeshBuilder } {
  const rng = new Rng(seed);
  const nz = new Noise(seed + 3);
  const sp = SPECIES[species];
  const wood = new MeshBuilder(), tufts = new MeshBuilder();
  const N = 16;
  const ys = [-0.25, 0, 0.05, 0.12, 0.22, 0.35, 0.5, 0.7, 1.0].map((y) => y * Math.max(1, h / 0.7)).filter((y) => y < h);
  ys.push(h);
  const lobes = rng.int(sp.lobes[0], sp.lobes[1]);
  const lph = rng.range(0, 6.28);
  const wraps = Math.max(1, Math.round((2 * Math.PI * r) / sp.barkTile[0]));
  const rows: number[][] = [];
  const topY: number[] = [];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    const fl = Math.exp(-Math.max(0, y) / (0.35 + r * 0.5)) * 0.55;
    const row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * Math.PI * 2;
      const lob = Math.pow(Math.max(0, Math.cos(a * lobes / 2 + lph)), 6) * fl * 1.6;
      const R = r * (1 + fl * 0.5 + lob + 0.04 * nz.n2(Math.cos(a) * 2 + y, Math.sin(a) * 2));
      let yy = y;
      if (i === ys.length - 1) {
        yy = cut ? h + 0.02 * nz.n2(Math.cos(a), Math.sin(a)) : h * (1 + 0.35 * nz.n2(Math.cos(a) * 2.5, Math.sin(a) * 2.5)) - r * 0.1;
        topY.push(yy);
      }
      const n = v3(Math.cos(a), lob * 0.6 + fl * 0.4, Math.sin(a)).normalize();
      const ao = 0.62 + 0.38 * smoothstep(-0.2, 0.4, y);
      row.push(wood.vert(v3(Math.cos(a) * R, yy, Math.sin(a) * R), n, (j / N) * wraps, (yy + 0.3) / sp.barkTile[1], [ao, ao, ao], [0, 0, 0, 0], moss * (1 - smoothstep(0, h, y) * 0.5)));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < N; j++) wood.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
  const last = rows[rows.length - 1];
  let top: MeshBuilder | null = null;
  if (cut) {
    // the saw cut: a separate disc for the end-grain material (weathered grey via vertex colour)
    top = new MeshBuilder();
    const P = wood.pos;
    const c = top.vert(v3(0, h + 0.01, 0), UP, 0.5, 0.5, [0.72, 0.7, 0.68], [0, 0, 0, 0]);
    const ring: number[] = [];
    let rmax = 0;
    for (let j = 0; j <= N; j++) rmax = Math.max(rmax, Math.hypot(P[last[j] * 3], P[last[j] * 3 + 2]));
    for (let j = 0; j <= N; j++) {
      const x = P[last[j] * 3], z = P[last[j] * 3 + 2];
      ring.push(top.vert(v3(x, P[last[j] * 3 + 1] + 0.005, z), UP, 0.5 + x / (2 * rmax), 0.5 + z / (2 * rmax), [0.66, 0.64, 0.62], [0, 0, 0, 0]));
    }
    for (let j = 0; j < N; j++) top.tri(c, ring[j + 1], ring[j]);
  } else {
    // rotten broken top: a sunken fan in rotten-wood colour
    const c = wood.vert(v3(0, h * 0.75, 0), UP, 0.5, 0.5, [1.2, 0.85, 0.6], [0, 0, 0, 0], moss);
    for (let j = 0; j < N; j++) wood.tri(last[j], last[j + 1], c);
  }
  // moss tufts on the top / roots
  const [u0, v0, u1, v1] = vegRect('moss_tuft');
  const nT = Math.round(4 + 10 * moss);
  for (let k = 0; k < nT; k++) {
    const a = rng.range(0, Math.PI * 2);
    const onTop = rng.chance(0.5);
    const rr = onTop ? r * rng.range(0.2, 0.9) : r * rng.range(1.1, 1.6);
    const y = onTop ? (cut ? h : h * 0.8) : rng.range(0, 0.12);
    const c = v3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const w = rng.range(0.15, 0.35), hh = w * 0.4;
    const s = v3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(w / 2);
    const col = jitterCol(rng, [1, 1, 1], 0.1);
    const i0 = tufts.vert(c.clone().sub(s), UP, u0, v0, col, [0, 0, 0, 0]);
    const i1 = tufts.vert(c.clone().add(s), UP, u1, v0, col, [0, 0, 0, 0]);
    const i2 = tufts.vert(c.clone().add(s).setY(y + hh), UP, u1, v1, col, [0, 0.02, 0.1, 0]);
    const i3 = tufts.vert(c.clone().sub(s).setY(y + hh), UP, u0, v1, col, [0, 0.02, 0.1, 0]);
    tufts.quad(i0, i1, i2, i3);
  }
  return { wood, top, tufts };
}
