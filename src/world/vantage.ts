import * as THREE from 'three';
import { SeededRandom } from '../core/math';
import { StructureBuilder, v3 } from './builder';
import { CapsuleCollider, SphereCollider, type CollisionWorld } from './colliders';
import { buildAsteroids, type Beacon, type Spinner, type StructureResult } from './structures';

const white = '#e8ecf2';
const orange = '#ff8a2a';
const grey = '#8a93a6';
const glass = '#7fe0ff';

const X90 = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2);

/**
 * Vantage: a research station. A long open truss spine strung with lab modules, an observatory
 * sphere at the bow, wide solar sails, and at the stern three big dishes on masts, the only array
 * in the Reach that can talk to every station at once. Research white with safety orange.
 */
export function buildVantage(world: CollisionWorld): StructureResult {
  const b = new StructureBuilder();
  const glow = new StructureBuilder();
  const rng = new SeededRandom(9091);
  const beacons: Beacon[] = [];
  const points: Record<string, THREE.Vector3> = {};

  // --- the spine: four longerons with cross-bracing, open enough to fly through ---------------
  const z0 = -320;
  const z1 = 260;
  const half = 22;
  const corners = [v3(half, half, 0), v3(-half, half, 0), v3(-half, -half, 0), v3(half, -half, 0)];
  for (const c of corners) b.strut(v3(c.x, c.y, z0), v3(c.x, c.y, z1), 2.2, grey, { sides: 6 });
  for (let z = z0; z < z1; z += 48) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const c = corners[(i + 1) % 4];
      b.strut(v3(a.x, a.y, z), v3(c.x, c.y, z + 48), 0.9, grey, { sides: 4 });
      b.strut(v3(a.x, a.y, z), v3(c.x, c.y, z), 1.1, white, { sides: 4 });
    }
    glow.box(v3(0, half + 1.5, z), v3(4, 0.6, 1.4), orange, { glow: 1.8, collide: false });
  }

  // --- lab modules hung off the spine, alternating sides ----------------------------------------
  const labs = [-260, -180, -100, -20, 60, 140];
  labs.forEach((z, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const up = i % 3 === 0;
    const c = up ? v3(0, side * 52, z) : v3(side * 52, 0, z);
    const len = 64;
    b.cylinder(c, 16, len, white, { quat: X90, sides: 16, collide: false });
    b.addCollider(new CapsuleCollider(c.clone().add(v3(0, 0, -len / 2 + 6)), c.clone().add(v3(0, 0, len / 2 - 6)), 16));
    for (const e of [-1, 1]) b.cylinder(c.clone().add(v3(0, 0, e * (len / 2 + 2))), 13, 4, orange, { quat: X90, sides: 16, collide: false });
    // window bands
    for (const wz of [-18, 0, 18]) glow.torus(c.clone().add(v3(0, 0, wz)), 16.2, 0.9, '#ffe7a8', { quat: new THREE.Quaternion(), glow: 1.6, tubular: 32 });
    // the arm that holds it
    const root = up ? v3(0, side * half, z) : v3(side * half, 0, z);
    b.strut(root, c.clone().sub(up ? v3(0, side * 16, 0) : v3(side * 16, 0, 0)), 3, grey, { sides: 6 });
    beacons.push({ position: c.clone().add(up ? v3(0, side * 17, 0) : v3(side * 17, 0, 0)), color: new THREE.Color(orange), phase: i * 0.4 });
  });

  // --- observatory sphere at the bow ------------------------------------------------------------
  const obs = v3(0, 0, -380);
  b.sphere(obs, 48, white, { detail: 3, collide: false });
  b.addCollider(new SphereCollider(obs.clone(), 47));
  glow.torus(obs.clone(), 48.6, 3.2, glass, { quat: X90, glow: 1.4, tubular: 48 });
  glow.torus(obs.clone().add(v3(0, 14, 0)), 46.2, 1.4, glass, { quat: X90, glow: 1.2, tubular: 48 });
  b.cylinder(obs.clone().add(v3(0, 0, 45)), 14, 30, grey, { quat: X90, sides: 12 });
  b.cylinder(obs.clone().add(v3(0, 58, 0)), 2, 30, grey, { sides: 6 });
  beacons.push({ position: obs.clone().add(v3(0, 74, 0)), color: new THREE.Color('#ff3348'), phase: 0 });
  points.observatory = obs.clone();

  // --- solar sails on long outriggers -----------------------------------------------------------
  for (const s of [1, -1]) {
    for (const z of [-140, 80]) {
      const root = v3(s * half, 0, z);
      const tip = v3(s * 300, 0, z);
      b.strut(root, tip, 2.4, grey, { sides: 6 });
      for (let k = 0; k < 3; k++) {
        const x = s * (90 + k * 70);
        b.box(v3(x, 0, z), v3(60, 1.2, 70), '#2a3570', { collide: true });
        glow.box(v3(x, 0.7, z), v3(56, 0.2, 2), '#6fa8ff', { glow: 0.8, collide: false });
      }
      beacons.push({ position: tip.clone(), color: new THREE.Color(s > 0 ? '#30ff70' : '#ff2040'), phase: z * 0.01 });
    }
  }

  // --- the dish array at the stern ----------------------------------------------------------------
  const dishBase = v3(0, 0, z1 + 20);
  b.cylinder(dishBase, 34, 40, white, { quat: X90, sides: 18, collide: false });
  b.addCollider(new CapsuleCollider(dishBase.clone().add(v3(0, 0, -14)), dishBase.clone().add(v3(0, 0, 14)), 34));
  glow.torus(dishBase.clone(), 34.5, 1.2, orange, { quat: new THREE.Quaternion(), glow: 1.8, tubular: 40 });
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const dir = v3(Math.cos(a), Math.sin(a), 0);
    const mastTop = dishBase.clone().addScaledVector(dir, 120).add(v3(0, 0, 60));
    b.strut(dishBase.clone().addScaledVector(dir, 30), mastTop, 5, grey, { sides: 8 });
    // the dish: a shallow bowl facing out and back, on a gimbal
    const face = dir.clone().multiplyScalar(0.5).add(v3(0, 0, 1)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), face);
    const bowl = new THREE.SphereGeometry(70, 28, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.2);
    // the bowl is the lower band of a sphere; shift it so its rim sits on the mast top
    const centre = mastTop.clone().addScaledVector(face, 54);
    b.geometry(bowl, new THREE.Matrix4().compose(centre, q, v3(1, 1, 1)), white);
    b.geometry(new THREE.SphereGeometry(69.4, 28, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.2), new THREE.Matrix4().compose(centre, q, v3(1, 1, 1)), grey);
    b.addCollider(new SphereCollider(mastTop.clone().addScaledVector(face, 6), 34));
    // feed horn on three struts: the transmitter
    const feed = mastTop.clone().addScaledVector(face, 46);
    for (let k = 0; k < 3; k++) {
      const ka = (k * Math.PI * 2) / 3;
      const side = new THREE.Vector3(Math.cos(ka), Math.sin(ka), 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), face));
      b.strut(mastTop.clone().addScaledVector(face, 4).addScaledVector(side, 30), feed, 0.8, grey, { sides: 4, collide: false });
    }
    glow.sphere(feed.clone(), 3.4, orange, { glow: 2.4, detail: 1, collide: false });
    points[`dish${i}`] = feed.clone();
    beacons.push({ position: mastTop.clone().addScaledVector(face, -6), color: new THREE.Color('#ff3348'), phase: i * 0.7 });
  }
  points.array = dishBase.clone();
  points.center = v3(0, 0, 0);

  // markings
  for (let i = 0; i < 18; i++) {
    const z = rng.range(z0, z1);
    glow.box(v3(rng.pick([-1, 1]) * (half + 0.6), rng.range(-half, half), z), v3(0.3, 2, rng.range(4, 10)), rng.pick(['#7fe0ff', '#ffe7a8']), { glow: 1.2, collide: false });
  }

  // a thin ring of ice and rock around the station, well clear of it
  const rocks = buildAsteroids(world, v3(0, -300, 0), 1400, 60, {
    seed: 77,
    rockColors: ['#7a7f8c', '#8a8a96', '#5f6574'],
    crystalColors: ['#bff4ff', '#ffffff'],
    avoid: [{ p: v3(0, 0, 0), r: 900 }],
    flatness: 0.25,
    maxRadius: 40,
  });

  world.addAll(b.colliders);
  const group = b.build('vantage');
  group.add(glow.build('vantage-lights'));
  group.add(rocks.group);
  const spinners: Spinner[] = [];
  return { group, beacons, points, spinners };
}
