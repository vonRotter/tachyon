import * as THREE from 'three';
import { SeededRandom } from '../core/math';
import { StructureBuilder, v3 } from './builder';
import { SphereCollider, type CollisionWorld } from './colliders';
import { buildAsteroids, type Beacon, type Spinner, type StructureResult } from './structures';

const ivory = '#ece6da';
const gold = '#e0a83c';
const dark = '#2b2f45';
const cyan = '#5fe8ff';

/**
 * Bastion: the Helion Combine's fortress in the Reach. Built to the Combine's principle of
 * polished authority: a symmetric stepped core of bevelled blocks in ivory and gold, a command
 * spire with a crescent blade, four long arms ending in shield pylons, heavy batteries on every
 * tier, and a drydock with a destroyer half built inside it.
 */
export function buildBastion(world: CollisionWorld): StructureResult {
  const b = new StructureBuilder();
  const glow = new StructureBuilder();
  const rng = new SeededRandom(7070);
  const beacons: Beacon[] = [];
  const points: Record<string, THREE.Vector3> = {};

  // stepped core: a wide middle tier with a tapered tier above and below
  b.bevel(v3(0, 0, 0), v3(240, 80, 240), 30, ivory);
  b.bevel(v3(0, 70, 0), v3(170, 60, 170), 24, ivory, { front: [0.8, 0.8], back: [0.8, 0.8] });
  b.bevel(v3(0, -70, 0), v3(170, 60, 170), 24, ivory, { front: [0.8, 0.8], back: [0.8, 0.8] });
  b.bevel(v3(0, 120, 0), v3(90, 40, 90), 14, ivory);
  b.bevel(v3(0, -120, 0), v3(90, 40, 90), 14, dark);
  for (const y of [-40, 40]) {
    for (const s of [1, -1]) {
      glow.box(v3(s * 120.5, y, 0), v3(0.6, 3, 160), gold, { glow: 1.5, collide: false });
      glow.box(v3(0, y, s * 120.5), v3(160, 3, 0.6), gold, { glow: 1.5, collide: false });
    }
  }
  // window grid on the middle tier
  for (let i = 0; i < 120; i++) {
    const side = rng.pick([0, 1, 2, 3]);
    const t = rng.range(-90, 90);
    const y = rng.range(-28, 28);
    const p = side === 0 ? v3(120.4, y, t) : side === 1 ? v3(-120.4, y, t) : side === 2 ? v3(t, y, 120.4) : v3(t, y, -120.4);
    glow.box(p, side < 2 ? v3(0.4, 2, 5) : v3(5, 2, 0.4), rng.pick(['#ffe7a8', '#fff4d6', cyan]), { glow: 1.4, collide: false });
  }

  // command spire with a crescent blade
  b.bevel(v3(0, 230, 0), v3(30, 180, 30), 8, ivory, { front: [0.7, 1], back: [0.7, 1] });
  const blade = new THREE.TorusGeometry(70, 6, 6, 40, Math.PI * 0.9).rotateZ(Math.PI * 0.55);
  b.geometry(blade, new THREE.Matrix4().compose(v3(0, 300, 0), new THREE.Quaternion(), v3(1, 1, 0.6)), gold);
  b.addCollider(new SphereCollider(v3(0, 300, 0), 20));
  beacons.push({ position: v3(0, 330, 0), color: new THREE.Color('#ff3348'), phase: 0 });
  points.spire = v3(0, 320, 0);

  // four arms with shield pylons at the ends
  const dirs = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 0, 1), v3(0, 0, -1)];
  dirs.forEach((d, i) => {
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), d);
    const mid = d.clone().multiplyScalar(320);
    b.bevel(mid, v3(44, 30, 400), 8, ivory, { quat: q, front: [0.8, 0.8], back: [0.6, 0.7] });
    b.box(mid.clone().add(v3(0, 16, 0)), v3(10, 2, 360), gold, { quat: q, collide: false });
    const end = d.clone().multiplyScalar(540);
    b.bevel(end.clone().add(v3(0, 60, 0)), v3(30, 150, 30), 8, ivory, { front: [0.6, 1], back: [0.6, 1] });
    b.bevel(end.clone().add(v3(0, -40, 0)), v3(50, 40, 50), 10, dark);
    // the pylon's emitter: a ring and an orb, which the mission turns into a target
    const top = end.clone().add(v3(0, 150, 0));
    glow.torus(top.clone(), 22, 2.4, cyan, { quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), glow: 2, tubular: 32 });
    points[`pylon${i}`] = top.clone();
    beacons.push({ position: end.clone().add(v3(0, -64, 0)), color: new THREE.Color(gold), phase: i * 0.6 });
    // a battery on each arm, and on the core tiers
    points[`battery${i}`] = mid.clone().add(v3(0, 30, 0));
  });
  points.battery4 = v3(70, 112, 70);
  points.battery5 = v3(-70, -112, -70);

  // the drydock: an open frame with a destroyer skeleton inside
  const dock = v3(-260, 40, 900);
  const W = 70;
  const H = 60;
  const L = 300;
  for (const x of [-W, W])
    for (const y of [-H, H]) b.strut(dock.clone().add(v3(x, y, -L / 2)), dock.clone().add(v3(x, y, L / 2)), 4, '#c8ccd6', { sides: 6 });
  for (let z = -L / 2; z <= L / 2; z += 50) {
    for (const [a, c] of [
      [v3(-W, -H, z), v3(W, -H, z)],
      [v3(-W, H, z), v3(W, H, z)],
      [v3(-W, -H, z), v3(-W, H, z)],
      [v3(W, -H, z), v3(W, H, z)],
    ] as const)
      b.strut(dock.clone().add(a), dock.clone().add(c), 2.4, '#c8ccd6', { sides: 4 });
    glow.box(dock.clone().add(v3(0, H + 3, z)), v3(10, 0.6, 2), gold, { glow: 1.6, collide: false });
  }
  // ribs of the ship being built, and a finished bow section
  for (let z = -100; z <= 90; z += 22) {
    const rib = new THREE.TorusGeometry(30, 2, 4, 20, Math.PI);
    b.geometry(rib, new THREE.Matrix4().compose(dock.clone().add(v3(0, -10, z)), new THREE.Quaternion(), v3(1, 1, 1)), '#8a8070');
  }
  b.strut(dock.clone().add(v3(0, -10, -110)), dock.clone().add(v3(0, -10, 110)), 4, '#8a8070', { sides: 6 });
  b.bevel(dock.clone().add(v3(0, 0, -130)), v3(56, 40, 50), 8, ivory, { front: [0.4, 0.6] });
  points.drydock = dock.clone();

  points.center = v3(0, 0, 0);

  const rocks = buildAsteroids(world, v3(0, -200, 0), 1700, 50, {
    seed: 4545,
    rockColors: ['#6a6070', '#5a5560', '#7a7480'],
    crystalColors: [cyan, '#ffffff'],
    avoid: [{ p: v3(0, 0, 0), r: 750 }, { p: dock, r: 300 }, { p: v3(0, 150, 2600), r: 800 }, { p: v3(600, 100, 600), r: 500 }],
    flatness: 0.3,
    maxRadius: 40,
  });

  world.addAll(b.colliders);
  const group = b.build('bastion');
  group.add(glow.build('bastion-lights'));
  group.add(rocks.group);
  const spinners: Spinner[] = [];
  return { group, beacons, points, spinners };
}
