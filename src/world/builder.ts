import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { BoxCollider, CapsuleCollider, Collider, SphereCollider } from './colliders';

/**
 * Shared materials. Everything procedural is vertex-coloured so a whole station or ship
 * merges into two draw calls: lit hull plus unlit glow (glow colours exceed 1.0 to feed bloom).
 */
export const hullMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.5,
  metalness: 0.25,
});

export const glowMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
});

export interface PartOptions {
  quat?: THREE.Quaternion;
  collide?: boolean;
  glow?: number; // 0 = lit hull, >0 = emissive intensity multiplier
}

const _m = new THREE.Matrix4();
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
    g.applyMatrix4(_m.multiplyMatrices(this.base, local));
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

  build(name = 'structure'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    if (this.solids.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.solids), hullMaterial);
      mesh.geometry.computeBoundingSphere();
      group.add(mesh);
    }
    if (this.glows.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.glows), glowMaterial);
      mesh.geometry.computeBoundingSphere();
      group.add(mesh);
    }
    for (const g of this.solids) g.dispose();
    for (const g of this.glows) g.dispose();
    this.solids.length = 0;
    this.glows.length = 0;
    return group;
  }
}

export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
