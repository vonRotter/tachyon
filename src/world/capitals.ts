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
    rings: true,
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

const X90 = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2);

/** A round engine bell with a glowing ring: circles break up all the angles. */
function engine(b: StructureBuilder, at: THREE.Vector3, r: number, len: number, style: CapitalStyle): void {
  b.cylinder(at, r, len, style.dark, { quat: X90, sides: 16 });
  b.torus(at.clone().add(v3(0, 0, -len * 0.25)), r * 1.08, r * 0.12, style.trim, { radial: 6, tubular: 24 });
  b.cylinder(at.clone().add(v3(0, 0, len / 2 + 0.2)), r * 0.86, 0.4, style.light, { quat: X90, sides: 16, glow: 1.7, collide: false });
}

/** A strip of lit windows or running lights. */
function lights(b: StructureBuilder, at: THREE.Vector3, size: THREE.Vector3, color: string, glow = 1.6): void {
  b.box(at, size, color, { glow, collide: false });
}

/**
 * Frigate, ~64 m: an arrowhead. A flat delta hull with a raised wedge deck, a small bridge at the
 * back, three ringed engines and down-turned wingtip fins.
 */
export function buildFrigate(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  b.hull(
    [v3(0, -1, -34), v3(18, -2, 22), v3(-18, -2, 22), v3(15, 2, 24), v3(-15, 2, 24), v3(0, 5, -8), v3(0, 5, 22), v3(0, -6, 10), v3(6, -5, 20), v3(-6, -5, 20)],
    style.hull,
  );
  const q = new THREE.Quaternion().setFromRotationMatrix(transform);
  for (const [c, h] of [
    [v3(0, 0, 8), v3(11, 4, 15)],
    [v3(0, 0, -14), v3(5, 3, 10)],
  ] as const) {
    b.addCollider(new BoxCollider(c.clone().applyMatrix4(transform), h, q));
  }
  b.bevel(v3(0, 6, 6), v3(14, 4, 28), 1.5, style.trim, { front: [0.3, 0.7] });
  b.bevel(v3(0, 10, 15), v3(9, 4, 9), 1, style.dark, { front: [0.7, 0.6] });
  lights(b, v3(0, 10.6, 10.4), v3(6, 0.8, 0.2), style.light, 2);
  b.bevel(v3(0, -5, 6), v3(4, 4, 30), 1, style.dark, { front: [0.6, 0.3], collide: false });
  for (const s of [1, -1]) {
    engine(b, v3(s * 9, 0, 26), 2.8, 7, style);
    // wingtip fins, raked down at 45 degrees
    b.hull(plate4(v3(s * 18, -2, 22), v3(s * 14, -2, 10), v3(s * 20, -9, 18), v3(s * 21, -9, 24), s), style.trim);
    lights(b, v3(s * 10, 2.1, 12), v3(0.4, 0.4, 10), '#ffd27a', 1.4);
    beacons.push({ position: v3(s * 21, -9, 24), color: new THREE.Color(s > 0 ? '#30ff70' : '#ff2040'), phase: s });
  }
  engine(b, v3(0, 2, 27), 3.2, 8, style);
  b.strut(v3(0, 12, 17), v3(0, 20, 19), 0.3, style.dark, { collide: false });
  beacons.push({ position: v3(0, 20.4, 19), color: new THREE.Color('#ff2040'), phase: 0 });
  return finish(b, world, transform, 'frigate', {
    beacons,
    turrets: [
      { pos: v3(0, 15, -2), heavy: false },
      { pos: v3(0, -12, 6), heavy: false },
    ],
    bays: [],
    docks: [],
    points: { center: v3(0, 0, 0) },
  });
}

/** Thin plate through four points (for fins), thickened sideways. */
function plate4(a: THREE.Vector3, b2: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, side: number): THREE.Vector3[] {
  const n = v3(side * 0.4, 0, 0);
  return [a, b2, c, d].flatMap((p) => [p.clone().add(n), p.clone().sub(n)]);
}

/**
 * Destroyer, ~210 m: a hammerhead. A wide armoured hammer across the bow with heavy guns at
 * each end, a long spine with a through-bay for assault ships, superstructure stepping up to the
 * bridge, angled armour flanks, a keel fin and three ringed engines.
 */
export function buildDestroyer(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  // hammer and neck
  b.bevel(v3(0, 0, -74), v3(112, 16, 26), 5, style.hull, { back: [0.5, 1] });
  for (const s of [1, -1]) {
    b.bevel(v3(s * 56, 0, -72), v3(16, 26, 36), 4, style.trim, { front: [0.8, 0.7] });
    lights(b, v3(s * 56, 0, -90.2), v3(10, 1, 0.3), style.light, 2);
    beacons.push({ position: v3(s * 64.5, 0, -72), color: new THREE.Color(s > 0 ? '#30ff70' : '#ff2040'), phase: s });
  }
  b.cylinder(v3(0, 0, -87.6), 6, 1.2, style.dark, { quat: X90, sides: 20, collide: false });
  b.torus(v3(0, 0, -88.4), 6.2, 0.5, style.light, { glow: 1.8, tubular: 28 });
  b.bevel(v3(0, 0, -56), v3(20, 18, 22), 3, style.hull);
  // spine around the through-bay (x -14..14, y -8..8, z -5..25)
  b.bevel(v3(0, 0, -25), v3(28, 22, 40), 4, style.hull);
  b.bevel(v3(0, 0, 62), v3(30, 24, 74), 4, style.hull, { back: [0.85, 0.85] });
  b.bevel(v3(0, 10.5, 10), v3(28, 5, 30), 1.5, style.hull);
  b.bevel(v3(0, -10.5, 10), v3(28, 5, 30), 1.5, style.hull);
  for (const s of [1, -1]) {
    lights(b, v3(s * 14.2, 7.6, 10), v3(0.4, 0.6, 30), style.light, 1.8);
    lights(b, v3(s * 14.2, -7.6, 10), v3(0.4, 0.6, 30), style.light, 1.8);
    // angled armour flanks
    b.bevel(v3(s * 17, -3, 52), v3(4, 16, 64), 1.5, style.trim, { quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), s * 0.45), front: [1, 0.5] });
    lights(b, v3(s * 15.2, 4, 45), v3(0.3, 0.8, 34), '#ffd27a', 1.4);
  }
  lights(b, v3(0, 7.8, 10), v3(26, 0.3, 1), '#ffd27a', 1.6);
  // superstructure stepping up to the bridge
  b.bevel(v3(0, 14, 44), v3(22, 6, 52), 2, style.trim, { front: [0.6, 1] });
  b.bevel(v3(0, 19.5, 56), v3(15, 6, 32), 2, style.hull, { front: [0.6, 1] });
  b.bevel(v3(0, 25, 62), v3(11, 5, 14), 1.5, style.dark, { front: [0.7, 0.6] });
  lights(b, v3(0, 25.6, 55.2), v3(9, 1, 0.3), style.light, 2.2);
  b.strut(v3(0, 28, 66), v3(0, 46, 68), 0.5, style.dark, { collide: false });
  beacons.push({ position: v3(0, 46.6, 68), color: new THREE.Color('#ff2040'), phase: 0 });
  // keel fin
  b.hull([v3(0, -11, -30), v3(0, -11, 80), v3(0, -24, 60), v3(0, -22, 10), v3(1.2, -11, 20), v3(-1.2, -11, 20)], style.dark);
  // engines
  for (const [x, y] of [
    [-9, 5],
    [9, 5],
    [0, -6],
  ] as const) {
    engine(b, v3(x, y, 103), 6, 10, style);
  }
  const turrets: TurretMount[] = [
    { pos: v3(56, 21, -72), heavy: true },
    { pos: v3(-56, 21, -72), heavy: true },
    { pos: v3(0, 26, 34), heavy: true },
  ];
  for (const s of [1, -1]) {
    turrets.push({ pos: v3(s * 18, 15, -28), heavy: false }, { pos: v3(s * 21, 8, 80), heavy: false }, { pos: v3(s * 12, -18, 40), heavy: false });
  }
  return finish(b, world, transform, 'destroyer', {
    beacons,
    turrets,
    bays: [{ pos: v3(-6, -2, 10), out: v3(1, 0, 0) }],
    docks: [
      {
        id: `${style.id}.bay`,
        name: `${style.name}, assault bay`,
        pad: v3(0, -4, 10),
        outward: v3(1, 0, 0),
        up: v3(0, 1, 0),
        mouth: 14,
        opening: [14, 8],
        maxSpeed: 40,
      },
    ],
    points: { center: v3(0, 0, 0) },
  });
}

/**
 * Carrier, ~600 m: a tuning fork. Two long prongs carry the flight decks; between them, open to
 * space, is the landing deck where you park, backed by the engineering block. Fighters launch
 * from bays in the prongs' inner faces. An asymmetric island rides the starboard prong.
 */
export function buildCarrierShip(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  for (const s of [1, -1]) {
    const x = s * 72;
    // prong: a long bevelled wedge, layered with a flight deck
    b.bevel(v3(x, 0, -60), v3(56, 44, 400), 8, style.hull, { front: [0.5, 0.55] });
    b.bevel(v3(x, 25, -40), v3(44, 6, 340), 3, style.dark, { front: [0.5, 1] });
    for (let z = -190; z < 120; z += 28) lights(b, v3(x, 28.2, z), v3(1, 0.3, 12), '#ffd27a', 1.4);
    lights(b, v3(x + s * 20, 28.2, -40), v3(0.5, 0.3, 320), style.light, 1.2);
    // outer armour belt and inner bay doors
    b.bevel(v3(x + s * 29, -6, -40), v3(6, 22, 300), 2, style.trim, { front: [1, 0.5] });
    for (const z of [-140, -80, -20, 40]) lights(b, v3(x - s * 28.2, -4, z), v3(0.3, 10, 22), style.light, 1.3);
    beacons.push({ position: v3(x, 0, -262), color: new THREE.Color(s > 0 ? '#30ff70' : '#ff2040'), phase: s });
  }
  // the palm: engineering block joining the prongs
  b.bevel(v3(0, 0, 190), v3(200, 60, 120), 10, style.hull, { back: [0.85, 0.8] });
  b.bevel(v3(0, 36, 196), v3(140, 12, 90), 4, style.trim, { front: [0.8, 1] });
  // landing deck between the prongs, open to space
  b.bevel(v3(0, -16, 100), v3(88, 6, 64), 2, style.dark);
  b.torus(v3(0, -12.6, 104), 14, 0.5, style.light, { glow: 2, tubular: 48, quat: X90 });
  for (const z of [80, 92, 116, 128]) lights(b, v3(0, -12.7, z), v3(30, 0.2, 1), '#ffd27a', 1.4);
  lights(b, v3(0, 0, 129.6), v3(70, 2, 0.4), style.light, 1.8);
  // island on the starboard prong only
  b.bevel(v3(72, 42, 40), v3(22, 26, 64), 4, style.hull, { front: [0.7, 0.8] });
  b.bevel(v3(72, 60, 48), v3(16, 10, 34), 3, style.dark, { front: [0.6, 0.7] });
  lights(b, v3(72, 61, 30.9), v3(12, 1.6, 0.3), style.light, 2.2);
  b.torus(v3(72, 72, 56), 7, 0.6, style.trim, { tubular: 24, quat: X90 });
  b.strut(v3(72, 64, 60), v3(72, 92, 64), 0.8, style.dark, { collide: false });
  beacons.push({ position: v3(72, 92.6, 64), color: new THREE.Color('#ff2040'), phase: 0 });
  // engines on the palm's back face
  for (const [x, y] of [
    [-66, 14],
    [66, 14],
    [-66, -14],
    [66, -14],
    [-22, 0],
    [22, 0],
  ] as const) {
    engine(b, v3(x, y, 258), 12, 20, style);
  }
  const turrets: TurretMount[] = [];
  for (const s of [1, -1]) for (const z of [-200, -80, 60]) turrets.push({ pos: v3(s * 104, 10, z), heavy: false });
  turrets.push({ pos: v3(-50, 50, 196), heavy: true }, { pos: v3(50, 50, 196), heavy: true });
  const r = finish(b, world, transform, 'carrier-ship', {
    beacons,
    turrets,
    bays: [-80, -20].flatMap((z) => [1, -1].map((s) => ({ pos: v3(s * 36, -6, z), out: v3(0, 0, -1) }))),
    docks: [
      {
        id: `${style.id}.hangar`,
        name: `${style.name}, landing deck`,
        pad: v3(0, -8, 104),
        outward: v3(0, 0, -1),
        up: v3(0, 1, 0),
        mouth: 60,
        opening: [40, 20],
        maxSpeed: 55,
      },
    ],
    points: { center: v3(0, 0, 0), bow: v3(0, 0, -300), stern: v3(0, 0, 300) },
  });
  for (const s of [1, -1]) {
    const sign = createHologram(style.signs, style.signColor, 120, 21 + s);
    r.group.add(placeHologram(sign, v3(s * 104, 0, -100), v3(s, 0, 0)));
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
