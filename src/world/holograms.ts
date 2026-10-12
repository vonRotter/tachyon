import * as THREE from 'three';

const shared = { uTime: { value: 0 } };

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float t = uTime + uSeed * 10.0;
    // occasional horizontal glitch band
    float band = step(0.985, h(floor(t * 6.0))) * step(abs(vUv.y - fract(t * 0.7)), 0.06);
    vec2 uv = vUv + vec2(band * 0.03, 0.0);
    float r = texture2D(uMap, uv + vec2(0.003, 0.0)).a;
    float g = texture2D(uMap, uv).a;
    float b = texture2D(uMap, uv - vec2(0.003, 0.0)).a;
    float scan = 0.75 + 0.25 * sin(vUv.y * 220.0 - t * 8.0);
    float flicker = 0.88 + 0.12 * h(floor(t * 24.0));
    float frame = smoothstep(0.0, 0.01, vUv.x) * smoothstep(0.0, 0.01, 1.0 - vUv.x) *
                  smoothstep(0.0, 0.04, vUv.y) * smoothstep(0.0, 0.04, 1.0 - vUv.y);
    vec3 col = vec3(r, g, b) * uColor * 2.4 * scan * flicker;
    float edge = (1.0 - frame) * 0.25 + 0.04;
    col += uColor * edge * scan;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function textTexture(lines: string[]): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [title, sub] = lines;
  g.font = `700 ${sub ? 104 : 128}px "Rajdhani", "Segoe UI", sans-serif`;
  g.fillText(title, w / 2, sub ? h * 0.38 : h / 2);
  if (sub) {
    g.font = `600 56px "Rajdhani", "Segoe UI", sans-serif`;
    g.fillText(sub, w / 2, h * 0.78);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** An additive, double-sided hologram sign. It has no collider: fly straight through it. */
export function createHologram(lines: string[], color: THREE.ColorRepresentation, width: number, seed = 0): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uMap: { value: textTexture(lines) },
      uColor: { value: new THREE.Color(color) },
      uTime: shared.uTime,
      uSeed: { value: seed },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), material);
  mesh.renderOrder = 3;
  return mesh;
}

/** Positions a sign so its face points along `normal`. */
export function placeHologram(mesh: THREE.Mesh, position: THREE.Vector3, normal: THREE.Vector3): THREE.Mesh {
  mesh.position.copy(position);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  return mesh;
}

export function updateHolograms(time: number): void {
  shared.uTime.value = time % 1000;
}
