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

function kite(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.hull(
    [
      v3(0, 0.1, -7),
      v3(1.0, 0, -2.5),
      v3(-1.0, 0, -2.5),
      v3(0, 0.95, -2.2),
      v3(0, -0.7, -2.2),
      v3(1.5, 0, 2.5),
      v3(-1.5, 0, 2.5),
      v3(0, 1.15, 2.5),
      v3(0, -0.9, 2.5),
      v3(1.1, 0.2, 4.6),
      v3(-1.1, 0.2, 4.6),
      v3(0, 0.8, 4.6),
      v3(0, -0.6, 4.6),
    ],
    p.primary,
  );
  b.hull(
    [
      v3(0, 0.72, -3.4),
      v3(0.55, 0.6, -1.4),
      v3(-0.55, 0.6, -1.4),
      v3(0, 1.45, -0.8),
      v3(0, 1.08, 1.0),
      v3(0.45, 0.8, 0.6),
      v3(-0.45, 0.8, 0.6),
    ],
    p.canopy,
    1.15,
  );
  b.hullMirrored(plate([v3(1.2, 0, 2.8), v3(1.2, 0, -0.2), v3(6.4, -0.1, -1.6), v3(6.6, -0.1, 0.1)], UPN, 0.26), p.secondary);
  b.hullMirrored(plate([v3(2.6, 0.16, 1.5), v3(2.6, 0.16, 0.9), v3(6.3, 0.06, -1.2), v3(6.3, 0.06, -0.7)], UPN, 0.06), p.accent);
  b.hullMirrored(plate([v3(0.9, 0.6, 2.4), v3(0.9, 0.6, 4.6), v3(1.7, 2.1, 4.5), v3(1.6, 2.1, 3.7)], SIDEN, 0.14), p.accent);
  for (const s of [1, -1]) {
    b.cylinder(v3(s * 1.7, 0.1, 3.2), 0.65, 3.4, p.secondary, { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(s * 1.7, 0.1, 4.92), 0.5, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 2.5 });
    b.cylinder(v3(s * 2.4, -0.15, -2.2), 0.12, 3.2, '#2b2f45', { ...NO, quat: X90, sides: 6 });
    b.box(v3(s * 6.55, -0.1, -0.7), v3(0.3, 0.3, 1.8), p.primary, NO);
    b.sphere(v3(s * 6.7, -0.1, -0.7), 0.16, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
  }
  return {
    group: b.build('kite'),
    engines: [v3(1.7, 0.1, 5.0), v3(-1.7, 0.1, 5.0)],
    engineRadius: 0.55,
    guns: [v3(2.4, -0.15, -3.9), v3(-2.4, -0.15, -3.9)],
    cameraOffset: v3(0, 3.4, 14),
  };
}

function lancer(p: Palette): ShipModel {
  const b = new StructureBuilder();
  b.hull(
    [
      v3(0, 0, -6.5),
      v3(1.2, 0.3, -3),
      v3(-1.2, 0.3, -3),
      v3(0, 1.3, -2.5),
      v3(0, -1, -2.5),
      v3(1.4, 0.2, 2),
      v3(-1.4, 0.2, 2),
      v3(0, 1.3, 2),
      v3(0, -1, 2),
    ],
    p.primary,
  );
  b.hull([v3(0, 1.0, -3.2), v3(0.6, 0.9, -1.2), v3(-0.6, 0.9, -1.2), v3(0, 1.6, -0.8), v3(0, 1.2, 0.8)], p.canopy, 1.15);
  b.hullMirrored(plate([v3(1.2, 0, -1.5), v3(1.2, 0, 3.5), v3(7.5, -0.2, 3.8), v3(7.0, -0.2, 2.2)], UPN, 0.3), p.secondary);
  for (const s of [1, -1]) {
    b.cylinder(v3(s * 3.2, 0, 1), 0.9, 8.5, p.primary, { ...NO, quat: X90, sides: 8 });
    b.cylinder(v3(s * 3.2, 0, 5.3), 0.75, 0.12, p.engine, { ...NO, quat: X90, sides: 8, glow: 2.5 });
    b.box(v3(s * 3.2, 1.0, 1.0), v3(0.25, 1.2, 4), p.accent, NO);
    b.cylinder(v3(s * 3.2, -0.6, -4), 0.16, 4, '#2b2f45', { ...NO, quat: X90, sides: 6 });
    b.sphere(v3(s * 7.5, -0.2, 3.4), 0.18, s > 0 ? '#30ff70' : '#ff2040', { ...NO, glow: 3, detail: 0 });
  }
  b.hullMirrored(plate([v3(4.5, -0.15, 2.4), v3(4.5, -0.15, 3.3), v3(7.0, -0.25, 3.5), v3(6.7, -0.25, 2.6)], UPN, 0.34), p.accent);
  return {
    group: b.build('lancer'),
    engines: [v3(3.2, 0, 5.4), v3(-3.2, 0, 5.4)],
    engineRadius: 0.75,
    guns: [v3(3.2, -0.6, -6), v3(-3.2, -0.6, -6)],
    cameraOffset: v3(0, 3.8, 16),
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
  b.cylinder(v3(0, 0, 4.82), 0.95, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 2.6 });
  return {
    group: b.build('raider'),
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
    b.cylinder(v3(s * 1.2, -0.2, 4.52), 0.48, 0.1, p.engine, { ...NO, quat: X90, sides: 8, glow: 2.5 });
    b.cylinder(v3(s * 3.6, 0, 0.2), 0.12, 2.8, '#2b2f45', { ...NO, quat: X90, sides: 6 });
  }
  return {
    group: b.build('warden'),
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
    b.cylinder(v3(ex, 0, 14.55), 1.3, 0.1, p.engine, { ...NO, quat: X90, sides: 10, glow: 2.6 });
  }
  return {
    group: b.build('brute'),
    engines: [v3(-3.2, 0, 14.6), v3(0, 0, 14.6), v3(3.2, 0, 14.6)],
    engineRadius: 1.3,
    guns: [v3(9, 3.2, -9.5), v3(-9, 3.2, -9.5)],
    cameraOffset: v3(0, 10, 45),
  };
}

const builders: Record<ModelId, (p: Palette) => ShipModel> = { kite, lancer, raider, warden, brute };
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
    color: new THREE.Color(color).multiplyScalar(1.5),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const inner = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff').multiplyScalar(1.6),
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
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
