import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Final lens pass, applied in linear HDR before tone mapping:
 *   - chromatic aberration and radial blur that scale with boost
 *   - vignette, light film grain and a red edge pulse on damage
 *   - a procedural sun flare (streak, halo and ghosts) whose visibility is supplied by the
 *     game, which raycasts towards the sun so structures and ships occlude it
 */
const LensShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uBoost: { value: 0 },
    uDamage: { value: 0 },
    uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVis: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uBoost;
    uniform float uDamage;
    uniform vec2 uSunPos;
    uniform float uSunVis;
    uniform float uAspect;
    varying vec2 vUv;

    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

    vec3 sampleCA(vec2 uv, vec2 dir, float amount) {
      return vec3(
        texture2D(tDiffuse, uv + dir * amount).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - dir * amount).b);
    }

    void main() {
      vec2 fromCenter = vUv - 0.5;
      float r = length(fromCenter * vec2(uAspect, 1.0));
      vec2 dir = normalize(fromCenter + 1e-5);
      float ca = 0.0012 * r + uBoost * 0.006 * r * r;
      vec3 col = sampleCA(vUv, dir, ca);

      if (uBoost > 0.01) {
        vec3 acc = col;
        float total = 1.0;
        for (int i = 1; i <= 6; i++) {
          float k = float(i) / 6.0;
          vec2 uv = vUv - fromCenter * k * 0.045 * uBoost * r;
          float w = 1.0 - k * 0.7;
          acc += texture2D(tDiffuse, uv).rgb * w;
          total += w;
        }
        col = mix(col, acc / total, smoothstep(0.1, 0.5, r));
      }

      if (uSunVis > 0.001) {
        vec2 s = uSunPos - 0.5;
        vec2 p = (vUv - 0.5);
        vec2 ps = (p - s) * vec2(uAspect, 1.0);
        float d = length(ps);
        vec3 flare = vec3(0.0);
        flare += vec3(1.0, 0.85, 0.65) * exp(-abs(ps.y) * 260.0) * exp(-abs(ps.x) * 5.0) * 0.45;
        flare += vec3(1.0, 0.9, 0.75) * exp(-d * 22.0) * 0.4;
        flare += vec3(0.5, 0.8, 1.0) * smoothstep(0.012, 0.0, abs(d - 0.22)) * 0.12;
        for (int i = 0; i < 4; i++) {
          float t = -0.4 - float(i) * 0.38;
          vec2 gp = (p - s * t) * vec2(uAspect, 1.0);
          float gr = 0.02 + float(i) * 0.018;
          vec3 gc = i == 0 ? vec3(1.0, 0.4, 0.8) : i == 1 ? vec3(0.3, 0.9, 1.0) : i == 2 ? vec3(1.0, 0.7, 0.3) : vec3(0.6, 0.5, 1.0);
          flare += gc * smoothstep(gr, gr * 0.6, length(gp)) * 0.08;
        }
        col += flare * uSunVis;
      }

      float vig = smoothstep(0.95, 0.35, r);
      col *= mix(0.72, 1.0, vig);
      col = mix(col, col * vec3(1.6, 0.35, 0.35), uDamage * (1.0 - vig) * 0.8);
      col += (rand(vUv * 913.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class LensPass extends ShaderPass {
  constructor() {
    super(LensShader);
  }

  set(params: { time: number; boost: number; damage: number; sun: THREE.Vector2; sunVis: number; aspect: number }): void {
    const u = this.uniforms as typeof LensShader.uniforms;
    u.uTime.value = params.time % 100;
    u.uBoost.value = params.boost;
    u.uDamage.value = params.damage;
    u.uSunPos.value.copy(params.sun);
    u.uSunVis.value = params.sunVis;
    u.uAspect.value = params.aspect;
  }
}
