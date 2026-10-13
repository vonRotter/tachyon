import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { BoxCollider, CapsuleCollider, Collider, SphereCollider } from './colliders';
import { createHullMaterial } from './hullMaterial';

/**
 * Shared materials. Everything procedural is vertex-coloured so a whole station or ship
 * merges into two draw calls: lit hull plus unlit glow (glow colours exceed 1.0 to feed bloom).
 * Hull materials add procedural plating, grime and windows (see hullMaterial.ts).
 */
export const hullMaterials = {
  ship: createHullMaterial({ panel: 2.6, grime: 0.22, metalness: 0.4, roughness: 0.4, seams: 0.45, tintVariation: 0.35 }),
  structure: createHullMaterial({ panel: 6, windows: 0.09, grime: 0.5 }),
  rock: createHullMaterial({ panel: 10, rock: true, grime: 0.9, metalness: 0.05, roughness: 0.85 }),
};
export type HullKind = keyof typeof hullMaterials;

export const glowMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
});

export interface PartOptions {
  quat?: THREE.Quaternion;
  collide?: boolean;
  glow?: number; // 0 = lit hull, >0 = emissive intensity multiplier
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class StructureBuilder {
  private readonly solids: THREE.BufferGeometry[] = [];
  private readonly glows: THREE.BufferGeometry[] = [];
  readonly colliders: Collider[] = [];
  private readonly baseQuat = new THREE.Quaternion();

  constructor(private readonly base: THREE.Matrix4 = new THREE.Matrix4()) {
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    base.decompose(pos, this.baseQuat, scale);
  }

  /** Transforms a local point into world space. */
  world(p: THREE.Vector3): THREE.Vector3 {
    return p.clone().applyMatrix4(this.base);
  }

  geometry(geo: THREE.BufferGeometry, local: THREE.Matrix4, color: THREE.ColorRepresentation, glow = 0): void {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    // geometry stays in the structure's local frame so surface detail lines up with its hull
    g.applyMatrix4(local);
    const c = new THREE.Color(color);
    const k = glow > 0 ? glow : 1;
    const count = g.getAttribute('position').count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = c.r * k;
      arr[i * 3 + 1] = c.g * k;
      arr[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (glow > 0 ? this.glows : this.solids).push(g);
    geo.dispose();
  }

  box(center: THREE.Vector3, size: THREE.Vector3, color: THREE.ColorRepresentation, opts: PartOptions = {}): void {
    const quat = opts.quat ?? _q.identity();
    const local = new THREE.Matrix4().compose(center, quat, _s);
    this.geometry(new THREE.BoxGeometry(size.x, size.y, size.z), local, color, opts.glow ?? 0);
    if (opts.collide ?? true) {
      const wc = center.clone().applyMatrix4(this.base);
      const wq = this.baseQuat.clone().multiply(quat);
      this.colliders.push(new BoxCollider(wc, size.clone().multiplyScalar(0.5), wq));
    }
  }

  /** Cylinder between two points with a capsule collider: the bread and butter of trusses. */
  strut(
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    color: THREE.ColorRepresentation,
    opts: PartOptions & { sides?: number } = {},
  ): void {
    const dir = _v.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.divideScalar(len));
    const mid = _v2.addVectors(a, b).multiplyScalar(0.5);
    const local = new THREE.Matrix4().compose(mid, quat, _s);
    this.geometry(new THREE.CylinderGeometry(radius, radius, len, opts.sides ?? 6, 1), local, color, opts.glow ?? 0);
    if (opts.collide ?? true) {
      this.colliders.push(
        new CapsuleCollider(a.clone().applyMatrix4(this.base), b.clone().applyMatrix4(this.base), radius),
      );
    }
  }

  /** Cylinder along local axis given by `quat` (default Y), optionally capped, capsule collider. */
  cylinder(
    center: THREE.Vector3,
    radius: number,
    height: number,
    color: THREE.ColorRepresentation,
    opts: PartOptions & { sides?: number; radiusTop?: number } = {},
  ): void {
    const quat = opts.quat ?? new THREE.Quaternion();
    const local = new THREE.Matrix4().compose(center, quat, _s);
    this.geometry(
      new THREE.CylinderGeometry(opts.radiusTop ?? radius, radius, height, opts.sides ?? 16, 1),
      local,
      color,
      opts.glow ?? 0,
    );
    if (opts.collide ?? true) {
      const r = Math.max(radius, opts.radiusTop ?? radius);
      if (height >= 2 * r) {
        // long cylinder: capsule whose rounded ends sit inside the flat caps
        const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
        const halfCore = height / 2 - r;
        const a = center.clone().addScaledVector(axis, -halfCore).applyMatrix4(this.base);
        const b = center.clone().addScaledVector(axis, halfCore).applyMatrix4(this.base);
        this.colliders.push(new CapsuleCollider(a, b, r));
      } else {
        // flat disc: square prism is a closer fit than a sphere
        const wc = center.clone().applyMatrix4(this.base);
        const wq = this.baseQuat.clone().multiply(quat);
        this.colliders.push(new BoxCollider(wc, new THREE.Vector3(r * 0.85, height / 2, r * 0.85), wq));
      }
    }
  }

  sphere(
    center: THREE.Vector3,
    radius: number,
    color: THREE.ColorRepresentation,
    opts: PartOptions & { detail?: number; scale?: THREE.Vector3 } = {},
  ): void {
    const local = new THREE.Matrix4().compose(center, opts.quat ?? _q.identity(), opts.scale ?? _s);
    this.geometry(new THREE.IcosahedronGeometry(radius, opts.detail ?? 1), local, color, opts.glow ?? 0);
    if (opts.collide ?? true) {
      const s = opts.scale ? Math.max(opts.scale.x, opts.scale.y, opts.scale.z) : 1;
      this.colliders.push(new SphereCollider(center.clone().applyMatrix4(this.base), radius * s));
    }
  }

  torus(
    center: THREE.Vector3,
    radius: number,
    tube: number,
    color: THREE.ColorRepresentation,
    opts: { quat?: THREE.Quaternion; glow?: number; radial?: number; tubular?: number } = {},
  ): void {
    const local = new THREE.Matrix4().compose(center, opts.quat ?? _q.identity(), _s);
    this.geometry(
      new THREE.TorusGeometry(radius, tube, opts.radial ?? 6, opts.tubular ?? 48),
      local,
      color,
      opts.glow ?? 0,
    );
  }

  /**
   * Box with 45-degree chamfered edges, the basic sci-fi block. `bevel` is the chamfer in metres.
   * `front`/`back` scale the -Z / +Z faces (x, y) to taper it into wedges and noses, and `lift`
   * shifts the front face up or down. Collides as a box.
   */
  bevel(
    center: THREE.Vector3,
    size: THREE.Vector3,
    bevel: number,
    color: THREE.ColorRepresentation,
    opts: PartOptions & { front?: [number, number]; back?: [number, number]; lift?: number } = {},
  ): void {
    const hx = size.x / 2;
    const hy = size.y / 2;
    const hz = size.z / 2;
    const quat = opts.quat ?? new THREE.Quaternion();
    const pts: THREE.Vector3[] = [];
    for (const sz of [-1, 1]) {
      const [tx, ty] = (sz < 0 ? opts.front : opts.back) ?? [1, 1];
      const dy = sz < 0 ? (opts.lift ?? 0) : 0;
      const ex = hx * tx;
      const ey = hy * ty;
      const bx = Math.min(bevel, ex * 0.9);
      const by = Math.min(bevel, ey * 0.9);
      const bz = Math.min(bevel, hz * 0.9);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          const c = new THREE.Vector3(sx * ex, sy * ey + dy, sz * hz);
          pts.push(c.clone().add(new THREE.Vector3(-sx * bx, 0, 0)));
          pts.push(c.clone().add(new THREE.Vector3(0, -sy * by, 0)));
          pts.push(c.clone().add(new THREE.Vector3(0, 0, -sz * bz)));
        }
    }
    const local = new THREE.Matrix4().compose(center, quat, _s);
    this.geometry(new ConvexGeometry(pts), local, color, opts.glow ?? 0);
    if (opts.collide ?? true) {
      // two boxes, front half and back half, each as wide as its half of the taper
      const tf = opts.front ?? [1, 1];
      const tb = opts.back ?? [1, 1];
      const tm: [number, number] = [(tf[0] + tb[0]) / 2, (tf[1] + tb[1]) / 2];
      const lift = opts.lift ?? 0;
      const wq = this.baseQuat.clone().multiply(quat);
      for (const [a, b2, zc, dy] of [
        [tf, tm, -hz / 2, lift * 0.75],
        [tm, tb, hz / 2, lift * 0.25],
      ] as const) {
        const half = new THREE.Vector3(hx * ((a[0] + b2[0]) / 2) * 0.9, hy * ((a[1] + b2[1]) / 2) * 0.9, (hz / 2) * 0.98);
        const lc = new THREE.Vector3(0, dy, zc).applyQuaternion(quat).add(center);
        this.colliders.push(new BoxCollider(lc.applyMatrix4(this.base), half, wq));
      }
    }
  }

  /** Faceted convex hull from points: used for fighter hulls, wings and armour plates. */
  hull(points: THREE.Vector3[], color: THREE.ColorRepresentation, glow = 0): void {
    this.geometry(new ConvexGeometry(points), new THREE.Matrix4(), color, glow);
  }

  /** Mirror a hull across the local X axis and add both halves. */
  hullMirrored(points: THREE.Vector3[], color: THREE.ColorRepresentation, glow = 0): void {
    this.hull(points, color, glow);
    this.hull(
      points.map((p) => new THREE.Vector3(-p.x, p.y, p.z)),
      color,
      glow,
    );
  }

  addCollider(c: Collider): void {
    this.colliders.push(c);
  }

  build(name = 'structure', kind: HullKind = 'structure'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    if (this.solids.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.solids), hullMaterials[kind]);
      mesh.geometry.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (this.glows.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.glows), glowMaterial);
      mesh.geometry.computeBoundingSphere();
      group.add(mesh);
    }
    group.applyMatrix4(this.base);
    for (const g of this.solids) g.dispose();
    for (const g of this.glows) g.dispose();
    this.solids.length = 0;
    this.glows.length = 0;
    return group;
  }
}

export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
