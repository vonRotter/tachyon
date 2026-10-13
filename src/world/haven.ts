import * as THREE from 'three';
import { SeededRandom } from '../core/math';
import { StructureBuilder, v3 } from './builder';
import { CapsuleCollider, type CollisionWorld } from './colliders';
import { rock } from './gallows';
import { buildAsteroids, type Beacon, type Spinner, type StructureResult } from './structures';

const rust = '#c46a2b';
const olive = '#3c6e4a';
const steel = '#6d7286';
const grey = '#4e5466';
const lime = '#c6ff5a';
const amber = '#ffb36a';

/**
 * Haven: the Drift Union's home. A hollowed asteroid with the hulls of old ships driven into it
 * like nails, half-finished rings around it on long spokes, habitat drums hung on the rings, and
 * lights everywhere. Built from what was left, and it shows.
 */
export function buildHaven(world: CollisionWorld): StructureResult {
  const b = new StructureBuilder();
  const glow = new StructureBuilder();
  const rng = new SeededRandom(5150);
  const beacons: Beacon[] = [];
  const points: Record<string, THREE.Vector3> = {};

  // the rock
  rock(b, v3(0, 0, 0), 150, rng, '#5a5560');
  rock(b, v3(130, 60, -60), 70, rng, '#6a6070');
  rock(b, v3(-110, -80, 70), 60, rng, '#4a4a58');

  // old hulls driven into it, each pointing out at its own angle
  const hulls: { dir: THREE.Vector3; len: number; w: number; col: string }[] = [
    { dir: v3(1, 0.2, 0.3), len: 220, w: 46, col: rust },
    { dir: v3(-0.8, 0.4, -0.5), len: 180, w: 40, col: olive },
    { dir: v3(0.1, -1, 0.4), len: 160, w: 38, col: steel },
    { dir: v3(-0.2, 0.3, 1), len: 200, w: 44, col: rust },
    { dir: v3(0.4, 0.7, -0.9), len: 150, w: 34, col: olive },
  ];
  hulls.forEach((h, i) => {
    h.w *= 1.6;
    const d = h.dir.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, -1), d);
    const centre = d.clone().multiplyScalar(110 + h.len / 2);
    b.bevel(centre, v3(h.w, h.w * 0.7, h.len), h.w * 0.12, h.col, { quat: q, front: [0.6, 0.6], collide: true });
    // a different coloured patch plate and a stripe of windows
    b.bevel(centre.clone().add(v3(0, h.w * 0.36, 0).applyQuaternion(q)), v3(h.w * 0.5, 2, h.len * 0.4), 0.6, i % 2 ? grey : steel, { quat: q, collide: false });
    for (const s of [1, -1]) glow.box(centre.clone().add(v3(s * (h.w / 2 + 0.3), 0, 0).applyQuaternion(q)), v3(0.4, 1.6, h.len * 0.7), '#ffe7a8', { quat: q, glow: 1.4, collide: false });
    // a ring round each hull, the Drift signature
    b.torus(centre.clone().addScaledVector(d, -h.len * 0.2), h.w * 0.62, 3, i % 2 ? rust : olive, { quat: new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), d), radial: 6, tubular: 28 });
    // engine stubs at the outer end, long dead
    b.cylinder(centre.clone().addScaledVector(d, h.len / 2 + 4), h.w * 0.25, 10, '#2b2f45', { quat: new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d), sides: 10, collide: false });
    const tip = centre.clone().addScaledVector(d, h.len / 2 + 10);
    beacons.push({ position: tip, color: new THREE.Color(i % 2 ? lime : amber), phase: i * 0.5 });
    points[`hull${i}`] = tip.clone();
    // gun positions on top of each hull
    points[`gun${i}`] = centre.clone().add(v3(0, h.w * 0.45, 0).applyQuaternion(q)).addScaledVector(d, h.len * 0.15);
  });

  // half-built rings on spokes, tilted, with gaps where the money ran out
  const rings: { r: number; tilt: THREE.Quaternion; arc: number; a0: number; col: string }[] = [
    { r: 420, tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.25, 0, 0.1)), arc: Math.PI * 1.45, a0: 0.3, col: rust },
    { r: 330, tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.5, 0.4, 0)), arc: Math.PI * 0.9, a0: 2.2, col: olive },
  ];
  rings.forEach((ring, ri) => {
    const geo = new THREE.TorusGeometry(ring.r, 9, 8, 96, ring.arc).rotateZ(ring.a0);
    b.geometry(geo, new THREE.Matrix4().compose(v3(0, 0, 0), ring.tilt, v3(1, 1, 1)), ring.col);
    const segs = 18;
    for (let k = 0; k <= segs; k++) {
      const a = ring.a0 + (k / segs) * ring.arc;
      const p = v3(Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0).applyQuaternion(ring.tilt);
      const n = v3(Math.cos(a + (ring.arc / segs) * 0.5) * ring.r, Math.sin(a + (ring.arc / segs) * 0.5) * ring.r, 0).applyQuaternion(ring.tilt);
      if (k < segs) b.addCollider(new CapsuleCollider(p, n, 9));
      if (k % 3 === 0) {
        // spoke back to the rock, and a habitat drum or a light
        b.strut(p.clone().multiplyScalar(0.36), p.clone().multiplyScalar(0.97), 3, steel, { sides: 6 });
        if (k % 6 === 0) {
          b.cylinder(p, 18, 40, ri ? olive : rust, { quat: new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), p.clone().normalize()), sides: 14, collide: true });
          glow.torus(p, 18.4, 1.2, '#ffe7a8', { quat: new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), p.clone().normalize()), glow: 1.4, tubular: 28 });
        } else beacons.push({ position: p.clone().addScaledVector(p.clone().normalize(), 12), color: new THREE.Color(lime), phase: k * 0.3 + ri });
      }
    }
    // the unfinished ends: bare scaffolding
    for (const end of [ring.a0, ring.a0 + ring.arc]) {
      const p = v3(Math.cos(end) * ring.r, Math.sin(end) * ring.r, 0).applyQuaternion(ring.tilt);
      for (let k = 0; k < 4; k++) b.box(p.clone().add(v3(rng.range(-14, 14), rng.range(-14, 14), rng.range(-14, 14))), v3(2, 2, rng.range(18, 34)), steel, { quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), 0)), collide: false });
      beacons.push({ position: p.clone(), color: new THREE.Color('#ff3348'), phase: end });
    }
  });

  // container clusters stuck to the rock
  const crates = ['#ff4d4d', '#ffcf33', '#2fb7ff', '#3ee07a', '#ff7ad9'];
  for (let i = 0; i < 40; i++) {
    const d = v3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    const p = d.multiplyScalar(rng.range(150, 162));
    b.box(p, v3(12, 9, 9), rng.pick(crates), { quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3))), collide: false });
  }
  // lit windows cut into the rock face
  for (let i = 0; i < 70; i++) {
    const d = v3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    glow.box(d.clone().multiplyScalar(146), v3(3, 2, 3), rng.pick(['#ffe7a8', amber, lime]), { glow: 1.6, collide: false });
  }

  points.center = v3(0, 0, 0);
  points.ringTop = v3(0, 420, 0);
  // a lane out the far side for the evacuation
  points.evac = v3(-600, -200, -2400);

  const rocks = buildAsteroids(world, v3(0, 0, 0), 1500, 70, {
    seed: 512,
    rockColors: ['#5a5560', '#6a6070', '#4a4a58'],
    crystalColors: [lime, '#ffffff'],
    avoid: [{ p: v3(0, 0, 0), r: 650 }, { p: v3(0, 150, 2600), r: 700 }, { p: v3(0, 0, 1100), r: 600 }],
    flatness: 0.4,
    maxRadius: 45,
  });

  world.addAll(b.colliders);
  const group = b.build('haven');
  group.add(glow.build('haven-lights'));
  group.add(rocks.group);
  const spinners: Spinner[] = [];
  return { group, beacons, points, spinners };
}
