import * as THREE from 'three';
import { StructureBuilder, v3 } from './builder';
import { CapsuleCollider, CollisionWorld, SphereCollider } from './colliders';
import { SeededRandom } from '../core/math';
import { createHologram, placeHologram } from './holograms';

const Y = new THREE.Vector3(0, 1, 0);
const quatY = (angle: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(Y, angle);
const quatX90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

export interface Beacon {
  /** World position, or local to `parent` when set. */
  position: THREE.Vector3;
  color: THREE.Color;
  phase: number;
  parent?: THREE.Object3D;
  /** 'chase' lights run in sequence along docking arms. */
  kind?: 'blink' | 'chase';
}

export interface Spinner {
  object: THREE.Object3D;
  /** Radians per second about the object's local Y axis. */
  speed: number;
}

/**
 * A place to land. Positions are world space (or local to `parent` when it moves). Ships fly in
 * along -outward, through the mouth, and settle on the pad.
 */
export interface DockSpec {
  id: string;
  name: string;
  pad: THREE.Vector3;
  /** Unit vector from the pad out through the bay mouth. */
  outward: THREE.Vector3;
  up: THREE.Vector3;
  /** Distance from the pad to the mouth. */
  mouth: number;
  /** Half-size of the bay opening (width, height), for the guide rings. */
  opening: [number, number];
  maxSpeed: number;
  parent?: THREE.Object3D;
}

/** Colours and markings for a capital ship hull. */
export interface CapitalStyle {
  hull: string;
  trim: string;
  dark: string;
  light: string;
  signs: string[];
  signColor: string;
  /** Dock id prefix and display name ("carrier" / "Sovereign Dawn"). */
  id: string;
  name: string;
  /** Drift ships wear big rings round their spines. */
  rings?: boolean;
}

export const COMBINE_STYLE: CapitalStyle = {
  hull: '#ece6da',
  trim: '#e0a83c',
  dark: '#2b2f45',
  light: '#5fe8ff',
  signs: ['HELION COMBINE', 'A BRIGHTER TOMORROW, ON SCHEDULE'],
  signColor: '#ffe7a8',
  id: 'carrier',
  name: 'Sovereign Dawn',
};

/** A gun position on a capital ship, local to its frame. */
export interface TurretMount {
  pos: THREE.Vector3;
  heavy: boolean;
}

export interface StructureResult {
  group: THREE.Group;
  /** Gun positions (capital ships), in the same space as `points`. */
  turrets?: TurretMount[];
  /** Fighter launch points and their launch directions. */
  bays?: { pos: THREE.Vector3; out: THREE.Vector3 }[];
  beacons: Beacon[];
  /** Named waypoints (world space) used by AI and missions. */
  points: Record<string, THREE.Vector3>;
  spinners?: Spinner[];
  docks?: DockSpec[];
}

/**
 * Kestrel Station: a hub with a habitat ring, spokes, two long lattice towers (the
 * "tunnel run"), solar wings and docking arms. Gaps are sized so a fighter fits but only just.
 */
export function buildKestrelStation(world: CollisionWorld): StructureResult {
  const b = new StructureBuilder();
  const rng = new SeededRandom(1337);
  const beacons: Beacon[] = [];

  const teal = '#23a99b';
  const cream = '#efe2c8';
  const orange = '#ff7a35';
  const magenta = '#ff3d8b';
  const yellow = '#ffc93a';
  const white = '#e9ecf5';
  const indigo = '#3626c9';

  // --- Hub ---------------------------------------------------------------------------------
  b.cylinder(v3(0, 0, 0), 40, 150, teal, { sides: 20, collide: false });
  b.sphere(v3(0, 75, 0), 40, teal, { detail: 2, collide: false });
  b.sphere(v3(0, -75, 0), 40, teal, { detail: 2, collide: false });
  b.addCollider(new CapsuleCollider(v3(0, -75, 0), v3(0, 75, 0), 40));
  for (const y of [-52, -18, 18, 52]) {
    b.torus(v3(0, y, 0), 41, 1.4, '#5ff2ff', { quat: quatX90, glow: 1.6, tubular: 40 });
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (const y of [-35, 0, 35]) {
      const p = v3(Math.cos(a) * 40.2, y, Math.sin(a) * 40.2);
      b.box(p, v3(0.6, 5, 6), '#ffe08a', { quat: quatY(-a), glow: 1.6, collide: false });
    }
  }
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2);
    const y = rng.range(-70, 70);
    const p = v3(Math.cos(a) * 41, y, Math.sin(a) * 41);
    b.box(p, v3(rng.range(2, 5), rng.range(3, 9), rng.range(3, 9)), rng.pick([cream, '#1b6f69', orange]), {
      quat: quatY(-a),
      collide: false,
    });
  }


  // --- Docking bay on the hub, above the sweep of the spokes ----------------------------------
  const bayDir = v3(0.97, 0, -0.24).normalize();
  const bayA = Math.atan2(bayDir.z, bayDir.x);
  const baySide = v3(-bayDir.z, 0, bayDir.x);
  const bayY = 64;
  const bq = quatY(-bayA);
  const at = (r: number, y: number, sd: number) => bayDir.clone().multiplyScalar(r).addScaledVector(baySide, sd).setY(bayY + y);
  const bayIn = 36;
  const bayOut = 132;
  const bayLen = bayOut - bayIn;
  const bayMid = (bayIn + bayOut) / 2;
  b.box(at(bayMid, -19, 0), v3(bayLen, 4, 66), '#2b2f45', { quat: bq });
  b.box(at(bayMid, 19, 0), v3(bayLen, 4, 66), teal, { quat: bq });
  for (const sd of [-1, 1]) b.box(at(bayMid, 0, sd * 33), v3(bayLen, 42, 4), cream, { quat: bq });
  b.box(at(bayIn - 2, 0, 0), v3(4, 42, 66), '#1b6f69', { quat: bq });
  // frame, lights and the landing pad
  for (const sd of [-1, 1]) b.box(at(bayOut, 0, sd * 31.5), v3(3, 38, 2), yellow, { quat: bq, glow: 1.5, collide: false });
  b.box(at(bayOut, 16.8, 0), v3(3, 1, 62), yellow, { quat: bq, glow: 1.5, collide: false });
  b.box(at(bayOut, -16.8, 0), v3(3, 1, 62), yellow, { quat: bq, glow: 1.5, collide: false });
  for (let r = bayIn + 8; r < bayOut; r += 12) {
    b.box(at(r, 16.6, 0), v3(1.2, 0.4, 50), '#dff4ff', { quat: bq, glow: 1.4, collide: false });
    for (const sd of [-1, 1]) b.box(at(r, -16.7, sd * 9), v3(4, 0.3, 0.8), '#5fe8ff', { quat: bq, glow: 1.6, collide: false });
  }
  b.cylinder(at(70, -16.8, 0), 12, 0.4, '#5fe8ff', { sides: 32, glow: 1.2, collide: false });
  b.cylinder(at(70, -16.7, 0), 10.5, 0.45, '#2b2f45', { sides: 32, collide: false });
  for (let k = 0; k < 8; k++) {
    for (const sd of [-1, 1]) {
      beacons.push({ position: at(bayOut + 8 + k * 14, -17, sd * 30), color: new THREE.Color('#5fe8ff'), phase: 8 - k, kind: 'chase' });
    }
  }
  const bayPad = at(70, -12.5, 0);

  // Everything from here to the towers rotates slowly for spin gravity, so it is built separately
  // and attached to the collision world as a moving sub-world.
  const rb = new StructureBuilder();
  const ringBeacons: Beacon[] = [];

  // --- Habitat ring --------------------------------------------------------------------------
  const R = 260;
  const segs = 28;
  const segLen = ((2 * Math.PI * R) / segs) * 1.04;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = v3(Math.cos(a) * R, 0, Math.sin(a) * R);
    const q = quatY(-a);
    rb.box(c, v3(30, 22, segLen), i % 2 === 0 ? cream : orange, { quat: q });
    // windows on the outer and inner faces
    for (const side of [1, -1]) {
      const wp = v3(Math.cos(a) * (R + side * 15.3), 4, Math.sin(a) * (R + side * 15.3));
      rb.box(wp, v3(0.4, 3, segLen * 0.75), '#ffd27a', { quat: q, glow: 1.5, collide: false });
      const wp2 = v3(Math.cos(a) * (R + side * 15.3), -4, Math.sin(a) * (R + side * 15.3));
      rb.box(wp2, v3(0.4, 1.5, segLen * 0.6), '#7ff6ff', { quat: q, glow: 1.3, collide: false });
    }
    // roof greebles
    rb.box(v3(Math.cos(a) * R, 12, Math.sin(a) * R), v3(18, 2, segLen * 0.5), '#2b2f45', { quat: q, collide: false });
    if (i % 4 === 0) {
      rb.sphere(v3(Math.cos(a) * R, 20, Math.sin(a) * R), 11, i % 8 === 0 ? magenta : '#3fd0ff', { detail: 1 });
    }
    if (i % 2 === 1) {
      const bp = v3(Math.cos(a) * (R + 16), 12, Math.sin(a) * (R + 16));
      ringBeacons.push({ position: bp, color: new THREE.Color(i % 4 === 1 ? '#ff2040' : '#30ff70'), phase: i * 0.37 });
    }
  }

  // --- Spokes with bracing (gaps to thread) --------------------------------------------------
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const inner = dir.clone().multiplyScalar(38);
    const outer = dir.clone().multiplyScalar(R - 14);
    rb.strut(inner, outer, 6, white, { sides: 10 });
    // rails sit well clear of the spoke so the gaps are flyable at speed
    const up = v3(0, 34, 0);
    rb.strut(inner.clone().add(up), outer.clone().add(up), 2, magenta);
    rb.strut(inner.clone().sub(up), outer.clone().sub(up), 2, magenta);
    for (const k of [1, 3]) {
      const t0 = 38 + ((R - 52) * k) / 4;
      const p = dir.clone().multiplyScalar(t0);
      const p2 = dir.clone().multiplyScalar(t0 + (R - 52) / 8);
      rb.strut(p.clone().add(up), p2, 1.4, yellow);
      rb.strut(p.clone().sub(up), p2, 1.4, yellow);
    }
    rb.strut(outer.clone().add(up), outer.clone().add(v3(0, 11, 0)), 2, magenta);
    rb.strut(outer.clone().sub(up), outer.clone().sub(v3(0, 11, 0)), 2, magenta);
  }

  // --- Docking arms ------------------------------------------------------------------------
  for (const a of [0.2, 2.3, 4.4]) {
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const start = dir.clone().multiplyScalar(R + 15);
    const end = dir.clone().multiplyScalar(R + 120);
    rb.strut(start, end, 4, '#c7cde0', { sides: 8 });
    const side = v3(-dir.z, 0, dir.x);
    const cradle = end.clone();
    rb.box(cradle, v3(44, 6, 50), '#2b2f45', { quat: quatY(-a) });
    for (const s of [1, -1]) {
      const wall = cradle.clone().addScaledVector(side, s * 24).add(v3(0, 12, 0));
      rb.box(wall, v3(40, 20, 3), orange, { quat: quatY(-a) });
      ringBeacons.push({
        position: wall.clone().add(v3(0, 11, 0)),
        color: new THREE.Color('#ffb020'),
        phase: a + s,
      });
    }
    rb.box(cradle.clone().add(v3(0, 3.5, 0)), v3(20, 0.6, 20), '#5fe8ff', { quat: quatY(-a), glow: 1.6, collide: false });
    // approach lights that run outwards in sequence along the arm
    for (let k = 0; k < 9; k++) {
      const lp = dir.clone().multiplyScalar(R + 22 + k * 11).add(v3(0, 5, 0));
      for (const s of [1, -1]) {
        ringBeacons.push({
          position: lp.clone().addScaledVector(side, s * 5),
          color: new THREE.Color('#5fe8ff'),
          phase: k,
          kind: 'chase',
        });
      }
    }
  }

  // --- Lattice towers (fly inside them) -------------------------------------------------------
  const db = new StructureBuilder();
  // 64 m square section, 44 m between levels: roomy enough to fly through at full speed
  const h = 32;
  const step = 44;
  for (const sign of [1, -1]) {
    const y0 = sign * 108;
    const levels = 8;
    const corners = [v3(h, 0, h), v3(-h, 0, h), v3(-h, 0, -h), v3(h, 0, -h)];
    const yAt = (k: number) => y0 + sign * k * step;
    for (const c of corners) {
      b.strut(v3(c.x, yAt(0), c.z), v3(c.x, yAt(levels), c.z), 2.6, yellow, { sides: 6 });
    }
    // collar joining the tower to the hub dome
    b.box(v3(0, y0, 0), v3(h * 2 + 6, 5, h * 2 + 6), '#2b2f45');
    for (let k = 0; k <= levels; k++) {
      for (let j = 0; j < 4; j++) {
        const c1 = corners[j];
        const c2 = corners[(j + 1) % 4];
        b.strut(v3(c1.x, yAt(k), c1.z), v3(c2.x, yAt(k), c2.z), 1.4, white, { sides: 5 });
        if (k < levels && k % 3 === 0) {
          const flip = (k + j) % 2 === 0;
          const a1 = flip ? c1 : c2;
          const a2 = flip ? c2 : c1;
          b.strut(v3(a1.x, yAt(k), a1.z), v3(a2.x, yAt(k + 1), a2.z), 1.1, magenta, { sides: 5 });
        }
      }
      if (k % 3 === 0) {
        for (const c of corners) {
          beacons.push({
            position: v3(c.x * 1.08, yAt(k), c.z * 1.08),
            color: new THREE.Color(sign > 0 ? '#3fe0ff' : '#ff4fa0'),
            phase: k * 0.5 + c.x * 0.01,
          });
        }
      }
    }

    // Solar wings at two heights, crossing at right angles
    for (const [yk, alongX] of [
      [3.5, true],
      [6.5, false],
    ] as const) {
      const y = yAt(yk);
      for (const s of [1, -1]) {
        const dir = alongX ? v3(s, 0, 0) : v3(0, 0, s);
        const boomStart = dir.clone().multiplyScalar(h).setY(y);
        const boomEnd = dir.clone().multiplyScalar(300).setY(y);
        b.strut(boomStart, boomEnd, 2.6, '#c7cde0', { sides: 6 });
        for (let p = 0; p < 3; p++) {
          const along = 80 + p * 84;
          for (const off of [42, -42]) {
            const center = dir.clone().multiplyScalar(along).setY(y);
            if (alongX) center.z += off;
            else center.x += off;
            const size = alongX ? v3(54, 1.2, 36) : v3(36, 1.2, 54);
            b.box(center, size, indigo);
            b.box(center.clone().setY(y + 0.7), alongX ? v3(54, 0.3, 1) : v3(1, 0.3, 54), '#8a7dff', {
              glow: 1.8,
              collide: false,
            });
          }
        }
      }
    }

    // Tip: comms dish on top, caged reactor below
    const tip = yAt(levels);
    if (sign > 0) {
      for (const c of corners) b.strut(v3(c.x, tip, c.z), v3(0, tip + 50, 0), 1.8, white);
      // rotating sensor dish with a sweeping radar boom
      db.cylinder(v3(0, tip + 52, 0), 46, 4, cream, { sides: 24, radiusTop: 34 });
      db.sphere(v3(0, tip + 60, 0), 4, '#ff2050', { glow: 3, collide: false });
      db.box(v3(38, tip + 57, 0), v3(66, 3, 4), '#2b2f45');
      db.box(v3(72, tip + 60, 0), v3(6, 9, 10), orange);
      db.sphere(v3(75.5, tip + 60, 0), 1.6, '#ff2050', { glow: 3, collide: false });
      db.box(v3(-30, tip + 56, 0), v3(10, 6, 10), magenta);
    } else {
      b.sphere(v3(0, tip - 60, 0), 22, '#ff9a2a', { detail: 2, glow: 2.2 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.strut(
          v3(Math.cos(a) * 42, tip, Math.sin(a) * 42),
          v3(Math.cos(a) * 52, tip - 60, Math.sin(a) * 52),
          2,
          '#2b2f45',
        );
        b.strut(
          v3(Math.cos(a) * 52, tip - 60, Math.sin(a) * 52),
          v3(Math.cos(a) * 26, tip - 100, Math.sin(a) * 26),
          2,
          '#2b2f45',
        );
      }
    }
  }

  world.addAll(b.colliders);
  const group = b.build('kestrel-station');

  const ring = rb.build('habitat-ring');
  group.add(ring);
  const ringWorld = new CollisionWorld();
  ringWorld.addAll(rb.colliders);
  world.attach(ringWorld, ring);
  for (const bc of ringBeacons) bc.parent = ring;
  const ringSigns: [string[], string, number][] = [
    [['KESTREL STATION', 'FUEL · REPAIRS · NO QUESTIONS'], '#5ff2ff', 1.35],
    [['HELIOS FIZZ', 'TASTES LIKE A SOLAR FLARE'], '#ff4fd8', 3.15],
    [['DOCKING LANE 4', 'SPEED LIMIT 40 M/S'], '#ffd84d', 5.83],
  ];
  ringSigns.forEach(([lines, color, a], i) => {
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    ring.add(placeHologram(createHologram(lines, color, 72, i), dir.clone().multiplyScalar(R).setY(34), dir));
  });
  const hubDir = v3(0.24, 0, 0.97).normalize();
  group.add(placeHologram(createHologram(['WELCOME TO THE VEIL REACH'], '#4dfcd2', 64, 7), hubDir.clone().multiplyScalar(47), hubDir));
  group.add(placeHologram(createHologram(['DOCKING BAY 1'], '#ffd84d', 40, 9), at(bayOut + 2, 27, 0), bayDir));

  const dish = db.build('sensor-dish');
  group.add(dish);
  const dishWorld = new CollisionWorld();
  dishWorld.addAll(db.colliders);
  world.attach(dishWorld, dish);

  return {
    group,
    spinners: [
      { object: ring, speed: 0.045 },
      { object: dish, speed: 0.35 },
    ],
    beacons: [...beacons, ...ringBeacons],
    points: {
      hub: v3(0, 0, 0),
      towerTop: v3(0, 400, 0),
      towerBottom: v3(0, -400, 0),
      ring: v3(R, 0, 0),
      bay: bayPad.clone(),
    },
    docks: [
      {
        id: 'kestrel.bay1',
        name: 'Kestrel Station, bay 1',
        pad: bayPad,
        outward: bayDir.clone(),
        up: v3(0, 1, 0),
        mouth: bayOut - 70,
        opening: [30, 16],
        maxSpeed: 45,
      },
    ],
  };
}

/**
 * Sovereign Dawn: a Helion Combine carrier. Broadside hangar tunnel, open cargo spine and a
 * massive engine block. Built in its own local frame (nose towards -Z) and placed by `transform`.
 */
/**
 * Battlecruiser (the Sovereign Dawn's class, about 820 m): stepped prow, a broadside hangar
 * tunnel, an open cargo spine, an engineering block with four engines, and heavy gun barbettes
 * along the prow. Built in its own frame (nose towards -Z) and placed by `transform`.
 */
export function buildCarrier(world: CollisionWorld, transform: THREE.Matrix4, style: CapitalStyle = COMBINE_STYLE): StructureResult {
  const b = new StructureBuilder(transform);
  const beacons: Beacon[] = [];
  const ivory = style.hull;
  const gold = style.trim;
  const dark = style.dark;
  const cyan = style.light;
  const turrets: TurretMount[] = [];

  // Bladed prow: a long tapered wedge, layered with armour decks
  b.bevel(v3(0, -2, -330), v3(92, 38, 170), 6, ivory, { front: [0.22, 0.32], lift: -5 });
  b.bevel(v3(0, 18, -300), v3(62, 8, 140), 3, gold, { front: [0.3, 0.6] });
  b.bevel(v3(0, -22, -310), v3(40, 8, 130), 3, dark, { front: [0.3, 0.5], collide: false });
  b.bevel(v3(0, 0, -200), v3(104, 56, 100), 8, ivory, { front: [0.88, 0.8] });
  b.bevel(v3(0, 30, -205), v3(70, 6, 80), 2.5, dark, { front: [0.7, 1] });
  for (const s of [1, -1]) {
    // angled cheek plates down the prow
    b.bevel(v3(s * 44, -6, -260), v3(6, 26, 120), 2, gold, { quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), s * 0.5), front: [0.5, 0.4], collide: false });
    b.box(v3(s * 30, 8, -330), v3(0.3, 0.8, 90), cyan, { glow: 1.5, collide: false });
  }

  // Hangar block with a broadside tunnel (80 x 50 opening) running along X
  const hx = 70;
  b.bevel(v3(0, 0, -147.5), v3(hx * 2, 110, 65), 8, ivory, { front: [0.92, 0.9] });
  b.bevel(v3(0, 0, -7.5), v3(hx * 2, 110, 55), 8, ivory);
  b.box(v3(0, 40, -75), v3(hx * 2, 30, 80), ivory);
  b.box(v3(0, -40, -75), v3(hx * 2, 30, 80), ivory);
  // layered dorsal deck over the hangar
  b.bevel(v3(0, 62, -80), v3(104, 14, 170), 4, gold, { front: [0.7, 1], back: [0.85, 1] });
  b.bevel(v3(0, 72, -70), v3(60, 8, 110), 3, dark, { front: [0.6, 1] });
  for (const z of [-114.4, -35.6]) {
    b.box(v3(0, -24.6, z), v3(hx * 2, 0.4, 1), cyan, { glow: 2, collide: false });
    b.box(v3(0, 24.6, z), v3(hx * 2, 0.4, 1), '#ffb030', { glow: 1.8, collide: false });
  }
  for (const s of [1, -1]) {
    // lit frame round the tunnel mouth (the opening itself stays clear)
    b.box(v3(s * (hx + 0.3), 25.6, -75), v3(0.6, 1.2, 82), cyan, { glow: 1.6, collide: false });
    b.box(v3(s * (hx + 0.3), -25.6, -75), v3(0.6, 1.2, 82), cyan, { glow: 1.6, collide: false });
    for (const z of [-115.6, -34.4]) b.box(v3(s * (hx + 0.3), 0, z), v3(0.6, 52, 1.2), cyan, { glow: 1.6, collide: false });
    for (const z of [-120, -30]) {
      beacons.push({ position: v3(s * (hx + 2), 0, z), color: new THREE.Color('#30ff70'), phase: z * 0.02 + s });
    }
  }
  // gold racing stripes along the flanks
  for (const s of [1, -1]) {
    b.box(v3(s * 52.3, 8, -200), v3(0.6, 6, 96), gold, { collide: false });
    b.box(v3(s * (hx + 0.3), 48, -80), v3(0.6, 5, 190), gold, { collide: false });
  }

  // Armoured midsection: a stepped warship hull with gun decks, sponsons and the main battery
  b.bevel(v3(0, 0, 135), v3(124, 92, 236), 12, ivory, { front: [0.9, 0.9], back: [0.92, 0.92] });
  b.bevel(v3(0, 54, 130), v3(92, 18, 200), 5, ivory, { front: [0.8, 1], back: [0.9, 1] });
  b.bevel(v3(0, 66, 125), v3(56, 8, 150), 3, dark, { front: [0.7, 1] });
  b.bevel(v3(0, -52, 140), v3(84, 14, 190), 5, dark, { front: [0.8, 1] });
  for (const s of [1, -1]) {
    // sponsons down each flank, with a gold armour belt and lit gun-deck slits
    b.bevel(v3(s * 70, -8, 130), v3(26, 46, 196), 6, gold, { front: [0.6, 0.7], back: [0.8, 0.9] });
    b.bevel(v3(s * 64, 30, 135), v3(10, 14, 180), 3, ivory, { front: [0.5, 0.8] });
    for (let z = 50; z <= 220; z += 34) b.box(v3(s * 83.4, -8, z), v3(0.4, 3, 18), cyan, { glow: 1.6, collide: false });
    b.box(v3(s * 62.4, 12, 135), v3(0.6, 4, 210), gold, { collide: false });
  }
  /** A main-battery turret: barbette, armoured house and three long barrels. */
  const mainTurret = (pos: THREE.Vector3, aft: boolean, under: boolean, k = 1.4) => {
    const up = under ? -1 : 1;
    const dir = aft ? 1 : -1;
    b.cylinder(pos.clone().add(v3(0, -6 * k * up, 0)), 25 * k, 9 * k, dark, { sides: 18 });
    b.bevel(pos.clone().add(v3(0, 5 * k * up, 0)), v3(50 * k, 20 * k, 54 * k), 7, ivory, aft ? { back: [0.72, 0.65] } : { front: [0.72, 0.65] });
    b.bevel(pos.clone().add(v3(0, 15 * k * up, dir * 5 * k)), v3(34 * k, 5 * k, 30 * k), 2.5, gold, { collide: false });
    b.box(pos.clone().add(v3(0, 5 * k * up, dir * 27.2 * k)), v3(40 * k, 2 * k, 0.4), cyan, { glow: 1.8, collide: false });
    for (const bx of [-12, 0, 12]) {
      const root = pos.clone().add(v3(bx * k, 3 * k * up, dir * 24 * k));
      b.cylinder(root.clone().add(v3(0, 0, dir * 38 * k)), 2.9 * k, 76 * k, '#3a3e52', { quat: quatX90, sides: 12, collide: false });
      b.cylinder(root.clone().add(v3(0, 0, dir * 9 * k)), 4.2 * k, 14 * k, dark, { quat: quatX90, sides: 12, collide: false });
      b.cylinder(root.clone().add(v3(0, 0, dir * 76.5 * k)), 3.8 * k, 3 * k, dark, { quat: quatX90, sides: 12, collide: false });
      b.cylinder(root.clone().add(v3(0, 0, dir * 78.2 * k)), 2 * k, 0.4, '#ff8a3a', { quat: quatX90, sides: 12, glow: 2.4, collide: false });
    }
  };
  // superfiring pair forward on the dorsal deck, one aft, one under the keel
  mainTurret(v3(0, 84, 45), false, false);
  b.bevel(v3(0, 86, 140), v3(70, 22, 80), 4, ivory);
  mainTurret(v3(0, 112, 140), false, false);
  mainTurret(v3(0, 76, 222), true, false, 1.1);
  mainTurret(v3(0, -70, 110), false, true);
  // point-defence domes along the flanks: small, quick guns for fighters
  for (const s of [1, -1])
    for (const z of [-250, -180, 40, 100, 160, 220, 300]) {
      const pd = v3(s * (z < -150 ? 46 : z > 260 ? 76 : 84), z > 260 ? 30 : 14, z);
      b.sphere(pd, 3.4, dark, { detail: 1, collide: false });
      for (const o of [-0.8, 0.8]) b.cylinder(pd.clone().add(v3(o, 1.2, -4)), 0.35, 7, '#3a3e52', { quat: quatX90, sides: 6, collide: false });
    }

  if (style.rings) {
    // big rings round the cargo spine, on spokes: the Drift build their ships round habitats
    for (const z of [80, 170]) {
      b.torus(v3(0, 0, z), 104, 3.5, gold, { tubular: 64, radial: 8 });
      b.torus(v3(0, 0, z), 104, 1, cyan, { tubular: 64, glow: 1.6 });
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        b.strut(v3(Math.cos(a) * 64, Math.sin(a) * 52, z), v3(Math.cos(a) * 102, Math.sin(a) * 102, z), 2, dark);
      }
    }
  }

  // Engineering block, and a command tower offset to port: the ship is deliberately lopsided
  b.bevel(v3(0, 0, 315), v3(150, 90, 130), 12, ivory, { front: [0.9, 0.85], back: [0.86, 0.82] });
  b.bevel(v3(0, 50, 318), v3(112, 10, 108), 4, dark, { front: [0.8, 1] });
  b.bevel(v3(-38, 80, 300), v3(40, 54, 52), 6, ivory, { front: [0.75, 0.8] });
  b.bevel(v3(-38, 112, 306), v3(28, 12, 34), 3, dark, { front: [0.7, 0.6] });
  b.box(v3(-38, 113, 288.6), v3(22, 3, 0.4), cyan, { glow: 2.6, collide: false });
  b.box(v3(-38, 96, 273.6), v3(30, 2, 0.4), cyan, { glow: 2, collide: false });
  b.strut(v3(-38, 118, 310), v3(-38, 160, 312), 1.2, dark);
  beacons.push({ position: v3(-38, 161, 312), color: new THREE.Color('#ff2040'), phase: 0 });
  // starboard: a sensor ring on a pylon
  b.strut(v3(40, 55, 330), v3(46, 86, 336), 1.6, dark);
  b.torus(v3(46, 92, 336), 12, 1.2, gold, { quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), 0.6), tubular: 32 });
  b.torus(v3(46, 92, 336), 12, 0.35, cyan, { quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), 0.6), tubular: 32, glow: 1.8 });
  for (const s of [1, -1]) {
    b.box(v3(s * 75.4, 0, 315), v3(0.6, 8, 120), gold, { collide: false });
  }
  for (const [ex, ey] of [
    [40, 22],
    [-40, 22],
    [40, -22],
    [-40, -22],
  ] as const) {
    b.cylinder(v3(ex, ey, 400), 18, 40, '#5a6078', { quat: quatX90, sides: 18, radiusTop: 14 });
    b.torus(v3(ex, ey, 392), 19, 2, gold, { tubular: 32 });
    b.cylinder(v3(ex, ey, 420.5), 15.5, 1, '#8fdcff', { quat: quatX90, sides: 18, glow: 3.2, collide: false });
  }

  // Heavy gun barbettes down the prow and light batteries along the flanks
  for (const [z, y] of [
    [-345, 21],
    [-300, 22],
    [-255, 23],
    [-205, 33],
  ] as const) {
    b.cylinder(v3(0, y + 1.5, z), 9, 3, dark, { collide: false, sides: 12 });
    turrets.push({ pos: v3(0, y + 11, z), heavy: true });
  }
  for (const s of [1, -1]) {
    // flank batteries stay clear of the hangar tunnel mouths (z -115 to -35)
    for (const z of [-235, -175, 280, 340]) {
      const x = s * (z > 200 ? 75 : z < -150 ? 52 : 70);
      turrets.push({ pos: v3(x + s * 6, 0, z), heavy: false });
    }
    for (const z of [50, 130, 210]) turrets.push({ pos: v3(s * 90, -8, z), heavy: false });
    turrets.push({ pos: v3(s * 50, 70, 30), heavy: false });
  }
  beacons.push({ position: v3(0, 13, -400), color: new THREE.Color('#ffffff'), phase: 0.5 });

  world.addAll(b.colliders);
  const group = b.build(style.id);
  const fieldMat = new THREE.MeshBasicMaterial({
    color: '#5fe8ff',
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const s of [1, -1]) {
    const field = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), fieldMat);
    field.position.set(s * (hx + 0.2), 0, -75);
    field.rotation.y = Math.PI / 2;
    group.add(field);
  }
  for (const s of [1, -1]) {
    const sign = createHologram(style.signs, style.signColor, 110, 3 + s);
    group.add(placeHologram(sign, v3(s * 77, 22, 315), v3(s, 0, 0)));
  }
  const worldBeacons = beacons.map((bc) => ({ ...bc, position: bc.position.clone().applyMatrix4(transform) }));
  return {
    group,
    beacons: worldBeacons,
    docks: [
      {
        id: `${style.id}.hangar`,
        name: `${style.name}, hangar deck`,
        pad: v3(0, -20, -75).applyMatrix4(transform),
        outward: v3(1, 0, 0).transformDirection(transform),
        up: v3(0, 1, 0).transformDirection(transform),
        mouth: hx,
        opening: [38, 23],
        maxSpeed: 60,
      },
    ],
    turrets: turrets.map((t) => ({ pos: t.pos.clone().applyMatrix4(transform), heavy: t.heavy })),
    bays: [-95, -75, -55].map((z) => ({ pos: v3(hx - 20, -20, z).applyMatrix4(transform), out: v3(1, 0, 0).transformDirection(transform) })),
    points: {
      hangarPort: v3(-hx - 60, 0, -75).applyMatrix4(transform),
      hangarStarboard: v3(hx + 60, 0, -75).applyMatrix4(transform),
      spine: v3(0, 0, 125).applyMatrix4(transform),
      center: v3(0, 0, 0).applyMatrix4(transform),
    },
  };
}

/** Rock field with glowing crystals. Good cover for shaking pursuers. */
export interface AsteroidOptions {
  seed?: number;
  rockColors?: string[];
  crystalColors?: string[];
  /** Keep rocks out of these spheres (around structures and flight lanes). */
  avoid?: { p: THREE.Vector3; r: number }[];
  /** Vertical squash of the field (0.5 = half as tall as wide). */
  flatness?: number;
  maxRadius?: number;
}

export function buildAsteroids(world: CollisionWorld, center: THREE.Vector3, spread: number, count: number, opts: AsteroidOptions = {}): StructureResult {
  const b = new StructureBuilder();
  const rng = new SeededRandom(opts.seed ?? 99);
  const rockColors = opts.rockColors ?? ['#6b4f7a', '#8a5a44', '#4a5d7a', '#5c4a63', '#7a6a55'];
  const crystalColors = opts.crystalColors ?? ['#3ffcff', '#ff4fd8', '#a6ff3f'];
  const flat = opts.flatness ?? 0.5;
  const placed: { p: THREE.Vector3; r: number }[] = [...(opts.avoid ?? [])];
  for (let i = 0; i < count; i++) {
    const r = rng.range(8, i < 6 ? (opts.maxRadius ?? 60) : 32);
    let p = v3(0, 0, 0);
    let ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      p = v3(rng.range(-1, 1), rng.range(-flat, flat), rng.range(-1, 1)).multiplyScalar(spread).add(center);
      ok = placed.every((o) => o.p.distanceTo(p) > o.r + r + 45);
    }
    if (!ok) continue;
    placed.push({ p, r });
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const pos = geo.getAttribute('position');
    const tmp = new THREE.Vector3();
    const seedA = rng.range(0, 10);
    const seedB = rng.range(0, 10);
    for (let k = 0; k < pos.count; k++) {
      tmp.fromBufferAttribute(pos, k);
      const n = Math.sin(tmp.x * 0.15 + seedA) * Math.cos(tmp.y * 0.13 + seedB) * Math.sin(tmp.z * 0.11 + seedA);
      tmp.multiplyScalar(0.82 + 0.22 * n);
      pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)));
    const stretch = v3(rng.range(0.8, 1.3), rng.range(0.7, 1.1), rng.range(0.8, 1.3));
    b.geometry(geo, new THREE.Matrix4().compose(p, q, stretch), rng.pick(rockColors));
    b.addCollider(new SphereCollider(p.clone(), r * 0.85 * Math.min(stretch.x, stretch.y, stretch.z)));
    const crystals = rng.int(0, 3);
    for (let c = 0; c < crystals; c++) {
      const dir = v3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      const cp = p.clone().addScaledVector(dir, r * 0.75);
      const cq = new THREE.Quaternion().setFromUnitVectors(Y, dir);
      b.geometry(
        new THREE.OctahedronGeometry(rng.range(2, 5)),
        new THREE.Matrix4().compose(cp, cq, v3(1, 2.6, 1)),
        rng.pick(crystalColors),
        2.2,
      );
    }
  }
  world.addAll(b.colliders);
  return { group: b.build('asteroids', 'rock'), beacons: [], points: { center: center.clone() } };
}

