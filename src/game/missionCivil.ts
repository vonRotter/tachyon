import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';

/**
 * Civilian odd jobs: one-shot cash work with no strings attached. A courier run through gates,
 * a search for escape pods, and a salvage race. Nothing you do here changes the story.
 */

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

const glow = (color: string, opacity = 1): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

/** A holographic gate: a ring you fly through, facing along `dir`. */
function makeGate(pos: THREE.Vector3, dir: THREE.Vector3, radius: number): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 1.2, 6, 40), glow('#ffd36b', 0.9));
  const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.8, 0.3, 4, 40), glow('#ffd36b', 0.4));
  g.add(ring, inner);
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(v(0, 0, 1), dir.clone().normalize());
  return g;
}

/** A small glowing object to pick up (pod or crate) that turns slowly. */
function makePickup(kind: 'pod' | 'crate'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'pod') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 2.6, 4, 10), new THREE.MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.5, metalness: 0.4 }));
    body.rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.25, 4, 16), glow('#ff8a2a'));
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), glow('#ff3348'));
    light.position.set(0, 1.6, 0);
    g.add(body, band, light);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), new THREE.MeshStandardMaterial({ color: '#2fb7ff', roughness: 0.6, metalness: 0.3 }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(5.2, 4.2, 4.2)), new THREE.LineBasicMaterial({ color: '#ffd36b', toneMapped: false }));
    g.add(box, edge);
  }
  return g;
}

// =============================================================================================

/** "Hot Cargo" at Kestrel: a cold-chain courier run through ten gates against the clock. */
export async function runCourier(g: Game): Promise<void> {
  const player = g.player as Ship;
  const route = [
    v(560, 60, 260),
    v(320, 140, 620),
    v(-180, 220, 560),
    v(-520, 300, 120),
    v(-260, 380, -360),
    v(240, 280, -560),
    v(640, 80, -320),
    v(560, -160, 120),
    v(120, -300, 420),
    v(-380, -180, 300),
  ];
  const gates = route.map((p, i) => {
    const next = route[(i + 1) % route.length];
    const gate = makeGate(p, next.clone().sub(p), 26);
    g.addDecor(gate);
    return gate;
  });
  player.placeAt(v(760, 40, 120), route[0], 80);
  let index = 0;
  const limit = 80;
  let started = -1;
  g.setMusicIntensity(0.5);
  g.objective = 'Fly the gates';
  await g.say('varga', 'Rook, Kestrel Control. Cold-chain serum for the hospital deck, and the cooler on it is failing. Ten gates round the station, and the clock starts at the first one. Do not dawdle.');
  g.hint('Gates are marked on your HUD. Boost between them, slow down for the tight turns', 7);
  const mark = () => {
    g.waypoints = index < gates.length ? [{ name: `GATE ${index + 1}`, pos: route[index], color: '#ffd36b' }] : [];
    gates.forEach((gt, i) => (gt.visible = i >= index));
  };
  mark();
  let failed = false;
  await g.until(() => {
    if (player.pos.distanceTo(route[index]) < 30) {
      if (started < 0) started = g.missionTime;
      g.audio.blip(1320 + index * 60, 0.08, 0.08);
      index++;
      mark();
    }
    const left = started < 0 ? limit : limit - (g.missionTime - started);
    g.objective = `Fly the gates · ${index} of ${gates.length} · ${Math.max(0, Math.ceil(left))} s`;
    if (left <= 0) failed = true;
    return index >= gates.length || failed;
  });
  g.waypoints = [];
  if (failed) {
    g.objective = '';
    await g.say('varga', 'Too slow, Rook. The serum has warmed past use. We will find another batch.');
    g.endMission('defeat');
    return;
  }
  const spare = Math.max(0, Math.round(limit - (g.missionTime - started)));
  g.bonusPay = spare * 120;
  g.objective = '';
  await g.say('varga', `Serum is in, with ${spare} seconds to spare. The hospital deck owes you one, Rook.`);
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/** "Mayday" in the Ashfall: find escape pods before their air runs out, while scavengers prowl. */
export async function runRescue(g: Game): Promise<void> {
  const player = g.player as Ship;
  const spots = [v(320, 80, -900), v(-420, -60, -1500), v(500, -150, -2100), v(-200, 180, -2700)];
  const air = [150, 210, 260, 320];
  const pods = spots.map((p) => {
    const m = makePickup('pod');
    m.position.copy(p);
    g.addDecor(m);
    return m;
  });
  const state: ('waiting' | 'saved' | 'lost')[] = spots.map(() => 'waiting');
  g.onFrame((dt) => {
    for (const m of pods) {
      m.rotation.y += dt * 0.6;
      m.rotation.x += dt * 0.25;
    }
  });
  player.placeAt(v(200, 100, 600), spots[0], 80);
  g.setMusicIntensity(0.35);
  await g.say('okafor', 'Contractor, Okafor. A salvage tug blew a reactor in the Ashfall. Four escape pods are drifting in the wrecks and their air will not last. The Patrol cannot get there in time. You can.');
  g.hint('Fly close to a pod to take it in tow. Each pod has its own air supply', 7);
  let scavengers: Ship[] = [];
  await g.until(() => {
    const t = g.missionTime;
    spots.forEach((p, i) => {
      if (state[i] !== 'waiting') return;
      if (player.pos.distanceTo(p) < 35) {
        state[i] = 'saved';
        pods[i].visible = false;
        g.audio.blip(1500, 0.12, 0.1);
        g.hint(`Pod ${i + 1} in tow`, 3);
      } else if (t > air[i]) {
        state[i] = 'lost';
        pods[i].visible = false;
        g.hint(`Pod ${i + 1}: no more signal`, 4);
      }
    });
    const saved = state.filter((s) => s === 'saved').length;
    if (saved >= 2 && !scavengers.length) {
      scavengers = [0, 1, 2, 3, 4, 5].map((i) => g.jumpIn('drone', 'wake', 'Wake scavenger', player.pos.clone().add(v(400 + i * 30, 120, -300)), player.pos, { skill: 0.45, playerBias: 0.6 }));
      void g.say('vey', 'Pods full of people. People pay ransom. Bring them to me, little drones.').catch(() => undefined);
    }
    g.waypoints = spots
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => state[i] === 'waiting')
      .map(({ p, i }) => ({ name: `POD ${i + 1} · ${Math.max(0, Math.ceil(air[i] - t))} s`, pos: p, color: '#ff8a2a' }));
    g.objective = `Find the escape pods · ${saved} saved · ${state.filter((s) => s === 'waiting').length} still out there`;
    return state.every((s) => s !== 'waiting');
  });
  g.waypoints = [];
  for (const s of scavengers) if (s.alive) g.jumpOut(s);
  const saved = state.filter((s) => s === 'saved').length;
  g.objective = '';
  if (!saved) {
    await g.say('okafor', 'None of them. I am sorry, contractor. You tried.');
    g.endMission('defeat');
    return;
  }
  g.bonusPay = saved * 1500;
  await g.say('okafor', saved === 4 ? 'All four pods, all alive. That is a good day. Patrol transport is on the way for them.' : `${saved} of four. They will remember your name, contractor.`);
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/** Wake scavenger tugs: slow, and they carry off any crate they reach. */
const TUG: ShipClass = { ...SHIP_CLASSES.miner, civilian: false, name: 'Wake scavenger tug', shields: 150, shieldRegen: 0, hull: 500, maxSpeed: 40, boostSpeed: 40, radius: 18, bounty: 800 };

/** "Finders Keepers" in Vantage's rock ring: grab the crates of a lost freighter before the Wake do. */
export async function runSalvage(g: Game): Promise<void> {
  const player = g.player as Ship;
  const crates = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    return v(Math.cos(a) * (1250 + (i % 3) * 120), -260 + (i % 2) * 90, Math.sin(a) * (1250 + (i % 3) * 120));
  });
  const meshes = crates.map((p) => {
    const m = makePickup('crate');
    m.position.copy(p);
    g.addDecor(m);
    return m;
  });
  const owner: ('free' | 'you' | 'them')[] = crates.map(() => 'free');
  g.onFrame((dt) => {
    for (const m of meshes) m.rotation.y += dt * 0.4;
  });
  player.placeAt(v(1600, 0, 600), crates[0], 80);
  g.setMusicIntensity(0.4);
  await g.say('halloran', 'Pilot, Vantage here. A freighter broke up in our rock ring last week and its cargo is still drifting out there. Salvage law says finders keepers. The Wake read the same law.');
  g.hint('Fly through a crate to grab it. Wake tugs take any crate they reach, so shoot the tugs', 7);
  const tugs: Ship[] = [];
  const escorts: Ship[] = [];
  let nextTug = g.missionTime + 12;
  const freeCrates = () => crates.map((p, i) => ({ p, i })).filter(({ i }) => owner[i] === 'free');
  await g.until(() => {
    for (const { p, i } of freeCrates()) {
      if (player.pos.distanceTo(p) < 25) {
        owner[i] = 'you';
        meshes[i].visible = false;
        g.audio.blip(1400, 0.1, 0.08);
      }
    }
    // tugs head for the nearest free crate and take it on arrival
    for (const t of tugs) {
      if (!t.alive) continue;
      const free = freeCrates();
      if (!free.length) break;
      const near = free.reduce((a, b) => (a.p.distanceTo(t.pos) < b.p.distanceTo(t.pos) ? a : b));
      const current = t.ai as (RoutePilot & { target?: number }) | null;
      if (current?.target !== near.i) {
        const pilot = new RoutePilot([near.p.clone()], 1, 30) as RoutePilot & { target?: number };
        pilot.target = near.i;
        t.ai = pilot;
      }
      if (t.pos.distanceTo(near.p) < 45) {
        owner[near.i] = 'them';
        meshes[near.i].visible = false;
        g.hint('A Wake tug grabbed a crate!', 3);
      }
    }
    if (g.missionTime > nextTug && tugs.length < 4 && freeCrates().length) {
      nextTug = g.missionTime + 25;
      const at = v(-1800 + tugs.length * 300, 200, -900 + tugs.length * 500);
      const t = g.spawnShip(TUG, 'wake', 'Wake scavenger tug', at, v(0, 0, 0), { speed: 30 });
      g.fx.jumpIn(at, at.clone().negate().normalize(), '#ff5a3a');
      g.audio.jumpIn(at);
      tugs.push(t);
      escorts.push(g.jumpIn('raider', 'wake', 'Wake Cutter', at.clone().add(v(60, 30, 0)), player.pos, { skill: 0.5, playerBias: 0.6 }));
      if (tugs.length === 1) void g.say('vey', 'Salvage is for those who can keep it. Tugs, go.').catch(() => undefined);
    }
    const mine = owner.filter((o) => o === 'you').length;
    const theirs = owner.filter((o) => o === 'them').length;
    g.waypoints = freeCrates().map(({ p }) => ({ name: 'CRATE', pos: p, color: '#2fb7ff' }));
    g.objective = `Salvage the crates · yours ${mine} · Wake ${theirs} · ${freeCrates().length} left`;
    return freeCrates().length === 0;
  });
  g.waypoints = [];
  for (const s of [...tugs, ...escorts]) if (s.alive) g.jumpOut(s);
  const mine = owner.filter((o) => o === 'you').length;
  g.objective = '';
  if (!mine) {
    await g.say('halloran', 'The Wake got all of it. Well. Better luck next time, pilot.');
    g.endMission('defeat');
    return;
  }
  g.bonusPay = mine * 1500;
  await g.say('halloran', `${mine} crates. Vantage will buy them off you at a fair price. Mostly fair.`);
  await g.wait(1);
  g.endMission('victory');
}
