// Looks: everything that makes one person: build, age, face, hair, and a bush-country outfit. The painter
// (paint.ts / clothes.ts) and the geometry (body.ts, hands.ts, head.ts) both read a HumanLook.
//
// Presets: the PLAYER (a burly bearded lumberjack), the SHOPKEEPER (Gérard, the elderly French-Canadian
// storekeeper), a hunter in blaze orange, a mechanic in stained coveralls, a camper and an old logger.
// `variant(look, seed)` jitters a preset into a different face and colourway for crowds.
import type { Build } from './rig';
import { Rng } from '../core/rng';

export type RGBH = string;

/** a woven check / plaid: warp and weft use the same stripe sequence (sett): [colour, width in mm] */
export interface Sett { stripes: [RGBH, number][]; twill?: boolean; brushed?: number }

export type ShirtKind = 'flannel' | 'henley' | 'thermal' | 'tee' | 'coveralls' | 'wool';
export type OuterKind = 'none' | 'chore' | 'quiltVest' | 'blazeVest' | 'cardigan';
export type LegKind = 'jeans' | 'canvas' | 'wool' | 'khaki' | 'coveralls';
export type FeetKind = 'logger' | 'hiker' | 'work' | 'shoe';
export type HandKind = 'bare' | 'leather' | 'knit';
export type HatKind = 'none' | 'toque' | 'toquePom' | 'cap' | 'capFlaps';
export type HairStyle = 'bald' | 'short' | 'crew' | 'receding' | 'thin' | 'shaggy' | 'ponytail';
export type FacialHair = 'none' | 'stubble' | 'beard' | 'fullBeard' | 'moustache' | 'walrus' | 'whiteStubble';

export interface HumanLook {
  name: string;
  seed: number;
  build: Build;
  /** 0 young adult .. 1 elderly: wrinkles, grey hair, posture, thinner skin */
  age: number;
  skin: { tone: number /* 0 pale .. 1 deep */; ruddy: number /* 0..1 weathered red */ };
  face: {
    jaw: number; chin: number; cheek: number; wide: number; long: number; hollow: number;
    brow: number;            // brow ridge / brow hair weight 0.5..1.6
    nose: { w: number; len: number; bump: number; crook: number; bulb: number };
    ears: number; eye: RGBH; eyeTilt: number; lips: number;
  };
  hair: { style: HairStyle; color: RGBH; grey: number };
  facial: FacialHair;
  shirt: { kind: ShirtKind; sett?: Sett; color?: RGBH; sleeve: 'long' | 'rolled' | 'short'; tucked: boolean; undershirt?: RGBH };
  outer: { kind: OuterKind; color?: RGBH; color2?: RGBH; open: boolean };
  legs: { kind: LegKind; color: RGBH; stagged?: boolean };
  suspenders?: RGBH;
  belt?: RGBH;
  apron?: RGBH;
  feet: { kind: FeetKind; color: RGBH };
  hands: { kind: HandKind; color?: RGBH };
  hat: { kind: HatKind; color?: RGBH; color2?: RGBH };
  glasses: 'none' | 'reading' | 'readingChain';
  /** dirt / grease / wear 0..1 */
  wear: number;
  grease?: number;
  extras?: { pencil?: boolean; patch?: string; hanky?: RGBH };
}

const B = (o: Partial<Build>): Build => ({
  s: 1, bw: 1, mass: 1, belly: 0, chest: 0, fem: 0, headS: 0.955, legLen: 1, armLen: 1, handS: 1, footS: 1, shoulders: 1, neckLen: 1, hunch: 0, ...o,
});

// ------------------------------------------------------------------ setts (stripe widths in mm)
export const SETTS = {
  /** classic red / black buffalo check */
  buffalo: { stripes: [['#a3161b', 32], ['#141012', 32]], twill: true, brushed: 0.8 } as Sett,
  /** black / grey buffalo */
  buffaloGrey: { stripes: [['#5d6064', 30], ['#151517', 30]], twill: true, brushed: 0.8 } as Sett,
  /** green / navy tartan with a thin red overstripe (the storekeeper's shirt) */
  storeTartan: { stripes: [['#21412f', 18], ['#14203a', 4], ['#21412f', 4], ['#14203a', 14], ['#8a1d1c', 2], ['#14203a', 14], ['#21412f', 4], ['#14203a', 4]], twill: true, brushed: 0.5 } as Sett,
  /** green / black hunting check */
  greenCheck: { stripes: [['#3b5a2c', 26], ['#131512', 26]], twill: true, brushed: 0.9 } as Sett,
  /** blue / green / white camper's plaid */
  camperPlaid: { stripes: [['#2a5a8a', 14], ['#1c2c48', 6], ['#2f6a4a', 12], ['#1c2c48', 6], ['#d9d4c4', 2], ['#2a5a8a', 14], ['#1c2c48', 6]], twill: true, brushed: 0.5 } as Sett,
  /** brown / tan / rust work plaid (the old logger's shirt) */
  rustPlaid: { stripes: [['#7a3a1e', 16], ['#3a2618', 8], ['#b88a52', 4], ['#3a2618', 8], ['#7a3a1e', 16], ['#22180f', 10]], twill: true, brushed: 0.7 } as Sett,
  /** yellow / black for the mechanic's under-shirt peeking at the collar */
  mustard: { stripes: [['#b08a24', 20], ['#1e1a12', 20]], twill: true, brushed: 0.7 } as Sett,
};

// ------------------------------------------------------------------ presets
export type LookId = 'player' | 'shopkeeper' | 'hunter' | 'mechanic' | 'camper' | 'oldLogger';
export const LOOK_IDS: LookId[] = ['player', 'shopkeeper', 'hunter', 'mechanic', 'camper', 'oldLogger'];

export function makeLook(id: LookId): HumanLook {
  switch (id) {
    case 'player': return {
      name: 'The Lumberjack', seed: 101,
      build: B({ s: 1.04, bw: 1.16, mass: 1.22, chest: 0.7, belly: 0.15, shoulders: 1.06, handS: 1.08, footS: 1.05 }),
      age: 0.25, skin: { tone: 0.22, ruddy: 0.55 },
      face: { jaw: 1.08, chin: 1.04, cheek: 1, wide: 1.04, long: 1.0, hollow: 0, brow: 1.3, nose: { w: 1.1, len: 1.05, bump: 0.002, crook: 0.001, bulb: 0.3 }, ears: 1, eye: '#5a7088', eyeTilt: 0, lips: 1 },
      hair: { style: 'short', color: '#4a2e1a', grey: 0 },
      facial: 'fullBeard',
      shirt: { kind: 'flannel', sett: SETTS.buffalo, sleeve: 'long', tucked: true, undershirt: '#d8d0bc' },
      outer: { kind: 'none', open: true },
      legs: { kind: 'jeans', color: '#2c3d5c', stagged: true },
      suspenders: '#8a1a16',
      feet: { kind: 'logger', color: '#5a3a22' },
      hands: { kind: 'leather', color: '#b8894f' },
      hat: { kind: 'toque', color: '#2e3134', color2: '#c8611e' },
      glasses: 'none', wear: 0.45,
    };
    case 'shopkeeper': return {
      name: 'Gérard, the storekeeper', seed: 202,
      build: B({ s: 0.95, bw: 0.96, mass: 1.06, belly: 0.55, fem: 0, hunch: 0.55, shoulders: 0.94, neckLen: 0.92 }),
      age: 0.92, skin: { tone: 0.12, ruddy: 0.35 },
      face: { jaw: 0.96, chin: 0.98, cheek: 0.95, wide: 1.02, long: 1.06, hollow: 0.3, brow: 1.6, nose: { w: 1.15, len: 1.25, bump: 0.003, crook: 0, bulb: 0.9 }, ears: 1.2, eye: '#6a5a3a', eyeTilt: -0.3, lips: 0.7 },
      hair: { style: 'receding', color: '#e8e4dc', grey: 1 },
      facial: 'walrus',
      shirt: { kind: 'flannel', sett: SETTS.storeTartan, sleeve: 'long', tucked: true },
      outer: { kind: 'cardigan', color: '#8a6a44', color2: '#5a4128', open: true },
      legs: { kind: 'wool', color: '#4a4036' },
      belt: '#3a2618',
      apron: '#c9b48c',
      feet: { kind: 'shoe', color: '#3a2416' },
      hands: { kind: 'bare' },
      hat: { kind: 'none' },
      glasses: 'readingChain', wear: 0.25,
      extras: { pencil: true },
    };
    case 'hunter': return {
      name: 'Hunter', seed: 303,
      build: B({ s: 1.0, bw: 1.04, mass: 1.08, chest: 0.3, belly: 0.25 }),
      age: 0.45, skin: { tone: 0.3, ruddy: 0.4 },
      face: { jaw: 1.04, chin: 1.0, cheek: 1.02, wide: 1.0, long: 1.02, hollow: 0.1, brow: 1.1, nose: { w: 1.0, len: 1.0, bump: 0, crook: 0, bulb: 0.2 }, ears: 1, eye: '#4a5a3a', eyeTilt: 0, lips: 0.9 },
      hair: { style: 'crew', color: '#3a2c20', grey: 0.25 },
      facial: 'stubble',
      shirt: { kind: 'wool', sett: SETTS.greenCheck, sleeve: 'long', tucked: false },
      outer: { kind: 'blazeVest', color: '#ff5a10', open: false },
      legs: { kind: 'canvas', color: '#4e5038' },
      belt: '#2a1c12',
      feet: { kind: 'hiker', color: '#4a3020' },
      hands: { kind: 'bare' },
      hat: { kind: 'capFlaps', color: '#ff5a10', color2: '#2a2018' },
      glasses: 'none', wear: 0.35,
    };
    case 'mechanic': return {
      name: 'Mechanic', seed: 404,
      build: B({ s: 0.98, bw: 1.1, mass: 1.3, belly: 0.8, chest: 0.2, neckLen: 0.9 }),
      age: 0.5, skin: { tone: 0.42, ruddy: 0.3 },
      face: { jaw: 1.1, chin: 0.94, cheek: 1.06, wide: 1.08, long: 0.96, hollow: 0, brow: 1.0, nose: { w: 1.2, len: 0.95, bump: 0, crook: 0.002, bulb: 0.5 }, ears: 1.05, eye: '#3a2a1a', eyeTilt: 0.1, lips: 1.1 },
      hair: { style: 'short', color: '#1e1a16', grey: 0.15 },
      facial: 'moustache',
      shirt: { kind: 'coveralls', color: '#3c4a5a', sleeve: 'rolled', tucked: true, undershirt: '#9a9a94' },
      outer: { kind: 'none', open: false },
      legs: { kind: 'coveralls', color: '#3c4a5a' },
      feet: { kind: 'work', color: '#2a1e16' },
      hands: { kind: 'bare' },
      hat: { kind: 'cap', color: '#7a1c18', color2: '#d8d0c0' },
      glasses: 'none', wear: 0.7, grease: 0.85,
      extras: { patch: 'RAY', hanky: '#a01e1e' },
    };
    case 'camper': return {
      name: 'Camper', seed: 505,
      build: B({ s: 0.96, bw: 0.9, mass: 0.88, fem: 0.85, headS: 0.93, handS: 0.95, footS: 0.94 }),
      age: 0.05, skin: { tone: 0.5, ruddy: 0.2 },
      face: { jaw: 0.94, chin: 0.96, cheek: 1.04, wide: 0.98, long: 1.0, hollow: 0, brow: 0.7, nose: { w: 0.95, len: 0.9, bump: 0, crook: 0, bulb: 0.1 }, ears: 0.95, eye: '#3a2614', eyeTilt: 0.1, lips: 1.2 },
      hair: { style: 'ponytail', color: '#2a1810', grey: 0 },
      facial: 'none',
      shirt: { kind: 'flannel', sett: SETTS.camperPlaid, sleeve: 'rolled', tucked: false, undershirt: '#2a2a2c' },
      outer: { kind: 'quiltVest', color: '#2a7a72', color2: '#1a2a2a', open: false },
      legs: { kind: 'khaki', color: '#8a7a58' },
      feet: { kind: 'hiker', color: '#6a4a2a' },
      hands: { kind: 'bare' },
      hat: { kind: 'toquePom', color: '#c8a020', color2: '#e8e0cc' },
      glasses: 'none', wear: 0.2,
    };
    case 'oldLogger': return {
      name: 'Old Logger', seed: 606,
      build: B({ s: 0.99, bw: 0.98, mass: 0.84, fem: 0, hunch: 0.3, handS: 1.1, shoulders: 1.0 }),
      age: 0.8, skin: { tone: 0.26, ruddy: 0.7 },
      face: { jaw: 1.0, chin: 1.06, cheek: 0.96, wide: 0.96, long: 1.1, hollow: 0.8, brow: 1.3, nose: { w: 1.0, len: 1.15, bump: 0.003, crook: 0.003, bulb: 0.4 }, ears: 1.15, eye: '#6a8090', eyeTilt: -0.2, lips: 0.7 },
      hair: { style: 'thin', color: '#c8c4bc', grey: 1 },
      facial: 'whiteStubble',
      shirt: { kind: 'henley', color: '#7a2a22', sleeve: 'long', tucked: true },
      outer: { kind: 'chore', color: '#9a7a4a', color2: '#4a3020', open: true },
      legs: { kind: 'wool', color: '#3a3a36', stagged: true },
      suspenders: '#2a2a2a',
      feet: { kind: 'logger', color: '#3a2618' },
      hands: { kind: 'leather', color: '#8a6038' },
      hat: { kind: 'toque', color: '#6a1e1a', color2: '#6a1e1a' },
      glasses: 'none', wear: 0.8,
    };
  }
}

/** a jittered copy of a look: a new face, hair and colourway from the same outfit kind */
export function variant(base: HumanLook, seed: number): HumanLook {
  const r = new Rng(seed);
  const L: HumanLook = JSON.parse(JSON.stringify(base));
  L.seed = seed;
  L.name = base.name + ' #' + seed;
  const j = (v: number, a: number) => v * (1 + (r.next() - 0.5) * 2 * a);
  L.build = { ...L.build, s: j(L.build.s, 0.04), bw: j(L.build.bw, 0.06), mass: j(L.build.mass, 0.1), belly: Math.max(0, L.build.belly + (r.next() - 0.5) * 0.4) };
  const F = L.face;
  F.jaw = j(F.jaw, 0.06); F.chin = j(F.chin, 0.06); F.cheek = j(F.cheek, 0.05); F.wide = j(F.wide, 0.04); F.long = j(F.long, 0.05);
  F.nose = { ...F.nose, w: j(F.nose.w, 0.12), len: j(F.nose.len, 0.12), bulb: r.next() * 0.6 };
  L.skin = { tone: Math.min(1, Math.max(0, L.skin.tone + (r.next() - 0.5) * 0.5)), ruddy: r.next() * 0.7 };
  L.age = Math.min(1, Math.max(0, L.age + (r.next() - 0.5) * 0.5));
  const hairs = ['#2a1c12', '#4a2e1a', '#6a4426', '#1a1614', '#8a6a3a', '#a0522d'];
  if (L.hair.grey < 0.9) L.hair.color = r.pick(hairs);
  L.hair.grey = Math.max(L.hair.grey, L.age > 0.6 ? (L.age - 0.6) * 2.5 : 0);
  if (L.build.fem < 0.5) L.facial = r.pick(['none', 'stubble', 'beard', 'moustache', 'fullBeard', L.facial] as FacialHair[]);
  if (L.shirt.sett) L.shirt.sett = r.pick([SETTS.buffalo, SETTS.buffaloGrey, SETTS.greenCheck, SETTS.camperPlaid, SETTS.rustPlaid, SETTS.storeTartan]);
  F.eye = r.pick(['#5a7088', '#4a5a3a', '#3a2614', '#6a5a3a', '#2a3a5a']);
  return L;
}
