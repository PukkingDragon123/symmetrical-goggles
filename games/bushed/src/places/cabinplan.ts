// Cabin plan: dimensions, wall courses, openings and roof geometry shared by cabin.ts and dressing.ts.
// ---------------------------------------------------------------------------------------------- dimensions
export const CABIN = {
  W: 4.8,          // side-wall log centrelines at x = +-W/2
  D: 6.2,          // front/back-wall log centrelines at z = +-D/2
  R: 0.165,        // log radius
  S: 0.3,          // course spacing (per wall)
  OH: 0.42,        // log ends overhang the corner centrelines
  FLOOR: 0.36,     // top of the floorboards above grade
  Y0: 0.17,        // first side-wall log centre
  NC: 9,           // courses per wall
  PORCH: 1.95,     // porch depth in front of the front wall centreline
  K: 0.72,         // roof slope (rise / run)
  XE: 2.98,        // eave edge (horizontal distance from the ridge)
};
const { W, D, R, S, FLOOR, Y0, NC, K, PORCH } = CABIN;
export const EAVE = Y0 + (NC - 1) * S + R;           // top of the side plate logs
export const deckY = (x: number) => EAVE + K * (W / 2 - Math.abs(x)); // underside of the roof boards
export const RIDGE = deckY(0);
export const ROOF_T = 0.05;                           // roof boards
export const ZB = -D / 2 - 0.55, ZF = D / 2 + PORCH + 0.32; // roof extent along z
export const ySide = (k: number) => Y0 + k * S;       // side walls (x = +-W/2)
export const yEnd = (k: number) => Y0 + S / 2 + k * S; // front/back walls (z = +-D/2)
export const IN = { x0: -W / 2 + R, x1: W / 2 - R, z0: -D / 2 + R, z1: D / 2 - R };

// openings: wall, along-wall centre, width, course range (cut courses)
export interface Opening { wall: 'front' | 'back' | 'left' | 'right'; c: number; w: number; k0: number; k1: number; kind: 'door' | 'window' }
export const OPENINGS: Opening[] = [
  { wall: 'front', c: -0.92, w: 0.92, k0: 0, k1: 6, kind: 'door' },
  { wall: 'front', c: 1.05, w: 0.92, k0: 4, k1: 6, kind: 'window' },
  { wall: 'left', c: 0.15, w: 0.92, k0: 4, k1: 6, kind: 'window' },
];
export function openingY(o: Opening): [number, number] {
  const yc = o.wall === 'front' || o.wall === 'back' ? yEnd : ySide;
  const y0 = o.kind === 'door' ? FLOOR : yc(o.k0) - S / 2;
  return [y0, yc(o.k1) + S / 2];
}

export const CABIN_GEOM = { EAVE, RIDGE, deckY, IN, ySide, yEnd, OPENINGS, openingY, ZB, ZF };
