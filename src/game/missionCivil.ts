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
export function makeGate(pos: THREE.Vector3, dir: THREE.Vector3, radius: number): THREE.Group {
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

/** A rival in the Ring Run: full throttle at the next gate, boosting on the straights. */
class RacePilot {
  index = 0;
  finished = -1;
  constructor(
    private readonly gates: THREE.Vector3[],
    private readonly g: Game,
    private readonly pace: number,
  ) {}
  update(ship: Ship, dt: number): void {
    void dt;
    const c = ship.controls;
    c.fire = false;
    c.missile = false;
    c.slide = false;
    c.strafeX = 0;
    c.strafeY = 0;
    if (this.finished >= 0) {
      c.throttle = 0.3;
      c.boost = false;
      return;
    }
    const target = this.gates[this.index];
    const to = target.clone().sub(ship.pos);
    const dist = to.length();
    if (dist < RACE_GATE) {
      this.index++;
      if (this.index >= this.gates.length) this.finished = this.g.missionTime;
      return;
    }
    to.normalize();
    const local = to.clone().applyQuaternion(ship.quat.clone().invert());
    c.pitch = Math.max(-1, Math.min(1, Math.atan2(local.y, -local.z) * 3));
    c.yaw = Math.max(-1, Math.min(1, Math.atan2(local.x, -local.z) * 3));
    c.roll = 0;
    const aligned = -local.z > 0.97;
    c.throttle = aligned ? this.pace : 0.55;
    c.boost = aligned && dist > 260 && ship.energy > ship.cls.energy * 0.35;
  }
}

/** How close to a gate's centre counts as through it. */
const RACE_GATE = 24;

/**
 * "The Ring Run" at Kestrel: the dock crews' monthly race. Over and under the spinning habitat
 * ring (mind the spokes), through the rock field, a long boost to the Combine battlecruiser and
 * straight through her hangar tunnel, then home. Three rivals; the purse depends on where you
 * finish.
 */
export async function runCourier(g: Game): Promise<void> {
  const player = g.player as Ship;
  const P = (k: string) => g.points[k];
  const port = P('carrier.hangarPort');
  const starboard = P('carrier.hangarStarboard');
  const tunnel = port.clone().add(starboard).multiplyScalar(0.5);
  // into the tunnel from whichever side faces the rock field
  const rocks = v(-1200, -120, 650);
  const [inSide, outSide] = port.distanceTo(rocks) < starboard.distanceTo(rocks) ? [port, starboard] : [starboard, port];
  // out of the far side of the tunnel, then a loop up and over her spine
  const across = outSide.clone().sub(inSide).normalize();
  const up = v(0, 1, 0);
  const course = [
    v(430, 70, 330),
    v(0, 90, 330),
    v(-150, 0, 40),
    v(-330, -60, -100),
    v(-760, -110, 260),
    v(-1060, -130, 585),
    v(-1330, -90, 800),
    v(-1000, 40, 1150),
    inSide.clone(),
    tunnel.clone(),
    outSide.clone(),
    outSide.clone().addScaledVector(across, 130).addScaledVector(up, 130),
    tunnel.clone().addScaledVector(up, 230),
    inSide.clone().addScaledVector(across, -220).addScaledVector(up, 60),
    v(520, 50, 560),
  ];
  const gates = course.map((p, i) => {
    const next = course[Math.min(i + 1, course.length - 1)];
    const prev = course[Math.max(i - 1, 0)];
    const dir = i === course.length - 1 ? p.clone().sub(prev) : next.clone().sub(prev);
    const gate = makeGate(p, dir, RACE_GATE - 4);
    g.addDecor(gate);
    return gate;
  });
  const grid = v(760, 60, 520);
  const look = course[0];
  g.park(player, grid.clone(), look);
  const rivals: [string, string, number][] = [
    ['warden', 'Pike', 0.97],
    ['wren', 'Mags Okonkwo', 0.95],
    ['kite', 'Tully Brand', 0.92],
  ];
  const racers = rivals.map(([cls, name, pace], i) => {
    const s = g.spawnShip(cls, 'kestrel', name, grid.clone().add(v(-40 + i * 40, i % 2 ? 25 : -25, 40)), look, { speed: 0 });
    g.park(s, s.pos.clone(), look);
    // they race, they do not fight: bumps and scrapes only
    s.invulnerable = true;
    const rp = new RacePilot(course, g, pace);
    s.ai = rp;
    return { ship: s, pilot: rp };
  });
  let index = 0;
  let finished = -1;
  const mark = () => {
    g.waypoints = index < course.length ? [{ name: index === course.length - 1 ? 'FINISH' : `GATE ${index + 1}`, pos: course[index], color: '#ffd36b' }] : [];
    gates.forEach((gt, i) => (gt.visible = i >= index));
  };
  mark();
  g.setMusicIntensity(0.4);
  g.objective = 'The Ring Run · on the grid';
  await g.say('varga', 'Rook, Kestrel Control. The dock crews\' Ring Run is about to start, and you are on the grid. Over and under the habitat ring, mind the spokes, through the rocks, and through the Combine battlecruiser\'s hangar. Yes, they agreed. Do not hit anything that belongs to them.');
  await g.say('pike', 'Rook! Good. I was running out of people to beat. See you at the finish. From the front.');
  g.hint('Gates are marked on your HUD. Boost on the straights, slide through the tight turns', 7);
  await g.say('varga', 'Racers, on my mark. Three. Two. One. Go!');
  const start = g.missionTime;
  for (const r of racers) {
    r.ship.held = false;
    r.ship.controls.throttle = 1;
  }
  player.held = false;
  player.controls.throttle = 1;
  g.setMusicIntensity(0.8);
  const place = () => 1 + racers.filter((r) => r.pilot.finished >= 0 || r.pilot.index > index || (r.pilot.index === index && r.ship.pos.distanceTo(course[index]) < player.pos.distanceTo(course[index]))).length;
  let tunnelCalled = false;
  const limit = 240;
  await g.until(() => {
    if (index < course.length && player.pos.distanceTo(course[index]) < RACE_GATE) {
      g.audio.blip(1320 + index * 40, 0.08, 0.08);
      index++;
      mark();
      if (index >= course.length) finished = g.missionTime;
      if (index === 8 && !tunnelCalled) {
        tunnelCalled = true;
        void g.say('pike', 'Here comes the fun part. Through the hangar, and pray they do not close the doors.').catch(() => undefined);
      }
      if (index === 11) void g.say('varga', 'And now up and over her back. Mind the turrets, they are attached.').catch(() => undefined);
    }
    const t = g.missionTime - start;
    g.objective = `The Ring Run · gate ${Math.min(index + 1, course.length)} of ${course.length} · position ${place()} of ${racers.length + 1} · ${Math.floor(t)} s`;
    return finished >= 0 || t > limit || !player.alive;
  });
  g.waypoints = [];
  g.objective = '';
  if (finished < 0) {
    await g.say('varga', 'Rook, the race is long over. The crews have gone home. Come in.');
    g.endMission('defeat', 'You did not finish the course before the time ran out.');
    return;
  }
  const ahead = racers.filter((r) => r.pilot.finished >= 0 && r.pilot.finished < finished).length;
  const position = ahead + 1;
  const time = Math.round(finished - start);
  g.bonusPay = [6000, 3000, 1500, 0][position - 1];
  if (position === 1) await g.say('varga', `First place, Rook, in ${time} seconds! The purse is yours.`);
  else await g.say('varga', `Rook crosses the line in position ${position}, ${time} seconds. ${position < 4 ? 'There is prize money for that.' : 'No purse, but you finished.'}`);
  if (position === 1) await g.say('pike', 'Next month. Next month I am taking that back.');
  else if (racers[0].pilot.finished >= 0 && racers[0].pilot.finished < finished) await g.say('pike', 'From the front, Rook. As promised.');
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/**
 * "Mayday" in the Ashfall: find escape pods before their air runs out and tow them to the Patrol
 * transport. Pods in tow trail behind you on cables, and each one makes you slower to turn and
 * accelerate. Wake scavengers want the pods too, and only leave when the Patrol turns up.
 */
export async function runRescue(g: Game): Promise<void> {
  const player = g.player as Ship;
  const spots = [v(320, 80, -900), v(-420, -60, -1500), v(500, -150, -2100), v(-200, 180, -2700)];
  const air = [120, 170, 220, 270];
  const pods = spots.map((p) => {
    const m = makePickup('pod');
    m.position.copy(p);
    g.addDecor(m);
    return m;
  });
  const state: ('waiting' | 'towed' | 'lost' | 'delivered')[] = spots.map(() => 'waiting');
  /** Pods in tow, in the order they were hooked: each trails the one in front of it. */
  const chain: number[] = [];
  const cable = new THREE.BufferGeometry();
  cable.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 4), 3));
  const cableLine = new THREE.LineSegments(cable, new THREE.LineBasicMaterial({ color: '#ffd36b', toneMapped: false }));
  cableLine.frustumCulled = false;
  g.addDecor(cableLine);
  const behind = new THREE.Vector3();
  g.onFrame((dt) => {
    for (const [k, m] of pods.entries()) {
      if (state[k] === 'waiting') {
        m.rotation.y += dt * 0.6;
        m.rotation.x += dt * 0.25;
      }
    }
    // the tow: each pod is pulled to a point 14 m behind the thing ahead of it
    const pos = cable.getAttribute('position') as THREE.BufferAttribute;
    let lead = player.pos;
    chain.forEach((k, n) => {
      const m = pods[k];
      behind.copy(m.position).sub(lead);
      const d = behind.length();
      if (d > 14) m.position.copy(lead).addScaledVector(behind.normalize(), 14 + (d - 14) * Math.exp(-dt * 6));
      m.lookAt(lead);
      pos.setXYZ(n * 2, lead.x, lead.y, lead.z);
      pos.setXYZ(n * 2 + 1, m.position.x, m.position.y, m.position.z);
      lead = m.position;
    });
    for (let n = chain.length; n < 4; n++) {
      pos.setXYZ(n * 2, 0, -1e5, 0);
      pos.setXYZ(n * 2 + 1, 0, -1e5, 0);
    }
    pos.needsUpdate = true;
    player.towLoad = chain.length;
  });
  player.placeAt(v(200, 100, 600), spots[0], 80);
  g.setMusicIntensity(0.35);
  await g.say('okafor', 'Contractor, Okafor. A salvage tug blew a reactor in the Ashfall. Four escape pods are drifting in the wrecks and their air will not last. The Patrol cannot get there in time. You can.');
  g.hint('Fly close to a pod to hook it. Pods in tow slow you down and make you turn wider', 8);
  let scavengers: Ship[] = [];
  await g.until(() => {
    const t = g.missionTime;
    spots.forEach((_p, i) => {
      if (state[i] !== 'waiting') return;
      if (player.pos.distanceTo(pods[i].position) < 35) {
        state[i] = 'towed';
        chain.push(i);
        g.audio.blip(1500, 0.12, 0.1);
        g.hint(`Pod ${i + 1} hooked. It breathes off your ship now`, 3);
      } else if (t > air[i]) {
        state[i] = 'lost';
        pods[i].visible = false;
        g.hint(`Pod ${i + 1}: no more signal`, 4);
      }
    });
    const towed = chain.length;
    if (towed >= 2 && !scavengers.length) {
      scavengers = [0, 1, 2, 3, 4, 5].map((i) => g.jumpIn('drone', 'wake', 'Wake scavenger', player.pos.clone().add(v(400 + i * 30, 120, -300)), player.pos, { skill: 0.45, playerBias: 0.7 }));
      scavengers.push(g.jumpIn('raider', 'wake', 'Wake Cutter', player.pos.clone().add(v(500, 160, -360)), player.pos, { skill: 0.5, playerBias: 0.7 }));
      void g.say('vey', 'Pods full of people. People pay ransom. Bring them to me, little drones.').catch(() => undefined);
    }
    g.waypoints = spots
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => state[i] === 'waiting')
      .map(({ i }) => ({ name: `POD ${i + 1} · ${Math.max(0, Math.ceil(air[i] - t))} s`, pos: pods[i].position, color: '#ff8a2a' }));
    g.objective = `Find the escape pods · ${towed} in tow · ${state.filter((s) => s === 'waiting').length} still out there`;
    return state.every((s) => s !== 'waiting');
  });
  if (!chain.length) {
    g.waypoints = [];
    g.objective = '';
    g.retreat(scavengers);
    await g.say('okafor', 'None of them. I am sorry, contractor. You tried.');
    g.endMission('defeat', 'No escape pods reached the Patrol transport. Their air ran out, or the Wake took them.');
    return;
  }
  // the Patrol transport comes to meet you, with an escort the scavengers will not want to face
  const meet = v(100, 120, 300);
  const transport = g.jumpIn('hospital', 'patrol', 'Patrol transport Ministry', meet.clone(), meet.clone().add(v(0, 0, -100)), { speed: 0 });
  await g.say('okafor', 'Transport Ministry is on station. Bring the pods in, contractor. Mind the scavengers, they will try to cut you off.');
  await g.until(() => {
    g.waypoints = [{ name: 'PATROL TRANSPORT', pos: transport.pos, color: '#8fb8ff' }];
    g.objective = `Tow ${chain.length} ${chain.length === 1 ? 'pod' : 'pods'} to the Patrol transport`;
    return player.pos.distanceTo(transport.pos) < 260;
  });
  g.waypoints = [];
  for (const k of chain) {
    state[k] = 'delivered';
    pods[k].visible = false;
  }
  const saved = chain.length;
  chain.length = 0;
  player.towLoad = 0;
  g.objective = '';
  const patrol = [0, 1].map((i) => g.jumpIn('interdictor', 'patrol', `Interdictor ${i + 7}`, transport.pos.clone().add(v(i * 60 - 30, 60, 120)), player.pos, { skill: 0.65, playerBias: 0 }));
  void patrol;
  await g.say('okafor', 'Pods aboard. Interdictors, run those scavengers off.');
  if (scavengers.some((s) => s.alive)) {
    await g.say('vey', 'Patrol cruisers. Not worth it, little drones. Home.');
    g.retreat(scavengers);
  }
  g.bonusPay = saved * 1500;
  await g.say('okafor', saved === 4 ? 'All four pods, all alive. That is a good day, contractor.' : `${saved} of four. They will remember your name, contractor.`);
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/** Wake scavenger tugs: slow, and they carry off any crate they reach. */
const TUG: ShipClass = { ...SHIP_CLASSES.miner, civilian: false, name: 'Wake scavenger tug', shields: 300, shieldRegen: 4, hull: 700, maxSpeed: 58, boostSpeed: 58, radius: 18, bounty: 300 };

/** "Finders Keepers" in Vantage's rock ring: grab the crates of a lost freighter before the Wake do. */
export async function runSalvage(g: Game): Promise<void> {
  const player = g.player as Ship;
  const crates = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    return v(Math.cos(a) * (1250 + (i % 3) * 260), -320 + (i % 3) * 220, Math.sin(a) * (1250 + (i % 3) * 260));
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
  let nextTug = g.missionTime + 4;
  const freeCrates = () => crates.map((p, i) => ({ p, i })).filter(({ i }) => owner[i] === 'free');
  await g.until(() => {
    for (const { p, i } of freeCrates()) {
      if (player.pos.distanceTo(p) < 18) {
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
    if (g.missionTime > nextTug && tugs.length < 6 && freeCrates().length) {
      nextTug = g.missionTime + 14;
      const at = v(-1800 + tugs.length * 300, 200, -900 + tugs.length * 500);
      const t = g.spawnShip(TUG, 'wake', 'Wake scavenger tug', at, v(0, 0, 0), { speed: 30 });
      g.fx.jumpIn(at, at.clone().negate().normalize(), '#ff5a3a');
      g.audio.jumpIn(at);
      tugs.push(t);
      escorts.push(g.jumpIn('raider', 'wake', 'Wake Cutter', at.clone().add(v(60, 30, 0)), player.pos, { skill: 0.55, playerBias: 0.7 }));
      if (tugs.length % 2 === 0) escorts.push(g.jumpIn('fang', 'wake', 'Wake Fang', at.clone().add(v(-60, 40, 20)), player.pos, { skill: 0.6, playerBias: 0.7, flares: 2 }));
      if (tugs.length === 1) void g.say('vey', 'Salvage is for those who can keep it. Tugs, go.').catch(() => undefined);
    }
    const mine = owner.filter((o) => o === 'you').length;
    const theirs = owner.filter((o) => o === 'them').length;
    g.waypoints = freeCrates().map(({ p }) => ({ name: 'CRATE', pos: p, color: '#2fb7ff' }));
    g.objective = `Salvage the crates · yours ${mine} · Wake ${theirs} · ${freeCrates().length} left`;
    return freeCrates().length === 0;
  });
  g.waypoints = [];
  g.retreat([...tugs, ...escorts]);
  const mine = owner.filter((o) => o === 'you').length;
  g.objective = '';
  if (!mine) {
    await g.say('halloran', 'The Wake got all of it. Well. Better luck next time, pilot.');
    g.endMission('defeat', 'The Wake scavengers took every piece of salvage.');
    return;
  }
  g.bonusPay = mine * 500;
  await g.say('halloran', `${mine} crates. Vantage will buy them off you at a fair price. Mostly fair.`);
  await g.wait(1);
  g.endMission('victory');
}
