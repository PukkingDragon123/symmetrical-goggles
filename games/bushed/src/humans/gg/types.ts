// Types for the Gacha Garage people system (ported from didactic-broccoli src/people, the author's own game).
// A Spec is the plain description every builder reads (body plan, painter, face painter, animation); BUSHED's
// HumanLook (../looks.ts) is translated into one by ../spec.ts.

export type RGB = [number, number, number];
export type V3 = [number, number, number];
/** a horizontal cross-section: centre x, centre z, half width, half depth */
export type Sec = [number, number, number, number];

export type Sex = 'm' | 'f';
export type Age = 'kid' | 'teen' | 'adult' | 'elder';

/** a woven check: stripes [colour, width in metres of cloth] repeated in warp and weft */
export interface Check { stripes: [RGB, number][]; twill?: boolean; brushed?: number }

export interface Hair {
  style: string; col: RGB; hi?: RGB; grey?: number; part?: number; volume?: number;
}
export interface FaceSpec {
  iris?: RGB; lid?: 'mono' | 'double'; tilt?: number; blush?: number; stubble?: number; browW?: number; browArch?: number; browCol?: RGB;
  eyeW?: number; eyeH?: number; lipFull?: number; lipstick?: RGB; wrinkles?: number; spots?: number; freckles?: number;
  mustache?: boolean | 'walrus';
  /** a full beard painted over the jaw and chin (0..1 fullness), with its own geometry under the chin */
  beard?: number;
  makeup?: { liner?: number; lash?: number; lower?: boolean; shadow?: RGB | null; highlight?: number; blush?: RGB } | null;
}
export interface Glasses { kind: string; col: RGB; thick: number; chain?: boolean }
export interface Hat { kind: string; col: RGB; col2?: RGB; pom?: boolean }
export interface Top {
  kind: string; col: RGB; col2?: RGB; col3?: RGB; shirt?: RGB; tie?: RGB; tieKind?: string;
  sleeve?: 'long' | 'short' | 'mid' | 'rolled'; tuck?: boolean; fitted?: boolean; print?: string; band?: RGB; uniform?: boolean;
  vest?: RGB; cardigan?: RGB | null; open?: boolean; pattern?: string;
  /** woven check for flannel / wool shirts (overrides col / col2) */
  check?: Check;
  /** an undershirt showing at the open collar */
  under?: RGB;
  /** a henley's button placket */
  henley?: boolean;
  /** a hand-painted patch with a name (mechanic) */
  patch?: string;
}
/** an outer layer over the top: parka, chore coat, vests, cardigan */
export interface Outer { kind: 'parka' | 'chore' | 'quiltVest' | 'blazeVest' | 'cardigan' | 'mackinaw'; col: RGB; col2?: RGB; open: boolean; check?: Check }
export interface Bottom { kind: string; col: RGB; belt?: RGB; cut?: string; plaid?: RGB; wide?: boolean; noCrease?: boolean; stagged?: boolean }
export interface Shoes { kind: string; col: RGB; col2?: RGB }
export interface Acc { kind: string; col: RGB; col2?: RGB; side?: number; leek?: boolean; poster?: boolean; school?: boolean }
export interface Gloves { kind: 'leather' | 'knit' | 'work'; col: RGB; cuff?: RGB }

export interface Spec {
  id: string; name: string; seed: number;
  sex: Sex; age: Age; H: number; build: number; belly: number; bust?: number;
  skin: RGB; hair: Hair; face: FaceSpec;
  glasses: Glasses | null; hat: Hat | null;
  top: Top; outer?: Outer | null; bottom: Bottom; shoes: Shoes;
  socks: { col: RGB } | null; legs: string; tights?: RGB;
  acc: Acc[];
  suspenders?: RGB | null;
  gloves?: Gloves | null;
  /** dirt / grease / wear 0..1 (stains and fading on the clothes) */
  wear?: number; grease?: number;
  walk: { style: string; hunch?: number; look?: number };
  /** puffy outerwear: widens the torso and the arms (0..1) */
  bulk?: number;
}

/** body landmarks (metres; feet at y = 0, facing +z, +x = the character's left) */
export interface Props {
  H: number; hu: number; f: boolean; a: number; w: number; kid: boolean;
  crown: number; chin: number;
  neckBase: number; shoulderY: number; bustY: number; waistY: number; pelvisY: number; hipY: number; crotchY: number; kneeY: number; ankleY: number;
  elbowY: number; wristY: number; tipY: number;
  shX: number; hipX: number; chestTopX: number; bustX: number; waistX: number; hipsX: number; hipsZ: number; chestZ: number; waistZ: number;
  bust: number; belly: number; thighX: number; armX: number; footL: number; footX: number;
  hw: number; hd: number; hcz: number; zf: number;
  eyeY: number; browY: number; noseY: number; mouthY: number; hairY: number; earTop: number; earBot: number; napeY: number;
}
export type Joints = Record<string, V3>;

export type Caps = 'both' | 'top' | 'bot' | 'none';
/** a prism between two chamfered horizontal cross-sections, rigidly skinned to one bone */
export interface Seg {
  part: string; bone: string; mat: string; y0: number; y1: number; b: Sec; t: Sec;
  ch: number; caps: Caps; dens: number;
  mirror?: boolean; block?: 'face'; rot?: { p: V3; e: V3 }; cut?: string;
}
export interface SegOpts { ch?: number; caps?: Caps; dens?: number; mirror?: boolean; block?: 'face'; rot?: { p: V3; e: V3 }; cut?: string }
export interface Plan { P: Props; J: Joints; segs: Seg[] }

/** one face of a segment with its atlas rectangle and in-plane basis */
export interface MeshFace {
  seg: Seg; kind: 'side' | 'top' | 'bot'; pts: V3[]; N: V3; tris: number[];
  U: V3; V: V3; o: V3; s0: number; s1: number; r0: number; r1: number;
  dens: number; rect: { w: number; h: number; x: number; y: number }; block?: boolean;
}
/** the face image: atlas position and the body-space window it covers */
export interface FaceBlock { x: number; y: number; w: number; h: number; x0: number; y1: number; dens: number; rect: { w: number; h: number; x: number; y: number } }

/** what a painter sees at one texel */
export interface Tex {
  x: number; y: number; z: number; i: number; j: number;
  f: MeshFace; seg: Seg; part: string; nx: number; ny: number; nz: number; px: number; kind: string;
  /** -1..1 across the face, distances to the face's bottom / top edge and its height (metres) */
  e: number; rb: number; rt: number; rh: number;
}
export type Painter = (c: Tex, o: Float32Array) => void;

/** expression parameters (face pixels) */
export interface Expr {
  corner: number; cheek: number; lower: number; mouthW: number; brow: number; open: number; teeth: number; upper: number;
  round: number; lines: number; inner: number; furrow: number; sneer: number; lookY: number;
  blink: number; lookX: number;
}

/** arm IK target in chest space: wrist t, elbow pole p, hand euler */
export interface ArmT { t: number[]; p: number[]; hand: number[] }
/** a gesture's pose record (filled every frame by gesturePose) */
export interface GPose {
  L: ArmT | null; R: ArmT | null;
  spine: number[]; chest: number[]; neck: number[]; head: number[]; hips: number[]; hipsR: number[];
  feet: number[][]; home: boolean; fw: number; lift: number;
  prop: number[] | null; box: boolean; eyes: number[] | null;
  /** finger direction + palm normal per hand, chest space ([fx, fy, fz, nx, ny, nz]) */
  hands?: { L: number[] | null; R: number[] | null } | null;
  /** fist (1) / open (0) per hand for the sockets' fingers (0..1) */
  grip?: [number, number] | null;
  /** show the axe in the right fist (BUSHED) */
  tool?: boolean;
}
export interface GestureDef { dur: number; expr?: string; legs?: boolean; loop?: boolean }
