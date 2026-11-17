// Garment geometry derived from a look (reference metres): hems, thicknesses, sleeve length, collar, boots.
import type { HumanLook, OuterKind, LegKind, FeetKind, ShirtKind } from './looks';

export interface Shape {
  topKind: ShirtKind;
  waist: number; topHem: number; topThick: number; tuck: boolean;
  /** arm-local y where the outermost sleeve ends */
  sleeveY: number; rolled: boolean; armThick: number; outerSleeve: boolean;
  outer: OuterKind; outerHem: number; outerThick: number; open: boolean;
  legKind: LegKind; legHem: number; legThick: number; stagged: boolean;
  bootTop: number; bootThick: number; feet: FeetKind; soleH: number; heelH: number;
  collar: 'shirt' | 'henley' | 'crew' | 'coverall' | 'none';
  glove: boolean; gloveTop: number;
}

export function shapeOf(L: HumanLook): Shape {
  const T = L.shirt, O = L.outer, G = L.legs;
  const topThick = T.kind === 'wool' ? 0.0065 : T.kind === 'flannel' ? 0.005 : T.kind === 'coveralls' ? 0.007 : 0.003;
  const outerSleeve = O.kind === 'chore' || O.kind === 'cardigan';
  const sleeve = outerSleeve ? 'long' : T.sleeve;
  const sleeveY = sleeve === 'long' ? -0.505 : sleeve === 'rolled' ? -0.355 : -0.16;
  const outerThick = O.kind === 'chore' ? 0.011 : O.kind === 'quiltVest' ? 0.016 : O.kind === 'blazeVest' ? 0.006 : O.kind === 'cardigan' ? 0.009 : 0;
  const f = L.feet.kind;
  const bootTop = f === 'logger' ? -0.66 : f === 'hiker' ? -0.76 : f === 'work' ? -0.73 : -9;
  const stagged = !!G.stagged && bootTop > -0.86;
  const legHem = stagged ? bootTop + 0.035 : -0.86;
  return {
    topKind: T.kind,
    waist: 0.975, topHem: T.tucked || T.kind === 'coveralls' ? 0.86 : 0.85, topThick, tuck: T.tucked || T.kind === 'coveralls',
    sleeveY, rolled: sleeve === 'rolled', armThick: topThick + (outerSleeve ? outerThick : 0) + (sleeve === 'rolled' ? 0.001 : 0), outerSleeve,
    outer: O.kind, outerHem: O.kind === 'chore' ? 0.83 : O.kind === 'cardigan' ? 0.86 : O.kind === 'quiltVest' ? 0.88 : O.kind === 'blazeVest' ? 0.9 : 1, outerThick, open: O.open,
    legKind: G.kind, legHem, legThick: G.kind === 'jeans' ? 0.008 : G.kind === 'coveralls' ? 0.009 : G.kind === 'wool' ? 0.008 : 0.007, stagged,
    bootTop, bootThick: f === 'logger' ? 0.008 : f === 'hiker' ? 0.007 : 0.007, feet: f,
    soleH: f === 'logger' ? 0.024 : f === 'hiker' ? 0.022 : f === 'work' ? 0.022 : 0.014,
    heelH: f === 'logger' ? 0.03 : f === 'shoe' ? 0.012 : 0.008,
    collar: T.kind === 'coveralls' ? 'coverall' : T.kind === 'flannel' || T.kind === 'wool' ? 'shirt' : T.kind === 'henley' ? 'henley' : 'crew',
    glove: L.hands.kind !== 'bare', gloveTop: -0.47,
  };
}
