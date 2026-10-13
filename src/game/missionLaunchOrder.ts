import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot } from '../entities/ai';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive).length;

/** Positions on the carrier's hangar deck, in the carrier's own frame (tunnel runs along +X). */
export function deck(g: Game): { at: (x: number, y: number, z: number) => THREE.Vector3; out: THREE.Vector3 } {
  const m = g.location.frames.carrier;
  return {
    at: (x, y, z) => v(x, y, z).applyMatrix4(m),
    out: v(1, 0, 0).transformDirection(m),
  };
}

/**
 * Lines up a launch queue in the carrier's hangar tunnel: three lanes, front row first. Returns
 * the ships in launch order; the player's own slot is the last one in the middle lane.
 */
export function lineUp(
  g: Game,
  ships: { cls: string; faction: 'combine' | 'drift'; name: string; skill: number }[],
): { queue: Ship[]; playerSpot: THREE.Vector3; playerLook: THREE.Vector3 } {
  const { at, out } = deck(g);
  const lanes = [-95, -55, -75];
  const rows = [34, 4, -26];
  const queue: Ship[] = [];
  ships.forEach((spec, i) => {
    const lane = lanes[i % 3];
    const row = rows[Math.floor(i / 3)];
    const pos = at(row, -21, lane);
    const s = g.spawnShip(spec.cls, spec.faction, spec.name, pos, pos.clone().add(out), { skill: spec.skill, playerBias: 0, speed: 0, damageScale: 0.65 });
    g.park(s, pos, pos.clone().add(out));
    queue.push(s);
  });
  const playerSpot = at(-50, -21, -75);
  return { queue, playerSpot, playerLook: playerSpot.clone().add(out) };
}

/**
 * "Launch Order" (Helion Combine path). Rook flies a Combine strike from the Sovereign Dawn
 * against the Red Wake's base at the Gallows, and has to decide what to do when Tessaine orders
 * the habitat module burned.
 */
export async function runLaunchOrder(g: Game, checkpoint: number): Promise<void> {
  const pad = () => g.input.device === 'gamepad';
  const key = (a: Parameters<typeof g.input.label>[0]) => g.input.label(a);
  const P = (k: string) => g.points[`gallows.${k}`];
  const player = g.player as Ship;
  // stray hits in a furball are forgiven; the real line is drawn at the habitat
  g.friendlyFireLimit = 1500;

  // The base: turrets, the relay on the mast, the habitat module under the girder
  const turrets: Ship[] = [];
  let betrayed = false;
  if (checkpoint <= 1) {
    for (let i = 0; i < 12; i++) {
      turrets.push(g.spawnShip('turret', 'wake', 'Gun turret', P(`turret${i}`).clone(), P('center'), { turret: true, skill: 0.55, playerBias: 0.5 }));
    }
  }
  const relay = checkpoint <= 2 ? g.spawnShip('relay', 'wake', 'Comms relay', P('relay').clone(), P('relay').clone().add(v(0, 0, -10)), {}) : null;
  const habitat = g.spawnShip('habitat', 'wake', 'Habitat module', P('habitat').clone(), P('habitat').clone().add(v(10, 0, 0)), {});
  habitat.invulnerable = checkpoint < 3;

  // Lance and Sabre flights
  const wingSpecs = [
    { cls: 'sabre', faction: 'combine' as const, name: 'Lance 1', skill: 0.7 },
    { cls: 'sabre', faction: 'combine' as const, name: 'Lance 2', skill: 0.6 },
    { cls: 'sabre', faction: 'combine' as const, name: 'Lance 3', skill: 0.6 },
    { cls: 'sabre', faction: 'combine' as const, name: 'Sabre 1', skill: 0.65 },
    { cls: 'sabre', faction: 'combine' as const, name: 'Sabre 2', skill: 0.55 },
    { cls: 'sabre', faction: 'combine' as const, name: 'Sabre 3', skill: 0.55 },
    { cls: 'sabre', faction: 'combine' as const, name: 'Sabre 4', skill: 0.5 },
    { cls: 'sabre', faction: 'combine' as const, name: 'Sabre 5', skill: 0.5 },
  ];
  let wing: Ship[] = [];

  const wakeWave = (count: number, missiles: number, names: string): Ship[] => {
    const out: Ship[] = [];
    for (let i = 0; i < count; i++) {
      const p = P('yard').clone().add(v(-40 - i * 25, 20 + (i % 2) * 20, (i % 3) * 30 - 30));
      const s = g.jumpIn('raider', 'wake', names, p, P('center'), { skill: 0.45 + Math.random() * 0.2, playerBias: 0.5, flares: i < missiles ? 2 : 0 });
      s.missiles = i < missiles ? 2 : 0;
      out.push(s);
    }
    return out;
  };

  if (checkpoint === 0) {
    g.setMusicIntensity(0.25);
    const { queue, playerSpot, playerLook } = lineUp(g, wingSpecs);
    wing = queue;
    g.park(player, playerSpot, playerLook);
    g.objective = 'Wait for launch clearance';
    g.hint(pad() ? 'Right stick: look around while you wait' : 'Mouse: look around while you wait for your turn', 6);
    await g.say('quell', 'Deck to all wings. Sovereign Dawn is on station at the Gallows. Launch order is posted: Lance flight, Sabre flight, then our contractor.');
    await g.say('tessaine', 'Rook. The Red Wake has nested in that rig for six years. Today it ends. Turrets first, then the comms mast. Nothing transmits out of the Gallows. Nothing.');
    await g.say('vale', 'Lance lead on the cat. Let us go to work.');

    // flights go out together, a row of three catapults at a time; Rook goes with the last row
    const groups: [number[], string][] = [
      [[0, 1, 2], 'Lance flight, you are cleared. Go, go, go.'],
      [[3, 4, 5], 'Sabre one through three, cleared. Go.'],
    ];
    let ahead = queue.length;
    for (const [ids, line] of groups) {
      g.objective = `Wait for launch clearance · ${ahead} ahead of you`;
      await g.say('quell', line);
      for (const i of ids) {
        g.catapult(queue[i]);
        const ai = queue[i].ai as AIPilot | null;
        if (ai) ai.patrolPoint.copy(P('center'));
        await g.wait(0.25);
      }
      ahead -= ids.length;
      await g.wait(2.5);
    }
    g.objective = 'Launch!';
    await g.say('quell', 'Sabre four, Sabre five and Rook, you are on the catapults. Hands off the stick until I say.');
    await g.say('quell', 'Launch in three. Two. One. Go!');
    for (const i of [6, 7]) {
      g.catapult(queue[i]);
      const ai = queue[i].ai as AIPilot | null;
      if (ai) ai.patrolPoint.copy(P('center'));
    }
    g.catapult(player);
    g.setMusicIntensity(0.6);
    await g.wait(2);
  } else {
    // retrying from a checkpoint: start in the air near the base with the surviving wing
    player.placeAt(P('center').clone().add(v(-200, 300, 900)), P('center'), 90);
    for (let i = 0; i < 5; i++) {
      const spec = wingSpecs[i];
      const s = g.spawnShip(spec.cls, spec.faction, spec.name, P('center').clone().add(v(-260 + i * 40, 320, 980)), P('center'), { skill: spec.skill, playerBias: 0, damageScale: 0.65 });
      (s.ai as AIPilot).patrolPoint.copy(P('center'));
      wing.push(s);
    }
  }

  if (checkpoint <= 1) {
    g.checkpoint = 1;
    g.objective = `Destroy the turrets (${alive(turrets)} left)`;
    await g.say('vale', 'Turrets on the girder, the rocks and under the refinery. Pick them apart, Rook. Stay clear of the crusher.');
    const w1 = wakeWave(4, 1, 'Wake Cutter');
    await g.say('vey', 'Combine colours at my door. Should have known you would come to clean up your own mess, Tessaine.');
    g.hint(pad() ? 'Y: target nearest. Turrets track you: come in fast and fly through the structure' : `${key('targetNearest')}: target nearest. Turrets track you: come in fast and use the structure as cover`, 7);
    let reinforced = false;
    await g.until(() => {
      g.objective = `Destroy the turrets (${alive(turrets)} left)`;
      if (!reinforced && alive(turrets) <= 3) {
        reinforced = true;
        (async () => {
          await g.say('vey', 'Hunters, launch. Everything we have.');
          wakeWave(3, 3, 'Wake Hunter');
        })().catch(() => undefined);
      }
      return alive(turrets) === 0;
    });
    void w1;
    g.objective = '';
    await g.wait(1);
  }

  if (checkpoint <= 2 && relay) {
    g.checkpoint = 2;
    g.setMusicIntensity(0.8);
    await g.say('tessaine', 'Turrets are down. Now the mast. That relay does not get a signal out, Rook.');
    g.objective = 'Destroy the comms relay on the mast';
    await g.say('vey', 'Open band, anyone listening. The Combine paid us to hit Kestrel. I have the transfer records. They are here to bury them, and us with them.');
    await g.say('vale', 'Commander? Is that true?');
    await g.say('tessaine', 'He is a pirate, Lieutenant. He will say anything. The relay, Rook.');
    await g.until(() => !relay.alive);
    g.objective = '';
    await g.say('tessaine', 'Signal is dead. Good work.');
  }

  // --- the habitat ------------------------------------------------------------------------------
  g.checkpoint = 3;
  g.setMusicIntensity(0.4);
  habitat.invulnerable = false;
  // the base is beaten and the Wake surrender: their last fighters fall back to guard the habitat
  // and hold fire, but they will fight again for it, or for whoever stands up for it
  const guards: Ship[] = [];
  for (let i = 0; i < 3; i++) {
    guards.push(g.spawnShip('raider', 'wake', 'Nest guard', P('habitat').clone().add(v(-80 + i * 80, -70, 120)), P('habitat'), { skill: 0.55, playerBias: 0.6 }));
  }
  g.setRelation('wake', 'player', false);
  g.setRelation('wake', 'combine', false);
  for (const s of g.ships) {
    const ai = s.faction === 'wake' && s.alive ? (s.ai as AIPilot | null) : null;
    if (ai && ai.patrolPoint) ai.patrolPoint.copy(P('habitat'));
    if (s.faction === 'wake') s.target = null;
  }
  let wakeAtPlayer = false;
  let wakeAtCombine = false;
  const watchHabitat = () => {
    const by = habitat.lastAttacker;
    if (by?.isPlayer && !wakeAtPlayer && !betrayed) {
      wakeAtPlayer = true;
      g.setRelation('wake', 'player', true);
      void g.say('vey', 'You are shooting at our homes! Wake, defend the Nest!');
    } else if (by && by.faction === 'combine' && !wakeAtCombine) {
      wakeAtCombine = true;
      g.setRelation('wake', 'combine', true);
    }
    return false;
  };
  // runs for the rest of the mission; an aborted mission rejects it, which is fine
  g.until(watchHabitat).catch(() => undefined);
  await g.say('nessa', 'This is the habitat module! There are forty families in here. We surrender. Please, hold your fire!');
  await g.say('tessaine', 'Rook. The habitat. Burn it.');
  await g.say('vale', 'Commander, those are civilians.');
  await g.say('tessaine', 'Those are witnesses, Lieutenant. Rook, you are closest. Do it and your fee doubles.');
  g.objective = 'Your call: destroy the habitat, or refuse';
  g.hint('Shoot the habitat to follow orders. Hold your fire to refuse. You can also turn your guns on the Combine.', 9);

  g.resetFriendlyFire(160);
  g.onBetrayal = (f) => {
    if (f === 'combine') betrayed = true;
  };
  const habitatDamagedByPlayer = () => habitat.lastAttacker?.isPlayer === true;
  const deadline = g.missionTime + 35;
  await g.until(() => !habitat.alive || betrayed || g.missionTime > deadline);

  if (!habitat.alive && habitatDamagedByPlayer()) {
    // followed the order
    g.missionFlags.gallows = 'burned';
    g.bonusPay = 12000;
    await g.say('vale', 'God help us.');
    await g.say('tessaine', 'Thank you, Rook. That is what professionalism looks like. Return to the Dawn.');
  } else if (!betrayed) {
    // refused, and the Combine does it anyway unless Rook stops them
    if (habitat.alive) {
      await g.say('tessaine', 'Fine. Lieutenant Vale, Sabre flight. Take it.');
      await g.say('vale', 'Understood.');
      g.objective = 'The Combine is attacking the habitat. Stop them, or let it happen';
      for (const s of wing) {
        const ai = s.ai as AIPilot | null;
        if (ai && s.alive) ai.forcedTarget = habitat;
      }
      await g.until(() => !habitat.alive || betrayed);
    }
    if (!betrayed) {
      g.missionFlags.gallows = 'watched';
      await g.say('nessa', 'No, no, please!');
      await g.wait(2);
      await g.say('tessaine', 'It is done. Return to the Dawn, Rook. We will discuss your hesitation later.');
    }
  }

  if (betrayed) {
    // Rook turned on the Combine to protect the habitat
    g.missionFlags.gallows = 'defended';
    g.setRelation('combine', 'player', true);
    // the Wake take your side
    g.setRelation('wake', 'player', false);
    g.setRelation('wake', 'combine', true);
    for (const s of wing) {
      const ai = s.ai as AIPilot | null;
      if (ai && s.alive) {
        ai.forcedTarget = player;
        ai.playerBias = 1;
      }
    }
    g.setMusicIntensity(1);
    await g.say('vale', 'Rook! What are you doing?');
    await g.say('tessaine', 'All wings: the contractor is hostile. Bring that ship down.');
    await g.say('nessa', 'Someone is shooting at the Combine! Thank you, pilot, whoever you are!');
    void g.say('vey', 'Whoever you are, pilot, the Wake has your back. Guards, with them!');
    g.objective = 'Survive. Protect the habitat';
    await g.wait(10);
    await g.say('sorrel', 'Rook? Mother Sorrel. We heard Vey on the open band. Hold on, the Long Patience is jumping in to take those people off.');
    const center = P('center');
    g.setRelation('combine', 'drift', true);
    // the Drift came to take the Wake's families off, so nobody here shoots at them
    g.setRelation('wake', 'drift', false);
    const drift: Ship[] = [];
    for (let i = 0; i < 4; i++) {
      drift.push(g.jumpIn('gannet', 'drift', 'Drift escort', center.clone().add(v(400 - i * 60, 250, -700)), center, { skill: 0.6, playerBias: 0 }));
    }
    await g.until(() => alive(wing) === 0 || g.missionTime > deadline + 140 || !habitat.alive);
    g.objective = '';
    if (habitat.alive) {
      await g.say('sorrel', 'We have them. Every last one. Rook, you have made an enemy today, and a great many friends.');
    } else {
      g.missionFlags.gallows = 'lost';
      await g.say('sorrel', 'We were too late. I am sorry, Rook. You tried.');
    }
    await g.say('tessaine', 'Sovereign Dawn, withdraw. Rook, the Combine has a long memory.');
    g.missionFlags.defect = 'drift';
    // the Combine contract is void; the Drift pay what they can
    g.bonusPay = -14000;
    await g.wait(1);
    g.endMission('victory');
    return;
  }

  // land back on the carrier
  g.objective = 'Return to the Sovereign Dawn and land in the hangar';
  g.hint(pad() ? 'Press X for docking clearance' : `Press ${key('dock')} for docking clearance`, 6);
  await g.dock(['carrier.hangar']);
  g.objective = '';
  await g.say('quell', 'Rook, you are down. Welcome back aboard.');
  await g.wait(0.5);
  g.endMission('victory');
}
