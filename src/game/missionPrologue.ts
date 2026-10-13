import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';

/**
 * The prologue, before you have a ship of your own: Rook flies escort for a small independent
 * caravan through the edge of the Ashfall in a borrowed Kite. The first Wake raid is beaten off;
 * the second, with Vey and the Mawbreaker, is not. The fight is scripted to be lost: the Kite
 * cannot be destroyed, only crippled, and the Kestrel militia find it drifting hours later.
 */

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive && s.pos.length() < 6000).length;

const HAULER: ShipClass = { ...SHIP_CLASSES.container, civilian: false, targetable: true, shields: 500, shieldRegen: 0, hull: 2600, maxSpeed: 36, boostSpeed: 36 };
const MINER: ShipClass = { ...SHIP_CLASSES.miner, civilian: false, targetable: true, shields: 300, shieldRegen: 0, hull: 1400, maxSpeed: 36, boostSpeed: 36 };

/** Engines dead, power failing: the ship tumbles slowly and answers nothing. */
const deadStick = {
  update(ship: Ship): void {
    const c = ship.controls;
    c.throttle = 0;
    c.boost = false;
    c.fire = false;
    c.missile = false;
    c.slide = false;
    c.pitch = 0.06;
    c.yaw = 0.02;
    c.roll = 0.18;
    c.strafeX = 0;
    c.strafeY = 0;
  },
};

export async function runPrologue(g: Game): Promise<void> {
  const player = g.player as Ship;
  const pad = () => g.input.device === 'gamepad';
  const key = (a: Parameters<typeof g.input.label>[0]) => g.input.label(a);
  g.friendlyFireLimit = 100000;
  // this one cannot be won, and you cannot die in it
  player.hullFloor = player.cls.hull * 0.2;

  const route = [v(320, 60, 1900), v(220, 40, 800), v(-500, 80, -200), v(-1800, 140, -800), v(-3400, 200, -1200)];
  const caravan: Ship[] = [];
  const pilots: RoutePilot[] = [];
  const specs: [ShipClass, string, THREE.Vector3][] = [
    [HAULER, "Tamsin's Luck", v(0, 0, 0)],
    [HAULER, 'Halcyon', v(-110, -30, 160)],
    [MINER, 'Old Gerda', v(90, 20, 220)],
  ];
  for (const [cls, name, off] of specs) {
    const s = g.spawnShip(cls, 'kestrel', name, v(380, 70, 2500).add(off), route[0].clone().add(off), { speed: 30 });
    const rp = new RoutePilot(
      route.map((p) => p.clone().add(off)),
      0.85,
      120,
    );
    s.ai = rp;
    caravan.push(s);
    pilots.push(rp);
  }
  const [luck, halcyon] = caravan;
  const dace = g.spawnShip('kite', 'player', 'Dace', v(200, 90, 2560), route[0], { skill: 0.55, playerBias: 0, damageScale: 0.5 });
  dace.missiles = 4;
  player.placeAt(v(470, 110, 2620), route[0], 40);

  g.setMusicIntensity(0.15);
  g.objective = 'Escort the Tamsin caravan to Kestrel';
  await g.wait(1.2);
  g.hint(
    pad()
      ? 'Right stick: steer · Left stick: roll & throttle · A: boost · RT: fire'
      : `${g.input.settings.mouseMode === 'aim' ? 'Mouse: aim, the ship flies to the circle' : 'Mouse: steer'} · ${key('throttleUp')}/${key('throttleDown')}: throttle · ${key('rollLeft')}/${key('rollRight')}: roll · ${key('boost')}: boost · ${key('fire')}: fire · Esc: options`,
    9,
  );
  await g.say('tamsin', 'Escorts, this is Tamsin. We cut across the edge of the Ashfall, then it is a straight run to Kestrel. Three days, and everyone gets paid.');
  await g.say('dace', 'Easiest money in the Reach, Rook. Nobody bothers a caravan this small.');
  await g.say('tamsin', 'Do not say that, Dace. You will jinx us.');
  g.hint('Prologue · to skip it, press Esc and abandon to the hangar', 5);
  await g.until(() => pilots[0].progress >= 0.2 || g.missionTime > 40);

  // --- a raid the escorts can handle --------------------------------------------------------------
  g.setMusicIntensity(0.65);
  const w1: Ship[] = [];
  for (let i = 0; i < 4; i++) {
    const s = g.jumpIn('raider', 'wake', 'Wake Cutter', luck.pos.clone().add(v(-260 + i * 60, 80 + (i % 2) * 30, -700)), luck.pos, { skill: 0.3 + i * 0.05, playerBias: 0.5 });
    s.missiles = 0;
    w1.push(s);
  }
  await g.say('dace', 'Spoke too soon. Wake raiders, four of them, dead ahead!');
  g.objective = 'Keep the raiders off the caravan';
  g.hint(
    pad()
      ? 'Y: target nearest · LB: next target · Aim at the yellow diamond to lead your shots'
      : `${key('targetNearest')}: target nearest · ${key('targetNext')}: next target · Aim at the yellow diamond to lead your shots`,
    8,
  );
  await g.say('tamsin', 'Escorts, keep them off my haulers!');
  let missileHint = false;
  await g.until(() => {
    g.objective = `Keep the raiders off the caravan · ${alive(w1)} left`;
    if (!missileHint && g.missionTime > 70) {
      missileHint = true;
      g.hint(pad() ? 'Hold on a target to lock missiles · RB: fire missile' : `Keep a target in your sights to lock · ${key('missile')}: fire missile`, 7);
    }
    return alive(w1) === 0;
  });
  g.objective = '';
  g.setMusicIntensity(0.3);
  await g.say('tamsin', 'That is all of them. Nice flying, both of you. Drinks are on me at Kestrel.');
  await g.wait(3);

  // --- the one they cannot handle ----------------------------------------------------------------
  g.setMusicIntensity(1);
  const ahead = luck.pos.clone().add(v(0, 60, -900));
  const brute = g.jumpIn('brute', 'wake', 'Mawbreaker', ahead.clone().add(v(0, -40, 0)), luck.pos, { skill: 0.6, playerBias: 0.2 });
  if (brute.ai instanceof AIPilot) brute.ai.forcedTarget = halcyon;
  const pack: Ship[] = [brute];
  for (let i = 0; i < 3; i++) pack.push(g.jumpIn('fang', 'wake', 'Wake Fang', ahead.clone().add(v(-140 + i * 140, 90, 120)), luck.pos, { skill: 0.65, playerBias: 0.55, flares: 2 }));
  for (let i = 0; i < 6; i++) pack.push(g.jumpIn('drone', 'wake', 'Wake drone', ahead.clone().add(v((i % 3) * 50 - 50, 140 + Math.floor(i / 3) * 40, 60)), luck.pos, { skill: 0.45, playerBias: 0.4 }));
  const daceHunter = pack[1].ai;
  if (daceHunter instanceof AIPilot) daceHunter.forcedTarget = dace;
  await g.say('vey', 'Nice little caravan. Shame about the escort.');
  await g.say('dace', 'That is a gunship. Mara, run! Burn for the rocks!');
  await g.say('tamsin', 'Burning! All haulers, everything you have!');
  g.objective = 'Protect the caravan';
  const start = g.missionTime;
  let daceDown = false;
  let halcyonDown = false;
  await g.until(() => {
    g.objective = `Protect the caravan · ${alive(caravan)} of 3 ships`;
    if (!daceDown && (g.missionTime > start + 16 || !dace.alive)) {
      daceDown = true;
      void (async () => {
        if (dace.alive) {
          await g.say('dace', 'I am hit, I am hit! Rook, I cannot shake him!');
          if (dace.alive) {
            dace.damageScale = 1;
            g.onShipHit(dace, 1e6, pack[1], dace.pos.clone(), 'missile');
          }
        }
        await g.say('tamsin', 'Dace! Dace, answer me!');
      })().catch(() => undefined);
    }
    if (!halcyonDown && g.missionTime > start + 30) {
      halcyonDown = true;
      if (halcyon.alive) g.onShipHit(halcyon, 1e6, brute, halcyon.pos.clone(), 'missile');
      void g.say('tamsin', 'Halcyon is gone. Oh, God. Rook, get them off the Luck!').catch(() => undefined);
    }
    // ends when the Kite is crippled, or the fight has gone on long enough that it would have been
    return player.hull <= player.hullFloor + 0.5 || g.missionTime > start + 75;
  });

  // --- crippled ---------------------------------------------------------------------------------
  player.invulnerable = true;
  player.ai = deadStick;
  g.detonate(player.pos.clone().add(v(0, 0, 3)), 0.8, 0, 0);
  g.objective = '';
  g.hint('Engines down. Power failing.', 6);
  g.setMusicIntensity(0.25);
  // they have what they came for: nobody wastes another shot on a dead Kite
  g.setRelation('wake', 'player', false);
  for (const s of pack) s.target = null;
  await g.say('vey', 'Leave that one. Let it drift home and tell everyone what happens to caravans in my Reach.');
  await g.say('tamsin', 'Rook, they are boarding us. If you can still fly, get out of here. Rook?');
  for (const s of caravan) if (s.alive) (s.ai as RoutePilot).hold = true;
  await g.wait(3);
  g.retreat(pack.filter((s) => s.alive && s !== brute));
  if (luck.alive) g.jumpOut(luck);
  if (brute.alive) g.jumpOut(brute);
  await g.wait(3);
  g.fade(true);
  await g.wait(3.5);
  g.fade(true, 'Nine hours later');
  await g.wait(3);
  await g.say('juno', 'Kestrel militia to the drifting Kite. Pilot, can you hear me?');
  await g.say('juno', 'There is a heat signature in the cockpit. You are alive. Hang on, we are towing you in.');
  await g.say('varga', 'Bring them in, Juno. Bay two. I will have a medic waiting.');
  await g.wait(1.5);
  g.missionFlags.prologue = 'done';
  g.endMission('victory');
}
