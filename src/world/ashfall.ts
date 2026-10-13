import * as THREE from 'three';
import { SeededRandom } from '../core/math';
import { StructureBuilder, v3 } from './builder';
import type { CollisionWorld } from './colliders';
import { buildDestroyer, STYLES } from './capitals';
import { buildAsteroids, type Beacon, type StructureResult } from './structures';

/**
 * The Ashfall: the graveyard of an old fleet action. Torn hull plates, broken spars, hollow
 * hull sections you can fly through, cargo spilled in strings, and a dead destroyer, scattered
 * along a band between where the Combine carrier holds and where the Drift wait. Built to be
 * dodged through at full boost.
 */
export function buildAshfall(world: CollisionWorld): StructureResult {
  const b = new StructureBuilder();
  const glow = new StructureBuilder();
  const rng = new SeededRandom(4242);
  const beacons: Beacon[] = [];
  const hull = ['#6d6a72', '#7a5a48', '#4e5466', '#8a8070', '#5a4a52'];
  const crates = ['#ff4d4d', '#ffcf33', '#2fb7ff', '#3ee07a', '#ff7ad9', '#9b6bff'];
  const placed: { p: THREE.Vector3; r: number }[] = [];
  const keepClear = (p: THREE.Vector3, r: number) => placed.every((o) => o.p.distanceTo(p) > o.r + r + 30);
  // the band runs from just past the carrier's bow (z = -500) to short of the Drift ship (z = -3900)
  const spot = (r: number): THREE.Vector3 | null => {
    for (let tries = 0; tries < 25; tries++) {
      const p = v3(rng.range(-900, 900), rng.range(-350, 350), rng.range(-3900, -500));
      if (keepClear(p, r)) {
        placed.push({ p, r });
        return p;
      }
    }
    return null;
  };
  const randomQuat = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI)));

  // torn hull plates
  for (let i = 0; i < 70; i++) {
    const size = v3(rng.range(25, 70), rng.range(2, 4), rng.range(30, 90));
    const p = spot(Math.max(size.x, size.z) * 0.55);
    if (!p) continue;
    b.box(p, size, rng.pick(hull), { quat: randomQuat() });
    if (rng.next() < 0.35) glow.sphere(p.clone().add(v3(rng.range(-8, 8), rng.range(-3, 3), rng.range(-8, 8))), rng.range(1.2, 2.6), '#ff7a2a', { glow: 2.6, detail: 0, collide: false });
  }
  // broken spars and keel beams
  for (let i = 0; i < 45; i++) {
    const len = rng.range(80, 190);
    const p = spot(len * 0.5);
    if (!p) continue;
    const dir = v3(rng.range(-1, 1), rng.range(-0.4, 0.4), rng.range(-1, 1)).normalize();
    b.strut(p.clone().addScaledVector(dir, -len / 2), p.clone().addScaledVector(dir, len / 2), rng.range(2.5, 5), rng.pick(hull), { sides: 6 });
  }
  // hollow hull sections: four walls of a broken corridor, open at both ends
  for (let i = 0; i < 14; i++) {
    const len = rng.range(90, 160);
    const w = rng.range(40, 60);
    const p = spot(len * 0.55);
    if (!p) continue;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.3, 0.3), rng.range(0, Math.PI * 2), rng.range(-0.3, 0.3)));
    const local = (x: number, y: number, z: number) => v3(x, y, z).applyQuaternion(q).add(p);
    const col = rng.pick(hull);
    b.box(local(0, w / 2, 0), v3(w + 4, 3, len), col, { quat: q });
    b.box(local(0, -w / 2, 0), v3(w + 4, 3, len), col, { quat: q });
    b.box(local(w / 2, 0, 0), v3(3, w, len), col, { quat: q });
    if (rng.next() < 0.7) b.box(local(-w / 2, 0, len * 0.15), v3(3, w, len * 0.7), col, { quat: q });
    for (let k = -1; k <= 1; k++) glow.box(local(0, w / 2 - 2, (k * len) / 3), v3(w * 0.6, 0.3, 1), '#ffd27a', { quat: q, glow: 1.2, collide: false });
  }
  // spilled cargo in strings
  for (let i = 0; i < 16; i++) {
    const p = spot(60);
    if (!p) continue;
    const dir = v3(rng.range(-1, 1), rng.range(-0.3, 0.3), rng.range(-1, 1)).normalize();
    for (let k = 0; k < 6; k++) {
      const c = p.clone().addScaledVector(dir, (k - 3) * 18).add(v3(rng.range(-4, 4), rng.range(-4, 4), rng.range(-4, 4)));
      b.box(c, v3(12, 9, 9), rng.pick(crates), { quat: randomQuat() });
    }
  }
  // fires burning in the wreckage
  for (let i = 0; i < 26; i++) {
    const o = rng.pick(placed);
    beacons.push({ position: o.p.clone().add(v3(rng.range(-10, 10), rng.range(-6, 6), rng.range(-10, 10))), color: new THREE.Color('#ff6a2a'), phase: i * 0.37 });
  }

  // a dead destroyer, rolled on its side across the band
  const wreckFrame = new THREE.Matrix4().compose(v3(-420, -80, -2300), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, 1.6)), v3(1, 1, 1));
  const wreck = buildDestroyer(world, wreckFrame, { ...STYLES.kestrel, hull: '#5a5450', trim: '#3a3438', light: '#ff5a2a', id: 'wreck', name: 'Wreck' });

  // rock and ice drifting through it all
  const rocks = buildAsteroids(world, v3(0, 0, -2200), 1100, 70, {
    seed: 31,
    rockColors: ['#5a5560', '#6a6070', '#4a4a58', '#7a7480'],
    crystalColors: ['#9fe8ff', '#ffffff'],
    avoid: [...placed, { p: v3(0, 0, 0), r: 650 }, { p: v3(150, 100, -4400), r: 700 }],
    flatness: 0.35,
    maxRadius: 45,
  });

  world.addAll(b.colliders);
  const group = b.build('ashfall');
  group.add(glow.build('ashfall-fires'));
  group.add(wreck.group, rocks.group);
  return {
    group,
    beacons: [...beacons, ...wreck.beacons],
    points: { center: v3(0, 0, -2200) },
  };
}
