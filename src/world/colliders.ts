import * as THREE from 'three';

/**
 * Analytic static colliders plus a spatial hash.
 *
 * Station and capital-ship geometry is assembled from boxes, capsules and spheres, so collision
 * is exact against those primitives and much cheaper than testing render meshes. Every query
 * accepts an `inflate` radius which turns a ray cast into a sphere sweep. That is what stops
 * fast ships tunnelling through thin struts.
 */

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _n = new THREE.Vector3();
const _dir = new THREE.Vector3();

export interface RayHit {
  t: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  collider: Collider | null;
}

export function makeRayHit(): RayHit {
  return { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
}

export abstract class Collider {
  readonly min = new THREE.Vector3();
  readonly max = new THREE.Vector3();
  stamp = 0;

  /** Distance along unit direction `d` where a sphere of radius `inflate` first touches, or -1. */
  abstract raycast(
    o: THREE.Vector3,
    d: THREE.Vector3,
    maxT: number,
    inflate: number,
    outNormal: THREE.Vector3,
  ): number;

  /** Signed distance from `p` to the surface (negative inside), with outward normal. */
  abstract surfaceDistance(p: THREE.Vector3, outNormal: THREE.Vector3): number;
}

export class SphereCollider extends Collider {
  constructor(
    readonly center: THREE.Vector3,
    readonly radius: number,
  ) {
    super();
    this.min.copy(center).subScalar(radius);
    this.max.copy(center).addScalar(radius);
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, inflate: number, outNormal: THREE.Vector3): number {
    const r = this.radius + inflate;
    _p.subVectors(o, this.center);
    const b = _p.dot(d);
    const c = _p.lengthSq() - r * r;
    if (c < 0) return -1;
    const h = b * b - c;
    if (h < 0) return -1;
    const t = -b - Math.sqrt(h);
    if (t < 0 || t > maxT) return -1;
    outNormal.copy(o).addScaledVector(d, t).sub(this.center).divideScalar(r);
    return t;
  }

  surfaceDistance(p: THREE.Vector3, outNormal: THREE.Vector3): number {
    outNormal.subVectors(p, this.center);
    const len = outNormal.length();
    if (len < 1e-6) outNormal.set(0, 1, 0);
    else outNormal.divideScalar(len);
    return len - this.radius;
  }
}

export class CapsuleCollider extends Collider {
  private readonly ab = new THREE.Vector3();
  private readonly abLenSq: number;

  constructor(
    readonly a: THREE.Vector3,
    readonly b: THREE.Vector3,
    readonly radius: number,
  ) {
    super();
    this.ab.subVectors(b, a);
    this.abLenSq = Math.max(this.ab.lengthSq(), 1e-9);
    this.min.copy(a).min(b).subScalar(radius);
    this.max.copy(a).max(b).addScalar(radius);
  }

  closestPoint(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const t = Math.min(1, Math.max(0, _q.subVectors(p, this.a).dot(this.ab) / this.abLenSq));
    return out.copy(this.a).addScaledVector(this.ab, t);
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, inflate: number, outNormal: THREE.Vector3): number {
    const r = this.radius + inflate;
    this.closestPoint(o, _p);
    if (_p.distanceToSquared(o) < r * r) return -1;

    // Body (Inigo Quilez's capsule intersection), then fall back to the end caps.
    const ba = this.ab;
    const oa = _q.subVectors(o, this.a);
    const baba = this.abLenSq;
    const bard = ba.dot(d);
    const baoa = ba.dot(oa);
    const rdoa = d.dot(oa);
    const oaoa = oa.dot(oa);
    const A = baba - bard * bard;
    let t = -1;
    if (A > 1e-9) {
      const B = baba * rdoa - baoa * bard;
      const C = baba * oaoa - baoa * baoa - r * r * baba;
      const h = B * B - A * C;
      if (h < 0) return -1;
      const tt = (-B - Math.sqrt(h)) / A;
      const y = baoa + tt * bard;
      if (y > 0 && y < baba) t = tt;
    }
    if (t < 0) {
      const ta = capT(o, d, this.a, r);
      const tb = capT(o, d, this.b, r);
      if (ta >= 0 && (tb < 0 || ta < tb)) t = ta;
      else t = tb;
    }
    if (t < 0 || t > maxT) return -1;
    _p.copy(o).addScaledVector(d, t);
    this.closestPoint(_p, _q);
    outNormal.subVectors(_p, _q).normalize();
    return t;
  }

  surfaceDistance(p: THREE.Vector3, outNormal: THREE.Vector3): number {
    this.closestPoint(p, _q);
    outNormal.subVectors(p, _q);
    const len = outNormal.length();
    if (len < 1e-6) {
      outNormal.set(1, 0, 0);
      if (Math.abs(this.ab.x) > Math.abs(this.ab.y)) outNormal.set(0, 1, 0);
    } else outNormal.divideScalar(len);
    return len - this.radius;
  }
}

function capT(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : -1;
}

export class BoxCollider extends Collider {
  readonly axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  private readonly he: [number, number, number];

  constructor(
    readonly center: THREE.Vector3,
    halfExtents: THREE.Vector3,
    quat: THREE.Quaternion,
  ) {
    super();
    this.axes = [
      new THREE.Vector3(1, 0, 0).applyQuaternion(quat),
      new THREE.Vector3(0, 1, 0).applyQuaternion(quat),
      new THREE.Vector3(0, 0, 1).applyQuaternion(quat),
    ];
    this.he = [halfExtents.x, halfExtents.y, halfExtents.z];
    const ex =
      Math.abs(this.axes[0].x) * this.he[0] + Math.abs(this.axes[1].x) * this.he[1] + Math.abs(this.axes[2].x) * this.he[2];
    const ey =
      Math.abs(this.axes[0].y) * this.he[0] + Math.abs(this.axes[1].y) * this.he[1] + Math.abs(this.axes[2].y) * this.he[2];
    const ez =
      Math.abs(this.axes[0].z) * this.he[0] + Math.abs(this.axes[1].z) * this.he[1] + Math.abs(this.axes[2].z) * this.he[2];
    this.min.set(center.x - ex, center.y - ey, center.z - ez);
    this.max.set(center.x + ex, center.y + ey, center.z + ez);
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, inflate: number, outNormal: THREE.Vector3): number {
    _p.subVectors(o, this.center);
    let tmin = -Infinity;
    let tmax = Infinity;
    let hitAxis = -1;
    let hitSign = 1;
    for (let i = 0; i < 3; i++) {
      const ax = this.axes[i];
      const lo = _p.dot(ax);
      const ld = d.dot(ax);
      const e = this.he[i] + inflate;
      if (Math.abs(ld) < 1e-9) {
        if (lo < -e || lo > e) return -1;
        continue;
      }
      let t1 = (-e - lo) / ld;
      let t2 = (e - lo) / ld;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        hitAxis = i;
        hitSign = s;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (hitAxis < 0 || tmin < 0 || tmin > maxT) return -1;
    outNormal.copy(this.axes[hitAxis]).multiplyScalar(hitSign);
    return tmin;
  }

  surfaceDistance(p: THREE.Vector3, outNormal: THREE.Vector3): number {
    _p.subVectors(p, this.center);
    let outsideSq = 0;
    let minInside = Infinity;
    let minAxis = 0;
    let minSign = 1;
    outNormal.set(0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const l = _p.dot(this.axes[i]);
      const e = this.he[i];
      if (l > e) {
        outNormal.addScaledVector(this.axes[i], l - e);
        outsideSq += (l - e) * (l - e);
      } else if (l < -e) {
        outNormal.addScaledVector(this.axes[i], l + e);
        outsideSq += (l + e) * (l + e);
      }
      const inside = e - Math.abs(l);
      if (inside < minInside) {
        minInside = inside;
        minAxis = i;
        minSign = l >= 0 ? 1 : -1;
      }
    }
    if (outsideSq > 1e-12) {
      const len = Math.sqrt(outsideSq);
      outNormal.divideScalar(len);
      return len;
    }
    outNormal.copy(this.axes[minAxis]).multiplyScalar(minSign);
    return -minInside;
  }
}

interface Attached {
  world: CollisionWorld;
  object: THREE.Object3D;
  inv: THREE.Matrix4;
  rot: THREE.Quaternion;
  invRot: THREE.Quaternion;
}

const _lo = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _ln = new THREE.Vector3();
const subHit: RayHit = { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };

/**
 * Uniform hash grid over static colliders, plus attached sub-worlds that move rigidly with an
 * Object3D (the rotating habitat ring, the radar arm). Queries against a sub-world are
 * transformed into its local frame, so moving structures stay exact without rebuilding colliders.
 */
export class CollisionWorld {
  readonly colliders: Collider[] = [];
  private readonly attached: Attached[] = [];
  private readonly cells = new Map<number, Collider[]>();
  private stamp = 1;
  private readonly scratch: Collider[] = [];

  /** `margin` must exceed the largest inflate radius any query uses. */
  constructor(
    readonly cellSize = 60,
    readonly margin = 22,
  ) {}

  private key(x: number, y: number, z: number): number {
    return ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
  }

  add(c: Collider): void {
    this.colliders.push(c);
    const cs = this.cellSize;
    const m = this.margin;
    const x0 = Math.floor((c.min.x - m) / cs);
    const y0 = Math.floor((c.min.y - m) / cs);
    const z0 = Math.floor((c.min.z - m) / cs);
    const x1 = Math.floor((c.max.x + m) / cs);
    const y1 = Math.floor((c.max.y + m) / cs);
    const z1 = Math.floor((c.max.z + m) / cs);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = this.key(x, y, z);
          let list = this.cells.get(k);
          if (!list) {
            list = [];
            this.cells.set(k, list);
          }
          list.push(c);
        }
  }

  addAll(list: readonly Collider[]): void {
    for (const c of list) this.add(c);
  }

  private gatherSphere(p: THREE.Vector3, r: number): Collider[] {
    const out = this.scratch;
    out.length = 0;
    const s = ++this.stamp;
    const cs = this.cellSize;
    const x0 = Math.floor((p.x - r) / cs);
    const y0 = Math.floor((p.y - r) / cs);
    const z0 = Math.floor((p.z - r) / cs);
    const x1 = Math.floor((p.x + r) / cs);
    const y1 = Math.floor((p.y + r) / cs);
    const z1 = Math.floor((p.z + r) / cs);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const list = this.cells.get(this.key(x, y, z));
          if (!list) continue;
          for (const c of list) {
            if (c.stamp !== s) {
              c.stamp = s;
              out.push(c);
            }
          }
        }
    return out;
  }

  /** Sphere sweep (or plain ray when inflate is 0) through the grid, nearest hit first. */
  private raycastLocal(o: THREE.Vector3, d: THREE.Vector3, maxT: number, inflate: number, hit: RayHit): boolean {
    const cs = this.cellSize;
    let ix = Math.floor(o.x / cs);
    let iy = Math.floor(o.y / cs);
    let iz = Math.floor(o.z / cs);
    const stepX = d.x > 0 ? 1 : -1;
    const stepY = d.y > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const tDeltaX = d.x !== 0 ? cs / Math.abs(d.x) : Infinity;
    const tDeltaY = d.y !== 0 ? cs / Math.abs(d.y) : Infinity;
    const tDeltaZ = d.z !== 0 ? cs / Math.abs(d.z) : Infinity;
    let tMaxX = d.x !== 0 ? ((ix + (stepX > 0 ? 1 : 0)) * cs - o.x) / d.x : Infinity;
    let tMaxY = d.y !== 0 ? ((iy + (stepY > 0 ? 1 : 0)) * cs - o.y) / d.y : Infinity;
    let tMaxZ = d.z !== 0 ? ((iz + (stepZ > 0 ? 1 : 0)) * cs - o.z) / d.z : Infinity;

    const s = ++this.stamp;
    let best = maxT;
    let found = false;
    for (let guard = 0; guard < 512; guard++) {
      const list = this.cells.get(this.key(ix, iy, iz));
      if (list) {
        for (const c of list) {
          if (c.stamp === s) continue;
          c.stamp = s;
          const t = c.raycast(o, d, best, inflate, _n);
          if (t >= 0 && t <= best) {
            best = t;
            found = true;
            hit.normal.copy(_n);
            hit.collider = c;
          }
        }
      }
      const exit = Math.min(tMaxX, tMaxY, tMaxZ);
      if (found && best <= exit) break;
      if (exit > maxT) break;
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        ix += stepX;
        tMaxX += tDeltaX;
      } else if (tMaxY <= tMaxZ) {
        iy += stepY;
        tMaxY += tDeltaY;
      } else {
        iz += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
    if (found) {
      hit.t = best;
      hit.point.copy(o).addScaledVector(d, best);
    }
    return found;
  }

  /** True when nothing blocks the straight line between two points. */
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3, hit: RayHit): boolean {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-3) return true;
    _dir.divideScalar(len);
    return !this.raycast(a, _dir, len, 0, hit);
  }

  private nearestLocal(p: THREE.Vector3, range: number, outNormal: THREE.Vector3): number {
    const list = this.gatherSphere(p, range);
    let best = Infinity;
    for (const c of list) {
      const dist = c.surfaceDistance(p, _n);
      if (dist < best) {
        best = dist;
        outNormal.copy(_n);
      }
    }
    return best <= range ? best : Infinity;
  }

  private resolveLocal(p: THREE.Vector3, r: number, outNormal: THREE.Vector3): number {
    let deepest = 0;
    outNormal.set(0, 0, 0);
    for (let iter = 0; iter < 3; iter++) {
      const list = this.gatherSphere(p, r);
      let moved = false;
      for (const c of list) {
        const dist = c.surfaceDistance(p, _n);
        if (dist < r) {
          const depth = r - dist;
          p.addScaledVector(_n, depth + 0.01);
          outNormal.add(_n);
          if (depth > deepest) deepest = depth;
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (deepest > 0) outNormal.normalize();
    return deepest;
  }

  /** Attaches a sub-world whose colliders are defined in `object`'s local frame. */
  attach(world: CollisionWorld, object: THREE.Object3D): void {
    this.attached.push({ world, object, inv: new THREE.Matrix4(), rot: new THREE.Quaternion(), invRot: new THREE.Quaternion() });
    this.sync();
  }

  /** Refreshes attached transforms; call after moving attached objects. */
  sync(): void {
    for (const a of this.attached) {
      a.object.updateWorldMatrix(true, false);
      a.inv.copy(a.object.matrixWorld).invert();
      a.object.getWorldQuaternion(a.rot);
      a.invRot.copy(a.rot).invert();
    }
  }

  /** Sphere sweep (or plain ray when inflate is 0), nearest hit across static and attached geometry. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, inflate: number, hit: RayHit): boolean {
    let found = this.raycastLocal(o, d, maxT, inflate, hit);
    let best = found ? hit.t : maxT;
    for (const a of this.attached) {
      _lo.copy(o).applyMatrix4(a.inv);
      _ld.copy(d).applyQuaternion(a.invRot);
      if (a.world.raycastLocal(_lo, _ld, best, inflate, subHit)) {
        best = subHit.t;
        found = true;
        hit.t = best;
        hit.normal.copy(subHit.normal).applyQuaternion(a.rot);
        hit.point.copy(o).addScaledVector(d, best);
        hit.collider = subHit.collider;
      }
    }
    return found;
  }

  /** Distance from `p` to the nearest surface within `range`, or Infinity. */
  nearestSurface(p: THREE.Vector3, range: number, outNormal: THREE.Vector3): number {
    let best = this.nearestLocal(p, range, outNormal);
    for (const a of this.attached) {
      _lo.copy(p).applyMatrix4(a.inv);
      const dist = a.world.nearestLocal(_lo, range, _ln);
      if (dist < best) {
        best = dist;
        outNormal.copy(_ln).applyQuaternion(a.rot);
      }
    }
    return best;
  }

  /**
   * Push a sphere out of any geometry it overlaps. Returns the deepest penetration found
   * (0 when clear) and writes the averaged contact normal.
   */
  resolveSphere(p: THREE.Vector3, r: number, outNormal: THREE.Vector3): number {
    let deepest = this.resolveLocal(p, r, outNormal);
    for (const a of this.attached) {
      _lo.copy(p).applyMatrix4(a.inv);
      const depth = a.world.resolveLocal(_lo, r, _ln);
      if (depth > 0) {
        p.copy(_lo).applyMatrix4(a.object.matrixWorld);
        outNormal.add(_ln.applyQuaternion(a.rot));
        deepest = Math.max(deepest, depth);
      }
    }
    if (deepest > 0) outNormal.normalize();
    return deepest;
  }
}
