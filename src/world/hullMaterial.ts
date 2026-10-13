import * as THREE from 'three';

/**
 * Procedural surface detail for flat-shaded, vertex-coloured hulls.
 *
 * The generated geometry has no UVs, so the pattern is projected from three sides in object
 * space (triplanar), which keeps it glued to moving ships. Per pixel it produces:
 *   - staggered hull plates with bevelled seams (a bump-mapped height field)
 *   - per-plate tint, roughness and metalness variation
 *   - grime and streaks from layered value noise
 *   - optional clusters of lit windows on big structures
 *   - a rocky mode (no plates, noisy bumps) for asteroids
 * Detail fades out once plates become smaller than a few pixels, so distant hulls do not shimmer.
 */

export interface HullOptions {
  /** Plate size in metres. */
  panel: number;
  /** Fraction of window clusters that are lit (0 = no windows). */
  windows?: number;
  grime?: number;
  rock?: boolean;
  roughness?: number;
  metalness?: number;
  /** How dark plate seams are (0..1, default 1). */
  seams?: number;
  /** Per-plate brightness variation (default 1). */
  tintVariation?: number;
}

const FUNCS = /* glsl */ `
varying vec3 vObjPos;
uniform float uPanel;
uniform float uWindows;
uniform float uGrime;
uniform float uDetail;
uniform float uRock;
uniform float uSeam;
uniform float uTintVar;

float hHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hHash3(i), hHash3(i + vec3(1, 0, 0)), f.x), mix(hHash3(i + vec3(0, 1, 0)), hHash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hHash3(i + vec3(0, 0, 1)), hHash3(i + vec3(1, 0, 1)), f.x), mix(hHash3(i + vec3(0, 1, 1)), hHash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float hFbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * hNoise(p); p *= 2.07; a *= 0.5; }
  return s;
}

// x: bevel height 0..1, y: seam darkness 0..1, z: plate id 0..1, w: distance to plate edge
vec4 hPlates(vec2 uv) {
  float row = floor(uv.y);
  uv.x += hHash(vec2(row, 7.0)) * 0.73;
  vec2 cell = floor(uv);
  vec2 f = fract(uv);
  if (hHash(cell) > 0.55) {
    float half_ = step(0.5, f.x);
    f.x = fract(f.x * 2.0);
    cell += vec2(half_ * 0.5 + 50.0, 0.0);
  }
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float aa = fwidth(uv.x) + fwidth(uv.y);
  float seam = 1.0 - smoothstep(0.012, 0.012 + aa * 1.5, e);
  float height = smoothstep(0.0, 0.07, e);
  return vec4(height, seam, hHash(cell + 3.1), e);
}

// Screen-space bump mapping (same maths as three.js perturbNormalArb).
vec3 hullPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 dx = dFdx(surfPos);
  vec3 dy = dFdy(surfPos);
  // degenerate derivatives (edge-on or sub-pixel triangles) would produce NaN
  if (dot(dx, dx) < 1e-14 || dot(dy, dy) < 1e-14) return surfNorm;
  vec3 sx = normalize(dx);
  vec3 sy = normalize(dy);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  vec3 n = abs(det) * surfNorm - grad;
  float len2 = dot(n, n);
  return len2 > 1e-14 ? n * inversesqrt(len2) : surfNorm;
}
`;

const COLOR = /* glsl */ `
vec3 hp = vObjPos / uPanel;
vec3 hc = cross(dFdx(vObjPos), dFdy(vObjPos));
vec3 hn = dot(hc, hc) > 1e-20 ? normalize(hc) : vec3(0.0, 1.0, 0.0);
vec3 hw = pow(abs(hn), vec3(8.0));
hw /= (hw.x + hw.y + hw.z + 1e-5);
float footprint = length(fwidth(hp));
float detailFade = (1.0 - smoothstep(0.12, 0.45, footprint)) * uDetail;

float hullHeight = 0.0;
float hullSeam = 0.0;
float hullId = 0.5;
vec3 hullEmit = vec3(0.0);
float grimeN = hFbm(vObjPos * (0.45 / uPanel));
float streakN = hFbm(vec3(vObjPos.x * 0.5, vObjPos.y * 0.06, vObjPos.z * 0.5) / uPanel);

if (uRock > 0.5) {
  hullHeight = hFbm(vObjPos * 0.12) * 0.7 + hNoise(vObjPos * 0.9) * 0.3;
  hullId = hNoise(vObjPos * 0.05);
} else if (detailFade > 0.001) {
  vec4 px = hPlates(hp.zy);
  vec4 py = hPlates(hp.xz);
  vec4 pz = hPlates(hp.xy);
  vec4 pp = px * hw.x + py * hw.y + pz * hw.z;
  hullHeight = pp.x;
  hullSeam = pp.y * detailFade;
  hullId = pp.z;

  if (uWindows > 0.0 && abs(hn.y) < 0.6) {
    vec2 duv = hw.x > hw.z ? hp.zy : hp.xy;
    vec2 wuv = duv * vec2(4.0, 3.0);
    vec2 wf = fract(wuv) - 0.5;
    float wdot = 1.0 - smoothstep(0.16, 0.24, max(abs(wf.x) * 0.8, abs(wf.y) * 1.7));
    vec2 cluster = floor(wuv / vec2(5.0, 3.0));
    float lit = step(1.0 - uWindows, hHash(cluster + 9.1)) * step(0.25, hHash(floor(wuv) + 1.7));
    vec3 wcol = mix(vec3(1.0, 0.72, 0.38), vec3(0.4, 0.9, 1.0), step(0.6, hHash(cluster + 2.0)));
    hullEmit = wcol * wdot * lit * detailFade * 1.25;
  }
}

float tint = mix(1.0, 1.0 + (hullId - 0.57) * 0.28 * uTintVar, max(detailFade, uRock));
float dirt = mix(1.0, 0.62 + 0.38 * smoothstep(0.2, 0.75, grimeN), uGrime);
dirt *= mix(1.0, 0.85 + 0.15 * smoothstep(0.3, 0.7, streakN), uGrime);
diffuseColor.rgb *= tint * dirt * (1.0 - hullSeam * 0.45 * uSeam);
float hullRough = (hullId - 0.5) * 0.3 * detailFade + (1.0 - dirt) * 0.5 + hullSeam * 0.25;
float hullMetal = (hullId > 0.78 ? 0.3 : 0.0) * detailFade - (1.0 - dirt) * 0.3;
float bumpDepth = uRock > 0.5 ? 1.6 : uPanel * 0.03 * detailFade * uSeam;
vec2 hullDH = vec2(dFdx(hullHeight), dFdy(hullHeight)) * bumpDepth;
`;

export function createHullMaterial(opts: HullOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: opts.roughness ?? 0.48,
    metalness: opts.metalness ?? 0.4,
  });
  const uniforms = {
    uPanel: { value: opts.panel },
    uWindows: { value: opts.windows ?? 0 },
    uGrime: { value: opts.grime ?? 0.6 },
    uDetail: { value: 1 },
    uRock: { value: opts.rock ? 1 : 0 },
    uSeam: { value: opts.seams ?? 1 },
    uTintVar: { value: opts.tintVariation ?? 1 },
  };
  mat.userData.hullUniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FUNCS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + hullRough, 0.06, 1.0);',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(metalnessFactor + hullMetal, 0.0, 1.0);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal = hullPerturb(-vViewPosition, normal, hullDH, faceDirection);',
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hullEmit;');
  };
  mat.customProgramCacheKey = () => 'hull-v2';
  return mat;
}

/** Toggles procedural detail on every hull material (quality setting). */
export function setHullDetail(materials: THREE.Material[], on: boolean): void {
  for (const m of materials) {
    const u = m.userData.hullUniforms as { uDetail: { value: number } } | undefined;
    if (u) u.uDetail.value = on ? 1 : 0;
  }
}
