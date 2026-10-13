import * as THREE from 'three';
import type { CollisionWorld } from './colliders';
import { buildAsteroids, buildCarrier, buildKestrelStation, type Beacon, type DockSpec, type Spinner } from './structures';
import { buildGallows } from './gallows';
import { buildAshfall } from './ashfall';
import { buildVantage } from './vantage';
import { buildHaven } from './haven';
import { buildBastion } from './bastion';
import { buildRookery } from './rookery';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A civilian route flown in a loop. */
export interface TrafficRoute {
  name: string;
  /** Ship class (default: the Drift bulk hauler). */
  cls?: string;
  points: THREE.Vector3[];
  speed: number;
}

/** Everything a mission flies around in: geometry, lights, landing bays and named points. */
export interface Location {
  id: string;
  name: string;
  group: THREE.Group;
  beacons: Beacon[];
  spinners: Spinner[];
  docks: DockSpec[];
  /** Named world-space points for missions and AI ("station.hub", "carrier.center", ...). */
  points: Record<string, THREE.Vector3>;
  traffic: TrafficRoute[];
  /** Where the player starts by default, and what they look at. */
  start: { pos: THREE.Vector3; look: THREE.Vector3 };
  /** Warn beyond `warn` metres from `center`, damage beyond `limit`. */
  arena: { center: THREE.Vector3; warn: number; limit: number };
  /** Title-screen orbit around this point. */
  orbit: { center: THREE.Vector3; radius: number; height: number };
  /** Local frames of big structures, for placing things relative to them (the carrier). */
  frames: Record<string, THREE.Matrix4>;
}

type Builder = (world: CollisionWorld) => Location;

function merge(id: string, name: string, parts: { group: THREE.Group; beacons: Beacon[]; spinners?: Spinner[]; docks?: DockSpec[]; points: Record<string, THREE.Vector3> }[], prefixes: string[]): Pick<Location, 'id' | 'name' | 'group' | 'beacons' | 'spinners' | 'docks' | 'points'> {
  const group = new THREE.Group();
  const out = { id, name, group, beacons: [] as Beacon[], spinners: [] as Spinner[], docks: [] as DockSpec[], points: {} as Record<string, THREE.Vector3> };
  parts.forEach((p, i) => {
    group.add(p.group);
    out.beacons.push(...p.beacons);
    out.spinners.push(...(p.spinners ?? []));
    out.docks.push(...(p.docks ?? []));
    for (const [k, pt] of Object.entries(p.points)) out.points[`${prefixes[i]}.${k}`] = pt;
  });
  return out;
}

/** The carrier's pose at Kestrel (also used to place it at the Gallows). */
export function carrierAt(pos: THREE.Vector3, yaw: number, pitch = 0.05, roll = 0.02): THREE.Matrix4 {
  return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll)), v(1, 1, 1));
}

const kestrel: Builder = (world) => {
  const station = buildKestrelStation(world);
  const carrierFrame = carrierAt(v(1250, 140, -650), 0.9);
  const carrier = buildCarrier(world, carrierFrame);
  const rocks = buildAsteroids(world, v(-1200, -120, 650), 420, 46);
  return {
    ...merge('kestrel', 'Kestrel Station', [station, carrier, rocks], ['station', 'carrier', 'rocks']),
    traffic: [
      {
        name: 'Bulk Hauler Ostrava',
        points: [v(800, -120, 0), v(560, -60, 560), v(0, -20, 800), v(-560, -60, 560), v(-800, -120, 0), v(-560, -180, -560), v(0, -220, -800), v(560, -180, -560)],
        speed: 35,
      },
      {
        name: 'Container ship Halvard',
        cls: 'container',
        points: [v(2200, -400, 1600), v(600, -380, 1900), v(-1400, -300, 1500), v(-2100, -350, -200), v(-600, -420, -1900), v(1500, -420, -1500)],
        speed: 30,
      },
      {
        name: 'Ore barge Pell',
        cls: 'miner',
        points: [v(-1500, -160, 900), v(-900, -60, 300), v(-1000, -200, 1100)],
        speed: 18,
      },
      {
        name: 'Bulk Hauler Morrigan',
        points: [v(-1400, 300, -400), v(-600, 260, -1000), v(500, 200, -1150), v(1050, 120, -250), v(500, 150, 750), v(-300, 250, 1000)],
        speed: 35,
      },
    ],
    start: { pos: v(140, 60, 560), look: v(0, 40, 0) },
    arena: { center: v(0, 0, 0), warn: 3200, limit: 4000 },
    orbit: { center: v(0, 60, 0), radius: 900, height: 180 },
    frames: { carrier: carrierFrame },
  };
};

const gallows: Builder = (world) => {
  const base = buildGallows(world);
  // the Combine carrier holds station 2.4 km out, broadside to the base
  const carrierFrame = carrierAt(v(-300, 120, 2400), Math.PI / 2 + 0.25, 0, 0);
  const carrier = buildCarrier(world, carrierFrame);
  return {
    ...merge('gallows', 'The Gallows', [base, carrier], ['gallows', 'carrier']),
    traffic: [],
    start: { pos: v(0, 150, 2000), look: v(0, 0, 0) },
    arena: { center: v(0, 0, 900), warn: 3600, limit: 4400 },
    orbit: { center: v(0, 0, 0), radius: 1100, height: 220 },
    frames: { carrier: carrierFrame },
  };
};

const ashfall: Builder = (world) => {
  const field = buildAshfall(world);
  // the capital ships (the Combine carrier at the origin, the Drift battlecruiser 4.5 km off
  // its bow) are spawned by the mission, since they move and shoot
  return {
    ...merge('ashfall', 'The Ashfall', [field], ['ashfall']),
    traffic: [],
    start: { pos: v(260, 40, 2600), look: v(0, -10, 260) },
    arena: { center: v(0, 0, -1500), warn: 5200, limit: 6200 },
    orbit: { center: v(0, 0, -2200), radius: 1600, height: 300 },
    frames: {},
  };
};

const vantage: Builder = (world) => {
  const station = buildVantage(world);
  return {
    ...merge('vantage', 'Vantage Station', [station], ['vantage']),
    traffic: [],
    start: { pos: v(-500, 160, -900), look: v(0, 0, 0) },
    arena: { center: v(0, 0, 0), warn: 3400, limit: 4200 },
    orbit: { center: v(0, 0, 0), radius: 1000, height: 220 },
    frames: {},
  };
};

const haven: Builder = (world) => {
  const station = buildHaven(world);
  return {
    ...merge('haven', 'Haven', [station], ['haven']),
    traffic: [
      {
        name: 'Ore barge Quill',
        cls: 'miner',
        points: [v(900, -300, -600), v(1300, -200, 300), v(800, -380, 900), v(400, -420, -200)],
        speed: 20,
      },
      {
        name: 'Container ship Odile',
        cls: 'container',
        points: [v(-1500, 500, -1200), v(-1800, 400, 600), v(-700, 600, 1500), v(-400, 650, -1400)],
        speed: 28,
      },
    ],
    start: { pos: v(0, 260, 2300), look: v(0, 0, 0) },
    arena: { center: v(0, 0, 900), warn: 3800, limit: 4600 },
    orbit: { center: v(0, 0, 0), radius: 1200, height: 260 },
    frames: {},
  };
};

const bastion: Builder = (world) => {
  const station = buildBastion(world);
  return {
    ...merge('bastion', 'Bastion', [station], ['bastion']),
    traffic: [
      {
        name: 'Liner Aurelian Dawn',
        cls: 'liner',
        points: [v(2400, 600, -1800), v(-2200, 650, -1600), v(-2400, 500, 1600), v(2200, 550, 1800)],
        speed: 40,
      },
    ],
    start: { pos: v(0, 220, 2300), look: v(0, 0, 0) },
    arena: { center: v(0, 0, 900), warn: 3800, limit: 4600 },
    orbit: { center: v(0, 60, 0), radius: 1300, height: 300 },
    frames: {},
  };
};

const rookery: Builder = (world) => {
  const den = buildRookery(world);
  return {
    ...merge('rookery', 'The Rookery', [den], ['rookery']),
    traffic: [],
    start: { pos: v(0, 160, 2000), look: v(0, 0, 0) },
    arena: { center: v(0, 0, 600), warn: 3600, limit: 4400 },
    orbit: { center: v(0, 40, 0), radius: 900, height: 220 },
    frames: {},
  };
};

export const LOCATIONS: Record<string, Builder> = { kestrel, gallows, ashfall, vantage, haven, bastion, rookery };
