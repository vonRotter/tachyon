import * as THREE from 'three';
import { SeededRandom } from '../core/math';
import { StructureBuilder, v3 } from './builder';
import { SphereCollider, type CollisionWorld } from './colliders';
import { buildAsteroids, type Beacon, type Spinner, type StructureResult } from './structures';

const hullWhite = '#d8d2c4';
const rust = '#7a5a48';
const crimson = '#b3122e';
const cream = '#f2e8d2';
const gold = '#ffcf5a';
const dark = '#2b2f45';

/**
 * The Rookery: the Scarlet Baron's hideout, a derelict Combine cruise liner broken in two and
 * dressed up like a country house. A chapel tower with spires on its back, red lanterns strung
 * on wires, rose banners down the flanks, a hangar cut into the bow section, all hidden in an
 * ice field.
 */
export function buildRookery(world: CollisionWorld): StructureResult {
  const b = new StructureBuilder();
  const glow = new StructureBuilder();
  const rng = new SeededRandom(1918);
  const beacons: Beacon[] = [];
  const points: Record<string, THREE.Vector3> = {};

  // the liner, broken in two: a long stern section and a bow section drifting at an angle
  const stern = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.15, 0.04));
  b.bevel(v3(0, 0, 160), v3(110, 60, 380), 14, hullWhite, { quat: stern, back: [0.8, 0.8] });
  b.bevel(v3(0, 42, 190).applyQuaternion(stern), v3(80, 26, 260), 8, hullWhite, { quat: stern });
  const bowQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, -0.35, 0.18));
  const bowC = v3(-40, -20, -230);
  b.bevel(bowC, v3(100, 56, 260), 12, hullWhite, { quat: bowQ, front: [0.3, 0.5], lift: -8 });
  // the break: torn rust-coloured plates and spars between the halves
  for (let i = 0; i < 14; i++) {
    const p = v3(rng.range(-50, 50), rng.range(-25, 25), rng.range(-90, -30));
    b.box(p, v3(rng.range(8, 24), rng.range(1, 3), rng.range(10, 30)), rust, { quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3))), collide: false });
  }
  for (let i = 0; i < 6; i++) b.strut(v3(rng.range(-40, 40), rng.range(-20, 20), -20), v3(rng.range(-50, 30), rng.range(-30, 20), -110), 2, rust, { sides: 6, collide: false });
  // window bands along the flanks, mostly dark, some still lit
  for (const s of [1, -1])
    for (let z = 0; z < 340; z += 12) {
      if (rng.next() < 0.45) continue;
      glow.box(v3(s * 55.4, rng.pick([-10, 6]), z).applyQuaternion(stern), v3(0.4, 2, 7), rng.pick(['#ffe7a8', '#ff9a6a']), { quat: stern, glow: 1.3, collide: false });
    }

  // hangar cut into the bow: a dark mouth with a lantern frame
  const mouth = v3(0, 0, -100).applyQuaternion(bowQ).add(bowC);
  points.hangar = mouth.clone().add(v3(0, 0, -160).applyQuaternion(bowQ));
  glow.box(v3(0, 18, -131).applyQuaternion(bowQ).add(bowC), v3(46, 1.2, 1), crimson, { quat: bowQ, glow: 1.6, collide: false });

  // the chapel tower on the stern's back: nave, buttresses and three spires
  const top = v3(0, 70, 120).applyQuaternion(stern);
  b.bevel(top.clone().add(v3(0, 20, 0)), v3(44, 40, 70), 6, cream, { quat: stern });
  for (const [x, h, z] of [
    [0, 90, -20],
    [-16, 60, 20],
    [16, 60, 20],
  ] as const) {
    const base = top.clone().add(v3(x, 40, z).applyQuaternion(stern));
    b.bevel(base.clone().add(v3(0, h / 2, 0)), v3(12, h, 12), 2, cream, { quat: stern, front: [0.9, 1], back: [0.9, 1] });
    b.hull(
      [base.clone().add(v3(-7, h, -7)), base.clone().add(v3(7, h, -7)), base.clone().add(v3(-7, h, 7)), base.clone().add(v3(7, h, 7)), base.clone().add(v3(0, h + h * 0.5, 0))],
      crimson,
    );
    beacons.push({ position: base.clone().add(v3(0, h * 1.5 + 3, 0)), color: new THREE.Color(gold), phase: x * 0.1 });
  }
  // a great rose window on the chapel front
  const roseC = top.clone().add(v3(0, 24, -36).applyQuaternion(stern));
  glow.torus(roseC.clone(), 14, 1.4, gold, { quat: stern, glow: 1.6, tubular: 32 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    glow.box(roseC.clone().add(v3(Math.cos(a) * 7, Math.sin(a) * 7, -0.5).applyQuaternion(stern)), v3(2.2, 2.2, 0.4), k % 2 ? crimson : '#ff6a8a', { quat: stern, glow: 1.5, collide: false });
  }
  points.tower = top.clone().add(v3(0, 160, 0));

  // rose banners down the flanks
  for (const s of [1, -1])
    for (const z of [60, 180, 300]) {
      const c = v3(s * 57, -6, z).applyQuaternion(stern);
      b.box(c, v3(0.6, 44, 20), crimson, { quat: stern, collide: false });
      glow.torus(c.clone().add(v3(s * 0.5, 6, 0).applyQuaternion(stern)), 6, 0.7, gold, { quat: new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), Math.PI / 2).premultiply(stern), glow: 1.4, tubular: 24 });
    }

  // red lanterns strung on wires between the halves and around the tower
  const lantern = (p: THREE.Vector3) => {
    glow.sphere(p, 2.2, '#ff3a3a', { glow: 2.2, detail: 1, collide: false });
    b.cylinder(p.clone().add(v3(0, 2.6, 0)), 0.8, 1, dark, { sides: 6, collide: false });
  };
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const p = v3(-60 + t * 120, 40 - Math.sin(t * Math.PI) * 26, -60 + Math.sin(t * 6) * 10);
    lantern(p);
    if (i) b.strut(p, v3(-60 + ((i - 1) / 17) * 120, 40 - Math.sin(((i - 1) / 17) * Math.PI) * 26, -60 + Math.sin(((i - 1) / 17) * 6) * 10), 0.15, dark, { sides: 3, collide: false });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lantern(top.clone().add(v3(Math.cos(a) * 46, 52, Math.sin(a) * 46)));
  }

  // gun positions the Baron's crews have bolted on
  points.gun0 = v3(40, 62, 40).applyQuaternion(stern);
  points.gun1 = v3(-40, 62, 260).applyQuaternion(stern);
  points.gun2 = v3(0, -36, 200).applyQuaternion(stern);
  points.gun3 = v3(30, 30, -40).applyQuaternion(bowQ).add(bowC);
  points.center = v3(0, 0, 60);
  b.addCollider(new SphereCollider(top.clone().add(v3(0, 20, 0)), 26));

  // the ice field that hides it
  const ice = buildAsteroids(world, v3(0, 0, 0), 1600, 80, {
    seed: 1916,
    rockColors: ['#c8dceb', '#a8c4d8', '#8aa8c0', '#e0eef8'],
    crystalColors: ['#bff4ff', '#ffffff'],
    avoid: [{ p: v3(0, 0, 0), r: 520 }, { p: v3(0, 150, 2000), r: 600 }],
    flatness: 0.45,
    maxRadius: 50,
  });

  world.addAll(b.colliders);
  const group = b.build('rookery');
  group.add(glow.build('rookery-lights'));
  group.add(ice.group);
  const spinners: Spinner[] = [];
  return { group, beacons, points, spinners };
}
