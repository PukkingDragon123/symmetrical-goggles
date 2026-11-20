// Tear sprites: hand-drawn pixel-art frames on one small atlas, and the material that draws every tear in one instanced
// draw (camera-facing upright billboards for drops and splashes, flat on the ground for puddles). Clear water colours
// (pale blue-white, a darker blue-grey rim, a 1 px white highlight), nearest filtering.
//
// Atlas: 8 x 4 cells of 16 px.
//   0-3    droplets, 3 / 4 / 5 / 6 px wide (a teardrop, the highlight top left)
//   4-7    the splash where a drop hits the ground (drawn standing on the cell's bottom edge)
//   8-10   a small puddle, top-down, a ripple ring spreading out; 11 the puddle still
//   12     a tear spot: the ground darkened where tears soaked in, a glint of water left
//   16-22  (2 x 2 cells each, top-down) the big puddle a melting squonk becomes: 16, 18, 20 ripples spreading, 22 still
import * as THREE from 'three';

export const CELL = 16, COLS = 8, ROWS = 4;
export const F = { drop: 0, splash: 4, ripple: 8, puddle: 11, spot: 12, pool: 16 } as const;

// clear water: no teal anywhere
const PAL: Record<string, string> = {
  h: '#ffffff', // the highlight
  l: '#e2f0f8', // lit water
  b: '#b4d2e6', // water
  s: '#86a9c3', // shaded water
  o: '#5d7f9b', // the dark rim (the bent view of darker surroundings)
};
// droplets, bottom-aligned in their cell, centred
const DROPS = [
  ['.b.', 'bhb', 'bls', '.o.'],
  ['..b.', '.bb.', 'bhbs', 'blbs', 'bbss', '.oo.'],
  ['..b..', '.bbb.', '.hbbs', 'bhlbs', 'blbbs', 'bbbss', '.ooo.'],
  ['...b..', '..bb..', '.bhbs.', 'bhlbbs', 'blbbbs', 'bbbbss', 'sbbsso', '.oooo.'],
];
// the splash, 16 wide, the bottom rows of the cell
const SPLASH = [
  ['................', '....b......b....', '.....b.hb.b.....', '....blbbbbbs....', '.....oooooo.....'],
  ['..h..........h..', '................', '...b........b...', '....b..hb..s....', '....b.b..b.b....', '................', '...blbbbbbbbs...', '....oooooooo....'],
  ['.h............h.', '................', 'b..............s', '................', '.....b....b.....', '................', '..blbbbbbbbbbs..', '...oooooooooo...'],
  ['h..............b', '................', '................', '.b..s..bhbb..s.b', '...soooooooos...'],
];

function hash(x: number, y: number, s: number) { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }

/** the atlas, drawn pixel by pixel */
export function tearAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = CELL * COLS; c.height = CELL * ROWS;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, col: string, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const cell = (i: number) => [(i % COLS) * CELL, Math.floor(i / COLS) * CELL] as const;
  const rows = (i: number, art: string[], center = true) => {
    const [cx, cy] = cell(i), w = art[0].length, ox = center ? Math.floor((CELL - w) / 2) : 0, oy = CELL - art.length;
    art.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') px(cx + ox + x, cy + oy + y, PAL[ch]); }));
  };
  DROPS.forEach((d, k) => rows(F.drop + k, d));
  SPLASH.forEach((d, k) => rows(F.splash + k, d, false));
  // puddles, top-down: an irregular blob of pale water over the ground (see-through), a dark rim on the far side, a lit
  // rim and a glint on the near side; a ripple ring spreading through it
  const blob = (i: number, size: number, R: number, ring: number, seed: number) => {
    const [cx, cy] = cell(i), m = (size - 1) / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - m, dy = y - m, a = Math.atan2(dy, dx);
      const r = R * (1 + 0.09 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 5 + seed * 2.1));
      const d = Math.hypot(dx, dy * 1.12);
      if (d > r) continue;
      const edge = d > r - 1;
      let col = 's', al = 0.62;
      if (edge) { col = dy < 0 ? 'o' : 'l'; al = 0.9; }
      else if (ring > 0 && Math.abs(d - ring) < 0.6) { col = 'l'; al = 0.85; }
      else if (hash(x, y, seed) < 0.08) { col = 'b'; al = 0.7; }
      px(cx + x, cy + y, PAL[col], al);
    }
    // the glint: a 1 px highlight and a lit pixel beside it
    px(cx + Math.round(m - R * 0.45), cy + Math.round(m + R * 0.3), PAL.h);
    px(cx + Math.round(m - R * 0.45) + 1, cy + Math.round(m + R * 0.3), PAL.l, 0.9);
  };
  blob(F.ripple, CELL, 6.6, 1.6, 1); blob(F.ripple + 1, CELL, 6.6, 3.4, 1); blob(F.ripple + 2, CELL, 6.6, 5.2, 1); blob(F.puddle, CELL, 6.6, 0, 1);
  {
    // a tear spot: soaked-in ground, darker, a few wet pixels and a glint
    const [cx, cy] = cell(F.spot);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const dx = x - 7.5, dy = y - 7.5, a = Math.atan2(dy, dx), r = 5.4 * (1 + 0.12 * Math.sin(a * 3 + 2) + 0.08 * Math.sin(a * 7));
      if (Math.hypot(dx, dy) > r) continue;
      px(cx + x, cy + y, '#1d2833', 0.5);
      if (hash(x, y, 9) < 0.07) px(cx + x, cy + y, PAL.s, 0.6);
    }
    px(cx + 6, cy + 9, PAL.h); px(cx + 7, cy + 9, PAL.b, 0.8);
  }
  for (let k = 0; k < 4; k++) blob(F.pool + k * 2, CELL * 2, 14.5, k < 3 ? 4 + k * 4.5 : 0, 3);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the tear material: per instance aPS = (world x, y, z, size in m), aFA = (frame, alpha, flat 0/1, cells spanned).
 *  uLight dims the sprites with the light they are in; uGlint lifts the white highlight pixels to full white (a
 *  flashlight catching the water). */
export function tearMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: 1 }, uGlint: { value: 0 } }]),
    vertexShader: /* glsl */ `
attribute vec4 aPS; attribute vec4 aFA;
varying vec2 vUv; varying float vA;
#include <fog_pars_vertex>
void main() {
  vec3 wp;
  if (aFA.z > 0.5) wp = aPS.xyz + vec3(position.x, 0.0, -position.y) * aPS.w;
  else {
    // upright billboard: faces the camera, stays vertical (a falling drop keeps its point up)
    vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    wp = aPS.xyz + (right * position.x + vec3(0.0, position.y, 0.0)) * aPS.w;
  }
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float f = aFA.x, span = aFA.w;
  vec2 cell = vec2(mod(f, ${COLS}.0), floor(f / ${COLS}.0));
  vUv = (cell + vec2(position.x + 0.5, 0.5 - position.y) * span) / vec2(${COLS}.0, ${ROWS}.0);
  vA = aFA.y;
  #include <fog_vertex>
}`,
    fragmentShader: /* glsl */ `
uniform sampler2D map; uniform float uLight; uniform float uGlint;
varying vec2 vUv; varying float vA;
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.3) discard;
  vec3 col = c.rgb * uLight;
  if (c.r > 0.98 && c.g > 0.98 && c.b > 0.98) col = mix(col, vec3(1.0), uGlint);
  gl_FragColor = vec4(col, c.a * vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    transparent: true, depthWrite: false, fog: true,
  });
  m.uniforms.map.value = map;
  return m;
}
