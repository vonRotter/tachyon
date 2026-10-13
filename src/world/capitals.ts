import * as THREE from 'three';
import { StructureBuilder, v3 } from './builder';
import { BoxCollider, type CollisionWorld } from './colliders';
import { createHologram, placeHologram } from './holograms';
import { buildCarrier, COMBINE_STYLE, type Beacon, type CapitalStyle, type DockSpec, type StructureResult, type TurretMount } from './structures';

/**
 * Capital ship hulls. Every builder works in the ship's own frame (nose towards -Z, up +Y) and is
 * placed by `transform`, so the same hull can sit still in a location or ride on a moving
 * CapitalShip (identity transform, its own collision sub-world).
 *
 * Sizes, for scale against a ~12 m fighter and the ~22 m Halberd:
 *   frigate ~60 m (crew 3-10), destroyer ~200 m (crew 40-50, a small hangar),
 *   carrier ~600 m (fighter wings), battlecruiser ~820 m (buildCarrier in structures.ts).
 */

export const STYLES: Record<string, Omit<CapitalStyle, 'id' | 'name'>> = {
  combine: COMBINE_STYLE,
  drift: {
    hull: '#c46a2b',
    trim: '#3c6e4a',
    dark: '#2b2f45',
    light: '#c6ff5a',
    signs: ['DRIFT UNION', 'WE CARRY EACH OTHER'],
    signColor: '#c6ff5a',
  },
  wake: {
    hull: '#6a1424',
    trim: '#ffd030',
    dark: '#26222e',
    light: '#ff4060',
    signs: ['RED WAKE', 'NO FLAGS · NO MASTERS'],
    signColor: '#ff3b5c',
  },
  kestrel: {
    hull: '#f4b400',
    trim: '#3047c4',
    dark: '#2b2f45',
    light: '#7fe9ff',
    signs: ['KESTREL MILITIA', 'HOLD THE LINE'],
    signColor: '#ffd84d',
  },
};

export type CapitalKind = 'frigate' | 'destroyer' | 'carrier' | 'battlecruiser';

export interface CapitalInfo {
  kind: CapitalKind;
  label: string;
  length: number;
  crew: string;
  role: string;
}

export const CAPITAL_INFO: Record<CapitalKind, CapitalInfo> = {
  frigate: { kind: 'frigate', label: 'Frigate', length: 60, crew: '3 to 10', role: 'Patrol and escort. Two turrets, quick for its size.' },
  destroyer: { kind: 'destroyer', label: 'Destroyer', length: 200, crew: '40 to 50', role: 'Line warship bristling with turrets, with a small hangar for assault ships.' },
  carrier: { kind: 'carrier', label: 'Carrier', length: 600, crew: 'about 600', role: 'Lightly armed; carries fighter wings that launch from the bow and land at the stern.' },
  battlecruiser: { kind: 'battlecruiser', label: 'Battlecruiser', length: 820, crew: 'about 900', role: 'Heavy gun barbettes and a broadside hangar. The biggest thing in the Reach.' },
};

/** A box that also blocks ships (StructureBuilder.box collides by default; this is for clarity). */
function solid(b: StructureBuilder, c: THREE.Vector3, size: THREE.Vector3, color: string): void {
  b.box(c, size, color);
}

function finish(
  b: StructureBuilder,
  world: CollisionWorld,
  transform: THREE.Matrix4,
  name: string,
  parts: { beacons: Beacon[]; turrets: TurretMount[]; bays: { pos: THREE.Vector3; out: THREE.Vector3 }[]; docks: DockSpec[]; points: Record<string, THREE.Vector3> },
): StructureResult {
  world.addAll(b.colliders);
  const group = b.build(name);
  const toWorld = (p: THREE.Vector3) => p.clone().applyMatrix4(transform);
  const dirWorld = (d: THREE.Vector3) => d.clone().transformDirection(transform);
  return {
    group,
    beacons: parts.beacons.map((bc) => ({ ...bc, position: toWorld(bc.position) })),
    turrets: parts.turrets.map((t) => ({ pos: toWorld(t.pos), heavy: t.heavy })),
    bays: parts.bays.map((bay) => ({ pos: toWorld(bay.pos), out: dirWorld(bay.out) })),
    docks: parts.docks.map((d) => ({ ...d, pad: toWorld(d.pad), outward: dirWorld(d.outward), up: dirWorld(d.up) })),
    points: Object.fromEntries(Object.entries(parts.points).map(([k, p]) => [k, toWorld(p)])),
  };
}

/** Frigate, ~60 m: a wedge hull with side sponsons, a bridge block and twin engines. */
export function buildFrigate(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  b.hull([v3(0, 0, -32), v3(7, 3, -14), v3(-7, 3, -14), v3(7, -4, -14), v3(-7, -4, -14), v3(0, 6, -10)], style.hull);
  b.addCollider(new BoxCollider(v3(0, 0, -20).applyMatrix4(transform), v3(5, 4, 10), new THREE.Quaternion().setFromRotationMatrix(transform)));
  solid(b, v3(0, 0, 4), v3(16, 10, 36), style.hull);
  for (const s of [1, -1]) {
    solid(b, v3(s * 10, -1, 2), v3(4, 6, 26), style.trim);
    b.cylinder(v3(s * 6, 0, 25), 3.2, 8, style.dark, { quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), sides: 10 });
    b.cylinder(v3(s * 6, 0, 29.1), 2.7, 0.3, style.light, { quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), sides: 10, glow: 1.4, collide: false });
    b.box(v3(s * 8.05, 2.5, 4), v3(0.2, 0.8, 22), '#ffd27a', { glow: 1.4, collide: false });
    beacons.push({ position: v3(s * 12.5, 2, 2), color: new THREE.Color(s > 0 ? '#30ff70' : '#ff2040'), phase: s });
  }
  solid(b, v3(0, 7.5, -2), v3(10, 5, 14), style.dark);
  b.box(v3(0, 8.5, -9.05), v3(8, 1, 0.2), style.light, { glow: 2, collide: false });
  b.strut(v3(0, 10, 4), v3(0, 18, 6), 0.3, style.dark, { collide: false });
  beacons.push({ position: v3(0, 18.4, 6), color: new THREE.Color('#ff2040'), phase: 0 });
  return finish(b, world, transform, 'frigate', {
    beacons,
    turrets: [
      { pos: v3(0, 13, -12), heavy: false },
      { pos: v3(0, -10, 10), heavy: false },
    ],
    bays: [],
    docks: [],
    points: { center: v3(0, 0, 0) },
  });
}

/**
 * Destroyer, ~200 m: stepped prow, a long hull with a through-bay for assault ships, a bridge
 * tower and three engines. Turrets line the spine and both flanks.
 */
export function buildDestroyer(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  const X90 = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2);
  solid(b, v3(0, 0, -88), v3(20, 14, 28), style.hull);
  solid(b, v3(0, 0, -58), v3(34, 20, 34), style.hull);
  b.hull([v3(0, -2, -112), v3(9, 6, -100), v3(-9, 6, -100), v3(9, -6, -100), v3(-9, -6, -100)], style.hull);
  // hull around a through-bay (x -22..22, y -8..8, z -5..25)
  solid(b, v3(0, 0, -23), v3(44, 26, 36), style.hull);
  solid(b, v3(0, 0, 41), v3(44, 26, 32), style.hull);
  solid(b, v3(0, 10.5, 10), v3(44, 5, 30), style.hull);
  solid(b, v3(0, -10.5, 10), v3(44, 5, 30), style.hull);
  for (const s of [1, -1]) {
    b.box(v3(s * 22.2, 8.4, 10), v3(0.4, 0.6, 30), style.light, { glow: 1.8, collide: false });
    b.box(v3(s * 22.2, -8.4, 10), v3(0.4, 0.6, 30), style.light, { glow: 1.8, collide: false });
    b.box(v3(s * 22.3, 0, -24), v3(0.4, 4, 30), style.trim, { collide: false });
  }
  b.box(v3(0, 7.8, 10), v3(40, 0.3, 1), '#ffd27a', { glow: 1.6, collide: false });
  // engineering and engines
  solid(b, v3(0, 0, 75), v3(36, 22, 36), style.hull);
  for (const [x, y] of [
    [-10, 4],
    [10, 4],
    [0, -6],
  ] as const) {
    b.cylinder(v3(x, y, 98), 6, 10, style.dark, { quat: X90, sides: 12 });
    b.cylinder(v3(x, y, 103.2), 5.2, 0.4, style.light, { quat: X90, sides: 12, glow: 1.6, collide: false });
  }
  // bridge tower
  solid(b, v3(0, 20, 48), v3(14, 14, 20), style.dark);
  b.box(v3(0, 24, 37.9), v3(12, 2, 0.2), style.light, { glow: 2.2, collide: false });
  b.strut(v3(0, 27, 52), v3(0, 46, 54), 0.5, style.dark, { collide: false });
  beacons.push({ position: v3(0, 46.6, 54), color: new THREE.Color('#ff2040'), phase: 0 });
  for (const z of [-90, -40, 60]) {
    for (const s of [1, -1]) beacons.push({ position: v3(s * 23, 0, z), color: new THREE.Color(s > 0 ? '#30ff70' : '#ff2040'), phase: z * 0.01 + s });
  }
  const turrets: TurretMount[] = [
    { pos: v3(0, 18, -60), heavy: true },
    { pos: v3(0, 22, -24), heavy: true },
    { pos: v3(0, 20, 72), heavy: true },
  ];
  for (const s of [1, -1]) {
    for (const z of [-50, 40, 75]) turrets.push({ pos: v3(s * 27, 6, z), heavy: false });
    turrets.push({ pos: v3(s * 15, -18, -30), heavy: false });
  }
  return finish(b, world, transform, 'destroyer', {
    beacons,
    turrets,
    bays: [{ pos: v3(-8, -2, 10), out: v3(1, 0, 0) }],
    docks: [
      {
        id: `${style.id}.bay`,
        name: `${style.name}, assault bay`,
        pad: v3(0, -4, 10),
        outward: v3(1, 0, 0),
        up: v3(0, 1, 0),
        mouth: 22,
        opening: [15, 8],
        maxSpeed: 40,
      },
    ],
    points: { center: v3(0, 0, 0) },
  });
}

/**
 * Carrier, ~600 m: a long hangar tunnel runs the whole length under the flight deck. Fighters
 * launch out of the bow and come home through the stern, between the engines. Light defences.
 */
export function buildCarrierShip(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  const X90 = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2);
  const L = 520; // tunnel length, z -260..260
  // tunnel walls: 60 wide, 30 tall inside
  solid(b, v3(0, 26, 0), v3(130, 22, L), style.hull); // flight deck block
  solid(b, v3(0, -26, 0), v3(130, 22, L), style.hull); // keel
  for (const s of [1, -1]) solid(b, v3(s * 47.5, 0, 0), v3(35, 30, L), style.hull);
  // bow and stern caps leave the tunnel mouth open
  b.hull([v3(-65, 37, -260), v3(65, 37, -260), v3(-65, -37, -260), v3(65, -37, -260), v3(-30, 20, -310), v3(30, 20, -310), v3(-30, -20, -300), v3(30, -20, -300)], style.hull);
  for (const s of [1, -1]) solid(b, v3(s * 47, 0, -285), v3(36, 30, 50), style.hull);
  solid(b, v3(0, 26, -285), v3(60, 22, 50), style.hull);
  solid(b, v3(0, -26, -285), v3(60, 22, 50), style.hull);
  // deck-edge sponsons and an overhanging bow deck give it a carrier's silhouette
  for (const s of [1, -1]) {
    solid(b, v3(s * 72, 33, -20), v3(16, 6, 380), style.hull);
    b.box(v3(s * 80.2, 33, -20), v3(0.4, 2, 370), style.trim, { glow: 1.1, collide: false });
    b.box(v3(s * 65.2, -10, 0), v3(0.4, 6, L - 40), style.trim, { collide: false });
    solid(b, v3(s * 60, -34, 40), v3(14, 10, 300), style.dark);
  }
  b.hull([v3(-58, 33, -300), v3(58, 33, -300), v3(-58, 38, -300), v3(58, 38, -300), v3(-40, 34, -350), v3(40, 34, -350), v3(-40, 37, -350), v3(40, 37, -350)], style.hull);
  b.box(v3(0, 38.2, -320), v3(70, 0.3, 2), style.trim, { glow: 1.4, collide: false });
  // flight deck markings and island
  for (let z = -240; z < 240; z += 30) b.box(v3(0, 37.2, z), v3(1.2, 0.3, 14), '#ffd27a', { glow: 1.5, collide: false });
  for (const s of [1, -1]) b.box(v3(s * 30, 37.2, 0), v3(0.6, 0.3, L - 20), style.light, { glow: 1.2, collide: false });
  solid(b, v3(52, 58, 60), v3(18, 20, 70), style.dark);
  solid(b, v3(52, 74, 70), v3(12, 12, 36), style.hull);
  b.box(v3(52, 76, 51.9), v3(10, 2, 0.2), style.light, { glow: 2.2, collide: false });
  b.strut(v3(52, 80, 80), v3(52, 110, 84), 0.8, style.dark, { collide: false });
  b.cylinder(v3(52, 84, 60), 7, 1.2, style.trim, { sides: 16, radiusTop: 4, collide: false });
  b.box(v3(52, 70, 36), v3(14, 1.2, 4), style.trim, { collide: false });
  for (let i = 0; i < 4; i++) b.box(v3(58.2, 62 + i * 3, 60), v3(0.3, 1, 50), '#ffd27a', { glow: 1.4, collide: false });
  beacons.push({ position: v3(52, 111, 84), color: new THREE.Color('#ff2040'), phase: 0 });
  // hangar interior lighting
  for (let z = -240; z < 240; z += 24) {
    b.box(v3(0, 14.7, z), v3(50, 0.3, 1.2), '#dff4ff', { glow: 1.4, collide: false });
    for (const s of [1, -1]) b.box(v3(s * 29.7, -10, z), v3(0.3, 1, 8), style.light, { glow: 1.4, collide: false });
  }
  // stern engines around the recovery mouth
  for (const [x, y] of [
    [-48, 24],
    [48, 24],
    [-48, -24],
    [48, -24],
    [0, 30],
  ] as const) {
    b.cylinder(v3(x, y, 272), x === 0 ? 10 : 14, 24, style.dark, { quat: X90, sides: 14 });
    b.cylinder(v3(x, y, 284.2), x === 0 ? 8.5 : 12, 0.5, style.light, { quat: X90, sides: 14, glow: 1.8, collide: false });
  }
  // mouth frames
  for (const z of [-310, 260]) {
    const zz = z === -310 ? -310.2 : 260.2;
    b.box(v3(0, 15.6, zz), v3(62, 1.2, 0.6), style.light, { glow: 1.8, collide: false });
    b.box(v3(0, -15.6, zz), v3(62, 1.2, 0.6), style.light, { glow: 1.8, collide: false });
  }
  for (let k = 0; k < 8; k++) {
    for (const s of [1, -1]) beacons.push({ position: v3(s * 26, -16, 268 + k * 14), color: new THREE.Color(style.light), phase: 8 - k, kind: 'chase' });
  }
  for (const z of [-200, -60, 80, 220]) for (const s of [1, -1]) beacons.push({ position: v3(s * 66, 0, z), color: new THREE.Color(s > 0 ? '#30ff70' : '#ff2040'), phase: z * 0.01 });
  const turrets: TurretMount[] = [];
  for (const s of [1, -1]) for (const z of [-220, -60, 120, 240]) turrets.push({ pos: v3(s * 72, 10, z), heavy: false });
  turrets.push({ pos: v3(0, 46, -200), heavy: true }, { pos: v3(-30, 46, 180), heavy: true });
  const r = finish(b, world, transform, 'carrier-ship', {
    beacons,
    turrets,
    bays: [-14, 0, 14].map((x) => ({ pos: v3(x, -10, -230), out: v3(0, 0, -1) })),
    docks: [
      {
        id: `${style.id}.hangar`,
        name: `${style.name}, recovery deck`,
        pad: v3(0, -10, 150),
        outward: v3(0, 0, 1),
        up: v3(0, 1, 0),
        mouth: 110,
        opening: [28, 13],
        maxSpeed: 55,
      },
    ],
    points: { center: v3(0, 0, 0), bow: v3(0, 0, -330), stern: v3(0, 0, 300) },
  });
  for (const s of [1, -1]) {
    const sign = createHologram(style.signs, style.signColor, 120, 21 + s);
    r.group.add(placeHologram(sign, v3(s * 66, 10, -100), v3(s, 0, 0)));
  }
  return r;
}

/** Builds any capital hull by kind. */
export function buildCapitalHull(kind: CapitalKind, world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  switch (kind) {
    case 'frigate':
      return buildFrigate(world, transform, style);
    case 'destroyer':
      return buildDestroyer(world, transform, style);
    case 'carrier':
      return buildCarrierShip(world, transform, style);
    case 'battlecruiser':
      return buildCarrier(world, transform, style);
  }
}
