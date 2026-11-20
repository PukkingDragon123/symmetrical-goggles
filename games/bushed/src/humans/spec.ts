// HumanLook (BUSHED's bush-country vocabulary: setts, suspenders, toques, logger boots...) -> the Gacha Garage
// people Spec that the body plan, the atlas painter and the face painter read (./gg).
import type { HumanLook } from './looks';
import type { Spec, RGB, Check, Top, Outer, Bottom, Shoes, Hat, FaceSpec, Acc, Gloves } from './gg/types';

const rgb = (h: string): RGB => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cl = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

// Gacha Garage's skin palette, pale to deep
const SKIN: RGB[] = [[246, 220, 204], [243, 214, 192], [236, 200, 170], [224, 180, 142], [214, 163, 122], [192, 138, 96], [160, 106, 70], [140, 90, 60], [94, 58, 40]];
function skinOf(tone: number, ruddy: number): RGB {
  const t = cl(tone) * (SKIN.length - 1), i = Math.min(SKIN.length - 2, Math.floor(t));
  const c = mix(SKIN[i], SKIN[i + 1], t - i);
  return mix(c, [226, 128, 108], ruddy * 0.16 * (1 - tone * 0.6));
}
const check = (s: { stripes: [string, number][]; twill?: boolean; brushed?: number }): Check =>
  ({ stripes: s.stripes.map(([c, w]) => [rgb(c), w / 1000 * 1.35]), twill: s.twill, brushed: s.brushed });

const HAIR: Record<string, string> = { bald: 'bald', short: 'short', crew: 'buzz', receding: 'bald', thin: 'buzz', shaggy: 'messy', ponytail: 'ponytail' };

export function lookToSpec(L: HumanLook): Spec {
  const b = L.build, kid = b.s < 0.82;
  const sex = b.fem > 0.5 ? 'f' : 'm';
  const age = kid ? 'kid' : L.age >= 0.7 ? 'elder' : 'adult';
  const H = 1.78 * b.s * (kid ? 0.9 : 1);
  const hairCol = rgb(L.hair.color);
  const hair = { style: HAIR[L.hair.style] || 'short', col: hairCol, grey: L.hair.grey > 0.5 ? 1 : 0, part: L.seed % 2 ? 1 : -1, volume: 1,
    hi: L.hair.grey > 0.5 ? [250, 250, 248] as RGB : hairCol[0] < 80 ? mix(hairCol, [176, 180, 214], 0.75) : mix(hairCol, [255, 244, 222], 0.55) };
  const fh = L.facial;
  const face: FaceSpec = {
    iris: rgb(L.face.eye), lid: 'double', tilt: 0.25 + L.face.eyeTilt * 0.4, blush: 0.15 + L.skin.ruddy * 0.35,
    browW: 0.8 + L.face.brow * 0.35, lipFull: L.face.lips, wrinkles: L.age > 0.5 ? 1 : 0, spots: L.age > 0.8 ? 1 : 0,
    stubble: fh === 'stubble' ? 0.75 : fh === 'whiteStubble' ? 0.6 : fh === 'beard' || fh === 'fullBeard' ? 0.5 : fh === 'moustache' ? 0.3 : sex === 'm' && !kid ? 0.12 : 0,
    mustache: fh === 'walrus' ? 'walrus' : fh === 'moustache' || fh === 'beard' || fh === 'fullBeard',
    beard: fh === 'fullBeard' ? 1 : fh === 'beard' ? 0.55 : 0,
  };
  if (fh === 'whiteStubble') face.browCol = mix(hairCol, [200, 196, 190], 0.5);
  // tops
  const S = L.shirt;
  const top: Top = {
    kind: S.kind === 'tee' ? 'tee' : S.kind, col: S.color ? rgb(S.color) : S.sett ? rgb(S.sett.stripes[0][0]) : [120, 40, 30],
    sleeve: S.sleeve, tuck: S.tucked, under: S.undershirt ? rgb(S.undershirt) : undefined,
  };
  if (S.sett) top.check = check(S.sett);
  if (L.extras?.patch) top.patch = L.extras.patch;
  // the outer layer
  let outer: Outer | null = null;
  const OL = L.outer;
  if (OL.kind !== 'none') outer = { kind: OL.kind, col: rgb(OL.color || '#6a5034'), col2: OL.color2 ? rgb(OL.color2) : undefined, open: OL.open, check: OL.sett ? check(OL.sett) : undefined };
  // bottoms
  const bottom: Bottom = { kind: L.legs.kind === 'khaki' ? 'slacks' : L.legs.kind, col: rgb(L.legs.color), belt: L.belt ? rgb(L.belt) : undefined, stagged: L.legs.stagged, noCrease: true };
  if (L.legs.kind === 'coveralls') { bottom.col = top.col; top.tuck = true; }
  const shoes: Shoes = { kind: L.feet.kind === 'shoe' ? 'oxford' : L.feet.kind, col: rgb(L.feet.color), col2: L.feet.kind === 'hiker' ? mix(rgb(L.feet.color), [190, 60, 40], 0.5) : undefined };
  // hats
  const hk = L.hat.kind;
  const hat: Hat | null = hk === 'none' ? null : {
    kind: hk === 'toque' || hk === 'toquePom' ? 'toque' : hk === 'capFlaps' ? 'trapper' : 'cap',
    col: rgb(L.hat.color || '#2e3134'), col2: L.hat.color2 ? rgb(L.hat.color2) : undefined, pom: hk === 'toquePom',
  };
  const gloves: Gloves | null = L.hands.kind === 'bare' ? null : { kind: L.hands.kind === 'knit' ? 'knit' : 'work', col: rgb(L.hands.color || '#b8894f'), cuff: L.hands.kind === 'leather' ? mix(rgb(L.hands.color || '#b8894f'), [60, 40, 30], 0.35) : undefined };
  const acc: Acc[] = [];
  if (L.apron) acc.push({ kind: 'apron', col: rgb(L.apron) });
  const style = kid ? 'kid' : L.age > 0.75 ? 'elder' : b.mass > 1.15 ? 'heavy' : b.fem > 0.5 ? 'normal' : L.age < 0.15 ? 'young' : 'normal';
  return {
    id: L.name, name: L.name, seed: L.seed,
    sex, age, H, build: cl(0.55 + 0.25 * b.bw + 0.2 * b.mass, 0.85, 1.25), belly: b.belly * 1.1, bust: b.fem > 0.5 ? 0.9 : 0,
    skin: skinOf(L.skin.tone, L.skin.ruddy), hair, face,
    glasses: L.glasses === 'none' ? null : { kind: 'round', col: [150, 120, 70], thick: 1, chain: L.glasses === 'readingChain' },
    hat, top, outer, bottom, shoes, socks: { col: [120, 110, 100] }, legs: 'socks',
    acc, suspenders: L.suspenders ? rgb(L.suspenders) : null, gloves,
    wear: L.wear, grease: L.grease || 0,
    walk: { style, hunch: b.hunch },
    bulk: outer?.kind === 'parka' ? 1 : outer?.kind === 'mackinaw' ? 0.45 : outer?.kind === 'chore' ? 0.3 : outer?.kind === 'quiltVest' ? 0.35 : 0,
  };
}
