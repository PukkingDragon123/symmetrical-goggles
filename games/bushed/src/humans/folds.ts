// Cloth fold fields shared by the geometry (low-frequency bumps on the lofts) and the painter (cavity shading
// from the field's curvature + crisp fold lines), so painted creases sit exactly on the sculpted ones:
// blousing above a tucked waist, diagonal pulls from the armpits, the zig-zag buckling inside the elbows,
// stacked folds above cuffs and boot tops, knee folds, the roll of a rolled-up sleeve.
//
// All fields take an angle th (radians, 0 = front of the limb / body, + toward the body's left / the limb's
// outside) and a reference height y in that part's VMAP space; they return a radial offset in metres
// (reference scale, positive = outward).
import type { HumanLook } from './looks';
import type { Shape } from './shape';

const g = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** torso (shirt / coverall body): y = body reference y */
export function torsoFold(th: number, y: number, sh: Shape, L: HumanLook, hi = true): number {
  let f = 0;
  const a = Math.abs(wrap(th));
  // blousing: a tucked shirt gathers into soft vertical pleats over the waistband
  if (sh.tuck && sh.topKind !== 'coveralls') {
    const k = g(y, sh.waist + 0.035, 0.024);
    f += k * (0.004 + 0.0035 * Math.sin(th * 9 + 0.7) + (hi ? 0.0022 * Math.sin(th * 15 + 2.1) : 0));
  } else if (sh.topHem > sh.waist) {
    f += g(y, sh.topHem + 0.03, 0.03) * 0.0025 * Math.sin(th * 7 + 0.4);
  }
  // coverall: elastic waist gathers
  if (sh.topKind === 'coveralls') f += g(y, 1.0, 0.018) * (0.003 + 0.002 * Math.sin(th * 22));
  // pulls from the armpits toward the chest and the shoulder blades (diagonal)
  for (const sd of [1, -1]) {
    const as = wrap(th - sd * Math.PI / 2);
    const diag = Math.sin((y - 1.3) * 70 + as * 3.2 * sd);
    f += g(y, 1.29, 0.045) * g(as, 0, 0.55) * 0.0022 * diag;
  }
  // a little sag across the belly and the small of the back
  f += g(y, 1.12, 0.05) * g(a, Math.PI, 0.5) * 0.0018 * Math.sin(y * 120);
  // suspender straps: ridges
  if (L.suspenders) f += strapMask(th, y) * 0.004;
  return f;
}

/** suspender strap mask on the torso (0..1): front straps from the waist over the shoulders, an X at the back */
export function strapMask(th: number, y: number, widthDeg = 7): number {
  if (y < 0.94 || y > 1.47) return 0;
  const deg = (wrap(th) * 180) / Math.PI;
  let m = 0;
  for (const sd of [1, -1]) {
    // front: from 24 deg at the waist to 30 deg over the chest, sweeping to the top of the shoulder
    const front = 24 + 6 * Math.min(1, (y - 0.94) / 0.4) + (y > 1.36 ? (y - 1.36) * 260 : 0);
    // back: the straps cross between the shoulder blades (an X), meeting at 0.18 m below the collar
    const t = Math.max(0, Math.min(1, (y - 0.94) / 0.42));
    const back = 180 - (12 + 30 * t);
    const dF = Math.abs(deg - sd * front), dB = Math.abs(Math.abs(deg) - back) + (Math.sign(deg) === sd ? 0 : 999);
    m = Math.max(m, 1 - Math.min(dF, dB) / widthDeg);
  }
  return Math.max(0, Math.min(1, m * 2.2));
}

/** arm sleeve folds: y = arm-local reference y (shoulder 0, elbow -0.285, wrist -0.535) */
export function armFold(th: number, y: number, sh: Shape, hi = true): number {
  if (y < sh.sleeveY) return 0;
  let f = 0;
  const a = wrap(th), af = Math.abs(a);
  // inside the elbow: zig-zag buckling, strongest on the front of the joint
  const eb = g(y, -0.285, 0.05) * (0.35 + 0.65 * g(af, 0, 1.0));
  f += eb * 0.0042 * Math.sin((y + 0.285) * 160 + Math.abs(a) * 2.6);
  f += eb * (hi ? 0.0018 : 0) * Math.sin((y + 0.285) * 290 - a * 4.1);
  // stacked folds above a long sleeve's cuff
  if (sh.sleeveY < -0.45) f += g(y, sh.sleeveY + 0.04, 0.022) * 0.0035 * Math.sin(y * 260 + Math.sin(a * 3) * 1.6);
  // the rolled sleeve: a fat roll at the cuff
  if (sh.rolled) f += g(y, sh.sleeveY + 0.017, 0.011) * 0.011;
  // short sleeve hem lip
  if (sh.sleeveY > -0.2) f += g(y, sh.sleeveY + 0.012, 0.01) * 0.004;
  // pull folds from the armpit down the upper arm
  f += g(y, -0.07, 0.04) * g(Math.abs(wrap(a + Math.PI / 2)), 0, 0.7) * 0.002 * Math.sin(y * 140 + a * 2);
  return f;
}

/** trouser folds: y = thigh-local reference y (hip 0, knee -0.43, ankle -0.85) */
export function legFold(th: number, y: number, sh: Shape, hi = true): number {
  if (y < sh.legHem) return 0;
  let f = 0;
  const a = wrap(th), af = Math.abs(a);
  // behind the knee: horizontal folds; a softer set across the front
  f += g(y, -0.45, 0.04) * (g(af, Math.PI, 0.9) * 0.0035 + g(af, 0, 0.7) * 0.0016) * Math.sin(y * 150 + a * 1.5);
  // the crotch / hip pulls (whisker folds on the front of the thighs)
  f += g(y, -0.08, 0.05) * g(a, 0.25, 0.5) * 0.0018 * Math.sin(y * 110 - a * 4);
  // trousers bunching above the hem / over a boot top
  const bunch = sh.stagged ? sh.legHem + 0.02 : (sh.bootTop > -0.86 ? sh.bootTop + 0.04 : sh.legHem + 0.05);
  f += g(y, bunch, 0.03) * (0.004 + (hi ? 0.0025 : 0) * Math.sin(y * 230 + Math.sin(a * 2) * 2));
  return f;
}
