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
 *   frigate ~60 m (crew 3-10), destroyer ~200 m (crew 40-50, a small hangar), the Wake's
 *   reaver ~310 m,
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
  patrol: {
    hull: '#eef2f8',
    trim: '#1d3f9e',
    dark: '#2b2f45',
    light: '#ff3348',
    signs: ['REACH PATROL', 'THE PEACE IS KEPT'],
    signColor: '#8fb8ff',
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

export type CapitalKind = 'frigate' | 'destroyer' | 'carrier' | 'battlecruiser' | 'reaver';

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
  reaver: { kind: 'reaver', label: 'Reaver', length: 310, crew: 'about 120', role: 'A salvage-built cruiser: a captured ore hauler with a ram at the bow, gun decks on its back and a belly full of raiders.' },
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
    // both guns stand on the hull: one on the raised deck, one on the ridge ahead of it
    turrets: [
      { pos: v3(0, 13, -2), heavy: false },
      { pos: v3(0, 9, -16), heavy: false },
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
    turrets.push({ pos: v3(s * 18, 15, -28), heavy: false }, { pos: v3(s * 21, 8, 80), heavy: false }, { pos: v3(s * 9, 19.5, 90), heavy: false });
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
    // prong: a long bevelled wedge with layered armour on its back
    b.bevel(v3(x, 0, -60), v3(56, 44, 400), 8, style.hull, { front: [0.5, 0.55] });
    b.bevel(v3(x, 25, -50), v3(40, 8, 300), 4, style.hull, { front: [0.6, 1], back: [0.9, 1] });
    b.bevel(v3(x - s * 4, 31, 10), v3(22, 6, 120), 2, style.trim, { front: [0.7, 1] });
    // the prong tapers towards the bow: half its width at z (front face z -260 at half scale)
    const hw = (z: number) => 28 * (0.5 + 0.5 * ((z + 260) / 400));
    // point-defence turrets along the outer flank, sitting on the plating
    for (const z of [-230, -170, -110, -50, 10, 70, 130]) {
      const pd = v3(x + s * (hw(z) + 2.2), 6, z);
      b.sphere(pd, 3, style.dark, { detail: 1, collide: false });
      b.cylinder(pd.clone().add(v3(0, 0.8, -3.5)), 0.35, 6, '#3a3e52', { quat: X90, sides: 6, collide: false });
    }
    // outer armour belt following the taper, and lit bay doors on the inner face
    const belt: THREE.Vector3[] = [];
    for (const z of [-190, 110]) for (const dx of [-0.6, 3]) for (const y of [-17, 5]) belt.push(v3(x + s * (hw(z) + dx), y, z));
    b.hull(belt, style.trim);
    for (const z of [-140, -80, -20, 40]) lights(b, v3(x - s * (hw(z) + 0.2), -4, z), v3(0.3, 10, 22), style.light, 1.3);
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
  for (const s of [1, -1]) {
    // flank guns stand on the prong's back near its outer edge (the prong tapers and slopes towards the bow)
    for (const z of [-240, -160, -80, 0, 80]) {
      const t = (z + 260) / 400;
      const half = 28 * (0.5 + 0.5 * t);
      const top = 22 * (0.55 + 0.45 * t);
      turrets.push({ pos: v3(s * (72 + half * 0.72), top + 5.5, z), heavy: false });
    }
    for (const z of [-180, -20]) turrets.push({ pos: v3(s * 72, 36, z), heavy: false });
  }
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

/**
 * Reaver, ~310 m: the Red Wake's first capital ship, put together in the Gallows from a captured
 * ore hauler. The hauler's boxy spine is still there under armour plates of three different
 * colours; a welded ram with two hooked jaws at the bow; gun decks where the ore pods were; a
 * bridge bolted on off-centre; bare frames aft where the plating ran out; three engines that
 * do not match. Raiders launch from the belly.
 */
export function buildReaver(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  const raw = '#7a7f8c';
  const rust = '#8a4a2a';
  const rotY = (a: number) => new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), a);
  // the hauler's spine (x 18, y 15 half-sizes, z -80..100)
  b.bevel(v3(0, 0, 10), v3(36, 30, 180), 3, style.hull);
  lights(b, v3(0, 15.1, -8), v3(2, 0.3, 10), style.light, 1.6);
  // the ram, and two long hooked jaws on hinge blocks at the spine's front corners
  b.bevel(v3(0, -3, -112), v3(34, 28, 66), 3, style.dark, { front: [0.15, 0.3], lift: -3 });
  for (const s of [1, -1]) {
    const a = s * 0.22;
    const c = v3(s * 15, -6, -118);
    b.bevel(c, v3(8, 14, 84), 1.2, style.trim, { quat: rotY(a), front: [0.2, 0.35] });
    b.bevel(v3(s * 20, -6, -78), v3(10, 16, 16), 1.5, raw);
    const along = v3(-Math.sin(a), 0, -Math.cos(a));
    const inward = v3(-s * Math.cos(a), 0, s * Math.sin(a));
    for (const t of [-14, 2, 18]) {
      const p = c.clone().addScaledVector(along, t).addScaledVector(inward, 3.6);
      b.hull([p.clone().addScaledVector(along, 3), p.clone().addScaledVector(along, -3), p.clone().addScaledVector(inward, 6).addScaledVector(along, 2), p.clone().add(v3(0, 2.5, 0)), p.clone().add(v3(0, -2.5, 0))], raw);
    }
    beacons.push({ position: c.clone().addScaledVector(along, 41).add(v3(0, 3, 0)), color: new THREE.Color('#ff2040'), phase: s });
    // red eyes either side of the ram's point
    lights(b, v3(s * 3.2, -4, -142), v3(2.4, 1.6, 2), '#ff2a3a', 2.6);
  }
  // a hooked keel blade under the bow, and a lopsided blade fin on the back
  b.hull([v3(0, -15, -80), v3(0, -15, -40), v3(0, -36, -72), v3(0, -30, -98)].flatMap((p) => [p.clone().add(v3(1.2, 0, 0)), p.clone().add(v3(-1.2, 0, 0))]), style.trim);
  b.hull([v3(-8, 15, 56), v3(-8, 15, 98), v3(-8, 50, 110), v3(-8, 40, 86)].flatMap((p) => [p.clone().add(v3(1.4, 0, 0)), p.clone().add(v3(-1.4, 0, 0))]), style.hull);
  lights(b, v3(-8, 44, 99), v3(3.4, 1, 6), style.light, 1.8);
  // armour bolted down the flanks, no two plates alike
  const plates = [style.dark, raw, rust, style.hull, raw];
  [-60, -24, 12, 48, 84].forEach((z, i) => {
    for (const s of [1, -1]) {
      const tilt = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), ((i + (s > 0 ? 0 : 1)) % 2 ? 1 : -1) * 0.05);
      b.box(v3(s * 19, i % 2 ? 3 : -2, z), v3(2.6, 20, 30), plates[(i + (s > 0 ? 0 : 2)) % plates.length], { quat: tilt });
    }
  });
  // gun decks where the ore pods were
  b.bevel(v3(0, 18, -40), v3(24, 6, 30), 1.5, style.dark);
  b.bevel(v3(0, 18, 32), v3(28, 6, 40), 1.5, style.dark);
  for (const z of [-40, 32]) lights(b, v3(0, 21.1, z), v3(14, 0.3, 1), style.trim, 1.4);
  // sponsons with a gun each
  for (const s of [1, -1]) b.bevel(v3(s * 24, -2, 0), v3(12, 8, 22), 1.5, style.dark, { front: [0.8, 0.8] });
  // the bridge, bolted on to starboard
  b.bevel(v3(10, 24, 66), v3(12, 18, 20), 1.5, style.dark, { front: [0.8, 0.8] });
  lights(b, v3(10, 29, 55.8), v3(8, 1.2, 0.3), style.light, 2);
  b.strut(v3(13, 33, 70), v3(13, 52, 72), 0.6, style.dark, { collide: false });
  beacons.push({ position: v3(13, 52.8, 72), color: new THREE.Color('#ff2040'), phase: 0 });
  // bare frames aft, where the plating ran out
  b.bevel(v3(0, 0, 118), v3(20, 18, 36), 2, style.dark);
  for (const z of [106, 118, 130]) {
    const c = [v3(-17, 14, z), v3(17, 14, z), v3(17, -14, z), v3(-17, -14, z)];
    for (let k = 0; k < 4; k++) b.strut(c[k], c[(k + 1) % 4], 1.2, raw, { sides: 4 });
  }
  for (const [x, y] of [
    [-17, 14],
    [17, 14],
    [17, -14],
    [-17, -14],
  ] as const)
    b.strut(v3(x, y, 99), v3(x, y, 136), 1, raw, { sides: 4 });
  // engine block and three engines that do not match
  b.bevel(v3(0, 0, 142), v3(36, 30, 14), 2, style.hull);
  engine(b, v3(-9, 5, 155), 8, 14, style);
  engine(b, v3(10, 3, 154), 6, 12, style);
  engine(b, v3(2, -10, 153), 4.5, 10, style);
  // the belly hangar and its launch doors
  b.bevel(v3(0, -19, 0), v3(26, 8, 70), 1.5, style.dark);
  for (let z = -30; z <= 30; z += 10) lights(b, v3(0, -23.1, z), v3(10, 0.3, 1.2), '#ffd030', 1.5);
  for (const s of [1, -1]) for (const z of [-10, 10]) lights(b, v3(s * 13.1, -19, z), v3(0.3, 5, 12), '#ffd030', 1.4);

  const turrets: TurretMount[] = [
    { pos: v3(0, 23, -70), heavy: true },
    { pos: v3(-6, 23, 88), heavy: true },
  ];
  for (const s of [1, -1]) {
    turrets.push({ pos: v3(s * 8, 30, -40), heavy: false }, { pos: v3(s * 9, 30, 32), heavy: false }, { pos: v3(s * 24, 11, 0), heavy: false });
  }
  const r = finish(b, world, transform, 'reaver', {
    beacons,
    turrets,
    bays: [1, -1].flatMap((s) => [-10, 10].map((z) => ({ pos: v3(s * 17, -21, z), out: v3(s, -0.4, 0).normalize() }))),
    docks: [],
    points: { center: v3(0, 0, 0), bow: v3(0, 0, -150), stern: v3(0, 0, 160) },
  });
  for (const s of [1, -1]) r.group.add(placeHologram(createHologram(style.signs, style.signColor, 56, 40 + s), v3(s * 21.5, 3, -24), v3(s, 0, 0)));
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
    case 'reaver':
      return buildReaver(world, transform, style);
  }
}
