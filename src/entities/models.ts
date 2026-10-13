import * as THREE from 'three';
import { StructureBuilder, v3 } from '../world/builder';
import type { Palette } from './factions';
import type { ModelId } from './shipClasses';

export interface ShipModel {
  group: THREE.Group;
  engines: THREE.Vector3[];
  engineRadius: number;
  guns: THREE.Vector3[];
  /** Offset of the chase camera behind the ship. */
  cameraOffset: THREE.Vector3;
}

const X90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const NO = { collide: false } as const;

/** Thin plate (wing/fin) from an outline in its own plane, extruded by `thick` along `normal`. */
function plate(outline: THREE.Vector3[], normal: THREE.Vector3, thick: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of outline) {
    out.push(p.clone().addScaledVector(normal, thick / 2));
    out.push(p.clone().addScaledVector(normal, -thick / 2));
  }
  return out;
}

const UPN = v3(0, 1, 0);
const SIDEN = v3(1, 0, 0);

/** Arc of a torus in the local XY plane, from angle a0 through `arc` radians. */
function hoop(b: StructureBuilder, center: THREE.Vector3, radius: number, tube: number, a0: number, arc: number, color: string, quat?: THREE.Quaternion, glow = 0): void {
  const geo = new THREE.TorusGeometry(radius, tube, 6, 32, arc).rotateZ(a0);
  b.geometry(geo, new THREE.Matrix4().compose(center, quat ?? new THREE.Quaternion(), v3(1, 1, 1)), color, glow);
}

/**
 * Kite: the starter. A bubble-canopy cockpit pod on a long drooped nose, twin engine nacelles
 * with intake rings, short forward-swept wings with up-turned tips, and a hoop arching over the
 * tail. Closer to a hot-rod than a jet.
 */
function kite(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // drooped needle nose
  b.hull(
    [v3(0, -0.35, -8.2), v3(0.7, -0.1, -3.6), v3(-0.7, -0.1, -3.6), v3(0, 0.55, -3.8), v3(0, -0.75, -3.6), v3(0.95, 0, -2.2), v3(-0.95, 0, -2.2), v3(0, 0.8, -2.2), v3(0, -0.8, -2.2)],
    p.secondary,
  );
  // cockpit pod
  b.hull(
    [
      v3(1.1, -0.1, -2.6),
      v3(-1.1, -0.1, -2.6),
      v3(0, 0.9, -2.8),
      v3(0, -0.95, -2.6),
      v3(1.35, 0, 0.6),
      v3(-1.35, 0, 0.6),
      v3(0, 1.25, 0.8),
      v3(0, -1.0, 0.8),
      v3(0.9, 0.1, 2.0),
      v3(-0.9, 0.1, 2.0),
      v3(0, 0.95, 2.0),
      v3(0, -0.8, 2.0),
    ],
    p.primary,
  );
  // cockpit: a faceted teardrop canopy sunk into the pod, with a frame spine and a cheek sill
  b.hull(
    [
      v3(0, 0.7, -3.3),
      v3(0.62, 0.78, -2.2),
      v3(-0.62, 0.78, -2.2),
      v3(0.78, 0.86, -0.9),
      v3(-0.78, 0.86, -0.9),
      v3(0, 1.62, -1.3),
      v3(0, 1.5, -0.1),
      v3(0.5, 1.0, 0.7),
      v3(-0.5, 1.0, 0.7),
      v3(0, 1.2, 0.9),
    ],
    p.canopy,
    1.1,
  );
  b.strut(v3(0, 1.66, -1.5), v3(0, 1.55, 0.1), 0.07, '#2b2f45', { ...NO, sides: 4 });
  b.strut(v3(-0.7, 1.2, -0.95), v3(0.7, 1.2, -0.95), 0.06, '#2b2f45', { ...NO, sides: 4 });
  b.hullMirrored(plate([v3(0.72, 0.62, -2.6), v3(0.88, 0.7, 0.6), v3(1.02, 0.5, 0.6), v3(0.86, 0.42, -2.6)], SIDEN, 0.08), p.accent);
  // headrest fairing behind the canopy, flowing into the spine
  b.hull([v3(0.45, 0.9, 0.5), v3(-0.45, 0.9, 0.5), v3(0, 1.35, 0.8), v3(0.3, 0.95, 2.4), v3(-0.3, 0.95, 2.4), v3(0, 1.1, 2.6)], p.primary);
  // tail spine tapering back to a stinger
  b.hull([v3(0.7, 0.2, 1.6), v3(-0.7, 0.2, 1.6), v3(0, 0.95, 1.6), v3(0, -0.6, 1.6), v3(0.25, 0.3, 6.2), v3(-0.25, 0.3, 6.2), v3(0, 0.55, 6.4), v3(0, 0.05, 6.4)], p.secondary);
  b.box(v3(0, 1.0, 2.6), v3(0.18, 0.12, 2.6), p.accent, { ...NO, glow: 1.4 });
  for (const s of [1, -1]) {
    // nacelle on a swept pylon
    const nx = s * 2.2;
    b.hull(plate([v3(s * 0.9, 0, -0.4), v3(s * 0.9, 0, 1.8), v3(nx, -0.1, 2.6), v3(nx, -0.1, 0.4)], UPN, 0.35), p.primary);
    b.cylinder(v3(nx, -0.1, 2.0), 0.82, 4.4, p.secondary, { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(nx, -0.1, -0.35), 0.55, 0.6, '#2b2f45', { ...NO, quat: X90, sides: 12, radiusTop: 0.74 });
    b.torus(v3(nx, -0.1, -0.15), 0.86, 0.16, p.accent, { glow: 1.3, radial: 5, tubular: 18 });
    b.torus(v3(nx, -0.1, 1.2), 0.76, 0.08, p.primary, { radial: 4, tubular: 16 });
    b.cylinder(v3(nx, -0.1, 4.3), 0.62, 0.4, '#2b2f45', { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(nx, -0.1, 4.52), 0.5, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
    // forward-swept wing with an up-turned tip
    b.hull(plate([v3(s * 2.7, -0.2, 2.8), v3(s * 2.7, -0.2, 1.2), v3(s * 5.4, -0.45, -0.4), v3(s * 5.7, -0.45, 0.7)], UPN, 0.18), p.primary);
    b.hull(plate([v3(s * 3.2, -0.08, 2.0), v3(s * 3.2, -0.08, 1.6), v3(s * 5.3, -0.33, 0.1), v3(s * 5.4, -0.33, 0.5)], UPN, 0.04), p.accent);
    b.hull(plate([v3(s * 5.6, -0.45, 0.8), v3(s * 5.5, -0.45, -0.3), v3(s * 6.0, 1.2, 0.3), v3(s * 6.1, 1.3, 1.1)], SIDEN, 0.14), p.secondary);
    b.sphere(v3(s * 6.1, 1.3, 1.0), 0.13, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
    // chin guns
    b.cylinder(v3(s * 0.75, -0.6, -4.6), 0.1, 2.4, '#2b2f45', { ...NO, quat: X90, sides: 6 });
  }
  // the hoop over the tail, nacelle to nacelle
  hoop(b, v3(0, -0.1, 3.3), 2.2, 0.26, 0, Math.PI, p.accent);
  hoop(b, v3(0, -0.1, 3.3), 2.2, 0.06, 0.2, Math.PI - 0.4, p.engine, undefined, 1.2);
  return {
    group: b.build('kite', 'ship'),
    engines: [v3(2.2, -0.1, 4.6), v3(-2.2, -0.1, 4.6)],
    engineRadius: 0.5,
    guns: [v3(0.75, -0.6, -5.9), v3(-0.75, -0.6, -5.9)],
    cameraOffset: v3(0, 3.3, 14),
  };
}

/**
 * Lancer: the independent yards' heavy fighter. A bevelled block fuselage with a raised cockpit,
 * two big round nacelles with intake rings under short thick wings, a collar ring tying the
 * nacelles together, a dorsal missile rack and long twin cannon along the nose.
 */
function lancer(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // fuselage: a bevelled block that tapers to a blunt nose
  b.bevel(v3(0, 0, -1.0), v3(2.8, 2.0, 10.5), 0.5, p.primary, { ...NO, front: [0.45, 0.5], lift: -0.2 });
  b.bevel(v3(0, 0.15, 4.6), v3(2.4, 1.8, 2.4), 0.4, p.secondary, NO);
  // raised cockpit with a framed canopy
  b.bevel(v3(0, 1.15, -1.6), v3(1.7, 0.9, 3.6), 0.3, p.primary, { ...NO, front: [0.6, 0.5] });
  b.hull([v3(0, 1.2, -3.8), v3(0.62, 1.35, -2.6), v3(-0.62, 1.35, -2.6), v3(0, 2.0, -2.1), v3(0.55, 1.75, -0.8), v3(-0.55, 1.75, -0.8)], p.canopy, 1.15);
  b.strut(v3(0, 2.02, -2.1), v3(0, 1.78, -0.8), 0.06, DARK, { ...NO, sides: 4 });
  // dorsal missile rack
  b.bevel(v3(0, 1.3, 1.8), v3(1.8, 0.7, 2.8), 0.2, p.secondary, NO);
  for (let k = 0; k < 3; k++) b.cylinder(v3(-0.55 + k * 0.55, 1.3, 0.38), 0.2, 0.1, DARK, { ...NO, quat: X90, sides: 6 });
  // twin cannon along the nose
  for (const s of [1, -1]) b.cylinder(v3(s * 0.65, -0.55, -6.4), 0.16, 5.2, DARK, { ...NO, quat: X90, sides: 6 });
  for (const s of [1, -1]) {
    // short thick wing
    b.hull(plate([v3(s * 1.3, -0.1, -1.6), v3(s * 1.3, -0.1, 3.2), v3(s * 4.6, -0.4, 3.0), v3(s * 4.4, -0.4, 0.4)], UPN, 0.4), p.secondary);
    b.hull(plate([v3(s * 1.5, 0.12, 1.6), v3(s * 1.5, 0.12, 2.3), v3(s * 4.4, -0.18, 2.4), v3(s * 4.4, -0.18, 1.8)], UPN, 0.05), p.accent);
    // big round nacelle under the wing
    const nx = s * 3.3;
    b.cylinder(v3(nx, -0.7, 1.6), 1.05, 6.0, p.primary, { ...NO, quat: X90, sides: 14 });
    b.cylinder(v3(nx, -0.7, -1.7), 0.75, 0.7, DARK, { ...NO, quat: X90, sides: 14, radiusTop: 0.95 });
    b.torus(v3(nx, -0.7, -1.45), 1.1, 0.18, p.accent, { glow: 1.2, radial: 5, tubular: 20 });
    b.torus(v3(nx, -0.7, 0.6), 1.08, 0.08, p.secondary, { radial: 4, tubular: 20 });
    b.cylinder(v3(nx, -0.7, 4.8), 0.85, 0.5, DARK, { ...NO, quat: X90, sides: 14 });
    b.cylinder(v3(nx, -0.7, 5.08), 0.72, 0.1, p.engine, { ...NO, quat: X90, sides: 14, glow: 1.0 });
    // stubby canted fin on each nacelle
    b.hull(plate([v3(nx, 0.3, 2.6), v3(nx, 0.3, 4.6), v3(nx + s * 0.6, 1.8, 5.0), v3(nx + s * 0.6, 1.8, 4.0)], v3(1, -0.35 * s, 0).normalize(), 0.12), p.secondary);
    nav(b, s * 4.6, -0.4, 2.8);
  }
  // a keel hoop under the tail, nacelle to nacelle: the yards' signature
  hoop(b, v3(0, -0.7, 3.6), 3.3, 0.26, Math.PI, Math.PI, p.accent);
  hoop(b, v3(0, -0.7, 3.6), 3.3, 0.07, Math.PI + 0.2, Math.PI - 0.4, p.engine, undefined, 1.2);
  return {
    group: b.build('lancer', 'ship'),
    engines: [v3(3.3, -0.7, 5.2), v3(-3.3, -0.7, 5.2)],
    engineRadius: 0.72,
    guns: [v3(0.65, -0.55, -9.0), v3(-0.65, -0.55, -9.0)],
    cameraOffset: v3(0, 3.9, 16),
  };
}

function raider(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.hull(
    [
      v3(0, 0.6, -2.5),
      v3(1.1, 0, -2.5),
      v3(-1.1, 0, -2.5),
      v3(0, -0.7, -2.5),
      v3(1.6, 0.5, 2.8),
      v3(-1.6, 0.5, 2.8),
      v3(1.6, -0.5, 2.8),
      v3(-1.6, -0.5, 2.8),
      v3(0, 1.1, 2.2),
      v3(0, -1.0, 3.6),
    ],
    p.secondary,
  );
  b.hull([v3(0, 0.55, -2.3), v3(0.5, 0.5, -0.6), v3(-0.5, 0.5, -0.6), v3(0, 1.0, 0.2)], p.canopy, 1.6);
  for (const s of [1, -1]) {
    // forward prongs
    b.hull(
      plate([v3(s * 1.4, 0.6, 1.5), v3(s * 1.4, -0.6, 1.5), v3(s * 1.3, 0.3, -5.5), v3(s * 1.2, -0.1, -6.8)], SIDEN, 0.5),
      p.primary,
    );
    b.hull(
      plate([v3(s * 1.66, 0.25, 0.5), v3(s * 1.66, 0.05, 0.5), v3(s * 1.56, 0.12, -4.8), v3(s * 1.5, -0.05, -5.6)], SIDEN, 0.04),
      p.accent,
      1.3,
    );
    // anhedral blade wings
    b.hull(
      plate([v3(s * 1.4, 0, 0.5), v3(s * 1.5, -0.1, 2.8), v3(s * 5.6, -1.9, 3.6), v3(s * 5.0, -1.6, 1.4)], v3(0.32 * s, 1, 0).normalize(), 0.24),
      p.primary,
    );
    b.box(v3(s * 5.4, -1.8, 2.5), v3(0.3, 0.3, 2.4), p.accent, NO);
  }
  b.cylinder(v3(0, 0, 3.6), 1.1, 2.4, '#3a3440', { ...NO, quat: X90, sides: 8 });
  b.cylinder(v3(0, 0, 4.82), 0.95, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 1.0 });
  return {
    group: b.build('raider', 'ship'),
    engines: [v3(0, 0, 4.9)],
    engineRadius: 0.95,
    guns: [v3(1.3, 0, -7), v3(-1.3, 0, -7)],
    cameraOffset: v3(0, 3.4, 14),
  };
}

function warden(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.hull(
    [
      v3(0, 0, -5.5),
      v3(1.3, 0.3, -2.5),
      v3(-1.3, 0.3, -2.5),
      v3(0, 1.2, -2),
      v3(0, -1.0, -2),
      v3(1.5, 0, 3),
      v3(-1.5, 0, 3),
      v3(0, 1.1, 3),
      v3(0, -1.0, 3),
    ],
    p.primary,
  );
  b.hull([v3(0, 0.9, -3), v3(0.55, 0.8, -1.2), v3(-0.55, 0.8, -1.2), v3(0, 1.5, -0.6), v3(0, 1.1, 0.8)], p.canopy, 1.2);
  b.torus(v3(0, 0, 1.6), 3.6, 0.35, p.secondary, { tubular: 24, radial: 6 });
  b.torus(v3(0, 0, 1.6), 3.6, 0.1, p.accent, { tubular: 24, radial: 4, glow: 1.6, quat: new THREE.Quaternion() });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    b.strut(v3(Math.cos(a) * 1.0, Math.sin(a) * 0.8, 1.6), v3(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 1.6), 0.2, p.secondary, {
      ...NO,
      sides: 4,
    });
  }
  for (const s of [1, -1]) {
    b.cylinder(v3(s * 1.2, -0.2, 3.4), 0.6, 2.2, p.secondary, { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(s * 1.2, -0.2, 4.52), 0.48, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 1.0 });
    b.cylinder(v3(s * 3.6, 0, 0.2), 0.12, 2.8, '#2b2f45', { ...NO, quat: X90, sides: 6 });
  }
  return {
    group: b.build('warden', 'ship'),
    engines: [v3(1.2, -0.2, 4.6), v3(-1.2, -0.2, 4.6)],
    engineRadius: 0.5,
    guns: [v3(3.6, 0, -1.4), v3(-3.6, 0, -1.4)],
    cameraOffset: v3(0, 3.4, 14),
  };
}

function brute(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.hull(
    [
      v3(0, 0, -16),
      v3(4, 2, -12),
      v3(-4, 2, -12),
      v3(4, -2.5, -12),
      v3(-4, -2.5, -12),
      v3(6.5, 3.5, 6),
      v3(-6.5, 3.5, 6),
      v3(6.5, -3.5, 6),
      v3(-6.5, -3.5, 6),
      v3(5, 3, 12),
      v3(-5, 3, 12),
      v3(5, -3, 12),
      v3(-5, -3, 12),
    ],
    p.secondary,
  );
  b.hull([v3(0, 2.4, -10), v3(1.8, 2.4, -7), v3(-1.8, 2.4, -7), v3(0, 4.4, -5), v3(1.3, 3.4, -3), v3(-1.3, 3.4, -3)], p.canopy, 1.4);
  for (const s of [1, -1]) {
    b.box(v3(s * 9, 0, 1), v3(4, 4, 16), p.primary, NO);
    b.box(v3(s * 9, 2.3, 1), v3(4.2, 0.4, 14), p.accent, { ...NO, glow: 1.1 });
    b.box(v3(s * 9, 3.2, -4), v3(2.4, 1.6, 2.4), '#2b2f45', NO);
    b.cylinder(v3(s * 9, 3.2, -7), 0.3, 5, '#2b2f45', { ...NO, quat: X90, sides: 6 });
    b.box(v3(s * 6.6, 0, -2), v3(0.4, 1.2, 10), '#ff3b2f', { ...NO, glow: 2 });
    b.hull(plate([v3(s * 6, 0, -4), v3(s * 6, 0, 8), v3(s * 15, -2, 10), v3(s * 14, -2, 4)], UPN, 0.8), p.primary);
  }
  b.box(v3(0, 3.9, 2), v3(2.5, 0.6, 14), p.accent, { ...NO, glow: 1.2 });
  for (const ex of [-3.2, 0, 3.2]) {
    b.cylinder(v3(ex, 0, 13), 1.5, 3, '#3a3440', { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(ex, 0, 14.55), 1.3, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
  }
  return {
    group: b.build('brute', 'ship'),
    engines: [v3(-3.2, 0, 14.6), v3(0, 0, 14.6), v3(3.2, 0, 14.6)],
    engineRadius: 1.3,
    guns: [v3(9, 3.2, -9.5), v3(-9, 3.2, -9.5)],
    cameraOffset: v3(0, 10, 45),
  };
}

function freighter(p: Palette): ShipModel {
  const b = new StructureBuilder();
  const rngColors = ['#ff4d4d', '#ffcf33', '#2fb7ff', '#3ee07a', '#ff7ad9', '#9b6bff', '#ff8a1f'];
  let seed = 3;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  b.box(v3(0, 0, 0), v3(4, 4, 84), '#3a3440', NO);
  b.hull(
    [v3(-6, -5, -40), v3(6, -5, -40), v3(-6, 5, -40), v3(6, 5, -40), v3(-4, -3, -50), v3(4, -3, -50), v3(-3, 4, -48), v3(3, 4, -48)],
    p.primary,
  );
  b.box(v3(0, 3.2, -46.5), v3(5.5, 1.2, 0.4), p.accent, { ...NO, glow: 1.6 });
  b.box(v3(0, 0, 41), v3(16, 11, 9), p.secondary, NO);
  for (const ex of [-4.5, 0, 4.5]) {
    b.cylinder(v3(ex, 0, 46.5), 2, 3, '#2b2f45', { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(ex, 0, 48.05), 1.7, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
  }
  for (let z = -32; z <= 30; z += 10.5) {
    for (const [cx, cy] of [
      [4.6, 4.6],
      [-4.6, 4.6],
      [4.6, -4.6],
      [-4.6, -4.6],
    ] as const) {
      if (next() < 0.15) continue;
      b.box(v3(cx, cy, z), v3(7.6, 7.6, 9.6), rngColors[Math.floor(next() * rngColors.length)], NO);
    }
  }
  for (const s of [1, -1]) {
    b.sphere(v3(s * 8.2, 0, 41), 0.5, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
    b.sphere(v3(s * 6.2, 5.2, -40), 0.4, '#ffffff', { ...NO, glow: 3, detail: 0 });
  }
  return {
    group: b.build('freighter', 'ship'),
    engines: [v3(-4.5, 0, 48.2), v3(0, 0, 48.2), v3(4.5, 0, 48.2)],
    engineRadius: 1.7,
    guns: [v3(0, 0, -50)],
    cameraOffset: v3(0, 20, 90),
  };
}

/**
 * Corsair: racing-bred and the fastest thing you can legally buy. A slim needle with a long
 * bubble canopy, forward-swept wings carrying outrigger engine pods, a split tail, and a halo
 * hoop over the cockpit like a racer's roll bar.
 */
function corsair(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // needle fuselage
  b.hull(
    [
      v3(0, -0.1, -9.0),
      v3(0.7, 0, -4.4),
      v3(-0.7, 0, -4.4),
      v3(0, 0.65, -4.0),
      v3(0, -0.55, -4.0),
      v3(1.2, 0, 1.6),
      v3(-1.2, 0, 1.6),
      v3(0, 1.0, 1.6),
      v3(0, -0.8, 1.6),
      v3(0.9, 0.15, 4.6),
      v3(-0.9, 0.15, 4.6),
      v3(0, 0.7, 4.6),
      v3(0, -0.5, 4.6),
    ],
    p.primary,
  );
  b.hull(plate([v3(0, 0.36, -8.2), v3(0.28, 0.42, -5.6), v3(-0.28, 0.42, -5.6)], UPN, 0.04), p.accent);
  // long bubble canopy and its halo
  b.hull([v3(0, 0.45, -4.3), v3(0.48, 0.5, -2.6), v3(-0.48, 0.5, -2.6), v3(0, 1.25, -2.0), v3(0.42, 0.95, -0.4), v3(-0.42, 0.95, -0.4), v3(0, 1.05, 0.4)], p.canopy, 1.2);
  hoop(b, v3(0, 0.6, -1.1), 1.05, 0.13, 0, Math.PI, p.secondary, new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.25));
  b.strut(v3(0, 1.62, -1.5), v3(0, 0.9, 1.6), 0.1, p.secondary, { ...NO, sides: 4 });
  for (const s of [1, -1]) {
    // forward-swept wing with a racing stripe
    b.hull(plate([v3(s * 1.0, 0, 3.4), v3(s * 1.0, 0, 1.0), v3(s * 5.4, 0.2, -1.6), v3(s * 5.6, 0.2, -0.4)], UPN, 0.22), p.secondary);
    b.hull(plate([v3(s * 1.6, 0.13, 2.1), v3(s * 1.6, 0.13, 1.5), v3(s * 5.2, 0.33, -1.1), v3(s * 5.3, 0.33, -0.6)], UPN, 0.05), p.accent);
    // outrigger engine pod at the wingtip
    b.cylinder(v3(s * 5.6, 0.2, 0.0), 0.62, 4.4, p.primary, { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(s * 5.6, 0.2, -2.4), 0.3, 0.6, DARK, { ...NO, quat: X90, sides: 12, radiusTop: 0.08 });
    b.torus(v3(s * 5.6, 0.2, -1.4), 0.66, 0.1, p.accent, { glow: 1.2, radial: 4, tubular: 16 });
    b.cylinder(v3(s * 5.6, 0.2, 2.35), 0.5, 0.3, DARK, { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(s * 5.6, 0.2, 2.52), 0.42, 0.08, p.engine, { ...NO, quat: X90, sides: 12, glow: 1.0 });
    // canards and the split tail
    b.hull(plate([v3(s * 0.6, 0.1, -5.0), v3(s * 0.6, 0.1, -4.0), v3(s * 1.9, 0.1, -4.4), v3(s * 1.9, 0.1, -4.8)], UPN, 0.1), p.accent);
    b.hull(plate([v3(s * 0.6, 0.5, 2.4), v3(s * 0.6, 0.5, 4.6), v3(s * 1.5, 2.3, 5.0), v3(s * 1.4, 2.3, 4.1)], v3(1, -0.35 * s, 0).normalize(), 0.12), p.secondary);
    // centre engines
    b.cylinder(v3(s * 0.55, 0.1, 4.9), 0.48, 1.4, DARK, { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(s * 0.55, 0.1, 5.62), 0.4, 0.08, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
    nav(b, s * 5.6, 0.85, 1.6);
  }
  b.cylinder(v3(0, -0.55, -6.6), 0.12, 2.6, DARK, { ...NO, quat: X90, sides: 6 });
  return {
    group: b.build('corsair', 'ship'),
    engines: [v3(0.55, 0.1, 5.7), v3(-0.55, 0.1, 5.7), v3(5.6, 0.2, 2.6), v3(-5.6, 0.2, 2.6)],
    engineRadius: 0.42,
    guns: [v3(5.6, 0.2, -2.8), v3(0, -0.55, -8.0), v3(-5.6, 0.2, -2.8)],
    cameraOffset: v3(0, 3.3, 14.5),
  };
}

/**
 * Halberd: the heavy one-seater. A long lance spine carrying the main gun, an armoured
 * shoulder section with layered plates, broad cranked wings with underslung gun pods, twin
 * engines and canted tail fins.
 */
function halberd(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // lance spine and main gun
  b.hull([v3(0, 0.1, -15), v3(0.6, 0.2, -9), v3(-0.6, 0.2, -9), v3(0, 0.75, -9), v3(0, -0.45, -9), v3(1.0, 0.2, -4), v3(-1.0, 0.2, -4), v3(0, 1.1, -4), v3(0, -0.8, -4)], p.secondary);
  b.cylinder(v3(0, -0.75, -11), 0.22, 7, '#2b2f45', { ...NO, quat: X90, sides: 8 });
  b.cylinder(v3(0, -0.75, -14.6), 0.34, 0.4, p.accent, { ...NO, quat: X90, sides: 8, glow: 1.5 });
  for (let i = 0; i < 4; i++) b.box(v3(0, 0.62, -8 + i * 0.9), v3(0.7, 0.12, 0.3), '#ffb347', { ...NO, glow: 1.2 });
  // armoured shoulders
  b.hull(
    [
      v3(1.4, 0.3, -5),
      v3(-1.4, 0.3, -5),
      v3(0, 1.6, -4.4),
      v3(0, -1.2, -4.6),
      v3(2.6, 0.5, 1),
      v3(-2.6, 0.5, 1),
      v3(2.2, -1.2, 1),
      v3(-2.2, -1.2, 1),
      v3(0, 2.0, 1.4),
      v3(1.8, 0.3, 6.5),
      v3(-1.8, 0.3, 6.5),
      v3(0, 1.4, 6.5),
      v3(0, -1.0, 6.5),
    ],
    p.primary,
  );
  // layered top plates and an angular canopy
  b.hull(plate([v3(-1.6, 1.25, -1.2), v3(1.6, 1.25, -1.2), v3(1.9, 1.05, 4.6), v3(-1.9, 1.05, 4.6)], UPN, 0.35), p.secondary);
  b.hull([v3(0, 1.3, -4.2), v3(0.65, 1.2, -2.2), v3(-0.65, 1.2, -2.2), v3(0, 2.1, -1.6), v3(0.5, 1.7, -0.4), v3(-0.5, 1.7, -0.4)], p.canopy, 1.15);
  b.box(v3(0, 1.48, 2.4), v3(0.3, 0.1, 3.6), p.accent, { ...NO, glow: 1.3 });
  for (const s of [1, -1]) {
    // cranked wing: inner section level, outer section swept and drooping
    b.hull(plate([v3(s * 2.2, 0.1, -1.6), v3(s * 2.4, 0.1, 4.4), v3(s * 5.4, 0, 4.0), v3(s * 5.2, 0, -0.2)], UPN, 0.4), p.primary);
    b.hull(plate([v3(s * 5.2, 0, -0.2), v3(s * 5.4, 0, 4.0), v3(s * 9.6, -0.9, 0.6), v3(s * 9.3, -0.9, -2.6)], v3(s * 0.2, 1, 0).normalize(), 0.24), p.secondary);
    b.hull(plate([v3(s * 5.3, 0.22, 1.6), v3(s * 5.4, 0.22, 2.4), v3(s * 9.3, -0.7, -0.4), v3(s * 9.2, -0.7, -1.1)], v3(s * 0.2, 1, 0).normalize(), 0.05), p.accent);
    // blade tip, raked down and back
    b.hull(plate([v3(s * 9.4, -0.9, 0.6), v3(s * 9.2, -0.9, -2.6), v3(s * 9.6, -3.4, 1.8), v3(s * 9.7, -3.2, 2.8)], SIDEN, 0.2), p.primary);
    // underslung gun pod
    b.cylinder(v3(s * 4.4, -0.75, -0.2), 0.48, 6, '#3a3440', { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(s * 4.4, -0.75, -4.0), 0.16, 2.4, '#2b2f45', { ...NO, quat: X90, sides: 6 });
    // engines
    b.cylinder(v3(s * 2.3, -0.2, 5.6), 1.2, 6, p.secondary, { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(s * 2.3, -0.2, 2.4), 0.9, 0.6, '#2b2f45', { ...NO, quat: X90, sides: 12, radiusTop: 1.15 });
    b.torus(v3(s * 2.3, -0.2, 2.7), 1.24, 0.18, p.accent, { glow: 1.2, radial: 5, tubular: 20 });
    b.torus(v3(s * 2.3, -0.2, 6.6), 1.24, 0.1, p.primary, { radial: 4, tubular: 20 });
    b.cylinder(v3(s * 2.3, -0.2, 8.75), 1.0, 0.3, '#2b2f45', { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(s * 2.3, -0.2, 8.95), 0.86, 0.1, p.engine, { ...NO, quat: X90, sides: 12, glow: 1.0 });
    // canted fins and ventral blade
    b.hull(plate([v3(s * 2.3, 0.9, 4.4), v3(s * 2.3, 0.9, 7.6), v3(s * 3.4, 3.8, 8.8), v3(s * 3.2, 3.8, 7.2)], v3(1, -0.35 * s, 0).normalize(), 0.16), p.primary);
    b.sphere(v3(s * 9.7, -3.3, 2.6), 0.18, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
  }
  b.hull(plate([v3(0, -1.0, -1), v3(0, -1.0, 4), v3(0, -3.2, 5.6), v3(0, -3.0, 3.8)], SIDEN, 0.2), p.accent);
  return {
    group: b.build('halberd', 'ship'),
    engines: [v3(2.3, -0.2, 9.0), v3(-2.3, -0.2, 9.0)],
    engineRadius: 0.86,
    guns: [v3(4.4, -0.75, -5.2), v3(0, -0.75, -15), v3(-4.4, -0.75, -5.2), v3(0, -0.75, -15)],
    cameraOffset: v3(0, 4.6, 21),
  };
}

function sabre(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.hull(
    [
      v3(0, 0.2, -7.5),
      v3(1.1, 0.1, -3.5),
      v3(-1.1, 0.1, -3.5),
      v3(0, 1.1, -3),
      v3(0, -0.7, -3),
      v3(1.6, 0.2, 2.5),
      v3(-1.6, 0.2, 2.5),
      v3(0, 1.3, 2.5),
      v3(0, -0.9, 2.5),
      v3(1.1, 0.3, 4.8),
      v3(-1.1, 0.3, 4.8),
      v3(0, 0.9, 4.8),
      v3(0, -0.6, 4.8),
    ],
    p.primary,
  );
  b.hull([v3(0, 0.8, -3.6), v3(0.55, 0.7, -1.6), v3(-0.55, 0.7, -1.6), v3(0, 1.5, -1), v3(0, 1.2, 0.6)], p.canopy, 1.15);
  // swept crescent wings with gold leading edges
  b.hullMirrored(plate([v3(1.3, 0, -1.5), v3(1.4, 0, 3.6), v3(7.2, -0.3, 4.4), v3(5.4, -0.2, 0.6)], UPN, 0.24), p.primary);
  b.hullMirrored(plate([v3(1.4, 0.14, -1.4), v3(1.6, 0.14, -0.7), v3(5.6, -0.06, 1.1), v3(5.4, -0.06, 0.5)], UPN, 0.08), p.secondary);
  b.hullMirrored(plate([v3(6.6, -0.3, 3.4), v3(7.2, -0.3, 4.4), v3(7.4, 1.4, 4.9), v3(7.1, 1.4, 4.2)], SIDEN, 0.12), p.secondary);
  b.box(v3(0, 1.0, 2.2), v3(0.5, 0.2, 3.6), p.accent, { ...NO, glow: 1.4 });
  for (const s of [1, -1]) {
    b.cylinder(v3(s * 1.15, 0.2, 3.9), 0.55, 2.4, '#2b2f45', { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(s * 1.15, 0.2, 5.15), 0.45, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 1.0 });
    b.cylinder(v3(s * 3.4, -0.2, -1.6), 0.13, 3, '#2b2f45', { ...NO, quat: X90, sides: 6 });
    b.sphere(v3(s * 7.3, 1.4, 4.6), 0.16, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
  }
  return {
    group: b.build('sabre', 'ship'),
    engines: [v3(1.15, 0.2, 5.2), v3(-1.15, 0.2, 5.2)],
    engineRadius: 0.48,
    guns: [v3(3.4, -0.2, -3.2), v3(-3.4, -0.2, -3.2)],
    cameraOffset: v3(0, 3.4, 14),
  };
}

function shuttle(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.hull(
    [v3(-3, -2.5, -11), v3(3, -2.5, -11), v3(-2.4, 2, -10), v3(2.4, 2, -10), v3(-4.5, -3.5, 8), v3(4.5, -3.5, 8), v3(-4, 3.5, 8), v3(4, 3.5, 8), v3(0, 0, -13)],
    p.primary,
  );
  b.hull([v3(-1.8, 1.4, -11.4), v3(1.8, 1.4, -11.4), v3(-1.4, 2.4, -9), v3(1.4, 2.4, -9), v3(0, 0.6, -12.6)], p.canopy, 1.2);
  b.box(v3(0, 3.8, 1), v3(6, 0.6, 12), p.secondary, NO);
  for (const s of [1, -1]) {
    b.box(v3(s * 5.2, -1, 2), v3(1.6, 3, 10), p.secondary, NO);
    b.box(v3(s * 4.7, 0.5, -2), v3(0.3, 0.8, 9), p.accent, { ...NO, glow: 1.3 });
    b.cylinder(v3(s * 2.6, -0.5, 8.6), 1.3, 1.6, '#2b2f45', { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(s * 2.6, -0.5, 9.45), 1.1, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
    b.sphere(v3(s * 6, -1, 7), 0.25, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
  }
  return {
    group: b.build('shuttle', 'ship'),
    engines: [v3(2.6, -0.5, 9.5), v3(-2.6, -0.5, 9.5)],
    engineRadius: 1.1,
    guns: [v3(0, 0, -13)],
    cameraOffset: v3(0, 8, 32),
  };
}

function turret(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.cylinder(v3(0, -4, 0), 6, 3, '#2b2f45', { ...NO, sides: 12 });
  b.cylinder(v3(0, -6, 0), 3, 6, '#3a3440', { ...NO, sides: 8 });
  b.sphere(v3(0, -1, 0), 4.2, p.primary, { ...NO, detail: 1, scale: v3(1, 0.75, 1.1) });
  for (const s of [1, -1]) {
    b.cylinder(v3(s * 1.4, -0.6, -5), 0.45, 7, '#2b2f45', { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(s * 1.4, -0.6, -8.6), 0.6, 0.6, p.accent, { ...NO, quat: X90, sides: 8, glow: 1.6 });
  }
  b.sphere(v3(0, 2.2, 1), 0.5, '#ff2040', { ...NO, glow: 3, detail: 0 });
  b.box(v3(0, 0.6, -2.4), v3(3.4, 0.5, 0.3), p.engine, { ...NO, glow: 1.6 });
  return {
    group: b.build('turret', 'ship'),
    engines: [],
    engineRadius: 0,
    guns: [v3(1.4, -0.6, -9), v3(-1.4, -0.6, -9)],
    cameraOffset: v3(0, 8, 24),
  };
}

function relay(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.cylinder(v3(0, -6, 0), 5, 14, '#2b2f45', { ...NO, sides: 10 });
  b.box(v3(0, 1.5, 0), v3(16, 3, 16), p.secondary, NO);
  for (const [x, z, r, tilt] of [
    [0, 0, 12, 0.3],
    [9, 6, 6, -0.5],
    [-8, -7, 7, 0.6],
  ] as const) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, x * 0.1, 0));
    b.cylinder(v3(x, 6, z), r, 2, '#d8d2c6', { ...NO, sides: 18, radiusTop: r * 0.25, quat: q });
    b.sphere(v3(x, 8, z), 0.8, '#ff2040', { ...NO, glow: 3, detail: 0 });
  }
  b.strut(v3(0, 3, 0), v3(0, 22, 0), 0.4, '#2b2f45', NO);
  b.sphere(v3(0, 22.5, 0), 0.9, p.accent, { ...NO, glow: 3, detail: 0 });
  b.box(v3(0, 3.1, 8.1), v3(12, 1.2, 0.2), p.accent, { ...NO, glow: 1.8 });
  return { group: b.build('relay', 'ship'), engines: [], engineRadius: 0, guns: [v3(0, 0, -8)], cameraOffset: v3(0, 20, 60) };
}

function habitat(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.cylinder(v3(0, 0, 0), 36, 100, '#c9b8a2', { ...NO, quat: X90, sides: 24 });
  for (const z of [-50, 50]) b.sphere(v3(0, 0, z), 30, '#b8a690', { ...NO, detail: 2, scale: v3(1.15, 1.15, 0.6) });
  // painted bands, warm windows, washing lines of colourful cloth
  for (const z of [-34, 0, 34]) b.torus(v3(0, 0, z), 36.4, 1.4, p.primary, { quat: new THREE.Quaternion(), tubular: 48 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const z of [-22, -8, 8, 22]) {
      if ((i + z) % 3 === 0) continue;
      const pos = v3(Math.cos(a) * 36.3, Math.sin(a) * 36.3, z);
      b.box(pos, v3(0.4, 4, 6), i % 5 === 0 ? '#9fe8ff' : '#ffd27a', { ...NO, glow: 1.5, quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), a) });
    }
  }
  const cloth = ['#ff4d4d', '#ffcf33', '#2fb7ff', '#3ee07a', '#ff7ad9', '#9b6bff'];
  for (let i = 0; i < 12; i++) b.box(v3(-30 + i * 5.5, -37.5, 46 - (i % 3)), v3(3, 4, 0.2), cloth[i % cloth.length], NO);
  b.box(v3(0, 38, 0), v3(10, 4, 70), '#5a6078', NO);
  return { group: b.build('habitat', 'ship'), engines: [], engineRadius: 0, guns: [v3(0, 0, -50)], cameraOffset: v3(0, 60, 200) };
}

/** Capital-ship gun barbette: a heavy armoured mount with twin long barrels. */
function cannon(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.cylinder(v3(0, -6, 0), 9, 4, '#2b2f45', { ...NO, sides: 14 });
  b.hull(
    [v3(-6, -4, -6), v3(6, -4, -6), v3(-7, -4, 6), v3(7, -4, 6), v3(-4.5, 2.5, -4), v3(4.5, 2.5, -4), v3(-5, 3, 5), v3(5, 3, 5)],
    p.primary,
  );
  for (const s of [1, -1]) {
    b.cylinder(v3(s * 2.2, 0, -14), 0.9, 18, '#3a3440', { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(s * 2.2, 0, -23.2), 1.2, 1, p.accent, { ...NO, quat: X90, sides: 10, glow: 1.5 });
  }
  b.box(v3(0, 3.2, 1), v3(6, 0.4, 4), p.engine, { ...NO, glow: 1.6 });
  return { group: b.build('cannon', 'ship'), engines: [], engineRadius: 0, guns: [v3(2.2, 0, -24), v3(-2.2, 0, -24)], cameraOffset: v3(0, 20, 60) };
}

const DARK = '#2b2f45';
const nav = (b: StructureBuilder, x: number, y: number, z: number): void => {
  b.sphere(v3(x, y, z), 0.16, x > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
};

/**
 * Gannet (Drift Union): a salvaged cockpit pod hung to port of a rack of launch tubes, the two
 * tied together by an open truss and pushed by a ring drive off a tug. Lopsided on purpose:
 * Drift ships show their frames and their repairs.
 */
function gannet(p: Palette): ShipModel {
  const b = new StructureBuilder();
  const scrap = ['#6d6a72', '#4e5466', '#8a8070'];
  // cockpit pod, port side
  b.bevel(v3(-1.3, 0.2, -2.4), v3(1.9, 1.7, 5.2), 0.45, p.primary, { ...NO, front: [0.55, 0.5], lift: -0.2 });
  b.hull([v3(-1.3, 0.9, -4.6), v3(-0.75, 0.95, -3.2), v3(-1.85, 0.95, -3.2), v3(-1.3, 1.55, -2.6), v3(-0.85, 1.25, -1.2), v3(-1.75, 1.25, -1.2)], p.canopy, 1.1);
  b.box(v3(-2.3, 0.1, -2.0), v3(0.1, 1.0, 2.6), scrap[0], NO);
  // launch-tube rack, starboard: a block of tubes with dark mouths
  b.bevel(v3(1.5, -0.1, -1.4), v3(2.4, 1.9, 6.2), 0.35, p.secondary, NO);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) b.cylinder(v3(0.85 + i * 0.65, -0.55 + j * 0.85, -4.55), 0.26, 0.2, DARK, { ...NO, quat: X90, sides: 8 });
  b.box(v3(1.5, 0.92, -1.0), v3(1.6, 0.16, 4.2), scrap[1], NO);
  b.box(v3(1.5, 0.98, 0.4), v3(0.3, 0.08, 2.0), p.accent, { ...NO, glow: 1.2 });
  // open truss between pod and rack, and back to the drive
  for (const [a, c] of [
    [v3(-0.5, 0.8, -1.0), v3(0.4, 0.7, -2.5)],
    [v3(-0.5, -0.5, -0.4), v3(0.4, -0.8, -3.2)],
    [v3(-0.6, 0.6, 0.2), v3(0, 0, 3.4)],
    [v3(0.6, 0.7, 1.6), v3(0, 0, 3.4)],
    [v3(0.6, -0.9, 1.6), v3(0, -0.4, 3.6)],
    [v3(-0.8, -0.6, 0.2), v3(0, -0.4, 3.6)],
  ] as const)
    b.strut(a, c, 0.13, scrap[0], { ...NO, sides: 4 });
  // the ring drive: one big bell inside a ring on four spokes
  b.cylinder(v3(0, 0, 3.8), 1.0, 2.8, '#3a3440', { ...NO, quat: X90, sides: 10, radiusTop: 0.75 });
  b.cylinder(v3(0, 0, 5.3), 1.05, 0.3, DARK, { ...NO, quat: X90, sides: 10 });
  b.cylinder(v3(0, 0, 5.48), 0.9, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
  b.torus(v3(0, 0, 4.4), 1.95, 0.3, p.secondary, { radial: 6, tubular: 24 });
  b.torus(v3(0, 0, 4.4), 1.95, 0.08, p.accent, { radial: 4, tubular: 24, glow: 1.4, quat: new THREE.Quaternion() });
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    b.strut(v3(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 4.0), v3(Math.cos(a) * 1.8, Math.sin(a) * 1.8, 4.4), 0.16, scrap[1], { ...NO, sides: 4 });
  }
  // one stub wing to port, one fin to starboard; nothing matches
  b.hull(plate([v3(-2.2, -0.2, -0.4), v3(-2.2, -0.2, 1.6), v3(-4.6, -0.5, 1.9), v3(-4.4, -0.5, 0.9)], UPN, 0.18), scrap[1]);
  b.hull(plate([v3(2.4, 0.6, -0.2), v3(2.4, 0.6, 1.4), v3(3.0, 2.4, 2.0), v3(2.9, 2.4, 1.2)], SIDEN, 0.14), p.primary);
  b.cylinder(v3(-1.3, -0.75, -4.6), 0.11, 2.0, DARK, { ...NO, quat: X90, sides: 6 });
  nav(b, -4.5, -0.5, 1.6);
  nav(b, 3.0, 2.4, 1.8);
  return {
    group: b.build('gannet', 'ship'),
    engines: [v3(0, 0, 5.55)],
    engineRadius: 0.9,
    guns: [v3(-1.3, -0.75, -5.7), v3(1.5, -0.1, -4.7)],
    cameraOffset: v3(0, 4.4, 18),
  };
}

/**
 * Bulwark (Drift Union): an ore-tug keel with the cockpit welded on off-centre, a cage of armour
 * plate, mismatched gun booms and a cluster of engines. Heavy, wide and unapologetically rough.
 */
function bulwark(p: Palette): ShipModel {
  const b = new StructureBuilder();
  const scrap = ['#6d6a72', '#4e5466', '#8a8070', '#5a4a52'];
  // tug keel
  b.bevel(v3(0, 0, 0.5), v3(2.8, 2.2, 13), 0.6, scrap[0], { ...NO, front: [0.7, 0.75] });
  b.bevel(v3(0, -1.3, 0), v3(2.0, 0.8, 9), 0.3, scrap[3], NO);
  // cockpit welded on to starboard of the bow
  b.bevel(v3(1.9, 1.0, -4.2), v3(1.8, 1.6, 3.6), 0.4, p.primary, { ...NO, front: [0.6, 0.55] });
  b.hull([v3(1.9, 1.7, -5.8), v3(2.45, 1.75, -4.6), v3(1.35, 1.75, -4.6), v3(1.9, 2.25, -4.0), v3(2.35, 1.9, -3.0), v3(1.45, 1.9, -3.0)], p.canopy, 1.1);
  // the armour cage: angled plates on frames
  for (const [x, z, rot, col] of [
    [1.75, -0.5, 0.28, p.secondary],
    [-1.75, 0.2, -0.24, p.primary],
    [1.8, 3.4, 0.2, scrap[2]],
    [-1.8, 3.8, -0.3, p.secondary],
  ] as const) {
    const q = new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), rot);
    b.bevel(v3(x, 0.3, z), v3(0.35, 2.4, 3.2), 0.15, col, { ...NO, quat: q });
  }
  for (const z of [-2.2, 1.6, 5.2]) {
    b.strut(v3(-1.9, 1.5, z), v3(1.9, 1.5, z), 0.1, scrap[1], { ...NO, sides: 4 });
    b.strut(v3(-1.9, -0.9, z), v3(1.9, -0.9, z), 0.1, scrap[1], { ...NO, sides: 4 });
  }
  // dorsal missile box
  b.bevel(v3(-0.6, 1.6, 1.4), v3(1.6, 0.9, 3.0), 0.2, p.secondary, NO);
  for (let i = 0; i < 3; i++) b.cylinder(v3(-1.1 + i * 0.5, 1.6, -0.15), 0.18, 0.12, DARK, { ...NO, quat: X90, sides: 6 });
  // port boom: long, thin, two barrels
  b.box(v3(-3.0, -0.2, -0.6), v3(2.2, 0.4, 1.2), scrap[1], NO);
  b.bevel(v3(-4.4, -0.2, -1.5), v3(1.1, 1.0, 6.0), 0.25, p.primary, { ...NO, front: [0.6, 0.6] });
  for (const dy of [0.2, -0.6]) b.cylinder(v3(-4.4, dy, -5.4), 0.13, 2.6, DARK, { ...NO, quat: X90, sides: 6 });
  // starboard boom: short and thick, a single heavy barrel
  b.box(v3(3.0, -0.4, 1.0), v3(2.2, 0.5, 1.4), scrap[1], NO);
  b.bevel(v3(4.3, -0.4, 0.4), v3(1.6, 1.5, 4.0), 0.35, scrap[2], NO);
  b.cylinder(v3(4.3, -0.4, -2.6), 0.24, 2.4, DARK, { ...NO, quat: X90, sides: 8 });
  // engines: one big bell, two small ones, a collar ring
  b.cylinder(v3(0, 0.1, 7.6), 1.2, 1.6, scrap[0], { ...NO, quat: X90, sides: 12, radiusTop: 1.0 });
  b.cylinder(v3(0, 0.1, 8.45), 1.08, 0.1, p.engine, { ...NO, quat: X90, sides: 12, glow: 1.0 });
  for (const [x, y] of [
    [1.7, -0.9],
    [-1.6, 1.0],
  ] as const) {
    b.cylinder(v3(x, y, 7.2), 0.55, 1.4, DARK, { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(x, y, 7.95), 0.46, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 1.0 });
  }
  b.torus(v3(0, 0.1, 6.4), 1.9, 0.22, p.secondary, { radial: 5, tubular: 24 });
  b.torus(v3(0, 0.1, 6.4), 1.9, 0.08, p.accent, { radial: 4, tubular: 24, glow: 1.3 });
  nav(b, -4.4, 0.4, 1.4);
  nav(b, 4.3, 0.4, 2.4);
  return {
    group: b.build('bulwark', 'ship'),
    engines: [v3(0, 0.1, 8.5), v3(1.7, -0.9, 8.0), v3(-1.6, 1.0, 8.0)],
    engineRadius: 0.9,
    guns: [v3(-4.4, 0.2, -6.7), v3(4.3, -0.4, -3.8), v3(-4.4, -0.6, -6.7), v3(0, -1.3, -4.6), v3(4.3, -0.4, -3.8)],
    cameraOffset: v3(0, 5.0, 22),
  };
}

/**
 * Fang (Red Wake): a cockpit far forward on a black dart, one hooked jaw blade to starboard, a
 * short spike to port, and an engine bigger than the ship deserves. Built to look like it bites.
 */
function fang(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // black dart body with the cockpit at the very front
  b.hull([v3(0, 0.1, -7.0), v3(0.9, 0, -3.5), v3(-0.9, 0, -3.5), v3(0, 0.9, -3.8), v3(0, -0.7, -3.5), v3(1.3, 0, 2.6), v3(-1.3, 0, 2.6), v3(0, 1.1, 2.6), v3(0, -0.9, 2.6)], p.secondary);
  b.hull([v3(0, 0.55, -6.2), v3(0.45, 0.5, -4.8), v3(-0.45, 0.5, -4.8), v3(0, 1.15, -4.6), v3(0.35, 0.95, -3.4), v3(-0.35, 0.95, -3.4)], p.canopy, 1.3);
  // the hooked jaw: out, forward, and curling back in at the tip
  b.hull(plate([v3(1.1, 0, 0.6), v3(1.2, 0, -1.4), v3(3.4, -0.2, -4.6), v3(3.6, -0.2, -2.6)], UPN, 0.3), p.primary);
  b.hull(plate([v3(3.4, -0.2, -4.6), v3(3.6, -0.2, -3.4), v3(2.4, -0.25, -7.4), v3(2.2, -0.25, -7.0)], UPN, 0.26), p.primary);
  b.hull(plate([v3(2.25, -0.08, -6.9), v3(3.35, -0.08, -4.5), v3(3.5, -0.08, -4.3), v3(2.45, -0.08, -7.3)], UPN, 0.32), p.accent, 0.6);
  // teeth along the jaw's inner edge
  for (let i = 0; i < 3; i++) {
    const z = -2.4 - i * 1.3;
    const x = 2.9 - i * 0.15;
    b.hull([v3(x, -0.2, z), v3(x, -0.2, z + 0.6), v3(x - 0.7, -0.25, z + 0.1), v3(x, 0.05, z + 0.3)], p.accent);
  }
  // short spike to port, raked down
  b.hull(plate([v3(-1.1, 0, 0.4), v3(-1.2, 0, 2.0), v3(-3.6, -1.2, 1.2), v3(-3.4, -1.1, 0.4)], v3(-0.3, 1, 0).normalize(), 0.22), p.primary);
  // jagged dorsal fins
  b.hull(plate([v3(0, 1.0, -0.2), v3(0, 1.0, 1.6), v3(0, 2.6, 2.4), v3(0, 1.6, 1.0)], SIDEN, 0.12), p.primary);
  b.hull(plate([v3(0, 0.9, 1.6), v3(0, 0.9, 2.8), v3(0, 1.9, 3.4)], SIDEN, 0.1), p.accent);
  // the oversized engine, slung slightly to port
  b.cylinder(v3(-0.25, 0, 3.6), 1.2, 3.0, '#3a3440', { ...NO, quat: X90, sides: 10, radiusTop: 0.95 });
  b.torus(v3(-0.25, 0, 2.4), 1.22, 0.14, p.accent, { radial: 4, tubular: 20, glow: 1.2 });
  b.cylinder(v3(-0.25, 0, 5.15), 1.05, 0.12, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
  b.cylinder(v3(0, -0.65, -5.2), 0.12, 2.0, DARK, { ...NO, quat: X90, sides: 6 });
  nav(b, -3.5, -1.15, 0.8);
  nav(b, 3.5, -0.2, -3.6);
  return {
    group: b.build('fang', 'ship'),
    engines: [v3(-0.25, 0, 5.2)],
    engineRadius: 1.05,
    guns: [v3(2.3, -0.25, -7.4), v3(0, -0.65, -6.2), v3(2.3, -0.25, -7.4)],
    cameraOffset: v3(0, 3.8, 16),
  };
}

/**
 * Interdictor (Reach Patrol): a broad, symmetric white wedge between two outrigger booms, chevron
 * striping and a red-and-blue lightbar across the spine. Meant to be recognised at a kilometre.
 */
function interdictor(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // central wedge
  b.bevel(v3(0, 0, -0.5), v3(4.0, 1.5, 11), 0.45, p.primary, { ...NO, front: [0.35, 0.45], lift: -0.15 });
  b.bevel(v3(0, 0.9, 1.4), v3(2.4, 0.6, 5.5), 0.25, p.primary, { ...NO, front: [0.6, 0.6] });
  b.hull([v3(0, 0.55, -5.2), v3(0.7, 0.6, -3.4), v3(-0.7, 0.6, -3.4), v3(0, 1.3, -2.8), v3(0.6, 1.2, -1.4), v3(-0.6, 1.2, -1.4)], p.canopy, 1.1);
  // lightbar
  b.bevel(v3(0, 1.36, 0.2), v3(3.2, 0.3, 0.7), 0.1, DARK, NO);
  b.box(v3(-0.8, 1.56, 0.2), v3(1.4, 0.26, 0.5), '#ff3348', { ...NO, glow: 3 });
  b.box(v3(0.8, 1.56, 0.2), v3(1.4, 0.26, 0.5), '#3a7bff', { ...NO, glow: 3 });
  for (const s of [1, -1]) {
    // wing plate to the boom, with a chevron stripe
    b.hull(plate([v3(s * 1.8, -0.1, -2.0), v3(s * 1.9, -0.1, 3.6), v3(s * 4.2, -0.2, 3.4), v3(s * 4.2, -0.2, -0.8)], UPN, 0.25), p.primary);
    b.hull(plate([v3(s * 2.0, 0.05, 0.4), v3(s * 2.0, 0.05, 1.1), v3(s * 4.0, -0.05, 2.0), v3(s * 4.0, -0.05, 1.3)], UPN, 0.06), p.secondary);
    b.hull(plate([v3(s * 2.0, 0.05, 1.6), v3(s * 2.0, 0.05, 2.1), v3(s * 4.0, -0.05, 3.0), v3(s * 4.0, -0.05, 2.5)], UPN, 0.06), p.accent);
    // outrigger boom
    b.bevel(v3(s * 4.6, -0.2, 0.4), v3(1.2, 1.2, 9.5), 0.3, p.primary, { ...NO, front: [0.55, 0.55] });
    b.box(v3(s * 4.6, 0.42, 0.4), v3(0.4, 0.06, 6.0), p.secondary, NO);
    b.cylinder(v3(s * 4.6, -0.5, -5.0), 0.14, 2.0, DARK, { ...NO, quat: X90, sides: 6 });
    b.cylinder(v3(s * 4.6, -0.2, 5.4), 0.5, 0.6, DARK, { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(s * 4.6, -0.2, 5.75), 0.42, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 1.0 });
    // canted fin on each boom
    b.hull(plate([v3(s * 4.6, 0.5, 2.2), v3(s * 4.6, 0.5, 4.6), v3(s * 5.2, 2.0, 5.2), v3(s * 5.1, 2.0, 4.0)], v3(1, -0.3 * s, 0).normalize(), 0.12), p.secondary);
    nav(b, s * 5.2, 2.0, 4.8);
  }
  b.cylinder(v3(0, 0, 5.3), 0.9, 0.8, DARK, { ...NO, quat: X90, sides: 10 });
  b.cylinder(v3(0, 0, 5.75), 0.78, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
  return {
    group: b.build('interdictor', 'ship'),
    engines: [v3(0, 0, 5.8), v3(4.6, -0.2, 5.8), v3(-4.6, -0.2, 5.8)],
    engineRadius: 0.6,
    guns: [v3(4.6, -0.5, -6.0), v3(-4.6, -0.5, -6.0)],
    cameraOffset: v3(0, 4.0, 17),
  };
}

/**
 * Talon: a superiority fighter after the Babylon 5 Starfury. A boxy cockpit pod with four
 * slanted wings in an X, each ending in an engine pod that has nozzles at both ends, so it can
 * thrust and brake in any direction.
 */
function talon(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // cockpit pod: a bevelled box with a faceted nose and a framed canopy
  b.bevel(v3(0, 0, -0.6), v3(2.0, 1.9, 6.4), 0.45, p.primary, { ...NO, front: [0.55, 0.6], lift: -0.1 });
  b.hull([v3(0, 0.55, -4.0), v3(0.62, 0.62, -2.9), v3(-0.62, 0.62, -2.9), v3(0, 1.3, -2.4), v3(0.55, 1.15, -1.3), v3(-0.55, 1.15, -1.3)], p.canopy, 1.1);
  b.strut(v3(0, 1.32, -2.4), v3(0, 1.17, -1.3), 0.06, DARK, { ...NO, sides: 4 });
  b.bevel(v3(0, 0.15, 3.2), v3(1.5, 1.4, 2.0), 0.3, p.secondary, NO);
  b.box(v3(0, 0.98, 0.6), v3(0.24, 0.1, 2.6), p.accent, { ...NO, glow: 1.3 });
  b.cylinder(v3(0, -0.85, -3.6), 0.12, 2.0, DARK, { ...NO, quat: X90, sides: 6 });
  const pods: THREE.Vector3[] = [];
  for (const sx of [1, -1])
    for (const sy of [1, -1]) {
      // wing: a flat slab from the pod's flank out to the engine pod, raked back
      const root = v3(sx * 0.9, sy * 0.45, 0.6);
      const tip = v3(sx * 5.4, sy * 2.5, 2.6);
      const n = new THREE.Vector3(-sy * 0.45, sx * 1, 0).normalize();
      const along = tip.clone().sub(root).normalize();
      const chord = 2.3;
      b.hull(
        plate([root.clone().add(v3(0, 0, -chord)), root.clone().add(v3(0, 0, chord * 0.5)), tip.clone().add(v3(0, 0, 0.6)), tip.clone().add(v3(0, 0, -1.2))], n, 0.22),
        sy > 0 ? p.primary : p.secondary,
      );
      b.hull(plate([root.clone().addScaledVector(along, 1.2).add(v3(0, 0, -0.6)), root.clone().addScaledVector(along, 1.2).add(v3(0, 0, -0.2)), tip.clone().add(v3(0, 0, -0.3)).addScaledVector(along, -0.9), tip.clone().add(v3(0, 0, -0.7)).addScaledVector(along, -0.9)], n, 0.26), p.accent);
      // engine pod with a forward retro nozzle and a main bell aft
      const c = tip.clone().add(v3(0, 0, 0.4));
      b.cylinder(c, 0.72, 3.4, p.primary, { ...NO, quat: X90, sides: 10 });
      b.torus(c.clone().add(v3(0, 0, -0.9)), 0.76, 0.1, p.secondary, { radial: 4, tubular: 16 });
      b.cylinder(c.clone().add(v3(0, 0, -1.9)), 0.5, 0.5, DARK, { ...NO, quat: X90, sides: 10, radiusTop: 0.36 });
      b.cylinder(c.clone().add(v3(0, 0, 1.95)), 0.66, 0.5, DARK, { ...NO, quat: X90, sides: 10 });
      b.cylinder(c.clone().add(v3(0, 0, 2.22)), 0.54, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
      // a small manoeuvring fin on each pod
      b.hull(plate([c.clone().add(v3(sx * 0.5, sy * 0.4, 0.2)), c.clone().add(v3(sx * 0.5, sy * 0.4, 1.3)), c.clone().add(v3(sx * 1.2, sy * 1.1, 1.6)), c.clone().add(v3(sx * 1.1, sy * 1.0, 0.9))], v3(sx, -sy, 0).normalize(), 0.1), p.secondary);
      pods.push(c.clone().add(v3(0, 0, 2.3)));
      if (sy > 0) nav(b, sx * 6.3, 3.5, 2.2);
    }
  return {
    group: b.build('talon', 'ship'),
    engines: pods,
    engineRadius: 0.54,
    guns: [v3(0, -0.85, -4.6), v3(5.4, 2.5, 0.0), v3(-5.4, -2.5, 0.0), v3(-5.4, 2.5, 0.0), v3(5.4, -2.5, 0.0)],
    cameraOffset: v3(0, 4.2, 17),
  };
}

/**
 * Wren: Kestrel's station-defence fighter, after the Jedi starfighter. A small flat delta with
 * the cockpit bubble at the back, a little dorsal fin and two engines at the corners.
 * Small and friendly-looking, which it is until you threaten the station.
 */
function wren(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // flat delta wedge
  b.hull(
    [v3(0, 0.05, -5.2), v3(2.6, 0.15, 1.8), v3(-2.6, 0.15, 1.8), v3(0, 0.55, 1.6), v3(0, -0.4, 1.6), v3(0, 0.3, -2.0), v3(0, -0.25, -2.0), v3(2.4, 0.05, 2.4), v3(-2.4, 0.05, 2.4)],
    p.primary,
  );
  // nose stripes
  b.hull(plate([v3(0, 0.22, -4.6), v3(0.5, 0.3, -3.0), v3(-0.5, 0.3, -3.0)], UPN, 0.04), p.secondary);
  b.hullMirrored(plate([v3(1.2, 0.27, -0.6), v3(1.6, 0.27, -0.6), v3(2.3, 0.2, 1.6), v3(1.9, 0.22, 1.6)], UPN, 0.04), p.secondary);
  // cockpit bubble at the back
  b.hull([v3(0, 0.35, -0.6), v3(0.55, 0.45, 0.2), v3(-0.55, 0.45, 0.2), v3(0, 1.15, 0.5), v3(0.45, 0.55, 1.4), v3(-0.45, 0.55, 1.4), v3(0, 0.95, 1.4)], p.canopy, 1.15);
  // a small dorsal fin behind the canopy
  b.hull(plate([v3(0, 0.6, 1.0), v3(0, 0.6, 2.2), v3(0, 1.5, 2.5), v3(0, 1.3, 1.8)], SIDEN, 0.1), p.secondary);
  // corner engines
  for (const s of [1, -1]) {
    b.cylinder(v3(s * 1.9, 0.1, 2.2), 0.42, 1.4, p.secondary, { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(s * 1.9, 0.1, 2.95), 0.34, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
    b.cylinder(v3(s * 0.9, -0.05, -2.6), 0.08, 1.4, DARK, { ...NO, quat: X90, sides: 6 });
    nav(b, s * 2.6, 0.2, 1.7);
  }
  return {
    group: b.build('wren', 'ship'),
    engines: [v3(1.9, 0.1, 3.0), v3(-1.9, 0.1, 3.0)],
    engineRadius: 0.34,
    guns: [v3(0.9, -0.05, -3.3), v3(-0.9, -0.05, -3.3)],
    cameraOffset: v3(0, 2.8, 11.5),
  };
}

/** Drone: unmanned and tiny. A faceted core with one eye, a guard ring and three vanes. */
function drone(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.sphere(v3(0, 0, 0), 0.75, p.secondary, { ...NO, detail: 0 });
  b.sphere(v3(0, 0, -0.62), 0.24, p.accent, { ...NO, glow: 2.4, detail: 0 });
  b.torus(v3(0, 0, 0.1), 1.05, 0.1, p.primary, { radial: 4, tubular: 14 });
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const d = v3(Math.cos(a), Math.sin(a), 0);
    b.hull(plate([d.clone().multiplyScalar(0.6).add(v3(0, 0, 0.2)), d.clone().multiplyScalar(0.6).add(v3(0, 0, 0.9)), d.clone().multiplyScalar(1.5).add(v3(0, 0, 1.1)), d.clone().multiplyScalar(1.4).add(v3(0, 0, 0.5))], v3(-d.y, d.x, 0), 0.08), p.primary);
  }
  b.cylinder(v3(0, 0, 0.85), 0.3, 0.4, DARK, { ...NO, quat: X90, sides: 8 });
  b.cylinder(v3(0, 0, 1.07), 0.24, 0.06, p.engine, { ...NO, quat: X90, sides: 8, glow: 1.0 });
  return {
    group: b.build('drone', 'ship'),
    engines: [v3(0, 0, 1.1)],
    engineRadius: 0.24,
    guns: [v3(0, 0, -0.9)],
    cameraOffset: v3(0, 1.8, 7),
  };
}

/** Deterministic little RNG for model detail. */
function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

/**
 * Container ship: a long open keel carrying a wide, terraced load of containers, a bridge block
 * up front on a bevelled bow, and a row of engine bells. About 160 m.
 */
function container(p: Palette): ShipModel {
  const b = new StructureBuilder();
  const next = seeded(11);
  const boxes = ['#ff4d4d', '#ffcf33', '#2fb7ff', '#3ee07a', '#ff7ad9', '#9b6bff', '#ff8a1f', '#e8ecf2'];
  b.bevel(v3(0, -6, 0), v3(10, 6, 150), 1.5, '#4e5466', NO);
  b.bevel(v3(0, -2, -82), v3(30, 18, 22), 4, p.primary, { ...NO, front: [0.5, 0.6], lift: -2 });
  b.bevel(v3(0, 12, -80), v3(18, 10, 12), 2.5, '#e8ecf2', { ...NO, front: [0.8, 0.8] });
  b.box(v3(0, 13.5, -86.3), v3(15, 2, 0.4), '#7fe0ff', { ...NO, glow: 1.4 });
  // terraced stacks: wider in the middle
  for (let z = -62; z <= 60; z += 13) {
    const w = 3 + Math.round(2 * Math.cos((z / 62) * 1.2));
    for (let x = -w; x <= w; x++)
      for (let y = 0; y < 3; y++) {
        if (next() < 0.12) continue;
        b.box(v3(x * 6.2, y * 5.6, z), v3(5.8, 5.2, 12), boxes[Math.floor(next() * boxes.length)], NO);
      }
  }
  b.bevel(v3(0, 0, 76), v3(34, 16, 14), 3, p.secondary, NO);
  for (const ex of [-10, 0, 10]) {
    b.cylinder(v3(ex, 0, 85), 4, 5, '#2b2f45', { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(ex, 0, 87.6), 3.4, 0.2, p.engine, { ...NO, quat: X90, sides: 12, glow: 1.0 });
  }
  for (const s of [1, -1]) {
    b.sphere(v3(s * 17, 6, 76), 0.8, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
    b.sphere(v3(s * 9, 18, -80), 0.6, '#ffffff', { ...NO, glow: 3, detail: 0 });
  }
  return {
    group: b.build('container', 'ship'),
    engines: [v3(-10, 0, 88), v3(0, 0, 88), v3(10, 0, 88)],
    engineRadius: 3.4,
    guns: [v3(0, 0, -95)],
    cameraOffset: v3(0, 40, 200),
  };
}

/**
 * Hospital ship: a white hull with a spinning-gravity ward ring amidships, rows of lit windows,
 * and the Reach's mercy mark (a green cross in a white ring) on the bow and the ring.
 */
function hospital(p: Palette): ShipModel {
  const b = new StructureBuilder();
  void p;
  const white = '#eef2f8';
  const green = '#3ee07a';
  b.cylinder(v3(0, 0, 0), 11, 90, white, { ...NO, quat: X90, sides: 18 });
  b.hull([v3(0, 0, -62), v3(9, 0, -45), v3(-9, 0, -45), v3(0, 9, -45), v3(0, -9, -45), v3(11, 0, -40), v3(-11, 0, -40), v3(0, 11, -40), v3(0, -11, -40)], white);
  // ward ring on four spokes
  b.torus(v3(0, 0, 0), 30, 5, white, { radial: 10, tubular: 48 });
  b.torus(v3(0, 0, 0), 30, 5.2, '#ffe7a8', { radial: 4, tubular: 48, glow: 0.6, quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), 0.04) });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    b.strut(v3(Math.cos(a) * 10, Math.sin(a) * 10, 0), v3(Math.cos(a) * 26, Math.sin(a) * 26, 0), 2, '#c8ccd6', { ...NO, sides: 6 });
  }
  // window rows
  for (const a of [0.5, -0.5, Math.PI - 0.5, Math.PI + 0.5])
    for (let z = -36; z <= 40; z += 6) b.box(v3(Math.cos(a) * 11.1, Math.sin(a) * 11.1, z), v3(0.4, 1.2, 3.6), '#ffe7a8', { ...NO, glow: 1.4, quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), a) });
  // mercy marks on the top of the hull: a green cross in a white ring
  const flat = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2);
  for (const z of [-24, 24]) {
    const c = v3(0, 11.2, z);
    b.torus(c, 7, 0.8, white, { quat: flat, radial: 4, tubular: 24 });
    b.box(c, v3(8.4, 0.3, 2.5), green, { ...NO, glow: 1.2 });
    b.box(c, v3(2.5, 0.3, 8.4), green, { ...NO, glow: 1.2 });
  }
  // engines
  b.bevel(v3(0, 0, 50), v3(26, 14, 12), 3, '#c8ccd6', NO);
  for (const ex of [-7, 7]) {
    b.cylinder(v3(ex, 0, 57), 4, 4, '#2b2f45', { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(ex, 0, 59.1), 3.4, 0.2, '#9ef0ff', { ...NO, quat: X90, sides: 12, glow: 1.0 });
  }
  b.sphere(v3(14, 0, 50), 0.8, '#30ff70', { ...NO, glow: 3, detail: 0 });
  b.sphere(v3(-14, 0, 50), 0.8, '#ff2040', { ...NO, glow: 3, detail: 0 });
  return {
    group: b.build('hospital', 'ship'),
    engines: [v3(-7, 0, 59.3), v3(7, 0, 59.3)],
    engineRadius: 3.4,
    guns: [v3(0, 0, -62)],
    cameraOffset: v3(0, 40, 160),
  };
}

/**
 * Cruise liner: a long sleek wedge with terraced decks, bands of lit windows, a glass
 * observation dome and swept fins. About 180 m and lit up like a city.
 */
function liner(p: Palette): ShipModel {
  const b = new StructureBuilder();
  const hull = '#f2efe8';
  b.bevel(v3(0, 0, 0), v3(36, 16, 170), 5, hull, { ...NO, front: [0.25, 0.5], lift: -3 });
  b.bevel(v3(0, 11, 10), v3(28, 8, 120), 3, hull, { ...NO, front: [0.4, 0.8] });
  b.bevel(v3(0, 18, 24), v3(20, 7, 70), 2.5, hull, { ...NO, front: [0.5, 0.8] });
  for (const [y, w, z0, z1] of [
    [2, 18.2, -60, 80],
    [-3, 18.2, -50, 80],
    [12, 14.2, -40, 68],
    [18.5, 10.2, -6, 56],
  ] as const) {
    for (const s of [1, -1]) b.box(v3(s * w, y, (z0 + z1) / 2), v3(0.3, 1.4, z1 - z0), '#ffe7a8', { ...NO, glow: 1.5 });
  }
  b.sphere(v3(0, 22, 4), 9, '#7fe0ff', { ...NO, detail: 2, scale: v3(1, 0.6, 1.3) });
  b.box(v3(0, 7.8, -70), v3(8, 0.3, 30), p.accent, { ...NO, glow: 1.2 });
  for (const s of [1, -1]) {
    b.hull(plate([v3(s * 16, 4, 60), v3(s * 16, 4, 84), v3(s * 30, 22, 92), v3(s * 28, 22, 78)], v3(1, -0.6 * s, 0).normalize(), 1.2), p.primary);
    b.sphere(v3(s * 30, 22, 90), 0.9, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
  }
  for (const ex of [-11, 0, 11]) {
    b.cylinder(v3(ex, 0, 87), 4.4, 4, '#2b2f45', { ...NO, quat: X90, sides: 12 });
    b.cylinder(v3(ex, 0, 89.1), 3.8, 0.2, p.engine, { ...NO, quat: X90, sides: 12, glow: 1.0 });
  }
  return {
    group: b.build('liner', 'ship'),
    engines: [v3(-11, 0, 89.3), v3(0, 0, 89.3), v3(11, 0, 89.3)],
    engineRadius: 3.8,
    guns: [v3(0, 0, -86)],
    cameraOffset: v3(0, 50, 220),
  };
}

/**
 * Asteroid miner: a squat ore barge with a drill head on a boom, a grab arm, an open ore hopper
 * and work lights. Rugged and yellow, about 70 m.
 */
function miner(p: Palette): ShipModel {
  const b = new StructureBuilder();
  const yellow = '#f4b400';
  b.bevel(v3(0, 0, 4), v3(22, 14, 40), 3, yellow, NO);
  b.bevel(v3(0, 10, -12), v3(12, 7, 9), 2, '#3a3440', { ...NO, front: [0.7, 0.7] });
  b.box(v3(0, 11, -16.6), v3(9, 2, 0.3), '#7fe0ff', { ...NO, glow: 1.4 });
  // ore hopper, open on top, with rock in it
  b.box(v3(0, 9, 12), v3(18, 1, 18), '#4e5466', NO);
  for (const s of [1, -1]) b.box(v3(s * 9, 13, 12), v3(1, 8, 18), '#4e5466', NO);
  for (let i = 0; i < 5; i++) b.sphere(v3(-5 + i * 2.5, 12 + (i % 2), 10 + (i % 3) * 3), 2.4, '#6d6a72', { ...NO, detail: 0 });
  // drill boom and head
  b.box(v3(0, -2, -22), v3(4, 4, 18), '#4e5466', NO);
  b.cylinder(v3(0, -2, -34), 5, 8, '#8a8070', { ...NO, quat: X90, sides: 10, radiusTop: 1 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.box(v3(Math.cos(a) * 3, -2 + Math.sin(a) * 3, -35), v3(0.8, 0.8, 6), '#c8ccd6', NO);
  }
  // grab arm
  b.strut(v3(9, -4, -6), v3(14, -10, -22), 1.4, yellow, { ...NO, sides: 6 });
  b.strut(v3(14, -10, -22), v3(10, -12, -30), 1.1, yellow, { ...NO, sides: 6 });
  // work lights and engines
  for (const s of [1, -1]) {
    b.sphere(v3(s * 11, 7, -16), 0.9, '#ffffff', { ...NO, glow: 3, detail: 0 });
    b.cylinder(v3(s * 6, 0, 26), 3, 4, '#2b2f45', { ...NO, quat: X90, sides: 10 });
    b.cylinder(v3(s * 6, 0, 28.1), 2.5, 0.2, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
  }
  return {
    group: b.build('miner', 'ship'),
    engines: [v3(6, 0, 28.3), v3(-6, 0, 28.3)],
    engineRadius: 2.5,
    guns: [v3(0, -2, -38)],
    cameraOffset: v3(0, 26, 90),
  };
}

/**
 * Scarlet Rose: the Baron's fighter. A long X-wing nose and a lopsided X of wings: the upper
 * starboard and lower port wings are long and end in Starfury-style engine pods with a cannon
 * along each, the upper port wing is a short gun blade and the lower starboard one a stub fin.
 * Crimson and cream with a gold rose on the long upper wing.
 */
function scarlet(p: Palette): ShipModel {
  const b = new StructureBuilder();
  // long X-wing nose and body
  b.hull(
    [v3(0, -0.1, -9.5), v3(0.55, 0.05, -5.5), v3(-0.55, 0.05, -5.5), v3(0, 0.6, -5.5), v3(0, -0.5, -5.5), v3(1.1, 0.1, 0), v3(-1.1, 0.1, 0), v3(0, 1.0, 0), v3(0, -0.85, 0)],
    p.primary,
  );
  b.bevel(v3(0, 0.1, 2.6), v3(2.4, 1.9, 5.2), 0.4, p.primary, NO);
  // cream nose stripes
  b.hull(plate([v3(0, 0.33, -8.6), v3(0.3, 0.42, -6.2), v3(-0.3, 0.42, -6.2)], UPN, 0.04), p.secondary);
  b.box(v3(0, 0.62, -4.4), v3(0.9, 0.06, 1.6), p.secondary, NO);
  // framed canopy, set a little to port: even the cockpit is lopsided
  b.hull([v3(-0.15, 0.6, -3.6), v3(0.35, 0.75, -2.4), v3(-0.65, 0.75, -2.4), v3(-0.15, 1.45, -2.0), v3(0.3, 1.2, -0.9), v3(-0.6, 1.2, -0.9)], p.canopy, 1.15);
  b.strut(v3(-0.15, 1.47, -2.0), v3(-0.15, 1.22, -0.9), 0.06, DARK, { ...NO, sides: 4 });
  b.hull([v3(0.4, 0.95, -0.6), v3(-0.7, 0.95, -0.6), v3(-0.15, 1.5, -0.2), v3(-0.15, 1.1, 1.6)], p.primary);

  const root = v3(0, 0.1, 2.0);
  /** A wing from the body out to `tip`, as a slab of the given chord. */
  const wing = (tip: THREE.Vector3, chord: number, color: string) => {
    const n = new THREE.Vector3(-tip.y, tip.x, 0).normalize();
    b.hull(plate([root.clone().add(v3(0, 0, -chord * 0.6)), root.clone().add(v3(0, 0, chord * 0.4)), tip.clone().add(v3(0, 0, chord * 0.25)), tip.clone().add(v3(0, 0, -chord * 0.45))], n, 0.5), color);
    return n;
  };
  /** Starfury-style engine pod with a cannon running forward along it. */
  const pod = (c: THREE.Vector3) => {
    b.cylinder(c, 0.7, 3.6, p.primary, { ...NO, quat: X90, sides: 12 });
    b.torus(c.clone().add(v3(0, 0, -1.0)), 0.74, 0.1, p.accent, { radial: 4, tubular: 16 });
    b.cylinder(c.clone().add(v3(0, 0, -2.0)), 0.42, 0.5, DARK, { ...NO, quat: X90, sides: 12, radiusTop: 0.28 });
    b.cylinder(c.clone().add(v3(0, 0, 2.05)), 0.62, 0.5, DARK, { ...NO, quat: X90, sides: 12 });
    b.cylinder(c.clone().add(v3(0, 0, 2.32)), 0.52, 0.1, p.engine, { ...NO, quat: X90, sides: 12, glow: 1.0 });
    b.cylinder(c.clone().add(v3(0, 0.75, -3.4)), 0.12, 4.2, DARK, { ...NO, quat: X90, sides: 6 });
    b.cylinder(c.clone().add(v3(0, 0.75, -5.55)), 0.18, 0.3, p.accent, { ...NO, quat: X90, sides: 6, glow: 1.3 });
  };
  // the long pair: upper starboard and lower port, swept back to their pods
  const tipA = v3(5.6, 2.6, 3.0);
  const tipB = v3(-5.0, -2.4, 3.2);
  wing(tipA, 3.2, p.primary);
  wing(tipB, 3.0, p.primary);
  pod(tipA);
  pod(tipB);
  // cream leading-edge stripes on the long wings
  b.strut(root.clone().add(v3(0.6, 0.4, -1.3)), tipA.clone().add(v3(-0.6, -0.2, -0.9)), 0.1, p.secondary, { ...NO, sides: 4 });
  b.strut(root.clone().add(v3(-0.6, -0.4, -1.2)), tipB.clone().add(v3(0.6, 0.2, -0.8)), 0.1, p.secondary, { ...NO, sides: 4 });
  // the gold rose on the long upper wing
  const rose = tipA.clone().multiplyScalar(0.55).add(root.clone().multiplyScalar(0.45)).add(v3(-0.1, 0.2, -0.3));
  const along = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), new THREE.Vector3(-tipA.y, tipA.x, 0).normalize());
  b.torus(rose, 0.55, 0.12, p.secondary, { quat: along, radial: 4, tubular: 16 });
  b.sphere(rose, 0.32, p.accent, { ...NO, detail: 0 });
  // the short pair: a gun blade upper port, a stub fin lower starboard
  const bladeTip = v3(-2.6, 1.9, 0.6);
  wing(bladeTip, 1.6, p.secondary);
  b.cylinder(bladeTip.clone().add(v3(0, 0, -1.6)), 0.14, 3.0, DARK, { ...NO, quat: X90, sides: 6 });
  wing(v3(1.9, -1.5, 3.6), 1.4, p.primary);
  // main engines, one big and one small, and a dorsal fin
  b.cylinder(v3(-0.35, 0.1, 5.4), 0.75, 1.2, DARK, { ...NO, quat: X90, sides: 12 });
  b.cylinder(v3(-0.35, 0.1, 6.02), 0.64, 0.1, p.engine, { ...NO, quat: X90, sides: 12, glow: 1.0 });
  b.cylinder(v3(0.62, -0.3, 5.2), 0.42, 1.0, DARK, { ...NO, quat: X90, sides: 10 });
  b.cylinder(v3(0.62, -0.3, 5.72), 0.36, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 1.0 });
  b.hull(plate([v3(0, 1.0, 2.6), v3(0, 1.0, 5.0), v3(0, 2.3, 5.6), v3(0, 2.0, 4.0)], SIDEN, 0.12), p.secondary);
  nav(b, 5.6, 3.4, 3.0);
  nav(b, -5.0, -3.2, 3.2);
  return {
    group: b.build('scarlet', 'ship'),
    engines: [v3(-0.35, 0.1, 6.1), v3(0.62, -0.3, 5.8), tipA.clone().add(v3(0, 0, 2.4)), tipB.clone().add(v3(0, 0, 2.4))],
    engineRadius: 0.55,
    guns: [tipA.clone().add(v3(0, 0.75, -5.6)), tipB.clone().add(v3(0, 0.75, -5.6)), bladeTip.clone().add(v3(0, 0, -3.1))],
    cameraOffset: v3(0, 3.8, 16),
  };
}

const builders: Record<ModelId, (p: Palette) => ShipModel> = { kite, lancer, raider, warden, brute, freighter, corsair, halberd, sabre, shuttle, turret, relay, habitat, cannon, gannet, bulwark, fang, interdictor, talon, wren, drone, container, hospital, liner, miner, scarlet };
const cache = new Map<string, ShipModel>();

/** Builds (once) and clones a ship model. Clones share geometry and materials. */
export function getShipModel(id: ModelId, palette: Palette, key: string): ShipModel {
  const cacheKey = `${id}:${key}`;
  let m = cache.get(cacheKey);
  if (!m) {
    m = builders[id](palette);
    cache.set(cacheKey, m);
  }
  return {
    group: m.group.clone(),
    engines: m.engines.map((e) => e.clone()),
    engineRadius: m.engineRadius,
    guns: m.guns.map((g) => g.clone()),
    cameraOffset: m.cameraOffset.clone(),
  };
}

const flameGeometry = (() => {
  const g = new THREE.ConeGeometry(1, 1, 10, 1, true);
  g.applyQuaternion(X90);
  g.translate(0, 0, 0.5);
  return g;
})();

/** Additive cone flames per engine; scaled each frame from thrust. */
export function createFlames(model: ShipModel, color: string): THREE.Mesh[] {
  const outer = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(1.1),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const inner = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff').multiplyScalar(1.1),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flames: THREE.Mesh[] = [];
  for (const e of model.engines) {
    const f = new THREE.Mesh(flameGeometry, outer);
    f.position.copy(e);
    f.scale.set(model.engineRadius, model.engineRadius, 3);
    const core = new THREE.Mesh(flameGeometry, inner);
    core.scale.set(0.45, 0.45, 0.6);
    f.add(core);
    model.group.add(f);
    flames.push(f);
  }
  return flames;
}
