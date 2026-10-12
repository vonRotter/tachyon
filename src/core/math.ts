import * as THREE from 'three';

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent smoothing factor for exponential approach. */
export const dampFactor = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, dampFactor(lambda, dt));

export const rand = (lo = 0, hi = 1): number => lo + Math.random() * (hi - lo);
export const randSign = (): number => (Math.random() < 0.5 ? -1 : 1);
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export function randomUnitVector(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(theta), u, s * Math.sin(theta));
}

/** Small deterministic PRNG so procedural structures look the same every run. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  int(lo: number, hiInclusive: number): number {
    return Math.floor(this.range(lo, hiInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

export const AXIS_X = new THREE.Vector3(1, 0, 0);
export const AXIS_Y = new THREE.Vector3(0, 1, 0);
export const AXIS_Z = new THREE.Vector3(0, 0, 1);
export const FORWARD = new THREE.Vector3(0, 0, -1);

/** Time for a projectile of `speed` to reach a target moving with `targetVel`, or -1 if impossible. */
export function interceptTime(
  relPos: THREE.Vector3,
  targetVel: THREE.Vector3,
  speed: number,
): number {
  const a = targetVel.lengthSq() - speed * speed;
  const b = 2 * relPos.dot(targetVel);
  const c = relPos.lengthSq();
  if (Math.abs(a) < 1e-6) {
    return b < 0 ? -c / b : -1;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : -1;
}

/** Ray vs sphere; returns distance along unit ray or -1. */
export function raySphere(
  o: THREE.Vector3,
  d: THREE.Vector3,
  c: THREE.Vector3,
  r: number,
  maxT: number,
): number {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  if (cc < 0) return 0;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 && t <= maxT ? t : -1;
}
