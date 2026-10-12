import * as THREE from 'three';

const vertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(aSize * uScale / max(-mv.z, 0.5), 384.0);
    vColor = aColor;
    // sprites right in front of the lens would wash out the whole view through bloom
    vAlpha = aAlpha * smoothstep(3.0, 22.0, -mv.z);
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, d));
    a *= a;
    gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
  }
`;

export interface EmitOptions {
  life: number;
  size0: number;
  size1: number;
  color0: THREE.Color;
  color1: THREE.Color;
  drag?: number;
  alpha?: number;
}

/**
 * CPU-simulated additive point sprites. One buffer for every effect: engine trails, sparks,
 * explosions and missile exhaust.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly max: number;
  private count = 0;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly drag: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor(max = 8000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.drag = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    const attr = (arr: Float32Array, n: number) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr(this.pos, 3));
    this.geo.setAttribute('aColor', attr(this.col, 3));
    this.geo.setAttribute('aSize', attr(this.size, 1));
    this.geo.setAttribute('aAlpha', attr(this.alpha, 1));
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewport(heightPx: number, fovDeg: number): void {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, o: EmitOptions): void {
    let i = this.count;
    if (i >= this.max) {
      // overwrite a random old particle rather than dropping the new one
      i = Math.floor(Math.random() * this.max);
    } else this.count++;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.size0[i] = o.size0;
    this.size1[i] = o.size1;
    this.c0[i * 3] = o.color0.r;
    this.c0[i * 3 + 1] = o.color0.g;
    this.c0[i * 3 + 2] = o.color0.b;
    this.c1[i * 3] = o.color1.r;
    this.c1[i * 3 + 1] = o.color1.g;
    this.c1[i * 3 + 2] = o.color1.b;
    this.drag[i] = o.drag ?? 0;
    this.alpha0[i] = o.alpha ?? 1;
    this.size[i] = o.size0;
    this.alpha[i] = this.alpha0[i];
    this.col[i * 3] = o.color0.r;
    this.col[i * 3 + 1] = o.color0.g;
    this.col[i * 3 + 2] = o.color0.b;
  }

  private copy(from: number, to: number): void {
    const f3 = from * 3;
    const t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
      this.c0[t3 + k] = this.c0[f3 + k];
      this.c1[t3 + k] = this.c1[f3 + k];
      this.col[t3 + k] = this.col[f3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.drag[to] = this.drag[from];
    this.alpha0[to] = this.alpha0[from];
    this.size[to] = this.size[from];
    this.alpha[to] = this.alpha[from];
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.count--;
        if (i !== this.count) this.copy(this.count, i);
        continue;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      const dragK = Math.exp(-this.drag[i] * dt);
      const i3 = i * 3;
      this.vel[i3] *= dragK;
      this.vel[i3 + 1] *= dragK;
      this.vel[i3 + 2] *= dragK;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      this.alpha[i] = this.alpha0[i] * (1 - t * t);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      const a = this.geo.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
  }

  get alive(): number {
    return this.count;
  }
}
