import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { systemById } from './starmap';

/**
 * Travel between systems. A leg is short: you start by the station, fly to the jump gate on the
 * side of the system facing where you are going, and jump. Sometimes the Red Wake are waiting.
 * The asylum scene is the last leg of a defection.
 */

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

const glow = (color: string, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

/** A jump gate: a heavy ring with a shimmering membrane, spinning slowly. */
function makeJumpGate(g: Game, at: THREE.Vector3, facing: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.TorusGeometry(70, 6, 10, 48), new THREE.MeshStandardMaterial({ color: '#5c6078', roughness: 0.5, metalness: 0.7 }));
  const lights = new THREE.Mesh(new THREE.TorusGeometry(70, 1.5, 6, 48), glow('#7fe9ff', 0.9));
  lights.position.z = 6.5;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(58, 1, 6, 48), glow('#7fe9ff', 0.5));
  const membrane = new THREE.Mesh(new THREE.CircleGeometry(64, 48), glow('#3fb8ff', 0.18));
  group.add(frame, lights, inner, membrane);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(10, 22, 14), new THREE.MeshStandardMaterial({ color: '#3a3e52', roughness: 0.6, metalness: 0.6 }));
    pylon.position.set(Math.cos(a) * 76, Math.sin(a) * 76, 0);
    pylon.rotation.z = a;
    group.add(pylon);
  }
  group.position.copy(at);
  group.quaternion.setFromUnitVectors(v(0, 0, 1), facing.clone().normalize());
  g.addDecor(group);
  g.onFrame((dt) => {
    inner.rotation.z += dt * 0.6;
    membrane.rotation.z -= dt * 0.2;
    (membrane.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(g.time * 2.5) * 0.06;
  });
  return group;
}

/** Where in `from` the gate to `to` stands: out on the side facing it, clear of everything. */
export function gatePosition(g: Game, from: string, to: string): THREE.Vector3 {
  const a = systemById(from);
  const b = systemById(to);
  const dir = v(b.x - a.x, 0, -(b.y - a.y)).normalize();
  const centre = g.location.arena.center.clone();
  const n = new THREE.Vector3();
  let r = 1600;
  let p = centre.clone().addScaledVector(dir, r).add(v(0, 160, 0));
  while (r < 3000 && g.world.nearestSurface(p, 140, n) < 140) {
    r += 150;
    p = centre.clone().addScaledVector(dir, r).add(v(0, 160, 0));
  }
  return p;
}

/** One leg: fly from the station to the gate and jump. */
export async function runTransit(g: Game, from: string, to: string, ambush: boolean): Promise<void> {
  const player = g.player as Ship;
  const gate = gatePosition(g, from, to);
  const start = g.location.start.pos.clone();
  const facing = start.clone().sub(gate).setY(0).normalize();
  makeJumpGate(g, gate, facing);
  player.placeAt(start, gate, 50);
  g.arena.center.copy(start).lerp(gate, 0.5);
  g.arena.warn = Math.max(g.arena.warn, start.distanceTo(gate) * 0.5 + 1600);
  g.arena.limit = g.arena.warn + 800;
  const dest = systemById(to);
  g.waypoints = [{ name: `GATE · ${dest.name.toUpperCase()}`, pos: gate, color: '#7fe9ff' }];
  g.objective = `Fly to the jump gate for ${dest.name}`;
  g.setMusicIntensity(0.15);
  g.hint(`Fly through the gate to jump to ${dest.name}`, 5);
  let raid: Ship[] = [];
  const raidAt = g.missionTime + 6 + Math.random() * 8;
  let raided = false;
  await g.until(() => {
    if (ambush && !raided && g.missionTime > raidAt) {
      raided = true;
      g.setMusicIntensity(0.8);
      const at = player.pos.clone().add(player.forward(new THREE.Vector3()).multiplyScalar(600)).add(v(200, 80, 0));
      const n = 2 + Math.floor(Math.random() * 3);
      raid = Array.from({ length: n }, (_, i) =>
        g.jumpIn(i === 0 && Math.random() < 0.4 ? 'fang' : 'raider', 'wake', 'Wake gate-jacker', at.clone().add(v(i * 50 - 50, (i % 2) * 30, i * 30)), player.pos, { skill: 0.5, playerBias: 0.8, flares: 1 }),
      );
      void g.say('vey', 'Toll gate, pilot. Everything you have, or everything you are.').catch(() => undefined);
    }
    if (raided) {
      const left = raid.filter((s) => s.alive).length;
      g.objective = left ? `Wake gate-jackers · ${left} left · or run for the gate` : `Fly to the jump gate for ${dest.name}`;
    }
    return player.pos.distanceTo(gate) < 60;
  });
  g.waypoints = [];
  g.objective = '';
  g.fx.jumpIn(player.pos, player.forward(new THREE.Vector3()), '#7fe9ff');
  g.audio.jumpIn(player.pos);
  player.invulnerable = true;
  player.held = true;
  g.fade(true, `Jumping to ${dest.name}`);
  await g.wait(1.4);
  g.endMission('victory');
}

/** The end of a defection: you come through the gate at the other side's home and ask in. */
export async function runAsylum(g: Game, to: 'combine' | 'drift', from: string): Promise<void> {
  const player = g.player as Ship;
  const gate = gatePosition(g, g.location.id, from);
  const centre = g.location.arena.center.clone();
  makeJumpGate(g, gate, centre.clone().sub(gate).setY(0).normalize());
  player.placeAt(gate.clone().add(centre.clone().sub(gate).normalize().multiplyScalar(80)), centre, 40);
  g.fx.jumpIn(player.pos, player.forward(new THREE.Vector3()), '#7fe9ff');
  g.setMusicIntensity(0.2);
  g.objective = to === 'drift' ? 'Ask the Drift Union for sanctuary' : 'Offer your services to the Helion Combine';
  await g.wait(1);
  if (to === 'drift') {
    await g.say('kit', 'Haven traffic, we have a contractor coming through the gate. Rook? Is that you?');
    await g.say('sorrel', 'A Combine pilot at my door, asking to come in from the cold. If you mean it, Rook, you are welcome. We have room for anyone who has seen what they are.');
  } else {
    await g.say('quell', 'Bastion control. Contractor on the Drift side of the gate, transponder Rook. Hold position.');
    await g.say('tessaine', 'Rook. You have flown against us long enough to know how we do things. The Combine pays its people, and it does not forget them. Welcome aboard.');
  }
  g.objective = '';
  await g.wait(1);
  g.missionFlags.defect = to;
  g.endMission('victory');
}
