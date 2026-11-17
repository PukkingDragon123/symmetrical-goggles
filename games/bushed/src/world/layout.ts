// World layout: the single source of truth for the map. Terrain height, roads, clearings, water and biomes.
// Units: metres. Y up. +X east, +Z south. The cabin sits near the origin.
//
//   heightAt(x, z)          ground height (smooth, road-flattened, clearing-flattened, lake basin)
//   normalAt(x, z)          ground normal
//   roadInfo(x, z)          { d: distance to the nearest road centreline, t: param, road: id, w: half width, h: road height }
//   clearance(x, z)         0 = must stay clear (road, buildings, clearings), 1 = free forest floor
//   biome(x, z)             species / ground weights for placement (see Biome)
//   SPOTS                   named places (cabin, store, lake, hollow, burn, ...)
//   ROADS                   centreline polylines (for driving AI, wheel tracks, signage)
import { Noise, smoothstep, clamp, lerp } from '../core/noise';

export const WORLD = {
  /** terrain extends over [-half, half]^2 */
  half: 1024,
  /** the player can walk/drive inside [-playHalf, playHalf]^2; beyond is scenery */
  playHalf: 760,
  waterY: 2.0,
  seed: 1871,
};

export interface Spot { x: number; z: number; r: number; rot?: number; y?: number }

export const SPOTS = {
  /** the cabin clearing; the cabin's front door faces rot (radians about Y, 0 = facing +Z) */
  cabin: { x: 0, z: 0, r: 26, rot: -0.6 } as Spot,
  /** woodshed / chopping block area beside the cabin */
  woodyard: { x: 11, z: 9, r: 6 } as Spot,
  /** the General Store at the junction of the highway and the forest road */
  store: { x: -262, z: -548, r: 38, rot: Math.PI } as Spot,
  /** the lake east of the cabin */
  lake: { x: 205, z: -40, r: 95 } as Spot,
  /** the old-growth cedar hollow: Bigfoot and Granny country */
  hollow: { x: 80, z: 430, r: 150 } as Spot,
  /** an old burn to the north-east: gumberoo habitat */
  burn: { x: 430, z: -400, r: 170 } as Spot,
  /** the campers' site by the lake */
  campsite: { x: 300, z: 90, r: 16 } as Spot,
  /** where the intro drive starts (on the highway west of the store) */
  introStart: { x: -470, z: -585, r: 4 } as Spot,
};

/** road centrelines (control points, Catmull-Rom smoothed). w = half width of the driving surface */
const ROAD_CTRL: { id: string; w: number; pts: [number, number][] }[] = [
  {
    id: 'highway', w: 3.6, pts: [
      [-1000, -610], [-760, -598], [-560, -590], [-400, -580], [-262, -585], [-120, -600], [60, -630], [260, -650], [520, -640], [1000, -660],
    ],
  },
  {
    id: 'cabin_road', w: 2.4, pts: [
      [-262, -585], [-255, -520], [-238, -440], [-200, -360], [-206, -280], [-178, -200], [-128, -132], [-80, -74], [-42, -30], [-16, -6],
    ],
  },
  {
    // an old skid trail from the cabin to the lake (walkable, Jeep can crawl it)
    id: 'lake_trail', w: 1.4, pts: [[14, -10], [50, -24], [90, -28], [120, -36], [140, -44]],
  },
  {
    // a footpath south toward the hollow
    id: 'hollow_path', w: 0.9, pts: [[8, 20], [20, 70], [12, 130], [30, 200], [52, 270], [70, 330]],
  },
];

interface RoadSample { x: number; z: number; t: number; road: number; h: number; dx: number; dz: number }
export interface RoadPoly { id: string; w: number; pts: { x: number; z: number; h: number }[] }

const noise = new Noise(WORLD.seed);
const noiseB = new Noise(WORLD.seed + 7);

// ---------------------------------------------------------------- base terrain (no roads)
function lakeDepth(x: number, z: number): number {
  const L = SPOTS.lake;
  const dx = x - L.x, dz = z - L.z;
  // irregular shoreline
  const a = Math.atan2(dz, dx);
  const rr = L.r * (1 + 0.18 * Math.sin(a * 3 + 1.3) + 0.1 * Math.sin(a * 7 + 0.4) + 0.12 * noise.n2(Math.cos(a) * 1.5, Math.sin(a) * 1.5));
  const d = Math.sqrt(dx * dx + dz * dz) / rr;
  return d >= 1.25 ? 0 : (1 - smoothstep(0.55, 1.25, d));
}

function baseHeight(x: number, z: number): number {
  // broad rolling shield country with ridges
  let h = 14 + 18 * noise.fbm2(x / 620, z / 620, 4) + 9 * noiseB.ridge2(x / 340 + 9, z / 340 - 3, 3);
  h += 2.2 * noise.fbm2(x / 70, z / 70, 3);
  h += 0.35 * noiseB.fbm2(x / 9, z / 9, 2);
  // mountains ring outside the play area (scenery)
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += 70 * smoothstep(WORLD.playHalf - 40, WORLD.half, edge) * (0.6 + 0.4 * noise.ridge2(x / 200, z / 200, 3));
  // lake basin
  const ld = lakeDepth(x, z);
  if (ld > 0) h = lerp(h, WORLD.waterY - 6, smoothstep(0, 1, ld));
  // the hollow is a damp low valley
  const hd = Math.hypot(x - SPOTS.hollow.x, z - SPOTS.hollow.z) / SPOTS.hollow.r;
  h -= 7 * (1 - smoothstep(0.2, 1.1, hd));
  return h;
}

// ---------------------------------------------------------------- roads
function catmull(p: [number, number][], seg: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / seg));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

export const ROADS: RoadPoly[] = [];
const ROAD_CELL = 32;
const roadGrid = new Map<number, RoadSample[]>();
const gkey = (cx: number, cz: number) => (cx + 512) * 4096 + (cz + 512);

(function buildRoads() {
  ROAD_CTRL.forEach((rc, ri) => {
    const pts = catmull(rc.pts, 2);
    // road height: base height smoothed heavily along the road, then a gentle grade filter
    let hs = pts.map(([x, z]) => baseHeight(x, z));
    for (let pass = 0; pass < 6; pass++) {
      const k = 10;
      hs = hs.map((_, i) => {
        let s = 0, n = 0;
        for (let j = -k; j <= k; j++) { const q = hs[clamp(i + j, 0, hs.length - 1)]; s += q; n++; }
        return s / n;
      });
    }
    // keep roads above the water line
    hs = hs.map((h) => Math.max(h, WORLD.waterY + 1.2));
    const poly: RoadPoly = { id: rc.id, w: rc.w, pts: pts.map(([x, z], i) => ({ x, z, h: hs[i] })) };
    ROADS.push(poly);
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const s: RoadSample = { x: pts[i][0], z: pts[i][1], t: acc, road: ri, h: hs[i], dx: (b[0] - a[0]) / dl, dz: (b[1] - a[1]) / dl };
      const cx = Math.floor(s.x / ROAD_CELL), cz = Math.floor(s.z / ROAD_CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const k = gkey(cx + dx, cz + dz);
        let arr = roadGrid.get(k);
        if (!arr) roadGrid.set(k, (arr = []));
        arr.push(s);
      }
    }
  });
})();

/** d = distance to the centreline, side = signed lateral offset (+ = right of travel direction), dir = travel heading */
export interface RoadInfo { d: number; side: number; t: number; road: number; w: number; h: number; id: string; dirX: number; dirZ: number }
const NO_ROAD: RoadInfo = { d: 1e9, side: 1e9, t: 0, road: -1, w: 0, h: 0, id: '', dirX: 0, dirZ: 1 };

/** nearest road centreline within ~32 m (d = 1e9 when none). Interpolates between samples. */
export function roadInfo(x: number, z: number): RoadInfo {
  const arr = roadGrid.get(gkey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
  if (!arr) return NO_ROAD;
  let best = 1e18, bs: RoadSample | null = null;
  for (const s of arr) {
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < best) { best = d; bs = s; }
  }
  if (!bs) return NO_ROAD;
  // lateral offset from the local tangent line (exact across the road, unlike the nearest-sample distance)
  const ox = x - bs.x, oz = z - bs.z;
  const side = ox * -bs.dz + oz * bs.dx;
  const along = ox * bs.dx + oz * bs.dz;
  const d = Math.sqrt(Math.max(0, best - along * along * 0.999));
  return { d, side, t: bs.t + along, road: bs.road, w: ROAD_CTRL[bs.road].w, h: bs.h, id: ROAD_CTRL[bs.road].id, dirX: bs.dx, dirZ: bs.dz };
}

// ---------------------------------------------------------------- clearings (flattened pads)
interface Pad { x: number; z: number; r: number; fall: number; h?: number }
const PADS: Pad[] = [
  { x: SPOTS.cabin.x, z: SPOTS.cabin.z, r: 16, fall: 48 },
  { x: SPOTS.store.x, z: SPOTS.store.z, r: 32, fall: 34 },
  { x: SPOTS.campsite.x, z: SPOTS.campsite.z, r: 9, fall: 8 },
];
for (const p of PADS) p.h = Math.max(baseHeight(p.x, p.z), WORLD.waterY + 1.5);
// the cabin pad must match the cabin road's end height so the drive lines up
{
  const r = roadInfo(SPOTS.cabin.x - 16, SPOTS.cabin.z - 6);
  PADS[0].h = r.road >= 0 ? r.h : PADS[0].h;
}
{
  const r = roadInfo(SPOTS.store.x, SPOTS.store.z - 37);
  if (r.road >= 0) PADS[1].h = r.h;
}

// ---------------------------------------------------------------- public queries
export function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z);
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.fall) h = lerp(p.h!, h, smoothstep(p.r, p.r + p.fall, d));
  }
  const r = roadInfo(x, z);
  // only real roads are graded; trails follow the ground
  if (r.road >= 0 && (r.id === 'highway' || r.id === 'cabin_road')) {
    const shoulder = r.w + 7;
    if (r.d < shoulder) {
      // slight crown on the road surface, ditches just past the shoulder
      const crown = -0.05 * (r.d / r.w) * (r.d / r.w);
      const ditch = -0.35 * smoothstep(r.w + 0.6, r.w + 1.8, r.d) * (1 - smoothstep(r.w + 2.2, r.w + 4, r.d));
      const roadH = r.h + (r.d < r.w ? crown : -0.05) + ditch;
      h = lerp(roadH, h, smoothstep(r.w + 1.0, shoulder, r.d));
    }
  }
  return h;
}

export function normalAt(x: number, z: number, e = 0.5): [number, number, number] {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

/** 0 = keep clear (road surface, building pads, water), 1 = free forest floor. Smooth. */
export function clearance(x: number, z: number): number {
  let c = 1;
  const r = roadInfo(x, z);
  if (r.road >= 0) c = Math.min(c, smoothstep(r.w + 0.8, r.w + 3.5, r.d));
  for (const p of PADS) c = Math.min(c, smoothstep(p.r * 0.75, p.r + 4, Math.hypot(x - p.x, z - p.z)));
  if (heightAt(x, z) < WORLD.waterY + 0.25) c = 0;
  return c;
}

export function isWater(x: number, z: number): boolean { return heightAt(x, z) < WORLD.waterY; }

export interface Biome {
  /** relative tree species weights at this point (not normalised) */
  spruce: number; fir: number; pine: number; birch: number; cedar: number;
  /** overall tree density 0..1 */
  density: number;
  /** 0 dry .. 1 wet ground (moss, ferns, puddles) */
  wet: number;
  /** 0..1 burned (charred snags, fireweed) */
  burn: number;
  /** 0..1 old growth (huge trees, deadfall) */
  old: number;
}

export function biome(x: number, z: number): Biome {
  const h = heightAt(x, z);
  const [, ny] = normalAt(x, z, 2);
  const slope = 1 - ny;
  const nearLake = 1 - smoothstep(SPOTS.lake.r * 0.9, SPOTS.lake.r * 1.8, Math.hypot(x - SPOTS.lake.x, z - SPOTS.lake.z));
  const old = 1 - smoothstep(SPOTS.hollow.r * 0.5, SPOTS.hollow.r * 1.15, Math.hypot(x - SPOTS.hollow.x, z - SPOTS.hollow.z));
  const burn = 1 - smoothstep(SPOTS.burn.r * 0.6, SPOTS.burn.r * 1.1, Math.hypot(x - SPOTS.burn.x, z - SPOTS.burn.z) * (1 + 0.25 * noise.n2(x / 60, z / 60)));
  const lowWet = clamp((22 - h) / 18, 0, 1);
  const wet = clamp(0.25 + 0.5 * lowWet + 0.6 * nearLake + 0.5 * old + 0.25 * noise.n2(x / 90, z / 90), 0, 1);
  const ridge = clamp((h - 22) / 14, 0, 1);
  const patch = noiseB.n2(x / 140, z / 140);
  return {
    spruce: 1.0 + 0.4 * patch,
    fir: 0.7 + 0.5 * wet - 0.3 * ridge,
    pine: 0.15 + 1.6 * ridge + 0.8 * slope + (burn > 0.2 ? 1.5 : 0),
    birch: 0.25 + 0.6 * clamp(noise.n2(x / 70 + 3, z / 70), 0, 1) + 0.5 * nearLake,
    cedar: 0.05 + 1.8 * wet * wet + 3.5 * old,
    density: clamp(0.78 + 0.22 * noise.fbm2(x / 110, z / 110, 2) - 0.25 * slope + 0.2 * old, 0.25, 1),
    wet, burn, old,
  };
}

/** a deterministic road point at distance t along a road (for spawning vehicles, signs, wheel tracks) */
export function roadPointAt(id: string, t: number): { x: number; z: number; h: number; dir: number } {
  const road = ROADS.find((r) => r.id === id)!;
  let acc = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + l >= t) {
      const f = (t - acc) / l;
      return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), h: lerp(a.h, b.h, f), dir: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    acc += l;
  }
  const e = road.pts[road.pts.length - 1], p = road.pts[road.pts.length - 2];
  return { x: e.x, z: e.z, h: e.h, dir: Math.atan2(e.x - p.x, e.z - p.z) };
}

export function roadLength(id: string): number {
  const road = ROADS.find((r) => r.id === id)!;
  let acc = 0;
  for (let i = 1; i < road.pts.length; i++) acc += Math.hypot(road.pts[i].x - road.pts[i - 1].x, road.pts[i].z - road.pts[i - 1].z);
  return acc;
}
