import * as THREE from 'three';
import { SeededRandom } from '../core/math';
import { StructureBuilder, v3 } from './builder';
import { CollisionWorld, SphereCollider } from './colliders';
import { createHologram, placeHologram } from './holograms';
import { buildAsteroids, type Beacon, type DockSpec, type Spinner, type StructureResult } from './structures';

const rust = '#8a3324';
const dark = '#2b2f45';
const steel = '#6d7286';
const wakeRed = '#c0142f';
const wakeYellow = '#ffd030';

/** Lumpy asteroid mesh plus a sphere collider. */
function rock(b: StructureBuilder, center: THREE.Vector3, r: number, rng: SeededRandom, color: string): void {
  const geo = new THREE.IcosahedronGeometry(r, 3);
  const pos = geo.getAttribute('position');
  const tmp = new THREE.Vector3();
  const a = rng.range(0, 10);
  const c = rng.range(0, 10);
  for (let k = 0; k < pos.count; k++) {
    tmp.fromBufferAttribute(pos, k);
    const n =
      Math.sin(tmp.x * 0.03 + a) * Math.cos(tmp.y * 0.027 + c) * Math.sin(tmp.z * 0.022 + a) * 0.5 +
      Math.sin(tmp.x * 0.09 + c) * Math.sin(tmp.z * 0.08 + a) * 0.15;
    tmp.multiplyScalar(0.9 + 0.18 * n);
    pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
  }
  b.geometry(geo, new THREE.Matrix4().compose(center, new THREE.Quaternion(), v3(1, 0.85, 1)), color);
  b.addCollider(new SphereCollider(center.clone(), r * 0.8));
}

/**
 * The Gallows: a dead ore-crusher rig the Red Wake took over, slung between two asteroids on a
 * hollow girder you can fly through. Below hang a refinery and a spinning crusher drum; above
 * stands the comms mast. A slot under the middle of the girder is where the habitat module
 * hangs (it is spawned by missions, since it can be destroyed).
 */
export function buildGallows(world: CollisionWorld): StructureResult & { spinners: Spinner[]; docks: DockSpec[] } {
  const b = new StructureBuilder();
  const rb = new StructureBuilder();
  const rng = new SeededRandom(2024);
  const beacons: Beacon[] = [];

  // anchor asteroids
  const rockA = v3(-520, 10, -20);
  const rockB = v3(500, 50, 60);
  rock(rb, rockA, 210, rng, '#6a4038');
  rock(rb, rockB, 180, rng, '#5c4648');

  // --- the girder: 64 m square hollow section ------------------------------------------------
  const h = 32;
  const x0 = -330;
  const x1 = 340;
  const step = 48;
  const corners: [number, number][] = [
    [h, h],
    [-h, h],
    [-h, -h],
    [h, -h],
  ];
  for (const [y, z] of corners) b.strut(v3(x0, y, z), v3(x1, y, z), 3.2, rust, { sides: 6 });
  let k = 0;
  for (let x = x0; x <= x1; x += step, k++) {
    for (let j = 0; j < 4; j++) {
      const [ya, za] = corners[j];
      const [yb, zb] = corners[(j + 1) % 4];
      b.strut(v3(x, ya, za), v3(x, yb, zb), 1.6, k % 2 ? dark : steel, { sides: 5 });
      if (k % 2 === 0 && x + step <= x1) {
        // alternate diagonals on the side faces only, so the inside stays clear to fly
        b.strut(v3(x, ya, za), v3(x + step, yb, zb), 1.1, wakeYellow, { sides: 5 });
      }
    }
    if (k % 3 === 0) {
      for (const [y, z] of corners) beacons.push({ position: v3(x, y * 1.12, z * 1.12), color: new THREE.Color('#ff2040'), phase: k * 0.3 });
    }
  }
  // clamps where the girder bites into the rock
  b.box(v3(x0 - 30, 0, 0), v3(80, 100, 100), dark);
  b.box(v3(x1 + 30, 0, 0), v3(80, 100, 100), dark);
  for (const x of [x0 - 30, x1 + 30]) {
    b.box(v3(x, 52, 0), v3(84, 4, 104), wakeRed, { collide: false });
    b.box(v3(x + (x < 0 ? 41 : -41), 0, 0), v3(0.6, 70, 70), '#ff6030', { collide: false, glow: 1.4 });
  }

  // --- refinery hanging at x = -170 ----------------------------------------------------------
  const ref = v3(-170, -150, 0);
  for (const [dx, dz] of [
    [-25, -25],
    [25, -25],
    [-25, 25],
    [25, 25],
  ]) {
    b.strut(v3(ref.x + dx, -h, dz), v3(ref.x + dx, ref.y + 35, dz), 1.4, steel, { sides: 5 });
  }
  b.box(ref, v3(80, 70, 80), '#7a5040');
  b.box(ref.clone().add(v3(0, 36, 0)), v3(84, 4, 84), dark);
  for (const [dx, dz] of [
    [-20, 20],
    [20, -20],
    [20, 20],
  ]) {
    b.cylinder(ref.clone().add(v3(dx, -55, dz)), 9, 40, steel, { sides: 10 });
    b.cylinder(ref.clone().add(v3(dx, -76, dz)), 7, 1, '#ff7a20', { sides: 10, glow: 2.4, collide: false });
  }
  for (let i = 0; i < 4; i++) b.box(ref.clone().add(v3(40.4, -20 + i * 12, 0)), v3(0.6, 3, 60), '#ffb030', { glow: 1.6, collide: false });

  // --- habitat slot at x = 40: cables down to where missions hang the module -----------------
  const hab = v3(40, -160, 0);
  for (const dx of [-45, 45]) for (const dz of [-20, 20]) b.strut(v3(hab.x + dx, -h, dz), v3(hab.x + dx, hab.y + 42, dz), 0.9, steel, { sides: 4 });

  // --- crusher drum at x = 210, spinning about the girder's axis -----------------------------
  const db = new StructureBuilder();
  const drumR = 36;
  db.cylinder(v3(0, 0, 0), drumR, 70, '#4a4f60', { sides: 18 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (const y of [-22, 0, 22]) {
      const p = v3(Math.cos(a) * (drumR + 5), y + (i % 2) * 6, Math.sin(a) * (drumR + 5));
      db.box(p, v3(10, 8, 10), i % 3 ? '#8a8f9e' : wakeYellow, { quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), -a) });
    }
  }
  for (const y of [-36, 36]) db.torus(v3(0, y, 0), drumR + 1, 1.2, '#ff5020', { glow: 1.8, quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2) });
  const drumMount = new THREE.Group();
  drumMount.position.set(210, -150, 0);
  drumMount.rotation.z = Math.PI / 2;
  for (const dz of [-30, 30]) b.strut(v3(170, -h, dz), v3(170, -150, dz), 2, steel, { sides: 5 });
  for (const dz of [-30, 30]) b.strut(v3(250, -h, dz), v3(250, -150, dz), 2, steel, { sides: 5 });
  b.strut(v3(160, -150, 0), v3(260, -150, 0), 3, dark, { sides: 8, collide: false });

  // --- comms mast on top at x = 110 ----------------------------------------------------------
  const mast = v3(110, h, 0);
  for (const [dx, dz] of [
    [-12, -12],
    [12, -12],
    [12, 12],
    [-12, 12],
  ]) {
    b.strut(v3(mast.x + dx * 2, h, dz * 2), v3(mast.x + dx * 0.4, h + 170, dz * 0.4), 1.4, rust, { sides: 5 });
  }
  for (let y = 30; y < 170; y += 35) b.box(v3(mast.x, h + y, 0), v3(40 - y * 0.18, 1.6, 40 - y * 0.18), dark, { collide: false });
  beacons.push({ position: v3(mast.x, h + 176, 0), color: new THREE.Color('#ff2040'), phase: 0 });

  // --- pirate landing shelf on rock A -------------------------------------------------------
  const shelf = v3(-360, 140, 120);
  b.box(shelf, v3(90, 6, 70), dark);
  b.box(shelf.clone().add(v3(0, 3.5, 0)), v3(70, 0.5, 4), wakeYellow, { glow: 1.6, collide: false });
  b.strut(shelf.clone().add(v3(-40, -3, -30)), v3(-430, 60, 60), 3, rust);
  b.strut(shelf.clone().add(v3(40, -3, -30)), v3(-380, 60, 20), 3, rust);
  for (let i = 0; i < 6; i++) beacons.push({ position: shelf.clone().add(v3(-40 + i * 16, 5, 34)), color: new THREE.Color('#ffb020'), phase: i, kind: 'chase' });

  // mounting plates for the gun turrets on top of and under the girder
  for (const [x, z] of [
    [-250, 0],
    [-20, 22],
    [250, -22],
    [160, 0],
  ]) {
    b.box(v3(x, h + 3.5, z), v3(18, 2, 18), dark);
    b.box(v3(x, h + 4.6, z), v3(16, 0.3, 0.6), '#ff3050', { glow: 1.6, collide: false });
  }
  for (const x of [-120, 100]) {
    b.box(v3(x, -h - 3.5, 0), v3(18, 2, 18), dark);
    b.box(v3(x, -h - 4.6, 0), v3(16, 0.3, 0.6), '#ff3050', { glow: 1.6, collide: false });
  }

  // lit strips along the inside of the girder, like the towers at Kestrel
  for (let x = x0 + 24; x < x1; x += step) {
    for (const z of [-h + 2, h - 2]) b.box(v3(x, -h + 1.5, z), v3(10, 0.4, 0.8), '#ff7030', { glow: 1.5, collide: false });
  }

  // mine workings on rock A: a glowing adit, container stacks and pressure domes
  const adit = rockA.clone().add(v3(150, -80, 110));
  b.box(adit, v3(30, 26, 40), dark);
  b.box(adit.clone().add(v3(15.4, 0, 0)), v3(0.6, 22, 34), '#ff8a20', { glow: 2.2, collide: false });
  const crates = ['#ff4d4d', '#ffcf33', '#2fb7ff', '#9b6bff', '#ff7ad9'];
  for (let i = 0; i < 10; i++) {
    const p = rockA.clone().add(v3(120 + rng.range(-10, 40), 120 + Math.floor(i / 4) * 10, -100 + (i % 4) * 22));
    b.box(p, v3(18, 9, 9), crates[i % crates.length], { collide: false });
  }
  for (const [dx, dy, dz, r] of [
    [60, 150, 60, 24],
    [-40, 175, -30, 18],
    [-120, 120, 120, 20],
  ] as const) {
    const c = rockA.clone().add(v3(dx, dy, dz));
    b.sphere(c, r, '#cfc6b8', { detail: 2 });
    b.torus(c.clone().add(v3(0, r * 0.1, 0)), r * 0.98, 0.5, '#ffd27a', { glow: 1.6, quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2) });
  }

  // pirate shipyard on rock B: two open cradles with half-built hulls
  for (const dz of [-60, 60]) {
    const yard = rockB.clone().add(v3(-120, 140, dz));
    b.box(yard, v3(60, 4, 34), dark);
    for (const s of [-1, 1]) b.strut(yard.clone().add(v3(-30, 0, s * 17)), yard.clone().add(v3(-30, 40, s * 17)), 1.2, wakeYellow, { sides: 5 });
    b.strut(yard.clone().add(v3(-30, 40, -17)), yard.clone().add(v3(-30, 40, 17)), 1.2, wakeYellow, { sides: 5 });
    for (let i = 0; i < 5; i++) {
      // hull ribs of a raider under construction
      const rx = yard.x - 20 + i * 9;
      b.torus(v3(rx, yard.y + 12, yard.z), 6 - Math.abs(i - 2), 0.4, steel, { quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), Math.PI / 2) });
    }
    b.box(yard.clone().add(v3(0, 2.4, 0)), v3(54, 0.4, 1), '#ff3050', { glow: 1.8, collide: false });
    beacons.push({ position: yard.clone().add(v3(-30, 42, 0)), color: new THREE.Color('#ffb020'), phase: dz });
  }

  // debris and smaller rocks, clear of the rig and the carrier lane
  const avoid = [
    { p: rockA, r: 240 },
    { p: rockB, r: 210 },
    { p: v3(0, -60, 0), r: 420 },
    { p: v3(-150, 80, 1200), r: 520 },
    { p: v3(-300, 120, 2400), r: 600 },
  ];
  const field = buildAsteroids(world, v3(0, 0, 300), 1500, 110, {
    seed: 77,
    rockColors: ['#5a3c3a', '#6e4a3a', '#4a3a48', '#3e3640', '#7a5a48'],
    crystalColors: ['#ff3a3a', '#ffb030', '#ff4fd8'],
    avoid,
    flatness: 0.4,
    maxRadius: 70,
  });

  world.addAll(b.colliders);
  world.addAll(rb.colliders);
  const group = b.build('gallows');
  group.add(rb.build('gallows-rocks', 'rock'));
  group.add(field.group);

  const drum = db.build('crusher-drum');
  drumMount.add(drum);
  group.add(drumMount);
  const drumWorld = new CollisionWorld();
  drumWorld.addAll(db.colliders);
  world.attach(drumWorld, drum);

  group.add(placeHologram(createHologram(['RED WAKE', 'NO FLAGS · NO MASTERS'], '#ff3b5c', 90, 11), v3(-60, 70, 0), v3(0, 0, 1)));
  group.add(placeHologram(createHologram(['THE GALLOWS'], '#ffd030', 70, 12), v3(-370, 165, 160), v3(0.3, 0, 1).normalize()));

  // floodlight cones sweeping from the girder: atmosphere, not collision
  const spinners: Spinner[] = [{ object: drum, speed: 0.6 }];
  const coneGeo = new THREE.ConeGeometry(40, 420, 24, 1, true).translate(0, -210, 0);
  [-240, -60, 280].forEach((x, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -h - 4, 0);
    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.rotation.x = 0.7;
    pivot.add(cone);
    group.add(pivot);
    spinners.push({ object: pivot, speed: 0.25 * (i % 2 ? -1 : 1) });
  });

  return {
    group,
    beacons,
    spinners,
    docks: [],
    points: {
      center: v3(0, 0, 0),
      habitat: hab,
      mast: v3(mast.x, h + 120, 0),
      refinery: ref,
      drum: v3(210, -150, 0),
      shelf,
      rockA,
      rockB,
      relay: v3(mast.x, h + 183, 0),
      turret0: v3(-250, 42, 0),
      turret1: v3(-20, 42, 22),
      turret2: v3(250, 42, -22),
      turret3: v3(-170, -194, 0),
      turret4: shelf.clone().add(v3(20, 10, 0)),
      turret5: rockB.clone().add(v3(-120, 150, 60)),
      turret6: v3(-120, -h - 11, 0),
      turret7: v3(100, -h - 11, 0),
      turret8: ref.clone().add(v3(28, 46, 28)),
      turret9: shelf.clone().add(v3(-30, 10, 0)),
      turret10: rockB.clone().add(v3(-120, 150, -60)),
      turret11: v3(160, 42, 0),
      yard: rockB.clone().add(v3(-120, 170, 0)),
    },
  };
}
