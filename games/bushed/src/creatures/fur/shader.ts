// FUR shaders: patches for MeshStandardMaterial (so the sun, the flashlight, fog and shadows all apply) that turn a
// skinned mesh's fur-bearing triangles into shells (one instanced draw: gl_InstanceID is the shell) or silhouette
// fin cards. Everything happens after skinning, in object space:
//   shells   the skin pushed out along its skinned normal, h = (shell + 1) / shells, bent by the combing, the spring
//            groups' lag (fur.ts), gravity, the wind's flutter and a shake, never back into the skin
//   strands  one strand per page texel (or per `strand` texels): crisp, square, pixel-art strands that line up with
//            the painted page. Strands gather into tufts (a jittered clump grid): toward the tip each shell samples
//            nearer its tuft's heart, so tufts close to points like drawn flames of hair. A strand's height comes
//            from the fur page (R density, G length, B clump, A tip) and its tuft; colour is the painted texel at
//            its root, stepped darker toward the root (self-shadow) and lighter (tipCol) at the tip
//   fins     a card per sampled root, standing along the normal and turned square to the eye round it, kept only
//            where the skin turns edge-on (the silhouette), with strands across it
//   weather  uFurWet clumps, flattens and darkens; uFurSnow caps upturned tips white
export const FUR_VERT_PARS = /* glsl */ `
attribute float aFurLen;
attribute float aSpring;
attribute vec3 aComb;
#ifdef FUR_FIN
attribute vec3 aFin;
varying vec2 vFinUV;
varying float vFinVis;
#endif
uniform float uFurLen, uShells, uDroop, uFurTime, uShake, uFurWet;
uniform vec3 uBend[4];
uniform vec3 uGrav;
uniform vec3 uWindObj;
varying float vFurH;
varying float vFurL;
`;
export const FUR_VERT = /* glsl */ `
{
#ifdef FUR_FIN
  float fh = aFin.y;
#else
  float fh = (float(gl_InstanceID) + 1.0) / uShells;
#endif
  vec3 fn = normalize(objectNormal);
#ifdef USE_SKINNING
  vec3 comb = (skinMatrix * vec4(aComb, 0.0)).xyz;
#else
  vec3 comb = aComb;
#endif
  float L = aFurLen * uFurLen * (1.0 - 0.3 * uFurWet);
  int si = int(aSpring + 0.5);
  vec3 bend = comb * (1.0 + 0.6 * uFurWet) + uBend[si] + uGrav * uDroop * (1.0 + 0.8 * uFurWet);
  float ph = dot(transformed, vec3(7.1, 5.3, 6.7)) * 6.0;
  bend += uWindObj * (0.45 * sin(uFurTime * 6.3 + ph) + 0.25 * sin(uFurTime * 13.1 + ph * 1.7));
  bend += vec3(sin(uFurTime * 31.0 + ph), 0.3 * sin(uFurTime * 23.0 + ph * 0.7), cos(uFurTime * 27.0 + ph * 1.3)) * uShake * 0.35;
  float into = dot(bend, fn);
  bend -= fn * min(0.0, into) * 0.85;
  vec3 off = (fn * fh + bend * (fh * fh)) * L;
#ifdef FUR_FIN
  vec4 mv0 = modelViewMatrix * vec4(transformed, 1.0);
  vec3 nV = normalize(mat3(modelViewMatrix) * fn);
  vec3 sV = cross(nV, normalize(-mv0.xyz));
  float sl = length(sV);
  vec3 sO = inverse(mat3(modelViewMatrix)) * (sV / max(sl, 1e-4));
  off += sO * (aFin.x - 0.5) * aFin.z * (1.0 - 0.4 * fh);
  vFinUV = aFin.xy; vFinVis = sl;
#endif
  transformed += off;
  vFurH = fh; vFurL = aFurLen;
}
`;
export const FUR_FRAG_PARS = /* glsl */ `
uniform sampler2D uFurMask;
uniform vec4 uFurTex;
uniform vec4 uFurK;
uniform vec3 uTipCol;
uniform float uTipK, uFurWet, uFurSnow;
varying float vFurH;
varying float vFurL;
#ifdef FUR_FIN
varying vec2 vFinUV;
varying float vFinVis;
#endif
float fHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
vec2 fHash2(vec2 p) { return vec2(fHash(p), fHash(p + vec2(37.17, 11.31))); }
`;
// replaces <map_fragment>: decides whether this fragment is on a strand (else discard) and colours it
export const FUR_FRAG = /* glsl */ `
{
  vec2 dUx = dFdx(vMapUv), dUy = dFdy(vMapUv);
#ifdef FUR_FIN
  float n = 9.0;
  float sx = floor(vFinUV.x * n);
  vec2 root = floor(vMapUv * uFurTex.xy);
  float sid = fHash(vec2(sx, root.x + root.y * 1.618));
  vec4 m = uFurK.w > 0.5 ? textureGrad(uFurMask, vMapUv, dUx, dUy) : vec4(1.0, vFurL, 0.5, 0.5);
  float rel = min(1.0, m.g / max(vFurL, 0.02));
  float edge = abs(vFinUV.x - 0.5) * 2.0;
  float sh = rel * (0.4 + 0.6 * fHash(vec2(sx + 7.0, sid * 91.0))) * (1.0 - edge * edge * 0.45);
  float fh = vFinUV.y;
  if (fh > sh || sid > m.r * uFurK.x || vFinVis < 0.86 - sid * 0.12 || m.r < 0.05) discard;
  vec2 suv = vMapUv;
#else
  vec2 g = vMapUv * uFurTex.xy / uFurTex.z;
  vec2 cg = g / uFurTex.w;
  vec2 ci = floor(cg - 0.5);
  vec2 best = vec2(0.0); float bd = 1e9;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 c = ci + vec2(float(i), float(j));
    vec2 ctr = c + 0.15 + 0.7 * fHash2(c);
    vec2 dd = cg - ctr; float d = dot(dd, dd);
    if (d < bd) { bd = d; best = ctr; }
  }
  float fh = vFurH;
  float pull = clamp(uFurK.y * (1.0 + 0.8 * uFurWet) * fh, 0.0, 0.94);
  vec2 st = floor(mix(cg, best, pull) * uFurTex.w);
  vec2 suv = (st + 0.5) * uFurTex.z / uFurTex.xy;
  vec4 m = uFurK.w > 0.5 ? textureGrad(uFurMask, suv, dUx, dUy) : vec4(1.0, vFurL, 0.5, 0.5);
  float sid = fHash(st);
  float tuft = 1.0 - clamp(sqrt(bd) * (0.35 + 0.9 * m.b), 0.0, 1.0) * 0.7;
  float rel = min(1.0, m.g / max(vFurL, 0.02));
  float sh = rel * tuft * (0.62 + 0.38 * fHash(st + 17.0));
  if (sid > m.r * uFurK.x || fh > sh) discard;
#endif
  float t = fh / max(sh, 1e-3);
  vec4 col = textureGrad(map, suv, dUx, dUy);
  float ao = mix(uFurK.z, 1.0, smoothstep(0.0, 0.85, fh));
  ao = floor(ao * 5.0 + 0.5) / 5.0;
  col.rgb *= ao * (0.9 + 0.2 * step(0.55, fract(sid * 7.13)));
  float tip = step(0.6, t) * uTipK * (uFurK.w > 0.5 ? m.a * 2.0 : 1.0) * (0.5 + 0.5 * step(0.82, t));
  col.rgb = mix(col.rgb, col.rgb * uTipCol, clamp(tip, 0.0, 1.0));
  col.rgb *= 1.0 - 0.35 * uFurWet;
  float up = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
  col.rgb = mix(col.rgb, vec3(0.9, 0.93, 0.97), clamp(uFurSnow * step(0.45, t) * smoothstep(0.1, 0.45, up) * 1.5, 0.0, 1.0));
  diffuseColor = vec4(diffuse * col.rgb, opacity);
}
`;
