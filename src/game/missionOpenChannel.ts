import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const sweep = (g: Game, ships: Ship[]): void => {
  for (const s of ships) if (s.alive) g.jumpOut(s);
};

/** The transmitter at each dish's focus. */
const UPLINK: ShipClass = { ...SHIP_CLASSES.relay, id: 'uplink', name: 'Uplink transmitter', hull: 700, shields: 300, radius: 13, bounty: 2000 };
/** Seconds of upload with all three dishes up; fewer dishes, slower upload. */
const UPLOAD_TIME = 200;

/**
 * "Open Channel" (both paths) at Vantage, a research station with the only dish array that can
 * reach every station in the Reach at once. The Drift broadcast the Combine's transfer records
 * from it. On the Drift side you hold off the Combine until the upload finishes; on the Combine
 * side you have to silence the three transmitters before it does.
 */
export async function runOpenChannel(g: Game, checkpoint: number, side: 'combine' | 'drift'): Promise<void> {
  void checkpoint;
  const P = (k: string) => g.points[`vantage.${k}`];
  const player = g.player as Ship;
  g.setRelation('combine', 'drift', true);
  g.setRelation(side === 'combine' ? 'drift' : 'combine', 'player', true);
  g.friendlyFireLimit = 300;

  const dishes: Ship[] = [0, 1, 2].map((i) => g.spawnShip(UPLINK, 'drift', `Uplink ${['A', 'B', 'C'][i]}`, P(`dish${i}`).clone(), P('array'), {}));
  // point defence on the spine
  const guns: Ship[] = [
    v(26, 30, -200),
    v(-26, -30, -40),
    v(26, -30, 120),
    v(-26, 30, 220),
  ].map((p) => g.spawnShip('turret', 'drift', 'Vantage point-defence', p, p.clone().multiplyScalar(2), { turret: true, skill: 0.45, playerBias: 0.4 }));
  void guns;

  let progress = 0;
  g.onFrame((dt) => {
    if (g.state !== 'playing') return;
    progress = Math.min(1, progress + (dt / UPLOAD_TIME) * (dishes.filter((d) => d.alive).length / 3));
  });
  const pct = () => `${Math.floor(progress * 100)}%`;
  const dishesLeft = () => dishes.filter((d) => d.alive).length;

  if (side === 'drift') {
    // the Drift hardened the array before they came: it soaks a lot more than it looks like
    for (const d of dishes) d.damageScale = 0.3;
    player.placeAt(v(-260, 120, 420), P('array'), 60);
    const wing = [0, 1, 2].map((i) => g.spawnShip('gannet', 'drift', i === 0 ? 'Kit' : 'Drift escort', v(-300 - i * 40, 100, 460 + i * 30), P('array'), { skill: 0.6, playerBias: 0, damageScale: 0.6 }));
    for (const s of wing) s.missiles = 4;
    g.setMusicIntensity(0.3);
    g.objective = 'Protect the uplink';
    await g.say('sorrel', 'Vantage has the only array in the Reach that can reach every station at once. Doctor Halloran has agreed to let us use it. Four minutes, Rook, and everyone knows what the Combine paid the Wake.');
    await g.say('halloran', 'Agreed is a strong word, Mother Sorrel. The array is aligning. Please keep the shooting away from my labs.');
    await g.say('kit', 'Kit and two more on the array. Here they come.');
    const status = () => (g.objective = `Protect the uplink · upload ${pct()} · ${dishesLeft()} of 3 dishes`);
    g.onFrame(status);
    const waves: Ship[] = [];
    const aimAt = (s: Ship) => {
      if (s.ai instanceof AIPilot) {
        const targets = dishes.filter((d) => d.alive);
        if (targets.length) s.ai.forcedTarget = targets[Math.floor(Math.random() * targets.length)];
      }
    };
    // wave 1: drones and a pair of Sabres
    g.setMusicIntensity(0.7);
    await g.say('tessaine', 'Vantage Station, this is the Sovereign Dawn. Power down your array. This is your only warning.');
    await g.say('halloran', 'Commander, this is a research station. We broadcast what we are paid to broadcast.');
    for (let i = 0; i < 10; i++) waves.push(g.jumpIn('drone', 'combine', 'Combine drone', v(900 + (i % 5) * 30, 200 + Math.floor(i / 5) * 40, -700), P('array'), { skill: 0.45, playerBias: 0.3 }));
    for (let i = 0; i < 2; i++) waves.push(g.jumpIn('sabre', 'combine', 'Combine Sabre', v(1000, 260 + i * 40, -760), P('array'), { skill: 0.55, playerBias: 0.4, tactic: 'standoff' }));
    await g.until(() => progress >= 0.35 || dishesLeft() === 0);
    // wave 2: Sabres sent at the dishes
    if (dishesLeft()) {
      await g.say('meridian', 'Sabre flight, target the dishes. Leave the station standing.');
      for (let i = 0; i < 4; i++) {
        const s = g.jumpIn('sabre', 'combine', 'Combine Sabre', v(-800 + i * 40, -200, 900), P('array'), { skill: 0.6, playerBias: 0.5, tactic: 'standoff' });
        if (i < 2) aimAt(s);
        waves.push(s);
      }
      g.hint('Sabres are going for the dishes. Get on their tails', 6);
    }
    await g.until(() => progress >= 0.65 || dishesLeft() === 0);
    // wave 3: a frigate
    if (dishesLeft()) {
      const pos = v(700, 300, 1100);
      const frigate = g.spawnCapital('frigate', 'combine', 'lance', 'Lance of Helion', pos, P('array'), { armed: true, skill: 0.55 });
      g.fx.jumpIn(pos, v(-0.5, -0.2, -0.8).normalize(), '#8fd8ff');
      g.audio.jumpIn(pos);
      frigate.goal = P('array').clone();
      frigate.speed = 25;
      await g.say('kit', 'Frigate! Combine frigate jumping in on the array!');
      await g.say('sorrel', 'Its guns, Rook. Take out its guns before it gets in range of the dishes.');
      for (let i = 0; i < 6; i++) waves.push(g.jumpIn('drone', 'combine', 'Combine drone', pos.clone().add(v(i * 25 - 60, -40, -60)), P('array'), { skill: 0.45, playerBias: 0.4 }));
      g.onFrame(() => {
        // the frigate stops at standoff range
        if (frigate.root.position.distanceTo(P('array')) < 950) frigate.speed = 0;
      });
    }
    await g.until(() => progress >= 1 || dishesLeft() === 0);
    g.objective = '';
    if (!dishesLeft()) {
      await g.say('halloran', 'The array is gone. All three dishes. I am sorry, Mother Sorrel.');
      g.endMission('defeat');
      return;
    }
    for (const cap of g.capitals) g.armCapital(cap, false);
    sweep(g, waves);
    await g.say('halloran', 'Upload complete. It is out. Every station in the Reach has it.');
    await g.say('sorrel', 'Then let them read. Thank you, Rook. Thank you, Doctor.');
    await g.say('tessaine', 'All Combine units, withdraw. Vantage, you will regret this.');
    g.missionFlags.records = 'broadcast';
  } else {
    player.placeAt(v(900, 200, -1200), P('array'), 80);
    const wing = [0, 1].map((i) => g.spawnShip('sabre', 'combine', i === 0 ? 'Lt. Vale' : 'Lance 2', v(940 + i * 40, 220, -1240), P('array'), { skill: 0.6, playerBias: 0, damageScale: 0.6 }));
    void wing;
    const defenders: Ship[] = [];
    defenders.push(g.spawnShip('gannet', 'drift', 'Kit', v(-120, 80, 380), P('array'), { skill: 0.6, playerBias: 0.6 }));
    defenders.push(g.spawnShip('gannet', 'drift', 'Drift escort', v(-60, -60, 420), P('array'), { skill: 0.55, playerBias: 0.5 }));
    defenders.push(g.spawnShip('bulwark', 'drift', 'Drift gunboat', v(80, 40, 440), P('array'), { skill: 0.55, playerBias: 0.5 }));
    for (const s of defenders) s.missiles = 4;
    g.setMusicIntensity(0.5);
    await g.say('tessaine', 'Rook. The Drift stole Combine transfer records, and they mean to broadcast them from Vantage. Half-truths, and dangerous ones. Silence the three transmitters before the upload completes. Leave the labs alone.');
    await g.say('vale', 'Lance flight with you. The transmitters sit at the focus of each dish.');
    await g.say('halloran', 'Combine pilots, there are forty scientists aboard this station. Whatever is on that broadcast, we are not soldiers!');
    await g.say('kit', 'Combine fighters inbound! Defend the array!');
    g.setMusicIntensity(0.85);
    const status = () => (g.objective = `Destroy the transmitters · ${dishesLeft()} left · upload ${pct()}`);
    g.onFrame(status);
    let reinforced = false;
    await g.until(() => {
      if (!reinforced && progress >= 0.45) {
        reinforced = true;
        for (let i = 0; i < 3; i++) defenders.push(g.jumpIn('gannet', 'drift', 'Drift escort', v(-900 + i * 40, 160, 1200), P('array'), { skill: 0.55, playerBias: 0.6 }));
        void g.say('sorrel', 'Hold the array, children. Just a little longer.');
      }
      return dishesLeft() === 0 || progress >= 1;
    });
    g.objective = '';
    sweep(g, defenders);
    for (const s of g.ships) if (s.alive && s.cls.anchored && s.faction === 'drift') s.ai = null;
    if (!dishesLeft()) {
      await g.say('halloran', 'The array is down. You have made your point, Commander.');
      await g.say('tessaine', 'Good. The Reach hears nothing today. Well flown, Rook.');
      g.missionFlags.records = 'silenced';
    } else {
      await g.say('halloran', 'Upload complete. I am sorry, Commander. It is out.');
      await g.say('tessaine', 'Then we will answer it. Pull back, Rook. You are paid for the attempt.');
      g.missionFlags.records = 'broadcast';
      g.bonusPay = -6000;
    }
  }
  g.setMusicIntensity(0.3);
  await g.wait(1);
  g.endMission('victory');
}
