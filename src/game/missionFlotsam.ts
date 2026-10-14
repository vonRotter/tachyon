import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, WaypointPilot } from '../entities/ai';
import type { CapitalShip } from '../entities/capitalShip';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive).length;

/** Little bits of wreckage that drift alongside you on the approach (scenery, no collision). */
function debrisStream(g: Game, around: THREE.Vector3, vel: THREE.Vector3): void {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#6d6a72', roughness: 0.8, metalness: 0.3, flatShading: true });
  const count = 90;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const pos: THREE.Vector3[] = [];
  const spin: THREE.Vector3[] = [];
  const scale: number[] = [];
  const rot: THREE.Euler[] = [];
  for (let i = 0; i < count; i++) {
    pos.push(around.clone().add(v((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 260, (Math.random() - 0.5) * 900)));
    spin.push(v(Math.random(), Math.random(), Math.random()).multiplyScalar(0.6));
    scale.push(1.5 + Math.random() * Math.random() * 9);
    rot.push(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const update = (dt: number) => {
    for (let i = 0; i < count; i++) {
      pos[i].addScaledVector(vel, dt);
      rot[i].x += spin[i].x * dt;
      rot[i].y += spin[i].y * dt;
      m.compose(pos[i], q.setFromEuler(rot[i]), sc.setScalar(scale[i]));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  mesh.frustumCulled = false;
  g.addDecor(mesh);
  g.onFrame(update);
}

/**
 * "Flotsam" (Drift Union path). Drift in cold with the wreckage, slip into the Combine carrier
 * Meridian's recovery deck, take the transfer records, and run for the Drift battlecruiser Long
 * Patience across the Ashfall while the carrier and its wings throw everything at you. On board,
 * switch ships if you like, and launch again to defend her.
 */
export async function runFlotsam(g: Game, checkpoint: number): Promise<void> {
  const pad = () => g.input.device === 'gamepad';
  const key = (a: Parameters<typeof g.input.label>[0]) => g.input.label(a);
  const player = g.player as Ship;
  g.friendlyFireLimit = 600;
  // you are flying for the Drift into Combine space: everyone with a Combine transponder is an enemy
  g.setRelation('combine', 'player', true);
  g.setRelation('combine', 'drift', true);

  // the hostile carrier, guns cold until the alarm, and the Drift battlecruiser off its bow
  // the fork opens towards where you drift in from; the Long Patience waits beyond its stern
  const meridian = g.spawnCapital('carrier', 'combine', 'meridian', 'Meridian', v(0, 0, 0), v(0, 0, 100), { armed: false });
  const patience = g.spawnCapital('battlecruiser', 'drift', 'patience', 'Long Patience', v(150, 100, -4500), v(150, 100, -4000), { armed: false });
  const combineWing: Ship[] = [];
  const launchFrom = (cap: CapitalShip, cls: string, faction: 'combine' | 'drift', name: string, n: number, opts: { skill: number; playerBias: number; tactic?: 'standoff' | 'flanker' | 'swarm' }): Ship[] => {
    const out: Ship[] = [];
    if (cap.hangarDown) return out;
    for (let i = 0; i < n; i++) {
      const bay = cap.bays[i % cap.bays.length];
      const p = cap.toWorld(bay.pos);
      const dir = bay.out.clone().transformDirection(cap.root.matrixWorld);
      const s = g.spawnShip(cls, faction, name, p, p.clone().add(dir), { ...opts, speed: 0, damageScale: faction === 'drift' ? 0.6 : 1 });
      s.placeAt(p, p.clone().add(dir), 0);
      s.missiles = Math.min(s.missiles, 4);
      g.catapult(s);
      out.push(s);
    }
    return out;
  };

  if (checkpoint === 0) {
    g.setMusicIntensity(0.12);
    // patrols circle the carrier without knowing you are there
    for (const [r, y, n] of [
      [520, 60, 'Meridian picket'],
      [700, -80, 'Meridian picket'],
    ] as const) {
      const ring: THREE.Vector3[] = [];
      for (let k = 0; k < 8; k++) ring.push(v(Math.cos((k / 8) * Math.PI * 2) * r, y, Math.sin((k / 8) * Math.PI * 2) * r * 1.4));
      for (let j = 0; j < 2; j++) {
        const s = g.spawnShip('sabre', 'combine', n, ring[j * 4].clone(), ring[j * 4 + 1], { speed: 60 });
        s.ai = new WaypointPilot([...ring.slice(j * 4), ...ring.slice(0, j * 4)], 0.55);
        combineWing.push(s);
      }
    }
    // start drifting with the wreckage, engines cold, towards the open fork
    const mouth = meridian.toWorld(v(0, -8, -80));
    const start = v(240, 40, 2600);
    const drift = mouth.clone().sub(start).normalize().multiplyScalar(60);
    player.placeAt(start, mouth, 0);
    player.vel.set(0, 0, 0);
    player.controls.throttle = 0;
    debrisStream(g, start.clone().addScaledVector(drift, 6), drift);
    // you ride the stream in the lee of a big rock: the current carries you both, so zero
    // throttle keeps you with it and your own flying is relative to the wreckage
    let carried = true;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(16, 1),
      new THREE.MeshStandardMaterial({ color: '#5c5560', roughness: 0.9, metalness: 0.2, flatShading: true }),
    );
    const rockOffset = v(-34, -12, 8).applyQuaternion(player.quat);
    rock.position.copy(start).add(rockOffset);
    rock.scale.set(1.3, 0.8, 1.1);
    g.addDecor(rock);
    g.onFrame((dt) => {
      rock.position.addScaledVector(drift, dt);
      rock.rotation.x += dt * 0.05;
      rock.rotation.y += dt * 0.03;
      if (carried && player.alive) player.pos.addScaledVector(drift, dt);
    });

    // the signature meter: engines, guns and getting close to a picket all show up
    let signature = 0;
    let spotted = false;
    g.signature = 0;
    g.onFrame((dt) => {
      if (g.signature === null || spotted) return;
      const c = player.controls;
      let heat = 0;
      heat += Math.max(0, c.throttle) * 0.9;
      if (player.boosting) heat += 1.6;
      if (Math.abs(c.strafeX) + Math.abs(c.strafeY) > 0.1) heat += 0.08;
      if (c.fire) heat += 2;
      for (const s of combineWing) {
        if (!s.alive) continue;
        const d = s.pos.distanceTo(player.pos);
        if (d < 380) heat += 0.35 * (1 - d / 380);
      }
      signature = Math.max(0, signature + (heat > 0.02 ? heat * 0.45 : -0.12) * dt);
      g.signature = Math.min(1, signature);
      if (signature >= 1) spotted = true;
    });

    g.objective = 'Drift in with the wreckage. Keep your engines cold';
    g.hint(
      pad()
        ? 'The stream carries you: keep the throttle at zero and stay by the rock. Look and roll all you like; boosting or firing will give you away'
        : `The stream carries you: keep the throttle at zero and stay by the rock. Look and roll all you like; small strafes (${key('strafeLeft')}/${key('strafeRight')}) are quiet. Boosting or firing will give you away`,
      10,
    );
    await g.say('sorrel', 'Rook. The transfer records are aboard the Meridian. Drift in with the wreckage, engines cold. Any burn and their sensors will see you.');
    await g.say('kit', 'We will be waiting at the Long Patience. Do not make us come and get you.');
    await g.until(() => spotted || player.pos.distanceTo(mouth) < 560);
    if (spotted) {
      g.signature = null;
      await g.say('meridian', 'Contact in the debris stream! Unknown fighter, running dark. Wings, intercept!');
      carried = false;
      g.hint('You were spotted. Try again: drift, do not burn', 6);
      await g.wait(2);
      g.endMission('defeat', 'The carrier spotted you in the debris stream. Keep the throttle at zero and stay by the rock; boosting or firing gives you away.');
      return;
    }
    g.signature = null;
    // off the rock: keep the stream's momentum as your own
    carried = false;
    player.vel.add(drift);
    g.setMusicIntensity(0.4);
    await g.say('sorrel', 'Now, Rook! Light your engines and get inside before they react!');
    g.objective = 'Get inside the Meridian: land on the deck between her prongs';
    const port = g.docking.ports.find((p) => p.id === 'meridian.hangar');
    g.allowDocking(['meridian.hangar']);
    if (port) g.docking.begin(port);
    await g.dock(['meridian.hangar']);
    g.objective = 'Grabbing the package';
    await g.wait(2.5);
    g.hint('Package aboard', 2);
  }

  // --- the run ----------------------------------------------------------------------------------
  if (checkpoint <= 1) {
    g.checkpoint = 1;
    g.setMusicIntensity(1);
    if (checkpoint === 1) {
      // retry: start just outside the carrier's bow with the alarm already up
      player.placeAt(meridian.toWorld(v(160, 40, 0)), patience.toWorld(v(0, 0, 0)), 120);
    } else {
      // emergency launch straight back out of the fork
      g.closeDocking();
      g.catapult(player);
    }
    await g.say('meridian', 'Intruder on the recovery deck! All wings, scramble! Gun crews, weapons free!');
    g.armCapital(meridian, true, 0.65);
    g.objective = 'RUN. Reach the Long Patience';
    g.hint(pad() ? 'You are outgunned. Do not stop to fight. Boost and weave through the wreckage!' : `You are outgunned. Do not stop to fight. ${key('boost')} to boost and weave through the wreckage!`, 8);
    void g.say('sorrel', 'Do not turn and fight, Rook. Fly! Use the wreckage!');
    // fighters pour out of the bow in waves
    const waves = [4, 4, 4];
    let launched = 0;
    let nextWave = g.missionTime + 1;
    let escorts: Ship[] = [];
    let patienceArmed = false;
    const goal = () => patience.toWorld(v(70, -20, -75));
    g.onFrame(() => {
      if (launched < waves.length && g.missionTime > nextWave) {
        const n = waves[launched++];
        combineWing.push(...launchFrom(meridian, 'sabre', 'combine', 'Meridian Sabre', n, { skill: 0.55, playerBias: 1, tactic: launched % 2 ? 'flanker' : 'swarm' }));
        nextWave = g.missionTime + 9;
      }
      const d = player.pos.distanceTo(goal());
      if (g.objective.startsWith('RUN')) g.objective = `RUN. Reach the Long Patience · ${(d / 1000).toFixed(1)} km`;
      if (!escorts.length && d < 2200) {
        escorts = launchFrom(patience, 'gannet', 'drift', 'Drift escort', 3, { skill: 0.65, playerBias: 0, tactic: 'flanker' });
        void g.say('kit', 'Kit here, we see you! Coming out to cover you. Keep coming!');
      }
      if (!patienceArmed && d < 1700) {
        patienceArmed = true;
        g.armCapital(patience, true, 0.6);
        void g.say('sorrel', 'Long Patience, all batteries, cover that pilot!');
      }
    });
    await g.until(() => player.pos.distanceTo(goal()) < 1300);
    g.objective = 'Land on the Long Patience';
    g.hint(pad() ? 'Press X for docking clearance' : `Press ${key('dock')} for docking clearance`, 6);
    await g.dock(['patience.hangar']);
  }

  // --- aboard, then out again to defend her ---------------------------------------------------
  g.checkpoint = 2;
  g.setMusicIntensity(0.5);
  if (checkpoint === 2) {
    g.armCapital(meridian, true, 0.65);
    g.armCapital(patience, true, 0.6);
    const port = g.docking.ports.find((p) => p.id === 'patience.hangar');
    g.allowDocking(['patience.hangar']);
    if (port) {
      g.docking.begin(port);
      const f = g.docking.frame(port, { pad: v(0, 0, 0), outward: v(0, 0, 0), up: v(0, 0, 0) });
      player.placeAt(f.pad.clone().addScaledVector(f.outward, 40), f.pad, 20);
    }
    await g.dock(['patience.hangar']);
  }
  await g.say('sorrel', 'You made it. Give me that package. Now, can you fly one more? They are coming for the ship.');
  g.objective = 'Choose a ship';
  await g.say('magpie', 'We loaded everything you own, Rook. Take your pick.');
  await g.chooseShip();
  g.objective = 'Defend the Long Patience';
  g.closeDocking();
  const me = g.player as Ship;
  g.catapult(me);
  g.setMusicIntensity(1);
  const strike = launchFrom(meridian, 'sabre', 'combine', 'Meridian Sabre', 6, { skill: 0.6, playerBias: 0.5, tactic: 'standoff' });
  for (const s of strike) (s.ai as AIPilot).patrolPoint.copy(patience.toWorld(v(0, 0, 0)));
  combineWing.push(...strike);
  await g.say('tessaine', 'Meridian, this is Tessaine. Recover those records. Sink that hauler if you have to.');
  // the pickets join the attack too
  for (const s of combineWing) {
    if (s.alive && !(s.ai instanceof AIPilot)) {
      const ai = new AIPilot(g, 0.5);
      ai.tactic = 'flanker';
      ai.patrolPoint.copy(patience.toWorld(v(0, 0, 0)));
      s.ai = ai;
    }
  }
  const deadline = g.missionTime + 90;
  await g.until(() => {
    const left = alive(combineWing);
    g.objective = `Defend the Long Patience · ${left} fighters left · hold ${Math.max(0, Math.ceil(deadline - g.missionTime))} s`;
    return left === 0 || g.missionTime > deadline;
  });
  g.objective = '';
  g.armCapital(meridian, false);
  g.retreat(combineWing);
  await g.say('meridian', 'All wings, disengage. Meridian is withdrawing.');
  await g.say('sorrel', 'They are pulling back. Rook, you have just handed the Drift the one thing the Combine cannot buy back. Come home.');
  g.missionFlags.records = 'stolen';
  await g.wait(1);
  g.endMission('victory');
}
