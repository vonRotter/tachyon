import * as THREE from 'three';
import { SeededRandom } from '../core/math';

export const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.35, -0.75).normalize();

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFragment = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSun;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 6; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float n1 = fbm(d * 2.1 + vec3(3.1, 1.7, 0.0));
    float n2 = fbm(d * 4.3 + vec3(n1 * 1.8));
    float n3 = fbm(d * 9.0 - vec3(n2));
    float band = exp(-pow(dot(d, normalize(vec3(0.25, 1.0, 0.35))) * 2.4, 2.0));
    vec3 col = vec3(0.008, 0.006, 0.022);
    col += vec3(0.62, 0.10, 0.48) * pow(n2, 3.4) * 1.2 * (0.3 + band);
    col += vec3(0.04, 0.38, 0.55) * pow(n1, 3.8) * 1.0;
    col += vec3(1.0, 0.45, 0.12) * pow(max(n2 - 0.42, 0.0), 2.0) * 2.0 * band;
    col *= 0.75 + 0.5 * n3;
    float dark = smoothstep(0.55, 0.75, fbm(d * 3.0 + 7.0));
    col *= 1.0 - dark * 0.6 * band;
    float s = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.85, 0.6) * (pow(s, 3000.0) * 4.0 + pow(s, 300.0) * 0.2 + pow(s, 8.0) * 0.035);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const planetVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vView;
  void main() {
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const planetFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vView;
  uniform vec3 uSun;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  float n1(float x) { float i = floor(x); float f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main() {
    vec3 p = normalize(vLocal);
    float lat = p.y * 9.0 + sin(p.x * 6.0 + p.z * 4.0) * 0.35 + n1(p.y * 40.0) * 0.4;
    float bands = 0.5 + 0.5 * sin(lat * 3.1);
    vec3 a = vec3(0.10, 0.55, 0.62);
    vec3 b = vec3(0.55, 0.22, 0.65);
    vec3 c = vec3(0.95, 0.75, 0.55);
    vec3 col = mix(a, b, bands);
    col = mix(col, c, smoothstep(0.75, 0.95, n1(lat * 2.0 + 3.0)) * 0.6);
    float lit = max(dot(vNormal, uSun), 0.0);
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
    vec3 outCol = col * (0.04 + lit * 1.1) + vec3(0.3, 0.7, 1.0) * rim * (0.2 + lit) * 1.4;
    gl_FragColor = vec4(outCol, 1.0);
  }
`;

const ringFragment = /* glsl */ `
  varying vec2 vUv2;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float r = vUv2.x;
    float stripes = 0.55 + 0.45 * sin(r * 120.0) * sin(r * 37.0 + 1.3);
    float gap = smoothstep(0.48, 0.5, r) * (1.0 - smoothstep(0.53, 0.55, r));
    float edge = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.9, 1.0, r));
    float a = stripes * edge * (1.0 - gap * 0.9) * 0.55;
    gl_FragColor = vec4(mix(uColorA, uColorB, r) * a, a);
  }
`;

const ringVertex = /* glsl */ `
  attribute float aRadial;
  varying vec2 vUv2;
  void main() {
    vUv2 = vec2(aRadial, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Infinitely distant backdrop: nebula, stars, ringed gas giant. Lives in its own scene with a
 * camera that copies the main camera's rotation, and is rendered before the main pass.
 */
export class Sky {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 1, 3000);
  private readonly group = new THREE.Group();

  constructor() {
    this.scene.add(this.group);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: { uSun: { value: SUN_DIRECTION } },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.group.add(sky);

    // Stars in two layers for size variation
    const rng = new SeededRandom(5);
    for (const [count, size] of [
      [3500, 1.4],
      [600, 2.6],
    ] as const) {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const u = rng.range(-1, 1);
        const t = rng.range(0, Math.PI * 2);
        const s = Math.sqrt(1 - u * u);
        pos.set([s * Math.cos(t) * 900, u * 900, s * Math.sin(t) * 900], i * 3);
        c.setHSL(rng.pick([0.58, 0.6, 0.08, 0.12, 0.85, 0.0]), rng.range(0.2, 0.8), rng.range(0.6, 0.95));
        const k = rng.range(0.6, 1.6);
        col.set([c.r * k, c.g * k, c.b * k], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size,
          sizeAttenuation: false,
          vertexColors: true,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        }),
      );
      stars.renderOrder = -9;
      stars.frustumCulled = false;
      this.group.add(stars);
    }

    // Gas giant with rings, placed in the backdrop
    const planetDir = new THREE.Vector3(0.6, -0.25, 0.75).normalize();
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(260, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader: planetVertex,
        fragmentShader: planetFragment,
        uniforms: { uSun: { value: SUN_DIRECTION } },
      }),
    );
    planet.position.copy(planetDir).multiplyScalar(820);
    planet.rotation.set(0.3, 0.4, 0.25);
    planet.renderOrder = -8;
    planet.frustumCulled = false;
    this.group.add(planet);

    const inner = 330;
    const outer = 560;
    const ringGeo = new THREE.RingGeometry(inner, outer, 128, 1);
    const radial = new Float32Array(ringGeo.getAttribute('position').count);
    const pa = ringGeo.getAttribute('position');
    for (let i = 0; i < radial.length; i++) {
      const r = Math.hypot(pa.getX(i), pa.getY(i));
      radial[i] = (r - inner) / (outer - inner);
    }
    ringGeo.setAttribute('aRadial', new THREE.BufferAttribute(radial, 1));
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.ShaderMaterial({
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        uniforms: {
          uColorA: { value: new THREE.Color('#9fe8ff') },
          uColorB: { value: new THREE.Color('#ffb3e6') },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.copy(planet.position);
    ring.rotation.set(-1.25, 0.2, 0.3);
    ring.renderOrder = -7;
    ring.frustumCulled = false;
    this.group.add(ring);
  }

  update(camera: THREE.PerspectiveCamera): void {
    this.camera.quaternion.copy(camera.quaternion);
    if (this.camera.fov !== camera.fov || this.camera.aspect !== camera.aspect) {
      this.camera.fov = camera.fov;
      this.camera.aspect = camera.aspect;
      this.camera.updateProjectionMatrix();
    }
  }
}

/**
 * Sun, fill and rim lights, plus a shadow map that follows the player. The shadow box is
 * snapped to whole texels in light space so shadow edges do not crawl as the ship moves.
 */
export class Lighting {
  readonly sun = new THREE.DirectionalLight('#ffe6c7', 3.0);
  readonly fill = new THREE.HemisphereLight('#6d7dff', '#ff4f8a', 0.32);
  readonly rim = new THREE.DirectionalLight('#55e0ff', 0.45);
  private range = 450;
  private mapSize = 2048;
  private readonly lx = new THREE.Vector3();
  private readonly ly = new THREE.Vector3();
  private readonly lz = SUN_DIRECTION.clone();

  constructor(scene: THREE.Scene) {
    this.sun.position.copy(SUN_DIRECTION).multiplyScalar(1000);
    scene.add(this.sun, this.sun.target, this.fill, this.rim);
    this.rim.position.copy(SUN_DIRECTION).multiplyScalar(-1000);
    this.lx.crossVectors(new THREE.Vector3(0, 1, 0), this.lz).normalize();
    this.ly.crossVectors(this.lz, this.lx);
  }

  configureShadows(enabled: boolean, mapSize: number, range: number): void {
    this.sun.castShadow = enabled;
    this.range = range;
    this.mapSize = mapSize;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== mapSize) {
      sh.mapSize.set(mapSize, mapSize);
      sh.map?.dispose();
      sh.map = null;
    }
    const cam = sh.camera;
    cam.left = -range;
    cam.right = range;
    cam.top = range;
    cam.bottom = -range;
    cam.near = 1;
    cam.far = 4000;
    cam.updateProjectionMatrix();
    const texel = (2 * range) / mapSize;
    sh.bias = -0.0003;
    sh.normalBias = texel * 1.2;
  }

  update(focus: THREE.Vector3): void {
    if (!this.sun.castShadow) return;
    const texel = (2 * this.range) / this.mapSize;
    const fx = Math.round(focus.dot(this.lx) / texel) * texel;
    const fy = Math.round(focus.dot(this.ly) / texel) * texel;
    const fz = focus.dot(this.lz);
    const snapped = this.sun.target.position.set(0, 0, 0);
    snapped.addScaledVector(this.lx, fx).addScaledVector(this.ly, fy).addScaledVector(this.lz, fz);
    this.sun.position.copy(snapped).addScaledVector(this.lz, 2000);
  }
}

/** Prefiltered environment map built from the procedural sky, for metallic reflections. */
export function buildEnvironment(renderer: THREE.WebGLRenderer, sky: Sky): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(sky.scene, 0.02, 1, 3000);
  pmrem.dispose();
  return rt.texture;
}

function cloudTexture(seed: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  const rng = new SeededRandom(seed);
  const grid = 8;
  const lattice: number[] = [];
  for (let i = 0; i < (grid + 1) * (grid + 1) * 4; i++) lattice.push(rng.next());
  const noise = (x: number, y: number, oct: number) => {
    const n = grid * oct;
    const gx = x * n;
    const gy = y * n;
    const ix = Math.floor(gx) % grid;
    const iy = Math.floor(gy) % grid;
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (a: number, b: number) => lattice[((b % grid) * (grid + 1) + (a % grid)) * 4 + (oct % 4)];
    const top = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx;
    const bot = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx;
    return top * (1 - sy) + bot * sy;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const f = noise(u, v, 1) * 0.55 + noise(u, v, 2) * 0.3 + noise(u, v, 4) * 0.15;
      const a = Math.max(0, 1 - r) ** 1.6 * Math.max(0, f * 1.6 - 0.35);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Local gas clouds: large soft billboards scattered through the play area. Unlike the backdrop
 * they have parallax, so flying past them sells distance and speed. They fade out as the camera
 * gets close, so you never see a flat card edge-on.
 */
export class GasClouds {
  readonly group = new THREE.Group();
  private readonly items: { sprite: THREE.Sprite; base: number; size: number }[] = [];

  constructor() {
    const textures = [cloudTexture(11), cloudTexture(29), cloudTexture(47)];
    const rng = new SeededRandom(77);
    const clusters: [THREE.Vector3, number, string[]][] = [
      [new THREE.Vector3(-1200, -100, 650), 600, ['#7a3cff', '#ff4fa0', '#3fc8ff']],
      [new THREE.Vector3(600, 300, 900), 700, ['#ff7a35', '#ff4fa0']],
      [new THREE.Vector3(-400, 500, -1400), 800, ['#3fe0c0', '#3f8cff']],
      [new THREE.Vector3(1600, -300, -200), 700, ['#b04fff', '#ff6a8a']],
      [new THREE.Vector3(0, -700, 300), 900, ['#3fc8ff', '#7a3cff']],
    ];
    for (const [center, spread, colors] of clusters) {
      for (let i = 0; i < 14; i++) {
        const mat = new THREE.SpriteMaterial({
          map: rng.pick(textures),
          color: new THREE.Color(rng.pick(colors)),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          rotation: rng.range(0, Math.PI * 2),
          fog: false,
        });
        const sprite = new THREE.Sprite(mat);
        const size = rng.range(180, 520);
        sprite.scale.set(size, size, 1);
        sprite.position
          .set(rng.range(-1, 1), rng.range(-0.6, 0.6), rng.range(-1, 1))
          .multiplyScalar(spread)
          .add(center);
        sprite.renderOrder = 2;
        const base = rng.range(0.1, 0.22);
        mat.opacity = base;
        this.group.add(sprite);
        this.items.push({ sprite, base, size });
      }
    }
  }

  update(cameraPos: THREE.Vector3): void {
    for (const it of this.items) {
      const d = it.sprite.position.distanceTo(cameraPos);
      const near = THREE.MathUtils.smoothstep(d, it.size * 0.25, it.size * 0.9);
      (it.sprite.material as THREE.SpriteMaterial).opacity = it.base * near;
      it.sprite.visible = near > 0.01;
    }
  }
}

/**
 * Space dust: short streaks around the camera that stretch with velocity. Without a nearby
 * reference, speed is invisible in space, and this is the cheapest fix.
 */
export class SpaceDust {
  private readonly count = 400;
  private readonly box = 220;
  private readonly offsets: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  readonly mesh: THREE.LineSegments;

  constructor() {
    this.offsets = new Float32Array(this.count * 3);
    for (let i = 0; i < this.offsets.length; i++) this.offsets[i] = Math.random() * this.box;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 6), 3));
    const colors = new Float32Array(this.count * 6);
    for (let i = 0; i < this.count; i++) {
      const tint = Math.random();
      const c = tint < 0.33 ? [0.6, 0.85, 1] : tint < 0.66 ? [1, 0.7, 0.9] : [0.9, 0.9, 1];
      colors.set([c[0] * 0.9, c[1] * 0.9, c[2] * 0.9, 0, 0, 0], i * 6);
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mesh = new THREE.LineSegments(
      this.geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.42,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  update(cameraPos: THREE.Vector3, velocity: THREE.Vector3): void {
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const b = this.box;
    const half = b / 2;
    const streak = Math.min(0.09, 14 / Math.max(velocity.length(), 1));
    for (let i = 0; i < this.count; i++) {
      const ox = this.offsets[i * 3];
      const oy = this.offsets[i * 3 + 1];
      const oz = this.offsets[i * 3 + 2];
      // wrap each mote into a box centred on the camera
      const x = cameraPos.x + ((((ox - cameraPos.x) % b) + b) % b) - half;
      const y = cameraPos.y + ((((oy - cameraPos.y) % b) + b) % b) - half;
      const z = cameraPos.z + ((((oz - cameraPos.z) % b) + b) % b) - half;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x - velocity.x * streak;
      arr[i * 6 + 4] = y - velocity.y * streak;
      arr[i * 6 + 5] = z - velocity.z * streak;
    }
    pos.needsUpdate = true;
  }
}
