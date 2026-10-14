import * as THREE from 'three';
import { StructureBuilder, v3 } from './builder';
import { BoxCollider, type CollisionWorld } from './colliders';
import { createHologram, placeHologram } from './holograms';
import type { Beacon, DockSpec, PortBay, PortSpec, StructureResult } from './structures';

const salt = '#c9c4b8';
const sea = '#2f6f8f';
const dark = '#2b2f45';
const steel = '#7c8596';
const amber = '#ffb547';
const teal = '#5fe8ff';

const Y = v3(0, 1, 0);
const quatY = (a: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(Y, a);
const X90 = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2);

/** Drum apothem (centre to face), height, and the three drum heights. */
const A = 230;
const H = 110;
const DRUMS = [190, 0, -190];
/** A hangar module bolted to a drum face: width, height, depth. Two per face. */
const MOD = { w: 70, h: 46, d: 64 };
const SLOTS = [-46, 46];

/** Face k of an octagon: CylinderGeometry puts a corner on +Z, so faces sit between corners. */
const faceAngle = (k: number): number => Math.PI / 8 + (k * Math.PI) / 4;
/** A point in face k's frame (u along the face, y up, z out from the axis) to world space. */
const P = (k: number, u: number, y: number, z: number): THREE.Vector3 => v3(u, y, z).applyQuaternion(quatY(faceAngle(k)));

/** An octagonal prism on the station axis, with box colliders that fill it exactly. */
function octPrism(b: StructureBuilder, y: number, apothem: number, height: number, color: string): void {
  b.cylinder(v3(0, y, 0), apothem / Math.cos(Math.PI / 8), height, color, { sides: 8, collide: false });
  // four strips, each spanning two opposite faces, together make the octagon
  for (let k = 0; k < 4; k++) b.addCollider(new BoxCollider(v3(0, y, 0), v3(apothem * Math.tan(Math.PI / 8), height / 2, apothem), quatY(faceAngle(k))));
}

/**
 * Saltmarket: the free port of the Reach. Nobody owns it and everybody trades there, under the
 * eye of the Reach Patrol. Three octagonal drums stacked on a spindle, each face carrying two
 * hangar modules (48 bays in all), four long piers off the middle drum where the big ships that
 * do not fit a bay tie up, the harbourmaster's tower on top and fuel tanks and radiators below.
 * A few guns: batteries on the pier ends and the upper drum. Salt white and sea blue, sodium
 * amber at the bay mouths.
 */
export function buildSaltmarket(world: CollisionWorld): StructureResult & { port: PortSpec } {
  const b = new StructureBuilder();
  const beacons: Beacon[] = [];
  const bays: PortBay[] = [];
  const docks: DockSpec[] = [];
  const signs: THREE.Mesh[] = [];

  // --- the spindle ------------------------------------------------------------------------------
  b.cylinder(v3(0, 0, 0), 70, 960, steel, { sides: 16 });

  // --- drums, waists between them, shoulders at the ends ------------------------------------------
  DRUMS.forEach((yc, d) => {
    octPrism(b, yc, A, H, salt);
    for (const e of [-1, 1]) b.cylinder(v3(0, yc + e * (H / 2 - 3), 0), (A + 2.5) / Math.cos(Math.PI / 8), 6, sea, { sides: 8, collide: false });
    for (let k = 0; k < 8; k++) {
      // window rows above and below the hangars, a blue stripe between the pair
      for (const e of [-1, 1]) b.box(P(k, 0, yc + e * 36, A + 0.3), v3(150, 2.2, 0.6), '#ffe7a8', { glow: 1.3, collide: false });
      b.box(P(k, 0, yc, A + 0.4), v3(8, 40, 0.8), sea, { collide: false });
      SLOTS.forEach((uc, s) => hangar(k, yc, uc, d * 16 + k * 2 + s + 1));
    }
  });
  for (const y of [95, -95]) {
    octPrism(b, y, 140, 80, steel);
    for (const e of [-1, 1]) b.cylinder(v3(0, y + e * 18, 0), 141 / Math.cos(Math.PI / 8), 3, amber, { sides: 8, glow: 1.2, collide: false });
  }
  for (const e of [1, -1]) {
    const top = DRUMS[e > 0 ? 0 : 2] + e * (H / 2);
    octPrism(b, top + e * 10, A * 0.8, 20, sea);
    octPrism(b, top + e * 28, A * 0.55, 16, salt);
  }

  // --- the harbourmaster's tower ---------------------------------------------------------------------
  b.cylinder(v3(0, 360, 0), 100, 36, salt, { sides: 16, radiusTop: 88 });
  b.torus(v3(0, 352, 0), 98.5, 1.8, teal, { quat: X90, glow: 1.6, tubular: 64 });
  b.torus(v3(0, 366, 0), 93, 1.4, '#ffe7a8', { quat: X90, glow: 1.4, tubular: 64 });
  b.cylinder(v3(0, 381, 0), 90, 6, sea, { sides: 16 });
  for (const [x, z, h] of [
    [28, 0, 150],
    [-20, 20, 110],
    [-14, -30, 80],
  ] as const) {
    b.strut(v3(x, 384, z), v3(x, 384 + h, z), 2.2, steel, { sides: 6 });
    beacons.push({ position: v3(x, 386 + h, z), color: new THREE.Color('#ff3348'), phase: h * 0.01 });
  }

  // --- fuel tanks and radiators below ----------------------------------------------------------------
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const dir = v3(Math.sin(a), 0, Math.cos(a));
    const c = dir.clone().multiplyScalar(118).setY(-345);
    b.sphere(c, 36, i % 2 ? salt : amber, { detail: 2 });
    b.strut(dir.clone().multiplyScalar(60).setY(-345), c, 7, steel, { sides: 8 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const dir = v3(Math.sin(a), 0, Math.cos(a));
    b.box(dir.clone().multiplyScalar(150).setY(-440), v3(4, 60, 160), dark, { quat: quatY(a) });
    b.box(dir.clone().multiplyScalar(231).setY(-440), v3(5, 62, 2), '#ff7a35', { quat: quatY(a), glow: 0.9, collide: false });
  }
  beacons.push({ position: v3(0, -484, 0), color: new THREE.Color('#ff3348'), phase: 1.3 });

  // --- piers off the middle drum's corners ---------------------------------------------------------
  const moorings: PortSpec['moorings'] = [];
  const batteries: THREE.Vector3[] = [];
  const guns: THREE.Vector3[] = [];
  const shipNames = ['Container ship Lark Mother', 'Bulk Hauler Tenpenny', 'Container ship Odd Fellow', 'Bulk Hauler Brightwater', 'Container ship Saltlick', 'Bulk Hauler Gannet Rock', 'Container ship Hollin', 'Bulk Hauler Seventh Son'];
  for (let i = 0; i < 4; i++) {
    const th = (i * Math.PI) / 2;
    const q = quatY(th);
    const dir = v3(Math.sin(th), 0, Math.cos(th));
    const perp = v3(Math.cos(th), 0, -Math.sin(th));
    const at = (r: number, y = 0, side = 0) => dir.clone().multiplyScalar(r).addScaledVector(perp, side).setY(y);
    b.bevel(at(470), v3(24, 16, 460), 3, steel, { quat: q });
    b.box(at(470, 8.1), v3(6, 0.3, 440), dark, { quat: q, collide: false });
    for (let r = 280; r <= 680; r += 40) {
      b.box(at(r, 8.4), v3(4, 0.5, 2), amber, { quat: q, glow: 1.6, collide: false });
      for (const s of [-1, 1]) beacons.push({ position: at(r, -6, s * 12.4), color: new THREE.Color(teal), phase: (700 - r) / 40, kind: 'chase' });
    }
    // two gantry cranes, one each side, reaching over the berths
    ([
      [420, 1],
      [600, -1],
    ] as const).forEach(([r, s], j) => {
      const foot = at(r, 8);
      const top = at(r, 46);
      b.strut(foot, top, 2.6, amber, { sides: 6 });
      b.strut(top, at(r, 46, s * 46), 1.8, amber, { sides: 6, collide: false });
      b.strut(at(r, 30), at(r, 46, s * 22), 1, steel, { sides: 4, collide: false });
      beacons.push({ position: at(r, 47.5, s * 46), color: new THREE.Color('#ff3348'), phase: i + j });
      moorings.push({ pos: at(r + 10, 0, s * 54), look: at(r + 200, 0, s * 54), cls: j === 0 ? 'container' : 'freighter', name: shipNames[i * 2 + j] });
    });
    // gun platforms on the pier ends: heavy batteries on two, light guns on the others
    b.box(at(684, 10), v3(36, 4, 36), dark, { quat: q });
    b.cylinder(at(684, 12.3), 15, 0.6, i % 2 ? teal : amber, { glow: 1.2, collide: false, sides: 24 });
    if (i % 2 === 0) batteries.push(at(684, 20));
    else guns.push(at(684, 21));
    beacons.push({ position: at(704, 4), color: new THREE.Color(i % 2 ? '#30ff70' : '#ff2040'), phase: i });
  }
  // the top drum's roof carries the other two batteries and two light guns
  const roof = DRUMS[0] + H / 2;
  for (const k of [0, 4]) batteries.push(P(k, 0, roof + 8, 208));
  for (const k of [2, 6]) guns.push(P(k, 0, roof + 9, 208));
  for (const k of [0, 2, 4, 6]) b.cylinder(P(k, 0, roof + 0.3, 208), 13, 0.6, k % 4 ? teal : amber, { glow: 1.2, collide: false, sides: 24 });

  // --- signs ---------------------------------------------------------------------------------------
  const sign = (lines: string[], color: string, width: number, k: number, y: number, seed: number) => {
    signs.push(placeHologram(createHologram(lines, color, width, seed), P(k, 0, y, 142), P(k, 0, 0, 1)));
  };
  sign(['SALTMARKET', 'FREE PORT OF THE REACH'], amber, 112, 0, 95, 31);
  sign(['SALTMARKET', 'FREE PORT OF THE REACH'], amber, 112, 4, 95, 32);
  sign(['REACH PATROL', 'WEAPONS COLD WITHIN 5 KM'], '#8fb8ff', 108, 2, -95, 33);
  sign(['BAYS 1 - 48', 'LANDING SPEED 40 M/S'], teal, 100, 6, -95, 34);

  function hangar(k: number, yc: number, uc: number, number: number): void {
    const q = quatY(faceAngle(k));
    const z1 = A + MOD.d;
    const zm = A + MOD.d / 2;
    const hw = MOD.w / 2;
    const hh = MOD.h / 2;
    b.box(P(k, uc, yc - hh + 2.5, zm), v3(MOD.w, 5, MOD.d), dark, { quat: q });
    b.box(P(k, uc, yc + hh - 2.5, zm), v3(MOD.w, 5, MOD.d), sea, { quat: q });
    for (const s of [-1, 1]) {
      b.box(P(k, uc + s * (hw - 3), yc, zm), v3(6, MOD.h, MOD.d), salt, { quat: q });
      // the mouth's frame: amber posts on the wall ends
      b.box(P(k, uc + s * (hw - 3), yc, z1 + 0.3), v3(2, MOD.h - 4, 0.6), amber, { quat: q, glow: 1.5, collide: false });
    }
    b.box(P(k, uc, yc + hh - 2.5, z1 + 0.3), v3(MOD.w - 4, 1.6, 0.6), amber, { quat: q, glow: 1.5, collide: false });
    b.box(P(k, uc, yc - hh + 2.5, z1 + 0.3), v3(MOD.w - 4, 1.6, 0.6), teal, { quat: q, glow: 1.5, collide: false });
    // inside: ceiling lights, guide lights on the deck, the inner door glowing at the back
    for (const dz of [-20, 0, 20]) b.box(P(k, uc, yc + hh - 5.25, zm + dz), v3(MOD.w - 20, 0.5, 2), '#dff4ff', { quat: q, glow: 1.4, collide: false });
    for (let dz = -24; dz <= 24; dz += 12) for (const s of [-1, 1]) b.box(P(k, uc + s * 10, yc - hh + 5.15, zm + dz), v3(1, 0.3, 5), teal, { quat: q, glow: 1.6, collide: false });
    b.box(P(k, uc, yc, A + 0.3), v3(MOD.w - 14, MOD.h - 12, 0.6), '#1f2a3a', { quat: q, collide: false });
    b.box(P(k, uc, yc - 2, A + 0.7), v3(0.8, MOD.h - 18, 0.3), amber, { quat: q, glow: 1.2, collide: false });
    b.box(P(k, uc, yc + hh - 11, A + 0.7), v3(MOD.w - 30, 2, 0.3), teal, { quat: q, glow: 1, collide: false });
    // a control cab on the roof, its window facing the approach
    const cab = uc + (uc > 0 ? -20 : 20);
    b.box(P(k, cab, yc + hh + 3, z1 - 10), v3(16, 6, 12), salt, { quat: q });
    b.box(P(k, cab, yc + hh + 3.5, z1 - 3.9), v3(12, 1.6, 0.3), teal, { quat: q, glow: 1.5, collide: false });
    beacons.push({ position: P(k, uc + (uc > 0 ? 24 : -24), yc + hh + 1, z1 - 2), color: new THREE.Color('#30ff70'), phase: number * 0.37 });

    const out = v3(0, 0, 1).applyQuaternion(q);
    const pad = P(k, uc, yc - hh + 9, zm - 6);
    bays.push({ number, mouth: P(k, uc, yc, z1), out, pad: P(k, uc, yc - hh + 9, A + 14) });
    docks.push({
      id: `saltmarket.bay${number}`,
      name: `Saltmarket, bay ${number}`,
      pad,
      outward: out.clone(),
      up: Y.clone(),
      mouth: z1 - (zm - 6),
      opening: [hw - 7, hh - 6],
      maxSpeed: 45,
    });
  }

  world.addAll(b.colliders);
  const group = b.build('saltmarket');
  for (const s of signs) group.add(s);

  const ring = (r: number, y: number, n: number, phase = 0) => Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return v3(Math.sin(a) * r, y, Math.cos(a) * r);
  });
  return {
    group,
    beacons,
    points: { center: v3(0, 0, 0), tower: v3(0, 380, 0), tanks: v3(0, -345, 0) },
    docks,
    port: {
      bays,
      moorings,
      batteries,
      guns,
      patrols: [
        ring(950, 30, 8),
        // up over the tower and down under the tanks
        [v3(0, 680, 750), v3(950, 0, 750), v3(0, -680, 750), v3(0, -680, -750), v3(-950, 0, -750), v3(0, 680, -750)],
        ring(1700, 160, 10, 0.3),
      ],
      zone: { center: v3(0, 0, 0), radius: 5000, speedLimit: 45 },
    },
  };
}
